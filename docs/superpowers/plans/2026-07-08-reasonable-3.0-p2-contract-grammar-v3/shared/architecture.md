# Architecture — Part 2: Contract Grammar v3

## What this part is for

`docs/DESIGN-3.0.md` §4.2 retires positional clause addressing (`§N`) in favor of **durable,
allocated** clause ids (`<component>#c<N>`), moves citations from a file-level list to **per
clause**, and requires every clause to carry a **`demanded-by`** provenance line. §12 pins this as
one of the "why this is 3.0" breaking changes: no dual-format support, no in-place migration.

This part's whole job is to teach `lib/contract.mjs`'s parser and `lib/ledger.mjs`'s event
grammar to speak that shape. It does **not** compute the clause-cohesion graph itself (§4.3 — that
reads `demanded-by` and per-clause citations, but its actual graph-building logic is Part 3), and
it does not resolve *what* a `demanded-by` reference points to (does the named goal/atom/ledger
event actually exist — later parts' job, once those artifacts exist). Exactly like Part 1 validated
`effects` shape without interpreting an effect, this part validates and parses grammar shape
without interpreting what any of it means.

The full design reasoning — including every place DESIGN-3.0 left a concrete shape unstated, and
which alternative was rejected and why — lives in
`docs/superpowers/specs/2026-07-08-reasonable-3.0-p2-contract-grammar-v3-design.md`. This file
summarizes the load-bearing decisions task-writers need; read the design doc for the full
argument behind each one.

## Why a new file (`lib/clause-id.mjs`) instead of putting this in `lib/contract.mjs`

Two genuinely different concerns are involved:

- **Parsing** — recognizing `<component>#c<N>` inside a `### ...` heading. Pure, zero-I/O, lives
  naturally in `lib/contract.mjs` (which already does nothing but parse contract files).
- **Allocating** — minting a *new* id by appending a `clause-allocated` ledger event under the
  ledger controller's existing append lock. This needs `lib/ledger.mjs`'s `append()`, i.e. real
  I/O and a new coupling to the ledger.

Bundling both in `lib/contract.mjs` would mean two tasks (one authoring the allocator, one
authoring the parser) touching the same file with no dependency edge between them — this plan's
own file-conflict rule forbids that. It would also give `lib/contract.mjs` a new dependency on
`lib/ledger.mjs` that only the allocation half actually needs, coupling a today-zero-import leaf
module to the ledger controller for no reason the parsing half cares about.

`lib/clause-id.mjs` owns **both halves of the id concept** — the shape (`parseClauseId`,
`formatClauseId`, `CLAUSE_ID_PATTERN`/`CLAUSE_ID_RE`) and the allocator (`allocateClauseId`,
`allocatedClauseIds`) — because both genuinely are "the id," just its read side and its write
side. `lib/contract.mjs` imports only the pure shape half. This is the same "small, single-purpose
module, imported by more than one caller" reasoning Part 1 used for `lib/effects.mjs`.

## The allocation mechanism — no per-component counter, no persisted registry

**A new, narrow ledger event type: `clause-allocated`** (Family 3, `required: ['component']`,
identical shape to the existing `enrichment`/`characterization` schema entries). This is a
*single-line* addition to `lib/ledger.mjs`'s `EVENT_SCHEMAS` — no new branch in `append()`. Family
3's existing generic handling (best-effort `workOrder` resolution, which this event doesn't use)
is already sufficient; `clause-allocated` needs no node/workOrder address resolution at all.

**The id's numeric suffix is the ledger's own `seq`** — `formatClauseId(component, seq)` —
**not** a per-component count. The ledger's append lock already guarantees two concurrent
`clause-allocated` appends can never receive the same `seq`; riding that existing guarantee costs
zero new fold logic. The tradeoff, made explicitly and flagged in the design doc: ids are sparse
per component (`lexer#c743`, not `lexer#c1`, if 742 unrelated ledger events happened first) rather
than reading as "this component's Nth clause." Nothing in the grammar depends on contiguity — only
on stability, uniqueness, and non-reuse, all of which a raw seq already gives for free.

**There is no persisted "registry" anywhere** — not a new front-matter field, not a separate
`.reasonable/` file. DESIGN-3.0's "the front-matter registry is a derived mirror" is read here as
"the mirror is *derived*, not authoritative" rather than as an instruction to add a new cached
field: since ids come straight from the ledger's own seq, there is nothing to cache that isn't
already fully recoverable by (a) reading the clause headings physically present in a contract file
and (b) folding the ledger's `clause-allocated` events. `allocatedClauseIds(effortRoot)` is that
fold, computed on demand — the same "compute fresh, never write it to disk" pattern
`lib/contract.mjs`'s existing `citationGraph()` already uses. It exists so a later audit tool (a
sibling to today's `danglingCitations`) can catch a hand-typed, never-actually-allocated clause id
sitting in a contract file — that audit tool itself is **not** built in this part (out of scope,
same discipline as Part 1 not building the graph fold that reads `effects`).

## The v3 grammar, precisely

