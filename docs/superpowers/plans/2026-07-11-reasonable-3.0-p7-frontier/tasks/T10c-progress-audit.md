# Task T10c: live-view fold audit (Phase E closeout)

**Role:** `audit` — adversarially audit the T10 tests and implementation. **Read-only** on `lib/` and
`test/`: you report findings; you do not fix.

## References
- Read: `../shared/interfaces.md` §6 (in full, including the flat-path grounding correction),
  `../shared/conventions.md`
- Read: `lib/progress-map.mjs` (the diff), `test/progress-map-atoms.test.mjs`
- Read: `lib/progress-tree.mjs`'s `STATUSES`/`assertValidStatus`

## Dependencies
- Depends on: T10b
- Depended on by: T11 (docs), T12 (final check)

## What to check (report each as PASS / FINDING)

1. **Discriminator (teeth).** Confirm each `check()` fails against a stub `EVENT_MAP` that maps every
   new type to `legacyFallback`'s shape (a bare root note) — must fail the `atom-chartered`/
   `atom-transitioned`/`phase-degenerated` node-existence checks specifically.
2. **The flat-path correction is genuinely honored, not silently reverted to a nested path.** Confirm
   every new entry's `path` is exactly `e.atomId` (or `` `phase/${e.phase}` `` for the degeneration
   entry) — grep the implementation for any reference to `component`/`containmentTree` inside the new
   entries; there should be none (that would reintroduce the stateless-handler violation this
   correction exists to avoid).
3. **The lifecycle→status map is exhaustive and legal.** Confirm ALL TEN atom lifecycle states
   (`chartered`, `ready`, `"spec'd"`, `packed`, `tests-red`, `green`, `audited`, `merged`,
   `retired-pending`, `retired`) have an entry in `ATOM_STATE_TO_TREE_STATUS`, and every mapped value is
   one of the six legal `STATUSES` — an unmapped `to` value silently defaulting to `'pending'` (the
   implementation's fallback) is acceptable ONLY if it's a deliberate, named default, not a masked typo;
   confirm the fallback branch is intentional by re-reading the code.
4. **`phase-degenerated` genuinely shows a proven no-op, not a bare label.** Confirm the injected node's
   note/label surfaces the ACTUAL `e.reason` (from `lib/ceremony.mjs`'s degeneration record shape,
   already grounded in Phase A/B), not a generic placeholder string.
5. **Id stability holds under `apply`'s idempotent-inject semantics.** Confirm the "transitioned twice"
   test genuinely exercises `progress-tree.mjs`'s `inject`'s "existing node's status is never touched by
   inject" rule (re-read `OPS.inject` — status is only applied on a BRAND NEW node) interacting
   correctly with the SEPARATE `status` op `atom-transitioned` uses (which unconditionally sets status
   regardless of existed) — confirm the test's expectations are consistent with `progress-tree.mjs`'s
   actual semantics, not an assumption about them.
6. **No regression.** Confirm every pre-existing `EVENT_MAP` entry (Family 1/2/3, `next-action`) is
   byte-identical, and `test/progress-map.test.mjs` (the original suite) is still 100% green.
7. **Phase E as a whole (closeout).** Confirm the live view now interprets every 3.0 atom-lifecycle
   event type registered in `EVENT_SCHEMAS` (cross-check against `lib/ledger.mjs`'s Family-3 atom
   entries: `atom-chartered`, `atom-delta-authored`, `delta-enrichment`, `atom-transitioned`,
   `atom-flag-set`, `atom-flag-cleared`, plus the new `atom-verdict`/`phase-degenerated`) — none should
   still be falling through to `legacyFallback`.

## Deliverable
A short report: each check PASS or a specific FINDING (file:line + the missing case). Gap findings
become new `red` tasks (`T10d-*-hardening-red.md`) before T11. If everything passes, say so plainly and
**explicitly confirm Phase E is closed and sound**.

## Acceptance Criteria
- [ ] All seven checks reported PASS or FINDING with evidence
- [ ] No file was modified (read-only audit)
- [ ] Any FINDING is written as a concrete, actionable new `red` task
- [ ] The report states plainly whether Phase E is sound and ready for Phase F
