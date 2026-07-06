// resolve-active-effort.test.mjs — the additive discovery wrapper (§6.2, F11/F3). node builtins only.
//
// resolveActiveEffort(cwd) resolves the ACTIVE effort for the repo-root interactive SessionStart path:
//   1. UP-WALK first (correct at an effort-root / worktree cwd — and it dodges the `git rev-parse
//      --show-toplevel` blind spot inside a linked worktree).
//   2. else DOWN-SCAN born efforts nested under `.reasonable-efforts/` (the sofia-plays layout) ∪ a born
//      repoRoot/.reasonable. 0 → none (surface config-less strays), 1 → resolved, N → multiple.
//   3. a `.reasonable` at a NON-canonical depth under `.reasonable-efforts/` → a LOUD diagnostic.
//
// The motivating incident: sofia-plays ran its effort nested at `.reasonable-efforts/<name>/.reasonable/`
// and the old up-walk-only discovery could not see it from the repo root. This wrapper closes that hole
// WITHOUT adopting a config-less stray and WITHOUT disturbing the up-walk the fence + CLIs rely on.
// Run: node test/resolve-active-effort.test.mjs

import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';

import { resolveActiveEffort } from '../lib/effort.mjs';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString();

const tmps = [];
/** A git-inited repo root (no commit needed — `git rev-parse --show-toplevel` works on a bare init). */
function newRepo() {
  const root = mkdtempSync(join(tmpdir(), 'rae-')); tmps.push(root);
  git(root, 'init', '-q');
  return root;
}
/** A plain (non-git) dir — exercises the `git rev-parse` fallback to cwd. */
function newBareDir() { const d = mkdtempSync(join(tmpdir(), 'rae-bare-')); tmps.push(d); return d; }

/** Write `.reasonable/config.json` under `dir` with the given effort name (born when name is non-empty). */
function born(dir, effort) {
  mkdirSync(join(dir, '.reasonable'), { recursive: true });
  writeFileSync(join(dir, '.reasonable', 'config.json'), JSON.stringify({ effort, runMode: 'gated' }) + '\n');
}
/** A config-less `.reasonable/` dir (a stray — never adopted), optionally with a journal to look "active". */
function configlessReasonable(dir, withJournal = false) {
  mkdirSync(join(dir, '.reasonable'), { recursive: true });
  if (withJournal) writeFileSync(join(dir, '.reasonable', 'journal.json'), JSON.stringify({ effort: 'ghost' }) + '\n');
}
/** A concluded/abandoned marker dir (`.reasonable.done-*` / `.reasonable.abandoned-*`) carrying a config. */
function markerDir(dir, name, effort) {
  mkdirSync(join(dir, name), { recursive: true });
  writeFileSync(join(dir, name, 'config.json'), JSON.stringify({ effort }) + '\n');
}

