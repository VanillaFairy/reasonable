# Design: unified execution tree — generic progress component, ledger controller, node-kind interpreter

**Date:** 2026-07-02
**Status:** approved in discussion (this document is the written record; user reviews it before planning)
**Version impact:** MAJOR — lands as **2.0.0** (confirmed by the user). The ledger vocabulary, the
on-disk effort layout, and the identity of every workflow script change.

## Why

Progress reporting today is a projection with too many private dialects. `lib/progress.mjs` merges
five sources — work-order specs, journal work-order state, ledger `action-*` events, every other
ledger event type, and the inbox — and each source needs its own heuristics to become tree-shaped:
sections addressed by label plus "whichever section is currently open," crash boundaries inferred
at render time by comparing dispatch epochs, sections synthesized backwards from enrichment lines
when an agent never reported, enrichment prose regex-split into pseudo-children, and a reverse-scan
that suppresses timestamps that contradict `seq`.

The writers are just as scattered: agents are prose-instructed to append raw JSON lines to
`ledger.jsonl` themselves, three lib CLIs append programmatically, and the journal scribe maintains
the adjacent index files.

Every one of those heuristics exists to *recover an address the writer never stated*. The fix is
not a better renderer — it is a workflow whose events state their addresses, so the projection
collapses to a trivial fold. And once every dispatchable thing (work order, spike, scaffold, grill
pass, slice, phase) reports through the same vocabulary into the same tree, the orchestration
itself can be unified: the progress tree is the observable shadow of an execution tree that today
exists only implicitly, smeared across four workflow scripts. This design makes both explicit and
makes them the same tree.

## Decisions (all ratified in the design discussion)

1. **Full replay.** The ledger stays the only truth. On every append the tree is rebuilt from
   scratch by folding all events; `progress.json` / `progress.md` are pure output artifacts. The
   D19 guarantee — the mirror can never drift and is always rebuildable — is preserved.
2. **Ledger = single source.** Node lifecycle transitions become ledger events, written
   ledger-first (WAL order). `journal.json`, `inbox.json`, and node specs' *dynamic* state are
   derived caches; a torn write leaves the ledger ahead and the caches re-derivable.
3. **Statuses:** `Pending | Active | Done | Failed | Canceled` — a closed enum — plus an optional
   free-text `detail` per node for domain flavor ("checkpointed", "3 survivors", "awaiting gate").
4. **Clean break.** All replay heuristics are deleted, not quarantined. Legacy/unknown event types
   degrade gracefully into annotation notes — honest, visible, never reconstructed. Release notes
   say: conclude in-flight efforts before upgrading, or accept degraded history rendering.
5. **Whole-effort tree.** Root = effort; analysis (with the coherence grill beneath it),
   scaffolding, every slice, spikes, and retros are all nodes.
6. **Read-side mapping.** Ledger events stay pure domain facts carrying explicit node addresses;
   one static table in the mapper interprets them. A mapping fix re-renders all history on the
   next fold.
7. **Full workflow unification, now.** An explicit execution tree on disk, a node-kind registry,
   and a single interpreter workflow replace the four bespoke workflow scripts.
8. **Never remove.** No delete operation exists anywhere in the stack. An entity that would be
   removed becomes `Canceled`. Reopening a failed node seals its old subtree `Failed` and injects
   a fresh attempt subtree beside it.

## Component 1 — `lib/progress-tree.mjs` (the generic progress component)

Knows nothing about reasonable, ledgers, or work orders. Pure functions, zero I/O; reusable and
testable without a filesystem.

- **Node shape:** `{ id, label, status, detail, notes[], children[] }`.
- **Status enum:** `Pending | Active | Done | Failed | Canceled`. `Done` and `Canceled` are
  terminal.
- **Addressing:** a node's address is the ordered list of segment ids from the root, serialized
  with `/`. A segment id is unique *among its siblings* (never globally), human-readable, and
  validated: non-empty, no `/`, no whitespace, no control characters. Labels are free text,
  carried separately, defaulting to the id.
