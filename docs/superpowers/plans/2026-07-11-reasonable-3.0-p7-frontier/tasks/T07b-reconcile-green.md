# Task T07b: reconcile goals/cones projection impl (green)

**Role:** `green` — extend `lib/reconcile.mjs`'s Layer-2 block to select the goals/cones order when
`goals.json` is present, falling back to `route.json`, and surface graph divergence. Implement exactly
what the locked tests require; do not modify any test file.

## References
- Read: `../shared/interfaces.md` §4 **in full**, `../shared/conventions.md` (migration safety)
- Read: `test/reconcile-cones-projection.test.mjs` (T07a's locked tests)
- Read: `lib/reconcile.mjs` **the Layer-2 block, exactly** (the `readRoute`/`routeOrder`/`notes.push`
  lines you are replacing) — do not touch anything else in this large file
- Read: `lib/goals.mjs`'s `readGoals`, `lib/policy.mjs`'s `readPolicy`, `lib/next-action.mjs`'s
  `deriveConeOrder` (T06), `lib/graph.mjs`'s `deriveCurrent`/`graphDivergence`

## Dependencies
- Depends on: T07a (locked tests), T06b (`deriveConeOrder`), T05c (Phase B closed)
- Depended on by: T07c (audits), T08 (the subtractive cutover)

## Scope
**Files:**
- Modify: `lib/reconcile.mjs`

**BOUNDARY — you MUST NOT modify any files outside this list.** Do NOT modify
`test/reconcile-cones-projection.test.mjs` — locked. Do NOT touch any other part of
`lib/reconcile.mjs` beyond the Layer-2 block named below. Do NOT edit `lib/route.mjs` (kept as the
fallback — deleted only in T08), `lib/goals.mjs`, `lib/policy.mjs`, `lib/next-action.mjs`, or
`lib/graph.mjs`.

## Positive Constraints (DO)
- Add `readGoals` (from `./goals.mjs`), `readPolicy` (from `./policy.mjs`), `deriveConeOrder` (from
  `./next-action.mjs`, alongside the existing `projectDirectives, selfCheckDirectives` import), and
  `deriveCurrent, graphDivergence` (from `./graph.mjs`) to the imports block.
- Replace the Layer-2 block's `readRoute`/`routeOrder` computation with: **when
  `readGoals(effortRoot).goals` is non-null**, compute `routeOrder` via `deriveConeOrder` fed by
  `deriveCurrent(effortRoot).atoms` and `readPolicy(effortRoot).policy?.weights`; **otherwise**, keep
  the exact pre-existing `readRoute` path (including its diagnostic note), unchanged.
- Add a `graphDivergence(effortRoot)` call whose non-empty result pushes ONE summary note (never
  silently absorbed — §2.4).
- `projSlices`/`sliceOrder`/the self-check's `routeSlices` input are **untouched** — they already
  consume whatever `routeOrder` resolves to, from either path.

## Negative Constraints (DO NOT)
- Do NOT rewrite `projSlices`'s WO-grouping logic (out of scope — `../shared/interfaces.md` §4's
  flagged scoping boundary).
- Do NOT remove the `readRoute` import or delete `lib/route.mjs` — that is T08's subtractive step.
- Do NOT change `projectDirectives`/`selfCheckDirectives`'s signatures or call sites beyond feeding
  them the new `routeOrder` value.

## Implementation Steps

### Step 1: Add the new imports

Find the existing import line for `next-action.mjs`:

```js
import { projectDirectives, selfCheckDirectives } from './next-action.mjs';
```

Change it to:

```js
import { projectDirectives, selfCheckDirectives, deriveConeOrder } from './next-action.mjs';
```

Add three new import lines near it (grouped with the other `lib/` imports):

```js
import { readGoals } from './goals.mjs';
import { readPolicy } from './policy.mjs';
import { deriveCurrent, graphDivergence } from './graph.mjs';
```

### Step 2: Replace the Layer-2 route/goals selection

Find:

