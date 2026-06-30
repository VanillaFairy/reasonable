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

**Git policy — gitignored by design.** `.reasonable/` is **gitignored, not
tracked**. The analysis phase plants `/.reasonable/` and `/.reasonable.done-*/`
into the target repo's `.gitignore`. The methodology **never relies on
`.reasonable/` being in git**: orchestration state — ledger, journal, contracts,
baseline, verdicts, lane descriptors — is durable because it is **append-only on
disk**, and reconcile reads it straight from disk (`readJsonl` → `readFileSync`),
never from the git tree. The commit iron rule (§5.1) scopes to **CODEBASE work
product**: the D3a atomic commit is the code change plus the `Work-Order:`
trailer in the commit message, and the correlated ledger entry is an on-disk
append that **content-references** that commit (pinning its hash, just as
`baseline.json` pins file hashes) — it is *not* part of the git tree. Tracking
`.reasonable/` would entangle volatile orchestration churn with the codebase
history it governs, which is why keeping it out of git is the design, not an
omission.

**The two-root model (and why a lane never carries `.reasonable/`).** A fenced worker
operates against **two roots, split by domain**:

- the **effort root** owns the canonical `.reasonable/` (contracts, ledger, baseline,
  journal, intention, …) — read **and** written there, by absolute path;
- the **lane root** (the worktree) holds **code** (src, tests) and is the cwd for
  `git -C`, so commits land on the lane branch as a pre-integration diff.

A workflow subagent's process cwd is **always the effort root**, never its worktree
(a verified runtime fact: `cd` does not persist for a subagent), so workers write code
by **absolute path** under the worktree and run git with **`git -C <worktree>`**; they
write `.reasonable/` by absolute path under the effort root. The lane worktree's own
`.reasonable/` is gitignored and **never seeded** — a worker that writes effort state
into the worktree would lose it at teardown, so the fence denies that write. (The earlier
"lane-root incident" was exactly this conflation: a workflow narrowed the effort root onto
the worktree, so the fenced worker bootstrapped a divergent parallel `.reasonable/`.)
The lane descriptor's `effortRoot` back-pointer is how every hook **inside** the worktree
reaches the canonical state, and the worktree is nested at `<effortRoot>/.worktrees/<wo>`
so `findEffortRoot` resolves the canonical `.reasonable/` from within it.

**The effort root is configurable** (a workflow input), so several efforts can share one
repo — each with its own effort-root directory and its own nested `.worktrees/`. The libs
take an explicit `--root <effortRoot>` (and the code-operating libs `--tree <laneRoot>`)
rather than guessing the effort from cwd; the hooks resolve the effort from the **target
path** (`findEffortRoot(target)`), so a write into a specific effort's `.reasonable/` is
governed by that effort regardless of cwd. Non-overlap across parallel efforts is the
operator's responsibility.

**Identity-governed `.reasonable/` writes (the fence's control surface).** Because a
canonical `.reasonable/` write's target sits under the effort root (not under the lane
descriptor), and a subagent's cwd is the effort root, the fence cannot resolve the lane
for such a write by path. It governs them instead by the **harness agent-role stamp**
(`agent_type`, present on every subagent tool call; absent for the main session). The
role×artifact matrix (in `lib/fence.mjs`): contract-writers (implementer, characterizer,
scaffolder, census) write `contracts/`; contract-writers + the journal-writer append the
ledger; the journal-writer writes the `journal.json`/`inbox.json` index; census writes
`baseline.json`; the intention-writer writes `intention.md`; the lane-provisioner writes
`.reasonable-lane.json`; everything else (config, supervision, vision, route,
work-orders/, verdicts/, knowledge/, …) is **orchestrator-only**. The **main session**
(no `agent_type`) is the trusted control plane and may write `.reasonable/` freely.
**Code** writes stay governed the old way — by the worktree descriptor reached via
`findLane(target)` (locus / floor / test-path).

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
  test-conventions.md      # the stack's test-harness conventions (module system, runner, render lib) — fed to the blind-test-writer
  inbox.json *             # approval inbox (also mirrored in journal for convenience)
  progress.json            # derived progress tree, effort-scoped (for graphing; D19; no parser)
  progress.md              # derived progress tree, the pinnable live view (D19; no parser)
  progress-live.jsonl      # EPHEMERAL per-tool-call heartbeats the mirror overlays (D19 tier-2; presentation-only; reset freely)
  contracts/<component>.md *   # one per component, provider-owned clauses
  vertical-slices/<vertical-slice-id>.md   # vertical-slice specs (prose + a machine-readable gate block)
  work-orders/<wo-id>.json *   # work-order definitions
  knowledge/<id>.md            # spike / dead-end knowledge artifacts
  bug-reports/<id>.md          # post-merge defect reproductions
  progress-verdicts/<wo-id>.md # checkpoint artifacts
  ripple-manifests/<id>.md     # cross-contract impact manifests
  verdicts/<id>.md             # adjudicator / skeptic / auditor outputs
