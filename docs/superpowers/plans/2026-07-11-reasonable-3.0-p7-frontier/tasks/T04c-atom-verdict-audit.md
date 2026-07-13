# Task T04c: `atom-verdict` append audit

**Role:** `audit` — adversarially audit the T04 tests and implementation, with extra teeth on the
no-model-in-the-loop boundary. **Read-only** on `lib/` and `test/`: you report findings; you do not fix.

## References
- Read: `../shared/interfaces.md` §2 (in full, including both flagged gaps), `../shared/conventions.md`
  (the append-path discipline)
- Read: `lib/ledger.mjs` (the diff — imports, the two `EVENT_SCHEMAS` entries, the verdict branch),
  `test/ledger-atom-verdict.test.mjs`

## Dependencies
- Depends on: T04b
- Depended on by: T05 (the two-phase fold builds on a sound append branch)

## What to check (report each as PASS / FINDING)

1. **Discriminator (teeth).** Confirm every `check()` genuinely depends on the real `append()` branch:
   walk each assertion against a stub `append()` that just does `stamped.effects = []` unconditionally
   (must fail the happy-path and no-model-in-the-loop checks) and one that always returns `{ok:false}`
   for `atom-verdict` (must fail the happy-path and pendingPermanent checks).
2. **The no-model-in-the-loop boundary is real.** Confirm a caller-supplied `effects` field on the
   INPUT event is discarded and replaced — re-run the "caller-supplied effects lie" check by hand
   against the code: does `stamped.effects = ...` unconditionally overwrite whatever `event.effects` may
   have carried? (It must — `stamped` starts as `{...event}`, so `stamped.effects` initially equals
   `event.effects` until the verdict branch reassigns it.)
3. **Fail-closed is real, not partial.** Confirm an unknown verdict kind returns `{ok:false}` from
   `append()` itself (not just from `computeVerdictEffects`) and that NOTHING is written — re-read the
   `withLock` callback's control flow to confirm the early `return {ok:false, error}` happens BEFORE
   `appendJsonlLocked` is called, exactly like the pattern for `resolveFamily1Address`.
4. **The snapshot is read-only and canonical.** Confirm the branch reads `deriveCurrent`/
   `citationGraph`/`readGoals`/`readPolicy` fresh each call (no caching that could go stale across
   concurrent appends) and never reads a lane's local/in-flight state (there is no lane-scoped read in
   the branch — confirm this by inspecting the imports and the absence of any `worktree`/`lane` path
   reference).
5. **The two flagged gaps are honestly represented, not silently broken.** Confirm `bands: {}` and
   `bandBounds: {}` are exactly what `../shared/interfaces.md` §2 prescribes (not a fabricated nested
   shape), and that `priorVerdicts: []` is named in the implementation's own comment as a third flagged
   default (T04b's Step 3 added this beyond what `../shared/interfaces.md` originally named — confirm
   it is reasonable and does not silently break the happy-path test, which only exercises a first
   checkpoint verdict).
6. **`pendingPermanent` never leaks into `effects`.** Confirm the two fields stay genuinely distinct
   (not a shared reference, not accidentally spread into each other) for the `oversized` fixture.
7. **Existing event types are provably unaffected.** Confirm the live 2.x `verdict` type (and every
   other pre-existing type) never triggers the new branch, never calls `deriveCurrent`/`citationGraph`
   (a wasted read-only call is still a behavior change worth flagging if it snuck in), and behaves
   byte-identically to `test/ledger-effects.test.mjs`'s own assertions (re-run that file too — it must
   still be 100% green).
8. **Purity of the added functions is not violated.** Confirm `lib/rewrite.mjs`, `lib/graph.mjs`,
   `lib/contract.mjs`, `lib/goals.mjs`, `lib/policy.mjs` were NOT modified — only imported from.

## Deliverable
A short report: each check PASS or a specific FINDING (file:line + the missing case). Gap findings
become new `red` tasks (`T04d-*-hardening-red.md`) before T05. If everything passes, say so plainly and
name the discriminator evidence you saw for the no-model-in-the-loop check specifically (this is the
load-bearing invariant of the whole part).

## Acceptance Criteria
- [ ] All eight checks reported PASS or FINDING with evidence
- [ ] No file was modified (read-only audit)
- [ ] Any FINDING is written as a concrete, actionable new `red` task
- [ ] `test/ledger-effects.test.mjs` was re-run and confirmed still green
