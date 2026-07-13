# Shared Interfaces — Part 7: The Frontier Loop + Gates

**Version:** 1.0

This is the exact surface every task in this plan tests, implements, or wires. Every signature here
was **read from the shipped code** (not assumed) — `lib/ledger.mjs`, `lib/reconcile.mjs`,
`lib/next-action.mjs`, `lib/progress-map.mjs`, `lib/route.mjs`, `lib/graph.mjs`, `lib/rewrite.mjs`,
`lib/ceremony.mjs`, `lib/goals.mjs`, `lib/policy.mjs`, `lib/footprint.mjs`, and
`workflows/vertical-slice-runner.workflow.js`. Where the design doc named a surface that does **not
exist as read**, or asserted a correctness property that does not hold as shipped (three cases), this
file pins the corrected, grounded form and flags it — those corrections are load-bearing, follow them
over the design doc's prose.

---

## 0. Three grounding corrections (read before anything else)

The design doc's self-review is right about the reconcile coupling and the free event-type names, but
three of its claims do **not** match the code as it actually ships — two are "reuse this shipped thing"
claims about a surface that doesn't exist as named; the third is a correctness claim ("proven in P5")
that P5 only proved for a narrower case than P7 actually needs:

1. **`footprint.groupDisjoint` does not exist — and `footprint.mjs` is not safely importable as a
   module at all, today.** `lib/footprint.mjs` is a **CLI script** that *exports nothing*; its
   `footprint()` / `independent()` / `lociOverlap()` / `prefix()` helpers are module-private. Worse: its
   top-level code (argv parsing, `rootFromArgv` resolution, and a bare `process.exit(1)` when no
   `.reasonable/` is discoverable from `process.cwd()`) runs **unconditionally at module load** — unlike
   `lib/ledger.mjs`, which gates its own CLI body behind `if (basename(process.argv[1] || '') ===
   'ledger.mjs') { runCli(); }`. `footprint.mjs` has no such guard (verified — read start to end).
   **Consequence: `import ... from './footprint.mjs'` today would call `process.exit(1)` in any process
   whose cwd has no discoverable effort — every test in THIS repo, since `reasonable` itself carries no
   `.reasonable/` (CLAUDE.md).** No file currently imports from `footprint.mjs` (verified — grepped the
   whole repo), so this latent defect has never fired; P7 is the first thing that would trigger it.
   **Resolution (§2, `pack`), a real fix, not a workaround:** T02 **wraps `footprint.mjs`'s existing
   top-level CLI body in the same guarded `runCli()` shape `ledger.mjs` already established** (mirroring
   that precedent verbatim — extract the body into a function, call it only behind
   `if (basename(process.argv[1] || '') === 'footprint.mjs')`), **and, separately, adds the pure export**
   `footprintsDisjoint(a, b)` (the extracted `independent()` algebra, returning a boolean instead of
   `{ok, why}` — the `why` diagnostic stays on `independent()`, which keeps its own shape for the CLI's
   printed output). Only after the guard exists is it safe for `lib/frontier.mjs`'s `pack` to `import`
   from it. `node lib/footprint.mjs ...` run directly behaves identically after the wrap (the guard
   fires exactly when invoked as the entry script); there is no existing `footprint` test to keep
   byte-identical (verified — none exists). The workflow's own inlined `groupDisjoint` (lines ~434–481
   of the shipped runner) is untouched by this — it already mirrors `independent()` in prose, not by
   import.

2. **The workflow cannot `import` `lib/frontier.mjs`.** The design says *"`lib/frontier.mjs`'s only
   caller is the workflow, in-process."* The workflow substrate (`CLAUDE.md` invariant 5) **forbids
   `import`** — every shipped workflow inlines its pure helpers (the `groupDisjoint` precedent above).
   **Resolution:** `lib/frontier.mjs` is the **unit-tested source of truth** and is imported by its
   **`lib/` consumers** (`lib/next-action.mjs` uses the cone-order deriver; the append path is
   separate). The **workflow** consumes the frontier calculus the way the shipped runner already
   consumes `groupDisjoint`/`toGateResult`: **pure helpers inlined into the workflow body, each with a
   `// Mirrors lib/frontier.mjs <fn> EXACTLY` comment**, cross-checked by the workflow-behavior tests
   (T09). This is the repo's established, substrate-forced convention — not new debt. (Flagged again in
   `architecture.md`; the design doc's "in-process caller" phrasing is the loose part, not this.)

Neither correction changes P7's scope; both make it buildable as written.

