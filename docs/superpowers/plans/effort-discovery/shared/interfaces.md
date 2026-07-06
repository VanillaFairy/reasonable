# Shared interfaces — pinned signatures (do not diverge)

These are the contracts parallel tasks agree on. If one is wrong, STOP and report — do not invent a
variant. Layer 1/2 interfaces are added just-in-time before their waves.

## Layer 1 (pinned as each task opens; foundation shapes here)

### T1.1 — `effortBirthState` + write the birth signature — `lib/effort.mjs`, `skills/develop/SKILL.md`

```js
// Pure, sync, no git. One shared predicate both discovery and reconcile call, so they cannot disagree.
export function effortBirthState(effortRoot)  // -> { state, reason? }
//   state: 'absent'            — no .reasonable/config.json                → NOT an effort (skip; stray/pre-birth)
//        | 'corrupt'           — config.json exists but does not JSON-parse → born, HALT-worthy
//        | 'missing-signature' — parses but no non-empty cfg.effort         → born (foreign/hand-edited), HALT-worthy
//        | 'ok'                — parses, has a non-empty cfg.effort          → born, proceed
```
- The birth **signature** is `config.effort` (a non-empty string). Today NOTHING writes it (Defect A): the
  effort name lives only in `journal.effort`; `loadConfig` has no `effort` default; `conclude.mjs` already
  (wrongly) reads `loadConfig(...).effort`. **T1.1 makes `develop` Step 0 write `config.effort`** (the same
  name it derives the effort branch from), so real efforts read `ok`. Without this, every real effort reads
  `missing-signature` → HALT.
- `effortBirthState` reads config via a direct parse (it must distinguish `corrupt` from `absent` — do NOT
  route through `loadConfig`, which swallows a parse failure into defaults). Reuse `readJson` only if it
  surfaces parse failure distinctly; otherwise a small local `existsSync` + `JSON.parse` in a try/catch.
- **Consumers (this task only wires the predicate + the write):** later tasks call it — reconcile's
  runMode-absent HALT (S7) keys off `effortBirthState(root).state !== 'absent'` so a crashed effort HALTs
  instead of silently skipping; `resolveActiveEffort` (T1.2) uses it to decide "born".

### T1.2 — path normalization + `resolveActiveEffort` — `lib/effort.mjs`, `lib/reconcile.mjs`

- **Path-norm hygiene:** `rootFromArgv` returns `norm(resolve(...))` at the source (today it returns bare
  `resolve()`), so every current + future caller gets a forward-slash path by construction. **Hoist**
  `foldPath`/`samePath`/`underPath` from `reconcile.mjs:80-82` (module-local, win32-lowercasing) into
  `effort.mjs` as **exported** helpers; `reconcile.mjs` imports them (behavior identical — do not change the
  win32-lowercase semantics). New discovery code uses `samePath`/`foldPath`, never naive `===`/`startsWith`.
- **`resolveActiveEffort(cwd)`** — an ADDITIVE wrapper used ONLY at the repo-root interactive SessionStart
  path (T1.5 wires it in). Do NOT replace `findEffortRoot`/`rootFromArgv` — the ~19 up-walk callers keep them.
```js
export function resolveActiveEffort(cwd)  // -> { kind, root?, roots?, strays? }
//   { kind:'resolved', root }         — exactly one born effort (up-walk hit, or a single down-scan hit)
//   { kind:'none', strays:[...] }     — no born effort; strays = config-less `.reasonable` dirs found (never adopted)
//   { kind:'multiple', roots:[...] }  — >1 born effort (NORMAL for parallel efforts)
```
  Algorithm (spec §6.2): (1) `up = findEffortRoot(cwd)`; if `up` and `effortBirthState(up).state !== 'absent'`
  → `{kind:'resolved', root:up}`. (2) else down-scan BORN efforts: `repoRoot = git rev-parse --show-toplevel`
  (fallback cwd); candidates = direct children of `repoRoot/.reasonable-efforts/` where
  `existsSync(join(child,'.reasonable','config.json'))` (EXACT path, never prefix) AND name not matching
  `/(-bak|\.bak|\.old|\.orig|\.archive|_copy)$/i` (BACKUP_EXCLUDE) AND `effortBirthState(child).state !== 'absent'`
  — union `repoRoot/.reasonable` if born. 0 → `{kind:'none', strays}`; 1 → `{kind:'resolved', root}`; N →
  `{kind:'multiple', roots}`. (3) A `.reasonable` dir found at depth ≠ 1 under `.reasonable-efforts/` → a LOUD
  diagnostic (in `strays`/a note), never silent. `.reasonable.done-*` / `.reasonable.abandoned-*` never match born.
  This ONE function may use git (`git rev-parse`) — it is the discovery entry, unlike the pure `effortBirthState`.

### T1.4a — the abandon COMMAND — `lib/abandon.mjs` (new), `lib/ledger.mjs`, a `reasonable:abandon` skill/command

