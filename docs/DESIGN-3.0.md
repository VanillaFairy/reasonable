# Reasonable 3.0 — Design Document

> **Status: DRAFT, for ratification.** This document designs the 3.0 generation of the methodology.
> It does **not** amend `DESIGN.md` (2.x) — section numbers there stay stable (they are cited from
> `lib/` and `hooks/`), and this document cites them as `D2 §…`. Until ratification, the shipped
> plugin remains 2.x; nothing in this file has normative force yet.
>
> This is the **second draft**: the first was attacked by an adversarial critic grounded in the
> 2.x corpus, which produced 4 fatal, 9 major, and 6 minor findings. All were accepted in some
> form; §15 records each finding and what it changed. The summary below describes the design as
> hardened.

## 0. Summary

Reasonable 3.0 replaces the ratified linear route of vertical slices with a **development graph**:
one derived structure holding all planned work. Work shrinks to **atoms** — one component's
contract delta, driven to audited green in one commit. An atom is born at genesis as a **charter**
(component, premises, purpose — structure only); its **delta** (the actual clauses) is authored at
dispatch time, from everything development has taught by then — so behavior still enters only at
the moment of most knowledge, and the 2.x behavior-additive law survives intact.

Every failed attempt ends in a **typed verdict** that binds to exactly one **rewrite rule**:
judgment supplies the verdict's payload and is adversarially audited; code applies the structural
change. Rewrites have two phases — provisional effects (freezes, blocks) land at verdict time and
are reversible; permanent effects (retirement, births, tree reshapes) land only when a gate
ratifies them. The graph's node structure, states, and containment replay from the ledger; its
edges are a pure function of the replayed structure plus the contract tree — both live in git, so
the graph at any historical commit is reconstructible, and the same event fold that recovers after
a crash renders the graph live for a human watching progress in real time.

Two orthogonal structures share one set of nodes. The **containment tree** (effort → subefforts →
… → atoms, single-parent) is the drill-down and progress axis. The **dependency graph**
(`needs`/`excludes`/`serves`/`informs`) is the restructure axis. A **legibility law** bounds both
the children per containment node and the lifted-edge density between siblings at every level, so
every view a human must ratify stays readable by construction — a hairball is a planning verdict,
not a rendering problem.

The vertical slice survives as a degenerate case: the cone of one goal under a risk-first priority
policy. The 2.x ban on layer-first traversal becomes pricing under a ratified policy — and because
that demotes a written law to data, **policy changes are vision-class: human-ratified in both
modes, always**. The Three Laws, contract grammar core, parity, fences, budgets, worktrees, and
the human control plane survive unchanged; the escalation ladder survives as the routing function
of the failure calculus.

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
graph*, and its **provisional** effects (freezes, blocks, pending-states) apply at verdict time.
Everything **permanent or tree-shaping** — retirement permanence, component births, grouping
strata, goal re-cuts — applies only when its gate ratifies it (§7.2). Failures restructure
dependencies immediately but reversibly; only ratified judgment restructures anything permanent,
including how a human reads the effort.

### 2.2 The dependency graph (restructure)

Edges live between atoms, cross containment boundaries freely, and are **computed by the fold —
from deltas, citations, and recorded rewrite events — never hand-stored or hand-repaired**:

| Edge | Meaning | Computed from |
|---|---|---|
| `needs` | readiness: A cannot start before B lands | citation closure over contract deltas — A's delta cites clause ids B introduces |
| `excludes` | conflict: A and B cannot run concurrently (serializes, never orders) | footprint intersection (locus ∪ citation closure ∪ resource claims), as D2 §5.11 |
| `serves` | A advances goal G's cone | reverse-reachability from G's scenario contract citations |
| `informs` | spike S gates A's feasibility | the spike-insert rewrite event (§7, R5) |

