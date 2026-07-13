# Reasonable 3.0 — Design Document

> **Status: DRAFT, for ratification.** This document designs the 3.0 generation of the methodology.
> It does **not** amend `DESIGN.md` (2.x) — section numbers there stay stable (they are cited from
> `lib/` and `hooks/`), and this document cites them as `D2 §…`. Until ratification, the shipped
> plugin remains 2.x; nothing in this file has normative force yet.
>
> This is the **fifth draft**. Three independent adversarial critics attacked the first three
> drafts (round 1: 4 fatal / 9 major / 6 minor; round 2: 2 fatal / 4 major / 3 minor plus 4
> disposition regressions; round 3: 2 fatal / 4 major / 6 minor, no regressions); draft four
> repaired round three. §15 records all three rounds and every disposition. **Draft five adds the
> *pay-as-you-go ceremony* amendment** — the ceremony dial (§5.4, §7, §9), the sizing classifier
> (§3), and the zero-commit scout (§17), folded into the parts still unbuilt (P5–P8) so 3.0 does
> not ship a fixed-gear entry and re-open it later. **Neither draft four nor the draft-five
> amendment has yet faced an independent attack** — the ceremony-dial and scout rulings are the
> youngest material here, and a ratifier should know that.

## 0. Summary

Reasonable 3.0 replaces the ratified linear route of vertical slices with a **development graph**:
one derived structure holding all planned work. Work shrinks to **atoms** — one component's
contract delta, driven to audited green and landed as **one `--no-ff` merge** (role-atomic commits
on the lane per D2's iron rule; squash prohibited). An atom is born at genesis as a **charter**
(component, premises, purpose — structure only); its **delta** (the actual clauses) is authored at
spec time, from everything development has taught by then — and **grows from implementation in
flight** through a sanctioned, mechanically re-checked enrichment channel, so the 2.x
behavior-additive law survives at the mechanism level, not just in prose. Waves pack on **actual**
footprints, after deltas exist — spec first, pack second, dispatch third.

Every failed attempt ends in a **typed verdict** that binds to exactly one **rewrite rule**:
judgment supplies the verdict's payload and is adversarially audited; code applies the structural
change. Rewrites have two phases — provisional effects (freezes, blocks, dispatch bars) land at
verdict time and are reversible; permanent effects (retirement, ratified births, tree reshapes,
shared-branch mutations) land only when a gate ratifies them. **The ledger is self-sufficient**:
the rewrite engine, running inside the ledger controller's append path (no model in the loop),
records every event's full effect set — nodes, states, containment, edge deltas — so the graph
*as lived* at any moment replays from the ledger alone. `.reasonable/` stays gitignored exactly as
2.x rules. The same fold that recovers after a crash renders the graph live for a human watching
progress in real time.

Two orthogonal structures share one set of nodes. The **containment tree** (effort → subefforts →
… → atoms, single-parent) is the drill-down and progress axis. The **dependency graph**
(`needs`/`excludes`/`serves`/`informs`) is the restructure axis. A **legibility law** bounds both
the children per containment node and the lifted-edge density between siblings at every level, so
every view a human must ratify stays readable by construction — a hairball is a planning verdict,
not a rendering problem.

The vertical slice survives as a degenerate case: the cone of one goal under a risk-first priority
policy. The 2.x ban on layer-first traversal becomes pricing under a ratified policy — and because
that demotes a written law to data, **policy changes are vision-class: human-ratified in both
modes, always**. The frontier loop runs as workflow runs that **end at gates with typed results**
(the D4 discipline); the main session fires every gate. The Three Laws, contract grammar core,
parity, fences, budgets, worktrees, the lane-per-work-unit accounting, the scaffold phase, and the
human control plane survive unchanged; the escalation ladder survives as the routing function of
the failure calculus.

**Ceremony is a dial, not a constant.** The protocol's cost scales to the work: an effort is
*sized* at genesis from t0-observable risk — blast radius, suite coverage, criticality, supervision
posture, horizon — and *grows its own ceremony from feedback*, the same failure calculus that
restructures the graph ratcheting a cone's audit, scaffold, and gate depth up when a verdict
discovers risk genesis under-read. A phase whose measured input is empty is a proven no-op, not a
waived guard; machinery is provisioned lazily, per wave, never all-at-once; and a pre-effort
**scout** gives shape-discovery a zero-commit home. This is the swiss-army-knife discipline (§5.4,
§7, §17): one protocol, blades unfolded only as the work earns them — reduction always by quantity
and timing, never by kind.

## 1. Why 3.0

Four pressures, one direction:

1. **The topology ruling.** An adversarial analysis of the 2.x architecture (2026-07-08) settled
   that the component/contract/ripple model is a **directed citation graph, DAG-normed** — not a
   tree — while containment, progress, and dispatch are trees *by design*. It also separated two
   structures 2.x conflates: **decision authority** (the escalation ladder — a linear order over
   arbiters) and **change propagation** (citation reachability — graph-shaped). 3.0 gives each its
   own mechanism.
2. **Work orders are too coarse.** A 2.x work order bundles several clauses and a locus; when it
   fails, the whole bundle's budget is spent, and the response is a judgment ceremony (escalation,
   re-spec, re-planning) rather than a computation. Restructure cost scales with work-order size.
3. **The schedule is a prediction pretending to be a structure.** `route.json` is a ratified
   linear order — a topo-sort *output* stored as an *input* (D2 §5.11 already rules "the DAG is
   computed, not declared"; 3.0 applies the same ruling to the plan itself).
4. **Roadmap convergence.** Four open problems (`dead-end-blast-radius`, `commit-granularity`,
   `intra-slice-provider-merge`, `cross-vertical-slice-parallelism`) independently push toward
   finer work units, premise-level failure records, and merge points at unit-green. §14 absorbs
   them.

The goal, stated once: **dynamic development — work orders as small as possible, and every failed
attempt producing a deterministic restructure of the development graph.**

## 2. The two structures

One set of nodes, two orthogonal structures over it.

### 2.1 The containment tree (drill-down, progress)

The effort root splits into **subefforts**, recursively, until leaves — which are atoms (§4).
Single-parent, arbitrary depth. A `button` subeffort holds a `processing` subeffort and a
`db-operations` subeffort; each splits further until atomic nodes. This generalizes the 2.x
execution/progress tree (D19): the tree stops mirroring only the run lifecycle and becomes the
plan's own hierarchy.

**Ruling — deterministic containment assignment.** An atom's parent is *derived*: its component,
through the ratified component→subeffort ownership map (part of genesis, §5). Extraction births
get their assignment in the rewrite payload. Rewrites therefore never orphan a node: a split
atom's children stay under the same parent; ripple-materialized atoms land in the subeffort owning
their component.

**Ruling — who reshapes what, in two phases.** The failure calculus (§7) rewrites the *dependency
graph*, and its **provisional** effects (freezes, blocks, dispatch bars, pending-states) apply at
verdict time. Everything **permanent or tree-shaping** — retirement permanence, ratified births,
grouping strata, goal re-cuts, shared-branch mutations — applies only when its gate ratifies it
(§7.2). Failures restructure dependencies immediately but reversibly; only ratified judgment
restructures anything permanent, including how a human reads the effort.

### 2.2 The dependency graph (restructure)

Edges live between atoms, cross containment boundaries freely, and are **computed by the fold —
from deltas, citations, and recorded rewrite events — never hand-stored or hand-repaired**:

| Edge | Meaning | Computed from |
|---|---|---|
| `needs` | readiness: A cannot start before B lands | citation closure over contract deltas — A's delta cites clause ids B introduces |
| `excludes` | conflict: A and B cannot run concurrently (serializes, never orders) | footprint intersection (locus ∪ citation closure ∪ resource claims) at the **contract level**, exactly as 2.x `footprint.mjs` — conservative by construction; same-contract atoms always serialize |
| `serves` | A advances goal G's cone | reverse-reachability from G's scenario contract citations |
| `informs` | spike S gates A's feasibility | the spike-insert rewrite event (§7, R5) |

**Two fidelities, each with pinned semantics.** Before an atom's delta exists (§4.1), its edges
are **planned**: (a) the component-level quotient — atom A *planned-needs* every atom of component
B iff A's component declares a dependency on B in the ratified topology — plus (b) the
topologist's **intra-component ordering**, ratified charter data (an explicit partial order over
one component's charters, part of genesis). Planned edges order the frontier and feed the
legibility checks — they are *priority* data. Once the delta is authored at spec time, edges
refine to **actual** — clause-level citations — and **only actual edges govern packing,
footprints, dispatch, and merges** (§6). Refinement is a recorded event; a refinement that
collides with in-flight or landed work is a verdict (R9, §7), not a surprise.

### 2.3 Edge lifting (the bridge)

At any drill level, a view shows one subeffort's children plus the **induced edges** between them:
a dependency between two atoms deep in different subtrees lifts to an edge between their ancestors
at the viewed level. A deterministic quotient — computed per view, never stored. This is what
makes structure *visible*: at the top, `button → processing → db` as three boxes with clean
arrows; drill into any box and see the same picture one level down. A hairy bundle of lifted edges
between two subefforts, at any altitude, is the coupling smell of §5.2 rendered on screen.

### 2.4 Derivation and the determinism claim

`.reasonable/` is **gitignored by design** in 2.x — orchestration churn never entangles the
codebase history it governs — and 3.0 does not change that. Therefore replay may not lean on git
for historical `.reasonable/` state, and the design doesn't:

**Ruling — the ledger is self-sufficient, and code writes the effects.** Every rewrite and
lifecycle event records its full **effect set** — node entries and edge entries (§8 pins both
shapes) — **computed by `lib/rewrite.mjs` inside the ledger controller's append path**, the same
no-model-in-the-loop position that stamps `seq` (D19: validates, stamps, appends, regenerates
mirrors). No agent authors an effect set; the proposing agent authors only the verdict payload,
which the trio audits. Verdicts from a wave serialize at append, so apply order is total and
recorded. Apply-time edge computation reads the **effort root's canonical state** (contracts and
atom specs as last merged), never a lane's in-flight divergence — lane-local contract changes
enter the canonical state only at the atom's merge, which is itself an event. Two projections
follow:

- **The as-lived graph** at any seq = fold of recorded effects up to that seq. **Same ledger ⇒
  same as-lived graph**, no external state consulted. This is what crash recovery replays and what
  a visualizer scrubs.
- **The current graph** = the replayed structure + edges re-derived fresh from today's canonical
  contract tree and atom specs (§2.2 fidelities). A pure function of (ledger, current disk state).

Divergence between as-lived edges and fresh-derived edges is **computed and surfaced** as
retopology pressure at the next gate — never silently absorbed.

`graph.json` (and the progress projection) are **derived, rebuildable mirrors** in the
`progress.json` class: regenerated on ledger append by the **ledger controller** (D19), never
authoritative, never hand-edited, pinned as `*` entries in `artifacts.md`. Nobody edits the graph;
everybody replays it.

## 3. Goals and the priority policy

- **`goals.json`** replaces `route.json`'s role as the ratified planning object: the set of
  top-level scenario contracts (the parked suite — the vision's executable core, unchanged from
  D2 §5.5), each with its scenario test. Goal amendments stay human-gated, always.
- **`policy.json`** is the ratified priority policy: weights over integration-risk retirement,
  expected information gain, unlocks-count, goal proximity, staleness pressure, and cost — plus
  the pinned thresholds the legibility law and gate cadence use (§5.2, §9), **and the
  ceremony-sizing dials** (below).

**Ruling — policy carries the ceremony-sizing dials.** Beyond priority weights, `policy.json` pins
the **complexity classifier**: the t0-observable inputs it reads (blast-radius bound, whether a
trusted suite already covers the locus, correctness-criticality of the domain, supervision posture,
and horizon *judged under a minimal driver*) and the **complexity bands** they map to — each band
carrying its phase-materialization cutoffs (§5.4), its default audit tier, and its gate-cadence
indices (§9). These dials are what let ceremony graduate with the work instead of sitting fixed at
entry (§17). Because they can *down-scope* ceremony, they are **vision-class exactly as the priority
weights are** — human-ratified in both modes, on the enforcement-paths list, unwritable by any agent
role — so a struggling autonomous run can never quietly size its own rigor down (the §3 anti-attack,
extended to the sizing knob). The failure calculus may only ever ratchet a band *up* (§7).

**Ruling — the slice is a degenerate case.** A "vertical slice" is the `serves`-cone of one goal
under a risk-first policy — a computed view, not a scheduling unit. Horizontal passes (a
cross-cutting invariant goal) and hybrids are equally expressible. The D2 §5.2 *ban* on BFS and
post-order traversal becomes *pricing*: under the default policy they are dominated strategies.
The walking skeleton keeps its primacy operationally: the end-to-end goal's cone carries priority
∞ until green (edges before nodes, as D2 §5.1).

**Ruling — the policy is vision-class.** Demoting a written ban to data creates a new attack: a
struggling autonomous run "ratifying" itself a layer-first policy. Therefore **changes to
`policy.json` and `goals.json` are human-gated in both modes, always** — exactly like vision
amendments — and both files join the enforcement-paths list (D2 §5.14D): no agent role may write
them; the fence denies it by capability, not prose. When an autonomous run's only path forward
requires such a change, the run returns a typed gate result (§6/§9) — it never waits silently and
never proceeds.

**Ruling — parallelism still spends feedback.** Atoms serving the same goal fan out freely,
footprint-gated (D2 §5.11 Ruling 3's *intra*-decision aggression). Opening a second goal-cone
while one is in flight is opt-in and policy-gated — the cone-concurrency term defaults to 1.

## 4. The atom

The 3.0 work order — but in two parts born at two different times, because predicting structure is
cheap and predicting behavior is the disease (D2 §5.4).

### 4.1 Charter, delta, and in-flight enrichment

- **The charter** (genesis-time, structural): the atom's component, its **premises** (stable
  clause references — §4.2 — into the intention, a goal, or a contract), a one-line purpose
  (non-normative prose), a coarse locus, and its place in the topologist's ratified
  intra-component ordering (§2.2). This is all the topologist authors at genesis. No clause text.
  **No behavioral musts enter the plan from the vision, ever** — the 2.x law, untouched.
- **The delta** (spec-time): the *initial* delta is authored when the atom enters `spec'd` — from
  the accumulated canonical contract state, the goal's scenario, and everything landed by then.
  Each clause carries a **`demanded-by` provenance** (§4.2). The delta is translated by the
  blind-test-writer, implemented to green, audited. Once spec'd, planned edges refine to actual
  (§2.2), the cohesion check runs (§4.3), and the spec-time guard runs (§7.2) — all **before**
  implementation dispatch.
- **In-flight enrichment — the success path, first-class.** The 2.x pipeline's core feedback event
  is the implementer *learning* a new must from the code (D2 §5.6: the contract grows from
  implementation). 3.0 keeps that channel per atom: the implementer who learns a new must
  **enriches the atom's delta in flight** — an append-only, ledger-recorded `delta-enrichment`
  event (weakening stays an amendment ceremony, as always). Each enrichment mechanically re-runs,
  before the atom may claim green: **cohesion** (§4.3 — R4 may split the addition off),
  **footprint** (a grown closure that now collides with in-flight work is R9 — the atom
  re-serializes), and **the spec-time guard** (§7.2 checkpoint 2). The addition routes through
  blind-test translation like any clause. Learning that exceeds the atom's component is R3;
  learning that *refutes* a premise is R2. Silently satisfying an unnamed case remains the parity
  violation it is in 2.x (D2 §5.9 Ruling 1) — the difference is that the honest move now exists
  and is cheap.

**Lifecycle — the complete machine, pinned.** States:
`chartered → ready → spec'd → packed → in-flight (tests-red → green → audited) → merged`
(terminal) and `retired` (terminal, reached via `retired-pending`). `failed(verdict)` is a
transit, never a terminus: every failure routes by its rule (R1, R9 → `ready`; R2 →
`retired-pending`; R7 unmerged → `ready`). Three orthogonal **flags** — `frozen` (R2/R7),
`guard-halted` (§7.2 checkpoint 2), `dispatch-barred` (§7 R3, unratified amendment births) — are
flags, not states; each is set provisionally and cleared by rule or at a gate, and the frontier
filter excludes any flagged atom. Transitions and flag-sets marked provisional land at verdict
time; `retired-pending → retired`, flag *clears* tied to ratification, and every merge land at
gates or under gate-ratified conditions. Pipeline stages are lifecycle states inside the atom, not
graph nodes — parity holds at every commit, and the discriminator stays runnable per atom. **The
merge condition is `audited`, not `green`** (§6). **Landing shape:** one **`--no-ff` merge** per
atom; on the lane, role-atomic commits per D2's iron rule (the blind-test-writer's manifest commit,
the implementer's D3a commits) — **squash is prohibited**, exactly as the `commit-granularity`
roadmap rules.

### 4.2 Identity, clause ids, provenance, lineage

- **Atom identity is allocated, not content-derived.** The scribe assigns a stable id at creation
  (`a-0042`); it survives delta authoring, enrichment, re-wording, and rebasing. Every rewrite
  that replaces or splits an atom records **lineage** (parent id → child ids) in its event, so
  attempt evidence, retirement records, and history survive restructure — and lineage is what the
  blast-radius exemption (§7.2) and dispatch-bar clearing (§7) key on.
