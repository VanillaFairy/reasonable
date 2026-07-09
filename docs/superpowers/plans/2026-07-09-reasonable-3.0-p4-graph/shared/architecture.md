# Architecture — Part 4: The Graph Engine

## What this part is for

`docs/DESIGN-3.0.md` §2 replaces 2.x's implicit, hand-maintained progress tree with **two
orthogonal structures over one set of nodes**: the **containment tree** (effort → subefforts →
atoms, drill-down/progress, §2.1) and the **dependency graph** (`needs`/`excludes`/`serves`/
`informs` edges between atoms, restructure, §2.2), plus **edge lifting** (§2.3 — a per-view
quotient that keeps any drill-down level readable) and a strict **as-lived vs. current**
projection split (§2.4).

This part's whole job is `lib/graph.mjs`: fold atoms (Part 3's `foldAtoms`) into a containment
tree, compute the four edge kinds, lift edges for any view, and produce both graph projections plus
a divergence check between them. It does **not** decide which verdict applies to a failure or apply
one (Part 5's `lib/rewrite.mjs`), does **not** build the topology stage, `goals.json`,
`policy.json`, or the legibility checker (Part 6), and does **not** touch the frontier loop or gate
cadence (Part 7). Exactly like Parts 1–3 each validated or folded shape without deciding what the
rest of the engine does with it, this part computes the graph without deciding when anyone reads it.

The full design reasoning — including every place DESIGN-3.0 left a concrete shape unstated, which
alternative was rejected and why, and two real, named, un-owned gaps this part deliberately does not
invent a fix for — lives in
`docs/superpowers/specs/2026-07-09-reasonable-3.0-p4-graph-design.md`. This file summarizes the
load-bearing decisions task-writers need; read the design doc for the full argument behind each one.

## The one fact every task in this plan must hold onto

**Nothing in this codebase has ever written a real `effects` array.** `lib/atom.mjs`'s six
event-writing functions never attach one. This means `needs`/`excludes`/`serves`/`informs` are
*always derived* — never read off an `effects` entry — for both graph projections this part builds.
It also means the as-lived and current projections are **provably identical on any effort whose
contracts were only ever touched through this engine's own atom pipeline** — divergence, when it
appears, is a real, useful signal (a contract hand-edited outside the ledger), not a placeholder for
some future feature. Every task below should read as building something with real value *today*,
not scaffolding for parts that don't exist yet.

## Why one file (`lib/graph.mjs`), no CLI, no disk mirror

Same reasoning as Part 3's "why one file": the roadmap names exactly one new file, and the pure
edge/tree computations and the ledger/contract-reading projections are one coherent concept — "the
graph" — organized top-to-bottom pure-then-reading, the same section split `lib/atom.mjs` already
uses.

No CLI: nothing in the current engine reads a graph yet (Part 6/7 will be the first), so a runnable
script here would be unconsumed surface, the same restraint Parts 1 and 3 exercised. No `graph.json`
disk mirror, no `lib/ledger.mjs` change: DESIGN-3.0 §2.4 does say `graph.json` is "regenerated on
ledger append," but wiring that costs a change to an already-shipped hot path (`append()`) for a
file nothing reads today — deferred to whichever part first needs to read `graph.json` from outside
a test (design doc Decision 1, flagged as the one contestable proportionality call in this part).

## The one cross-part touch: `lib/atom.mjs` gets two new, additive exports

`foldAtoms`/`loadAtom` (Part 3) always fold the **whole** ledger — there's no way to hand them a
pre-filtered event array, which the as-lived projection needs (it folds only events at or before a
given seq). Rather than duplicate `lib/atom.mjs`'s six-case per-event `switch` inside
`lib/graph.mjs` (a parity risk — Law 1 — that would silently drift the moment Part 3's event
vocabulary grows), this part exports the existing private per-atom fold under a new name
(`foldAtomFromEvents(events, atomId)`) and adds its natural sibling (`foldAtomsFromEvents(events)`)
— both operating on an already-loaded events array instead of reading the ledger file themselves.
`loadAtom`/`foldAtoms` are refactored to call these two new functions internally — **zero behavior
change**, every existing caller keeps working exactly as before (design doc Decision 6). This is the
one place this part's file list needs a footnote beyond `lib/graph.mjs (new)`.

## The four edge kinds, in one sentence each

- **`needs`** — pure, clause-id matching over folded atom delta clauses (every delta clause is
  fully embedded in the ledger — no disk read needed). A cites B's clause ⇒ A needs B.
- **`excludes`** — pairwise footprint intersection (locus ∪ citation closure ∪ resource claims —
  the last always empty today, a named gap), mirroring `lib/footprint.mjs`'s `independent()`
  exactly, reimplemented locally (that file's helpers are private). **Symmetric**: emitted once per
  unordered pair, `from`/`to` ordered by atom id for determinism — unlike the other three edge
  kinds, direction carries no meaning for `excludes`.
- **`serves`** — pure, reverse-reachability over the `needs` graph from a goal's cited clauses.
  Takes an explicit `goals` parameter (no `goals.json` exists yet — Part 6); returns `[]` when
  called with none, which is always, today.
- **`informs`** — pure, a direct pass-through of recorded spike-insert facts. Takes an explicit
  `spikeInforms` parameter (no rewrite engine exists yet to produce real entries — Part 5); returns
  `[]` when called with none, which is always, today.

## The two projections, in one paragraph each

**`foldAsLived(effortRoot, {uptoSeq})`** folds atoms from the ledger alone (via
`foldAtomsFromEvents`, filtered to `seq <= uptoSeq`), builds a citation graph purely from those
atoms' own delta-clause citations (`ledgerCitationGraph` — never touches
`.reasonable/contracts/*.md`), and computes `needs`/`excludes` over it. Self-sufficient by
construction — the exact property DESIGN-3.0 §2.4 requires of "as-lived."

**`deriveCurrent(effortRoot, {goals, spikeInforms})`** folds atoms live (the whole ledger), but
computes `needs`/`excludes` over the **real**, live `lib/contract.mjs.citationGraph(effortRoot)` —
every landed clause across the whole codebase, a richer picture than what any one atom's delta
still tracks — and adds `serves`/`informs` from whatever the caller supplies.

**`graphDivergence(effortRoot)`** diffs the two (node-id sets, edge-entry sets) and returns what
differs. Surfacing that at a gate is not this part's job — it only computes the diff.

## Module boundaries after this part

- `lib/graph.mjs` (new) — pure containment/edge/lifting functions (T01b) + the two projections and
  divergence (T02b, appended).
- `lib/atom.mjs` — two new additive exports (`foldAtomFromEvents`, `foldAtomsFromEvents`); `loadAtom`
  and `foldAtoms` refactored to call them internally. Every existing export's signature and
  behavior is unchanged.
- `lib/contract.mjs`, `lib/clause-id.mjs`, `lib/ledger.mjs`, `lib/effects.mjs` — **unchanged**. This
  part reads their existing exports (`citationGraph`, `allComponents`, `EDGE_NAMES`, `readJsonl` via
  `lib/effort.mjs`) but adds nothing to any of them.
- `test/graph-containment.test.mjs`, `test/graph-edges.test.mjs`, `test/graph-projections.test.mjs`
  — new.

## Explicitly out of scope (deferred to later parts, same discipline as Parts 1–3)

- Deciding which verdict applies to a failed attempt, or applying its effects — `lib/rewrite.mjs`,
  Part 5. This part folds whatever `effects` entries exist (currently none, always) without asking
  why they're absent.
- The topology stage, `goals.json`/`policy.json`, the component→subeffort ownership map, and the
  legibility checker (`lib/legibility.mjs`) — Part 6. `containmentTree`'s flat-by-component fallback
  and `servesEdges`'s empty-goals default are this part's honest placeholders for that missing data,
  not workarounds — see the design doc's Decisions 2 and 7.
- The frontier loop, spec queue, wave packing/dispatch, gate cadence — Part 7. `graphDivergence`
  computes a diff; deciding to surface it at a gate is not built here.
- Planned-fidelity edges (component-level, pre-delta) — deferred whole, not half-built against a
  topologist ordering scheme Part 6 hasn't specified yet (design doc Decision 9).
