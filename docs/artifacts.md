# Effort artifacts — on-disk formats (the message bus)

The filesystem is the message bus. Agents share **artifacts, never conversation**.
This document pins the format of every artifact so the hook engine
(`lib/*.mjs`), the agents, and the phase skills all read and write the same
protocol. Glossary terms are normative (`docs/glossary.md`).

A `*` marks a **machine-parsed** artifact — its grammar is load-bearing; the
hook engine breaks if it drifts. Prose artifacts (vision, vertical-slice spec) are
human/agent-read and have a recommended shape, not a rigid grammar.

**Path values in any machine-parsed JSON artifact MUST use forward slashes.** An
agent that hand-authors JSON (the lane-provisioner's descriptor, the journal-writer's
`lanes` map, …) must write every path POSIX-style — `"C:/work/proj/x"`, never
`"C:\work\proj\x"`. On Windows a native path resolves with backslashes, and a
backslash *opens* a JSON string escape, so a raw path (`\w`, `\s`, …) makes the whole
file **unparseable**. Forward slashes are valid for Node and git on every OS and are a
no-op off Windows. This bit hard once: an unescaped `effortRoot` corrupted a lane
descriptor, `findLane()` read the unparseable file as *no lane*, and the fence denied
the provisioned worker as "presumed hostile" — a whole slice stalled with no signal of
the real cause (graph-editor-ux-overhaul, 2026-07). Libraries are safe automatically
(`JSON.stringify` escapes backslashes); only **hand-authored** JSON is at risk.

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
scaffolder, census) write `contracts/`; **no role** writes the ledger directly (2.0 — every
append goes through the ledger controller CLI, a Bash invocation the fence does not classify
as a file write); the journal-writer writes the `journal.json`/`inbox.json` index; census writes
`baseline.json`; the intention-writer writes `intention.md`; the lane-provisioner writes
`.reasonable-lane.json`; the work-order-writer writes `work-orders/<id>.json` (persisting the
route-planner's proposed plan); everything else (config, supervision, vision, route,
verdicts/, knowledge/, …) is **orchestrator-only**. The **main session**
(no `agent_type`) is the trusted control plane and may write `.reasonable/` freely.
**Code** writes stay governed the old way — by the worktree descriptor reached via
`findLane(target)` (locus / floor / test-path).

