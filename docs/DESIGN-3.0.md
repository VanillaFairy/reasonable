# Reasonable 3.0 — Design Document

> **Status: DRAFT, for ratification.** This document designs the 3.0 generation of the methodology.
> It does **not** amend `DESIGN.md` (2.x) — section numbers there stay stable (they are cited from
> `lib/` and `hooks/`), and this document cites them as `D2 §…`. Until ratification, the shipped
> plugin remains 2.x; nothing in this file has normative force yet.
>
> This is the **third draft**. Draft one was attacked by an adversarial critic grounded in the 2.x
> corpus (4 fatal / 9 major / 6 minor findings); draft two repaired them and was attacked by a
> second, fresh critic (regression-check + fresh attack: 2 fatal / 4 major / 3 minor, and 4 of the
> 19 first-round dispositions failed regression). §15 records both rounds. **Draft three repairs
> round two but has not yet faced its own independent attack** — a ratifier should know that.

## 0. Summary

Reasonable 3.0 replaces the ratified linear route of vertical slices with a **development graph**:
one derived structure holding all planned work. Work shrinks to **atoms** — one component's
contract delta, driven to audited green in one commit. An atom is born at genesis as a **charter**
(component, premises, purpose — structure only); its **delta** (the actual clauses) is authored at
dispatch time, from everything development has taught by then — so behavior still enters only at
the moment of most knowledge, and the 2.x behavior-additive law survives intact. Waves pack on
**actual** footprints, after deltas exist — spec first, pack second, dispatch third.

Every failed attempt ends in a **typed verdict** that binds to exactly one **rewrite rule**:
judgment supplies the verdict's payload and is adversarially audited; code applies the structural
change. Rewrites have two phases — provisional effects (freezes, blocks) land at verdict time and
are reversible; permanent effects (retirement, births, tree reshapes, shared-branch mutations)
land only when a gate ratifies them. **The ledger is self-sufficient**: every event records its
full effect set (nodes, states, containment, edge deltas), so the graph *as lived* at any moment
replays from the ledger alone — no reliance on git history for `.reasonable/` state, which stays
gitignored exactly as 2.x rules. The same fold that recovers after a crash renders the graph live
for a human watching progress in real time.

Two orthogonal structures share one set of nodes. The **containment tree** (effort → subefforts →
… → atoms, single-parent) is the drill-down and progress axis. The **dependency graph**
(`needs`/`excludes`/`serves`/`informs`) is the restructure axis. A **legibility law** bounds both
the children per containment node and the lifted-edge density between siblings at every level, so
every view a human must ratify stays readable by construction — a hairball is a planning verdict,
not a rendering problem.

The vertical slice survives as a degenerate case: the cone of one goal under a risk-first priority
policy. The 2.x ban on layer-first traversal becomes pricing under a ratified policy — and because
that demotes a written law to data, **policy changes are vision-class: human-ratified in both
modes, always**. The Three Laws, contract grammar core, parity, fences, budgets, worktrees, the
lane-per-work-unit accounting, and the human control plane survive unchanged; the escalation
ladder survives as the routing function of the failure calculus.

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
strata, goal re-cuts, shared-branch mutations — applies only when its gate ratifies it (§7.2).
Failures restructure dependencies immediately but reversibly; only ratified judgment restructures
anything permanent, including how a human reads the effort.

### 2.2 The dependency graph (restructure)

Edges live between atoms, cross containment boundaries freely, and are **computed by the fold —
from deltas, citations, and recorded rewrite events — never hand-stored or hand-repaired**:

| Edge | Meaning | Computed from |
|---|---|---|
| `needs` | readiness: A cannot start before B lands | citation closure over contract deltas — A's delta cites clause ids B introduces |
| `excludes` | conflict: A and B cannot run concurrently (serializes, never orders) | footprint intersection (locus ∪ citation closure ∪ resource claims), as D2 §5.11 |
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

**Ruling — the ledger is self-sufficient.** Every rewrite and lifecycle event records its full
**effect set** — the nodes, states, containment changes, *and edge deltas* it produced, as
computed at apply time — as a first-class, pinned field (§8). Verdicts from a wave serialize at
append: the ledger controller stamps `seq` (D19 class — validates, stamps, appends, regenerates
mirrors; no model in the loop), so apply order is total and recorded. Two projections follow:

