// test/ownership-loader.test.mjs — A1: the conservative loader for `.reasonable/ownership.json`, the
// ratified component -> subeffort-path map (the topologist's genesis output #3) that lib/graph.mjs's
// containmentTree consumes as `ownershipMap`. Modeled on test/goals-loader.test.mjs. Node builtins only;
// a throwaway effort dir on disk.
import assert from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readOwnership } from '../lib/ownership.mjs';
import { containmentTree } from '../lib/graph.mjs';

const tmps = [];
let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.stack || e.message}`); process.exitCode = 1; }
}

// A fresh effort root with `.reasonable/` present; `content` (a RAW string) is written verbatim so
// malformed-JSON fixtures are expressible. Omit `content` for the absent-file case.
function newEffort(content) {
  const root = mkdtempSync(join(tmpdir(), 'ownership-')); tmps.push(root);
  mkdirSync(join(root, '.reasonable'), { recursive: true });
  if (content !== undefined) writeFileSync(join(root, '.reasonable', 'ownership.json'), content);
  return root;
}
const write = (obj) => newEffort(JSON.stringify(obj));

// ── absent file — forward-compat (a pre-genesis effort), not an error ────────

check('absent ownership.json -> { ownership: null, diagnostic: null }', () => {
  assert.deepStrictEqual(readOwnership(newEffort()), { ownership: null, diagnostic: null });
});

check('absent .reasonable/ dir entirely -> { ownership: null, diagnostic: null } (never throws)', () => {
  const root = mkdtempSync(join(tmpdir(), 'ownership-noeff-')); tmps.push(root);
  assert.deepStrictEqual(readOwnership(root), { ownership: null, diagnostic: null });
});

// ── valid — the map is returned verbatim, key order preserved ────────────────

check('a valid single-entry map parses verbatim', () => {
  const { ownership, diagnostic } = readOwnership(write({ lexer: 'frontend/parsing' }));
  assert.strictEqual(diagnostic, null);
  assert.deepStrictEqual(ownership, { lexer: 'frontend/parsing' });
});

check('a multi-entry map is returned verbatim, order preserved', () => {
  const map = { lexer: 'frontend/parsing', parser: 'frontend/parsing', emitter: 'backend/codegen' };
  const { ownership, diagnostic } = readOwnership(write(map));
  assert.strictEqual(diagnostic, null);
  assert.deepStrictEqual(ownership, map);
  assert.deepStrictEqual(Object.keys(ownership), ['lexer', 'parser', 'emitter']);
});

check('an empty map {} is valid -> { ownership: {}, diagnostic: null } (all-flat placement)', () => {
  assert.deepStrictEqual(readOwnership(write({})), { ownership: {}, diagnostic: null });
});

// ── grounding: a loaded map composes with containmentTree directly ───────────

check('a loaded map feeds containmentTree and nests the atom under its subeffort path', () => {
  const { ownership } = readOwnership(write({ lexer: 'frontend/parsing' }));
  const tree = containmentTree([{ id: 'a-1', component: 'lexer' }], { ownershipMap: ownership });
  // root -> frontend (group) -> frontend/parsing (group) -> a-1 (atom leaf)
  const frontend = tree.children.find((c) => c.id === 'frontend');
  assert.ok(frontend && frontend.kind === 'group', 'a "frontend" group node exists at the root');
  const parsing = frontend.children.find((c) => c.id === 'frontend/parsing');
  assert.ok(parsing && parsing.kind === 'group', 'a "frontend/parsing" group node nests under frontend');
  assert.deepStrictEqual(parsing.children.map((c) => c.id), ['a-1']);
});

// ── present but invalid — null + a surfaced diagnostic, never a repair ───────

const hasDiag = (root) => {
  const { ownership, diagnostic } = readOwnership(root);
  assert.strictEqual(ownership, null);
  assert.ok(typeof diagnostic === 'string' && diagnostic.length > 0, 'diagnostic is a non-empty string');
};

check('invalid JSON (unparseable) -> null + diagnostic', () => hasDiag(newEffort('{ not valid json')));
check('root JSON value is an array (not an object) -> null + diagnostic', () => hasDiag(write(['lexer'])));
check('root JSON value is a string (not an object) -> null + diagnostic', () => hasDiag(write('lexer')));
check('root JSON value is null -> null + diagnostic', () => hasDiag(newEffort('null')));
check('a non-string value (a number) -> null + diagnostic', () => hasDiag(write({ lexer: 3 })));
check('a non-string value (an object) -> null + diagnostic', () => hasDiag(write({ lexer: { path: 'x' } })));
check('an empty-string value -> null + diagnostic', () => hasDiag(write({ lexer: '' })));
check('a valid entry followed by a malformed one fails the WHOLE load (all-or-nothing, never partial)', () =>
  hasDiag(write({ lexer: 'frontend/parsing', parser: 42 })));

// ── round trip through a real .reasonable/ownership.json on disk ─────────────

check('round trip: writeFileSync (pretty-printed) then readOwnership reproduces the map', () => {
  const root = newEffort();
  const map = { lexer: 'frontend/parsing', emitter: 'backend' };
  writeFileSync(join(root, '.reasonable', 'ownership.json'), JSON.stringify(map, null, 2) + '\n');
  const { ownership, diagnostic } = readOwnership(root);
  assert.strictEqual(diagnostic, null);
  assert.deepStrictEqual(ownership, map);
});

for (const d of tmps) { try { rmSync(d, { recursive: true, force: true }); } catch { /* best-effort cleanup */ } }

if (process.exitCode) console.error(`\nownership: FAILURES above (${passed} passed).`);
else console.log(`\nownership: all ${passed} checks passed. ✓`);
