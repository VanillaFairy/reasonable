# Task T03d: Unwind hardening — pre-armed-marker survival + malformed-effect guard

**Roles:** `red` then `green` — two separate fresh subagents. Small, low-risk hardening only. The
THIRD finding from T03c's audit (stacked escalations on the same cone are NOT exact — unwinding a
later escalation strips an earlier, still-ratified escalation's armed markers) is deliberately
**excluded from this task**. It's a real design gap in the `armed`-marker shape (unnamespaced, so two
escalations on one cone are indistinguishable), not a small fix — resolving it properly means
changing the effect shape `shared/interfaces.md` already pins and multiple locked tests already
assert against. That's an architecture call for a future design review (flagged in T04's docs and the
supervisor's final report), not something to improvise here.

## Origin

T03c's audit, with mutation evidence against the real (unmutated) `lib/rewrite.mjs`:

1. **T03d-1 (already correct, uncovered).** An unrelated pre-armed marker on the same cone
   (`lexer:pre-existing-guard`, armed by something other than THIS escalation) survives
   `unwindCeremonyEscalation` — the function only ever disarms `change.armed`, never anything else.
   Confirmed true against current code; simply untested.
2. **T03d-3 (a real, small gap).** `unwindCeremonyEscalation` guards on `change.band === undefined`
   but not on `change.from === undefined`. A malformed hand-built effect (band present, `from`
   missing) currently produces `[{ nodeId, change: { band: undefined, disarmed: [...] } }]` — an
   effect carrying `band: undefined`, which `assert.deepStrictEqual`/`JSON.stringify` would silently
   drop, and which shouldn't be constructed in the first place (matches this file's own
   "avoid undefined properties inside a change object" convention, `shared/conventions.md`).
   `ceremonyEscalation`'s own output always sets `from` correctly, so this is unreachable via the
   router today — but the function is exported standalone, so a caller (Part 7, or a hand-built test)
   could hit it.

## Scope
**Files:**
- Create: `test/rewrite-ceremony-hardening.test.mjs` (red)
- Modify: `lib/rewrite.mjs` (green — `unwindCeremonyEscalation`'s guard clause only, below the T03b
  marker; strict addition, no reshaping of the function's return type)

**BOUNDARY — do NOT touch `test/rewrite-ceremony.test.mjs` (locked) or anything above the T03b
marker. Do NOT attempt to fix the stacked-escalation case (T03d-2) — out of scope here.**

## Positive Constraints (DO)
- **Red:** one check proving an unrelated armed marker on the same node survives unwind (build a
  scratch `{bands, armed}` fold like `test/rewrite-ceremony.test.mjs`'s own `applyBand` helper, seed
  it with an extra pre-armed entry not part of the escalation being unwound, confirm it's still armed
  after). One check proving `unwindCeremonyEscalation({nodeId:'x', change:{band:'full'}})` (band
  present, `from` absent) returns `[]`, not an effect with `band: undefined`.
- **Green:** extend the existing guard clause to also return `[]` when `change.from === undefined`.

## Negative Constraints (DO NOT)
- Do NOT touch the locked `test/rewrite-ceremony.test.mjs`.
- Do NOT attempt to namespace/reference-count armed markers, or otherwise address stacked escalations
  — that is explicitly deferred, not this task's job.

## Implementation Steps (red)
1. Write `test/rewrite-ceremony-hardening.test.mjs`, standard harness, per Positive Constraints.
2. Run it. The pre-armed-marker check is expected to ALREADY PASS (coverage backfill, be honest about
   this, do not force an artificial RED). The malformed-`from` check is expected to currently FAIL
   (real RED — `change.from` is `undefined` today, so the guard doesn't fire and the function returns
   a malformed effect instead of `[]`).
3. Commit only the new file: `git commit -m "test(rewrite): harden unwind — pre-armed marker survives, malformed-from HALTs (audit follow-up)"`.

## Implementation Steps (green, dispatched after red is committed)
1. In `unwindCeremonyEscalation`, extend the guard: also return `[]` when `change.from === undefined`.
2. Run the new locked test (both checks pass), `test/rewrite-ceremony.test.mjs` (still passes
   unchanged), and the full suite.
3. Commit only `lib/rewrite.mjs`: `git commit -m "fix(rewrite): unwindCeremonyEscalation guards a missing 'from' (audit follow-up)"`.

## Acceptance Criteria
- [ ] New test file covers both cases; the pre-armed-marker check's result (already-passing vs.
      newly-passing) is reported honestly
- [ ] `unwindCeremonyEscalation`'s change is a strict guard-clause addition, no other behavior change
- [ ] `test/rewrite-ceremony.test.mjs` still passes byte-for-byte unmodified
- [ ] Full suite green
