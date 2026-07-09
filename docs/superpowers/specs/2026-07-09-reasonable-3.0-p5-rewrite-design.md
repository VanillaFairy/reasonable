# Design — Reasonable 3.0 Part 5: The Rewrite Engine (the failure calculus)

**Status:** brainstormed non-interactively, same discipline as Parts 1–4. `reasonable` is a Claude
Code plugin, not an interactive service, so this pass plays the role brainstorming normally reaches
through dialogue — every genuinely contestable call is flagged explicitly below instead of silently
resolved. The human reviewing this (and the resulting plan) is the approval gate that would
normally have happened turn-by-turn. One call here is pivotal enough that the plan should not be
written until it is confirmed — it is the very first decision below.

## What this covers

Part 5 of the `reasonable` 3.0 roadmap (`docs/superpowers/plans/2026-07-08-reasonable-3.0-roadmap.md`):
build `lib/rewrite.mjs` — the **failure calculus**: the R1–R9 verdict types, their two-phase
(provisional-at-verdict / permanent-at-gate) effect sets, the §7.1 routing ladder, and the
**ceremony-escalation effect** (a verdict may ratchet a cone's complexity band *up*) together with
**its unwind** — per `docs/DESIGN-3.0.md` §7, §7.1, §7.2, the ceremony ruling before §7.1, and §17.
This is planning only; nothing here is implemented yet.

Parts 1–4 shipped real, inspectable ground truth this doc reads directly rather than re-deriving
from prose:

- `lib/effects.mjs` — the two pinned effect shapes and their validator: a **node effect**
  `{nodeId, change}` (`change` is any JSON value; explicit `undefined` rejected) and an **edge
  effect** `{from, to, edge, op}` (`edge ∈ EDGE_NAMES = ['needs','excludes','serves','informs']`,
  `op ∈ EDGE_OPS = ['add','remove']`). `validateEffects(effects)` returns `{ok}` / `{ok,error}`.
- `lib/atom.mjs` — the lifecycle machine: `LIFECYCLE_STATES` (`chartered, ready, spec'd, packed,
  tests-red, green, audited, merged, retired-pending, retired`), `LIFECYCLE_TRANSITIONS` (the pinned
  adjacency table), `TERMINAL_STATES` (`merged, retired`), `FLAG_NAMES`
  (`frozen, guard-halted, dispatch-barred`), `isValidTransition(from,to)`, `isValidFlag(flag)`, and
  `cohesionComponents(clauses, componentRoot)` (the §4.3 union-find over the cohesion relation).
- `lib/graph.mjs` — the graph fold: `needsEdges(atoms)`, `excludesEdges(atoms,{citationGraph})`,
  `ledgerCitationGraph(atoms)`, `citationClosureOver(citationGraph, seeds)`, `servesEdges`,
  `informsEdges`, `liftEdges`, and the two projections `foldAsLived`/`deriveCurrent` +
  `graphDivergence`. Every edge is `{from, to, edge, op}` — the exact shape `effects.mjs` validates.
- `lib/ledger.mjs` — the one sanctioned write path. `EVENT_SCHEMAS` already contains a **2.x
  `verdict` event type** (`required: []`) used today for skeptic/adjudicator/auditor judgments
  (e.g. `{type:'verdict', kind:'infeasible', workOrder:'WO-9', …}`). `validateEvent` calls
  `validateEffects(event.effects)` for *any* event that carries an `effects` field.

`docs/artifacts.md`'s own scope notes already name this part by role, twice: the Effects section
says "Populating `effects` for real, and folding it with real precedence rules, is the rewrite
engine's job (Part 5)"; the atom-lifecycle section says "Deciding which verdict (R1–R9) applies to a
failed attempt, or applying one, remains future work (rewrite engine, Part 5)." Part 5 is that
engine arriving — but only the *computation* half of it, for the reason the very next section pins.

**Explicitly out of scope** (deferred to later parts, same discipline as Parts 1–4):

- **Dispatching or collecting verdicts, and wiring the calculus into `append()`.** Nothing in the
  shipped engine produces a 3.0 R1–R9 verdict; the frontier loop that does (`for v in verdicts:
  ledger.append(v)`, §6) is **Part 7**. See the central scoping decision below — this is the pivotal
  call.
- **Deciding a verdict's *type* or authoring its *payload*.** That is audited model judgment (§7:
  "Judgment produces the type and payload; the adversarial trio audits them"). Part 5 is the code
  that, given an already-typed, already-audited verdict, computes the deterministic effect set — the
  no-model-in-the-loop half.
