# RESUME POINT — effort-discovery subagent-driven run

**Interrupted by the API session limit** (resets 5:30am Europe/Warsaw). Subagent spawning is blocked until
then; the main session made the small T1.5 message fix directly and merged. Branch: `effort-discovery-truth-consistency`.

## DONE and merged (branch tip; suite 44/44 green at every commit)

- **Layer 0** — COMPLETE, version bumped to **2.4.0**. T0.1 wo-status ledger fold · T0.2 locking correctness
  (+ de-flake of the §5.3 concurrency discriminator) · T0.3 fence deny-direct-ledger-write · T0.4 retire
  journal WO `status` · T0.5 drops vocabulary + redispatch-guard + workflow scribe-prose · T0.doc.
- **Layer 1 CODE** — COMPLETE (doc-sync NOT yet done). T1.1 `effortBirthState` + `config.effort` birth
  signature · T1.2 `resolveActiveEffort` + path-norm (the motivating-incident discovery fix) · T1.4a
  `reasonable:abandon` command + `'abandoned'` event · T1.3 birth-location policy + reconcile `lifecycle`
  field + gitignore-abandoned · T1.5 multi-effort SessionStart briefing + reconcile S7 born-state HALT.

## NEXT (in order), when subagents are back

1. **T1.doc — Layer-1 doc-sync + version bump 2.4.0 → 2.5.0.** Task file authored:
   `tasks/T1.doc-layer1-docsync.md`. Dispatch it (docs-only worktree), review lightly (grammar accuracy +
   version consistency), merge. Closes Layer 1.
2. **Layer 2** (deterministic `nextAction`): author + run T2.1 route.json + `dependsOn` schema → T2.2 decision
   projection (consumes T1.3 `lifecycle`) → T2.3 `next-action` ledger event + mirror render (**fold in the
   Windows `renameSync`-retry hardening — see layer0-checkpoint flag #4**) → T2.4 output self-check → T2.doc.
   Interfaces for Layer 2 are NOT yet pinned — pin them just-in-time against the merged Layer-0/1 code (do a
   fresh recon of ledger.mjs EVENT_SCHEMAS, progress-map writeMirror/render, reconcile result, route.md).
3. **Final:** whole-implementation review + `finishing-a-development-branch`.

## Carried FORWARD-FLAGS (must not be lost)

- **MIGRATION IMPACT (surface to the user):** T1.5 Part B makes reconcile HALT on a `missing-signature`
  config — i.e. **any effort created before T1.1 (no `config.effort`) will HALT on its next session** until
  the operator adds `"effort": "<name>"` to its `.reasonable/config.json`. The HALT message now names that
  fix (self-servicing). This hits pre-existing dogfood efforts (sofia-plays etc.). Spec-correct (§6.1), safe
  direction, but a real one-time migration the user should know about.
- **T2.3 Windows rename hardening** (layer0-checkpoint flag #4): `writeMirror`'s `renameSync` can be dropped
  by a concurrent Windows reader (EPERM/EBUSY, swallowed as advisory `mirrorError`) → mirror lags ledger by
  one at quiescence. Fold a bounded retry-on-EPERM/EBUSY into T2.3 (it already touches `writeMirror`).
- **`node-canceled → pending` (T0.1):** Layer 2's dependency predicate / route-planner must treat a
  deliberately-canceled WO as terminal, not re-dispatchable.
- **redispatch-guard `resolvesSeq`/`drops` have no live emitter** — if a Layer-2/future task wires
  `ratification{resolvesSeq}` emission, re-check the guard/fold agreement.
- **External `marketplace.json`** (repo's parent, `vanillafairy/.claude-plugin/marketplace.json`) needs its
  `reasonable` entry bumped to match the plugin version — outside this branch; note at final handoff.

## Method notes that earned their keep
Discriminator gate (run new tests against the pre-task commit, require RED) caught T0.2's hollow tests. The
two-stage review caught: a fold-corrupting merged-WO downgrade (T0.4), a Windows ledger casing bypass (T0.3),
a redispatch wedge (T0.5), a contradictory dead-end briefing (T0.5), the abandoned-gitignore gap (T1.4a→T1.3),
and a transposed ancestry example in the plan's own interface (T1.3). Independent supervisor re-verification
of discriminators before merge is cheap and decisive — keep doing it.