```
.reasonable/
  config.json *            # stack bindings, test/build commands, test globs, run/brownfield mode, tier
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
| vertical-slices/`<id>`.md | **orchestrator** (main session, during the run) | Bash (no-lane path) |
| work-orders/`<id>`.json | **work-order-writer** (persists the route-planner's proposed plan, before provisioning) | in-run `agent()` (no-lane path); write-if-absent (immutable) |
| intention.md | **intention-writer** (after the coherence-grill ratifies) | its own atomic commit |
| baseline.json + skeleton contracts | **census** (brownfield, at analysis) | Bash + `lib/baseline.mjs` (no-lane path) |
| contracts/`<component>`.md | **implementer** (enrich grown) · **characterizer** (birth characterized) | in-lane; only the lane's own contracts (§5.10) |
| ledger.jsonl | initialized empty at analysis; thereafter **each worker** appends its own line | via the **ledger controller** (`node lib/ledger.mjs append …` — the sole write path), content-referencing that worker's D3a code commit — *not* part of the git tree (D4/D5) |
| ledger.jsonl `verifier-verdict` line | **adversary** proposes (read-only, returns it as data); the narrow **verdict-writer** appends it | via the **ledger controller CLI**, content-referencing the judged commit — **not** a git commit of state (D4/D5) |
| journal.json · inbox.json | **journal-writer** (the single serialized scribe, D3b) | the derived index (rebuildable by reconcile) |
| progress.{json,md} | the **ledger controller** (`lib/ledger.mjs`, via `lib/progress-map.mjs`'s `writeMirror` — no model in the loop), regenerated after every append | derived presentation mirror, a full replay of `ledger.jsonl` — not via a tool, never canonical |
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
  "tier": "full",
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

**Multi-stack efforts.** On an effort spanning stacks (e.g. `python+typescript`),
`testCommand` may be a **list of per-stack entries** instead of a string, so a
mechanical check runs the suite of the stack that *owns the file it is testing* — a
`.py` mutant under pytest, a `.ts` mutant under vitest — never one stack-blind
command that is hollow off its own stack:

```json
{
  "stack": "python+typescript",
  "testCommand": [
    { "globs": ["server/**"], "command": "python -m pytest server/tests -q", "oneCommand": "python -m pytest server/tests -q -k {test}" },
    { "globs": ["admin/**"],  "command": "cd admin && npm test",             "oneCommand": "cd admin && npm test -- {test}" },
    { "globs": ["client/**"], "command": "cd client && npm test",            "oneCommand": "cd client && npm test -- {test}" }
  ]
}
```

Each entry carries its own `command` (full suite) and `oneCommand` (the `{test}`
template in that runner's syntax — `-k {test}` for pytest, `-- {test}` for vitest).
The file under test picks the **first entry whose `globs` match** it: `mutation-sample`
by the mutated source file, the absence `discriminator` by the overlaid test file, the
reverse `discriminator` by the clause locus. The **full-suite green gate runs every
stack** — "suite green" on a mixed effort means *all* stacks pass. A file matching no
entry resolves to no command — a loud gap, never a silent wrong-stack run. A plain
string `testCommand`/`testOneCommand` stays the single-stack fast path, unchanged (it
is one nameless stack that owns every file); the top-level `testOneCommand` applies
only in that single-string form.

`setupCommand` is the dependency-install command (`npm ci`, `uv sync`, `cargo
fetch`, …). The lane-provisioner uses it to make a *fresh worktree* able to run its
suite when the effort root's installed deps cannot simply be linked in — a worktree
that cannot run tests is what lets a verifier fake a probe. `testGlobs` classify a
path as test vs. source for the fence. `parkMarkerRegex`
and `loudStubMarkers` drive the two burndowns. `enforcementPaths` are blocked
categorically inside any lane (paths are matched relative to the effort root and
also as suffixes). `lintableInvariants` are the regex subset of the sanity
invariants the lint hook enforces.

`runMode` ∈ `"gated" | "autonomous" | null`. The entry skill writes it — `develop`
asks the human and records `gated`|`autonomous`; the `develop-autonomously` alias
presets `autonomous`. Reconcile reads it into the briefing and the main session
re-asserts it on the next launch. **An absent / `null` `runMode` on a cold restart
is a HALT** — defaulting to the "safer" mode is still an inference, which the
framework forbids. `config.json` is itself fence-protected, so an agent cannot
self-promote mode.

`tier` ∈ `"full" | "lite"` (default `"full"`) — the **effort-default** ceremony
depth, the axis orthogonal to `runMode`. `develop` asks it alongside the mode. `lite`
is the §17 audit-depth collapse made user-selectable: inside the runner the
vertical-slice audit drops the iterative **mutation-sample only** (keeping the real
suite run, the discriminator, bidirectional mapping, and the characterization
reverse-discriminator) — it waives no guard and thins nothing else. Tier is
**per-slice overridable**: a `route.md` slice may carry its own `tier`, and the
effective tier a slice runs under is `slice.tier ?? config.tier`. Unlike `runMode`,
an absent/invalid `tier` is **not** a HALT — it defaults to `full` (the safe
direction), so efforts predating the field keep full verification. `config.json` is
fence-protected, so an agent cannot self-lower the effort default; the **raise-only
ratchet** (an agent may push a slice to `full`, never down to `lite`) is enforced as a
main-session discipline in `vertical-slice-execution`.

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

---

## ledger.jsonl *

Append-only. One JSON object per line. The **ledger controller** (`lib/ledger.mjs`) is the
**sole write path** onto this file — every event, from every actor (orchestrator, worker,
hook), goes in through `node lib/ledger.mjs append …` (CLI) or its `append(root, event)` JS
API (used by library callers like `lib/reconcile.mjs` and `lib/commit-record.mjs`). Nothing
else may touch this file: an agent can *propose* what an event says, but it cannot author the
coordinates it lands at. On every append the controller:

1. **Validates** the event's shape against a per-type schema — an unknown type is **rejected
   outright** (a clean break, not a lenient pass-through).
2. **Stamps** the fields no caller may author, discarding anything the caller supplied for
   them: `seq` (monotonic, from the same append lock `lib/effort.mjs` already provides), `ts`
   (local-time ISO-8601 with a numeric offset, e.g. `2026-07-04T15:30:00.000+03:00`, from the
   controller's own clock — an agent-supplied timestamp is always overwritten),
   and — for the two families below that carry them — `attempt` and the resolved absolute
   `node`.
3. **Appends** the stamped line, then regenerates the progress mirror (below) unless the
   caller opted out.

**No actor ever types a commit SHA from memory** — a `commit`/`sha`/`diffRef` hash is always
the literal output of `git rev-parse` on the lane (read + validated by a Bash-capable role),
never restated from context (D21).

There are three families of event. All three are validated and stamped by the one controller;
they differ in what they mean and how their `node` gets resolved.

### Family 1 — node lifecycle

`kind` ∈ `work-order | spike | scaffold | grill-pass | slice | phase` names what's being
dispatched; it rides on every Family-1 event that has a node.

| type | required fields | controller stamps | meaning |
|---|---|---|---|
| `node-planned` | `node`, `kind`, `title` | — | the node enters the tree, `pending` |
| `node-dispatched` | `node`, `kind` | `attempt` (+ rewrites `node` to `base[k]` on a reopen) | the node goes `active`; a reopen opens the `name[k]` sibling (see below) |
| `node-checkpointed` | `node` | — | budget exhaustion — back to `pending`, detail `"checkpointed"` |
| `node-downgraded` | `node` | rewrites `node` to the live attempt | reconcile's crash-recovery downgrade — the live attempt is sealed `failed`, detail `"lost-work crash"`; the next dispatch mints the retry sibling |
| `node-completed` | `node` | — | `done` |
| `node-failed` | `node` (`reason` optional) | — | `failed` — **non-terminal**: down, under investigation (does not compromise the parent) |
| `node-panicked` | `node` (`reason` optional) | — | `panic` — **terminal, unrecoverable**: escalates to the user and compromises the parent |
| `node-canceled` | `node`, `reason` | — | `canceled` (the node only; no cascade — its children keep their own status under a ⊘ parent) |
| `approval-resolved` | `id` | — | annotates the effort root; the inbox banner's own fold is future work |
| `concluded` (existing) | — | — | the whole effort root goes `done` |

Any Family-1 event may name its node by **`workOrder`** (a bare node id) instead of `node` —
the controller resolves it against the live tree and stamps the absolute path itself. An
unresolvable `workOrder` fails the append: agents treat that as fatal (fail loud);
`reconcile.mjs` tolerates it as non-fatal, since recovery must not die just because the
progress tree happens to be thin.

**Attempt arithmetic — `name[k]` siblings**, computed fresh from the tree at append time,
never carried by the caller. An attempt is a **sibling**, not a wrapper: attempt 1 IS the
base node (`slice/WO`); a re-run is `slice/WO[2]`, `slice/WO[3]`, … Agents always send the
BASE path. For the base's family under its parent, let `latest` be the highest attempt present
(0 = never planned) and `liveMember` its node. `node-dispatched`: `latest` 0 → reject
(unplanned); `liveMember` sealed `failed`/`panic` → a **reopen**, stamp `latest + 1` and mint
the sibling `base[latest+1]`; otherwise a fresh dispatch (attempt 1) or a **continuation** (a
checkpoint reclaim re-using the same node). `node-downgraded`: seals `liveMember` `failed`
(rejects a never-dispatched node). The old attempt is **never edited or deleted** — it stays
as visible history beside the fresh sibling, showing exactly what it finished before it died.

### Family 2 — worker reports

`report-started {under, node, label?}`, `report-finished {under, node}`,
`report-canceled {under, node, reason}` — a dispatched worker's own narration of the work it
is doing, addressed **relative to itself**: `under` names the worker's own node (its work
order, its slice, …), and `node` is a relative path under that (`implementation`,
`audit-2/mutation-sample`). The controller looks up `under` (the base id) in the tree, finds
its **live attempt**, and stamps the absolute address itself — `<liveMember path>/<node>`, so
a report lands directly under the current attempt with **no wrapper segment**, and a worker
never has to know or track which attempt it is in. An unresolvable `under` — or one whose live
member is still `pending` (never dispatched) — fails the append: a worker report with no home
is a bug, not something to render around.

### Family 3 — domain events

The rest of the vocabulary is unchanged by this refactor — same types, same fields, same
meaning: `enrichment`, `amendment`, `characterization`, `characterization-promotion`,
`change-characterized`, `change-characterized-planned`, `verdict`, `verifier-verdict`,
`scope-expansion`, `budget-extension`, `dead-end`, `ratification`, `intent-check-failure`,
`commit` (plus the pre-existing `correction`, D21, orthogonal to this vocabulary). They are
validated loosely — a known type is accepted; `enrichment`/`characterization` additionally
require `component`. The only thing that changed is where they land: if the event carries a
`workOrder` and no `node`, the controller stamps `node` when the id resolves (best-effort
here, unlike Family 1/2 — an unresolvable `workOrder` just leaves the event node-less rather
than failing the append). Every Family-3 event folds to **exactly one annotation note** on
its resolved node (or the effort root, if it has none) — domain color, never structure.

```jsonl
{"seq":1,"ts":"2026-07-02T10:00:00Z","type":"node-planned","node":"expr-eval","kind":"slice","title":"expr-eval"}
{"seq":2,"ts":"...","type":"node-dispatched","node":"expr-eval","kind":"slice","attempt":1}
{"seq":3,"ts":"...","type":"node-planned","node":"expr-eval/WO-12","kind":"work-order","title":"parser: precedence"}
{"seq":4,"ts":"...","type":"node-dispatched","node":"expr-eval/WO-12","kind":"work-order","attempt":1}
{"seq":5,"ts":"...","type":"report-started","under":"WO-12","attempt":1,"node":"expr-eval/WO-12/implementation","label":"implementation"}
{"seq":6,"ts":"...","type":"enrichment","component":"parser","clauses":["§4"],"workOrder":"WO-12","node":"expr-eval/WO-12","verticalSlice":"expr-eval","note":"learned precedence needs a clause"}
{"seq":7,"ts":"...","type":"report-finished","under":"WO-12","attempt":1,"node":"expr-eval/WO-12/implementation"}
{"seq":8,"ts":"...","type":"commit","workOrder":"WO-12","node":"expr-eval/WO-12","commit":"sha256:…","role":"implementer","by":"commit-record"}
{"seq":9,"ts":"...","type":"node-completed","node":"expr-eval/WO-12"}
{"seq":10,"ts":"...","type":"amendment","component":"parser","clause":"§2","direction":"weaken","retro":"R3","approvedBy":"human","reason":"clause over-specified"}
{"seq":11,"ts":"...","type":"verdict","kind":"infeasible","workOrder":"WO-9","bindingConstraint":"vision:offline-only","survivedSkeptic":true,"knowledge":"knowledge/k7.md"}
{"seq":12,"ts":"...","type":"dead-end","workOrder":"WO-9","knowledge":"knowledge/k7.md","reprice":["WO-10","WO-11"]}
{"seq":13,"ts":"...","type":"node-canceled","node":"expr-eval/WO-9","reason":"dead end: no offline CRDT library round-trips our model"}
{"seq":14,"ts":"...","type":"scope-expansion","workOrder":"WO-13","addedLocus":["src/ast/span.rs"],"approvedBy":"orchestrator"}
{"seq":15,"ts":"...","type":"budget-extension","workOrder":"WO-13","extension":1,"approvedBy":"orchestrator"}
{"seq":16,"ts":"...","type":"node-downgraded","node":"expr-eval/WO-13","attempt":1}
{"seq":17,"ts":"...","type":"node-dispatched","node":"expr-eval/WO-13","kind":"work-order","attempt":2}
{"seq":18,"ts":"...","type":"node-completed","node":"expr-eval/WO-13"}
{"seq":19,"ts":"...","type":"characterization","component":"store","clause":"§3","test":"store::delete_returns_ok","seam":"src/store/delete.rs","workOrder":"WO-21","verticalSlice":"confirm-delete"}
{"seq":20,"ts":"...","type":"characterization-promotion","component":"store","clause":"§3","test":"store::delete_returns_ok","workOrder":"WO-21","note":"survived reverse discriminator; FLOOR→TRUSTED"}
{"seq":21,"ts":"...","type":"change-characterized","component":"store","clause":"§3","floorTest":"store::delete_returns_ok","grownTest":"store::delete_defers","workOrder":"WO-21"}
{"seq":22,"ts":"...","type":"change-characterized-planned","component":"store","clause":"§3","behaviorDelta":"delete now defers until confirmed","grownTest":"store::delete_defers","workOrder":"WO-21","approvedBy":"orchestrator"}
{"seq":23,"ts":"...","type":"ratification","gate":"analysis","runMode":"autonomous","approvedBy":"autonomous"}
{"seq":24,"ts":"...","type":"intent-check-failure","verticalSlice":"confirm-delete","correctedChoice":"used spinner instead of stale-badge","shouldHavePinged":true,"retro":"R4"}
{"seq":25,"ts":"...","type":"verifier-verdict","component":"store","diffRef":"src/store/delete.rs","verdict":"accept","oracle":"baseline-intent","by":"intent-verifier","proposed":true,"commit":"sha256:…"}
{"seq":26,"ts":"...","type":"correction","supersedes":25,"workOrder":"WO-21","commit":"sha256:…","reason":"seq 25 recorded a SHA that does not resolve in git"}
{"seq":27,"ts":"...","type":"concluded"}
```

Event `type` values, by family — **Family 1:** `node-planned`, `node-dispatched`,
`node-checkpointed`, `node-downgraded`, `node-completed`, `node-failed`, `node-canceled`,
`approval-resolved`, `concluded`. **Family 2:** `report-started`, `report-finished`,
`report-canceled`. **Family 3:** `enrichment`, `amendment`, `characterization`,
`characterization-promotion`, `change-characterized`, `change-characterized-planned`,
`verdict`, `verifier-verdict`, `scope-expansion`, `budget-extension`, `dead-end`,
`ratification`, `intent-check-failure`, `commit`, and the pre-existing `correction` (D21,
untouched by this vocabulary). The ratchet's invariant carries over unchanged: an `amendment`
with `direction:"weaken"` requires `approvedBy:"human"` (or `"retro"`) — the engine flags any
weakening lacking it.

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

- `correction` — supersedes an EARLIER event's commit SHA with the real one (D21).
  The append-only ledger is never edited in place, so a bad SHA is fixed forward: a
  `correction` names the `supersedes` seq it replaces and carries the **real** hash
  read from `git rev-parse`. `reconcile` HONORS it — the superseded seq is no longer
  a torn-window HALT ([lib/reconcile.mjs](../lib/reconcile.mjs) `supersededSeqs`).
  This is the **belt-and-suspenders** to the scribe never originating a SHA: the
  primary fix removes the opportunity to fabricate one; the correction lets an
  already-wedged run recover deterministically. A `correction` whose own `commit` is
  **itself** unresolvable supersedes nothing (a phantom cannot be laundered into
  another phantom — the original HALT stands and the bad correction line is itself
  flagged). Fields: `supersedes` (the seq), `workOrder`, `commit` (the real SHA),
  `reason`.

- **Retired: `action-started` / `action-finished` / `action-obsoleted`.** The old
  per-work-order heartbeat trio — and its CLI, `lib/action-report.mjs` — no longer exists.
  Family 1 (node lifecycle) and Family 2 (worker reports) above replace it. The **write** side
  is a clean break: the ledger controller **rejects** these types outright, so a new run can
  never produce one. The **read** side stays honest about the past: `lib/progress-map.mjs`'s
  fold recognizes any event type it has no mapping for — this trio included — and turns it into
  a single plain annotation note (`<type> · <workOrder>`) on the nearest resolvable node, or the
  effort root if none resolves. A pre-2.0 ledger therefore still **renders** (degraded, as flat
  notes instead of the section/item tree it used to produce) rather than erroring or losing
  history; that is backward-viewability, not reconstruction.

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
      "contracts": ["parser"], "commits": [], "dispatchEpoch": 1
    }
  },
  "lanes": { ".worktrees/WO-12": "WO-12" },
  "inbox": [],
  "cost": { "agentsDispatched": 21, "tokensSpent": 840000, "updatedAt": "2026-06-12T09:54:00Z" },
  "lastReconciled": "2026-06-12T09:55:00Z"
}
```

