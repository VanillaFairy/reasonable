// lib/ceremony.mjs — the ceremony dial (DESIGN-3.0 §3, §5.4, §9, §17, reasonable 3.0 Part 6c). A PURE
// calculus in two independent halves, sharing no helper:
//   A. the complexity classifier — classify(inputs, dials) -> band: a MONOTONE map from five
//      t0-observable risk inputs to a band drawn from the SAME ordered dials.bandScale array
//      lib/rewrite.mjs's ceremonyEscalation ratchets through (classifier and calculus share one
//      vocabulary). classify emits the band; its CONSUMERS read dials.phaseCutoffs / dials.cadenceIndex
//      (classify itself reads NEITHER).
//   B. the phase-degeneration predicates (§5.4 — the MANDATED PIN) — appended below the marker by a
//      separate triad (T02b).
//
// Law 1 (dependency-free): node builtins only, and in fact ZERO imports — it emits its own plain
// objects, exactly as lib/effects.mjs / lib/rewrite.mjs emit theirs. Nothing here reads disk, appends a
// ledger event, or dispatches a role (Call #1: P6c COMPUTES; P7's frontier loop WIRES). The classifier
// thresholds (dials.classifier.*) are P6c-coined and ship flagged-uncalibrated (§16) — a rename is a
// one-line change since classify gates shape, not value.

// ── A. the complexity classifier (Decision 4, §5.4) ─────────────────────────────────────────────

const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

// How many ascending cutoffs a value meets-or-exceeds. Monotone up in `value`; an absent/empty cutoff
// array (or a non-finite value) yields 0 — a missing threshold disables its lift, never fabricates one
// (the shape-not-value discipline lib/policy.mjs / lib/legibility.mjs hold). Because the axes combine by
// MAX, a 0 from one axis can never lower another's contribution.
function cutoffPressure(value, cutoffs) {
  if (!finite(value) || !Array.isArray(cutoffs)) return 0;
  let p = 0;
  for (const c of cutoffs) if (finite(c) && value >= c) p += 1;
  return p;
}

// classify(inputs, dials) -> a band name from dials.bandScale, or null when no band scale is available
// (never guesses — mirrors ceremonyEscalation's "unknown band -> null"). MONOTONE (§5.4): raising the
// risk on any axis never LOWERS the band. The four risk-UP axes (blastRadius, horizon, criticality,
// autonomous supervision) combine by MAX of per-axis band pressure; the one risk-DOWN axis (a trusted
// suite already covering the locus) subtracts a RELIEF; the result is clamped into the scale.
//
// The minimal-driver clause (§5.4), made mechanical: `horizon` enters as a BARE ordinal — there is no
// {footprint, steps} pair to divide — and the max combiner is monotone-up in it, so a caller can never
// buy a lower band by inflating its own footprint (which would only RAISE horizon, and thus ceremony).
// Monotonicity IS the anti-gaming guarantee, pinned by the red suite's monotonicity checks.
//
// inputs = { blastRadius:number, trustedSuiteCovers:boolean, criticality:number(ordinal),
//            supervision:'present-human'|'autonomous', horizon:number(ordinal) }
export function classify(inputs, dials) {
  const scale = dials && Array.isArray(dials.bandScale) ? dials.bandScale : null;
  if (!scale || scale.length === 0) return null;
  const i = inputs || {};
  const T = (dials && dials.classifier) || {};

  const riskUp = Math.max(
    cutoffPressure(i.blastRadius, T.blastRadiusCutoffs),
    cutoffPressure(i.horizon, T.horizonCutoffs),
    cutoffPressure(i.criticality, T.criticalityCutoffs),
    i.supervision === 'autonomous' && finite(T.autonomousPressure) ? T.autonomousPressure : 0,
  );
  const relief = i.trustedSuiteCovers === true && finite(T.trustedRelief) ? T.trustedRelief : 0;
  return scale[clamp(riskUp - relief, 0, scale.length - 1)];
}

// ── B. phase-degeneration predicates appended by T02b — do not edit above this line ──

// Three pure predicates over the genesis graph (§5.4 — the MANDATED PIN: the roadmap requires this
// pinned mechanically, not as prose). Each returns a RESULT tagged union:
//   { result: 'materialize' }                                          — run the phase (the guard has work)
//   { result: 'degenerate', degeneracy: <phase-degenerated record> }   — a PROVEN-EMPTY no-op
// A degeneration is NEVER a silent skip: the record carries the predicate's evaluated inputs, so a
// reviewer sees ran-and-found-nothing. P6c COMPUTES the record; it does NOT append it, and it does NOT
// register a `phase-degenerated` schema in lib/ledger.mjs — that live-writer wiring is P7's (Call #1,
// the same seam as ceremonyEscalation's effect vs. its append). The record is shaped as a
// forward-appendable ledger event ({ type, ... }, the lib/ledger.mjs convention) so P7 appends it
// verbatim once it registers the type. CONSERVATIVE: when in doubt, materialize — never degenerate.

