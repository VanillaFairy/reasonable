# Design — Reasonable 3.0 Part 6: The Topology Stage (heart № 2)

**Status:** brainstormed non-interactively, same discipline as Parts 1–5. `reasonable` is a Claude
Code plugin, not an interactive service, so this pass plays the role brainstorming normally reaches
through dialogue — every genuinely contestable call is flagged explicitly below instead of silently
resolved. Two calls were pivotal enough to confirm with the human before writing any plan; **both were
confirmed** (see *The two confirmed scoping calls*, below), and this doc is written against those
answers.

## What this covers

Part 6 of the `reasonable` 3.0 roadmap
(`docs/superpowers/plans/2026-07-08-reasonable-3.0-roadmap.md`): the **topology stage** — the second
of the methodology's two hearts (the first is P5's failure calculus). Per `docs/DESIGN-3.0.md` §3,
§5, §5.1–§5.4, §9, §17 it delivers:

- **the planned-edge fold** — the component-quotient `needs` edges plus the topologist's
  intra-component ordering (§2.2), the "planned" fidelity P4 built to a boundary and **deferred whole**;
- **the legibility law** (`lib/legibility.mjs`, §5.2) — bounded width, bounded tangle, coupling and
  chain smells, and the density-reduction guard P5 flagged as "Part 6's to build";
- **the ceremony dial** (§5.4, §3, §17) — the complexity classifier (t0-observable risk → a
  per-node complexity band) and the **phase-degeneration predicate** the roadmap says P6 "must pin,
  not leave as prose";
- **`goals.json` + `policy.json`** (§3) — the ratified planning artifacts that take over
  `route.json`'s role (priority weights, the pinned thresholds the legibility law and gate cadence
  read, and the ceremony-sizing dials);
- **the topologist** (`agents/topologist.md`, §5.1) — the route-planner reborn, the calculus's
  judgment organ; and **`topology.html`** (§5.3) — the self-contained bounded-view viewer.

Parts 1–5 shipped real, inspectable ground truth this doc reads directly rather than re-deriving
from prose:

- `lib/graph.mjs` (P4) — the fold: `containmentTree(atoms, {ownershipMap})`, `needsEdges(atoms)`,
  `excludesEdges`, `servesEdges(atoms, goals)`, `informsEdges`, `liftEdges(tree, edges, viewNodeId)`,
  `citationClosureOver`, and the two projections `foldAsLived` / `deriveCurrent` + `graphDivergence`.
  Every edge is `{from, to, edge, op}`. **`needsEdges` reads `atom.deltaClauses[].citations` —
  spec-time data a charter does not have** (the fact that makes genesis legibility need planned edges).
- `lib/atom.mjs` (P3) — the charter shape `{component, premises, purpose, locus, order}` written by
  `charterAtom` (the `atom-chartered` ledger event), the lifecycle machine, `cohesionComponents`, and
  the premise grammar `PREMISE_RE` over `DEMANDED_BY_TAGS` (`goal:|gate:|cite:|ledger:`). `foldAtoms`
  / `foldAtomsFromEvents` fold charters out of the ledger.
- `lib/effects.mjs` (P1) / `lib/rewrite.mjs` (P5) — the effect shapes and the failure calculus.
  **P5's `computeVerdictEffects` already consumes `state.bands` (a `{coneId: bandIndex}` map) and
  `state.bandScale` (an ordered band-name array), and its R8 rule already emits a regrouping proposal
  from a caller-supplied payload.** P6 is the part that produces `bands`/`bandScale` for real and
  writes the caller that measures density to validate that R8 payload — the two Part-6 boundaries P5's
  design doc named by role.
