// effort.test.mjs — the lane-root fix's pure resolution helpers (node builtins only).
// roleOf is the identity the fence governs canonical .reasonable/ writes by; rootFromArgv +
// argvWithoutRoot are the configurable/parallel-effort root channel threaded through every lib.
// Run: node test/effort.test.mjs

import assert from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { roleOf, rootFromArgv, argvWithoutRoot, findEffortRoot } from '../lib/effort.mjs';

const tmps = [];
let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.message}`); process.exitCode = 1; }
}

// ── roleOf — the harness agent-role stamp (strips the reasonable: prefix) ────────
check('roleOf strips the reasonable: prefix', () => {
  assert.equal(roleOf({ agent_type: 'reasonable:characterizer' }), 'characterizer');
  assert.equal(roleOf({ agent_type: 'reasonable:journal-writer' }), 'journal-writer');
});
check('roleOf returns null for the main session (no agent_type)', () => {
  assert.equal(roleOf({}), null);
  assert.equal(roleOf({ tool_name: 'Edit' }), null);
  assert.equal(roleOf(null), null);
});
check('roleOf passes through an unknown/unprefixed type (so it lands in no allow-list)', () => {
  assert.equal(roleOf({ agent_type: 'general-purpose' }), 'general-purpose');
  assert.equal(roleOf({ agent_type: 'workflow-subagent' }), 'workflow-subagent');
});

// ── rootFromArgv — explicit --root wins; else walk up from start ─────────────────
check('rootFromArgv honors --root <path> (resolved absolute)', () => {
  const d = mkdtempSync(join(tmpdir(), 'eff-')); tmps.push(d);
  assert.equal(rootFromArgv(['--root', d], process.cwd()), resolve(d));
});
check('rootFromArgv ignores --root with no value (next token is a flag) → falls back', () => {
  const root = mkdtempSync(join(tmpdir(), 'eff-')); tmps.push(root);
  mkdirSync(join(root, '.reasonable'), { recursive: true });
  writeFileSync(join(root, '.reasonable', 'config.json'), '{}');
  // `--root --json`: the value starts with -- so it is NOT taken; fall back to the walk from `start`.
  assert.equal(rootFromArgv(['--root', '--json'], root), resolve(root));
});
check('rootFromArgv with no --root walks up from start to the effort root', () => {
  const root = mkdtempSync(join(tmpdir(), 'eff-')); tmps.push(root);
  mkdirSync(join(root, '.reasonable'), { recursive: true });
  writeFileSync(join(root, '.reasonable', 'config.json'), '{}');
  const deep = join(root, 'a', 'b'); mkdirSync(deep, { recursive: true });
  assert.equal(rootFromArgv([], deep), resolve(root));
  assert.equal(findEffortRoot(deep), resolve(root)); // twin: the fallback path
});

// ── argvWithoutRoot — drop the --root <path> pair so positional parsing is clean ─
check('argvWithoutRoot removes the --root pair, preserves the rest in order', () => {
  assert.deepEqual(
    argvWithoutRoot(['node', 'footprint.mjs', '--root', '/x', 'WO-1', '--json']),
    ['node', 'footprint.mjs', 'WO-1', '--json'],
  );
});
check('argvWithoutRoot leaves argv without --root untouched', () => {
  assert.deepEqual(argvWithoutRoot(['node', 'f.mjs', 'WO-1']), ['node', 'f.mjs', 'WO-1']);
});

for (const t of tmps) { try { rmSync(t, { recursive: true, force: true }); } catch { /* best effort */ } }

if (process.exitCode) console.error(`\neffort: FAILURES above (${passed} passed).`);
else console.log(`\neffort: all ${passed} checks passed. ✓`);
