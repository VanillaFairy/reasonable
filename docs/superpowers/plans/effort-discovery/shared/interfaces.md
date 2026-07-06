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

### T1.3 — birth-location policy + lifecycle-state + gitignore-abandoned — three parts, separate commits

**Part A — birth-location policy (§6.4, F5): kill stray-root rebirth at its source.**
- `export function assertNoAmbiguousBirth(repoRoot)` in `effort.mjs` — returns a signal (e.g.
  `{ ambiguous:boolean, existing:[roots] }`) when `.reasonable-efforts/*/` already holds ≥1 BORN effort
  (reuse `effortBirthState`). Pure-ish (fs read, no mutation).
- `develop` Step 0: before writing `config.json` at a bare repo-root cwd, if `assertNoAmbiguousBirth(repoRoot).ambiguous`
  → **refuse** the bare repo-root birth and require an explicit nested `--root` (a prose instruction — develop is a skill).
- `fence.mjs` first-birth path (~lines 422-423, the silent `if(!effortRoot) process.exit(0)` allow): when
  `findEffortRoot(tgt)` is null **and** `.reasonable-efforts/` holds born efforts → **deny** with
  "possible stray birth — use `--root`" instead of the silent allow. (Only that narrow case; a truly plain
  repo — no `.reasonable-efforts/` — still fails open.)
- `reconcile.mjs`: add an AMBIGUOUS bucket (shape `{haltReason, evidence}`, joins `ambiguities[]` → HALT)
  for **>1 `.reasonable`-bearing root reachable** — compute via a scan (reuse `resolveActiveEffort`'s
  `kind:'multiple'`, or a direct check). A slipped-through duplicate surfaces on the next session.

**Part B — lifecycle-state in reconcile (§6.5, F10): the BORN-effort states.**
- reconcile computes a `lifecycle` field for the effort it reconciles, over the deterministic predicates
  (cheapest signal first) for the BORN states it can see: `'active'` (frontier has an open slice),
  `'at-land-gate'` (frontier empty AND NOT landed → NEXT=LAND),
  `'half-concluded'` (landed — effort work merged into base — still a live `.reasonable/`, no `.done-*`
  → NEXT=CONCLUDE). **"landed" ⟺ effortBranch is an ancestor of base** ⟺
  `git merge-base --is-ancestor <effortBranch> <base>` (this is `branch.mjs`'s `descendsFrom(root, effortBranch, base)`).
  (CORRECTED: an earlier draft transposed the arg order to `<base> <effortBranch>` — that is the inverse and
  would mislabel an in-progress effort as half-concluded; the English above is authoritative.) Bare-HEAD efforts
  (no branch refs) default to the SAFE `at-land-gate` (never a premature conclude).
  The dir-name states (`concluded`/`abandoned`/`stray`) are the multi-effort SCAN's job (T1.5) — reconcile
  only ever runs on a live `.reasonable/`, so it classifies the born states. Add `lifecycle` to the result
  object; do NOT compute `nextAction` (that is Layer 2 / T2.2 — it consumes `lifecycle`).

**Part C — gitignore the abandoned archive (from T1.4a review).**
- `skills/analysis/SKILL.md` plants `.reasonable.done-*/` into the target `.gitignore` (~line 106-107) but
  NOT `.reasonable.abandoned-*/`. Add `.reasonable.abandoned-*/` beside it, so an abandoned effort's archive
  is ignored exactly like a concluded one (else it leaks as untracked clutter in real repos).

Scope: `lib/effort.mjs`, `lib/fence.mjs`, `lib/reconcile.mjs`, `skills/develop/SKILL.md`, `skills/analysis/SKILL.md`,
tests. Parts A/B touch reconcile → land as separate commits but one task. Does NOT wire session-start (T1.5) or
compute nextAction (T2.2).

### T1.5 — multi-effort briefing (§6.6) + reconcile S7 born-state HALT (§6.1) — `session-start.mjs`, `reconcile.mjs`

**Part A — session-start multi-effort briefing (§6.6).** Replace the raw `findEffortRoot(cwd)` discovery
(`session-start.mjs:16`) with `resolveActiveEffort(cwd)` (T1.2) at the repo-root interactive path:
- `kind:'resolved'` → the CURRENT behavior: `writeMirror` + full `reconcile(root)` + `briefing(r)` for that
  one effort (now the briefing includes the `lifecycle`).
- `kind:'multiple'` → the CHEAP multi-effort briefing: do NOT reconcile every effort. For each root, read its
  `.reasonable/progress.json` (counts) + the last `ledger.jsonl` event's `ts` for **staleness** (days since —
  session-start is a normal lib script, `Date` is allowed here, unlike a workflow) + the persisted
  `nextAction` **if present** (forward-compat — Layer 2 adds it; absent in Layer 1, fall back to counts +
  `lifecycle`-less summary). Wrap EACH effort in its OWN `try/catch` (never one around the loop — one bad
  effort degrades to "N−1 briefed, 1 flagged", honoring fail-open). Reconcile only the acted-on effort (or on
  demand).