- Clone `lib/conclude.mjs` (top-level script, no export/CLI-guard; `node abandon.mjs [path] [--root <p>]`):
  read effort via `rootFromArgv`; fail-open if none; `effort = loadConfig(...).effort || 'effort'`; refuse if
  the archive dir already exists; append a **`type:'abandoned'` ledger event** via the controller (regen-on;
  fatal if `!ok`); run the same commit-gate (commit residual in-scope work product, HALT if still dirty);
  `renameSync(.reasonable → .reasonable.abandoned-<effort>)`; commit the tracked deletion. Mirrors conclude
  exactly, only the archive suffix + event type differ.
- **Ledger grammar:** add `'abandoned'` to `EVENT_SCHEMAS` (required `[]`, like `'concluded'`),
  `FAMILY_1_TYPES`, and `progress-map.mjs` `EVENT_MAP` (map it to a terminal note, mirroring `'concluded'`).
- Add a `reasonable:abandon` user-invocable skill/command (mirror how `conclude` is surfaced — check how
  conclude is invoked and follow that pattern).
- Scope is disjoint from T1.2 (abandon.mjs/ledger/skill vs effort.mjs/reconcile) → **Wave 1b runs T1.2 ∥ T1.4a**.
- Does NOT compute lifecycle STATE (that's T1.3's reconcile work). This is just the command + its event.

### T1.3 — birth-location policy + lifecycle-state — pinned when Wave 1c opens (reconcile + fence + develop)
### T1.5 — multi-effort briefing — pinned when Wave 1d opens (session-start)

(Layer-1 is largely SEQUENTIAL — `effort.mjs` (T1.1/T1.2/T1.3) and `reconcile.mjs` (T1.2/T1.3) are the hot
files. Tentative order, finalized per wave: **T1.1** foundation → **T1.2** path-norm + `resolveActiveEffort`
(effort.mjs + reconcile) ∥ **T1.4a** abandon *command* (new `abandon.mjs` + ledger `abandoned` + skill —
the one file-disjoint parallel slot) → **T1.3** birth-location + lifecycle-state (fence + develop +
reconcile) → **T1.5** multi-effort briefing (session-start) → doc.)

## Layer 0

### T0.1 — work-order status ledger fold — `lib/wo-status.mjs` (new)

```js
// Pure fold: an array of parsed ledger events -> the ledger-truth status of each work order.
// No I/O. Caller passes events already read via readJsonl(). Order-independent (sorts by seq).
export function foldWorkOrderStatuses(events)  // -> Map<string workOrderId, WoState>

// WoState:
//   { status: 'pending'|'running'|'blocked'|'dropped'|'done',
//     lastSeq: number,          // seq of the event that set the current status
//     blockedBy?: number,       // seq of the unresolved node-failed  (status==='blocked')
//     droppedBy?: number }      // seq of the amendment drop           (status==='dropped')
```

**Status semantics (pin exactly):**
- `pending` — a `node-planned`/`node-dispatched` exists but resolution below yields no later state, i.e.
  planned-not-yet-dispatched. (A WO with no events at all is simply absent from the map.)
- `running` — the last `node-dispatched` for the WO has **no later terminal** (`node-completed` /
  `node-failed` / `node-canceled`) for it.
- `blocked` — the last terminal is `node-failed` with **no later resolving** `ratification`/`amendment`
  (resolution matched by `resolvesSeq === <the node-failed seq>`, never by coincidental id mention).
- `dropped` — an `amendment` carrying `drops:[{workOrder:id,...}]` with **no later restoring**
  `ratification` for the WO.
- `done` — a `node-completed` (or a terminal `merged`) with no later reopening `node-dispatched`.
- Attempts are siblings: a reopen (`node-dispatched` after a `node-failed`) moves the WO back to `running`.
- **Ignore `next-action` events entirely** (Layer 2 adds them; they are projections, never status input).

**Reconcile consumption:** `reconcile()` derives WO status from `foldWorkOrderStatuses(ledger)` as the
**authoritative source**, then applies its existing git-aware crash-recovery (a `running` WO with no
worktree and no commits ahead still downgrades exactly as today). `journal.workOrders[id].status`, if
present, is **cross-checked and a mismatch is pushed as a note** — never the source. Existing reconcile
tests stay green; where a test asserted journal-as-source-of-status, update it with a spec-tied note.

### T0.2 — locking correctness (§5.3 + §5.4) — `ledger.mjs`, `effort.mjs`, `progress-map.mjs`

No public signature changes. Behavioral contract:
- `append()` performs **attempt-resolution + seq-assignment + file-append + mirror-regen atomically under
  one hold of the ledger lock** (`${ledgerPath}.lock`). Today `buildTree()`/attempt arithmetic and
  `writeMirror()` run OUTSIDE the lock — that is the bug.
- `writeMirror()` writes each mirror file **atomically**: write `progress.json.tmp-<pid>` /
  `progress.md.tmp-<pid>`, then `renameSync` over the target (atomic same-volume on NTFS + POSIX).
