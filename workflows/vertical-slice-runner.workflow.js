// vertical-slice-runner.workflow.js
//
// reasonable — the pure in-run plane (architecture §18 sketch + §7/§8/§12/§15).
//
// ONE Workflow run = exactly ONE vertical slice, driven toward GREEN, ending AT the
// retro gate, never through it (D4, §7). The run does not block on a human; it returns
// a typed GATE_RESULT and the main-session decision plane runs the human-blocking retro.
//
// Shape (architecture §19 sketch, faithfully):
//   reconcile prologue (agent)  ─ unconditional, total, halting recovery (§12, D8b/D9)
//     └ if state.halt → return {kind:'halt'}
//     floor-integrity is a tier-3 BACKSTOP tripwire here, not a first-line HALT (D6):
//     it surfaces every floor change, annotated explained-by-verdict (advisory) by any
//     accept. D13 — the UNEXPLAINED-BREACH STOP: in AUTONOMOUS mode an UNEXPLAINED
//     breaking floor-integrity-mismatch (no accept verdict explains it — something
//     bypassed the pre-integration adversary) is the FIFTH always-escalate class: the
//     reconciler sets halt=true (queue BREAKING + stop), so it returns {kind:'halt'}
//     above. An EXPLAINED floor diff is a non-blocking notice (surfaces, run continues).
//     In GATED mode both just surface in the briefing for the present human.
//   route-planner (agent)       ─ footprints + resources + trust-staleness (§6, §16, D11/D13)
//   groupDisjoint (pure)        ─ set-algebra over locus | contract | resource (mirrors
//                                  lib/footprint.mjs independent(), D11)
//   budget + agent-cap guarded while loop (§15, D16a/D16c)
//     per wave: the enrichment pipeline() (§5.6, no barrier, §8)
//        [ provisionThenImplement → intentVerify → blindTest → adjudicate → audit ]
//        each agent() guard()-wrapped: a budget THROW → {kind:'checkpoint'} (D16b)
//        provisionThenImplement folds in the conditional brownfield genesis prologue:
//        the in-run `characterization-needed` agent sequence (BF7) — NOT a nested
//        workflow() (one-level nesting forbids it, §15 D16d).
//        intentVerify is the §5.6 CONTRACT-ENRICHMENT adversary — the verification
//        trio's leg on the implementer's self-authored contract enrichment (the
//        sycophancy / rot-vector-3 surface). A fresh-context, read-only-by-capability
//        reasonable:intent-verifier judges the PROPOSED contract diff against the
//        VISION + VERTICAL-SLICE SPEC oracle (ABOVE the artifact, D9 — never
//        intention.md, never the contract the implementer wrote, which would be
//        circular), BEFORE the blind-test-writer derives tests from it. RISK-GATED
//        (D7): ALWAYS run where the enrichment touches a shared contract (a citation
//        to a neighbour); may skip a boxed-in own-contract-only delta. accept|reject|
//        escalate, propose-not-act (D2): reject → back to the implementer; escalate →
//        the human inbox (autonomous: joins the always-escalate classes, D8). This is
//        NOT a behaviorDelta-completeness verifier — that is a FALSE TRIO (D12): an
//        undeclared move surfaces mechanically as an unaccounted floor break, a padded
//        delta is caught by the existing two-oracle collision classifier.
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
    // Which class triggered the halt. The four first-line AMBIGUOUS classes stay HALTs;
    // floor-integrity-unexplained is the D13 fifth always-escalate STOP (an UNEXPLAINED
    // autonomous floor breach). A plain floor-integrity diff that is explained-by-verdict
    // (or any gated floor diff) is NOT a halt — it surfaces as a notice.
    haltClass: {
      type: ['string', 'null'],
      enum: ['sha-custody', 'ledger-without-commit', 'runmode-absent', 'two-lanes-one-wo', 'floor-integrity-unexplained', 'other', null],
    },
    evidence: { type: 'object', additionalProperties: true },
    // D13: of the surfaced floor-integrity diffs, how many are UNEXPLAINED (no `accept`
    // verifier-verdict explains them) — reconcile.mjs `floorIntegrity.unexplained`. In
    // AUTONOMOUS mode >0 is the fifth always-escalate STOP; an EXPLAINED diff (>0 surfaced
    // but unexplained:0) is a non-blocking notice. Null/0 when no floor diff surfaced.
    floorUnexplained: { type: ['integer', 'null'] },
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

