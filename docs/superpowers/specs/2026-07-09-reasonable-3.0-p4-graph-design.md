# Design — Reasonable 3.0 Part 4: The Graph Engine

**Status:** brainstormed non-interactively, same discipline as Parts 1–3. `reasonable` is a Claude
Code plugin, not an interactive service, so this pass plays the role brainstorming normally reaches
through dialogue — every genuinely contestable call is flagged explicitly below instead of silently
resolved. The human reviewing this (and the resulting plan) is the approval gate that would
normally have happened turn-by-turn.

## What this covers

Part 4 of the `reasonable` 3.0 roadmap (`docs/superpowers/plans/2026-07-08-reasonable-3.0-roadmap.md`):
build `lib/graph.mjs` — the containment-tree fold, the four dependency-edge computations
(`needs`/`excludes`/`serves`/`informs`), edge lifting, and the as-lived-vs-current projection split
— per `docs/DESIGN-3.0.md` §2, §2.1–§2.4. This is planning only; nothing here is implemented yet.

Parts 1–3 shipped real, inspectable ground truth this doc reads directly rather than re-deriving
from prose alone: `lib/effects.mjs` (shape-only validation of `{nodeId,change}` node effects and
`{from,to,edge,op}` edge effects — `EDGE_NAMES = ['needs','excludes','serves','informs']`),
`lib/atom.mjs` (the atom's charter/delta/lifecycle/cohesion machinery, plus `loadAtom`/`foldAtoms` —
the derived, ledger-folded atom record), and `lib/contract.mjs`/`lib/clause-id.mjs` (the v3 grammar
— durable `<component>#c<N>` clause ids, per-clause `citations`/`demandedBy`). `docs/artifacts.md`'s
own "Effects" section already names this part by role: *"Nothing in the codebase yet folds an
`effects` entry... into a live structure or interprets it — that is future work (DESIGN-3.0's graph
engine and rewrite engine). "* Part 4 is that graph engine arriving; the rewrite engine (Part 5) is
still to come.

**Explicitly out of scope** (deferred to later parts, same discipline as Parts 1–3):
- Deciding which verdict (R1–R9) applies to a failed attempt, or applying a rewrite's effects —
  that's `lib/rewrite.mjs`, Part 5. Nothing produces a real `effects` array yet; Part 4 folds
  whatever effects DO exist (currently none) without ever asking why.
- The topology stage, the topologist, `goals.json`/`policy.json`, and the component→subeffort
  ownership map — Part 6. Part 4 cannot assume any of that data exists on disk.
- The frontier loop, spec queue, wave packing/dispatch, gate cadence — Part 7. Part 4 computes the
  graph; it does not decide what to do with it.
- Rendering (`topology.html`, the live visualizer) — later parts' concern; Part 4 produces the data
  those views would read, nothing more.

## The central scoping fact this design turns on

