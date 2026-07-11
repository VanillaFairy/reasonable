# Task T03c: `requiredRoles` audit (Phase A closeout)

**Role:** `audit` — adversarially audit the T03 tests and implementation, AND confirm Phase A
(`lib/frontier.mjs` as a whole — `gateDue`, `ready`, `pack`, `requiredRoles`) is internally sound before
Phase B begins. **Read-only** on `lib/` and `test/`: you report findings; you do not fix.

## References
- Read: `../shared/interfaces.md` (all of §1), `../shared/conventions.md`, `../shared/architecture.md`
  (the STOP note before Phase B)
- Read: `lib/frontier.mjs` **in full** (all three sections), `lib/ceremony.mjs`, `test/frontier-roles.test.mjs`

## Dependencies
- Depends on: T03b
- Depended on by: T04 (Phase B cannot begin until this audit is clean AND the pivotal call is confirmed
  — see the plan's STOP note)

## What to check (report each as PASS / FINDING)

1. **Discriminator (teeth).** Confirm no `check()` in `test/frontier-roles.test.mjs` would pass against
   a stub `requiredRoles` that always returns `CORE_ROLES` regardless of `context` (must fail every
   conditional-role test) or one that always returns all seven roles (must fail the "core only" and
   both negative brownfield tests).
2. **Both AND-halves of the brownfield gate are load-bearing.** Confirm distinct tests exist for
   `brownfield:true, brownfieldInput:[]` (no roles added) and `brownfield:false,
   brownfieldInput:['x']` (no roles added) — a test suite that only tests the positive case can't tell
   which half of the AND is real.
3. **Reuse, not re-derivation.** Confirm `requiredRoles` calls the imported `rechartingDegenerates`/
   `retroClassificationDegenerates` rather than reimplementing an `amendmentBatch.length > 0` /
   `landedConeCount >= 2` check inline — the point of Decision 10 is one source of truth for the
   degeneration predicate.
4. **Sortedness is asserted honestly.** Confirm the sortedness test compares against a **literal**
   pre-sorted array, not `actual.slice().sort()` compared to itself (which would trivially always pass).
5. **Phase A as a whole (closeout).** Re-read `lib/frontier.mjs` top to bottom: confirm the three
   sections (`gateDue`, `ready`/`pack`, `requiredRoles`) are cleanly disjoint (no section edits another's
   code), the file has exactly one import block per section (T01: none; T02: `footprintsDisjoint`; T03:
   the two ceremony predicates), and nothing in the whole file does I/O, reads `Date`/`Math.random`, or
   imports anything not named in `../shared/interfaces.md`.
6. **The whole suite is green**, including `test/footprint-disjoint.test.mjs`'s CLI-guard regression
   check (confirm it still passes — a later task must never silently reintroduce the unguarded CLI).

## Deliverable
A short report: each check PASS or a specific FINDING. Gap findings become new `red` tasks
(`T03d-*-hardening-red.md`) before Phase B. If everything passes, say so plainly, and **explicitly
confirm Phase A is closed and sound** — this is the gate the plan's STOP note (confirm the pivotal call
before Phase B) sits behind.

## Acceptance Criteria
- [ ] All six checks reported PASS or FINDING with evidence
- [ ] No file was modified (read-only audit)
- [ ] Any FINDING is written as a concrete, actionable new `red` task
- [ ] The report states plainly whether Phase A is sound and ready for Phase B (pending the separate
      human confirmation of the pivotal call)