- **The as-lived graph** at any seq = fold of recorded effects up to that seq. **Same ledger ⇒
  same as-lived graph**, no external state consulted. This is what crash recovery replays and what
  a visualizer scrubs.
- **The current graph** = the replayed structure + edges re-derived fresh from today's contract
  tree and atom specs (§2.2 fidelities). A pure function of (ledger, current disk state).

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
them; the fence denies it by capability, not prose. When an autonomous run's only path forward
requires such a change, the run returns **`blocked`** (§9) — it never waits silently and never
proceeds.

**Ruling — parallelism still spends feedback.** Atoms serving the same goal fan out freely,
footprint-gated (D2 §5.11 Ruling 3's *intra*-decision aggression). Opening a second goal-cone
while one is in flight is opt-in and policy-gated — the cone-concurrency term defaults to 1.

## 4. The atom

The 3.0 work order — but in two parts born at two different times, because predicting structure is
cheap and predicting behavior is the disease (D2 §5.4).

### 4.1 Charter and delta

- **The charter** (genesis-time, structural): the atom's component, its **premises** (stable
  clause references — §4.2 — into the intention, a goal, or a contract), a one-line purpose
  (non-normative prose), a coarse locus, and its place in the topologist's ratified
  intra-component ordering (§2.2). This is all the topologist authors at genesis. No clause text.
  **No behavioral musts enter the plan from the vision, ever** — the 2.x law, untouched.
- **The delta** (spec-time): authored when the atom enters `spec'd` — from the accumulated
  contract state, the goal's scenario, and everything landed by then. Each clause carries a
  **`demanded-by` provenance**: the goal-scenario assertion (or gate) that demanded it — behavior
  enters through gates, per clause, mechanically visible. The delta is then translated by the
  blind-test-writer, implemented to green, audited. Once spec'd, the atom's planned edges refine
  to actual (§2.2), the splittability check runs (§4.3), and the spec-time guard runs (§7.2) —
  all **before** implementation dispatch.

Lifecycle: `chartered → ready → spec'd → packed → in-flight (tests-red → green → audited) →
merged | failed(verdict)`. Pipeline stages are lifecycle states inside the atom, not graph nodes —
parity (D2 §5.4) holds at every commit, and the discriminator stays runnable per atom. **The merge
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

**Ruling — splittability is cohesion, over relations that actually exist.** (Draft one borrowed
wave-packing's footprint relation — vacuous inside one contract; draft two used intra-delta
citations — a relation the grammar has never contained, which would shred every coherent delta to
one-clause confetti. Both are recorded in §15; this is the corrected definition.) Build the
delta's **clause-cohesion graph**: clauses are nodes; two clauses **cohere** iff any of:

- (a) they cite a **common provider clause** (per-clause citations, §4.2);
- (b) they share a **`demanded-by`** provenance — the same goal-scenario assertion demanded both
  (§4.1);
- (c) their declared loci overlap below the component root.

A delta whose cohesion graph is **disconnected must split** — one atom per connected component
(R4; lineage recorded). All three relations are data the spec-time atom already carries. The check
runs at spec time, when the delta exists.

**Anti-padding, both bounds judged.** Cohesion edges are audit-checked: a claimed shared citation,
provenance, or locus overlap the auditor cannot ground in the artifact is a parity finding — the
same proportionality review (D2 §5.9) that guards the lower bound (`serves ≠ ∅` mechanically,
plus small-delta/large-diff suspicion) also grounds the upper: a delta held together by decorative
cohesion is ruled oversized at audit and split by R4.

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
   goals, including the intra-component ordering (§2.2).
3. **The containment tree** — the subeffort hierarchy and the component→subeffort ownership map.
4. **The priority policy proposal** (ratified by the human, §3).

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

Replaces the vertical-slice-execution phase. **Spec first, pack second, dispatch third** — the 2.x
persist-spec → footprint → group order (the thin-planner architecture), kept:

```
loop:
  frontier  = ready(graph)                # planned edges; not frozen, not guard-halted
  spec(top(argmax_policy(frontier)))      # deltas authored; edges refine planned → actual;
                                          # splittability (R4) + spec-time guard (§7.2) run HERE
  wave      = pack(spec'd_atoms)          # maximal subset, disjoint by ACTUAL footprints
  dispatch(wave)                          # per atom: blind tests, impl, adjudication, audit
  verdicts  = collect()                   # every attempt ends in a typed verdict
  for v in verdicts: ledger.append(v); graph = rewrite(graph, v)   # provisional effects
  merge(audited)                          # audit is the merge condition, topological order
  fire_gates(events)                      # §9 — permanent effects land at gates
  if starved(frontier): return BLOCKED    # §9 — typed return, never a silent wedge
```