- `kind:'none'` → "no active effort"; surface `strays` (config-less `.reasonable` dirs) + `diagnostics`
  (depth-≠1) as **debris + a cleanup note**, never adopted.
- Filter **concluded/abandoned** by dir name (`.reasonable.done-*` / `.reasonable.abandoned-*`) — count them
  ("N parked/stale hidden"), never brief/scan them.
- **Surface a born-but-bad config:** for any resolved/listed effort whose `effortBirthState` is `corrupt` or
  `missing-signature`, FLAG it in the briefing (it is HALT-worthy — see Part B), rather than silently
  proceeding (the T1.2 down-scan adopts these into `born` without surfacing).

**Part B — reconcile S7 born-state HALT (§6.1).** reconcile's HALT must key on `effortBirthState`, not only
`loadConfig`'s lossy `runMode:null`: a born effort whose `effortBirthState(root)` is `corrupt` or
`missing-signature` → an AMBIGUOUS→HALT `{haltReason, evidence}` (a foreign/hand-edited/torn config, not a
recoverable state). `corrupt` today already halts incidentally (loadConfig → defaults → runMode-absent HALT),
but `missing-signature` (has `runMode`, no `effort`) currently PROCEEDS — that is the hole. Add the explicit
`effortBirthState`-keyed HALT next to the existing runMode-absent bucket; keep the runMode-absent HALT too.

Scope: `session-start.mjs` (Part A), `reconcile.mjs` (Part B), tests. Two separate commits. Does NOT compute
`nextAction` (reads it forward-compat if present); does NOT touch effort.mjs/develop/fence.

(Layer-1 is largely SEQUENTIAL — `effort.mjs` (T1.1/T1.2/T1.3) and `reconcile.mjs` (T1.2/T1.3) are the hot
files. Tentative order, finalized per wave: **T1.1** foundation → **T1.2** path-norm + `resolveActiveEffort`
(effort.mjs + reconcile) ∥ **T1.4a** abandon *command* (new `abandon.mjs` + ledger `abandoned` + skill —
the one file-disjoint parallel slot) → **T1.3** birth-location + lifecycle-state (fence + develop +
reconcile) → **T1.5** multi-effort briefing (session-start) → doc.)

## Layer 2 (pinned 2026-07-06 against the merged Layer-0/1 code, tip `71ef7df`)

Layer 2 is a **sequential chain on `reconcile.mjs`** (the hot file) — no parallelism. Order:
**T2.1** (new artifact + WO field + writers, file-disjoint from reconcile) → **T2.2** (projection) →
**T2.3** (event + render) → **T2.4** (self-check) → **T2.doc**. Two pure modules are introduced so the
decision logic is independently unit-testable and `reconcile.mjs` stays an orchestrator:
`lib/route.mjs` (read+validate route.json) and `lib/next-action.mjs` (pure `projectDirectives` +
`selfCheckDirectives`). `reconcile()` gathers state, calls them, then appends the result as a ledger event.

### Three spec corrections baked in here (discovered during the 2026-07-06 recon — same status as Defects A/B)