// VERIFIER_VERDICT — what the §5.6 CONTRACT-ENRICHMENT adversary returns on one
// PROPOSED contract enrichment (D5 shape, matching the verifier-verdict ledger event
// in docs/artifacts.md + the characterization spine). The adversary is read-only by
// capability and PROPOSES the verdict as DATA (proposed:true); a narrow writer (the
// orchestrator) performs the ledger append — it never self-executes the act its
// verdict authorizes (Law 3 corollary, D2). The reference (`oracle`) is the VISION +
// VERTICAL-SLICE SPEC, ABOVE the artifact (D9): a sycophantic enrichment passes any
// tests-vs-contract audit with honors, so it is judged at INTENT level against the top
// edge — NEVER against intention.md and NEVER against the contract the implementer
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
    // The named reference judged against — vision + vertical-slice spec, ABOVE the artifact.
    oracle: { type: 'string' },
    by: { type: 'string' },              // "intent-verifier"
    proposed: { type: 'boolean' },       // always true: propose-not-act (D2)
    // Why the adversary ran (D7 risk-gate): the enrichment touches a shared contract
    // (a Citations bullet to a neighbour). False ⇒ the orchestrator could have skipped
    // it (a boxed-in own-contract-only delta).
    touchesSharedContract: { type: 'boolean' },
    reason: { type: ['string', 'null'] },
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

// SCRIBE_ACK — the lone serialized journal-writer's acknowledgement (D3b), shared by
// BOTH journal-writer dispatches in this file (the verifier-verdict append and the
// derived-index scribe). The top-level type MUST be the literal 'object': the Messages
// API rejects a forced-tool input_schema whose top-level type is an array
// ({type:['object','null']} => 'tools.N.custom.input_schema.type: Input should be object').
// Because a `schema` FORCES a tool call, the scribe CANNOT emit a bare JSON null to mean
// "I could not persist" — it reports that in the explicit `persisted` field. A bare-null
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
    'Keep the four FIRST-LINE AMBIGUOUS → HALT classes: sha-custody (mismatched-trailer reclaim), ledger-without-commit (torn window), runmode-absent, two-lanes-one-WO.',
    'Run the floor-integrity reconcile pass (brownfield) as a tier-3 BACKSTOP tripwire, NOT a first-line HALT (D6): it always SURFACES every floor diff (report it in evidence + note) and never SILENCES it; an `accept` verifier-verdict ANNOTATES the diff explained-by-verdict (ADVISORY ONLY — that annotation never clears the surfacing).',
    'Report floorUnexplained = reconcile.mjs `floorIntegrity.unexplained` (surfaced floor diffs with NO accept verdict). D13 — the UNEXPLAINED-BREACH STOP: in AUTONOMOUS mode floorUnexplained>0 is the FIFTH always-escalate class — something bypassed the pre-integration adversary, so set halt:true (queue BREAKING + STOP, do not grind on). An EXPLAINED floor diff (surfaced but floorUnexplained:0) is a non-blocking NOTICE: log it and continue. In GATED mode both just surface in the briefing for the present human (no halt).',
    'Compute the trust-staleness set: trusted-green tests whose governing clause was amended/extended since last verification.',
    'Return the BRIEFING. Set halt:true with haltReason+evidence for ANY of the four first-line AMBIGUOUS classes, or for an UNEXPLAINED autonomous floor breach (haltClass:"floor-integrity-unexplained") — never guess a recovery state.',
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

