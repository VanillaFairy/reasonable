// test/graph-needs-fidelity.test.mjs — A1: needsEdgesWithPlanned(atoms), the per-atom needs fidelity
// the genesis projection uses. A spec'd atom (has deltaClauses) contributes ACTUAL needs (needsEdges);
// an un-spec'd chartered atom contributes PLANNED needs (plannedNeedsEdges). Correct at every stage —
// pure genesis (all planned), the mixed A2 state (per-atom), and full-spec (all actual) — with no mode
// flag. Pure: hand-built atom-record literals, no ledger, no fs.
import assert from 'node:assert';
import { needsEdgesWithPlanned, needsEdges, plannedNeedsEdges } from '../lib/graph.mjs';

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.stack || e.message}`); process.exitCode = 1; }
}
const key = (e) => `${e.from} ${e.to} ${e.edge}`;
const sortE = (es) => es.slice().sort((a, b) => key(a).localeCompare(key(b)));
const eqEdges = (a, b) => assert.deepStrictEqual(sortE(a), sortE(b));

// ── genesis: every atom un-spec'd → exactly the planned fold ─────────────────

check('genesis (all deltaClauses empty) → needsEdgesWithPlanned === plannedNeedsEdges', () => {
  const atoms = [
    { id: 'a-1', component: 'lexer', premises: ['ledger:1'], order: 0, deltaClauses: [] },
    { id: 'a-2', component: 'lexer', premises: ['ledger:1'], order: 1, deltaClauses: [] },
    { id: 'a-3', component: 'parser', premises: ['cite:lexer#c1'], order: 0, deltaClauses: [] },
  ];
  eqEdges(needsEdgesWithPlanned(atoms), plannedNeedsEdges(atoms));
  assert.ok(needsEdgesWithPlanned(atoms).length > 0, 'genesis graph is non-empty (the A1 payoff)');
});

// ── full-spec: every atom spec'd → exactly the actual fold, NO planned edges ──

check('full-spec (all have deltaClauses) → needsEdgesWithPlanned === needsEdges, planned suppressed', () => {
  const atoms = [
    { id: 'a-1', component: 'parser', premises: ['cite:lexer#c1'], order: 0,
      deltaClauses: [{ clauseId: 'parser#c1', citations: [{ component: 'lexer', clause: 'lexer#c1' }] }] },
    { id: 'a-2', component: 'lexer', premises: [], order: 0,
      deltaClauses: [{ clauseId: 'lexer#c1', citations: [] }] },
  ];
  eqEdges(needsEdgesWithPlanned(atoms), needsEdges(atoms));
  // sanity: needsEdges resolves a-1 → a-2 (parser cites lexer#c1, provided by a-2)
  eqEdges(needsEdges(atoms), [{ from: 'a-1', to: 'a-2', edge: 'needs', op: 'add' }]);
});

// ── mixed: spec'd atoms use actual, un-spec'd use planned; no source via both ─

check('mixed → spec\'d source uses actual, un-spec\'d source uses planned', () => {
  const atoms = [
    // a-1 (spec'd) actually cites lexer#c1, provided by a-2 (spec'd) → actual edge a-1 → a-2
    { id: 'a-1', component: 'parser', premises: ['cite:lexer#c1'], order: 0,
      deltaClauses: [{ clauseId: 'parser#c1', citations: [{ component: 'lexer', clause: 'lexer#c1' }] }] },
    { id: 'a-2', component: 'lexer', premises: [], order: 0,
      deltaClauses: [{ clauseId: 'lexer#c1', citations: [] }] },
    // a-3 (un-spec'd) charter-cites parser → planned edge a-3 → a-1 (every parser atom)
    { id: 'a-3', component: 'emitter', premises: ['cite:parser#c1'], order: 0, deltaClauses: [] },
  ];
  const result = needsEdgesWithPlanned(atoms);
  eqEdges(result, [
    { from: 'a-1', to: 'a-2', edge: 'needs', op: 'add' }, // actual (a-1 spec'd)
    { from: 'a-3', to: 'a-1', edge: 'needs', op: 'add' }, // planned (a-3 un-spec'd)
  ]);
  // no `from` id appears via both fidelities (clean partition by source)
  const froms = result.map((e) => e.from);
  assert.strictEqual(new Set(froms).size, froms.length, 'each source atom contributes via one fidelity only');
});

check('empty input → no edges', () => {
  assert.deepStrictEqual(needsEdgesWithPlanned([]), []);
});

if (process.exitCode) console.error(`\ngraph-needs-fidelity: FAILURES above (${passed} passed).`);
else console.log(`\ngraph-needs-fidelity: all ${passed} checks pass. ✓`);