`commits` is the orchestrator's accounting (SHAs it has merged / lanes have
reported) — the basis for provenance partitioning (§5.14B). `dispatchEpoch` is a
**monotonic dispatch counter** (integer ≥ 1): the write-ahead scribe bumps it by
one each time it lifts this order `pending → dispatched` (first dispatch → 1; each
re-dispatch after a lost-work crash → 2, 3, …), and **never** on any other
transition, so a same-run re-pass or a checkpoint-reclaim leaves it unchanged. It
is preserved across a reconcile downgrade (which touches only `status`). The progress
mirror no longer reads it: the ledger controller now derives a node's attempt/reopen
state directly from the ledger-built tree itself (its own `name[k]` sibling family — see
`ledger.jsonl` above), so `dispatchEpoch` is journal-only bookkeeping today. Absent on
a legacy journal ⇒ read as `0`; **never a gate input**. `lanes` maps each live worktree
path to its work order; reconciliation checks this against the actual worktrees on disk
(orphan accounting). `cost` is **descriptive run telemetry** (the runner's agent tally +
the engine's token spend) — best-effort, **never a gate input**, and **not**
reconcile-rebuildable (like `lastReconciled`, it resets from the next wave on a cold
rebuild); it is also the one thing the progress mirror's header line reads from outside
the ledger (see below).

A work order is **terminal** once `status` is `"merged"` — its code already landed
on the effort branch, so re-dispatching it is never correct, no matter what its
`.reasonable/work-orders/<id>.json` spec still says on disk. `lib/reconcile.mjs`'s
`terminalWorkOrders` (the mechanical set the route-planner and the script both refuse
to re-dispatch) additionally tolerates a `status:"green"` + `merged:true` shape as
equivalent. This is a defensive **read-side** tolerance for a real drift incident
(a work order once landed with the vertical-slice-gate's own `green` vocabulary
instead of `merged`), not a second value anything should intentionally write —
the sole writer still only ever produces the work-order statuses above.

---

## progress.json / progress.md  (derived mirror, D19)

The **progress mirror** — a generic status tree, folded from `ledger.jsonl` and nothing
else. It carries **no `*`**: nothing parses it back as authoritative input. It is written
**only** by `lib/progress-map.mjs`'s `writeMirror`, called by the **ledger controller**
after every append, plus a narrowed `PostToolUse` hook that watches `ledger.jsonl` alone as
a belt-and-suspenders regen (the journal and inbox no longer drive the tree, so writing them
no longer triggers one). Read by no enforcement logic; rebuildable from the ledger at any
instant; safe to delete.

**Full replay, always — never a patch.** Every regen rebuilds the tree from scratch by
folding *every* event in `ledger.jsonl`, in `seq` order, through `lib/progress-tree.mjs`'s
`apply()`. Nothing is mutated incrementally. This is what makes the interpretation table
(`lib/progress-map.mjs`'s `EVENT_MAP`, ledger event type → tree operation) safe to fix after
the fact: correct a mis-mapped type and the very next append re-renders **all** history
through the corrected rule — no migration, no backfill script, nothing left dangling from
the old interpretation.

**The tree is generic**, not a fixed effort→slice→work-order→action backbone. Any
dispatchable thing — a slice, a work order, a spike, a scaffold, a worker's own reported span
of work — is a **node**, addressed by a `/`-joined path from the root, and it carries exactly:

```json
{ "id": "WO-12", "label": "parser: precedence", "status": "active",
  "detail": null, "statusTs": "2026-07-02T10:04:00Z",
  "notes": [{ "text": "enriched parser §4", "ts": "..." }],
  "children": [ /* nested nodes, same shape — plus any `name[k]` retry siblings */ ] }
```

The `status` field here is the **stored** status; the mirror renders and counts each node's
**derived** status (a leaf shows its own; a container is a pure function of its live children —
see `docs/glossary.md` "Derived status"). Six statuses, one glyph each, the same vocabulary at
every depth: `pending ·`, `active ▶`, `done ✓`, `failed ↻`, `panic 💥`, `canceled ⊘` — where
`failed` is non-terminal (down, under investigation) and `panic` is the terminal, unrecoverable
failure that compromises the parent. `detail` is an optional free-text gloss (`"checkpointed"`,
`"lost-work crash"`); `notes[]` holds annotations folded from Family-3 domain events
(`{ text, ts }`) and from `approval-resolved`. A retry is a **sibling** `WO-12[2]`, not a nested
attempt subtree — the old attempt stays beside it as visible history.

- **`progress.json`** — the tree object itself, spread with one extra key: `counts`, one
  integer per status (`{ pending, active, done, failed, canceled }`, from `countByStatus` —
  every node except the root). The file *is* the root node plus `counts`, never a
  `{ tree, counts }` wrapper — this is the shape a future graphical view reads.
- **`progress.md`** — the pinnable rendered form: a header line naming the effort, with an
  optional cost suffix (`~<agents> agents · <tok> tok`) appended **only** when
  `journal.cost` is present; a one-line summary (`<done>/<total> done · <active> active ·
  <failed> failed`, from the same `counts`); a note that the file regenerates on every
  ledger append and that times are local (with a UTC offset); the rendered tree body (nested
  `- <glyph> <label>` bullets, two spaces of indent per depth, a trailing `_(detail)_`
  wherever a detail is set, and a literal `[YYYY-MM-DD HH:MM:SS ±HH:MM]` suffix on `active`/
  `failed` nodes that carry a `statusTs`; each note renders as its own child bullet,
  `- ✎ [ts?] text`); and, only when `inbox.json` has open items, a trailing
  `> ⚠ **inbox: N awaiting you** — <kinds>` banner.

**The two documented presentation exceptions.** Everything else in the mirror comes from
`ledger.jsonl` alone. The header's cost line (`journal.cost`) and the inbox banner
(`inbox.json`) are the *only* two fields read from anywhere else — named here so "the ledger
is the only truth" stays a checkable claim, not just an assertion. Neither is a gate input;
both are best-effort presentation, and their absence degrades the mirror gracefully (no cost
suffix; no banner) rather than failing it.

It is **effort-scoped**: `writeMirror` takes the effort root explicitly and never infers it
from cwd, so in a repo hosting several efforts — each its own `.reasonable/`, non-overlap
being the operator's responsibility — an append to one effort's ledger regenerates only that
effort's mirror.

The canonical index (`journal.json` / `inbox.json`) stays the lone serialized scribe's write
(D3b); the mirror is a *separate* presentation artifact with its own *single* deterministic
writer (the ledger controller), so no concurrent-writer hazard is introduced.

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

Written by the lane-provisioner into each lane worktree's root at dispatch, and
**rewritten in place** by the same lane-provisioner on a later role transition
(e.g. `implementer` → `blind-test-writer`) — the worktree persists across the
whole lane's life, only the per-role narrowing moves. The fence reads it; it is
the per-lane narrowing of the work order plus a mutable counter. The `effortRoot`
points back at the main checkout's `.reasonable/` so hooks can read shared
artifacts (ledger, config) from inside the worktree.

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
- **State mocking:** mock the external state a clause reads (store / hook / context) via `vi.mock`
  to the **shape the contract's `## Input Seams` declares** — supply non-empty state that triggers
  the scenario under test; never default the mock to its empty value when the clause's behaviour
  depends on that state.
- **Setup:** `vitest.setup.ts` registers `@testing-library/jest-dom`; `jsdom` environment.
- **An existing example:** `src/edges/Edge.test.tsx` (mirror its import + render + query shape).
```

The blind-test-writer reads this file (and an existing test) **before** writing a render test:
the `## Observable Seams` handles tell it how to *observe* outputs, the `## Input Seams` mock shapes
how to *construct* the scenario. The implementer reads it when it **exposes** a declared observable
seam or **declares** an input seam, so the emitted handle/export and the named mock shape match what
a test written to these conventions will query and mock.

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