// intentVerifyPrompt — the §5.6 CONTRACT-ENRICHMENT adversary. Fresh context, read-only
// BY CAPABILITY; it carries the PROPOSED contract diff + its oracle, never the
// implementer's transcript (inheriting the mutator's narrative collapses the judgment
// into agreement). The oracle sits ABOVE the artifact (D9): the VISION + the
// VERTICAL-SLICE SPEC — never intention.md, never the contract the implementer wrote.
function intentVerifyPrompt(wo, a) {
  return [
    'You are the intent-verifier ADVERSARY for ONE proposed CONTRACT ENRICHMENT (the §5.6 contract-enrichment instance of the verification trio). Fresh context, read-only BY CAPABILITY (Read/Grep/Glob).',
    'A worker (the implementer) self-authored a contract enrichment fresh from the code. A sycophantic enrichment passes any tests-vs-contract audit with honors — only INTENT-level review against the top edge catches it. You judge the PROPOSED diff BEFORE the blind-test-writer derives tests from it.',
    `Effort root: ${a.effortRoot}`,
    `Work order: ${wo.id} (component: ${wo.role || 'implementer'}). Read the proposed contract diff from the ledger enrichment entry + the contract file; do NOT read the implementer's transcript.`,
    'YOUR REFERENCE (the oracle, ABOVE the artifact, D9): the VISION + the VERTICAL-SLICE SPEC. Judge ONLY against that top edge. You may NOT judge the enrichment against .reasonable/intention.md, and you may NOT judge it against the contract the implementer itself wrote (that derivation is circular — agreement is tautological).',
    'Judge: (1) does each new must serve a behaviour the vision + slice spec actually demand — not scope sprawl, not a sycophantic restatement of what the code happens to do? (2) is it pinned at the right component / seam, not reaching past the locus? (3) where the enrichment cites a NEIGHBOUR (a shared-contract touch), is that citation warranted by the spec, or is it smuggling coupling the spec does not sanction?',
    'PROPOSE-NOT-ACT (Law 3 corollary, D2): return the verdict as DATA; you integrate nothing and fix nothing. A narrow writer / the orchestrator appends any resulting ledger event.',
    'Return the VERIFIER_VERDICT: verdict accept|reject|escalate, oracle = "vision + vertical-slice spec", by:"intent-verifier", proposed:true, touchesSharedContract reflecting why you ran. accept = every new must is warranted by the vision + slice spec, at the right seam. reject = over- or under-claims against the spec / wrong seam / unwarranted neighbour coupling — CITE the specific over/under-claim and the spec it violates (routes back to the implementer). escalate = two defensible readings the spec cannot settle — name both (routes to the human inbox; in autonomous mode it joins the always-escalate classes). A wrong ACCEPT corrupts effort truth — say only what the reference supports; where it is silent, escalate rather than invent an accept.',
  ].join('\n');
}

