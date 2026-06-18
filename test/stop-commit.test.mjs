// Standalone test for lib/stop-commit.mjs — node builtins only (no runner).
// Run: node test/stop-commit.test.mjs
//
// Verifies the Stop/SubagentStop backstop WIRING (commit-gate's behaviour is
// covered by commit-gate.test.mjs): a dirty in-scope tree at turn-end is
// auto-committed with a visible systemMessage; a stop-hook continuation and a
// non-effort repo are both no-ops; the session is never blocked.

import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const STOP = join(here, '..', 'lib', 'stop-commit.mjs');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
const status = (cwd) => git(cwd, 'status', '--porcelain', '--untracked-files=all').trim();
const write = (root, rel, content) => {
  const p = join(root, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, content);
};
function runStop(cwd, payload) {
  const out = execFileSync('node', [STOP], { cwd, input: JSON.stringify(payload), stdio: ['pipe', 'pipe', 'pipe'] });
  return out.toString();
}

const tmps = [];
function newEffort() {
  const root = mkdtempSync(join(tmpdir(), 'stop-test-')); tmps.push(root);
  git(root, 'init', '-q');
  const hooks = join(root, '.nohooks'); mkdirSync(hooks, { recursive: true });
  git(root, 'config', 'core.hooksPath', hooks);
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'user.name', 'Stop Test');
  git(root, 'config', 'commit.gpgsign', 'false');
  write(root, 'README.md', 'base\n');
  write(root, '.reasonable/config.json', JSON.stringify({ effort: 'demo', runMode: 'gated' }) + '\n');
  write(root, '.reasonable/work-orders/WO-1.json', JSON.stringify({ id: 'WO-1', locus: ['src/**'] }) + '\n');
  git(root, 'add', '-A'); git(root, 'commit', '-q', '-m', 'init');
  return root;
}

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.message}`); process.exitCode = 1; }
}

// 1 — dirty in-scope at Stop → auto-commit + systemMessage.
check('dirty in-scope at Stop → commits, emits systemMessage', () => {
  const root = newEffort();
  write(root, 'src/x.txt', 'would-be-lost work\n');
  const out = runStop(root, { cwd: root, hook_event_name: 'Stop' });
  assert.equal(status(root), '', 'tree must be clean after the backstop commits');
  assert.ok(git(root, 'log', '--name-only', '--format=%H').includes('src/x.txt'), 'work product committed');
  const msg = JSON.parse(out || '{}');
  assert.match(msg.systemMessage || '', /committed in-scope work product at Stop/);
});

// 2 — stop_hook_active continuation → no-op (no commit), even with dirty work.
check('stop_hook_active → no-op', () => {
  const root = newEffort();
  write(root, 'src/x.txt', 'still dirty\n');
  const out = runStop(root, { cwd: root, hook_event_name: 'Stop', stop_hook_active: true });
  assert.equal(out.trim(), '', 'no output');
  assert.ok(status(root).includes('src/x.txt'), 'must NOT have committed');
});

// 3 — no effort → silent no-op.
check('no effort → silent no-op', () => {
  const root = mkdtempSync(join(tmpdir(), 'stop-noeff-')); tmps.push(root);
  git(root, 'init', '-q');
  git(root, 'config', 'user.email', 't@e.com'); git(root, 'config', 'user.name', 'x');
  write(root, 'a.txt', 'plain repo\n');
  const out = runStop(root, { cwd: root, hook_event_name: 'Stop' });
  assert.equal(out.trim(), '', 'no output in a non-effort repo');
});

for (const t of tmps) { try { rmSync(t, { recursive: true, force: true }); } catch { /* best effort */ } }

if (process.exitCode) console.error(`\nstop-commit: FAILURES above (${passed} passed).`);
else console.log(`\nstop-commit: all ${passed} checks passed. ✓`);