/** Assert every path a result emits is forward-slash-only (no backslash leaked). */
function noBackslashes(r) {
  const paths = [];
  if (r.root) paths.push(r.root);
  for (const p of r.roots || []) paths.push(p);
  for (const p of r.strays || []) paths.push(p);
  for (const d of r.diagnostics || []) paths.push(d.path);
  for (const p of paths) assert.ok(!p.includes('\\'), `emitted path has a backslash: ${p}`);
}

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.message}`); process.exitCode = 1; }
}

// ── (1) up-walk resolve — a born effort at/above cwd ─────────────────────────────
check('repo-root effort → resolved via up-walk (cwd at root)', () => {
  const root = newRepo();
  born(root, 'demo');
  const r = resolveActiveEffort(root);
  assert.equal(r.kind, 'resolved');
  assert.equal(basename(r.root), basename(root));
  noBackslashes(r);
});
check('repo-root effort → resolved via up-walk (cwd in a subdir)', () => {
  const root = newRepo();
  born(root, 'demo');
  const deep = join(root, 'src', 'a'); mkdirSync(deep, { recursive: true });
  const r = resolveActiveEffort(deep);
  assert.equal(r.kind, 'resolved');
  assert.equal(basename(r.root), basename(root));
});

// ── (2) down-scan — one nested born effort, cwd at repo root ─────────────────────
check('one nested effort under .reasonable-efforts/ → resolved via down-scan', () => {
  const root = newRepo();
  born(join(root, '.reasonable-efforts', 'eff-a'), 'eff-a');
  const r = resolveActiveEffort(root);
  assert.equal(r.kind, 'resolved');
  assert.equal(basename(r.root), 'eff-a');
  noBackslashes(r);
});

// ── (2) down-scan fallback — no git repo: repoRoot falls back to cwd ─────────────
check('non-git dir: down-scan still resolves the nested effort (git rev-parse falls back to cwd)', () => {
  const dir = newBareDir();
  born(join(dir, '.reasonable-efforts', 'eff-a'), 'eff-a');
  const r = resolveActiveEffort(dir);
  assert.equal(r.kind, 'resolved');
  assert.equal(basename(r.root), 'eff-a');
});

// ── (2) N parallel nested efforts → multiple (NORMAL) ────────────────────────────
check('two parallel nested efforts → multiple with all roots', () => {
  const root = newRepo();
  born(join(root, '.reasonable-efforts', 'eff-a'), 'eff-a');
  born(join(root, '.reasonable-efforts', 'eff-b'), 'eff-b');
  const r = resolveActiveEffort(root);
  assert.equal(r.kind, 'multiple');
  assert.equal(r.roots.length, 2);
  assert.deepEqual(new Set(r.roots.map((p) => basename(p))), new Set(['eff-a', 'eff-b']));
  noBackslashes(r);
});

// ── stray repo-root config-less .reasonable/ + a real nested effort → resolved, stray surfaced ──
check('config-less repo-root .reasonable + real nested effort → resolved (nested), stray surfaced not adopted', () => {
  const root = newRepo();
  configlessReasonable(root);                        // repo-root .reasonable with NO config.json
  born(join(root, '.reasonable-efforts', 'eff-a'), 'eff-a');
  const r = resolveActiveEffort(root);
  assert.equal(r.kind, 'resolved');
  assert.equal(basename(r.root), 'eff-a');           // the stray was NOT adopted
  assert.ok(Array.isArray(r.strays) && r.strays.length >= 1, 'the config-less .reasonable is surfaced as a stray');
  assert.ok(r.strays.some((p) => p.endsWith('/.reasonable')), `stray should name the .reasonable dir; got ${JSON.stringify(r.strays)}`);
  noBackslashes(r);
});

// ── config-less nested .reasonable (with a journal, looks "active") → stray, never adopted ──
check('config-less nested .reasonable (active-looking journal) → none, classified stray', () => {
  const root = newRepo();
  configlessReasonable(join(root, '.reasonable-efforts', 'eff-x'), /* withJournal */ true);
  const r = resolveActiveEffort(root);
  assert.equal(r.kind, 'none');
  assert.ok(r.strays.length >= 1, 'a config-less .reasonable is a stray, never a born effort');
});

// ── a `…-bak` sibling WITH a config is excluded from the born set ────────────────
check('…-bak sibling with a config → excluded (resolves the real effort only)', () => {
  const root = newRepo();
  born(join(root, '.reasonable-efforts', 'eff-a'), 'eff-a');
  born(join(root, '.reasonable-efforts', 'eff-a-bak'), 'eff-a');   // a backup copy — must not count
  const r = resolveActiveEffort(root);
  assert.equal(r.kind, 'resolved', `the -bak backup must not turn this into 'multiple'; got ${r.kind}`);
  assert.equal(basename(r.root), 'eff-a');
});
check('other BACKUP_EXCLUDE suffixes (.old/.orig/.archive/_copy) are excluded too', () => {
  const root = newRepo();
  born(join(root, '.reasonable-efforts', 'eff-a'), 'eff-a');
  for (const suf of ['.old', '.orig', '.archive', '_copy']) born(join(root, '.reasonable-efforts', `eff${suf}`), 'eff');
  const r = resolveActiveEffort(root);
  assert.equal(r.kind, 'resolved');
  assert.equal(basename(r.root), 'eff-a');
});

// ── `.reasonable.done-*` / `.reasonable.abandoned-*` never match born ────────────
check('.reasonable.done-* / .reasonable.abandoned-* markers are never born', () => {
  const root = newRepo();
  markerDir(root, '.reasonable.done-old', 'old');            // concluded marker at repo root
  markerDir(root, '.reasonable.abandoned-x', 'x');           // abandoned marker at repo root
  const r = resolveActiveEffort(root);
  assert.equal(r.kind, 'none', `a lifecycle marker dir is not a born effort; got ${JSON.stringify(r)}`);
});
check('lifecycle markers alongside a real nested effort → resolved (markers ignored)', () => {
  const root = newRepo();
  markerDir(root, '.reasonable.done-old', 'old');
  born(join(root, '.reasonable-efforts', 'eff-a'), 'eff-a');
  const r = resolveActiveEffort(root);
  assert.equal(r.kind, 'resolved');
  assert.equal(basename(r.root), 'eff-a');
});

// ── a `.reasonable` at depth ≠ 1 under .reasonable-efforts/ → a LOUD diagnostic ──
check('depth-2 .reasonable under .reasonable-efforts/ → loud diagnostic, not adopted', () => {
  const root = newRepo();
  born(join(root, '.reasonable-efforts', 'junk', 'deeper'), 'deep');  // .reasonable-efforts/junk/deeper/.reasonable
  const r = resolveActiveEffort(root);
  assert.equal(r.kind, 'none', 'a mis-nested .reasonable is never adopted');
  assert.ok(Array.isArray(r.diagnostics) && r.diagnostics.some((d) => d.depth === 2),
    `a depth-2 .reasonable must surface as a diagnostic; got ${JSON.stringify(r.diagnostics)}`);
  noBackslashes(r);
});
check('depth-0 .reasonable directly inside .reasonable-efforts/ → loud diagnostic', () => {
  const root = newRepo();
  born(join(root, '.reasonable-efforts'), 'wrong');   // .reasonable-efforts/.reasonable  (depth 0)
  const r = resolveActiveEffort(root);
  assert.ok((r.diagnostics || []).some((d) => d.depth === 0),
    `a depth-0 .reasonable must surface as a diagnostic; got ${JSON.stringify(r.diagnostics)}`);
});
check('depth-2 misplacement alongside a real effort → resolved AND the diagnostic still surfaces', () => {
  const root = newRepo();
  born(join(root, '.reasonable-efforts', 'eff-a'), 'eff-a');
  born(join(root, '.reasonable-efforts', 'junk', 'deeper'), 'deep');
  const r = resolveActiveEffort(root);
  assert.equal(r.kind, 'resolved');
  assert.equal(basename(r.root), 'eff-a');
  assert.ok((r.diagnostics || []).some((d) => d.depth === 2), 'the misplacement is surfaced even when a real effort resolves');
});

// ── no effort anywhere → none with an empty strays list ──────────────────────────
check('no effort anywhere → none (empty strays)', () => {
  const root = newRepo();
  const r = resolveActiveEffort(root);
  assert.equal(r.kind, 'none');
  assert.deepEqual(r.strays, []);
});

for (const t of tmps) { try { rmSync(t, { recursive: true, force: true }); } catch { /* best effort */ } }

if (process.exitCode) console.error(`\nresolve-active-effort: FAILURES above (${passed} passed).`);
else console.log(`\nresolve-active-effort: all ${passed} checks passed. ✓`);