**Two fidelities.** Before an atom's delta exists (§4.1), its edges are **planned** — derived
coarsely from its charter's premises and the component topology's declared dependencies. Once the
delta is authored at dispatch time, its edges are **actual** — derived precisely from clause-level
citations. Planned edges order the frontier and feed the legibility checks; actual edges govern
dispatch, footprints, and merges. Refinement from planned to actual is itself a recorded event.

### 2.3 Edge lifting (the bridge)

At any drill level, a view shows one subeffort's children plus the **induced edges** between them:
a dependency between two atoms deep in different subtrees lifts to an edge between their ancestors
at the viewed level. A deterministic quotient — computed per view, never stored. This is what
makes structure *visible*: at the top, `button → processing → db` as three boxes with clean
arrows; drill into any box and see the same picture one level down. A hairy bundle of lifted edges
between two subefforts, at any altitude, is the coupling smell of §5.2 rendered on screen.

### 2.4 Derivation and the determinism claim

The graph has an event-sourced part and a derived part, and the determinism claim is exact:

- **Event-sourced (replays from the ledger):** the node set, node lifecycle states, containment
  (including every reshape), freezes and their recorded scopes, retirements, id lineage. Every
  rewrite event records its **effect set** — the nodes and states it changed, as computed at apply
  time — so replay folds recorded effects and never recomputes a closure against files that have
  moved since.
- **Derived (pure function, recomputed):** all four edge kinds, from the replayed structure plus
  the **contract tree and atom specs at a given commit**.

So the claim is: **same (ledger, contract tree) ⇒ same graph.** Both live in git and move
together, so the graph *as it was* at any historical moment is reconstructible from that commit —
which is also what makes scrubbing an effort's history in a visualizer sound (§8), and what makes
"the graph as lived" versus "the graph as replayed" mechanically diffable rather than silently
divergent.

`graph.json` (and the progress projection) are **derived, rebuildable mirrors** in the
`progress.json` class: regenerated on ledger append by the single scribe (D3b), never
authoritative, never hand-edited, pinned as `*` entries in `artifacts.md`. Nobody edits the graph;
everybody replays it.

## 3. Goals and the priority policy

- **`goals.json`** replaces `route.json`'s role as the ratified planning object: the set of
  top-level scenario contracts (the parked suite — the vision's executable core, unchanged from
  D2 §5.5), each with its scenario test. Goal amendments stay human-gated, always.
- **`policy.json`** is the ratified priority policy: weights over integration-risk retirement,
  expected information gain, unlocks-count, goal proximity, staleness pressure, and cost — plus
  the pinned thresholds the legibility law and gate cadence use (§5.2, §9).

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
them; the fence denies it by capability, not prose.

**Ruling — parallelism still spends feedback.** Atoms serving the same goal fan out freely,
footprint-gated (D2 §5.11 Ruling 3's *intra*-decision aggression). Opening a second goal-cone
while one is in flight is opt-in and policy-gated — the cone-concurrency term defaults to 1.

## 4. The atom

The 3.0 work order — but in two parts born at two different times, because predicting structure is
cheap and predicting behavior is the disease (D2 §5.4).

### 4.1 Charter and delta

- **The charter** (genesis-time, structural): the atom's component, its **premises** (stable
  clause references — see §4.2 — into the intention, a goal, or a contract), a one-line purpose
  (non-normative prose), and a coarse locus. This is all the topologist authors at genesis. No
  clause text. **No behavioral musts enter the plan from the vision, ever** — the 2.x law,
  untouched.
- **The delta** (dispatch-time): authored when the atom enters `spec'd` — the first act of its
  in-flight lifecycle — from the accumulated contract state, the goal's scenario, and everything
  landed by then. The delta is the atom's contract delta in the 2.x enrichment sense: behavior
  written at the moment of most knowledge, translated by the blind-test-writer, implemented to
  green, audited. Once spec'd, the atom's planned edges refine to actual (§2.2).

