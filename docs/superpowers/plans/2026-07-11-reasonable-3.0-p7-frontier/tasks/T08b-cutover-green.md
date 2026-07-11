# Task T08b: migration cutover impl (green) — retire `route.mjs`

**Role:** `green` — remove the `route.json` fallback from `lib/reconcile.mjs` entirely, drop the
`readRoute` import, and **delete `lib/route.mjs` + `test/route.test.mjs`**. This is the subtractive
step — the whole reason the migration ran additive-first.

## References
- Read: `../shared/interfaces.md` §4 (Decision 6 step 5 — "only now, when nothing imports readRoute"),
  `../shared/conventions.md` (migration safety)
- Read: `test/reconcile-next-action.test.mjs` (T08a's rewritten, locked test)
- Read: `lib/reconcile.mjs`'s current Layer-2 block (post-T07b — the `goalsRes`/`routeOrder` branch you
  are simplifying) and its imports block (the `import { readRoute } from './route.mjs';` line to
  remove)
- Read: `lib/route.mjs` (the file you delete) and `test/route.test.mjs` (its test, also deleted)
- Read: `docs/artifacts.md`'s `route.json` entry (T11 marks it retired — not this task; this task only
  touches code)

## Dependencies
- Depends on: T08a (the rewritten test), T07c (Phase C's additive step)
- Depended on by: T08c (audits), T09 (the frontier-wave workflow — built on the final reconcile shape)

## Scope
**Files:**
- Modify: `lib/reconcile.mjs`
- **Delete:** `lib/route.mjs`
- **Delete:** `test/route.test.mjs`

**BOUNDARY — you MUST NOT modify any files outside this list.** Do NOT modify
`test/reconcile-next-action.test.mjs` — locked (T08a). Do NOT touch anything else in
`lib/reconcile.mjs` beyond the named block and import line.

## Positive Constraints (DO)
- Remove the `readRoute` import from `lib/reconcile.mjs`'s imports block entirely.
- Simplify the Layer-2 block: when `goalsRes.goals` is present, compute `routeOrder` via
  `deriveConeOrder` exactly as T07b left it; when absent, `routeOrder` is simply `null` (no fallback
  read of `route.json` — there is no more `route.json` reader in this file). Keep the `goalsRes.diagnostic`
  note, reworded to no longer mention a fallback (there isn't one anymore).
- Delete `lib/route.mjs` and `test/route.test.mjs` (`git rm`).

## Negative Constraints (DO NOT)
- Do NOT delete `lib/route.mjs` before confirming (via `grep -rn "route.mjs" lib/ workflows/
  agents/ skills/` and re-reading `lib/reconcile.mjs`) that nothing else imports it. If anything else
  does, STOP and escalate — do not delete a file something still imports.
- Do NOT touch `docs/artifacts.md`/`docs/glossary.md` (T11's job).
- Do NOT change the per-slice digest / `projSlices` logic below the block you're simplifying.

## Implementation Steps

### Step 1: Confirm nothing else imports `route.mjs` before deleting anything

```bash
grep -rn "route\.mjs" lib/ workflows/ agents/ skills/ hooks/ 2>/dev/null
```

Expected: only `lib/reconcile.mjs`'s own import line (which you are about to remove in Step 2) and
`test/route.test.mjs` (which you delete in Step 4). If anything else appears, STOP — do not proceed
with deletion until that caller is accounted for (it is not expected to exist; this plan's design doc
verified `readRoute`'s only importer is `reconcile.mjs`).

### Step 2: Remove the `readRoute` import

Find and delete this line from `lib/reconcile.mjs`'s imports block:

```js
import { readRoute } from './route.mjs';
```

### Step 3: Simplify the Layer-2 block

Find the block T07b left (the `goalsRes`/`routeOrder` `if`/`else` with the `readRoute` fallback):

```js
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
```

Replace it with:

```js
  // (1) goals.json/cones (reasonable 3.0 Part 7, §12 — the migration's terminus). route.json is
  //     RETIRED: goals.json is the ONLY ratified planning object reconcile reads for slice ordering. An
  //     absent/degraded goals.json degrades the frontier (nextAction omits slice ordering / RETRO /
  //     OPEN) exactly as an absent/degraded route.json used to — it never halts reconcile.
  const goalsRes = readGoals(effortRoot);
  let routeOrder = null;
  if (goalsRes.goals) {
    const policyRes = readPolicy(effortRoot);
    const weights = (policyRes.policy && policyRes.policy.weights) || {};
    const atomsForCones = deriveCurrent(effortRoot).atoms;
    routeOrder = deriveConeOrder({ goals: goalsRes.goals, atoms: atomsForCones, weights }).routeOrder;
  } else if (goalsRes.diagnostic) {
    notes.push(`goals.json degraded (${goalsRes.diagnostic}) → nextAction omits slice ordering (RETRO/OPEN suppressed); WO-level directives + LAND/CONCLUDE unaffected.`);
  }
```

The `graphDivergence` block T07b added directly below stays untouched.

### Step 4: Delete `lib/route.mjs` and `test/route.test.mjs`

```bash
git rm lib/route.mjs test/route.test.mjs
```

### Step 5: Run the locked test to verify it still passes

Run: `node test/reconcile-next-action.test.mjs`

Expected: every check still passes (T08a already rewrote every fixture off `route.json`).

### Step 6: Confirm zero regression to the whole suite

```bash
for t in test/*.test.mjs; do node "$t"; done
```

No `FAIL` line anywhere. `test/route.test.mjs` no longer exists so it is simply absent from the loop —
confirm the loop doesn't error trying to find it (it won't; `for t in test/*.test.mjs` only iterates
files that exist).

### Step 7: Commit

```bash
git add lib/reconcile.mjs
git commit -m "refactor(reconcile): retire route.mjs — goals.json is the only planning object read for slice ordering (green, P7)" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

(The `git rm` in Step 4 stages the deletions; include them in the same commit, or as noted by `git
status` — either way, ensure the deletions land in this task's commit, not left uncommitted.)

## Acceptance Criteria
- [ ] `lib/route.mjs` and `test/route.test.mjs` no longer exist
- [ ] `lib/reconcile.mjs` no longer imports from `./route.mjs`
- [ ] `node test/reconcile-next-action.test.mjs` passes with zero failures
- [ ] The whole existing suite still passes (fewer files now, since `route.test.mjs` is gone); no file
      outside Scope was modified