- **The complexity-band vocabulary, thresholds, and storage** (`policy.json`'s ceremony-sizing
  dials) and the **legibility density measurement** (`lib/legibility.mjs`) — both **Part 6**. Part 5
  implements the *mechanism* that consumes a band (monotone-up ratchet, unwind) against a
  caller-supplied ordered band scale; it does not invent Part 6's band names or its density metric.
- **Actually applying an effect** — folding it into the graph, minting a born node's id, running a
  git revert, calling `charterAtom`. Part 5 *computes* effect sets (pure data in `effects.mjs`'s
  shape); *applying* them is Part 7's job (§2.4: "the proposing agent authors the verdict payload;
  `rewrite.mjs` computes the effect set; the controller applies").

## The central scoping fact this design turns on — READ FIRST

**The roadmap's file list for Part 5 names exactly one new file — `lib/rewrite.mjs` — and does
*not* list `lib/ledger.mjs (extend)`.** Contrast Part 1's row, which explicitly listed
`lib/ledger.mjs (extend)`. DESIGN-3.0's prose does say the calculus is "hosted inside the ledger
controller's append path" (§2.4, §7), and a naïve reading would have Part 5 wire effect-computation
into `append()` right now. **This design does not do that, and the reason is decisive, not a
proportionality guess:**

1. **The `verdict` event type is already live and means something else.** `EVENT_SCHEMAS.verdict`
   exists today for 2.x skeptic/adjudicator/auditor judgments on a *work order*
   (`{type:'verdict', kind:'infeasible', workOrder, survivedSkeptic, …}` — `docs/artifacts.md`
   §722). Keying effect-computation off `type === 'verdict'` inside `append()` would fire the 3.0
   calculus on every existing 2.x verdict — an active correctness break, not merely premature
   surface. The 3.0 R1–R9 verdict is a *different* thing (an atom rewrite), and giving it a
   collision-free home (a new event type, or a discriminating field) is a decision only the part
   that actually *produces* 3.0 verdicts can make coherently.

2. **Nothing produces a 3.0 verdict until Part 7.** The frontier loop is the sole producer and
   collector (`verdicts = collect(); for v in verdicts: ledger.append(v)`, §6). Wiring the calculus
   into `append()` now would add a hot-path branch with **no live caller** — exactly the
   "audience of zero" that Part 4 declined for the `graph.json` mirror, one level up.

3. **The effect set is pure data.** §2.4's requirement is that *code*, not a model, computes the
   effect set. That is satisfied by `lib/rewrite.mjs` being the code — regardless of whether it is
   called from inside `append()` or from the frontier loop a line before `append()`. "Inside the
   append path" describes *where the no-model boundary sits in the finished 3.0*, not *which part
   lays the wire*.

**Decision: Part 5 builds `lib/rewrite.mjs` as a pure, importable calculus library — a total
function from `(verdict, graphState)` to a two-phase effect set — fully tested against synthetic
fixtures and validated with `effects.mjs`'s own `validateEffects`. It makes no change to
`lib/ledger.mjs`, adds no event type, and does no I/O. The append-path wiring, the 3.0-verdict
event type that avoids the 2.x collision, and the effects-overlay fold live in Part 7**, which is
the part that first has a real verdict to append and a real graph to apply it to.

**Flagged as contestable (this is the pivotal call):** a reviewer who reads "inside the append
path" as binding *on Part 5 specifically* would wire it now — introducing the new 3.0-verdict event
type here, and branching `append()` on it. Not taken, because (1) makes that branch actively wrong
against live 2.x data until the new event type also exists, and (2)/(3) make it unconsumed until
Part 7. If this call is reversed, the plan grows a `lib/ledger.mjs` task and an event-type task, and
the "pure, no-I/O" framing of every task below changes. **Confirm this before the plan is written.**

## Decision 1 — File layout: one new pure file, `lib/rewrite.mjs`, grown across triads; no CLI