- **Operations**, applied through one entry point `apply(tree, op)`:
  - `inject {path, label?, status?, detail?}` — create a node. Missing ancestors are auto-created
    as `Pending` stubs; injecting an existing path is an **idempotent merge** (label/detail may
    update, no duplicate node, never an error). The fold is total — it never throws on ordering
    hiccups or re-announcements.
  - `update {path, label?, detail?}` — edit presentation fields.
  - `status {path, status, detail?, recursive?}` — transition a node. With `recursive: true`, the
    status also applies to every descendant that is not already terminal — a finished item inside
    a failed attempt keeps its ✓.
  - `note {path, text, ts?}` — append an annotation line to a node. Domain color rides here
    without pretending to be structure.
- **No remove operation exists.** The enum plus append-only ops make "never remove" a property
  the component enforces, not a convention clients follow.
- Owns `renderMarkdown(tree)`; `progress.json` is the serialized tree itself. Glyphs:
  `· Pending  ▶ Active  ✓ Done  ✗ Failed  ⊘ Canceled` — one vocabulary for every level.

## Component 2 — `lib/ledger.mjs` (the ledger controller)

The only sanctioned write path to `ledger.jsonl`.

- **JS API** `append(root, event)` for lib callers (`reconcile.mjs`, `commit-record.mjs`,
  `conclude.mjs`); **CLI** for agents: `node lib/ledger.mjs append --type … --node … …`.
- Validates each event against a per-type schema registry (subsuming `action-events.mjs`).
- Stamps `seq`, `ts`, and attempt provenance **script-authoritatively** — an agent cannot spoof
  any of them. Timestamps become trustworthy by construction (the controller stamps wall-clock at
  append under the same lock that orders `seq`), so the old ts-suppression scan dies.
- **Relative addressing for workers:** a dispatched worker reports
  `--under <nodeId> --node <relativePath>`; the controller prefixes the node's current attempt
  path from durable state. A worker never needs to know which attempt it is; a context-compacted
  agent re-derives nothing.
- Appends under the existing `appendJsonl` lock in `effort.mjs`, then triggers the mirror regen.
- Fails **loud** on a malformed call (non-zero exit, stderr) — a deliberate report should tell the
  agent immediately.

## Component 3 — `lib/progress-map.mjs` (the mapper)

Owns exactly one piece of knowledge: the static `EVENT_MAP` table, ledger event type → tree
op(s). `buildTree(root)` reads the ledger, folds every event through `apply`, returns the tree;
`writeMirror(root)` writes `progress.{json,md}`. `lib/progress.mjs` survives only as the thin
CLI/hook entry point delegating here.

Unknown or legacy event types map to a `note` on the nearest addressable node (or the effort
root) — an honest flat trail, no reconstruction.

## The event vocabulary

Every tree-relevant event carries an explicit `node` address. Three families:

### Family 1 — node lifecycle (kind-neutral)

`kind ∈ work-order | spike | scaffold | grill-pass | slice | phase` appears on every line.

| Event | Emitted by (the actor that enacts it) | EVENT_MAP |
|---|---|---|
| `node-planned {node, kind, title}` | main session at route ratification and retro re-sorts | inject, `Pending` |
| `node-dispatched {node, kind}` | lane-provisioner (laned kinds); main session (phases/slices it drives) | begins an attempt — see reopen semantics |
| `node-checkpointed {node}` | the worker itself, as its last act | status `Pending` + detail `"checkpointed"` |
| `node-downgraded {node}` | `lib/reconcile.mjs` via JS API (recovery enacts the downgrade) | status current attempt → `Failed`, recursive, detail `"lost-work crash"` |
| `node-completed {node}` | main session (merge is its membrane crossing; phase/slice completion likewise) | status → `Done` |
| `node-failed {node, reason}` | the worker that hit the wall (dead-end), or main session routing a blocked GATE_RESULT | status → `Failed` + detail |
| `node-canceled {node, reason}` | main session at a ratified route re-sort that drops a node | status → `Canceled`, recursive |
| `concluded` (existing type) | `lib/conclude.mjs` | status effort root → `Done` |

*(Discussion used `node-merged`; renamed `node-completed` here since "merged" is work-order
flavor — the merge fact itself still lands as the domain `commit` note.)*