- `lib/route.mjs` — the conservative loader for `.reasonable/route.json` (the ratified slice order),
  imported by `lib/reconcile.mjs` (the recovery prologue) and read by `lib/next-action.mjs`'s
  projection. **This is the live 2.x planning artifact P6 supersedes but does not remove** (call #1).

## The two confirmed scoping calls — READ FIRST

Two decisions reshape the entire part. Both were put to the human before any plan was written (the
same discipline P5's design doc used for its one pivotal call), and both were confirmed.

### Call #1 — P6 is *additive*; the route retirement + projection rebuild is P7's migration

The roadmap's one-word file column reads `lib/route.mjs (retire)`. Taken literally that would have P6
delete `route.mjs` and rewire its consumers. **It does not, and the reason is decisive, not a
proportionality guess:**

1. **`route.mjs` is load-bearing in the live 2.x engine right now.** `lib/reconcile.mjs` — the
   *unconditional recovery prologue that runs at the start of every session* — imports `readRoute`
   and derives its next-action projection from `routeOrder`. Deleting `route.mjs` this part breaks
   reconcile, which breaks every session, which violates the roadmap's own load-bearing invariant:
   *"the plugin keeps working (and keeps passing its existing test suite) between parts."*

2. **The projection rebuild is migration, and migration is P7.** §12 lists the cutover as
   *"`route.json` → `goals.json` + `policy.json`; `route.md` retires. The `nextAction` /
   `selfCheckDirectives` projection rebuilds over goals and cones (named deliverable)"* — and pairs it
   with *"No in-place migration of live 2.x efforts … a re-genesis, not a rename"* and
   *"`reconcile.mjs` extends to replay rewrite effect sets."* The roadmap assigns the 2.x→3.0
   migration to **P7**. Rebuilding reconcile/next-action over goals+cones is that migration.

3. **This is exactly P5's seam, one level over.** P5 built `rewrite.mjs` as a pure calculus and
   deferred wiring it into `append()` to P7 — because the part that *first has a live consumer* is the
   honest owner of the wire. `goals.json`/`policy.json` have no live consumer until the frontier loop
   (P7) reads them; the topology-stage engine has no live producer until P7 dispatches the topologist
   at genesis. So P6 builds the engine, grammar, role, and viewer; P7's migration lights them up and
   retires the old path.

**Decision:** P6 adds new files **alongside** the untouched live route path. `route.mjs`, `route.json`,
`reconcile.mjs`, and `next-action.mjs` are read-from-and-imported, **never edited or deleted**. The one
exception — a small, backward-compatible **extension** of the already-shipped `lib/graph.mjs` to add
the planned-edge fold — is additive in exactly the sense Parts 1/3/4 were (P4 already added an export to
`atom.mjs` under the same rule). The physical retirement of `route.mjs` and the rebuild of the
projection over goals/cones are **P7's**, named in P7's row as the migration.

### Call #2 — P6 splits into a sub-series (P6a–P6e), planned and landed one at a time

P6 as specified is **~2–3× the size of P5** and spans five separable subsystems, one of which
(planned edges) is work P4 explicitly deferred. The writing-plans skill's scope check says a spec this
size should split into one plan per subsystem, each landing working, testable software on its own —
the identical reasoning that turned 3.0 into P1–P8. **Decision:** P6 becomes a sub-series **P6a–P6e**.
This whole-stage doc pins the cross-cutting design; each sub-part gets its own focused plan (and, where
it carries real unresolved shape, its own short design brief) written **just-in-time after its
predecessor lands** — so each reflects what the previous one actually taught (the design's own
feedback-beats-prediction thesis, applied to its own construction).

**Execution model (human-set):** the plans are authored in Opus; each sub-part is implemented by a
series of fresh **Sonnet subagents** under superpowers subagent-driven-development — one subagent per
`red` / `green` / `audit` task, Opus supervising and reviewing between waves. The ceremony that fits
this repo is the adversarial-TDD triad the earlier parts already used (it is why every `lib/*.mjs`
here has a `test/*.test.mjs` written before it), run against Node builtins with no runner.

## The sub-series

| Sub-part | Builds | New/changed files | DESIGN-3.0 | Depends on |
|---|---|---|---|---|
| **P6a** | The **planned-edge fold** — component-quotient `needs` (from `cite:` premises) + intra-component ordering (from `order`); the `planned` projection. Finishes P4's deferral. | `lib/graph.mjs` (extend, additive) | §2.2 | P3, P4 |
| **P6b** | The **legibility law** — bounded width, tangle density, coupling & chain smells, and the density-reduction guard (R8's validator). Pure over planned+actual edges. | `lib/legibility.mjs` (new) | §5.2 | P6a (measures planned edges) |
| **P6c** | The **ceremony dial** — the complexity classifier (t0 risk → band) + the **phase-degeneration predicate** (the mandated pin) + band-scale mechanics. | `lib/ceremony.mjs` (new) | §3, §5.4, §9, §17 | P6a (predicate reads the genesis graph), P6d (reads policy dials) |
| **P6d** | **`goals.json` + `policy.json`** grammar + conservative loaders (priority weights, the pinned legibility/cadence thresholds, the ceremony-sizing dials). Additive; `route.mjs` untouched. | `lib/goals.mjs` (new), `lib/policy.mjs` (new) | §3 | — (grammar only; siblings of `route.mjs`) |
| **P6e** | The **topologist role** + **`topology.html`** viewer (self-contained layered-DAG renderer; component / cone / diff views). | `agents/topologist.md` (new), `lib/topology-view.mjs` (new) | §5.1, §5.3 | P6a–P6d (the role produces all outputs; the viewer renders the graph + legibility findings) |

**Dependency order:** P6a → P6d → { P6b, P6c } → P6e. P6a is the foundation (genesis legibility is
vacuous without planned edges — a charter has no `deltaClauses`, so `needsEdges` returns `[]` at
genesis). P6d's grammar comes before P6b/P6c because both read thresholds/dials out of `policy.json`.
P6b and P6c are independent of each other. P6e sits on all of them.

Docs (`glossary.md`, `artifacts.md`) are a **ratification precondition** (§12) and land *with* each
sub-part that introduces the term/shape — not batched at the end — so the normative vocabulary never
lags the code (the same rule the earlier parts followed).

## Cross-cutting Decision 1 — module layout: five focused files, not one god-file

The roadmap's file column names only `lib/legibility.mjs`, `agents/topologist.md`, and
`route.mjs (retire)`. That under-specifies the surface exactly as it did for P4 (whose design doc added
an `atom.mjs` export) and P5 (whose doc pinned `rewrite.mjs`'s internal sections). Cramming the
legibility law + classifier + phase predicate + two grammar loaders + an HTML generator into one
`legibility.mjs` would be a god-file that violates the repo's own SRP norm (every `lib/*.mjs` today has
one clear responsibility). The clean decomposition, justified per file:

- **`lib/graph.mjs` (extend)** — planned edges belong with actual edges; the file's stated
  responsibility is *"dependency-edge computation."* P4 deferred the planned half from *this file*; P6a
  completes it, appended below the existing marker comment (the same append-don't-edit convention P4
  used to grow the file across its own triads).
- **`lib/legibility.mjs` (new)** — the legibility law is a distinct responsibility: measuring the
  *shape* of a graph against pinned thresholds. Pure over `graph.mjs`'s output. This is the roadmap's
  named file.
- **`lib/ceremony.mjs` (new)** — the ceremony dial (classifier + phase-degeneration predicate + band
  mechanics) sizes *risk*, a different responsibility from measuring *legibility*. Keeping it separate
  from `legibility.mjs` is the SRP call; keeping it separate from `rewrite.mjs` is correct too —
  `rewrite.mjs` *consumes* a band (P5), `ceremony.mjs` *computes* one.
- **`lib/goals.mjs` + `lib/policy.mjs` (new)** — two conservative JSON loaders modeled on `route.mjs`
  (absent → null-no-diagnostic; present-but-malformed → surfaced diagnostic, never a repair). Two
  files because they are two artifacts with two shapes; one-responsibility-per-file, exactly as
  `route.mjs` loads one artifact.
- **`lib/topology-view.mjs` (new)** — the `topology.html` generator: a pure `graph → HTML string`
  function (its only "I/O" is returning a string the caller writes). Separate because rendering is
  neither measuring nor sizing.
- **`agents/topologist.md` (new)** — a role constitution (markdown), not code.

## Decision 2 (P6a) — planned edges are *derived from charters*, not stored in a new artifact

§2.2 pins planned `needs` as *"(a) the component-level quotient — atom A planned-needs every atom of
component B iff A's component declares a dependency on B in the ratified topology — plus (b) the
topologist's intra-component ordering."* The open question DESIGN-3.0 leaves is **where that "declared
dependency" and "ordering" are stored.** Three options; the choice matters because it decides whether
P6a introduces a new machine-parsed artifact.

**Decision: derive both from the charters already in the ledger — introduce no new artifact.** The
charter carries everything the fold needs:

- **Cross-component (a):** a charter's `premises` are tagged references (`cite:<component>#c<N>`,
  §4.2). A `cite:` premise whose ref resolves to a *contract clause in a component ≠ the charter's own*
  is precisely "A's component declares a dependency on that component." So
  `plannedNeedsEdges(charters)` reads, for each charter A in component X, each `cite:Y#cN` premise with
  `Y` a component other than X and other than the intention layer, and emits a planned-needs edge from
  A to **every** atom of component Y (the component quotient §2.2 (a) names). Premises tagged
  `goal:` / `gate:` / `ledger:` yield no component dependency (a goal, a gate, and a rewrite event are
  not components).
- **Intra-component (b):** the charter's `order` field (a non-negative integer per component, already
  validated by `charterAtom`) *is* the topologist's ratified ordering. Within one component, A
  planned-needs its **immediate predecessor** in `order` (the minimal partial order a total order
  induces — not "all lower-ordered," which would fabricate a dense transitive fan the legibility
  tangle metric would then wrongly flag).

**Why derivation, not a `topology.json`:** §2.4's ruling is that *the ledger is self-sufficient and
edges are computed by the fold, never hand-stored.* Actual `needs` already derive from citations
(never stored); planned `needs` deriving from premises+order is the same discipline one fidelity
earlier. It also keeps P6a a *pure fold with zero new grammar* — the smallest honest thing that
finishes P4's deferral. **Flagged, contestable:** a reviewer who reads "the ratified topology" as
demanding an explicit, separately-ratified component-dependency object (distinct from the union of
charter premises) would add a `topology.json`. Not taken, because the topology gate already ratifies
the charter set, and the premises *are* the declared dependencies — a separate object would be a second
source of truth for the same fact (a DRY violation, and a drift risk the divergence check couldn't
catch because nothing else reads it). The ownership map (`containmentTree`'s optional `ownershipMap`)
stays exactly what P4 made it: an optional caller-supplied param, defaulting to `atom.component`, until
the part that first needs a non-trivial subeffort hierarchy supplies one.

## Decision 3 (P6b) — the legibility law: the four invariants, pinned as measurements

`lib/legibility.mjs` is a pure calculus over `graph.mjs`'s `containmentTree` + `liftEdges` + edge
arrays, parameterized by thresholds it reads from a caller-supplied `policy` object (P6d's shape; a
synthetic fixture in P6b's own tests). It exports one entry — `legibilityFindings(graph, policy)` —
returning an array of findings, each shaped as the **R8 payload P5's `rewrite.mjs` already consumes**
(so the two compose without either side inventing a shape). The four §5.2 invariants:

1. **Bounded width.** Any containment node with more than `policy.legibility.maxWidth` children (B,
   default ≈ 25) is a finding. Read straight off `containmentTree` child counts.
2. **Bounded tangle (the load-bearing half).** For each internal node, lift the dependency edges to
   its children (`liftEdges(tree, edges, nodeId)`) and measure cross-sibling density = lifted edges ÷
   sibling-pairs. Above `policy.legibility.maxTangle` is a finding. **The density-reduction guard**
   `regroupingReducesTangle(proposal, tree, edges)` — the validator §5.2 makes load-bearing (a
   regrouping is valid *only if it reduces measured cross-group density*, so inserting empty grouping
   strata to restore B is rejected) — is measured here, closing the exact boundary P5's R8 rule left
   open.
3. **Coupling smells.** Cross-cone lifted-edge density above threshold (goals not independent — re-cut
   or extract a shared provider); heavy fan-in on one component before history has earned it (a
   god-component warning). Both computed from lifted edges + `servesEdges` cones.
4. **Chain smells.** The longest `needs`-chain (a DAG longest-path over the `needs` subset of `edges`)
   above `policy.legibility.maxChain` (K) — over-serialization, usually false coupling a better cut
   dissolves.

At genesis these run over **planned** edges (P6a) at the component quotient — the fidelity the data
has; as deltas refine, the same functions run over **actual** edges (§5.2's "re-measured as they
refine"). P6b invents no thresholds — it reads them from `policy`; the defaults are P6d's, and their
calibration is flagged (§16). Two contexts with different teeth (genesis-R8 blocks the stage with
bounded retries; live-R8 batches to the next gate) are a *dispatch* distinction P7 owns — P6b computes
the findings; who blocks vs. batches is the frontier loop's routing.

## Decision 4 (P6c) — the complexity classifier: mechanism pinned, thresholds flagged

`classify(inputs, dials) → band` is a pure function, the direct analogue of P5's α call: **P6 pins the
mechanism, the input shape, and the band vocabulary; the numeric thresholds stay `policy.json` defaults
and are flagged uncalibrated** (§16, draft-five open edge (a) — *"the sizing classifier's inputs are
t0-observable, but its thresholds and band→cutoff maps are uncalibrated"*). The five t0-observable
inputs §5.4 names:

- `blastRadius` — citation-closure width of the touched clauses (`citationClosureOver`, a number);
- `trustedSuiteCovers` — whether a *trusted* suite already covers the locus (boolean, from
  `baseline.json`'s trusted set);
- `criticality` — correctness-criticality of the domain (an ordinal, vision-set);
- `supervision` — `'present-human' | 'autonomous'` (the run mode);
- `horizon` — the horizon **under a minimal driver** (an ordinal — the "minimal driver" clause is what
  stops the protocol qualifying itself by inflating its own footprint).

The mechanism is monotone: higher risk on any axis never lowers the band. Output is a band name from
the ordered `dials.bandScale` — **the same ordered array P5's ceremony-escalation ratchets up
through**, so classifier and calculus share one vocabulary. The band → phase-materialization cutoffs
and band → gate-cadence (N/M) indices live in `dials`; `classify` emits the band, its consumers read
the maps. **Because the dial can down-scope ceremony it is vision-class** (§3): P6d puts it in
`policy.json`, human-gated in both modes, on the enforcement-paths list, agent-unwritable — the
classifier *reads* dials, it never writes them.

## Decision 5 (P6c) — the phase-degeneration predicate, pinned mechanically (the mandated open edge)

The roadmap is explicit: *"The precise mechanical spec of that predicate is the open edge flagged for
the next attack; P6 must pin it, not leave it prose."* Draft-five open edge (b) says the same. This is
the one place the design cannot defer to a threshold — a prose predicate here is a loophole *exactly
where under-rigor is most tempting* (a struggling autonomous run talking itself out of the scaffold).
So it is pinned as three pure predicates over the genesis graph, each returning `materialize` or a
`degenerate` record (never a waived guard — a degeneration is a *proven-empty* no-op recorded as a
ledger event, §5.4).

**The scaffold predicate — `scaffoldMaterializes(genesis, lastRatified, skeletonComponents)`** — the
"*introduces a new goal-cone / touches the outer shell?*" test:

- **introduces-a-new-goal-cone** := `goalIds(genesis) \ goalIds(lastRatified) ≠ ∅` — the genesis
  `goals.json` carries a top-level scenario contract not in the last ratified one. A new goal needs its
  parked scenario suite authored and its cone driven end-to-end; the scaffold materializes.
- **touches-the-outer-shell** := ∃ a newly-chartered atom `a` such that **`a` is a depth-0 provider of
  a goal scenario** — i.e. `a` introduces a clause a goal's `scenarioCitations` directly cite (`a`
  appears in `servesEdges` at the cone boundary) — **or** `a.component ∉ skeletonComponents` (the set
  of components the walking skeleton already wires end-to-end, recorded at the last scaffold sign-off,
  the first goal gate §5). Either means the outermost end-to-end wiring changed; the skeleton must be
  re-established through it.
- **scaffold materializes** ⇔ `introduces-a-new-goal-cone ∨ touches-the-outer-shell`. Otherwise it
  **degenerates**: the effort lives wholly inside an already-skeletonized cone, the walking skeleton
  already stands, and there is nothing to author — recorded as a `phase-degenerated` event carrying the
  predicate's evaluated inputs, so a reviewer sees *ran-and-found-nothing*, never *silently skipped*.

*Flagged, minor (the one judgment residue):* "the outer shell" is drawn here as **the depth-0
scenario-provider set ∪ the not-yet-skeletonized components** — a defensible boundary that never
under-fires on a genuinely new goal and never lets a new top-level component through as "interior,"
but that a reviewer can tighten (the same shape as P5's flagged "two contracts / a seam" rung). The
predicate is *conservative*: when in doubt it materializes (runs the guard), never degenerates.

The two sibling degenerations §5.4/§6 name are simpler pure predicates in the same file, and P7 (which
owns lazy role-minimal provisioning) *applies* them to role dispatch:

- **re-chartering degenerates** ⇔ the accumulated amendment batch is empty (no amendment ⇒ nothing to
  retopologize).
- **retro cross-cone classification degenerates** ⇔ the fired goal gate spans ≤ 1 landed cone (the
  three-way divergence classification has one cone's worth of nothing to compare).

P6c pins all three as pure functions; **who dispatches or skips a role on their result is P7's frontier
loop** (§6's "role-minimal provisioning" is that dispatch, applied to the same predicate). The split is
the recurring one: P6 computes, P7 wires.

## Decision 6 (P6d) — `goals.json` and `policy.json`: additive grammar, conservative loaders

Two new machine-parsed artifacts (`*`-registered in `artifacts.md`), two loaders modeled exactly on
`route.mjs`'s conservative contract (absent → `{…: null, diagnostic: null}`; present-but-malformed →
`{…: null, diagnostic: '<reason>'}`, never a repair or a fabricated default). They live *beside*
`route.json`, which stays live until P7's migration — no dual-format compatibility to write, because
nothing reads goals/policy until P7 (Call #1).

**`goals.json`** — the ratified top-level scenario set (the parked suite, §5.5/§3): an array of goal
entries, each `{ id, scenario, scenarioCitations, ratifiedAt?, ledgerSeq? }`, where
`scenarioCitations` are the per-clause references (`component#cN`) `servesEdges` already consumes to
compute cones. Goal amendments stay human-gated, always (§3).

**`policy.json`** — the ratified priority policy: `{ weights, legibility, cadence, dials, … }` —
priority weights (integration-risk retirement, info gain, unlocks, goal proximity, staleness, cost),
the pinned `legibility` thresholds (`maxWidth`, `maxTangle`, `maxChain`, and the R8 retry bound N), the
band-indexed `cadence` floor (N/M per band, §9), and the ceremony-sizing `dials` (Decision 4). **Both
files are vision-class enforcement paths** (§3): human-gated in both modes, agent-unwritable by
capability (the fence denies it), so a struggling autonomous run can never size its own rigor down. The
topologist *proposes* them; a narrow writer or the orchestrator persists them after human ratification
(the P7 gate) — P6d builds the loaders and the grammar; the write path is P7's.

Numeric defaults ship as flagged-uncalibrated (§16): calibration is ledger-data work, not a value
invented here. The loaders validate *shape*, never *value* — a mistuned-but-well-formed policy loads
clean and is the human's to tune.

## Decision 7 (P6e) — the topologist: the route-planner reborn, enforcement-path-fenced

`agents/topologist.md` is a role constitution in the `route-planner` lineage — a **thin, mostly
read-only planner** that produces the five §5.1 outputs (component topology, the full initial
chartering, the containment tree + ownership map, the priority-policy *proposal*, and the complexity
classification) and, after genesis, supplies rewrite *payloads* on demand and proposes re-chartering
batches at gates. The load-bearing constraint, enforced by the **tool allowlist, not prose** (the repo
invariant): the topologist **proposes** `goals.json` / `policy.json`; it is on the enforcement-paths
list and **cannot write them** (they are human-gated, §3). It authors charters through the sanctioned
ledger path (charter = structure only, never a delta, never a behavioral must — §13, the 2.x law
untouched). Its allowlist mirrors `route-planner`'s read-only-plus-propose shape; **preserving that
allowlist is preserving an adversarial separation** (CLAUDE.md's standing warning). The stage
*orchestration* — when the topologist runs, the ratification gate, the analysis→topology→scaffold
sequencing — is where P6 meets P7's frontier/gate machinery; P6e delivers the role and the pure engine
it leans on, P7 wires the stage into the phase flow.

## Decision 8 (P6e) — `topology.html`: a self-contained layered-DAG viewer, generated by `lib/`

`lib/topology-view.mjs` exports a pure `renderTopologyHtml(graph, {view, lastRatified?}) → string`:
inline SVG + vanilla JS, **no CDN, no npm** (Law 1, and §5.3's explicit "no CDN, no npm"). Layered
layout: longest-path ranks, barycenter cross-reduction ordering — small, well-known, dependency-free
graph-drawing algorithms. Three views (§5.3): component topology, per-goal cone, and the **diff view**
(added / retired / rewired, color-coded against a supplied `lastRatified` graph — the human reviews
deltas, never re-reviews the world). It is a *derived, disposable* artifact — regenerated, never
edited, never parsed back (so it is not a `*` machine-parsed entry; it is an output like
`progress.html`). Because the legibility law bounds both nodes and edges (Decision 3), the views are
mermaid-scale by construction — a terminal or PR-review ratification never needs more.

## Decision 9 — reuse Parts 1–5's surfaces; touch only `graph.mjs` (additively)

Every graph/atom computation P6 needs already exists as a pure export: `containmentTree`, `liftEdges`,
`servesEdges`, `citationClosureOver`, `needsEdges` (graph.mjs); the charter shape, `PREMISE_RE`,
`DEMANDED_BY_TAGS`, `foldAtoms` (atom.mjs); the R8 payload shape and `bands`/`bandScale` contract
(rewrite.mjs/effects.mjs). P6 imports them and duplicates nothing. The **only** landed file it edits is
`lib/graph.mjs`, and only additively (the planned-edge fold, P6a, appended below the marker) — the same
judgment P4 made adding one `atom.mjs` export. `route.mjs` / `reconcile.mjs` / `next-action.mjs` /
`ledger.mjs` / `atom.mjs` / `rewrite.mjs` are imported-from, never edited (Call #1). The one genuinely
new algorithm across the whole part is the layered-DAG layout (P6e) — dependency-free, local, and only
for a disposable view.

## Docs precondition (every sub-part)

§12 makes the companion deltas a *ratification precondition*: each sub-part lands its `glossary.md`
terms and `artifacts.md` shapes **in its own final task**, not batched at the end. New normative terms
across P6: **planned edge / planned fidelity**, **legibility law**, **complexity band**, **complexity
classifier**, **phase degeneration**, **ceremony-sizing dial**, **topologist**, **goals.json**,
**policy.json**, **cone**, **stratum**. New `*` machine-parsed shapes: `goals.json`, `policy.json` (and
its dials). `topology.html` registers as a derived, non-`*` view. `route.json`'s entry gains a
"superseded by goals.json/policy.json; retired in P7" note but is **not removed** (Call #1). Where P5
already landed a term (e.g. *ceremony-escalation effect*), P6 cross-links, never re-defines.

## Version bump: NONE — P6 lands on the shared refactoring line

Per the roadmap's **2026-07-09 versioning decision**, P5–P8 are one continuous refactoring toward the
live 3.0 methodology with no consumable intermediate builds; **the plugin version stays `3.2.0`** and
bumps once, at the very end (a major bump — the methodology going live is a breaking behavior change).
Every P6 sub-part lands its code + tests **without a `chore(release)` bump** — `plugin.json` and the
two README version strings stay `3.2.0`. This overrides, for P6 as for P5, this repo's standing
"every change gets a version bump" rule; each sub-part's plan therefore carries **no
`version-bump-final-check` task**. Roadmap status moves to **`Landed — merged (no bump, 3.2.0)`** per
sub-part as it merges.

## Self-review

- **No placeholders/TBDs.** Every decision has a concrete shape, including the flagged residues (the
  classifier thresholds and band→cutoff maps uncalibrated; the "outer shell" boundary drawn
  conservatively with the judgment residue named) and the two confirmed pivotal calls (additive
  scoping; sub-series split), foregrounded because the part's whole shape hinges on them.
- **The mandated pin is pinned.** The phase-degeneration predicate is a mechanical predicate over the
  genesis graph (Decision 5), not prose — the roadmap's explicit P6 requirement, met.
- **Grounding checked against shipped code, not prose:** `needsEdges` reading `deltaClauses[].citations`
  (why genesis needs planned edges), the charter shape + `PREMISE_RE` (planned-edge derivation),
  `route.mjs`'s live consumers in `reconcile.mjs`/`next-action.mjs` (the additive call), and
  `rewrite.mjs`'s `bands`/`bandScale`/R8-payload contract (the classifier & density-guard boundaries)
  are all read from the files, not inferred.
- **Scope check:** P6 stays inside "build the topology-stage engine, grammar, role, and viewer, as new
  files alongside the live route path." No projection rebuild, no `reconcile.mjs` edit, no route
  deletion (all P7 migration); no stage orchestration wiring, no gate-cadence *dispatch*, no
  role-dispatch degeneration (all P7); no verdict typing or effect application (P5/P7). The one landed
  edit is `graph.mjs`, additive.
- **Reuse check:** every graph/atom/effect surface P6 needs is a confirmed existing export; the only
  new algorithm is the disposable-view layout.
- **Feedback discipline:** the sub-parts are planned and landed one at a time, each after its
  predecessor, so each plan reflects lived evidence — the design's own thesis applied to its build.
