# Task T01a: GATE_RESULT + `gateDue` tests (red)

**Role:** `red` — you write ONLY the one failing test file below. Do NOT create or implement
`lib/frontier.mjs`.

## References
- Read: `../shared/architecture.md` (the one-page orientation + the pivotal call)
- Read: `../shared/interfaces.md` in full — especially **§0** (the two grounding corrections) and
  **§1.1** (the exact `GATE_RESULT_KINDS` array, the `GateState` shape, and the numbered `gateDue`
  decision order you are pinning)
- Read: `../shared/conventions.md` (the harness pattern; the `undefined`-property gotcha; the naming
  pins — `'blocked-human'` not `'blocked'`, `'goal-green'` not `'green'`)
- Read: `../knowledge/running-tests.md`
- Read: `docs/superpowers/specs/2026-07-11-reasonable-3.0-p7-frontier-design.md` — **Decision 3** (the
  seven-variant union table) and **Decision 2** (frontier.mjs is pure — hand-built fixtures, no disk)
- Read: `lib/policy.mjs` (`readPolicy` returns `{ policy }` where `policy.cadence[band] = { n, m }` —
  the band-indexed floor `gateDue` reads; you build that shape by hand in the fixture)
- Read: `test/atom-cohesion.test.mjs` (the by-hand fixture harness style — zero filesystem)

## Dependencies
- Depends on: — (Wave 1; nothing precedes it)
- Depended on by: T01b (implements against these locked tests), T01c (audits them)

## Scope
**Files:**
- Create: `test/frontier-gate.test.mjs`

**BOUNDARY — you MUST NOT modify any files outside this list. In particular, do NOT create
`lib/frontier.mjs` — that is T01b's job.**

## Positive Constraints (DO)
- The file imports `{ GATE_RESULT_KINDS, gateDue }` from `../lib/frontier.mjs` (which does not exist
  yet — RED is a `Cannot find module` load error, NOT an assertion failure).
- Cover **`GATE_RESULT_KINDS`**: exactly the seven kinds in the §1.1 order, and `Object.isFrozen`.
- Cover **every immediate-fire branch** of `gateDue`: `halt` (unknown `controlState`), `blocked-human`,
  `goal-green`, the inbox tripwire routing to `heartbeat` with `detail.reason:'inbox-load'`, and
  `starved`.
- Cover the **batched/floor branches**: `batch-full` (with `detail.class`) and the band-indexed
  `heartbeat` reading `policy.cadence[band].{n,m}`.
- Cover the **decision ordering**: `halt` beats all; `blocked-human` beats `goal-green` beats `starved`;
  the immediate-fire classes fire **regardless of band** (a floor that would trip is overridden).
- Cover **`starved` only fires when `frontierSize < quorum` AND `gateHeldCount > 0`** (both halves).
- Cover the non-firing **`'none'`** sentinel, and pin that **`gateDue` never returns
  `'budget-exhausted'`** (it is the workflow's budget-guard outcome — §1.1 note, Decision 3).

## Negative Constraints (DO NOT)
- Do NOT implement `lib/frontier.mjs`.
- Do NOT test `ready`/`pack`/`footprintsDisjoint` (T02a) or `requiredRoles` (T03a).
- Do NOT touch the filesystem — every fixture is a hand-built object literal (no `mkdtemp`, no
  `.reasonable/`, no git). A pure-lib test that reaches for disk is doing too much.
- Do NOT import `validateEffects` — `gateDue` emits gate results, not `lib/effects.mjs`-shaped effects;
  the effects validator belongs to Phase B, not here.
- Do NOT modify any file outside Scope.

## Implementation Steps

### Step 1: Write `test/frontier-gate.test.mjs`

```js
// test/frontier-gate.test.mjs — the exhaustive GATE_RESULT union and the TOTAL gate function
// (DESIGN-3.0 §6, §9, §7.2; reasonable 3.0 Part 7, interfaces.md §1.1). gateDue takes a pre-digested
// GateState snapshot + readPolicy().policy and returns EXACTLY one { kind, detail? } where
// kind ∈ GATE_RESULT_KINDS ∪ { 'none' }. Pure, zero-I/O — every fixture is a hand-built object.

import assert from 'node:assert';
import { GATE_RESULT_KINDS, gateDue } from '../lib/frontier.mjs';

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.stack || e.message}`); process.exitCode = 1; }
}

// A band-indexed cadence floor: band 'small' trips at 5 merged atoms or 20 events; 'large' at 2 / 8.
const policy = { cadence: { small: { n: 5, m: 20 }, large: { n: 2, m: 8 } } };

