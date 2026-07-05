# Effort discovery, truth-consistency, and self-explaining recovery

**Status:** design, approved to spec (2026-07-05). Adversarially reviewed (12 attacks, all findings folded in).
**Motivating incident:** the `graph-editor-ux-overhaul` false RECONCILE HALT (below).

---

## 1. The incident

A fresh session in `sofia-plays` opened to a `🛑 RECONCILE HALT — config.runMode is absent`. The effort
was healthy. The SessionStart hook had reconciled the **wrong** `.reasonable/`.

`sofia-plays` runs its effort *nested* at `.reasonable-efforts/graph-editor-ux-overhaul-2026-06-24/.reasonable/`
(a deliberate 2026-06-27 migration, to stop a repo-root container being mistaken for an effort). But a
stray, config-less `<repo>/.reasonable/` also existed — itself **born** when an earlier run resolved the
wrong root and wrote its derived index there. Discovery is `findEffortRoot(cwd)` = a pure **up-walk**
([lib/effort.mjs:132](../../../lib/effort.mjs)), so from the repo root it finds the stray immediately and
can never reach the nested effort (which is *down* a sibling subtree). The stray has no `config.json`, so
`loadConfig` returns `runMode: null`, and reconcile HALTs ([lib/reconcile.mjs:283](../../../lib/reconcile.mjs)).

Only a human memory note let the operator see through it. That's the hole: **restarting an effort in a
fresh session is routine, and the system could not deterministically say which effort was active or what
was left to do.**

## 2. Root cause — three layers deep

The surface bug is discovery. Attacking the fix exposed two deeper strata:

1. **Discovery is presence-based up-walk.** A nested effort is invisible; a config-less directory is
   adopted as an effort and HALTs. (Surface.)
2. **Birth has no location policy.** `develop` Step 0 writes `.reasonable/config.json` at repo-root cwd;
   the harness auto-creates the dir; the fence is fail-open at first-birth. So the stray root is *reborn*
   the moment any run (or a new `develop`) loses its `--root`. (Mechanism of recurrence.)
3. **Derived artifacts drift from the ledger.** `journal.json`, `work-orders/*.json`, `route.md`, and
   `progress.md` are all *lossy caches* that, in the live effort *right now*, disagree with the
   append-only ledger + git. Any "what's next" computed from them can be confidently wrong. (The real
   depth.)

The through-line: **the ledger (+ git) is the only truth; everything else is a cache.** A self-explaining,
deterministic "next step" is only as honest as the state it folds — so the deliverable is truth-consistency,
with discovery and next-action riding on top.

## 3. Goals / non-goals

**Goals**
- A fresh session, in any state, deterministically resolves *which* efforts exist and *what is left to do*
  in each — as a **read of a document**, never an LLM deduction.
