# Task T03: Docs — artifacts.md + glossary.md

**Role:** none (docs task, not a red/green/audit triad — there's no ambiguous behavior here to
protect against self-certification, just an accurate description of what T02b landed).

## References
- Read: `../shared/conventions.md` (the fixed three-part artifacts.md shape; the one-bullet
  glossary.md shape; the "only document what this part implements" rule)
- Read: `docs/artifacts.md` lines 860–901 (the tail of the `### Effects` subsection through to
  `## journal.json *`, so your addition reads as part of the same `## ledger.jsonl *` section)
- Read: `docs/glossary.md` lines 64–80 (the **Clause**/**Demanded-by**/**Topology** bullets, so
  your new entries sit in the right place and you can see the stale cross-reference to fix)

## Dependencies
- Depends on: T01c, T02c (documents landed, adversarially-reviewed behavior — not aspirational
  behavior)
- Depended on by: T04

## Scope

**Files:**
- Modify: `docs/artifacts.md`
- Modify: `docs/glossary.md`

**BOUNDARY — you MUST NOT modify any files outside this list. Do not touch any code or test
file.**

## Positive Constraints (DO)
- Match `docs/artifacts.md`'s existing three-part shape for this addition: prose intro → the
  field's actual pinned shape (a fenced example) → prose on scope (what it does NOT yet do).
- Match `docs/glossary.md`'s existing one-bullet-per-term shape exactly: `- **Term** — definition.`
- Be explicit in both docs that folding an atom into the dependency graph, deciding which verdict
  applies to a failed attempt, and applying one are all **future work** (Parts 4 and 5) —
  overclaiming here would be the docs contradicting the code.
- Fix the stale **Demanded-by** glossary entry: it currently says the clause-cohesion graph is
  "a later part" — it no longer is, this part builds it. Update the cross-reference to point at the
  new **Cohesion** entry instead of describing it as future work.