- **Correction C (§7.2 status vocabulary):** the spec's `dependsOn.every(id => status(id) ∈ {green,merged})`
  names statuses that **do not exist**. The realized fold (`wo-status.mjs foldWorkOrderStatuses`) emits only
  `pending | running | blocked | dropped | done`; there is no `green`, and `merged` is not a fold status —
  it is a `journal.workOrders[id].merged` boolean that **`reconcile()`'s own `workOrderStatuses` map already
  folds into `done`**. The real predicate is **`status(id) === 'done'` read from `reconcile()`'s
  `workOrderStatuses`**, never a raw `wo-status.mjs` check and never `'green'`. (Root cause of the drift:
  stale pre-T0.4 prose in `agents/route-planner.md:145-146`; T2.doc corrects that prose.)
- **Correction D (node-canceled is terminal-abandoned, §7.2/§7.3 + RESUME-HERE flag):** `node-canceled`
  folds to `'pending'` (wo-status.mjs), which *looks* re-dispatchable. It is not. A deliberately-canceled WO
  is **terminal**: the projection must never emit `DISPATCH` for it, and it must **not** satisfy a dependent's
  `dependsOn` (a dep on a canceled WO leaves the dependent NOT-ready → surfaces as `DECIDE`, not `DISPATCH`).
  Detect "canceled-terminal" by the WO's **latest lifecycle event being `node-canceled`** (its `WoState.lastSeq`
  points at the cancel), not by the lossy `'pending'` label alone.
- **Correction E (§9 stale line — reaffirmed from T0.5):** §9's "redispatch-guard fires on `node-failed`" is
  wrong and already withdrawn in T0.5. The guard keys on (1) hash-matched `dead-end`/`verdict`(infeasible,
  survivedSkeptic) and (2) an unresolved `amendment` drop — **never raw `node-failed`**. The self-check (T2.4)
  calls the guard's existing predicate; it must NOT re-introduce a node-failed binding.

### T2.1 — `route.json` (new machine artifact) + WO `dependsOn` + writers + loader

- **New artifact `.reasonable/route.json`** (machine-parsed → `*` in artifacts.md at T2.doc). Minimal shape,
  single-writer (orchestrator; SEALED-class — `fence.classifyReasonable` already routes any unrecognized
  `.reasonable/` path to orchestrator-only, **no fence change**):
```json
{ "slices": ["walking-skeleton", "expr-eval", "…"],   // ordered vertical-slice ids, best-first; [0] is the walking skeleton
  "ratifiedAt": "2026-07-06T12:00:00+02:00",           // local ISO — when the human ratified this ordering (route is human-ratified state)
  "ledgerSeq": 42 }                                     // ledger seq at ratification — back-pointer into the truth log
```
  `route.md` stays **human narration, never parsed** (demoted). WO→slice membership comes from each WO spec's
  existing `verticalSlice` field, not from route.json — route.json carries only the slice **order**.
- **New pure module `lib/route.mjs`** — `export function readRoute(effortRoot)` → `{ slices, ratifiedAt,
  ledgerSeq } | null`. Absent file → `null` (Layer-2 forward-compat: a pre-route.json effort briefs without a
  frontier, never crashes). Present-but-invalid (not an object, `slices` not an array of non-empty strings) →
  `null` **plus a diagnostic string** the caller can surface (conservative: never fabricate an order). Mirrors
  the `wo-status.mjs` precedent (a small pure parse module; keeps the hot `effort.mjs` stable).
