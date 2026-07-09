# Task T04: Docs — artifacts.md + glossary.md

**Role:** none (docs task, not a red/green/audit triad — there's no ambiguous behavior here to
protect against self-certification, just an accurate description of what T02b landed).

## References
- Read: `../shared/conventions.md` (the fixed three-part `artifacts.md` shape; the one-bullet
  `glossary.md` shape)
- Read: `docs/artifacts.md` — the whole `## contracts/<component>.md *` section (currently lines
  462–579, but re-locate it by heading text since line numbers may have shifted)
- Read: `docs/glossary.md` — the **Contract**/**Clause**/**Topology** bullets (currently lines
  58–68) and the **Footprint**/**Ripple manifest** bullets (currently lines 241–247), so your
  edits sit in the right place

## Dependencies
- Depends on: T02b (documents landed, tested behavior — not aspirational behavior)
- Depended on by: T05

## Scope

**Files:**
- Modify: `docs/artifacts.md`
- Modify: `docs/glossary.md`

**BOUNDARY — you MUST NOT modify any files outside this list. Do not touch any code or test
file.**

## Positive Constraints (DO)
- Match `docs/artifacts.md`'s existing three-part shape for the `## contracts/<component>.md *`
  section: prose intro → fenced example → field-by-field "Parsing rules (exact)" prose.
- Match `docs/glossary.md`'s existing one-bullet-per-term shape exactly: `- **Term** — definition.`
- Be explicit that clause-id allocation resolves ONLY shape (a well-formed `- Demanded-by:` line
  exists) — resolving what a reference points to is future work, exactly as this plan's other docs
  language already says for `effects` (Part 1).

## Negative Constraints (DO NOT)
- Do NOT add glossary entries for concepts this part does not implement (`atom`, `charter`,
  `delta`, the cohesion graph itself, etc.) — those belong to whichever future part actually builds
  them (see the roadmap).
- Do NOT edit the **Footprint** glossary entry — on inspection its definition
  (`locus ∪ citation-closure of touched contracts`) operates at the component/contract level, not
  the clause level, and needs no change. (The "which clauses" phrasing that might look related
  actually belongs to the separate **Ripple manifest** entry, which is generic enough — "which
  clauses" — to not encode the old `§N` shape either. Leave both alone; this is a deliberate
  no-op, not an oversight.)
- Do NOT modify any file outside the Scope section.

## Implementation Steps

### Step 1: Replace the `## contracts/<component>.md *` section in `docs/artifacts.md`

Find this exact text (search for the heading `## contracts/<component>.md *` through the closing
`---` right before `## ledger.jsonl *`). **Note:** the heading in the real file uses HTML entities
(`&lt;`/`&gt;`) for the angle brackets, not literal `<`/`>` — copy it exactly as shown here, not as
the human-readable form used elsewhere in this task file's prose:

```
## contracts/&lt;component&gt;.md *

A component's must-list. Provider owns the clauses; consumers cite. The grammar
below is parsed by `lib/contract.mjs`.

```markdown
---
component: parser
owner: vertical-slice:expr-eval   # the vertical slice or breadth pass that birthed it
status: active                # active | sealed  (descriptive only — never gates)
---

# Contract: parser

## Topology
- Lives at: `src/parser/`
- Depends on: lexer, ast
- Consumed by: evaluator

## Citations
- lexer §2
- ast §1

## Clauses

### §1 Exists and routes
`parse(tokens: &[Token]) -> Result<Ast, ParseError>` is public and total over
its input.
- Gate: vertical-slice:expr-eval / asserts `parses_integer_literal`

### §2 Rejects unbalanced parentheses
Returns `Err(ParseError::Unbalanced)` for inputs with mismatched `(`/`)`.
- Gate: vertical-slice:paren-grouping / asserts `rejects_unbalanced`

### §3 Deletion returns immediately (brownfield, characterized)
`delete(id)` returns `Ok` synchronously today.
- Provenance: characterized (test: `delete_returns_ok`, seam: `src/store/delete.rs`)
- Seam: `src/store/delete.rs`
- Supersession: pending
```

Parsing rules (exact):

- **Clauses** are level-3 headings matching `^### §(\d+)\s+(.*)$`. The number is
  the clause id; the rest is the title. Clause bodies run until the next `###`
  or the end of file.
- **Citations** are the bullet lines under a `## Citations` heading, each
  matching `^[-*]\s+([a-z0-9][a-z0-9-]*)\s+§(\d+)\b`. This list is authoritative
  for the citation graph (footprint closure, citation-resolve). A consumer **must
  not** restate a provider clause's text — it cites.
- A clause **should** carry one or more `- Gate:` lines naming the vertical slice and the
  asserting test, so bidirectional mapping (assertion ↔ clause) is checkable.
- A clause carries a **provenance**: `grown` (greenfield default — born RED at a
  gate; the absence of a `- Provenance:` line *means* `grown`) or `characterized`
  (brownfield — born GREEN by observation, **untrusted**, excluded from the
  trusted set). A characterized clause carries a `- Provenance:` line matching
  `^[-*]\s+Provenance:\s+(grown|characterized)\b`, parsed by a one-regex twin to
  the `- Gate:` extractor. When provenance is `characterized` it spells out the
  pinning test and seam: `- Provenance: characterized (test: <name>, seam: <locus>)`.
- A `- Seam:` line names the fence locus the characterization test captured,
  matching `^[-*]\s+Seam:\s+(.+)$` (the brownfield analog of a declared locus;
  Feathers' seam).
- A `## Scenarios` section (brownfield, optional) is a **frontier inventory**: a prose,
  zero-teeth map of the observable top-level scenarios on the effort's frontier, written by
  `census` at the analysis-time frontier pass (`characterization.workflow.js`). Each bullet is
  `- <key>: <observable> (seam: \`<glob>\`; floor: <test-ids or —>)`. It is **parser-invisible
  and footprint-zero by construction**: it contains **zero `### §N` clauses** and **zero
  `## Citations` bullets**, so `lib/contract.mjs` and the citation closure ignore it entirely
  (the same property `## Topology` prose has). A bullet **must not begin** with the reserved
  keywords `Gate:` / `Provenance:` / `Supersession:` / `Seam:` (those are clause-body lines).
  The inventory is **advisory** — a hint for the route-planner and the human birth-ratification
  gate; tooth-bearing `characterized` clauses are born **separately**, lazily, at first touch.
- A `## Observable Seams` section (optional) declares the **public test-observation surface** for
  render-coupled clauses — the **export** a test imports and a **stable handle** (`data-testid` /
  `role`) per queried element. It is **API surface, not behaviour**: it lets the blind-test-writer
  *target* a render clause instead of guessing (which dies at module-load / "element not found").
  Like `## Scenarios` it is **parser-relevant but footprint-zero**: `lib/contract.mjs` parses each
  bullet into `seams: [{ key, importHint, handle, raw }]` but emits **zero clauses and zero
  citations**, so the citation DAG is unperturbed. Each bullet is `- <key>: <body>`, where `<body>`
  names a backticked handle (`` `[data-testid=…]` ``) and/or an export (`` default export `Foo` ``).
  Do **not** confuse this **observable seam** with the brownfield `- Seam:` clause line, which is a
  **code locus** (Feathers' sensing seam); they are distinct concepts kept disjoint by context.
  Verification is **empirical**: the implementer exposes the declared seam in the DOM, and the
  adjudicator's real suite run proves it (element found ⟺ seam exposed). A render red that the
  `lib/seam.mjs` classifier calls a seam failure routes the `seam-undeclared` OUTCOME (below).
- A `## Input Seams` section (optional) is the **input-side sibling** of `## Observable Seams`. A
  component test does two things — it **drives the inputs** into the scenario and **observes the
  outputs**; observable seams cover the second, input seams cover the first. It declares the
  **external state a clause reads** (a store via `useStore`, a hook, a context) and **how a test
  mocks that state** to construct the scenario. It is **scenario-construction surface, not
  behaviour** — the mock *shape* is public, what the code computes from it is not — so, like its
  sibling, it does not break the blind-test-writer's blindness. Same parse property: **parser-relevant
  but footprint-zero** — `lib/contract.mjs` parses each bullet into `inputSeams: [{ key, mock, raw }]`
  (`mock` = the first backticked identifier, the state source to mock) and emits **zero clauses and
  zero citations**, so the citation DAG is unperturbed. Each bullet is `- <key>: <body>`, where
  `<body>` names the mock target (`` `useStore` ``) and the **state it consumes**; the parser keys
  off the **first line**, and any following prose is model-read. For a **selector store**
  (`useStore(selector)`) the seam declares the **state the selector reads** and the test drives the
  **real selector** against it (`(selector) => selector(mockState)`) — mocking the hook to a
  pre-computed **constant** bypasses the selector (the logic under test never runs; line-448's
  `measured.width != null` filter stayed untested behind a constant bbox array). Why it exists:
  without it the blind
  writer (blind to the code) mocks the store to its **safe empty default**, the scenario never
  occurs, and the behaviour is **never exercised even though the suite is green** (Slice 2: every test
  mocked `useStore` to `[]`, no edge ever crossed a node, the auto-router branch ran zero times —
  370/370 green, proving nothing). A behaviour clause that depends on external state with **no
  declared input seam** is the **blind-writer's `seam-undeclared` flag** (it cannot set the scenario
  up) — the *proactive* twin of the output-side `seam-undeclared` the `lib/seam.mjs` classifier
  computes from a render red. Verification is **empirical**: once the input seam is declared, the
  blind-writer constructs the real scenario and the auditor's mechanical teeth (discriminator /
  mutation) prove the behaviour is now actually reached.
- A `- Supersession:` line (`^[-*]\s+Supersession:\s+(pending|<event>)$`) is
  stamped `pending` by the characterizer when the touching change's
  `behaviorDelta` names this clause — the signal that a grown test is about to
  legitimately move the pinned behaviour. It is resolved (or removed) by the
  `change-characterized[-planned]` / `characterization-promotion` ceremony.
- `status` is descriptive; **no hook may key off it** (a "sealed" contract gets
  no exemptions — see glossary, informal-language clause).
```

Replace it with (same HTML-entity heading, unchanged):

```
## contracts/&lt;component&gt;.md *

A component's must-list. Provider owns the clauses; consumers cite. The grammar
below is parsed by `lib/contract.mjs`. **v3 grammar (reasonable 3.0 Part 2, DESIGN-3.0 §4.2/§12):**
clause ids are durable and allocated, never positional, and citations attach per clause. This is a
hard cutover — positional `§N` addressing is no longer recognized at all, with no dual-format
support.

```markdown
---
component: parser
owner: vertical-slice:expr-eval   # the vertical slice or breadth pass that birthed it
status: active                # active | sealed  (descriptive only — never gates)
---

# Contract: parser

## Topology
- Lives at: `src/parser/`
- Depends on: lexer, ast
- Consumed by: evaluator

## Clauses

### parser#c1 Exists and routes
`parse(tokens: &[Token]) -> Result<Ast, ParseError>` is public and total over
its input.
- Gate: vertical-slice:expr-eval / asserts `parses_integer_literal`
- Cites: ast#c1
- Demanded-by: goal:parses-arithmetic

### parser#c2 Rejects unbalanced parentheses
Returns `Err(ParseError::Unbalanced)` for inputs with mismatched `(`/`)`.
- Gate: vertical-slice:paren-grouping / asserts `rejects_unbalanced`
- Cites: lexer#c2
- Demanded-by: gate:vertical-slice:paren-grouping / asserts `rejects_unbalanced`

### parser#c3 Deletion returns immediately (brownfield, characterized)
`delete(id)` returns `Ok` synchronously today.
- Provenance: characterized (test: `delete_returns_ok`, seam: `src/store/delete.rs`)
- Seam: `src/store/delete.rs`
- Supersession: pending
- Demanded-by: ledger:14
```

Parsing rules (exact):

- **Clauses** are level-3 headings matching `^###\s+([a-z0-9][a-z0-9-]*#c\d+)\s+(.*)$` — a
  **durable, allocated** id in the shape `<component>#c<N>` (e.g. `lexer#c12`), never a
  positional number. **Allocation is a ledger event** (`clause-allocated`, minted by
  `lib/clause-id.mjs`'s `allocateClauseId`), serialized under the ledger controller's existing
  append lock; `N` is simply the seq that append assigns to that event, so two concurrent
  allocations can never mint the same id and no id is ever reused. Positional `§N` addressing
  (2.x) is **retired** — a `### §N` heading is no longer recognized as a clause at all (a hard
  cutover, no dual-format support). Clause bodies run until the next `###` or the end of file.
- **Citations** attach **per clause**: a repeatable `- Cites: <component>#c<N>` bullet inside a
  clause's body, matching `^[-*]\s*Cites:\s*([a-z0-9][a-z0-9-]*#c\d+)\b` (one citation per line —
  the same multi-line-per-clause shape `- Gate:` already uses). This is authoritative for the
  citation graph (footprint closure, citation-resolve): `lib/contract.mjs`'s returned flat
  `citations` array is the union of every clause's own citations, each entry additionally carrying
  `citingClause` (which of THIS component's clauses did the citing). A consumer **must not**
  restate a provider clause's text — it cites. The 2.x file-level `## Citations` section is
  retired along with `§N` addressing — the same hard cutover, no dual-format support.
- Every clause carries a **`- Demanded-by:`** line naming its provenance, matching
  `^[-*]\s*Demanded-by:\s*((?:goal|gate|cite|ledger):\S.*)$` (DESIGN-3.0 §4.2) — one of four
  tagged reference kinds: `goal:<id>` (a goal-scenario assertion), `gate:<verbatim gate string>`
  (reuses the exact string already used in this clause's own `- Gate:` line), `cite:<component>#c<N>`
  (a consuming clause citation — the common shape for provider enrichments), or `ledger:<seq>` (a
  chartering rewrite event — including a brownfield clause's own characterization event). Parsing
  is **permissive**: a clause with no well-formed `- Demanded-by:` line simply parses with
  `demandedBy: null`, it never throws — but `lib/contract.mjs`'s `missingDemandedBy(effortRoot)`
  flags this as a grammar-completeness violation, the same style of check `danglingCitations`
  already runs for citations. This is **syntax validation only**: resolving whether a referenced
  goal/atom/ledger event actually exists is later work (DESIGN-3.0 §4.3's cohesion graph).
- A clause **should** carry one or more `- Gate:` lines naming the vertical slice and the
  asserting test, so bidirectional mapping (assertion ↔ clause) is checkable.
- A clause carries a **provenance**: `grown` (greenfield default — born RED at a
  gate; the absence of a `- Provenance:` line *means* `grown`) or `characterized`
  (brownfield — born GREEN by observation, **untrusted**, excluded from the
  trusted set). A characterized clause carries a `- Provenance:` line matching
  `^[-*]\s+Provenance:\s+(grown|characterized)\b`, parsed by a one-regex twin to
  the `- Gate:` extractor. When provenance is `characterized` it spells out the
  pinning test and seam: `- Provenance: characterized (test: <name>, seam: <locus>)`.
- A `- Seam:` line names the fence locus the characterization test captured,
  matching `^[-*]\s+Seam:\s+(.+)$` (the brownfield analog of a declared locus;
  Feathers' seam).
- A `## Scenarios` section (brownfield, optional) is a **frontier inventory**: a prose,
  zero-teeth map of the observable top-level scenarios on the effort's frontier, written by
  `census` at the analysis-time frontier pass (`characterization.workflow.js`). Each bullet is
  `- <key>: <observable> (seam: \`<glob>\`; floor: <test-ids or —>)`. It is **parser-invisible
  and footprint-zero by construction**: it contains **zero clauses** and **zero citations**, so
  `lib/contract.mjs` and the citation closure ignore it entirely (the same property `## Topology`
  prose has). A bullet **must not begin** with the reserved keywords `Gate:` / `Provenance:` /
  `Supersession:` / `Seam:` / `Demanded-by:` / `Cites:` (those are clause-body lines). The
  inventory is **advisory** — a hint for the route-planner and the human birth-ratification gate;
  tooth-bearing `characterized` clauses are born **separately**, lazily, at first touch.
- A `## Observable Seams` section (optional) declares the **public test-observation surface** for
  render-coupled clauses — the **export** a test imports and a **stable handle** (`data-testid` /
  `role`) per queried element. It is **API surface, not behaviour**: it lets the blind-test-writer
  *target* a render clause instead of guessing (which dies at module-load / "element not found").
  Like `## Scenarios` it is **parser-relevant but footprint-zero**: `lib/contract.mjs` parses each
  bullet into `seams: [{ key, importHint, handle, raw }]` but emits **zero clauses and zero
  citations**, so the citation DAG is unperturbed. Each bullet is `- <key>: <body>`, where `<body>`
  names a backticked handle (`` `[data-testid=…]` ``) and/or an export (`` default export `Foo` ``).
  Do **not** confuse this **observable seam** with the brownfield `- Seam:` clause line, which is a
  **code locus** (Feathers' sensing seam); they are distinct concepts kept disjoint by context.
  Verification is **empirical**: the implementer exposes the declared seam in the DOM, and the
  adjudicator's real suite run proves it (element found ⟺ seam exposed). A render red that the
  `lib/seam.mjs` classifier calls a seam failure routes the `seam-undeclared` OUTCOME (below).
- A `## Input Seams` section (optional) is the **input-side sibling** of `## Observable Seams`. A
  component test does two things — it **drives the inputs** into the scenario and **observes the
  outputs**; observable seams cover the second, input seams cover the first. It declares the
  **external state a clause reads** (a store via `useStore`, a hook, a context) and **how a test
  mocks that state** to construct the scenario. It is **scenario-construction surface, not
  behaviour** — the mock *shape* is public, what the code computes from it is not — so, like its
  sibling, it does not break the blind-test-writer's blindness. Same parse property: **parser-relevant
  but footprint-zero** — `lib/contract.mjs` parses each bullet into `inputSeams: [{ key, mock, raw }]`
  (`mock` = the first backticked identifier, the state source to mock) and emits **zero clauses and
  zero citations**, so the citation DAG is unperturbed. Each bullet is `- <key>: <body>`, where
  `<body>` names the mock target (`` `useStore` ``) and the **state it consumes**; the parser keys
  off the **first line**, and any following prose is model-read. For a **selector store**
  (`useStore(selector)`) the seam declares the **state the selector reads** and the test drives the
  **real selector** against it (`(selector) => selector(mockState)`) — mocking the hook to a
  pre-computed **constant** bypasses the selector (the logic under test never runs; line-448's
  `measured.width != null` filter stayed untested behind a constant bbox array). Why it exists:
  without it the blind
  writer (blind to the code) mocks the store to its **safe empty default**, the scenario never
  occurs, and the behaviour is **never exercised even though the suite is green** (Slice 2: every test
  mocked `useStore` to `[]`, no edge ever crossed a node, the auto-router branch ran zero times —
  370/370 green, proving nothing). A behaviour clause that depends on external state with **no
  declared input seam** is the **blind-writer's `seam-undeclared` flag** (it cannot set the scenario
  up) — the *proactive* twin of the output-side `seam-undeclared` the `lib/seam.mjs` classifier
  computes from a render red. Verification is **empirical**: once the input seam is declared, the
  blind-writer constructs the real scenario and the auditor's mechanical teeth (discriminator /
  mutation) prove the behaviour is now actually reached.
- A `- Supersession:` line (`^[-*]\s+Supersession:\s+(pending|<event>)$`) is
  stamped `pending` by the characterizer when the touching change's
  `behaviorDelta` names this clause — the signal that a grown test is about to
  legitimately move the pinned behaviour. It is resolved (or removed) by the
  `change-characterized[-planned]` / `characterization-promotion` ceremony.
- `status` is descriptive; **no hook may key off it** (a "sealed" contract gets
  no exemptions — see glossary, informal-language clause).
```

(Note: the `## Scenarios` bullet's reserved-keyword list gained `Demanded-by:` / `Cites:` — the
only substantive wording change in that whole paragraph, since those are now also clause-body
line prefixes a stray Scenarios bullet must not start with.)

### Step 2: Insert the glossary.md entries

In `docs/glossary.md`, find this exact text (immediately before the **Topology** entry):

```
- **Contract parity** — the core invariant: *within contract = real; beyond
  contract = absent or loud; nothing in between.* A bare-200 endpoint is not a
  lie if the gate asserts exactly "exists, routes, returns 200." Dishonesty
  enters only when behavior silently exceeds or simulates the spec.
- **Clause** — one numbered must in a contract (`§N`). The unit of citation, the
  unit of enrichment, the unit a test assertion maps to.
- **Topology** — where an entity lives, its name, owner, relationships. Derived
```

Replace it with:

```
- **Contract parity** — the core invariant: *within contract = real; beyond
  contract = absent or loud; nothing in between.* A bare-200 endpoint is not a
  lie if the gate asserts exactly "exists, routes, returns 200." Dishonesty
  enters only when behavior silently exceeds or simulates the spec.
- **Clause** — one must in a contract, addressed by a **durable, allocated id**
  (`<component>#c<N>`, e.g. `lexer#c12` — reasonable 3.0 Part 2, DESIGN-3.0 §4.2), never a
  positional number. The id is minted once (a `clause-allocated` ledger event, serialized under
  the ledger controller's append lock) and never reused, even if the clause is later retired from
  the file. The unit of citation, the unit of enrichment, the unit a test assertion maps to, and
  the unit a **demanded-by** line names a provenance for.
- **Demanded-by** — a clause's required provenance line, naming the citable demander that
  justified adding it: a goal-scenario assertion (`goal:<id>`), a gate (`gate:<verbatim gate
  string>`), a consuming clause/atom citation (`cite:<component>#c<N>`), or a chartering rewrite
  event (`ledger:<seq>`) (DESIGN-3.0 §4.2). Load-bearing on the clause-cohesion graph (§4.3, a
  later part) and the anti-padding audit. Syntax-checked at parse time
  (`lib/contract.mjs`'s `missingDemandedBy`); resolving what a reference actually points to is
  later work.
- **Topology** — where an entity lives, its name, owner, relationships. Derived
```

### Step 3: Verify the edits

Read both files back at the edited locations to confirm the insertions landed cleanly, nothing
else in either file shifted or was accidentally duplicated, and the fenced example in
`artifacts.md` is valid markdown (matching backtick-fence nesting — the outer fence around the
whole example must use a different fence length or the inner code spans would break it; copy the
existing file's exact fencing style, don't reinvent it).

### Step 4: Commit

```bash
git add docs/artifacts.md docs/glossary.md
git commit -m "docs: pin the v3 contract grammar (clause ids, per-clause citations, demanded-by) in artifacts.md and glossary.md"
```

## Acceptance Criteria
- [ ] `docs/artifacts.md`'s `## contracts/<component>.md *` section describes the v3 grammar
      exactly (clause id shape, per-clause `Cites:`, `Demanded-by:` with its four-tag grammar) and
      states plainly that `§N`/file-level `## Citations` no longer parse
- [ ] Every brownfield-section paragraph (Scenarios/Observable Seams/Input Seams/Supersession) is
      preserved, with only the reserved-keyword-list addition noted above
- [ ] `docs/glossary.md`'s **Clause** entry describes the durable allocated id, not `§N`
- [ ] `docs/glossary.md` has a new **Demanded-by** bullet
- [ ] The **Footprint** and **Ripple manifest** entries are untouched (confirmed unnecessary — see
      Negative Constraints)
- [ ] No file outside Scope was modified
