// vertical-slice-runner.workflow.js
//
// reasonable - the pure in-run plane (architecture S18 sketch + S7/S8/S12/S15).
//
// ONE Workflow run = exactly ONE vertical slice, driven toward GREEN, ending AT the
// retro gate, never through it (D4, S7). The run does not block on a human; it returns
// a typed GATE_RESULT and the main-session decision plane runs the human-blocking retro.
//
// Shape (architecture S19 sketch, faithfully):
//   reconcile prologue (agent)  - unconditional, total, halting recovery (S12, D8b/D9)
//     - if state.halt -> return {kind:'halt'}
//     floor-integrity is a tier-3 BACKSTOP tripwire here, not a first-line HALT (D6):
//     it surfaces every floor change, annotated explained-by-verdict (advisory) by any
//     accept. D13 - the UNEXPLAINED-BREACH STOP: in AUTONOMOUS mode an UNEXPLAINED
//     breaking floor-integrity-mismatch (no accept verdict explains it - something
//     bypassed the pre-integration adversary) is the FIFTH always-escalate class: the
//     reconciler sets halt=true (queue BREAKING + stop), so it returns {kind:'halt'}
//     above. An EXPLAINED floor diff is a non-blocking notice (surfaces, run continues).
//     In GATED mode both just surface in the briefing for the present human.
//   route-planner (agent)       - footprints + resources + trust-staleness (S6, S16, D11/D13)
//   groupDisjoint (pure)        - set-algebra over locus | contract | resource (mirrors
//                                  lib/footprint.mjs independent(), D11)
//   budget + agent-cap guarded while loop (S15, D16a/D16c)
//     per wave: the enrichment pipeline() (S5.6, no barrier, S8)
//        [ provisionThenImplement -> intentVerify -> reprovisionForBlindTest -> blindTest
//          -> adjudicate -> audit ]
//        each agent() guard()-wrapped: a budget THROW -> {kind:'checkpoint'} (D16b)
//        reprovisionForBlindTest re-invokes the lane-provisioner on the SAME lane to move
//        the descriptor's role/testEditsAllowed/locus from implementer to blind-test-writer
//        BEFORE that stage's first tool call - an UNCONDITIONAL step, never a judgment call
//        an agent might skip (the graph-editor-ux-overhaul incident: a stale implementer
//        descriptor fence-denied the blind-test-writer and stalled the pipeline).
//        provisionThenImplement folds in the conditional brownfield genesis prologue:
//        the in-run `characterization-needed` agent sequence (BF7) - NOT a nested
//        workflow() (one-level nesting forbids it, S15 D16d).
//        intentVerify is the S5.6 CONTRACT-ENRICHMENT adversary - the verification
//        trio's leg on the implementer's self-authored contract enrichment (the
//        sycophancy / rot-vector-3 surface). A fresh-context, read-only-by-capability
//        reasonable:intent-verifier judges the PROPOSED contract diff against the
//        VISION + VERTICAL-SLICE SPEC oracle (ABOVE the artifact, D9 - never
//        intention.md, never the contract the implementer wrote, which would be
//        circular), BEFORE the blind-test-writer derives tests from it. RISK-GATED
//        (D7): ALWAYS run where the enrichment touches a shared contract (a citation
//        to a neighbour); may skip a boxed-in own-contract-only delta. accept|reject|
//        escalate, propose-not-act (D2): reject -> back to the implementer; escalate ->
//        the human inbox (autonomous: joins the always-escalate classes, D8). This is
//        NOT a behaviorDelta-completeness verifier - that is a FALSE TRIO (D12): an
//        undeclared move surfaces mechanically as an unaccounted floor break, a padded
//        delta is caught by the existing two-oracle collision classifier.
//        a serial WRITE-AHEAD journalWriteAhead BEFORE the pipeline flips the slice +
//        this wave's work orders to `dispatched` so the progress mirror reads `active`
//        within seconds, not after the wave lands (D19); fail-soft (the post-wave write
//        is authoritative)
//     trap router: switch over OUTCOME.kind -> its pre-written membrane crossing (S8)
//     serial AUTHORITATIVE journalWrite (the wave's derived-index write); null -> HALT
//        (S6, D3b). Both scribe dispatches run from this non-parallel position via the
//        SAME lone serialized scribe, awaited, never concurrent - D3b is preserved.
//   computeGreen = floorGreen && trustedGreen (BF3)
//   return toGateResult(...) -> green | budget-exhausted | blocked | halt (S7, BF9)
//
// PURITY (substrate ref, absolute): pure JS, no fs / Date.now / Math.random / new Date();
// no imports - every schema literal and helper (guard) is inlined; all side effects happen
// INSIDE agents; the script orchestrates and never touches disk. Control flow is fixed per
// run - dynamism is loop-count (budget-guarded) + pipeline()/parallel(), never new shape.
// This script holds ZERO enforcement authority (S13): the fence + per-agentType allowlists
// bind beside and under the agents regardless of who spawned them.

export const meta = {
  name: 'vertical-slice-runner',
  description: 'Drive one reasonable vertical slice to GREEN and return a typed GATE_RESULT (green | budget-exhausted | blocked | halt).',
  whenToUse: 'Launched once per vertical slice by the reasonable main-session orchestrator, with the vertical-slice id, route snapshot, contract paths, per-slice budget, supervision profile, and run mode in args.',
  phases: [
    { title: 'Reconcile', detail: 'Unconditional, total, halting recovery prologue - re-derive truth from git+ledger+contracts; halt on any AMBIGUOUS configuration.' },
    { title: 'Plan', detail: 'Route-planner computes per-work-order footprints (locus union citation closure), resource claims, and the trust-staleness set.' },
    { title: 'Enrich', detail: 'Per disjoint wave, the enrichment pipeline: provision+implement (with conditional brownfield characterization genesis) -> blind test -> adjudicate -> audit.' },
    { title: 'Gate', detail: 'Compute floorGreen && trustedGreen and return the typed GATE_RESULT for the main-session retro.' },
  ],
};

// -----------------------------------------------------------------------------
// Inline schema literals (the tagged unions the agents are schema-forced to emit,
// and the structures the script consumes). Kept inline - no imports allowed.
// -----------------------------------------------------------------------------