- **Packing happens only on actual footprints.** Charter-coarse loci never justify concurrency;
  they only order the spec queue. Disjointness is proven from spec'd deltas before any two atoms
  run concurrently — so a merge conflict between packed lanes remains what 2.x made it: **evidence
  of a footprint bug** (D2 §5.11 R2), a property that only holds because disjointness was actually
  established pre-dispatch. A spec'd delta whose closure collides with in-flight or newly-landed
  work is an **R9 verdict** (§7), not a surprise.
- **Merge fires at `audited`**, never at `green` — no actor's unverified claim reaches the shared
  branch (Law 3 at the merge boundary). The per-atom audit is the shallow tier (discriminator +
  bidirectional mapping); the **goal gate umbrellas the joint cone** with the deep tier (mutation
  sampling, proportionality) before the goal is declared green — D2 §5.10 Ruling 3's umbrella,
  relocated from slice to goal, not deleted.
- **Post-merge refutation has a defined unwind** (R7): the dependent cone freezes provisionally at
  verdict time; the remediation — revert when no dependent merged on top, forward-fix corrective
  atoms otherwise — is **gate-ratified** (a shared-branch mutation is never a provisional act).
- **Lane = atom, exactly as 2.x has lane = work order.** The lane/journal/ledger accounting keeps
  its one-lane-one-work-unit bijection (descriptors, custody, `validateLaneBases`) untouched.
  **Amortization is provisioning-level only**: a warm worktree may be *reused* across waves for
  same-component atoms — teardown and re-provision between atoms, fresh branch per atom cut from
  the last merged tip — one dependency install serving several atoms without ever putting two
  atoms on one lane branch.

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
| R3 | `ripple` — delta reaches foreign contracts | manifest: (contract, clause, enrich\|amend) | original atom blocks; foreign atoms chartered and wired — `needs` provider-first for enrichments, consumer-first for amendments (the expand/contract order, as code); wiring targets **existing** charters where the manifest's clauses are already owned (no double-chartering) | chartered atoms confirmed into the containment tree |
| R4 | `oversized` — cohesion check fires at spec time, or the audit refutes claimed cohesion | proposed partition (clause grouping) | replace atom with sub-atoms (lineage recorded); **the rule validates the payload** against the §4.3 cohesion relation | — |
| R5 | `unknown-blocking` | the falsifiable question | spike node inserted; `informs`-edges; dependents leave the frontier | spike verdict consumed at gate (knowledge → vision only through retro, D2 §5.7) |
| R6 | `cycle-detected` — SCC in `needs`, mechanical | the named shared concept | SCC members block on a **provisional, quarantined birth** — a placeholder node that dispatches nothing | the birth ratified: component created (contract + thin implementation first, D2 §5.10 R4), citations retargeted provider-first, ownership assigned |
| R7 | `parity-breach` — an audit refutes a claim | breach evidence | if unmerged: revert lane-local to last green, re-enter as R1 with adversary escalation. If merged: **freeze the dependent cone** (only) | merged-case remediation ratified: revert when no dependent merged on top, else charter forward-fix atoms |
| R8 | `illegible` — a legibility invariant fires (plan-time) | regrouping / re-cut proposal | — (plan-time: nothing is in flight) | regrouping applied only if it reduces measured density (§5.2); containment reshapes are gate-only by §2.1 |
| R9 | `stale-spec` — a spec'd delta's actual closure collides with in-flight or newly-landed work (mechanical, at refine/repack) | — (no judgment) | the atom leaves `spec'd` → back to `ready` with its delta marked stale; the colliding pair serializes; re-spec at the next spec stage folds in what landed | — |

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
- **Two-phase effects.** Provisional effects are reversible graph-state changes and land at
  verdict time; permanent effects — retirement permanence, births, tree reshapes, **any mutation
  of the shared branch** — land only at ratification (§2.1). In autonomous mode the gate
  self-ratifies and logs, never blocks — but the phase boundary and its ledger record exist
  identically in both modes.
