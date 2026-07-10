# T04 — Final check (no version bump)

**role:** — (final)
**Depends on:** T01c, T02c, T03
**Owns (stage only these):** `docs/superpowers/plans/2026-07-08-reasonable-3.0-roadmap.md`

> **No version bump.** Per the roadmap's 2026-07-09 versioning decision, P5–P8 (P6a–P6e included) land
> on the shared refactoring line at `3.2.0` and bump once at the end of the generation. Do **not** touch
> `.claude-plugin/plugin.json` or the README. This task's only edit is the roadmap **P6c** status cell.

- [ ] **Step 1: Run the entire suite green**

Run: `for t in test/*.test.mjs; do node "$t"; done`
Expected: no `FAIL` line anywhere; `test/ceremony-classify.test.mjs` and `test/ceremony-phase.test.mjs`
both report all checks pass. This must be green with **zero regressions across every landed sub-part**
(70+ files) — P1–P5, and P6a (`test/graph-planned-edges.test.mjs`), P6b (`test/legibility.test.mjs`),
P6d (`test/goals-loader.test.mjs`, `test/policy-loader.test.mjs`) included. If any file fails, STOP and
escalate — do not mark P6c landed over a red suite.

- [ ] **Step 2: Move the roadmap P6c status cell**

In `docs/superpowers/plans/2026-07-08-reasonable-3.0-roadmap.md`, find the **P6c** row in the P6
sub-series table (the row beginning `| **P6c** | The **ceremony dial** …`, whose **Depends on** cell is
`P6a, P6d`) and change its **Status** cell from `Planned` to:

```
Landed — merged (no bump, 3.2.0)
```

Change **only** the P6c cell. Leave P6a/P6b/P6d/P6e as they are. Do not add a version bump anywhere.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/plans/2026-07-08-reasonable-3.0-roadmap.md
git commit -m "docs(roadmap): P6c (ceremony dial) landed — merged, no bump (3.2.0)"
```

- [ ] **Step 4: Report to the supervisor**

P6c is complete: `lib/ceremony.mjs` (`classify` + `scaffoldMaterializes` / `rechartingDegenerates` /
`retroClassificationDegenerates`) shipped, tested, audited, documented; suite green with zero
regressions; no version bump; roadmap cell moved. The mandated pin (Decision 5's phase-degeneration
predicate) is mechanical and adversarially tested, not prose. Per the sub-series dependency order
(P6a → P6d → { P6b, P6c } → P6e), the one remaining sub-part is **P6e (the topologist +
`topology.html`)** — its plan is written next, one sub-part at a time (parent roadmap rule). Do not start
it here.