Lifecycle: `chartered → ready → in-flight (spec'd → tests-red → green → audited) → merged |
failed(verdict)`. Pipeline stages are lifecycle states inside the atom, not graph nodes — parity
(D2 §5.4) holds at every commit, and the discriminator stays runnable per atom. **The merge
condition is `audited`, not `green`** (§6).

### 4.2 Identity, clause ids, lineage

- **Atom identity is allocated, not content-derived.** The scribe assigns a stable id at creation
  (`a-0042`); it survives delta authoring, re-wording, and rebasing. Every rewrite that replaces
  or splits an atom records **lineage** (parent id → child ids) in its event, so attempt evidence,
  retirement records, and history survive restructure.
- **Clause identity is stable and never reused.** 3.0 contracts allocate durable per-contract
  clause ids (`lexer#c12`) from a registry in the contract's front matter; positional `§N`
  addressing retires. Citations attach **per clause**, not per contract. Both are breaking grammar
  changes, listed in §12 with their parser (invariant 3: shape and parser change together). This
  is what makes "A's delta cites a clause B introduces" well-defined even while B is unlanded —
  the id is allocated at spec time and unique regardless of landing order.

### 4.3 The minimality law

**Ruling — splittability is connectivity.** Build the delta's clause-reference graph: its clauses
are nodes; two clauses connect iff one cites the other. **A delta whose clause graph is
disconnected must split** — one atom per connected component. The check is mechanical, runs at
spec time (when the delta exists), and is well-defined precisely because citations are now
clause-attributed. The topologist (or the R4 payload) may propose *finer* splits; the rule
validates them against the same relation — a proposed group with a citation into another group is
rejected. (The first draft borrowed wave-packing's footprint disjointness here; that relation can
never fire inside a single contract — every sub-delta shares the home component. The relation
above is the corrected, honest definition.)

The lower bound pairs a mechanical check with a judgment check, because the mechanical one alone
is paddable: `serves ≠ ∅` (reverse-reachability — no atom that advances no goal-cone), **plus**
the 2.x proportionality review at the atom's audit (D2 §5.9 auditor-side: a decorative citation is
judgeable against the contract text; a small delta with a large winning diff stays suspicious).

Cost is treated honestly in §10.

## 5. The topology stage (heart № 2)

**Position:** analysis grills the goals → **topology stage** → scaffold (the first cone driven
real) → the frontier loop (§6). Its output is the **genesis graph**, and it ends at a ratification
gate: the human approves the topology the way they ratify the route today.

### 5.1 The topologist

The route-planner reborn. Takes the grilled goals, the intention, and (brownfield) the census
skeleton, and produces:

1. **Component topology** — derived subtractively from the vision, exactly as D2 §5.4 rules.
2. **The full initial chartering** — every atom's charter (never its delta), covering the ratified
   goals.
3. **The containment tree** — the subeffort hierarchy and the component→subeffort ownership map.
4. **The priority policy proposal** (ratified by the human, §3).

**Why deep upfront chartering is not the disease.** 2.x keeps the route thin because plans rot and
re-planning is an expensive judgment ceremony. 3.0 charters carry *structure only* — the thing
D2 §5.4 already says is cheap to predict — while every behavioral decision waits for dispatch
time. And because charters are data and edges are derived, re-planning is a fold, not a ceremony:
the genesis chartering is a first draft the system is designed to mangle, not a commitment.

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
3. **Coupling smells.** Cross-cone density above threshold means the goals are not independent —
   re-cut them or extract the shared provider now. Heavy fan-in on a component at genesis, before
   history has earned it, is a god-component warning. Both generalize D2 §5.10's "a cycle is a
   topology smell" to planning time.
4. **Chain smells.** A `needs`-chain longer than K signals over-serialization — usually false
   coupling a better cut dissolves.

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

## 6. The frontier loop

Replaces the vertical-slice-execution phase:

```
loop:
  frontier  = ready(graph)                 # needs satisfied, not frozen, not excluded by in-flight
  wave      = pack(argmax_policy(frontier))  # maximal footprint-disjoint subset
  dispatch(wave)                           # spec'd: the delta is authored now; then the 2.x
                                           # pipeline per atom (blind tests, impl, adjudication)
  verdicts  = collect()                    # every attempt ends in a typed verdict
  for v in verdicts: ledger.append(v); graph = rewrite(graph, v)   # provisional effects only
  merge(audited)                           # audit is the merge condition, topological order
  fire_gates(events)                       # §9 — permanent effects land here
```

- **Merge fires at `audited`**, never at `green` — no actor's unverified claim reaches the shared
  branch (Law 3 at the merge boundary, preserved). The per-atom audit is the shallow tier
  (discriminator + bidirectional mapping); the **goal gate umbrellas the joint cone** with the
  deep tier (mutation sampling, proportionality) before the goal is declared green — D2 §5.10
  Ruling 3's umbrella, relocated from slice to goal, not deleted.
- **Post-merge refutation has a defined unwind** (R7): if the goal-gate audit refutes an
  already-merged atom, the rule freezes the atom's dependent cone; the revert applies only when no
  dependent has merged on top — otherwise the rewrite spawns **forward-fix corrective atoms**
  (history is not rewritten under other atoms' feet).
- **Lane amortization:** a wave may run same-component atoms serially in one provisioned lane
  (one worktree, one dependency install, several atoms, still one commit per atom). Scheduling
  unit, commit unit, and lane are three different things; only the commit unit is pinned to the
  atom.

## 7. The failure calculus (heart № 1)

Every attempt ends in a typed verdict:

```
verdict = { type, evidence, payload }
```

**Judgment produces the type and payload; the adversarial trio audits them; a rewrite rule applies
the structural change.** What the change *is* (which nodes and edges appear, freeze, reprice,
retire) is code; what it *contains* (a split boundary, a spike question, an extraction concept) is
audited judgment.

| # | Verdict | Payload (judged, audited) | Provisional effect (verdict time) | Permanent effect (gate) |
|---|---|---|---|---|
| R1 | `checkpoint` — budget exhausted, no wall claimed | progress hypothesis | annotate with attempt evidence; reprice (cost × α); re-enter frontier for fresh-context retry; a second independent exhaustion auto-promotes toward R2 (D2 §5.9 R4) | — |
| R2 | `dead-end` — skeptic-confirmed infeasibility | the refuted **premise** (clause ref, any layer) | atom → `retired-pending`, out of frontier; blast radius = **widen-only** citation closure of the refuted premise, recorded in the event; intersecting atoms freeze; siblings sharing citations reprice | retirement stamped permanent; consumer-first amendment atoms chartered; **un-retire exists**: a ratified verdict-expiry act (D2 §5.8) reverses a pending or stamped retirement when an input changed |
| R3 | `ripple` — delta reaches foreign contracts | manifest: (contract, clause, enrich\|amend) | original atom blocks; foreign atoms chartered and wired — `needs` provider-first for enrichments, consumer-first for amendments (the expand/contract order, as code) | chartered atoms confirmed into the containment tree |
| R4 | `oversized` — splittability fires at spec time, or the proportionality audit flags | proposed partition (clause grouping) | replace atom with sub-atoms (lineage recorded); **the rule validates the payload** against the §4.3 connectivity relation | — |
| R5 | `unknown-blocking` | the falsifiable question | spike node inserted; `informs`-edges; dependents leave the frontier | spike verdict consumed at gate (knowledge → vision only through retro, D2 §5.7) |
| R6 | `cycle-detected` — SCC in `needs`, mechanical | the named shared concept | SCC members block on a **provisional, quarantined birth** — a placeholder node that dispatches nothing | the birth ratified: component created (contract + thin implementation first, D2 §5.10 R4), citations retargeted provider-first, ownership assigned |
| R7 | `parity-breach` — an audit refutes a claim | breach evidence | if unmerged: revert to last green, re-enter as R1 with adversary escalation. If merged: freeze dependent cone; revert only when no dependent merged on top, else charter forward-fix atoms | corrective charters confirmed |
| R8 | `illegible` — a legibility invariant fires (plan-time) | regrouping / re-cut proposal | — (plan-time: nothing is in flight) | regrouping applied only if it reduces measured density (§5.2); containment reshapes are gate-only by §2.1 |

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
- **Two-phase effects.** Provisional effects are reversible and land at verdict time; permanent
  and tree-shaping effects land only at ratification (§2.1). In autonomous mode the gate
  self-ratifies and logs, never blocks — but the phase boundary and its ledger record exist
  identically in both modes.
- **Replayability, exactly as claimed in §2.4.** Rewrite events record their effect sets; replay
  folds recorded effects; edges re-derive from the co-versioned contract tree. Same (ledger,
  contract tree) ⇒ same graph.
- **Monotone evidence.** Rewrites never delete evidence; retirement is a marker with lineage;
  freezes only widen within one rewrite. The un-retire path (R2) is a new ratified event, not an
  erasure.
- **The insanity guard is computed, not declared.** Declared premises route; they do not guard.
  The guard is a mechanical join: **any atom whose computed footprint or citation closure
  intersects a live blast radius gets the dead-end record injected into its dispatch context and
  its gate flagged** — intersection computed from the delta and charter, never from the
  self-declared premise list. Under-declaring premises therefore buys nothing: the crater is
  detected from what the atom *touches*, not what it *admits*. (This is the
  `dead-end-blast-radius` roadmap defense, kept whole.)

Even a plain retry is a rewrite (R1: evidence + repricing) — the graph never silently absorbs a
failure. That is the design's answer to "each failed attempt results in a deterministic
restructure": each one does, including the smallest.

## 8. Progress and the live view

**Ruling — the event grammar is a machine-parsed artifact** (a `*` entry in `artifacts.md`).
Every atom lifecycle transition and every rewrite is one ledger event:

```
{ seq, nodeId, eventType, payload, timestamp }
```

- **Events address nodes by id only.** Containment is itself event-sourced: reshapes (R6 births,
  R8 strata, re-chartering) are containment events, and a node's path is a **fold-derived
  property**, not an event field. Consumers get stable ids plus a replayable path history — a
  visualizer renders a reshape as a rename, never as teleportation, and the progress fold
  aggregates by id so nothing double-counts across a reshape.
- **`seq` is controller-stamped** (as in 2.x, artifacts.md) — fold order never depends on file
  line order.
- **Progress is a fold up the containment tree**: atom lifecycle states, cost-weighted per
  subeffort, roots up to the headline number. Deterministic, derived, replayable — the same fold
  reconcile uses.
- **The live visualizer needs no new machinery**: it tails the ledger and applies incrementally
  the fold recovery applies in batch. Scrubbing works because any ledger prefix *at its own
  commit* is a valid graph (§2.4 — the contract tree is versioned alongside).

## 9. Gates and the human control plane

Retro stops being a per-slice heartbeat and becomes **event-triggered — with a floor and a batch
discipline**, because unbounded cadence fails in both directions.

**Gate-firing events:** a goal goes green (the deep umbrella audit runs here, §6); an amendment
batch reaches its pinned threshold; an extraction birth awaits ratification; a dead-end awaits
permanence; a retopology diff awaits ratification; policy drift (legibility invariants under
pressure — erosion surfacing before it becomes failing code).

**Ruling — the heartbeat floor.** A gate fires at least every N merged atoms or M ledger events
(N, M pinned in `policy.json`). A long refactoring stretch with no goal-green still produces
gates; the 2.x guarantee — the system always stops at a gate — survives.

**Ruling — batch, don't storm.** Non-blocking gate material (amendment proposals, dead-end
permanence, retopology diffs) accumulates into the *next* gate rather than each firing its own.
Only blocking-class events (per the mode's rules — e.g. an intent fork, always) interrupt. The 2.x
inbox-load tripwire carries over unchanged.

**The retro's full duty roster, re-homed** (nothing silently dropped): the three-way divergence
classification (D2 §5.5) runs at goal gates and heartbeat gates; trust-staleness consumption at
every gate; budget tuning and the **supervision dial** at heartbeat gates — the dial survives and
now gates *wave boundaries* (strict = a nod per wave, not per atom); intent-check-failure
recording at any gate (D18, unchanged); the approval inbox as in 2.x.

The mode axis (gated | autonomous) and tier axis (full | lite) are unchanged in meaning:
autonomous self-ratifies and logs, skips nothing; lite trims the deep-tier audit sampling at goal
gates, waives no guard. **Exceptions pinned above stand in both modes:** policy and goal changes
(§3) and intent forks (§7.1) are always human.

## 10. The economics, priced honestly

Atom granularity multiplies *per-unit fixed costs* — lane provisioning, the trio's agent
dispatches, discriminator worktrees, merges, ledger folds — and the first draft waved at this. The
honest accounting:

- **The splittability law is cheap by construction.** §4.3's connectivity relation splits only
  deltas that are *genuinely* unrelated clause groups. Coherent work stays together; the law does
  not shred a cohesive change into confetti. Expected atom counts sit well below the
  one-clause-per-atom worst case.
- **Lanes amortize** (§6): one worktree and one dependency install can serve a serial run of
  same-component atoms. Commit granularity stays per-atom; provisioning does not.
- **Audits are two-tier** (§6): shallow per atom, deep per goal-cone. The expensive checks run
  once per goal, as they effectively did per slice in 2.x.
- **Prerequisite, stated plainly:** 3.0's granularity is affordable only if mechanical steps run
  as code, not as LLM turns — the `mechanical-step-executor` roadmap problem (an engine-side
  no-LLM exec primitive for scribes and provisioning) graduates from optimization to
  **prerequisite**. The calculus being pure code is the same principle applied to planning.
- **Break-even framing:** 3.0 spends more per delivered clause in the steady state to make
  *failure* cheap — restructure is a fold instead of a ceremony, and blast radii are computed
  instead of discovered. The bet pays where failure rates are highest: early, integration-heavy,
  unknown-dense work — exactly where the methodology lives. Calibration (budget denominations, α,
  wave sizes) is an open question (§16) to be settled with ledger data, not asserted.

## 11. What survives from 2.x

| 2.x mechanism | 3.0 status |
|---|---|
| Three Laws; verification trio | unchanged — every rewrite is trio-shaped (worker proposes payload, adversary audits, code applies) |
| Contract grammar core; parity | parity unchanged; grammar gains clause ids + per-clause citations (breaking, §12) |
| Behavior-additive law (D2 §5.4) | **kept structurally**: charters at genesis, deltas at dispatch time |
| Trust-staleness | unchanged — topology-agnostic fold, keyed (component, clause id) |
| Fences, budgets, sanity invariants | unchanged; budgets denominate per atom; `policy.json`/`goals.json` join the enforcement paths |
| Worktrees, merge-by-topology, conflicts-are-evidence | unchanged; merges at atom-**audited**; goal-gate umbrella kept |
| Spikes, skeptic, dead-end evidence standard | unchanged; wired into R2/R5; verdict expiry powers un-retire |
| Walking skeleton | the first cone at priority ∞ |
| Blind-test-writer / adjudicator / auditor separation | unchanged, per atom |
| D19 progress tree | generalized into the containment tree |
| Escalation ladder | kept as the routing function (§7.1); authority stays a linear human-topped ladder, propagation becomes rewrite rules |
| Supervision dial, approval inbox, inbox-load tripwire | kept (§9), dial gates wave boundaries |

## 12. Breaking changes (why this is 3.0)

- `route.json` → `goals.json` + `policy.json`; `route.md` retires. The `nextAction` /
  `selfCheckDirectives` projection rebuilds over goals and cones (named deliverable).
- The vertical-slice-execution phase → the frontier loop; the vertical-slice-runner workflow →
  a frontier-wave workflow.
- Work-order spec → **atom spec** (charter + delta, §4); `verticalSlice` membership → containment
  (event-sourced).
- **Contract grammar:** durable clause ids + per-clause citations; positional `§N` retires. Parser
  (`lib/contract.mjs`) changes with the shape (invariant 3).
- **`intention.md` becomes clause-addressed** (premises must cite it by id) — a breaking artifact
  change with its own grammar entry.
- The OUTCOME union → the verdict grammar with rule bindings (§7); **the 2.x ledger vocabulary
  remains readable forever** — the fold carries a compatibility layer for Family-1/2/3 events
  (named deliverable, not an afterthought).
- New engine modules: `lib/graph.mjs` (fold + lifting), `lib/rewrite.mjs` (the rules),
  `lib/frontier.mjs` (ready-set + packing), `lib/legibility.mjs`; `reconcile.mjs` extends to
  replay rewrite effect sets.
- **Companion deltas to `glossary.md` and `artifacts.md` are a ratification precondition**: every
  new normative term (atom, charter, delta, verdict, rewrite, frontier, cone, stratum, premise,
  wave, legibility law) and every machine-parsed shape (atom spec, goals.json, policy.json, the
  event grammar) enters the normative vocabulary and the `*` registry before any engine work.
- **No in-place migration of live 2.x efforts** — and honestly scoped: a restart under 3.0 keeps
  contracts and ledger history (read through the compatibility fold), but re-runs analysis
  addenda (intention clause ids) and a full topology stage. This is a re-genesis, not a rename.

## 13. What this deliberately does not change

Prediction discipline: behavioral musts enter only at dispatch-time delta authoring, informed by
gates — never from the vision, never at genesis. The vision stays human-gated. The membranes stay
one-way: spike quarantine, blind test writers, read-only adversaries. The genesis predicts
*structure only*, and even that prediction is built to be mangled cheaply.

## 14. Absorbed roadmap problems

- **`dead-end-blast-radius`** — R2 + §7.2's computed insanity guard implement its candidate fix
  whole: premise reified in the event grammar, widen-only closure, **standing injection of
  dead-end records into any future atom whose computed footprint intersects a live blast radius**,
  permanent id retirement (with the ratified un-retire path) superseding hash-unbind.
- **`commit-granularity`** — the atom's one-commit binding is the target state;
  `lib/atomic-commit.mjs` becomes the landing mechanism.
- **`intra-slice-provider-merge`** — resolved, not hand-waved: merges at atom-**audited** in
  topological order; the joint umbrella survives at the goal gate; post-merge refutation has the
  R7 unwind (freeze cone; revert only with no merged dependents; else forward-fix).
- **`cross-vertical-slice-parallelism`** — reframed as the cone-concurrency policy term
  (default 1); the multi-writer journal question remains open for concurrency > 1 (§16).
- **`mechanical-step-executor`** — promoted from optimization to **prerequisite** (§10).

## 15. Adversarial review record

The first draft was attacked by an adversarial critic instructed to kill it, grounded in
`DESIGN.md`, `architecture.md`, `artifacts.md`, the roadmap, and `lib/`. Findings and
dispositions — all accepted, none deflected:

| # | Severity | Finding (condensed) | Disposition |
|---|---|---|---|
| 1 | fatal | Genesis atomization = upfront behavioral speculation; contradicts the behavior-additive law it claimed to preserve | **Redesigned the pillar**: charter (genesis) / delta (dispatch-time) split, §4.1; identity decoupled from delta content |
| 2 | fatal | Splittability check vacuous — every sub-delta shares the home contract under the borrowed footprint relation | **Redefined**: connectivity of the clause-reference graph, §4.3; requires clause-attributed citations (breaking, §12); "same machinery as wave packing" deleted |
| 3 | fatal | "Same ledger ⇒ same graph" false — edges derive from mutable contract files outside the ledger; freeze scopes recomputed at replay | **Restated exactly**: effect sets recorded in events; edges a pure function of (structure, contract tree); claim = same (ledger, contract tree) ⇒ same graph, §2.4 |
| 4 | fatal | Identity undefined: positional clause ids race for unlanded clauses; content-addressed atom ids churn under the calculus's own operations | **Replaced**: allocated atom ids + lineage events; durable never-reused clause ids, §4.2 |
| 5 | major | Merge at `green` precedes `audited`; umbrella deleted; no unwind for post-merge refutation | Merge condition = `audited`; goal-gate umbrella kept; R7 unwind defined, §6 |
| 6 | major | Insanity guard keyed on self-declared premises — under-declaration dodges it (unsafe direction) | Guard recomputed from footprint ∩ live blast radius, injection into dispatch context; declared premises route only, §7.2 |
| 7 | major | Autonomous mode can self-ratify a policy that legalizes the banned traversals | Policy/goals changes vision-class (human, both modes); files join enforcement paths, §3 |
| 8 | major | R6/R8 reshape the tree at verdict time; R2 retires permanently un-ratified — contradicting the draft's own authority ruling | Two-phase rewrites: provisional at verdict, permanent at gate; un-retire path defined, §7/§7.2 |
| 9 | major | Retro duty roster orphaned; gate cadence unbounded both directions; supervision dial vanished | Duty roster re-homed; heartbeat floor; batch discipline; dial gates waves, §9 |
| 10 | major | Premises limited to intention/goal clauses — the ladder's gradations inexpressible; roadmap's always-human intent-fork rule dropped | Premises = any citable clause; ladder restored as routing function incl. the always-human rung, §7.1 |
| 11 | major | Economics don't close: per-atom fixed costs multiply; mitigations addressed none of them | §10 added: connectivity law's natural coarseness, lane amortization, two-tier audits, mechanical-executor prerequisite, break-even framing, calibration open |
| 12 | major | Migration understated: dual ledger grammar, intention clause-addressing, nextAction rebuild all unscoped | §12 expanded; compatibility fold and projection rebuild are named deliverables |
| 13 | major | `containmentPath` stored in events but reshaped by R8 — progress fold breaks; `seq` dropped | Events id-addressed; containment event-sourced; paths fold-derived; `seq` restored, §8 |
| 14 | minor | `graph.json` simultaneously "never kept" and "machine truth", with no writer or format entry | Declared derived rebuildable mirror, scribe-written, `*` entry, §2.4 |
| 15 | minor | `informs` edge contradicts "recomputed from deltas + citations" | Restated: computed by the fold from deltas, citations, and recorded events, §2.2 |
| 16 | minor | B gamed by empty strata (R8 prescribes the dodge); edge density unbounded; §5.3 cite typo | Sibling lifted-edge density invariant at every level; R8 payload must reduce density; typo fixed, §5.2 |
| 17 | minor | Proportionality guard satisfied by citation-padding | Paired with the auditor-side proportionality review, §4.3 |
| 18 | minor | §0 claimed a review §14 showed never happened | This table is the review; §0 rewritten after it |
| 19 | minor | New vocabulary and machine-parsed shapes unpinned (invariants 3, 6) | Companion glossary/artifacts deltas made a ratification precondition, §12 |

## 16. Open questions

- **Budget denomination** per atom class; the R1 repricing factor α; wave-size calibration — all
  to be settled with ledger data (§10).
- **Cone concurrency > 1** still requires the multi-writer journal design (roadmap problem
  stands).
- **Clause-id grammar details**: registry format in contract front matter, id allocation for
  amendment atoms, collision handling at spec time.
- **Event transport for the live view** — file-tail is the dependency-free default; anything
  richer stays optional.
- **Brownfield genesis** — how the census skeleton and characterized clauses seed the containment
  tree and charters (the ownership map exists; the chartering of *unknown* legacy behavior does
  not).
