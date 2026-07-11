# Task T04f: ceremony-escalation stacking audit — Phase B's second STOP gate

**Role:** `audit` — adversarially audit the T04d/T04e tests and implementation. **Read-only** on
`lib/` and `test/`: you report findings; you do not fix. This audit's PASS/FAIL determination gates
whether T05a may proceed — a FINDING here blocks the rest of Phase B, not just this trio.

## References
- Read: `docs/superpowers/specs/2026-07-11-reasonable-3.0-p7-frontier-design.md` Decision 5 (the full
  corrected account) and the Open-edge check
- Read: `../shared/interfaces.md` §0 correction 3 (in full)
- Read: `docs/artifacts.md`'s P5 retrospective gap note (the demonstrated defect this closes)
- Read: `lib/rewrite.mjs` (the T04e diff), `test/rewrite-ceremony.test.mjs` (the one rewritten check),
  `test/rewrite-ceremony-stacking.test.mjs`, `test/rewrite-ceremony-hardening.test.mjs`

## Dependencies
- Depends on: T04e
- Depended on by: T05a (cannot proceed until this audit is clean — Phase B's second STOP)

## What to check (report each as PASS / FINDING)

1. **Discriminator (teeth) on the core fix.** Confirm the stacking test genuinely fails against a stub
   `unwindCeremonyEscalation` that ignores `escalationId` entirely and disarms bare check names (the OLD
   behavior) — walk the "reject the later" test by hand against that stub: would it wrongly report A's
   markers as also disarmed? Confirm the real, fixed implementation is what makes the test pass, not an
   accident of the fixture.
2. **The rewritten literal is the ONLY change to `test/rewrite-ceremony.test.mjs`.** Diff the file
   against its pre-T04d shape (or re-read T04d's task file) and confirm every other check, helper, and
   comment is byte-for-byte identical. A rewrite that "fixed" or altered an unrelated check is a finding.
3. **`test/rewrite-ceremony-hardening.test.mjs` is genuinely untouched and still green**, and its own
   assertions (which never hard-code the escalation's own marker names — only count/presence of an
   UNRELATED pre-armed marker) are confirmed to be structurally immune to this shape change, not
   accidentally so. Run it and confirm.
4. **Backward compatibility on `unwindCeremonyEscalation`.** Confirm an old-shaped (no `escalationId`)
   hand-built escalation effect still unwinds correctly (no `escalationId` key appears in the output,
   never `escalationId: undefined`) — this is exactly what `test/ledger-two-phase.test.mjs`'s
   reject/unwind fixture (T05a, seeded directly via `seedLedger`, no `escalationId`) depends on; confirm
   by re-reading that test file's fixture and tracing it through the NEW `unwindCeremonyEscalation`.
5. **The escalation-id derivation is genuinely pure and stateless-safe.** Confirm
   `state.escalations[coneId]`'s length is the ONLY thing read (no mutation, no side-table, no counter
   that would misbehave under concurrent/repeated calls) — re-read the diff and confirm no new mutable
   module-level state was introduced.
6. **The named residuals are honestly represented, not silently dropped.** Confirm T04d's
   "reject-the-earlier-while-later-pending" test explicitly comments that the band-value correctness
   under that specific ordering is NOT asserted as fixed (a narrower, still-open residual) — re-read
   that test and confirm it does not accidentally assert something false about the band value.
7. **The whole suite is green**, including every `test/rewrite-*.test.mjs` file and every already-landed
   Part 7 test that touches `ceremonyEscalation`/`unwindCeremonyEscalation` indirectly (search for their
   usage across `test/ledger-*.test.mjs`).

## Deliverable
A short report: each check PASS or a specific FINDING (file:line + the missing case). Gap findings
become new `red` tasks (`T04g-*-hardening-red.md`) before T05a may proceed. If everything passes, say
so plainly, name the discriminator evidence for check 1, and **explicitly confirm this STOP gate is
resolved and T05a may proceed**.

## Acceptance Criteria
- [ ] All seven checks reported PASS or FINDING with evidence
- [ ] No file was modified (read-only audit)
- [ ] Any FINDING is written as a concrete, actionable new `red` task
- [ ] The report states plainly whether T05a may proceed
