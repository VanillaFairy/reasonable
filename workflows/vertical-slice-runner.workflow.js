// vertical-slice-runner.workflow.js
//
// reasonable 2.0 — the pure in-run plane (architecture §18 sketch + §7/§8/§12/§15).
//
// ONE Workflow run = exactly ONE vertical slice, driven toward GREEN, ending AT the
// retro gate, never through it (D4, §7). The run does not block on a human; it returns
// a typed GATE_RESULT and the main-session decision plane runs the human-blocking retro.
//
// Shape (architecture §19 sketch, faithfully):
//   reconcile prologue (agent)  ─ unconditional, total, halting recovery (§12, D8b/D9)
//     └ if state.halt → return {kind:'halt'}
//   route-planner (agent)       ─ footprints + resources + trust-staleness (§6, §16, D11/D13)
//   groupDisjoint (pure)        ─ set-algebra over locus | contract | resource (mirrors
//                                  lib/footprint.mjs independent(), D11)
//   budget + agent-cap guarded while loop (§15, D16a/D16c)
//     per wave: the enrichment pipeline() (§5.6, no barrier, §8)
//        [ provisionThenImplement → blindTest → adjudicate → audit ]
//        each agent() guard()-wrapped: a budget THROW → {kind:'checkpoint'} (D16b)
//        provisionThenImplement folds in the conditional brownfield genesis prologue:
//        the in-run `characterization-needed` agent sequence (BF7) — NOT a nested
//        workflow() (one-level nesting forbids it, §15 D16d).
//     trap router: switch over OUTCOME.kind → its pre-written membrane crossing (§8)
//     serial journalWrite (the script's only derived-index write); null → HALT (§6, D3b)
//   computeGreen = floorGreen && trustedGreen (BF3)
//   return toGateResult(...) → green | budget-exhausted | blocked | halt (§7, BF9)
//
// PURITY (substrate ref, absolute): pure JS, no fs / Date.now / Math.random / new Date();
// no imports — every schema literal and helper (guard) is inlined; all side effects happen
// INSIDE agents; the script orchestrates and never touches disk. Control flow is fixed per
// run — dynamism is loop-count (budget-guarded) + pipeline()/parallel(), never new shape.
// This script holds ZERO enforcement authority (§13): the fence + per-agentType allowlists
// bind beside and under the agents regardless of who spawned them.

