# Task T08c: cutover audit (Phase C closeout) — teeth on "nothing imports route.mjs"

**Role:** `audit` — adversarially audit the T08 tests and implementation, with extra teeth on "nothing
imports route.mjs." **Read-only** on `lib/` and `test/`.

## References
- Read: `../shared/interfaces.md` §4 (Decision 6, all five steps), `../shared/conventions.md`
- Read: `lib/reconcile.mjs` (the final Layer-2 shape), `test/reconcile-next-action.test.mjs` (the
  rewritten file), confirm `lib/route.mjs`/`test/route.test.mjs` no longer exist

## Dependencies
- Depends on: T08b
- Depended on by: T11 (docs), T09 (the workflow — built on the final reconcile shape)

## What to check (report each as PASS / FINDING)

1. **`route.mjs` is genuinely gone and genuinely unreferenced.** Confirm the files do not exist
   (`ls lib/route.mjs test/route.test.mjs` should both fail). Run
   `grep -rn "route\.mjs\|readRoute" lib/ workflows/ agents/ skills/ hooks/ test/ docs/superpowers/` and
   confirm the ONLY remaining hits are historical prose (e.g. this plan's own docs, `docs/artifacts.md`
   before T11 updates it) — zero live code references.
2. **No test in the file was weakened, only re-sourced.** Diff `test/reconcile-next-action.test.mjs`'s
   assertions against its pre-T08a shape (or re-read T08a's task file) — confirm every check still
   asserts the SAME DISPATCH/DECIDE/RETRO/self-check behavior, just fed by `goals.json` instead of
   `route.json`. A rewrite that quietly dropped an assertion (e.g. the redispatch-guard DECIDE check) is
   a finding.
3. **The forward-compat check's intent survived.** Confirm the "pre-route, pre-dependsOn" check (now
   "pre-goals, pre-dependsOn") still asserts a lone pending WO dispatches with `dependsOn` defaulted —
   confirm it seeds NEITHER `route.json` NOR `goals.json`, matching its original intent (an effort with
   no ordering artifact at all must still reconcile).
4. **The Layer-2 block is genuinely simplified, not just papered over.** Confirm there is no residual
   dead code (an unreachable `else` branch, an orphaned `routeRes` variable) — the block should read
   cleanly as "goals present → cones; else → null," nothing else.
5. **`test/next-action.test.mjs` was never touched.** Confirm via `git log`/`git diff` (or simply
   re-reading the file) that this task correctly recognized it needed no changes (the grounding note
   T08a's task carried).
6. **The whole suite is green**, and specifically the file count dropped by exactly one (`route.test.mjs`
   removed) with no other file disappearing unexpectedly.
7. **Phase C as a whole (closeout).** Re-read `lib/next-action.mjs`/`lib/reconcile.mjs`'s final shape
   top to bottom: confirm `deriveConeOrder` (T06), the goals/cones selection + divergence surfacing
   (T07), and the route retirement (T08) compose into one coherent, additive-then-subtractive migration
   with no orphaned code from any intermediate step.

## Deliverable
A short report: each check PASS or a specific FINDING (file:line + the missing case). Gap findings
become new `red` tasks (`T08d-*-hardening-red.md`) before Phase D. If everything passes, say so plainly
and **explicitly confirm Phase C (the whole 2.x→3.0 migration) is closed and sound**.

## Acceptance Criteria
- [ ] All seven checks reported PASS or FINDING with evidence
- [ ] No file was modified (read-only audit)
- [ ] Any FINDING is written as a concrete, actionable new `red` task
- [ ] The report states plainly whether Phase C is sound and ready for Phase D
