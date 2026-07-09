# Task T03: Docs — artifacts.md + glossary.md

**Role:** none (docs task, not a red/green/audit triad — there's no ambiguous behavior here to
protect against self-certification, just an accurate description of what T02b landed).

## References
- Read: `../shared/conventions.md` (the fixed three-part `artifacts.md` shape; the one-bullet
  `glossary.md` shape; the "only document what this part implements" rule)
- Read: `docs/artifacts.md` lines ~869–944 (the whole `### Effects` subsection through
  `## journal.json *`, so your addition reads as part of the same `## ledger.jsonl *` section and
  you can see the exact "Scope note" text you're superseding)
- Read: `docs/glossary.md` lines ~64–107 (the **Clause** through **Topology** bullets, so your new
  entries sit in the right place)
- Read: `docs/superpowers/specs/2026-07-09-reasonable-3.0-p4-graph-design.md`'s "no effects-array
  overlay layer" note (added as an addendum to Decision 5) — the artifacts.md update must reflect
  this precisely, not overclaim that the graph engine folds `effects`

## Dependencies
- Depends on: T01c, T02c (documents landed, adversarially-reviewed behavior — not aspirational
  behavior)
- Depended on by: T04

## Scope

**Files:**
- Modify: `docs/artifacts.md`
- Modify: `docs/glossary.md`

**BOUNDARY — you MUST NOT modify any files outside this list. Do not touch any code or test file.**

## Positive Constraints (DO)
- Update the `### Effects` subsection's existing "Scope note" precisely: the graph engine (this
  part) now folds atoms and derives the containment tree and dependency edges — but it still never
  reads or interprets the `effects` field itself, because nothing has ever written a real one.
- Match `docs/glossary.md`'s existing one-bullet-per-term shape exactly: `- **Term** — definition.`
- Name both flagged, un-owned gaps (resource claims always empty; planned-fidelity edges deferred
  whole) inline in the relevant glossary bullets, mirroring how Part 3's **Premise** entry named the
  intention-tag gap inline rather than in a separate note.
- Be explicit that deciding which verdict applies to a failed attempt, and applying one, remain
  future work (Part 5); that the topology stage, `goals.json`, and the ownership map remain future
  work (Part 6) — overclaiming here would be the docs contradicting the code.

## Negative Constraints (DO NOT)
- Do NOT add glossary entries for concepts this part does not implement (`legibility law`, `cone`,
  `stratum`, `wave`, `spec queue`, `starvation quorum`, `Lineage`, `verdict`-as-rewrite-outcome,
  `rewrite`, `frontier`) — those belong to whichever future part actually builds that behavior.
- Do NOT claim the graph engine folds a real `effects` entry — it doesn't; nothing produces one.
- Do NOT modify any file outside the Scope section.

## Implementation Steps

### Step 1: Update the `### Effects` subsection's Scope note in `docs/artifacts.md`

Find this exact text:

```
**Scope note:** this validates *shape* only. Nothing in the codebase yet folds an `effects` entry
into a live containment tree or dependency graph, and nothing yet requires any writer to populate
it — that is future work (DESIGN-3.0's graph engine and rewrite engine). Today, an `effects` array
is durable, replayable data on the ledger line and nothing more.

### Atom lifecycle events — charter, delta, transitions, flags (3.0, Part 3)
```

Replace it with:

```
**Scope note:** this validates *shape* only. The graph engine (reasonable 3.0 Part 4,
`lib/graph.mjs`) now folds atoms and **derives** the containment tree and dependency edges from the
ledger and live contracts — but it does not read or interpret this `effects` field itself: nothing
in the codebase has ever written a real `effects` array (no event type populates one), so there is
still nothing for the graph engine to fold from it. Its edges are 100% derived, every time —
deliberately, since a recorded `effects` override would need precedence rules against derivation
this design hasn't worked out yet (see `docs/superpowers/specs/2026-07-09-reasonable-3.0-p4-graph-design.md`'s
"no effects-array overlay layer" note). Populating `effects` for real, and folding it with real
precedence rules, is the rewrite engine's job (Part 5) — until then, an `effects` array stays
durable, replayable data on the ledger line and nothing more.

### Atom lifecycle events — charter, delta, transitions, flags (3.0, Part 3)
```

### Step 2: Insert the new `### The graph engine` subsection in `docs/artifacts.md`

Find this exact text (the tail of the "Atom lifecycle events" subsection, just before
`## journal.json *`):

```
**Scope note:** these six event types validate *shape* only (`lib/ledger.mjs`'s `EVENT_SCHEMAS`,
plus `lib/atom.mjs`'s own reject-before-write checks on top — a malformed premise, an unknown flag
name, or an illegal transition never reaches the ledger at all). `lib/atom.mjs`'s `loadAtom`/
`foldAtoms` fold these events into a read-only, in-memory atom record — nothing is written back to
disk beyond the ledger line itself. Nothing in the codebase yet folds an atom into the dependency
graph, decides which verdict (R1–R9) applies to a failed attempt, or applies one — that is future
work (DESIGN-3.0's graph engine, Part 4, and rewrite engine, Part 5).

---

## journal.json *
```

