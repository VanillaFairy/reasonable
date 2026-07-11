# Task T01c: T01 gate audit

**Role:** `audit` — adversarially audit the T01 gate tests and implementation. **Read-only** on `lib/`
and `test/`: you report findings; you do not fix. Any gap you find becomes a new `red` task.

## References
- Read: `../shared/interfaces.md` (**§1.1** — the union, the `GateState` shape, the numbered decision
  order), `../shared/conventions.md` (the purity tiers; the `undefined`-property gotcha)
- Read: `docs/superpowers/specs/2026-07-11-reasonable-3.0-p7-frontier-design.md` (**Decision 3** — the
  seven-variant union table + routing; **Decision 2** — purity)
- Read: `lib/frontier.mjs` (the T01 section only), `test/frontier-gate.test.mjs`

## Dependencies
- Depends on: T01b
- Depended on by: T04 (Phase B builds on a sound Phase A)

## What to check (report each as PASS / FINDING)

1. **Discriminator (teeth).** Confirm the tests genuinely fail without the implementation: from the
   T01a red-run record (or by `git stash`-ing `lib/frontier.mjs`), confirm the file failed to load
   (`Cannot find module`) before T01b. Then confirm no `check()` is a tautology that would pass against
   an empty `gateDue` stub returning a constant — e.g. a stub returning `{ kind: 'none' }` must fail
   the halt/blocked-human/goal-green/starved/batch-full/heartbeat checks, and a stub returning
   `{ kind: 'halt' }` must fail the `'none'` and ordering checks. A test that survives both stubs is a
   finding.
2. **The union is exact and frozen.** `GATE_RESULT_KINDS` is exactly the seven §1.1 kinds in the §1.1
   order and `Object.isFrozen`. Confirm `'blocked-human'`/`'goal-green'` are the pinned spellings (not
   `'blocked'`/`'green'`) and that `'none'` is NOT a member of the frozen array (it is the non-firing
   sentinel, distinct from the union).
3. **Totality is real (§7.2).** An unknown `controlState` HALTs and carries the offending value in
   `detail`; `'ok'` and an absent `controlState` do NOT halt. Confirm `gateDue` never silently returns
   `{ kind: null }` or an empty object for any input, and returns `'none'` (not `undefined`) when
   nothing trips.
4. **The decision order is enforced, not incidental.** Confirm the tests pin: halt beats all;
   blocked-human beats goal-green; goal-green beats starved; and the immediate-fire classes fire even
   when the band floor WOULD trip (`starved`/`blocked-human` under a tripping large-band floor). A gate
   ordering that passes only because the fixtures never co-activate two branches is a finding.
5. **Starvation is the two-halves valve.** `starved` fires **only** when `frontierSize < quorum` AND
   `gateHeldCount > 0` — confirm BOTH negative halves are tested (empty frontier with nothing gate-held
   → not starved; quorum met with gate-held material → not starved).
6. **The floor is band-indexed.** The `heartbeat` floor reads `policy.cadence[state.band].{n,m}` — confirm
   a test shows the SAME `mergedSinceGate` tripping one band and not another (the `small` vs `large`
   contrast), so the band actually indexes the floor rather than a hard-coded constant.
7. **budget-exhausted is not a gateDue return.** Confirm a test pins that no firing branch produces
   `'budget-exhausted'` (it is the workflow's budget-guard outcome), even though it is a member of the
   frozen union.
8. **Purity + no dropped keys.** `lib/frontier.mjs`'s T01 section imports nothing (no `fs`, no
   `readPolicy`); no test touches the filesystem. Confirm no asserted result object carries an
   `undefined` property that a `JSON.stringify` round-trip would drop (the conventions gotcha) — every
   `detail` asserted is a fully-defined object.

## Deliverable
A short report: each check PASS or a specific FINDING (file:line + the missing case). Any FINDING is
written as a concrete, actionable new `red` task (`T01d-gate-hardening-red.md`) appended to this plan
before T04. If everything passes, say so plainly and note the discriminator evidence you saw (which
stub each check kills).

## Acceptance Criteria
- [ ] All eight checks reported PASS or FINDING with evidence
- [ ] No file was modified (read-only audit)
- [ ] Any FINDING is written as a concrete, actionable new `red` task
