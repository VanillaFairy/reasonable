// reconcile-s7-born-state.test.mjs — Part B of T1.5: reconcile's S7 HALT keys on effortBirthState,
// not only loadConfig's lossy runMode:null (§6.1). node builtins only.
// Run: node test/reconcile-s7-born-state.test.mjs
//
// The hole: a `missing-signature` config (parses, has a runMode, but NO `config.effort` birth
// signature — foreign / hand-edited / torn) sails PAST the runMode-absent HALT (runMode is present)
// yet is NOT a config reconcile may trust. A `corrupt` config already halts incidentally via the
// runMode-absent bucket (loadConfig swallows the parse failure into defaults → runMode:null); we add
// the explicit born-state HALT beside it so BOTH close, keying on the shared effortBirthState predicate.

import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

import { reconcile } from '../lib/reconcile.mjs';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
const tmps = [];
function write(root, rel, content) {
  const p = join(root, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, content);
}
/** A born effort dir (no git needed): a valid journal + empty ledger + the given raw config text. */
function effortWithRawConfig(rawConfig) {
  const root = mkdtempSync(join(tmpdir(), 'rs7-')); tmps.push(root);
  write(root, '.reasonable/config.json', rawConfig);
  // reconcile needs a parseable journal.json to proceed past its {active:false} guard.
  write(root, '.reasonable/journal.json', JSON.stringify({
    effort: 'demo', currentVerticalSlice: 'slice-1', phase: 'vertical-slice-execution', supervision: 'standard',
    workOrders: {}, lanes: {}, inbox: [],
  }, null, 2) + '\n');
  write(root, '.reasonable/ledger.jsonl', '');
  return root;
}
/** A healthy `ok` effort in a real git repo (mirrors reconcile-lifecycle setup) — should NOT born-halt. */
function okEffort() {
  const root = mkdtempSync(join(tmpdir(), 'rs7-ok-')); tmps.push(root);
  git(root, 'init', '-q');
  const hooks = join(root, '.nohooks'); mkdirSync(hooks, { recursive: true });
  git(root, 'config', 'core.hooksPath', hooks);
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'user.name', 'S7 Test');
  git(root, 'config', 'commit.gpgsign', 'false');
  write(root, 'README.md', 'base\n');
  git(root, 'add', '-A'); git(root, 'commit', '-q', '-m', 'init');
  const base = git(root, 'rev-parse', '--abbrev-ref', 'HEAD').trim();
  git(root, 'branch', 'effort/demo');
  write(root, '.reasonable/config.json', JSON.stringify({
    effort: 'demo', runMode: 'gated', effortBranch: 'effort/demo', baseBranch: base,
  }) + '\n');
  write(root, '.reasonable/journal.json', JSON.stringify({
    effort: 'demo', currentVerticalSlice: 'slice-1', phase: 'vertical-slice-execution', supervision: 'standard',
    workOrders: { 'WO-1': { verticalSlice: 'slice-1', role: 'implementer' } }, lanes: {}, inbox: [],
  }, null, 2) + '\n');
  write(root, '.reasonable/ledger.jsonl', '');
  return root;
}

const bornEvidence = (r) => (r.evidence || []).find((a) => a.evidence && Object.hasOwn(a.evidence, 'effortBirthState'));

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.stack || e.message}`); process.exitCode = 1; }
}

// ── missing-signature — the HOLE this task closes: runMode present, no birth signature ──
check("missing-signature config ({runMode:'gated'}, no effort) → HALT with effortBirthState evidence", () => {
  const root = effortWithRawConfig(JSON.stringify({ runMode: 'gated' }) + '\n');
  const r = reconcile(root);
  assert.equal(r.halt, true, 'a missing-signature config must HALT (it previously PROCEEDED)');
  const ev = bornEvidence(r);
  assert.ok(ev, `the halt evidence must carry an effortBirthState entry; got ${JSON.stringify(r.evidence)}`);
  assert.equal(ev.evidence.effortBirthState, 'missing-signature');
  assert.match(r.haltReason, /birth-state/i);
});

// ── corrupt — already halts incidentally (runMode-absent); now ALSO carries born-state evidence ──
check('corrupt config (does not parse) → HALT with effortBirthState corrupt evidence', () => {
  const root = effortWithRawConfig('not json{');
  const r = reconcile(root);
  assert.equal(r.halt, true, 'a corrupt config must HALT');
  const ev = bornEvidence(r);
  assert.ok(ev, `the halt evidence must carry an effortBirthState entry; got ${JSON.stringify(r.evidence)}`);
  assert.equal(ev.evidence.effortBirthState, 'corrupt');
});

// ── ok — a healthy born effort proceeds; NO born-state halt is contributed ────────────
check("ok config (has a non-empty effort) → no born-state halt (proceeds)", () => {
  const r = reconcile(okEffort());
  assert.equal(r.halt, false, `a healthy ok effort must not halt; got ${r.haltReason || ''}`);
  assert.equal(bornEvidence(r), undefined, 'no effortBirthState halt entry for an ok config');
});

for (const t of tmps) { try { rmSync(t, { recursive: true, force: true }); } catch { /* best effort */ } }

if (process.exitCode) console.error(`\nreconcile-s7-born-state: FAILURES above (${passed} passed).`);
else console.log(`\nreconcile-s7-born-state: all ${passed} checks passed. ✓`);
