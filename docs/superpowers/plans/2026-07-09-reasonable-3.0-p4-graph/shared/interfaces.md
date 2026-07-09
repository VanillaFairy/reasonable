# Shared Interfaces — Part 4: The Graph Engine

Every function signature, table, and object shape below is the exact contract later tasks build
against. Do not drift from these names or shapes — later tasks reference them verbatim.

## `lib/graph.mjs` — PURE section (new — produced by T01b, consumed by T02b)

```js
// lib/graph.mjs — the containment-tree fold, dependency-edge computation
// (needs/excludes/serves/informs), edge lifting, and the as-lived/current graph projections
// (DESIGN-3.0 §2, §2.1-§2.4, reasonable 3.0 Part 4). This file has two sections: PURE (this one —
// zero I/O, takes only in-memory atom records) and I/O (appended by T02b, below the marker comment
// — reads the ledger via lib/atom.mjs's foldAtomsFromEvents and live contracts via
// lib/contract.mjs). Dependency edges are always DERIVED here, never read off an `effects` entry —
// nothing in this codebase has ever written one (design doc's central scoping fact).
```

### Atom-record shape this whole file consumes

Not a class, documented here as every function below assumes it (the exact shape
`lib/atom.mjs`'s `loadAtom`/`foldAtoms`/`foldAtomsFromEvents` already return):

```
{ id: string, component: string, premises: string[], purpose: string, locus: string[],
  order: number, state: string, flags: Set<string>,
  deltaClauses: Array<{ clauseId: string, citations: Array<{component, clause}>,
    demandedBy: string|null, locus: string[] }> }
```

### Containment

```js
/**
 * Build the containment tree (DESIGN-3.0 §2.1) from a flat list of folded atom records. Node
 * shape: { id: string, kind: 'root'|'group'|'atom', children: Array<Node> }. Absent an
 * ownershipMap (Part 6's topology-stage output — not built yet), every atom's parent is a single
 * flat group node named after its own `component`, directly under the root — a one-level
 * containment tree (design doc Decision 2, the degenerate case).
 *
 * @param {Array<{id: string, component: string}>} atoms
 * @param {{ownershipMap?: Object<string,string>}} [opts] - ownershipMap, when given, maps a
 *   component name to a '/'-separated subeffort path (e.g. 'button/processing'); each segment
 *   becomes (or reuses) one group node, nested in order
 * @returns {{id: string, kind: 'root', children: Array}} the root node (id: '')
 */
export function containmentTree(atoms, { ownershipMap } = {});
```

### `needs`

```js
/**
 * Compute `needs` edges (DESIGN-3.0 §2.2): atom A needs atom B iff some citation in one of A's
 * delta clauses names a clause id introduced by one of B's delta clauses. Pure — reads only the
 * atom records' own `deltaClauses`; never a live contract file (every delta clause is fully
 * embedded in the ledger — design doc Decision 3). Deduplicated: at most one `needs` edge per
 * (A, B) pair regardless of how many of A's clauses cite B. A citation to a clause id no
 * currently-tracked atom's delta introduces produces no edge at all.
 *
 * @param {Array<AtomRecord>} atoms
 * @returns {Array<{from: string, to: string, edge: 'needs', op: 'add'}>}
 */
export function needsEdges(atoms);
```

### The ledger-native citation graph (feeds `excludes`, both projections)

```js
/**
 * Build a LEDGER-NATIVE component citation graph from folded atom delta clauses — the same shape
 * lib/contract.mjs's citationGraph() returns ({component: [citedComponent,...]}), but sourced
 * entirely from atom records rather than live contract files (design doc Decision 5 — this is
 * what makes the as-lived projection self-sufficient per DESIGN-3.0 §2.4).
 *
 * @param {Array<AtomRecord>} atoms
 * @returns {Object<string, string[]>}
 */
export function ledgerCitationGraph(atoms);

/**
 * Transitive closure of `seeds` over `citationGraph` — the exact algorithm lib/contract.mjs's
 * citationClosure() uses, reimplemented locally (design doc Decision 4) so this module never
 * needs a live contract file — the only thing shared with lib/contract.mjs's version is the graph
 * SHAPE, not the disk-reading half.
 *
 * @param {Object<string, string[]>} citationGraph
 * @param {string[]} seeds
 * @returns {string[]}
 */
export function citationClosureOver(citationGraph, seeds);
```

### `excludes`

```js
/**
 * Pairwise `excludes` edges (DESIGN-3.0 §2.2): footprint intersection (locus ∪ citation closure ∪
 * resource claims) at the contract level, mirroring lib/footprint.mjs's independent() exactly
 * (locus ancestor-overlap, then contract-set intersection, then resource-set intersection),
 * reimplemented locally since that file's helpers are private CLI-script internals (design doc
 * Decision 4). `resources` is always `[]` today — no atom field carries resource claims yet, a
 * named, un-owned gap; an absent claim can only under-approximate `excludes` (safe direction of
 * error, never wrong — §2.2: "over-approximation forfeits parallelism, never correctness").
 * Same-contract atoms always exclude (falls out structurally: they always share at least their own
 * component in their citation closures — no special case needed).
 *
 * **Symmetric, unlike `needs`/`serves`/`informs`**: emitted once per unordered pair, with `from`/
 * `to` ordered by plain string comparison of atom id (`fa.id < fb.id`) for determinism — direction
 * carries no readiness meaning for `excludes`.
 *
 * @param {Array<AtomRecord>} atoms
 * @param {{citationGraph?: Object<string,string[]>}} [opts] - pass ledgerCitationGraph(atoms) for
 *   the as-lived projection, or lib/contract.mjs's citationGraph(effortRoot) for current
 * @returns {Array<{from: string, to: string, edge: 'excludes', op: 'add'}>}
 */
export function excludesEdges(atoms, { citationGraph } = {});
```

### `serves` / `informs`

```js
/**
 * `serves` edges (DESIGN-3.0 §2.2, design doc Decision 7): reverse-reachability from a goal's
 * scenario-cited clauses, walked backward over the same provider/citation data `needsEdges`
 * already computes (reuses it — does not re-derive citation walking). `goals` is an explicit,
 * self-contained parameter shape — no goals.json exists yet (Part 6) — so this returns `[]` when
 * called with none, which is always, today.
 *
 * @param {Array<AtomRecord>} atoms
 * @param {Array<{id: string, scenarioCitations: Array<{component, clause}>}>} [goals]
 * @returns {Array<{from: string, to: string, edge: 'serves', op: 'add'}>}
 */
export function servesEdges(atoms, goals = []);

/**
 * `informs` edges (DESIGN-3.0 §2.2, design doc Decision 7): a spike-insert rewrite event's own
 * direct effect (§7 R5) — a pass-through, no further computation needed once the event exists.
 * `spikeInforms` is an explicit, self-contained parameter shape — no rewrite engine exists yet to
 * produce real entries (Part 5) — so this returns `[]` when called with none, which is always,
 * today. An entry naming an `atomId` this call's `atoms` array doesn't contain is silently
 * dropped (conservative — never fabricates a node this call didn't see).
 *
 * @param {Array<AtomRecord>} atoms
 * @param {Array<{spikeId: string, atomId: string}>} [spikeInforms]
 * @returns {Array<{from: string, to: string, edge: 'informs', op: 'add'}>}
 */
export function informsEdges(atoms, spikeInforms = []);
```

### Edge lifting

```js
/**
 * Edge lifting (DESIGN-3.0 §2.3): given a containment-tree view node, find its direct children
 * and, for each ordered pair, lift one edge entry per (childPair, edgeKind) combination that has
 * at least one real underlying edge connecting some atom in one child's subtree to some atom in
 * the other's. Deterministic quotient, computed per view, never stored (design doc Decision 8) —
 * pure function of its inputs, no caching, no memoization.
 *
 * @param {{id, kind, children}} tree - the root returned by containmentTree()
 * @param {Array<{from, to, edge}>} edges - any flat mix of needs/excludes/serves/informs entries
 * @param {string} viewNodeId - the id of the node whose children's induced edges are wanted
 *   ('' for the root itself)
 * @returns {Array<{from: string, to: string, edge: string}>} lifted edges between view-level
 *   siblings; `[]` if viewNodeId is unknown or has fewer than two children
 */
export function liftEdges(tree, edges, viewNodeId);

// ── I/O functions appended by T02b (see shared/conventions.md — do not edit above this line) ──
```

## `lib/graph.mjs` — I/O section (appended — produced by T02b, below T01b's marker)

```js
import { foldAtomsFromEvents } from './atom.mjs';
import { readJsonl } from './effort.mjs';
import { join } from 'node:path';
import { citationGraph as liveCitationGraph } from './contract.mjs';

/**
 * The AS-LIVED graph (DESIGN-3.0 §2.4) at `uptoSeq` (default: the whole ledger). Folds atoms from
 * the ledger alone (via foldAtomsFromEvents, events filtered to seq <= uptoSeq when given), builds
 * a LEDGER-NATIVE citation graph (ledgerCitationGraph — never touches a live contract file), and
 * computes needs/excludes over it. Same ledger ⇒ same as-lived graph, always (design doc
 * Decision 5). serves/informs are never included here (no goals/spikeInforms parameter exists on
 * this function — this projection is ledger-only by definition).
 *
 * @param {string} effortRoot
 * @param {{uptoSeq?: number}} [opts]
 * @returns {{containment: object, atoms: Array<AtomRecord>, edges: Array}}
 */
export function foldAsLived(effortRoot, { uptoSeq } = {});

/**
 * The CURRENT graph (DESIGN-3.0 §2.4). Folds atoms live (the whole ledger), computes needs/
 * excludes over the REAL, live lib/contract.mjs.citationGraph(effortRoot) (every landed clause
 * across the whole codebase — richer than what any one atom's delta still tracks), and adds
 * serves/informs from whatever goals/spikeInforms the caller supplies (both default `[]` — always,
 * today, since neither Part 5 nor Part 6 exists yet).
 *
 * @param {string} effortRoot
 * @param {{goals?: Array, spikeInforms?: Array}} [opts]
 * @returns {{containment: object, atoms: Array<AtomRecord>, edges: Array}}
 */
export function deriveCurrent(effortRoot, { goals, spikeInforms } = {});

/**
 * Diff foldAsLived(effortRoot) (the whole ledger, uptoSeq omitted) against deriveCurrent(effortRoot)
 * (goals/spikeInforms omitted) — a pure set-difference over node ids and edge entries, no fuzzy
 * matching (DESIGN-3.0 §2.4: divergence "is computed and surfaced... never silently absorbed").
 * Surfacing this at a gate is NOT this function's job (design doc Decision 5) — it only computes
 * the diff.
 *
 * @param {string} effortRoot
 * @returns {{nodesOnlyAsLived: string[], nodesOnlyCurrent: string[],
 *   edgesOnlyAsLived: Array, edgesOnlyCurrent: Array}}
 */
export function graphDivergence(effortRoot);
```

## `lib/atom.mjs` (existing — modified by T02b)

**Two new exports, zero change to any existing one.** The existing private per-event fold helper
(`foldOneAtom`, defined just above `charterAtom` in the current file) becomes exported under a
clearer public name, plus its natural whole-ledger sibling:

```js
/** Fold every atom-* event belonging to `atomId` out of an ALREADY-LOADED events array — the exact
 *  same per-event switch loadAtom already uses internally, exposed so a caller holding its own
 *  pre-filtered event array (e.g. a seq-bounded slice) can fold without re-reading the ledger file
 *  itself. This is the EXISTING private `foldOneAtom` function, renamed and exported — zero change
 *  to its body. */
export function foldAtomFromEvents(events, atomId);

/** Fold every chartered atom out of an ALREADY-LOADED events array — foldAtoms's existing body,
 *  minus its own readJsonl call. The sibling seq-bounded-composition primitive lib/graph.mjs's
 *  as-lived projection needs (design doc Decision 6). */
export function foldAtomsFromEvents(events);
```

`loadAtom`/`foldAtoms` are refactored to call these two internally — **their own signatures,
return shapes, and behavior are completely unchanged**:

```js
export function loadAtom(effortRoot, atomId) {
  const events = readJsonl(ledgerPath(effortRoot));
  return foldAtomFromEvents(events, atomId);
}

export function foldAtoms(effortRoot) {
  const events = readJsonl(ledgerPath(effortRoot));
  return foldAtomsFromEvents(events);
}
```

No `EVENT_SCHEMAS` change, no new event `type`, no `lib/ledger.mjs` touch anywhere in this part.

## Error/result-shape conventions (all new functions)

- `containmentTree`, `needsEdges`, `ledgerCitationGraph`, `citationClosureOver`, `excludesEdges`,
  `servesEdges`, `informsEdges`, `liftEdges`: plain value (object or array), never throws — matches
  `cohesionComponents`'s/`citationGraph()`'s existing "operates on already-shaped data" style.
- `foldAsLived`, `deriveCurrent`, `graphDivergence`: plain object, never throws, never a `{ok,...}`
  envelope — read-only functions, matching `foldAtoms`'s existing "no charters yet → `{}`-shaped
  empty result" contract, generalized to a graph-shaped empty result (`{containment: <empty root>,
  atoms: [], edges: []}`).
- `foldAtomFromEvents`: folded record or `null` — identical contract to the existing `loadAtom`
  (this IS `loadAtom`'s current internal logic, merely exported).
- `foldAtomsFromEvents`: plain object (`{}` on an empty events array) — identical contract to the
  existing `foldAtoms`.
