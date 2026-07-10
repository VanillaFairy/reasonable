// test/legibility.test.mjs — the legibility law (DESIGN-3.0 §5.2, reasonable 3.0 Part 6b): bounded
// width, bounded tangle, coupling + chain smells, and R8's density-reduction guard. Pure, zero-I/O —
// graph/tree/edge/policy fixtures are built by hand (via containmentTree, like the P4 graph tests).
import assert from 'node:assert';
import { legibilityFindings, regroupingReducesTangle } from '../lib/legibility.mjs';
import { containmentTree } from '../lib/graph.mjs';
import { computeVerdictEffects } from '../lib/rewrite.mjs';
import { validateEffects } from '../lib/effects.mjs';

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.stack || e.message}`); process.exitCode = 1; }
}

const N = (from, to, edge = 'needs') => ({ from, to, edge });
const fullPolicy = { legibility: { maxWidth: 3, maxTangle: 0.5, maxChain: 3, maxCoupling: 0.4, maxFanIn: 2 } };
const graphOf = (atoms, edges = []) => ({ containment: containmentTree(atoms), atoms, edges });
const ofKind = (fs, kind) => fs.filter((f) => f.kind === kind);

// ── 1. bounded width ─────────────────────────────────────────────────────────

check('bounded width: a group with more than maxWidth children is one over-wide finding', () => {
  const atoms = [0, 1, 2, 3].map((i) => ({ id: `a-${i}`, component: 'big' })); // group 'big' has 4 children
  assert.deepStrictEqual(
    ofKind(legibilityFindings(graphOf(atoms), fullPolicy), 'over-wide'),
    [{ kind: 'over-wide', nodeId: 'big', metric: 4, threshold: 3 }],
  );
});

check('bounded width: a group AT maxWidth children is not a finding (strict >)', () => {
  const atoms = [0, 1, 2].map((i) => ({ id: `a-${i}`, component: 'big' })); // 3 children, maxWidth 3
  assert.deepStrictEqual(ofKind(legibilityFindings(graphOf(atoms), fullPolicy), 'over-wide'), []);
});

// ── 2. bounded tangle (density = lifted / ordered-sibling-pairs) ───────────────

check('bounded tangle: a fully-connected sibling group exceeds maxTangle (density 6/(3*2) = 1.0)', () => {
  const atoms = ['a', 'b', 'c'].map((x) => ({ id: x, component: 'g' }));
  const edges = [N('a', 'b'), N('b', 'a'), N('a', 'c'), N('c', 'a'), N('b', 'c'), N('c', 'b')];
  const fs = ofKind(legibilityFindings(graphOf(atoms, edges), fullPolicy), 'over-tangled');
  assert.strictEqual(fs.length, 1);
  assert.strictEqual(fs[0].nodeId, 'g');
  assert.strictEqual(fs[0].metric, 1);
  assert.strictEqual(fs[0].threshold, 0.5);
});

check('bounded tangle: a sparse sibling group stays under maxTangle (density 1/6, no finding)', () => {
  const atoms = ['a', 'b', 'c'].map((x) => ({ id: x, component: 'g' }));
  assert.deepStrictEqual(ofKind(legibilityFindings(graphOf(atoms, [N('a', 'b')]), fullPolicy), 'over-tangled'), []);
});

// ── 3. the density-reduction guard (R8's validator) ───────────────────────────

const fourChildTree = () => containmentTree(['a1', 'a2', 'a3', 'a4'].map((x) => ({ id: x, component: 'g' })));

check('guard: co-locating a coupled pair strictly reduces cross-group edges (true)', () => {
  const edges = [N('a1', 'a2'), N('a3', 'a4'), N('a1', 'a3')]; // currentCross = 3
  const proposal = { nodeId: 'g', groupOf: { a1: 'L', a2: 'L', a3: 'R', a4: 'R' } }; // proposedCross = 1
  assert.strictEqual(regroupingReducesTangle(proposal, fourChildTree(), edges), true);
});

check('guard: a singleton re-label / empty-strata insertion moves no atom, so it is rejected (false)', () => {
  const edges = [N('a1', 'a2'), N('a3', 'a4'), N('a1', 'a3')];
  const singleton = { nodeId: 'g', groupOf: { a1: 'w', a2: 'x', a3: 'y', a4: 'z' } }; // proposedCross = currentCross = 3
  assert.strictEqual(regroupingReducesTangle(singleton, fourChildTree(), edges), false);
});

check('guard: grouping that co-locates only UNcoupled children does not reduce coupling (false)', () => {
  const edges = [N('a1', 'a2'), N('a3', 'a4'), N('a1', 'a3')];
  const bad = { nodeId: 'g', groupOf: { a1: 'P', a4: 'P', a2: 'Q', a3: 'Q' } }; // no edge becomes intra-group
  assert.strictEqual(regroupingReducesTangle(bad, fourChildTree(), edges), false);
});

check('guard: an unknown nodeId reduces nothing (false)', () => {
  assert.strictEqual(regroupingReducesTangle({ nodeId: 'nope', groupOf: {} }, fourChildTree(), [N('a1', 'a2')]), false);
});

// ── 4. coupling smells (cones from serves edges) ──────────────────────────────

check('coupling: two goals whose exclusive cones are interlinked exceed maxCoupling', () => {
  const atoms = [{ id: 'a1', component: 'c1' }, { id: 'a2', component: 'c2' }];
  const edges = [
    { from: 'a1', to: 'g1', edge: 'serves' },
    { from: 'a2', to: 'g2', edge: 'serves' },
    N('a1', 'a2'), // density = 1 / (2*1*1) = 0.5 > 0.4
  ];
  const fs = ofKind(legibilityFindings(graphOf(atoms, edges), fullPolicy), 'cross-cone-coupling');
  assert.strictEqual(fs.length, 1);
  assert.deepStrictEqual(fs[0].cones, ['g1', 'g2']);
  assert.strictEqual(fs[0].metric, 0.5);
});

check('coupling: two independent goals (no cross-cone needs edge) produce no coupling finding', () => {
  const atoms = [{ id: 'a1', component: 'c1' }, { id: 'a2', component: 'c2' }];
  const edges = [{ from: 'a1', to: 'g1', edge: 'serves' }, { from: 'a2', to: 'g2', edge: 'serves' }];
  assert.deepStrictEqual(ofKind(legibilityFindings(graphOf(atoms, edges), fullPolicy), 'cross-cone-coupling'), []);
});

check('coupling: a component depended on by more than maxFanIn other components is a god-component', () => {
  const atoms = [
    { id: 'g1', component: 'god' },
    { id: 's1', component: 'c1' }, { id: 's2', component: 'c2' }, { id: 's3', component: 'c3' },
  ];
  const edges = [N('s1', 'g1'), N('s2', 'g1'), N('s3', 'g1')]; // fanIn(god) = 3 distinct source components
  assert.deepStrictEqual(
    ofKind(legibilityFindings(graphOf(atoms, edges), fullPolicy), 'god-component'),
    [{ kind: 'god-component', component: 'god', metric: 3, threshold: 2 }],
  );
});

check('coupling: fan-in at or below maxFanIn is not a god-component (strict >)', () => {
  const atoms = [{ id: 'g1', component: 'god' }, { id: 's1', component: 'c1' }, { id: 's2', component: 'c2' }];
  const edges = [N('s1', 'g1'), N('s2', 'g1')]; // fanIn = 2, maxFanIn = 2
  assert.deepStrictEqual(ofKind(legibilityFindings(graphOf(atoms, edges), fullPolicy), 'god-component'), []);
});

// ── 5. chain smell (longest acyclic needs-chain) ──────────────────────────────

check('chain: a needs-chain longer than maxChain is one over-serialized finding with its path', () => {
  const atoms = ['a', 'b', 'c', 'd'].map((x) => ({ id: x, component: x }));
  const edges = [N('a', 'b'), N('b', 'c'), N('c', 'd')]; // 4-node chain, maxChain 3
  const fs = ofKind(legibilityFindings(graphOf(atoms, edges), fullPolicy), 'over-serialized');
  assert.strictEqual(fs.length, 1);
  assert.deepStrictEqual(fs[0].chain, ['a', 'b', 'c', 'd']);
  assert.strictEqual(fs[0].metric, 4);
});

check('chain: a chain at or below maxChain is not over-serialized (strict >)', () => {
  const atoms = ['a', 'b', 'c'].map((x) => ({ id: x, component: x }));
  assert.deepStrictEqual(
    ofKind(legibilityFindings(graphOf(atoms, [N('a', 'b'), N('b', 'c')]), fullPolicy), 'over-serialized'),
    [],
  );
});

check('chain: a needs-cycle does not hang; a finite acyclic chain is still reported', () => {
  const atoms = ['a', 'b', 'c'].map((x) => ({ id: x, component: x }));
  const edges = [N('a', 'b'), N('b', 'a'), N('b', 'c')]; // a<->b cycle plus b->c
  const fs = ofKind(legibilityFindings(graphOf(atoms, edges), { legibility: { maxChain: 1 } }), 'over-serialized');
  assert.strictEqual(fs.length, 1);
  assert.ok(fs[0].metric >= 2 && Number.isFinite(fs[0].metric));
});

// ── 6. R8 composition (the one load-bearing boundary) ─────────────────────────

check('composition: a finding is drop-in usable as an R8 illegible verdict proposal (genesis + live)', () => {
  const atoms = [0, 1, 2, 3].map((i) => ({ id: `a-${i}`, component: 'big' }));
  const [finding] = legibilityFindings(graphOf(atoms), fullPolicy); // the over-wide finding
  assert.ok(finding && finding.kind === 'over-wide');

  const gen = computeVerdictEffects({ kind: 'illegible', scope: 'genesis', proposal: finding }, {});
  assert.strictEqual(gen.ok, true);
  assert.deepStrictEqual(gen.provisional, [{ nodeId: 'topology', change: { blocked: true, reason: 'genesis-R8', proposal: finding } }]);
  assert.ok(validateEffects([...gen.provisional, ...gen.permanent]).ok);

  const live = computeVerdictEffects({ kind: 'illegible', scope: 'live', proposal: finding }, {});
  assert.strictEqual(live.ok, true);
  assert.deepStrictEqual(live.permanent, [{ nodeId: 'topology', change: { retopologyPressure: true, proposal: finding } }]);
  assert.ok(validateEffects([...live.provisional, ...live.permanent]).ok);
});

// ── 7. thresholds are shape-not-value: missing threshold disables its check ────

check('a policy that pins only maxWidth runs only the width check (tangle disabled despite a tangled graph)', () => {
  const atoms = ['a', 'b', 'c', 'd'].map((x) => ({ id: x, component: 'g' }));
  const edges = [N('a', 'b'), N('b', 'a'), N('a', 'c'), N('c', 'a')]; // would tangle if maxTangle were set
  assert.deepStrictEqual(
    legibilityFindings(graphOf(atoms, edges), { legibility: { maxWidth: 3 } }),
    [{ kind: 'over-wide', nodeId: 'g', metric: 4, threshold: 3 }],
  );
});

check('an empty graph, and a policy with no legibility block, both yield [] (never throws)', () => {
  assert.deepStrictEqual(legibilityFindings(graphOf([], []), fullPolicy), []);
  assert.deepStrictEqual(legibilityFindings(graphOf([{ id: 'a', component: 'g' }]), {}), []);
});

// ── 8. finding shape hygiene ──────────────────────────────────────────────────

check('every finding has {kind, metric, threshold, <locator>} and is JSON-serializable (no undefined)', () => {
  const atoms = ['a', 'b', 'c', 'd'].map((x) => ({ id: x, component: 'g' }));
  const edges = [N('a', 'b'), N('b', 'a'), N('a', 'c'), N('c', 'a'), N('b', 'c'), N('c', 'b'), N('a', 'd')];
  const fs = legibilityFindings(graphOf(atoms, edges), fullPolicy);
  assert.ok(fs.length > 0);
  for (const f of fs) {
    assert.ok(typeof f.kind === 'string' && f.kind.length > 0);
    assert.ok(Number.isFinite(f.metric) && Number.isFinite(f.threshold));
    assert.deepStrictEqual(JSON.parse(JSON.stringify(f)), f);
  }
});

if (process.exitCode) console.error(`\nlegibility: FAILURES above (${passed} passed).`);
else console.log(`\nlegibility: all ${passed} checks pass. ✓`);