Replace it with:

```
**Scope note:** these six event types validate *shape* only (`lib/ledger.mjs`'s `EVENT_SCHEMAS`,
plus `lib/atom.mjs`'s own reject-before-write checks on top — a malformed premise, an unknown flag
name, or an illegal transition never reaches the ledger at all). `lib/atom.mjs`'s `loadAtom`/
`foldAtoms` (and, since Part 4, `foldAtomFromEvents`/`foldAtomsFromEvents`, their pre-filtered-event
siblings) fold these events into a read-only, in-memory atom record — nothing is written back to
disk beyond the ledger line itself. Deciding which verdict (R1–R9) applies to a failed attempt, or
applying one, remains future work (rewrite engine, Part 5) — this part's atoms now DO fold into the
dependency graph, see below.

### The graph engine — containment, dependency edges, lifting, the two projections (3.0, Part 4)

`lib/graph.mjs` (`docs/DESIGN-3.0.md` §2, §2.1–§2.4) reads — never writes — a ledger. It builds:

- **The containment tree** (`containmentTree`) — every atom nested under a group node named for its
  own `component`, directly under the effort root. This is the flat, one-level fallback DESIGN-3.0's
  own vocabulary sanctions as a degenerate case: the real component→subeffort **ownership map** is
  topology-stage genesis data (Part 6, not built yet); `containmentTree` accepts one as an optional
  input and produces deeper trees once it exists, with no change to its own output shape.
- **Four dependency-edge kinds** (`needsEdges`, `excludesEdges`, `servesEdges`, `informsEdges`) —
  computed, never hand-stored, exactly as DESIGN-3.0 §2.2 requires. Only **actual**-fidelity edges
  (post-spec, clause-level) are implemented; **planned**-fidelity edges (component-level,
  pre-delta) need the topologist's ratified ordering data (Part 6) and are deferred whole, not
  half-built. `excludesEdges`' footprint always treats resource claims as empty — no atom charter
  or delta field carries them yet, a named, un-owned gap (safe direction of error: it can only
  under-approximate `excludes`, never produce a wrong edge). `servesEdges`/`informsEdges` are real,
  tested computation rules with nothing real to call them with yet (no `goals.json`, Part 6; no
  spike-insert rewrite event, Part 5) — both return `[]` on every live effort today.
- **Edge lifting** (`liftEdges`) — the per-view quotient (§2.3): a dependency edge between atoms in
  different containment subtrees lifts to one edge between their common ancestors at the viewed
  level. Deterministic, computed per view, never stored.
- **Two graph projections** (§2.4): `foldAsLived(effortRoot, {uptoSeq})` folds *only* the ledger
  itself (atom charters/deltas — never a live contract file), so it is self-sufficient by
  construction. `deriveCurrent(effortRoot, {goals, spikeInforms})` additionally reads the real, live
  `lib/contract.mjs` citation graph — richer, since it also sees clauses that landed before any atom
  still tracks them. `graphDivergence(effortRoot)` diffs the two; on an effort whose contracts were
  only ever touched through this engine's own atom pipeline, the two are provably identical, so a
  non-empty divergence is a real signal — a contract hand-edited outside the ledger-governed
  pipeline, or a `merged` atom whose clauses are actually absent from disk — not a placeholder for a
  future feature.

**Scope note:** no `graph.json` disk mirror exists yet, and `lib/ledger.mjs`'s `append()` is
untouched by this part — nothing reads a graph outside a test today, so wiring a regenerated mirror
into the hot append path is deferred to whichever part first needs to read one (most likely the
topology stage's ratification surface, Part 6, or the live view, Part 7). Surfacing
`graphDivergence`'s output at a human-facing gate is likewise not built here — this part only
computes the diff.

---

## journal.json *
```

### Step 3: Insert the glossary.md entries

In `docs/glossary.md`, find this exact text (the end of the **Cohesion** entry through the start of
**Topology**):

```
- **Cohesion** — the minimality law (DESIGN-3.0 §4.3): a delta's clauses form a graph (edges:
  shared provider citation, shared **Demanded-by**, loci overlapping below the component root); it
  must be **one connected component**, computed by `lib/atom.mjs`'s `cohesionComponents`
  mechanically from the delta's real data — never from an agent's claim. A disconnected delta must
  split (rule R4); more than one component *is* the split proposal.
- **Topology** — where an entity lives, its name, owner, relationships. Derived
```

Replace it with:

