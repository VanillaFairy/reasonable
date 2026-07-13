# T06 — Final check (no version bump) + roll up the whole Part-6 roadmap row

**role:** — (final)
**Depends on:** T02, T03c, T04c, T05
**Owns (stage only these):** `docs/superpowers/plans/2026-07-08-reasonable-3.0-roadmap.md`

> **No version bump.** Per the roadmap's 2026-07-09 versioning decision, P5–P8 (P6a–P6e included) land on
> the shared refactoring line at `3.2.0` and bump **once at the end of the whole generation** (after
> P7/P8). **P6e is P6's tail, not the generation's tail — it gets no bump.** Do **not** touch
> `.claude-plugin/plugin.json` or the README. This task's edits are **status-cell fact updates**, not a
> bump.

> **P6e is the FINAL P6 sub-part.** When it merges, the whole **topology stage (Part 6)** is done — so
> this task updates **both** the P6e sub-row **and** the top-level Part-6 row (+ the `## Part 6` heading),
> because "all of P6 has landed" becomes true exactly in this commit (the roadmap's rule: "the status cell
> updates in the same commit that changes the underlying fact"). See the plan's versioning note.

- [ ] **Step 1: Run the entire suite green**

Run: `for t in test/*.test.mjs; do node "$t"; done`
Expected: no `FAIL` line anywhere; `test/topology-layout.test.mjs` and `test/topology-view.test.mjs` both
report all checks pass. This must be green with **zero regressions across every landed sub-part** (72+
files — P1–P5, P6a `test/graph-planned-edges.test.mjs`, P6b `test/legibility.test.mjs`, P6c
`test/ceremony-classify.test.mjs`/`test/ceremony-phase.test.mjs`, P6d
`test/goals-loader.test.mjs`/`test/policy-loader.test.mjs` included). If any file fails, STOP and
escalate — do not mark P6e landed over a red suite.

- [ ] **Step 2: Move the roadmap P6e sub-row cell to Landed**

In `docs/superpowers/plans/2026-07-08-reasonable-3.0-roadmap.md`, find the **P6e** row in the P6
sub-series table (the row beginning `| **P6e** | The **topologist role** + …`, whose **Depends on** cell
is `P6a–P6d`) and change its **Status** cell from `Planned` to:

```
Landed — merged (no bump, 3.2.0)
```

- [ ] **Step 3: Roll up the top-level Part-6 series row (all sub-parts now landed)**

In the **top-level series table** (the one with columns `Part | Builds | New/changed files | DESIGN-3.0
sections | Depends on | Status`), find the **P6** row and change its **Status** cell from:

```
Split → P6a–P6e (P6a planned)
```

to:

```
Split → P6a–P6e — all landed (merged, no bump, 3.2.0)
```

(The `(P6a planned)` text was stale in-file — a pre-existing annotation from when P6a was the planned
sub-part; this roll-up replaces it with the terminal state, which is correct exactly now that the last
sub-part has landed.)

- [ ] **Step 4: Roll up the `## Part 6` heading**

Find the section heading:

```
## Part 6 — split into P6a–P6e; P6a planned
```

and change it to:

```
## Part 6 — split into P6a–P6e; all landed (merged, no bump, 3.2.0)
```

Change **only** these three things (P6e sub-row, top-level P6 status cell, the `## Part 6` heading). Leave
the P6a/P6b/P6c/P6d sub-rows as they are (already `Landed — merged (no bump, 3.2.0)`). Do **not** touch
P7/P8. Do not add a version bump anywhere.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/plans/2026-07-08-reasonable-3.0-roadmap.md
git commit -m "docs(roadmap): P6e (topologist + topology.html) landed — Part 6 complete (no bump, 3.2.0)"
```

- [ ] **Step 6: Report to the supervisor**

P6e is complete: `agents/topologist.md` (the route-planner reborn — read-only `Read, Grep, Glob`
allowlist, proposes the five §5.1 outputs, cannot write `goals.json`/`policy.json` by capability) and
`lib/topology-view.mjs` (`layoutTopology` + `renderTopologyHtml` — self-contained layered-DAG viewer,
component/cone/diff views, no CDN/no npm) shipped, tested, audited, documented; suite green with zero
regressions; **no version bump**; the P6e sub-row, the top-level P6 row, and the `## Part 6` heading all
rolled up to landed. **This closes the whole topology stage (Part 6).** The next roadmap work is **P7 (the
frontier loop + gates + 2.x→3.0 migration)**, which *wires* everything P6a–P6e built — the topologist's
dispatch into the phase flow, the `goals.json`/`policy.json` write path, the route retirement, the
projection rebuild, and the live `topology.html` producer. Do **not** start P7 here — it is the next plan,
written one at a time per the parent roadmap rule.
