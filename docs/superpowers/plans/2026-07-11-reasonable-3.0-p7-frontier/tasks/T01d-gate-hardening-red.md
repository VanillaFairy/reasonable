# Task T01d: gate decision-order hardening (audit follow-up)

**Role:** `red` — you write ONLY new test cases in the existing `test/frontier-gate.test.mjs`. Do NOT
modify `lib/frontier.mjs`. Unlike T01a, this task closes an AUDIT-FOUND test-coverage gap in an
implementation that is already correct — the new checks are expected to PASS immediately against the
current `gateDue`. That is not a failure of this task: the point is that today NOTHING would catch a
future accidental reordering of these branches, and after this task, something would. If any new check
you write actually FAILS against the shipped `gateDue`, STOP — that is a real, previously-undiscovered
bug, not something to paper over; escalate rather than "fixing forward."

## Origin

T01c's audit (Phase A) found that `gateDue`'s 7-step decision chain has three adjacent-step pairs never
co-activated by any existing fixture: (a) `halt` vs `starved`/`batch-full`/the band-indexed `heartbeat`
floor, (b) the inbox-tripwire `heartbeat` vs `starved`, (c) `batch-full` vs the band-indexed `heartbeat`
floor. The audit confirmed empirically (by running the real, unmodified `gateDue`) that the shipped
implementation is correct on all three combinations — this is a coverage gap, not an implementation
defect. This task closes it.

## References
- Read: `../shared/interfaces.md` §1.1 (the exact 8-step decision order `gateDue` evaluates)
- Read: `../shared/conventions.md` (the harness pattern; the `undefined`-property gotcha)
- Read: `lib/frontier.mjs` (the whole T01 section, as shipped)
- Read: `test/frontier-gate.test.mjs` (the existing fixture builder `state(over)` and the "decision
  ordering" section you are extending)

## Dependencies
- Depends on: T01c (this audit)
- Depended on by: T04 (Phase B builds on a sound Phase A)

## Scope
**Files:**
- Edit: `test/frontier-gate.test.mjs` — append new `check(...)` calls to the existing "decision
  ordering" section only. Do not touch any other section.

**BOUNDARY — you MUST NOT modify `lib/frontier.mjs` or any file outside the one listed above.**

## Positive Constraints (DO)
- Add a check that `halt` beats `starved`: co-activate a bad `controlState` with a tripping
  `frontierSize < quorum && gateHeldCount > 0`, assert `kind === 'halt'`.
- Add a check that `halt` beats `batch-full`: co-activate a bad `controlState` with a tripping
  `batches` count, assert `kind === 'halt'`.
- Add a check that `halt` beats the band-indexed `heartbeat` floor: co-activate a bad `controlState`
  with a tripping `mergedSinceGate`, assert `kind === 'halt'`.
- Add a check that the inbox-load tripwire `heartbeat` beats `starved`: co-activate
  `inboxLoad >= inboxTripwire` with a tripping `frontierSize < quorum && gateHeldCount > 0`, assert
  `kind === 'heartbeat'` and `detail.reason === 'inbox-load'`.
- Add a check that `batch-full` beats the band-indexed `heartbeat` floor: co-activate a tripping
  `batches[k]` with a tripping `mergedSinceGate`/`eventsSinceGate` for the active band, assert
  `kind === 'batch-full'` (not `'heartbeat'`).
- Reuse the existing `state(over)` fixture builder exactly as the rest of the file does — no new
  fixture helper, no filesystem.
- Every asserted `detail` object must be fully defined (no `undefined` properties — the conventions
  gotcha).

## Negative Constraints (DO NOT)
- Do NOT modify `lib/frontier.mjs`.
- Do NOT modify any existing `check(...)` block — only append new ones.
- Do NOT touch the filesystem.
- Do NOT weaken this into re-testing what T01a already covers (single-signal firing) — every new
  check here MUST co-activate two previously-uncombined trip conditions in the same `state` object.

## Implementation Steps

### Step 1: Append five new checks to the "decision ordering" section

```js
check('halt beats starved (co-activated, not just co-activated with blocked-human/goal-green)', () => {
  const r = gateDue(state({ controlState: 'corrupt', frontierSize: 0, quorum: 1, gateHeldCount: 2 }), policy);
  assert.strictEqual(r.kind, 'halt');
});

check('halt beats batch-full', () => {
  const r = gateDue(state({
    controlState: 'corrupt',
    batches: { amendments: 3, deadEndPermanence: 0, extractions: 0, retopology: 0 },
  }), policy);
  assert.strictEqual(r.kind, 'halt');
});

check('halt beats the band-indexed heartbeat floor', () => {
  const r = gateDue(state({ controlState: 'corrupt', mergedSinceGate: 5 }), policy);
  assert.strictEqual(r.kind, 'halt');
});

check('the inbox-load tripwire heartbeat beats starved', () => {
  const r = gateDue(state({
    inboxLoad: 5, inboxTripwire: 5,
    frontierSize: 0, quorum: 1, gateHeldCount: 2,
  }), policy);
  assert.deepStrictEqual(r, { kind: 'heartbeat', detail: { reason: 'inbox-load' } });
});

check('batch-full beats the band-indexed heartbeat floor', () => {
  const r = gateDue(state({
    batches: { amendments: 3, deadEndPermanence: 0, extractions: 0, retopology: 0 },
    band: 'large', mergedSinceGate: 5,
  }), policy);
  assert.deepStrictEqual(r, { kind: 'batch-full', detail: { class: 'amendments' } });
});
```

### Step 2: Run and confirm

Run: `node test/frontier-gate.test.mjs` — expect ALL checks (old + new) to pass, confirming the
existing decision order was already correct; this task closes the coverage gap so a future regression
would be caught, not proves one exists today.

Run the whole suite too: `for t in test/*.test.mjs; do node "$t"; done` — confirm zero regressions.

### Step 3: Commit

```bash
git add test/frontier-gate.test.mjs
git commit -m "test(frontier): pin gate decision order across previously-uncombined branch pairs (P7 audit follow-up)" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

## Acceptance Criteria
- [ ] Five new checks added, each co-activating a previously-untested adjacent-step pair
- [ ] `node test/frontier-gate.test.mjs` passes in full (old + new checks)
- [ ] The whole suite is still green
- [ ] `lib/frontier.mjs` was not modified
- [ ] No file outside `test/frontier-gate.test.mjs` was modified
