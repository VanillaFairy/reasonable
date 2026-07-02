// reconcile-worktree-case.test.mjs — reconcile must NOT go blind to on-disk worktrees when the
// effort root is handed to it with a non-canonical drive-letter case (Windows). node builtins only.
// Run: node test/reconcile-worktree-case.test.mjs
//
// THE BUG (sofia-plays, 2026-07-02). listWorktrees() scoped the repo's worktrees to the effort with
//   base = norm(resolve(effortRoot));  … np.startsWith(base + '/')
// path.resolve() PRESERVES whatever drive-letter case it was handed (it does not touch the FS to
// canonicalize it), while `git worktree list` reports git's own stored case. So a lowercase
// `--root c:/…` produced base "c:/…" that never startsWith git's "C:/…", the filter dropped EVERY
// worktree, and the orphan-worktree scan silently found nothing — returning notes:[], resolved:[]
// even with an orphan sitting right there on disk. The scan went blind, not loud.
//
// The fix: compare worktree paths case-insensitively on win32 (POSIX stays case-sensitive). On a
// case-sensitive POSIX FS the drive-letter lowering below is a no-op and this test is benign; on
// Windows it is RED before the fix and GREEN after.

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
// Lower ONLY the drive letter — the precise reproduction of resolve() not canonicalizing it.
const lowerDrive = (p) => p.replace(/^([A-Za-z]):/, (_, d) => d.toLowerCase() + ':');

const tmps = [];
// An effort whose ONLY worktree on disk is an ORPHAN — a registered git worktree that the journal
// does not know about. reconcile must SEE it (and account it), which requires listWorktrees to have
// matched it against the effort root.
function newEffortWithOrphanWorktree() {
  const root = mkdtempSync(join(tmpdir(), 'rwc-')); tmps.push(root);
  git(root, 'init', '-q');
  const hooks = join(root, '.nohooks'); mkdirSync(hooks, { recursive: true });
  git(root, 'config', 'core.hooksPath', hooks);
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'user.name', 'Reconcile Case Test');
  git(root, 'config', 'commit.gpgsign', 'false');
  write(root, 'README.md', 'base\n');
  write(root, '.gitignore', '.reasonable/\n.worktrees/\n.nohooks/\n');
  git(root, 'add', '-A'); git(root, 'commit', '-q', '-m', 'init');
  git(root, 'branch', 'effort/demo');

  // The orphan: a real registered worktree with a trailered commit, absent from the journal.
  const orphan = join(root, '.worktrees', 'WO-orphan');
  git(root, 'worktree', 'add', '-q', orphan, '-b', 'lane/WO-orphan', 'effort/demo');
  write(orphan, 'src/orphan.js', 'export const o = 1;\n');
  git(orphan, 'add', 'src');
  git(orphan, 'commit', '-q', '-m', 'feat: orphan work', '-m', 'Work-Order: WO-orphan');

  write(root, '.reasonable/config.json', JSON.stringify({ effort: 'demo', runMode: 'autonomous', effortBranch: 'effort/demo' }) + '\n');
  // The journal knows of NO lanes and NO work orders → the worktree on disk is an orphan.
  write(root, '.reasonable/journal.json', JSON.stringify({
    effort: 'demo', currentVerticalSlice: 'slice-1', phase: 'vertical-slice-execution', supervision: 'standard',
    workOrders: {}, lanes: {}, inbox: [],
  }, null, 2) + '\n');
  write(root, '.reasonable/ledger.jsonl', JSON.stringify({ seq: 1, type: 'ratification', gate: 'analysis' }) + '\n');
  return { root };
}

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.message}`); process.exitCode = 1; }
}

// Control: with the canonical (as-created) root, the orphan is seen — proving the scenario is sound.
check('canonical-case root: the orphan worktree is seen (control)', () => {
  const { root } = newEffortWithOrphanWorktree();
  const r = reconcile(root);
  const seen = (r.notes || []).some((n) => /Orphan worktree/.test(n) && /WO-orphan/.test(n));
  assert.ok(seen, `the orphan must be seen with a canonical root; notes: ${JSON.stringify(r.notes)}`);
});

// The bug: with a lowercase-drive-letter root, the scan must NOT go blind.
check('lowercase-drive-letter root: reconcile is NOT blind to the on-disk orphan worktree', () => {
  const { root } = newEffortWithOrphanWorktree();
  const r = reconcile(lowerDrive(root));
  const seen = (r.notes || []).some((n) => /Orphan worktree/.test(n) && /WO-orphan/.test(n));
  assert.ok(seen, `a drive-case mismatch must not blind the worktree scan; notes: ${JSON.stringify(r.notes)}`);
});

for (const t of tmps) { try { rmSync(t, { recursive: true, force: true }); } catch { /* best effort */ } }

if (process.exitCode) console.error(`\nreconcile-worktree-case: FAILURES above (${passed} passed).`);
else console.log(`\nreconcile-worktree-case: all ${passed} checks passed. ✓`);