```

## Who writes each artifact — and why the orchestrator reaches for Bash

The message bus has a second rule beyond *format*: **who may write each artifact,
and how.** The fence enforces it, so it belongs in one place rather than being
re-derived every session.

The load-bearing fact: **once `.reasonable/` exists, the fence fails closed (D7b)
for every `Write`/`Edit` by an actor with no lane descriptor — and the main
session's own checkout has none.** So during an active effort the orchestrator (the
main session) does **not** hand-edit source or worker-owned artifacts. It
*dispatches* the worker whose role owns the write, and that worker — in a
provisioned lane — does the editing. Two consequences that look like quirks but are
the design:

- **The orchestrator writes its *own* bookkeeping via Bash.** The standing
  artifacts (vision, topology, route, config, supervision, lexicon, policies), plus
  the work-orders and vertical-slice specs it cuts during the run, are the
  orchestrator's to write — but `Write`/`Edit` is fenced shut for it the moment
  `.reasonable/` exists. So it writes them with **Bash** (heredoc / redirection).
  The no-lane Bash path is *intentionally not fenced*: a no-lane actor is the
  trusted control plane, not a worker to be contained. This is the sanctioned write
  path for the orchestrator, not a workaround to rediscover.
- **`census` writes via Bash for the same reason — by capability.** Its toolset is
  `Read, Grep, Glob, Bash` — **no `Write`/`Edit`** by design (a read-only role
  shouldn't carry edit tools). So it emits its skeleton contracts via Bash and
  `baseline.json` via `lib/baseline.mjs`. Same rule, made structural by the allowlist.

Everything a **dedicated worker** owns goes through that worker, never the
orchestrator's Bash:

| Artifact | Written by | How |
|---|---|---|
| vision · topology · route · config · supervision · resource-lexicon · sanity-invariants · documentation-policy · test-conventions | **orchestrator** (main session, at analysis/scaffolding) | Bash (no-lane path) |
| work-orders/`<id>`.json · vertical-slices/`<id>`.md | **orchestrator** (main session, during the run) | Bash (no-lane path) |
| intention.md | **intention-writer** (after the coherence-grill ratifies) | its own atomic commit |
| baseline.json + skeleton contracts | **census** (brownfield, at analysis) | Bash + `lib/baseline.mjs` (no-lane path) |
| contracts/`<component>`.md | **implementer** (enrich grown) · **characterizer** (birth characterized) | in-lane; only the lane's own contracts (§5.10) |
| ledger.jsonl | initialized empty at analysis; thereafter **each worker** appends its own line | atomic **on-disk** append, **content-referencing** that worker's D3a code commit — *not* part of the git tree (D4/D5) |
| ledger.jsonl `verifier-verdict` line | **adversary** proposes (read-only, returns it as data); the **orchestrator** or a narrow writer appends it | atomic **on-disk** append, content-referencing the judged commit — **not** a git commit of state (D4/D5) |
| journal.json · inbox.json | **journal-writer** (the single serialized scribe, D3b) | the derived index (rebuildable by reconcile) |
| progress.{json,md} · progress-live.jsonl | the **`progress` / `progress-live` hooks** (`lib/progress*.mjs`, no model) | derived presentation mirror + its ephemeral live overlay — not via a tool, never canonical |
| .reasonable-lane.json | **lane-provisioner** (before any fenced worker is dispatched) | `git worktree add` + the one descriptor write |
| knowledge/`<id>`.md | **spike-runner** (or a dead-end ceremony) | from the quarantine |
| progress-verdicts/ · ripple-manifests/ | **implementer** (checkpoint / escalation) | in-lane |
| verdicts/`<id>`.md | **adjudicator · skeptic · auditor** | read-only judgments, returned to the orchestrator, which persists them |

**The fence's Bash backstop (law 7).** Within a lane, the fence also inspects
`Bash`: a detected shell write to the **control surface** — the enforcement layer
(§5.14D) or a foreign/unauthorized contract (§5.10) — is denied just as the
equivalent `Edit` would be, so a lane cannot `echo >> ledger.jsonl` its way around
laws 1/2/4. It is a *backstop, not a sandbox*: the locus boundary for Bash still
rests on the role allowlist plus the downstream footprint/audit (fully fencing a
shell is undecidable). The recognized write forms live in `lib/shell-writes.mjs`;
the boundary is `lib/fence.mjs` law 7. The no-lane Bash path (orchestrator, census)
is deliberately left open per the rule above.

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
  "setupCommand": "cargo fetch",
  "testGlobs": ["**/tests/**", "**/*_test.rs"],
  "loudStubMarkers": ["todo!", "unimplemented!", "unreachable!(\"reasonable:"],
  "parkMarkerRegex": "#\\[ignore\\s*=\\s*\"pending:",
  "runMode": "gated",
  "brownfield": false,
  "baseBranch": "master",
  "effortBranch": "effort/fireside-widget",
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

`setupCommand` is the dependency-install command (`npm ci`, `uv sync`, `cargo
fetch`, …). The lane-provisioner uses it to make a *fresh worktree* able to run its
suite when the effort root's installed deps cannot simply be linked in — a worktree
that cannot run tests is what lets a verifier fake a probe. `testGlobs` classify a
path as test vs. source for the fence. `parkMarkerRegex`
and `loudStubMarkers` drive the two burndowns. `enforcementPaths` are blocked
categorically inside any lane (paths are matched relative to the effort root and
also as suffixes). `lintableInvariants` are the regex subset of the sanity
invariants the lint hook enforces.

`runMode` ∈ `"gated" | "autonomous" | null`. The entry skill writes it
(`develop`→`gated`, `develop-autonomously`→`autonomous`); reconcile reads it into the
briefing and the main session re-asserts it on the next launch. **An absent /
`null` `runMode` on a cold restart is a HALT** — defaulting to the "safer" mode
is still an inference, which the framework forbids. `config.json` is itself
fence-protected, so an agent cannot self-promote mode.

`brownfield` ∈ `true | false`. Set by the analysis-phase triage (the fourth
trigger: ungoverned existing code is touched). When `true`, the brownfield
mechanisms turn on — `baseline.json` exists, the `census`/`characterizer` roles
run, and the floor-containment fence rule applies. When unset / `false`, every
brownfield-only field and event below is a no-op.

`baseBranch` / `effortBranch` — the **multi-slice branch-hygiene** pair
(`lib/branch.mjs`), written once at analysis (step 7a). reasonable maintains a
dedicated **effort / integration branch** `effort/<name>` created off `baseBranch`
(the ref the effort started from) and **checked out in the main checkout for the
whole effort**. The mechanism, deterministic and escalation-free:

- **lanes are cut from `effortBranch`, explicitly** — the lane-provisioner runs
  `git worktree add … -b lane/<wo> <effortBranch>`, never a bare HEAD, so a slice
  that depends on an earlier slice is cut from a base that already contains it;
- **green lanes auto-merge into `effortBranch`** at each slice gate (`--no-ff`,
  merge SHA recorded) — automatically, logged, no human gate (the membrane, §
  vertical-slice-execution 7); so the next slice's lane is cut from a branch
  holding slices 1..N;
- **`baseBranch` is written exactly once**, at effort end, by the single
  `effortBranch → baseBranch` merge — the one human review gate (gated blocks;
  autonomous logs / leaves it as the one deliberate landing). Per-slice hygiene
  **never escalates**;
- **reconcile reads both**, accounts each lane's commits against `effortBranch`
  (not master), and **surfaces** any live lane that does not descend from it (a
  build-on-stale — cut from the wrong base; surfaced, never a halt).

Both are **null on an effort that predates this field** — then lanes are cut from
bare HEAD (the legacy behaviour) and there is no base to validate against.
`config.json` is fence-protected, so an agent cannot self-edit the branch pair.

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
event; an unaccounted floor change SURFACES as a **backstop tripwire** (D6) — it
is reported every session and, in autonomous mode, queued to the human inbox. The
byte-level hash cannot distinguish a harmless additive pin (e.g. an appended
parked characterization test) from a real regression, so it is no longer a
first-line `AMBIGUOUS → HALT`; it is a last-line backstop. An `accept`
`verifier-verdict` naming the change may annotate it **explained-by-verdict**, but
that is **advisory only** — it never clears the surfacing or the queue
(annotate-not-disarm). See `lib/baseline.mjs` (`floorIntegrity.explainedByVerdict`)
and `lib/reconcile.mjs` (the floor-integrity backstop pass).

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
- A `- Supersession:` line (`^[-*]\s+Supersession:\s+(pending|<event>)$`) is
  stamped `pending` by the characterizer when the touching change's
  `behaviorDelta` names this clause — the signal that a grown test is about to
  legitimately move the pinned behaviour. It is resolved (or removed) by the
  `change-characterized[-planned]` / `characterization-promotion` ceremony.
- `status` is descriptive; **no hook may key off it** (a "sealed" contract gets
  no exemptions — see glossary, informal-language clause).

---

## ledger.jsonl *

Append-only. One JSON object per line. Written by the orchestrator, by each worker
(its own enrichment/verdict line), by the `contract-amendment` ceremony, and by the
**commit-record** hook (a lane commit's `commit` custody line, D20); the redispatch
guard and test-parity fence read it. `seq` is monotonic; `ts` is an ISO-8601 timestamp.

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
{"seq":13,"ts":"...","type":"verifier-verdict","component":"store","diffRef":"src/store/delete.rs","verdict":"accept","oracle":"baseline-intent","by":"intent-verifier","proposed":true,"commit":"sha256:…"}
{"seq":14,"ts":"...","type":"commit","workOrder":"WO-12","commit":"sha256:…","role":"implementer","by":"commit-record"}
```

