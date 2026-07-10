# T03 — Final check (no version bump)

**role:** — (final)
**Depends on:** T01c, T02
**Owns (stage only these):** `docs/superpowers/plans/2026-07-08-reasonable-3.0-roadmap.md`

> **No version bump.** Per the roadmap's 2026-07-09 versioning decision, P5–P8 (P6a–P6e included) land
> on the shared refactoring line at `3.2.0` and bump once at the end of the generation. Do **not**
> touch `.claude-plugin/plugin.json` or the README. This task's only edit is the roadmap P6a status
> cell.

- [ ] **Step 1: Run the entire suite green**

Run: `for t in test/*.test.mjs; do node "$t"; done`
Expected: no `FAIL` line anywhere; `test/graph-planned-edges.test.mjs` reports all checks pass. If any
file fails, STOP and escalate — do not mark P6a landed over a red suite.

- [ ] **Step 2: Move the roadmap P6a status cell**

In `docs/superpowers/plans/2026-07-08-reasonable-3.0-roadmap.md`, find the **P6a** row in the P6
sub-series table (added when the roadmap was updated for the split) and change its **Status** cell
from `Planned` (or `Not started`) to:

```
Landed — merged (no bump, 3.2.0)
```

Change **only** the P6a cell. Leave P6b–P6e as they are. Do not add a version bump anywhere.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/plans/2026-07-08-reasonable-3.0-roadmap.md
git commit -m "docs(roadmap): P6a (planned-edge fold) landed — merged, no bump (3.2.0)"
```

- [ ] **Step 4: Report to the supervisor**

P6a is complete: `plannedNeedsEdges` shipped, tested, audited, documented; suite green; no version
bump; roadmap cell moved. The next sub-part is **P6b (the legibility law)** — its plan is written
next, one sub-part at a time (parent roadmap rule). Do not start P6b here.
