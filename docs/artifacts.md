# Effort artifacts — on-disk formats (the message bus)

The filesystem is the message bus. Agents share **artifacts, never conversation**.
This document pins the format of every artifact so the hook engine
(`lib/*.mjs`), the agents, and the phase skills all read and write the same
protocol. Glossary terms are normative (`docs/glossary.md`).

A `*` marks a **machine-parsed** artifact — its grammar is load-bearing; the
hook engine breaks if it drifts. Prose artifacts (vision, vertical-slice spec) are
human/agent-read and have a recommended shape, not a rigid grammar.

---

## Effort root

All artifacts live under `.reasonable/` at the **target project root** (the
repository the methodology is being applied to — *not* the plugin directory).
The presence of `.reasonable/` is what tells every hook "an effort is active";
absent it, all hooks no-op (fail open).

**Git policy (the commit iron rule).** `.reasonable/` is **tracked**, not
gitignored — the D3a atomic commit lands the ledger line *in* the same commit as
the work product, so git and the ledger stay one truth (§5.14B). Gitignoring the
whole directory makes the authoritative log as losable as uncommitted code was.
Gitignore only the **ephemera**: the lane worktrees (`.worktrees/`) and the
concluded archives (`.reasonable.done-*/`). The derived index (`journal.json`,
`inbox.json`) is rebuildable by reconcile and may be tracked or ignored at the
project's discretion; the ledger and the human-authored standing artifacts
(vision, intention, contracts, decisions, route, config) are tracked.

```
.reasonable/
  config.json *            # stack bindings, test/build commands, test globs, run/brownfield mode
  vision.md                # grilled user stories, quality attributes, topology ref
  intention.md             # the cited oracle (grilled decision-policy; scope: full|micro)
  topology.md              # the topology sketch
  baseline.json *          # brownfield regression floor + trusted promotions (absent greenfield)
  route.md                 # ordered vertical-slice frontier (human-editable)
  journal.json *           # execution state of record (single writer: orchestrator)
  ledger.jsonl *           # append-only event log
  supervision.json *       # profile + default budgets
  sanity-invariants.md     # standing taboos (lintable subset in config.json)
  resource-lexicon.json *  # declarable runtime resources
  documentation-policy.md  # how contracts relate to host docs
  inbox.json *             # approval inbox (also mirrored in journal for convenience)
  contracts/<component>.md *   # one per component, provider-owned clauses
  vertical-slices/<vertical-slice-id>.md   # vertical-slice specs (prose + a machine-readable gate block)
  work-orders/<wo-id>.json *   # work-order definitions
  knowledge/<id>.md            # spike / dead-end knowledge artifacts
  bug-reports/<id>.md          # post-merge defect reproductions
  progress-verdicts/<wo-id>.md # checkpoint artifacts
  ripple-manifests/<id>.md     # cross-contract impact manifests
  verdicts/<id>.md             # adjudicator / skeptic / auditor outputs
```

Each **lane worktree** additionally carries, at its own root:

```
.reasonable-lane.json *    # the work order, narrowed to what the fence enforces
```

---

## config.json *

Project-level bindings, written at scaffolding from the stack binding table
(`skills/gate-mechanics/references/<stack>.md`). Read by every mechanical hook
that needs a test command, build command, or test-path classification.

```json
{
  "stack": "rust",
  "buildCommand": "cargo build",
  "testCommand": "cargo test",
  "testOneCommand": "cargo test {test}",
  "testGlobs": ["**/tests/**", "**/*_test.rs"],
  "loudStubMarkers": ["todo!", "unimplemented!", "unreachable!(\"reasonable:"],
  "parkMarkerRegex": "#\\[ignore\\s*=\\s*\"pending:",
  "runMode": "gated",
  "brownfield": false,
  "enforcementPaths": [
    ".reasonable/ledger.jsonl", ".reasonable/journal.json",
    ".reasonable/supervision.json", ".reasonable/sanity-invariants.md",
    ".reasonable/resource-lexicon.json", ".reasonable/config.json",
    ".reasonable/intention.md", ".reasonable/baseline.json",
    ".claude/settings.json", ".claude/settings.local.json"
  ],
  "lintableInvariants": [
    {"id": "no-test-value-branch", "pattern": "== *\"__TEST__\"", "message": "test-conditioned branching"},
    {"id": "no-sleep-sync", "pattern": "thread::sleep|std::thread::sleep", "message": "sleep as synchronization"}
  ]
}
```

