# Shared Interfaces — P6b: The Legibility Law

**Version:** 1.0

The exact public surface P6b adds: **one** new file, `lib/legibility.mjs`, a **pure** calculus over
`lib/graph.mjs`'s output, exporting **two** functions. Grounded in the shipped exports of
`lib/graph.mjs` (`containmentTree`, `liftEdges`, `servesEdges`, `needsEdges`, `plannedNeedsEdges`),
`lib/rewrite.mjs` (the R8 rule + `ceremonyEscalation`'s `bands`/`bandScale` contract), `lib/policy.mjs`
(the landed `policy.json` shape), and `lib/effects.mjs` (`validateEffects`) — **read them; do not
assume.**

This file pins the **contract and semantics** (signatures, the finding grammar, each measure's exact
formula, the guard's load-bearing property). The **literal implementation** lives only in `T01b`
(green); the `red` author works from the semantics here and writes their own intent-faithful test
cases — never from the green code.

## The two new exports

```js
export function legibilityFindings(graph, policy);   // → Finding[]
export function regroupingReducesTangle(proposal, tree, edges);  // → boolean
```

Both are **pure**: in-memory arguments in, plain value out. No `node:fs`, no `append`, no I/O import.
`lib/legibility.mjs` is edge-source-**agnostic** — it reads whatever `graph.edges` carries (P6a's
`plannedNeedsEdges` at genesis, or `needsEdges`/`servesEdges` post-delta). Which fidelity to feed is
the **caller's** concern (P7), never P6b's.

## What `graph` is

The object `lib/graph.mjs`'s `foldAsLived` / `deriveCurrent` return, and the shape P6b's tests build
by hand (as `test/graph-containment.test.mjs` builds trees and `test/graph-edges.test.mjs` builds edge
arrays):

```js
graph = {
  containment,  // the tree from containmentTree(atoms[, {ownershipMap}]): {id, kind, children:[...]}
  atoms,        // the folded atom records: [{ id, component, ... }]
  edges,        // [{ from, to, edge, op }] — needs/excludes/serves/informs, planned OR actual
}
```

`legibilityFindings` reads `graph.containment`, `graph.atoms` (for the atom→component map), and
`graph.edges`. A genesis caller builds `{ containment: containmentTree(charters), atoms: charters,
edges: plannedNeedsEdges(charters) }`; a live caller passes a `deriveCurrent` result. P6b special-cases
neither.

## What `policy` is (a caller-supplied object — NOT `readPolicy`'s live output)

P6b reads thresholds from a caller-supplied `policy` object shaped like P6d's `policy.json`
(`lib/policy.mjs`). **In P6b's own tests it is a synthetic fixture literal, never an import of
`lib/policy.mjs`** — Decision 3 keeps the coupling at the object-shape level; wiring `readPolicy`'s
real output into a live caller is **P7's** job (matches Call #1's additive-only scoping). P6b reads,
under `policy.legibility`:

| key | invariant | in P6d's landed grammar? |
|---|---|---|
| `maxWidth` | bounded width | **yes** (P6d) |
| `maxTangle` | bounded tangle | **yes** (P6d) |
| `maxChain` | chain smell | **yes** (P6d) |
| `maxCoupling` | cross-cone coupling smell | **no — P6b-coined** (see plan Flag 2) |
| `maxFanIn` | god-component smell | **no — P6b-coined** (see plan Flag 2) |

A threshold that is **absent or not a finite number disables its check** (yields no findings for that
invariant) — never throws, never fabricates a default. This is the shape-not-value / never-fabricate
discipline `lib/policy.mjs` and `lib/route.mjs` already hold: P6b reports against the thresholds it is
given and stays silent about the ones it is not.

## The Finding grammar (P6b owns it — see plan Flag 1)

`legibilityFindings` returns an **array of findings**. Every finding is a plain object with a common
envelope plus a kind-specific locator:

```
{ kind: <string>, metric: <number>, threshold: <number>, <locator...> }
```

- `kind` — a P6b-coined discriminator (below).
- `metric` — the measured value that exceeded the threshold.
- `threshold` — the `policy.legibility` value it exceeded (so a consumer needn't re-read policy).
- a **locator** identifying the offending node / cone-pair / component / chain.

The five finding kinds (the vocabulary P6b coins):

| `kind` | locator | `metric` | fired when |
|---|---|---|---|
| `'over-wide'` | `nodeId` | child count | a containment node has `> maxWidth` children |
| `'over-tangled'` | `nodeId` | cross-sibling density | an internal node's sibling density `> maxTangle` |
| `'cross-cone-coupling'` | `cones: [gA, gB]` | cross-cone density | two goals' exclusive cones are interlinked `> maxCoupling` |
| `'god-component'` | `component` | fan-in count | a component is depended on by `> maxFanIn` other components |
| `'over-serialized'` | `chain: [id...]` | chain length (node count) | the longest acyclic needs-chain is `> maxChain` |

**Composition contract (load-bearing — plan Flag 1).** A finding is **drop-in usable as the `proposal`
of an R8 `illegible` verdict** that `lib/rewrite.mjs` already consumes:

```js
computeVerdictEffects({ kind: 'illegible', scope: 'genesis', proposal: aFinding }, {})
//   → { ok:true, provisional:[{ nodeId:'topology', change:{ blocked:true, reason:'genesis-R8', proposal: aFinding } }], permanent:[] }
```

`rewrite.mjs`'s R8 rule (`ruleIllegible`) treats `verdict.proposal` **opaquely** — it threads it
verbatim into the topology effect and never inspects its internals (its own tests pass an arbitrary
`{ recut: 'ab' }`). So P6b **owns** the finding grammar, and "compose without either side inventing a
shape" means exactly: a finding is a valid `proposal`, and `validateEffects` accepts the resulting R8
effect. A red test pins this end to end (both `scope: 'genesis'` and `scope: 'live'`), the same way
P6d pinned the `servesEdges` composition. This is the one boundary that must round-trip; the finding's
internal fields are P6b's to shape.

## The four measures — exact formulae (semantics, not code)

### 1. Bounded width

Walk `graph.containment`. For every node with `children.length > maxWidth`, emit
`{ kind:'over-wide', nodeId: node.id, metric: node.children.length, threshold: maxWidth }`. The root
(`id: ''`) counts. Atom nodes (`children: []`) never fire. Straight off `containmentTree` child counts.

### 2. Bounded tangle (load-bearing half)

For each **internal** node `N` (a node with `≥ 2` children), lift the dependency edges to its children
and measure cross-sibling density:

```
lifted   = liftEdges(graph.containment, graph.edges, N.id)   // distinct {from,to,edge} sibling-pair edges
C        = N.children.length
density  = lifted.length / (C * (C - 1))                     // ordered sibling pairs; C ≥ 2 ⇒ denom ≥ 2
```

If `density > maxTangle`, emit `{ kind:'over-tangled', nodeId: N.id, metric: density, threshold:
maxTangle }`. Notes the red author must honor:

- `liftEdges` **dedups** by `${from} ${to} ${edge}`, so parallel underlying edges between the same
  sibling pair count **once** — density measures *distinct sibling relationships*, not raw edge count.
- `serves`/`informs` edges point at goal/spike ids that are **not** tree nodes, so they never lift
  between siblings; in practice the lifted set is `needs` + `excludes`. **Flag (plan Flag 5):** tangle
  counts both `needs` and `excludes`; a reviewer could restrict it to `needs`. Not restricted, because
  an `excludes` (serialization) between siblings is genuine coupling the metric should see.

### 3. Coupling smells (two sub-checks, both from lifted edges + `servesEdges` cones)

**Cones** come from the `serves` edges already in `graph.edges`
(`serves = graph.edges.filter(e => e.edge === 'serves')`; each is `{ from: atomId, to: goalId }`):

```
goals   = distinct serves.map(e => e.to)
cone(g) = new Set( serves.filter(e => e.to === g).map(e => e.from) )   // the atoms that serve goal g
```

At **genesis over planned edges there are no `serves` edges** (a charter has no `deltaClauses`, so
`servesEdges` is empty) — so coupling findings are naturally **vacuous at genesis**, consistent with
"the fidelity the data has." They light up over **actual** edges post-delta.

**3a — cross-cone coupling (goals not independent).** For each unordered goal pair `(gA, gB)`:

```
exA = cone(gA) \ cone(gB);  exB = cone(gB) \ cone(gA)     // exclusive members only
cross = # needs edges u→v with (u∈exA ∧ v∈exB) OR (u∈exB ∧ v∈exA)
density = cross / (2 * |exA| * |exB|)                     // skip the pair if |exA|==0 or |exB|==0
```

If `density > maxCoupling`, emit `{ kind:'cross-cone-coupling', cones: [gA, gB], metric: density,
threshold: maxCoupling }` (list `cones` sorted for determinism). **Flag (plan Flag 4):** cones can
**overlap** (a shared provider serves both goals — `servesEdges` is transitive). This metric measures
coupling between the two goals' *exclusive* atoms and treats shared membership as expected, not smelly.
A reviewer could additionally penalize cone overlap itself; not taken. The red author asserts the
**intent** (independent goals with no cross-edges → no finding; two goals whose exclusive atoms are
densely interlinked → a finding), never an over-fitted exact density.

**3b — god-component fan-in.** Over the `needs` edges, using `graph.atoms` for the atom→component map
(`byId = new Map(graph.atoms.map(a => [a.id, a.component]))`):

```
for each needs edge u→v:  sc = byId.get(u), dc = byId.get(v)
  if sc && dc && sc !== dc:  record sc as a fan-in source of component dc
fanIn(X) = # distinct source components pointing into component X
```

If `fanIn(X) > maxFanIn`, emit `{ kind:'god-component', component: X, metric: fanIn(X), threshold:
maxFanIn }`. **Flag (plan Flag 4, minor):** the design's "*before history has earned it*" temporal
nuance is a caller-context distinction (genesis-planned vs. live-actual), not a threshold P6b owns —
P6b measures fan-in against `maxFanIn`; *when* a high fan-in is premature is P7's dispatch context.

### 4. Chain smell (longest acyclic needs-chain)

Over `needs = graph.edges.filter(e => e.edge === 'needs')`, compute the longest **acyclic** path by
node count (a DAG longest-path, made cycle-safe):

- adjacency `from → [to...]`;
- memoized DFS `longestFrom(node)` = `1 + max(longestFrom(succ))` over successors **not currently on
  the recursion stack** (a back-edge into an on-stack node is ignored — see below), memoizing settled
  nodes;
- the longest chain = the max over all start nodes, with its node sequence reconstructed by following
  the max-successor.

If `longestChain.length > maxChain`, emit `{ kind:'over-serialized', chain: [...ids], metric:
longestChain.length, threshold: maxChain }` (a single finding — the one longest chain). **Cycle-safety
(not really contestable, but pinned):** `needs` edges can form a cycle **before merge** — R6
(`scc` in `rewrite.mjs`) exists precisely because this happens. A naive longest-path recursion would
infinite-loop; P6b ignores back-edges to on-stack nodes and reports the longest *acyclic* chain. A
genuine `needs`-cycle is R6's domain, not the chain metric's. **Do not import `rewrite.mjs`** (it
imports `graph.mjs`; importing it into `legibility.mjs` risks a cycle and is unnecessary) — the
on-stack guard needs no SCC pass.

### `legibilityFindings` = the union

```
legibilityFindings(graph, policy) =
  [ ...widthFindings, ...tangleFindings, ...crossConeCouplingFindings, ...godComponentFindings, ...chainFindings ]
```

Each sub-measure is disabled (contributes `[]`) when its `policy.legibility` threshold is absent or
non-finite. An empty graph, or a `policy` with no `legibility` block, yields `[]` — never a throw.

## The density-reduction guard — `regroupingReducesTangle(proposal, tree, edges)`

The validator §5.2 makes **load-bearing** — the boundary `rewrite.mjs`'s R8 rule explicitly leaves
open ("*the 'applied only if it reduces measured density' guard is Part 6's*"). It answers one
yes/no: **does this regrouping proposal genuinely reduce cross-group coupling?** — so a proposal that
inserts empty grouping strata to cosmetically restore bounded width (without reducing tangle) is
**rejected**.

**Proposal shape (P6b-coined — plan Flag 3):**

```js
proposal = { nodeId, groupOf: { <childId>: <groupLabel>, ... } }
```

`nodeId` names the node in `tree` whose children are being regrouped; `groupOf` maps each **direct
child id** of that node to a new group label. A child absent from `groupOf` defaults to its **own
singleton group** (keyed by its child id).

**Algorithm (raw cross-group edge count — provably empty-strata-resistant):**

```
N            = the node with id === nodeId in tree              (not found ⇒ return false)
childOf(x)   = the direct child of N whose subtree contains atom x   (via collectAtomIds per child)
groupOf(x)   = proposal.groupOf[childOf(x)] ?? childOf(x)
underN(e)    = both e.from and e.to are atoms under N
currentCross = # edges e with underN(e) ∧ childOf(e.from) !== childOf(e.to)
proposedCross= # edges e with underN(e) ∧ groupOf(e.from) !== groupOf(e.to)
return proposedCross < currentCross          // STRICT reduction
```

Edges considered: every `e` in `edges` whose `from` and `to` are both atoms under `N` (serves/informs
to goal/spike ids fall out naturally, so this is the `needs`+`excludes` set — the same dependency set
the tangle metric uses).

**Why this is the right metric (pin these as the guard's red tests):**

- The total edge count under `N` is **invariant** across groupings, so comparing raw cross-group
  counts is exactly comparing cross-group *density* (same denominator) — no normalization to game.
- **Empty strata are provably useless:** an empty group contains no atoms, so no edge's `groupOf`
  membership changes ⇒ `proposedCross === currentCross` ⇒ `false`. Inserting empty grouping levels to
  fake-restore width is rejected. This is the load-bearing property.
- A **trivial singleton re-label** (every child alone in its own group) leaves `groupOf ≡ childOf` ⇒
  `proposedCross === currentCross` ⇒ `false`.
- A **genuine cluster** (co-locating a coupled child pair into one group) turns their cross-child
  edges into intra-group edges ⇒ `proposedCross < currentCross` ⇒ `true`.

**Flag (plan Flag 3):** raw-count-strict-decrease is the pinned metric; the proposal's `{ nodeId,
groupOf }` shape is P6b-coined (the design names the guard by role, not by signature-of-its-input). A
reviewer could normalize to a fraction or shape the proposal as explicit group arrays; either is a
local change, because the guard gates a boolean property, not a value.

## Local helpers (private; reimplemented, not imported)

`lib/graph.mjs`'s `findNode` and `collectAtomIds` are **not exported**. `legibility.mjs` reimplements
the two tiny tree walks it needs locally — the exact judgment `graph.mjs` itself made reimplementing
`globPrefix`/`lociOverlap` from `footprint.mjs` because they were unexported (P4 Decision 4). It
**does** import the exported `liftEdges` (used verbatim for the tangle metric). No other import.

## Imports `lib/legibility.mjs` adds

```js
import { liftEdges } from './graph.mjs';
```

That is the whole import list. **Not** `effects.mjs` (the tests' validator, not a library dependency —
edge/finding literals are emitted directly, as `graph.mjs`/`rewrite.mjs` emit their string literals).
**Not** `rewrite.mjs` (would risk an import cycle; the composition is one-directional — a finding is an
R8 input, R8 never calls legibility). **Not** `policy.mjs` (Decision 3: object-shape coupling only; the
live wire is P7's). **Not** anything I/O-bearing — the file is runtime-pure.