- **Clause identity is stable, never reused, and allocated under the append lock.** 3.0 contracts
  carry durable per-contract clause ids (`lexer#c12`); positional `§N` addressing retires.
  **Allocation is a ledger event**, serialized by the ledger controller's existing append lock —
  the front-matter registry is a derived mirror, so two concurrent spec runs can never mint the
  same id. Spec runs are **serial per contract, parallel across contracts** (pinned); with
  `excludes` at contract level (§2.2) this also means no two atoms enrich one contract file
  concurrently. Citations attach **per clause**. All breaking grammar changes, listed in §12 with
  their parser (invariant 3).
- **`demanded-by` provenance names any citable demander**: a goal-scenario assertion, a gate, a
  **consuming clause or atom citation** (the normal case for provider enrichments — the demander
  is the consumer that needed the capability), or a **chartering rewrite event** (ledger ref — the
  R2/R3 event that created the atom). The reference format is part of the §12 grammar
  precondition, not an open question: two mechanisms (§4.3 cohesion, the anti-padding audit) are
  load-bearing on it.

### 4.3 The minimality law

**Ruling — splittability is cohesion, over relations that actually exist.** (Draft one borrowed
wave-packing's footprint relation — vacuous inside one contract; draft two used intra-delta
citations — a relation the grammar has never contained. Both are recorded in §15; this is the
corrected definition.) Build the delta's **clause-cohesion graph**: clauses are nodes; two clauses
**cohere** iff any of:

- (a) they cite a **common provider clause** (per-clause citations, §4.2);
- (b) they share a **`demanded-by`** provenance (§4.2) — the same scenario assertion, the same
  consuming citation, or the same chartering event demanded both;
- (c) their declared loci overlap below the component root.

A delta whose cohesion graph is **disconnected must split** — one atom per connected component
(R4; lineage recorded). All three relations are data the spec-time atom already carries — (b)'s
widened vocabulary (§4.2) is what keeps a provider enrichment chartered by one ripple, or one
gate, a *single* atom rather than confetti. The check runs at spec time and after every in-flight
enrichment.

**Anti-padding, both bounds judged.** Cohesion edges are audit-checked: a claimed shared citation,
provenance, or locus overlap the auditor cannot ground in the artifact is a parity finding — the
same proportionality review (D2 §5.9) that guards the lower bound (`serves ≠ ∅` mechanically,
plus small-delta/large-diff suspicion) also grounds the upper: a delta held together by decorative
cohesion is ruled oversized at audit and split by R4.

Cost is treated honestly in §10.

## 5. The topology stage (heart № 2)

**Position:** analysis grills the goals → **topology stage** → **scaffold** → the frontier loop
(§6). The scaffold survives as a phase with its 2.x duties intact: the scaffolder **authors the
parked scenario suite** (the executable tests `goals.json` presumes — per-atom blind tests never
produce these), drives the skeleton cone real, and the skeleton invariants are verified read-only;
**the scaffold sign-off is the first goal gate**. The topology stage's output is the **genesis
graph**, and it ends at a ratification gate: the human approves the topology the way they ratify
the route today.

### 5.1 The topologist

The route-planner reborn. Takes the grilled goals, the intention, and (brownfield) the census
skeleton, and produces:

1. **Component topology** — derived subtractively from the vision, exactly as D2 §5.4 rules.
2. **The full initial chartering** — every atom's charter (never its delta), covering the ratified
   goals, including the intra-component ordering (§2.2).
3. **The containment tree** — the subeffort hierarchy and the component→subeffort ownership map.
4. **The priority policy proposal** (ratified by the human, §3).
5. **The complexity classification** — per effort and per subeffort, the t0-observable sizing
   (§5.4) that sets how much of the pipeline materializes. Cheap and mechanical, ratified with the
   policy; it predicts *how much ceremony*, never *what behavior*.

**Why deep upfront chartering is not the disease.** 2.x keeps the route thin because plans rot and
re-planning is an expensive judgment ceremony. 3.0 charters carry *structure only* — the thing
D2 §5.4 already says is cheap to predict — while every behavioral decision waits for spec time.
And because charters are data and edges are derived, re-planning is a fold, not a ceremony: the
genesis chartering is a first draft the system is designed to mangle, not a commitment.

After genesis the topologist remains the calculus's judgment organ: it supplies rewrite
**payloads** on demand (split partitions, extraction concepts, spike questions, regroupings) and
proposes **re-chartering batches** at gates when accumulated amendments make regions of the graph
stale. Both ride the mechanical `retopologize` operation: re-derive all edges, flag atoms with
dead premises for retirement, re-validate minimality and legibility.

### 5.2 The legibility law

**Ruling — legibility is a property of the topology, not the renderer.** A 300-node hairball is a
textbook example of bad planning; the planner must be structurally unable to ship one. The genesis
graph must satisfy mechanically checked invariants, and a violation is a planning-time verdict
(R8) resolved before implementation starts:

1. **Bounded width.** No containment node may have more than **B** children (B pinned in
   `policy.json`, default ≈ 25).
2. **Bounded tangle.** The **lifted-edge density between any two siblings, at any level**, may not
   exceed the pinned threshold. This is the load-bearing half: B alone is gameable by inserting
   empty grouping strata, so **an R8 regrouping payload is valid only if it *reduces* measured
   cross-group density** — the rule rejects a regrouping that merely restores B while leaving the
   felt of arrows intact. A view of 25 boxes is only readable if the arrows between them are few.
   At genesis these invariants are measured over **planned** edges at the component quotient — the
   fidelity the data actually has (§2.2) — and re-measured over actual edges as they refine.
3. **Coupling smells.** Cross-cone density above threshold means the goals are not independent —
   re-cut them or extract the shared provider now. Heavy fan-in on a component at genesis, before
   history has earned it, is a god-component warning. Both generalize D2 §5.10's "a cycle is a
   topology smell" to planning time.
4. **Chain smells.** A `needs`-chain longer than K signals over-serialization — usually false
   coupling a better cut dissolves.

R8 runs in two contexts with different teeth (§7): **genesis-R8** blocks the topology stage, with
bounded retries — after N rejected regroupings (N pinned in `policy.json`) it escalates to the
human as a re-cut fork (a genuinely coupled domain is a human decision, not a spin loop); the
stage's ratification gate is downstream of it in both modes. **Live-R8** (invariants breached by
refinement mid-effort) has no provisional effect — it lands as batched retopology pressure at the
next gate; in-flight atoms are untouched.

### 5.3 The ratification surface

- The gate summary embeds the **bounded views** as plain diagrams (mermaid-scale, because the law
  bounds both nodes and edges) — a terminal-only or PR-review ratification never needs more.
- The stage also emits **`topology.html`** — a self-contained viewer generated by `lib/` (layered
  layout over the DAG: longest-path ranks, barycenter ordering; inline SVG + vanilla JS; no CDN,
  no npm). Three views: component topology, per-goal cone, and — at every later retopology gate —
  the **diff view** (added / retired / rewired, color-coded against the last ratified graph). The
  human reviews deltas, never re-reviews the world.
- `topology.html` is a derived, disposable view of the graph — regenerated, never edited, never
  parsed back.

### 5.4 Graduated ceremony — sizing and phase degeneration

The 2.x protocol pays a fixed entry cost — grill, walking-skeleton scaffold, per-slice trio —
whatever the work's size; the tier axis thins only *audit depth*, never the pipeline itself. 3.0
makes that cost a function of the genesis graph the topologist actually produced, so a small change
is cheap *by construction* rather than by a shortcut a hook could be talked out of.

**Ruling — ceremony materializes against measured input, never against the category label.** The
classifier's job is to *size*, not to *decide behavior*; two mechanisms carry the sizing:

- **Sizing (genesis).** The classifier reads the t0-observable, loss-setting variables — blast
  radius (citation-closure width of the touched clauses), whether a *trusted* suite already covers
  the locus, correctness-criticality of the domain, the run's supervision posture (present-human vs
  autonomous), and the horizon *under a minimal driver* (so the protocol can never qualify itself
  by inflating its own footprint) — and emits a per-node **complexity band**, written to the
  `policy.json` dials (§3). The band sets phase-materialization cutoffs; it never waives a guard.
- **Phase degeneration.** A phase whose **measured input is empty is a no-op, not a skipped step.**
  The scaffold's parked-suite authorship has nothing to author when the genesis graph introduces no
  new top-level scenario; the walking skeleton already stands when the effort lives wholly inside an
  already-skeletonized cone; a re-chartering batch is empty when no amendment has accumulated. Each
  is gated on a mechanical predicate over the genesis graph — *does this introduce a new goal-cone
  or touch the outer shell?* — and the degeneration is **recorded as a ledger event like any
  other**, so a reviewer sees a phase that ran-and-found-nothing, never a phase silently cut.
- **The line — reduce by quantity and timing, never by kind.** Off the dial entirely, at full
  strength whenever their input is *non-empty*: the categorical fences, the blind-test membrane, the
  discriminator, the floor-touch trip-wire, parity, and the coherence-grill and walking skeleton.
  This generalizes the 2.x tier rule (under-rigor is the disease) from an audit-depth knob to the
  whole protocol. A single-atom effort is cheap because most phases are *provably* empty — not
  because any check was turned off.

