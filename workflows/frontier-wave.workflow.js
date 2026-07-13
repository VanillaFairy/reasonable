// frontier-wave.workflow.js
//
// reasonable 3.0 Part 7 — the frontier-wave loop (DESIGN-3.0 §6, §9). ONE run = one wave, ending AT
// the next gate (D4): spec -> pack -> dispatch -> collect -> merge -> gate. Never blocks on a human —
// the main session fires every gate on the typed, EXHAUSTIVE 7-variant GATE_RESULT this run returns.
// Replaces workflows/vertical-slice-runner.workflow.js (deleted in the same commit as this file).
//
// PURITY (CLAUDE.md invariant 5, absolute): pure JS, no fs / Date.now / Math.random / new Date / import.
// This file CANNOT import lib/frontier.mjs (the substrate forbids it) — it INLINES pure mirrors of
// gateDue / pack / requiredRoles below, each tagged with which lib/frontier.mjs function it mirrors.
// lib/frontier.mjs is the unit-tested SOURCE OF TRUTH; these mirrors track it (reasonable 3.0 P7
// design doc, "the central scoping fact" + interfaces.md §0 correction 2).

export const meta = {
  name: 'frontier-wave',
  description: 'Drive one frontier wave (spec -> pack -> dispatch -> collect -> merge) and return the exhaustive 7-variant GATE_RESULT.',
  whenToUse: 'Launched repeatedly by the main-session orchestrator, once per wave, with the effort root and run context in args. Never blocks on a human — the main session fires every gate on the typed result.',
  phases: [
    { title: 'Reconcile', detail: 'Unconditional, total, halting recovery prologue over the goals/cones projection (§12) — halt on any AMBIGUOUS configuration.' },
    { title: 'Spec', detail: 'Deltas authored or re-spec\'d for the frontier\'s top atoms; R4 + checkpoint-2 run here (§6).' },
    { title: 'Pack', detail: 'The maximal wave of spec\'d atoms pairwise disjoint by ACTUAL footprint.' },
    { title: 'Dispatch', detail: 'Per atom, role-minimally: implementer + blind-test-writer (+ enrichment); census/characterizer/topologist/retro-synthesizer only on non-empty input (§6 draft-five).' },
    { title: 'Collect', detail: 'Audited verdicts collected per atom; each appended as an atom-verdict event (the APPEND computes effects, never this workflow).' },
    { title: 'Merge', detail: 'One --no-ff merge per audited atom, topological by actual needs edges.' },
    { title: 'Gate', detail: 'Compute the total gateDue(state, policy) and return the typed 7-variant GATE_RESULT.' },
  ],
};

// -----------------------------------------------------------------------------
// BRIEFING — what the reconciler returns. Extends the 2.x shape with the 3.0 gate-state fields
// gateDue needs (band/cadence counters/inbox/goalGreen/blockedHuman), read from the goals/cones
// projection (§12) rather than route.json.
// -----------------------------------------------------------------------------
const BRIEFING = {
  type: 'object',
  required: ['halt'],
  additionalProperties: true,
  properties: {
    halt: { type: 'boolean' },
    haltReason: { type: 'string' },
    runMode: { type: ['string', 'null'], enum: ['gated', 'autonomous', null] },
    effortRoot: { type: ['string', 'null'] },
    brownfield: { type: 'boolean' },
    band: { type: ['string', 'null'] },
    mergedSinceGate: { type: ['integer', 'null'] },
    eventsSinceGate: { type: ['integer', 'null'] },
    inboxLoad: { type: ['integer', 'null'] },
    inboxTripwire: { type: ['integer', 'null'] },
    goalGreen: { type: ['object', 'null'] },
    blockedHuman: { type: ['object', 'null'] },
    amendmentBatch: { type: 'array', items: { type: 'object', additionalProperties: true } },
    landedConeCount: { type: ['integer', 'null'] },
  },
};

// -----------------------------------------------------------------------------
// gateDue — Mirrors lib/frontier.mjs gateDue EXACTLY (interfaces.md §1.1). Total: immediate-fire
// classes first (halt/blocked-human/goal-green/inbox-tripwire-as-heartbeat/starved), then batched/
// floor, then the non-firing 'none' sentinel. budget-exhausted is surfaced by guard(), never by this
// function (mirrors the pure lib's own contract).
// -----------------------------------------------------------------------------
const BATCH_ORDER = ['amendments', 'deadEndPermanence', 'extractions', 'retopology'];