- **WO schema gains required `dependsOn: [workOrderId]`** (array of WO-id strings; `[]` = no deps). Because a
  WO spec is **write-once/immutable** (`work-order-writer` never patches an existing spec), `dependsOn` MUST be
  populated at write time: `agents/work-order-writer.md`'s JSON template gains the field, and
  `agents/route-planner.md` proposes it (the readiness/ordering edge — distinct from the footprint
  independence edges the route-planner already computes; **do not conflate**, per recon gotcha #5). Both are
  agent-constitution (prose) edits.
- **Readiness predicate (pinned here, consumed by T2.2):** a WO is **ready** iff it is not itself terminal
  (not `done`, not dropped, not canceled-terminal) AND every id in its `dependsOn` is `done`
  (Correction C) AND it is not flagged by the redispatch-guard. A dep that is anything other than `done`
  (incl. canceled-terminal, Correction D) leaves the WO not-ready.
- **Scope:** `lib/route.mjs` (new), `agents/work-order-writer.md`, `agents/route-planner.md`,
  `skills/analysis/SKILL.md` (+/or the orchestrator step that persists route.json), tests. File-disjoint from
  `reconcile.mjs`/`ledger.mjs`/`progress-map.mjs`. Does NOT touch reconcile or compute any directive.

### T2.2 — the decision projection (`nextAction` as a directive SET) — `lib/next-action.mjs` (new) + `reconcile.mjs`

- **New pure module `lib/next-action.mjs`** — `export function projectDirectives(state)` → an ordered
  **array** of directive objects (a SET, not a scalar — §7.3). No I/O, no git: it consumes a plain `state`
  object `reconcile()` assembles. Directive shape (pin):
```js
// { kind, slice?, workOrders?, workOrder?, detail? }
//   kind ∈ 'HALT' | 'AMBIGUOUS' | 'DECIDE' | 'RUNNING' | 'DISPATCH' | 'RETRO' | 'OPEN' | 'LAND' | 'CONCLUDE' | 'DONE'
```
- **Projection logic (§7.3), first-match GLOBAL then per-effort SET:**
  - global, first match wins, returns a single-element set: `HALT`(state.halt/S7) → `AMBIGUOUS`(>1 root) →
    `DECIDE`(a breaking `openInbox` item) → the reconcile halt-class. (All already computed by reconcile —
    the projection READS `state.halt`/`state.ambiguities`/`state.openInbox`, never recomputes git.)
  - else drive off `state.lifecycle` (already git-resolved by reconcile, keeping the projection pure):
    - `'at-land-gate'` → `[{kind:'LAND'}]`; `'half-concluded'` → `[{kind:'CONCLUDE'}]`;
    - `'active'` → the per-slice **set** over `state.workOrderStatuses` + `dependsOn` + `route.slices`:
      `blocked`→`DECIDE: WO <id>`, live `running`→`RUNNING: <ids>`, `ready`(readiness predicate above)→
      `DISPATCH: slice <S> → <ids>`, slice all-`done`+retro-open→`RETRO: slice <S>`, retro-done→
      `OPEN: slice <S+1>` (next id in `route.slices`), everything terminal→`DONE`.
- **`reconcile()` wiring:** after the per-WO crash-recovery loop and all partition/lifecycle/halt computation
  (i.e. just before building the `result` literal at ~line 624), read `route.json` via `readRoute`, assemble
  `state`, call `projectDirectives`, and attach the result as **`result.nextAction`** (in-memory array).
  **Persistence + render are T2.3; the self-check gate is T2.4** — T2.2 stops at the in-memory field.
- **Scope:** `lib/next-action.mjs` (new, `projectDirectives` only), `reconcile.mjs` (assemble state + call +
  attach), tests (the §9 decision-projection table — pure `projectDirectives` fixtures: mixed running+ready,
  blocked+ready, at-land-gate LAND, canceled-dep DECIDE). Does NOT touch ledger.mjs/progress-map.mjs.

### T2.3 — the `next-action` ledger event + mirror render + Windows rename hardening

- **`lib/ledger.mjs`:** add `'next-action': { required: [], validate: validateNextAction }` to `EVENT_SCHEMAS`
  (Family 3 — the implicit "everything else" branch; do NOT add it to `FAMILY_1_TYPES`/`FAMILY_2_TYPES`).
  `validateNextAction` mirrors `validateDropsAndResolvesSeq`: `directives`, when present, must be an array of
  objects each with a non-empty-string `kind`; `computedFrom`, when present, a positive integer. Event shape:
  `{ type:'next-action', directives:[…], computedFrom:<seq> }`.
- **`reconcile.mjs`:** after the self-check (T2.4 slots the gate in front of this; T2.3 builds the happy path),
  append the projected set: `append(effortRoot, { type:'next-action', directives, computedFrom }, { regen:true })`.
  `computedFrom` = the ledger seq **at computation time** — reconcile's in-scope `ledger` array (read at
  ~line 158) is STALE after its own `node-downgraded` appends, so re-read the latest seq
  (`readJsonl(ledgerPath)`; `arr.length ? arr[arr.length-1].seq : 0`) immediately before this append. The
  append's return gives the new event's seq back as `result.event.seq` if needed.