Genesis sizing is only a first estimate; the failure calculus corrects it upward from lived
evidence (the ceremony-escalation effect, §7), and the whole dial is stated once as a principle in
§17.

## 6. The frontier loop

Replaces the vertical-slice-execution phase. **Spec first, pack second, dispatch third** — the 2.x
persist-spec → footprint → group order (the thin-planner architecture), kept. And the loop has an
execution home, pinned: **one workflow run ends AT the next gate** (the D4 discipline —
architecture: a background run never blocks on a human; gates live in the main session):

```
run:                                       # one workflow run — ends at the next gate
  loop:
    frontier  = ready(graph)               # planned edges; minus frozen / guard-halted / barred
    spec(top(argmax_policy(frontier)))     # deltas authored or re-spec'd; serial per contract,
                                           # parallel across contracts; R4 + checkpoint-2 run HERE
    wave      = pack(spec'd_atoms)         # maximal subset, disjoint by ACTUAL footprints
    dispatch(wave)                         # per atom: blind tests, impl (+ in-flight enrichment),
                                           # adjudication, audit
    verdicts  = collect()
    for v in verdicts: ledger.append(v)    # controller stamps seq; rewrite.mjs records effects
    merge(audited)                         # one --no-ff merge per atom, topological order by
                                           # actual needs-edges among the wave's audited atoms
    if gate_due(events): return GATE(kind) # typed union, exhaustive:
                                           #   goal-green | heartbeat | batch-full | starved
                                           #   | blocked-human | halt | budget-exhausted
```

The **main session fires every gate**: gated mode blocks for the human; autonomous mode
self-ratifies and logs — except the always-human classes (policy/goal changes §3, intent forks
§7.1), which return `blocked-human` in both modes. After the gate, the main session relaunches the
run. One orchestration path, deterministic, exactly as 2.x's runner returns its typed GATE_RESULT.

- **Packing happens only on actual footprints.** Charter-coarse loci never justify concurrency;
  they only order the spec queue. Disjointness is proven from spec'd deltas before any two atoms
  run concurrently — so a merge conflict between packed lanes remains what 2.x made it: **evidence
  of a footprint bug** (D2 §5.11 R2). A spec'd delta whose closure collides with in-flight or
  newly-landed work is an **R9 verdict** (§7), not a surprise.
- **Merge fires at `audited`**, never at `green`. The per-atom audit is the shallow tier
  (discriminator + bidirectional mapping); the **goal gate umbrellas the joint cone** with the
  deep tier (mutation sampling, proportionality) before the goal is declared green — D2 §5.10
  Ruling 3's umbrella, relocated from slice to goal, not deleted. An audited atom whose provider
  is still unaudited simply waits — merge order is the topological order of actual `needs` edges,
  and `excludes` already serialized same-contract work.
- **Post-merge refutation has a defined unwind** (R7): the dependent cone freezes provisionally at
  verdict time; the remediation — revert when no dependent merged on top, forward-fix corrective
  atoms otherwise — is **gate-ratified** (a shared-branch mutation is never a provisional act).
- **Lane = atom, exactly as 2.x has lane = work order.** The lane/journal/ledger accounting keeps
  its one-lane-one-work-unit bijection (descriptors, custody, `validateLaneBases`) untouched.
  **Amortization is provisioning-level only**: a warm worktree may be *reused* across waves for
  same-component atoms — teardown and re-provision between atoms, fresh branch per atom cut from
  the last merged tip — one dependency install serving several atoms without ever putting two
  atoms on one lane branch. A spec'd-but-undispatched atom whose base moved re-enters spec (R9's
  re-spec fold-in) rather than rebasing a stale delta.
- **Provisioning is lazy and role-minimal (the micro-effort path).** A wave stands up only the
  roles its atoms actually need. A single-atom, single-component effort runs the implementer, the
  blind-test-writer, the per-atom auditor, and the fences — and nothing else: the census and
  characterizer (brownfield only), the topologist's re-chartering (only when amendments have
  accumulated), and the retro-synthesizer's cross-cone classification (only at a goal gate spanning
  >1 landed cone) are dispatched **only when their input is non-empty** — the same phase-degeneration
  predicate as §5.4, applied to role dispatch. The lane/journal/ledger accounting is **unchanged**
  (lane = atom); what defers is its *infrastructure* — one lane needs no cross-lane custody
  machinery until a second lane exists, so it is stood up on first need, not at entry. This is DRY
  provisioning, not a second pipeline: same roles, same fences, dispatched against real input.

## 7. The failure calculus (heart № 1)

Every attempt ends in a typed verdict:

```
verdict = { type, evidence, payload }
```

