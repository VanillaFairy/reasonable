// test/graph-edges.test.mjs — the four dependency-edge computations (DESIGN-3.0 §2.2, reasonable
// 3.0 Part 4): needs, excludes (+ the ledger-native citation graph/closure it shares with the
// as-lived projection), serves, informs. Pure, zero-I/O — atom-record fixtures are built by hand.

import assert from 'node:assert';
import {
  needsEdges, ledgerCitationGraph, citationClosureOver, excludesEdges, servesEdges, informsEdges,
} from '../lib/graph.mjs';

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.stack || e.message}`); process.exitCode = 1; }
}

function clause(clauseId, { citations = [], demandedBy = null, locus = [] } = {}) {
  return { clauseId, citations, demandedBy, locus };
}
function atom(id, component, deltaClauses = []) {
  return { id, component, deltaClauses };
}
function sortEdges(edges) {
  return edges.slice().sort((a, b) => (a.from + a.to + a.edge).localeCompare(b.from + b.to + b.edge));
}

// ── needsEdges ───────────────────────────────────────────────────────────────

check('A citing a clause B introduces produces exactly one needs edge, A -> B', () => {
  const a = atom('a-1', 'lexer', [clause('lexer#c1', { citations: [{ component: 'ast', clause: 'ast#c1' }] })]);
  const b = atom('a-2', 'ast', [clause('ast#c1')]);
  assert.deepStrictEqual(needsEdges([a, b]), [{ from: 'a-1', to: 'a-2', edge: 'needs', op: 'add' }]);
});

check('multiple clauses/citations to the SAME provider atom dedupe to one edge', () => {
  const a = atom('a-1', 'lexer', [
    clause('lexer#c1', { citations: [{ component: 'ast', clause: 'ast#c1' }] }),
    clause('lexer#c2', { citations: [{ component: 'ast', clause: 'ast#c2' }] }),
  ]);
  const b = atom('a-2', 'ast', [clause('ast#c1'), clause('ast#c2')]);
  assert.deepStrictEqual(needsEdges([a, b]), [{ from: 'a-1', to: 'a-2', edge: 'needs', op: 'add' }]);
});

check('a citation to a clause id no tracked atom introduces produces no edge', () => {
  const a = atom('a-1', 'lexer', [clause('lexer#c1', { citations: [{ component: 'ast', clause: 'ast#c99' }] })]);
  assert.deepStrictEqual(needsEdges([a]), []);
});

check("citing one of your OWN atom's clauses never produces a self-loop", () => {
  const a = atom('a-1', 'lexer', [
    clause('lexer#c1'),
    clause('lexer#c2', { citations: [{ component: 'lexer', clause: 'lexer#c1' }] }),
  ]);
  assert.deepStrictEqual(needsEdges([a]), []);
});

check('two atoms each providing a distinct clause A cites both produce two separate needs edges', () => {
  const a = atom('a-1', 'lexer', [clause('lexer#c1', {
    citations: [{ component: 'ast', clause: 'ast#c1' }, { component: 'eval', clause: 'eval#c1' }],
  })]);
  const b = atom('a-2', 'ast', [clause('ast#c1')]);
  const c = atom('a-3', 'eval', [clause('eval#c1')]);
  assert.deepStrictEqual(sortEdges(needsEdges([a, b, c])), sortEdges([
    { from: 'a-1', to: 'a-2', edge: 'needs', op: 'add' },
    { from: 'a-1', to: 'a-3', edge: 'needs', op: 'add' },
  ]));
});

// ── ledgerCitationGraph / citationClosureOver ───────────────────────────────

check('ledgerCitationGraph unions cited components across every atom of the same component', () => {
  const a = atom('a-1', 'lexer', [clause('lexer#c1', { citations: [{ component: 'ast', clause: 'ast#c1' }] })]);
  const b = atom('a-2', 'lexer', [clause('lexer#c2', { citations: [{ component: 'eval', clause: 'eval#c1' }] })]);
  assert.deepStrictEqual(ledgerCitationGraph([a, b]).lexer.slice().sort(), ['ast', 'eval']);
});

check('ledgerCitationGraph has an empty entry for a component with no citations tracked', () => {
  const a = atom('a-1', 'lexer', []);
  assert.deepStrictEqual(ledgerCitationGraph([a]), { lexer: [] });
});

check('citationClosureOver is transitive', () => {
  const graph = { lexer: ['ast'], ast: ['eval'], eval: [] };
  assert.deepStrictEqual(citationClosureOver(graph, ['lexer']).sort(), ['ast', 'eval', 'lexer']);
});

check('citationClosureOver never loops forever on a cycle', () => {
  const graph = { a: ['b'], b: ['a'] };
  assert.deepStrictEqual(citationClosureOver(graph, ['a']).sort(), ['a', 'b']);
});

// Added beyond the spec's given examples: an empty seeds array is the natural degenerate input
// (e.g. an atom whose delta cites nothing) and interfaces.md doesn't say what happens then — cheap
// to pin now rather than leave ambiguous.
check('citationClosureOver over an empty seeds array returns []', () => {
  const graph = { lexer: ['ast'] };
  assert.deepStrictEqual(citationClosureOver(graph, []), []);
});

// ── excludesEdges ────────────────────────────────────────────────────────────

check('two atoms of the SAME component always exclude, even with no citations or locus', () => {
  const a = atom('a-1', 'lexer', [clause('lexer#c1')]);
  const b = atom('a-2', 'lexer', [clause('lexer#c2')]);
  const graph = ledgerCitationGraph([a, b]);
  assert.deepStrictEqual(excludesEdges([a, b], { citationGraph: graph }),
    [{ from: 'a-1', to: 'a-2', edge: 'excludes', op: 'add' }]);
});

check('from/to are ordered by atom id regardless of input order (symmetric, deterministic)', () => {
  const a = atom('a-2', 'lexer', []);
  const b = atom('a-1', 'lexer', []);
  const graph = ledgerCitationGraph([a, b]);
  assert.deepStrictEqual(excludesEdges([a, b], { citationGraph: graph }),
    [{ from: 'a-1', to: 'a-2', edge: 'excludes', op: 'add' }]);
});

check('two atoms of DIFFERENT components with no shared citation closure and disjoint loci do not exclude', () => {
  const a = atom('a-1', 'lexer', [clause('lexer#c1', { locus: ['lib/lexer/scan.mjs'] })]);
  const b = atom('a-2', 'ast', [clause('ast#c1', { locus: ['lib/ast/build.mjs'] })]);
  const graph = ledgerCitationGraph([a, b]);
  assert.deepStrictEqual(excludesEdges([a, b], { citationGraph: graph }), []);
});

check('two atoms of different components with OVERLAPPING loci exclude despite disjoint citations', () => {
  const a = atom('a-1', 'lexer', [clause('lexer#c1', { locus: ['lib/shared/util.mjs'] })]);
  const b = atom('a-2', 'ast', [clause('ast#c1', { locus: ['lib/shared/util.mjs'] })]);
  const graph = ledgerCitationGraph([a, b]);
  assert.deepStrictEqual(excludesEdges([a, b], { citationGraph: graph }),
    [{ from: 'a-1', to: 'a-2', edge: 'excludes', op: 'add' }]);
});

// Added beyond the spec's given examples: the design doc (Decision 4) is explicit that
// excludesEdges must mirror lib/footprint.mjs's independent()/lociOverlap() "exactly", which is an
// ANCESTOR-relation test on directory prefixes, not a plain array-intersection on locus strings.
// The given "OVERLAPPING loci" test above uses two IDENTICAL locus strings, which a naive
// `intersect(a.locus, b.locus).length > 0` implementation would also satisfy — it never forces the
// ancestor-prefix logic to exist at all. This test uses a directory locus on one side and a nested
// file locus on the other (never equal as strings) so only a real ancestor-overlap check passes it.
check("a DIRECTORY locus containing another atom's FILE locus counts as an ancestor overlap, not just identical-string loci (mirrors footprint.mjs's lociOverlap, not a naive exact-match intersection)", () => {
  const a = atom('a-1', 'lexer', [clause('lexer#c1', { locus: ['lib/shared/'] })]);
  const b = atom('a-2', 'ast', [clause('ast#c1', { locus: ['lib/shared/util.mjs'] })]);
  const graph = ledgerCitationGraph([a, b]);
  assert.deepStrictEqual(excludesEdges([a, b], { citationGraph: graph }),
    [{ from: 'a-1', to: 'a-2', edge: 'excludes', op: 'add' }]);
});

check('two atoms with DISTINCT literal file loci in the SAME directory do not exclude on locus alone (no wildcard means no ancestor-directory truncation)', () => {
  const a = atom('a-1', 'lexer', [clause('lexer#c1', { locus: ['lib/graph.mjs'] })]);
  const b = atom('a-2', 'ast', [clause('ast#c1', { locus: ['lib/rewrite.mjs'] })]);
  const graph = ledgerCitationGraph([a, b]);
  assert.deepStrictEqual(excludesEdges([a, b], { citationGraph: graph }), []);
});

check('two atoms whose citation closures transitively share a component exclude, even indirectly', () => {
  const a = atom('a-1', 'lexer', [clause('lexer#c1', { citations: [{ component: 'ast', clause: 'ast#c1' }] })]);
  const b = atom('a-2', 'eval', [clause('eval#c1', { citations: [{ component: 'ast', clause: 'ast#c1' }] })]);
  const graph = ledgerCitationGraph([a, b]); // lexer -> [ast], eval -> [ast]
  assert.deepStrictEqual(excludesEdges([a, b], { citationGraph: graph }),
    [{ from: 'a-1', to: 'a-2', edge: 'excludes', op: 'add' }]);
});

check('excludesEdges defaults an omitted citationGraph to {} rather than throwing', () => {
  const a = atom('a-1', 'lexer', []);
  const b = atom('a-2', 'ast', []);
  assert.deepStrictEqual(excludesEdges([a, b]), []);
});

// Added beyond the spec's given examples: the zero/one-atom boundary (no pairs to compare at all)
// isn't exercised by any given test, and is a cheap, obvious edge case to pin.
check('excludesEdges over zero or one atom returns [] (no pairs to compare)', () => {
  assert.deepStrictEqual(excludesEdges([]), []);
  assert.deepStrictEqual(excludesEdges([atom('a-1', 'lexer', [])]), []);
});

// ── servesEdges ──────────────────────────────────────────────────────────────

check('servesEdges returns [] when called with no goals (the default, always today)', () => {
  const a = atom('a-1', 'lexer', [clause('lexer#c1')]);
  assert.deepStrictEqual(servesEdges([a]), []);
  assert.deepStrictEqual(servesEdges([a], []), []);
});

check('an atom providing a goal-cited clause serves that goal', () => {
  const a = atom('a-1', 'lexer', [clause('lexer#c1')]);
  const goals = [{ id: 'g-1', scenarioCitations: [{ component: 'lexer', clause: 'lexer#c1' }] }];
  assert.deepStrictEqual(servesEdges([a], goals), [{ from: 'a-1', to: 'g-1', edge: 'serves', op: 'add' }]);
});

check("serving is TRANSITIVE over needs: a provider's own dependency also serves the goal", () => {
  const a = atom('a-1', 'lexer', [clause('lexer#c1', { citations: [{ component: 'ast', clause: 'ast#c1' }] })]);
  const b = atom('a-2', 'ast', [clause('ast#c1')]);
  const goals = [{ id: 'g-1', scenarioCitations: [{ component: 'lexer', clause: 'lexer#c1' }] }];
  assert.deepStrictEqual(sortEdges(servesEdges([a, b], goals)), sortEdges([
    { from: 'a-1', to: 'g-1', edge: 'serves', op: 'add' },
    { from: 'a-2', to: 'g-1', edge: 'serves', op: 'add' },
  ]));
});

check('a goal citing a clause no tracked atom introduces produces no serves edges', () => {
  const a = atom('a-1', 'lexer', [clause('lexer#c1')]);
  const goals = [{ id: 'g-1', scenarioCitations: [{ component: 'ast', clause: 'ast#c99' }] }];
  assert.deepStrictEqual(servesEdges([a], goals), []);
});

// ── informsEdges ─────────────────────────────────────────────────────────────

check('informsEdges returns [] when called with no spikeInforms (the default, always today)', () => {
  const a = atom('a-1', 'lexer', []);
  assert.deepStrictEqual(informsEdges([a]), []);
  assert.deepStrictEqual(informsEdges([a], []), []);
});

check('a spikeInforms entry naming a real atomId becomes one informs edge', () => {
  const a = atom('a-1', 'lexer', []);
  const spikeInforms = [{ spikeId: 'spike-1', atomId: 'a-1' }];
  assert.deepStrictEqual(informsEdges([a], spikeInforms), [{ from: 'spike-1', to: 'a-1', edge: 'informs', op: 'add' }]);
});

check("a spikeInforms entry naming an atomId NOT in this call's atoms is dropped, not fabricated", () => {
  const a = atom('a-1', 'lexer', []);
  const spikeInforms = [{ spikeId: 'spike-1', atomId: 'a-99' }];
  assert.deepStrictEqual(informsEdges([a], spikeInforms), []);
});

if (process.exitCode) console.error(`\ngraph-edges: FAILURES above (${passed} passed).`);
else console.log(`\ngraph-edges: all ${passed} checks pass. ✓`);
