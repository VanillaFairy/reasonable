# Task T04d: ceremony-escalation stacking tests (red) — closing P5's own flagged gap

**Role:** `red` — (1) rewrite the ONE pre-existing hard-coded literal assertion in
`test/rewrite-ceremony.test.mjs` that the shape change below breaks, and (2) write the new stacking
test file. Do NOT implement the shape change in `lib/rewrite.mjs`.

> **STOP — confirm this fix with the human before this task runs.** This is Phase B's SECOND STOP gate
> (see `plan.md`'s STOP note and Pre-flight section). `lib/rewrite.mjs` is **P5's own already-shipped
> file** — this task rewrites one of ITS locked tests as part of a deliberate, real shape correction,
> not a casual edit. Confirm before dispatching.

## Why this task exists — read in full before touching anything

`docs/artifacts.md`'s P5 retrospective ("Scope note — the flagged gaps") records a **demonstrated**
defect, not a hypothetical one: mutation testing proved `unwindCeremonyEscalation` correct for a single,
isolated escalation per cone, and **incorrect** for two escalations landing on the same cone before
either resolves — the `armed` marker set is a fixed, unnamespaced 3-item literal keyed only by check
name, so unwinding the *later* escalation strips markers the *earlier*, still-valid escalation also
needs. The retrospective named this explicitly as **P7's own architecture call** ("the part that will
actually apply multiple verdicts across a real gate-cadence window, making stacking routine rather than
theoretical"). `docs/superpowers/specs/2026-07-11-reasonable-3.0-p7-frontier-design.md`'s Decision 5 now
states the resolution: namespace every escalation by a stable `escalationId`
(`` `${coneId}#esc${N}` ``, `N` = the count of prior escalations already recorded against that cone in
`state.escalations[coneId]` — the same pure-counting pattern `state.priorVerdicts` already uses for R1's
"second independent exhaustion" trigger) and tag every `armed` entry with it
(`` `${check}@${escalationId}` ``), so an unwind can only ever strip *its own* escalation's markers.

## References
- Read: `docs/superpowers/specs/2026-07-11-reasonable-3.0-p7-frontier-design.md` Decision 5 (in full —
  the corrected text) and the Open-edge check at the bottom of the self-review
- Read: `../shared/interfaces.md` §0 correction 3 (in full) and §2's extended flagged-gap note
  (`state.escalations`)
- Read: `docs/artifacts.md`'s "Scope note — the flagged gaps" paragraph for P5 (search for
  "ceremony-escalation unwind is exact only for a single") — the exact defect this task closes
- Read: `lib/rewrite.mjs` **in full** — `ceremonyEscalation`/`unwindCeremonyEscalation`'s current
  (pre-fix) code, and `escalationTrigger`'s four trigger cases (you are not changing these, only the
  returned effect's shape)
- Read: `test/rewrite-ceremony.test.mjs` **in full** — this is the file with ONE assertion you rewrite
  (the check named `'a WIDE R2 (blast radius past the cone band bound) ratchets the band up one step'`,
  lines ~38–45) — every OTHER check in this file is unaffected (they assert `null`/non-null, not the
  exact shape) and must NOT be touched
- Read: `test/rewrite-ceremony-hardening.test.mjs` **in full** — confirm (do not modify) that its
  assertions never hard-code the escalation's own marker names (only counts/presence of an UNRELATED
  pre-armed marker) — it is unaffected by this shape change and stays exactly as shipped

