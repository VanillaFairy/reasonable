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

if (process.exitCode) console.error(`\nfrontier-gate: FAILURES above (${passed} passed).`);
else console.log(`\nfrontier-gate: all ${passed} checks pass. ✓`);