- **Replayability, exactly as claimed in §2.4.** Events carry effect sets (including edge
  deltas); replay folds recorded effects; same ledger ⇒ same as-lived graph. Fresh derivation is
  a separate projection whose divergence from as-lived is surfaced, never absorbed.
- **Monotone evidence.** Rewrites never delete evidence; retirement is a marker with lineage;
  freezes only widen within one rewrite. The un-retire path (R2) is a new ratified event, not an
  erasure.
- **The insanity guard runs twice, and the second time has teeth.** Declared premises route; they
  do not guard. **Checkpoint 1 (scheduling, coarse, widen-only):** charter locus ∪ declared
  premise citations vs live blast radii — premises may *widen* the guard's reach, never narrow
  it; a hit deprioritizes and flags. **Checkpoint 2 (spec time, fence-class):** the freshly
  authored delta's citation closure is checked against every live blast radius **before
  implementation dispatch**; an intersection **HALTs the atom** and injects the dead-end record —
  a hard block in the 2.x redispatch-guard class, not advisory context. Under-declaring premises
  buys nothing: the crater is detected from what the atom *touches*, before the implementation
  budget is spent. (This is the `dead-end-blast-radius` roadmap defense, kept whole — including
  its warning that assumption-coupling exceeds structural coupling, which is why checkpoint 1
  consumes premises at all.)

Even a plain retry is a rewrite (R1: evidence + repricing) — the graph never silently absorbs a
failure. That is the design's answer to "each failed attempt results in a deterministic
restructure": each one does, including the smallest.

## 8. Progress and the live view

**Ruling — the event grammar is a machine-parsed artifact** (a `*` entry in `artifacts.md`).
Every atom lifecycle transition and every rewrite is one ledger event:

```
{ seq, nodeId, eventType, payload, effects: [{ nodeId, change }], timestamp }
```

- **`effects` is first-class**, not buried in `payload`: the recorded effect set §2.4's
  replayability rests on, multi-node by construction (one R2 verdict freezes many atoms; each
  freeze is an addressed entry).
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
valve, and a batch discipline**, because unbounded cadence fails in both directions.

**Two event classes, explicitly:**

- **Immediate-fire** (each fires a gate now): a goal goes green (the deep umbrella audit runs
  here, §6); an intent fork (always human); a needed policy/goal change (always human); the
  inbox-load tripwire; and **frontier starvation** — the frontier is empty or below quorum while
  gate-held material (frozen atoms, pending permanence, blocked always-human items) exists.
  Starvation is the liveness valve: a wide provisional freeze can empty the frontier, and a
  progress-denominated floor would then never tick — so starvation itself fires the gate. In an
  autonomous run, a starvation gate whose blocking material is human-class makes the frontier
  loop **return `BLOCKED`** (typed, to the main session — the 2.x GATE_RESULT discipline). The
  run never wedges silently and never waits forever.
- **Batched** (accumulate to the next fired gate, whatever fires it): amendment proposals,
  dead-end permanence, extraction ratifications, retopology diffs. Pinned thresholds
  (`policy.json`) force a heartbeat gate when a batch grows past its bound.

**Ruling — the heartbeat floor.** A gate fires at least every N merged atoms or M ledger events
(N, M pinned in `policy.json`). Together with the starvation valve this covers both failure
directions: long quiet stretches still produce gates, and blocked stretches cannot postpone them.
The 2.x guarantee — the system always stops at a gate — survives.

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
dispatches, discriminator worktrees, merges, ledger folds. The honest accounting:

- **The cohesion law keeps coherent work whole.** §4.3 splits only deltas whose clause groups
  share no provider, no demanding assertion, and no locus — genuinely unrelated work. Clauses
  born from one scenario assertion stay one atom; an afternoon's cohesive change is one pipeline,
  not confetti. (Draft two's relation would have shredded everything; §15 R2-2.)
- **Spec-then-pack keeps counts sane.** Atom counts and wave shapes settle on actual spec'd data,
  not charter guesses; R9 serializes collisions instead of spending them as merge conflicts.
- **Lanes amortize at the provisioning level** (§6): one warm worktree and one dependency install
  serve several same-component atoms across waves — without touching the lane=atom accounting.
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
  wave sizes, spec-queue depth) is an open question (§16) to be settled with ledger data, not
  asserted.

## 11. What survives from 2.x

