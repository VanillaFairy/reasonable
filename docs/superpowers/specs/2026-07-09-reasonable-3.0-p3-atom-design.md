# Design — Reasonable 3.0 Part 3: The Atom

**Status:** brainstormed non-interactively. `reasonable` is a Claude Code plugin, not an
interactive service, and this pass was run as a single autonomous planning task rather than a
live back-and-forth — so this doc plays the role brainstorming normally reaches through dialogue,
but every genuinely contestable call is flagged explicitly below rather than silently resolved.
The human reviewing this (and the resulting plan) is the approval gate that would normally have
happened turn-by-turn.

## What this covers

Part 3 of the `reasonable` 3.0 roadmap (`docs/superpowers/plans/2026-07-08-reasonable-3.0-roadmap.md`):
build `lib/atom.mjs` — the atom's charter/delta split, its full lifecycle state machine, and the
minimality/cohesion law — per `docs/DESIGN-3.0.md` §4, §4.1, §4.3. This is planning only; nothing
here is implemented yet.

DESIGN-3.0 pins the *policy* (charter vs. delta, the state list, the three cohesion relations) but
leaves several concrete shapes unstated, exactly as it did for Part 1's `effects` field and Part
2's contract grammar. This doc pins those shapes, with reasoning, and flags which ones are
genuinely contestable rather than cleanly derived. Part 2's own `lib/contract.mjs` comment
(on `DEMANDED_BY_RE`) says outright: "resolving WHAT a reference means is deferred to the consumer
(the cohesion graph, Part 3)." This doc is that consumer arriving.

**Explicitly out of scope** (deferred to later parts, same discipline as Parts 1 and 2):
- Folding atoms and their effects into the dependency graph (`needs`/`excludes`/`serves`/`informs`
  edges) — that's `lib/graph.mjs`, Part 4.
- Deciding *which* verdict (R1–R9) applies to a failed attempt, or dispatching the resulting
  rewrite — that's `lib/rewrite.mjs`, Part 5. Part 3 only defines which lifecycle transitions are
  mechanically *valid*; it does not decide when to take one.
- The frontier loop, spec queue, wave packing, or the two guard checkpoints (§7.2) that gate
  dispatch — Part 7.
- Making `intention.md` clause-addressed — a `§12`-listed breaking change with no owning part yet
  (see Decision 3).

## Decision 1 — Atom id allocation: mirrors `clause-id.mjs` exactly, no per-component counter

**Question:** DESIGN-3.0 §4.2 says "the scribe assigns a stable id at creation (`a-0042`)" but
doesn't pin the allocation mechanism.

**Decision:** identical mechanism to Part 2's `allocateClauseId`, applied to a *global* (not
per-component) sequence: a new Family 3 ledger event, `atom-chartered` (`required: ['component']`,
same minimal shape as `enrichment`/`characterization`/`clause-allocated`). The atom's id is
`a-${seq}`, where `seq` is the seq the ledger controller's `append()` call already assigns
atomically. No per-component counter, no fold over prior charters, no persisted registry — the
exact reasoning Part 2's Decision 1 gave, which applies here without modification since it's the
same category of problem (unique allocation under the append lock).

**Why global, not `<component>-<n>`:** unlike a clause id, DESIGN-3.0's own example (`a-0042`) is
already un-prefixed and global-looking — there is no textual pull toward a per-component scheme
here the way `lexer#c12` pulled toward one for clause ids. A global id is also what containment
(§2.1: "an atom's parent is *derived*... through the ratified component→subeffort ownership map")
already assumes: the id itself carries no structural meaning, structure is a separate, derived
fold. Riding the raw seq costs nothing new and keeps ids unique across the whole effort by
construction.

**Flagged as contestable:** same flag Part 2 raised — if per-component readability matters more
than proportionality, a per-component counter is a well-precedented alternative (it would need its
own fold, the same shape as the rejected clause-id alternative). Not taken here for the same reason
it wasn't taken there.

## Decision 2 — Lifecycle events: one generic `atom-transitioned`, not one event type per transition

