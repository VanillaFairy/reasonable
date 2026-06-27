// branch.test.mjs — the multi-slice branch-hygiene mechanics (lib/branch.mjs).
//
// reasonable maintains a dedicated EFFORT / INTEGRATION branch so a later slice's
// lane is cut from a base that already contains the earlier slices — deterministically,
// with no human "how do I integrate this?" escalation. This pins the load-bearing,
// decidable pieces of that:
//   - effort branch naming
//   - ensure/adopt the effort branch off the base ref (idempotent, never moved)
//   - the lane base ref a worktree is cut from (effort branch, not bare HEAD)
//   - the base-candidate ordering reconcile uses to account lane commits (effort branch FIRST)
//   - descends-from + validateLaneBases: a lane cut from the WRONG base is a SURFACED
//     inconsistency (not a silent build-on-stale)
//
// Builds throwaway git repos in the OS temp dir, node builtins only. Run:
//   node test/branch.test.mjs

import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  effortBranchName, laneBaseRef, baseCandidates, branchExists,
  ensureEffortBranch, descendsFrom, validateLaneBases,
} from '../lib/branch.mjs';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
const tmps = [];

function newRepo() {
  const root = mkdtempSync(join(tmpdir(), 'br-test-'));
  tmps.push(root);
  git(root, 'init', '-q', '-b', 'master');
  const hooks = join(root, '.nohooks');
  mkdirSync(hooks, { recursive: true });
  git(root, 'config', 'core.hooksPath', hooks);
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'user.name', 'BR Test');
  git(root, 'config', 'commit.gpgsign', 'false');
  writeFileSync(join(root, 'README.md'), 'base\n');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'init');
  return root;
}
function commitOn(root, branch, file, content) {
  git(root, 'checkout', '-q', branch);
  writeFileSync(join(root, file), content);
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', `edit ${file}`);
}

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.message}`); process.exitCode = 1; }
}

// ── Pure helpers ─────────────────────────────────────────────────────────────
check('effortBranchName prefixes effort/ and slugs', () => {
  assert.strictEqual(effortBranchName('graph-editor-ux-overhaul'), 'effort/graph-editor-ux-overhaul');
  assert.strictEqual(effortBranchName('Fireside Widget'), 'effort/fireside-widget');
});

check('laneBaseRef returns the effort branch, or null (back-compat bare HEAD)', () => {
  assert.strictEqual(laneBaseRef({ effortBranch: 'effort/x' }), 'effort/x');
  assert.strictEqual(laneBaseRef({}), null);
  assert.strictEqual(laneBaseRef(null), null);
});

check('baseCandidates puts the effort branch FIRST (lane accounting base)', () => {
  assert.deepStrictEqual(baseCandidates({ effortBranch: 'effort/x' })[0], 'effort/x');
  // falls back to the legacy default bases when no effort branch is set
  assert.deepStrictEqual(baseCandidates({}), ['origin/HEAD', 'main', 'master']);
});

// ── ensure/adopt the effort branch (idempotent, never moved) ─────────────────
check('ensureEffortBranch creates the branch off the base ref when absent', () => {
  const root = newRepo();
  assert.strictEqual(branchExists(root, 'effort/e'), false);
  const r = ensureEffortBranch(root, 'effort/e', 'master');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.created, true);
  assert.strictEqual(branchExists(root, 'effort/e'), true);
  // created AT master's tip
  assert.strictEqual(git(root, 'rev-parse', 'effort/e').trim(), git(root, 'rev-parse', 'master').trim());
});

check('ensureEffortBranch ADOPTS an existing effort branch and never moves it', () => {
  const root = newRepo();
  ensureEffortBranch(root, 'effort/e', 'master');
  commitOn(root, 'effort/e', 'a.txt', 'slice 1\n');     // effort branch advances past master
  const tip = git(root, 'rev-parse', 'effort/e').trim();
  git(root, 'checkout', '-q', 'master');
  const r = ensureEffortBranch(root, 'effort/e', 'master'); // re-run from master
  assert.strictEqual(r.adopted, true);
  assert.strictEqual(r.created, false);
  assert.strictEqual(git(root, 'rev-parse', 'effort/e').trim(), tip, 'adopt must NOT reset the branch to base');
});

// ── descends-from + lane-base validation ─────────────────────────────────────
check('a lane cut from the effort branch descends from it; a stale lane does not', () => {
  const root = newRepo();
  ensureEffortBranch(root, 'effort/e', 'master');
  commitOn(root, 'effort/e', 'slice1.txt', 'orthogonal renderer\n'); // effort/e now ahead of master

  // GOOD lane: cut from the effort branch (contains slice 1).
  git(root, 'branch', 'lane/WO-good', 'effort/e');
  commitOn(root, 'lane/WO-good', 'wo-good.txt', 'auto-router on orthogonal\n');

  // STALE lane: cut from master (the build-on-stale bug — misses slice 1).
  git(root, 'branch', 'lane/WO-stale', 'master');
  commitOn(root, 'lane/WO-stale', 'wo-stale.txt', 'auto-router on OLD sigmoid\n');

  assert.strictEqual(descendsFrom(root, 'effort/e', 'lane/WO-good'), true);
  assert.strictEqual(descendsFrom(root, 'effort/e', 'lane/WO-stale'), false);
});

check('validateLaneBases surfaces ONLY the off-base lane (not a halt, a surfaced inconsistency)', () => {
  const root = newRepo();
  ensureEffortBranch(root, 'effort/e', 'master');
  commitOn(root, 'effort/e', 'slice1.txt', 'orthogonal renderer\n');
  git(root, 'branch', 'lane/WO-good', 'effort/e');
  git(root, 'branch', 'lane/WO-stale', 'master');

  const res = validateLaneBases(root, 'effort/e', [
    { workOrder: 'WO-good', branch: 'lane/WO-good' },
    { workOrder: 'WO-stale', branch: 'lane/WO-stale' },
    { workOrder: 'WO-missing', branch: 'lane/WO-missing' }, // no such branch → skipped, not off-base
  ]);
  assert.strictEqual(res.checked, 2, 'only existing lane branches are checked');
  assert.deepStrictEqual(res.offBase.map((o) => o.workOrder), ['WO-stale']);
});

check('no effort branch configured → validateLaneBases is a no-op (back-compat)', () => {
  const root = newRepo();
  git(root, 'branch', 'lane/WO-1', 'master');
  const res = validateLaneBases(root, null, [{ workOrder: 'WO-1', branch: 'lane/WO-1' }]);
  assert.deepStrictEqual(res.offBase, [], 'with no effort branch there is no base to be off of');
});

for (const t of tmps) { try { rmSync(t, { recursive: true, force: true }); } catch { /* best effort */ } }

if (process.exitCode) console.error(`\nbranch: FAILURES above (${passed} passed).`);
else console.log(`\nbranch: all ${passed} checks pass. ✓`);