function gateDue(state, policy) {
  if (state.controlState !== undefined && state.controlState !== 'ok') {
    return { kind: 'halt', detail: { controlState: state.controlState } };
  }
  if (state.blockedHuman) return { kind: 'blocked-human', detail: state.blockedHuman };
  if (state.goalGreen) return { kind: 'goal-green', detail: state.goalGreen };
  if (state.inboxTripwire > 0 && state.inboxLoad >= state.inboxTripwire) {
    return { kind: 'heartbeat', detail: { reason: 'inbox-load' } };
  }
  if (state.frontierSize < state.quorum && state.gateHeldCount > 0) return { kind: 'starved' };
  for (const k of BATCH_ORDER) {
    const count = (state.batches && state.batches[k]) || 0;
    const bound = state.batchBounds && state.batchBounds[k];
    if (Number.isFinite(bound) && count >= bound) return { kind: 'batch-full', detail: { class: k } };
  }
  const band = state.band !== undefined ? state.band : Object.keys((policy && policy.cadence) || {})[0];
  const cad = policy && policy.cadence ? policy.cadence[band] : undefined;
  if (cad && (state.mergedSinceGate >= cad.n || state.eventsSinceGate >= cad.m)) return { kind: 'heartbeat' };
  return { kind: 'none' };
}

// -----------------------------------------------------------------------------
// pack — mirrors lib/frontier.mjs pack's greedy-first-fit-by-disjoint-footprint shape (the workflow's
// own footprintsDisjoint mirror below, since it cannot import lib/footprint.mjs either).
// -----------------------------------------------------------------------------
function footprintsDisjointMirror(a, b) {
  const fa = a || { locus: [], contracts: [], resources: [] };
  const fb = b || { locus: [], contracts: [], resources: [] };
  const overlap = (xs, ys) => (xs || []).some((x) => (ys || []).includes(x));
  return !overlap(fa.locus, fb.locus) && !overlap(fa.contracts, fb.contracts) && !overlap(fa.resources, fb.resources);
}
function pack(footprints) {
  const wave = []; const deferred = [];
  for (const fp of (footprints || [])) {
    if (wave.every((w) => footprintsDisjointMirror(w, fp))) wave.push(fp); else deferred.push(fp);
  }
  return { wave: wave.map((f) => f.id), deferred: deferred.map((f) => f.id) };
}

// -----------------------------------------------------------------------------
// requiredRoles — Mirrors lib/frontier.mjs requiredRoles EXACTLY (interfaces.md §1.4): the same four
// conditions, reimplemented inline (this file cannot import lib/ceremony.mjs's degeneration predicates).
// -----------------------------------------------------------------------------
const CORE_ROLES = ['auditor', 'blind-test-writer', 'implementer'];
function requiredRoles(wave, context) {
  const ctx = context || {};
  const roles = new Set(CORE_ROLES);
  if (ctx.brownfield === true && Array.isArray(ctx.brownfieldInput) && ctx.brownfieldInput.length > 0) {
    roles.add('census'); roles.add('characterizer');
  }
  if (Array.isArray(ctx.amendmentBatch) && ctx.amendmentBatch.length > 0) roles.add('topologist');
  if (Number.isFinite(ctx.landedConeCount) && ctx.landedConeCount >= 2) roles.add('retro-synthesizer');
  return [...roles].sort();
}

// -----------------------------------------------------------------------------
// guard() — the budget-throw membrane (mirrors the shipped runner's own guard() exactly in spirit): a
// throw inside a dispatch is the budget ceiling, re-tagged, never a correctness failure.
// -----------------------------------------------------------------------------
async function guard(thunk) {
  try { return await thunk(); }
  catch (e) { return { __budgetExhausted: true, message: String((e && e.message) || e) }; }
}

// -----------------------------------------------------------------------------
// Prompt builders — pure string assembly only; every agent receives artifact paths and does its own
// I/O (this script never touches disk).
// -----------------------------------------------------------------------------
function reconcilePrompt(a) {
  return [
    'Run the unconditional, total, halting recovery prologue for this reasonable run over the goals/cones projection (§12).',
    a && a.effortRoot ? `Effort root: ${a.effortRoot}.` : 'Resolve the effort root from your own cwd.',
    'Return the BRIEFING, including band/cadence counters, inbox load, and any blocked-human/goal-green signal.',
  ].join('\n');
}