| 2.x mechanism | 3.0 status |
|---|---|
| Three Laws; verification trio | unchanged — every rewrite is trio-shaped (worker proposes payload, adversary audits, code applies) |
| Contract grammar core; parity | parity unchanged; grammar gains clause ids, per-clause citations, `demanded-by` provenance (breaking, §12) |
| Behavior-additive law (D2 §5.4) | **kept structurally**: charters at genesis, deltas at spec time, per-clause provenance |
| Trust-staleness | unchanged — topology-agnostic fold, keyed (component, clause id) |
| Fences, budgets, sanity invariants | unchanged; budgets denominate per atom; `policy.json`/`goals.json` join the enforcement paths; the spec-time guard is fence-class |
| Worktrees, merge-by-topology, conflicts-are-evidence | unchanged; disjointness proven pre-dispatch from actual footprints (§6), so conflicts stay evidence; merges at atom-**audited**; goal-gate umbrella kept |
| Lane accounting (descriptors, custody, `validateLaneBases`) | **unchanged**: lane = atom, one merge per lane; warm-worktree reuse is provisioning-level only |
| `.reasonable/` gitignored | unchanged — replay is ledger-self-sufficient (§2.4), not git-dependent |
| Spikes, skeptic, dead-end evidence standard | unchanged; wired into R2/R5; verdict expiry powers un-retire |
| Walking skeleton | the first cone at priority ∞ |
| Blind-test-writer / adjudicator / auditor separation | unchanged, per atom |
| D19 progress tree; ledger controller | generalized into the containment tree; the controller stamps `seq` and regenerates mirrors |
| Escalation ladder | kept as the routing function (§7.1); authority stays a linear human-topped ladder, propagation becomes rewrite rules |
| Supervision dial, approval inbox, inbox-load tripwire | kept (§9), dial gates wave boundaries |
| GATE_RESULT discipline (typed returns, never silent) | kept: the frontier loop returns `BLOCKED` on starvation-with-human-class material (§9) |

## 12. Breaking changes (why this is 3.0)

- `route.json` → `goals.json` + `policy.json`; `route.md` retires. The `nextAction` /
  `selfCheckDirectives` projection rebuilds over goals and cones (named deliverable).
- The vertical-slice-execution phase → the frontier loop; the vertical-slice-runner workflow →
  a frontier-wave workflow (spec stage → pack → dispatch).
- Work-order spec → **atom spec** (charter + delta, §4); `verticalSlice` membership → containment
  (event-sourced).
- **Contract grammar:** durable clause ids, per-clause citations, per-clause `demanded-by`
  provenance; positional `§N` retires. Parser (`lib/contract.mjs`) changes with the shape
  (invariant 3).
- **`intention.md` becomes clause-addressed** (premises must cite it by id) — a breaking artifact
  change with its own grammar entry.
- The OUTCOME union → the verdict grammar with rule bindings (§7); **the 2.x ledger vocabulary
  remains readable forever** — the fold carries a compatibility layer for Family-1/2/3 events
  (named deliverable, not an afterthought).
- **The event grammar gains the first-class `effects` field** (§8) — pinned in `artifacts.md`
  with the rest of the grammar.
- New engine modules: `lib/graph.mjs` (fold + lifting), `lib/rewrite.mjs` (the rules),
  `lib/frontier.mjs` (ready-set, spec queue, packing), `lib/legibility.mjs`; `reconcile.mjs`
  extends to replay rewrite effect sets. Lane accounting modules are **not** redesigned (§6).
- **Companion deltas to `glossary.md` and `artifacts.md` are a ratification precondition**: every
  new normative term (atom, charter, delta, verdict, rewrite, frontier, cone, stratum, premise,
  wave, cohesion, legibility law) and every machine-parsed shape (atom spec, goals.json,
  policy.json, the event grammar) enters the normative vocabulary and the `*` registry before any
  engine work.
- **No in-place migration of live 2.x efforts** — and honestly scoped: a restart under 3.0 keeps
  contracts and ledger history (read through the compatibility fold), but re-runs analysis
  addenda (intention clause ids) and a full topology stage. This is a re-genesis, not a rename.

## 13. What this deliberately does not change

Prediction discipline: behavioral musts enter only at spec-time delta authoring, informed by
gates, with per-clause provenance — never from the vision, never at genesis. The vision stays
human-gated. The membranes stay one-way: spike quarantine, blind test writers, read-only
adversaries. `.reasonable/` stays out of git. The genesis predicts *structure only*, and even
that prediction is built to be mangled cheaply.

