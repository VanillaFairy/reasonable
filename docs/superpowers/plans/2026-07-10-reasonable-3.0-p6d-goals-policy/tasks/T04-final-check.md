# T04 — Final check (no version bump)

**role:** — (final)
**Depends on:** T01c, T02c, T03
**Owns (stage only these):** `docs/superpowers/plans/2026-07-08-reasonable-3.0-roadmap.md`

> **No version bump.** Per the roadmap's 2026-07-09 versioning decision, P5–P8 (P6a–P6e included) land
> on the shared refactoring line at `3.2.0` and bump once at the end of the generation. Do **not** touch
> `.claude-plugin/plugin.json` or the README. This task's only edit is the roadmap **P6d** status cell.

- [ ] **Step 1: Run the entire suite green**

Run: `for t in test/*.test.mjs; do node "$t"; done`
Expected: no `FAIL` line anywhere; `test/goals-loader.test.mjs` and `test/policy-loader.test.mjs` each
report all checks pass. If any file fails, STOP and escalate — do not mark P6d landed over a red suite.

- [ ] **Step 2: Move the roadmap P6d status cell**

In `docs/superpowers/plans/2026-07-08-reasonable-3.0-roadmap.md`, find the **P6d** row in the P6
sub-series table (the row: `| **P6d** | **`goals.json` + `policy.json`** … | `lib/goals.mjs`,
`lib/policy.mjs` (new) | — | Planned |`) and change its **Status** cell from `Planned` to:

```
Landed — merged (no bump, 3.2.0)
```

Change **only** the P6d cell. Leave P6a/P6b/P6c/P6e as they are. Do not add a version bump anywhere.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/plans/2026-07-08-reasonable-3.0-roadmap.md
git commit -m "docs(roadmap): P6d (goals.json + policy.json loaders) landed — merged, no bump (3.2.0)"
```

- [ ] **Step 4: Report to the supervisor**

P6d is complete: `lib/goals.mjs` (`readGoals`) and `lib/policy.mjs` (`readPolicy`) shipped, tested,
audited, documented; suite green; no version bump; roadmap cell moved. Per the sub-series dependency
order (P6a → P6d → { P6b, P6c } → P6e), the next sub-parts are **P6b (the legibility law)** and **P6c
(the ceremony dial)** — both now unblocked (they read `policy.json`'s thresholds/dials, whose grammar
P6d pinned). Their plans are written next, one sub-part at a time (parent roadmap rule). Do not start
them here.
