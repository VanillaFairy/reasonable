// effort.test.mjs — the lane-root fix's pure resolution helpers (node builtins only).
// roleOf is the identity the fence governs canonical .reasonable/ writes by; rootFromArgv +
// argvWithoutRoot are the configurable/parallel-effort root channel threaded through every lib.
// Run: node test/effort.test.mjs

import assert from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { roleOf, rootFromArgv, argvWithoutRoot, findEffortRoot, appendJsonl, readJsonl, norm, foldPath, samePath, underPath } from '../lib/effort.mjs';
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
// T1.2 (§6.3): rootFromArgv now returns norm(resolve(...)) — an absolute, FORWARD-SLASH path by
// construction — so every current + future caller (and the fence's path matching) is slash-clean at
// the source. The pre-T1.2 return was a bare resolve() (native separators on win32).
await check('rootFromArgv honors --root <path> (absolute + forward-slash)', () => {
  const d = mkdtempSync(join(tmpdir(), 'eff-')); tmps.push(d);
  const got = rootFromArgv(['--root', d], process.cwd());
  assert.equal(got, norm(resolve(d)));
  assert.ok(!got.includes('\\'), 'the returned root is forward-slash-only');
});
await check('rootFromArgv ignores --root with no value (next token is a flag) → falls back', () => {
  const root = mkdtempSync(join(tmpdir(), 'eff-')); tmps.push(root);
  mkdirSync(join(root, '.reasonable'), { recursive: true });
  writeFileSync(join(root, '.reasonable', 'config.json'), '{}');
  // `--root --json`: the value starts with -- so it is NOT taken; fall back to the walk from `start`.
  assert.equal(rootFromArgv(['--root', '--json'], root), norm(resolve(root)));
});
await check('rootFromArgv with no --root walks up from start to the effort root (forward-slash)', () => {
  const root = mkdtempSync(join(tmpdir(), 'eff-')); tmps.push(root);
  mkdirSync(join(root, '.reasonable'), { recursive: true });
  writeFileSync(join(root, '.reasonable', 'config.json'), '{}');
  const deep = join(root, 'a', 'b'); mkdirSync(deep, { recursive: true });
  const got = rootFromArgv([], deep);
  assert.equal(got, norm(resolve(root)));
  assert.ok(!got.includes('\\'), 'the up-walk fallback is forward-slash-only too');
  assert.equal(findEffortRoot(deep), resolve(root)); // twin: findEffortRoot itself is unchanged (native sep)
});

// ── foldPath / samePath / underPath — the case-folding comparison primitives (hoisted from ─────────
// reconcile.mjs in T1.2, exported here). win32 folds case (path compare is case-insensitive there and
// resolve() preserves whatever drive-letter case it was handed); POSIX is genuinely case-sensitive.
await check('foldPath folds case on win32, is identity on POSIX', () => {
  if (process.platform === 'win32') assert.equal(foldPath('C:/A/B'), 'c:/a/b');
  else assert.equal(foldPath('/A/B'), '/A/B');
});
await check('samePath tolerates a drive-letter/case mismatch on win32, stays strict on POSIX', () => {
  if (process.platform === 'win32') {
    assert.ok(samePath('C:/Work/Eff', 'c:/work/eff'), 'win32 compares case-insensitively');
  } else {
    assert.ok(!samePath('/Work/Eff', '/work/eff'), 'POSIX compares case-sensitively');
    assert.ok(samePath('/work/eff', '/work/eff'));
  }
});
await check('underPath uses a trailing "/" so a sibling prefix does not match', () => {
  assert.ok(underPath('/a/b', '/a/b/c'), 'a real child is under its base');
  assert.ok(!underPath('/a/b', '/a/bc'), 'a mere string prefix (/a/bc) is NOT under /a/b');
  assert.ok(!underPath('/a/b', '/a/b'), 'a base is not strictly under itself');
  if (process.platform === 'win32') assert.ok(underPath('C:/A', 'c:/a/child'), 'win32: case-insensitive under');
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