3. **The ceremony-escalation unwind is only exact for a single, isolated escalation per cone — a
   demonstrated defect, not a hypothetical one, and P7 is the part the P5 retrospective explicitly
   names as owning the fix.** `docs/artifacts.md`'s own "Scope note — the flagged gaps" for P5 records
   that mutation testing proved `unwindCeremonyEscalation` correct for one escalation from a clean
   state but **incorrect** for two escalations stacked on the same cone before either resolves: the
   `armed` marker set was a fixed, unnamespaced 3-item literal keyed only by check name, so unwinding
   the *later* escalation stripped markers the *earlier*, still-valid one also needed. Design Decision
   5's original text ("the correctness was proven in P5... P7's job is only to *call* it") repeated this
   mistake — P5 proved the single-escalation case only. **Resolution (§2, the `ratification` fold, and
   the design doc's Decision 5):** namespace every escalation by a stable `escalationId` (` ${coneId}#esc${N}`,
   `N` = a pure count of `state.escalations[coneId]`, the same counting pattern `state.priorVerdicts`
   already uses) and tag every `armed` entry with it (`` `${check}@${escalationId}` ``), so an unwind can
   only ever strip its own escalation's markers. **New task trio, Phase B: T04d (red) — rewrites the one
   pre-existing hard-coded literal in `test/rewrite-ceremony.test.mjs` that pins the old bare shape (the
   contract genuinely changed, so the locked test pinning it must be re-authored, exactly T08a's
   precedent) and adds `test/rewrite-ceremony-stacking.test.mjs`; T04e — implements the shape change in
   `lib/rewrite.mjs`; T04f — audits it.** Sequenced after T04c, before T05a (T05a now also depends on
   T04f). The fix is real and fully tested at the pure-function level; what remains open afterward
   (named, not hidden) is (a) the live per-cone `state.escalations`/`state.bands` store — the same
   already-flagged gap this section's item 1's sibling note describes for `bandBounds` — and (b) the
   band-revert value under an out-of-order (non-LIFO) multi-rejection sequence, a narrower residual
   T04d's tests do not close. See the design doc's Decision 5 for the full account.

Three corrections total; none change P7's scope — they make it buildable, and in this third case,
*correct*, as written.

---

## 1. `lib/frontier.mjs` — the pure loop calculus (Phase A)

Every function is **pure**: verdict / graph / policy / footprint data in, plain values out. No disk,
no `append()`, no `Date`, no `Math.random`. Same shape discipline as `lib/rewrite.mjs` and
`lib/ceremony.mjs`. Imports allowed: **only** the extracted `footprintsDisjoint` from `./footprint.mjs`
(correction 1). No other `lib/` import, no `node:fs`.

### 1.1 The exhaustive `GATE_RESULT` union + `gateDue` (T01)

```js
// The seven gate kinds, exhaustive (DESIGN-3.0 §6, §9). Frozen, order is the DECISION order gateDue
// evaluates (immediate-fire classes first, then batched/floor, then the totality HALT).
export const GATE_RESULT_KINDS = Object.freeze([
  'blocked-human',     // an always-human class (policy/goal change §3, intent fork §7.1) — BOTH modes
  'goal-green',        // a goal cone reached green — the deep umbrella audit runs at THIS gate
  'starved',           // frontier empty / below quorum while gate-held material exists (liveness valve)
  'batch-full',        // a batched class grew past its pinned bound
  'heartbeat',         // the band-indexed floor tripped (N merged atoms OR M events since last gate)
  'budget-exhausted',  // the wave budget spent, no wall claimed (R1 territory) — first-class, NOT a failure
  'halt',              // durability / totality failure (fail-closed inside an effort)
]);
```

```js
/**
 * The total gate function (§7.2 Totality generalized from the router to the loop). Returns EXACTLY one
 * GATE_RESULT. Immediate-fire classes are checked first and short-circuit; then batched/floor; an
 * unrecognized control state is a `halt`, never a silent fall-through. `blocked-human`, `goal-green`
 * and `starved` fire REGARDLESS of band; the band only ever moves the `heartbeat` floor (§9).
 *
 * @param {GateState} state
 * @param {object} policy   — readPolicy().policy (reads policy.cadence[band] = {n, m})
 * @returns {{ kind: string, detail?: object }}   kind ∈ GATE_RESULT_KINDS
 */
export function gateDue(state, policy);
```

`GateState` — a **pre-digested** snapshot the workflow/reconcile assembles (all counts already folded;
`gateDue` computes no I/O):