**Question:** DESIGN-3.0 §8 says "every atom lifecycle transition... is one ledger event." Does
that mean a dedicated event type per transition (mirroring `lib/ledger.mjs`'s existing Family 1 —
`node-planned`, `node-dispatched`, `node-completed`, ... — one type per node-lifecycle step), or one
generic event type carrying `{from, to}` as payload (mirroring Family 3's existing generic-payload
events — `verdict`, `ratification`, `next-action` — which don't fork by outcome)?

**Decision:** one generic event, `atom-transitioned` (`required: ['atomId', 'from', 'to']`). The
atom's lifecycle graph (Decision 5) already has ~15 valid edges (see below); a per-transition
scheme would mean ~15 new `EVENT_SCHEMAS` entries for a state machine that a single small adjacency
table already fully describes. Family 1's per-type scheme predates this design (it's the 2.x work
order vocabulary DESIGN-3.0 §12 explicitly keeps "readable forever" via a compatibility fold, not a
pattern this design extends) — Family 3's `verdict`/`ratification`/`next-action` precedent is the
closer analogy: a state-carrying domain event with a uniform envelope, validated against a pinned
rule table by the code that reads it, not by the schema registry forking on type name. `from` is
always code-computed (read via `loadAtom` immediately before appending — see Decision 7), never
caller-supplied, so it can't drift from what actually happened.

**Flagged as contestable:** the alternative (one type per transition, mirroring Family 1) is
equally implementable and would make `EVENT_SCHEMAS` a more literal transcription of the state
diagram. Rejected here on proportionality grounds — six new schema lines (this decision plus
Decisions 1, 3, 4, 6) vs. roughly twenty — but if a later part's tooling wants to filter the ledger
by "just the `merged` transitions" via `type` alone rather than `type === 'atom-transitioned' &&
to === 'merged'`, that's the concrete cost of this choice, worth knowing about.

## Decision 3 — Charter shape and premises: reuse the `demanded-by` tag vocabulary, flag the intention-tag gap

