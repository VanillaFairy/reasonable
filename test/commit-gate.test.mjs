// Standalone test for lib/commit-gate.mjs — node builtins only (no runner).
// Run: node test/commit-gate.test.mjs
//
// Builds throwaway git repos in the OS temp dir and exercises the four behaviours
// that make the iron rule safe: clean passes, in-scope dirty is detected &
// committed, out-of-scope/untracked work is NEVER swept, and a no-effort repo is
// a fail-open no-op.

import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { commitGate, resolveScope } from '../lib/commit-gate.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const git = (cwd, ...args) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
const status = (cwd) => git(cwd, 'status', '--porcelain', '--untracked-files=all').trim();
const write = (root, rel, content) => {
  const p = join(root, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
};

const tmps = [];
function newRepo({ effort = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'cg-test-'));
  tmps.push(root);
  git(root, 'init', '-q');
  // Neutralise any inherited (global) hooksPath so commits are deterministic.
  const hooks = join(root, '.nohooks');
  mkdirSync(hooks, { recursive: true });
  git(root, 'config', 'core.hooksPath', hooks);
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'user.name', 'CG Test');
  git(root, 'config', 'commit.gpgsign', 'false');
  write(root, 'README.md', 'base\n');
  if (effort) {
    write(root, '.reasonable/config.json', JSON.stringify({ effort: 'cg-test', runMode: 'gated' }) + '\n');
  }
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'init');
  return root;
}
function addWorkOrder(root, locus) {
  write(root, '.reasonable/work-orders/WO-1.json', JSON.stringify({ id: 'WO-1', locus }) + '\n');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'wo');
}

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.message}`); process.exitCode = 1; }
}

// A — no effort: fail open, no-op.
check('no effort → fail open (active:false, clean:true)', () => {
  const root = newRepo({ effort: false });
  const res = commitGate(root, { commit: true, message: 'should not happen' });
  assert.equal(res.active, false);
  assert.equal(res.clean, true);
  assert.equal(status(root), '', 'tree must be untouched');
});

// B — effort, clean tree: --check passes.
check('clean tree → clean:true, nothing in scope', () => {
  const root = newRepo();
  addWorkOrder(root, ['src/**']);
  const res = commitGate(root, { commit: false });
  assert.equal(res.active, true);
  assert.equal(res.source, 'work-orders');
  assert.equal(res.clean, true);
  assert.deepEqual(res.inScope, []);
});

// C — in-scope dirty: detected, then committed, tree clean afterwards.
check('in-scope work → detected and committed, tree clean after', () => {
  const root = newRepo();
  addWorkOrder(root, ['src/**']);
  write(root, 'src/foo.txt', 'work product\n');

  const before = commitGate(root, { commit: false });
  assert.equal(before.clean, false);
  assert.deepEqual(before.inScope, ['src/foo.txt']);

  const done = commitGate(root, { commit: true, message: 'feat: foo' });
  assert.equal(done.committed, true);
  assert.match(done.sha || '', /^[0-9a-f]{40}$/);
  assert.equal(status(root), '', 'tree must be clean after commit');
});

// D — out-of-scope untracked file is NEVER swept (scope = safety).
check('out-of-scope untracked → left for the human, never committed', () => {
  const root = newRepo();
  addWorkOrder(root, ['src/**']);
  write(root, 'other/bar.txt', 'human WIP, unrelated\n');

  const res = commitGate(root, { commit: true, message: 'should ignore bar' });
  assert.deepEqual(res.inScope, [], 'bar.txt is outside src/** — not in scope');
  assert.ok(res.leftUntracked.includes('other/bar.txt'));
  assert.ok(status(root).includes('other/bar.txt'), 'bar.txt must remain uncommitted');
});

// E — fallback (no work-orders): tracked mod committed, untracked left + warned.
check('fallback → commits tracked mod, leaves untracked, warns', () => {
  const root = newRepo(); // effort present, but NO work-orders dir
  const scope = resolveScope(root);
  assert.equal(scope.source, 'fallback');

  writeFileSync(join(root, 'README.md'), 'base\nmodified\n'); // tracked modification
  write(root, 'newfile.txt', 'untracked unknown\n');          // untracked, unknown provenance

  const res = commitGate(root, { commit: true, message: 'fallback commit' });
  assert.ok(res.inScope.includes('README.md'), 'tracked mod is in scope in fallback');
  assert.ok(!res.inScope.includes('newfile.txt'), 'untracked unknown is NOT swept in fallback');
  assert.ok(res.warnings.some((w) => w.includes('newfile.txt')), 'must warn about the skipped untracked file');
  assert.ok(status(root).includes('newfile.txt'), 'untracked file must remain');
});

// F — conservativeFallback (the unattended Stop backstop): a fallback tracked mod is
// SURFACED in leftTracked and NEVER swept (the stray-.gitignore-onto-branch incident).
check('conservativeFallback → fallback tracked mod left unswept (leftTracked + warn)', () => {
  const root = newRepo(); // effort present, NO work-orders dir → fallback
  const scope = resolveScope(root);
  assert.equal(scope.source, 'fallback');

  writeFileSync(join(root, 'README.md'), 'base\nstray edit\n'); // tracked mod, unprovable provenance

  const res = commitGate(root, { commit: true, conservativeFallback: true, message: 'must not sweep' });
  assert.equal(res.committed, false, 'nothing in provable scope → no commit');
  assert.ok(!res.inScope.includes('README.md'), 'tracked mod is NOT in conservative scope');
  assert.ok(res.leftTracked.includes('README.md'), 'tracked mod surfaced in leftTracked');
  assert.ok(res.warnings.some((w) => w.includes('README.md')), 'must warn about the unswept tracked change');
  assert.ok(status(root).includes('README.md'), 'tracked mod must remain uncommitted');
});

// G — .reasonable/ state is STILL committed under conservativeFallback (it is provable
// effort state, not unprovable WIP) — durability is preserved, only unscoped code is held.
check('conservativeFallback → .reasonable/ artifact still committed (provable)', () => {
  const root = newRepo();
  write(root, '.reasonable/ledger.jsonl', '{"seq":1,"type":"ratification"}\n');
  const res = commitGate(root, { commit: true, conservativeFallback: true, message: 'commit effort state' });
  assert.ok(res.inScope.includes('.reasonable/ledger.jsonl'), '.reasonable/ artifact is in scope');
  assert.equal(res.committed, true, 'effort state is durably committed even in conservative fallback');
});

for (const t of tmps) { try { rmSync(t, { recursive: true, force: true }); } catch { /* best effort */ } }

if (process.exitCode) console.error(`\ncommit-gate: FAILURES above (${passed} passed).`);
else console.log(`\ncommit-gate: all ${passed} checks passed. ✓`);