## Dependencies
- Depends on: T04c (Phase B's first audit clean) AND the human's confirmation of this fix
- Depended on by: T04e (implements against these locked tests), T04f (audits them); T05a (the two-phase
  fold tests) depend transitively on T04f

## Scope
**Files:**
- Modify: `test/rewrite-ceremony.test.mjs` (ONE check's literal expectation only)
- Create: `test/rewrite-ceremony-stacking.test.mjs`

**BOUNDARY — you MUST NOT modify any files outside this list. In particular, do NOT edit
`lib/rewrite.mjs`, and do NOT touch any check in `test/rewrite-ceremony.test.mjs` other than the one
named above. Do NOT touch `test/rewrite-ceremony-hardening.test.mjs`.**

## Positive Constraints (DO)
- In `test/rewrite-ceremony.test.mjs`, update ONLY the `'a WIDE R2 ...'` check's expected literal to the
  namespaced shape (shown exactly in Step 1 below) — every other check, every helper function
  (`applyBand`, `wideR2State`, `wideR2Verdict`), and every comment stays byte-for-byte unchanged.
- In `test/rewrite-ceremony-stacking.test.mjs`, cover:
  - Two escalations computed against the SAME cone (via two distinct triggering verdicts) get
    **distinct `escalationId`s**, derived from `state.escalations[coneId]`'s length at each call.
  - Rejecting the LATER escalation (via `unwindCeremonyEscalation`) leaves the EARLIER escalation's
    THREE armed markers **fully intact** — assert by name, not just by count — and removes exactly the
    later one's three markers. This is the core, demonstrated bug this task closes.
  - The band-revert value on rejecting the later escalation reverts to that escalation's OWN `from`
    (the band level the earlier, still-valid escalation established) — not all the way back past it.
  - Rejecting the EARLIER escalation while the LATER one is still pending disarms ONLY the earlier
    one's markers, leaving the later one's fully intact (the mirror-image case) — and explicitly
    comment that the resulting BAND VALUE under this specific ordering (reject-the-earlier-first) is a
    narrower, still-open residual (named in the design doc), not something this test asserts as fully
    resolved.
  - `validateEffects` still accepts every produced effect (the shape change stays within
    `lib/effects.mjs`'s free-form `change` contract).

## Negative Constraints (DO NOT)
- Do NOT implement the shape change in `lib/rewrite.mjs`.
- Do NOT touch any check in `test/rewrite-ceremony.test.mjs` besides the one named.
- Do NOT touch `test/rewrite-ceremony-hardening.test.mjs` — it is unaffected and stays as shipped.
- Do NOT modify any file outside Scope.

## Implementation Steps

### Step 1: Rewrite the one literal in `test/rewrite-ceremony.test.mjs`

Find:

```js
check('a WIDE R2 (blast radius past the cone band bound) ratchets the band up one step', () => {
  const esc = ceremonyEscalation(wideR2Verdict, wideR2State());
  assert.deepStrictEqual(esc, {
    nodeId: 'lexer',
    change: { band: 'full', from: 'standard', armed: ['deep-audit', 'scaffold-recheck', 'tighter-cadence'] },
  });
  assert.ok(validateEffects([esc]).ok);
});
```

Replace it with:

```js
check('a WIDE R2 (blast radius past the cone band bound) ratchets the band up one step', () => {
  // reasonable 3.0 Part 7 (interfaces.md §0 correction 3): ceremonyEscalation now namespaces every
  // escalation by a stable escalationId (state.escalations[coneId]'s length at call time — 0 here,
  // since wideR2State() carries no escalations field, defaulting to []) and tags every armed marker
  // with it, so a rejected escalation can never strip a co-resident one's markers. This is the ONE
  // assertion in this file the shape change touches; every other check in this file is unaffected.
  const esc = ceremonyEscalation(wideR2Verdict, wideR2State());
  assert.deepStrictEqual(esc, {
    nodeId: 'lexer',
    change: {
      escalationId: 'lexer#esc0',
      band: 'full',
      from: 'standard',
      armed: ['deep-audit@lexer#esc0', 'scaffold-recheck@lexer#esc0', 'tighter-cadence@lexer#esc0'],
    },
  });
  assert.ok(validateEffects([esc]).ok);
});
```

### Step 2: Write `test/rewrite-ceremony-stacking.test.mjs`

```js
// test/rewrite-ceremony-stacking.test.mjs — the ceremony-escalation unwind under STACKING (two
// escalations on one cone before either resolves), reasonable 3.0 Part 7, interfaces.md §0 correction
// 3. Closes a REAL, demonstrated defect recorded in docs/artifacts.md's P5 retrospective (mutation
// testing proved the unwind correct only for a single, isolated escalation per cone) — this is the
// fix the retrospective named as P7's own architecture call. Pure, zero-I/O.

import assert from 'node:assert';
import { ceremonyEscalation, unwindCeremonyEscalation } from '../lib/rewrite.mjs';
import { validateEffects } from '../lib/effects.mjs';

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.stack || e.message}`); process.exitCode = 1; }
}