- **`lib/progress-map.mjs`:** the mirror renders the **latest** `next-action` event on every regen (survives
  the wholesale clobber by construction — §7.1):
  - `writeMirror`/`composeProgressMd`: scan the ledger for the latest `next-action` event; render its
    `directives` into (a) `progress.json.nextAction` — a **string** (session-start.mjs already reads
    `p.nextAction` as a trimmed string, the one contract to match) and (b) a `▶ NEXT` block atop `progress.md`
    (slot it beside the existing `⚠ inbox` blockquote, after the header/counts line). Include the **mechanical
    staleness** marker: `computed at seq <computedFrom> — <K> events since`, K = `latestSeq − computedFrom`.
  - `EVENT_MAP`: give `next-action` an entry so the fold does not fall to `legacyFallback` (it should NOT
    create a tree node — it is a header projection, not a lifecycle event; render it in the mirror composition,
    not as a tree op).
  - **Windows rename hardening (layer0-checkpoint flag #4):** wrap `atomicWrite`'s `renameSync` in a **bounded
    retry on `EPERM`/`EBUSY`** (a concurrent Windows reader can transiently block the rename; today it throws
    and is swallowed as advisory `mirrorError`, lagging the mirror one behind). A few retries with a tiny
    synchronous backoff, then give up as today (still advisory, never fatal).
- **Scope:** `lib/ledger.mjs`, `lib/reconcile.mjs`, `lib/progress-map.mjs`, tests (regen-clobber regression:
  an append AFTER reconcile re-renders — never erases — the NEXT block; latest-`next-action`-wins; the K
  counter; the hook path renders but never computes).

### T2.4 — the output self-check (the projection's adversarial verification, §7.4)

- **`lib/next-action.mjs`:** add `export function selfCheckDirectives(directives, context)` →
  `{ directives, refusals:[{ directive, reason }] }`. Pure, mechanical, non-LLM. Refuses-with-reason:
  - never `DISPATCH`/`RUNNING` a WO with an **unresolved `amendment` drop or `node-downgraded`** (the drop is
    authoritative over file/journal existence — kills WO resurrection);
  - never `DISPATCH` a WO the **redispatch-guard** flags — call the guard's existing predicate
    (`redispatch-guard.mjs`), which keys on hash-matched dead-end/verdict + unresolved amendment drop, **never
    `node-failed`** (Correction E);
  - never `OPEN` a **retired** slice (not in `route.slices`); never `LAND` when the frontier is non-empty.
- **`reconcile.mjs` wiring:** gate the projected set through `selfCheckDirectives` **before** the T2.3 append.
  A refused directive is replaced by a `DECIDE` carrying the refusal reason (so a resurrection attempt surfaces
  as "decide", never as a silent DISPATCH). In **autonomous** mode a refused directive is **not auto-executed**
  — it escalates (surfaced, logged), matching §7.4.
- **Scope:** `lib/next-action.mjs` (add `selfCheckDirectives`), `reconcile.mjs` (insert the gate), tests
  (resurrection refused: a ledger-dropped WO whose file was restored → self-check turns DISPATCH into DECIDE;
  retired-slice OPEN refused; LAND-with-nonempty-frontier refused).

### T2.doc — Layer-2 doc-sync + version bump 2.5.0 → 2.6.0

`route.json` + the `next-action` ledger grammar → `docs/artifacts.md` (both `*`, machine-parsed); `▶ NEXT`
mirror render + the K-counter → D19 in DESIGN/architecture; the `nextAction` directive-set model + self-check
→ §7 cross-refs; correct the stale `route-planner.md:145-146` "merged/green" prose (Correction C). Version
bump minor (backward-compatible new capability). Note the external `marketplace.json` at handoff.

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
