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
   - **T2.2** (authored, in flight) — pure `projectDirectives(state)` + reconcile assembles state (reads WO
     specs for `dependsOn`/`verticalSlice`, detects canceled via `buildTree`), attaches `result.nextAction`.
   - **T2.3** — `next-action` ledger event (Family 3) + mirror render (`progress.json.nextAction` string +
     `▶ NEXT` block + K-since-`computedFrom` staleness) + **Windows `renameSync` EPERM/EBUSY retry** in
     `atomicWrite` (layer0-checkpoint flag #4).
   - **T2.4** — `selfCheckDirectives` (drop-resurrection / guard-flag / retired-slice / land-nonempty refusals)
     + autonomous escalation; gated BEFORE the T2.3 append.
   - **T2.doc** — doc-sync (route.json + `next-action` grammar `*`, D19 render, §7 cross-refs, fix stale
     `route-planner.md:145-146` merged/green prose) + version bump 2.5.0 → 2.6.0.
2. **Final:** whole-implementation review + `finishing-a-development-branch`.

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