// A 3-band scale + a cone bound of 1, so any dead-end whose blast radius is width-3 escalates.
function baseState() {
  return {
    atoms: [{ id: 'a-1', component: 'lexer', state: "spec'd", deltaClauses: [] }],
    citationGraph: { w: ['x', 'y'], x: [], y: [] }, // closure(w) = [w,x,y], width 3
    bandScale: ['micro', 'standard', 'full'],
    bandBounds: { lexer: 1 },
  };
}
const verdictA = { kind: 'dead-end', atomId: 'a-1', premise: { component: 'w', clause: 'w#c1', layer: 'contract' } };
const verdictB = { kind: 'dead-end', atomId: 'a-1', premise: { component: 'w', clause: 'w#c2', layer: 'contract' } };

// ── distinct escalation ids ────────────────────────────────────────────────────

check('two escalations on the same cone get DISTINCT escalationIds', () => {
  const stateA = { ...baseState(), bands: { lexer: 'micro' }, escalations: {} };
  const escA = ceremonyEscalation(verdictA, stateA);
  assert.strictEqual(escA.change.escalationId, 'lexer#esc0');

  // B fires AFTER A's provisional raise has folded (band now 'standard') and A's escalation has been
  // recorded in the cone's own escalation history.
  const stateB = { ...baseState(), bands: { lexer: 'standard' }, escalations: { lexer: [escA] } };
  const escB = ceremonyEscalation(verdictB, stateB);
  assert.strictEqual(escB.change.escalationId, 'lexer#esc1');
  assert.notStrictEqual(escA.change.escalationId, escB.change.escalationId);
});

// ── the core fix: rejecting the LATER escalation leaves the EARLIER one's markers intact ──────

check("rejecting the LATER escalation (B) leaves the EARLIER one's (A) three armed markers fully intact", () => {
  const stateA = { ...baseState(), bands: { lexer: 'micro' }, escalations: {} };
  const escA = ceremonyEscalation(verdictA, stateA);
  const stateB = { ...baseState(), bands: { lexer: 'standard' }, escalations: { lexer: [escA] } };
  const escB = ceremonyEscalation(verdictB, stateB);

  const armed = new Set();
  for (const e of [escA, escB]) for (const a of e.change.armed) armed.add(a);
  assert.strictEqual(armed.size, 6, 'six DISTINCT markers (3 each), no collision between A and B');

  const unwindB = unwindCeremonyEscalation(escB);
  assert.ok(validateEffects(unwindB).ok);
  for (const u of unwindB) for (const d of u.change.disarmed) armed.delete(d);

  for (const c of ['deep-audit', 'scaffold-recheck', 'tighter-cadence']) {
    assert.ok(armed.has(`${c}@${escA.change.escalationId}`), `A's ${c} marker must survive B's unwind`);
    assert.ok(!armed.has(`${c}@${escB.change.escalationId}`), `B's ${c} marker must be gone`);
  }
  assert.strictEqual(armed.size, 3, 'exactly A\'s three markers remain');

  // Band reverts to B's OWN `from` (standard) — A's raise (micro->standard) is still valid.
  assert.strictEqual(unwindB[0].change.band, 'standard');
});

// ── the mirror case: rejecting the EARLIER escalation while the LATER one is pending ──────────

