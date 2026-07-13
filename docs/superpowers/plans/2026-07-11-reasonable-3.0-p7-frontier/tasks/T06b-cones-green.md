# Task T06b: goals/cones order deriver impl (green)

**Role:** `green` — add `deriveConeOrder` to `lib/next-action.mjs`. Implement exactly what the locked
test requires; do not modify any test file.

## References
- Read: `../shared/interfaces.md` §3 **in full**, `../shared/conventions.md`
- Read: `test/next-action-cones.test.mjs` (T06a's locked test)
- Read: `lib/next-action.mjs` **in full** — you are ADDING to this file; its existing
  `projectDirectives`/`selfCheckDirectives` exports and their behavior must be byte-identical after
  this task
- Read: `lib/graph.mjs`'s `servesEdges` export (in the PURE section — you import it)

## Dependencies
- Depends on: T06a (locked test)
- Depended on by: T06c (audits), T07 (reconcile wires this deriver in)

## Scope
**Files:**
- Modify: `lib/next-action.mjs`

**BOUNDARY — you MUST NOT modify any files outside this list.** Do NOT modify
`test/next-action-cones.test.mjs` — locked. Do NOT touch `projectDirectives`, `selfCheckDirectives`, or
any of their existing helper code in this file. Do NOT edit `lib/graph.mjs`.

## Positive Constraints (DO)
- Add `import { servesEdges } from './graph.mjs';` at the top of the file.
- Add `export function deriveConeOrder({ goals = [], atoms = [], weights = {} } = {})` exactly per
  `../shared/interfaces.md` §3: compute cone membership via `servesEdges(atoms, goals)`, score each
  goal `(weights.unlocksCount is a finite number ? weights.unlocksCount : 0) * coneSize`, sort
  descending with a STABLE tie-break on original input order, and return `{routeOrder, slices}` with
  `slices[].woIds` sorted.
- This is a pure ADDITION — append it as a new export at the end of the file (or wherever fits
  cleanly); do not restructure existing code around it.

## Negative Constraints (DO NOT)
- Do NOT modify `projectDirectives` or `selfCheckDirectives`.
- Do NOT do any I/O inside `deriveConeOrder` — it is pure over its arguments.
- Do NOT invent scoring for the other five DESIGN-3.0 §3 axes (integration-risk, info-gain,
  goal-proximity, staleness, cost) — only `unlocksCount` (cone-size proxy) is implemented, named
  honestly in a comment.

## Implementation Steps

### Step 1: Add the import

Add near the top of `lib/next-action.mjs` (after its file-header comment, before its first function):

```js
import { servesEdges } from './graph.mjs';
```

### Step 2: Append `deriveConeOrder`

Add at the end of the file:

```js
// ── deriveConeOrder — the goals/cones frontier order (DESIGN-3.0 §3; reasonable 3.0 Part 7) ────────
//
// PURE, exactly like projectDirectives above: reconcile does the disk reads (readGoals/deriveCurrent/
// readPolicy) and hands this function {goals, atoms, weights}. Produces the SAME routeOrder/slices
// shape projectDirectives already consumes — only the INPUT to the projection changes, not the
// projection itself.
//
// Of DESIGN-3.0 §3's six priority axes (integration-risk, expected information gain, unlocks-count,
// goal proximity, staleness pressure, cost), only unlocks-count has a computable proxy from these
// inputs alone: a goal's CONE SIZE (how many atoms its completion carries toward green). The other
// five need telemetry (blast-radius history, staleness timestamps, cost estimates) this function does
// not have access to — NOT implemented, named here rather than faked. An absent/non-numeric
// weights.unlocksCount degrades to 0 for every goal, which — combined with the stable sort below —
// yields the honest neutral default: the ORIGINAL goal order, unchanged.

/**
 * @param {{ goals: Array<{id,scenario,scenarioCitations}>, atoms: Array, weights: object }} inputs
 * @returns {{ routeOrder: string[], slices: Array<{id, woIds: string[]}> }}
 */
export function deriveConeOrder({ goals = [], atoms = [], weights = {} } = {}) {
  if (!goals.length) return { routeOrder: [], slices: [] };

  const edges = servesEdges(atoms, goals); // {from:atomId, to:goalId, edge:'serves'}
  const coneOf = new Map(goals.map((g) => [g.id, new Set()]));
  for (const e of edges) {
    const cone = coneOf.get(e.to);
    if (cone) cone.add(e.from);
  }

  const unlocksWeight = typeof weights.unlocksCount === 'number' ? weights.unlocksCount : 0;
  const scored = goals.map((g, idx) => ({
    id: g.id,
    idx,
    score: unlocksWeight * (coneOf.get(g.id) || new Set()).size,
  }));
  // Stable sort: descending score, ties broken by ORIGINAL input order (idx ascending).
  scored.sort((a, b) => (b.score - a.score) || (a.idx - b.idx));

  return {
    routeOrder: scored.map((s) => s.id),
    slices: goals.map((g) => ({ id: g.id, woIds: [...(coneOf.get(g.id) || [])].sort() })),
  };
}
```

### Step 3: Run the locked test to verify it passes

Run: `node test/next-action-cones.test.mjs`

Expected: `next-action-cones: all <N> checks pass. ✓`, zero `FAIL` lines.

### Step 4: Confirm zero regression to the whole suite

```bash
for t in test/*.test.mjs; do node "$t"; done
```

No `FAIL` line anywhere, in particular `test/next-action.test.mjs` (the existing
`projectDirectives`/`selfCheckDirectives` tests) unaffected.

### Step 5: Commit

```bash
git add lib/next-action.mjs
git commit -m "feat(next-action): add deriveConeOrder — the goals/cones frontier order (green, P7)" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

## Acceptance Criteria
- [ ] `node test/next-action-cones.test.mjs` passes with zero failures
- [ ] `projectDirectives`/`selfCheckDirectives` are byte-identical to before this task
- [ ] `deriveConeOrder` does no I/O and imports only `servesEdges` from `./graph.mjs`
- [ ] The whole existing suite still passes; no file outside Scope was modified
