# Shared architecture — what every implementer must know

## What this repo is

`reasonable` is a Claude Code **plugin** (not an app). No build, no transpile, no `package.json`. The
enforcement engine is `lib/*.mjs` — **dependency-free Node ESM** (node builtins + relative imports only).
The plugin governs a *target* repo; it does not govern itself, so hooks no-op here. You are editing the
engine, not running it.

## Hard invariants (do not break — these look like style but are load-bearing)

1. **`lib/` stays dependency-free.** `node:fs`, `node:path`, `node:child_process`, relative imports only.
   No new deps, no `package.json`.
2. **Hooks fail OPEN outside an effort, CLOSED inside one.** No `.reasonable/` reachable ⇒ allow. Effort
   active but no lane descriptor ⇒ deny. Preserve this in any fence path you touch.
3. **Machine-parsed artifacts have load-bearing grammar.** If you change the on-disk shape of a parsed
   artifact (ledger event, journal, contract, config), the parser changes in the *same* task, and the
   `docs/artifacts.md` entry is updated by that layer's doc-sync task.
4. **`DESIGN.md` section numbers are cited from code** (`§5.6`, `D3b`, `BF9`, …). Don't renumber; keep
   citations stable.
5. **`.reasonable/` is gitignored by design.** Orchestration state (ledger, journal, contracts) is durable
   because it is append-only on disk, never because it is in git. reconcile reads it straight from disk.

## The truth model (the spine of this whole plan)

**git + the append-only `ledger.jsonl` are the only truth. Everything else is a derived cache.**
- `ledger.jsonl` — append-only event log. The sole write path is `lib/ledger.mjs` `append()` under a lock.
- `journal.json` — derived index (program-counter pointers + a lane registry). Written only by the
  `journal-writer` agent. **This plan is removing its per-WO `status` field** (a lossy duplicate of the
  ledger fold) — see T0.4.
- `progress.{json,md}` — presentation mirror, regenerated **wholesale** from the ledger on every append by
  `progress-map.mjs` `writeMirror()`. Nobody hand-writes it. Anything you want to survive appends must be a
  ledger event the fold renders — never a field poked into `progress.json` (it is clobbered next append).
- `reconcile()` — the crash-only recovery prologue; re-derives truth from git + ledger every session.

## The modules you will touch

- **`lib/ledger.mjs`** — `append(root, event, opts)`; `EVENT_SCHEMAS` type registry + `validateEvent`;
  attempt-number resolution for `node-dispatched`/`node-downgraded`. Lock is acquired inside
  `appendJsonl` (in `effort.mjs`) — today it covers only the file append, NOT the `buildTree()`/attempt
  arithmetic that runs before it (the bug T0.2 fixes).
- **`lib/reconcile.mjs`** — `reconcile(effortRoot)` (total, halting); derives WO status from
  `journal.workOrders` today (the code T0.1 replaces with a ledger fold); appends `node-downgraded` on
  crash-recovery; `foldPath`/`samePath`/`underPath` helpers live here (module-local, T1.2 hoists them to
  `effort.mjs`).
- **`lib/progress-map.mjs`** — `writeMirror()`, `buildTree()`, `foldEvents()`, the `EVENT_MAP` table
  (ledger type → tree op). Container status is derived, never stored.
- **`lib/effort.mjs`** — shared helpers: `findEffortRoot`, `rootFromArgv`, `loadConfig` (returns
  `runMode:null` when config absent), `norm`, `withLock`, `appendJsonl`, `findLane`, `roleOf`, git helpers.
- **`lib/fence.mjs`** — PreToolUse blast-radius fence; `role===null` = trusted main session (exempt from
  `.reasonable/` governance today); `enforcementPaths` already lists `.reasonable/ledger.jsonl`.
- **`lib/redispatch-guard.mjs`** — CLI-only insanity guard (exit 2 = blocked, 0 = clear); keys on
  `dead-end`/`verdict`(infeasible) events.
- **`lib/commit-accounting.mjs`** — reads `journal.workOrders[].commits` + `journal.mergedCommits` (the
  **lane registry** — NOT `status`; must stay working after T0.4).
- **`agents/journal-writer.md`** — the scribe constitution; documents that it writes per-WO `status`
  (T0.4 removes that instruction).

## Where the design lives

Authoritative: the spec at `docs/superpowers/specs/2026-07-05-…-recovery-design.md`, plus `docs/DESIGN.md`
(§5.6 pipeline, §5.12 crash-only, D3b scribe, D19 progress mirror) and `docs/architecture.md`. When in
doubt about intended behavior, the spec + DESIGN win over README.