```js
{
  // immediate-fire signals
  blockedHuman: null | { class: 'policy'|'goal'|'intent-fork', ref: string },
  goalGreen:    null | { goalId: string },
  frontierSize: number,          // ready(graph).length at this point
  quorum:       number,          // policy starvation quorum (default 1)
  gateHeldCount: number,         // frozen atoms + pendingPermanent verdicts + barred births + blocked-human items
  inboxLoad:    number,          // open approval-inbox size (the load tripwire)
  inboxTripwire: number,         // policy threshold for the inbox load

  // batched classes (each a running count since the last gate)
  batches: { amendments: number, deadEndPermanence: number, extractions: number, retopology: number },
  batchBounds: { amendments: number, deadEndPermanence: number, extractions: number, retopology: number },

  // the band-indexed floor (§9)
  band:             string,      // the cone's complexity band (a dials.bandScale member)
  mergedSinceGate:  number,      // merged atoms since the last fired gate
  eventsSinceGate:  number,      // ledger events since the last fired gate

  // totality
  controlState?: 'ok' | string,  // any non-'ok'/unknown value ⇒ halt
}
```

Decision order inside `gateDue` (pin exactly; the red tests assert each branch and the ordering):

1. `state.controlState` present and not `'ok'` ⇒ `{ kind:'halt', detail:{ controlState } }`.
2. `state.blockedHuman` ⇒ `{ kind:'blocked-human', detail: state.blockedHuman }` (both modes).
3. `state.goalGreen` ⇒ `{ kind:'goal-green', detail: state.goalGreen }`.
4. `state.inboxLoad >= state.inboxTripwire` (tripwire > 0) ⇒ immediate-fire → treat as `heartbeat`
   with `detail.reason:'inbox-load'` (the inbox tripwire is an immediate-fire heartbeat, §9). *(Pin:
   it is NOT a distinct kind — §6's union has seven; the tripwire routes to `heartbeat`.)*
5. `state.frontierSize < state.quorum && state.gateHeldCount > 0` ⇒ `{ kind:'starved' }` (the liveness
   valve — a wide freeze empties the frontier while gate-held material waits).
6. any `batches[k] >= batchBounds[k]` ⇒ `{ kind:'batch-full', detail:{ class:k } }`.
7. the band floor: with `{ n, m } = policy.cadence[state.band]` (fall back to a defined default band
   only if `state.band` is absent), if `mergedSinceGate >= n || eventsSinceGate >= m` ⇒
   `{ kind:'heartbeat' }`.
8. otherwise **no gate is due** — return `{ kind: null }` **is forbidden**; instead `gateDue` is only
   called when the loop believes a gate MIGHT be due, and the "nothing tripped" answer is a distinct,
   in-band, non-firing sentinel: `{ kind:'none' }`. *(Pin: `'none'` is the eighth, non-firing return —
   NOT a GATE_RESULT the workflow returns to the main session; it means "keep looping." The workflow
   only returns to the main session on a kind ∈ `GATE_RESULT_KINDS`. Tests assert `'none'` when no
   class trips and `budget-exhausted` is surfaced by the workflow's budget guard, not by `gateDue` —
   see §5.)

> **`budget-exhausted` is not produced by `gateDue`.** It is the workflow's budget-guard outcome
> (mirrors the shipped runner's `guard()`), surfaced by the workflow when its budget membrane throws
> before green. `gateDue` classifies gate-firing state; the budget ceiling is a separate control path.
> It is listed in `GATE_RESULT_KINDS` because the *main session* routes it as a gate result; `gateDue`
> never returns it.

### 1.2 `ready` (T02)

```js
/**
 * The frontier ready-set (§6: "ready(graph) = planned edges; minus frozen / guard-halted / barred").
 * An atom is READY iff (a) its lifecycle state is frontier-eligible — one of 'chartered' | 'ready' |
 * "spec'd" (a packed/in-flight/merged/retired atom is not on the frontier), (b) every atom it `needs`
 * (an edge {from:A, to:B, edge:'needs'}) is SATISFIED — the provider B is 'merged' OR absent from
 * graph.atoms (already landed / external), and (c) A is not in frozen / guardHalted / barred.
 * Reuses graph.mjs edges verbatim; adds NO new graph algorithm.
 *
 * @param {{ atoms: AtomRecord[], edges: Edge[] }} graph   — foldAsLived / deriveCurrent shape
 * @param {{ frozen?: string[], guardHalted?: string[], barred?: string[] }} flags
 * @returns {string[]}  ready atom ids, in graph.atoms order (deterministic)
 */
export function ready(graph, flags);
```

`AtomRecord` (from `foldAtomsFromEvents`, already shipped): `{ id, component, state, flags?,
deltaClauses?, premises?, order?, ... }`. `Edge`: `{ from, to, edge, op }` with `edge ∈
['needs','excludes','serves','informs']`.

### 1.3 `pack` + `footprintsDisjoint` (T02 — correction 1)

**First, `lib/footprint.mjs`'s CLI body must be GUARDED** (T02b, step 0 — a prerequisite, not optional):
its top-level code runs unconditionally today (no `if (basename(process.argv[1]||'')==='footprint.mjs')`
guard, unlike `ledger.mjs`), including a `process.exit(1)` when no `.reasonable/` is discoverable. Wrap
the existing top-level body in a `runCli()` function and call it only behind that guard — mirroring
`ledger.mjs`'s established shape exactly, zero behavior change for `node lib/footprint.mjs ...` run
directly. Only then is the new export safe to `import`:

```js
// ADDED to lib/footprint.mjs as an EXPORT (extraction of the existing private `independent()` algebra
// into a boolean-returning pure form; `independent()` itself is untouched — it still returns
// `{ok, why}` for the CLI's printed diagnostic). Pure, no I/O. Safe to import ONLY once the CLI body
// above it is wrapped in the runCli() guard (see step 0) — otherwise the import itself would exit(1).
/**
 * Two footprints are disjoint iff their loci do not overlap (ancestor-prefix over glob prefixes) AND
 * they share no contract (citation closure already folded in) AND they share no resource.
 * @param {Footprint} a  @param {Footprint} b   Footprint = { id, locus:string[], contracts:string[], resources:string[] }
 * @returns {boolean}
 */
export function footprintsDisjoint(a, b);   // lib/footprint.mjs
```

```js
// lib/frontier.mjs — imports footprintsDisjoint from ./footprint.mjs
/**
 * The maximal (greedy first-fit) subset of spec'd atoms that is PAIRWISE disjoint by ACTUAL footprint
 * (§6: "packing happens only on actual footprints"). Deterministic first-fit over the input order.
 * A collision between two packed atoms is an R9 verdict (a footprint bug, §6), never a silent merge
 * conflict — pack only asserts disjointness; the loop raises R9.
 *
 * @param {Footprint[]} footprints   — one per spec'd atom (from `node lib/footprint.mjs --json`)
 * @returns {{ wave: string[], deferred: string[] }}  wave = the first disjoint group's ids; deferred = the rest
 */
export function pack(footprints);
```

### 1.4 `requiredRoles` (T03 — role-minimal provisioning, §6 draft-five)

```js
/**
 * The set of roles a wave actually needs (§6). Pure; the DISPATCH on the result is the workflow's.
 * Always present (categorical core): 'implementer', 'blind-test-writer', 'auditor'. The rest enter the
 * set ONLY on non-empty input, using ceremony.mjs's degeneration predicates applied to role dispatch:
 *   - 'census' / 'characterizer'  — only when context.brownfield && context.brownfieldInput is non-empty
 *   - 'topologist' (re-chartering) — only when rechartingDegenerates(context.amendmentBatch).result === 'materialize'
 *   - 'retro-synthesizer'          — only when retroClassificationDegenerates(context.landedConeCount).result === 'materialize'
 * (The 'scaffolder' is governed by scaffoldMaterializes at the topology→scaffold boundary, NOT by a
 * wave's requiredRoles — see architecture.md; requiredRoles covers per-wave dispatch only.)
 *
 * @param {object} wave      — { atomIds: string[] } (the packed wave)
 * @param {object} context   — { brownfield?:boolean, brownfieldInput?:any[], amendmentBatch?:any[], landedConeCount?:number }
 * @returns {string[]}       — the role names, SORTED (deterministic), for the tests to deepStrictEqual
 */
export function requiredRoles(wave, context);
```

Reuses, from `lib/ceremony.mjs` (grounded — read verbatim): `rechartingDegenerates(amendmentBatch)`
and `retroClassificationDegenerates(landedConeCount)`, each returning
`{ result:'materialize' }` | `{ result:'degenerate', degeneracy }`.

---

## 2. `lib/ledger.mjs` — the append-path wiring (Phase B)

**Two new `EVENT_SCHEMAS` entries** (verified free — no existing entry uses these names; the live 2.x
`verdict` / `verifier-verdict` are keyed differently and stay untouched):

```js
'atom-verdict':      { required: ['atomId', 'kind'] },   // kind ∈ rewrite.mjs VERDICT_KINDS
'phase-degenerated': { required: ['phase'] },            // the exact record ceremony.mjs emits
```

**The `append()` verdict branch (T04).** In the Family-3 (`else`) arm of the `withLock` body, when
`type === 'atom-verdict'`, **before** `appendJsonlLocked`:

1. assemble the read-only snapshot: `state = deriveCurrent(root, { goals })` gives
   `{ containment, atoms, edges }`. **`citationGraph` is NOT among them** — `deriveCurrent` computes it
   as a local variable (via `contract.mjs`'s `citationGraph(effortRoot)`, aliased `liveCitationGraph`
   inside `graph.mjs`) to build `edges`, but does not return it. `append()` therefore calls
   `citationGraph(root)` **directly from `./contract.mjs`** (the same exported function `graph.mjs`
   itself uses) — one extra, cheap read-only call, not a re-derivation. Attach `bandScale`
   from `readPolicy(root).policy.dials.bandScale`, and `bands` (a `{[coneId]:bandName}` map — P7's own
   construction, since nothing yet persists a live per-cone band assignment; the honest default is
   `{}`, meaning `ceremonyEscalation`'s `state.bands[coneId]` lookup returns `undefined` for every
   cone, which `ceremonyEscalation` already treats as "unknown band — cannot place it; never guesses"
   → returns `null`, i.e. no escalation fires until a real per-cone band store exists) **(never a
   lane's in-flight divergence — §2.4)**.
   > **Flagged, real, un-owned gap (found grounding this plan, not invented):** `policy.dials` as
   > landed by P6d pins `bandScale` / `phaseCutoffs` / `cadenceIndex` — **no `bandBounds` field**.
   > `ceremonyEscalation`'s R2 trigger (`lib/rewrite.mjs`) reads `state.bandBounds[coneId]` (a per-cone
   > numeric blast-width bound), which is `GraphState` data no shipped loader produces. **T04 passes
   > `bandBounds: {}`** (the honest empty default — `typeof bound === 'number'` is false for every
   > cone, so this one escalation trigger never fires) rather than inventing a nested `phaseCutoffs`
   > shape `policy.mjs`'s grammar doesn't pin. This under-fires (safe direction — an escalation that
   > should fire doesn't, never the reverse) and is named here for T04c's audit and `docs/artifacts.md`
   > (T11) to record as an open edge, exactly the P4/P5/P6 precedent for a flagged, un-owned gap. The
   > other three ceremony triggers (`ripple`, `stale-spec`, `checkpoint`) do **not** depend on
   > `bandBounds` and are unaffected.
   > **A sibling gap, same category: `state.escalations`.** T04e's escalation-id namespacing fix (§0
   > correction 5, below) reads `state.escalations[coneId]` — an array of prior escalation records for
   > that cone, used only to COUNT how many came before (the next escalation's ordinal). No shipped
   > loader produces this either (there is no live escalation-history store any more than there's a live
   > band store). T04 passes `escalations: {}`, the same honest empty default as `bands`/`bandBounds` —
   > every escalation computed through the real `append()` path today therefore gets ordinal 0 (as if it
   > were the first on its cone), which is inert-but-correct exactly the way `bands: {}` makes
   > `ceremonyEscalation` never fire at all: the FIX is real and fully tested at the pure-function level
   > (T04d/T04e/T04f), but is only OBSERVABLE once a live per-cone store exists for both `bands` and
   > `escalations` together — one future gap, not two.
2. `const eff = computeVerdictEffects(event /* the verdict */, state)` — if `eff.ok === false`, the
   whole `append()` returns `{ ok:false, error: eff.error }` and writes **nothing** (§7.2 Totality,
   fail-closed) — mirrors the existing `resolveFamily1Address` early-return-inside-`withLock` pattern;
3. `const esc = ceremonyEscalation(event, state)` (an effect-or-null);
4. **overwrite** `stamped.effects` with the union of `eff.provisional` (+ `esc` when non-null) — the
   controller is the authority, exactly as it overwrites `seq` (D19). Record `eff.permanent` as
   `stamped.pendingPermanent` (a payload field: **recorded, not applied**).
5. `validateEffects(stamped.effects)` must pass (it does by construction — the rules emit valid
   effects; the existing `validateEvent` already re-checks any `effects` field).

`computeVerdictEffects` / `ceremonyEscalation` are imported from `./rewrite.mjs` (grounded exports).
`deriveCurrent` from `./graph.mjs`; `readPolicy` from `./policy.mjs`; `readGoals` from `./goals.mjs`.

**The `ratification` two-phase fold (T05).** The `ratification` event type already exists (with
`validateDropsAndResolvesSeq`). Extend `append()` so that for `type === 'ratification'` carrying a
payload `ratifiesSeqs: number[]` (accept) and/or `rejectsSeqs: number[]` (reject):

- **accept:** fold each referenced `atom-verdict`'s `pendingPermanent` into `stamped.effects` (read the
  ledger under the lock via `readJsonl`, find those seqs, union their `pendingPermanent`). This makes
  "pending permanence" a **fold over the ledger** (every `atom-verdict` seq with no consuming
  `ratification` above it), never a mutable side-table.
- **reject** of a ceremony-escalation raise: fold `unwindCeremonyEscalation(escEffect)` (from
  `./rewrite.mjs`) into `stamped.effects` — the pure inverse P5 proved **for a single, isolated
  escalation per cone** (apply-then-unwind = identity) — see §0 correction 5 for why P7 does not just
  wire this unchanged.

*Pin:* the exact payload field names (`ratifiesSeqs` / `rejectsSeqs` / `pendingPermanent`) are P7-coined
and belong to the §12 grammar; register them in `docs/artifacts.md` (T11). They are additive optional
fields — an old `ratification` event lacks them and behaves exactly as before.

---

## 3. `lib/next-action.mjs` — the goals/cones order deriver (Phase C, additive)

`projectDirectives(state)` and `selfCheckDirectives(directives, context)` **keep their exact signatures
and the directive grammar** (`kind ∈ HALT|AMBIGUOUS|DECIDE|RUNNING|DISPATCH|RETRO|OPEN|LAND|CONCLUDE|
DONE`; the `state` shape with `routeOrder: string[]|null` + `slices[]`). P7 changes only what **feeds**
them. **New pure export** (T06):

```js
/**
 * Derive the risk-first frontier order over goals + cones (§3), producing the SAME
 * `routeOrder: string[]` / `slices[]` shape projectDirectives already consumes — so the projection is
 * untouched and only its INPUT changes. Pure (no disk): reconcile reads goals/atoms/policy and hands
 * them in, exactly as it pre-digests `state` for projectDirectives today.
 *
 * @param {{ goals: GoalEntry[], atoms: AtomRecord[], weights: object }} inputs
 *        goals   = readGoals(root).goals (entries { id, scenario, scenarioCitations, ... })
 *        atoms   = deriveCurrent(root).atoms  (for servesEdges cones)
 *        weights = readPolicy(root).policy.weights
 * @returns {{ routeOrder: string[], slices: Array<{ id, woIds: string[] }> }}
 *        routeOrder = goal ids, best-first by the policy weights over each goal's serves-cone;
 *        slices     = one entry per goal id, woIds = the atom ids in that goal's cone (servesEdges).
 */
export function deriveConeOrder(inputs);
```

Grounded: `deriveConeOrder` imports `servesEdges` from `./graph.mjs` (it is in that file's PURE section,
above the T02b I/O marker — safe to import into a pure module) and calls
`servesEdges(atoms, goals)` → `{ from: atomId, to: goalId, edge:'serves' }` edges; the cone of goal G is
`{ e.from | e.to === G.id }`.

**The concrete, grounded scoring (not invented — one real policy axis, honestly partial):** of
DESIGN-3.0 §3's six named axes (integration-risk, expected information gain, unlocks-count, goal
proximity, staleness pressure, cost), only **unlocks-count** has a real, computable proxy from
`{goals, atoms, weights}` alone — a goal's **cone size** (how many atoms its completion would carry
toward green). `deriveConeOrder` scores each goal `weights.unlocksCount * coneSize` (0 when
`weights.unlocksCount` is absent/not-a-number — the neutral default), sorts **descending**, and breaks
ties by **original input order** (a stable sort) so an all-zero/absent weight set degenerates exactly to
the input order — never an invented tiebreak. The other five axes need telemetry this task's inputs
don't carry (blast-radius history, staleness timestamps, cost estimates) and are **not** implemented —
named here as the honest partial scope, not silently faked. This mirrors how `route.json`'s `slices`
array fed `routeOrder` — a goal cone is the 3.0 "slice" (§3: "the slice is a degenerate case").

