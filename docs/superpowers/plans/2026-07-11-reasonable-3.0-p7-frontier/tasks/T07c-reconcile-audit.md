# Task T07c: reconcile goals/cones projection audit

**Role:** `audit` — adversarially audit the T07 tests and implementation, with extra teeth on "green
with route AND with goals." **Read-only** on `lib/` and `test/`.

## References
- Read: `../shared/interfaces.md` §4 (in full, including the flagged scoping boundary),
  `../shared/conventions.md`
- Read: `lib/reconcile.mjs` (the Layer-2 diff), `test/reconcile-cones-projection.test.mjs`

## Dependencies
- Depends on: T07b
- Depended on by: T08 (the subtractive cutover — must build on a sound additive step)

## What to check (report each as PASS / FINDING)

1. **Discriminator (teeth) on the priority claim.** By hand, verify the first check's fixture: trace
   `servesEdges`'s walk against the seeded ledger and confirm g-a's cone really is `{a-5, a-7}` (size 2)
   and g-b's is `{a-3}` (size 1), so the expected `['g-a','g-b']` is the TRUE cone-derived order, and it
   TRULY contradicts `route.json`'s `['g-b','g-a']`. A test whose "override" claim is actually a
   coincidence (both paths agreeing) is a finding — this exact defect existed in an earlier draft of
   this task; confirm it was caught and fixed.
2. **"Green with route AND with goals" is genuinely exercised.** Confirm a test exists with BOTH
   `route.json` and `goals.json` present (the priority-override check) — not just one-or-the-other —
   and that the implementation reads `readGoals` FIRST, falling to `readRoute` only in the `else`
   branch (not, e.g., some merge of the two).
3. **The fallback triggers are both covered.** Confirm distinct tests exist for (a) `goals.json`
   entirely ABSENT and (b) `goals.json` PRESENT BUT MALFORMED — both must fall back to `route.json`
   identically; a test suite covering only (a) would miss a diagnostic-handling bug in (b).
4. **No regression to the WO-grouping/RETRO/OPEN machinery.** Confirm `projSlices`/`sliceOrder`/the
   self-check's `routeSlices` input were not touched beyond receiving the new `routeOrder` value — diff
   the Layer-2 block against its pre-T07 shape (or re-read `../shared/interfaces.md` §4's scoping
   boundary and confirm the implementation respects it).
5. **`graphDivergence` is surfaced, never silently absorbed, and never over-fires.** Confirm the note
   only appears when the divergence counts sum to > 0, and that a fresh/degenerate effort (as-lived ==
   current, the common case) produces NO spurious note. If T07a's test suite could not cheaply force a
   genuine divergence (a documented `// KNOWN LIMIT`), confirm this is a REASONABLE limit (constructing
   one requires hand-editing a contract file outside the pipeline, per §2.4's own example) rather than a
   skipped requirement — and note whether a later task (T08 or a hardening pass) should close it.
6. **Purity/scope.** Confirm `lib/route.mjs` was NOT modified or deleted (T08's job), and
   `lib/goals.mjs`/`lib/policy.mjs`/`lib/next-action.mjs`/`lib/graph.mjs` were only imported from.
7. **The whole suite is green**, including every pre-existing `reconcile-*.test.mjs` file — this is the
   highest-traffic file in the plugin; regressions here are the most consequential in the whole part.

## Deliverable
A short report: each check PASS or a specific FINDING (file:line + the missing case). Gap findings
become new `red` tasks (`T07d-*-hardening-red.md`) before T08. If everything passes, say so plainly and
name the discriminator evidence for check 1 specifically (the priority-override claim is this task's
most important single assertion).

## Acceptance Criteria
- [ ] All seven checks reported PASS or FINDING with evidence
- [ ] No file was modified (read-only audit)
- [ ] Any FINDING is written as a concrete, actionable new `red` task
- [ ] The `graphDivergence` KNOWN LIMIT (if any) is explicitly assessed as reasonable or flagged for
      follow-up