## 14. Absorbed roadmap problems

- **`dead-end-blast-radius`** — R2 + §7.2's two-checkpoint guard implement its candidate fix:
  premise reified in the event grammar, widen-only closure, a **fence-class spec-time block**
  (plus a widen-only coarse check at scheduling) for any atom whose computed closure hits a live
  blast radius, permanent id retirement (with the ratified un-retire path) superseding
  hash-unbind.
- **`commit-granularity`** — the atom's one-commit binding is the target state;
  `lib/atomic-commit.mjs` becomes the landing mechanism.
- **`intra-slice-provider-merge`** — resolved, not hand-waved: merges at atom-**audited** in
  topological order; the joint umbrella survives at the goal gate; post-merge refutation has the
  R7 unwind (provisional cone freeze; gate-ratified revert-or-forward-fix).
- **`cross-vertical-slice-parallelism`** — reframed as the cone-concurrency policy term
  (default 1); the multi-writer journal question remains open for concurrency > 1 (§16).
- **`mechanical-step-executor`** — promoted from optimization to **prerequisite** (§10).

## 15. Adversarial review record

Each draft was attacked by a fresh adversarial critic grounded in `DESIGN.md`,
`architecture.md`, `artifacts.md`, the roadmap, and `lib/`, instructed to kill the design and to
report only findings that survived its own refutation attempts.

### Round 1 (against draft one) — 4 fatal, 9 major, 6 minor; all accepted

| # | Severity | Finding (condensed) | Disposition |
|---|---|---|---|
| 1 | fatal | Genesis atomization = upfront behavioral speculation; contradicts the behavior-additive law it claimed to preserve | Charter (genesis) / delta (spec-time) split, §4.1; identity decoupled from delta content |
| 2 | fatal | Splittability check vacuous — every sub-delta shares the home contract under the borrowed footprint relation | Redefined (then re-broken and re-fixed: see R2-2) — final form is the §4.3 cohesion relation |
| 3 | fatal | "Same ledger ⇒ same graph" false — edges derive from mutable contract files outside the ledger | Restated (then re-broken and re-fixed: see R2-1) — final form is ledger self-sufficiency, §2.4 |
| 4 | fatal | Identity undefined: positional clause ids race for unlanded clauses; content-addressed atom ids churn under the calculus's own operations | Allocated atom ids + lineage events; durable never-reused clause ids, §4.2 |
| 5 | major | Merge at `green` precedes `audited`; umbrella deleted; no unwind for post-merge refutation | Merge condition = `audited`; goal-gate umbrella kept; R7 unwind defined, §6 |
| 6 | major | Insanity guard keyed on self-declared premises — under-declaration dodges it | Guard recomputed from closures (final two-checkpoint form: see R2-4), §7.2 |
| 7 | major | Autonomous mode can self-ratify a policy that legalizes the banned traversals | Policy/goals changes vision-class (human, both modes); files join enforcement paths, §3 |
| 8 | major | R6/R8 reshape the tree at verdict time; R2 retires permanently un-ratified | Two-phase rewrites: provisional at verdict, permanent at gate; un-retire path defined, §7/§7.2 |
| 9 | major | Retro duty roster orphaned; gate cadence unbounded both directions; supervision dial vanished | Duty roster re-homed; heartbeat floor; batch discipline; dial gates waves, §9 |
| 10 | major | Premises limited to intention/goal clauses — the ladder's gradations inexpressible | Premises = any citable clause; ladder restored as routing function incl. the always-human rung, §7.1 |
| 11 | major | Economics don't close: per-atom fixed costs multiply | §10 (final pillar set: see R2-2 fallout); mechanical-executor prerequisite; break-even framing |
| 12 | major | Migration understated: dual ledger grammar, intention clause-addressing, nextAction rebuild unscoped | §12 expanded; compatibility fold and projection rebuild named deliverables |
| 13 | major | `containmentPath` stored in events but reshaped by R8; `seq` dropped | Events id-addressed; containment event-sourced; paths fold-derived; `seq` restored, §8 |
| 14 | minor | `graph.json` simultaneously "never kept" and "machine truth", no writer or format entry | Derived rebuildable mirror (writer corrected in R2-9), §2.4 |
| 15 | minor | `informs` edge contradicts "recomputed from deltas + citations" | Restated: computed by the fold from deltas, citations, and recorded events, §2.2 |
| 16 | minor | B gamed by empty strata; edge density unbounded; cite typo | Sibling lifted-edge density invariant at every level; R8 payload must reduce density, §5.2 |
| 17 | minor | Proportionality guard satisfied by citation-padding | Paired with the auditor-side proportionality review, §4.3 |
| 18 | minor | §0 claimed a review that hadn't happened | Review records live in this section; each draft's header states its actual attack status |
| 19 | minor | New vocabulary and machine-parsed shapes unpinned (invariants 3, 6) | Companion glossary/artifacts deltas made a ratification precondition, §12 |

