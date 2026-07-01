// effort.test.mjs — the lane-root fix's pure resolution helpers (node builtins only).
// roleOf is the identity the fence governs canonical .reasonable/ writes by; rootFromArgv +
// argvWithoutRoot are the configurable/parallel-effort root channel threaded through every lib.
// Run: node test/effort.test.mjs

import assert from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { roleOf, rootFromArgv, argvWithoutRoot, findEffortRoot, appendJsonl, readJsonl } from '../lib/effort.mjs';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const tmps = [];
let passed = 0;
async function check(name, fn) {
  try { await fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.message}`); process.exitCode = 1; }
}

// ── roleOf — the harness agent-role stamp (strips the reasonable: prefix) ────────
await check('roleOf strips the reasonable: prefix', () => {
  assert.equal(roleOf({ agent_type: 'reasonable:characterizer' }), 'characterizer');
  assert.equal(roleOf({ agent_type: 'reasonable:journal-writer' }), 'journal-writer');
});
await check('roleOf returns null for the main session (no agent_type)', () => {
  assert.equal(roleOf({}), null);
  assert.equal(roleOf({ tool_name: 'Edit' }), null);
  assert.equal(roleOf(null), null);
});
await check('roleOf passes through an unknown/unprefixed type (so it lands in no allow-list)', () => {
  assert.equal(roleOf({ agent_type: 'general-purpose' }), 'general-purpose');
  assert.equal(roleOf({ agent_type: 'workflow-subagent' }), 'workflow-subagent');
});

// ── rootFromArgv — explicit --root wins; else walk up from start ─────────────────
await check('rootFromArgv honors --root <path> (resolved absolute)', () => {
  const d = mkdtempSync(join(tmpdir(), 'eff-')); tmps.push(d);
  assert.equal(rootFromArgv(['--root', d], process.cwd()), resolve(d));
});
await check('rootFromArgv ignores --root with no value (next token is a flag) → falls back', () => {
  const root = mkdtempSync(join(tmpdir(), 'eff-')); tmps.push(root);
  mkdirSync(join(root, '.reasonable'), { recursive: true });
  writeFileSync(join(root, '.reasonable', 'config.json'), '{}');
  // `--root --json`: the value starts with -- so it is NOT taken; fall back to the walk from `start`.
  assert.equal(rootFromArgv(['--root', '--json'], root), resolve(root));
});
await check('rootFromArgv with no --root walks up from start to the effort root', () => {
  const root = mkdtempSync(join(tmpdir(), 'eff-')); tmps.push(root);
  mkdirSync(join(root, '.reasonable'), { recursive: true });
  writeFileSync(join(root, '.reasonable', 'config.json'), '{}');
  const deep = join(root, 'a', 'b'); mkdirSync(deep, { recursive: true });
  assert.equal(rootFromArgv([], deep), resolve(root));
  assert.equal(findEffortRoot(deep), resolve(root)); // twin: the fallback path
});

// ── argvWithoutRoot — drop the --root <path> pair so positional parsing is clean ─
await check('argvWithoutRoot removes the --root pair, preserves the rest in order', () => {
  assert.deepEqual(
    argvWithoutRoot(['node', 'footprint.mjs', '--root', '/x', 'WO-1', '--json']),
    ['node', 'footprint.mjs', 'WO-1', '--json'],
  );
});
await check('argvWithoutRoot leaves argv without --root untouched', () => {
  assert.deepEqual(argvWithoutRoot(['node', 'f.mjs', 'WO-1']), ['node', 'f.mjs', 'WO-1']);
});

// ── appendJsonl — concurrent-safe seq assignment ──────────────────────────────────
await check('appendJsonl: N concurrent callers each get a unique, gapless seq', async () => {
  const root = mkdtempSync(join(tmpdir(), 'eff-concurrency-')); tmps.push(root);
  const path = join(root, 'ledger.jsonl');
  const effortMjsUrl = pathToFileURL(resolve('lib/effort.mjs')).href;
  const N = 20;
  // A single Node process can't race its own synchronous fs calls against itself — the
  // read-then-write window only shows up across real OS processes, so spawn N of them, all
  // targeting the same ledger path.
  const workers = Array.from({ length: N }, (_, i) => {
    const code = `import(${JSON.stringify(effortMjsUrl)}).then(m => m.appendJsonl(${JSON.stringify(path)}, { i: ${i} }));`;
    return spawn(process.execPath, ['--input-type=module', '-e', code], { stdio: 'ignore' });
  });
  await Promise.all(workers.map((w) => new Promise((res, rej) => {
    w.on('exit', (code) => (code === 0 ? res() : rej(new Error(`worker ${w.pid} exited ${code}`))));
    w.on('error', rej);
  })));
  const lines = readJsonl(path);
  assert.equal(lines.length, N, 'every concurrent append landed exactly once');
  const seqs = lines.map((l) => l.seq).sort((a, b) => a - b);
  assert.equal(new Set(seqs).size, N, 'no duplicate seq under concurrency');
  assert.deepEqual(seqs, Array.from({ length: N }, (_, i) => i + 1), 'seq is gapless 1..N');
});

for (const t of tmps) { try { rmSync(t, { recursive: true, force: true }); } catch { /* best effort */ } }

if (process.exitCode) console.error(`\neffort: FAILURES above (${passed} passed).`);
else console.log(`\neffort: all ${passed} checks passed. ✓`);
