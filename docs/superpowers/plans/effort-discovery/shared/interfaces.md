# Shared interfaces — pinned signatures (do not diverge)

These are the contracts parallel tasks agree on. If one is wrong, STOP and report — do not invent a
variant. Layer 1/2 interfaces are added just-in-time before their waves.

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
- **redispatch-guard:** ADD binding on (`node-failed` with a blocking-class `reason`) and (`amendment` with
  a matching `drops[].workOrder`). **KEEP** the existing `dead-end`/`verdict`(infeasible+survivedSkeptic)
  binding (it is real and consumed by `dead-ends.mjs`/`reconcile` — Defect B). Exit codes unchanged
  (2=blocked, 0=clear). Add `test/redispatch-guard.test.mjs` (none exists).
- **reconcile closure fold:** a `node-failed` is *closed* only by a later `ratification`/`amendment` whose
  `resolvesSeq` equals that failed event's seq — never by a scan for coincidental id mentions. This is the
  same `resolvesSeq` T0.1's `blocked` semantics use; keep them consistent (shared helper if natural).