- **Clause heading**: `^###\s+(<component>#c<N>)\s+(.*)$` — `CLAUSE_ID_PATTERN` from
  `lib/clause-id.mjs`, composed into `lib/contract.mjs`'s own heading regex. A `### §N ...` heading
  is no longer recognized as a clause at all — it silently becomes ordinary prose (consistent with
  how any other unrecognized line in a contract file is already ignored). This is intentional and
  tested explicitly (a clause count of zero on an old-format heading is a **required** assertion,
  not an oversight) — the hard cutover DESIGN-3.0 §12 calls for.
- **Per-clause citations**: `- Cites: <component>#c<N>`, repeatable (one citation per line),
  inside a clause's body — the identical multi-line-per-clause shape the existing `- Gate:`
  extractor already uses. The 2.x file-level `## Citations` section is retired along with `§N`.
  `parseContract()`'s returned flat `citations` array (what `lib/footprint.mjs`'s
  `citationClosure()` and `lib/citation-resolve.mjs`'s `danglingCitations()` both consume) is now
  the flattened union of every clause's own citations — each entry keeps the exact `{component,
  clause}` shape those two functions already destructure, plus a new `citingClause` field neither
  of them reads (harmless — see the consumer-impact note below).
- **`demanded-by`**: `- Demanded-by: <tag>:<value>` where `tag ∈ {goal, gate, cite, ledger}` — see
  the design doc's Decision 3 for the full reasoning behind this four-tag vocabulary. Required on
  every clause, **including brownfield `characterized` clauses** (whose demander is naturally
  their own characterization ledger event: `ledger:<seq>`) — a clause without a demander would be a
  two-tier grammar this part deliberately avoids. Parsing is **permissive**: an absent or malformed
  line yields `demandedBy: null`, never a throw, mirroring `lib/contract.mjs`'s existing
  never-throws parsing style. Completeness is a **separate** function, `missingDemandedBy`, a
  direct structural analogue of the existing `danglingCitations` — parse permissively, audit
  separately, exactly the split this codebase already uses for citations.
- **Everything else is untouched**: `## Scenarios`, `## Observable Seams`, `## Input Seams`,
  `- Provenance:`, `- Supersession:`, `- Gate:`, `## Topology`/`- Seam:` keep their exact current
  regexes and footprint-zero properties. None of these are mentioned anywhere in DESIGN-3.0 (all
  are 2.x/brownfield-era additions layered on afterward), and nothing about durable clause ids or
  per-clause citations requires touching them.

## Consumer impact — verified, not assumed

`lib/footprint.mjs`'s `citationClosure()` only ever reads `.component` off a citation entry;
`lib/citation-resolve.mjs`'s `danglingCitations()` only ever does `Set.has()` against opaque
`component`/`clause` strings pulled from `parsed.citations`/`parsed.clauses[].id`. Neither file
contains a `§` literal or any assumption about clause-id shape — confirmed by reading both in
full. As long as `parseContract()` keeps returning a flat `citations` array with `{component,
clause}` present on every entry (now additionally carrying `citingClause`), **both consumers
should need zero source changes.** Neither has a dedicated test today, so this part adds one
(`test/contract-consumers.test.mjs`) to prove the claim empirically rather than assume it.

## Module boundaries after this part

- `lib/clause-id.mjs` (new) — the `<component>#c<N>` shape (pure) + `allocateClauseId`/
  `allocatedClauseIds` (ledger I/O). Imports `append` from `./ledger.mjs` and `readJsonl` from
  `./effort.mjs`.
- `lib/ledger.mjs` — one new `EVENT_SCHEMAS` line (`'clause-allocated': { required: ['component']
  }`). Nothing else changes.
- `lib/contract.mjs` — `parseContract()` rewritten for the v3 grammar (imports the shape helper
  from `lib/clause-id.mjs`); new `missingDemandedBy()` export; `citationGraph`, `citationClosure`,
  `danglingCitations`, `loadContract`, `allComponents`, `contractsDir`, `contractPath`,
  `parseFrontmatter` **all unchanged** (they operate on the parsed shape's already-generic fields,
  never on clause-id internals).
- `test/contract.test.mjs` — pre-existing fixtures migrated to the new heading/citation syntax;
  every existing assertion (Scenarios/Seams/Provenance/Supersession/Gate behavior) unchanged.
- `test/clause-id.test.mjs`, `test/contract-v3-grammar.test.mjs`, `test/contract-consumers.test.mjs`
  — new.

## Explicitly out of scope (deferred to later parts, same discipline as Part 1)

- The clause-cohesion graph computation itself (§4.3) — this part only makes the data (per-clause
  citations, `demanded-by`) available for it to read later.
- Resolving whether a `demanded-by` reference's target (a goal, an atom, a ledger event) actually
  exists — `goals.json` (Part 6) and atoms (Part 3) don't exist yet.
- A persisted, disk-cached registry of allocated ids, or a rebuild/reconcile step for one — there
  is nothing to cache once ids are seq-derived (see above).
- Auditing a contract file for a clause id that was hand-typed rather than legitimately allocated
  — a natural extension of `allocatedClauseIds`, not built here.
- Any dual-format (`§N` alongside `<component>#c<N>`) reading path — DESIGN-3.0 §12 rules this out
  explicitly.