`testGlobs` classify a path as test vs. source for the fence. `parkMarkerRegex`
and `loudStubMarkers` drive the two burndowns. `enforcementPaths` are blocked
categorically inside any lane (paths are matched relative to the effort root and
also as suffixes). `lintableInvariants` are the regex subset of the sanity
invariants the lint hook enforces.

`runMode` ∈ `"gated" | "autonomous" | null`. The entry skill writes it
(`run`→`gated`, `run-autonomously`→`autonomous`); reconcile reads it into the
briefing and the main session re-asserts it on the next launch. **An absent /
`null` `runMode` on a cold restart is a HALT** — defaulting to the "safer" mode
is still an inference, which the framework forbids. `config.json` is itself
fence-protected, so an agent cannot self-promote mode.

`brownfield` ∈ `true | false`. Set by the analysis-phase triage (the fourth
trigger: ungoverned existing code is touched). When `true`, the brownfield
mechanisms turn on — `baseline.json` exists, the `census`/`characterizer` roles
run, and the floor-containment fence rule applies. When unset / `false`, every
brownfield-only field and event below is a no-op.

---

## baseline.json * (brownfield only)

The regression floor. Written once at analysis by the `census` pass, which
partitions the existing suite into FLOOR tests and captures a per-test locus +
content hash. Absent in a greenfield effort. Added to `enforcementPaths`, so an
agent cannot rewrite the floor it is held to.

```json
{
  "floor": [
    { "id": "store::delete_returns_ok", "locus": "src/store/**", "fileHash": "sha256:…" },
    { "id": "store::delete_idempotent",  "locus": "src/store/delete.rs", "fileHash": "sha256:…" }
  ],
  "trusted": []
}
```

`floor` is each pre-existing test the suite carried, with its `locus` (a
file-glob **over-approximation** — per-file granularity, matching the glob-based
fence and footprint algebra) and `fileHash` (a stable digest of the test's own
source, for the floor-integrity reconcile pass). FLOOR tests earn **zero**
correctness credit but breaking one is a forbidden regression, so the suite is
held green as a containment fence: `computeGreen = floorGreen && trustedGreen`.

The fence treats the **union of floor loci** like a declared locus — an
undeclared src edit intersecting it is denied unless the lane declares
`floorImpact`. A reconcile pass checks floor **integrity** by comparing each
test's current `fileHash` + `locus` against the last accounted
`characterization-promotion` / `change-characterized` / declared-`floorImpact`
event; an unaccounted floor change is AMBIGUOUS → HALT.

`trusted` starts empty. A FLOOR test is **promoted to TRUSTED one at a time**, by
citing a characterized/enriched clause and surviving the full pipeline (including
the BF2 reverse discriminator), logged as a `characterization-promotion` event;
its id moves from `floor` to `trusted` here.

---

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
- A `- Supersession:` line (`^[-*]\s+Supersession:\s+(pending|<event>)$`) is
  stamped `pending` by the characterizer when the touching change's
  `behaviorDelta` names this clause — the signal that a grown test is about to
  legitimately move the pinned behaviour. It is resolved (or removed) by the
  `change-characterized[-planned]` / `characterization-promotion` ceremony.
- `status` is descriptive; **no hook may key off it** (a "sealed" contract gets
  no exemptions — see glossary, informal-language clause).

---

## ledger.jsonl *

Append-only. One JSON object per line. Written by the orchestrator and by the
`contract-amendment` ceremony; the redispatch guard and test-parity fence read
it. `seq` is monotonic; `ts` is an ISO-8601 timestamp.

