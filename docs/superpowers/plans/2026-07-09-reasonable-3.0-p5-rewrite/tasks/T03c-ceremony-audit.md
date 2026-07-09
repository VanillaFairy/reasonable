# Task T03c: T03 audit — with extra teeth on the unwind

**Role:** `audit` — adversarially audit the T03 tests and appended section. **Read-only**; report,
do not fix. This triad carries DESIGN-3.0's flagged open edge, so the unwind gets extra scrutiny.

## References
- Read: `../shared/interfaces.md`, `../shared/conventions.md`
- Read: `docs/superpowers/specs/2026-07-09-reasonable-3.0-p5-rewrite-design.md` Decision 7 and the
  self-review's "open-edge check"
- Read: `lib/rewrite.mjs` (T03 section), `test/rewrite-ceremony.test.mjs`

## Dependencies
- Depends on: T03b
- Depended on by: T04

## What to check (report each as PASS / FINDING)

1. **Discriminator.** Every ceremony/R8 check fails without T03b. No tautologies.
2. **The unwind is a TRUE inverse (the headline).** Beyond the locked identity test, reason
   adversarially: does `unwindCeremonyEscalation` restore the band to `change.from` (not to `null`,
   not to `micro`, not to the scale's floor)? Does it disarm **exactly** the armed set the escalation
   added — no more (which would disarm a guard the escalation never touched) and no fewer (a residual
   armed check is a silent ratchet the human never approved)? If the escalation had recorded no
   `from`, the unwind could not be exact — confirm `from` is present. **A residual after unwind is a
   fatal finding**, because a rejected permanent raise that leaves the cone deeper than it started is
   exactly the silent-ratchet failure §3's policy anti-attack exists to prevent.
3. **Monotone up, capped, never wraps.** Confirm the top-band case returns null (not the floor), and
   that no path ever lowers a band. Probe: could a negative/weird index ever produce a lower band?
4. **No invented calibration.** `ceremonyEscalation` reads bands/scale/bounds from `state`; it hard-codes
   no band name and no threshold number. The `armed` list is a fixed structural marker set, not a
   computed policy — confirm that's acceptable (it names *which* checks arm; Part 6 owns their
   depth). Flag any magic number that leaked in.
5. **R8's Part-6 boundary is honest.** R8 emits a proposal shape and does NOT claim to measure or
   reduce density (that's Part 6). Confirm the rule doesn't fake a density check, and that the gap is
   visible (a comment + the docs task will name it).
6. **Sibling, not router-wired.** `ceremonyEscalation` is a separate export; `computeVerdictEffects`
   does NOT call it. Confirm the router still returns structural-only effects (no `ceremony` key) —
   Part 7 is what will call both.
7. **Effect validity + purity.** The escalation effect, the unwind, and R8 outputs all pass
   `validateEffects`; no I/O; nothing above the T02b marker touched.

## Deliverable
A PASS/FINDING report with evidence, with an explicit verdict on check 2 (the unwind). Gaps become a
`T03d-*` hardening `red` task before T04.

## Acceptance Criteria
- [ ] All seven checks reported; check 2 (unwind inverse) given an explicit CONFIRMED/finding verdict
- [ ] No file modified (read-only)
- [ ] Any FINDING is a concrete new `red` task