- Uncontended behavior is unchanged. Keep the lock hold as short as correctness allows; `regen:false` still
  suppresses the mirror.
- **CORRECTION (v2, confirmed in review):** the original assertion here — "N concurrent same-node
  `node-dispatched` → distinct attempts" — was **wrong** and is withdrawn. A plain re-dispatch of a *live,
  non-failed* attempt is a **continuation** (same slot) by the existing attempt state machine
  (`nextDispatchAttempt` returns `latest` unless the live attempt sealed failed/panic; forcing distinct
  slots would break checkpoint-reclaim continuation, D19). So concurrent plain dispatches **correctly
  collapse to one slot**. The real §5.4 property is that **attempt resolution reads committed state under
  the lock**, so concurrent *reopens* (dispatch after a seal) don't both mint the same `[k]`. Tests must
  **discriminate** — pass on the fix, FAIL on the pre-task commit (`a6348eb`). The §5.3 discriminator is a
  **non-idempotent** concurrent scenario (N appends each driving a *distinct* node to `done`, so
  `progress.json.counts` must equal `countByStatus(buildTree(root))` — this fails on the old
  outside-the-lock last-writer-wins mirror). A deterministic reopen-chain test proves *correctness* but is
  NOT the concurrency discriminator; label it as such.

### T0.3 — fence denies direct ledger writes for ALL roles — `fence.mjs`

Behavioral contract: an `Edit`/`Write`/shell-write whose target is `.reasonable/ledger.jsonl` is **denied
for every role, including `role===null` (main session)**. All other `.reasonable/` main-session writes stay
allowed (main keeps its trust everywhere else). The ledger is mutated only through `ledger.mjs`'s locked
`append()`. Deny reason: name the file and point to the CLI (`use ledger.mjs append`, never a direct write).

### T0.4 — retire journal per-WO `status` — `agents/journal-writer.md`, `reconcile.mjs`

- `journal.workOrders[id]` keeps its **lane-registry** fields only: `worktree`, `branch`, `commits`,
  `mergedCommits?`, and any pointer fields already there — but **not** `status`.
- The `journal-writer` constitution stops instructing a `status` write (keep the write-ahead lane
  registration; it just no longer stamps `status`).
- Every `status` reader consumes the T0.1 fold. A legacy journal still carrying `status` → cross-check +
  warn, never governs.
- `commit-accounting.mjs` reads only `commits`/`mergedCommits` and must remain correct (verify, don't edit
  unless a reader there touched status — it doesn't).

### T0.5 — drop vocabulary + redispatch-guard — `redispatch-guard.mjs`, `ledger.mjs`, `reconcile.mjs`

- **Ledger grammar (additive):** `amendment` and `ratification` events gain optional
  `drops: [{ workOrder: string, supersededBy?: string }]` and `resolvesSeq: number`. Add to `EVENT_SCHEMAS`
  as optional (do not make required — old events lack them). Validate shape if present.
- **redispatch-guard:** **KEEP** the existing `dead-end`/`verdict`(infeasible+survivedSkeptic) binding (real,
  hash-gated, consumed by `dead-ends.mjs`/`reconcile` in lockstep — Defect B). **ADD** a binding on
  `amendment` with a matching `drops[].workOrder` (a deliberate supersession — a dropped WO stays dropped,
  cleared only by a restoring `resolvesSeq`; the safe direction). Exit codes unchanged (2=blocked, 0=clear).
  Add `test/redispatch-guard.test.mjs` (none exists).
  - **CORRECTION (v2, from T0.5 spec review): do NOT bind the guard on raw `node-failed`.** A `node-failed`
    is an *under-investigation* lifecycle event (D19 `failed ↻` = non-terminal, being investigated), NOT an
    infeasibility verdict — such a WO must stay redispatchable. The only WO-addressed reason-bearing
    `node-failed` the pipeline emits is the dead-end ceremony's, ALREADY blocked by the hash-gated `dead-end`
    binding (with the correct input-changed escape). Binding the guard on `node-failed` is therefore both
    redundant and wedging: `resolvesSeq` has no real emitter and `node-failed` carries no hash, so a
    dead-ended WO whose input later changed could never clear the `node-failed` binding → permanently
    un-redispatchable, violating the guard's own "blocked unless an input changed" contract. The
    `node-failed → blocked` mapping stays only in the fold / reconcile surfacing (a display concern,
    self-clearing on reopen), never in the redispatch gate.
- **`drops`/`resolvesSeq` emission is future work** (retro/amendment ceremony in `skills/*`), out of Layer 0
  scope. T0.5 lands the additive grammar + consumers; the amendment-drop binding is forward-looking (no
  current emitter) and safe until then.
- **reconcile closure fold:** a `node-failed` is *closed* only by a later `ratification`/`amendment` whose
  `resolvesSeq` equals that failed event's seq — never by a scan for coincidental id mentions. This is the
  same `resolvesSeq` T0.1's `blocked` semantics use; keep them consistent (shared helper if natural).
