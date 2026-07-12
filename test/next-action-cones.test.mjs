// test/next-action-cones.test.mjs — the goals/cones frontier-order deriver (DESIGN-3.0 §3; reasonable
// 3.0 Part 7, interfaces.md §3). PURE — reconcile does the disk reads and hands in
// {goals, atoms, weights}; this file builds every fixture by hand. Of DESIGN-3.0 §3's six priority
// axes, only unlocks-count (proxied by cone size) is implemented here — the honest partial scope
// named in interfaces.md §3.

import assert from 'node:assert';
import { deriveConeOrder } from '../lib/next-action.mjs';

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.stack || e.message}`); process.exitCode = 1; }
}

function goal(id, clause) {
  return { id, scenario: `${id} scenario`, scenarioCitations: [{ clause }] };
}
function atom(id, component, clauseId, citesClause) {
  return {
    id, component, state: 'merged',
    deltaClauses: [{ clauseId, citations: citesClause ? [{ component: 'x', clause: citesClause }] : [] }],
  };
}

// ── cone membership via the real servesEdges ──────────────────────────────────

check('slices attribute each goal\'s cone atoms correctly, via the real servesEdges walk', () => {
  // g1's scenario cites lexer#c1 (provided by a-1); g2's cites parser#c1 (provided by a-2).
  const goals = [goal('g1', 'lexer#c1'), goal('g2', 'parser#c1')];
  const atoms = [atom('a-1', 'lexer', 'lexer#c1'), atom('a-2', 'parser', 'parser#c1')];
  const { slices } = deriveConeOrder({ goals, atoms, weights: {} });
  const byId = new Map(slices.map((s) => [s.id, s]));
  assert.deepStrictEqual(byId.get('g1').woIds, ['a-1']);
  assert.deepStrictEqual(byId.get('g2').woIds, ['a-2']);
});

// ── unlocksCount-weighted scoring: larger cone sorts first ────────────────────

check('with weights.unlocksCount set, the larger-cone goal sorts first in routeOrder', () => {
  // servesEdges walks DOWNWARD along the provider's own `needs` (a provider's dependency closure), not
  // upward to its consumers — DESIGN-3.0 §2.2's "reverse-reachability from the goal's citations" means
  // the provider found for the citation, PLUS everything THAT provider itself needs. So to grow g2's
  // cone, a-2 (the direct provider of parser#c1) must itself CITE a clause a-3 provides — a-3 is then
  // pulled in as part of a-2's own dependency chain, which is what "serves g2" means.
  // g1's cone is just a-1 (no further citations); g2's cone is a-2 AND a-3 (a-2 cites a-3's clause).
  const goals = [goal('g1', 'lexer#c1'), goal('g2', 'parser#c1')];
  const atoms = [
    atom('a-1', 'lexer', 'lexer#c1'),
    { id: 'a-2', component: 'parser', state: 'merged', deltaClauses: [{ clauseId: 'parser#c1', citations: [{ component: 'parser', clause: 'parser#c2' }] }] },
    atom('a-3', 'parser', 'parser#c2'),
  ];
  const { routeOrder, slices } = deriveConeOrder({ goals, atoms, weights: { unlocksCount: 1 } });
  const byId = new Map(slices.map((s) => [s.id, s]));
  assert.deepStrictEqual(byId.get('g2').woIds, ['a-2', 'a-3'], 'g2\'s cone includes a-2 AND its dependency a-3 (sanity on the fixture)');
  assert.deepStrictEqual(byId.get('g1').woIds, ['a-1']);
  assert.deepStrictEqual(routeOrder, ['g2', 'g1'], 'g2 has the larger cone (2 > 1), so it sorts first under unlocksCount weighting');
});

// ── the neutral default: absent/zero weights preserve input order ────────────

check('an EMPTY weights object preserves the original goal order exactly', () => {
  const goals = [goal('g1', 'lexer#c1'), goal('g2', 'parser#c1')];
  const atoms = [
    atom('a-1', 'lexer', 'lexer#c1'),
    { id: 'a-2', component: 'parser', state: 'merged', deltaClauses: [{ clauseId: 'parser#c1', citations: [{ component: 'parser', clause: 'parser#c2' }] }] },
    atom('a-3', 'parser', 'parser#c2'),
  ];
  const { routeOrder } = deriveConeOrder({ goals, atoms, weights: {} });
  assert.deepStrictEqual(routeOrder, ['g1', 'g2'], 'no scoring signal -> stable input order, even though g2 has the bigger cone');
});

check('a non-numeric weights.unlocksCount also degrades to the neutral input-order default', () => {
  const goals = [goal('g1', 'lexer#c1'), goal('g2', 'parser#c1')];
  const atoms = [atom('a-1', 'lexer', 'lexer#c1'), atom('a-2', 'parser', 'parser#c1')];
  const { routeOrder } = deriveConeOrder({ goals, atoms, weights: { unlocksCount: 'not-a-number' } });
  assert.deepStrictEqual(routeOrder, ['g1', 'g2']);
});

// ── stable tie-breaking on equal scores ───────────────────────────────────────

check('equal-sized cones with a real weight preserve original relative order (stable tie-break)', () => {
  const goals = [goal('g1', 'lexer#c1'), goal('g2', 'parser#c1'), goal('g3', 'sema#c1')];
  const atoms = [atom('a-1', 'lexer', 'lexer#c1'), atom('a-2', 'parser', 'parser#c1'), atom('a-3', 'sema', 'sema#c1')];
  const { routeOrder } = deriveConeOrder({ goals, atoms, weights: { unlocksCount: 5 } });
  assert.deepStrictEqual(routeOrder, ['g1', 'g2', 'g3'], 'all three cones are size 1 -> tie -> original order');
});

// ── the empty-goals case ──────────────────────────────────────────────────────

check('an empty goals array returns empty routeOrder and slices', () => {
  assert.deepStrictEqual(deriveConeOrder({ goals: [], atoms: [], weights: {} }), { routeOrder: [], slices: [] });
});

// ── woIds is deterministically sorted ─────────────────────────────────────────

check('slices[].woIds is sorted, regardless of the atoms array order', () => {
  // A genuine 2-atom cone is provider-DOWNWARD (servesEdges' reverse-reachability): g1 cites parser#c1,
  // provided by a-2, which itself cites parser#c2 provided by a-1 — so a-1 is in a-2's dependency
  // closure and thus in g1's cone. (A consumer that merely CITES the goal's clause is NOT in the cone —
  // that is the semantics this fixture was corrected to respect.) The atoms array lists a-2 before a-1,
  // so a naive walk would yield [a-2, a-1]; deriveConeOrder must return them SORTED as [a-1, a-2].
  const goals = [goal('g1', 'parser#c1')];
  const atoms = [
    { id: 'a-2', component: 'parser', state: 'merged', deltaClauses: [{ clauseId: 'parser#c1', citations: [{ component: 'parser', clause: 'parser#c2' }] }] },
    atom('a-1', 'parser', 'parser#c2'),
  ];
  const { slices } = deriveConeOrder({ goals, atoms, weights: {} });
  assert.deepStrictEqual(slices[0].woIds, ['a-1', 'a-2']);
});

if (process.exitCode) console.error(`\nnext-action-cones: FAILURES above (${passed} passed).`);
else console.log(`\nnext-action-cones: all ${passed} checks pass. ✓`);