---

## 4. `lib/reconcile.mjs` — select the projection, replay effects (Phase C)

The Layer-2 block (≈ lines 637–735) today: `readRoute(effortRoot)` → `routeOrder` → `projSlices` →
`projectDirectives({ ..., routeOrder, slices })`, then the self-check with
`routeSlices: routeOrder`. The migration (T07/T08), **additive then subtractive**:

- **T07 (additive):** when `readGoals(effortRoot).goals` is non-null, compute
  `deriveConeOrder({ goals, atoms: deriveCurrent(effortRoot).atoms, weights: readPolicy(effortRoot).policy.weights })`
  and feed its `routeOrder`/`slices` into the SAME `projectDirectives` call and the SAME
  `routeSlices` self-check input. When `goals.json` is absent, keep the `readRoute` path verbatim
  (fallback). Also call `graphDivergence(effortRoot)` and push any non-empty divergence into `notes`
  as retopology pressure (§2.4: "computed and surfaced … never silently absorbed"). Every existing
  route test still passes (route path intact); new tests seed `goals.json`.
- **T08 (subtractive, last):** flip the default (goals/cones primary; route only when `goals.json`
  absent **and** `route.json` present), migrate the route-coupled tests to seed
  `goals.json`/`policy.json`, then **remove the `import { readRoute } from './route.mjs'`** line and
  **delete `lib/route.mjs` + `test/route.test.mjs`**. Only now — when nothing imports `readRoute`.