// A baseline GateState in which NOTHING trips — every test overrides just the fields it exercises, so
// the assertion is always about the one signal under test. All counts are pre-folded (gateDue does no
// I/O). Only defined values are included (the conventions `undefined`-property gotcha).
function state(over = {}) {
  return {
    blockedHuman: null,
    goalGreen: null,
    frontierSize: 3,
    quorum: 1,
    gateHeldCount: 0,
    inboxLoad: 0,
    inboxTripwire: 5,
    batches: { amendments: 0, deadEndPermanence: 0, extractions: 0, retopology: 0 },
    batchBounds: { amendments: 3, deadEndPermanence: 3, extractions: 3, retopology: 3 },
    band: 'small',
    mergedSinceGate: 0,
    eventsSinceGate: 0,
    controlState: 'ok',
    ...over,
  };
}

// ── the union ────────────────────────────────────────────────────────────────

check('GATE_RESULT_KINDS is the seven kinds in the §1.1 decision order, frozen', () => {
  assert.deepStrictEqual([...GATE_RESULT_KINDS], [
    'blocked-human', 'goal-green', 'starved', 'batch-full', 'heartbeat', 'budget-exhausted', 'halt',
  ]);
  assert.ok(Object.isFrozen(GATE_RESULT_KINDS));
});

// ── totality (§7.2) ────────────────────────────────────────────────────────────

check('an unknown controlState HALTs (fail-closed inside an effort), carrying the offending state', () => {
  const r = gateDue(state({ controlState: 'corrupt-lane' }), policy);
  assert.deepStrictEqual(r, { kind: 'halt', detail: { controlState: 'corrupt-lane' } });
});

check("controlState 'ok' or absent is NOT a halt", () => {
  assert.notStrictEqual(gateDue(state({ controlState: 'ok' }), policy).kind, 'halt');
  const s = state(); delete s.controlState;
  assert.notStrictEqual(gateDue(s, policy).kind, 'halt');
});

// ── immediate-fire classes ─────────────────────────────────────────────────────

check('blockedHuman fires blocked-human, echoing the class/ref (both modes)', () => {
  const blockedHuman = { class: 'policy', ref: 'policy#weights' };
  assert.deepStrictEqual(gateDue(state({ blockedHuman }), policy), { kind: 'blocked-human', detail: blockedHuman });
});

check('goalGreen fires goal-green, echoing the goalId', () => {
  const goalGreen = { goalId: 'g-parse' };
  assert.deepStrictEqual(gateDue(state({ goalGreen }), policy), { kind: 'goal-green', detail: goalGreen });
});

check('the inbox tripwire is an immediate-fire heartbeat (detail.reason inbox-load), NOT a distinct kind', () => {
  const r = gateDue(state({ inboxLoad: 5, inboxTripwire: 5 }), policy);
  assert.deepStrictEqual(r, { kind: 'heartbeat', detail: { reason: 'inbox-load' } });
});

check('a zero inbox tripwire never fires (the tripwire is disabled at 0)', () => {
  assert.strictEqual(gateDue(state({ inboxLoad: 0, inboxTripwire: 0 }), policy).kind, 'none');
});

check('starved fires when frontier is below quorum AND gate-held material waits (the liveness valve)', () => {
  assert.strictEqual(gateDue(state({ frontierSize: 0, quorum: 1, gateHeldCount: 2 }), policy).kind, 'starved');
});

check('starved does NOT fire when nothing is gate-held, even with an empty frontier', () => {
  assert.strictEqual(gateDue(state({ frontierSize: 0, quorum: 1, gateHeldCount: 0 }), policy).kind, 'none');
});

check('starved does NOT fire when the frontier meets quorum, even with gate-held material', () => {
  assert.strictEqual(gateDue(state({ frontierSize: 2, quorum: 1, gateHeldCount: 5 }), policy).kind, 'none');
});

// ── batched / floor classes ─────────────────────────────────────────────────────

check('batch-full fires when a batched class reaches its bound, naming the class', () => {
  const r = gateDue(state({ batches: { amendments: 0, deadEndPermanence: 0, extractions: 3, retopology: 0 } }), policy);
  assert.deepStrictEqual(r, { kind: 'batch-full', detail: { class: 'extractions' } });
});

check('batch-full is deterministic when several classes trip: the pinned order (amendments first) wins', () => {
  const r = gateDue(state({ batches: { amendments: 3, deadEndPermanence: 0, extractions: 3, retopology: 0 } }), policy);
  assert.deepStrictEqual(r, { kind: 'batch-full', detail: { class: 'amendments' } });
});

check('the band-indexed floor fires heartbeat at N merged atoms for the cone band', () => {
  assert.strictEqual(gateDue(state({ band: 'small', mergedSinceGate: 5 }), policy).kind, 'heartbeat');
});

check('the band-indexed floor fires heartbeat at M events for the cone band', () => {
  assert.strictEqual(gateDue(state({ band: 'small', eventsSinceGate: 20 }), policy).kind, 'heartbeat');
});

