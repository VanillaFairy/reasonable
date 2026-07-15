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
    { title: 'Dispatch', detail: 'Per atom, concurrently: lane-provision -> implement -> reprovision -> blind-test -> commit-tests -> adjudicate (bounded retry) -> audit; census/characterizer/topologist/retro-synthesizer only on non-empty input (§6 draft-five).' },
    { title: 'Collect', detail: 'Each atom\'s terminal outcome translated via verdict-writer into real ledger events — a full green pass\'s lifecycle progression, or a checkpoint/ripple atom-verdict (R1/R3) — never a bespoke effect set computed here.' },
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
    frontier: { type: 'array', items: { type: 'string' } },
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
const CORE_ROLES = ['adjudicator', 'auditor', 'blind-test-writer', 'implementer'];
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
function specAuthorPrompt(a, atomId) {
  return [
    `Author the real spec-time delta for atom ${atomId} (§4.1: from the canonical contract state,`,
    'the goal scenario, and everything landed). Write your own component contract + the machine delta;',
    `persist via lib/spec.mjs --author. Effort root: ${a && a.effortRoot}. Return { ok, atomId }.`,
  ].join('\n');
}
function footprintPrompt(a, ids) {
  return [
    'Run the spec-time decidable fences over the PERSISTED deltas and return them verbatim:',
    'lib/footprint.mjs --atoms (actual footprints) and lib/spec.mjs --guard (cohesion + checkpoint-2).',
    `Effort root: ${a && a.effortRoot}. Atom ids: ${(ids || []).join(', ')}.`,
  ].join('\n');
}
// lanePrompt covers BOTH lane-provisioner modes (agents/lane-provisioner.md): no worktreeHint ->
// fresh provision (worktree/deps/descriptor/journal-confirm, role e.g. 'implementer'); a worktreeHint
// given -> the SAME lane's role-transition re-provision (role e.g. 'blind-test-writer'), overwriting
// only the descriptor's narrowing, per that agent's "Re-provisioning for a role transition" section.
function lanePrompt(a, atomId, role, worktreeHint) {
  return [
    worktreeHint
      ? `Re-provision atom ${atomId}'s EXISTING lane for a role transition to ${role} (same worktree, descriptor role/testEditsAllowed/locus rewritten in place).`
      : `Provision a fresh lane for atom ${atomId} (role: ${role}), cut from the effort branch.`,
    `Effort root: ${a && a.effortRoot}. Effort branch: ${a && a.effortBranch}.`,
    worktreeHint ? `Existing worktree: ${worktreeHint}.` : 'Create the worktree nested under the effort root (.worktrees/<atomId>).',
    'Follow agents/lane-provisioner.md\'s exact ordered steps and idempotency rules.',
    'Return { provisioned, worktree, branch, descriptorWritten, depsReady, journalRecorded }.',
  ].join('\n');
}
function implementPrompt(a, atomId, worktree, redoAttempt) {
  return [
    `Implement atom ${atomId} to GREEN within its declared locus, inside the provisioned lane worktree.`,
    `Lane worktree: ${worktree}. Effort root: ${a && a.effortRoot}.`,
    redoAttempt > 1
      ? `Redo attempt ${redoAttempt} — an earlier pass in this atom's chain did not reach a clean audit.`
      : 'First pass.',
    'Emit the OUTCOME tagged union (agents/implementer.md) naming exactly one terminal kind.',
  ].join('\n');
}
function blindTestPrompt(a, atomId, worktree) {
  return [
    `Translate atom ${atomId}'s contract delta into test changes, blind to the implementation.`,
    `Lane worktree: ${worktree}. Effort root: ${a && a.effortRoot}.`,
    'You have no Bash — stage the test files; the lane-committer lands them durably.',
  ].join('\n');
}
function commitTestsMessage(atomId) {
  return `test(${atomId}): land the blind-test-writer's staged tests\n\nWork-Order: ${atomId}`;
}
function commitTestsPrompt(a, atomId, worktree, message) {
  return [
    `Land the blind-test-writer's staged work product for atom ${atomId} on the lane branch in one trailered commit.`,
    `Lane worktree: ${worktree}.`,
    `Commit message (pass verbatim, already carries the Work-Order trailer): ${message}`,
    'Return { persisted, committed } on success, or persisted:false + a one-line reason on a durability gap.',
  ].join('\n');
}
function adjudicatePrompt(a, atomId, worktree) {
  return [
    `Run atom ${atomId}'s lane suite and judge each red against the contract text as sole arbiter.`,
    `Lane worktree: ${worktree}. Effort root: ${a && a.effortRoot}.`,
    'Return an OUTCOME-shaped verdict: { kind, atomId, ... }.',
  ].join('\n');
}
function auditPrompt(a, atomId, worktree) {
  return [
    `Verify atom ${atomId}'s GREEN claim with escalating mechanical teeth (discriminator, bidirectional`,
    'mapping, mutation sampling, proportionality).',
    `Lane worktree: ${worktree}. Effort root: ${a && a.effortRoot}.`,
    'Return an OUTCOME-shaped verdict: { kind, atomId, ... }.',
  ].join('\n');
}
function verdictWriterPrompt(a, event) {
  return [
    'Append exactly ONE ledger event through the controller CLI — the event this dispatch hands you,',
    'verbatim (never add seq/ts, never originate a SHA).',
    `Effort root: ${a && a.effortRoot}.`,
    `Event JSON: ${JSON.stringify(event)}`,
    'Return { persisted } on a durable append, or persisted:false + why on failure.',
  ].join('\n');
}

