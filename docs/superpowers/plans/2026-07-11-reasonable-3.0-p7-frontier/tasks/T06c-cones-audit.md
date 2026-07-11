# Task T06c: goals/cones deriver audit

**Role:** `audit` — adversarially audit the T06 tests and implementation. **Read-only** on `lib/` and
`test/`: you report findings; you do not fix.

## References
- Read: `../shared/interfaces.md` §3, `../shared/conventions.md`
- Read: `lib/next-action.mjs` (the whole file, post-T06b), `test/next-action-cones.test.mjs`,
  `lib/graph.mjs`'s `servesEdges`

## Dependencies
- Depends on: T06b
- Depended on by: T07 (reconcile wires this deriver in — must be sound first)

## What to check (report each as PASS / FINDING)

1. **Discriminator (teeth).** Confirm each `check()` fails against a stub `deriveConeOrder` that always
   returns `{routeOrder: goals.map(g=>g.id), slices: goals.map(g=>({id:g.id, woIds:[]}))}` (must fail
   the cone-membership and larger-cone-first tests) and one that always reverses the goal array (must
   fail the neutral-default and stable-tie-break tests).
2. **The cone direction is correct, and verified against the REAL `servesEdges`, not a re-derivation.**
   Confirm the "larger cone" fixture's dependency direction matches how `servesEdges` actually walks
   (provider-closure via the provider's OWN `needs`, not upward to its consumers) — re-trace
   `servesEdges`'s `while (stack.length)` loop by hand against the fixture in
   `test/next-action-cones.test.mjs` and confirm the claimed cone membership (`['a-2','a-3']` for g2)
   is what the real function produces, not what the test AUTHOR assumed.
3. **The neutral default is honest, not merely coincidental.** Confirm the "empty weights" test uses a
   fixture where the cones are DEMONSTRABLY unequal in size (so a buggy always-descending-by-cone-size
   implementation would fail it) — a neutral-default test over EQUAL-size cones wouldn't catch a
   scoring bug that ignores the weights gate entirely.
4. **Stable sort is real.** Confirm the tie-break test uses THREE goals (not two) with equal scores, so
   an implementation that merely swaps a pair on ties would still be caught by a 3-way permutation
   check.
5. **Only `unlocksCount` is implemented, and this is stated, not silently assumed.** Confirm neither the
   implementation nor the tests invent scoring for the other five DESIGN-3.0 §3 axes
   (integration-risk, info-gain, goal-proximity, staleness, cost) — grep the implementation for any
   reference to those axis names; there should be none.
6. **Purity + no regression.** Confirm `deriveConeOrder` does no I/O, and `projectDirectives`/
   `selfCheckDirectives` are byte-for-byte unchanged (diff against the pre-T06b file if available, or
   re-run `test/next-action.test.mjs` and confirm it is still 100% green).

## Deliverable
A short report: each check PASS or a specific FINDING (file:line + the missing case). Gap findings
become new `red` tasks (`T06d-*-hardening-red.md`) before T07. If everything passes, say so plainly.

## Acceptance Criteria
- [ ] All six checks reported PASS or FINDING with evidence
- [ ] No file was modified (read-only audit)
- [ ] Any FINDING is written as a concrete, actionable new `red` task