**Charter fields** (§4.1: "component, its premises..., a one-line purpose..., a coarse locus, and
its place in the topologist's ratified intra-component ordering"):

```
{
  id: 'a-<seq>',            // allocated, Decision 1
  component: string,
  premises: string[],       // tagged references, see below
  purpose: string,          // one line, non-normative prose
  locus: string[],          // coarse glob(s), same shape as 2.x lib/footprint.mjs's wo.locus
  order: number,            // position in the topologist's ratified intra-component ordering
}
```

**Premises use the exact same tagged-reference grammar `demanded-by` already has** —
`lib/contract.mjs`'s `DEMANDED_BY_TAGS`/`DEMANDED_BY_RE` (`goal:<id>`, `gate:<verbatim gate
string>`, `cite:<component>#c<N>`, `ledger:<seq>`), imported and reused verbatim, not
re-implemented. This is the natural reading of DESIGN-3.0's own vocabulary: §4.2 defines
`demanded-by` as naming "any citable demander," and §4.1 says premises are "stable clause
references (§4.2)" — the two concepts share one reference grammar by design, not by this doc's
invention. Validation stays syntax-only, exactly like `demandedBy`: a premise is a well-formed
tagged string or it isn't; nothing is resolved against a live registry.

**Flagged as a real, un-owned gap:** §4.1 says premises cite "the intention, a goal, or a
contract," but `DEMANDED_BY_TAGS` has no `intention` tag — because `intention.md` is not yet
clause-addressed (§12 lists that as its own breaking change, owned by no part in the current
roadmap table). Part 3 does **not** add an `intention:` tag or touch `DEMANDED_BY_TAGS` — that
grammar decision belongs to whichever part actually makes `intention.md` clause-addressed, and
guessing its shape here risks a second, incompatible attempt later. Until then, a premise citing
the intention has no expressible syntax under this grammar; charters that need one either cite the
chartering rewrite event instead (`ledger:<seq>`, already always available — the R2/R3 event that
created the atom) or wait. This is a known, named gap, not a silent one — surfaced again in this
plan's docs task and in the parent roadmap.

## Decision 4 — Delta clause shape: extends the existing `Clause` shape with a delta-only `locus`

A delta is an array of clauses. Reuse `lib/contract.mjs`'s existing (post-Part-2) clause fields —
`citations: Array<{component, clause}>`, `demandedBy: string|null` — since a delta clause becomes
exactly this shape once merged into the real contract file; nothing new is invented for the parts
that already exist.

**One delta-only addition: `locus: string[]`** (same glob-array shape as the charter's coarse
locus and 2.x `footprint.mjs`'s `wo.locus`). This is required for cohesion criterion (c) — "their
declared loci overlap below the component root" (§4.3) — and it is **not** part of the merged,
on-disk contract clause shape `lib/contract.mjs`'s `parseContract()` returns today (Part 2 didn't
add a locus field, correctly: a landed contract clause doesn't carry footprint bookkeeping). A
delta clause is therefore a strict superset of a contract clause while in flight; `locus` is
dropped as bookkeeping once the clause lands (no part of this design persists it past the merge).

```
{
  clauseId: string,                    // pre-allocated via lib/clause-id.mjs's allocateClauseId
  citations: Array<{component, clause}>,
  demandedBy: string | null,           // tagged reference, same grammar as Decision 3
  locus: string[],
}
```

**Why pre-allocated, not minted inside `authorDelta`/`enrichDelta`:** clause allocation is already
Part 2's `allocateClauseId`, a general-purpose primitive with its own concurrency story (Decision 1
of that part). Re-deriving allocation inside `lib/atom.mjs` would duplicate that logic for no
reason; the caller (a later part's spec-time pipeline) allocates each clause id first, then hands
the fully-shaped clause array to `authorDelta`/`enrichDelta`.

## Decision 5 — The lifecycle state machine: a flat, permissive adjacency table, not a labeled routing table

**States** (§4.1, pinned verbatim): `chartered`, `ready`, `spec'd`, `packed`, `tests-red`, `green`,
`audited`, `merged` (terminal), `retired-pending`, `retired` (terminal). "In-flight" in DESIGN-3.0's
prose is the umbrella name for the `tests-red → green → audited` span, not a state of its own — no
node in this table is literally named `in-flight`.

**Valid edges** (`isValidTransition(from, to)`, backed by a plain adjacency object):

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

("`chartered -> retired-pending`" is deliberately **absent** — see the flag below.)

**Where this comes from:** the forward chain is §4.1's pinned chain, verbatim. The `-> ready`
edges are §7's table read structurally, not by R-code: R1 ("re-enter frontier for fresh-context
retry"), R9 ("the atom leaves `spec'd` → back to `ready`"), and R7-unmerged ("re-enter as R1") all
land an in-flight atom back at `ready`, and nothing in §7 restricts *which* in-flight state they
fire from — R1 (budget exhaustion) in particular can happen at any stage of an attempt. The
`-> retired-pending` edges are R2 ("dead-end... the refuted premise, any layer" — explicitly not
stage-restricted).

**Why a flat, unlabeled table instead of a table keyed by R-code:** deciding *which* R-code applies
to a failed attempt, and therefore which edge to take, is judgment the failure calculus performs —
that's `lib/rewrite.mjs`, Part 5's job (roadmap: "P5 | the failure calculus, verdict types R1–R9").
Part 3's job is narrower and mechanical: given a proposed `(from, to)` pair, is it a legal move at
all. This mirrors Part 1's `effects.mjs` validating shape without interpreting what an effect
*means*, and Part 2's grammar validating syntax without resolving what a citation points to. A
labeled, R-code-keyed table would require Part 3 to encode Part 5's not-yet-written judgment logic
prematurely — exactly the kind of prediction this design's own thesis (D2 §5.4: "predicting
structure is cheap, predicting behavior is the disease") warns against baking in early.

**`chartered -> retired-pending` is absent on purpose, flagged as contestable:** R2 is "any layer,"
which arguably includes a charter's own premises being refuted before a delta is ever authored.
Omitting this edge means a not-yet-spec'd atom must transition `chartered -> ready -> retired-pending`
mechanically (an extra hop) rather than retiring directly from `chartered`. Included this way
because §4.1's own chain never shows `chartered` transitioning anywhere but `ready`, and because a
charter-stage-only refutation is arguably better modeled as "never dispatch it" (no ledger event at
all) than as a retirement record — but DESIGN-3.0 doesn't settle this explicitly, so it's flagged
rather than silently assumed either way. Cheap to add later (one more table entry) if wrong.

**R4 (`oversized`) is not a lifecycle edge at all.** Its effect ("replace atom with sub-atoms;
lineage recorded; they inherit the parent's sanction") is a *lineage* operation — the parent is
superseded, not transitioned in place — which this design treats as a `retired`-class marking with
recorded lineage (children get their own fresh `atom-chartered` events, `parentId: <original id>`)
rather than a new state name. `lib/atom.mjs` computes the cohesion partition (Decision 6) that
becomes R4's payload; **applying** R4 (retiring the parent, chartering the children with lineage,
inheriting sanction) is Part 5's dispatch, not built here — same "compute the data, don't apply the
verdict" boundary as everywhere else in this doc.

**Flags — independent booleans, not states** (§4.1: "three orthogonal flags... are flags, not
states"): `frozen`, `guard-halted`, `dispatch-barred` (`FLAG_NAMES`, frozen array). Two events,
`atom-flag-set`/`atom-flag-cleared` (`required: ['atomId', 'flag']`) — two types rather than one
generic event carrying a boolean `value`, because `lib/ledger.mjs`'s existing generic
required-field check (`isNonEmptyString`) can't validate a boolean without a bespoke `validate`
function; two simple string-shaped events fit the dominant `EVENT_SCHEMAS` idiom without adding
one. Which rule may set/clear which flag (R2/R7 set `frozen`; §7.2 checkpoint 2 sets
`guard-halted`; R3 amendment atoms are born `dispatch-barred`) is, again, Part 5/Part 7 judgment —
`lib/atom.mjs`'s `setFlag`/`clearFlag` validate only that `flag ∈ FLAG_NAMES`, nothing about who's
allowed to call them for which reason.

## Decision 6 — Cohesion: computed from real data, so anti-padding holds by construction

**The clause-cohesion graph** (§4.3): nodes are a delta's clauses; an edge exists between two
clauses iff any of:

- **(a) common provider clause** — they share at least one identical `{component, clause}` entry
  somewhere in their respective `citations` arrays (both cite the same clause).
- **(b) shared `demanded-by`** — `demandedBy` strings are identical and non-null (exact tagged
  reference match — the same scenario assertion, the same consuming citation, or the same
  chartering event demanded both, per §4.2's widened vocabulary).
- **(c) declared loci overlap below the component root** — see below.

**`cohesionComponents(clauses)`** returns the connected components (each an array of `clauseId`s)
of the graph these three edges define — a delta whose clauses form one component coheres; more than
one component means "must split" (R4), and the array of components **is** R4's partition payload
directly, no extra wrapping. Algorithm: pairwise edge check (O(n²), same complexity class as
`footprint.mjs`'s existing pairwise independence check — deltas are small, this is not a
performance-sensitive path) feeding a union-find, or an equivalent BFS/DFS — an implementation
detail interfaces.md does not need to pin beyond the return shape.

**Criterion (c), precisely — "below the component root" means something is left after stripping
the component prefix.** A delta's clauses all share the same `component` (the atom's own — a delta
never spans components), so "overlap below the component root" cannot mean "both loci are under
the component's directory," which is trivially always true and would make criterion (c) vacuous
(the exact defect DESIGN-3.0 §15 records draft one making with wave-packing's footprint relation).
`cohesionComponents` takes the root as an explicit second parameter, `componentRoot` — a literal
repo-relative path-prefix string (e.g. `'lib/lexer/'`), the same shape as a charter's own `locus`
entries and 2.x `footprint.mjs`'s `wo.locus` — rather than trying to derive or guess it from the
clauses themselves or from a bare component slug (a real code module isn't guaranteed to physically
live under a folder literally named after its component slug, so searching for that segment inside
each glob would be both extra machinery and a source of silent misses; the caller already holds
this string on the atom's charter). Stripping: a locus glob starting with `componentRoot` has that
prefix removed; if what's left is empty (the locus *was* exactly the root, nothing more specific —
e.g. bare `lib/lexer/`), it contributes nothing to (c); a glob that does not start with
`componentRoot` at all is compared unstripped rather than silently dropped (conservative — a
locus declared oddly still participates, never vanishes). Two clauses' *remaining* glob sets are
then compared with the same ancestor-prefix overlap logic `footprint.mjs`'s private
`lociOverlap`/`prefix` helpers already use — re-implemented locally in `lib/atom.mjs` (see
Decision 7 on why, not imported) rather than reused, since those two helpers aren't exported today
and the semantics genuinely differ (general ancestor-overlap vs. overlap-below-a-specific-root).

**Anti-padding holds by construction, not by a second check.** §4.3 also requires auditing
"a claimed shared citation, provenance, or locus overlap the auditor cannot ground in the
artifact." Because `cohesionComponents` computes edges **from the delta's real, already-parsed
`citations`/`demandedBy`/`locus` fields** — never from an agent's assertion that two clauses relate
— there is no separate "claim" to audit against a "ground truth": the function's output *is* the
ground truth. An auditor re-runs `cohesionComponents` on the same clause array and gets the same
answer, or the implementation is simply wrong (a `cohesionComponents`-level bug, not a padding
defect). This doc treats that as the anti-padding mechanism rather than building a second,
parallel "is this claim grounded" checker — proportionate, and consistent with how this whole part
prefers mechanical computation over agent-asserted claims wherever the data already exists to
compute from.

## Decision 7 — File layout: one file, `lib/atom.mjs`, matching the roadmap's own line item

Unlike Parts 1 and 2 (each split a pure half from an I/O half into two files — `lib/effects.mjs`
alongside `lib/ledger.mjs`'s one-line change; `lib/clause-id.mjs` alongside `lib/contract.mjs`'s
rewrite), the roadmap table names exactly **one** new file for this part: `lib/atom.mjs`. This
part's two genuinely different concerns — the pure lifecycle/cohesion algorithms (zero I/O, taking
only in-memory data) and the ledger-backed charter/delta/transition/flag/fold functions (real I/O
via `lib/ledger.mjs`'s `append()`) — still exist, but this design keeps them as two sections of one
file rather than splitting further, because (a) the roadmap explicitly scopes this part to one
file, and (b) `lib/effects.mjs` already established the precedent of one file housing more than one
related pure shape-check (node effects and edge effects together) — "the atom" is one coherent
concept the way "an effect" was, even though it has more surface area. `lib/atom.mjs` grows across
two tasks (T01 writes the pure top section, T02 appends the I/O bottom section) rather than two
files — a structural difference from Parts 1/2's practice, named explicitly in this plan's
`shared/conventions.md` rather than left implicit.

`lib/atom.mjs` does **not** import from `lib/footprint.mjs` (whose `lociOverlap`/`prefix` helpers
are private, unexported CLI-script internals, not a library surface) — criterion (c)'s overlap
check is reimplemented locally, small, and semantically distinct (root-stripped, not general
ancestor overlap) rather than forcing an export change onto a 2.x module this part has no other
reason to touch.

## Ledger event grammar summary (six new `EVENT_SCHEMAS` entries)

```js
'atom-chartered':     { required: ['component'] },
'atom-delta-authored':{ required: ['atomId'] },
'delta-enrichment':   { required: ['atomId'] },   // name pinned by DESIGN-3.0 §4.1 itself
'atom-transitioned':  { required: ['atomId', 'from', 'to'] },
'atom-flag-set':      { required: ['atomId', 'flag'] },
'atom-flag-cleared':  { required: ['atomId', 'flag'] },
```

All Family 3, all following the existing minimal `required`-field-presence idiom — no new
`validate` functions needed in `lib/ledger.mjs` itself; shape checks beyond field presence (a
malformed premise, an unknown flag name, an illegal transition) reject **before** `append()` is
called, inside `lib/atom.mjs`'s own wrapper functions, exactly like `allocateClauseId` rejecting a
malformed component before writing anything.

## `lib/atom.mjs`'s read side: `loadAtom`/`foldAtoms`, the derived mirror

Mirroring `allocatedClauseIds`/`citationGraph`'s "compute fresh from the ledger, cache nothing"
pattern: `loadAtom(effortRoot, atomId)` folds every `atom-*`/`delta-enrichment` event for one atom
id, in ledger order, into `{id, component, premises, purpose, locus, order, state, flags:
Set<string>, deltaClauses}` (or `null` if the id was never chartered). No `parentId`/lineage field:
this part does not charter R3/R4 children or record which atom superseded which — that's Part 5's
job (see Decision 5's R4 note) — so there is nothing for this fold to read yet. Adding a field this
part never writes would be a speculative shape guess, not a derived one.
`transitionAtom`/`enrichDelta`/`setFlag`/`clearFlag` all call `loadAtom` first to check the current
state before appending — the same "reject before writing" discipline, using the fold as the source
of truth rather than trusting caller-supplied state. `foldAtoms(effortRoot)` folds every atom in
one pass (`{atomId: record}}`), the natural sibling for anything (tests, a later part) that needs
every atom at once rather than one at a time.

## Version bump: minor, automatic — this part is purely additive

Unlike Part 2 (a hard, breaking cutover to an existing on-disk grammar that live 2.x efforts
depend on), Part 3 adds one **new** file and six **new**, additive `EVENT_SCHEMAS` entries —
zero behavior change to any existing caller, exactly Part 1's shape. No existing parser, no
existing event type, no existing exported function changes. `CLAUDE.md`'s automatic-minor-bump
rule applies without a human gate, the same as Part 1's `2.7.2 → 2.8.0`. This plan's final task
bumps and runs the full suite without stopping to ask — see that task for the one-line reasoning
repeated there for anyone reading it in isolation.

## Task/wave shape

Two units of genuinely new behavior get the full red/green/audit adversarial-TDD triad, mirroring
Part 1's proportions more closely than Part 2's (this part, like Part 1, is purely additive with no
migration/consumer-regression concern):

- **U1** (triad) — `lib/atom.mjs`'s **pure** half: `LIFECYCLE_STATES`, `TERMINAL_STATES`,
  `FLAG_NAMES`, `isValidTransition`, `cohesionComponents` (+ its private locus-overlap helper). Two
  test files (`test/atom-lifecycle.test.mjs`, `test/atom-cohesion.test.mjs`) since the two
  algorithms are conceptually separate even though they land in one file and one triad — both
  files are red for the identical reason (`lib/atom.mjs` doesn't exist yet), so splitting them into
  two triads would add a wave for no real independence gained (see Decision 7 on why they share a
  file).
- **U2** (triad) — `lib/atom.mjs`'s **I/O** half: `charterAtom`, `authorDelta`, `enrichDelta`,
  `transitionAtom`, `setFlag`, `clearFlag`, `loadAtom`, `foldAtoms`, plus the six
  `lib/ledger.mjs` `EVENT_SCHEMAS` lines. Depends on U1 (imports the real `isValidTransition`/
  `LIFECYCLE_STATES`/`FLAG_NAMES` from the same file it's appending to).
- **U3** (direct) — `docs/artifacts.md`'s new `## ledger.jsonl` atom-event subsection (a `*`
  entry) + `docs/glossary.md`'s new terms (**Atom**, **Charter**, **Delta**, **Delta-enrichment**,
  **Premise**, **Cohesion**, **Lineage** — scoped to what this part implements, not the full §12
  vocabulary list, most of which belongs to later parts) — including a note on the flagged
  intention-tag gap (Decision 3) so it isn't silently lost between parts.
- **U4** (direct) — version bump (minor, automatic per the section above) + full-suite run.

Roughly 8 tasks across 5 waves — proportionate to Part 1's 8/6 and Part 2's 9/6, appropriately
similar in size to Part 1 given both are additive, single-new-file-class changes.

## Self-review

- No placeholders/TBDs above — every decision has a concrete shape.
- Internal consistency checked: Decision 4's `locus` addition is deliberately delta-only, and
  Decision 6's criterion (c) is defined precisely enough to be non-vacuous given that every clause
  in one delta shares one component (Decision 4's own constraint) — the two decisions were checked
  against each other, not written independently.
- Scope check: stays inside "the atom's own charter/delta/lifecycle/cohesion" — no graph fold
  (Part 4), no verdict dispatch/R-code routing (Part 5), no frontier/guard checkpoints (Part 7),
  matching the roadmap's explicit exclusions and this doc's own "explicitly out of scope" section.
- Ambiguity check: every open DESIGN-3.0 sentence read two ways (premises' intention-tag, the
  `chartered -> retired-pending` edge, per-transition vs. generic events) got an explicit pick plus
  its named alternative, rather than a hedge.
- Cross-part dependency check: every field this part's data structures need from Part 2
  (`citations`, `demandedBy`, `CLAUSE_ID_PATTERN`) is confirmed present in the *shipped* Part 2
  code (`lib/contract.mjs`, `lib/clause-id.mjs`), not assumed from the design doc alone — verified
  by reading both files before writing this doc.