// -----------------------------------------------------------------------------
// dispatchAtom — the real per-atom Dispatch pipeline (DESIGN-3.0 §6's four unconditional stages plus
// lane lifecycle): provision -> implement -> reprovision (unconditional on green) -> blind-test ->
// commit-tests (unconditional) -> adjudicate -> audit. guard() wraps every agent() call, so a
// budget-ceiling throw at ANY stage becomes an immediate R1 checkpoint result, never a retry and never
// the wave-level budget-exhausted kind. Every other non-green outcome (implementer's own scope-
// expansion/jurisdiction/spike-needed/infeasible/characterization-needed/intent-fork/other, a hard-
// stopped provision/reprovision, a persisted:false commit ack, or a non-green/non-checkpoint
// adjudicator/auditor kind) shares ONE bounded-retry counter capped at 2 attempts total, always
// re-dispatching from a fresh implementer pass — the already-provisioned lane is reused (only an
// initial-provision failure re-attempts provision itself, since no lane exists yet to reuse). At the
// cap, the atom escalates to blocked-human. Returns a terminal per-atom result; Collect (the run body
// below) translates it into the real ledger events.
// -----------------------------------------------------------------------------
const RETRY_CAP = 2;

function atomBlockedHuman(atomId, detail) {
  return { atomId, kind: 'blocked-human', detail: { class: 'atom-dispatch-exhausted', atomId, detail } };
}

// budgetCeiling — the one shape every guard()-wrapped stage's budget check reduces to: a truthy
// __budgetExhausted result becomes this atom's terminal R1 checkpoint (never a retry, never the
// wave-level budget-exhausted kind); a falsy result means the caller keeps going. Called identically
// at all seven dispatch stages below — the ONLY thing that varies per site is the stage name.
function budgetCeiling(atomId, stage, result) {
  return (result && result.__budgetExhausted)
    ? { atomId, kind: 'checkpoint', evidence: `budget ceiling during ${stage}: ${result.message}` }
    : null;
}