check("rejecting the EARLIER escalation (A) disarms ONLY A's markers, leaving B's fully intact", () => {
  const stateA = { ...baseState(), bands: { lexer: 'micro' }, escalations: {} };
  const escA = ceremonyEscalation(verdictA, stateA);
  const stateB = { ...baseState(), bands: { lexer: 'standard' }, escalations: { lexer: [escA] } };
  const escB = ceremonyEscalation(verdictB, stateB);

  const armed = new Set();
  for (const e of [escA, escB]) for (const a of e.change.armed) armed.add(a);

  const unwindA = unwindCeremonyEscalation(escA);
  assert.ok(validateEffects(unwindA).ok);
  for (const u of unwindA) for (const d of u.change.disarmed) armed.delete(d);

  for (const c of ['deep-audit', 'scaffold-recheck', 'tighter-cadence']) {
    assert.ok(!armed.has(`${c}@${escA.change.escalationId}`), "A's markers are gone");
    assert.ok(armed.has(`${c}@${escB.change.escalationId}`), "B's markers are untouched by A's unwind");
  }
  // NOTE (known, named residual — see the design doc's Decision 5): unwindA reverts the band to A's
  // OWN `from` ('micro'), which in this reject-the-earlier-while-later-is-pending ordering discards
  // B's still-pending raise to 'full' too. This test asserts the MARKER isolation (the demonstrated
  // bug this task closes); it does NOT assert the band value is correct under this specific
  // out-of-order rejection sequence — that is the narrower, still-open residual named in the design
  // doc, not silently glossed over here.
});

// ── validateEffects accepts the namespaced shape ──────────────────────────────

check('a computed escalation and its unwind both pass validateEffects', () => {
  const stateA = { ...baseState(), bands: { lexer: 'micro' }, escalations: {} };
  const escA = ceremonyEscalation(verdictA, stateA);
  assert.ok(validateEffects([escA]).ok);
  assert.ok(validateEffects(unwindCeremonyEscalation(escA)).ok);
});

if (process.exitCode) console.error(`\nrewrite-ceremony-stacking: FAILURES above (${passed} passed).`);
else console.log(`\nrewrite-ceremony-stacking: all ${passed} checks pass. ✓`);
```

### Step 3: Run both files to verify they fail for the right reason

Run: `node test/rewrite-ceremony.test.mjs`

Expected: `FAIL` on exactly the one rewritten check (the current `ceremonyEscalation` still returns the
bare, unnamespaced shape — an assertion mismatch, not a crash). Every other check in the file still
passes.

Run: `node test/rewrite-ceremony-stacking.test.mjs`

Expected: `FAIL` on every check (the current `ceremonyEscalation`/`unwindCeremonyEscalation` have no
`escalationId` concept at all, so `escA.change.escalationId` is `undefined`, not `'lexer#esc0'`).

### Step 4: Commit

```bash
git add test/rewrite-ceremony.test.mjs test/rewrite-ceremony-stacking.test.mjs
git commit -m "test(rewrite): lock escalation-id namespacing — closes P5's demonstrated stacking gap (red, P7)" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

## Acceptance Criteria
- [ ] `test/rewrite-ceremony.test.mjs` has exactly ONE changed check; every other check, helper, and
      comment is byte-for-byte unchanged
- [ ] `test/rewrite-ceremony-stacking.test.mjs` exists and matches the pure-fixture harness convention
- [ ] Running both files fails for the right reason (assertion mismatches, not crashes)
- [ ] Distinct escalation ids, the core "reject-the-later" marker-isolation fix, the mirror
      "reject-the-earlier" case (with its band-value residual explicitly named, not asserted as fixed),
      and `validateEffects` acceptance are all covered
- [ ] `test/rewrite-ceremony-hardening.test.mjs` was NOT touched
- [ ] No file outside Scope modified; `lib/rewrite.mjs` NOT edited
