# Task T06a: goals/cones order deriver tests (red)

**Role:** `red` — you write ONLY the one failing test file below. Do NOT implement `deriveConeOrder`.

## References
- Read: `../shared/interfaces.md` §3 **in full** (the exact scoring rule — `unlocksCount`-weighted
  cone size, stable tie-break by input order; the other five DESIGN-3.0 §3 axes are honestly NOT
  implemented), `../shared/conventions.md`, `../shared/architecture.md`
- Read: `../knowledge/running-tests.md`
- Read: `docs/superpowers/specs/2026-07-11-reasonable-3.0-p7-frontier-design.md` Decision 6, step 1
- Read: `lib/graph.mjs`'s `servesEdges(atoms, goals)` (in the PURE section, above the T02b I/O marker —
  returns `{from:atomId, to:goalId, edge:'serves'}`; the cone of goal G is every `from` with `to ===
  G.id`)
- Read: `lib/goals.mjs`'s `readGoals` (goal entry shape `{id, scenario, scenarioCitations, ...}` — you
  build fixtures with this shape by hand, no filesystem)
- Read: `lib/next-action.mjs` — the file you are ADDING an export to; do not touch its existing
  `projectDirectives`/`selfCheckDirectives` exports even in your test file's imports (this task tests
  ONLY the new `deriveConeOrder`)
- Read: `test/next-action.test.mjs` (the existing pure-fixture harness style for this file, if it
  covers `projectDirectives` — copy its `check()` pattern, not its specific fixtures)

## Dependencies
- Depends on: Phase B closed (T05c clean — no hard dependency, but sequenced after per the plan's wave
  schedule)
- Depended on by: T06b (implements against these locked tests), T06c (audits them), T07 (reconcile
  wires this deriver in)

## Scope
**Files:**
- Create: `test/next-action-cones.test.mjs`

**BOUNDARY — you MUST NOT modify any files outside this list. In particular, do NOT edit
`lib/next-action.mjs` or `lib/graph.mjs`.**

## Positive Constraints (DO)
- Import `{ deriveConeOrder }` from `../lib/next-action.mjs` — RED here is an assertion failure
  (`deriveConeOrder` is `undefined`), since the file already exists (with `projectDirectives`/
  `selfCheckDirectives`) but has not yet gained this export.
- Cover **cone membership via `servesEdges`**: goals `g1`/`g2` each citing a distinct provider clause,
  atoms whose `deltaClauses` introduce those clauses (and a chain of `needs` citations) — assert
  `slices` correctly attributes each cone's atom ids to the right goal, via the REAL `servesEdges`
  function (do not hand-fake cone membership; build atom/goal fixtures that `servesEdges` genuinely
  walks).
- Cover **the `unlocksCount`-weighted scoring**: two goals with different cone sizes and
  `weights:{unlocksCount:1}` → the larger-cone goal sorts first in `routeOrder`.
- Cover **the neutral default**: an EMPTY `weights` object (or `weights.unlocksCount` absent/
  non-numeric) → `routeOrder` equals the goals' ORIGINAL input order exactly (a stable degenerate
  case, not an arbitrary one).
- Cover **stable tie-breaking**: two goals with EQUAL scores (same cone size, or both zero) preserve
  their original relative order in `routeOrder`.
- Cover **the empty-goals case**: `deriveConeOrder({goals:[], atoms:[], weights:{}})` →
  `{routeOrder:[], slices:[]}`.
- Cover **`slices`' `woIds` is sorted** (deterministic) even when `servesEdges` would return atom ids
  in an arbitrary walk order.

## Negative Constraints (DO NOT)
- Do NOT implement `deriveConeOrder`.
- Do NOT test `projectDirectives`/`selfCheckDirectives` (unchanged, already covered by
  `test/next-action.test.mjs`).
- Do NOT touch the filesystem — pure fixtures only.
- Do NOT modify any file outside Scope.

## Implementation Steps

### Step 1: Write `test/next-action-cones.test.mjs`

```js
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
  const goals = [goal('g1', 'lexer#c1')];
  const atoms = [
    { id: 'a-9', component: 'lexer', state: 'merged', deltaClauses: [{ clauseId: 'lexer#c9', citations: [{ component: 'lexer', clause: 'lexer#c1' }] }] },
    atom('a-1', 'lexer', 'lexer#c1'),
  ];
  const { slices } = deriveConeOrder({ goals, atoms, weights: {} });
  assert.deepStrictEqual(slices[0].woIds, ['a-1', 'a-9']);
});

if (process.exitCode) console.error(`\nnext-action-cones: FAILURES above (${passed} passed).`);
else console.log(`\nnext-action-cones: all ${passed} checks pass. ✓`);
```

### Step 2: Run the test to verify it fails for the right reason

Run: `node test/next-action-cones.test.mjs`

Expected: `FAIL` lines (assertion failures — `deriveConeOrder` is `undefined`), not a module-load error
(`lib/next-action.mjs` already exists with its two other exports).

### Step 3: Commit

```bash
git add test/next-action-cones.test.mjs
git commit -m "test(next-action): lock deriveConeOrder — cone membership, unlocksCount scoring, neutral default (red, P7)" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

## Acceptance Criteria
- [ ] `test/next-action-cones.test.mjs` exists and matches the pure-fixture harness convention exactly
- [ ] Running it fails with assertion failures (not a module-load error)
- [ ] Cone membership (via real `servesEdges`), scoring, the neutral default, stable ties, the
      empty-goals case, and `woIds` sortedness are all covered
- [ ] No filesystem touched; no file outside Scope modified; `lib/next-action.mjs`/`lib/graph.mjs` NOT edited
