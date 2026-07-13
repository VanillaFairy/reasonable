# Task T05c: two-phase fold audit (Phase B closeout)

**Role:** `audit` — adversarially audit the T05 tests and implementation, with extra teeth on the
apply-then-unwind identity at the wiring level. **Read-only** on `lib/` and `test/`.

## References
- Read: `../shared/interfaces.md` §2 (in full), `../shared/conventions.md`
- Read: `lib/ledger.mjs` (the T04+T05 diff), `test/ledger-two-phase.test.mjs`
- Read: `lib/rewrite.mjs`'s `ceremonyEscalation`/`unwindCeremonyEscalation` and their own P5-authored
  test (`test/rewrite-ceremony.test.mjs`, if present) for the identity invariant's original proof

## Dependencies
- Depends on: T05b
- Depended on by: T09 (the workflow appends `ratification` events at gates), T11 (docs)

## What to check (report each as PASS / FINDING)

1. **Discriminator (teeth).** Confirm each `check()` fails against a stub that always sets
   `stamped.effects = []` for a ratification (must fail both the accept and reject fold checks) and one
   that folds `pendingPermanent` but ignores `rejectsSeqs` entirely (must fail the reject/unwind check).
2. **The fold is genuinely ledger-derived, not a side-table.** Confirm the "call twice, same answer"
   test is real — re-read the implementation: does it read `readJsonl(ledgerPath)` fresh on every
   `append()` call, with no in-memory cache surviving between calls? A cached `Map` at module scope
   would still pass a same-process double-call test but would be wrong in spirit — confirm there is no
   such cache.
3. **`validateDropsAndResolvesSeq` is genuinely reused, not duplicated.** Confirm
   `validateRatificationPayload` calls it (rather than re-implementing the `drops`/`resolvesSeq` checks)
   and that `'amendment'`'s schema entry still points at the original function, untouched.
4. **The apply-then-unwind identity holds at the WIRING level**, not just inside `rewrite.mjs`'s own
   unit tests. Confirm: take the seeded escalation effect `{nodeId:'lexer', change:{band:'full',
   from:'lite', armed:[...]}}`, apply it conceptually (band becomes `'full'`), then apply the
   ratification's unwind effects — the resulting band must equal `'lite'` (the original `from`) and the
   `armed` set must be empty (`disarmed` lists exactly what was armed). Confirm the test actually
   asserts this, not just that SOME effects array came back non-empty.
5. **Both-refs union is a true union, not a last-write-wins.** Confirm a ratification naming both
   `ratifiesSeqs` and `rejectsSeqs` (even referencing the SAME seq, as T05a's test does) produces BOTH
   the pendingPermanent effects AND the unwind effects, concatenated — not one overwriting the other.
6. **Backward compatibility is real.** Confirm a plain `ratification` (only `drops`/`resolvesSeq`, or
   entirely empty) produces IDENTICAL behavior to pre-T05 `lib/ledger.mjs` — no `effects` key appears
   unless the caller sent one. Re-run any pre-existing test that exercises `'amendment'`/`'ratification'`
   events (search `test/*.test.mjs` for `'ratification'` or `'amendment'`) and confirm all still pass.
7. **Purity/boundary.** Confirm `lib/rewrite.mjs` was NOT modified (only imported from) and the fold
   logic performs no write, only a read (`readJsonl`) plus assembling `stamped.effects`.

## Deliverable
A short report: each check PASS or a specific FINDING (file:line + the missing case). Gap findings
become new `red` tasks (`T05d-*-hardening-red.md`) before T06. If everything passes, say so plainly and
**explicitly confirm Phase B (the whole append-path wiring — T04+T05) is closed and sound** before
Phase C begins.

## Acceptance Criteria
- [ ] All seven checks reported PASS or FINDING with evidence
- [ ] No file was modified (read-only audit)
- [ ] Any FINDING is written as a concrete, actionable new `red` task
- [ ] The report states plainly whether Phase B is sound and ready for Phase C
