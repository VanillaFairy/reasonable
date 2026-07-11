// lib/frontier.mjs — the pure frontier-loop calculus (DESIGN-3.0 §6 the frontier loop, §9 the
// band-indexed gate cadence, §7.2 totality; reasonable 3.0 Part 7). Verdict / graph / policy /
// footprint data in, plain values out: NO disk, NO append(), NO Date, NO Math.random — the same
// purity tier as lib/rewrite.mjs and lib/ceremony.mjs, unit-tested by hand-built fixtures.
//
// The file grows across three triads, each appending a DISJOINT section below its marker (never
// editing a prior section), exactly like lib/rewrite.mjs's RULES sections and lib/graph.mjs's
// appended I/O block. The only sibling-lib dependencies are pure, dependency-free helpers, and — per
// lib/graph.mjs's own precedent — each appended section declares the one `import` it needs at the top
// of that section (ESM hoists top-level imports, so this is legal and is the repo's established shape):
//   • T02b's pack imports footprintsDisjoint from ./footprint.mjs (interfaces.md §0 correction 1);
//   • T03b's requiredRoles imports rechartingDegenerates / retroClassificationDegenerates from
//     ./ceremony.mjs (interfaces.md §1.4 — reuse the shipped degeneration predicates, never re-derive
//     them; this is the design's Decision 9/10 "reuse over reimplement").
// Never node:fs, never an I/O module, never a third-party package.
//
// The frontier WORKFLOW (workflows/frontier-wave.workflow.js) cannot import this file — the workflow
// substrate forbids `import` (CLAUDE.md invariant 5) — so it INLINES pure mirrors of pack + gateDue,
// each with a `// Mirrors lib/frontier.mjs <fn> EXACTLY` comment (the repo's groupDisjoint precedent,
// interfaces.md §0 correction 2). This file is the unit-tested source of truth those mirrors track.

// ── the exhaustive GATE_RESULT union (§6, §9) ────────────────────────────────
// Frozen; the array order is the DECISION order gateDue evaluates — immediate-fire classes first, then
// batched/floor, with budget-exhausted (the workflow's guard outcome, never a gateDue return) and the
// totality HALT last. `blocked-human`, `goal-green` and `starved` fire REGARDLESS of band; the band
// only ever moves the `heartbeat` floor (§9).
export const GATE_RESULT_KINDS = Object.freeze([
  'blocked-human',    // an always-human class (policy/goal change §3, intent fork §7.1) — BOTH modes
  'goal-green',       // a goal cone reached green — the deep umbrella audit runs at THIS gate
  'starved',          // frontier empty / below quorum while gate-held material exists (liveness valve)
  'batch-full',       // a batched class grew past its pinned bound
  'heartbeat',        // the band-indexed floor tripped (N merged atoms OR M events since last gate)
  'budget-exhausted', // the wave budget spent, no wall claimed (R1) — surfaced by the WORKFLOW guard
  'halt',             // durability / totality failure (fail-closed inside an effort)
]);

// The fixed evaluation order of the batched classes, so batch-full is deterministic when several trip.
const BATCH_ORDER = ['amendments', 'deadEndPermanence', 'extractions', 'retopology'];

/**
 * The total gate function (§7.2 totality generalized from the router to the loop). Returns EXACTLY one
 * { kind, detail? } where kind ∈ GATE_RESULT_KINDS ∪ { 'none' }. Immediate-fire classes are checked
 * first and short-circuit; then batched/floor; an unrecognized control state is a `halt`, never a
 * silent fall-through; and a check that trips nothing returns the in-band `'none'` sentinel (keep
 * looping) — never `{ kind: null }` and never an empty object. `gateDue` never returns
 * `'budget-exhausted'` (the workflow's budget membrane surfaces that).
 *
 * @param {object} state   — a pre-digested GateState snapshot (interfaces.md §1.1); every count is
 *                            already folded, gateDue does no I/O.
 * @param {object} policy  — readPolicy().policy; reads policy.cadence[band] = { n, m }.
 * @returns {{ kind: string, detail?: object }}   kind ∈ GATE_RESULT_KINDS ∪ { 'none' }
 */
export function gateDue(state, policy) {
  // 1. totality: an unknown/unrecognized control state HALTs (fail-closed inside an effort).
  if (state.controlState !== undefined && state.controlState !== 'ok') {
    return { kind: 'halt', detail: { controlState: state.controlState } };
  }
  // 2. always-human class (policy/goal change, intent fork) — blocks in BOTH modes.
  if (state.blockedHuman) {
    return { kind: 'blocked-human', detail: state.blockedHuman };
  }
  // 3. a goal cone reached green — the deep umbrella audit runs at this gate.
  if (state.goalGreen) {
    return { kind: 'goal-green', detail: state.goalGreen };
  }
  // 4. the inbox load tripwire is an immediate-fire heartbeat (NOT a distinct kind — §6's union has
  //    seven; the tripwire routes to heartbeat). Disabled at tripwire 0.
  if (state.inboxTripwire > 0 && state.inboxLoad >= state.inboxTripwire) {
    return { kind: 'heartbeat', detail: { reason: 'inbox-load' } };
  }
  // 5. the liveness valve: a wide freeze empties the frontier while gate-held material waits.
  if (state.frontierSize < state.quorum && state.gateHeldCount > 0) {
    return { kind: 'starved' };
  }
  // 6. a batched class grew past its pinned bound (first in BATCH_ORDER wins — deterministic).
  for (const k of BATCH_ORDER) {
    const count = (state.batches && state.batches[k]) || 0;
    const bound = state.batchBounds && state.batchBounds[k];
    if (Number.isFinite(bound) && count >= bound) {
      return { kind: 'batch-full', detail: { class: k } };
    }
  }
  // 7. the band-indexed floor (§9): N merged atoms OR M events since the last fired gate. The band is
  //    the cone's complexity band; fall back to a defined default band (the first cadence key) only
  //    when state.band is absent. A band with no cadence entry cannot trip the floor.
  const band = state.band !== undefined
    ? state.band
    : Object.keys((policy && policy.cadence) || {})[0];
  const cad = policy && policy.cadence ? policy.cadence[band] : undefined;
  if (cad && (state.mergedSinceGate >= cad.n || state.eventsSinceGate >= cad.m)) {
    return { kind: 'heartbeat' };
  }
  // 8. nothing tripped — the in-band, non-firing sentinel (the loop keeps going).
  return { kind: 'none' };
}

// ── ready/pack appended by T02b (do not edit above this line) ──
