// Standalone test for lib/reconcile.mjs consuming the §5.1 ledger fold (lib/wo-status.mjs) as the
// AUTHORITATIVE work-order status — node builtins only. Run: node test/reconcile-wo-fold.test.mjs
//
// Pins §5.1 (F2, F8): reconcile derives WO status from the ledger fold, not journal.workOrders.
//   1. journal disagrees with the fold → a cross-check NOTE fires and the FOLD wins (a stale
//      'dispatched' over a fold 'done' never re-opens or downgrades the settled WO).
//   2. a WO present in the ledger fold but ABSENT from journal.workOrders (the invisible-WO
//      incident) is SURFACED in notes + resolved, no longer dropped.

import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

import { reconcile } from '../lib/reconcile.mjs';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
const write = (root, rel, content) => {
  const p = join(root, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, content);
};

const tmps = [];
function newEffort(workOrders, ledgerLines) {
  const root = mkdtempSync(join(tmpdir(), 'rwf-')); tmps.push(root);
  git(root, 'init', '-q');
  const hooks = join(root, '.nohooks'); mkdirSync(hooks, { recursive: true });
  git(root, 'config', 'core.hooksPath', hooks);
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'user.name', 'Reconcile WO Fold Test');
  git(root, 'config', 'commit.gpgsign', 'false');
  write(root, 'README.md', 'base\n');
  write(root, '.gitignore', '.reasonable/\n.worktrees/\n.nohooks/\n');
  git(root, 'add', '-A'); git(root, 'commit', '-q', '-m', 'init');
  git(root, 'branch', 'effort/demo');

  write(root, '.reasonable/config.json', JSON.stringify({ effort: 'demo', runMode: 'autonomous', effortBranch: 'effort/demo' }) + '\n');
  write(root, '.reasonable/journal.json', JSON.stringify({
    effort: 'demo', currentVerticalSlice: 'slice-1', phase: 'vertical-slice-execution', supervision: 'standard',
    workOrders, lanes: {}, inbox: [],
  }, null, 2) + '\n');
  write(root, '.reasonable/ledger.jsonl', ledgerLines.map((e) => JSON.stringify(e)).join('\n') + (ledgerLines.length ? '\n' : ''));
  return root;
}

function ledgerLines(root) {
  const p = join(root, '.reasonable', 'ledger.jsonl');
  if (!existsSync(p)) return [];
  return readFileSync(p, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => JSON.parse(l));
}

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.stack || e.message}`); process.exitCode = 1; }
}

// 1 — journal says 'dispatched'; the ledger fold says 'done' (planned→dispatched→completed). The
//     fold is authoritative: a disagreement note fires, and reconcile does NOT downgrade or append a
//     node-downgraded line (the settled WO is left alone — the journal's stale claim never wins).
check('journal disagrees with the fold → cross-check note + the fold wins (no spurious downgrade)', () => {
  const root = newEffort(
    { 'WO-1': { status: 'dispatched', verticalSlice: 'slice-1', role: 'implementer' } },
    [{ seq: 1, type: 'node-planned', node: 'slice-1/WO-1', kind: 'work-order', title: 'wire' },
     { seq: 2, type: 'node-dispatched', node: 'slice-1/WO-1', kind: 'work-order', attempt: 1 },
     { seq: 3, type: 'node-completed', node: 'slice-1/WO-1' }],
  );
  const before = ledgerLines(root).length;

  const r = reconcile(root);

  assert.ok(
    r.notes.some((n) => /WO-1/.test(n) && /journal status 'dispatched' disagrees with ledger fold 'done'/.test(n)),
    `expected a disagreement note; got: ${JSON.stringify(r.notes)}`,
  );
  // Fold wins: the settled (done) WO is not re-opened or downgraded — no node-downgraded line.
  // T2.3 (§7.1): reconcile still appends its per-call next-action projection, so the only new line is
  // that projection — never a downgrade of the fold-done WO.
  const after = ledgerLines(root);
  assert.ok(!after.some((l) => l.type === 'node-downgraded'), 'the fold-done WO must not be downgraded (no node-downgraded line)');
  assert.equal(after.length, before + 1, 'exactly one new line: the per-call next-action projection (§7.1)');
  assert.equal(after[after.length - 1].type, 'next-action', 'the sole new line is the projection');
  assert.ok(!r.resolved.some((x) => x.workOrder === 'WO-1' && x.kind === 'downgrade'),
    'a fold-done WO must never appear as a lost-work downgrade');
});

// 2 — the invisible-WO INCIDENT: WO-ghost lives in the ledger (dispatched, no terminal) but is
//     ABSENT from journal.workOrders. Reconcile surfaces it as running instead of dropping it.
check('a ledger-fold WO absent from journal.workOrders is SURFACED (no longer invisible)', () => {
  const root = newEffort(
    { 'WO-1': { status: 'pending', verticalSlice: 'slice-1', role: 'implementer' } }, // journal knows only WO-1
    [{ seq: 1, type: 'node-planned', node: 'slice-1/WO-ghost', kind: 'work-order', title: 'ghost' },
     { seq: 2, type: 'node-dispatched', node: 'slice-1/WO-ghost', kind: 'work-order', attempt: 1 }],
  );
  const r = reconcile(root);

  assert.ok(
    r.notes.some((n) => /WO-ghost/.test(n) && /ABSENT from journal\.workOrders/.test(n) && /running/.test(n)),
    `expected a surfaced note for the ledger-only WO; got: ${JSON.stringify(r.notes)}`,
  );
  assert.ok(
    r.resolved.some((x) => x.kind === 'ledger-only-wo' && x.workOrder === 'WO-ghost' && x.status === 'running'),
    `expected WO-ghost surfaced in resolved[]; got: ${JSON.stringify(r.resolved)}`,
  );
});

// 3 — a journal WO whose status AGREES with the fold raises NO disagreement note (no false alarms).
check('journal status agreeing with the fold raises no cross-check note', () => {
  const root = newEffort(
    { 'WO-1': { status: 'dispatched', verticalSlice: 'slice-1', role: 'implementer' } },
    [{ seq: 1, type: 'node-planned', node: 'slice-1/WO-1', kind: 'work-order', title: 'wire' },
     { seq: 2, type: 'node-dispatched', node: 'slice-1/WO-1', kind: 'work-order', attempt: 1 },
     { seq: 3, type: 'node-completed', node: 'slice-1/WO-1' },
     { seq: 4, type: 'node-dispatched', node: 'slice-1/WO-1', kind: 'work-order', attempt: 1 }], // reopened → running
  );
  const r = reconcile(root);
  assert.ok(!r.notes.some((n) => /WO-1/.test(n) && /disagrees/.test(n)),
    `dispatched↔running agree — no disagreement note expected; got: ${JSON.stringify(r.notes)}`);
});

for (const t of tmps) { try { rmSync(t, { recursive: true, force: true }); } catch { /* best effort */ } }

if (process.exitCode) console.error(`\nreconcile-wo-fold: FAILURES above (${passed} passed).`);
else console.log(`\nreconcile-wo-fold: all ${passed} checks passed. ✓`);