```js
  // (1) route.json — the ratified vertical-slice ORDER (readRoute is conservative: absent → null, a
  //     broken file → a surfaced diagnostic, never a crash). A present diagnostic degrades the
  //     frontier (nextAction omits slice ordering / RETRO / OPEN); it never halts reconcile.
  const routeRes = readRoute(effortRoot);
  const routeOrder = routeRes.route ? routeRes.route.slices : null;
  if (routeRes.diagnostic) {
    notes.push(`route.json degraded (${routeRes.diagnostic}) → nextAction omits slice ordering (RETRO/OPEN suppressed); WO-level directives + LAND/CONCLUDE unaffected.`);
  }
```

Replace it with:

```js
  // (1) goals.json/cones (reasonable 3.0 Part 7, §12) — when goals.json is present, the frontier order
  //     is DERIVED from the goal cones (deriveConeOrder), not read from route.json. route.json stays
  //     the fallback for an effort that has not yet re-genesised under 3.0 (readRoute is conservative:
  //     absent → null, a broken file → a surfaced diagnostic, never a crash). A present diagnostic on
  //     EITHER path degrades the frontier (nextAction omits slice ordering / RETRO / OPEN); neither
  //     ever halts reconcile.
  const goalsRes = readGoals(effortRoot);
  let routeOrder;
  if (goalsRes.goals) {
    const policyRes = readPolicy(effortRoot);
    const weights = (policyRes.policy && policyRes.policy.weights) || {};
    const atomsForCones = deriveCurrent(effortRoot).atoms;
    routeOrder = deriveConeOrder({ goals: goalsRes.goals, atoms: atomsForCones, weights }).routeOrder;
  } else {
    if (goalsRes.diagnostic) {
      notes.push(`goals.json degraded (${goalsRes.diagnostic}) → falling back to route.json for slice ordering.`);
    }
    const routeRes = readRoute(effortRoot);
    routeOrder = routeRes.route ? routeRes.route.slices : null;
    if (routeRes.diagnostic) {
      notes.push(`route.json degraded (${routeRes.diagnostic}) → nextAction omits slice ordering (RETRO/OPEN suppressed); WO-level directives + LAND/CONCLUDE unaffected.`);
    }
  }

  // §2.4: divergence between the as-lived and current graph projections is COMPUTED and SURFACED,
  // never silently absorbed — a retopology-pressure note at the next gate, not a repair.
  const divergence = graphDivergence(effortRoot);
  const divergenceCount = divergence.nodesOnlyAsLived.length + divergence.nodesOnlyCurrent.length
    + divergence.edgesOnlyAsLived.length + divergence.edgesOnlyCurrent.length;
  if (divergenceCount > 0) {
    notes.push(`retopology pressure: as-lived vs current graph diverge (${divergenceCount} entr${divergenceCount === 1 ? 'y' : 'ies'}) — see graphDivergence for detail.`);
  }
```

Every line below this block (the per-slice digest, `projectDirectives` call, self-check) is **unchanged**
— it already consumes `routeOrder` generically, from whichever path produced it.

### Step 3: Run the locked test to verify it passes

Run: `node test/reconcile-cones-projection.test.mjs`

Expected: `reconcile-cones-projection: all <N> checks passed. ✓`, zero `FAIL` lines.

### Step 4: Confirm zero regression to the whole suite

```bash
for t in test/*.test.mjs; do node "$t"; done
```

No `FAIL` line anywhere — in particular EVERY existing `reconcile-*.test.mjs` file (this is a
large, heavily-tested live-engine file; treat any regression as stop-the-line).

### Step 5: Commit

```bash
git add lib/reconcile.mjs
git commit -m "feat(reconcile): select the goals/cones frontier order when goals.json is present, surfacing graph divergence (green, P7)" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

## Acceptance Criteria
- [ ] `node test/reconcile-cones-projection.test.mjs` passes with zero failures
- [ ] `goals.json` present ⇒ cone-derived `routeOrder`; absent ⇒ the exact pre-existing `route.json`
      path, byte-identical
- [ ] `graphDivergence` is called and surfaces exactly one summary note when non-empty
- [ ] The whole existing suite still passes; no file outside Scope was modified