## Negative Constraints (DO NOT)
- Do NOT add glossary entries for concepts this part does not implement (`verdict` as a rewrite
  outcome, `rewrite`, `frontier`, `cone`, `stratum`, `wave`, `legibility law`, `spec queue`,
  `starvation quorum`, or a **Lineage** entry — this part does not charter R3/R4 children or record
  parent→child lineage; that's Part 5's job, see the design doc's "read side" section) — those
  belong to whichever future part actually builds that behavior.
- Do NOT modify any file outside the Scope section.

## Implementation Steps

### Step 1: Insert the artifacts.md subsection

In `docs/artifacts.md`, find this exact text (the end of the `### Effects` subsection, just before
the `## journal.json *` header):

```
**Scope note:** this validates *shape* only. Nothing in the codebase yet folds an `effects` entry
into a live containment tree or dependency graph, and nothing yet requires any writer to populate
it — that is future work (DESIGN-3.0's graph engine and rewrite engine). Today, an `effects` array
is durable, replayable data on the ledger line and nothing more.

---

## journal.json *
```

Replace it with:

```
**Scope note:** this validates *shape* only. Nothing in the codebase yet folds an `effects` entry
into a live containment tree or dependency graph, and nothing yet requires any writer to populate
it — that is future work (DESIGN-3.0's graph engine and rewrite engine). Today, an `effects` array
is durable, replayable data on the ledger line and nothing more.

### Atom lifecycle events — charter, delta, transitions, flags (3.0, Part 3)

Six new, optional Family 3 event types record an atom's own lifecycle (`docs/DESIGN-3.0.md` §4,
§4.1). None are required on any pre-3.0 ledger — an effort that never charters an atom never
produces one.

```jsonl
{"seq":40,"ts":"...","type":"atom-chartered","component":"lexer","premises":["ledger:12"],"purpose":"Tokenize source text.","locus":["lib/lexer/"],"order":0}
{"seq":41,"ts":"...","type":"atom-transitioned","atomId":"a-40","from":"chartered","to":"ready"}
{"seq":42,"ts":"...","type":"atom-delta-authored","atomId":"a-40","clauses":[{"clauseId":"lexer#c12","citations":[],"demandedBy":"goal:g1","locus":["lib/lexer/tokenizer/scan.mjs"]}]}
{"seq":43,"ts":"...","type":"delta-enrichment","atomId":"a-40","clause":{"clauseId":"lexer#c13","citations":[],"demandedBy":"cite:ast#c1","locus":["lib/lexer/tokenizer/errors.mjs"]}}
{"seq":44,"ts":"...","type":"atom-flag-set","atomId":"a-40","flag":"frozen","reason":"R2 dead-end"}
{"seq":45,"ts":"...","type":"atom-flag-cleared","atomId":"a-40","flag":"frozen"}
```

- **`atom-chartered`** — mints the atom's id (`a-<seq>`, the seq this event itself receives) and
  records its charter: `component`, `premises` (tagged references, the same `goal:|gate:|cite:|
  ledger:` grammar `demanded-by` uses), `purpose` (one-line, non-normative prose), `locus` (coarse
  glob array), `order` (position in the topologist's ratified intra-component ordering). No
  behavioral musts — genesis-time, structural only.
- **`atom-transitioned`** — one generic event for every lifecycle move (`{atomId, from, to}`),
  validated by `lib/atom.mjs`'s pinned adjacency table (`isValidTransition`) before it is ever
  appended. Not one event type per transition — a single generic, state-carrying event, matching
  this ledger's existing `verdict`/`ratification` precedent rather than the older, per-type
  Family 1 node-lifecycle style.
- **`atom-delta-authored`** — the *initial* delta. Also the event that moves the atom
  `ready -> spec'd`: DESIGN-3.0 frames authoring the delta as what causes that transition, so there
  is no separate, redundant `atom-transitioned` event for this one hop.
- **`delta-enrichment`** — the in-flight success path (DESIGN-3.0 §4.1): an implementer learning a
  new must appends one additional clause to the delta without changing lifecycle state. The event
  type name is pinned by DESIGN-3.0 itself, not invented here.
- **`atom-flag-set` / `atom-flag-cleared`** — the three orthogonal flags (`frozen`,
  `guard-halted`, `dispatch-barred`) are independent of lifecycle state; two simple, string-shaped
  event types rather than one generic event carrying a boolean value.

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

### Step 2: Insert the glossary.md entries and fix the stale Demanded-by cross-reference

In `docs/glossary.md`, find this exact text (the **Demanded-by** entry through the start of
**Topology**):

```
- **Demanded-by** — a clause's required provenance line, naming the citable demander that
  justified adding it: a goal-scenario assertion (`goal:<id>`), a gate (`gate:<verbatim gate
  string>`), a consuming clause/atom citation (`cite:<component>#c<N>`), or a chartering rewrite
  event (`ledger:<seq>`) (DESIGN-3.0 §4.2). Load-bearing on the clause-cohesion graph (§4.3, a
  later part) and the anti-padding audit. Syntax-checked at parse time
  (`lib/contract.mjs`'s `missingDemandedBy`); resolving what a reference actually points to is
  later work.
- **Topology** — where an entity lives, its name, owner, relationships. Derived
```

Replace it with:

```
- **Demanded-by** — a clause's required provenance line, naming the citable demander that
  justified adding it: a goal-scenario assertion (`goal:<id>`), a gate (`gate:<verbatim gate
  string>`), a consuming clause/atom citation (`cite:<component>#c<N>`), or a chartering rewrite
  event (`ledger:<seq>`) (DESIGN-3.0 §4.2). Load-bearing on the **Cohesion** clause-cohesion graph
  (§4.3) and the anti-padding audit. Syntax-checked at parse time (`lib/contract.mjs`'s
  `missingDemandedBy`); resolving what a reference actually points to is later work.
- **Atom** — the 3.0 work order (DESIGN-3.0 §4): a **Charter** (genesis-time, structural — no
  behavioral musts) plus a **Delta** (spec-time, the actual proposed clauses). Allocated an id
  (`a-<seq>`) at charter time under the ledger controller's append lock, the same mechanism as a
  clause id. Its lifecycle is a pinned ten-state machine (`lib/atom.mjs`'s `LIFECYCLE_STATES`) plus
  three independent flags (`frozen`, `guard-halted`, `dispatch-barred`) — deciding which verdict
  moves an atom between states, and applying the move, is later work (Part 5); this part only
  defines which moves are mechanically legal.
- **Charter** — an atom's genesis-time data: component, **Premise**s, a one-line purpose
  (non-normative prose), a coarse locus, and its place in the topologist's ratified intra-component
  ordering. No clause text, no behavioral musts — the 2.x "nothing behavioral from the vision" law,
  unchanged.
- **Delta** — an atom's spec-time proposal: the actual clauses it intends to add, each carrying its
  own **Demanded-by** provenance. The *initial* delta is authored once, from canonical contract
  state at spec time; see **Delta-enrichment** for what happens after.
- **Delta-enrichment** — DESIGN-3.0's success-path feedback event (§4.1): an implementer who learns
  a new must in flight appends one additional clause to the atom's delta, without changing
  lifecycle state. The 3.0 continuation of 2.x's "the contract grows from implementation."
- **Premise** — a stable, tagged reference (the same `goal:|gate:|cite:|ledger:` grammar
  **Demanded-by** uses) a charter rests on: a goal-scenario assertion, a gate, a contract clause, or
  the chartering rewrite event itself. Citing `intention.md` by id has no tag yet — a known,
  un-owned gap (DESIGN-3.0 §12), not fixed by this part.
- **Cohesion** — the minimality law (DESIGN-3.0 §4.3): a delta's clauses form a graph (edges:
  shared provider citation, shared **Demanded-by**, loci overlapping below the component root); it
  must be **one connected component**, computed by `lib/atom.mjs`'s `cohesionComponents`
  mechanically from the delta's real data — never from an agent's claim. A disconnected delta must
  split (rule R4); more than one component *is* the split proposal.
- **Topology** — where an entity lives, its name, owner, relationships. Derived
```

### Step 3: Verify the edits

Read both files back at the edited locations to confirm the insertions landed cleanly and nothing
else in either file shifted or was accidentally duplicated.

### Step 4: Commit

```bash
git add docs/artifacts.md docs/glossary.md
git commit -m "docs: pin the atom lifecycle events and vocabulary in artifacts.md and glossary.md"
```

## Acceptance Criteria
- [ ] `docs/artifacts.md`'s `## ledger.jsonl *` section has the new `### Atom lifecycle events`
      subsection, matching the existing three-part shape
- [ ] `docs/glossary.md` has six new bullets (`Atom`, `Charter`, `Delta`, `Delta-enrichment`,
      `Premise`, `Cohesion`) in the right place, matching the existing one-bullet-per-term shape
- [ ] `docs/glossary.md`'s **Demanded-by** entry no longer calls the cohesion graph "a later part"
- [ ] Neither doc claims the graph fold or verdict dispatch exists yet — both are explicit that
      those are future work (Parts 4 and 5)
- [ ] No `Lineage`/`verdict`/`rewrite`/`frontier`/etc. entries were added (out of this part's scope)
- [ ] No file outside Scope was modified