*Invariant held between every task:* `for t in test/*.test.mjs; do node "$t"; done` is green after each
green/audit task. That is the whole reason the migration is five steps, not one.

**A real, named scoping boundary (found grounding this section, not invented):** `routeOrder` feeds
`projectDirectives`'s **slice** grouping — and 2.x "slice" membership is a work-order's own
`.verticalSlice` string field, a concept the atom/goal model does not share (atoms are not work orders;
nothing today maps one to the other). So T07/T08 only swap `routeOrder`'s **source value** (cones vs.
route); they do **not** rewire `projectDirectives`'s WO-grouping (`bySlice`/`projSlices`/RETRO/OPEN) to
be atom-native — that is a strictly larger migration DESIGN-3.0 §12 does not name as P7's, and this plan
does not invent it. Concretely: in a fixture where goal ids happen to equal the WO's `.verticalSlice`
values, cone-derived ordering visibly changes `DISPATCH` ordering (proving the wiring); in a real 3.0
effort with no work-order specs at all, `projSlices` degrades to `[]` exactly as it already does for a
route-absent effort today — a graceful, pre-existing degradation, not a new gap this part opens.

---

## 5. `workflows/frontier-wave.workflow.js` — the replacement workflow (Phase D)

**Substrate rules (hard, `CLAUDE.md` invariant 5; verified against the five shipped workflows):** a
top-level async body with the injected globals `['args','budget','phase','log','agent','parallel',
'pipeline','workflow']`; `export const meta` a pure object literal; inlined JSON-Schema `const`s per
agent contract; a `guard()` budget membrane; prompt-builders that pass **artifact paths only** (agents
do all I/O); and **no `fs` / `Date.now()` / `Math.random()` / `new Date()` / `import`.**

