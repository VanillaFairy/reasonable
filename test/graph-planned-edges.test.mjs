// test/graph-planned-edges.test.mjs — P6a: the planned-needs fold (DESIGN-3.0 §2.2).
// Pure: charters are hand-built { id, component, premises, order } literals — no ledger, no fs.
import assert from 'node:assert';
import { plannedNeedsEdges } from '../lib/graph.mjs';
import { validateEffects } from '../lib/effects.mjs';

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.stack || e.message}`); process.exitCode = 1; }
}

const sortEdges = (es) => es.slice().sort((a, b) => `${a.from} ${a.to}`.localeCompare(`${b.from} ${b.to}`));
const E = (from, to) => ({ from, to, edge: 'needs', op: 'add' });

// ── cross-component quotient (§2.2 (a)) ──────────────────────────────────────

check('a cite:Y#cN premise ⇒ needs the atom of component Y', () => {
  const charters = [
    { id: 'a-1', component: 'parser', premises: ['cite:lexer#c3'], order: 0 },
    { id: 'a-2', component: 'lexer', premises: ['ledger:1'], order: 0 },
  ];
  assert.deepStrictEqual(sortEdges(plannedNeedsEdges(charters)), sortEdges([E('a-1', 'a-2')]));
});

check('cross-component fans to EVERY atom of the cited component (the quotient)', () => {
  const charters = [
    { id: 'a-1', component: 'parser', premises: ['cite:lexer#c3'], order: 0 },
    { id: 'a-2', component: 'lexer', premises: ['ledger:1'], order: 0 },
    { id: 'a-3', component: 'lexer', premises: ['ledger:1'], order: 1 },
  ];
  // a-1 needs both lexer atoms; a-3 needs a-2 (intra: order 1 after 0)
  assert.deepStrictEqual(
    sortEdges(plannedNeedsEdges(charters)),
    sortEdges([E('a-1', 'a-2'), E('a-1', 'a-3'), E('a-3', 'a-2')]),
  );
});

check('a same-component cite yields no cross edge (intra order is the source there)', () => {
  const charters = [{ id: 'a-1', component: 'lexer', premises: ['cite:lexer#c1'], order: 0 }];
  assert.deepStrictEqual(plannedNeedsEdges(charters), []);
});

check('non-cite premises (goal/gate/ledger) yield no cross edge', () => {
  const charters = [
    { id: 'a-1', component: 'parser', premises: ['goal:g1', 'gate:scaffold', 'ledger:7'], order: 0 },
    { id: 'a-2', component: 'lexer', premises: [], order: 0 },
  ];
  assert.deepStrictEqual(plannedNeedsEdges(charters), []);
});

check('an unparseable cite ref (no #cN — e.g. a future intention address) yields no edge', () => {
  const charters = [
    { id: 'a-1', component: 'parser', premises: ['cite:intention', 'cite:not a clause'], order: 0 },
    { id: 'a-2', component: 'lexer', premises: [], order: 0 },
  ];
  assert.deepStrictEqual(plannedNeedsEdges(charters), []);
});

check('a cite to a component with no chartered atoms yet yields no edge', () => {
  const charters = [{ id: 'a-1', component: 'parser', premises: ['cite:ghost#c1'], order: 0 }];
  assert.deepStrictEqual(plannedNeedsEdges(charters), []);
});

check('duplicate cross-component demands dedup to one edge', () => {
  const charters = [
    { id: 'a-1', component: 'parser', premises: ['cite:lexer#c1', 'cite:lexer#c2'], order: 0 },
    { id: 'a-2', component: 'lexer', premises: [], order: 0 },
  ];
  assert.deepStrictEqual(plannedNeedsEdges(charters), [E('a-1', 'a-2')]);
});

// ── intra-component order strata (§2.2 (b)) ──────────────────────────────────

check('intra-component: each stratum needs the IMMEDIATELY preceding one, not all lower', () => {
  const charters = [
    { id: 'a-1', component: 'parser', premises: [], order: 0 },
    { id: 'a-2', component: 'parser', premises: [], order: 1 },
    { id: 'a-3', component: 'parser', premises: [], order: 2 },
  ];
  // a-2 needs a-1; a-3 needs a-2; NOT a-3 needs a-1 (immediate predecessor only)
  assert.deepStrictEqual(sortEdges(plannedNeedsEdges(charters)), sortEdges([E('a-2', 'a-1'), E('a-3', 'a-2')]));
});

check('intra-component: equal-order atoms are concurrent; the next stratum needs both', () => {
  const charters = [
    { id: 'a-1', component: 'parser', premises: [], order: 0 },
    { id: 'a-2', component: 'parser', premises: [], order: 0 },
    { id: 'a-3', component: 'parser', premises: [], order: 1 },
  ];
  // no edge between a-1 and a-2; a-3 needs both
  assert.deepStrictEqual(sortEdges(plannedNeedsEdges(charters)), sortEdges([E('a-3', 'a-1'), E('a-3', 'a-2')]));
});

check('intra-component: a missing/non-integer order is treated as 0', () => {
  const charters = [
    { id: 'a-1', component: 'parser', premises: [] },           // no order → 0
    { id: 'a-2', component: 'parser', premises: [], order: 1 },
  ];
  assert.deepStrictEqual(plannedNeedsEdges(charters), [E('a-2', 'a-1')]);
});

check('intra edges are scoped per component (no cross-component intra edge)', () => {
  const charters = [
    { id: 'a-1', component: 'parser', premises: [], order: 0 },
    { id: 'a-2', component: 'lexer', premises: [], order: 1 },  // different component
  ];
  assert.deepStrictEqual(plannedNeedsEdges(charters), []);
});

// ── combined + degenerate + shape ────────────────────────────────────────────

check('cross-component and intra-component edges combine without interference', () => {
  const charters = [
    { id: 'a-1', component: 'lexer', premises: [], order: 0 },
    { id: 'a-2', component: 'lexer', premises: [], order: 1 },
    { id: 'a-3', component: 'parser', premises: ['cite:lexer#c1'], order: 0 },
  ];
  // intra: a-2 needs a-1. cross: a-3 needs every lexer atom (a-1, a-2).
  assert.deepStrictEqual(
    sortEdges(plannedNeedsEdges(charters)),
    sortEdges([E('a-2', 'a-1'), E('a-3', 'a-1'), E('a-3', 'a-2')]),
  );
});

check('empty and single-charter inputs yield no edges', () => {
  assert.deepStrictEqual(plannedNeedsEdges([]), []);
  assert.deepStrictEqual(plannedNeedsEdges([{ id: 'a-1', component: 'x', premises: [], order: 0 }]), []);
});

check('never emits a self-edge', () => {
  const charters = [{ id: 'a-1', component: 'lexer', premises: ['cite:lexer#c1'], order: 0 }];
  assert.ok(plannedNeedsEdges(charters).every((e) => e.from !== e.to));
});

check('every emitted edge is a valid effects.mjs edge effect', () => {
  const charters = [
    { id: 'a-1', component: 'parser', premises: ['cite:lexer#c3'], order: 1 },
    { id: 'a-2', component: 'parser', premises: [], order: 0 },
    { id: 'a-3', component: 'lexer', premises: [], order: 0 },
  ];
  const edges = plannedNeedsEdges(charters);
  assert.ok(edges.length > 0);
  assert.strictEqual(validateEffects(edges).ok, true);
  for (const e of edges) assert.deepStrictEqual(Object.keys(e).sort(), ['edge', 'from', 'op', 'to']);
});

check('cross-component quotient is DIRECT, not transitive (a 3-component chain)', () => {
  // parser cites ast; ast cites lexer. parser must NOT planned-need lexer (no transitive closure).
  const charters = [
    { id: 'p-1', component: 'parser', premises: ['cite:ast#c1'], order: 0 },
    { id: 'ast-1', component: 'ast', premises: ['cite:lexer#c1'], order: 0 },
    { id: 'lex-1', component: 'lexer', premises: [], order: 0 },
  ];
  assert.deepStrictEqual(
    sortEdges(plannedNeedsEdges(charters)),
    sortEdges([E('p-1', 'ast-1'), E('ast-1', 'lex-1')]), // NO p-1 → lex-1
  );
});

check('intra-component strata are gap-tolerant (non-contiguous order values)', () => {
  const charters = [
    { id: 'a-1', component: 'parser', premises: [], order: 0 },
    { id: 'a-2', component: 'parser', premises: [], order: 5 },
    { id: 'a-3', component: 'parser', premises: [], order: 9 },
  ];
  // immediate-predecessor STRATUM by ascending distinct order: 5-needs-0, 9-needs-5
  assert.deepStrictEqual(sortEdges(plannedNeedsEdges(charters)), sortEdges([E('a-2', 'a-1'), E('a-3', 'a-2')]));
});

check('a charter with an absent premises key (not []) yields no cross edge and does not crash', () => {
  const charters = [
    { id: 'a-1', component: 'parser', order: 1 },            // no premises key at all
    { id: 'a-2', component: 'parser', premises: [], order: 0 },
  ];
  // only the intra edge a-1 → a-2 (order 1 after 0); the absent premises yields no cross edge
  assert.deepStrictEqual(plannedNeedsEdges(charters), [E('a-1', 'a-2')]);
});

if (process.exitCode) console.error(`\ngraph-planned-edges: FAILURES above (${passed} passed).`);
else console.log(`\ngraph-planned-edges: all ${passed} checks pass. ✓`);