// verdictWriterPrompt — the NARROW WRITER. The read-only adversary proposed an accept as
// data; this writer performs the one resulting act (Law 3 corollary, D2): append ONE
// verifier-verdict event to the on-disk append-only ledger, content-referencing the
// enrichment commit it judged (D5 — durability is the atomic on-disk append, NOT a git
// commit of orchestration state). The append ANNOTATES the diff explained-by-verdict —
// advisory only (D6); it silences no guard.
function verdictWriterPrompt(wo, verdict, a) {
  return [
    'You are a NARROW WRITER. The intent-verifier ADVERSARY proposed an `accept` verdict on a contract enrichment as data; it is read-only and never integrates its own verdict (Law 3 corollary). You perform the one resulting act: append ONE verifier-verdict event to the append-only ledger, content-referencing the enrichment it judged. Nothing else.',
    `Effort root: ${a.effortRoot}`,
    `Work order: ${wo.id}.`,
    'Append exactly this event to .reasonable/ledger.jsonl (one JSON line; an on-disk append, NOT a git commit of orchestration state — verdict durability is the atomic on-disk append, D5):',
    '  ' + j({ type: 'verifier-verdict', component: wo.role || wo.id, diffRef: verdict.diffRef || null, verdict: verdict.verdict, oracle: verdict.oracle, by: 'intent-verifier', proposed: true }),
    'Add the ledger seq and the code commit/hash the enrichment landed (`commit`) from the live ledger/git — do not invent them.',
    'This verdict ANNOTATES the enrichment diff as explained-by-verdict: ADVISORY ONLY (D6). It does NOT silence any floor or reconcile guard and does NOT bless the enrichment past review — a missing or half-written verdict can only cause MORE human surfacing, never less. Write nothing but this one ledger line. Return the SCRIBE_ACK: persisted:true once the line is durably appended, persisted:false otherwise (the orchestrator surfaces it). A bare-null return is reserved for agent death/skip and also surfaces.',
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
      'Report your enrichment in the OUTCOME detail as detail.enrichment = { enriched, clauses:[ids you added], touchesSharedContract (true iff a new Citations bullet to a neighbour) } so the contract-enrichment adversary can risk-gate and judge the PROPOSED diff against the vision + slice spec BEFORE tests derive from it.',
      'Collapse your terminal effects into ONE atomic commit: work product + your own ledger/verdict line + a Work-Order trailer (D3a).',
      'If you hit a wall, emit the matching OUTCOME kind (scope-expansion / ripple / jurisdiction / spike-needed / infeasible / intent-fork / other) — never thrash toward green.',
      'Cite .reasonable/intention.md when a fork turns on a scope/priority choice; an unsettleable fork is intent-fork (BREAKING), never a silent guess.',
      'Return the OUTCOME.',
    ].join('\n'),
    { label: `implement:${wo.id}`, phase: 'Enrich', agentType: 'reasonable:implementer', schema: OUTCOME },
  ));
}