### Round 2 (against draft two) — regression check: 15/19 dispositions held; 4 failed (#2, #3, #6, #11). Fresh findings: 2 fatal, 4 major, 3 minor; all accepted

| # | Severity | Finding (condensed) | Disposition |
|---|---|---|---|
| R2-1 | fatal | Determinism/scrubbing anchored on a git-versioned ledger + contract tree — the corpus **gitignores `.reasonable/` by design** (D2), and "move together" had no protocol | **Ledger made self-sufficient**: first-class `effects` (incl. edge deltas) recorded at apply time; as-lived vs current projections split; scrub replays recorded effects; no git claim anywhere, §2.4/§8 |
| R2-2 | fatal | The connectivity relation (intra-delta citations) doesn't exist in the grammar or practice — every multi-clause delta shreds to serialized one-clause confetti; one decorative citation defeats it | **Cohesion relation over data that exists**: shared provider citation, shared `demanded-by` assertion, locus overlap; audit grounds claimed cohesion (both bounds judged), §4.3; `demanded-by` provenance added to the grammar, §4.1/§12 |
| R2-3 | major | Planned edges uncomputable at atom grain; the wave packed **before** deltas existed — concurrency decided on edges that don't exist, conflicts-are-evidence property destroyed, no rule for refinement collisions | Planned-edge semantics pinned (component quotient + ratified intra-component ordering, priority-only); **loop reordered: spec → pack-on-actual → dispatch** (the 2.x thin-planner order); **R9 `stale-spec`** added, §2.2/§6/§7 |
| R2-4 | major | The computed insanity guard couldn't fire until after the money was spent (delta exists only after the dispatch context it injects into); advisory, not fence-class | **Two checkpoints**: widen-only coarse check at scheduling (locus ∪ premises); **fence-class spec-time HALT** before implementation dispatch, §7.2 |
| R2-5 | major | Gate liveness: fire-vs-batch self-contradiction; progress-denominated heartbeat starves under a wide freeze; frontier loop had no typed blocked return | Event classes split explicitly; **frontier-starvation is an immediate-fire gate** and a typed `BLOCKED` return (2.x GATE_RESULT discipline kept), §6/§9 |
| R2-6 | major | Lane amortization contradicted the wave definition and broke the engine's lane=work-unit accounting (descriptors, custody, one-merge-per-lane) | **Lane = atom pinned** (bijection untouched); amortization redefined as warm-worktree *reuse* across waves, fresh branch per atom, §6/§11 |
| R2-7 | minor | The pinned event grammar couldn't carry the effect sets the determinism invariant needs; `nodeId` singular vs multi-node effects | `effects: [{nodeId, change}]` promoted to a first-class pinned field, §8 |
| R2-8 | minor | R7's merged-case revert sat in the provisional column — a shared-branch mutation on an unratified verdict | Moved to the permanent/gate column; only the cone freeze is provisional; "shared-branch mutation" added to the permanent-phase definition, §7/§7.2 |
| R2-9 | minor | `graph.json` writer misattributed (D3b scribe vs the D19 ledger controller) | Controller cited, §2.4 |

## 16. Open questions

- **Budget denomination** per atom class; the R1 repricing factor α; wave-size and spec-queue
  calibration — all to be settled with ledger data (§10).
- **Cone concurrency > 1** still requires the multi-writer journal design (roadmap problem
  stands).
- **Clause-id grammar details**: registry format in contract front matter, id allocation for
  amendment atoms, collision handling at spec time, `demanded-by` reference format.
- **Event transport for the live view** — file-tail is the dependency-free default; anything
  richer stays optional.
- **Brownfield genesis** — how the census skeleton and characterized clauses seed the containment
  tree and charters (the ownership map exists; the chartering of *unknown* legacy behavior does
  not).
