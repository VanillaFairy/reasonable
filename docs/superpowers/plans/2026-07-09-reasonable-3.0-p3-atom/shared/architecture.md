# Architecture — Part 3: The Atom

## What this part is for

`docs/DESIGN-3.0.md` §4 replaces the 2.x work order with **the atom** — "the 3.0 work order, but
in two parts born at two different times": a genesis-time **charter** (component, premises,
purpose, coarse locus, ordering — no behavioral musts) and a spec-time **delta** (the actual
proposed clauses, each carrying `demanded-by` provenance). §4.1 pins a full lifecycle state
machine and three orthogonal flags. §4.3 pins the **minimality law**: a delta's clauses must form
one connected component of a "clause-cohesion graph," or it must split (R4).

This part's whole job is to build `lib/atom.mjs`: the charter/delta shapes, the lifecycle
adjacency table, the cohesion algorithm, and just enough ledger integration to allocate an atom
id, record a charter, record a delta (initial or in-flight-enriched), record a lifecycle
transition, and set/clear a flag. It does **not** decide *when* any of that happens (that's the
frontier loop, Part 7), **not** decide *which* verdict (R1–R9) applies to a failed attempt or
apply one (that's the rewrite engine, Part 5), and **not** fold atoms into the dependency graph
(that's Part 4). Exactly like Part 1 validated `effects` shape without interpreting an effect, and
Part 2 validated grammar shape without resolving what a citation points to, this part computes the
atom's own internal mechanics without deciding how the rest of the engine drives them.

The full design reasoning — including every place DESIGN-3.0 left a concrete shape unstated, and
which alternative was rejected and why — lives in
`docs/superpowers/specs/2026-07-09-reasonable-3.0-p3-atom-design.md`. This file summarizes the
load-bearing decisions task-writers need; read the design doc for the full argument behind each
one.

## Why one file (`lib/atom.mjs`), grown across two tasks, instead of a further split

Parts 1 and 2 each split a pure half from an I/O half into **two** files (`lib/effects.mjs`
alongside `lib/ledger.mjs`'s one-line change; `lib/clause-id.mjs` alongside `lib/contract.mjs`'s
rewrite) because in both cases an *existing* file (`lib/ledger.mjs`, `lib/contract.mjs`) already
owned one half and only needed to import the other. Part 3 has no such existing file to split
from — the roadmap names exactly one new file, `lib/atom.mjs`, for the whole part.

The two genuinely different concerns still exist inside it:

- **Pure** — `LIFECYCLE_STATES`, `TERMINAL_STATES`, `FLAG_NAMES`, `isValidTransition`,
  `cohesionComponents` (+ its private locus-overlap helper). Zero I/O, takes only in-memory data
  (arrays of clause objects, state-name strings), same "generic component with no
  `reasonable`-specific I/O" pattern `lib/effects.mjs` and `lib/progress-tree.mjs` already use.
- **I/O** — `charterAtom`, `authorDelta`, `enrichDelta`, `transitionAtom`, `setFlag`, `clearFlag`,
  `loadAtom`, `foldAtoms`. Needs `lib/ledger.mjs`'s `append()` (to write) and `lib/effort.mjs`'s
  `readJsonl` (to fold, via `loadAtom`/`foldAtoms`).

Rather than a second file, the I/O half **imports and calls the pure half directly** (same-module
function calls, no `import` statement needed) — `transitionAtom` calls `isValidTransition` before
appending; `charterAtom`/`authorDelta` don't need the cohesion algorithm at all (a later part's
pipeline calls `cohesionComponents` separately, see below). T01b writes the file's top section;
T02b **appends** the I/O section at the bottom — a deliberate, narrow exception to this plan's
usual "no two tasks touch the same file without a dependency edge" rule, permitted here because a
real dependency edge (T02b depends on T01b) exists and the two tasks own disjoint, non-overlapping
line ranges (see `conventions.md`).

## The allocation mechanism — identical to Part 2's, applied globally

**One new Family 3 ledger event: `atom-chartered`** (`required: ['component']`, the same minimal
shape as `enrichment`/`characterization`/`clause-allocated`). The atom id is `a-${seq}` — the seq
`append()` returns for *this* event, exactly Part 2's `allocateClauseId` mechanism, just without a
component prefix (DESIGN-3.0's own example, `a-0042`, is already global-looking, unlike a clause
id). No per-component counter, no fold over prior charters, no persisted registry anywhere — see
the design doc's Decision 1 for the full "why global, not per-component" reasoning, which mirrors
Part 2's Decision 1 verbatim.

## The lifecycle adjacency table — mechanical validity, not verdict routing

`isValidTransition(from, to)` checks a plain, flat adjacency object — **not** keyed by R-code, and
**not** aware of *why* a transition is being taken:

```
chartered       -> ready
ready           -> spec'd
spec'd          -> packed, ready, retired-pending
packed          -> tests-red, ready, retired-pending
tests-red       -> green, ready, retired-pending
green           -> audited, ready, retired-pending
audited         -> merged, ready, retired-pending
retired-pending -> retired
```

Deciding *which* edge a failed attempt should take (R1 → `ready`, R2 → `retired-pending`, R9 →
`ready`, R7-unmerged → `ready`) is judgment `lib/rewrite.mjs` (Part 5) performs — this part only
answers "is `(from, to)` a legal move," the same narrow, mechanical question `lib/effects.mjs`
asks about a node/edge effect's shape. See the design doc's Decision 5 for the full edge-by-edge
citation back to §4.1/§7, and for the one deliberately-flagged omission (`chartered ->
retired-pending`).

**R4 (`oversized`) is not a lifecycle edge.** It's a lineage operation (parent superseded, children
chartered fresh with `parentId` recorded) that this part's `cohesionComponents` supplies the data
for (the partition proposal) but does not apply — applying a verdict, of any kind, is Part 5's job
throughout this design.

