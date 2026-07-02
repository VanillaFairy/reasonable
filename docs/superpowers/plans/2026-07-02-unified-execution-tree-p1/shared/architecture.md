# Architecture — Plan 1 (The Organs)

## Staging context (why this plan stops where it stops)

The ratified design (`docs/superpowers/specs/2026-07-02-unified-execution-tree-design.md`) is a
2.0 rework in three plans:

- **Plan 1 (this one):** the organs — generic progress tree, ledger controller, mapper — wired
  under the **existing** workflows. The old projection heuristics and the direct-file-append norm
  die here. Everything is provable under the current runner.
- **Plan 2 (future):** the explicit execution tree — `.reasonable/nodes/<id>.json` immutable
  specs, node-writer, `lib/node-kinds.mjs` registry, `lib/plan.mjs`.
- **Plan 3 (future):** the single interpreter `workflows/node-runner.workflow.js`; the four
  bespoke workflow scripts are deleted only there.

**Do not build ahead.** A task in this plan never references `nodes/`, the registry, or the
interpreter. YAGNI is enforced at review.

## Module boundaries

- `lib/progress-tree.mjs` — generic tree store + render. Knows NOTHING about reasonable, ledgers,
  work orders. Zero I/O. Anyone could copy this single file into another project.
- `lib/ledger.mjs` — the ONLY sanctioned write path to `.reasonable/ledger.jsonl`. Validation
  (schema registry), script-authoritative stamping (`seq`, `ts`, `attempt`, resolved `node`),
  append under the existing `appendJsonl` lock, mirror regen trigger. JS API + CLI.
- `lib/progress-map.mjs` — the fold. Owns `EVENT_MAP` (ledger event type → tree ops) and the
  mirror writer. Reads the ledger; never writes it.
- `lib/progress.mjs` — after T04: a thin CLI/hook entry delegating to progress-map. No logic.

Import direction (no cycles): `ledger.mjs → progress-map.mjs → progress-tree.mjs`; all three may
import `effort.mjs` helpers. `progress-map` NEVER imports `ledger`.

## Design decisions that bind every task

1. **Full replay.** The tree is rebuilt from the whole ledger on every regen. No incremental
   state, no stored status outside the ledger.
2. **Total fold.** The fold never throws on event *ordering* (missing parents auto-created,
   idempotent inject). It DOES throw on malformed ops — that is a mapper bug, and tests assert it.
3. **Script-authoritative stamps.** Agents never supply `seq`, `ts`, `attempt`, or an absolute
   `node` for report events; the controller computes/overwrites them from durable state.
4. **Never remove.** No delete op exists. Retirement = `canceled`. Retry = seal old attempt
   subtree `failed` + inject fresh `attempt-N`.
5. **Clean break.** Legacy `action-*` events fold to plain notes. No label-matching, no epoch
   inference, no enrichment-derived sections — that code is deleted, not ported.
6. **Presentation-only exceptions (Plan 1):** the header cost line reads `journal.cost`, and the
   inbox banner reads `inbox.json`. Both are documented exceptions, revisited in Plan 2. Nothing
   else may read the journal for rendering.

## Transitional wiring (T11–T13)

Until Plan 3, the existing workflows keep running. Plan 1 rewires their *reporting*: agents call
`node lib/ledger.mjs append …` instead of `action-report.mjs` / raw echo appends;
lane-provisioner emits `node-dispatched`; main-session skills emit phase/slice lifecycle events.
The tree therefore has real structure under the existing runner — which is exactly the soak the
spec's risk section prescribes before the interpreter port.
