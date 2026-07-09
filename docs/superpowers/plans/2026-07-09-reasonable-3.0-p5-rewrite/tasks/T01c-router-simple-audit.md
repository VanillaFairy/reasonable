# Task T01c: T01 audit

**Role:** `audit` — adversarially audit the T01 tests and implementation. **Read-only** on `lib/` and
`test/`: you report findings; you do not fix. Any gap you find becomes a new `red` task.

## References
- Read: `../shared/interfaces.md`, `../shared/conventions.md`
- Read: `docs/superpowers/specs/2026-07-09-reasonable-3.0-p5-rewrite-design.md` (Decisions 2, 4, 5,
  6 — the intent the tests should pin)
- Read: `lib/rewrite.mjs` (T01 section), `test/rewrite-router.test.mjs`,
  `test/rewrite-simple-verdicts.test.mjs`

## Dependencies
- Depends on: T01b
- Depended on by: T04

## What to check (report each as PASS / FINDING)

1. **Discriminator (teeth).** Confirm the tests genuinely fail without the implementation: check out
   `lib/rewrite.mjs` at its non-existent pre-T01b state (e.g. `git stash` the file, or inspect the
   T01a red-run record) and confirm every `check()` depends on real behavior, not a tautology. A test
   that would pass against an empty `computeVerdictEffects` stub is a finding.
2. **Totality is real (§7.2).** The router HALTs on an unknown kind, a missing kind, AND a
   rule-level error (illegal transition). Confirm all three paths are tested and that the router does
   not silently return `{ok:true, provisional:[]}` for any of them.
3. **Effect validity.** Every rule's `provisional`/`permanent` output passes `validateEffects`
   (asserted in the tests, not just assumed). Confirm no effect carries an `undefined` `change`
   property that a `JSON.stringify` round-trip would drop (the conventions gotcha).
4. **Transitions are validated legal.** R1/R4/R9 each route their `{state}` effect through
   `isValidTransition` and HALT on an illegal move — confirm the merged-atom HALT test actually
   exercises this, and that no rule emits a hard-coded state without checking legality.
5. **The ladder is mechanical, not prose.** `routeRefutedPremise` returns exactly one of the five
   route strings for each layer, and the seam (`topologist-recut`) vs single (`amendment`) split is
   driven by the real citation-closure count — confirm both branches are tested with distinct
   fixtures.
6. **Intent, not implementation.** The tests assert the *contract* (the exact effects a verdict must
   produce), not incidental internals. Flag any test that pins an internal helper name or an
   accidental key ordering.
7. **Purity.** No test touches the filesystem; `lib/rewrite.mjs` imports nothing from `ledger`/`fs`.

## Deliverable
A short report: each check PASS or a specific FINDING (file:line + the missing case). Gap findings
become new `red` tasks appended to this plan (a `T01d-*` hardening task) before T04. If everything
passes, say so plainly and note the discriminator evidence you saw.

## Acceptance Criteria
- [ ] All seven checks reported PASS or FINDING with evidence
- [ ] No file was modified (read-only audit)
- [ ] Any FINDING is written as a concrete, actionable new `red` task
