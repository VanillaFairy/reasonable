# Design — Reasonable 3.0 Part 2: Contract Grammar v3

**Status:** brainstormed non-interactively. `reasonable` is a Claude Code plugin, not an
interactive service, and this pass was run as a single autonomous planning task rather than a
live back-and-forth — so this doc plays the role brainstorming normally reaches through dialogue,
but every genuinely contestable call is flagged explicitly below rather than silently resolved.
The human reviewing this (and the resulting plan) is the approval gate that would normally have
happened turn-by-turn.

## What this covers

Part 2 of the `reasonable` 3.0 roadmap (`docs/superpowers/plans/2026-07-08-reasonable-3.0-roadmap.md`):
teach `lib/contract.mjs` and `lib/ledger.mjs` to speak the v3 contract grammar —
durable per-contract clause ids, per-clause citations, and `demanded-by` provenance — per
`docs/DESIGN-3.0.md` §4.2 and §12. This is planning only; nothing here is implemented yet.

DESIGN-3.0 pins the *policy* (allocated ids, never reused, derived mirror, citations attach per
clause, `demanded-by` names one of four provenance kinds) but leaves several concrete shapes
unstated. This doc pins those shapes, with reasoning, and flags which ones are genuinely
contestable rather than cleanly derived.

## Decision 1 — Clause-id allocation: a new ledger event type, numbered from the ledger's own seq

**Question:** is allocation a new ledger event type or a reuse of Part 1's `effects` field? Is the
numeric suffix in `<component>#c<N>` a per-component counter (needs a fold) or the ledger's own
global monotonic `seq`?

**Decision:** a new, narrow Family-3 event type, `clause-allocated` (required field: `component`,
matching the existing `enrichment`/`characterization` schema shape exactly). The clause id is
`${component}#c${seq}`, where `seq` is simply the seq the ledger controller already assigns atomically
under its existing append lock.

