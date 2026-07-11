# Task T08a: migration cutover — rewrite the route-coupled test (red)

**Role:** `red` — rewrite `test/reconcile-next-action.test.mjs` so every fixture seeds `goals.json`
instead of `route.json`, preserving every check's INTENT. This is the last thing standing between
`lib/route.mjs` and deletion.

> **Grounding note.** `test/next-action.test.mjs` does **NOT** need rewriting — verified by grep, it
> feeds `routeOrder` as a plain fixture value to the pure `projectDirectives` and never touches
> `route.json`/`readRoute` at all. `test/reconcile-next-action.test.mjs` and `test/route.test.mjs` (the
> latter deleted whole in T08b) are the **only** two files in the repo that reference `route.json` or
> `readRoute` (grepped). Do not touch any other test file in this task.

## References
- Read: `../shared/interfaces.md` §4 (the scoping boundary), `../shared/conventions.md` (migration
  safety — this task's whole point is closing the transition window)
- Read: `test/reconcile-next-action.test.mjs` **in full** — every check, not just the ones excerpted
  below — you are rewriting the WHOLE file's fixtures
- Read: `test/reconcile-cones-projection.test.mjs` (T07a — the `goals`/`policy` param pattern already
  added to a sibling `newEffort()` helper; copy the same param-handling shape into THIS file's
  `newEffort()`)
- Read: `lib/goals.mjs`'s `readGoals` (goal entry shape) — an empty `scenarioCitations: []` is fine for
  every check here, since none of them assert cone-based prioritization; they only need the goal **id**
  to equal the slice id already used in each fixture's `verticalSlice`/`route.slices`

## Dependencies
- Depends on: T07c (Phase C's additive step must be sound first)
- Depended on by: T08b (implements against this rewritten test), T08c (audits it)

## Scope
**Files:**
- Modify: `test/reconcile-next-action.test.mjs`

**BOUNDARY — you MUST NOT modify any files outside this list. In particular, do NOT touch
`test/next-action.test.mjs` (unaffected — see the grounding note), `lib/reconcile.mjs`, or
`lib/route.mjs`.**

## Positive Constraints (DO)
- Add a `goals` param to the file's `newEffort({...})` helper, writing `.reasonable/goals.json` when
  provided (mirror T07a's pattern: `if (goals !== undefined) write(root, '.reasonable/goals.json',
  JSON.stringify(goals, null, 2) + '\n');`).
- **For every check whose fixture currently sets `route: {slices:[...]}`**, replace it with an
  equivalent `goals: [...]` array — one entry per slice id named in the old `route.slices`, each
  `{id: '<the slice id>', scenario: '<slice id> scenario', scenarioCitations: []}` — and **remove the
  `route` param from that call entirely**. Two worked examples (apply the identical pattern to every
  other check in the file):

  **Check 1** (today):
  ```js
  route: { slices: ['slice-1'], ratifiedAt: null, ledgerSeq: null },
  ```
  becomes:
  ```js
  goals: [{ id: 'slice-1', scenario: 'slice-1 scenario', scenarioCitations: [] }],
  ```

  **Check 2** (today):
  ```js
  route: { slices: ['slice-1'] },
  ```
  becomes:
  ```js
  goals: [{ id: 'slice-1', scenario: 'slice-1 scenario', scenarioCitations: [] }],
  ```

- **The one check that currently sets `route: null`** (the "pre-route, pre-dependsOn" forward-compat
  check) — leave it with **no `goals` param at all** (goals absent, same as route absent): this check's
  whole point is "neither ordering artifact exists yet," and that intent is unchanged post-cutover.
- After editing, run `grep -n "route" test/reconcile-next-action.test.mjs` and confirm the only
  remaining matches are in prose/comments (e.g. a comment explaining the historical `route.json`
  concept), never a `route:` fixture param or a `route.json` file write.

## Negative Constraints (DO NOT)
- Do NOT change any check's ASSERTIONS — only the fixture's ordering-artifact param. Every check must
  still test the exact same DISPATCH/DECIDE/RETRO behavior it did before.
- Do NOT touch `test/next-action.test.mjs`.
- Do NOT implement the `lib/reconcile.mjs` cutover (T08b) or delete `lib/route.mjs` (also T08b).
- Do NOT add a `policy` param/`policy.json` write unless a specific check's weights actually matter (none
  do here — every fixture has one slice/goal, so ordering is trivial and `weights` defaulting to `{}` is
  fine).

## Implementation Steps

### Step 1: Add `goals` support to the file's `newEffort()` helper

Find the `newEffort({...})` function in `test/reconcile-next-action.test.mjs`. Add a `goals` parameter
to its destructured argument list and, alongside the existing `if (route) write(root,
'.reasonable/route.json', ...)` line, add:

```js
if (goals !== undefined) write(root, '.reasonable/goals.json', JSON.stringify(goals, null, 2) + '\n');
```

Leave the existing `route` writing line in place for now (T08b removes the `route.json` READ path from
`reconcile.mjs`; the WRITE helper staying harmless in this test file until every fixture no longer
passes a `route` param is fine — but per the constraint above, no fixture should be passing `route`
anymore after this task, so the line becomes dead code you may leave or remove at your discretion, as
long as no test relies on it after your edits).

### Step 2: Replace every `route: {...}` fixture with an equivalent `goals: [...]`

Walk the file top to bottom. For each `check(...)` call, find its `route: {...}` (or `route: null`)
line inside the `newEffort({...})` call and apply the transformation shown in Positive Constraints
above. Do this for **every** check in the file — there is no partial-migration state; a single
remaining `route:` fixture (other than the one forward-compat `route: null` case, converted to no
`goals` param at all) is a task failure.

### Step 3: Run the file to confirm every check still passes against TODAY's code

Run: `node test/reconcile-next-action.test.mjs`

Expected: **every check still passes** — this file is not RED-by-construction (its intent is unchanged;
only the ordering-artifact source changed), because T07b already wired `reconcile()` to read
`goals.json` when present and prefer it. If any check fails, your `goals` fixture does not correctly
reproduce the old `route.json`'s ordering for that check — fix it (check the goal id matches the slice
id used in `verticalSlice`/assertions exactly).

### Step 4: Confirm `route` is no longer referenced meaningfully

```bash
grep -n "route" test/reconcile-next-action.test.mjs
```

Expected: no `route:` fixture parameter remains (comments/prose mentioning "route" historically are
fine).

### Step 5: Commit

```bash
git add test/reconcile-next-action.test.mjs
git commit -m "test(reconcile): migrate reconcile-next-action's fixtures from route.json to goals.json (red-for-the-cutover, P7)" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

## Acceptance Criteria
- [ ] Every fixture in `test/reconcile-next-action.test.mjs` seeds `goals.json` (or nothing, for the one
      forward-compat case) — none seed `route.json` anymore
- [ ] Running the file passes every check against TODAY's code (T07b's fallback logic already makes
      this true; T08a is a rewrite, not a new-behavior test)
- [ ] `grep -n "route" test/reconcile-next-action.test.mjs` shows no fixture param, only prose (if any)
- [ ] `test/next-action.test.mjs` was NOT touched
- [ ] No file outside Scope modified; `lib/reconcile.mjs`/`lib/route.mjs` NOT edited
