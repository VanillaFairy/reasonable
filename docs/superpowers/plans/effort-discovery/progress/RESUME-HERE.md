# RESUME POINT — effort-discovery subagent-driven run

**Resumed 2026-07-06.** Branch: `effort-discovery-truth-consistency`. Layers 0 and 1 are now BOTH fully
complete (code + doc-sync). Plugin at **v2.5.0**. Next up: Layer 2.

## DONE and merged (branch tip; suite 44/44 green at every commit)

- **Layer 0** — COMPLETE, version bumped to **2.4.0**. T0.1 wo-status ledger fold · T0.2 locking correctness
  (+ de-flake of the §5.3 concurrency discriminator) · T0.3 fence deny-direct-ledger-write · T0.4 retire
  journal WO `status` · T0.5 drops vocabulary + redispatch-guard + workflow scribe-prose · T0.doc.
- **Layer 1** — COMPLETE (code + doc), version bumped to **2.5.0**. T1.1 `effortBirthState` + `config.effort`
  birth signature · T1.2 `resolveActiveEffort` + path-norm (the motivating-incident discovery fix) · T1.4a
  `reasonable:abandon` command + `'abandoned'` event · T1.3 birth-location policy + reconcile `lifecycle`
  field + gitignore-abandoned · T1.5 multi-effort SessionStart briefing + reconcile S7 born-state HALT ·
  **T1.doc** (`8671211`) — Layer-1 doc-sync (artifacts/DESIGN/architecture/glossary + the single-vs-multi
  contradiction resolved to multi-nested in CLAUDE.md + using-reasonable) + version 2.4.0→2.5.0. Two-stage
  review confirmed every grammar delta against the merged code; kept the implementer's in-sentence
  brownfield-deferred→first-class accuracy fix (verified correct).

## NEXT (in order)

1. **Layer 2** (deterministic `nextAction`) — IN PROGRESS. Interfaces PINNED 2026-07-06 against the merged
   Layer-0/1 code (`shared/interfaces.md` §Layer 2), three spec corrections baked in (C: the `{green,merged}`
   status vocabulary doesn't exist → `status==='done'` off reconcile's `workOrderStatuses`; D: `node-canceled`
   is terminal-abandoned → detect via `buildTree`, a canceled dep never satisfies `dependsOn`; E: the guard
   never keys on `node-failed`, reaffirmed from T0.5). Two new PURE modules: `lib/route.mjs` (done) +
   `lib/next-action.mjs` (`projectDirectives` T2.2 / `selfCheckDirectives` T2.4). Sequential chain on
   `reconcile.mjs`:
   - **T2.1 DONE** (`c7f5f1a`, suite 45/45) — `route.json` + `lib/route.mjs readRoute` → `{route, diagnostic}`
     + WO `dependsOn` wired into work-order-writer + route-planner; `route.json` persisted at analysis 10a AND
     retro step 5 (both sites kept in sync — implementer caught the retro drift).
   - **T2.2 DONE** (`9d149d9`, suite 47/47) — pure `projectDirectives(state)` (§7.3 directive SET) +
     `lib/next-action.mjs`; reconcile assembles state (reads WO specs for `dependsOn`/`verticalSlice`, detects
     canceled via `buildTree`, `retroDone` = slice strictly before `currentVerticalSlice` in route order),
     attaches `result.nextAction`. AMBIGUOUS=any unsettleable-config halt (incl. S7), HALT=floor-integrity
     STOP (T2.doc should document this taxonomy). Verified the halt-reason hoist is behavior-identical.
   - **T2.3 DONE** (`6f288f2`, suite 48/48) — `next-action` ledger event (Family 3, `validateNextAction`) +
     mirror render (`progress.json.nextAction` string + `▶ NEXT` block + K-since-`computedFrom` staleness;
     reconcile appends one per call; existing reconcile tests updated + strengthened to assert no spurious
     downgrade) + **Windows `renameSync` EPERM/EBUSY retry** in `atomicWrite` (bounded `Atomics.wait` backoff).
     Regen-clobber regression green (the NEXT block survives a wholesale mirror rebuild). `renderDirectives`
     shared by mirror + briefing.
   - **T2.4 DONE** (`4501e27`, suite 48/48) — extracted redispatch-guard's blocking predicate to an exported
     pure `redispatchBlock(ledger, wo, computeHash)` + `hashWorkOrder(effortRoot, wo)` (DRY; the CLI is a thin
     behavior-identical wrapper, guard test 13/13 unchanged); pure `selfCheckDirectives(directives, context)`
     (guard-flag / retired-slice / land-nonempty refusals → DECIDE) gated in reconcile BEFORE the T2.3 append.
     **Correction F:** the self-check does NOT refuse `node-downgraded` (D19 legitimate reopen; the real
     invariant is drop-authoritative via the guard, matrix S12). **Process note:** the subagent hit the weekly
     API limit after finishing part 1 (guard extract, verified green); the main session completed
     `selfCheckDirectives` + the reconcile gate + the S12 resurrection test inline. To offset the self-authoring,
     a **mutation check** confirmed the S12 test fails when the gate is neutered (real teeth); both new test
     files are RED against the pre-task commit.

   **LAYER 2 CODE COMPLETE** — T2.1–T2.4 merged, suite 48/48. Only T2.doc + final remain.
   - **T2.doc DONE** (`8987cd9`, suite 48/48) — doc-sync (route.json + `next-action` grammar `*`, `progress.json.nextAction`/`▶ NEXT`
     D19 render + K-staleness, §7 projection-SET + self-check + the AMBIGUOUS=unsettleable-config vs HALT=
     floor-STOP taxonomy, `redispatchBlock`/Correction F, fix stale `route-planner.md:145-146` merged/green
     prose per Correction C) + version bump 2.5.0 → 2.6.0.