```jsonl
{"seq":1,"ts":"2026-06-12T10:00:00Z","type":"enrichment","component":"parser","clauses":["§3"],"workOrder":"WO-12","verticalSlice":"expr-eval","note":"learned precedence needs a clause"}
{"seq":2,"ts":"...","type":"amendment","component":"parser","clause":"§2","direction":"weaken","retro":"R3","approvedBy":"human","reason":"clause over-specified"}
{"seq":3,"ts":"...","type":"verdict","kind":"infeasible","workOrder":"WO-9","bindingConstraint":"vision:offline-only","survivedSkeptic":true,"knowledge":"knowledge/k7.md"}
{"seq":4,"ts":"...","type":"scope-expansion","workOrder":"WO-12","addedLocus":["src/ast/span.rs"],"approvedBy":"orchestrator"}
{"seq":5,"ts":"...","type":"budget-extension","workOrder":"WO-12","extension":1,"approvedBy":"orchestrator"}
{"seq":6,"ts":"...","type":"dead-end","workOrder":"WO-9","knowledge":"knowledge/k7.md","reprice":["WO-10","WO-11"]}
{"seq":7,"ts":"...","type":"characterization","component":"store","clause":"§3","test":"store::delete_returns_ok","seam":"src/store/delete.rs","workOrder":"WO-21","verticalSlice":"confirm-delete"}
{"seq":8,"ts":"...","type":"characterization-promotion","component":"store","clause":"§3","test":"store::delete_returns_ok","workOrder":"WO-21","note":"survived reverse discriminator; FLOOR→TRUSTED"}
{"seq":9,"ts":"...","type":"change-characterized","component":"store","clause":"§3","floorTest":"store::delete_returns_ok","grownTest":"store::delete_defers","workOrder":"WO-21"}
{"seq":10,"ts":"...","type":"change-characterized-planned","component":"store","clause":"§3","behaviorDelta":"delete now defers until confirmed","grownTest":"store::delete_defers","workOrder":"WO-21","approvedBy":"orchestrator"}
{"seq":11,"ts":"...","type":"ratification","gate":"analysis","runMode":"autonomous","approvedBy":"autonomous"}
{"seq":12,"ts":"...","type":"intent-check-failure","verticalSlice":"confirm-delete","correctedChoice":"used spinner instead of stale-badge","shouldHavePinged":true,"retro":"R4"}
```

Event `type` values: `enrichment`, `amendment`, `verdict`, `scope-expansion`,
`budget-extension`, `dead-end`, and the brownfield / run-mode additions
`characterization`, `characterization-promotion`, `change-characterized`,
`change-characterized-planned`, `ratification`, `intent-check-failure`. The
ratchet's invariant: an `amendment` with `direction:"weaken"` requires
`approvedBy:"human"` (or `"retro"`) — the engine flags any weakening lacking it.

The additions:

- `characterization` — the `characterizer` pinned current behaviour as a born
  `characterized` clause (FLOOR, untrusted) with its `test` and `seam`.
- `characterization-promotion` — a FLOOR test was promoted **one at a time** to
  TRUSTED by citing a clause and surviving the pipeline (incl. the BF2 reverse
  discriminator); its id moves `floor`→`trusted` in `baseline.json`.
- `change-characterized` — a characterized pin was legitimately moved (the new
  grown test now governs the locus); resolves the clause's `Supersession`.
- `change-characterized-planned` — the **advisory** ceremony for a planned
  supersession: a floor break the change declared up front via `behaviorDelta`
  with a matching new grown test. (A floor break with neither is BREAKING.)
- `ratification` — a self-ratified gate in **autonomous** run mode (gated mode
  persists an inbox item and returns instead); records which `gate` and `runMode`.
- `intent-check-failure` — the falsifiable defeater: the retro logs that the
  human corrected a non-breaking choice the agent did **not** escalate. A rising
  count is the signal the intention is too weak an oracle.

---

## journal.json *