check('the floor is BAND-indexed: a large-band cone trips its own lower N=2 where a small one would not', () => {
  assert.strictEqual(gateDue(state({ band: 'small', mergedSinceGate: 2 }), policy).kind, 'none');
  assert.strictEqual(gateDue(state({ band: 'large', mergedSinceGate: 2 }), policy).kind, 'heartbeat');
});

// ── the non-firing sentinel ──────────────────────────────────────────────────

check("nothing tripped returns the in-band 'none' sentinel (keep looping), never an empty kind", () => {
  assert.deepStrictEqual(gateDue(state(), policy), { kind: 'none' });
});

check('gateDue NEVER returns budget-exhausted — that is the workflow budget guard, not a gate class', () => {
  // Sweep the firing branches; none of them may surface budget-exhausted.
  const seen = new Set([
    gateDue(state({ controlState: 'x' }), policy).kind,
    gateDue(state({ blockedHuman: { class: 'goal', ref: 'g#1' } }), policy).kind,
    gateDue(state({ goalGreen: { goalId: 'g' } }), policy).kind,
    gateDue(state({ frontierSize: 0, gateHeldCount: 1 }), policy).kind,
    gateDue(state({ batches: { amendments: 3, deadEndPermanence: 0, extractions: 0, retopology: 0 } }), policy).kind,
    gateDue(state({ mergedSinceGate: 5 }), policy).kind,
    gateDue(state(), policy).kind,
  ]);
  assert.ok(!seen.has('budget-exhausted'));
});

// ── the decision ordering (immediate-fire beats batched/floor; halt beats all) ──

check('halt beats every other signal (checked first)', () => {
  const r = gateDue(state({ controlState: 'corrupt', blockedHuman: { class: 'policy', ref: 'p' }, goalGreen: { goalId: 'g' } }), policy);
  assert.strictEqual(r.kind, 'halt');
});

check('blocked-human beats goal-green', () => {
  const r = gateDue(state({ blockedHuman: { class: 'intent-fork', ref: 'i#1' }, goalGreen: { goalId: 'g' } }), policy);
  assert.strictEqual(r.kind, 'blocked-human');
});

check('goal-green beats starved', () => {
  const r = gateDue(state({ goalGreen: { goalId: 'g' }, frontierSize: 0, quorum: 1, gateHeldCount: 2 }), policy);
  assert.strictEqual(r.kind, 'goal-green');
});

check('immediate-fire classes fire REGARDLESS of band — a tripping floor never masks blocked-human', () => {
  // band 'large' floor WOULD trip at mergedSinceGate 5 (>= N=2), but blocked-human is checked first.
  const r = gateDue(state({ band: 'large', mergedSinceGate: 5, blockedHuman: { class: 'goal', ref: 'g#1' } }), policy);
  assert.strictEqual(r.kind, 'blocked-human');
});

check('starved is checked before the band floor — an empty frontier under a tripping floor still reads starved', () => {
  const r = gateDue(state({ band: 'large', mergedSinceGate: 5, frontierSize: 0, quorum: 1, gateHeldCount: 1 }), policy);
  assert.strictEqual(r.kind, 'starved');
});

if (process.exitCode) console.error(`\nfrontier-gate: FAILURES above (${passed} passed).`);
else console.log(`\nfrontier-gate: all ${passed} checks pass. ✓`);
```

### Step 2: Run the test to verify it fails for the right reason

Run: `node test/frontier-gate.test.mjs`

Expected: a module-load error — `Cannot find module '.../lib/frontier.mjs'` — **not** an assertion
failure inside a `check()`. If you see `FAIL  <name>` lines instead, `lib/frontier.mjs` already exists;
stop and investigate (this task is running out of order).

### Step 3: Commit

```bash
git add test/frontier-gate.test.mjs
git commit -m "test(frontier): lock GATE_RESULT + gateDue totality, cadence, starvation, ordering (red, P7)" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

## Acceptance Criteria
- [ ] `test/frontier-gate.test.mjs` exists and matches the harness convention exactly
- [ ] Running it fails with `Cannot find module` (RED for the right reason — no `lib/frontier.mjs` yet)
- [ ] `GATE_RESULT_KINDS` (seven kinds, §1.1 order, frozen) is asserted
- [ ] Every immediate-fire branch (`halt`/`blocked-human`/`goal-green`/inbox→`heartbeat`/`starved`),
      both batched/floor branches (`batch-full`/band `heartbeat`), the `'none'` sentinel, and the
      "`gateDue` never returns `budget-exhausted`" pin are covered
- [ ] The decision ordering (halt beats all; blocked-human beats goal-green beats starved; immediate-fire
      beats the band floor) and the two-halves starvation condition are covered
- [ ] No filesystem is touched; no file outside Scope was modified; `lib/frontier.mjs` was NOT created
