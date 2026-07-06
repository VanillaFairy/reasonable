// reconcile-lifecycle.test.mjs — Part B of T1.3: reconcile classifies the BORN-effort lifecycle state
// (§6.5, F10). node builtins only. Run: node test/reconcile-lifecycle.test.mjs
//
// reconcile only ever runs on a LIVE `.reasonable/`, so it classifies the born states over real git
// ancestry, CHEAPEST SIGNAL FIRST:
//   'active'         — the frontier still has open work (any known WO not done, or nothing planned yet).
//   'at-land-gate'   — frontier empty AND the effort branch is NOT landed to base → NEXT = LAND.
//   'half-concluded' — frontier empty AND the effort branch IS landed to base (base contains it) → CONCLUDE.
// "landed" ⟺ base contains the effort branch ⟺ effortBranch is an ancestor of base — exactly what a real
// `effortBranch → baseBranch` merge yields.

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

/** A git repo with one base commit. Returns { root, base } (base = the initial branch name, main|master). */
function baseRepo(prefix) {
  const root = mkdtempSync(join(tmpdir(), prefix)); tmps.push(root);
  git(root, 'init', '-q');
  const hooks = join(root, '.nohooks'); mkdirSync(hooks, { recursive: true });
  git(root, 'config', 'core.hooksPath', hooks);
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'user.name', 'Lifecycle Test');
  git(root, 'config', 'commit.gpgsign', 'false');
  write(root, 'README.md', 'base\n');
  git(root, 'add', '-A'); git(root, 'commit', '-q', '-m', 'init');
  const base = git(root, 'rev-parse', '--abbrev-ref', 'HEAD').trim();
  return { root, base };
}
/** Cut `effort/demo` from base and add one commit on it (the effort's work). Leaves HEAD on effort/demo. */
function effortBranchAhead(root) {
  git(root, 'branch', 'effort/demo');
  git(root, 'checkout', '-q', 'effort/demo');
  write(root, 'slice.txt', 'slice 1 work\n');
  git(root, 'add', '-A'); git(root, 'commit', '-q', '-m', 'slice-1');
}
/** Land the effort branch into base (a real --no-ff merge → base now CONTAINS effort/demo). */
function landIntoBase(root, base) {
  git(root, 'checkout', '-q', base);
  git(root, 'merge', '-q', '--no-ff', '-m', 'land effort/demo', 'effort/demo');
}
/** Give `root` a live, born `.reasonable/`: config (+branch refs) + minimal journal + empty ledger. */
function setupEffort(root, { effortBranch = null, baseBranch = null, workOrder = null } = {}) {
  const cfg = { effort: 'demo', runMode: 'gated' };
  if (effortBranch) cfg.effortBranch = effortBranch;
  if (baseBranch) cfg.baseBranch = baseBranch;
  write(root, '.reasonable/config.json', JSON.stringify(cfg) + '\n');
  write(root, '.reasonable/journal.json', JSON.stringify({
    effort: 'demo', currentVerticalSlice: 'slice-1', phase: 'vertical-slice-execution', supervision: 'standard',
    workOrders: workOrder ? { 'WO-1': workOrder } : {}, lanes: {}, inbox: [],
  }, null, 2) + '\n');
  write(root, '.reasonable/ledger.jsonl', '');
}
const DONE_WO = { merged: true, verticalSlice: 'slice-1', role: 'implementer' };  // → status 'done'
const OPEN_WO = { verticalSlice: 'slice-1', role: 'implementer' };                // no lane/ledger → 'pending'

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.stack || e.message}`); process.exitCode = 1; }
}

// ── active — the frontier still has open work ────────────────────────────────────
check("open work order → lifecycle 'active'", () => {
  const { root, base } = baseRepo('rlc-');
  effortBranchAhead(root);
  setupEffort(root, { effortBranch: 'effort/demo', baseBranch: base, workOrder: OPEN_WO });
  assert.equal(reconcile(root).lifecycle, 'active');
});
check("no work orders planned yet (early effort) → lifecycle 'active'", () => {
  const { root, base } = baseRepo('rlc-');
  setupEffort(root, { effortBranch: 'effort/demo', baseBranch: base }); // no WOs at all
  git(root, 'branch', 'effort/demo');
  assert.equal(reconcile(root).lifecycle, 'active');
});

// ── at-land-gate — frontier empty, effort branch NOT landed to base ──────────────
check("all WOs done, effort branch ahead of base (not landed) → 'at-land-gate'", () => {
  const { root, base } = baseRepo('rlc-');
  effortBranchAhead(root);   // effort/demo has a commit base does NOT have → not landed
  setupEffort(root, { effortBranch: 'effort/demo', baseBranch: base, workOrder: DONE_WO });
  assert.equal(reconcile(root).lifecycle, 'at-land-gate');
});

// ── half-concluded — frontier empty, effort branch landed to base ────────────────
check("all WOs done, effort branch merged into base (landed) → 'half-concluded'", () => {
  const { root, base } = baseRepo('rlc-');
  effortBranchAhead(root);
  landIntoBase(root, base);  // base now CONTAINS effort/demo → landed
  setupEffort(root, { effortBranch: 'effort/demo', baseBranch: base, workOrder: DONE_WO });
  assert.equal(reconcile(root).lifecycle, 'half-concluded');
});

// ── cheapest-first: 'active' short-circuits even on a LANDED branch if work is still open ──
check("open WO on a landed branch → still 'active' (open-work signal beats git ancestry)", () => {
  const { root, base } = baseRepo('rlc-');
  effortBranchAhead(root);
  landIntoBase(root, base);
  setupEffort(root, { effortBranch: 'effort/demo', baseBranch: base, workOrder: OPEN_WO });
  assert.equal(reconcile(root).lifecycle, 'active');
});

// ── back-compat: no effort/base branch configured, frontier empty → safe default 'at-land-gate' ──
check("frontier empty but no branch refs (bare-HEAD effort) → 'at-land-gate' (never a premature conclude)", () => {
  const { root } = baseRepo('rlc-');
  setupEffort(root, { workOrder: DONE_WO }); // no effortBranch/baseBranch
  assert.equal(reconcile(root).lifecycle, 'at-land-gate');
});

for (const t of tmps) { try { rmSync(t, { recursive: true, force: true }); } catch { /* best effort */ } }

if (process.exitCode) console.error(`\nreconcile-lifecycle: FAILURES above (${passed} passed).`);
else console.log(`\nreconcile-lifecycle: all ${passed} checks passed. ✓`);
