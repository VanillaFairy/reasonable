# Task T01d: Router/R1/R4/R9 hardening tests (red) — audit follow-up

**Role:** `red` — hardening tests only, in a NEW file. Do NOT modify `lib/rewrite.mjs` or either
locked T01a test file.

## Origin

T01c's adversarial audit (read-only, on `lib/rewrite.mjs`'s T01 section + the two T01a test files)
returned FAIL. Confirmed by mutation testing (not just inspection), it found two real coverage gaps
— the underlying implementation is already correct for both, but no test would catch a regression:

1. **R1 cross-atom isolation.** `ruleCheckpoint`'s `priorVerdicts` filter is scoped by
   `v.atomId === atomId && v.kind === 'checkpoint'` (`lib/rewrite.mjs`). Deleting the `atomId`
   half of that filter left all 19 T01 checks green — no fixture proves a *different* atom's prior
   checkpoint doesn't spuriously trigger this atom's second-exhaustion promotion.
2. **R4/R9 unknown-atomId guards.** `ruleOversized` and `ruleStaleSpec` both already guard
   `if (!atom) return { error: ... }` — but only R1 has a "HALTs on an unknown atom" test. Deleting
   either guard left all 19 checks green.

The audit's third suggested gap — a test for a real-but-not-yet-registered `VERDICT_KINDS` member
(e.g. `'dead-end'` before T02b registers it) — is **excluded by the supervisor's review**: the
router's existing "unknown kind" test deliberately uses `'bogus'`, a string that can never become a
real kind, so it stays valid as later triads (T02b, T03b) register `dead-end`/`ripple`/etc. into
`RULES`. A test pinned to a real-but-unregistered kind would go stale (start passing for the wrong
reason) the moment that kind's rule lands — testing router totality against a permanently-unknown
string is the correct, evolution-proof design, not a gap.

## Scope
**Files:**
- Create: `test/rewrite-router-hardening.test.mjs`

**BOUNDARY — do NOT modify `lib/rewrite.mjs`, `test/rewrite-router.test.mjs`, or
`test/rewrite-simple-verdicts.test.mjs` (all locked).**

## Positive Constraints (DO)
- A test proving R1's second-exhaustion promotion is scoped to the SAME atom: a fixture with
  `priorVerdicts` containing a `checkpoint` entry for a *different* atomId (and one for the *same*
  atomId but a *different* kind) must NOT trigger promotion — the verdict atom's own first
  checkpoint still returns the `ready`+reprice shape, not `retired-pending`.
- A test proving R4 (`oversized`) HALTs on an unknown `atomId`.
- A test proving R9 (`stale-spec`) HALTs on an unknown `atomId`.
- Assert `validateEffects` where a case emits effects.

## Negative Constraints (DO NOT)
- Do NOT add a test for a real-but-unregistered verdict kind (see "Origin" above — deliberately
  excluded, not an oversight).
- Do NOT touch `lib/rewrite.mjs` or either locked T01a file. No filesystem I/O.

## Implementation Steps

1. Write `test/rewrite-router-hardening.test.mjs` using the same standalone-script harness as the
   other `test/rewrite-*.test.mjs` files (see `../shared/conventions.md`'s Testing section — a
   `check()` helper, `node:assert`, no framework).
2. Run it. Because the underlying implementation is ALREADY correct for both guards (this is
   backfilling missing coverage, not fixing a bug), expect it to pass immediately against the current
   `lib/rewrite.mjs` — report this honestly rather than forcing an artificial RED. If any check
   instead FAILS against the current implementation, that means the audit's mutation study missed a
   REAL bug (not just a coverage gap) — stop and report it precisely; do not paper over it.
3. Run the full existing suite to confirm zero regression.
4. Commit: `git add test/rewrite-router-hardening.test.mjs` then
   `git commit -m "test(rewrite): harden R1 cross-atom isolation and R4/R9 unknown-atomId guards (audit follow-up)"`.

## Acceptance Criteria
- [ ] File exists, matches the harness convention, only touches its own new file
- [ ] R1 cross-atom isolation, R4 unknown-atomId HALT, R9 unknown-atomId HALT are all covered
- [ ] Full suite still green
- [ ] Report states plainly whether each new check was RED-then-GREEN or already-green (coverage
      backfill vs. bug fix) — do not claim RED where none occurred