// intentVerify — the §5.6 CONTRACT-ENRICHMENT adversary, the verification trio's leg
// on the implementer's self-authored contract enrichment (rot vector 3 / sycophancy).
// A fresh-context, read-only-by-capability intent-verifier judges the PROPOSED contract
// diff against the VISION + VERTICAL-SLICE SPEC oracle (ABOVE the artifact, D9 — never
// intention.md, never the contract the implementer wrote, which is circular), BEFORE
// the blind-test-writer derives tests from it. It runs INSIDE the trio shape:
//   • Carry a trapped/non-green prior OUTCOME forward untouched (short-circuit).
//   • RISK-GATE (D7): ALWAYS run when the enrichment touches a SHARED contract (a
//     citation to a neighbour); SKIP a boxed-in own-contract-only delta (a false trio).
//     The dial trades a check for speed — it NEVER disables the floor/shared-contract
//     guard; the gate keys on what the enrichment TOUCHES, never on trust.
//   • A work order that enriched NOTHING has no diff to judge → pass the prior through.
//   • PROPOSE-NOT-ACT (D2): the adversary returns the verdict as data; a narrow writer
//     appends the verifier-verdict ledger event (D5). accept → continue the chain;
//     reject → one bounded re-implement by the implementer then re-judge, still-not-
//     accepted → intent-fork (BREAKING) to the human; escalate → intent-fork (BREAKING,
//     autonomous: joins the always-escalate classes, D8). A null/half-written verdict
//     fails toward scrutiny (intent-fork), never silently past.
async function intentVerify(prev, wo, _idx, ctx) {
  if (!prev || prev.kind !== 'green') return prev; // trapped lane: carry the trap forward
  const a = ctx.args;

  // The implementer reports its enrichment in the OUTCOME detail: which clauses it
  // added and whether the delta added a Citations bullet (a shared-contract touch).
  const enr = (prev.detail && prev.detail.enrichment) || {};
  const enriched = !!(enr.clauses && enr.clauses.length) || enr.enriched === true;
  if (!enriched) return prev; // nothing self-authored to judge — no diff, no adversary.

  const touchesSharedContract = enr.touchesSharedContract === true || enr.citationsAdded === true;
  if (!touchesSharedContract) {
    // Boxed-in own-contract-only enrichment nothing depends on yet — the risk-gate lets
    // it past unverified (a false trio). This skip keys on what the enrichment TOUCHES,
    // in EITHER run mode; a shared-contract touch is OFF the dial entirely (non-waivable).
    log(`intent-verify: ${wo.id} enrichment is own-contract-only (no shared-contract touch) — adversary skipped per the risk-gate (D7).`);
    return prev;
  }

  let verdict = await guard(wo.id, () => ctx.agent(intentVerifyPrompt(wo, a), {
    label: `intent-verify:${wo.id}`, phase: 'Enrich', agentType: 'reasonable:intent-verifier', schema: VERIFIER_VERDICT,
  }));
  if (verdict && verdict.kind === 'checkpoint') return verdict; // budget ceiling / null gap

  // reject → ONE bounded re-implement against the verdict, then re-judge. A fixed control
  // flow cannot grow an unbounded loop, so a still-rejected enrichment escalates rather
  // than thrashing toward acceptance.
  if (verdict && verdict.verdict === 'reject') {
    log(`intent-verify: ${wo.id} enrichment REJECTED by the adversary (${verdict.reason || 'no reason'}) — routing back to the implementer for one re-enrichment.`);
    const reimpl = await provisionThenImplement(wo, null, _idx, ctx);
    if (reimpl && reimpl.kind === 'checkpoint') return reimpl;
    if (!reimpl || reimpl.kind !== 'green') return reimpl; // re-implement trapped → carry that trap
    verdict = await guard(wo.id, () => ctx.agent(intentVerifyPrompt(wo, a), {
      label: `intent-verify:${wo.id}:retry`, phase: 'Enrich', agentType: 'reasonable:intent-verifier', schema: VERIFIER_VERDICT,
    }));
    if (verdict && verdict.kind === 'checkpoint') return verdict;
    if (!verdict || verdict.verdict !== 'accept') {
      return { kind: 'intent-fork', workOrder: wo.id, verticalSlice: wo.verticalSlice || a.verticalSliceId,
        detail: { stage: 'intent-verify', reason: `enrichment still not accepted after one re-enrichment (${(verdict && verdict.reason) || 'no verdict'})`, oracle: 'vision + vertical-slice spec' },
        note: 'contract-enrichment adversary: re-enrichment still rejected — escalating to the human' };
    }
  }

  // escalate (or a null/absent verdict) → intent-fork to the human. The failure
  // direction is always toward scrutiny (annotate-not-disarm spirit): a missing verdict
  // surfaces MORE, never less. In autonomous mode an escalate joins the always-escalate
  // classes (the trap router queues it BREAKING).
  if (!verdict || verdict.verdict === 'escalate') {
    return { kind: 'intent-fork', workOrder: wo.id, verticalSlice: wo.verticalSlice || a.verticalSliceId,
      detail: { stage: 'intent-verify', reason: (verdict && verdict.reason) || 'intent-verifier returned no verdict — surfacing (fail toward scrutiny)', oracle: (verdict && verdict.oracle) || 'vision + vertical-slice spec' },
      note: 'contract-enrichment adversary escalated: enrichment unsettleable against the vision + slice spec' };
  }

  // accept → a NARROW WRITER (separated from the read-only adversary, Law 3 corollary)
  // appends the verifier-verdict ledger event (D5). The append ANNOTATES the enrichment
  // diff (advisory, D6); it integrates/blesses/silences nothing. A failed append fails
  // toward scrutiny → intent-fork.
  const ack = await guard(wo.id, () => ctx.agent(verdictWriterPrompt(wo, verdict, a), {
    label: `verdict-write:${wo.id}`, phase: 'Enrich', agentType: 'reasonable:journal-writer', schema: SCRIBE_ACK,
  }));
  if (!ack || ack.kind === 'checkpoint' || ack.persisted !== true) {
    return { kind: 'intent-fork', workOrder: wo.id, verticalSlice: wo.verticalSlice || a.verticalSliceId,
      detail: { stage: 'intent-verify', reason: 'accept verdict could not be durably appended to the ledger — surfacing (annotate-not-disarm: never fewer eyes)' },
      note: 'contract-enrichment adversary accepted but the verifier-verdict append failed — escalating' };
  }
  return prev; // accepted + recorded: the enrichment stands; continue the chain.
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
      'Return the SCRIBE_ACK: persisted:true once journal.json + inbox.json are durably written faithfully against their schemas; persisted:false if you cannot complete a clean, faithful write (the script reads persisted:false as HALT — it must not proceed believing a transition persisted). A bare-null return is reserved for agent death/skip and also HALTs.',
    ].join('\n'),
    { label: 'scribe:journal', phase: 'Enrich', agentType: 'reasonable:journal-writer', schema: SCRIBE_ACK },
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
  // Carry the D13 distinction in the slice-runner's own halt result rather than
  // relying solely on reconcile.mjs setting halt: a floor-integrity-unexplained halt
  // is the fifth always-escalate STOP (an UNEXPLAINED autonomous floor breach), tagged
  // distinctly from the four first-line AMBIGUOUS classes for the main-session router.
  const haltClass = state && state.haltClass || null;
  return {
    kind: 'halt',
    haltClass,
    floorUnexplained: state && typeof state.floorUnexplained === 'number' ? state.floorUnexplained : null,
    reason: (state && state.haltReason) ||
      (haltClass === 'floor-integrity-unexplained'
        ? 'UNEXPLAINED autonomous floor-integrity breach — fifth always-escalate STOP (D13)'
        : 'reconcile returned null or AMBIGUOUS (recovery halt)'),
  };
}
// An EXPLAINED floor diff (or any gated floor diff) does not halt: it surfaces as a
// non-blocking NOTICE (annotate-not-disarm — the human always sees it, the run continues).
if (typeof state.floorUnexplained === 'number' && state.floorUnexplained === 0 && (state.evidence || state.haltReason)) {
  log('Reconcile: floor-integrity diff surfaced as a NON-BLOCKING NOTICE (D6/D13: explained-by-verdict or gated) — logged, run continues.');
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
    state.agentsDispatched += wave.workOrders.length * 7; // rough per-WO agent tally (provision+[characterize]+implement+intent-verify+blind+adjudicate+audit-leaf)

    // The enrichment pipeline (§5.6) — NO barrier between stages (§8): a fast-trapping
    // lane is triaged the instant ITS chain returns, not after the slowest lane. Each
    // stage callback receives (prevResult, originalItem, index); we close over ctx.
    // intentVerify sits BEFORE blindTest: the contract-enrichment adversary judges the
    // PROPOSED contract diff against the vision + slice spec (D9) before tests derive
    // from it — a sycophantic enrichment must not become the oracle the tests track.
    const outcomes = await pipeline(
      wave.workOrders,
      (wo, orig, i) => provisionThenImplement(wo, orig, i, ctx),
      (prev, wo, i) => intentVerify(prev, wo, i, ctx),
      (prev, wo, i) => blindTest(prev, wo, i, ctx),
      (prev, wo, i) => adjudicate(prev, wo, i, ctx),
      (prev, wo, i) => audit(prev, wo, i, ctx),
    );

    // Trap router — map every OUTCOME to its pre-written membrane crossing (§8).
    for (const o of outcomes.filter(Boolean)) state = route(o, state, mode);

    // The script's ONLY derived-index write — serial, awaited; null → HALT (§6, D3b).
    const ack = await journalWrite(state);
    if (ack === null || ack.kind === 'checkpoint' || ack.persisted !== true) {
      return { kind: 'halt', reason: 'scribe did not persist the derived index (null / checkpoint / persisted:false) — index not written; reconcile rebuilds it from git+ledger on the next run.' };
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
