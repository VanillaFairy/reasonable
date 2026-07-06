// birth-location.test.mjs — Part A of T1.3: the birth-location policy (§6.4, F5). node builtins only.
// Run: node test/birth-location.test.mjs
//
// Three surfaces of ONE policy — kill stray-root rebirth at its source:
//   1. assertNoAmbiguousBirth(repoRoot) — the shared fs predicate (born nested efforts present?).
//   2. fence.mjs first-birth path — a bare repo-root `.reasonable/` birth beside born nested efforts is
//      DENIED (structured + Bash); a truly plain repo (no `.reasonable-efforts/`) still fails OPEN.
//   3. reconcile.mjs — a slipped-through repo-root stray co-existing with born nested efforts HALTs
//      AMBIGUOUS; a single effort does not; the sanctioned N-parallel-nested layout does NOT false-halt.

import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertNoAmbiguousBirth } from '../lib/effort.mjs';
import { reconcile } from '../lib/reconcile.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const FENCE = join(here, '..', 'lib', 'fence.mjs');
const git = (cwd, ...args) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString();

const tmps = [];
function tmp(prefix) { const d = mkdtempSync(join(tmpdir(), prefix)); tmps.push(d); return d; }
function write(root, rel, content) {
  const p = join(root, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, content);
}
/** Write `<dir>/.reasonable/config.json` (born when `effort` is a non-empty string). */
function born(dir, effort) { write(dir, join('.reasonable', 'config.json'), JSON.stringify({ effort }) + '\n'); }

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.stack || e.message}`); process.exitCode = 1; }
}

// ── (1) assertNoAmbiguousBirth — the shared fs predicate ─────────────────────────
check('no .reasonable-efforts/ at all → not ambiguous, empty existing', () => {
  const root = tmp('bl-p-');
  const r = assertNoAmbiguousBirth(root);
  assert.equal(r.ambiguous, false);
  assert.deepEqual(r.existing, []);
});
check('one born nested effort → ambiguous, names that root', () => {
  const root = tmp('bl-p-');
  born(join(root, '.reasonable-efforts', 'eff-a'), 'eff-a');
  const r = assertNoAmbiguousBirth(root);
  assert.equal(r.ambiguous, true);
  assert.equal(r.existing.length, 1);
  assert.equal(basename(r.existing[0]), 'eff-a');
  assert.ok(!r.existing[0].includes('\\'), 'existing root is forward-slash only');
});
check('a -bak sibling is NOT counted (BACKUP_EXCLUDE)', () => {
  const root = tmp('bl-p-');
  born(join(root, '.reasonable-efforts', 'eff-a-bak'), 'eff-a');   // a backup copy only
  const r = assertNoAmbiguousBirth(root);
  assert.equal(r.ambiguous, false, 'a -bak backup must not make a birth ambiguous');
  assert.deepEqual(r.existing, []);
});
check('other BACKUP_EXCLUDE suffixes (.old/.orig/.archive/_copy) are not counted', () => {
  const root = tmp('bl-p-');
  for (const suf of ['.old', '.orig', '.archive', '_copy']) born(join(root, '.reasonable-efforts', `eff${suf}`), 'eff');
  assert.equal(assertNoAmbiguousBirth(root).ambiguous, false);
});
check('a config-less nested .reasonable/ (stray) is NOT counted (absent, never born)', () => {
  const root = tmp('bl-p-');
  mkdirSync(join(root, '.reasonable-efforts', 'ghost', '.reasonable'), { recursive: true }); // no config.json
  assert.equal(assertNoAmbiguousBirth(root).ambiguous, false);
});
check('a real born effort alongside a -bak backup → ambiguous names only the real one', () => {
  const root = tmp('bl-p-');
  born(join(root, '.reasonable-efforts', 'eff-a'), 'eff-a');
  born(join(root, '.reasonable-efforts', 'eff-a-bak'), 'eff-a');
  const r = assertNoAmbiguousBirth(root);
  assert.equal(r.ambiguous, true);
  assert.deepEqual(r.existing.map((p) => basename(p)), ['eff-a']);
});

// ── (2) fence first-birth path — deny the stray birth, keep the plain-repo fail-open ──
function runFence(cwd, payload) {
  const out = execFileSync('node', [FENCE], {
    cwd, input: JSON.stringify({ cwd, ...payload }), stdio: ['pipe', 'pipe', 'pipe'],
  }).toString().trim();
  if (!out) return { denied: false, reason: '' };
  const j = JSON.parse(out);
  return {
    denied: !!(j.hookSpecificOutput && j.hookSpecificOutput.permissionDecision === 'deny'),
    reason: (j.hookSpecificOutput && j.hookSpecificOutput.permissionDecisionReason) || '',
  };
}
const writeTool = (abs) => ({ tool_name: 'Write', tool_input: { file_path: abs } });
const bash = (command) => ({ tool_name: 'Bash', tool_input: { command } });

check('structured first-birth at repo root WITH a born nested effort → DENIED (reason names --root)', () => {
  const root = tmp('bl-f-');
  born(join(root, '.reasonable-efforts', 'eff-a'), 'eff-a');   // a real nested effort exists
  // The repo-root `.reasonable/` does NOT exist yet (PreToolUse fires before the write).
  const r = runFence(root, writeTool(join(root, '.reasonable', 'config.json')));
  assert.equal(r.denied, true, 'a bare repo-root birth beside a nested effort must be denied');
  assert.ok(/--root/.test(r.reason), `the deny reason must name --root; got: ${r.reason}`);
  assert.ok(/stray birth/i.test(r.reason), 'the deny reason names the stray-birth hazard');
});
check('structured first-birth in a PLAIN repo (no .reasonable-efforts/) → ALLOWED (fail-open)', () => {
  const root = tmp('bl-f-');
  const r = runFence(root, writeTool(join(root, '.reasonable', 'config.json')));
  assert.equal(r.denied, false, 'the very first effort in a plain repo births at the repo root as before');
});
check('Bash first-birth at repo root WITH a born nested effort → DENIED (reason names --root)', () => {
  const root = tmp('bl-f-');
  born(join(root, '.reasonable-efforts', 'eff-a'), 'eff-a');
  const target = join(root, '.reasonable', 'config.json');
  const r = runFence(root, bash(`echo '{}' > ${JSON.stringify(target)}`));
  assert.equal(r.denied, true, 'a bare repo-root birth via shell redirection must also be denied');
  assert.ok(/--root/.test(r.reason), `the Bash deny reason must name --root; got: ${r.reason}`);
});
check('Bash first-birth in a PLAIN repo → ALLOWED (fail-open)', () => {
  const root = tmp('bl-f-');
  const target = join(root, '.reasonable', 'config.json');
  const r = runFence(root, bash(`echo '{}' > ${JSON.stringify(target)}`));
  assert.equal(r.denied, false);
});
check('ordinary code write in a repo that HAS nested efforts → ALLOWED (fail-open, not a .reasonable/ write)', () => {
  const root = tmp('bl-f-');
  born(join(root, '.reasonable-efforts', 'eff-a'), 'eff-a');
  const r = runFence(root, writeTool(join(root, 'src', 'foo.js')));
  assert.equal(r.denied, false, 'editing ordinary code beside nested efforts must never be denied');
});
check('a nested birth beside a born sibling (its own --root) → ALLOWED (owner dir has no nested efforts)', () => {
  const root = tmp('bl-f-');
  born(join(root, '.reasonable-efforts', 'eff-a'), 'eff-a');   // sibling already born
  // Birth eff-b nested correctly: the write target owns its OWN `.reasonable/`, not the repo root's.
  const r = runFence(root, writeTool(join(root, '.reasonable-efforts', 'eff-b', '.reasonable', 'config.json')));
  assert.equal(r.denied, false, 'a correctly-nested parallel birth must not be denied');
});

// ── (3) reconcile — repo-root stray shadowing nested efforts HALTs; parallel efforts do NOT ──
function newRepo(prefix) {
  const root = tmp(prefix);
  git(root, 'init', '-q');
  const hooks = join(root, '.nohooks'); mkdirSync(hooks, { recursive: true });
  git(root, 'config', 'core.hooksPath', hooks);
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'user.name', 'Birth Location Test');
  git(root, 'config', 'commit.gpgsign', 'false');
  write(root, 'README.md', 'base\n');
  git(root, 'add', '-A'); git(root, 'commit', '-q', '-m', 'init');
  return root;
}
/** Give an effort dir a live, reconcile-able `.reasonable/` (born config + minimal journal + empty ledger). */
function liveEffort(dir, effort) {
  write(dir, join('.reasonable', 'config.json'), JSON.stringify({ effort, runMode: 'gated' }) + '\n');
  write(dir, join('.reasonable', 'journal.json'), JSON.stringify({
    effort, currentVerticalSlice: 'slice-1', phase: 'vertical-slice-execution', supervision: 'standard',
    workOrders: {}, lanes: {}, inbox: [],
  }, null, 2) + '\n');
  write(dir, join('.reasonable', 'ledger.jsonl'), '');
}

check('repo-root stray .reasonable/ + a born nested effort → AMBIGUOUS HALT (shadow surfaced)', () => {
  const root = newRepo('bl-r-');
  liveEffort(root, 'root-stray');                                   // the repo-root effort (the stray)
  liveEffort(join(root, '.reasonable-efforts', 'eff-a'), 'eff-a');  // a real nested effort
  const r = reconcile(root);
  assert.equal(r.halt, true, 'a repo-root stray shadowing nested efforts must HALT');
  assert.ok((r.evidence || []).some((a) => /shadow/i.test(a.haltReason)),
    `an ambiguity must name the shadowing; got: ${JSON.stringify(r.evidence)}`);
});
check('single repo-root effort (no nested) → no shadow halt', () => {
  const root = newRepo('bl-r-');
  liveEffort(root, 'solo');
  const r = reconcile(root);
  assert.ok(!(r.evidence || []).some((a) => /shadow/i.test(a.haltReason)),
    'a lone repo-root effort must not trip the shadow AMBIGUOUS');
  assert.equal(r.halt, false, 'runMode is set, no shadow → no halt');
});
check('sanctioned N-parallel-nested efforts (no repo-root .reasonable/) → NO false-halt', () => {
  const root = newRepo('bl-r-');
  liveEffort(join(root, '.reasonable-efforts', 'eff-a'), 'eff-a');
  liveEffort(join(root, '.reasonable-efforts', 'eff-b'), 'eff-b');
  // Each parallel effort is reconciled on its OWN root; neither sees a repo-root stray to shadow.
  for (const name of ['eff-a', 'eff-b']) {
    const r = reconcile(join(root, '.reasonable-efforts', name));
    assert.ok(!(r.evidence || []).some((a) => /shadow/i.test(a.haltReason)),
      `parallel effort ${name} must NOT false-halt on the shadow check; got: ${JSON.stringify(r.evidence)}`);
    assert.equal(r.halt, false, `parallel effort ${name} must not halt`);
  }
});

for (const t of tmps) { try { rmSync(t, { recursive: true, force: true }); } catch { /* best effort */ } }

if (process.exitCode) console.error(`\nbirth-location: FAILURES above (${passed} passed).`);
else console.log(`\nbirth-location: all ${passed} checks passed. ✓`);