**Attempt semantics / the reopen rule, end to end.** Dispatchable nodes hold their work under
reserved `attempt-N` children (the renderer collapses `attempt-1` when it is the only one). On
`node-dispatched`, the controller decides **new attempt vs. continuation** from durable state: a
new attempt when the latest attempt is sealed or the node itself is `Failed` (crash downgrade or
dead-end being retried), continuation when the latest attempt is unsealed (a checkpoint reclaim —
same attempt, seamless render). On a new attempt, the fold first seals the prior attempt's subtree
`Failed`, recursive (idempotent if `node-downgraded` already sealed it), then injects the fresh
attempt subtree and sets the node `Active` — the reopen rule verbatim: the failed subtree is
marked, never removed, and a new subtree is injected beside it. Both paths are explicit recorded
facts; zero render-time inference.

### Family 2 — worker reports (replaces `action-started/finished/obsoleted`)

`report-started | report-finished | report-canceled`, addressed relative to the worker's node
(`--under WO-12 --node implementation/§4`). Maps: started → inject + `Active`; finished →
`Done`; canceled → `Canceled` + reason as detail.

- Section ids come from the dispatch prompt; the interpreter stamps rework rounds (`audit-2`).
  A legitimate second round is a **new id chosen by the emitter**, never a dedup heuristic in the
  reader. Collision avoidance is the writer's job; idempotent inject makes re-announcements
  harmless, deleting the append-time suppression logic.
- Item ids are the domain's own: clause refs (`§4`), catalog slugs (`discriminator-check`), adhoc
  slugs — all already required to be slug-shaped.

### Family 3 — existing domain events

`enrichment`, `characterization`, `verdict`, `verifier-verdict`, `commit`, ratification and spike
lines, … keep their types and fields, gain a `node`, and map to **`note` only** — formatted from
their structured fields by small per-type formatters in the table. Status never comes from these;
the regex prose-splitter dies unreplaced.

**Inbox banner:** folds from escalation-kind verdict events (already ledger lines, now with
`node`) plus `approval-resolved {id}` emitted by the main session when a gate clears. No new
emitters needed.

## The execution tree

### On-disk: `.reasonable/nodes/<id>.json`

One **immutable spec** per dispatchable node: `{ id, kind, parent, title, inputs, footprint,
budget }`. Written by **node-writer** — the generalized `work-order-writer`, same allowlist
(Read/Write/Glob, no Bash), same write-if-absent membrane, same propose/persist separation
(route-planner proposes; node-writer persists). Structure lives in specs; **all dynamics live in
the ledger** — status, attempts, results are folded from `node-*` events, never stored in the
spec. The progress tree and the execution tree are the same tree observed through the fold.

Tree shape: root = effort; children = `analysis` (coherence grill beneath), `scaffolding`, one
node per slice (work orders and `retro` beneath), `spike:<id>` siblings of slices.

### `lib/node-kinds.mjs` (the registry)

Kind → pipeline stages, routing table (stage result type → next transition), isolation flavor
(`lane | quarantine | main`), verification wrapper (which adversary role, judging against which
reference), result union, budget defaults. Adding a future kind becomes a registry entry plus
constitutions — zero orchestration code.

The constitutional differences are **deliberately not genericized**: isolation flavor is the
one-way-membrane law, the verification wrapper is the trio law, per-role tool allowlists are
capability-beats-discipline, and gate placements are the human control plane. The registry
*names* these per kind; it never flattens them.

### `workflows/node-runner.workflow.js` (the single interpreter)

Replaces `vertical-slice-runner`, `spike`, `scaffold`, and `coherence-grill` workflows. Purity is
resolved by data: the main session composes `{spec, pipeline, routing table, prompt fragments}`
via `node lib/plan.mjs expand <nodeId>` and passes it as args. The script's own logic is a
table-driven loop — `next = routing[stage][result.type]` — small enough to inspect by eye; the
tables are lib-tested. Stage prompt text moves from inline script strings to per-kind fragment
files under `workflows/prompts/<kind>/<stage>.md`, referenced by the registry and spliced by
`lib/plan.mjs` at expansion time.

## Enforcement changes

