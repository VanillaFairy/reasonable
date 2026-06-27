// Standalone test for lib/reconcile.mjs absolute-lane-path handling — node builtins only.
// Run: node test/reconcile-lane-path.test.mjs
//
// THE BUG (sofia-plays graph-editor, surfaced 2026-06-27). The journal stored ABSOLUTE
// worktree paths (with native separators) for its lanes. reconcile resolved them with
// `path.join(effortRoot, p)`, which MANGLES an absolute second arg (`join("/eff", "/abs/x")`
// → "/eff/abs/x"), so a present worktree read as MISSING — a LIVE lane was mis-reported
// "no worktree on disk" and the orphan-worktree match failed. This pins the fix (laneAbs):
// an absolute-path lane whose worktree is on disk is recognized, not orphaned or downgraded.

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

const tmps = [];
function newEffortAbsoluteLane() {
  const root = mkdtempSync(join(tmpdir(), 'rlp-')); tmps.push(root);
  git(root, 'init', '-q');
  const hooks = join(root, '.nohooks'); mkdirSync(hooks, { recursive: true });
  git(root, 'config', 'core.hooksPath', hooks);
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'user.name', 'Reconcile Path Test');
  git(root, 'config', 'commit.gpgsign', 'false');
  write(root, 'README.md', 'base\n');
  write(root, '.gitignore', '.reasonable/\n.worktrees/\n.nohooks/\n');
  git(root, 'add', '-A'); git(root, 'commit', '-q', '-m', 'init');
  git(root, 'branch', 'effort/demo');

  const worktree = join(root, '.worktrees', 'WO-A'); // a NATIVE absolute path (the sofia shape)
  git(root, 'worktree', 'add', '-q', worktree, '-b', 'lane/WO-A', 'effort/demo');
  write(worktree, '.reasonable-lane.json', JSON.stringify({ workOrder: 'WO-A', effortRoot: root, role: 'implementer' }) + '\n');
  write(worktree, 'src/feature.js', 'export const f = 1;\n');
  git(worktree, 'add', 'src');
  git(worktree, 'commit', '-q', '-m', 'feat: work product', '-m', 'Work-Order: WO-A');
  const sha = git(worktree, 'rev-parse', 'HEAD').trim();

  write(root, '.reasonable/config.json', JSON.stringify({ effort: 'demo', runMode: 'autonomous', effortBranch: 'effort/demo' }) + '\n');
  // The crux: store the lane key AND wo.worktree as ABSOLUTE native paths, and ACCOUNT the
  // commit (journal `commits`) so reconcile would RECLAIM (not halt) once the path resolves.
  write(root, '.reasonable/journal.json', JSON.stringify({
    effort: 'demo', currentVerticalSlice: 'slice-1', phase: 'vertical-slice-execution', supervision: 'standard',
    workOrders: { 'WO-A': { status: 'dispatched', role: 'implementer', verticalSlice: 'slice-1', worktree, branch: 'lane/WO-A', commits: [sha] } },
    lanes: { [worktree]: 'WO-A' }, inbox: [],
  }, null, 2) + '\n');
  write(root, '.reasonable/ledger.jsonl', JSON.stringify({ seq: 1, type: 'ratification', gate: 'analysis' }) + '\n');
  return { root, worktree, sha };
}

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.message}`); process.exitCode = 1; }
}

// 1 — the bug: an absolute-path lane whose worktree EXISTS must not be reported "no worktree
//     on disk" (the join() mangle made a present worktree read as missing).
check('absolute lane path: present worktree is NOT reported "no worktree on disk"', () => {
  const { root } = newEffortAbsoluteLane();
  const r = reconcile(root);
  assert.equal(r.halt, false, 'must not halt — the commit is accounted');
  const spurious = (r.notes || []).filter((n) => /WO-A/.test(n) && /no worktree on disk/.test(n));
  assert.equal(spurious.length, 0, `live lane wrongly reported missing: ${spurious.join(' | ')}`);
});

// 2 — and the present worktree must not be flagged an orphan; the accounted commit reclaims.
check('absolute lane path: present worktree is NOT flagged orphan; commit reclaims', () => {
  const { root } = newEffortAbsoluteLane();
  const r = reconcile(root);
  const orphan = (r.notes || []).filter((n) => /Orphan worktree/.test(n) && /WO-A/.test(n));
  assert.equal(orphan.length, 0, `live lane wrongly flagged orphan: ${orphan.join(' | ')}`);
  assert.ok((r.resolved || []).some((x) => x.workOrder === 'WO-A' && x.kind === 'reclaim'), 'WO-A reclaimed');
});

for (const t of tmps) { try { rmSync(t, { recursive: true, force: true }); } catch { /* best effort */ } }

if (process.exitCode) console.error(`\nreconcile-lane-path: FAILURES above (${passed} passed).`);
else console.log(`\nreconcile-lane-path: all ${passed} checks passed. ✓`);