`lib/rewrite.mjs` is a pure library — no CLI, no `append()`, no disk. It mirrors `lib/atom.mjs`'s
and `lib/graph.mjs`'s own top-to-bottom organization, but here the whole file is pure, so the
sections are grouped by *machinery cohesion* rather than pure-then-I/O:

1. **Vocabulary + the router** — `VERDICT_KINDS`, the R-code↔kind map, the `RULES` registry, and
   `computeVerdictEffects(verdict, state)` (the total dispatcher, unknown kind ⇒ HALT).
2. **Shared helpers** — blast-radius closure, dependent-cone reverse-reachability, SCC over `needs`,
   effect-builder shims — all reusing `graph.mjs`/`atom.mjs`/`effects.mjs` exports (Decision 8).
3. **The verdict rules** — one function per R-code, each registered into `RULES`.
4. **The ceremony-escalation effect + its unwind** (Decision 7).

The file grows across three triads exactly as `lib/graph.mjs` grew across T01b/T02b: each triad
owns a **disjoint, appended section**, and — crucially — later triads register their rules by
*assignment into the shared `RULES` object* (`RULES['dead-end'] = …`), never by editing the router
or a prior section's literal. So the router is written once and "grows" as kinds register, with no
merge conflict and no edit above any triad's marker (the same "append below the marker, don't edit
above" convention `shared/conventions.md` already pins). This is a runtime-selection registry — the
verdict kind is the selector — which is exactly the bar for introducing a dispatch table rather than
a fixed `switch` (the router must remain extensible across three tasks).

**No CLI.** Nothing runs the calculus from a shell — its only caller is Part 7's frontier loop,
in-process. A CLI here would be speculative surface, the same restraint Parts 1/3/4 exercised.

## Decision 2 — The verdict shape and the total router

§7 pins `verdict = { type, evidence, payload }`. This design uses `kind` for the discriminant (to
match the ledger's existing `verdict.kind` field and `atom.mjs`/`graph.mjs`'s string-enum style)
and names the nine kinds:

```
VERDICT_KINDS = ['checkpoint','dead-end','ripple','oversized','unknown-blocking',
                 'cycle-detected','parity-breach','illegible','stale-spec']
//   R1           R2          R3       R4          R5                 R6
//   R7              R8          R9
```

`computeVerdictEffects(verdict, state)` is the single entry point Part 7 will call. It is **total**
(§7.2 Totality): it looks the kind up in `RULES` with `Object.hasOwn` (the same prototype-safe
lookup `ledger.mjs`'s `validateEvent` uses), and an **unknown or unregistered kind returns
`{ok:false, error}`** — a HALT, fail-closed inside an effort, never a silent empty effect set. A
recognized kind returns `{ok:true, provisional:[…], permanent:[…], ceremony?:{…}, route?:…}` — the
two-phase envelope (Decision 4). Every effect in `provisional`/`permanent` is a valid `effects.mjs`
node or edge effect, so the whole result passes `validateEffects` by construction (asserted in
tests).

**Why a result envelope here, when `graph.mjs`'s pure functions return bare values:** the router's
HALT-on-unknown is a real control-flow outcome Part 7 must branch on (§7.2), so `{ok,error}` is the
honest shape — the same reason `atom.mjs`'s I/O functions return `{ok,…}` while its pure predicates
return bare booleans. The per-rule functions *below* the router return bare `{provisional,permanent}`
objects (they are only ever reached for a known kind); the envelope lives at the router boundary.

## Decision 3 — The `graphState` input shape: pinned now, supplied by Part 7 later

Every rule is a pure function of the verdict and a **read-only snapshot of the current graph**. Part
5 pins that snapshot's shape; Part 7 supplies a real instance (from `graph.mjs`'s `deriveCurrent`)
and Part 6 supplies the band data:

```
state = {
  atoms,   // Array of folded atom records (graph.mjs / atom.mjs shape: {id, component,
           //   deltaClauses, state, flags, …}) — the current graph's nodes
  edges,   // Array of dependency edges {from, to, edge, op} — deriveCurrent's output
  citationGraph, // {component: [cited components]} — deriveCurrent's live graph, for closures
  bands,   // { [coneId]: bandIndex } — the complexity band per cone (Part 6 data; a synthetic
           //   fixture today). Consulted ONLY by the ceremony-escalation rule.
  bandScale,     // ordered Array of band names, low→high (Part 6 vocabulary; a synthetic fixture
           //   today). The monotone-up ratchet indexes into this — Part 5 invents no band names.
  priorVerdicts, // optional Array of prior verdict kinds already recorded against an atom —
           //   only the R1 "second independent exhaustion auto-promotes toward R2" rule reads it.
}
```

This is the direct analogue of Part 4's Decision 7 (`serves`/`informs` took explicit parameter
shapes with nothing real to fill them yet): the *rule* is locked and tested against hand-built
`state` fixtures now; *supplying* a live `state` is a later part's job. `bands`/`bandScale` are the
one genuinely Part-6-shaped field — see Decision 7 and the flagged gaps.

## Decision 4 — Two-phase effects: `{provisional, permanent}`, computed here, applied by Part 7

§7.2 pins two phases: **provisional** effects (reversible graph-state changes) land at verdict time;
**permanent** effects (retirement permanence, ratified births, tree reshapes, *any* shared-branch
mutation) land only at gate ratification. Every rule returns both arrays; a rule with no permanent
half (R1, R4, R9 — their §7 "Permanent effect (gate)" cell is "—") returns `permanent: []`.

**Part 5 computes both sets; Part 5 applies neither.** This keeps the file pure and honestly matches
§2.4's division of labor. Two consequences pinned here:

- **Born nodes are addressed by intent, not by id.** R4 sub-atoms, R5's spike node, and R6's
  placeholder are *new* nodes whose real id (`a-<seq>`) is minted only when the chartering event
  lands — which is an apply-time act Part 7 owns. So a birth is a node effect carrying a
  **charter-intent** in its `change` (`{charter: {component, premises, …}, lineage: …}`), addressed
  to a stable anchor (the parent atom's id, or a synthetic placeholder key the rule documents); Part
  7 realizes it by calling `atom.mjs`'s `charterAtom` and rewriting the intent's references to the
  minted id. Part 5 cannot mint ids — that needs a ledger seq — so it never pretends to.
- **The `change` sub-shapes are Part 5's to pin.** `effects.mjs` validates only that `change` is
  *some* JSON value ("its internal shape belongs to whichever future engine writes it"). That engine
  is `rewrite.mjs`, so this design pins the `change` vocabulary: `{state: <LIFECYCLE_STATE>}` (a
  transition — validated legal with `isValidTransition` before it is emitted), `{flag: <FLAG_NAME>,
  op: 'set'|'clear'}` (a flag move — the flag name a pinned literal), `{charter: {…}, lineage}` (a birth intent),
  `{reprice: {factor}}` (R1/R2 annotation), and `{band: <bandName>}` (ceremony escalation). A
  transition the lifecycle table forbids is a **programmer error in the caller's verdict**, and the
  rule returns a HALT rather than emitting an illegal `{state}` effect — parity with `atom.mjs`'s
  `transitionAtom`, which refuses an illegal move before it ever appends.

## Decision 5 — The nine rules: what is fully buildable today, and the two that carry flagged gaps

Every rule is buildable as a *rule* today (Part 4's precedent: build the computation, test it
against synthetic fixtures, even when live data to feed it is a later part's). Seven are fully
mechanical from Parts 1–4's surfaces; two (**R8**, and the ceremony half of any rule) reach for
Part 6 data and are built to the honest boundary with the gap named. Grounded rule-by-rule:

- **R1 `checkpoint`** — budget exhausted, no wall. Provisional: the in-flight atom re-enters for a
  fresh-context retry — a node effect `{state:'ready'}` (legal from `packed`/`tests-red`/`green`/
  `audited`, all in `LIFECYCLE_TRANSITIONS`) plus a `{reprice}` annotation. If `state.priorVerdicts`
  already records one `checkpoint` for this atom, the rule **auto-promotes toward R2** (§7's R1 row:
  "a second independent exhaustion auto-promotes") by returning the R2 effect set instead. Permanent:
  none. *Flagged gap:* the reprice **factor α is uncalibrated** (§16) — the rule carries `{reprice:
  {factor: 'α'}}` as a symbolic annotation, it does not compute a number. Naming α, not inventing a
  value, is the honest move.
- **R2 `dead-end`** — skeptic-confirmed infeasibility. Provisional: the atom → `retired-pending`
  (legal from every in-flight state); the **blast radius** = `citationClosureOver(state.citationGraph,
  [refutedPremise.component])` (§7: "widen-only citation closure of the refuted premise, recorded in
  the event"), reused verbatim from `graph.mjs`; every *other* atom whose footprint intersects the
  radius gets `{flag:'frozen'}` (the intersection test is `excludesEdges`' own footprint logic);
  siblings sharing citations get a `{reprice}` annotation. Permanent: `retired-pending` → `retired`,
  plus consumer-first amendment atoms emitted as **charter-intents with lineage to this gate**
  (Decision 4). Routing is the §7.1 ladder (Decision 6).
- **R3 `ripple`** — delta reaches foreign contracts. Provisional: the original atom is blocked
  (`{flag:'dispatch-barred'}`); each foreign clause becomes a charter-intent — **enrichment-typed
  dispatchable** (no bar), **amendment-typed `dispatch-barred`** (§7's free vs. gated directions),
  wired to an *existing* charter where the clause is already owned (no double-chartering — the rule
  checks `state.atoms` for an owner first). Permanent: amendment batch ratified ⇒ the bars clear
  (`{flag:'dispatch-barred', op:'clear'}`); enrichment atoms need no gate.
- **R4 `oversized`** — cohesion fires. Provisional: replace the atom with sub-atoms per the proposed
  partition (clause grouping), **validated against §4.3** — the rule calls `atom.mjs`'s
  `cohesionComponents(atom.deltaClauses, componentRoot)` and confirms the proposed partition does
  not split a computed cohesion component (a partition that cuts through one is a **rejected
  payload**, HALT). Sub-atoms are charter-intents that **inherit the parent's sanction and dispatch
  freely** (§7). Permanent: none.
- **R5 `unknown-blocking`** — a falsifiable question. Provisional: a spike node (charter-intent,
  `kind:'spike'`); `informs`-edges from the spike to each dependent (`{from:spikeId, to:atomId,
  edge:'informs', op:'add'}` — the exact shape `informsEdges` consumes); dependents leave the
  frontier (`{flag:'frozen'}`). Permanent: the spike verdict is consumed at the gate (knowledge →
  vision only through retro) — recorded as a permanent marker, no graph mutation.
- **R6 `cycle-detected`** — an SCC in `needs`, mechanical. The rule runs **Tarjan/Kosaraju SCC over
  the `needs` subset of `state.edges`** (a small, pure graph algorithm — no third-party import, a
  local helper) and, for a real cycle, emits a **quarantined-birth** placeholder (charter-intent
  that "dispatches nothing") and bars every SCC member (`{flag:'dispatch-barred'}`). Permanent: the
  birth ratified — component created (contract + thin implementation first), citations retargeted
  provider-first, ownership assigned — as charter-intents/edge effects.
- **R7 `parity-breach`** — an audit refutes a claim. Provisional splits on merge status (read from
  the atom's `state`): **unmerged** (`state ≠ 'merged'`) ⇒ revert lane-local to last green and
  **re-enter as R1** (the rule returns R1's effect set plus an adversary-escalation marker);
  **merged** ⇒ **freeze the dependent cone only** — reverse-reachability over `needs` from the
  breached atom, every dependent `{flag:'frozen'}` (a local cone-walk helper over `state.edges`).
  Permanent (merged case): remediation ratified — revert when no dependent merged on top, else
  charter forward-fix atoms (charter-intents). *This is the R7 unwind the ceremony effect's unwind is
  modeled on — built and tested here.*
- **R8 `illegible`** — a legibility invariant fires. Provisional: `genesis-R8` blocks the topology
  stage (a marker; the retry→human-recut loop is Part 6's stage); `live-R8` has no provisional
  effect, only batched retopology pressure (a marker). Permanent: regrouping applied **only if it
  reduces measured density** — and *measuring density is `lib/legibility.mjs`, Part 6, not built.*
  So the R8 rule emits the regrouping/re-cut **proposal effect shape** from a caller-supplied
  payload, and the density-reduction guard is left as an explicit Part-6 boundary. *Flagged gap:*
  R8 is real as a shape but cannot self-trigger or self-validate without Part 6's metric — the same
  honest half-state Part 4's `serves`/`informs` sat in (a locked rule with no live producer). Tested
  against a synthetic proposal payload.
- **R9 `stale-spec`** — mechanical, no judgment. Provisional: the spec'd atom → `ready` (legal),
  its delta marked stale (`{state:'ready', staleDelta:true}`), and the colliding pair serialized (an
  `excludes` edge effect). Permanent: none. Fully mechanical from `state`.

## Decision 6 — The §7.1 routing ladder: a pure classifier over the refuted premise

§7.1 mechanizes D2's escalation ladder as a function of *where the refuted clause lives*. Part 5
implements it as a pure `routeRefutedPremise(premise, state) → route` returning one of the five
routes, keying on the premise's shape (the same `goal:|gate:|cite:|ledger:` tagged-reference grammar
`atom.mjs`'s `PREMISE_RE`/`DEMANDED_BY_TAGS` already pins) and, where needed, the citation graph:

| Refuted clause lives in… | detected by | route |
|---|---|---|
| the atom's own delta | the clause id is one of the atom's own `deltaClauses` | `re-charter` (no ceremony) |
| one contract clause | a single foreign `component#cN` | `amendment` (atoms at next gate) |
| two contracts / a seam | ≥2 foreign components co-cited in one clause's closure | `topologist-recut` (next gate) |
| a goal clause | premise tag `goal:` | `goal-respec` (gate, human-visible) |
| an intention citation | premise tag `cite:` into the intention layer | `intent-fork` (**always human, both modes**) |

The `intent-fork` route is a *classification outcome*, not an action — Part 5 returns it; the gate
(Part 7, both modes) is where "always human" is honored (§7.2, §9). R2's rule attaches this route to
its result; the calculus never resolves an intent fork itself.

*Flagged, minor:* the "two contracts / a seam" detection is the one ladder rung that needs judgment
about what counts as "jointly" — this design draws it mechanically (≥2 distinct foreign components
inside the refuted clause's own citation closure), which is a defensible under-approximation (a
single-component refutation never mis-routes to a re-cut), and names it so a reviewer can tighten it.

## Decision 7 — The ceremony-escalation effect and its unwind (the design's flagged open edge)

The roadmap hands Part 5 the ceremony-escalation effect *and* explicitly makes it the owner of the
**unwind**: "its permanent-raise rejection must unwind exactly as R7's provisional cone freeze does;
P5 is where that unwind gets built and tested, not just asserted." DESIGN-3.0's own draft-five open
edges (c) says the same: §7 *asserts* the R7-shaped unwind but has *not* been adversarially tested
on it. So this is the part of Part 5 that most needs teeth.

**`ceremonyEscalation(verdict, state) → effect | null`** — a pure rule. It fires only on the four
triggers §7 names (a wide R2 whose blast radius exceeds what the cone's band assumed; a
foreign-reaching R3; an integration-exposing R9; a second R1), each of which is derivable from the
verdict + `state` already computed by the rule above it. On a fire, it returns a **provisional**
node effect `{nodeId: coneId, change: {band: nextBandUp}}` where `nextBandUp` is the next entry in
`state.bandScale` above the cone's current `state.bands[coneId]` — **monotone up, capped at the top
band** (never lowers, never wraps; §7 "ratchets up only", mirroring the tier one-way ratchet). The
same fire also **arms** the deeper checks the higher band implies (deeper audit tier, a re-armed
scaffold/legibility check, a tightened gate cadence), recorded as armed-check markers in the effect.
The *permanent* band change ratifies at the gate.

**`unwindCeremonyEscalation(escalationEffect) → inverseEffects`** — the teeth. Because the deeper
checks were only ever **armed, never disarming anything** (arming adds obligations; it removes no
guard), a rejected permanent raise unwinds by pure subtraction: clear the provisional `{band}`
raise and clear every armed-check marker, restoring the cone to *exactly* its pre-escalation state —
the identical shape as R7's merged-case cone-freeze unwind (freeze added, freeze cleared, nothing
else touched). The invariant the tests **must** pin (this is the open edge): **apply-then-unwind is
identity** — for any escalation effect `e`, folding `e` then `unwindCeremonyEscalation(e)` over a
band map leaves it bit-for-bit as it started, with no residual armed check and no half-raised band.
A rejected raise that left *any* residue would be a silent ratchet the human never approved, exactly
the failure §3's policy anti-attack and the tier one-way ratchet exist to prevent.

*Flagged gap:* `state.bands`/`state.bandScale` are **Part 6 data** — the band vocabulary, the
input thresholds that decide "wider than the band assumed," and the band→cadence indices are all
uncalibrated (§16, and draft-five open edge (a)). Part 5 implements only the **mechanism**: given an
ordered scale and a current band and a trigger, ratchet up one step and unwind cleanly. It invents
no band names and computes no thresholds — the trigger predicates read *structural* facts already in
`state` (blast-radius width, foreign-reach count), and the "exceeds the band's assumption"
comparison is against a caller-supplied per-band bound, not a magic number baked in here.

## Decision 8 — Reuse Parts 1/3/4's pure surfaces; duplicate nothing (DRY + Law 1 parity)

Every graph/atom computation R1–R9 need already exists as a pure, exported function. Part 5 imports
them rather than reimplementing:

- `graph.mjs`: `citationClosureOver` (R2 blast radius, R3 foreign reach), `needsEdges` /
  the `needs` subset of `state.edges` (R6 SCC, R7 cone), `excludesEdges`' footprint-intersection
  logic (R2 freeze set, R9 collision) — reused, not re-derived.
- `atom.mjs`: `cohesionComponents` (R4 partition validation) and `isValidTransition` (every `{state}`
  effect is checked legal **at emit time** — an illegal transition is a caller error that must HALT,
  §7.2). Flag names and edge kinds are emitted as **string literals** from the pinned sets, exactly as
  the shipped `lib/graph.mjs` emits its literal edge kinds — the library does not import
  `FLAG_NAMES`/`EDGE_NAMES` to re-check a literal it wrote itself; a mistyped one is a bug the tests
  catch, not a runtime branch.
- `effects.mjs`: **not a library import.** Its `validateEffects` is used by the *tests* to assert
  every rule's output is well-shaped; the library emits the shapes directly (as `graph.mjs` does).

The one place Part 5 writes a genuinely new algorithm is **SCC detection** (R6) and the
**dependent-cone reverse-walk** (R7) — neither exists in the shipped code, both are small pure
graph routines with no third-party dependency (Law 1: `lib/` stays dependency-free). Where Part 5's
need is the *same* semantics as an existing private helper (e.g. `graph.mjs`'s `lociOverlap`), it
imports the exported public surface and, only if the needed helper is private and unexported, mirrors
it locally with a comment — the exact judgment Parts 3/4 already made for `footprint.mjs`'s private
`prefix`/`lociOverlap`. **This design does not touch `lib/graph.mjs` or `lib/atom.mjs` to export
anything new** — every function R1–R9 need is *already* a public export (verified above). If, during
implementation, a needed helper turns out to be private, the fallback is a local mirror (Part 4's
Decision 6 fork-vs-export tradeoff, resolved toward *local mirror* here since Part 5 adds no other
reason to touch those landed files).

## No new ledger event types, no `EVENT_SCHEMAS` change, no I/O

Part 5 neither reads nor writes a ledger. `lib/ledger.mjs`, `lib/atom.mjs`, `lib/graph.mjs`,
`lib/effects.mjs` are all **untouched** — Part 5 only *imports* their pure exports. No new event
`type`, no `EVENT_SCHEMAS` entry (the 3.0-verdict event type is Part 7's, per the central scoping
decision). The effect sets Part 5 computes are the same shapes `effects.mjs` already validates and
`ledger.mjs` already accepts on any event's `effects` field — so when Part 7 does append a verdict
carrying these effects, no validation change is needed; the shape was always accepted.

## Version bump: NONE — Part 5 lands on the shared refactoring line

Per the roadmap's **2026-07-09 versioning decision** (roadmap §"Versioning — the remaining parts do
not bump"), P5–P8 are one continuous refactoring toward the live 3.0 methodology with no consumable
intermediate builds, so **the plugin version stays `3.2.0`** and bumps exactly once, at the very end
of the generation. Part 5 lands its code + tests **without a `chore(release)` bump** —
`.claude-plugin/plugin.json`, the README install snippet, and the README footer all stay `3.2.0`.
This **overrides `CLAUDE.md`'s standing "every change gets a version bump" rule for P5** (the
override the roadmap spells out explicitly), and it is why this part's plan carries **no
`version-bump-final-check` task**, unlike Parts 1–4. The roadmap status cell moves to **`Landed —
merged (no bump, 3.2.0)`** when the code + tests merge — not to a versioned "Landed — vX.Y.Z".

## Task/wave shape (indicative — the actual plan pins the real breakdown)

Three triads (the file grows across them via the appended-section + `RULES`-registry convention),
then docs, then a final check with **no version bump**:

- **T01** (triad) — vocabulary, the `RULES` registry + total router (unknown ⇒ HALT), the two-phase
  envelope, the `graphState` shape, the §7.1 routing-ladder classifier, and the three pure
  state-transition verdicts **R1 / R4 / R9** (no graph reachability needed — transitions, cohesion
  validation, stale-mark). Tested against hand-built `state` fixtures + `validateEffects`.
- **T02** (triad) — the structural-rewrite verdicts **R2 / R3 / R5 / R6 / R7**: blast-radius freeze,
  foreign-reach chartering, spike + `informs`, SCC quarantined birth, and the parity-breach cone
  freeze (incl. the unmerged→R1 path). The SCC and cone-walk helpers live here. Appended below T01's
  marker; registers its kinds into `RULES`.
- **T03** (triad) — the **ceremony-escalation effect and `unwindCeremonyEscalation`** (the flagged
  open edge, with the apply-then-unwind = identity invariant as its headline test) plus the
  **R8** legibility-shape rule (gap-flagged). Appended below T02's marker.
- **T04** (direct) — docs: supersede `docs/artifacts.md`'s two "future work / Part 5" scope notes
  (Effects section; atom-lifecycle section) with a new "rewrite engine" subsection; add
  `docs/glossary.md` terms (**Failure calculus**, **Verdict (R1–R9)**, **Provisional / permanent
  effect**, **Ceremony-escalation effect**, **Blast radius**, **Routing ladder**) plus the flagged
  gaps named explicitly (band calibration, legibility metric, α).
- **T05** (direct) — final check: run the whole suite; **no version bump**; move the roadmap P5
  status cell to `Landed — merged (no bump, 3.2.0)`.

## Self-review

- No placeholders/TBDs above — every decision has a concrete shape, including the flagged gaps
  (α uncalibrated, R8's Part-6 density metric, the Part-6 band vocabulary/thresholds) and the one
  **pivotal** contestable call (Part 5 = pure calculus library; append-path wiring deferred to
  Part 7), which is foregrounded as the first decision because the plan's whole shape hinges on it.
- Grounding checked against shipped code, not prose: the 2.x `verdict`-collision fact (read in
  `EVENT_SCHEMAS`), every lifecycle transition an effect asserts (read in `LIFECYCLE_TRANSITIONS`),
  every reused function (`citationClosureOver`, `cohesionComponents`, `isValidTransition`,
  `EDGE_NAMES`, `validateEffects`) confirmed present and exported.
- Scope check: stays inside "compute the two-phase effect set for an already-typed, already-audited
  verdict, purely." No verdict *typing* or payload authoring (model judgment), no *applying* an
  effect (Part 7), no band storage / legibility metric (Part 6), no append-path wiring or 3.0-verdict
  event type (Part 7) — matching the roadmap's file list and this doc's "explicitly out of scope."
- Totality check: the router binds every one of the nine kinds and HALTs on any other (§7.2), and
  every rule returns a `{provisional, permanent}` pair (`permanent: []` where §7's cell is "—").
- Open-edge check: the ceremony-escalation unwind — DESIGN-3.0's own untested assertion — is given a
  named, testable invariant (apply-then-unwind = identity, no residue) and its own triad, not folded
  in as an afterthought.