```
- **Cohesion** — the minimality law (DESIGN-3.0 §4.3): a delta's clauses form a graph (edges:
  shared provider citation, shared **Demanded-by**, loci overlapping below the component root); it
  must be **one connected component**, computed by `lib/atom.mjs`'s `cohesionComponents`
  mechanically from the delta's real data — never from an agent's claim. A disconnected delta must
  split (rule R4); more than one component *is* the split proposal.
- **Containment tree** — the drill-down/progress structure (DESIGN-3.0 §2.1): effort → subefforts →
  atoms, single-parent, arbitrary depth. An atom's parent is derived from its `component`, through a
  ratified component→subeffort **ownership map** (topology-stage genesis data, Part 6, not built
  yet) — absent one, `lib/graph.mjs`'s `containmentTree` falls back to a flat, one-level tree
  grouped by component, a degenerate case rather than a workaround.
- **Dependency graph** — the restructure structure (DESIGN-3.0 §2.2): the four edges between atoms
  (**Needs**, **Excludes**, **Serves**, **Informs**), computed by a fold from deltas, citations, and
  recorded rewrite events — never hand-stored or hand-repaired. Two fidelities exist in the design:
  **planned** (component-level, genesis-time) and **actual** (clause-level, post-spec); only actual
  edges are built (`lib/graph.mjs`) — planned edges need the topologist's ratified ordering data
  (Part 6) and are deferred whole.
- **Needs** — readiness edge: atom A cannot start before atom B lands, because A's delta cites a
  clause B's delta introduces. Clause-id matched, entirely ledger-derivable — `lib/graph.mjs`'s
  `needsEdges` never touches a live contract file.
- **Excludes** — conflict edge: two atoms cannot run concurrently (serializes, never orders)
  because their footprints (locus ∪ citation closure ∪ resource claims) intersect at the contract
  level. **Symmetric**, unlike the other three edge kinds; same-**Contract** atoms always exclude.
  The resource-claims component of the footprint is always empty today — no atom field carries one
  yet, a named, un-owned gap (the safe, under-approximating direction of error).
- **Serves** — an atom advances a goal's cone: reverse-reachability from the goal's scenario-cited
  clauses over the **Needs** graph. No `goals.json` exists yet (Part 6) — `lib/graph.mjs`'s
  `servesEdges` is a real, tested rule with nothing real to call it with, today; it returns `[]` on
  every live effort.
- **Informs** — a spike gates an atom's feasibility: the direct effect of a spike-insert rewrite
  event (rule R5, Part 5, not built yet). Likewise a real, tested rule with no real producer yet.
- **Edge lifting** — the per-view quotient (DESIGN-3.0 §2.3) that keeps a containment view readable:
  a dependency edge between atoms deep in different subtrees lifts to one edge between their common
  ancestors at the viewed level. Deterministic, computed per view (`lib/graph.mjs`'s `liftEdges`),
  never stored.
- **As-lived graph** — the graph as it existed at a given ledger seq (DESIGN-3.0 §2.4): folded
  purely from recorded ledger events — never a live contract file. Self-sufficient by construction.
- **Current graph** — the graph re-derived fresh from today's ledger plus today's live, on-disk
  contracts — richer than the **As-lived graph** because it also sees clauses that landed before
  any atom still tracks them. Diverging from the as-lived graph is a real, mechanically-computed
  signal (contract drift outside the ledger-governed pipeline), not a placeholder for a future
  feature — `lib/graph.mjs`'s `graphDivergence`.
- **Topology** — where an entity lives, its name, owner, relationships. Derived
```

### Step 4: Verify the edits

Read both files back at the edited locations to confirm the insertions landed cleanly and nothing
else in either file shifted or was accidentally duplicated.

### Step 5: Commit

```bash
git add docs/artifacts.md docs/glossary.md
git commit -m "docs: pin the graph engine's fold, edges, lifting, and projections in artifacts.md and glossary.md"
```

## Acceptance Criteria
- [ ] The `### Effects` subsection's Scope note no longer says "nothing... yet folds an `effects`
      entry" without qualification — it precisely states what Part 4 does and does not do
- [ ] `docs/artifacts.md`'s `## ledger.jsonl *` section has the new `### The graph engine`
      subsection, matching the existing three-part shape
- [ ] `docs/glossary.md` has nine new bullets (**Containment tree**, **Dependency graph**,
      **Needs**, **Excludes**, **Serves**, **Informs**, **Edge lifting**, **As-lived graph**,
      **Current graph**) in the right place, matching the existing one-bullet-per-term shape
- [ ] Both flagged gaps (resource claims, planned-fidelity edges) are named inline, not omitted
- [ ] Neither doc claims verdict dispatch or the topology stage exist yet — both are explicit that
      those remain future work (Parts 5 and 6)
- [ ] No `legibility law`/`cone`/`stratum`/`wave`/`Lineage`/etc. entries were added (out of scope)
- [ ] No file outside Scope was modified