## The cohesion algorithm — computed from real data, not asserted

`cohesionComponents(clauses)` builds the clause-cohesion graph DESIGN-3.0 §4.3 pins (edges: shared
provider citation, shared `demanded-by`, loci overlapping *below the component root*) directly
from a delta's already-parsed `citations`/`demandedBy`/`locus` fields, and returns its connected
components. More than one component **is** R4's split proposal, verbatim — no extra wrapping.

Criterion (c)'s "below the component root" clause matters precisely because every clause in one
delta already shares the same `component` (a delta never spans components) — without the
root-exclusion, criterion (c) would be vacuously true for every delta, repeating the exact mistake
DESIGN-3.0 §15 records draft one making with wave-packing's footprint relation. The design doc's
Decision 6 pins the exact stripping rule.

Because the graph is computed from the artifact's real fields rather than an agent's claim, the
§4.3 anti-padding audit reduces to "re-run `cohesionComponents`, compare" — no separate
claim-grounding checker is built in this part (see Decision 6's "by construction" note).

`lib/atom.mjs` does **not** import `lib/footprint.mjs` — its `lociOverlap`/`prefix` helpers are
private (unexported) CLI-script internals, and the semantics genuinely differ (general
ancestor-overlap vs. root-stripped overlap). Criterion (c)'s helper is small and local to
`lib/atom.mjs`.

## Module boundaries after this part

- `lib/atom.mjs` (new) — pure lifecycle/cohesion (T01b) + charter/delta/enrichment/transition/flag/
  fold I/O (T02b, appended). Imports `append` from `./ledger.mjs`, `readJsonl` from `./effort.mjs`.
- `lib/ledger.mjs` — six new `EVENT_SCHEMAS` lines (`atom-chartered`, `atom-delta-authored`,
  `delta-enrichment`, `atom-transitioned`, `atom-flag-set`, `atom-flag-cleared`). Nothing else
  changes — `FAMILY_1_TYPES`, `FAMILY_2_TYPES`, `validateEvent()`'s generic loop, and `append()`'s
  own internals are untouched, exactly as Parts 1 and 2 left them.
- `lib/contract.mjs`, `lib/clause-id.mjs` — **unchanged**. This part *reads* their existing shapes
  (`citations`, `demandedBy`, `CLAUSE_ID_PATTERN`, `allocateClauseId`) but adds nothing to either
  file; a delta clause's `clauseId` is allocated by calling Part 2's existing
  `allocateClauseId` before handing the clause to `authorDelta`/`enrichDelta`, not by any new
  allocation path in `lib/atom.mjs`.
- `test/atom-lifecycle.test.mjs`, `test/atom-cohesion.test.mjs`, `test/atom-ledger.test.mjs` — new.

## Explicitly out of scope (deferred to later parts, same discipline as Parts 1 and 2)

- Folding atoms/effects into the dependency graph (`needs`/`excludes`/`serves`/`informs`) —
  `lib/graph.mjs`, Part 4.
- Deciding which R-code applies to a failed attempt, or applying its rewrite (retiring an atom,
  chartering R3/R4 children with lineage, freezing a cone) — `lib/rewrite.mjs`, Part 5.
- The frontier loop, spec queue, wave packing, and the two guard checkpoints (§7.2) — Part 7.
- Making `intention.md` clause-addressed, so a premise can cite it by id — a real, named, un-owned
  gap (design doc Decision 3); not fixed here, not silently assumed to already work.
- Any persisted, disk-cached atom registry, or a rebuild/reconcile step for one — `loadAtom`/
  `foldAtoms` compute fresh from the ledger every time, exactly like `allocatedClauseIds`.