async function dispatchAtom(atomId) {
  let worktree = null;
  let attempts = 0;
  let lastFailure = null;

  while (attempts < RETRY_CAP) {
    attempts += 1;

    if (!worktree) {
      const ack = await guard(() => agent(lanePrompt(args, atomId, 'implementer'), { label: `provision:${atomId}` }));
      const bc = budgetCeiling(atomId, 'lane-provisioner (provision)', ack);
      if (bc) return bc;
      if (!ack || !ack.worktree || ack.descriptorWritten !== true) {
        lastFailure = { stage: 'provision', ack };
        if (attempts >= RETRY_CAP) return atomBlockedHuman(atomId, lastFailure);
        continue;
      }
      worktree = ack.worktree;
    }

    const impl = await guard(() => agent(implementPrompt(args, atomId, worktree, attempts), { label: `implement:${atomId}` }));
    const implBc = budgetCeiling(atomId, 'implementer', impl);
    if (implBc) return implBc;
    if (!impl || impl.kind !== 'green') {
      if (impl && impl.kind === 'ripple') {
        const manifest = Array.isArray(impl.manifest)
          ? impl.manifest.map((m) => ({ component: m.contract, clause: m.clause, type: m.type }))
          : [];
        return { atomId, kind: 'ripple', manifest };
      }
      if (impl && impl.kind === 'checkpoint') {
        return { atomId, kind: 'checkpoint', evidence: impl.evidence || 'implementer checkpoint' };
      }
      // scope-expansion / jurisdiction / spike-needed / infeasible / characterization-needed /
      // intent-fork / other / missing — the implementer's own non-green failure, same shared cap.
      lastFailure = { stage: 'implementer', outcome: impl };
      if (attempts >= RETRY_CAP) return atomBlockedHuman(atomId, lastFailure);
      continue;
    }

    const reprov = await guard(() => agent(lanePrompt(args, atomId, 'blind-test-writer', worktree), { label: `reprovision:${atomId}` }));
    const reprovBc = budgetCeiling(atomId, 'lane-provisioner (reprovision)', reprov);
    if (reprovBc) return reprovBc;
    if (!reprov || !reprov.worktree || reprov.descriptorWritten !== true) {
      lastFailure = { stage: 'reprovision', ack: reprov };
      if (attempts >= RETRY_CAP) return atomBlockedHuman(atomId, lastFailure);
      continue;
    }
    worktree = reprov.worktree;

    const bt = await guard(() => agent(blindTestPrompt(args, atomId, worktree), { label: `blindtest:${atomId}` }));
    const btBc = budgetCeiling(atomId, 'blind-test-writer', bt);
    if (btBc) return btBc;

    const commitAck = await guard(() => agent(
      commitTestsPrompt(args, atomId, worktree, commitTestsMessage(atomId)),
      { label: `committests:${atomId}` },
    ));
    const commitBc = budgetCeiling(atomId, 'lane-committer', commitAck);
    if (commitBc) return commitBc;
    if (!commitAck || commitAck.persisted !== true) {
      lastFailure = { stage: 'lane-committer', ack: commitAck };
      if (attempts >= RETRY_CAP) return atomBlockedHuman(atomId, lastFailure);
      continue;
    }

    const adj = await guard(() => agent(adjudicatePrompt(args, atomId, worktree), { label: `adjudicate:${atomId}` }));
    const adjBc = budgetCeiling(atomId, 'adjudicator', adj);
    if (adjBc) return adjBc;
    if (!adj || adj.kind !== 'green') {
      if (adj && adj.kind === 'checkpoint') {
        return { atomId, kind: 'checkpoint', evidence: adj.evidence || 'adjudicator checkpoint' };
      }
      lastFailure = { stage: 'adjudicator', outcome: adj };
      if (attempts >= RETRY_CAP) return atomBlockedHuman(atomId, lastFailure);
      continue;
    }

    const audit = await guard(() => agent(auditPrompt(args, atomId, worktree), { label: `audit:${atomId}` }));
    const auditBc = budgetCeiling(atomId, 'auditor', audit);
    if (auditBc) return auditBc;
    if (!audit || audit.kind !== 'green') {
      lastFailure = { stage: 'auditor', outcome: audit };
      if (attempts >= RETRY_CAP) return atomBlockedHuman(atomId, lastFailure);
      continue;
    }

    return { atomId, kind: 'green' };
  }

  // Defensive fallback, not dead code to delete: every failure branch above already returns once
  // attempts >= RETRY_CAP, so the while condition going false without an explicit return never
  // actually happens today. It stays as a safety net against a future stage forgetting its own cap
  // check (silently falling out of the loop with attempts exhausted and no verdict).
  return atomBlockedHuman(atomId, lastFailure);
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
// §6: spec first. Author each ready frontier atom's real delta (ready -> spec'd). Serial safety via
// parallel-then-collect; the spec-author is fenced (own contract + machine delta only).
const frontier = briefing.frontier || [];
const specd = (await parallel(frontier.map((atomId) => () =>
  guard(() => agent(specAuthorPrompt(args, atomId), { label: 'spec-author', atomId }))
)));
for (const s of specd) {
  if (s && s.__budgetExhausted) return { kind: 'budget-exhausted', detail: { stage: 'spec-author', message: s.message } };
}
const specdIds = specd.filter((s) => s && s.ok).map((s) => s.atomId);

// The spec-time decidable fences (§4.3 cohesion + §7.2 checkpoint-2) + actual footprints, computed by
// the footprinter over the PERSISTED deltas (independent of the author's self-report).
const fenced = specdIds.length
  ? await guard(() => agent(footprintPrompt(args, specdIds), { label: 'footprinter', atomIds: specdIds }))
  : { footprints: [] };
if (fenced && fenced.__budgetExhausted) return { kind: 'budget-exhausted', detail: { stage: 'footprinter', message: fenced.message } };

phase('Pack');
// Route the fence verdicts: an oversized atom (R4 — the split is A3) or a guard-halted atom
// (checkpoint-2 hit) is held OUT of this wave. A2 drops it; A3's verdict->state fold persists the
// split/halt effect. At greenfield genesis no atom is dropped (cohesive deltas, no live radii).
const perAtom = (fenced && fenced.footprints) || [];
const packable = perAtom.filter((f) =>
  !(f.cohesion && f.cohesion.kind === 'oversized') &&
  !(f.checkpoint2 && f.checkpoint2.kind === 'guard-halted'));
const heldOut = perAtom.length - packable.length;
if (heldOut > 0) log(`${heldOut} atom(s) held out of the wave by a spec-time fence (R4/checkpoint-2).`);
const { wave: waveIds } = pack(packable);
log(`packed ${waveIds.length} atom(s) into this wave on actual footprints.`);

// The spec'd -> packed batch transition: real, once per atom in this wave, BEFORE any per-atom
// pipeline starts (a courtesy WAVE-level progression, not part of any atom's own bounded retry —
// a budget throw here is non-fatal to the wave, it simply leaves this transition unlanded for that
// atom rather than aborting the whole run).
for (const atomId of waveIds) {
  await guard(() => agent(
    verdictWriterPrompt(args, { type: 'atom-transitioned', atomId, from: "spec'd", to: 'packed' }),
    { label: 'verdict-writer' },
  ));
}

phase('Dispatch');

// Dispatch — role-minimal. A guard()-caught throw from a wave-level role (census/characterizer/
// topologist/retro-synthesizer) is the budget ceiling (R1 territory) at WAVE scope — the run returns
// budget-exhausted IMMEDIATELY. Below that, the real per-atom pipeline (provision -> implement ->
// reprovision -> blind-test -> commit-tests -> adjudicate -> audit) runs concurrently across
// waveIds via pipeline() (no barrier — matches pack()'s footprint-disjoint guarantee). A
// guard()-caught throw INSIDE an atom's own chain becomes that atom's R1 checkpoint result, never
// this wave-level budget-exhausted kind (see dispatchAtom above).
const roles = requiredRoles({ atomIds: waveIds }, briefing);
const dispatched = [];
for (const role of ['census', 'characterizer', 'topologist', 'retro-synthesizer']) {
  if (roles.includes(role)) {
    dispatched.push(role);
    const r = await guard(() => agent(`Run ${role} for this wave.`, { label: role }));
    if (r && r.__budgetExhausted) return { kind: 'budget-exhausted', detail: { role, message: r.message } };
  }
}
const atomResults = await pipeline(waveIds, (atomId) => dispatchAtom(atomId));

phase('Collect');
// Translate each atom's terminal result into real ledger effects via verdict-writer: a full-green
// pass lands the three real lifecycle events it earned (packed->tests-red, tests-red->green,
// green->audited); a checkpoint/ripple lands the matching R1/R3 atom-verdict (lib/rewrite.mjs's
// ruleCheckpoint/ruleRipple); a blocked-human result writes no ledger event and instead feeds the
// Gate's blockedHuman signal below.
const auditedAtoms = [];
const blockedAtoms = [];
for (const r of atomResults) {
  if (!r) continue;
  if (r.kind === 'green') {
    auditedAtoms.push(r.atomId);
    await guard(() => agent(
      verdictWriterPrompt(args, { type: 'atom-transitioned', atomId: r.atomId, from: 'packed', to: 'tests-red' }),
      { label: 'verdict-writer' },
    ));
    await guard(() => agent(
      verdictWriterPrompt(args, { type: 'atom-transitioned', atomId: r.atomId, from: 'tests-red', to: 'green' }),
      { label: 'verdict-writer' },
    ));
    await guard(() => agent(
      verdictWriterPrompt(args, { type: 'atom-transitioned', atomId: r.atomId, from: 'green', to: 'audited' }),
      { label: 'verdict-writer' },
    ));
  } else if (r.kind === 'checkpoint') {
    await guard(() => agent(
      verdictWriterPrompt(args, { type: 'atom-verdict', atomId: r.atomId, kind: 'checkpoint', evidence: r.evidence }),
      { label: 'verdict-writer' },
    ));
  } else if (r.kind === 'ripple') {
    await guard(() => agent(
      verdictWriterPrompt(args, { type: 'atom-verdict', atomId: r.atomId, kind: 'ripple', manifest: r.manifest }),
      { label: 'verdict-writer' },
    ));
  } else if (r.kind === 'blocked-human') {
    blockedAtoms.push(r);
  }
}

phase('Merge');
// Schematic in this scope — the real --no-ff topological merge is a later hardening pass, not tested
// here.
log(`${auditedAtoms.length} audited atom(s) ready to merge (topological by actual needs edges).`);

phase('Gate');
const gateState = {
  controlState: 'ok',
  blockedHuman: briefing.blockedHuman || (blockedAtoms.length
    ? { class: 'atom-dispatch-exhausted', atomId: blockedAtoms[0].atomId, atoms: blockedAtoms.map((b) => b.atomId), detail: blockedAtoms[0].detail }
    : null),
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