The program counter. Single writer: the orchestrator. Statuses:
`pending | dispatched | checkpointed | merged | dead-end`.

```json
{
  "effort": "fireside-widget",
  "currentVerticalSlice": "expr-eval",
  "phase": "vertical-slice-execution",
  "supervision": "strict",
  "workOrders": {
    "WO-12": {
      "status": "dispatched", "role": "implementer", "verticalSlice": "expr-eval",
      "worktree": ".worktrees/WO-12", "branch": "lane/WO-12",
      "contracts": ["parser"], "commits": []
    }
  },
  "lanes": { ".worktrees/WO-12": "WO-12" },
  "inbox": [],
  "lastReconciled": "2026-06-12T09:55:00Z"
}
```

`commits` is the orchestrator's accounting (SHAs it has merged / lanes have
reported) — the basis for provenance partitioning (§5.14B). `lanes` maps each
live worktree path to its work order; reconciliation checks this against the
actual worktrees on disk (orphan accounting).

---

## work-orders/&lt;wo-id&gt;.json *

The full dispatch record. The orchestrator narrows this into the lane
descriptor when it dispatches.

```json
{
  "id": "WO-12",
  "role": "implementer",
  "verticalSlice": "expr-eval",
  "inputs": { "spec": "vertical-slices/expr-eval.md", "contracts": ["parser", "lexer"] },
  "output": "code + contract enrichment for parser",
  "gate": "vertical-slices/expr-eval.md#gate",
  "locus": ["src/parser/**", "src/lexer/token.rs"],
  "resourceClaims": ["port:8080"],
  "behaviorDelta": ["delete now defers until confirmed"],
  "floorImpact": ["store::delete_returns_ok"],
  "contractBirth": false,
  "budget": { "turns": 25, "toolCalls": 150, "attempts": 3 },
  "hash": "sha256:…"
}
```

`hash` is a stable digest of the normalized inputs (spec text + contract texts +
gate). The **redispatch guard** keys refutation-surviving verdicts on it: an
identical work order cannot be re-dispatched unless an input changed (so the hash
changes). `footprint` is **not stored** — it is *computed* from `locus` plus the
citation closure of `inputs.contracts` at dispatch time (`lib/footprint.mjs`).

The three brownfield fields (omitted / empty in a greenfield work order):

- `behaviorDelta` — the observable behaviours this change **intends to move**,
  recorded by the implementer *before* the characterizer pins anything (pinning
  first would freeze the very behaviour about to change). It feeds the two-oracle
  collision classifier in `toGateResult`: a floor break is a **planned
  supersession** only if a matching `behaviorDelta` and a new grown test govern
  that locus; otherwise it is an **unforeseen regression** → BREAKING.
- `floorImpact` — the floor-test ids this lane is **permitted to touch**. The
  floor-containment fence denies an undeclared src edit intersecting the union of
  floor loci; declaring the affected floor tests here is the opt-out, and the
  declaration is what the floor-integrity reconcile pass accounts against.
- `contractBirth` — `true` only for a `characterizer` lane, gating its sole right
  to **write a born `characterized` contract** (and its parked characterization
  tests). Any other role with `contractBirth` unset cannot create a born clause.

---

## .reasonable-lane.json *

Written by the orchestrator into each lane worktree's root at dispatch. The
fence reads it; it is the per-lane narrowing of the work order plus a mutable
counter. The `effortRoot` points back at the main checkout's `.reasonable/` so
hooks can read shared artifacts (ledger, config) from inside the worktree.

```json
{
  "workOrder": "WO-12",
  "role": "implementer",
  "effortRoot": "C:/work/fireside",
  "locus": ["src/parser/**", "src/lexer/token.rs"],
  "contracts": ["parser"],
  "testEditsAllowed": false,
  "quarantineOnly": false,
  "quarantineRoot": null,
  "behaviorDelta": ["delete now defers until confirmed"],
  "floorImpact": ["store::delete_returns_ok"],
  "contractBirth": false,
  "budget": { "toolCalls": 150 },
  "counter": { "toolCalls": 0, "checkpointed": false }
}
```