**Nothing in this codebase has ever written a real `effects` array, and nothing will until Part 5
exists.** `lib/atom.mjs`'s six event-writing functions (`charterAtom`, `transitionAtom`,
`authorDelta`, `enrichDelta`, `setFlag`, `clearFlag`) call `append()` with plain, un-wrapped payloads
— no `effects` key on any of them (verified by reading the shipped file, not assumed). This is not a
bug to fix here (retrofitting `lib/atom.mjs` is out of this part's declared file list — see Decision
1) — it is the honest starting condition Part 4 must fold correctly: **dependency edges
(`needs`/`excludes`/`serves`/`informs`) are never carried by `effects` today; they are always
*derived*, exactly as §2.2 says twice ("computed by the fold... never hand-stored or hand-repaired").**
The `effects` channel exists for a narrower purpose — a *rewrite's* structural intervention (R6
inserting a placeholder and rewiring citations, R2 widening a blast radius) that can't be re-derived
from citations alone because it changes what the citations *mean*, not just what they say. Until
Part 5 fires a rewrite, that channel is empty. This has a clean, testable consequence pinned as
Decision 5 below: **as-lived and current graphs are provably identical today**, and the divergence
check Part 4 must build (§2.4's own requirement) has real, current value anyway — it catches disk
drift (a contract hand-edited outside the ledger-governed pipeline), not just future rewrite skew.

## Decision 1 — File layout: one new file, `lib/graph.mjs`, no CLI, nothing else touched

The roadmap table names exactly one new file for this part. Unlike Part 3 (which grew one file
across two dependency-ordered tasks because the pure and I/O halves of *one concept* — the atom —
belonged together), Part 4's pure functions (containment, edge computation, lifting) and its
ledger/contract-reading functions (the two projections, divergence) are still one coherent concept —
"the graph" — so they stay one file, organized top-to-bottom pure-then-reading exactly like
`lib/atom.mjs`'s own section split.

**No CLI.** `lib/footprint.mjs` and `lib/citation-resolve.mjs` are runnable scripts; `lib/contract.mjs`
and `lib/atom.mjs` are pure importable libraries with none. Nothing in the current engine — no
workflow, no agent, no hook — reads a graph yet (that starts at Part 6/7), so a CLI here would be
speculative surface with no caller, the same restraint Part 1 and Part 3 already exercised.
`lib/graph.mjs` is a library, imported by tests and by whichever future part needs it first.

**No `graph.json` disk mirror, and no `lib/ledger.mjs` change.** DESIGN-3.0 §2.4 says `graph.json` is
"regenerated on ledger append by the ledger controller," which implies wiring a
`writeGraphMirror(root)` call into `append()` alongside the existing `writeMirror(root)` call for
`progress.json`. **This part does not do that.** Nothing reads `graph.json` yet (no visualizer, no
Part 6/7 consumer exists), so writing it on every append would be regenerating a file for an
audience of zero — the same "don't predict, don't build past what's needed" restraint the design's
own thesis argues for (D2 §5.4, quoted repeatedly across Parts 1–3's docs). `lib/graph.mjs` exports
the fold/derive functions; **wiring a disk mirror into `append()`'s hot path is deferred to whichever
part first needs to read `graph.json` from outside a test** (most likely Part 7's live view, or an
earlier ratification-surface need from Part 6 — either can add the three-line `append()` change
against real requirements, cheaply, once it exists).

**Flagged as contestable:** an alternative reading treats "`graph.json`... regenerated on ledger
append" as load-bearing *now*, not later, and would add the mirror wiring in this part regardless of
who consumes it (parity with `progress.json`'s own precedent, which long preceded most of its
consumers). Not taken here because it is pure unconsumed surface area today and cheap to add exactly
when the first real consumer needs it — but this is a proportionality judgment call, not a derived
fact, and a reviewer weighing "ship the mirror early for uniformity" over "ship only what's used"
would reasonably choose the other way.

## Decision 2 — The containment tree: flat-by-component today, an optional ownership map tomorrow

§2.1 says an atom's parent is "derived: its component, through the ratified
component→subeffort ownership map (part of genesis, §5)." That map is topology-stage output —
**Part 6, not built, no ledger event type for it exists.** Part 4 cannot invent Part 6's grammar any
more than Part 3 could invent an `intention:` premise tag before `intention.md` was clause-addressed
(that part's Decision 3, an identical shape of gap).

**Decision:** `containmentTree(atoms, { ownershipMap } = {})` builds the tree from whatever
`atoms` (an array of folded atom records, i.e. `Object.values(foldAtoms(effortRoot))`) and an
*optional* `ownershipMap` (`{ [component]: subeffortPath }`, a plain string path like
`'button/processing'`) it's given. **Absent an ownershipMap, every atom's parent is a single flat
node named after its own `component`, directly under the effort root** — a one-level containment
tree, one child per distinct component, atoms nested under their own component's node. This is not a
workaround; it is the degenerate case the design's own vocabulary already sanctions (§3's own
Ruling: "the slice is a degenerate case... a computed view, not a scheduling unit") applied one level
up — a flat containment tree is what the data honestly supports when no subeffort hierarchy has been
ratified yet, not a wrong model standing in for a right one. When Part 6 lands and produces a real
ownership map, it becomes an input to this same function — no output shape change, richer input.

**Why `component` and nothing finer:** it is the only ownership signal an atom charter actually
carries today (`charterAtom`'s required `component` field, Part 3). Grouping by anything else
(locus glob, premise tag) would be inventing structure this design explicitly reserves for the
topologist.

**Flagged as contestable:** the fallback could instead put every atom directly under the effort root
with no intermediate grouping at all (containment depth 1, not 2) — flatter still. Component
grouping was chosen because §2.1's own worked example ("a `button` subeffort holds a `processing`
subeffort and a `db-operations` subeffort") is itself component-shaped, and grouping by component
costs nothing extra (the data is already on every atom) while giving early containment views
*something* to look like, however provisional. Either fallback is replaced wholesale once a real
ownership map exists, so the cost of picking "wrong" here is one degenerate view, not a migration.

## Decision 3 — `needs`: clause-id matching, ledger-derivable, never requires a live contract

§2.2's table: `needs` = "readiness: A cannot start before B lands... citation closure over contract
deltas — A's delta cites clause ids B introduces." This is **clause-level**, unlike 2.x's
component-level `citationClosure` (`lib/contract.mjs`) — durable clause ids (`lexer#c12`, Part 2)
make this direct: a delta clause's `citations` array is `{component, clause}` pairs where `clause` is
already a full clause id string.

**`needsEdges(atoms)`** (pure, no `effortRoot`, no disk read): for every atom A, for every clause in
`A.deltaClauses`, for every citation `{clause: clauseId}` in that clause's `citations`, find the atom
B whose `deltaClauses` contains a clause with `clauseId === citation.clause` (matched by durable id,
never by array position — ids are globally unique and never reused per Part 2's Decision 1/`Ruling`).
If found and `B.id !== A.id`, emit `{from: A.id, to: B.id, edge: 'needs', op: 'add'}`. **A citation to
a clause id that belongs to no currently-tracked atom's delta produces no edge at all** — it's either
a clause that already landed before any atom tracked it (already-satisfied context, not a graph
dependency) or a genuinely dangling citation (`lib/contract.mjs`'s own `danglingCitations()` already
polices that, orthogonally — not this function's job to re-flag it).

**Why this needs no live contract file:** every delta clause's full shape (`clauseId`, `citations`,
`demandedBy`, `locus`) is already embedded **inline in the ledger event** that authored or enriched
it (`atom-delta-authored`'s `clauses` field, `delta-enrichment`'s `clause` field — both verified
against the shipped `lib/atom.mjs`). `foldAtoms()` already reconstructs every atom's full
`deltaClauses` from the ledger alone. This is what makes the **as-lived** projection (Decision 5)
possible without touching disk at all — a direct instance of §2.4's "the ledger is self-sufficient"
ruling, not an aspiration this design has to reach for.

**Merged atoms still produce `needs` edges.** Whether a `needs` edge still *blocks* something once B
reaches `merged` is a readiness/dispatch question — Part 7's frontier loop, not this part's. Part 4
computes the structural fact ("A's delta cites a clause B's delta introduces"); interpreting it as a
scheduling constraint is deliberately left to the part whose job that is (same "compute the data,
don't apply the verdict" boundary Part 3's Decision 5 drew for the R-code table).

## Decision 4 — `excludes`: pairwise footprint intersection, ledger-native citation graph, resource claims flagged as a real gap

§2.2: `excludes` = "footprint intersection (locus ∪ citation closure ∪ resource claims) at the
**contract level**, exactly as 2.x `footprint.mjs` — conservative by construction; same-contract
atoms always serialize."

**`excludesEdges(atoms, { citationGraph } = {})`**: for every pair of atoms, build each one's
footprint — `locus` (its delta clauses' `locus` arrays, falling back to the charter's own coarse
`locus` before a delta exists — the planned/actual fidelity split §2.2 already names) ∪
`citationClosure(citationGraph, seeds)` where `seeds` = `{atom.component} ∪ {every component any of
its delta clauses cites}` ∪ `resourceClaims` (see gap below) — then applies the **exact same
independence test** `lib/footprint.mjs`'s `independent()` already implements (locus ancestor-overlap,
then set intersection on contracts, then set intersection on resources), reimplemented locally
rather than imported (mirrors why `lib/atom.mjs` reimplemented `lociOverlap`/`prefix` instead of
importing them — those two helpers are `footprint.mjs`'s private CLI-script internals, not an
exported library surface). **Same-contract atoms always serialize** falls out for free: two atoms
sharing one `component` always share at least that component in their citation closures (an atom's
own component seeds its own closure), so the intersection is always non-empty — no special case
needed, exactly the "falls out structurally" shape Part 3's Decision 6 preferred over a bolted-on
special rule.

**`citationGraph` is a parameter, not a fixed call, because the two projections need different
sources** (Decision 5): the as-lived projection passes a **ledger-native** citation graph built
purely from folded atom delta clauses (`{[atom.component]: [...cited components across all its delta
clauses]}`, unioned across every atom, then closed transitively with the exact same reachability
algorithm `lib/contract.mjs`'s `citationClosure` already uses — reimplemented locally over the
ledger-native graph rather than imported, since `lib/contract.mjs`'s version is disk-bound); the
current projection passes the real, richer `lib/contract.mjs.citationGraph(effortRoot)` (every landed
clause across the whole codebase, not just what atoms still track) unioned with any still-unmerged
delta citations. This keeps `excludesEdges` itself agnostic to where its graph came from — the same
separation of concerns `lib/atom.mjs`'s `cohesionComponents(clauses, componentRoot)` already
practices (the caller supplies the root; the function doesn't derive it).

**Flagged as a real, un-owned gap: resource claims.** No atom charter or delta field carries anything
like 2.x's `wo.resourceClaims` — Part 3's charter shape (`component, premises, purpose, locus,
order`) and delta-clause shape (`clauseId, citations, demandedBy, locus`) have no such field, and nor
does the 7-part roadmap table assign a home for adding one. **This part does not invent one** — adding
a field to the atom's shape is out of `lib/graph.mjs`'s declared scope (it would touch
`lib/atom.mjs`, not listed), and guessing its shape risks the same "second, incompatible attempt
later" risk Part 3's Decision 3 named for the intention-tag gap. `excludesEdges` treats every atom's
resource-claims set as **always empty** until some future part adds the field — under-approximating
`excludes` this way is the *safe* direction of error (§2.2: "conservative by construction — over-
approximation forfeits parallelism, never correctness" — an *absent* resource-claim can only ever
cost missed parallelism opportunities from the atoms that WOULD have claimed a resource, never
produce an incorrect edge, since the field literally carries no data yet to be wrong about). Surfaced
here, in this plan's docs task, and in the parent roadmap, exactly like the intention-tag gap was.

## Decision 5 — As-lived vs. current: two composed functions, provably identical today, real value now via divergence

§2.4: as-lived-at-seq = "fold of recorded effects up to that seq... same ledger ⇒ same as-lived
graph... what crash recovery replays and what a visualizer scrubs." Current = "the replayed structure
+ edges re-derived fresh from today's canonical contract tree and atom specs... a pure function of
(ledger, current disk state)."

**`foldAsLived(effortRoot, { uptoSeq } = {})`**: folds every ledger event up to `uptoSeq` (default:
the whole ledger) two ways — (a) atom node/state/containment, by reusing `foldAtoms`'s own logic
bounded to events at or before `uptoSeq` (a thin seq-bounded variant, not a reimplementation — see
Decision 6 on why this needs one small addition to `lib/atom.mjs`'s read side, or a local
reimplementation, decided there); (b) dependency edges, computed by `needsEdges`/`excludesEdges`
fed the **ledger-native** citation graph (Decision 4) — i.e., using *only* what the ledger itself
records, never a live contract file.

**No `effects`-array overlay layer, on purpose.** An earlier pass through this reasoning sketched a
third step — layering recorded `effects` edge-entries on top of the derived `needs`/`excludes` set
as explicit add/remove overrides. This part does **not** build that layer. Two reasons, not one:
first, the central scoping fact already establishes that no event in this codebase carries a real
`effects` array, so the layer would be exercised only by a hand-crafted synthetic fixture, never a
real scenario the engine produces — the same category of premature machinery Part 1 and Part 3 both
declined to add ahead of a real caller. Second, and more load-bearing: an `add`/`remove` override
needs real **precedence semantics** against a derived edge this design never worked out (does a
recorded `remove` outlive a re-derivation that would recompute the same edge from citations that
haven't changed? does an `add` for an edge kind the derivation itself already computes double-count
or dedupe?) — semantics only Part 5's rewrite engine can answer, because only a rewrite ever
produces one. Building the overlay now would mean guessing that precedence rule blind, exactly the
kind of prediction this design's own thesis warns against. `foldAsLived`'s edges are therefore
**100% derived, every time** — which still satisfies §2.4's "as-lived is self-sufficient" ruling
(no live contract file is read), it just means the `effects`-carrying half of that ruling — a
rewrite's recorded structural intervention overriding derivation — starts with Part 5, not here.

**`deriveCurrent(effortRoot, { goals, spikeInforms } = {})`**: folds atoms live (`foldAtoms`, full
ledger, no seq bound), then computes `needs`/`excludes` using the **real, live**
`lib/contract.mjs.citationGraph(effortRoot)` (the richer, whole-codebase picture, including
clauses no atom tracks any more because they already landed) instead of the ledger-native graph, and
computes `serves`/`informs` from whatever `goals`/`spikeInforms` the caller supplies (Decision 7 —
empty when omitted, which is always, today).

**The two are provably identical right now** — stated plainly, not hidden: no ledger event in this
codebase carries an `effects` array (Decision 0/central scoping fact), and every atom's delta clauses
are fully present in the ledger by construction (Decision 3), so `foldAsLived`'s edge computation and
`deriveCurrent`'s edge computation differ only in *which* citation graph seeds the closure — and for
an effort where every landed clause reached the contract file *through* an atom's own tracked merge
(the only path this engine's own pipeline permits), the ledger-native graph and the live
`citationGraph()` describe the same facts. **Divergence is not a someday feature — it has a real
job today: catching a contract hand-edited outside the ledger-governed pipeline** (a clause added,
removed, or re-cited directly in a `.reasonable/contracts/*.md` file, bypassing every atom event) or
an atom whose ledger says `merged` while its clauses are, in fact, absent from disk (a reverted merge
commit with no compensating ledger event). Both are real failure modes this engine has no other
mechanical check for today.

**`graphDivergence(effortRoot)`**: computes `foldAsLived` and `deriveCurrent`, diffs their node sets
and edge sets (simple set difference — no fuzzy matching), returns `{ nodesOnlyAsLived, nodesOnlyCurrent,
edgesOnlyAsLived, edgesOnlyCurrent }`. **Surfacing this at a gate is not built here** — that's a
retro/gate-cadence concern (existing 2.x `retro` skill today; Part 7's gate machinery once it
exists) — Part 4 only computes the diff, the same "compute, don't apply" boundary drawn everywhere
else in this series.

## Decision 6 — `foldAsLived`'s seq-bounded atom fold: a local reimplementation, not a `lib/atom.mjs` change

`foldAtoms`/`loadAtom` (Part 3) always fold the **whole** ledger — there is no `uptoSeq` parameter,
and adding one would modify an already-shipped, already-reviewed file outside this part's declared
scope (Decision 1's same restraint).

**Decision:** `lib/graph.mjs` takes its own local copy of the seq-bounding logic — a private
`foldAtomsUpto(events, uptoSeq)` that filters the events array to `e.seq <= uptoSeq` **before**
calling the *exact same* per-atom fold `lib/atom.mjs` already exports indirectly... except
`foldOneAtom` is **not exported** (verified: `lib/atom.mjs`'s only I/O exports are `charterAtom`,
`transitionAtom`, `authorDelta`, `enrichDelta`, `setFlag`, `clearFlag`, `loadAtom`, `foldAtoms` — the
per-event fold switch itself is a private helper). Since `foldAtoms(effortRoot)` always reads and
folds the *whole* ledger file itself (it calls `readJsonl` internally — there's no way to hand it a
pre-filtered event array), Part 4 cannot compose a seq-bounded fold out of Part 3's public surface at
all without either (a) a small additive export from `lib/atom.mjs` (a two-line change: export
`foldOneAtom` and accept an already-loaded `events` array as a parameter to a new
`foldAtomsFromEvents(events)`), or (b) a full local reimplementation of the per-atom fold switch
inside `lib/graph.mjs`.

**Decision: (a), a small additive export from `lib/atom.mjs`.** Reimplementing the fold switch
locally (b) would duplicate `lib/atom.mjs`'s six-case `switch` statement verbatim — a second copy
that silently drifts the moment Part 3's event vocabulary grows (e.g., a future flag type), which is
exactly the kind of parity risk the Three Laws (Law 1: parity) exist to prevent. Exporting
`foldOneAtom` (rename to `foldAtomFromEvents(events, atomId)` for a clearer public name) and adding a
one-line `foldAtomsFromEvents(events)` (the existing `foldAtoms` body, minus its own `readJsonl` call)
is a **strictly additive** two-function export from an already-shipped file — zero behavior change to
`foldAtoms`/`loadAtom`'s existing callers (they keep calling exactly as before; the new exports are
pure refactors of already-tested logic to also be callable pre-filtered). This is the one place this
part's file list needs a footnote beyond `lib/graph.mjs (new)`: **`lib/atom.mjs` gets a small,
additive, backward-compatible export change**, not a new file, not a behavior change to anything that
already calls it.

**Flagged as contestable:** the alternative (full local reimplementation, keeping `lib/atom.mjs`
completely untouched) is more conservative about touching a landed file, at the cost of a fold-logic
fork that must be kept in sync by hand forever after. Rejected here on the same parity grounds Part
3's own Decision 7 used to justify reimplementing `footprint.mjs`'s locus helpers locally (there, the
target helpers were *private* and *semantically distinct* — neither is true here; `foldOneAtom` is
the *same* semantics Part 4 needs, just presently unreachable pre-filtered, which is a real
difference from Part 3's case and the reason this decision goes the other way).

## Decision 7 — `serves`/`informs`: pure functions against explicit parameter shapes, always empty today

Both edge kinds name upstream data that doesn't exist in this codebase yet: `serves` needs
`goals.json` (§3, Part 6 — the topology stage); `informs` needs a "spike-insert rewrite event" (§7
R5, Part 5 — the rewrite engine; 2.x's existing spike mechanism tracks a spike as a Family-1
progress-tree node, `kind: 'spike'`, not as a 3.0 rewrite-engine event that produces graph edges).

**Decision:** implement both as pure, fully-tested functions against an explicit, self-contained
parameter shape this design pins now, rather than leaving them unbuilt or guessing at
`goals.json`'s/Part 5's eventual real shape beyond what §2.2 already states:

```
servesEdges(atoms, goals)
  // goals: Array<{ id: string, scenarioCitations: Array<{component, clause}> }>
  // For each goal, reverse-reachability from its scenarioCitations over the SAME ledger-native
  // (or live) citation/needs graph: any atom whose delta introduces, or transitively feeds, a
  // cited clause serves that goal. Emits {from: atom.id, to: goal.id, edge: 'serves', op: 'add'}.

informsEdges(atoms, spikeInforms)
  // spikeInforms: Array<{ spikeId: string, atomId: string }>  (one entry per recorded
  // spike-insert rewrite event, once Part 5 produces them)
  // Emits {from: spikeId, to: atomId, edge: 'informs', op: 'add'} directly — R5's own effect,
  // no further computation needed once the event exists.
```

Called with `goals: []`/`spikeInforms: []` (or omitted — both default to `[]`), each returns `[]`.
**This is not dead code — it's tested against synthetic fixtures now** (a hand-built `goals` array in
a unit test, exactly how Part 1's `effects.mjs` was fully tested before anything produced a real
effect), so the computation RULE is locked in and reviewable today, and wiring it to real data is a
future part's job of supplying the data, not writing the rule.

**Flagged as a real, un-owned gap, named explicitly:** the roadmap's own dependency column lists
Part 4 depending only on P1+P3 — not P6 (goals) or P5 (rewrite engine, which would produce
spike-insert events) — so this part was *always* going to reach this point with `serves`/`informs`
un-wireable to real data. This doc does not treat that as a defect to route around; it treats it as
the honest shape of building a graph engine before its two edge-source parts exist, named here so a
reviewer isn't surprised that two of four edge kinds return nothing on a live effort today.

## Decision 8 — Edge lifting: a pure per-view quotient, no memoization, no storage

§2.3: "at any drill level, a view shows one subeffort's children plus the induced edges between
them... a deterministic quotient — computed per view, never stored."

**`liftEdges(tree, edges, viewNodeId)`**: finds `viewNodeId`'s direct children in the containment
tree (Decision 2's output), and for each pair of children `(Ci, Cj)`, checks whether any edge in
`edges` connects any atom in `Ci`'s subtree to any atom in `Cj`'s subtree (a subtree membership test
— collect every atom id under each child once, then a plain set-membership check per edge, no
transitive graph algorithm needed since `edges` is already the flat list `needsEdges`/`excludesEdges`/
etc. produce). Returns one lifted edge entry per `(Ci, Cj, edgeKind)` combination that has at least
one underlying real edge — **never a count, never a weight** (§5.2's legibility law reads *presence*
of a lifted edge between siblings, not its density-of-one-kind; a "hairy bundle" is about how many
*distinct sibling pairs* carry an edge, which this shape already supports without extra bookkeeping).
Pure, no caching — recomputed on every call, exactly as designed ("never stored").

**Not built here:** the legibility law's own bounded-width/bounded-tangle *checks* (§5.2 — B, the
density threshold) are `lib/legibility.mjs`'s job, explicitly Part 6's file per the roadmap table.
`liftEdges` supplies the quotient the legibility check would consume; it does not itself decide
whether a view is "too tangled."

## Decision 9 — Fidelity: this part only builds the *actual* (clause-level) edge computation

§2.2 names two fidelities: **planned** (component-level quotient + the topologist's ratified
intra-component ordering — genesis-time data, Part 6) and **actual** (clause-level citations, once a
delta exists — Part 3's own data). "Only actual edges govern packing, footprints, dispatch, and
merges," but planned edges still "order the frontier and feed the legibility checks."

**Decision:** Part 4 implements **actual-fidelity edges only** (Decisions 3–4, 7 above all operate on
delta clauses / live contracts, which only exist post-spec). **Planned-fidelity edges — the
component-level quotient atoms would carry from `chartered` before any delta exists — are out of
scope here**, because the second half of planned fidelity (the topologist's ratified intra-component
ordering, genesis-time data) doesn't exist without Part 6, and a component-quotient-only edge
computation with no ordering data to combine it with would be half a feature guessed into a shape
Part 6 might not match. This mirrors exactly how Part 3 deferred the `chartered`-stage-only R2 edge
(its Decision 5's flagged gap) rather than build half of a rule the owning part hasn't specified yet.
An atom sitting in `chartered`/`ready` (no delta yet) simply has no dependency edges in this part's
graph until it reaches `spec'd` — an honest gap, not silently papered over with a guessed
approximation.

## No new ledger event types, no `EVENT_SCHEMAS` change

Part 4 reads; it never writes a ledger event. `lib/ledger.mjs` is untouched by this part (Decision 6's
`lib/atom.mjs` export addition is the only other-file touch this part makes, and it isn't a schema
change either — no new `EVENT_SCHEMAS` entry, no new event `type`).

## Version bump: minor, automatic — purely additive

One new file (`lib/graph.mjs`) plus one small, additive, backward-compatible export addition to
`lib/atom.mjs` (Decision 6) — zero behavior change to any existing caller of either file, the same
shape as Parts 1 and 3. Current version `3.1.0` → `3.2.0`. `CLAUDE.md`'s automatic-minor-bump rule
applies without a human gate.

## Task/wave shape (indicative — the actual plan pins the real breakdown)

Roughly the same proportion as Parts 1/3 (both purely additive, no migration/consumer-regression
concern), a little larger given four edge kinds plus two projections plus lifting:

- **U1** (triad) — pure containment + edge computation: `containmentTree`, `needsEdges`,
  the local ledger-native citation-graph/closure helpers, `excludesEdges`, `servesEdges`,
  `informsEdges`, `liftEdges`. One file, one concept, tested against synthetic atom-record fixtures
  (no live ledger needed for this half).
- **U2** (triad) — the two projections + divergence: `foldAsLived`, `deriveCurrent`,
  `graphDivergence`, plus the `lib/atom.mjs` export addition from Decision 6 (small, reviewed
  alongside since U2 is the only consumer). Needs real ledger fixtures (throwaway git repos, same
  pattern every existing `test/*.test.mjs` uses).
- **U3** (direct) — docs: `docs/artifacts.md`'s note on the graph engine (superseding the "future
  work" line the Effects section currently carries) + `docs/glossary.md`'s new terms (**Containment
  tree**, **Dependency graph**, **Needs**, **Excludes**, **Serves**, **Informs**, **Edge lifting**,
  **As-lived graph**, **Current graph**) plus the resource-claims and planned-fidelity gaps named
  explicitly, mirroring Part 3's intention-tag gap treatment.
- **U4** (direct) — version bump (minor, automatic) + full-suite run.

## Self-review

- No placeholders/TBDs above — every decision has a concrete shape, including the two flagged,
  named, un-owned gaps (resource claims, planned-fidelity edges) and the one contestable
  proportionality call (no `graph.json` disk mirror yet).
- Internal consistency checked: Decision 5's "provably identical today" claim depends on Decision 3's
  "delta clauses are fully ledger-embedded" fact and the central scoping fact's "nothing writes
  `effects` yet" — both verified against the actually-shipped `lib/atom.mjs`, not assumed from
  DESIGN-3.0 prose alone.
- Scope check: stays inside "containment fold, edge computation, lifting, the two projections" — no
  verdict routing (Part 5), no topology/legibility/goals (Part 6), no frontier/dispatch (Part 7),
  matching the roadmap's explicit exclusions and this doc's own "explicitly out of scope" section.
- Ambiguity check: every open DESIGN-3.0 sentence read two ways (whether `effects` is required on
  lifecycle events, what "citation closure" means without a live contract, the containment fallback
  with no ownership map, whether `graph.json` needs writing now) got an explicit pick plus its named
  alternative, rather than a hedge.
- Cross-part dependency check: every field this part's functions need from Part 2/Part 3
  (`clauseId`, `citations`, `demandedBy`, delta-clause `locus`, the atom record shape, `EDGE_NAMES`)
  is confirmed present in the *shipped* code (`lib/contract.mjs`, `lib/clause-id.mjs`,
  `lib/atom.mjs`, `lib/effects.mjs`), not assumed from the design docs alone — verified by reading
  all four files before writing this doc. The one genuine cross-part touch this doc proposes
  (Decision 6's `lib/atom.mjs` export addition) is named, justified, and scoped to two new exported
  functions with zero change to existing ones.