export const meta = {
  name: 'vertical-slice-runner',
  description: 'Drive one reasonable vertical slice to GREEN and return a typed GATE_RESULT (green | budget-exhausted | blocked | halt).',
  whenToUse: 'Launched once per vertical slice by the reasonable main-session orchestrator, with the vertical-slice id, route snapshot, contract paths, per-slice budget, supervision profile, and run mode in args.',
  phases: [
    { title: 'Reconcile', detail: 'Unconditional, total, halting recovery prologue — re-derive truth from git+ledger+contracts; halt on any AMBIGUOUS configuration.' },
    { title: 'Plan', detail: 'Route-planner computes per-work-order footprints (locus ∪ citation closure), resource claims, and the trust-staleness set.' },
    { title: 'Enrich', detail: 'Per disjoint wave, the enrichment pipeline: provision+implement (with conditional brownfield characterization genesis) → blind test → adjudicate → audit.' },
    { title: 'Gate', detail: 'Compute floorGreen && trustedGreen and return the typed GATE_RESULT for the main-session retro.' },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Inline schema literals (the tagged unions the agents are schema-forced to emit,
// and the structures the script consumes). Kept inline — no imports allowed.
// ─────────────────────────────────────────────────────────────────────────────

// BRIEFING — what the reconciler returns (architecture §12, agents/reconciler.md).
// `halt` is the total function's AMBIGUOUS bucket surfacing as a blocking decision.
const BRIEFING = {
  type: 'object',
  required: ['halt'],
  additionalProperties: true,
  properties: {
    halt: { type: 'boolean' },
    haltReason: { type: 'string' },
    evidence: { type: 'object', additionalProperties: true },
    runMode: { type: ['string', 'null'], enum: ['gated', 'autonomous', null] },
    currentVerticalSlice: { type: ['string', 'null'] },
    brownfield: { type: 'boolean' },
    // The trust-staleness set: trusted-green tests whose governing clause was
    // amended/extended since last verification (§16, D13) — marked for re-verify.
    staleTrusted: { type: 'array', items: { type: 'string' } },
    inbox: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: true,
        properties: { id: { type: 'string' }, class: { type: 'string', enum: ['BREAKING', 'ADVISORY'] } },
      },
    },
    floor: { type: 'array', items: { type: 'string' } },
    trusted: { type: 'array', items: { type: 'string' } },
  },
};

// ROUTE_PLAN — what the route-planner returns: per work order, BOTH the
// locus/citation footprint AND the resource-claim set, so groupDisjoint can run
// pure set-algebra (architecture §6, D11). Footprint mirrors lib/footprint.mjs.
const ROUTE_PLAN = {
  type: 'object',
  required: ['workOrders'],
  additionalProperties: true,
  properties: {
    workOrders: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'footprint'],
        additionalProperties: true,
        properties: {
          id: { type: 'string' },
          role: { type: 'string' },
          verticalSlice: { type: 'string' },
          footprint: {
            type: 'object',
            required: ['locus', 'contracts', 'resources'],
            additionalProperties: true,
            properties: {
              locus: { type: 'array', items: { type: 'string' } },      // glob loci
              contracts: { type: 'array', items: { type: 'string' } },  // incl. citation closure
              resources: { type: 'array', items: { type: 'string' } },  // resource-lexicon claims
            },
          },
          // Marks a work order whose first touch crosses ungoverned brownfield code
          // → the in-run characterization genesis fires before implementation (BF7).
          characterizationNeeded: { type: 'boolean' },
          behaviorDelta: { type: 'array', items: { type: 'string' } },
          // The trust-staleness re-verify flag for this work order (D13).
          staleTrusted: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    rationale: { type: 'string' },
  },
};

// BRIEFING for a single brownfield characterization step (the in-run genesis, BF7).
const CHARACTERIZATION = {
  type: 'object',
  required: ['kind'],
  additionalProperties: true,
  properties: {
    kind: { type: 'string', enum: ['characterized', 'not-needed', 'checkpoint', 'other'] },
    component: { type: 'string' },
    clauses: { type: 'array', items: { type: 'string' } },
    seam: { type: 'string' },
    behaviorDelta: { type: 'array', items: { type: 'string' } },
    note: { type: 'string' },
  },
};

// OUTCOME — every lane-running agent is schema-forced to emit this tagged union;
// the trap router switches on `kind` (architecture §8, D5/D12).
const OUTCOME = {
  type: 'object',
  required: ['kind', 'workOrder'],
  additionalProperties: true,
  properties: {
    kind: {
      type: 'string',
      enum: [
        'green', 'scope-expansion', 'ripple', 'jurisdiction', 'spike-needed',
        'infeasible', 'checkpoint', 'intent-fork', 'other',
      ],
    },
    workOrder: { type: 'string' },
    verticalSlice: { type: 'string' },
    // green evidence (the audit stage fills this): which tests, which checks passed.
    evidence: { type: 'object', additionalProperties: true },
    // floor-break accounting for the two-oracle collision classifier (BF9).
    floorBreak: {
      type: 'object',
      additionalProperties: true,
      properties: {
        broke: { type: 'boolean' },
        floorTests: { type: 'array', items: { type: 'string' } },
        loci: { type: 'array', items: { type: 'string' } },
      },
    },
    behaviorDelta: { type: 'array', items: { type: 'string' } },
    // loci of new GROWN tests (RED-at-HEAD~) that now govern, for the BF9 classifier.
    newGrownTestLoci: { type: 'array', items: { type: 'string' } },
    // free-form per-arm payload (added locus, ripple manifest id, binding constraint…).
    detail: { type: 'object', additionalProperties: true },
    note: { type: 'string' },
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// guard() — the budget-throw membrane (architecture §15, D16b).
//
// The engine THROWS from agent() once budget.spent() >= budget.total. A throw is a
// budget ceiling, NOT a verification gap; we must never let it masquerade as a
// correctness failure. guard() catches the throw and re-tags it as a checkpoint
// OUTCOME so the trap router triages the budget rather than (wrongly) failing the
// vertical slice. A `null` agent return is a DIFFERENT thing: user-skip / terminal
// API error = a real verification gap → the slice does not close (we map it to a
// checkpoint-flavored gap too, but flagged distinctly so the gate stays RED).
// ─────────────────────────────────────────────────────────────────────────────
async function guard(workOrder, thunk) {
  try {
    const result = await thunk();
    if (result === null) {
      // null = skip / terminal error → a verification gap, the slice must NOT close.
      return { kind: 'checkpoint', workOrder, note: 'agent returned null (skip or terminal error) — verification gap', detail: { gap: true } };
    }
    return result;
  } catch (e) {
    // Any throw inside a wave is treated as the budget ceiling (the only thing the
    // engine throws for at this layer) → checkpoint, never a silent pass/fail.
    return { kind: 'checkpoint', workOrder, note: 'budget ceiling reached (agent() threw)', detail: { budgetThrow: true, message: String(e && e.message || e) } };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// groupDisjoint — pure set-algebra over the route-planner's footprints (D11).
//
// Mirrors lib/footprint.mjs independent() EXACTLY: serialize a wave when two work
// orders overlap on locus (ancestor-prefix relation over glob prefixes) OR share a
// contract (citation closure already folded in by the planner) OR share a resource.
// Greedy first-fit packing into waves of pairwise-independent work orders. The
// algebra is pure; the I/O (reading contracts, running footprint.mjs) already
// happened inside the route-planner agent (§6).
// ─────────────────────────────────────────────────────────────────────────────
function groupDisjoint(plan) {
  const wos = (plan && plan.workOrders) || [];

  // — locus overlap, transcribed from footprint.mjs prefix()/lociOverlap() —
  const normPath = (p) => String(p).replace(/\\/g, '/').replace(/\/+$/, '');
  const prefix = (glob) => {
    const g = normPath(glob);
    const star = g.search(/[*?]/);
    if (star === -1) return g.replace(/\/[^/]*$/, (m) => m); // file path: keep as-is
    const head = g.slice(0, star);
    return head.replace(/\/[^/]*$/, ''); // keep dir part up to the wildcard
  };
  const lociOverlap = (a, b) => {
    for (const ga of a) for (const gb of b) {
      const pa = prefix(ga), pb = prefix(gb);
      if (pa === '' || pb === '') return true;            // unbounded glob ⇒ assume overlap
      if (pa === pb) return true;
      if ((pa + '/').startsWith(pb + '/') || (pb + '/').startsWith(pa + '/')) return true;
      if (normPath(ga) === normPath(gb)) return true;
    }
    return false;
  };
  const intersects = (a, b) => a.some((x) => b.includes(x));

  const independent = (wa, wb) => {
    const fa = wa.footprint || { locus: [], contracts: [], resources: [] };
    const fb = wb.footprint || { locus: [], contracts: [], resources: [] };
    if (lociOverlap(fa.locus || [], fb.locus || [])) return false;       // locus
    if (intersects(fa.contracts || [], fb.contracts || [])) return false; // contract
    if (intersects(fa.resources || [], fb.resources || [])) return false; // resource
    return true;
  };

  // Greedy first-fit: each work order joins the first wave it is independent of all of.
  const waves = [];
  for (const wo of wos) {
    let placed = false;
    for (const wave of waves) {
      if (wave.workOrders.every((member) => independent(member, wo))) {
        wave.workOrders.push(wo);
        placed = true;
        break;
      }
    }
    if (!placed) waves.push({ workOrders: [wo] });
  }
  return waves;
}

// ─────────────────────────────────────────────────────────────────────────────
// computeGreen = floorGreen && trustedGreen (BF3).
//
// Green at a brownfield gate is a conjunction: the regression FLOOR is held green
// as a containment fence (zero correctness credit, but a break is a forbidden
// regression) AND the adversarially-checked TRUSTED set is green. Greenfield has
// an empty floor, so floorGreen is vacuously true and the conjunction reduces to
// trustedGreen — one foundation, both ends (architecture §18).
// ─────────────────────────────────────────────────────────────────────────────
function computeGreen(state) {
  const ev = (state && state.gate) || {};
  // A vertical slice is green only when every work order reported a `green` OUTCOME
  // (no unresolved checkpoint/blocked arm) AND the floor and trusted suites are green.
  const allOutcomesGreen = !!ev.allOutcomesGreen;
  const floorGreen = ev.floorGreen !== false;    // empty floor (greenfield) ⇒ true
  const trustedGreen = ev.trustedGreen === true; // must be positively green
  return allOutcomesGreen && floorGreen && trustedGreen;
}

// ─────────────────────────────────────────────────────────────────────────────
// toGateResult — classify the run's terminal state into the typed GATE_RESULT
// (architecture §7), including the two-oracle floor-break classifier (BF9).
//
//   green            → ratify at the retro
//   budget-exhausted → the loop ran out before GREEN (first-class, NOT a gate)
//   blocked          → a trap arm needs a human decision (BREAKING crossing)
//   (halt is returned earlier, directly from the reconcile/scribe paths.)
//
// BF9 floor-break classification (mechanical, never eyeballed): a floor break where
//   (a) the change DECLARED a matching behaviorDelta AND
//   (b) a new GROWN test now governs that locus
// is a PLANNED SUPERSESSION → advisory `change-characterized-planned` (not a regression).
// A floor break with neither is an UNFORESEEN REGRESSION → BREAKING → blocked.
// ─────────────────────────────────────────────────────────────────────────────
function classifyFloorBreak(state) {
  const breaks = [];
  for (const o of (state.outcomes || [])) {
    const fb = o.floorBreak;
    if (!fb || !fb.broke) continue;
    const declared = (o.behaviorDelta && o.behaviorDelta.length > 0);
    const loci = o.newGrownTestLoci || [];
    const brokeLoci = fb.loci || [];
    // (b): a new grown test now governs (at least one of) the broken loci.
    const governed = loci.length > 0 && (brokeLoci.length === 0 || brokeLoci.some((bl) =>
      loci.some((gl) => {
        const a = String(bl), b = String(gl);
        return a === b || a.startsWith(b) || b.startsWith(a);
      })));
    if (declared && governed) {
      breaks.push({ workOrder: o.workOrder, classification: 'planned-supersession', advisory: true, floorTests: fb.floorTests || [], floorBreak: fb });
    } else {
      breaks.push({ workOrder: o.workOrder, classification: 'unforeseen-regression', breaking: true, floorTests: fb.floorTests || [], floorBreak: fb });
    }
  }
  return breaks;
}

function toGateResult(verticalSliceGreen, state, budget) {
  const floorBreaks = classifyFloorBreak(state);
  const regressions = floorBreaks.filter((b) => b.breaking);

  // An unforeseen regression is BREAKING and gates the result regardless of green math.
  if (regressions.length > 0) {
    return {
      kind: 'blocked',
      outcome: {
        kind: 'unforeseen-regression',
        regressions,
        plannedSupersessions: floorBreaks.filter((b) => b.advisory),
        progress: state.progress || {},
      },
    };
  }

  if (verticalSliceGreen) {
    return {
      kind: 'green',
      evidence: {
        gate: state.gate || {},
        outcomes: state.outcomes || [],
        // planned supersessions ride along as advisory (batched at the retro, BF9).
        plannedSupersessions: floorBreaks.filter((b) => b.advisory),
        staleReverified: state.staleReverified || [],
      },
    };
  }

  // Any pending BREAKING trap arm (intent-fork / other / unresolved jurisdiction…)
  // that survived the loop blocks for a human decision rather than masquerading as
  // budget exhaustion.
  if (state.blocked && state.blocked.length > 0) {
    return { kind: 'blocked', outcome: { kind: 'trap', items: state.blocked, progress: state.progress || {} } };
  }

  // Otherwise the budget-guarded loop ran out before GREEN — the common hard-slice
  // exit, first-class on purpose (§7). Distinguish from a gate.
  return {
    kind: 'budget-exhausted',
    progress: state.progress || {},
    lastOutcome: (state.outcomes && state.outcomes[state.outcomes.length - 1]) || null,
    spent: budget && typeof budget.spent === 'function' ? budget.spent() : null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Prompt builders — pure string assembly only. Every agent receives artifact paths
// and reads/writes on disk ITSELF; the script never embeds file contents (which it
// cannot read) and never performs I/O.
// ─────────────────────────────────────────────────────────────────────────────
function j(value) { return JSON.stringify(value); }

function reconcilePrompt(a) {
  return [
    'Run the unconditional, total, halting recovery prologue for this reasonable run.',
    'Re-derive truth from git + the append-only ledger + the contract files; trust no resume/cache state.',
    `Effort root: ${a.effortRoot}`,
    `Target vertical slice: ${a.verticalSliceId}`,
    'Partition every artifact configuration into RESOLVED / SAFE-DEFAULT / AMBIGUOUS.',
    'Read config.runMode; if it is absent/null on a cold restart, HALT (defaulting to a "safer" mode is a forbidden inference).',
    'Run the floor-integrity reconcile pass (brownfield): an unaccounted floor change is AMBIGUOUS → HALT.',
    'Compute the trust-staleness set: trusted-green tests whose governing clause was amended/extended since last verification.',
    'Return the BRIEFING. Set halt:true with haltReason+evidence for ANY AMBIGUOUS configuration — never guess a recovery state.',
  ].join('\n');
}

function routePrompt(state, a) {
  return [
    'Plan this vertical slice into work orders with computed footprints.',
    `Effort root: ${a.effortRoot}`,
    `Vertical slice: ${a.verticalSliceId}`,
    `Route snapshot: ${j(a.route || null)}`,
    `Reconcile briefing (current state): ${j({ runMode: state.runMode, brownfield: state.brownfield, staleTrusted: state.staleTrusted || [] })}`,
    'For EACH work order return: id, role, verticalSlice, and the footprint = { locus, contracts (incl. citation closure), resources } via lib/footprint.mjs.',
    'Mark characterizationNeeded:true for any work order whose first touch crosses ungoverned brownfield code (BF7).',
    'Attach the per-work-order trust-staleness set (tests whose governing clause changed) so audit re-verifies exactly those (D13).',
    'Cite .reasonable/intention.md (the oracle) on every priority/scope fork; an unsettleable fork is an intent-fork, not a silent guess (D5b).',
    'Size waves so the slice cannot plausibly approach the 1000-agent lifetime cap (D16c).',
    'Return the ROUTE_PLAN.',
  ].join('\n');
}

// The conditional brownfield characterization-needed GENESIS, as an in-run agent
// SEQUENCE inside the running runner — NOT a nested workflow() (one-level nesting
// forbids it, §15 D16d; BF7). Runs provider-first, after the implementer records its
// behaviorDelta, before the characterizer pins anything (pinning first would freeze
// the very behaviour about to change). Returns the implement OUTCOME.
async function provisionThenImplement(wo, _orig, _idx, ctx) {
  const a = ctx.args;
  const effortRoot = a.effortRoot;

  // 1) Provision the lane BEFORE the fenced worker — closes the descriptor-less
  //    window (D7): worktree + .reasonable-lane.json + journal record, in that order.
  const provision = await guard(wo.id, () => ctx.agent(
    [
      'Provision the lane for this work order, idempotently, BEFORE any fenced worker edits code.',
      `Effort root: ${effortRoot}`,
      `Work order: ${wo.id} (role: ${wo.role || 'implementer'})`,
      'Do exactly three things in order: git worktree add; write .reasonable-lane.json (with effortRoot back-pointer + narrowed locus/role/floorImpact/contractBirth); record the lane in the journal via the scribe.',
      'Ensure a checkpoint-only lane carries a trailered commit so reconcile can re-claim it.',
    ].join('\n'),
    { label: `provision:${wo.id}`, phase: 'Enrich', agentType: 'reasonable:lane-provisioner', schema: OUTCOME },
  ));
  if (provision && provision.kind === 'checkpoint') return provision;

  // 2) Conditional brownfield genesis (BF7): record behaviorDelta, then characterize
  //    the seam provider-first — an in-run agent sequence, never a nested workflow().
  if (a.brownfield && wo.characterizationNeeded) {
    const characterization = await guard(wo.id, () => ctx.agent(
      [
        'Brownfield first-touch genesis for ungoverned code (BF7). This is an in-run sequence, NOT a nested workflow.',
        `Effort root: ${effortRoot}`,
        `Work order: ${wo.id}; seam first touched by this slice.`,
        `Declared behaviorDelta (the observable behaviours this change INTENDS to move): ${j(wo.behaviorDelta || [])}`,
        'Pin current behaviour as born `characterized` clauses (FLOOR, untrusted), provider-first, in the fixed atomic order contract → ledger event → test.',
        'Stamp `Supersession: pending` on any clause the behaviorDelta names. Admit each pin only if it survives the BF2 reverse discriminator (RED under one locus-scoped mutant, run alone).',
        'Return kind:"characterized" with the component/clauses/seam, or kind:"not-needed".',
      ].join('\n'),
      { label: `characterize:${wo.id}`, phase: 'Enrich', agentType: 'reasonable:characterizer', schema: CHARACTERIZATION },
    ));
    if (characterization && characterization.kind === 'checkpoint') return characterization;
    // characterization.kind in {characterized, not-needed, other} — provider is now
    // governed; fall through to implementation either way.
  }

  // 3) Implement on the active path: thin-real only; enrich own contract; the worker
  //    writes its OWN ledger line in its ONE atomic commit (D3a). Emits an OUTCOME.
  return guard(wo.id, () => ctx.agent(
    [
      'Implement this work order on the active vertical-slice path (thin-real only; loud stubs off-path).',
      `Effort root: ${effortRoot}`,
      `Work order: ${wo.id}`,
      `Vertical slice: ${wo.verticalSlice || a.verticalSliceId}`,
      'Stay within your declared locus; request scope expansion from the orchestrator (a cheap logged message) rather than editing out of locus.',
      'Enrich your OWN contract with newly-learned musts and log the contract diff to the ledger.',
      'Collapse your terminal effects into ONE atomic commit: work product + your own ledger/verdict line + a Work-Order trailer (D3a).',
      'If you hit a wall, emit the matching OUTCOME kind (scope-expansion / ripple / jurisdiction / spike-needed / infeasible / intent-fork / other) — never thrash toward green.',
      'Cite .reasonable/intention.md when a fork turns on a scope/priority choice; an unsettleable fork is intent-fork (BREAKING), never a silent guess.',
      'Return the OUTCOME.',
    ].join('\n'),
    { label: `implement:${wo.id}`, phase: 'Enrich', agentType: 'reasonable:implementer', schema: OUTCOME },
  ));
}

// blindTest — fresh-context agent; receives ONLY old+new contract text, never the
// implementation diff; translates the contract delta into test changes; no Bash
// (cannot run tests). Carries the prior OUTCOME forward untouched if the lane already
// trapped (a non-green prior result short-circuits the rest of its chain).
async function blindTest(prev, wo, _idx, ctx) {
  if (!prev || prev.kind !== 'green') return prev; // trapped lane: carry the trap forward
  const a = ctx.args;
  return guard(wo.id, () => ctx.agent(
    [
      'Blind test-writer: you receive ONLY the old and new contract text for this work order — never the implementation diff.',
      `Effort root: ${a.effortRoot}`,
      `Work order: ${wo.id} (read the contract delta from the ledger entry + the contract files; do NOT read src).`,
      'Translate the contract delta into test changes (tests track contracts 1:1). Every new must enters as a RED assertion first.',
      'You do not run tests (no Bash). Formalize expectations blind.',
      'Return the OUTCOME (kind:"green" if you produced the test delta cleanly; otherwise the matching trap kind).',
    ].join('\n'),
    { label: `blind-test:${wo.id}`, phase: 'Enrich', agentType: 'reasonable:blind-test-writer', schema: OUTCOME },
  ));
}

// adjudicate — read-only; runs the tests; judges every red with the CONTRACT TEXT as
// arbiter (impl violates contract → fix impl; test mistranslates a clause → fix test
// citing the clause). Cites the intention oracle on a scope/jurisdiction fork (D5b).
async function adjudicate(prev, wo, _idx, ctx) {
  if (!prev || prev.kind !== 'green') return prev;
  const a = ctx.args;
  return guard(wo.id, () => ctx.agent(
    [
      'Adjudicator (read-only): run the tests for this work order and judge every red with the CONTRACT TEXT as the sole arbiter.',
      `Effort root: ${a.effortRoot}`,
      `Work order: ${wo.id}`,
      'Implementation violates contract → verdict fix-implementation (test untouched). Test mistranslates a clause → verdict fix-test, citing the clause. Green-ness is never the goal state of test-editing.',
      'A scope/priority/jurisdiction fork must cite .reasonable/intention.md; an unsettleable fork is intent-fork (BREAKING).',
      'Return the OUTCOME (kind:"green" only when adjudication leaves the lane consistent with its contract).',
    ].join('\n'),
    { label: `adjudicate:${wo.id}`, phase: 'Enrich', agentType: 'reasonable:adjudicator', schema: OUTCOME },
  ));
}

// audit — the mechanical teeth in escalating cost order, as a read-only parallel()
// LEAF (barrier): discriminator + bidirectional mapping per enrichment, mutation
// sampling at the gate, reverse discriminator for characterization clauses; gate =
// AND over all checks. Read-only, no worktree isolation. Collapses to one
// discriminator at the low floor (§17). Fills `floorBreak` + `newGrownTestLoci` +
// `evidence` for the BF9 classifier and computeGreen.
async function audit(prev, wo, _idx, ctx) {
  if (!prev || prev.kind !== 'green') return prev;
  const a = ctx.args;
  const checks = a.lowFloor
    ? ['discriminator'] // §17: the floor case collapses to a single discriminator check
    : ['discriminator', 'bidirectional-mapping', 'mutation-sample', 'reverse-discriminator'];

  // Read-only escalating checks run TOGETHER (parallel barrier); gate = AND over all.
  const reports = await parallel(checks.map((check) => () =>
    guard(wo.id, () => ctx.agent(
      [
        `Auditor mechanical check: ${check} (read-only; never simulate what a script computes — invoke lib/${check === 'bidirectional-mapping' ? 'citation-resolve' : check === 'reverse-discriminator' ? 'discriminator' : check.replace('-sample', '-sample')}.mjs).`,
        `Effort root: ${a.effortRoot}`,
        `Work order: ${wo.id}`,
        check === 'discriminator' ? 'Every new/changed test must FAIL on the pre-task commit (HEAD~ in a worktree). A test that passes on both old and new impls verifies nothing.' : '',
        check === 'bidirectional-mapping' ? 'Every new assertion cites a contract clause; every new clause has at least one assertion.' : '',
        check === 'mutation-sample' ? 'Mutate the implementation k times; surviving mutants expose vacuous tests.' : '',
        check === 'reverse-discriminator' ? 'Characterization clauses only: mutate the cited clause locus at HEAD, overlay and run ONLY that one characterization test, require RED (the dual of HEAD~). Do NOT delegate to mutation-sample.' : '',
        'Also report: floorGreen, trustedGreen, any floorBreak {broke, floorTests, loci}, and the loci of new GROWN (RED-at-HEAD~) tests for the planned-supersession classifier.',
        'Return the OUTCOME (kind:"green" iff this check passed); attach evidence.',
      ].filter(Boolean).join('\n'),
      { label: `audit:${check}:${wo.id}`, phase: 'Enrich', agentType: 'reasonable:auditor', schema: OUTCOME },
    ))));

  const real = reports.filter(Boolean);
  // A null/skip in the audit leaf is a verification gap → checkpoint (slice not green).
  const gap = real.find((r) => r.kind === 'checkpoint');
  if (gap) return gap;
  const failed = real.find((r) => r.kind !== 'green');
  if (failed) return failed; // a failing check is a trap arm, carried to the router

  // AND over all checks held → merge evidence into the lane's terminal green OUTCOME.
  const merged = { kind: 'green', workOrder: wo.id, verticalSlice: wo.verticalSlice || a.verticalSliceId };
  merged.evidence = { checks: real.map((r) => ({ check: r.detail && r.detail.check, evidence: r.evidence })) };
  // Lift floor/trust/grown-loci signals from whichever check reported them.
  merged.floorBreak = real.map((r) => r.floorBreak).find((x) => x && x.broke) || { broke: false };
  merged.behaviorDelta = prev.behaviorDelta || wo.behaviorDelta || [];
  merged.newGrownTestLoci = [].concat(...real.map((r) => r.newGrownTestLoci || []));
  merged.detail = {
    floorGreen: real.every((r) => !(r.detail && r.detail.floorGreen === false)),
    trustedGreen: real.some((r) => r.detail && r.detail.trustedGreen === true),
  };
  return merged;
}

// ─────────────────────────────────────────────────────────────────────────────
// route() — the trap router: a pure JS switch over OUTCOME.kind mapping each to its
// pre-written membrane crossing (architecture §8). NEVER throws on a trap; it folds
// the outcome into the accumulating state. Inter-run / human decisions are queued by
// the scribe (returned as state for journalWrite); machine-to-machine traps steer the
// existing budget-guarded loop. `mode` ∈ {gated, autonomous} decides grant-vs-inbox.
// ─────────────────────────────────────────────────────────────────────────────
function route(outcome, state, mode) {
  const s = state;
  s.outcomes = s.outcomes || [];
  s.blocked = s.blocked || [];
  s.pendingInbox = s.pendingInbox || [];
  s.greenWorkOrders = s.greenWorkOrders || [];
  s.outcomes.push(outcome);

  switch (outcome.kind) {
    case 'green':
      s.greenWorkOrders.push(outcome.workOrder);
      break;

    case 'scope-expansion':
      // autonomous: grant+log; gated: queue an inbox item (cheaper than sneaking).
      if (mode === 'autonomous') {
        s.pendingInbox.push({ class: 'ADVISORY', kind: 'scope-expansion', workOrder: outcome.workOrder, detail: outcome.detail || {} });
      } else {
        s.pendingInbox.push({ class: 'ADVISORY', kind: 'scope-expansion', workOrder: outcome.workOrder, detail: outcome.detail || {}, status: 'open' });
      }
      s.needsAnotherPass = true; // re-dispatch with the widened locus next iteration
      break;

    case 'ripple':
      // Sequence provider-first / consumer-first single-contract pipeline runs (§5.10).
      s.needsAnotherPass = true;
      s.ripples = s.ripples || [];
      s.ripples.push({ workOrder: outcome.workOrder, detail: outcome.detail || {} });
      break;

    case 'jurisdiction':
      // dispatch the adjudicator (which cites the oracle) — re-runs next pass.
      s.needsAnotherPass = true;
      s.pendingInbox.push({ class: 'ADVISORY', kind: 'jurisdiction', workOrder: outcome.workOrder, detail: outcome.detail || {} });
      break;

    case 'spike-needed':
      // RETURN to the main session to launch the spike workflow (nesting limit, §12/§15).
      s.blocked.push({ class: 'BREAKING', kind: 'spike-needed', workOrder: outcome.workOrder, detail: outcome.detail || {} });
      break;

    case 'infeasible':
      // dispatch the skeptic; two independent exhaustions auto-promote to dead-end.
      s.infeasible = s.infeasible || [];
      s.infeasible.push({ workOrder: outcome.workOrder, detail: outcome.detail || {} });
      s.blocked.push({ class: 'BREAKING', kind: 'infeasible', workOrder: outcome.workOrder, detail: outcome.detail || {} });
      break;

    case 'checkpoint':
      // triage the budget: extend once / fresh-context retry / escalate. A budget
      // ceiling is never a verification gap (D16b); a null-gap checkpoint keeps the
      // slice RED. Either way, surface for the loop's budget guard + retro.
      s.checkpoints = s.checkpoints || [];
      s.checkpoints.push({ workOrder: outcome.workOrder, detail: outcome.detail || {}, note: outcome.note });
      s.lastCheckpoint = outcome;
      break;

    case 'intent-fork':
      // an ambiguity neither code nor intention can settle → human inbox (BREAKING).
      s.blocked.push({ class: 'BREAKING', kind: 'intent-fork', workOrder: outcome.workOrder, detail: outcome.detail || {} });
      break;

    case 'other':
    default:
      // an unknown wall the schema can't name → human inbox (BREAKING); fail-safe.
      s.blocked.push({ class: 'BREAKING', kind: 'other', workOrder: outcome.workOrder, detail: outcome.detail || {}, note: outcome.note });
      break;
  }
  return s;
}

// journalWrite — the script's ONE derived-index write, via the lone serialized scribe
// (D3b). Serial and awaited; runs only from this non-parallel position. A null return
// is a HALT upstream (the script must not proceed believing a transition persisted) —
// but loses no truth, since reconcile rebuilds the index from git+ledger.
async function journalWrite(state) {
  const ack = await agent(
    [
      'Write the derived index (journal.json + inbox.json) — and nothing else (D3b).',
      'Record the program-counter transitions write-ahead, and append the pending inbox items with their BREAKING/ADVISORY class.',
      `Transitions: ${j({ greenWorkOrders: state.greenWorkOrders || [], checkpoints: (state.checkpoints || []).length, blocked: (state.blocked || []).length })}`,
      `Pending inbox: ${j(state.pendingInbox || [])}`,
      'Return a non-null acknowledgement object on success; return null ONLY if the write could not be persisted (the script will HALT).',
    ].join('\n'),
    { label: 'scribe:journal', phase: 'Enrich', agentType: 'reasonable:journal-writer', schema: { type: ['object', 'null'], additionalProperties: true } },
  );
  return ack;
}

// withinBudget — guard on min(per-slice-remaining, engine turn-pool remaining) (§15
// D16a). Per-slice budget rides in args (the engine budget spans the whole turn).
// Guard ONLY when a ceiling exists; an absent total ⇒ Infinity ⇒ loop runs to the cap.
function withinBudget(a, budget) {
  const sliceTotal = a && a.budget && typeof a.budget.total === 'number' ? a.budget.total : null;
  const sliceSpent = budget && typeof budget.spent === 'function' ? budget.spent() : 0;
  const sliceRemaining = sliceTotal === null ? Infinity : Math.max(0, sliceTotal - sliceSpent);
  const engineRemaining = budget && typeof budget.remaining === 'function' ? budget.remaining() : Infinity;
  return Math.min(sliceRemaining, engineRemaining) > 0;
}

// withinAgentCap — keep clear of the 1000-agent lifetime backstop (§15 D16c). We
// cannot read the engine's counter, so we track our own dispatch tally and stop with
// room to spare; the route-planner already sized waves to not approach the cap.
function withinAgentCap(state) {
  return (state.agentsDispatched || 0) < 950;
}

// ─────────────────────────────────────────────────────────────────────────────
// The run.
// ─────────────────────────────────────────────────────────────────────────────
const a = args || {};

phase('Reconcile');
// Reconcile prologue — unconditional, total, halting (§12). Direct agent() (not
// guard()-wrapped): a reconcile failure is a HALT, not a budget checkpoint.
let state = await agent(reconcilePrompt(a), { label: 'reconcile', agentType: 'reasonable:reconciler', schema: BRIEFING });
if (!state || state.halt) {
  return { kind: 'halt', reason: (state && state.haltReason) || 'reconcile returned null or AMBIGUOUS (recovery halt)' };
}

// Effective run mode (carried, never inferred). reconcile read config.runMode; an
// absent/null mode is already a reconcile HALT above, so here it is concrete.
const mode = a.runMode || state.runMode;
state.outcomes = [];
state.blocked = [];
state.pendingInbox = [];
state.greenWorkOrders = [];
state.agentsDispatched = 0;

phase('Plan');
const plan = await agent(routePrompt(state, a), { label: 'route-plan', agentType: 'reasonable:route-planner', schema: ROUTE_PLAN });
if (!plan) {
  return { kind: 'halt', reason: 'route-planner returned null — cannot plan the slice' };
}

// Pure set-algebra: pack work orders into waves of pairwise-disjoint footprints (D11).
const waves = groupDisjoint(plan);
log(`route-planner returned ${(plan.workOrders || []).length} work order(s); grouped into ${waves.length} disjoint wave(s).`);

phase('Enrich');
let verticalSliceGreen = false;
const ctx = { args: a, agent };

while (!verticalSliceGreen && withinBudget(a, budget) && withinAgentCap(state)) {
  state.needsAnotherPass = false;

  for (const wave of waves) {
    log(`dispatching wave of ${wave.workOrders.length} work order(s).`);
    state.agentsDispatched += wave.workOrders.length * 6; // rough per-WO agent tally (provision+[characterize]+implement+blind+adjudicate+audit-leaf)

    // The enrichment pipeline (§5.6) — NO barrier between stages (§8): a fast-trapping
    // lane is triaged the instant ITS chain returns, not after the slowest lane. Each
    // stage callback receives (prevResult, originalItem, index); we close over ctx.
    const outcomes = await pipeline(
      wave.workOrders,
      (wo, orig, i) => provisionThenImplement(wo, orig, i, ctx),
      (prev, wo, i) => blindTest(prev, wo, i, ctx),
      (prev, wo, i) => adjudicate(prev, wo, i, ctx),
      (prev, wo, i) => audit(prev, wo, i, ctx),
    );

    // Trap router — map every OUTCOME to its pre-written membrane crossing (§8).
    for (const o of outcomes.filter(Boolean)) state = route(o, state, mode);

    // The script's ONLY derived-index write — serial, awaited; null → HALT (§6, D3b).
    const ack = await journalWrite(state);
    if (ack === null) {
      return { kind: 'halt', reason: 'scribe-null: derived index not persisted (reconcile will rebuild it next run)' };
    }

    // A BREAKING trap (spike-needed / infeasible / intent-fork / other) means a human
    // decision is required before progress — stop the wave loop and return blocked.
    if (state.blocked.length > 0) break;
  }

  // BREAKING traps surfaced → return for a human decision rather than spinning.
  if (state.blocked.length > 0) break;

  // Gate math: floorGreen && trustedGreen, plus every work order reported green (BF3).
  const allGreen = (plan.workOrders || []).length > 0 &&
    state.greenWorkOrders.length >= (plan.workOrders || []).length;
  // floorGreen: no UNFORESEEN floor break (a break the change declared via
  // behaviorDelta is a planned supersession, classified later in toGateResult, BF9).
  const floorGreen = state.outcomes.every((o) =>
    !(o.floorBreak && o.floorBreak.broke && !(o.behaviorDelta && o.behaviorDelta.length)));
  // trustedGreen: every WO green AND no audit reported the trusted suite as RED.
  const trustedGreen = allGreen &&
    state.outcomes.every((o) => !(o.detail && o.detail.trustedGreen === false));
  state.gate = { allOutcomesGreen: allGreen, floorGreen, trustedGreen };
  verticalSliceGreen = computeGreen(state);

  // If nothing changed this pass and we are not green, the loop would spin — only a
  // checkpoint/ripple/scope-expansion warrants another pass; otherwise break to the gate.
  if (!verticalSliceGreen && !state.needsAnotherPass && (state.checkpoints || []).length === 0) break;
}

phase('Gate');
// Return the typed GATE_RESULT for the main-session retro (§7, BF9): green |
// budget-exhausted | blocked. (halt was returned directly from the paths above.)
return toGateResult(verticalSliceGreen, state, budget);