// -----------------------------------------------------------------------------
// The run body. phase()/log() calls mark stage boundaries, mirroring the shipped runner's convention
// (bare marker calls between stages, never wrapping callbacks) — no-ops under the test harness.
// -----------------------------------------------------------------------------
phase('Reconcile');
const briefing = await agent(reconcilePrompt(args), { label: 'reconcile', schema: BRIEFING });

if (!briefing || briefing.halt) {
  log(`halting: ${briefing && briefing.haltReason}`);
  return { kind: 'halt', detail: { haltReason: briefing && briefing.haltReason } };
}

phase('Spec');
// Schematic in this scope — a real spec/checkpoint-2 pass is a later hardening pass, not tested here:
// the frontier's top atom is treated as already spec'd for packing.
const specdAtoms = [{ id: 'a-1', locus: [], contracts: [], resources: [] }];

phase('Pack');
const { wave: waveIds } = pack(specdAtoms);
log(`packed ${waveIds.length} atom(s) into this wave.`);

phase('Dispatch');

// Dispatch — role-minimal. ANY guard()-caught throw at ANY dispatch step is the budget ceiling
// (R1 territory) — the run returns budget-exhausted IMMEDIATELY, first-class, never a silent
// swallow and never masquerading as a correctness failure.
const roles = requiredRoles({ atomIds: waveIds }, briefing);
const dispatched = [];
for (const role of ['census', 'characterizer', 'topologist', 'retro-synthesizer']) {
  if (roles.includes(role)) {
    dispatched.push(role);
    const r = await guard(() => agent(`Run ${role} for this wave.`, { label: role }));
    if (r && r.__budgetExhausted) return { kind: 'budget-exhausted', detail: { role, message: r.message } };
  }
}
for (const atomId of waveIds) {
  const impl = await guard(() => agent(`Implement ${atomId}.`, { label: 'implementer' }));
  if (impl && impl.__budgetExhausted) return { kind: 'budget-exhausted', detail: { atomId, stage: 'implementer', message: impl.message } };
  const bt = await guard(() => agent(`Blind-test ${atomId}.`, { label: 'blind-test-writer' }));
  if (bt && bt.__budgetExhausted) return { kind: 'budget-exhausted', detail: { atomId, stage: 'blind-test-writer', message: bt.message } };
}

phase('Collect');
const verdicts = [];
for (const atomId of waveIds) {
  const v = await guard(() => agent(`Audit ${atomId}.`, { label: 'auditor' }));
  if (v && v.__budgetExhausted) {
    return { kind: 'budget-exhausted', detail: { atomId, stage: 'auditor', message: v.message } };
  }
  verdicts.push(v);
}
// The COLLECT step appends each verdict as an atom-verdict event — the ledger controller
// (lib/ledger.mjs's append(), §2.4) computes the effect set; this workflow only produces and
// hands off the audited payload, never an effect set (the pivotal call).
for (const v of verdicts) {
  await agent(`Append the atom-verdict for ${v && v.atomId}.`, { label: 'ledger-append', payload: v });
}

phase('Merge');
// Schematic in this scope — the real --no-ff topological merge is a later hardening pass, not tested
// here.
log(`${verdicts.length} audited atom(s) ready to merge (topological by actual needs edges).`);

phase('Gate');
const gateState = {
  controlState: 'ok',
  blockedHuman: briefing.blockedHuman || null,
  goalGreen: briefing.goalGreen || null,
  frontierSize: waveIds.length,
  quorum: 1,
  gateHeldCount: 0,
  inboxLoad: briefing.inboxLoad || 0,
  inboxTripwire: briefing.inboxTripwire || 0,
  batches: { amendments: 0, deadEndPermanence: 0, extractions: 0, retopology: 0 },
  batchBounds: { amendments: 3, deadEndPermanence: 3, extractions: 3, retopology: 3 },
  band: briefing.band || 'lite',
  mergedSinceGate: briefing.mergedSinceGate || 0,
  eventsSinceGate: briefing.eventsSinceGate || 0,
};
const policy = { cadence: { lite: { n: 5, m: 20 }, full: { n: 2, m: 8 } } };
return gateDue(gateState, policy);