const PHASE_DEGENERATED = 'phase-degenerated';
function degenerate(phase, reason, inputs) {
  return { result: 'degenerate', degeneracy: { type: PHASE_DEGENERATED, phase, reason, inputs } };
}

// The component of a `component#cN` clause ref: an explicit citation.component when present, else the
// prefix before '#'. A LOCAL pure string split — NOT an import of parseClauseId, which would drag
// ledger.mjs/effort.mjs I/O into this pure file (the same import goals.mjs / legibility.mjs refused).
function citationComponent(cite) {
  if (cite && typeof cite.component === 'string' && cite.component.length > 0) return cite.component;
  if (cite && typeof cite.clause === 'string') {
    const h = cite.clause.indexOf('#');
    return h > 0 ? cite.clause.slice(0, h) : cite.clause;
  }
  return null;
}

// The set of `.id`s in a snapshot's goals/atoms array (skips entries with no string id).
function idSet(arr) {
  const s = new Set();
  for (const x of arr || []) if (x && typeof x.id === 'string') s.add(x.id);
  return s;
}

// scaffoldMaterializes(genesis, lastRatified, skeletonComponents) — introduces-a-new-goal-cone OR
// touches-the-outer-shell (§5.4). Each snapshot is { goals:[readGoals-shaped], atoms:[charter-shaped] };
// skeletonComponents is the set of components the walking skeleton already wires end-to-end (recorded at
// the last scaffold sign-off). The FIRST genesis passes lastRatified = { goals: [], atoms: [] }.
export function scaffoldMaterializes(genesis, lastRatified, skeletonComponents) {
  const g = genesis || {};
  const last = lastRatified || {};
  const skeleton = new Set(skeletonComponents || []);

  // (i) introduces-a-new-goal-cone := goalIds(genesis) \ goalIds(lastRatified) != empty.
  const lastGoalIds = idSet(last.goals);
  const newGoalIds = [...idSet(g.goals)].filter((id) => !lastGoalIds.has(id)).sort();

  // (ii) touches-the-outer-shell := EXISTS a newly-chartered atom (in genesis.atoms, not in
  // lastRatified.atoms) that is a depth-0 provider of a goal scenario — its component is named by some
  // goal's scenarioCitations (genesis fidelity: a charter has no clauses yet, so the boundary is drawn
  // at COMPONENT quotient, the planned-fidelity proxy P6a used) — OR whose component is not yet in the
  // skeleton. Either means the outermost end-to-end wiring changed. Over-approximates on purpose: it
  // never under-fires on a genuinely new goal cone (design doc Decision 5's flagged residue).
  const lastAtomIds = idSet(last.atoms);
  const shellComponents = new Set();
  for (const goal of g.goals || []) {
    for (const cite of goal.scenarioCitations || []) {
      const comp = citationComponent(cite);
      if (comp) shellComponents.add(comp);
    }
  }
  const shellAtomIds = [];
  for (const a of g.atoms || []) {
    if (!a || typeof a.id !== 'string' || lastAtomIds.has(a.id)) continue; // newly-chartered only
    if (shellComponents.has(a.component) || !skeleton.has(a.component)) shellAtomIds.push(a.id);
  }
  shellAtomIds.sort();

  if (newGoalIds.length > 0 || shellAtomIds.length > 0) return { result: 'materialize' };
  return degenerate('scaffold',
    'no new goal cone and no newly-chartered atom touches the outer shell',
    { newGoalIds, shellAtomIds }); // both empty — the evaluated inputs a reviewer inspects
}

// rechartingDegenerates(amendmentBatch) — degenerates iff the accumulated amendment batch is empty (no
// amendment ⇒ nothing to retopologize). §5.4/§6.
export function rechartingDegenerates(amendmentBatch) {
  const batch = Array.isArray(amendmentBatch) ? amendmentBatch : [];
  if (batch.length > 0) return { result: 'materialize' };
  return degenerate('recharter', 'the accumulated amendment batch is empty', { amendmentCount: 0 });
}

// retroClassificationDegenerates(landedConeCount) — degenerates iff the fired goal gate spans <= 1
// landed cone (the three-way divergence classification has one cone's worth of nothing to compare). §5.4.
export function retroClassificationDegenerates(landedConeCount) {
  const n = Number.isFinite(landedConeCount) ? landedConeCount : 0;
  if (n >= 2) return { result: 'materialize' };
  return degenerate('retro-classification', 'the fired goal gate spans <= 1 landed cone', { landedConeCount: n });
}
