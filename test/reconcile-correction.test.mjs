// Standalone test for lib/reconcile.mjs SHA-correction handling — node builtins only.
// Run: node test/reconcile-correction.test.mjs
//
// THE BUG (sofia-plays slice-2 wire WO, surfaced 2026-06-30). The journal-writer scribe wrote a
// HALLUCINATED commit SHA into the ledger: an `enrichment` event named a 40-char hex that does not
// exist in git. reconcile correctly HALTs on that (a ledger event pointing at a non-existent commit
// is an AMBIGUOUS torn window). A LATER ledger entry `corrects` the bad event with the real SHA — but
// reconcile did NOT honor the correction, so a wedged run could never recover.
//
// THE FIX (belt-and-suspenders to the scribe never originating a SHA): reconcile HONORS a `correction`
// entry that supersedes an earlier event's SHA with a RESOLVABLE one — it does not HALT on the
// superseded phantom. A phantom cannot be "fixed" with another phantom: a correction whose OWN commit
// is unresolvable corrects nothing and the torn-window HALT stands.

import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

import { reconcile } from '../lib/reconcile.mjs';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
const write = (root, rel, content) => {
  const p = join(root, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, content);
};

// A 40-char hex that does not exist in git — the fabricated SHA the scribe hallucinated.
const PHANTOM = 'e716ad5f7e3e1a4e5d4f3e8b5c1a2b3c4d5e6f78';
const PHANTOM_2 = 'abcdef0123456789abcdef0123456789abcdef01';

const tmps = [];

// Build a minimal effort with NO work orders / lanes, so the ONLY thing that can HALT is the
// ledger-without-commit (torn-window) pass — exactly the code path under test. `ledgerFor` is given
// the repo's real HEAD SHA and returns the ledger lines (objects) to write.
function newEffort(ledgerFor) {
  const root = mkdtempSync(join(tmpdir(), 'rcorr-')); tmps.push(root);
  git(root, 'init', '-q');
  const hooks = join(root, '.nohooks'); mkdirSync(hooks, { recursive: true });
  git(root, 'config', 'core.hooksPath', hooks);
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'user.name', 'Reconcile Correction Test');
  git(root, 'config', 'commit.gpgsign', 'false');
  write(root, 'README.md', 'base\n');
  write(root, '.gitignore', '.reasonable/\n.worktrees/\n.nohooks/\n');
  git(root, 'add', '-A'); git(root, 'commit', '-q', '-m', 'init');
  git(root, 'branch', 'effort/demo');
  const realSha = git(root, 'rev-parse', 'HEAD').trim();

  write(root, '.reasonable/config.json', JSON.stringify({ effort: 'demo', runMode: 'autonomous', effortBranch: 'effort/demo' }) + '\n');
  write(root, '.reasonable/journal.json', JSON.stringify({
    effort: 'demo', currentVerticalSlice: 'slice-2', phase: 'vertical-slice-execution', supervision: 'standard',
    workOrders: {}, lanes: {}, inbox: [],
  }, null, 2) + '\n');
  write(root, '.reasonable/ledger.jsonl', ledgerFor(realSha).map((e) => JSON.stringify(e)).join('\n') + '\n');
  return { root, realSha };
}

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.message}`); process.exitCode = 1; }
}

// 1 — THE FIX: a phantom-SHA enrichment (seq 2) superseded by a `correction` (seq 3) carrying the
//     REAL SHA → reconcile does NOT halt, and raises no torn-window ambiguity for the superseded seq.
check('correction supersedes a phantom SHA: reconcile does NOT halt', () => {
  const { root } = newEffort((real) => [
    { seq: 1, type: 'ratification', gate: 'analysis', runMode: 'autonomous' },
    { seq: 2, type: 'enrichment', component: 'wire', workOrder: 'WO-2', commit: PHANTOM },
    { seq: 3, type: 'correction', supersedes: 2, workOrder: 'WO-2', commit: real, reason: 'seq 2 recorded a fabricated SHA' },
  ]);
  const r = reconcile(root);
  assert.equal(r.halt, false, `must not halt — seq 2 is superseded by the correction. haltReason: ${r.haltReason || ''}`);
  const phantomAmb = (r.evidence || []).filter((a) => /seq 2/.test(a.haltReason || ''));
  assert.equal(phantomAmb.length, 0, `superseded phantom still raised an ambiguity: ${phantomAmb.map((a) => a.haltReason).join(' | ')}`);
});

// 2 — DISCRIMINATOR: the SAME phantom WITHOUT a correction must STILL halt (the torn-window guard is
//     preserved; the fix is narrow — it does not blanket-ignore unresolvable SHAs).
check('uncorrected phantom SHA: reconcile STILL halts (torn-window guard preserved)', () => {
  const { root } = newEffort(() => [
    { seq: 1, type: 'ratification', gate: 'analysis', runMode: 'autonomous' },
    { seq: 2, type: 'enrichment', component: 'wire', workOrder: 'WO-2', commit: PHANTOM },
  ]);
  const r = reconcile(root);
  assert.equal(r.halt, true, 'an uncorrected phantom SHA must still halt as a torn window');
  assert.ok(/seq 2/.test(r.haltReason || ''), `halt must name the offending seq 2: ${r.haltReason || ''}`);
});

// 3 — A phantom cannot be fixed with another phantom: a `correction` whose OWN commit is unresolvable
//     supersedes nothing, so the torn-window HALT stands.
check('correction with an unresolvable SHA does NOT rescue the phantom: still halts', () => {
  const { root } = newEffort(() => [
    { seq: 1, type: 'ratification', gate: 'analysis', runMode: 'autonomous' },
    { seq: 2, type: 'enrichment', component: 'wire', workOrder: 'WO-2', commit: PHANTOM },
    { seq: 3, type: 'correction', supersedes: 2, workOrder: 'WO-2', commit: PHANTOM_2, reason: 'still a fabricated SHA' },
  ]);
  const r = reconcile(root);
  assert.equal(r.halt, true, 'a correction that itself names a non-existent commit corrects nothing');
});

for (const t of tmps) { try { rmSync(t, { recursive: true, force: true }); } catch { /* best effort */ } }

if (process.exitCode) console.error(`\nreconcile-correction: FAILURES above (${passed} passed).`);
else console.log(`\nreconcile-correction: all ${passed} checks passed. ✓`);