**✅ ALL THREE LAYERS COMPLETE** — Layer 0 (v2.4.0) · Layer 1 (v2.5.0) · Layer 2 (v2.6.0). Suite 48/48 green at
branch tip `8987cd9`. The effort's CODE is done.

2. **Final review DONE** — a fresh read-only whole-implementation reviewer over the Layer-2 pipeline returned
   **SHIP-WITH-NITS**: pipeline coherent end-to-end (order correct, self-check gates before persistence,
   producer/consumer contracts align, purity holds, Corrections C/D/E/F honored in code, docs match parsers,
   §7.1–7.4 + S12 realized). Two LOW findings, both addressed:
   - **F2 FIXED** (`a3b3ba8`, patch bump → **2.6.1**) — the reconcile self-check skipped the redispatch-guard
     for a WO whose spec file was absent (`if(!spec) continue`), but the amendment-drop binding needs no spec,
     so a dropped WO re-dispatched into a live fold state could slip past as RUNNING once its spec was deleted.
     Now the guard runs regardless of spec presence (drop authoritative over file existence, S12). New test #7
     in `reconcile-next-action.test.mjs`, RED pre-fix.
   - **F1 documented** — the self-check's OPEN/LAND rules are defense-in-depth (unreachable under the current
     projection, which shares their ground truth); commented in `next-action.mjs`. The RUNNING whole-directive-
     refusal nit is accepted (safe → DECIDE; a guard-blocked *running* WO is itself an inconsistent state).

**🎉 EFFORT COMPLETE** — all three layers + final review + fix. Branch `effort-discovery-truth-consistency` @
`a3b3ba8`, plugin **v2.6.1**, suite **48/48 green at every commit**. Only the human integration decision
remains (merge to `master` / PR / keep the branch — NOT done autonomously).

**Handoff flag:** bump the external `vanillafairy/.claude-plugin/marketplace.json` `reasonable` entry
(currently stale `1.11.1`) to `2.6.1` — it lives one level up, outside this repo, and is synced manually.

## Carried FORWARD-FLAGS (must not be lost)

- **MIGRATION — now auto-handled (commit `8591e7b`).** A pre-T1.1 effort (no `config.effort`) is still
  unambiguously identifiable — its name lives in `journal.effort` (written at analysis). reconcile now
  **auto-reconstructs** the birth signature from `journal.effort` (heals `config.json`, effort field only)
  and proceeds, so pre-existing dogfood efforts (sofia-plays etc.) heal silently on their next session —
  **no HALT, no operator action.** HALT/flag now fire ONLY for a genuinely unidentifiable config
  (missing-signature AND no recoverable name anywhere) or a corrupt (unparseable) one. New helper:
  `effort.mjs reconstructBirthSignature()`. **T1.doc must document** this reconstruction behavior (§6.1) —
  it changes the S7 story from "HALT on missing-signature" to "reconstruct-or-HALT".
- **T2.3 Windows rename hardening** (layer0-checkpoint flag #4): `writeMirror`'s `renameSync` can be dropped
  by a concurrent Windows reader (EPERM/EBUSY, swallowed as advisory `mirrorError`) → mirror lags ledger by
  one at quiescence. Fold a bounded retry-on-EPERM/EBUSY into T2.3 (it already touches `writeMirror`).
- **`node-canceled → pending` (T0.1):** Layer 2's dependency predicate / route-planner must treat a
  deliberately-canceled WO as terminal, not re-dispatchable.
- **redispatch-guard `resolvesSeq`/`drops` have no live emitter** — if a Layer-2/future task wires
  `ratification{resolvesSeq}` emission, re-check the guard/fold agreement.
- **External `marketplace.json`** (repo's parent, `vanillafairy/.claude-plugin/marketplace.json`) needs its
  `reasonable` entry bumped to match the plugin version — outside this branch; note at final handoff.
  Observed during T1.doc: it currently pins `"version": "1.11.1"`, already badly stale vs the plugin's own
  `plugin.json` (a PRE-EXISTING drift, not caused by this effort). Bump it to the final shipped version at
  handoff (Layer 2's doc-sync lands the last bump).

## Method notes that earned their keep
Discriminator gate (run new tests against the pre-task commit, require RED) caught T0.2's hollow tests. The
two-stage review caught: a fold-corrupting merged-WO downgrade (T0.4), a Windows ledger casing bypass (T0.3),
a redispatch wedge (T0.5), a contradictory dead-end briefing (T0.5), the abandoned-gitignore gap (T1.4a→T1.3),
and a transposed ancestry example in the plan's own interface (T1.3). Independent supervisor re-verification
of discriminators before merge is cheap and decisive — keep doing it.
