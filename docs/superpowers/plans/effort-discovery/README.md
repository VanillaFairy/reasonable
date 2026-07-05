# Plan: effort-discovery, truth-consistency, self-explaining recovery

Executes `docs/superpowers/specs/2026-07-05-effort-discovery-truth-consistency-recovery-design.md`
(v2, on branch `effort-discovery-truth-consistency`) via subagent-driven-development.

**Run scope (chosen 2026-07-05):** all three layers. **Test discipline:** test-first + two-stage review.

## Two spec defects corrected in these tasks (discovered during recon)

- **Defect A (§6.1 birth signature):** the spec keys born-effort detection on `cfg.effort`, but the real
  `develop`/`analysis` flow never writes it — only `conclude.mjs` reads it and only test fixtures set it;
  the effort *name* lives in `journal.effort`. **T1.1 must also make `develop` Step 0 write `cfg.effort`**,
  or every real effort reads as `missing-signature` → HALT.
- **Defect B (§5.6 "never emitted"):** `redispatch-guard` keys on `verdict`(infeasible)/`dead-end`, and
  those ARE valid schema types, ARE documented dead-end-ceremony outputs, and `dead-ends.mjs` + `reconcile`
  consume the identical predicate. **T0.5 ADDS keying on `node-failed`+blocking-reason and `amendment`
  drops; it does NOT remove the existing `dead-end`/`verdict` binding.**

## Task / dependency / wave table

| Task | Layer | Depends on | Primary files | Wave |
|---|---|---|---|---|
| T0.1 wo-status ledger fold | 0 | — | `lib/wo-status.mjs` (new), `reconcile.mjs` | 0a |
| T0.2 locking correctness (§5.3+§5.4) | 0 | — | `ledger.mjs`, `effort.mjs`, `progress-map.mjs` | 0a |
| T0.3 fence deny-direct-ledger-write | 0 | — | `fence.mjs` | 0a |
| T0.4 retire journal WO `status` | 0 | T0.1 | `agents/journal-writer.md`, `reconcile.mjs` | 0b |
| T0.5 drop vocabulary + redispatch-guard | 0 | T0.1, T0.4 | `redispatch-guard.mjs`, `ledger.mjs`, `reconcile.mjs` | 0b |
| T0.doc Layer-0 doc-sync | 0 | T0.1–T0.5 | `docs/artifacts.md`, `DESIGN.md`, `architecture.md` | 0c |
| T1.1 effortBirthState + write signature | 1 | T0.* | `effort.mjs`, `skills/develop/SKILL.md` | 1a |
| T1.2 path normalization | 1 | T0.* | `effort.mjs`, `reconcile.mjs` | 1a |
| T1.3 resolveActiveEffort | 1 | T1.1, T1.2 | `effort.mjs` | 1b |
| T1.4 birth-location policy | 1 | T1.1 | `effort.mjs`, `skills/develop`, `fence.mjs`, `reconcile.mjs` | 1b |
| T1.5 lifecycle + `reasonable:abandon` | 1 | T1.1 | `lib/abandon.mjs` (new), a skill/command | 1b |
| T1.6 cheap multi-effort briefing | 1 | T1.3, T1.5 | `session-start.mjs` | 1c |
| T1.doc Layer-1 doc-sync | 1 | T1.* | docs + glossary | 1d |
| T2.1 route.json + dependsOn schema | 2 | T0.* | new artifact, WO schema, writers | 2a |
| T2.2 decision projection (nextAction) | 2 | T0.1, T1.*, T2.1 | `reconcile.mjs` | 2b |
| T2.3 next-action ledger event + render | 2 | T2.2 | `ledger.mjs`, `progress-map.mjs`, `reconcile.mjs` | 2b→seq |
| T2.4 output self-check | 2 | T2.2, T2.3 | `reconcile.mjs` (or new lib) | 2c |
| T2.doc Layer-2 doc-sync | 2 | T2.* | docs | 2d |

Waves inside a layer are small because `reconcile.mjs`/`ledger.mjs`/`effort.mjs` are each touched by many
tasks — file-disjoint tasks parallelize, the rest serialize. Layers are strictly serial (spec build order).

## Layer-just-in-time authoring

Layer 0 task files are authored in full now. Layer 1 and 2 task files are authored just before their first
wave, against the interfaces Layer 0 actually landed (their specs depend on the realized fold/lock shapes).

## Doc-sync obligation (repo invariant 3)

Machine-parsed grammar and its parser change together. Each layer's `T*.doc` task lands the `artifacts.md`
grammar + DESIGN/architecture cross-refs for that layer, serial (one writer on `artifacts.md`). Version bump
per layer (minor) happens in the doc-sync task.
