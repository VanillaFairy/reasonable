// test/frontier-ready-pack.test.mjs — the frontier ready-set and footprint-disjoint wave packing
// (DESIGN-3.0 §6; reasonable 3.0 Part 7, interfaces.md §1.2/§1.3). Pure, zero-I/O — every graph/
// footprint fixture is a hand-built object literal.

import assert from 'node:assert';
import { ready, pack } from '../lib/frontier.mjs';

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.stack || e.message}`); process.exitCode = 1; }
}

function atom(id, state, component = 'lexer') { return { id, component, state }; }
function edge(from, to) { return { from, to, edge: 'needs', op: 'add' }; }

// ── ready ────────────────────────────────────────────────────────────────────

check('a chartered atom with no needs edges is ready', () => {
  const graph = { atoms: [atom('a-1', 'chartered')], edges: [] };
  assert.deepStrictEqual(ready(graph, {}), ['a-1']);
});

check("'ready' and \"spec'd\" states are frontier-eligible too", () => {
  const graph = { atoms: [atom('a-1', 'ready'), atom('a-2', "spec'd")], edges: [] };
  assert.deepStrictEqual(ready(graph, {}), ['a-1', 'a-2']);
});

check('packed / in-flight / merged / retired atoms are NEVER on the frontier', () => {
  const graph = {
    atoms: [atom('a-1', 'packed'), atom('a-2', 'in-flight'), atom('a-3', 'merged'), atom('a-4', 'retired')],
    edges: [],
  };
  assert.deepStrictEqual(ready(graph, {}), []);
});

check('an atom whose needs-provider is merged is ready', () => {
  const graph = { atoms: [atom('a-1', 'ready'), atom('a-2', 'merged')], edges: [edge('a-1', 'a-2')] };
  assert.deepStrictEqual(ready(graph, {}), ['a-1']);
});

check('an atom whose needs-provider is absent from graph.atoms (already landed/external) is ready', () => {
  const graph = { atoms: [atom('a-1', 'ready')], edges: [edge('a-1', 'a-99')] };
  assert.deepStrictEqual(ready(graph, {}), ['a-1']);
});

check('an atom whose needs-provider is present and NOT merged is excluded', () => {
  const graph = { atoms: [atom('a-1', 'ready'), atom('a-2', 'in-flight')], edges: [edge('a-1', 'a-2')] };
  assert.deepStrictEqual(ready(graph, {}), []);
});

check('frozen excludes an otherwise-ready atom', () => {
  const graph = { atoms: [atom('a-1', 'ready')], edges: [] };
  assert.deepStrictEqual(ready(graph, { frozen: ['a-1'] }), []);
});

check('guardHalted excludes an otherwise-ready atom', () => {
  const graph = { atoms: [atom('a-1', 'ready')], edges: [] };
  assert.deepStrictEqual(ready(graph, { guardHalted: ['a-1'] }), []);
});

check('barred excludes an otherwise-ready atom', () => {
  const graph = { atoms: [atom('a-1', 'ready')], edges: [] };
  assert.deepStrictEqual(ready(graph, { barred: ['a-1'] }), []);
});

check('the result is in graph.atoms order, not sorted or reversed', () => {
  const graph = { atoms: [atom('a-3', 'ready'), atom('a-1', 'ready'), atom('a-2', 'ready')], edges: [] };
  assert.deepStrictEqual(ready(graph, {}), ['a-3', 'a-1', 'a-2']);
});

// ── pack ─────────────────────────────────────────────────────────────────────

function fp(id, over = {}) { return { id, locus: [], contracts: [], resources: [], ...over }; }

check('three mutually disjoint footprints all pack into one wave', () => {
  const fps = [
    fp('a-1', { locus: ['src/a/**'] }),
    fp('a-2', { locus: ['src/b/**'] }),
    fp('a-3', { locus: ['src/c/**'] }),
  ];
  const { wave, deferred } = pack(fps);
  assert.deepStrictEqual(wave.sort(), ['a-1', 'a-2', 'a-3']);
  assert.deepStrictEqual(deferred, []);
});

check('a colliding pair: the first stays in the wave, the second defers', () => {
  const fps = [
    fp('a-1', { contracts: ['lexer'] }),
    fp('a-2', { contracts: ['lexer'] }), // collides with a-1
    fp('a-3', { locus: ['src/c/**'] }),
  ];
  const { wave, deferred } = pack(fps);
  assert.deepStrictEqual(wave.sort(), ['a-1', 'a-3']);
  assert.deepStrictEqual(deferred, ['a-2']);
});

check('pack is deterministic across repeated calls on the same input', () => {
  const fps = [fp('a-1', { contracts: ['x'] }), fp('a-2', { contracts: ['x'] })];
  const r1 = pack(fps);
  const r2 = pack(fps);
  assert.deepStrictEqual(r1, r2);
});

if (process.exitCode) console.error(`\nfrontier-ready-pack: FAILURES above (${passed} passed).`);
else console.log(`\nfrontier-ready-pack: all ${passed} checks pass. ✓`);