`behaviorDelta`, `floorImpact`, and `contractBirth` are the per-lane copies of
the work-order fields the fence enforces directly: `floorImpact` is the floor-
locus opt-out the floor-containment rule checks; `contractBirth` gates born-
contract writes (only a `characterizer` lane carries `true`). All three are
omitted / empty in a greenfield lane.

Per-role narrowing the orchestrator applies:

| role | locus | testEditsAllowed | other |
|---|---|---|---|
| `implementer` | work-order locus (src only) | **false** | may enrich own `contracts`; foreign contracts blocked |
| `blind-test-writer` | the effort's `testGlobs` | **true** | non-test edits blocked; no Bash (allowlist) |
| `characterizer` *(brownfield)* | declared seam (src, read-only) | **true** (characterization tests) | `contractBirth:true`; writes only born `characterized` contracts + parked characterization tests; cannot mutate production code |
| `census` *(brownfield)* | — | — | read-only; emits skeleton topology contracts + `baseline.json`; no edit tools |
| `spike-runner` | n/a | n/a | `quarantineOnly:true`, `quarantineRoot` set; all writes fenced to it |
| read-only roles | — | — | no edit tools at all (allowlist); fence is the backstop |

---

## supervision.json *

```json
{
  "profile": "strict",
  "defaultBudgets": {
    "implementer": { "turns": 25, "toolCalls": 150, "attempts": 3 },
    "blind-test-writer": { "turns": 10, "toolCalls": 40 },
    "skeptic": { "turns": 15, "toolCalls": 80 }
  },
  "mutationK": 8,
  "skepticTimeboxTurns": 15
}
```

`profile` ∈ `strict | standard | trusting` (glossary). The **initial** profile is
set by the entry skill (`run`→`strict`, `run-autonomously`→`trusting`); the
analysis phase writes it and must not override an already-set value (fallback
`standard`), and the retro tunes it thereafter. No profile waives a mechanical
check. Budgets start tight; retros loosen them with telemetry.

---

## resource-lexicon.json *

```json
{
  "resources": [
    { "id": "port:8080", "kind": "port", "exclusive": true },
    { "id": "tray-icon", "kind": "singleton", "exclusive": true,
      "note": "installs a tray icon + global mouse hook; one app-under-test at a time" },
    { "id": "db:test", "kind": "database", "exclusive": true }
  ]
}
```

The scheduler treats any resource claimed `exclusive` by two work orders as a
serialization point, exactly like an overlapping file locus.

---

## inbox.json *

```json
{
  "items": [
    {
      "id": "INBOX-3", "kind": "vision-amendment",
      "workOrder": "WO-9", "summary": "WO-9 needs offline sync dropped from vision",
      "freezesFootprintsTouching": ["sync", "store"],
      "raisedAt": "2026-06-12T11:00:00Z", "status": "open"
    }
  ]
}
```

`kind` ∈ `vision-amendment | dead-end | topology-smell | budget-extension |
provenance-drift`. **Silence never consents**: an item never auto-resolves; the
orchestrator blocks any lane whose footprint intersects
`freezesFootprintsTouching` until the human acts.

---

## intention.md

The cited **oracle** — a grilled decision-policy that lets a machine resolve
later forks the way the principal would. Produced at analysis by the
`coherence-grill.workflow.js` and **ratified by the human** before any vertical
slice runs. Fence-protected (in `enforcementPaths`), so a downstream agent reads
and cites it but never rewrites it. Agents resolving a fork **must cite**
intention.md; a human correcting an un-escalated non-breaking choice afterward is
a recorded `intent-check-failure`.

Mostly prose, with one machine-readable front-matter field, `scope`:

```markdown
---
scope: full        # full | micro
---

# Intention: fireside-widget

## Decision policy
- Offline-first: when connectivity and freshness conflict, prefer the last known
  good local state; never block the UI on the network.
- …

## Resolved forks (the grill's audit trail)
- **Fork:** stale-cache vs. spinner on cold start → **resolve:** show stale,
  badge it stale. (grilled R0)
```