- Support **multiple parallel efforts** per checkout (the operator ensures they don't intersect).
- Reserve HALT for exactly one case: a genuinely born effort with an ambiguous run mode.
- Kill stray-root rebirth at its true source (birth location), not a decoy layer.

**Non-goals**
- Coordinating/locking parallel efforts against each other (operator's responsibility, by request).
- Changing the methodology's phases, gates, or verification depth.
- A pointer/registry file — discovery is stateless (the scan is the source of truth).

## 4. Principles

- **Ledger is truth; caches are cross-checked, never trusted.** Work-order status, drops, and the frontier
  are *folds of the ledger*, with `journal.json`/`work-orders/*.json`/`route.md` used only to cross-check.
- **Determinism needs its own verifier.** A deterministic directive that is *wrong* and auto-executed in
  autonomous mode is more dangerous than a hesitant LLM. Every emitted directive passes a mechanical,
  non-LLM self-check before it is surfaced.
- **Layer, don't replace.** The up-walk primitive is correct for 19 existing call sites (including the
  security-relevant fence); new discovery is an additive wrapper, not a substitution.
- **One primitive per concept.** One birth predicate, one path-normalization choke point, one work-order
  status fold — shared by every caller, so they cannot diverge.

---

## 5. Layer 0 — truth-consistency (prerequisites)

These are pre-existing plugin defects that a deterministic next-action would otherwise inherit. They come
first.

### 5.1 Work-order status is a ledger fold (F2, F8)
`reconcile()` derives WO status **only** from `journal.workOrders` today ([reconcile.mjs:118-192](../../../lib/reconcile.mjs)),
so a WO present in the ledger + live worktrees but absent from the journal is invisible. Change: reconcile
computes WO status by **folding `ledger.jsonl`** — last `node-dispatched` with no later terminal event =
RUNNING; last `node-failed` with no later `ratification`/`amendment` = BLOCKED; an `amendment` drop with no
later restoring ratification = DROPPED — and treats `journal.workOrders` as a cache it *cross-checks and
warns on mismatch*, never the source. This is the same shape reconcile already uses for `trustStaleness()`,
so it is proportionate, not a redesign.

### 5.2 Reconcile downgrades are persisted (F8)
Reconcile's downgrade currently mutates only its in-memory journal object; `journal.json` is fenced to
`journal-writer`, so the correction never lands, and the ledger-fold tree maps `node-downgraded` → `failed`
while the journal still says `dispatched` — three disagreeing values. Change: reconcile emits its status
corrections through the `journal-writer` scribe (the one fenced hand) so a subsequent raw read is
consistent; the derived index stops diverging from the ledger it derives from.

### 5.3 Mirror writes are atomic and lock-covered (F1a)
`writeMirror` runs *outside* the ledger lock with plain `writeFileSync` overwrites ([progress-map.mjs:216-229](../../../lib/progress-map.mjs)),
so concurrent appends (the "normal" parallel case) tear or stale `progress.*`. Change: (a) widen the
existing `${ledgerPath}.lock` to cover the regen, and (b) make the mirror write atomic — write
`progress.json.tmp-<pid>` / `progress.md.tmp-<pid>` then `renameSync` over the target (atomic on NTFS and
POSIX same-volume), so even the unsynchronized PostToolUse-hook caller never exposes a torn file.

### 5.4 Attempt resolution moves inside the lock (F1b)
`append()` resolves the attempt number via `buildTree()` **before** acquiring the lock, so two concurrent
appends for one WO can stamp the same attempt slot. Change: acquire the lock once per `append()` and do
read-resolve-write atomically under it (no behavior change on the uncontended path).

### 5.5 Main-session ledger writes go through the lock (F1c)
The fence trusts `role === null` (main session) and exempts it from all `.reasonable/` governance, so two
trusted parallel sessions can `Edit`/`echo >>` `ledger.jsonl` directly, bypassing the lock — a silent lost
update with no detector. Change: the PreToolUse fence **denies direct Edit/Write/shell writes to
`.reasonable/ledger.jsonl` for every role including `role === null`**, forcing all writers through the
CLI's lock (the main session keeps its trust for everything else). Optionally, a liveness heartbeat written
by `session-start` surfaces "another session is active on this effort" in the briefing.

### 5.6 Drop/blocking vocabulary is consistent and structured (F12)
`redispatch-guard.mjs` keys on `type:"verdict"`/`type:"dead-end"`, which this pipeline **never emits** — it
is dead code that always returns "Clear." And an `amendment` drop is enforced *only* by a hand-deleted WO
file; `journal.workOrders` gets no structured `{status:"dropped"}` (unlike the slice-3 drops, which did).
Changes: (a) rekey `redispatch-guard` on the events actually produced (`node-failed` with a blocking-class
`reason`, `amendment` drops); (b) require a structured `{status:"dropped", supersededBy?, resolvesSeq}`
journal entry, written atomically with the ratification; (c) add `resolvesSeq` linkage on every
ratification/amendment that closes a `node-failed`, and use it as reconcile's closure fold — never a scan
for coincidental id mentions.

## 6. Layer 1 — discovery, birth-location, lifecycle

### 6.1 One birth predicate — `effortBirthState(root)` (F4)
A single shared function both discovery and reconcile call, so they cannot disagree:

```
effortBirthState(effortRoot) ->
  absent            : no .reasonable/config.json               -> NOT an effort (skip; classify stray/pre-birth)
  corrupt           : file exists but does not parse           -> born, HALT-worthy
  missing-signature : parses but no non-empty cfg.effort        -> born (foreign/hand-edited), HALT-worthy
  ok                : parses, has cfg.effort                    -> born, proceed
```

`cfg.effort` (present in every real config) doubles as the birth signature, making "only develop writes
config.json" enforceable at read time. Reconcile's S7 (§7 below) keys off this, not off `loadConfig`'s
lossy `runMode: null` — so a crashed effort HALTs instead of silently skipping.

### 6.2 Layered `resolveActiveEffort(cwd)` (F11, F3)
Do **not** replace `findEffortRoot`/`rootFromArgv` — all ~19 callers (fence, commit-gate, stop-commit, the
11 `--root` CLIs, the D18 workflow fallback) keep the up-walk they need. Add `resolveActiveEffort` as a
narrow, additive wrapper used **only** at the repo-root interactive SessionStart path:

```
resolveActiveEffort(cwd):
  1. up = findEffortRoot(cwd)          // up-walk first — correct for effort-root & worktree cwds
     if up and effortBirthState(up).born != absent  -> { resolved: up }
  2. else down-scan BORN efforts:
       repoRoot = git rev-parse --show-toplevel (fallback cwd)
       candidates = direct children of repoRoot/.reasonable-efforts/
                    where existsSync(join(child,'.reasonable','config.json'))   // EXACT path, never prefix
                    and name not in BACKUP_EXCLUDE  (/(-bak|\.bak|\.old|\.orig|\.archive|_copy)$/i)
                  ∪ repoRoot/.reasonable if born
       0 -> { none, strays:[config-less .reasonable dirs found] }
       1 -> { resolved }
       N -> { multiple: [...] }        // NORMAL for parallel efforts
  3. a `.reasonable` dir found at depth != 1 under .reasonable-efforts/ -> LOUD diagnostic, not silent none
```

Tests pin: `.reasonable.done-*` and `.reasonable.abandoned-*` never match born; a `…-bak` sibling with a
config is excluded; a config-less dir with an active journal is classified `stray`, never adopted.

### 6.3 Path normalization discipline (F6)
- `rootFromArgv` returns `norm(resolve(...))` at the source, so every current and future caller gets a
  forward-slash path by construction.
- Every path comparison in new code goes through `foldPath`/`samePath` (hoist them from `reconcile.mjs`),
  never naive `===`/`startsWith`.
- Any path emitted into a `▶ NEXT` directive or `progress.json` is forward-slash-only, asserted at
  emission (`if (text.includes('\\')) throw`) plus a `JSON.parse(JSON.stringify(...))` round-trip check —
  the cheap mechanical guard that would have caught the original lane-descriptor incident.

### 6.4 Birth-location policy — the real anti-rebirth fix (F5)
C2 is *not* a writer guard (the lib writers already fail on a missing dir). The leak is birth location:
- `develop` Step 0: before writing `config.json`, call `assertNoAmbiguousBirth(repoRoot)` — if
  `.reasonable-efforts/*/` already holds born efforts, **refuse a bare repo-root birth** and require an
  explicit `--root` (nested location).
- `fence.mjs` first-birth path: when `findEffortRoot(tgt)` is null **and** `.reasonable-efforts/` holds
  efforts, deny with "possible stray birth — use `--root`" instead of the silent fail-open allow.
- `reconcile.mjs`: add an AMBIGUOUS bucket for **">1 `.reasonable`-bearing root reachable"**, so any
  slipped-through stray surfaces on the next session instead of silently winning the path-walk.
- Resolve the `using-reasonable` (single-effort) vs `analysis` (multi-effort) doc contradiction in favor of
  multi-effort-nested, and document the location decision.

### 6.5 Lifecycle model (F10)
Deterministic predicates, cheapest signal first:

| State | Predicate (deterministic) | Briefing / NEXT |
|---|---|---|
| Concluded | dir renamed `.reasonable.done-*` (name, no ledger read) | not scanned; counted only |
| Abandoned | `reasonable:abandon` ran → `.reasonable.abandoned-*` | not scanned; counted only |
| Active | born `.reasonable/`, frontier has open slice | briefed, NEXT from the fold |
| At-7a-gate | born, frontier empty, `descendsFrom(effortBranch,base)` **false** | briefed, NEXT = **LAND** (never hidden) |
| Half-concluded | born, `descendsFrom(effortBranch,base)` **true**, no `.done-*` | briefed once, NEXT = **CONCLUDE** |
| Stray/debris | `.reasonable/` **absent** config (may have journal/ledger) | surfaced as debris + cleanup offer, never adopted |

New first-class action **`reasonable:abandon`** (ledger event + rename aside, mirroring `conclude`), so a
walked-away effort drops out of the scan the same cheap way concluded ones do. Until abandoned, the
briefing surfaces **staleness** (days since last ledger event) beside the NEXT, so a stale `DISPATCH` reads
as stale.

### 6.6 Cheap multi-effort briefing (F7)
SessionStart does **not** reconcile every effort. It:
- lists efforts by the cheap name/existence scan (concluded/abandoned filtered for free),
- for each, **reads the last-persisted, timestamped `nextAction`** from its `progress.json` (no git),
- **freshly reconciles only the effort being acted on** (or on demand),
- wraps **each iteration in its own try/catch** (never one around the loop — one bad effort degrades to
  "N−1 briefed, 1 flagged", honoring the fail-open law),
- surfaces "N parked/stale efforts hidden" rather than silently dropping.

## 7. Layer 2 — the deterministic `nextAction`

### 7.1 Where it runs (F8, B)
`nextAction` is computed **only inside `reconcile()`** — the one place git-ancestry + ledger + journal +
halts coexist — from the fully-reconciled result, *after* its ledger writes land. The PostToolUse progress
hook keeps projecting ledger facts into the tree; it **never** computes NEXT (it has no git visibility).
The computed directive is persisted via `journal-writer` into `progress.json.nextAction` and a `▶ NEXT`
block atop `progress.md`, **timestamped and marked `stale-until-next-reconcile`**. `session-start.mjs` and
`reconcile.mjs` surface it verbatim; the multi-effort briefing reads the persisted value (§6.6).

### 7.2 Inputs (all structured/append-only) (F9, A)
Ledger fold (authoritative) + `journal.json` current slice/phase (cross-check) + **new `route.json`**
(ordered slice ids + `ratifiedAt`/`ledgerSeq` back-pointer, single-writer) for the forward frontier +
`work-orders/*.json` (cross-check only) + `inbox.json`. `route.md` is **not parsed** — demoted to human
narration, optionally rendered from `route.json`. WO schema gains a required `dependsOn: [workOrderId]` so
"deps met" is a real predicate: `dependsOn.every(id => status(id) ∈ {green,merged})`.

### 7.3 The decision projection (F2 — a set, not a scalar)
First-match for the *global* mutually-exclusive states; within a slice, independent conditions emit a
**directive set** (so live work + separately-ready work both surface, preserving the parallel dispatch
slice 4 used):

```
global (first match):  HALT(S7) | AMBIGUOUS(>1 root) | inbox-BREAKING(DECIDE) | halt-class(from reconcile)
per active effort (set):
  blocked WO (node-failed unresolved)         -> DECIDE: WO <id>
  running WO (dispatched, live lane)          -> RUNNING: <ids>
  ready WO (not green, dependsOn met, not dropped) -> DISPATCH: slice <S> -> <ids>
  slice all-green, retro open                 -> RETRO: slice <S>
  retro done, next slice in route.json        -> OPEN: slice <S+1>
  frontier empty, descendsFrom(eb,base) false -> LAND
  descendsFrom(eb,base) true, still .reasonable/ -> CONCLUDE
  all done                                    -> DONE
```

### 7.4 The output self-check (F12 — who verifies the projection)
Before any directive is surfaced, a mechanical, non-LLM invariant runs and refuses-with-reason on
violation:
- never `DISPATCH`/`RUNNING` a WO with an unresolved `amendment`/`node-downgraded` (drop is authoritative
  over file/journal existence — kills resurrection),
- never `DISPATCH` a WO the (fixed) redispatch-guard flags,
- never `OPEN` a retired slice, never `LAND` when the frontier is non-empty.
In autonomous mode a directive that fails the self-check is **not** auto-executed — it escalates. This is
the adversarial verification of the projection itself.

---

## 8. Robustness matrix

| # | Scenario | Result |
|---|---|---|
| S1 | one repo-root effort | up-walk resolves |
| S2 | one nested effort (this repo) | down-scan resolves — no `--root`, no pointer |
| S3 | N parallel efforts | all briefed (cheap), act via `--root`/name |
| S4 | stray repo-root + real nested | birth predicate skips stray, briefs real, warns; birth-location policy stops rebirth |
| S5 | half-born (crashed pre-config) | `absent` → pre-birth, clear next step |
| S6 | unrelated `.reasonable/` / none | "no effort" |
| S7 | born effort, runMode bad | HALT — the only remaining mode-HALT |
| S8 | corrupt/foreign config | `corrupt`/`missing-signature` → HALT (not silent skip) |
| S9 | backup sibling `…-bak` w/ config | excluded by name, warned |
| S10 | concluded / abandoned | filtered by dir name, counted not briefed |
| S11 | at-7a-gate (awaiting human LAND) | briefed, NEXT=LAND (never hidden) |
| S12 | ledger-dropped WO, file restored | self-check refuses DISPATCH (drop authoritative) |
| S13 | parallel concurrent appends | atomic mirror + lock; no torn/stale progress |
| S14 | K efforts every session | cheap scan + read persisted NEXT; reconcile only the acted-on one |

## 9. Testing

- **Layer 0:** concurrency tests (interleaved appends → no torn mirror, no dup attempt slot; main-session
  direct ledger write denied); WO-status ledger-fold unit tests over the real incident state (journal
  missing S5 while ledger+worktrees show it → RUNNING, not "ready"); redispatch-guard fires on `node-failed`;
  drop produces structured journal status.
- **Layer 1:** `effortBirthState` fixtures (absent/empty/corrupt/missing-signature/ok); `resolveActiveEffort`
  across S1–S10 incl. N-parallel, `…-bak`, `.done-*`, depth≠1 loud fail; path-norm/round-trip on Windows;
  birth-location refusal when siblings exist; reconcile duplicate-root AMBIGUOUS.
- **Layer 2:** decision-projection table over reconstructed states (mixed running+ready set; blocked+ready;
  at-7a-gate LAND; resurrection refused by self-check); `route.json` frontier ordering; `dependsOn` predicate;
  persisted-NEXT staleness marker; hook-path never writes NEXT.

## 10. Build order

Forced by dependency: **Layer 0 → Layer 1 → Layer 2.** Layer 0 makes the ledger trustworthy; Layer 1 makes
discovery/birth robust and already kills the false-HALT incident; Layer 2 builds the honest, self-checking
NEXT on the now-trustworthy foundation. Each layer lands independently green.

## 11. Open risks

- `git rev-parse --show-toplevel` inside a linked worktree returns the worktree's own root; §6.2 avoids
  this by trying the up-walk first (which is correct in worktree/effort-root cwds) and only down-scanning
  from the repo-root interactive context.
- SessionStart hook timeout under many efforts is mitigated by §6.6 (no per-effort reconcile), but the
  harness's hook-timeout default was not independently confirmed — verify during implementation.
- Persisted `nextAction` staleness: a reader trusts a value only as fresh as the last reconcile; the
  timestamp + `stale-until-next-reconcile` marker makes that explicit, but consumers must honor it.