**Judgment produces the type and payload; the adversarial trio audits them; the rewrite engine
applies the structural change** (inside the controller's append path, §2.4). What the change *is*
(which nodes and edges appear, freeze, reprice, retire) is code; what it *contains* (a split
boundary, a spike question, an extraction concept) is audited judgment. The in-flight
`delta-enrichment` event (§4.1) is the calculus's success-path counterpart: not a verdict, but an
event whose mechanical re-checks can *trigger* R4 or R9.

| # | Verdict | Payload (judged, audited) | Provisional effect (verdict time) | Permanent effect (gate) |
|---|---|---|---|---|
| R1 | `checkpoint` — budget exhausted, no wall claimed | progress hypothesis | annotate with attempt evidence; reprice (cost × α); re-enter frontier for fresh-context retry; a second independent exhaustion auto-promotes toward R2 (D2 §5.9 R4) | — |
| R2 | `dead-end` — skeptic-confirmed infeasibility | the refuted **premise** (clause ref, any layer) | atom → `retired-pending`, out of frontier; blast radius = **widen-only** citation closure of the refuted premise, recorded in the event (radius born **live**); intersecting atoms freeze; siblings sharing citations reprice | retirement stamped permanent; consumer-first amendment atoms chartered **with lineage to this gate** (exempt-with-injection at the guard, §7.2); **un-retire exists**: a ratified verdict-expiry act (D2 §5.8) |
| R3 | `ripple` — delta reaches foreign contracts | manifest: (contract, clause, enrich\|amend) | original atom blocks; foreign atoms chartered and wired to **existing** charters where the clauses are already owned (no double-chartering) — **enrichment-typed atoms are dispatchable** (the free direction); **amendment-typed atoms are `dispatch-barred`** | the amendment batch ratified → bars clear, the ratchet ceremony honored (D2 §5.6); enrichment atoms need no gate |
| R4 | `oversized` — cohesion check fires at spec time / after enrichment, or the audit refutes claimed cohesion | proposed partition (clause grouping) | replace atom with sub-atoms (lineage recorded; **they inherit the parent's sanction and dispatch freely** — the work was already in the ratified plan); **the rule validates the payload** against the §4.3 cohesion relation | — |
| R5 | `unknown-blocking` | the falsifiable question | spike node inserted; `informs`-edges; dependents leave the frontier | spike verdict consumed at gate (knowledge → vision only through retro, D2 §5.7) |
| R6 | `cycle-detected` — SCC in `needs`, mechanical | the named shared concept | SCC members block on a **provisional, quarantined birth** — a placeholder node that dispatches nothing | the birth ratified: component created (contract + thin implementation first, D2 §5.10 R4), citations retargeted provider-first, ownership assigned |
| R7 | `parity-breach` — an audit refutes a claim | breach evidence | if unmerged: revert lane-local to last green, re-enter as R1 with adversary escalation. If merged: **freeze the dependent cone** (only) | merged-case remediation ratified: revert when no dependent merged on top, else charter forward-fix atoms |
| R8 | `illegible` — a legibility invariant fires | regrouping / re-cut proposal | **genesis-R8**: blocks the topology stage (bounded retries → human re-cut fork, §5.2). **live-R8**: no provisional effect; batched retopology pressure | regrouping applied only if it reduces measured density (§5.2); containment reshapes are gate-only by §2.1 |
| R9 | `stale-spec` — a spec'd delta's actual closure collides with in-flight or newly-landed work, or its base moved (mechanical, at refine/repack/enrichment) | — (no judgment) | the atom leaves `spec'd` → back to `ready`, delta marked stale; the colliding pair serializes; re-spec at the next spec stage folds in what landed | — |

**Ruling — a verdict can ratchet ceremony up, never down (the ceremony-escalation effect).**
Genesis *sizes* an effort from what it could predict (§5.4); the calculus *corrects* that estimate
from what development discovers. Alongside its structural payload, a verdict may carry a
**ceremony-escalation effect** on the affected cone — a first-class effect (§8) the rewrite engine
computes and records like any other, never a fresh human prediction. Its triggers are the
calculus's own discoveries: an **R2** whose widen-only blast radius returns wider than the cone's
band assumed; an **R3** reaching foreign contracts a low band never anticipated; an **R9** whose
collision exposes real cross-boundary integration; a **second R1** exhaustion (the auto-promotion
the R1 row already names). Each may **raise** the cone's complexity band (§5.4), and a raised band
deepens its audit tier (full over lite), **re-arms a scaffold or legibility check the low band had
found vacuous**, and tightens its gate cadence (§9). The escalation is **monotone and two-phase
like every other effect**: the deeper checks arm *provisionally* at verdict time; the *permanent*
band change ratifies at the gate — and a permanent raise the gate rejects unwinds exactly as R7's
provisional cone freeze does, since the deeper checks were only ever armed, never disarming
anything. It ratchets **up only** — no verdict, and no agent, ever lowers a band, mirroring the
tier one-way ratchet (D2) and the policy anti-attack (§3). This is *start light, deepen on
evidence* made mechanical: under-sizing is self-correcting and cheap, and the graph's own feedback
— not a human's re-prediction — pays for the correction.

### 7.1 Routing — the escalation ladder, restored as a function

Premises are clause references into **any layer**, and R2's routing is a function of where the
refuted clause lives — D2 §5.8's ladder, mechanized:

| Refuted clause lives in… | Route |
|---|---|
| the atom's own delta (mis-spec'd) | re-charter and re-spec — no ceremony |
| one contract clause | ratchet weakening: amendment atoms at the next gate |
| two contracts jointly / a seam | topologist re-cut proposal at the next gate |
| a goal clause | goal respec — gate, human-visible |
| an intention citation | **intent fork — always human, both modes** (the roadmap's rule, kept: no agent may resolve it) |

### 7.2 Invariants of the calculus

- **Totality.** Every verdict type binds exactly one rule; an unknown type is a HALT (fail closed
  inside an effort).
- **Two-phase effects, one rule for births.** Provisional effects are reversible graph-state
  changes and land at verdict time; permanent effects — retirement permanence, ratified births,
  tree reshapes, **any mutation of the shared branch** — land only at ratification (§2.1). Atom
  births are provisional and **dispatch-barred until a gate**, with two pinned exceptions:
  enrichment-ripple atoms (R3, the free direction) and R4 sub-atoms (lineage inherits the parent's
  sanction) dispatch freely. In autonomous mode the gate self-ratifies and logs, never blocks —
  but the phase boundary and its ledger record exist identically in both modes.
- **Replayability, exactly as claimed in §2.4.** Events carry code-computed effect sets (including
  edge deltas); replay folds recorded effects; same ledger ⇒ same as-lived graph. Fresh derivation
  is a separate projection whose divergence from as-lived is surfaced, never absorbed.
- **Monotone evidence.** Rewrites never delete evidence; retirement is a marker with lineage;
  freezes only widen within one rewrite. The un-retire path (R2) is a new ratified event, not an
  erasure.
- **The insanity guard runs twice, and blast radii have a lifetime.** Declared premises route;
  they do not guard. **Checkpoint 1 (scheduling, coarse, widen-only):** charter locus ∪ declared
  premise citations vs live blast radii — premises may *widen* the guard's reach, never narrow it;
  a hit deprioritizes and flags. **Checkpoint 2 (spec time and after every enrichment,
  fence-class):** the delta's citation closure is checked against every **live** blast radius
  before implementation dispatch; an intersection **HALTs the atom** and injects the dead-end
  record — a hard block in the 2.x redispatch-guard class. **Radius lifecycle, pinned:** a radius
  is **live** from its R2 verdict until the amendment batch that consumes it **lands** (the
  consumer-first chain merged), then **archived**. One exemption while live: atoms whose lineage
  records the consuming R2 gate as their chartering event — the remediation atoms themselves —
  **proceed with the dead-end record injected** (proceed-informed, the roadmap's own mechanism);
  without it the guard would deadlock the crater's only exit. An archived radius stops blocking
  but keeps injecting advisorily: successors under new ids citing the amended inputs proceed
  informed, and the record stays queryable forever (monotone evidence). Under-declaring premises
  buys nothing: the crater is detected from what the atom *touches*, before the implementation
  budget is spent.

Even a plain retry is a rewrite (R1: evidence + repricing) — the graph never silently absorbs a
failure. That is the design's answer to "each failed attempt results in a deterministic
restructure": each one does, including the smallest.

## 8. Progress and the live view

**Ruling — the event grammar is a machine-parsed artifact** (a `*` entry in `artifacts.md`).
Every atom lifecycle transition and every rewrite is one ledger event:

```
{ seq, nodeId, eventType, payload,
  effects: [ { nodeId, change } | { from, to, edge, op } ],
  timestamp }
```

- **`effects` is first-class and code-computed** (§2.4): node entries (`{nodeId, change}`) and
  edge entries (`{from, to, edge, op}`) are both pinned shapes; multi-node effects (an R2 freezing
  a whole neighborhood) enumerate one addressed entry each — the entry count is bounded by the
  frontier size, and a wide event is a wide event: correctness over cosmetics.
- **Events address nodes by id only.** Containment is itself event-sourced: reshapes (R6 births,
  R8 strata, re-chartering) are containment events, and a node's path is a **fold-derived
  property**, not an event field. Consumers get stable ids plus a replayable path history — a
  visualizer renders a reshape as a rename, never as teleportation, and the progress fold
  aggregates by id so nothing double-counts across a reshape.
- **`seq` is controller-stamped** (D19; as in 2.x) — fold order never depends on file line order.
- **Progress is a fold up the containment tree**: atom lifecycle states, cost-weighted per
  subeffort, roots up to the headline number. Deterministic, derived, replayable — the same fold
  reconcile uses.
- **The live visualizer needs no new machinery**: it tails the ledger and applies incrementally
  the fold recovery applies in batch. Scrubbing replays **recorded effects** (§2.4) — the as-lived
  graph — and never needs historical disk state that no longer exists.

## 9. Gates and the human control plane

Retro stops being a per-slice heartbeat and becomes **event-triggered — with a floor, a starvation
valve, and a batch discipline**, because unbounded cadence fails in both directions. Every gate is
fired by the **main session** on a typed run result (§6); a background run never blocks on a
human.

**Two event classes, explicitly:**

- **Immediate-fire** (the run returns; the gate fires now): a goal goes green (the deep umbrella
  audit runs here, §6); an intent fork (always human); a needed policy/goal change (always human);
  the inbox-load tripwire; and **frontier starvation** — the frontier is empty or below quorum
  (quorum pinned in `policy.json`, default 1) while gate-held material (frozen atoms, pending
  permanence, barred births, blocked always-human items) exists. Starvation is the liveness
  valve: a wide provisional freeze can empty the frontier, and a progress-denominated floor would
  then never tick — so starvation itself fires the gate. Gate-held material of *every* class is
  processed at *any* fired gate, so a starvation gate ratifies the pending permanence and clears
  the freezes that caused it.
- **Batched** (accumulate to the next fired gate, whatever fires it): amendment proposals,
  dead-end permanence, extraction ratifications, retopology diffs. Pinned thresholds
  (`policy.json`) force a heartbeat gate when a batch grows past its bound.

**Ruling — the heartbeat floor.** A gate fires at least every N merged atoms or M ledger events
(N, M pinned in `policy.json`). Together with the starvation valve this covers both failure
directions: long quiet stretches still produce gates, and blocked stretches cannot postpone them.
The 2.x guarantee — the system always stops at a gate — survives.

**Ruling — the floor scales with the complexity band (§5.4).** N and M are **band-indexed** in
`policy.json`: a high-band cone (wide blast, correctness-critical, or autonomous) gates more often;
a low-band micro-effort gates rarely, so a one-atom change is not dragged through a retro cadence it
has no material for. A ceremony-escalation (§7) that raises a cone's band tightens its cadence from
that point on. The scaling only ever moves the *floor*; it never disables the two backstops — the
starvation valve and the always-human classes (§3, §7.1) fire regardless of band.

**The retro's full duty roster, re-homed** (nothing silently dropped): the three-way divergence
classification (D2 §5.5) runs at goal gates and heartbeat gates; trust-staleness consumption at
every gate; budget tuning and the **supervision dial** at heartbeat gates — the dial survives and
now gates *wave boundaries* (strict = a nod per wave, not per atom); intent-check-failure
recording at any gate (D18, unchanged); the approval inbox as in 2.x. The scaffold sign-off is the
first goal gate (§5).

The mode axis (gated | autonomous) and tier axis (full | lite) are unchanged in meaning:
autonomous self-ratifies and logs, skips nothing; lite trims the deep-tier audit sampling at goal
gates, waives no guard. **Exceptions pinned above stand in both modes:** policy and goal changes
(§3) and intent forks (§7.1) are always human — the run returns `blocked-human` for them in both
modes.

**Ruling — a gate's human confirmation is a ledger fact, never a prose fact.** Whatever ratifies a
gate — an explicit gated-mode approval, autonomous self-ratification, a `blocked-human` class
resolving — the ONLY valid record of it is the `ratification` ledger event (or, in gated mode
before that event lands, the approval-inbox item it resolves): an append-only fact carrying an
immutable `seq`, never edited, never deleted, never restated. No plan, spec, route, or other prose
document may claim to record, quote, reconstruct, or paraphrase what a human said to clear a gate —
a prose document may at most **cite** the ledger seq (`see ratification seq 42`) as a pointer to
where the actual fact lives, never assert its content itself. This closes a real failure mode a live
session hit while building this very part: an orchestrator edited a plan file's own text to try to
document a human's confirmation, mislabeled a paraphrase as "verbatim," and — worse — later deleted
that correction once caught, rather than leaving it visible. An append-only ledger event structurally
cannot be edited, quietly fixed, and then deleted; a markdown file always can. §9's gate mechanism
only earns the trust it asks for if whatever records a confirmation is exactly as tamper-evident as
the ledger itself — which is precisely why gate confirmations belong in the ledger and nowhere else.

## 10. The economics, priced honestly

Atom granularity multiplies *per-unit fixed costs* — lane provisioning, the trio's agent
dispatches, discriminator worktrees, merges, ledger folds. The honest accounting:

- **The cohesion law keeps coherent work whole.** §4.3 splits only deltas whose clause groups
  share no provider, no demander, and no locus — genuinely unrelated work. Clauses demanded by one
  scenario assertion, one consuming citation, or one chartering event stay one atom; an
  afternoon's cohesive change is one pipeline, not confetti.
- **Spec-then-pack keeps counts sane.** Atom counts and wave shapes settle on actual spec'd data,
  not charter guesses; R9 serializes collisions instead of spending them as merge conflicts. Spec
  is judgment (an LLM turn per atom) and throttles wave width — serial per contract, parallel
  across contracts — which is acceptable because cross-contract is where real parallelism lives
  anyway (`excludes` serializes same-contract work regardless).
- **Lanes amortize at the provisioning level** (§6): one warm worktree and one dependency install
  serve several same-component atoms across waves — without touching the lane=atom accounting.
- **Audits are two-tier** (§6): shallow per atom, deep per goal-cone. The expensive checks run
  once per goal, as they effectively did per slice in 2.x.
- **Prerequisite, stated with its true owner:** 3.0's granularity is affordable only if mechanical
  steps run as code, not as LLM turns. That is the `mechanical-step-executor` roadmap problem, and
  its real fix is **an engine capability outside this repo** (the plugin cannot build it alone).
  3.0 therefore names its **degraded mode**: until the primitive lands, the policy defaults atom
  sizing coarser (charter granularity and cohesion thresholds tuned so atoms approximate 2.x
  work-order size) — fine granularity is a dial the economics unlock, not a promise the design
  breaks itself keeping.
- **Break-even framing:** 3.0 spends more per delivered clause in the steady state to make
  *failure* cheap — restructure is a fold instead of a ceremony, and blast radii are computed
  instead of discovered. The bet pays where failure rates are highest: early, integration-heavy,
  unknown-dense work — exactly where the methodology lives. Calibration (budget denominations, α,
  wave sizes, spec-queue depth, the degraded-mode dial) is an open question (§16) to be settled
  with ledger data, not asserted.

## 11. What survives from 2.x

| 2.x mechanism | 3.0 status |
|---|---|
| Three Laws; verification trio | unchanged — every rewrite is trio-shaped (worker proposes payload, adversary audits, code applies) |
| Contract grammar core; parity | parity unchanged; grammar gains clause ids, per-clause citations, `demanded-by` provenance (breaking, §12) |
| Behavior-additive law; the enrichment pipeline (D2 §5.4/§5.6) | **kept at the mechanism level**: charters at genesis, initial deltas at spec time, **in-flight delta enrichment** with mechanical re-checks (§4.1) |
| Trust-staleness | unchanged — topology-agnostic fold, keyed (component, clause id) |
| Fences, budgets, sanity invariants | unchanged; budgets denominate per atom; `policy.json`/`goals.json` join the enforcement paths; the spec-time guard is fence-class |
| Worktrees, merge-by-topology, conflicts-are-evidence | unchanged; disjointness proven pre-dispatch from actual footprints (§6); merges at atom-**audited**, one `--no-ff` merge per atom; goal-gate umbrella kept |
| The iron rule; role-atomic commits; no-squash | unchanged on the lane (§4.1) |
| Lane accounting (descriptors, custody, `validateLaneBases`) | **unchanged**: lane = atom, one merge per lane; warm-worktree reuse is provisioning-level only |
| `.reasonable/` gitignored | unchanged — replay is ledger-self-sufficient (§2.4), not git-dependent |
| Spikes, skeptic, dead-end evidence standard | unchanged; wired into R2/R5; verdict expiry powers un-retire |
| Walking skeleton; the scaffold phase | kept: scaffolder authors the parked suite, drives the ∞-cone real; sign-off = first goal gate (§5) |
| Blind-test-writer / adjudicator / auditor separation | unchanged, per atom |
| D19 progress tree; ledger controller | generalized into the containment tree; the controller stamps `seq`, hosts the rewrite engine, regenerates mirrors |
| Escalation ladder | kept as the routing function (§7.1); authority stays a linear human-topped ladder, propagation becomes rewrite rules |
| Supervision dial, approval inbox, inbox-load tripwire | kept (§9), dial gates wave boundaries |
| GATE_RESULT discipline (D4: runs end at gates, typed, never silent) | kept: the frontier loop's exhaustive typed union (§6); the main session fires every gate |

## 12. Breaking changes (why this is 3.0)

- `route.json` → `goals.json` + `policy.json`; `route.md` retires. The `nextAction` /
  `selfCheckDirectives` projection rebuilds over goals and cones (named deliverable).
- The vertical-slice-execution phase → the frontier loop; the vertical-slice-runner workflow →
  a frontier-wave workflow (spec stage → pack → dispatch; one run per gate interval, exhaustive
  typed result union, §6).
- **The atom pipeline shape**: initial-spec → blind-test → implement, with **in-flight
  delta-enrichment** re-entering blind-test translation (§4.1) — 2.x's implement-then-enrich
  order, preserved per clause rather than per work order. Named here because it changes the
  workflow stage order.
- Work-order spec → **atom spec** (charter + delta, §4); `verticalSlice` membership → containment
  (event-sourced).
- **Contract grammar:** durable clause ids, per-clause citations, per-clause `demanded-by`
  provenance (format pinned with the grammar), clause-id allocation as a ledger event; positional
  `§N` retires. Parser (`lib/contract.mjs`) changes with the shape (invariant 3).
- **`intention.md` becomes clause-addressed** (premises must cite it by id) — a breaking artifact
  change with its own grammar entry.
- The OUTCOME union → the verdict grammar with rule bindings (§7); **the 2.x ledger vocabulary
  remains readable forever** — the fold carries a compatibility layer for Family-1/2/3 events
  (named deliverable, not an afterthought).
- **The event grammar gains the first-class `effects` field** with pinned node and edge entry
  shapes (§8).
- New engine modules: `lib/graph.mjs` (fold + lifting), `lib/rewrite.mjs` (the rules, hosted in
  the controller's append path), `lib/frontier.mjs` (ready-set, spec queue, packing),
  `lib/legibility.mjs`; `reconcile.mjs` extends to replay rewrite effect sets. Lane accounting
  modules are **not** redesigned (§6).
- **Companion deltas to `glossary.md` and `artifacts.md` are a ratification precondition**: every
  new normative term (atom, charter, delta, delta-enrichment, verdict, rewrite, frontier, cone,
  stratum, premise, wave, cohesion, blast radius, legibility law, spec queue, starvation quorum,
  **complexity band, complexity classifier, ceremony-escalation, phase degeneration, scout**)
  and every machine-parsed shape (atom spec, goals.json, policy.json — **including its
  ceremony-sizing dials** — the event grammar) enters the normative vocabulary and the `*` registry
  before any engine work.
- **No in-place migration of live 2.x efforts** — and honestly scoped: a restart under 3.0 keeps
  contracts and ledger history (read through the compatibility fold), but re-runs analysis
  addenda (intention clause ids) and a full topology stage. This is a re-genesis, not a rename.
- **The 3.0 buildout ships as one release, not a train.** Parts P1–P4 landed as incremental library
  releases (`2.8.0` → `3.2.0`), but the remaining parts (P5–P8) land **without per-part version
  bumps**: the plugin stays at **`3.2.0`** through the rest of the refactoring — one continuous
  change with no consumable intermediate builds — and takes a **single terminal (major) bump** when
  the whole generation goes live. The authoritative policy and status rules live in the
  implementation roadmap's *Versioning* note.

## 13. What this deliberately does not change

Prediction discipline: behavioral musts enter only at spec-time authoring and in-flight
enrichment, informed by gates and the code itself, with per-clause provenance — never from the
vision, never at genesis. The vision stays human-gated. The membranes stay one-way: spike
quarantine, blind test writers, read-only adversaries. `.reasonable/` stays out of git. The
genesis predicts *structure only*, and even that prediction is built to be mangled cheaply.

## 14. Absorbed roadmap problems

- **`dead-end-blast-radius`** — R2 + §7.2's two-checkpoint guard implement its candidate fix:
  premise reified in the event grammar, widen-only closure, a **fence-class spec-time block** for
  live radii with the roadmap's own proceed-informed injection (remediation exemption + archived
  advisory), permanent id retirement (with the ratified un-retire path) superseding hash-unbind.
- **`commit-granularity`** — one `--no-ff` merge per atom over role-atomic AND-free lane commits,
  squash prohibited; `lib/atomic-commit.mjs` becomes the landing mechanism.
- **`intra-slice-provider-merge`** — resolved, not hand-waved: merges at atom-**audited** in
  topological order; the joint umbrella survives at the goal gate; post-merge refutation has the
  R7 unwind (provisional cone freeze; gate-ratified revert-or-forward-fix).
- **`cross-vertical-slice-parallelism`** — reframed as the cone-concurrency policy term
  (default 1); the multi-writer journal question remains open for concurrency > 1 (§16).
- **`mechanical-step-executor`** — promoted to **prerequisite**, with its external ownership and
  the degraded mode stated (§10).

## 15. Adversarial review record

Each draft was attacked by a fresh adversarial critic grounded in `DESIGN.md`,
`architecture.md`, `artifacts.md`, the roadmap, and `lib/`, instructed to kill the design and to
report only findings that survived its own refutation attempts.

### Round 1 (against draft one) — 4 fatal, 9 major, 6 minor; all accepted

| # | Severity | Finding (condensed) | Disposition |
|---|---|---|---|
| 1 | fatal | Genesis atomization = upfront behavioral speculation; contradicts the behavior-additive law it claimed to preserve | Charter (genesis) / delta (spec-time) split, §4.1; identity decoupled from delta content |
| 2 | fatal | Splittability check vacuous — every sub-delta shares the home contract under the borrowed footprint relation | Redefined (re-broken and re-fixed twice: R2-2, R3-5) — final form is the §4.3 cohesion relation over the §4.2 provenance vocabulary |
| 3 | fatal | "Same ledger ⇒ same graph" false — edges derive from mutable contract files outside the ledger | Restated (re-broken and re-fixed: R2-1) — final form is ledger self-sufficiency, §2.4 |
| 4 | fatal | Identity undefined: positional clause ids race for unlanded clauses; content-addressed atom ids churn under the calculus's own operations | Allocated atom ids + lineage events; durable never-reused clause ids (allocation serialized: R3-6), §4.2 |
| 5 | major | Merge at `green` precedes `audited`; umbrella deleted; no unwind for post-merge refutation | Merge condition = `audited`; goal-gate umbrella kept; R7 unwind defined, §6 |
| 6 | major | Insanity guard keyed on self-declared premises — under-declaration dodges it | Guard recomputed from closures (final form: two checkpoints + radius lifecycle, R2-4/R3-2), §7.2 |
| 7 | major | Autonomous mode can self-ratify a policy that legalizes the banned traversals | Policy/goals changes vision-class (human, both modes); files join enforcement paths, §3 |
| 8 | major | R6/R8 reshape the tree at verdict time; R2 retires permanently un-ratified | Two-phase rewrites: provisional at verdict, permanent at gate; un-retire path defined, §7/§7.2 |
| 9 | major | Retro duty roster orphaned; gate cadence unbounded both directions; supervision dial vanished | Duty roster re-homed; heartbeat floor; batch discipline; dial gates waves, §9 |
| 10 | major | Premises limited to intention/goal clauses — the ladder's gradations inexpressible | Premises = any citable clause; ladder restored as routing function incl. the always-human rung, §7.1 |
| 11 | major | Economics don't close: per-atom fixed costs multiply | §10 (final pillar set after R2-2/R3-12); mechanical-executor prerequisite + degraded mode; break-even framing |
| 12 | major | Migration understated: dual ledger grammar, intention clause-addressing, nextAction rebuild unscoped | §12 expanded; compatibility fold and projection rebuild named deliverables |
| 13 | major | `containmentPath` stored in events but reshaped by R8; `seq` dropped | Events id-addressed; containment event-sourced; paths fold-derived; `seq` restored, §8 |
| 14 | minor | `graph.json` simultaneously "never kept" and "machine truth", no writer or format entry | Derived rebuildable mirror (writer corrected in R2-9), §2.4 |
| 15 | minor | `informs` edge contradicts "recomputed from deltas + citations" | Restated: computed by the fold from deltas, citations, and recorded events, §2.2 |
| 16 | minor | B gamed by empty strata; edge density unbounded; cite typo | Sibling lifted-edge density invariant at every level; R8 payload must reduce density, §5.2 |
| 17 | minor | Proportionality guard satisfied by citation-padding | Paired with the auditor-side proportionality review, §4.3 |
| 18 | minor | §0 claimed a review that hadn't happened | Review records live in this section; each draft's header states its actual attack status |
| 19 | minor | New vocabulary and machine-parsed shapes unpinned (invariants 3, 6) | Companion glossary/artifacts deltas made a ratification precondition, §12 |

### Round 2 (against draft two) — regression: 15/19 held, 4 failed (#2, #3, #6, #11). Fresh: 2 fatal, 4 major, 3 minor; all accepted

| # | Severity | Finding (condensed) | Disposition |
|---|---|---|---|
| R2-1 | fatal | Determinism/scrubbing anchored on a git-versioned ledger + contract tree — the corpus **gitignores `.reasonable/` by design** | **Ledger made self-sufficient**: first-class `effects` recorded at apply time; as-lived vs current projections split; no git claim, §2.4/§8 |
| R2-2 | fatal | The connectivity relation (intra-delta citations) doesn't exist in the grammar — every multi-clause delta shreds to serialized confetti; one decorative citation defeats it | **Cohesion relation over data that exists** (§4.3) — provenance vocabulary later widened by R3-5 |
| R2-3 | major | Planned edges uncomputable at atom grain; the wave packed **before** deltas existed | Planned-edge semantics pinned; **loop reordered: spec → pack-on-actual → dispatch**; **R9** added, §2.2/§6/§7 |
| R2-4 | major | The computed insanity guard couldn't fire until after the money was spent | **Two checkpoints**: widen-only coarse at scheduling; **fence-class spec-time HALT**, §7.2 (radius lifecycle added by R3-2) |
| R2-5 | major | Gate liveness: fire-vs-batch self-contradiction; progress-denominated heartbeat starves under a wide freeze; no typed blocked return | Event classes split; **frontier-starvation gate** + typed returns (full union pinned by R3-3), §6/§9 |
| R2-6 | major | Lane amortization contradicted the wave definition and broke lane=work-unit accounting | **Lane = atom pinned**; amortization = warm-worktree reuse across waves, §6/§11 |
| R2-7 | minor | Event grammar couldn't carry effect sets; `nodeId` singular vs multi-node effects | `effects` promoted to a first-class pinned field, §8 (shapes pinned by R3-10) |
| R2-8 | minor | R7's merged-case revert sat in the provisional column | Moved to the permanent/gate column; "shared-branch mutation" added to the permanent-phase definition, §7/§7.2 |
| R2-9 | minor | `graph.json` writer misattributed (D3b scribe vs the D19 ledger controller) | Controller cited, §2.4 |

### Round 3 (against draft three) — regression: 9/9 held. Fresh: 2 fatal, 4 major, 6 minor; all accepted

| # | Severity | Finding (condensed) | Disposition |
|---|---|---|---|
| R3-1 | fatal | **Implementation-taught contract growth had no channel** — the 2.x enrichment pipeline's core step was silently inverted into spec-first; an implementer who learns a new must mid-atom had only bad exits (silent parity violation / fake dead-end / discarded knowledge) | **In-flight `delta-enrichment`**: append-only, ledger-recorded, re-runs cohesion + footprint + guard, routes through blind-test translation before green (§4.1); pipeline inversion named in §12 |
| R3-2 | fatal | **Blast radii had no lifetime** — the spec-time guard hard-blocked the dead end's own remediation atoms; crater permanently unworkable (or, read the other way, the guard died at the first heartbeat) | **Radius lifecycle pinned**: live from verdict → archived when the consuming amendment batch lands; remediation atoms (lineage = the R2 gate) proceed-with-injection; archived radii inject advisorily forever, §7.2 |
| R3-3 | major | The frontier loop had no execution home; gates fired inside a run that cannot block on a human; the typed union covered one gate class of five | **Run unit pinned: one workflow run ends AT the next gate**; exhaustive typed union (`goal-green \| heartbeat \| batch-full \| starved \| blocked-human \| halt \| budget-exhausted`); main session fires every gate (D4), §6/§9 |
| R3-4 | major | Node births had three inconsistent phase treatments (R2 gate / R3 verdict / R4 never); R3 amendment atoms could dispatch before their ceremony; R3's permanent column vacuous | **One birth rule**: births provisional + dispatch-barred until a gate, exceptions pinned (enrichment ripples, R4 sub-atoms via lineage sanction); amendment atoms `dispatch-barred` until batch ratified, §7/§7.2 |
| R3-5 | major | `demanded-by` couldn't express provider clauses (demanded by consumers) or calculus-chartered work — cohesion (b) inexpressible for exactly the deltas the calculus creates; R4 shreds provider enrichments | **Provenance vocabulary widened**: goal assertion, gate, consuming clause/atom citation, chartering rewrite event; format moved from §16 into the §12 grammar precondition, §4.2 |
| R3-6 | major | Spec-stage concurrency undefined; the clause-id registry was a shared mutable file two spec agents race on; `excludes` granularity unpinned | **Allocation is a ledger event** under the controller's append lock (registry = derived mirror); spec serial-per-contract / parallel-across-contracts; `excludes` pinned contract-level conservative, §4.2/§2.2 |
| R3-7 | minor | Lifecycle vocabulary incomplete (frozen/guard-halted/barred/retired-pending unmodeled; `failed` falsely terminal; §0 vs §4.1 spec-time inconsistency) | **Complete state machine pinned**: states + three orthogonal flags, provisional vs gate transitions marked; §0 corrected, §4.1 |
| R3-8 | minor | R8 declared plan-time-only while §5.2 re-measures mid-flight; genesis R8 loop unterminated | **R8 split**: genesis-R8 (blocking, bounded retries → human re-cut fork) vs live-R8 (batched pressure, no provisional effect), §5.2/§7 |
| R3-9 | minor | "One commit per atom" collided with D3a role-atomic commits and the roadmap's no-squash rule | Restated: **one `--no-ff` merge per atom** over role-atomic AND-free lane commits, squash prohibited, §0/§4.1/§14 |
| R3-10 | minor | `effects` author unnamed (model-authored replay truth would evade Law 1); edge deltas had no pinned shape; size unbounded | **`lib/rewrite.mjs` computes effects inside the controller's append path**; edge entry shape `{from, to, edge, op}` pinned; width bounded by frontier size and accepted, §2.4/§8 |
| R3-11 | minor | The scaffold was half-dissolved: parked-suite authorship, skeleton invariants, and the sign-off had no 3.0 home | **Scaffold kept as a phase** with its 2.x duties; sign-off = the first goal gate, §5/§9/§11 |
| R3-12 | minor | The economics' prerequisite is an external, unbuilt engine primitive with no fallback | External ownership stated; **degraded mode defined** (policy-coarsened atom sizing until the primitive lands), §10 |

### Draft five (amendment) — the ceremony dial — NOT YET ATTACKED

Draft five folds the *pay-as-you-go ceremony* findings into the parts still unbuilt at the time
(P5–P8), so 3.0 does not ship a fixed-gear entry and pay to re-open it later. **No independent
critic has attacked it.** It is recorded here as *pending*, not as *survived* — the honesty the
whole section exists to keep.

| Area | Change | Where |
|---|---|---|
| Graduated ceremony | ceremony materializes against measured input; sizing classifier at genesis; phase degeneration is a *proven-vacuous* no-op, never a waived guard | §5.4, §3 |
| Grow-on-evidence | the ceremony-escalation effect: a verdict may ratchet a cone's band **up** (monotone, two-phase), deepening audit / re-arming scaffold+legibility / tightening cadence | §7 |
| Lazy provisioning | role-minimal per-wave dispatch; ledger/lane *infrastructure* stood up on first need; lane = atom unchanged | §6 |
| Gate cadence | heartbeat floor **band-indexed**; escalation tightens it; the two backstops stay unconditional | §9 |
| Zero-commit scout | standalone pre-effort exploration, no `.reasonable/` state, seeds the genesis graph | §17, P8 |

**Open edges the next attack should aim at** (named, not hidden — the same discipline every prior
round used): (a) the sizing classifier's *inputs* are t0-observable, but its *thresholds* and
band → cutoff maps are **uncalibrated** (a sibling of §16's α / wave-size list); (b)
phase-degeneration's *"introduces a new goal-cone / touches the outer shell?"* predicate needs a
**precise mechanical definition** against the genesis graph, or it becomes a prose loophole exactly
where under-rigor is most tempting; (c) the ceremony-escalation effect's interaction with the
two-phase gate model — a provisional band raise whose *permanent* ratification the gate later
**rejects** — needs the same explicit unwind rigor R7 got, and §7 asserts the R7-shaped unwind but
has not been adversarially tested on it; (d) whether the scout's *seed* into the genesis graph can
smuggle behavioral prediction past the "structure only" law (§13) — the seed must be charter-shaped,
and nothing yet mechanically enforces that.

## 16. Open questions

- **Budget denomination** per atom class; the R1 repricing factor α; wave-size, spec-queue, and
  degraded-mode calibration — all to be settled with ledger data (§10).
- **Cone concurrency > 1** still requires the multi-writer journal design (roadmap problem
  stands).
- **Clause-id grammar details**: registry-mirror format, id allocation for amendment atoms,
  collision handling at spec time (the allocation event exists; its payload format is part of the
  §12 grammar work).
- **Event transport for the live view** — file-tail is the dependency-free default; anything
  richer stays optional.
- **Brownfield genesis** — how the census skeleton and characterized clauses seed the containment
  tree and charters (the ownership map exists; the chartering of *unknown* legacy behavior does
  not).
- **Ceremony-dial calibration** — the complexity classifier's input thresholds, the band →
  phase-materialization cutoffs, the band → gate-cadence indices, and a precise mechanical spec for
  the phase-degeneration predicate (*introduces a new goal-cone / touches the outer shell?*)
  (§5.4/§7/§9/§17) — all to be settled with ledger data alongside the denominations above, not
  asserted.

## 17. The ceremony dial and the scout (the adaptive on-ramp)

> Added in the **fifth draft**, folding the *pay-as-you-go ceremony* findings into the parts still
> unbuilt at the time (P5–P8) rather than shipping a fixed-gear entry into 3.0 and re-opening it
> later. **This material has not yet faced an independent adversarial attack** (§15) — the rulings
> here are the youngest in the document; a ratifier should weight them accordingly.

Everything above scales the *graph* to the work. This section names the single principle that
scales the *protocol* to the work, and adds the one surface the methodology still lacked: a
zero-commit place to explore before committing to an effort at all.

**Ruling — pay-as-you-go ceremony.** Ceremony is a monotone function of *measured* complexity, set
three ways and never trading rigor for lightness:

- **sized at genesis** from t0-observable risk (§5.4), written to the `policy.json` dials (§3);
- **grown in flight** by the failure calculus's ceremony-escalation effect — a verdict may ratchet a
  cone's band *up*, never down (§7);
- **materialized against real input** — an empty-input phase or role is a *proven* no-op, recorded
  like any event, not a waived guard (§5.4, §6).

Reduction is always by **quantity and timing, never by kind**: the fences, the blind-test membrane,
the discriminator, the floor trip-wire, parity, and the full-strength grill and walking skeleton on
non-empty input are all off the dial. This is the 2.x tier "low floor" generalized from an
audit-depth knob to the whole protocol — one tool whose blades unfold only as the work earns them,
which is what makes a framework and a one-line fix the *same* methodology at different sizes rather
than two philosophies.

**Ruling — the zero-commit scout (the pre-effort front-end).** Shape-discovery — *what is the right
decomposition / API / target?* — is the one regime the committed spine serves badly: today the only
exploration surface, the spike, is a *route item inside a committed effort* (D2), so a run must pay
analysis-entry before it can explore at all. 3.0 adds the **scout**: the spike-runner's quarantine
machinery (law-free workspace, code discarded, knowledge-only deliverable) launchable
**standalone, writing no `.reasonable/` state** — outside an effort the hooks already fail open
(D2), so a scout is law-free by construction, not by exemption. Its deliverable is a knowledge
artifact — a shape sketch, a feasibility verdict, a candidate decomposition. On convergence it
**seeds the genesis graph**: a draft charter set and goals sketch the topologist consumes, so
analysis starts warm instead of cold. The scout is the sanctioned home for the exploratory
front-end — it *precedes* the sizing classifier rather than being sized by it, and it hands off to
the spine the moment shape stabilizes (the same "explore light, commit when the shape is real"
handoff the brownfield census already supports from the other direction: reasonable can adopt code
the scout — or any external front-end — produced). The quarantine membrane is unchanged: scout code
never reaches mainline; re-entry is always **rewrite-from-knowledge, never refactor-from-scout**
(D2). It is a first-class capability, not a phase inside an effort, which is why it lands as its own
part (P8) rather than folding into P5–P7.