`scope` ∈ `full | micro`. **full** is the normal effort-wide oracle. **micro** is
the low-floor / single-brownfield-change form (§17): just the change sentence,
its `behaviorDelta`, and the touched seam's pinned behaviour — the scale-free
promise applied to one work order. The coherence-grill **still runs** in
brownfield: its oracle is the *change*-intention even when the legacy system
embodies none.

---

## vertical-slices/&lt;vertical-slice-id&gt;.md

Mostly prose, with one machine-readable gate block. The gate names the
promoted scenario test(s) that must be GREEN to close the vertical slice, or — by
explicit exception — a manual verification procedure.

```markdown
# Vertical slice: expr-eval

**Scenario (user-visible):** A user types `2 + 3 * 4` and sees `14`.

**Risk / information gain:** highest open uncertainty — validates the
lexer→parser→evaluator seam end-to-end.

## Gate
```yaml
kind: automated            # automated | manual
promotes: ["scenarios::evaluates_precedence"]
# for kind: manual, instead provide:
# procedure: "Run the app, type 2 + 3 * 4, confirm 14 renders within 100ms."
```

## Contracts touched
parser, lexer, evaluator
```

---

## knowledge/&lt;id&gt;.md (spike & dead-end)

Mandatory format. Conclusions rot, so the **expiry note** is required.

```markdown
# Knowledge: k7 — Can we sync fully offline with CRDT lib X?

- **Question:** Does `automerge@2` round-trip our document model under a 3-way
  concurrent edit without a server?
- **Method:** Quarantine spike: 200-line harness, 3 simulated peers, random edits.
- **Evidence:** Merge converged in 1,000/1,000 trials. Excerpt (the incantation
  that worked):

      let doc = Automerge::load(&bytes)?;  // note: must load, not new(), to keep actorId

- **Verdict:** Feasible.
- **Confidence:** High.
- **Expiry:** Tested against automerge 2.1.0, Rust 1.86. Re-verify on major
  automerge bump or document-model change.
```

Re-entry into mainline is **rewrite-from-knowledge**, never refactor-from-spike.
The vertical-slice implementer reads this artifact and may quote curated excerpts; it
**never reads the spike code**.

---

## progress-verdicts/&lt;wo-id&gt;.md

The checkpoint artifact (budget exhaustion). Fed to a *fresh* implementer on
retry — never the failed transcript.

```markdown
# Progress verdict: WO-9 (attempt 2)

- **Tried:** recursive-descent with backtracking; then Pratt parsing.
- **What binds:** the contract requires error spans (parser §4) but the lexer
  (lexer §1) discards positions — the binding constraint is a seam, not my code.
- **Current hypothesis:** lexer must carry spans before this is parseable.
- **Suggested escalation:** ripple to lexer, or route-planner reorders.
```

---

## ripple-manifests/&lt;id&gt;.md

```markdown
# Ripple manifest: WO-12 → lexer

| contract | clause | change | rationale |
|---|---|---|---|
| lexer | §3 (new) | enrichment | tokens must carry byte spans |
| parser | §4 | enrichment | builds on lexer §3 |

**Order:** provider-first (lexer enriched and GREEN, then parser). No amendment;
no citation dangles.
**Cycle check:** none (lexer does not cite parser).
```

---

## verdicts/&lt;id&gt;.md

Adjudicator, skeptic, and auditor outputs share this envelope:

```markdown
# Verdict: V14 — adjudicator on WO-12 red `rejects_unbalanced`

- **By:** adjudicator (read-only)
- **Input:** failing test `rejects_unbalanced`, contract parser §2
- **Ruling:** implementation violates contract (returns Ok for `(1+2`).
- **Action:** fix implementation; **test untouched**.
- **Citation:** parser §2.
```

Skeptic verdicts add `survivedSkeptic: true|false` to the ledger entry; auditor
reports list discriminator / mapping / mutation / proportionality results.
