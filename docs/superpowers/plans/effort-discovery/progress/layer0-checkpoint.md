# Checkpoint — Layer 0

## Wave 0a — COMPLETE and merged (suite: 34 files green on the merged branch)

| Task | Result | Commits |
|---|---|---|
| T0.1 wo-status ledger fold | spec ✅, code-quality ✅ Approve, +2 hardening tests | `985fcf2`, `c2dd381` |
| T0.2 locking correctness | code ✅ (challenge upheld); tests rebuilt to discriminate, RED-on-`a6348eb` independently verified | `3c10052`, `17f2c33` |
| T0.3 fence deny-direct-ledger-write | spec ✅, code-quality ✅ (minor), Windows-casing hardening applied | initial, `472dff4` |

Merge commits: `e01e8e9` (T0.2), `097ffe5` (T0.1), `b8e5c58` (T0.3). Interface correction: `a567f00`.

### Interface corrections made during the wave
- **§T0.2 was over-specified.** The original "N concurrent same-node dispatches → distinct attempts" was
  wrong: a plain re-dispatch of a *live* node is a **continuation** (same slot) by the existing attempt
  machine (`nextDispatchAttempt`); forcing distinct slots would break checkpoint-reclaim continuation
  (D19). The real §5.4 property is **attempt resolution reads committed state under the lock** so concurrent
  *reopens* don't collide. `shared/interfaces.md` §T0.2 updated to record this + the discriminator recipe.

## Carried FORWARD-FLAGS (must be handled in later layers)

1. **`node-canceled → pending` (from T0.1).** T0.1 folds both `node-downgraded` and `node-canceled` to
   `pending`. Safe for Layer 0 (reconcile never re-dispatches). **Layer 2 must disambiguate:** a
   *deliberately* canceled WO must not read as re-dispatchable/harvest-eligible via the dependency predicate
   or route-planner. Fold `node-downgraded`→pending is correct (lost-work returns to baseline); the
   canceled case is the one Layer 2's retirement/dependency logic must treat as terminal-not-pending.
2. **Classifier case-sensitivity is broader than the ledger (from T0.3 review).** T0.3 hardened only the
   **ledger** match to be case-insensitive on Windows. The rest of `classifyReasonable`/enforcement-path
   matching is still case-sensitive on a case-insensitive FS. **T1.2 (§6.3 path normalization) should
   consider case-folding path comparisons generally on win32.**

## Wave 0b — NEXT (sequential: both touch reconcile.mjs)

- **T0.4** retire journal per-WO `status` (depends on T0.1 ✅). Then **T0.5** drop vocabulary +
  redispatch-guard (depends on T0.1 ✅ + T0.4). Then **T0.doc** (Layer-0 doc-sync + minor version bump),
  which also transcribes: ledger `drops`/`resolvesSeq` grammar, journal narrowed shape, and the T0.2
  mirror-atomicity note.

## Layer 0 CLOSED — all merged (suite 37/37 green, v2.4.0)

Wave 0b: T0.4 (`9131c1f`, merged-WO downgrade defect fixed), T0.5 (`f912da5`, drops vocab + workflow
prose; the wedging `node-failed` redispatch binding removed + dead-end double-surface fixed). Wave 0c:
T0.doc (`ef1acb6`, artifacts/DESIGN/glossary + version 2.3.1→2.4.0). Post-merge de-flake (`c2f58f9`) of the
§5.3 concurrency discriminator.

## Carried FORWARD-FLAGS (added during Wave 0b/0c)

3. **redispatch-guard: `node-failed` is intentionally NON-binding** (T0.5). It binds only `dead-end`/`verdict`
   (hash-gated) + `amendment` drops (resolvesSeq-gated). `resolvesSeq`/`drops` have **no live emitter** —
   that wiring (retro/amendment/dead-end ceremony in `skills/*`) is future work; the grammar + amendment-drop
   binding are forward-looking. If a later task wires resolvesSeq emission, re-check the guard/fold agreement.
4. **T2.3 (Layer 2): harden `writeMirror`'s `renameSync` against the Windows sharing-violation drop.** The
   de-flake proved that on Windows a concurrent reader colliding with `writeMirror`'s `renameSync(tmp,
   progress.json)` throws EPERM/EBUSY, which `append()` swallows as an advisory `mirrorError` — silently
   DROPPING that mirror publish (self-heals on the next append, but a quiescent mirror can lag the ledger by
   one). Since T2.3 makes `writeMirror` render the `next-action` directive (where a dropped publish would
   show a stale NEXT at quiescence), fold a bounded `renameSync`-retry-on-EPERM/EBUSY into T2.3 — completing
   T0.2's atomic-publish intent on the primary platform.

## Method notes that worked (promote to knowledge)
- The **discriminator gate** (run a task's new tests against the pre-task commit's lib, require RED) caught
  a hollow-test slip on T0.2 that a green suite hid. Enforce it for every test-bearing task.
- Independent supervisor re-run of the discriminator (not just trusting the report) is cheap and decisive.