**Why not reuse `effects`:** Part 1's `effects` field has a pinned, narrow meaning — it records
changes to the *development graph* (containment tree / dependency edges, Part 4's domain). A
clause id is not a graph node in that sense (atoms will be, later). Stuffing clause allocation into
`{nodeId: component, change: ...}` would overload `nodeId` to mean something Part 4's real fold
will need to distinguish from actual node ids — a category error dressed as reuse. A dedicated
event type is more honest and keeps `lib/effects.mjs` untouched, exactly as Part 1's own scope line
promised (`effects` "does not... validate that a referenced nodeId... actually exists" — it was never
meant to carry unrelated bookkeeping).

**Why not reuse `enrichment`/`characterization`:** those event types already carry distinct
domain meaning (the contract grew via the enrichment channel; a brownfield observation happened).
Overloading either to *also* mean "a clause id was allocated" would make a future fold miscount
both. A single-purpose event type matches this repo's existing "schema registry as data, not an
if-forest" convention (see `lib/ledger.mjs`'s `EVENT_SCHEMAS` comment).

**Why global seq over a per-component counter:** a per-component counter needs its own fold (scan
prior `clause-allocated` events for this component, take max, +1) — architecturally fine (it's the
same shape as the existing attempt-number arithmetic in `append()`), but it is *extra* machinery
that buys nothing: the ledger's append lock already guarantees two concurrent allocations can never
receive the same `seq`, which is the entire concurrency-safety property DESIGN-3.0 attributes to
allocation. Riding the existing seq costs zero new fold logic and keeps `lib/ledger.mjs`'s change to
one schema-registry line — proportionate to the roadmap's own file list, which names only
`lib/contract.mjs` as the changed file for this part. The cosmetic cost: ids are sparse/non-sequential
per component (`lexer#c743` rather than `lexer#c12`) since `seq` is shared across the whole ledger,
not scoped to a component. This is purely cosmetic — nothing (cohesion, citations, demanded-by)
depends on ids being small or contiguous, only on them being stable, unique, and never reused, which
a raw ledger seq already is.

**Flagged as contestable:** DESIGN-3.0's own example (`lexer#c12`) reads like a small per-component
count, which a global-seq id will usually not produce. If per-component readability matters more
than the extra fold logic, the alternative (per-component counter, folded from prior
`clause-allocated` events for that component) is a straightforward, well-precedented change — it
just costs one more small function and a slightly bigger `lib/ledger.mjs` diff. Flagging for the
human to override if the cosmetic property matters.

## Decision 2 — No persisted registry; the "derived mirror" is a pure on-demand fold

**Question:** DESIGN-3.0 says "the front-matter registry is a derived mirror." Is that a new
YAML field in the contract file's front matter (a cache someone must keep in sync), or something
else?

**Decision:** no new persisted state anywhere. Given ids are minted from the ledger's own `seq`
(Decision 1), there is nothing to cache — the id *is* the append call's return value, and
"has this id ever been allocated" is answerable directly by scanning `clause-allocated` events. The
"mirror" is realized as a new, pure, on-demand exported function (same pattern as the existing
`citationGraph()` — computed fresh, never written to disk): given an effort root, fold every
`clause-allocated` event into `{component -> Set<clauseId>}`. This is what a later audit tool (a
sibling to today's `danglingCitations`) would use to catch a hand-typed, never-actually-allocated
clause id sitting in a contract file.

**Why not a real front-matter field:** a literal `nextClauseSeq:` or `allocated: [...]` line in
front matter would be a second, disk-persisted source of truth for information already fully
recoverable from (a) the clause headings physically in the file and (b) the ledger's own event
log — a DRY violation with a real drift risk (nothing forces the cached field to stay in sync if
someone hand-edits the file). The ledger is already the single source of truth for "what was
allocated"; adding a written mirror duplicates it for no correctness gain once ids come from the
global seq.

**Flagged as contestable:** this reading treats "front-matter registry" as DESIGN-3.0's shorthand
for "the mirror is derived, not authoritative" rather than a literal instruction to add a specific
new field. If the intent was a literal, persisted, disk-cached field (e.g. because some later part
wants fast lookup without reading the whole ledger), that's a materially different, larger
implementation — flagging this explicitly since it's not cleanly derivable from the design doc's
one sentence.

## Decision 3 — `demanded-by` reference syntax: a tagged string, four prefixes

DESIGN-3.0 names four provenance kinds but never spells out a literal syntax (explicitly deferred
to "the §12 grammar precondition"). Since none of the referenced artifacts exist yet (no
`goals.json` until Part 6, no atoms until Part 3), Part 2 can only pin the *syntax shape*, not
validate against a live registry — exactly how Part 1 validated `effects` shape without checking
that a referenced node/edge actually existed.

**Decision:** `demanded-by: <tag>:<value>`, one line per clause, tag ∈ `{goal, gate, cite, ledger}`:

- `goal:<id>` — a goal-scenario assertion (opaque id; `goals.json` isn't built until Part 6, so
  `<id>` is unvalidated free text for now).
- `gate:<verbatim gate string>` — reuses the *exact* string already used in this contract's
  existing `- Gate:` lines (no new syntax invented for something that already has one).
- `cite:<component>#c<N>` — a consuming clause citation (the common case for provider
  enrichments); forward-compatible with atom ids once Part 3 lands (same tag, different value
  shape, no grammar change needed later).
- `ledger:<seq>` — a chartering rewrite event, referenced by ledger seq.

Validation in Part 2 is syntax-only: the value after the tag must be non-empty; the tag must be one
of the four. No resolution against any registry — matching Part 1's own scope discipline.

**Every clause requires exactly one `demanded-by` line, including brownfield `characterized`
clauses** — a characterized clause's demander is the characterization event itself
(`ledger:<seq of that characterization event>`), so this doesn't create a two-tier grammar where
some clauses have a reason for existing and others don't. Consistent with `- Gate:`'s existing
overwrite-on-duplicate tolerance, a clause with more than one `- Demanded-by:` line keeps the last
one parsed (not an error) — the same tolerant-parsing precedent as the existing `- Provenance:`
line.

**Parsing is permissive, completeness is a separate check** — matching this codebase's existing
split between "the parser never throws" and "a sibling function audits for violations"
(`danglingCitations` next to `parseContract`). `parseContract()` simply records `demandedBy: null`
when the line is absent or malformed; a new sibling function (a direct analogue of
`danglingCitations`) flags clauses that lack a well-formed `demanded-by` as a grammar-completeness
violation, without trying to resolve what it references.

**Flagged as contestable:** the four-prefix vocabulary and its exact strings are new design, not
quoted from DESIGN-3.0. A different tag vocabulary (or a non-tagged, freeform-with-a-`kind`-field
shape, e.g. YAML-ish `demanded-by: {kind: gate, ref: ...}`) is equally defensible. Flagging for the
human since §4.3's cohesion computation (Part 3) and the anti-padding audit will both read this
field by string equality — whichever shape is picked here is what they inherit.

## Decision 4 — Everything else in the current grammar carries forward unchanged

`## Scenarios`, `## Observable Seams`, `## Input Seams`, `- Provenance:`, `- Supersession:`,
`- Gate:`, `## Topology` / `- Seam:` — none of these are mentioned anywhere in DESIGN-3.0 (they're
2.x/brownfield-era additions layered on afterward), and nothing about durable clause ids or
per-clause citations requires touching them. They keep their exact current regexes, footprint-zero
properties, and parsed shapes. The only grammar that changes: the clause heading itself, and where
citations attach.

This means `test/contract.test.mjs`'s existing assertions about Scenarios/Seams/Provenance/
Supersession/Gate stay word-for-word true — only its fixtures' clause headings need mechanical
translation from `### §N <title>` to the new shape (see Decision 6, task boundary note).

## Decision 5 — Per-clause citations via a repeatable `- Cites:` bullet; consumers likely need no source changes

**Syntax:** citations move from the file-level `## Citations` section to a repeatable per-clause
bullet, `- Cites: <component>#c<N>`, one citation per line — mirroring `- Gate:`'s existing
multi-line-per-clause convention exactly (the parser already loops over every line pushing to
`current.gates`; the identical loop shape pushes to `current.citations`).

**Consumer impact re-examined:** `lib/footprint.mjs`'s `citationClosure()` only ever reads
`.component` off a citation entry; `lib/citation-resolve.mjs`'s `danglingCitations()` only ever
does `Set.has()` against opaque `component`/`clause` strings. Neither file contains a `§` literal
or any assumption about clause-id shape. As long as `parseContract()`'s returned flat `citations`
array keeps the `{component, clause}` shape (now populated by flattening each clause's own
`- Cites:` list, each entry additionally carrying `citingClause` for anyone who wants per-clause
precision later), **both consumers should need zero source changes** — contrary to my first-pass
assumption before reading their code closely enough. This is verified by regression test, not
assumed: neither file has a dedicated test today (`test/footprint*.test.mjs` and
`test/citation-resolve*.test.mjs` don't exist), so Part 2 adds one small regression test exercising
both against v3-shaped fixtures — closing a real pre-existing coverage gap on the exact two files
named as blast radius, rather than taking "should still work" on faith.

## Decision 6 — File layout: a new `lib/clause-id.mjs`, not folded into `lib/contract.mjs`

Allocation (`allocateClauseId`, which calls `lib/ledger.mjs`'s `append()`) and parsing
(`parseContract`, which recognizes the id shape in a `### ...` heading) are two different concerns
that would otherwise land in the same file and, worse, would be two tasks touching
`lib/contract.mjs` at once with no dependency edge between them — a violation of this repo's
existing "no two tasks without a dependency edge touch the same file" planning rule. Splitting a
small, focused module out for one of them is exactly the reasoning Part 1 already used for
`lib/effects.mjs` ("a distinct, single-purpose concern... same reasoning the codebase already
applies to `lib/progress-tree.mjs`").

**New file: `lib/clause-id.mjs`** — owns the `component#cN` shape (a regex/parse helper,
`formatClauseId`) *and* `allocateClauseId(effortRoot, component)` (imports `append` from
`./ledger.mjs`, appends `clause-allocated`, derives the id from the returned seq). `lib/contract.mjs`
imports only the pure shape helper from it (for heading recognition) — it never imports
`lib/ledger.mjs` directly, so today's zero-lib-import leaf module stays a leaf for parsing
purposes; only the new allocation module takes on the ledger dependency.

## Version bump: leaning MAJOR, and a finding worth surfacing loudly

CLAUDE.md requires a human nod before taking a major bump — this section is *that* ask, not a
silent decision.

**The case for major:** this is an actual, on-disk, machine-parsed grammar retiring in place
(`§N` addressing stops parsing as a clause at all under the new heading regex) — DESIGN-3.0 §12
itself frames the whole 3.0 generation this way ("why this is 3.0"), and explicitly rules out any
dual-format compatibility shim or in-place migration. Reasonable's own SemVer rule treats exactly
this shape of change ("existing `.reasonable/contracts/*.md` files stop parsing correctly") as
breaking from a plugin consumer's perspective, regardless of whether the *design* that motivated it
is ratified yet.

**Worth flagging prominently:** `lib/contract.mjs` is not 3.0-only, speculative infrastructure —
`lib/footprint.mjs` and `lib/citation-resolve.mjs` both import from it *today*, and both are
exercised by the currently-shipping, ratified 2.x methodology (wave-packing footprint computation,
citation-resolve merge gating). That means landing Part 2 as specified breaks contract parsing for
**every existing 2.x reasonable effort with live contracts, immediately on upgrade** — not just
future 3.0 adopters who've opted in. Part 1 was safe to treat as low-stakes precedent (pure
addition, zero behavior change for any existing caller); Part 2 doesn't get to inherit that
precedent. I lean **major**, and flag as a related-but-separate question (not itself a version
number call) whether the human wants Part 2 landed on the plugin's released main line at all before
DESIGN-3.0 ratifies, versus staged elsewhere until then — that's a repo-workflow decision beyond
what a version number can express, and the plan's final task should surface it rather than assume
an answer.

## Task/wave shape (mirrors Part 1's rigor)

Two units of genuinely new behavior get the full red/green/audit adversarial-TDD triad; three
supporting units are direct (mechanical, not blind-authored):

- **U1** (triad) — `lib/clause-id.mjs` + one new `lib/ledger.mjs` `EVENT_SCHEMAS` line
  (`clause-allocated`). New test file.
- **U2** (triad) — `lib/contract.mjs`'s `parseContract()` rewrite: new clause-id heading regex,
  per-clause `- Cites:`, per-clause `- Demanded-by:` (+ the completeness-check sibling function).
  Depends on U1 (imports its shape helper). The green task also migrates
  `test/contract.test.mjs`'s existing fixtures from `§N` to the new heading shape — flagged
  explicitly in `shared/conventions.md` as a deliberate, reasoned extension of Part 1's "green never
  touches the test file" rule: that rule protected a *newly red-authored* test file from a green
  task rationalizing its way past a real failure; migrating a *different*, pre-existing file's
  fixture syntax for an unrelated, already-settled reason (grammar cutover) is not the same act,
  and doing it in a separate task would leave an intentionally-broken intermediate commit, which
  this repo's own commit-hygiene rules don't want.
- **U3** (direct) — regression test for `citationClosure()`/`danglingCitations()` against v3
  fixtures (new coverage, not new behavior).
- **U4** (direct) — `docs/artifacts.md` contract-grammar section + `docs/glossary.md`'s **Clause**
  and **Footprint** entries + new terms (clause id, `demanded-by`, allocation).
- **U5** (direct) — version bump (surfacing the major/minor question explicitly rather than
  picking) + full-suite run.

Roughly 9 tasks across 6 waves — proportionate to Part 1's 8 tasks / 6 waves, appropriately larger
given two new behaviors instead of one.

## Self-review

- No placeholders/TBDs above — every decision has a concrete shape.
- Internal consistency checked: Decision 1's global-seq choice is what makes Decision 2's
  "no persisted registry" clean (if a per-component counter were chosen instead, *some* cached
  state would earn its keep — noted as the linked alternative in both decisions).
- Scope check: stays inside "teach the parser and the ledger to speak the grammar" — no cohesion
  graph, no atom lifecycle, no rewrite engine, matching the roadmap's explicit exclusions.
- Ambiguity check: every open DESIGN-3.0 sentence that could be read two ways (front-matter
  registry, demanded-by syntax, allocation event shape) got an explicit pick plus its named
  alternative, rather than a hedge.