Event `type` values: `enrichment`, `amendment`, `verdict`, `scope-expansion`,
`budget-extension`, `dead-end`, and the brownfield / run-mode additions
`characterization`, `characterization-promotion`, `change-characterized`,
`change-characterized-planned`, `ratification`, `intent-check-failure`,
`verifier-verdict`, `commit`. The
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
- `verifier-verdict` — a read-only **adversary** (the worker-adversary-orchestrator
  trio's middle role) PROPOSES a verdict on a worker's output, judged against a
  named `oracle` that sits **above** the artifact, *before* the work is
  integrated. The adversary never self-executes the act its verdict authorizes
  (read-only by capability); it returns the verdict as data, and a narrow writer
  (or the orchestrator) performs the **atomic on-disk append** that records it —
  this is **not** a git commit of orchestration state (D4/D5). The event
  content-references the `commit`/hash it judged, exactly as `baseline.json` pins
  file hashes, so the verdict survives a torn window: it is durable on disk, not
  in the git tree. Fields: `component`, `diffRef` (the diff/seam judged), `verdict`
  ∈ `accept | reject | escalate`, `oracle` (the named reference above the
  artifact — e.g. `baseline-intent` for the pin/characterization adversary),
  `by` (the adversary role, e.g. `intent-verifier`), `proposed:true` (the verdict
  is a proposal, not a self-executed act), and the `commit` it judged.

  An `accept` verdict marks any floor diff it names **explained-by-verdict** — an
  **advisory accounting marker only** (D6, annotate-not-disarm). It is read by the
  floor-integrity reconcile pass (`lib/baseline.mjs` → `explainedByVerdict`), which
  STILL reports the diff as changed/surfaced; the verdict annotates it, it does
  **not** flip it to silently-accounted-and-hidden. In autonomous mode the
  surfaced floor change STILL queues to the human inbox (the floor-integrity-
  mismatch always-escalate class stays intact). A `reject`/`escalate` verdict
  annotates nothing; an `escalate` in autonomous mode JOINS the always-escalate
  classes (a fifth disposition queued BREAKING). A missing or half-written verdict
  can therefore only cause **more** human surfacing, never less — the failure
  direction is toward scrutiny.

- `commit` — a lane work-product commit, recorded the instant it lands by the
  **synchronous** `PostToolUse(Bash)` **commit-record** hook
  ([lib/commit-record.mjs](../lib/commit-record.mjs), D20). The worker's own atomic
  step is a git commit *then* a separate ledger append; a session-limit stop between
  them strands the commit as **unaccounted custody** (the dual of "a ledger entry with
  no commit") → reconcile HALTs AMBIGUOUS. This hook closes that window by appending
  the custody line itself, keyed to the lane **descriptor** (not the forgeable
  trailer), so reconcile **reclaims** the commit instead of halting. Fields:
  `workOrder`, `commit` (the SHA), `role`, `by:"commit-record"`. It is a **custody
  anchor, not a verdict** — it accounts the commit for recovery and claims nothing
  about green-ness. Idempotent (one line per SHA); fail-open.

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
  "cost": { "agentsDispatched": 21, "tokensSpent": 840000, "updatedAt": "2026-06-12T09:54:00Z" },
  "lastReconciled": "2026-06-12T09:55:00Z"
}
```

`commits` is the orchestrator's accounting (SHAs it has merged / lanes have
reported) — the basis for provenance partitioning (§5.14B). `lanes` maps each
live worktree path to its work order; reconciliation checks this against the
actual worktrees on disk (orphan accounting). `cost` is **descriptive run
telemetry** (the runner's agent tally + the engine's token spend) for the
deterministic progress mirror (D19) — best-effort, **never a gate input**, and
**not** reconcile-rebuildable (like `lastReconciled`, it resets from the next wave
on a cold rebuild).

---

## progress.json / progress.md  (derived mirror, D19)

The **progress mirror** — a *pure projection* of the canonical truth
(`work-orders/` ∪ `journal.json` ∪ `ledger.jsonl` ∪ `inbox.json`) into a nested tree:
effort → vertical slice → work order → atomic action. It carries **no `*`**: nothing
parses it back as authoritative input. It is written **only** by the deterministic
regenerator (`lib/progress.mjs`, no model in the loop), triggered by a `PostToolUse`
hook whenever the journal/ledger/inbox is written. Read by no enforcement logic;
rebuildable from canonical state at any instant; safe to delete.

It is **effort-scoped**: it lives in *this* effort's `.reasonable/`, and the regenerator
resolves the effort from the **changed artifact's path** (`findEffortRoot` on the written
`journal.json`/`ledger.jsonl`/`inbox.json`), *never* from cwd. So in a repo hosting several
efforts — each its own `.reasonable/`, non-overlap being the operator's responsibility — a
write to one effort's journal regenerates only that effort's mirror; the scribe's cwd (which
may belong to a different effort) is never consulted.

- `progress.json` — the **structured** tree (for graphical rendering later): each node is
  `{ kind: effort|slice|work-order|action, id, status, title, children, … }` plus
  effort-level `cost` and `counts`. A work-order node also carries a `pipeline` — the fixed
  wave checklist (`provision → [characterize] → implement → [intent-verify] → blind-test →
  adjudicate → audit`, the two bracketed stages conditional) projected to per-stage
  `done|active|pending|blocked`, and `live` (its current heartbeat, optionally with the
  acting agent's `todos`).
- `progress.md` — the **pinnable** rendered tree. The orchestrator tells the human once to
  pin it (`.reasonable/progress.md`) to follow a long run live; it updates each wave with no
  token cost. Each work order renders its `pipeline` scaffold (done/active/pending stages,
  the live tool folded into the active stage, the agent's own todo list nested beneath it).
  Atomic actions are ordered by **`seq`** (the monotonic append clock = causal order), never
  by `ts`; each event line carries a **literal `[HH:MM:SS]` UTC timestamp** (sliced from the
  recorded ISO `ts`, never a relative age that rots in a pinned file). A `ts` that is later
  than some higher-`seq` sibling's is *provably wrong* (an agent-authored ledger line can
  carry a guessed timestamp) and is **suppressed** — better no time than a misleading one.

The canonical index (`journal.json` / `inbox.json`) stays the lone serialized scribe's
(D3b); the mirror is a *separate* presentation artifact with a *single* deterministic writer,
so no concurrent-writer hazard is introduced.

---

## progress-live.jsonl  (ephemeral live channel, D19 tier-2)

The **live heartbeat channel** the mirror overlays. The canonical projection above only
advances when the scribe writes `journal.json` — once per wave — so a whole
provision→implement→blind-test→adjudicate→audit wave would otherwise run with `progress.md`
frozen on `pending`. This file is the fine-grained "what is happening **right now**" tier:

- **Written by a hook, not the scribe** — a `PreToolUse` hook (`hooks/progress-live` →
  `lib/progress-live.mjs`) fires on **every subagent write/run/TodoWrite tool call** and
  **appends** one line: `{ key, wo, stage, role, tool, target, ts }`, or — for a `TodoWrite` —
  `{ key, wo, stage, role, todos: [{content, status}], ts }` (no `tool`/`target`, so the
  agent's plan updates without clobbering its "current tool" heartbeat). The `stage`
  (`provision|implement|blind-test|adjudicate|audit|reconcile|plan|scribe|…`) is derived for
  free from the acting agent's role (`agent_type` → `roleOf`), so one hook delivers both
  *which stage each work order is in* and *which tool it is running*.
- **Append-only, like the ledger** — many subagents race through a wave with no barrier, so
  each **appends** its heartbeat (`O_APPEND`, never a read-modify-write) and never clobbers a
  peer's line; the projection (`readLive`) reduces to the latest positional line per `key`
  (the work order, else `@role` for the no-work-order stages) and the latest `todos` line per
  role. A `TodoWrite` carries no work order (a subagent's cwd is the effort root, not its lane
  worktree), so its todo list is **correlated to the unique live WO of its role** — and when
  two same-role lanes run at once (ambiguous), it surfaces at effort level, never misattributed.
- **EPHEMERAL and presentation-only** — it carries **no `*`**: no enforcement logic reads it,
  it is never a gate input, and tool-call activity **never** enters `journal.json` or the
  append-only `ledger.jsonl` (no keystroke noise in the program counter). It is parsed only by
  the presentation projector.
- **Resets cleanly** — truncated at **session-start** (a cold restart's pre-restart heartbeats
  are stale "now" noise), and the projection **ignores any heartbeat older than
  `journal.lastReconciled`**, so a reconcile resets the "now" view with no write side-effect
  leaking into `reconcile()` (which also runs mid-run). A stale entry past a TTL (a dead agent,
  or a single long-running tool call) is dropped by the projection.

The mirror merges these as a transient `⟳ now` overlay: an effort-level block for the
no-work-order stages, and — for each active work order — the heartbeat folded into its active
pipeline stage with the acting agent's todo list nested beneath. Deleting the file at any time
loses only the live overlay, never canonical truth — the next tool call repopulates it.

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
  "proposedPendingVerification": true,
  "budget": { "toolCalls": 150 },
  "counter": { "toolCalls": 0, "checkpointed": false }
}
```

`behaviorDelta`, `floorImpact`, and `contractBirth` are the per-lane copies of
the work-order fields the fence enforces directly: `floorImpact` is the floor-
locus opt-out the floor-containment rule checks; `contractBirth` gates born-
contract writes (only a `characterizer` lane carries `true`). All three are
omitted / empty in a greenfield lane.

`proposedPendingVerification` ∈ `true | false` (omitted / `false` by default)
marks a lane (the **worker** of a worker-adversary-orchestrator trio) whose
output is a **proposal** that must be judged by a read-only adversary against a
named oracle *before* it is integrated — the load-bearing safety property is that
the worker proposes and the adversary judges, but neither self-executes the
integration the verdict authorizes (D5/D10). The orchestrator sets it on lanes
whose write touches the **floor** or a **shared contract** (protected state),
where the adversary ALWAYS runs (D7); it may omit it for a boxed-in brand-new
file nothing depends on yet. The adversary's resulting `verifier-verdict` is the
on-disk ledger append described above — not a git commit of lane state.

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
set by the entry skill (`develop`→`strict`, `develop-autonomously`→`trusting`); the
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

## test-conventions.md

The stack's **test-harness conventions** — standing context fed into **every**
blind-test-writer dispatch (and useful to the characterizer, scaffolder, and implementer)
so they **follow** the repo's conventions and never **guess** them. The render-clause
incident came from guessing: CJS `require` in a Vite/ESM project (module-load death),
a named import of a `export default` component ("Element type is invalid"). Those are not
contract questions and not implementation behaviour — they are **public test surface** the
writer must know up front.

It carries **no `*`**: nothing in `lib/*.mjs` parses it; it is prose the model reads (like
`documentation-policy.md` / `sanity-invariants.md`). The hard, machine-read bindings
(`testCommand`, `testGlobs`, `setupCommand`, …) stay in `config.json *`; this file is the
human/agent-read narrative the blind-writer follows.

It is **detected or declared, once per stack**: on a brownfield effort the orchestrator
**detects** it from an existing test file + config (the source of truth for "how this repo
writes tests"); on greenfield it **declares** it from the stack binding table
(`skills/gate-mechanics/references/<stack>.md`). Written at analysis/scaffolding via the
no-lane Bash path, alongside `config.json`.

```markdown
# Test conventions: fireside-widget (typescript)

- **Module system:** ESM — `import`, **never** CJS `require`. `package.json` has `"type": "module"`.
- **Runner:** Vitest (`vitest run`). Use `describe` / `it` / `expect` / `vi`.
- **Render lib:** React Testing Library (`@testing-library/react`) — `render`, `screen`,
  `screen.getByTestId(...)`. Query the contract's declared `## Observable Seams` handles; never
  reach into the DOM by incidental attribute or by component-internal class names.
- **Import shape:** prefer the export the contract's `## Observable Seams` declares (often a
  `default` export for a component); confirm default-vs-named against the declared seam.
- **Setup:** `vitest.setup.ts` registers `@testing-library/jest-dom`; `jsdom` environment.
- **An existing example:** `src/edges/Edge.test.tsx` (mirror its import + render + query shape).
```

The blind-test-writer reads this file (and an existing test) **before** writing a render
test; the implementer reads it when it **exposes** a declared observable seam, so the
emitted handle/export matches what a test written to these conventions will query.

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

Each settled fork is one line, oldest first. The **round tag** (`R0`, `R1`, …) may
**repeat** across several lines: each grill pass returns a *batch* of independent
forks at the draft's highest open altitude tier (approach before detail), and the
human settles the whole batch in one round — so a single round commonly resolves
more than one fork.

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
