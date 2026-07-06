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

1. **Layer 2** (deterministic `nextAction`): author + run T2.1 route.json + `dependsOn` schema → T2.2 decision
   projection (consumes T1.3 `lifecycle`) → T2.3 `next-action` ledger event + mirror render (**fold in the
   Windows `renameSync`-retry hardening — see layer0-checkpoint flag #4**) → T2.4 output self-check → T2.doc.
   Interfaces for Layer 2 are NOT yet pinned — pin them just-in-time against the merged Layer-0/1 code (do a
   fresh recon of ledger.mjs EVENT_SCHEMAS, progress-map writeMirror/render, reconcile result, route.md).
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