- **Fence:** direct writes to `ledger.jsonl` (Edit / Write / shell-append) become denied for
  **every** role inside an effort; the controller CLI is the only crossing (`node lib/ledger.mjs
  append …` is a Bash invocation, not a raw write — `shell-writes` does not trip on it). Every
  constitution's "append exactly this JSON line" prose is replaced by the CLI call.
- **Scribes unchanged:** `journal-writer` keeps journal/inbox as derived caches written after the
  ledger fact (WAL order); no Bash added, no allowlist weakened. `work-order-writer` → node-writer
  as above.
- `reconcile.mjs` generalizes its classification (RESOLVED / SAFE-DEFAULT / AMBIGUOUS) to any node
  kind and appends `node-downgraded` through the controller's JS API.
- `commit-record` keeps healing torn commit/ledger pairs, now via the controller.
- The PostToolUse regen hook survives as belt-and-suspenders, watching only `ledger.jsonl`.
- D3a is unchanged: a worker's atomic commit still binds work product + its own domain ledger
  line — the line now lands via the CLI, the same on-disk append.

## Deletions

`lib/action-report.mjs`, `lib/action-events.mjs`; from `lib/progress.mjs`: `replayActions`,
`sectionsFromEnrichment`, `enrichmentChildren`, the ts-suppression scan, and the three separate
glyph vocabularies; `workflows/vertical-slice-runner.workflow.js`, `workflows/spike.workflow.js`,
`workflows/scaffold.workflow.js`, `workflows/coherence-grill.workflow.js`.

## New and changed files

**New:** `lib/progress-tree.mjs`, `lib/ledger.mjs`, `lib/progress-map.mjs`, `lib/node-kinds.mjs`,
`lib/plan.mjs`, `workflows/node-runner.workflow.js`, per-kind prompt fragments under
`workflows/prompts/`.

**Changed:** `lib/reconcile.mjs`, `lib/conclude.mjs`, `lib/commit-record.mjs`, `lib/fence.mjs`,
`hooks/hooks.json` (regen matcher), most `agents/*.md` (one uniform reporting paragraph, adapted
per role), the phase skills (`analysis`, `scaffolding`, `vertical-slice-execution`, `retro` slim
into gate-keeping + node-runner launchers + lifecycle-event emission), and the docs quartet:
`DESIGN.md` (§D19 rewritten; new execution-tree section — existing § numbers stay stable),
`architecture.md`, `artifacts.md` (`nodes/`, the new ledger vocabulary, the new progress format),
`glossary.md` (node, kind, attempt as normative terms).

## Presentation-only exceptions (named, not hidden)

- The header cost line (`~N agents · Xk tok`) still reads `journal.cost` — not a tree fact, and
  making it one would force ledger writes from the pure workflow script.
- Rendered timestamps are display-only; `seq` remains the causal order everywhere.

## Testing

- `test/progress-tree.test.mjs` — ops incl. enum enforcement, idempotent inject with
  auto-ancestors, recursive status skipping terminal children, note append, render golden.
- `test/ledger.test.mjs` — schema registry validation, authoritative stamping (seq/ts/attempt
  prefixing), concurrency under the lock, CLI arg mapping, fail-loud.
- `test/progress-map.test.mjs` — one fold case per EVENT_MAP entry; the **reopen walkthrough as
  an end-to-end acceptance test** (downgrade → seal → redispatch → fresh attempt; checkpoint
  reclaim → same attempt); legacy degradation to notes.
- `test/node-kinds.test.mjs` — registry integrity: every routing table closed over its stage's
  result union; every kind names isolation + verification.
- The interpreter carries no logic worth unit-testing — that is the point.

## Risk and sequencing

The work-order routing table must reproduce current runner semantics **exactly** — genesis,
characterization, ripple escalation, inbox, budget escalation, checkpoint reclaim. That port is
where verification effort concentrates. The plan phase sequences it **last**: organs first
(tree, controller, mapper — provable under the existing runner), then simple kinds (spike,
scaffold, grill), then the work-order port, then the bespoke workflow deletions.

## Out of scope / deferred

- Replacing `journal-writer` with mechanical derivation of journal.json from the ledger fold
  (a natural follow-up once the WAL pattern has soaked; not needed for 2.0).
- Advance preview of untouched contract clauses (unchanged deferral from the 2026-07-01 design).
