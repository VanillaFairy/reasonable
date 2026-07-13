# Shared Interfaces — P6c: The Ceremony Dial

**Version:** 1.0

The exact public surface P6c adds: **one** new file, `lib/ceremony.mjs`, a **pure** calculus in **two
independent halves** that share no helper, exporting **four** functions. Grounded in the shipped exports
of `lib/rewrite.mjs` (`ceremonyEscalation`'s `bands`/`bandScale` contract), `lib/policy.mjs` (the landed
`policy.json` `dials` shape), `lib/graph.mjs` (`servesEdges`/`citationClosureOver` and the charter/goal
shapes), `lib/goals.mjs` (`readGoals`'s return shape), `lib/atom.mjs` (the folded charter record), and
`lib/effects.mjs`/`lib/ledger.mjs` (event/effect-shape conventions) — **read them; do not assume.**

This file pins the **contract and semantics** (signatures, the classifier mechanism, the band
vocabulary, the phase-predicate result shapes, the degeneracy record). The **literal implementation**
lives only in `T01b`/`T02b` (green); the `red` authors work from the semantics here and write their own
intent-faithful cases — never from the green code.

## The four new exports

```js
// A. the complexity classifier (Decision 4, §5.4)
export function classify(inputs, dials);                          // → band name (string) | null

// B. the phase-degeneration predicates (Decision 5, §5.4 — the MANDATED PIN)
export function scaffoldMaterializes(genesis, lastRatified, skeletonComponents); // → Result
export function rechartingDegenerates(amendmentBatch);                            // → Result
export function retroClassificationDegenerates(landedConeCount);                  // → Result
```

All four are **pure**: in-memory arguments in, plain value out. No `node:fs`, no `append`, no I/O
import — in fact **zero imports** (`lib/ceremony.mjs` emits its own plain objects, exactly as
`lib/effects.mjs`/`lib/rewrite.mjs` emit theirs). Nothing here reads disk, appends a ledger event, or
dispatches a role: **P6c computes, P7 wires** (Call #1 — the same seam P5's `rewrite.mjs` used).

---

## A. The complexity classifier — `classify(inputs, dials) → band`

A pure, **monotone** map from five **t0-observable** risk inputs to a **band name drawn from the
ordered `dials.bandScale`** — *the same array* `lib/rewrite.mjs`'s `ceremonyEscalation` does `indexOf`
into (verified by reading `rewrite.mjs`: `ceremonyEscalation` reads `state.bands[coneId]` as a band
name and `scale.indexOf(current)` over `state.bandScale`). Classifier and calculus therefore share
**one** band vocabulary; the round-trip is pinned by a red test.

### The five inputs (§5.4)

```js
inputs = {
  blastRadius,        // number — citation-closure width of the touched clauses (from citationClosureOver)
  trustedSuiteCovers, // boolean — whether a TRUSTED suite already covers the locus (from baseline.json's
                      //           trusted set; the caller computes the boolean — classify does NOT read baseline.json)
  criticality,        // number (ordinal) — correctness-criticality of the domain (vision-set; classify
                      //           consumes the ordinal, it never invents the vocabulary)
  supervision,        // 'present-human' | 'autonomous' — the run mode
  horizon,            // number (ordinal) — horizon UNDER A MINIMAL DRIVER (see the minimal-driver clause below)
}
```

**Grounding note (`trustedSuiteCovers`).** `lib/baseline.mjs`'s `readBaseline(effortRoot)` returns
`{ floor:[...], trusted:[...] }`, where `trusted` is an array of promoted test ids. Whether a trusted
test's locus *covers* the touched locus is a **caller-side** computation (P7's, over `baseline.trusted`);
`classify` receives only the resulting boolean. `classify` must **not** import `baseline.mjs` (purity /
Law 1, exactly as `legibility.mjs` stays pure over its arguments).

### The mechanism (pinned; thresholds flagged-uncalibrated, §16)

Four axes are **risk-up**, one (`trustedSuiteCovers`) is **risk-down**. Combine the risk-up axes by
**MAX of per-axis band pressure**, then subtract a **relief** for a trusted suite, and clamp into the
scale:

```
pressure(x, cutoffs) = # ascending cutoffs c with x >= c        // 0 if cutoffs absent/empty or x non-finite
riskUp   = max( pressure(blastRadius, T.blastRadiusCutoffs),
                pressure(horizon,     T.horizonCutoffs),
                pressure(criticality, T.criticalityCutoffs),
                supervision === 'autonomous' ? (T.autonomousPressure || 0) : 0 )
relief   = trustedSuiteCovers === true ? (T.trustedRelief || 0) : 0
bandIndex = clamp(riskUp - relief, 0, bandScale.length - 1)
classify = bandScale[bandIndex]
```

where `T = dials.classifier` (the P6c-coined threshold dial — see below). **`classify` reads only
`dials.bandScale` and `dials.classifier`; it reads NEITHER `dials.phaseCutoffs` NOR `dials.cadenceIndex`**
(those are the *consumers'* maps — the band → phase-materialization cutoff and band → gate-cadence index
that P7 reads once `classify` has emitted the band).

**MONOTONE (§5.4, the headline property):** raising the risk on any axis never *lowers* the band index.
It holds by construction — each risk-up axis is monotone-up inside the `max`; `relief` is a constant
subtraction gated only by `trustedSuiteCovers` (so losing trusted coverage, i.e. *higher* risk, only
raises-or-holds); `clamp` preserves order.

**The minimal-driver clause (§5.4), made mechanical.** `horizon` enters as a **bare ordinal** — there is
no `{footprint, steps}` pair `classify` could divide, and the `max` combiner is monotone-up in `horizon`
— so a caller can **never buy a lower band by inflating its own footprint** (which would only *raise*
horizon and thus ceremony). *Monotonicity is the anti-gaming guarantee*, pinned by the red suite's
monotonicity checks, not a prose promise. The precondition "`horizon` is measured under the minimal
driver" is the caller's to honor; `classify`'s input shape gives no lever to dishonor it.

### Degenerate / defensive behavior (shape-not-value; never throws)

- `dials.bandScale` **absent or empty** → `classify` returns **`null`** (never guesses a band — mirrors
  `ceremonyEscalation`'s "unknown band → null"). In practice `readPolicy` guarantees a non-empty
  `bandScale`, so `null` only surfaces on a malformed dial.
- `dials.classifier` **absent** → every cutoff array is absent → every axis pressure is `0` → the
  **lowest** band. This is the shape-not-value discipline (`policy.mjs`/`legibility.mjs`): a missing
  threshold *disables its lift*, it does not fabricate one. (Flagged: fail-to-lowest-ceremony on a
  malformed dial; see plan Flag 3.)
- An **absurd-but-well-formed** cutoff (`[0]`, negatives) loads and fires per the numbers given —
  `classify` validates shape, never value.

### The P6c-coined threshold dial (`dials.classifier`)

`policy.json`'s `dials` grammar is **open** beyond the three keys `readPolicy` validates
(`bandScale`/`phaseCutoffs`/`cadenceIndex`) — `readPolicy` returns the whole `dials` object **verbatim**,
so an extra `dials.classifier` **survives un-validated**. P6c coins it (the design named the classifier's
thresholds by *role*, not by key — the same "pin the role, coin the key" pattern P6d used for
`bandScale`/`phaseCutoffs`/`cadenceIndex` and P6b used for `maxCoupling`/`maxFanIn`):

```js
dials.classifier = {
  blastRadiusCutoffs: [Number, ...],   // ascending; pressure = # met-or-exceeded
  horizonCutoffs:     [Number, ...],   // ascending (an ordinal is a number)
  criticalityCutoffs: [Number, ...],   // ascending
  autonomousPressure: Number,          // band pressure an autonomous run adds
  trustedRelief:      Number,          // band relief a trusted-covered locus earns
}
```

Numbers ship **flagged-uncalibrated** (§16); calibration is ledger-data work, not a value invented here.
`classify` reads a **caller-supplied** `dials` object — in P6c's tests a **synthetic fixture literal**,
never an import of `lib/policy.mjs` (the object-shape coupling only; wiring `readPolicy`'s real output is
P7's, exactly Call #1). A reviewer may rename any key, choose a different monotone combiner (a weighted
sum), or use `criticality`/`horizon` as direct indices instead of through cutoffs; each is local, because
the pinned properties (monotone; output ∈ `bandScale`; round-trips through `ceremonyEscalation`) are
combiner-agnostic. See plan Flag 1.

### The load-bearing composition (pinned by a red test — plan Flag 1)

A `classify` output must be a valid current-band for `ceremonyEscalation`. The red test feeds a
classified **non-top** band into `ceremonyEscalation` (with a triggering wide-R2 verdict, the exact
fixture shape `test/rewrite-ceremony.test.mjs` uses) and asserts it **ratchets up exactly one step**
through the *same* `bandScale`; and feeds a classified **top** band and asserts `ceremonyEscalation`
**caps** it (returns `null`, never wraps). This is the "pin the exact composition with a red test that
round-trips a classified band through `ceremonyEscalation`" the roadmap demands — it proves the two
share one ordered scale.

---

## B. The phase-degeneration predicates (Decision 5, §5.4 — THE MANDATED PIN)

The roadmap requires this pinned **mechanically, not as prose** — this is the one place a struggling
autonomous run could talk itself out of a scaffold, so it must be unambiguous code, tested adversarially.
Three pure predicates, each returning a **Result** tagged union:

```
Result =
  | { result: 'materialize' }                                  // run the phase — the guard has work
  | { result: 'degenerate', degeneracy: PhaseDegeneratedRecord } // a PROVEN-EMPTY no-op (never a silent skip)
```

A degeneration is **never a silent skip**: it carries a record with the predicate's **evaluated
inputs**, so a reviewer sees *ran-and-found-nothing*. The predicates are **conservative** — when in
doubt they materialize, never degenerate.

### The degeneracy record (forward-appendable; P6c does NOT append or register it)

```js
PhaseDegeneratedRecord = { type: 'phase-degenerated', phase, reason, inputs }
//   phase  : 'scaffold' | 'recharter' | 'retro-classification'
//   reason : a short human string
//   inputs : the evaluated inputs (all "empty"/below-threshold in the degenerate case)
```

Shaped as a **forward-appendable ledger event** (`{ type, ... }` — the `lib/ledger.mjs` convention, read
`EVENT_SCHEMAS`) so P7 can append it verbatim. But **P6c neither appends it nor registers a
`phase-degenerated` type in `lib/ledger.mjs`** — that live-writer wiring is **P7's** (Call #1; the exact
seam `ceremonyEscalation` used — it *returns* a `{nodeId, change}` effect P7 later applies). **`lib/ledger.mjs`
stays untouched.** A reviewer could instead return a bare `{ degenerate: true }` the P7 caller translates;
local, since nothing appends it yet. See plan Flag 6.

### 1. `scaffoldMaterializes(genesis, lastRatified, skeletonComponents)`

The "*introduces a new goal-cone / touches the outer shell?*" test. Each snapshot is:

```js
genesis = lastRatified = {
  goals: [ { id, scenario, scenarioCitations, ... } ],   // readGoals-shaped (lib/goals.mjs)
  atoms: [ { id, component, premises, order, ... } ],    // charter-shaped (the atom.mjs fold: id = `a-<seq>`)
}
skeletonComponents = [ 'lexer', 'io', ... ]   // components the walking skeleton already wires end-to-end,
                                              // recorded at the last scaffold sign-off (§5); a Set or array
```

At the **first** genesis, `lastRatified = { goals: [], atoms: [] }`.

**Materializes iff `introduces-a-new-goal-cone ∨ touches-the-outer-shell`:**

- **introduces-a-new-goal-cone** := `goalIds(genesis) \ goalIds(lastRatified) ≠ ∅`, where
  `goalIds(s) = { g.id : g ∈ s.goals }`. A new goal needs its parked suite authored and its cone driven
  end-to-end.
- **touches-the-outer-shell** := ∃ a **newly-chartered** atom `a` (in `genesis.atoms`, id not in
  `lastRatified.atoms`) such that **`a` is a depth-0 provider of a goal scenario** *or*
  **`a.component ∉ skeletonComponents`**.
  - *depth-0 provider of a goal scenario* := `a.component` is named by some goal's `scenarioCitations`.
    **Genesis fidelity:** a charter has no `deltaClauses`, so `servesEdges` is vacuous at genesis (read
    `graph.mjs` — `servesEdges` reads `providerMap`, which reads `deltaClauses[].clauseId`); so the
    boundary is drawn at **component quotient** — the same planned-fidelity proxy P6a used for `needs`.
    The scenario-citation component is derived by a **local `#` split** on `citation.clause` (or a
    present `citation.component`) — *not* by importing `parseClauseId` (which drags
    `ledger.mjs`/`effort.mjs` I/O into this pure file, the import `goals.mjs`/`legibility.mjs` both
    refused).

- Otherwise **degenerates**: the effort lives wholly inside an already-skeletonized, non-shell cone —
  `degenerate('scaffold', reason, { newGoalIds: [], shellAtomIds: [] })` (both empty — the evaluated
  inputs a reviewer inspects to confirm ran-and-found-nothing).

**Flagged, minor (Decision 5's own judgment residue):** "the outer shell" is drawn as the **depth-0
scenario-provider component set ∪ the not-yet-skeletonized components**. It **over-approximates** (an
atom in a scenario-cited component that will not actually provide the cited clause still counts as
shell) — the *conservative* direction: it **never under-fires on a genuinely new goal cone** and never
lets a new top-level component through as "interior." A reviewer with clause-level genesis data could
tighten it to `servesEdges`; the same shape as P5's flagged "two contracts / a seam" rung. See plan
Flag 5.

### 2. `rechartingDegenerates(amendmentBatch)`

`amendmentBatch` is an array of accumulated amendments. **Degenerates iff the batch is empty** (no
amendment ⇒ nothing to retopologize): a non-empty batch → `{ result: 'materialize' }`; an empty or
non-array batch → `degenerate('recharter', ..., { amendmentCount: 0 })`.

### 3. `retroClassificationDegenerates(landedConeCount)`

`landedConeCount` is the number of landed cones the fired goal gate spans. **Degenerates iff `≤ 1`** (the
three-way divergence classification has one cone's worth of nothing to compare): `≥ 2` →
`{ result: 'materialize' }`; `≤ 1` or non-finite (treated as `0`) →
`degenerate('retro-classification', ..., { landedConeCount: <n> })`.

**Who dispatches or skips a role on these results is P7's frontier loop** (§6's "role-minimal
provisioning" applies them). P6c only *computes* them.

---

## Imports `lib/ceremony.mjs` adds

**None.** `lib/ceremony.mjs` imports nothing — it emits its own plain objects (band-name strings,
`{ result, degeneracy }` unions, `{ type: 'phase-degenerated', ... }` records), exactly as
`lib/effects.mjs`/`lib/rewrite.mjs` emit their string literals and shapes. **Not** `policy.mjs` (the
coupling stays at the object-shape level; the live wire is P7's), **not** `graph.mjs`/`clause-id.mjs`
(the scenario-citation component is a local `#` split, not `parseClauseId`), **not** `baseline.mjs`
(`trustedSuiteCovers` arrives as a boolean), **not** `rewrite.mjs` (the round-trip composition is
one-directional and lives in the *test*, not the lib — importing it would risk a cycle), **not**
anything I/O-bearing. The file is runtime-pure end to end.