Stage sequence (§6's loop; one run ends AT the next gate):

```
phase('Reconcile') → reasonable:reconciler        → BRIEFING (goals/cones-based, §4)
phase('Spec')      → deltas authored / re-spec'd; R4 + checkpoint-2 run HERE (§6)
phase('Pack')      → wave = pack(footprints)   // inlined mirror of lib/frontier.mjs pack (correction 2)
phase('Dispatch')  → per atom: blind tests, impl (+enrichment), adjudication, audit — role-minimal
phase('Collect')   → verdicts = collect(); for v: append 'atom-verdict' (the APPEND computes effects, §2)
phase('Merge')     → one --no-ff merge per atom, topological by ACTUAL needs among audited atoms
phase('Gate')      → return the 7-variant GATE_RESULT (inlined mirror of gateDue; budget guard → budget-exhausted)
```

- It **produces and collects audited verdict payloads** and appends them as `atom-verdict` events; it
  **never computes an effect set** (§2 — the append path does). This is the workflow's half of the
  pivotal call.
- It dispatches **role-minimally** (mirror of `requiredRoles`).
- It **returns the typed `GATE_RESULT` and never blocks** — the main session fires the gate; the
  `vertical-slice-execution` skill's existing "green→retro, budget→extend, blocked→human, halt→human"
  contract generalizes to the seven variants (T11 repoints the skill). `blocked-human` is the variant
  the main session must block on in **both** modes.
- **Lane = atom, untouched.** `lane-provisioner` / `journal-writer` / `validateLaneBases` / the custody
  bijection are reused verbatim; only *which* roles dispatch and warm-worktree reuse across
  same-component atoms change (§6 "amortization is provisioning-level only").
- The old `vertical-slice-runner.workflow.js` is **deleted in the same task** that lands the
  replacement. `test/workflow-load.test.mjs` covers the new file automatically (it iterates all
  `workflows/*.workflow.js`).

---

## 6. `lib/progress-map.mjs` — the live view (Phase E, extend the existing fold)

`EVENT_MAP` (grounded) maps each event `type` → a function `(e) => TreeOp[]` where a `TreeOp` is one of
`{ op:'inject', path, label?, status? }` | `{ op:'status', path, status, detail?, ts? }` |
`{ op:'note', ... }` | `{ op:'update', ... }`. Lookups use `Object.hasOwn(EVENT_MAP, e.type)`; an
unmapped type degrades to a plain note (the fold's own fallback, not a table entry).

**A fourth grounding correction (found writing this section, not invented):** §8's prose ("a fold up the
containment tree… aggregated by id") reads as if each atom event should be injected at its
`containmentTree`-derived nested path. But `EVENT_MAP` handlers are **stateless, pure, one-event-at-a-time
functions** by explicit design (`progress-map.mjs`'s own header: *"this table does no stamping, no
resolution, pure interpretation"*) — a bare `atom-transitioned` event carries only `{atomId, from, to}`,
**not** `component`, so a handler processing it in isolation cannot look up the atom's containment path
(that requires the atom's OWN `atom-chartered` event, which `foldEvents` has already folded by then but
does not thread into later handlers — doing so would break the file's stateless-handler architecture,
which is a design invariant, not an oversight). **Resolution: T10 injects every atom node FLAT, keyed
by `atomId` itself as the top-level path segment** (`path: e.atomId`, e.g. `"a-1"`) — never nested under
a component. This still honors the real invariant §8 cares about (**aggregation by id, so a reshape
renders as a rename, never a double-count**), because the atom id IS the path and ids are never reused.
**True containment-tree nesting for the live view is named here as future work**, not silently
under-delivered — it would require either threading fold state into `EVENT_MAP` handlers (a real
architectural change, out of this task's scope) or a second read pass joining atom events by id (also
out of scope). Flagged, not invented.

**T10 adds entries** for the 3.0 atom / verdict / degeneration events (each keyed flat on `atomId`, per
the correction above):

- `atom-chartered` → `inject` the atom node at `path: e.atomId` (label from `e.purpose`; status
  `'pending'`);
- `atom-delta-authored` / `delta-enrichment` → `status`/`note` on `path: e.atomId` (delta grew);
- `atom-transitioned` → `status` on `path: e.atomId` reflecting `e.to` (map the lifecycle state to a
  tree status — e.g. `'merged'`→`'done'`, `'retired'`→`'canceled'`, anything mid-pipeline→`'active'`);
- `atom-flag-set` / `atom-flag-cleared` → `note` on `path: e.atomId` (frozen / guard-halted /
  dispatch-barred);
- `atom-verdict` → `note` on `path: e.atomId` naming the rewrite (the verdict kind);
- `phase-degenerated` → `inject` a node at a synthetic path (`` `phase/${e.phase}` ``) that
  **ran-and-found-nothing** (§5.4), so a reviewer sees the proven no-op, never a silent skip.

**Flagged (Decision 7, honest minimum):** §8 also says progress is *"cost-weighted per subeffort."*
Cost weight depends on the **budget denomination per atom class** (§16, uncalibrated), so T10 pins the
**lifecycle-state fold** (fully mechanical from the atom events) and leaves the cost weight a default
**1 per atom** — name the knob, ship it neutral (mirrors P5's α).

---

## 7. Imports map (who imports what — all from already-exported surfaces)

```
lib/frontier.mjs   imports  footprintsDisjoint            from ./footprint.mjs   (correction 1)
lib/ledger.mjs     imports  computeVerdictEffects,
                            ceremonyEscalation,
                            unwindCeremonyEscalation      from ./rewrite.mjs
                            deriveCurrent                 from ./graph.mjs
                            citationGraph                 from ./contract.mjs  (NOT in deriveCurrent's
                                                                                return — §2 correction)
                            readGoals                     from ./goals.mjs
                            readPolicy                    from ./policy.mjs
lib/next-action.mjs imports servesEdges (indirectly via reconcile's deriveCurrent) — deriveConeOrder is
                            PURE and takes goals/atoms/weights as ARGS (reconcile does the reads)
lib/reconcile.mjs  imports  readGoals (goals.mjs), readPolicy (policy.mjs),
                            deriveConeOrder (next-action.mjs), deriveCurrent/graphDivergence (graph.mjs)
                            — and DROPS `readRoute` from ./route.mjs at T08
lib/progress-map.mjs        no new import — extend EVENT_MAP in place
workflows/frontier-wave.workflow.js   NO imports (substrate) — inlines pure mirrors of pack + gateDue
```

Every RHS symbol above was read from the shipped file's export list (§0 header). No third-party import,
ever (Law 1). No workflow import (substrate).