// BRIEFING - what the reconciler returns (architecture S12, agents/reconciler.md).
// `halt` is the total function's AMBIGUOUS bucket surfacing as a blocking decision.
const BRIEFING = {
  type: 'object',
  required: ['halt'],
  additionalProperties: true,
  properties: {
    halt: { type: 'boolean' },
    haltReason: { type: 'string' },
    // Which class triggered the halt. The four first-line AMBIGUOUS classes stay HALTs;
    // floor-integrity-unexplained is the D13 fifth always-escalate STOP (an UNEXPLAINED
    // autonomous floor breach). A plain floor-integrity diff that is explained-by-verdict
    // (or any gated floor diff) is NOT a halt - it surfaces as a notice.
    haltClass: {
      type: ['string', 'null'],
      enum: ['sha-custody', 'ledger-without-commit', 'runmode-absent', 'two-lanes-one-wo', 'floor-integrity-unexplained', 'other', null],
    },
    evidence: { type: 'object', additionalProperties: true },
    // D13: of the surfaced floor-integrity diffs, how many are UNEXPLAINED (no `accept`
    // verifier-verdict explains them) - reconcile.mjs `floorIntegrity.unexplained`. In
    // AUTONOMOUS mode >0 is the fifth always-escalate STOP; an EXPLAINED diff (>0 surfaced
    // but unexplained:0) is a non-blocking notice. Null/0 when no floor diff surfaced.
    floorUnexplained: { type: ['integer', 'null'] },
    runMode: { type: ['string', 'null'], enum: ['gated', 'autonomous', null] },
    currentVerticalSlice: { type: ['string', 'null'] },
    // Resolved from the reconciler's own cwd when args did not carry it (the scriptPath
    // args-drop fallback, D18): the run's first agent stands in the effort root, so it can
    // always recover the canonical root from disk and hand it back to the (pure) script.
    effortRoot: { type: ['string', 'null'] },
    brownfield: { type: 'boolean' },
    // Branch hygiene: the dedicated integration branch every lane is cut from (and green
    // lanes merge into), and the base ref written only at effort end. Read from config by
    // the reconciler and threaded back so the (pure) script can pass the lane base to the
    // provisioner. Null on an effort that predates this field (bare-HEAD back-compat).
    effortBranch: { type: ['string', 'null'] },
    baseBranch: { type: ['string', 'null'] },
    // Live lanes that do NOT descend from the effort branch (a build-on-stale; surfaced).
    laneBaseIssues: { type: 'array', items: { type: 'object', additionalProperties: true } },
    // The trust-staleness set: trusted-green tests whose governing clause was
    // amended/extended since last verification (S16, D13) - marked for re-verify.
    staleTrusted: { type: 'array', items: { type: 'string' } },
    // Work-order ids the journal already shows TERMINAL (merged) - reconcile.mjs
    // computes this mechanically (status:"merged", or status:"green"+merged:true).
    // A merged WO's code already landed on the effort branch; re-running its
    // pipeline is never correct, regardless of what still sits on disk in
    // .reasonable/work-orders/*.json (the graph-editor-ux-overhaul incident: a
    // merged WO was re-dispatched twice because nothing checked this before the
    // route-planner's plan was fed into the wave). The script filters on this
    // set right after the route-planner returns - a mechanical backstop beside
    // the route-planner's own prose filter (capability beats discipline).
    terminalWorkOrders: { type: 'array', items: { type: 'string' } },
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

// ROUTE_PLAN - what the route-planner returns: per work order, BOTH the
// locus/citation footprint AND the resource-claim set, so groupDisjoint can run
// pure set-algebra (architecture S6, D11). Footprint mirrors lib/footprint.mjs.
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
          // -> the in-run characterization genesis fires before implementation (BF7).
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

// VERIFIER_VERDICT - what the S5.6 CONTRACT-ENRICHMENT adversary returns on one
// PROPOSED contract enrichment (D5 shape, matching the verifier-verdict ledger event
// in docs/artifacts.md + the characterization spine). The adversary is read-only by
// capability and PROPOSES the verdict as DATA (proposed:true); a narrow writer (the
// orchestrator) performs the ledger append - it never self-executes the act its
// verdict authorizes (Law 3 corollary, D2). The reference (`oracle`) is the VISION +
// VERTICAL-SLICE SPEC, ABOVE the artifact (D9): a sycophantic enrichment passes any
// tests-vs-contract audit with honors, so it is judged at INTENT level against the top
// edge - NEVER against intention.md and NEVER against the contract the implementer
// itself wrote (that derivation is circular).
const VERIFIER_VERDICT = {
  type: 'object',
  required: ['workOrder', 'verdict', 'oracle', 'proposed'],
  additionalProperties: true,
  properties: {
    workOrder: { type: 'string' },
    component: { type: 'string' },
    // The proposed enrichment diff / clause(s) / commit-or-hash judged (content-references).
    diffRef: { type: ['string', 'null'] },
    verdict: { type: 'string', enum: ['accept', 'reject', 'escalate'] },
    // The named reference judged against - vision + vertical-slice spec, ABOVE the artifact.
    oracle: { type: 'string' },
    by: { type: 'string' },              // "intent-verifier"
    proposed: { type: 'boolean' },       // always true: propose-not-act (D2)
    // Why the adversary ran (D7 risk-gate): the enrichment touches a shared contract
    // (a Citations bullet to a neighbour). False => the orchestrator could have skipped
    // it (a boxed-in own-contract-only delta).
    touchesSharedContract: { type: 'boolean' },
    reason: { type: ['string', 'null'] },
  },
};

// OUTCOME - every lane-running agent is schema-forced to emit this tagged union;
// the trap router switches on `kind` (architecture S8, D5/D12).
//
// `seam-undeclared` is the deterministic route for a render-clause RED that died because
// the test could not OBSERVE the unit (a missing/undeclared OBSERVABLE SEAM - module-load
// death, wrong export shape, or a missing DOM handle), NOT because behaviour disagreed.
// The adjudicator classifies it with lib/seam.mjs (a computed binary, never a guess) and
// the route arm sends it to a SEAM-DECLARATION re-pass (the implementer enriches its
// `## Observable Seams` + exposes the handle), NOT another blind redo - which is what
// looped `fix-test -> intent-fork` forever in the render-clause incident.
const OUTCOME = {
  type: 'object',
  required: ['kind', 'workOrder'],
  additionalProperties: true,
  properties: {
    kind: {
      type: 'string',
      enum: [
        'green', 'scope-expansion', 'ripple', 'jurisdiction', 'seam-undeclared', 'spike-needed',
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
    // free-form per-arm payload (added locus, ripple manifest id, binding constraint...).
    detail: { type: 'object', additionalProperties: true },
    note: { type: 'string' },
  },
};

// SCRIBE_ACK - the lone serialized journal-writer's acknowledgement (D3b), shared by
// BOTH journal-writer dispatches in this file (the verifier-verdict append and the
// derived-index scribe). The top-level type MUST be the literal 'object': the Messages
// API rejects a forced-tool input_schema whose top-level type is an array
// ({type:['object','null']} => 'tools.N.custom.input_schema.type: Input should be object').
// Because a `schema` FORCES a tool call, the scribe CANNOT emit a bare JSON null to mean
// "I could not persist" - it reports that in the explicit `persisted` field. A bare-null
// return is reserved for agent death/skip. Every consumer HALTs (or fails toward scrutiny)
// on (null || checkpoint || persisted !== true): the script must not proceed believing a
// transition persisted. Mirrors characterization.workflow.js.
const SCRIBE_ACK = {
  type: 'object',
  additionalProperties: false,
  required: ['persisted'],
  properties: {
    persisted: { type: 'boolean', description: 'journal.json + inbox.json (or the verifier-verdict ledger line) written faithfully against their schemas.' },
    transition: { type: ['string', 'null'], description: 'The transition persisted (program-counter advance / verifier-verdict appended).' },
    note: { type: ['string', 'null'] },
  },
};

// PROVISION_ACK - the lane-provisioner's hand-off (mirrors the other workflows). The runner
// MUST capture the worktree path so it can direct the CODE-writing roles (implementer,
// characterizer, blind-test-writer) into the lane - the two-root model: code -> worktree
// (git -C), .reasonable/ state -> canonical effort root. A null/false ack, or no worktree, is
// a refusal to run a fenced worker lane-less (D7).
const PROVISION_ACK = {
  type: 'object',
  additionalProperties: false,
  required: ['provisioned'],
  properties: {
    provisioned: { type: 'boolean', description: 'worktree + .reasonable-lane.json descriptor + journal record all present, in that order (idempotent on re-run).' },
    worktree: { type: ['string', 'null'], description: 'the lane worktree path (nested under the effort root) - CODE + git -C land here; NEVER the main checkout.' },
    branch: { type: ['string', 'null'], description: 'the lane branch.' },
    descriptorWritten: { type: 'boolean', description: 'the .reasonable-lane.json descriptor exists at the worktree root (the fence is armed).' },
    depsReady: { type: 'boolean', description: 'the worktree can run its suite - installed deps are present (linked from the effort root or installed via config.setupCommand). false = the suite-running roles must install first.' },
    noOp: { type: 'boolean', description: 'true iff the lane already existed and provisioning was an idempotent no-op.' },
    kind: { type: ['string', 'null'], description: 'set to "checkpoint" by guard() on a budget ceiling.' },
    note: { type: ['string', 'null'] },
  },
};

// -----------------------------------------------------------------------------
// guard() - the budget-throw membrane (architecture S15, D16b).
//
// The engine THROWS from agent() once budget.spent() >= budget.total. A throw is a
// budget ceiling, NOT a verification gap; we must never let it masquerade as a
// correctness failure. guard() catches the throw and re-tags it as a checkpoint
// OUTCOME so the trap router triages the budget rather than (wrongly) failing the
// vertical slice. A `null` agent return is a DIFFERENT thing: user-skip / terminal
// API error = a real verification gap -> the slice does not close (we map it to a
// checkpoint-flavored gap too, but flagged distinctly so the gate stays RED).
// -----------------------------------------------------------------------------
async function guard(workOrder, thunk) {
  try {
    const result = await thunk();
    if (result === null) {
      // null = skip / terminal error -> a verification gap, the slice must NOT close.
      return { kind: 'checkpoint', workOrder, note: 'agent returned null (skip or terminal error) - verification gap', detail: { gap: true } };
    }
    return result;
  } catch (e) {
    // Any throw inside a wave is treated as the budget ceiling (the only thing the
    // engine throws for at this layer) -> checkpoint, never a silent pass/fail.
    return { kind: 'checkpoint', workOrder, note: 'budget ceiling reached (agent() threw)', detail: { budgetThrow: true, message: String(e && e.message || e) } };
  }
}

// -----------------------------------------------------------------------------
// groupDisjoint - pure set-algebra over the route-planner's footprints (D11).
//
// Mirrors lib/footprint.mjs independent() EXACTLY: serialize a wave when two work
// orders overlap on locus (ancestor-prefix relation over glob prefixes) OR share a
// contract (citation closure already folded in by the planner) OR share a resource.
// Greedy first-fit packing into waves of pairwise-independent work orders. The
// algebra is pure; the I/O (reading contracts, running footprint.mjs) already
// happened inside the route-planner agent (S6).
// -----------------------------------------------------------------------------
function groupDisjoint(plan) {
  const wos = (plan && plan.workOrders) || [];

  // - locus overlap, transcribed from footprint.mjs prefix()/lociOverlap() -
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
      if (pa === '' || pb === '') return true;            // unbounded glob => assume overlap
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

// -----------------------------------------------------------------------------
// computeGreen = floorGreen && trustedGreen (BF3).
//
// Green at a brownfield gate is a conjunction: the regression FLOOR is held green
// as a containment fence (zero correctness credit, but a break is a forbidden
// regression) AND the adversarially-checked TRUSTED set is green. Greenfield has
// an empty floor, so floorGreen is vacuously true and the conjunction reduces to
// trustedGreen - one foundation, both ends (architecture S18).
// -----------------------------------------------------------------------------
function computeGreen(state) {
  const ev = (state && state.gate) || {};
  // A vertical slice is green only when every work order reported a `green` OUTCOME
  // (no unresolved checkpoint/blocked arm) AND the floor and trusted suites are green.
  const allOutcomesGreen = !!ev.allOutcomesGreen;
  const floorGreen = ev.floorGreen !== false;    // empty floor (greenfield) => true
  const trustedGreen = ev.trustedGreen === true; // must be positively green
  return allOutcomesGreen && floorGreen && trustedGreen;
}

// -----------------------------------------------------------------------------
// toGateResult - classify the run's terminal state into the typed GATE_RESULT
// (architecture S7), including the two-oracle floor-break classifier (BF9).
//
//   green            -> ratify at the retro
//   budget-exhausted -> the loop ran out before GREEN (first-class, NOT a gate)
//   blocked          -> a trap arm needs a human decision (BREAKING crossing)
//   (halt is returned earlier, directly from the reconcile/scribe paths.)
//
// BF9 floor-break classification (mechanical, never eyeballed): a floor break where
//   (a) the change DECLARED a matching behaviorDelta AND
//   (b) a new GROWN test now governs that locus
// is a PLANNED SUPERSESSION -> advisory `change-characterized-planned` (not a regression).
// A floor break with neither is an UNFORESEEN REGRESSION -> BREAKING -> blocked.
// -----------------------------------------------------------------------------
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

  // Any pending BREAKING trap arm (intent-fork / other / unresolved jurisdiction...)
  // that survived the loop blocks for a human decision rather than masquerading as
  // budget exhaustion.
  if (state.blocked && state.blocked.length > 0) {
    return { kind: 'blocked', outcome: { kind: 'trap', items: state.blocked, progress: state.progress || {} } };
  }

  // Otherwise the budget-guarded loop ran out before GREEN - the common hard-slice
  // exit, first-class on purpose (S7). Distinguish from a gate.
  return {
    kind: 'budget-exhausted',
    progress: state.progress || {},
    lastOutcome: (state.outcomes && state.outcomes[state.outcomes.length - 1]) || null,
    spent: budget && typeof budget.spent === 'function' ? budget.spent() : null,
  };
}

// -----------------------------------------------------------------------------
// Prompt builders - pure string assembly only. Every agent receives artifact paths
// and reads/writes on disk ITSELF; the script never embeds file contents (which it
// cannot read) and never performs I/O.
// -----------------------------------------------------------------------------
function j(value) { return JSON.stringify(value); }

// callShapeReminder - the reconciler-crash fix (graph-editor-ux-overhaul, 2026-07-01):
// the model repeatedly mis-called the forced StructuredOutput tool by JSON-stringifying
// its ENTIRE answer into a single wrapper property named "input" (e.g. {"input":
// "{\"halt\": false, ...}"}) instead of passing the schema's own fields as the tool
// call's top-level arguments. Every such call fails schema validation ("must have
// required property ...") and burns one of the 5 retries; five wrapped attempts in a
// row exhausts the cap and throws, which is what crashed the reconciler's very first
// step outright. Seen on two different agent types in the same run (reconciler,
// lane-provisioner), so it is a call-shape habit, not a reconciler-specific defect -
// every schema-forced prompt below repeats this line near its `Return the X`
// instruction to head it off before the model ever mis-calls the tool.
const callShapeReminder =
  'TOOL-CALL SHAPE: call the forced tool with the schema\'s fields as the CALL\'S OWN top-level arguments (e.g. {"halt": false, "haltReason": "", ...}) - do NOT JSON-stringify the whole answer into a wrapper property (e.g. {"input": "{...}"}); that fails schema validation and burns a retry.';

function reconcilePrompt(a) {
  // D18 - args may not have propagated (the scriptPath args-drop). The reconciler is the
  // run's first agent and its cwd IS the effort root, so it can always recover the canonical
  // root (and open slice) from disk and hand them back; the pure script cannot read disk.
  const rootLine = a.effortRoot
    ? `Effort root (canonical .reasonable/): ${a.effortRoot}. Pass --root ${a.effortRoot} to every reasonable lib you invoke (reconcile.mjs etc.) so it targets THIS effort, not whichever .reasonable/ happens to sit above your cwd (several efforts may share one repo).`
    : 'Effort root was NOT supplied in args (the scriptPath args-drop, D18). RESOLVE it from your OWN cwd: your process cwd is the effort root (the main checkout) - find the nearest ancestor of cwd that contains a .reasonable/ directory (lib/effort.mjs findEffortRoot, or `git rev-parse --show-toplevel` then confirm .reasonable/ exists). Use that path as --root for every reasonable lib, and RETURN it as effortRoot in the BRIEFING.';
  const sliceLine = a.verticalSliceId
    ? `Target vertical slice: ${a.verticalSliceId}.`
    : 'Target vertical slice was NOT supplied in args - read the currently-open vertical slice from the effort state (config/journal) and RETURN it as currentVerticalSlice.';
  return [
    'Run the unconditional, total, halting recovery prologue for this reasonable run.',
    'Re-derive truth from git + the append-only ledger + the contract files; trust no resume/cache state.',
    rootLine,
    sliceLine,
    'ALWAYS return the resolved effortRoot and currentVerticalSlice in the BRIEFING (even when they were supplied) - the pure script threads back whatever you resolved here.',
    'BRANCH HYGIENE: read config.effortBranch + config.baseBranch and RETURN them in the BRIEFING (reconcile.mjs surfaces them). The effort branch is the base every lane is cut from; the script threads it to the provisioner. Run lib/reconcile.mjs and surface any laneBaseIssues (live lanes that do NOT descend from the effort branch = a build-on-stale, cut from the wrong base): report them, do NOT halt on them - they are a surfaced inconsistency the orchestrator re-bases, the lane work is intact in git.',
    'Partition every artifact configuration into RESOLVED / SAFE-DEFAULT / AMBIGUOUS.',
    'Read config.runMode; if it is absent/null on a cold restart, HALT (defaulting to a "safer" mode is a forbidden inference).',
    'Keep the four FIRST-LINE AMBIGUOUS -> HALT classes: sha-custody (mismatched-trailer reclaim), ledger-without-commit (torn window), runmode-absent, two-lanes-one-WO.',
    'Run the floor-integrity reconcile pass (brownfield) as a tier-3 BACKSTOP tripwire, NOT a first-line HALT (D6): it always SURFACES every floor diff (report it in evidence + note) and never SILENCES it; an `accept` verifier-verdict ANNOTATES the diff explained-by-verdict (ADVISORY ONLY - that annotation never clears the surfacing).',
    'Report floorUnexplained = reconcile.mjs `floorIntegrity.unexplained` (surfaced floor diffs with NO accept verdict). D13 - the UNEXPLAINED-BREACH STOP: in AUTONOMOUS mode floorUnexplained>0 is the FIFTH always-escalate class - something bypassed the pre-integration adversary, so set halt:true (queue BREAKING + STOP, do not grind on). An EXPLAINED floor diff (surfaced but floorUnexplained:0) is a non-blocking NOTICE: log it and continue. In GATED mode both just surface in the briefing for the present human (no halt).',
    'Compute the trust-staleness set: trusted-green tests whose governing clause was amended/extended since last verification.',
    'Report terminalWorkOrders EXACTLY as reconcile.mjs computed it (result.terminalWorkOrders) - the ids of every work order already merged (status:"merged", or status:"green" with merged:true). Do NOT eyeball journal.workOrders yourself; copy the script\'s computed set verbatim. These are DONE, permanently - the route-planner and the script both refuse to re-dispatch them no matter what still sits in .reasonable/work-orders/*.json.',
    'Return the BRIEFING. Set halt:true with haltReason+evidence for ANY of the four first-line AMBIGUOUS classes, or for an UNEXPLAINED autonomous floor breach (haltClass:"floor-integrity-unexplained") - never guess a recovery state.',
    callShapeReminder,
  ].join('\n');
}

function routePrompt(state, a) {
  return [
    'Plan this vertical slice into work orders with computed footprints.',
    `Effort root (canonical .reasonable/): ${a.effortRoot}`,
    `Pass --root ${a.effortRoot} to lib/footprint.mjs (and any reasonable lib) so it targets THIS effort, not whichever .reasonable/ sits above your cwd (several efforts may share one repo).`,
    `Vertical slice: ${a.verticalSliceId}`,
    `Route snapshot: ${j(a.route || null)}`,
    `Reconcile briefing (current state): ${j({ runMode: state.runMode, brownfield: state.brownfield, staleTrusted: state.staleTrusted || [] })}`,
    `TERMINAL work orders (already merged, reconcile.mjs-computed): ${j(state.terminalWorkOrders || [])}. NEVER include one of these ids in the ROUTE_PLAN - not even if a stale .reasonable/work-orders/<id>.json spec file still sits on disk, and not as a re-verify pass. A merged work order's code already landed; there is nothing left to dispatch.`,
    'For EACH work order return: id, role, verticalSlice, and the footprint = { locus, contracts (incl. citation closure), resources } via lib/footprint.mjs.',
    'Mark characterizationNeeded:true for any work order whose first touch crosses ungoverned brownfield code (BF7).',
    'Attach the per-work-order trust-staleness set (tests whose governing clause changed) so audit re-verifies exactly those (D13).',
    'Cite .reasonable/intention.md (the oracle) on every priority/scope fork; an unsettleable fork is an intent-fork, not a silent guess (D5b).',
    'Size waves so the slice cannot plausibly approach the 1000-agent lifetime cap (D16c).',
    'Return the ROUTE_PLAN.',
    callShapeReminder,
  ].join('\n');
}

// intentVerifyPrompt - the S5.6 CONTRACT-ENRICHMENT adversary. Fresh context, read-only
// BY CAPABILITY; it carries the PROPOSED contract diff + its oracle, never the
// implementer's transcript (inheriting the mutator's narrative collapses the judgment
// into agreement). The oracle sits ABOVE the artifact (D9): the VISION + the
// VERTICAL-SLICE SPEC - never intention.md, never the contract the implementer wrote.
function intentVerifyPrompt(wo, a) {
  return [
    'You are the intent-verifier ADVERSARY for ONE proposed CONTRACT ENRICHMENT (the S5.6 contract-enrichment instance of the verification trio). Fresh context, read-only BY CAPABILITY (Read/Grep/Glob).',
    'A worker (the implementer) self-authored a contract enrichment fresh from the code. A sycophantic enrichment passes any tests-vs-contract audit with honors - only INTENT-level review against the top edge catches it. You judge the PROPOSED diff BEFORE the blind-test-writer derives tests from it.',
    `Effort root: ${a.effortRoot}`,
    `Work order: ${wo.id} (component: ${wo.role || 'implementer'}). Read the proposed contract diff from the ledger enrichment entry + the contract file; do NOT read the implementer's transcript.`,
    'YOUR REFERENCE (the oracle, ABOVE the artifact, D9): the VISION + the VERTICAL-SLICE SPEC. Judge ONLY against that top edge. You may NOT judge the enrichment against .reasonable/intention.md, and you may NOT judge it against the contract the implementer itself wrote (that derivation is circular - agreement is tautological).',
    'Judge: (1) does each new must serve a behaviour the vision + slice spec actually demand - not scope sprawl, not a sycophantic restatement of what the code happens to do? (2) is it pinned at the right component / seam, not reaching past the locus? (3) where the enrichment cites a NEIGHBOUR (a shared-contract touch), is that citation warranted by the spec, or is it smuggling coupling the spec does not sanction?',
    'PROPOSE-NOT-ACT (Law 3 corollary, D2): return the verdict as DATA; you integrate nothing and fix nothing. A narrow writer / the orchestrator appends any resulting ledger event.',
    'Return the VERIFIER_VERDICT: verdict accept|reject|escalate, oracle = "vision + vertical-slice spec", by:"intent-verifier", proposed:true, touchesSharedContract reflecting why you ran. accept = every new must is warranted by the vision + slice spec, at the right seam. reject = over- or under-claims against the spec / wrong seam / unwarranted neighbour coupling - CITE the specific over/under-claim and the spec it violates (routes back to the implementer). escalate = two defensible readings the spec cannot settle - name both (routes to the human inbox; in autonomous mode it joins the always-escalate classes). A wrong ACCEPT corrupts effort truth - say only what the reference supports; where it is silent, escalate rather than invent an accept.',
    callShapeReminder,
  ].join('\n');
}

// verdictWriterPrompt - the NARROW WRITER. The read-only adversary proposed an accept as
// data; this writer performs the one resulting act (Law 3 corollary, D2): append ONE
// verifier-verdict event to the on-disk append-only ledger, content-referencing the
// enrichment commit it judged (D5 - durability is the atomic on-disk append, NOT a git
// commit of orchestration state). The append ANNOTATES the diff explained-by-verdict -
// advisory only (D6); it silences no guard.
function verdictWriterPrompt(wo, verdict, a, commit) {
  const event = { type: 'verifier-verdict', component: wo.role || wo.id, diffRef: verdict.diffRef || null, verdict: verdict.verdict, oracle: verdict.oracle, by: 'intent-verifier', proposed: true, ...(commit ? { commit } : {}) };
  return [
    'You are a NARROW WRITER. The intent-verifier ADVERSARY proposed an `accept` verdict on a contract enrichment as data; it is read-only and never integrates its own verdict (Law 3 corollary). You perform the one resulting act: append ONE verifier-verdict event to the append-only ledger, content-referencing the enrichment it judged. Nothing else.',
    `Effort root: ${a.effortRoot}`,
    `Work order: ${wo.id}.`,
    'Append exactly this event to .reasonable/ledger.jsonl (one JSON line; an on-disk append, NOT a git commit of orchestration state - verdict durability is the atomic on-disk append, D5):',
    '  ' + j(event),
    commit
      ? 'The `commit` above is the validated work-product SHA the orchestrator read from git via `git rev-parse`. COPY IT VERBATIM - do NOT re-type, complete, shorten, or alter it. You never originate a SHA (D21): a hand-restated hex is the phantom-commit bug. Add only the monotonic `seq` and the `ts` by reading the ledger tail.'
      : 'The orchestrator did not pass a commit SHA. Do NOT invent one. READ the work-product commit\'s SHA from its own accounting line already in the ledger (the implementer\'s `enrichment`/`commit` entry for this work order) and copy that literal BYTE-FOR-BYTE into a `commit` field. If no such literal exists to copy, the line cannot be written honestly - set persisted:false and HALT (D21). Add the monotonic `seq` and `ts` from the ledger tail.',
    'This verdict ANNOTATES the enrichment diff as explained-by-verdict: ADVISORY ONLY (D6). It does NOT silence any floor or reconcile guard and does NOT bless the enrichment past review - a missing or half-written verdict can only cause MORE human surfacing, never less. Write nothing but this one ledger line. Return the SCRIBE_ACK: persisted:true once the line is durably appended, persisted:false otherwise (the orchestrator surfaces it). A bare-null return is reserved for agent death/skip and also surfaces.',
    callShapeReminder,
  ].join('\n');
}

// The conditional brownfield characterization-needed GENESIS, as an in-run agent
// SEQUENCE inside the running runner - NOT a nested workflow() (one-level nesting
// forbids it, S15 D16d; BF7). Runs provider-first, after the implementer records its
// behaviorDelta, before the characterizer pins anything (pinning first would freeze
// the very behaviour about to change). Returns the implement OUTCOME.
async function provisionThenImplement(wo, _orig, _idx, ctx) {
  const a = ctx.args;
  const effortRoot = a.effortRoot;

  // A prior adjudication may have routed `seam-undeclared` here: a render clause whose
  // OBSERVABLE SEAM the blind-writer could not target (module-load death / wrong export /
  // missing DOM handle). The implementer's re-pass IS the seam-declaration step - declare
  // the missing handles in its `## Observable Seams` and EXPOSE them in the DOM. Consume
  // the task (idempotent; adjudicate re-sets it only if the seam is STILL missing).
  ctx.seamTasks = ctx.seamTasks || {};
  ctx.seamRedeclares = ctx.seamRedeclares || {};
  const seamTask = ctx.seamTasks[wo.id] || null;
  if (seamTask) {
    ctx.seamRedeclares[wo.id] = (ctx.seamRedeclares[wo.id] || 0) + 1;
    delete ctx.seamTasks[wo.id];
    log(`seam-declaration re-pass for ${wo.id} (attempt ${ctx.seamRedeclares[wo.id]}): implementer declares + exposes the observable seam (subkind: ${seamTask.subkind || 'n/a'}).`);
  }

  // 1) Provision the lane BEFORE the fenced worker - closes the descriptor-less window (D7)
  //    AND capture the worktree (PROVISION_ACK, not OUTCOME) so we can direct the CODE-writing
  //    roles into it. Two-root model: code -> the worktree (git -C); .reasonable/ state -> the
  //    canonical effort root. The worktree is nested under the effort root so findEffortRoot
  //    resolves the canonical .reasonable/ from inside it.
  const laneBase = a.effortBranch ? ` ${a.effortBranch}` : '';
  const baseNote = a.effortBranch
    ? `Cut the lane from the EFFORT BRANCH \`${a.effortBranch}\` as an EXPLICIT base (it already contains every earlier green slice), NEVER from a bare HEAD - that is what keeps a dependent slice off stale code.`
    : 'No effort branch configured (an effort predating branch hygiene) - cut the lane from HEAD (bare, legacy behaviour).';
  const ack = await guard(wo.id, () => ctx.agent(
    [
      'Provision the lane for this work order, idempotently, BEFORE any fenced worker writes code.',
      `Effort root (canonical .reasonable/ - the descriptor back-pointer target): ${effortRoot}`,
      `Work order: ${wo.id} (role: ${wo.role || 'implementer'})`,
      baseNote,
      `Do exactly four things in order: (1) git -C ${effortRoot} worktree add ${effortRoot}/.worktrees/${wo.id} -b lane/${wo.id}${laneBase} (a real registered worktree NESTED UNDER the effort root, cut from the effort branch when one is given, NOT an engine throwaway);`,
      '(2) make the worktree able to RUN ITS SUITE - a git worktree is a fresh checkout with no gitignored deps, so the adjudicator/auditor would otherwise be unable to run: link the effort root\'s already-installed dependency dir(s) (node_modules / .venv / target / vendor ...) into the worktree (fast, stack-agnostic), or if none exist run config.setupCommand there; idempotent. Set depsReady accordingly;',
      '(3) write the one .reasonable-lane.json descriptor at the worktree root (effortRoot back-pointer + narrowed locus/role/floorImpact/contractBirth); (4) record the lane in the journal via the scribe.',
      'Do NOT seed .reasonable/ into the worktree - effort state stays canonical (gitignored), reached via the back-pointer. Ensure a checkpoint-only lane carries a trailered commit so reconcile can re-claim it.',
      'Return the PROVISION_ACK: the worktree path + confirmation the descriptor is written + depsReady.',
      callShapeReminder,
    ].join('\n'),
    { label: `provision:${wo.id}`, phase: 'Enrich', agentType: 'reasonable:lane-provisioner', schema: PROVISION_ACK },
  ));
  if (ack && ack.kind === 'checkpoint') return ack;
  if (!ack || ack.provisioned !== true || ack.descriptorWritten !== true || !ack.worktree) {
    // No armed worktree to direct the worker into -> refuse to run a fenced worker lane-less (D7).
    return { kind: 'other', workOrder: wo.id, note: 'lane not provisioned (null / provisioned:false / descriptor absent / no worktree path) - refusing to run a fenced worker without a lane (D7).' };
  }
  const worktree = ack.worktree;
  ctx.worktrees = ctx.worktrees || {};
  ctx.worktrees[wo.id] = worktree; // so blindTest / adjudicate / audit can target the lane worktree
  if (ack.depsReady === false) {
    // The suite-running roles (adjudicator, auditor) can still install on demand, but a
    // worktree without deps is the common reason a probe gets faked - surface it.
    log(`provision: ${wo.id} worktree has NO installed deps (depsReady:false) - the adjudicator/auditor must install before running the suite, or the probe is a gap.`);
  }

  // 2) Conditional brownfield genesis (BF7): record behaviorDelta, then characterize the seam
  //    provider-first - an in-run agent sequence, never a nested workflow(). Two roots: the born
  //    clause + the ledger line -> CANONICAL effort root (absolute); the parked test -> the
  //    worktree, committed with git -C; the reverse discriminator reads config from --root and
  //    the code under test from --tree.
  if (a.brownfield && wo.characterizationNeeded) {
    const characterization = await guard(wo.id, () => ctx.agent(
      [
        'Brownfield first-touch genesis for ungoverned code (BF7). This is an in-run sequence, NOT a nested workflow.',
        `Effort root (canonical .reasonable/ - born clause + ledger here, absolute): ${effortRoot}`,
        `Lane worktree (parked test here; cwd for git): ${worktree}`,
        `Work order: ${wo.id}; seam first touched by this slice.`,
        `Declared behaviorDelta (the observable behaviours this change INTENDS to move): ${j(wo.behaviorDelta || [])}`,
        `Pin current behaviour as born \`characterized\` clauses (FLOOR, untrusted), provider-first, in the fixed atomic order: the born clause + the {type:"characterization"} ledger line to ${effortRoot}/.reasonable/ (canonical, absolute); the parked test under ${worktree}, committed with git -C ${worktree}.`,
        `Stamp \`Supersession: pending\` on any clause the behaviorDelta names. Admit each pin only if it survives the BF2 reverse discriminator (config from --root, code from --tree): node ${a.reasonableRoot || '$CLAUDE_PLUGIN_ROOT'}/lib/discriminator.mjs --reverse --test <name> --locus <glob> --root ${effortRoot} --tree ${worktree} --json.`,
        'Return kind:"characterized" with the component/clauses/seam, or kind:"not-needed".',
        callShapeReminder,
      ].join('\n'),
      { label: `characterize:${wo.id}`, phase: 'Enrich', agentType: 'reasonable:characterizer', schema: CHARACTERIZATION },
    ));
    if (characterization && characterization.kind === 'checkpoint') return characterization;
    // characterization.kind in {characterized, not-needed, other} - provider is now
    // governed; fall through to implementation either way.
  }

  // 3) Implement on the active path: thin-real only; CODE -> the worktree (git -C); the OWN
  //    contract enrichment + the ledger line -> the CANONICAL effort root (on-disk append
  //    content-referencing the commit SHA, D3a/D5 - the ledger is gitignored, never in the commit).
  const seamDirective = seamTask
    ? `SEAM-DECLARATION RE-PASS (a prior adjudication returned seam-undeclared; lib/seam.mjs subkind: ${seamTask.subkind || 'n/a'}): a render clause's OBSERVABLE SEAM was undeclared or unexposed - the blind test could not OBSERVE the unit (module-load / export shape / missing DOM handle), it did NOT disagree about behaviour. Do TWO things: (1) declare the missing handle(s)/export in your component's \`## Observable Seams\` section (PUBLIC observation surface - the export to import + a stable \`data-testid\`/\`role\` per element; this is API surface, not behaviour); (2) EXPOSE them in the DOM you render (add the data-testid, fix the export shape) so the declared seam and the rendered DOM are in PARITY. The declared seam is part of the contract delta you are accountable for. Missing: ${j(seamTask.missing || seamTask.signals || seamTask.hint || seamTask)}.`
    : '';
  return guard(wo.id, () => ctx.agent(
    [
      'Implement this work order on the active vertical-slice path (thin-real only; loud stubs off-path).',
      `Effort root (canonical .reasonable/ - contracts + ledger here, absolute): ${effortRoot}`,
      `Lane worktree (CODE here; cwd for git): ${worktree}`,
      `Work order: ${wo.id}`,
      `Vertical slice: ${wo.verticalSlice || a.verticalSliceId}`,
      `TWO ROOTS, by DOMAIN: write code under the worktree (${worktree}) and stay within your declared locus (request scope expansion from the orchestrator rather than editing out of locus). Write \`.reasonable/\` state to the CANONICAL effort root by ABSOLUTE path - never into the worktree (gitignored, lost, fence-denied). Your process cwd is the effort root; use absolute paths + git -C.`,
      `Enrich your OWN contract with newly-learned musts. Your component(s): ${j((wo.footprint && wo.footprint.contracts) || wo.contracts || [])} - edit ${effortRoot}/.reasonable/contracts/<that-component>.md and append the ledger line with EXACTLY type:"enrichment" and component set to that SAME name, to ${effortRoot}/.reasonable/ledger.jsonl.`,
      'CRITICAL (ratchet + fence): a contract delta is type:"enrichment" - NEVER type:"verdict" (a verdict is only a progress note for checkpoint/infeasible) - and its component MUST match your contract name above EXACTLY. The blind-test-writer\'s tests are fence-gated on a logged enrichment/amendment/characterization for THIS component; a verdict-typed or wrong-component entry leaves the gate seeing no delta, blocks the tests, and spins the wave. Log it right the first time, in this same atomic commit, BEFORE the blind-test stage.',
      `OBSERVABLE SEAMS (render-coupled clauses): a clause whose only observation is via rendering needs a declared seam so the blind-writer can target it instead of guessing. PREFER a function-level clause where the observable is a pure value (a path string, a coordinate) - test the exported function, not the DOM. ONLY for a genuinely render-only observable, declare a \`## Observable Seams\` bullet in your contract (the export to import + a stable \`data-testid\`/\`role\` per element) and EXPOSE it in the DOM you render. Follow the repo TEST CONVENTIONS (${effortRoot}/.reasonable/test-conventions.md, if present) for the module system / export shape / render lib - never invent them.`,
      seamDirective,
      'Report your enrichment in the OUTCOME detail as detail.enrichment = { enriched, clauses:[ids you added], touchesSharedContract (true iff a new Citations bullet to a neighbour) } so the contract-enrichment adversary can risk-gate and judge the PROPOSED diff against the vision + slice spec BEFORE tests derive from it. Report any observable seams you declared/exposed as detail.seamsExposed = [keys].',
      'Report the validated work-product commit SHA as detail.commit (the EXACT `git rev-parse HEAD` output you just validated). The orchestrator passes it VERBATIM to the verifier-verdict scribe, which has no Bash and must copy a provided literal - never restate a SHA from context (D21).',
      `Land your terminal effects as ONE logical step (D3a/D5): the work-product CODE in a single \`git -C ${worktree}\` commit carrying a \`Work-Order: ${wo.id}\` trailer. Then READ that commit's SHA from git - \`git -C ${worktree} rev-parse HEAD\` - and VALIDATE it with \`git -C ${worktree} cat-file -e <sha>^{commit}\` (it must succeed). NEVER type a 40-char hex from memory: a hand-restated SHA is the phantom-commit bug that wedges reconcile (D21). Your ledger line is an on-disk append to ${effortRoot}/.reasonable/ledger.jsonl whose \`commit\` is that EXACT rev-parse output - the ledger is gitignored, NEVER part of the git commit.`,
      'If you hit a wall, emit the matching OUTCOME kind (scope-expansion / ripple / jurisdiction / spike-needed / infeasible / intent-fork / other) - never thrash toward green.',
      `Cite ${effortRoot}/.reasonable/intention.md when a fork turns on a scope/priority choice; an unsettleable fork is intent-fork (BREAKING), never a silent guess.`,
      'Return the OUTCOME.',
      callShapeReminder,
    ].filter(Boolean).join('\n'),
    { label: `implement:${wo.id}`, phase: 'Enrich', agentType: 'reasonable:implementer', schema: OUTCOME },
  ));
}

// intentVerify - the S5.6 CONTRACT-ENRICHMENT adversary, the verification trio's leg
// on the implementer's self-authored contract enrichment (rot vector 3 / sycophancy).
// A fresh-context, read-only-by-capability intent-verifier judges the PROPOSED contract
// diff against the VISION + VERTICAL-SLICE SPEC oracle (ABOVE the artifact, D9 - never
// intention.md, never the contract the implementer wrote, which is circular), BEFORE
// the blind-test-writer derives tests from it. It runs INSIDE the trio shape:
//   - Carry a trapped/non-green prior OUTCOME forward untouched (short-circuit).
//   - RISK-GATE (D7): ALWAYS run when the enrichment touches a SHARED contract (a
//     citation to a neighbour); SKIP a boxed-in own-contract-only delta (a false trio).
//     The dial trades a check for speed - it NEVER disables the floor/shared-contract
//     guard; the gate keys on what the enrichment TOUCHES, never on trust.
//   - A work order that enriched NOTHING has no diff to judge -> pass the prior through.
//   - PROPOSE-NOT-ACT (D2): the adversary returns the verdict as data; a narrow writer
//     appends the verifier-verdict ledger event (D5). accept -> continue the chain;
//     reject -> one bounded re-implement by the implementer then re-judge, still-not-
//     accepted -> intent-fork (BREAKING) to the human; escalate -> intent-fork (BREAKING,
//     autonomous: joins the always-escalate classes, D8). A null/half-written verdict
//     fails toward scrutiny (intent-fork), never silently past.
async function intentVerify(prev, wo, _idx, ctx) {
  if (!prev || prev.kind !== 'green') return prev; // trapped lane: carry the trap forward
  const a = ctx.args;

  // The implementer reports its enrichment in the OUTCOME detail: which clauses it
  // added and whether the delta added a Citations bullet (a shared-contract touch).
  const enr = (prev.detail && prev.detail.enrichment) || {};
  const enriched = !!(enr.clauses && enr.clauses.length) || enr.enriched === true;
  if (!enriched) return prev; // nothing self-authored to judge - no diff, no adversary.

  const touchesSharedContract = enr.touchesSharedContract === true || enr.citationsAdded === true;
  if (!touchesSharedContract) {
    // Boxed-in own-contract-only enrichment nothing depends on yet - the risk-gate lets
    // it past unverified (a false trio). This skip keys on what the enrichment TOUCHES,
    // in EITHER run mode; a shared-contract touch is OFF the dial entirely (non-waivable).
    log(`intent-verify: ${wo.id} enrichment is own-contract-only (no shared-contract touch) - adversary skipped per the risk-gate (D7).`);
    return prev;
  }

  let verdict = await guard(wo.id, () => ctx.agent(intentVerifyPrompt(wo, a), {
    label: `intent-verify:${wo.id}`, phase: 'Enrich', agentType: 'reasonable:intent-verifier', schema: VERIFIER_VERDICT,
  }));
  if (verdict && verdict.kind === 'checkpoint') return verdict; // budget ceiling / null gap

  // reject -> ONE bounded re-implement against the verdict, then re-judge. A fixed control
  // flow cannot grow an unbounded loop, so a still-rejected enrichment escalates rather
  // than thrashing toward acceptance.
  if (verdict && verdict.verdict === 'reject') {
    log(`intent-verify: ${wo.id} enrichment REJECTED by the adversary (${verdict.reason || 'no reason'}) - routing back to the implementer for one re-enrichment.`);
    const reimpl = await provisionThenImplement(wo, null, _idx, ctx);
    if (reimpl && reimpl.kind === 'checkpoint') return reimpl;
    if (!reimpl || reimpl.kind !== 'green') return reimpl; // re-implement trapped -> carry that trap
    verdict = await guard(wo.id, () => ctx.agent(intentVerifyPrompt(wo, a), {
      label: `intent-verify:${wo.id}:retry`, phase: 'Enrich', agentType: 'reasonable:intent-verifier', schema: VERIFIER_VERDICT,
    }));
    if (verdict && verdict.kind === 'checkpoint') return verdict;
    if (!verdict || verdict.verdict !== 'accept') {
      return { kind: 'intent-fork', workOrder: wo.id, verticalSlice: wo.verticalSlice || a.verticalSliceId,
        detail: { stage: 'intent-verify', reason: `enrichment still not accepted after one re-enrichment (${(verdict && verdict.reason) || 'no verdict'})`, oracle: 'vision + vertical-slice spec' },
        note: 'contract-enrichment adversary: re-enrichment still rejected - escalating to the human' };
    }
  }

  // escalate (or a null/absent verdict) -> intent-fork to the human. The failure
  // direction is always toward scrutiny (annotate-not-disarm spirit): a missing verdict
  // surfaces MORE, never less. In autonomous mode an escalate joins the always-escalate
  // classes (the trap router queues it BREAKING).
  if (!verdict || verdict.verdict === 'escalate') {
    return { kind: 'intent-fork', workOrder: wo.id, verticalSlice: wo.verticalSlice || a.verticalSliceId,
      detail: { stage: 'intent-verify', reason: (verdict && verdict.reason) || 'intent-verifier returned no verdict - surfacing (fail toward scrutiny)', oracle: (verdict && verdict.oracle) || 'vision + vertical-slice spec' },
      note: 'contract-enrichment adversary escalated: enrichment unsettleable against the vision + slice spec' };
  }

  // accept -> a NARROW WRITER (separated from the read-only adversary, Law 3 corollary)
  // appends the verifier-verdict ledger event (D5). The append ANNOTATES the enrichment
  // diff (advisory, D6); it integrates/blesses/silences nothing. A failed append fails
  // toward scrutiny -> intent-fork.
  // Pass the implementer's VALIDATED work-product SHA (read from git, detail.commit) so the
  // Bash-less scribe copies a provided literal verbatim rather than restating a SHA from context (D21).
  const enrichmentCommit = (prev.detail && prev.detail.commit) || null;
  const ack = await guard(wo.id, () => ctx.agent(verdictWriterPrompt(wo, verdict, a, enrichmentCommit), {
    label: `verdict-write:${wo.id}`, phase: 'Enrich', agentType: 'reasonable:journal-writer', schema: SCRIBE_ACK,
  }));
  if (!ack || ack.kind === 'checkpoint' || ack.persisted !== true) {
    return { kind: 'intent-fork', workOrder: wo.id, verticalSlice: wo.verticalSlice || a.verticalSliceId,
      detail: { stage: 'intent-verify', reason: 'accept verdict could not be durably appended to the ledger - surfacing (annotate-not-disarm: never fewer eyes)' },
      note: 'contract-enrichment adversary accepted but the verifier-verdict append failed - escalating' };
  }
  return prev; // accepted + recorded: the enrichment stands; continue the chain.
}

// reprovisionForBlindTest - re-provision the SAME lane for the blind-test-writer stage
// (the graph-editor-ux-overhaul incident). provisionThenImplement's lane-provisioner call
// only ever narrows the descriptor to the IMPLEMENTER role (testEditsAllowed:false); with
// no second provisioner call, the blind-test-writer's first tool call hits that STALE
// descriptor and the fence correctly hard-denies it (DESIGN §6.3) - the pipeline stalls
// into a blocked trap even though the implementer finished cleanly. This is an
// UNCONDITIONAL pipeline stage, not a judgment call any agent makes: the engine runs it
// for every work order, so no model ever has to "remember" to re-provision (capability
// beats discipline). Same discipline as the initial provision-before-fence rule (D7), just
// re-applied at the ROLE TRANSITION rather than only at lane creation.
async function reprovisionForBlindTest(prev, wo, _idx, ctx) {
  if (!prev || prev.kind !== 'green') return prev; // trapped lane: carry the trap forward
  const a = ctx.args;
  const effortRoot = a.effortRoot;
  const ack = await guard(wo.id, () => ctx.agent(
    [
      'Re-provision the SAME lane for this work order for the BLIND-TEST-WRITER stage. The implementer already committed; that lane\'s worktree, deps, and journal record already exist - this is a ROLE TRANSITION on an existing lane, NOT a fresh lane.',
      `Effort root (canonical .reasonable/ - the descriptor back-pointer target): ${effortRoot}`,
      `Work order: ${wo.id} (new role: blind-test-writer, was implementer)`,
      'Steps 1/2/4 (worktree, deps, journal record) are already satisfied - skip them. Step 3 is NOT a no-op this time: overwrite the existing .reasonable-lane.json IN PLACE with role:"blind-test-writer", testEditsAllowed:true, and locus set to the effort\'s configured testGlobs. Leave every other field (workOrder, effortRoot, contracts, behaviorDelta, floorImpact, contractBirth, budget, counter) exactly as it already reads - only the per-role narrowing moves.',
      'This closes the SAME descriptor-less window the initial provision-before-fence rule closes (D7), re-applied at the role transition: the rewrite must land BEFORE the blind-test-writer\'s first tool call, never after it hits a fence denial.',
      'Return the PROVISION_ACK: the worktree path (unchanged) + confirmation the descriptor now reads role:"blind-test-writer".',
      callShapeReminder,
    ].join('\n'),
    { label: `reprovision-blind-test:${wo.id}`, phase: 'Enrich', agentType: 'reasonable:lane-provisioner', schema: PROVISION_ACK },
  ));
  if (ack && ack.kind === 'checkpoint') return ack;
  if (!ack || ack.provisioned !== true || ack.descriptorWritten !== true) {
    return { kind: 'other', workOrder: wo.id, note: 'lane could not be re-provisioned for the blind-test-writer role transition (null / provisioned:false / descriptor not rewritten) - refusing to dispatch the blind-test-writer against a stale (implementer) descriptor.' };
  }
  return prev; // descriptor now names blind-test-writer; continue the chain unchanged.
}

// blindTest - fresh-context agent; receives ONLY old+new contract text, never the
// implementation diff; translates the contract delta into test changes; no Bash
// (cannot run tests). Carries the prior OUTCOME forward untouched if the lane already
// trapped (a non-green prior result short-circuits the rest of its chain).
async function blindTest(prev, wo, _idx, ctx) {
  if (!prev || prev.kind !== 'green') return prev; // trapped lane: carry the trap forward
  const a = ctx.args;
  const worktree = (ctx.worktrees && ctx.worktrees[wo.id]) || a.effortRoot;
  return guard(wo.id, () => ctx.agent(
    [
      'Blind test-writer: you receive ONLY the old and new contract text for this work order - never the implementation diff.',
      `Effort root (canonical .reasonable/ - read the contract here): ${a.effortRoot}`,
      `Lane worktree (write the TEST files here, by absolute path - tests are CODE): ${worktree}`,
      `Work order: ${wo.id} (read the contract delta from the canonical ${a.effortRoot}/.reasonable/ledger.jsonl entry + the contract files; do NOT read src).`,
      'Translate the contract delta into test changes UNDER THE WORKTREE (tests track contracts 1:1). Every new must enters as a RED assertion first.',
      `FOLLOW THE REPO TEST CONVENTIONS - never guess them. Read ${a.effortRoot}/.reasonable/test-conventions.md (and an existing test file in the suite): use the declared MODULE SYSTEM (e.g. ESM \`import\`, NEVER CJS \`require\` in an ESM repo), RUNNER, and RENDER LIB. The conventions and the contract's \`## Observable Seams\` are PUBLIC TEST SURFACE, not implementation - reading them does NOT break your blindness to behaviour.`,
      'PREFER FUNCTION-LEVEL where the contract is exact: if a clause\'s observable is a pure value (a path string, a coordinate), import and assert the exported FUNCTION, not the rendered DOM. Reserve render tests for genuinely render-only observations.',
      `For a render-only clause, TARGET the contract's \`## Observable Seams\`: import via the DECLARED export, and query the DECLARED stable handle (\`data-testid\`/\`role\`) for each element - do not guess an export shape or an incidental attribute. If a render clause has NO declared observable seam, do NOT guess one: produce the test against the declared seam if present, else flag it - the adjudicator will route \`seam-undeclared\` deterministically (the implementer then declares + exposes it). You still NEVER read the implementation and NEVER assert what the code does.`,
      'You do not run tests (no Bash). Formalize expectations blind. Your process cwd is the effort root, so write tests by absolute path under the worktree - never into the worktree .reasonable/.',
      'Return the OUTCOME (kind:"green" if you produced the test delta cleanly; otherwise the matching trap kind).',
      callShapeReminder,
    ].join('\n'),
    { label: `blind-test:${wo.id}`, phase: 'Enrich', agentType: 'reasonable:blind-test-writer', schema: OUTCOME },
  ));
}

// adjudicate - read-only-by-WRITE (Read/Grep/Glob/Bash; NO Edit): it ACTUALLY RUNS the
// lane suite to surface the reds, then judges every red with the CONTRACT TEXT as arbiter
// (impl violates contract -> fix impl; test mistranslates a clause -> fix test citing the
// clause). It fixes nothing - judge != actor is preserved by withholding Edit, not Bash.
// THE ANTI-PLACEHOLDER RULE (the false-green incident, D17): the suite run is REAL or it is
// a LOUD gap. The adjudicator may NOT return `checkpoint` (reserved for the budget ceiling)
// to stand in for "I did not run" - inventing a probe result (a "placeholder") manufactures
// a false green. A suite it cannot execute (deps absent, no test command) is kind:"other"
// (BREAKING), never green and never checkpoint. green requires an EXECUTED, fully-green suite.
async function adjudicate(prev, wo, _idx, ctx) {
  if (!prev || prev.kind !== 'green') return prev;
  const a = ctx.args;
  const worktree = (ctx.worktrees && ctx.worktrees[wo.id]) || a.effortRoot;
  const plug = a.reasonableRoot || '$CLAUDE_PLUGIN_ROOT';
  // The bounded-escalation cap: how many SEAM-DECLARATION re-passes we allow before a
  // persistently-undeclared/unexposed seam escalates to the human instead of looping (the
  // *new* path must not become the next infinite loop). ctx.seamRedeclares[wo] counts the
  // declaration passes the implementer has already taken (incremented in
  // provisionThenImplement). At the cap, a render clause genuinely resists a render test -
  // a function-level reframe or a human seam decision is owed.
  const SEAM_REDECLARE_CAP = 2;
  const result = await guard(wo.id, () => ctx.agent(
    [
      'Adjudicator: you have Bash. ACTUALLY RUN the lane suite for this work order, then judge every red with the CONTRACT TEXT as the sole arbiter. You run and you judge; you fix nothing (no Edit) - a different actor carries out the verdict.',
      `Effort root (canonical .reasonable/ - read the contract here): ${a.effortRoot}`,
      `Lane worktree (RUN the tests here - the code + tests live on the lane branch): ${worktree}`,
      `Work order: ${wo.id}`,
      `Run the suite in the worktree (cwd ${worktree}), NOT the main checkout. Read the contract from ${a.effortRoot}/.reasonable/contracts/.`,
      'ANTI-PLACEHOLDER (cardinal rule): execute the suite for real and report detail.suiteRan=true with detail.failing=[failing test ids]. If you CANNOT run it (deps missing - see if the lane needs an install - or no test command, or a harness error), that is a LOUD verification gap: return kind:"other" with a note naming exactly why it could not run. You may NEVER return kind:"checkpoint" (that is the budget ceiling, not a probe gap) and NEVER kind:"green" without an executed, fully-green suite. Inventing a probe result is the cardinal sin - it manufactures a false green.',
      `SEAM TRIAGE (do this on ANY red, BEFORE the contract judgment): a render-clause test can die because it could not OBSERVE the unit (module-load death, wrong export shape, or a missing DOM handle) rather than because behaviour disagrees. Capture the failing output to a file and CLASSIFY it deterministically - never eyeball it: \`node ${plug}/lib/seam.mjs --classify --log <captured-output-file> --json\`. If it reports kind:"seam" -> return kind:"seam-undeclared" with detail = { component:<the render component>, clause:<the render clause id if known>, subkind:<module-load|export-shape|element-not-found>, missing:<the export/handle the test needed>, signals:<the classifier signals> }. This routes a SEAM-DECLARATION re-pass (the implementer declares its \`## Observable Seams\` + exposes the handle), NOT a blind redo. Do this ONLY when the classifier says kind:"seam" - a real assertion mismatch stays yours to judge below.`,
      'Implementation violates contract (a real behavioural red the classifier calls kind:"behavior") -> verdict fix-implementation (test untouched): return kind:"jurisdiction" so the implementer is re-dispatched to satisfy the contract next pass. Test mistranslates a clause -> verdict fix-test, citing the clause; if the blind writer must redo it, return kind:"intent-fork". Green-ness is never the goal state of test-editing.',
      `A scope/priority/jurisdiction fork must cite ${a.effortRoot}/.reasonable/intention.md; an unsettleable fork is intent-fork (BREAKING).`,
      'Return the OUTCOME: kind:"green" ONLY when the suite actually executed and is fully green and the lane is consistent with its contract (set detail.suiteRan=true); a seam-observation red -> kind:"seam-undeclared"; any behavioural red -> the matching kind above (never green, never checkpoint).',
      callShapeReminder,
    ].join('\n'),
    { label: `adjudicate:${wo.id}`, phase: 'Enrich', agentType: 'reasonable:adjudicator', schema: OUTCOME },
  ));

  // Bounded-escalation guard around the seam route. The adjudicator classifies; the
  // SCRIPT bounds the loop (a fixed control flow cannot grow an unbounded one). On a
  // seam-undeclared verdict: below the cap, stash the task so the next pass's implementer
  // declares + exposes the seam (deterministic resolution, NOT intent-fork). At/over the
  // cap, the seam resisted declaration twice - escalate BREAKING to the human rather than
  // spin (a render clause may need a function-level reframe or a human seam decision).
  if (result && result.kind === 'seam-undeclared') {
    const tries = (ctx.seamRedeclares && ctx.seamRedeclares[wo.id]) || 0;
    if (tries >= SEAM_REDECLARE_CAP) {
      return { kind: 'intent-fork', workOrder: wo.id, verticalSlice: wo.verticalSlice || a.verticalSliceId,
        detail: { stage: 'adjudicate', reason: `observable seam still undeclared/unexposed after ${tries} declaration pass(es) (subkind: ${(result.detail && result.detail.subkind) || 'n/a'}) - a render clause may need a function-level reframe or a human seam decision`, seam: result.detail || {}, oracle: 'vision + vertical-slice spec' },
        note: 'seam route exhausted its bounded re-passes - escalating to the human (fail toward scrutiny)' };
    }
    ctx.seamTasks = ctx.seamTasks || {};
    ctx.seamTasks[wo.id] = result.detail || {};
    log(`adjudicate: ${wo.id} red is a seam-observation failure (subkind: ${(result.detail && result.detail.subkind) || 'n/a'}) - routing seam-undeclared (declaration pass ${tries + 1}/${SEAM_REDECLARE_CAP}), NOT a blind redo.`);
  }
  return result;
}

// audit - the mechanical teeth in escalating cost order, as a read-only parallel()
// LEAF (barrier): discriminator + bidirectional mapping per enrichment, mutation
// sampling at the gate, reverse discriminator for characterization clauses; gate =
// AND over all checks. Read-only, no worktree isolation. Collapses to one
// discriminator at the low floor (S17). Fills `floorBreak` + `newGrownTestLoci` +
// `evidence` for the BF9 classifier and computeGreen.
async function audit(prev, wo, _idx, ctx) {
  if (!prev || prev.kind !== 'green') return prev;
  const a = ctx.args;
  const worktree = (ctx.worktrees && ctx.worktrees[wo.id]) || a.effortRoot;
  const plug = a.reasonableRoot || '$CLAUDE_PLUGIN_ROOT';
  // The `suite` leaf is the SECOND independent suite truth (after the adjudicator): it
  // RUNS the full lane suite at the lane tip and reports a POSITIVE suiteRan + the real
  // pass/fail counts. It is not optional even at the low floor - a regression floor that
  // is never executed is not a floor. The other leaves are the escalating mechanical teeth.
  const checks = a.lowFloor
    ? ['suite', 'discriminator'] // S17: floor case = run the floor suite + one discriminator
    : ['suite', 'discriminator', 'bidirectional-mapping', 'mutation-sample', 'reverse-discriminator'];

  // Read-only escalating checks run TOGETHER (parallel barrier); gate = AND over all.
  // TWO ROOTS: every lib reads CONFIG from the effort root (--root) but runs against the CODE
  // in the lane worktree (--tree) - the code + tests are on the lane branch, not the main checkout.
  const libNote = (check) => (check === 'bidirectional-mapping' ? 'citation-resolve'
    : check === 'reverse-discriminator' ? 'discriminator'
    : check === 'mutation-sample' ? 'mutation-sample' : 'discriminator');
  const reports = await parallel(checks.map((check) => () =>
    guard(wo.id, () => ctx.agent(
      [
        check === 'suite'
          ? 'Auditor suite leaf: you have Bash. RUN the FULL lane test suite at the lane tip (cwd the worktree) - the real test command, for real. Never simulate it, never assert a result you did not execute.'
          : `Auditor mechanical check: ${check} (read-only; never simulate what a script computes - invoke lib/${libNote(check)}.mjs).`,
        `Effort root (canonical .reasonable/ - config/contracts/floor): ${a.effortRoot}`,
        `Lane worktree (code + tests under test - run/inspect the LANE TIP here, not the main checkout): ${worktree}`,
        `Work order: ${wo.id}`,
        check === 'suite' ? '' : 'EVERY lib invocation passes config from the effort root and code from the worktree: append `--root ' + a.effortRoot + ' --tree ' + worktree + '` (citation-resolve takes only --root, it reads canonical contracts).',
        check === 'suite' ? `Run the suite in ${worktree} (cwd the worktree). If deps are missing the lane cannot be verified - check whether an install is needed; if you still cannot run it, return kind:"other" (a LOUD gap), NEVER kind:"green" and NEVER kind:"checkpoint". On a real run, report detail.suiteRan=true, detail.passed, detail.failed, detail.failing=[failing test ids], and set detail.trustedGreen=true ONLY if the trusted suite actually ran fully green, detail.floorGreen=false on any floor-test regression.` : '',
        check === 'discriminator' ? `Every new/changed test must FAIL on the pre-task commit: \`node ${plug}/lib/discriminator.mjs --base <pre-task> --root ${a.effortRoot} --tree ${worktree} --json\`. A test that passes on both old and new impls verifies nothing.` : '',
        check === 'bidirectional-mapping' ? `Every new assertion cites a contract clause; every new clause has at least one assertion: \`node ${plug}/lib/citation-resolve.mjs --root ${a.effortRoot} --json\`.` : '',
        check === 'mutation-sample' ? `Mutate the implementation k times; surviving mutants expose vacuous tests: \`node ${plug}/lib/mutation-sample.mjs --root ${a.effortRoot} --tree ${worktree} --json\`.` : '',
        check === 'reverse-discriminator' ? `Characterization clauses only: \`node ${plug}/lib/discriminator.mjs --reverse --test <name> --locus <glob> --root ${a.effortRoot} --tree ${worktree} --json\` - require RED under a locus mutant (the dual of HEAD~). Do NOT delegate to mutation-sample.` : '',
        check === 'suite' ? '' : 'Also report: floorGreen, trustedGreen, any floorBreak {broke, floorTests, loci}, and the loci of new GROWN (RED-at-HEAD~) tests for the planned-supersession classifier.',
        'Return the OUTCOME (kind:"green" iff this check passed; for the suite leaf, green iff the suite actually ran fully green); attach evidence.',
        callShapeReminder,
      ].filter(Boolean).join('\n'),
      { label: `audit:${check}:${wo.id}`, phase: 'Enrich', agentType: 'reasonable:auditor', schema: OUTCOME },
    ))));

  const real = reports.filter(Boolean);
  // A null/skip in the audit leaf is a verification gap -> checkpoint (slice not green).
  const gap = real.find((r) => r.kind === 'checkpoint');
  if (gap) return gap;
  const failed = real.find((r) => r.kind !== 'green');
  if (failed) return failed; // a failing check is a trap arm, carried to the router

  // AND over all checks held -> merge evidence into the lane's terminal green OUTCOME.
  const merged = { kind: 'green', workOrder: wo.id, verticalSlice: wo.verticalSlice || a.verticalSliceId };
  merged.evidence = { checks: real.map((r) => ({ check: r.detail && r.detail.check, evidence: r.evidence })) };
  // Lift floor/trust/grown-loci signals from whichever check reported them.
  merged.floorBreak = real.map((r) => r.floorBreak).find((x) => x && x.broke) || { broke: false };
  merged.behaviorDelta = prev.behaviorDelta || wo.behaviorDelta || [];
  merged.newGrownTestLoci = [].concat(...real.map((r) => r.newGrownTestLoci || []));
  merged.detail = {
    floorGreen: real.every((r) => !(r.detail && r.detail.floorGreen === false)),
    trustedGreen: real.some((r) => r.detail && r.detail.trustedGreen === true),
    // suiteRan is POSITIVE evidence the suite actually executed (the `suite` leaf). The
    // gate keys green on this, never on the mere absence of a reported red (D17).
    suiteRan: real.some((r) => r.detail && r.detail.suiteRan === true),
    failing: [].concat(...real.map((r) => (r.detail && r.detail.failing) || [])),
  };
  return merged;
}

// -----------------------------------------------------------------------------
// route() - the trap router: a pure JS switch over OUTCOME.kind mapping each to its
// pre-written membrane crossing (architecture S8). NEVER throws on a trap; it folds
// the outcome into the accumulating state. Inter-run / human decisions are queued by
// the scribe (returned as state for journalWrite); machine-to-machine traps steer the
// existing budget-guarded loop. `mode` in {gated, autonomous} decides grant-vs-inbox.
// -----------------------------------------------------------------------------
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
      // Sequence provider-first / consumer-first single-contract pipeline runs (S5.10).
      s.needsAnotherPass = true;
      s.ripples = s.ripples || [];
      s.ripples.push({ workOrder: outcome.workOrder, detail: outcome.detail || {} });
      break;

    case 'jurisdiction':
      // dispatch the adjudicator (which cites the oracle) - re-runs next pass.
      s.needsAnotherPass = true;
      s.pendingInbox.push({ class: 'ADVISORY', kind: 'jurisdiction', workOrder: outcome.workOrder, detail: outcome.detail || {} });
      break;

    case 'seam-undeclared':
      // A render clause's OBSERVABLE SEAM was missing/undeclared (deterministic, classified
      // by lib/seam.mjs - NOT a behaviour mismatch). The fix is a SEAM-DECLARATION re-pass:
      // the implementer enriches its `## Observable Seams` + exposes the handle, then the
      // blind-writer re-targets it. This is the loop the old `fix-test -> intent-fork ->
      // blind redo` could never close (a blind redo cannot fix a seam it cannot see).
      // ADVISORY, not BREAKING: it resolves itself in-run. The adjudicate stage already
      // stashed the task on ctx and bounds the re-passes (escalates to intent-fork at the
      // cap), so this arm only needs to keep the loop going.
      s.needsAnotherPass = true;
      s.pendingInbox.push({ class: 'ADVISORY', kind: 'seam-undeclared', workOrder: outcome.workOrder, detail: outcome.detail || {} });
      break;

    case 'spike-needed':
      // RETURN to the main session to launch the spike workflow (nesting limit, S12/S15).
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
      // an ambiguity neither code nor intention can settle -> human inbox (BREAKING).
      s.blocked.push({ class: 'BREAKING', kind: 'intent-fork', workOrder: outcome.workOrder, detail: outcome.detail || {} });
      break;

    case 'other':
    default:
      // an unknown wall the schema can't name -> human inbox (BREAKING); fail-safe.
      s.blocked.push({ class: 'BREAKING', kind: 'other', workOrder: outcome.workOrder, detail: outcome.detail || {}, note: outcome.note });
      break;
  }
  return s;
}

// journalWriteAhead - the WRITE-AHEAD half of the derived-index write (D3b/D19), via the
// same lone serialized scribe, dispatched from this non-parallel position BEFORE the wave's
// pipeline runs. It records INTENT TO DISPATCH: it sets currentVerticalSlice and flips this
// wave's work orders to `dispatched` so the deterministic progress mirror flips from
// `pending` to `active` within seconds - not after the whole provision->implement->
// blind-test->adjudicate->audit pipeline lands (the frozen-wave problem, D19). It writes the
// COARSE program-counter advance only; the FINE per-stage + per-tool "now" view comes from
// the ephemeral live channel (a hook, never the scribe), so this stays ONE write per wave,
// never one per stage. Fail-SOFT by design: a non-persist here is an optimistic-advance miss
// for the mirror, not a truth loss - the live channel still narrates the wave and the
// post-wave authoritative journalWrite below still records the real transitions (and HALTs on
// its own failure). The scribe never downgrades a merged/green order (it only lifts
// missing/pending -> dispatched), so re-passes are idempotent.
async function journalWriteAhead(freshWorkOrders, a) {
  const wos = freshWorkOrders.map((wo) => ({
    id: wo.id,
    role: wo.role || 'implementer',
    verticalSlice: wo.verticalSlice || a.verticalSliceId,
    status: 'dispatched',
  }));
  try {
    return await agent(
      [
        'Write-ahead the derived index (journal.json) - and nothing else (D3b). This is the BEFORE-the-worker program-counter advance the progress mirror projects (write-ahead dispatched, your charter).',
        `Set journal.currentVerticalSlice = ${j(a.verticalSliceId)}.`,
        `For EACH of these work orders, UPSERT journal.workOrders[id] (READ journal.json first, MERGE - never drop a sibling work order, never invent fields): set status:"dispatched", role, and verticalSlice. ${j(wos)}`,
        'DO NOT DOWNGRADE: only lift a work order to "dispatched" when its current status is absent or "pending". Leave any "merged"/"checkpointed"/"dead-end" order exactly as it is (a re-pass must be idempotent).',
        'Do NOT touch inbox.json, the ledger, contracts, or any work order not listed here. Do NOT mark anything merged/green - that is the after-the-wave transition, not this write.',
        'Return the SCRIBE_ACK: persisted:true once journal.json is durably written faithfully against its schema; persisted:false otherwise (the script logs it and proceeds - the post-wave write is authoritative).',
        callShapeReminder,
      ].join('\n'),
      { label: 'scribe:write-ahead', phase: 'Enrich', agentType: 'reasonable:journal-writer', schema: SCRIBE_ACK },
    );
  } catch (e) {
    // A bare-null return already means "agent death/skip" to this function's caller
    // (fail-SOFT by design, per the docstring above) - a hard StructuredOutput failure
    // is the same kind of non-answer, so it folds into that SAME sentinel instead of
    // crashing the whole run (the post-wave journalWrite stays authoritative either way).
    log(`scribe:write-ahead agent failed: ${String((e && e.message) || e)}`);
    return null;
  }
}

// journalWrite - the script's ONE AUTHORITATIVE derived-index write, via the lone serialized
// scribe (D3b). Serial and awaited; runs only from this non-parallel position. A null return
// is a HALT upstream (the script must not proceed believing a transition persisted) -
// but loses no truth, since reconcile rebuilds the index from git+ledger.
async function journalWrite(state, a) {
  // Descriptive run telemetry for the deterministic progress mirror (D19): the script's
  // own agent tally + the engine's token spend. Best-effort, NOT a gate input and NOT
  // reconcile-rebuildable (like journal.lastReconciled) - it resets from the next wave on
  // a cold rebuild. The pure script can't stamp time; the scribe adds updatedAt.
  const cost = {
    agentsDispatched: state.agentsDispatched || 0,
    tokensSpent: (typeof budget !== 'undefined' && budget && typeof budget.spent === 'function') ? budget.spent() : null,
  };
  try {
    return await agent(
      [
        'Write the derived index (journal.json + inbox.json) - and nothing else (D3b).',
        'Record the program-counter transitions write-ahead, and append the pending inbox items with their BREAKING/ADVISORY class.',
        `Set journal.currentVerticalSlice = ${j(a && a.verticalSliceId)} (keep the slice marked active in the program counter even if the per-wave write-ahead missed).`,
        `Also persist this descriptive cost block into journal.json as "cost" (add an updatedAt ISO timestamp): ${j(cost)}. It feeds the deterministic progress mirror (D19) - descriptive telemetry, never a gate input.`,
        `Transitions: ${j({ greenWorkOrders: state.greenWorkOrders || [], checkpoints: (state.checkpoints || []).length, blocked: (state.blocked || []).length })}`,
        `Pending inbox: ${j(state.pendingInbox || [])}`,
        'Return the SCRIBE_ACK: persisted:true once journal.json + inbox.json are durably written faithfully against their schemas; persisted:false if you cannot complete a clean, faithful write (the script reads persisted:false as HALT - it must not proceed believing a transition persisted). A bare-null return is reserved for agent death/skip and also HALTs.',
        callShapeReminder,
      ].join('\n'),
      { label: 'scribe:journal', phase: 'Enrich', agentType: 'reasonable:journal-writer', schema: SCRIBE_ACK },
    );
  } catch (e) {
    // A bare-null return is ALREADY documented (above, and in the prompt) as a HALT
    // upstream - a hard StructuredOutput failure is the same kind of non-answer, so it
    // folds into that SAME sentinel instead of crashing the run uncaught. No truth is
    // lost either way: reconcile rebuilds the index from git+ledger on the next run.
    log(`scribe:journal agent failed: ${String((e && e.message) || e)}`);
    return null;
  }
}

// withinBudget - guard on min(per-slice-remaining, engine turn-pool remaining) (S15
// D16a). Per-slice budget rides in args (the engine budget spans the whole turn).
// Guard ONLY when a ceiling exists; an absent total => Infinity => loop runs to the cap.
function withinBudget(a, budget) {
  const sliceTotal = a && a.budget && typeof a.budget.total === 'number' ? a.budget.total : null;
  const sliceSpent = budget && typeof budget.spent === 'function' ? budget.spent() : 0;
  const sliceRemaining = sliceTotal === null ? Infinity : Math.max(0, sliceTotal - sliceSpent);
  const engineRemaining = budget && typeof budget.remaining === 'function' ? budget.remaining() : Infinity;
  return Math.min(sliceRemaining, engineRemaining) > 0;
}

// withinAgentCap - keep clear of the 1000-agent lifetime backstop (S15 D16c). We
// cannot read the engine's counter, so we track our own dispatch tally and stop with
// room to spare; the route-planner already sized waves to not approach the cap.
function withinAgentCap(state) {
  return (state.agentsDispatched || 0) < 950;
}

// -----------------------------------------------------------------------------
// The run.
// -----------------------------------------------------------------------------
// `args` is the FROZEN engine global (the substrate freezes it for deterministic
// replay). Work on a mutable shallow COPY so the D18 fallback can fill in a missing
// effortRoot without throwing on the frozen original.
const a = { ...(args || {}) };

phase('Reconcile');
// Reconcile prologue - unconditional, total, halting (S12). Direct agent() (not
// guard()-wrapped): a reconcile failure is a HALT, not a budget checkpoint - INCLUDING a
// hard agent() throw (the model exhausting its StructuredOutput retry cap never reaches
// `briefing.halt`, so it must be caught here too or it crashes the whole run uncaught
// instead of halting - the 2026-07-01 graph-editor-ux-overhaul incident). The agent
// result (the BRIEFING) is ALSO frozen - read it, never mutate it; the mutable working
// `state` is a fresh object seeded from it below.
let briefing;
try {
  briefing = await agent(reconcilePrompt(a), { label: 'reconcile', agentType: 'reasonable:reconciler', schema: BRIEFING });
} catch (e) {
  return {
    kind: 'halt',
    haltClass: 'other',
    floorUnexplained: null,
    reason: `reconcile agent failed before producing a BRIEFING: ${String((e && e.message) || e)}`,
  };
}
if (!briefing || briefing.halt) {
  // Carry the D13 distinction in the slice-runner's own halt result rather than
  // relying solely on reconcile.mjs setting halt: a floor-integrity-unexplained halt
  // is the fifth always-escalate STOP (an UNEXPLAINED autonomous floor breach), tagged
  // distinctly from the four first-line AMBIGUOUS classes for the main-session router.
  const haltClass = briefing && briefing.haltClass || null;
  return {
    kind: 'halt',
    haltClass,
    floorUnexplained: briefing && typeof briefing.floorUnexplained === 'number' ? briefing.floorUnexplained : null,
    reason: (briefing && briefing.haltReason) ||
      (haltClass === 'floor-integrity-unexplained'
        ? 'UNEXPLAINED autonomous floor-integrity breach - fifth always-escalate STOP (D13)'
        : 'reconcile returned null or AMBIGUOUS (recovery halt)'),
  };
}
// An EXPLAINED floor diff (or any gated floor diff) does not halt: it surfaces as a
// non-blocking NOTICE (annotate-not-disarm - the human always sees it, the run continues).
if (typeof briefing.floorUnexplained === 'number' && briefing.floorUnexplained === 0 && (briefing.evidence || briefing.haltReason)) {
  log('Reconcile: floor-integrity diff surfaced as a NON-BLOCKING NOTICE (D6/D13: explained-by-verdict or gated) - logged, run continues.');
}

// D18 args-drop fallback: if args did not carry the effort root / slice, take what the
// reconciler resolved from disk and thread it into `a` (our mutable copy) for every
// downstream stage. The pure script cannot read disk, so the first agent's resolution is
// the only recovery path.
if (!a.effortRoot && briefing.effortRoot) a.effortRoot = briefing.effortRoot;
if (!a.verticalSliceId && briefing.currentVerticalSlice) a.verticalSliceId = briefing.currentVerticalSlice;
// Branch hygiene: the reconciler read effortBranch/baseBranch from config; thread them in
// so the provisioner cuts every lane from the effort branch (explicit base, never bare HEAD).
if (!a.effortBranch && briefing.effortBranch) a.effortBranch = briefing.effortBranch;
if (!a.baseBranch && briefing.baseBranch) a.baseBranch = briefing.baseBranch;
if (!a.effortRoot) {
  return { kind: 'halt', reason: 'effort root unresolved: not supplied in args and the reconciler could not recover it from cwd. Re-launch the runner by NAME with args.effortRoot set (the scriptPath path drops args).' };
}

// Effective run mode (carried, never inferred). reconcile read config.runMode; an
// absent/null mode is already a reconcile HALT above, so here it is concrete.
const mode = a.runMode || briefing.runMode;
// Working state: a fresh MUTABLE object seeded from the frozen briefing. The loop and the
// trap router mutate these fields freely; the briefing itself is never touched.
let state = {
  ...briefing,
  outcomes: [],
  blocked: [],
  pendingInbox: [],
  greenWorkOrders: [],
  agentsDispatched: 0,
};

phase('Plan');
let plan;
try {
  plan = await agent(routePrompt(state, a), { label: 'route-plan', agentType: 'reasonable:route-planner', schema: ROUTE_PLAN });
} catch (e) {
  // Same class of gap as the reconcile prologue above: a hard agent() throw (e.g. the
  // StructuredOutput retry cap) never reaches the `!plan` check below, so it must be
  // caught here too or it crashes the whole run instead of halting.
  return { kind: 'halt', reason: `route-planner agent failed before producing a ROUTE_PLAN: ${String((e && e.message) || e)}` };
}
if (!plan) {
  return { kind: 'halt', reason: 'route-planner returned null - cannot plan the slice' };
}

// Mechanical backstop (the graph-editor-ux-overhaul incident): a merged work order is
// TERMINAL, permanently - never re-dispatch it, regardless of what the route-planner
// returned or what still sits in .reasonable/work-orders/*.json. This does not replace
// the route-planner's own filter (its prose is told the same terminal set above); it
// catches the case where an LLM re-includes one anyway - capability, not just discipline.
const terminal = new Set(state.terminalWorkOrders || []);
const droppedTerminal = (plan.workOrders || []).filter((wo) => terminal.has(wo.id));
if (droppedTerminal.length > 0) {
  plan.workOrders = (plan.workOrders || []).filter((wo) => !terminal.has(wo.id));
  log(`route-planner returned ${droppedTerminal.length} already-terminal (merged) work order(s) ` +
    `[${droppedTerminal.map((wo) => wo.id).join(', ')}] - dropped before dispatch, never re-run a merged WO.`);
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
    state.agentsDispatched += wave.workOrders.length * 7; // rough per-WO agent tally (provision+[characterize]+implement+intent-verify+blind+adjudicate+audit-leaf)

    // WRITE-AHEAD (D19 tier-1): flip the slice + this wave's not-yet-green work orders to
    // `dispatched` in the journal BEFORE the pipeline runs, so the progress mirror reads
    // `active` within seconds instead of staying frozen on `pending` for the whole wave.
    // Skip work orders already green (a re-pass), and fail SOFT - the post-wave write below
    // is authoritative and HALTs on its own failure.
    const freshWorkOrders = wave.workOrders.filter((wo) => !state.greenWorkOrders.includes(wo.id));
    if (freshWorkOrders.length > 0) {
      state.agentsDispatched += 1; // the write-ahead scribe call
      const waAck = await journalWriteAhead(freshWorkOrders, a);
      if (!waAck || waAck.kind === 'checkpoint' || waAck.persisted !== true) {
        log('write-ahead journal write did not persist - the progress mirror will lag this wave; continuing (the live channel still narrates it; the post-wave write is authoritative).');
      }
    }

    // The enrichment pipeline (S5.6) - NO barrier between stages (S8): a fast-trapping
    // lane is triaged the instant ITS chain returns, not after the slowest lane. Each
    // stage callback receives (prevResult, originalItem, index); we close over ctx.
    // intentVerify sits BEFORE blindTest: the contract-enrichment adversary judges the
    // PROPOSED contract diff against the vision + slice spec (D9) before tests derive
    // from it - a sycophantic enrichment must not become the oracle the tests track.
    const outcomes = await pipeline(
      wave.workOrders,
      (wo, orig, i) => provisionThenImplement(wo, orig, i, ctx),
      (prev, wo, i) => intentVerify(prev, wo, i, ctx),
      (prev, wo, i) => reprovisionForBlindTest(prev, wo, i, ctx),
      (prev, wo, i) => blindTest(prev, wo, i, ctx),
      (prev, wo, i) => adjudicate(prev, wo, i, ctx),
      (prev, wo, i) => audit(prev, wo, i, ctx),
    );

    // Trap router - map every OUTCOME to its pre-written membrane crossing (S8).
    for (const o of outcomes.filter(Boolean)) state = route(o, state, mode);

    // The wave's AUTHORITATIVE derived-index write - serial, awaited; null -> HALT (S6, D3b).
    const ack = await journalWrite(state, a);
    if (ack === null || ack.kind === 'checkpoint' || ack.persisted !== true) {
      return { kind: 'halt', reason: 'scribe did not persist the derived index (null / checkpoint / persisted:false) - index not written; reconcile rebuilds it from git+ledger on the next run.' };
    }

    // A BREAKING trap (spike-needed / infeasible / intent-fork / other) means a human
    // decision is required before progress - stop the wave loop and return blocked.
    if (state.blocked.length > 0) break;
  }

  // BREAKING traps surfaced -> return for a human decision rather than spinning.
  if (state.blocked.length > 0) break;

  // Gate math: floorGreen && trustedGreen, plus every work order reported green (BF3).
  const allGreen = (plan.workOrders || []).length > 0 &&
    state.greenWorkOrders.length >= (plan.workOrders || []).length;
  // floorGreen: no UNFORESEEN floor break (a break the change declared via
  // behaviorDelta is a planned supersession, classified later in toGateResult, BF9).
  const floorGreen = state.outcomes.every((o) =>
    !(o.floorBreak && o.floorBreak.broke && !(o.behaviorDelta && o.behaviorDelta.length)));
  // trustedGreen: every WO green AND every green WO carries POSITIVE executed-suite
  // evidence (detail.suiteRan === true) AND none reported the trusted suite RED. The
  // suiteRan requirement is the D17 false-green fix: a verifier that placeholders instead
  // of running leaves no suiteRan, so its WO can never count as trusted-green - green is
  // earned by an executed green suite, never by the absence of a reported failure.
  const greens = state.outcomes.filter((o) => o.kind === 'green');
  const trustedGreen = allGreen
    && greens.length > 0
    && greens.every((o) => o.detail && o.detail.suiteRan === true && o.detail.trustedGreen !== false);
  state.gate = { allOutcomesGreen: allGreen, floorGreen, trustedGreen };
  verticalSliceGreen = computeGreen(state);

  // If nothing changed this pass and we are not green, the loop would spin - only a
  // checkpoint/ripple/scope-expansion warrants another pass; otherwise break to the gate.
  if (!verticalSliceGreen && !state.needsAnotherPass && (state.checkpoints || []).length === 0) break;
}

phase('Gate');
// Return the typed GATE_RESULT for the main-session retro (S7, BF9): green |
// budget-exhausted | blocked. (halt was returned directly from the paths above.)
return toGateResult(verticalSliceGreen, state, budget);
