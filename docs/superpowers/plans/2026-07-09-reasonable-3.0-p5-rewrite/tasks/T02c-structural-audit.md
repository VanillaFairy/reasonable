# Task T02c: T02 audit

**Role:** `audit` — adversarially audit the T02 tests and the appended structural section.
**Read-only**; report, do not fix. Gaps become new `red` tasks.

## References
- Read: `../shared/interfaces.md`, `../shared/conventions.md`
- Read: `docs/superpowers/specs/2026-07-09-reasonable-3.0-p5-rewrite-design.md` Decisions 5, 8
- Read: `lib/rewrite.mjs` (T02 section), `test/rewrite-structural.test.mjs`

## Dependencies
- Depends on: T02b
- Depended on by: T03b (held one wave so it appends to an audited file), T04

## What to check (report each as PASS / FINDING)

1. **Discriminator.** Each structural check fails without T02b (an unregistered kind HALTs; `scc`/
   `dependentCone` are unresolved imports). Confirm no check is a tautology.
2. **SCC correctness (teeth).** `scc` is a real Kosaraju/Tarjan, not a shortcut. Probe it mentally
   (or with a scratch fixture the audit builds and discards) on: a self-loop, two disjoint cycles, a
   cycle plus a tail. Confirm R6 keys on `length > 1` (a self-loop of one node is not a spurious
   cycle unless the graph truly has one).
3. **Cone direction (teeth).** `dependentCone` walks `needs` **backward** (dependents of the
   breached atom), not forward. A test that would pass if the direction were reversed is a finding.
   Confirm the merged-R7 test's cone is the atoms that NEED the breach, not the ones it needs.
4. **Blast-radius conservatism (§7 R2).** R2 freezes an atom iff its footprint **closure**
   intersects the radius — confirm the test proves a non-intersecting atom is NOT frozen (the
   `a-3`/`z` case) and an intersecting one IS (the `a-2`/`y` case). Over-freezing forfeits
   parallelism but is safe; under-freezing is a correctness bug — confirm the test pins the boundary.
5. **No double-chartering (R3).** The existing-owner branch enriches, it does not mint a second
   charter. Confirm a fixture with a real owner exercises this.
6. **Two-phase split.** Each rule's `permanent` set matches §7's "Permanent effect (gate)" column
   (R2 has retire+amend; R3 has the bar-clear; R5 the consumed marker; R6 the birth ratification; R7
   merged has remediation, unmerged is empty). Flag any permanent effect that should have been
   provisional or vice versa.
7. **Effect validity + purity.** Every output passes `validateEffects`; no I/O; nothing above the
   T01b marker was touched.

## Deliverable
A short PASS/FINDING report with evidence. Gap findings become a `T02d-*` hardening `red` task before
T04.

## Acceptance Criteria
- [ ] All seven checks reported with evidence
- [ ] No file modified (read-only)
- [ ] Any FINDING is a concrete new `red` task
