# Task T04: Version bump + final check

**Role:** none.

## References
- Read: `CLAUDE.md` (the versioning rule: every landed fix/feature gets a SemVer bump, in the same
  turn, in every place the version string appears; "patch and minor bumps happen automatically,
  without asking")
- Read: `docs/superpowers/specs/2026-07-09-reasonable-3.0-p4-graph-design.md`'s "Version bump:
  minor, automatic" section (why this part, like Parts 1 and 3, does not stop to ask)
- Read: `../knowledge/running-tests.md`

## Dependencies
- Depends on: T02c, T03 (all prior work must be landed and audited clean)
- Depended on by: — (last task in this plan)

## Scope

**Files:**
- Modify: `.claude-plugin/plugin.json`
- Modify: `README.md`
- Modify: `docs/superpowers/plans/2026-07-08-reasonable-3.0-roadmap.md` (Part 4's status cell only)

**BOUNDARY — you MUST NOT modify any files outside this list.**

## Positive Constraints (DO)
- Bump the version from `3.1.0` to `3.2.0` — **minor**, because this part is purely additive: one
  new file (`lib/graph.mjs`) plus a strictly backward-compatible export addition to `lib/atom.mjs`
  (a rename-to-export plus one new function, zero change to any existing caller's behavior) — the
  same shape as Part 1's and Part 3's automatic bumps, not Part 2's breaking-grammar cutover. Per
  `CLAUDE.md`: "minor — backward-compatible new feature... Patch and minor bumps happen
  automatically, without asking."
- Update **every** place the version string appears (per `CLAUDE.md`): the `version` field in
  `.claude-plugin/plugin.json`, the install-snippet version in `README.md`, and the footer
  `Version:` line in `README.md`.
- Update the roadmap's Part 4 status cell from `Design drafted — plan not yet written` to
  `Landed — v3.2.0` — per the roadmap's own "keeping the status column current" rule, this happens
  in the same commit as the release bump, never as a follow-up.
- Run the entire test suite and confirm zero failures before committing.

## Negative Constraints (DO NOT)
- Do NOT bump to `3.2.0` if any audit task (T01c/T02c) reported an unresolved `critical` or
  `defect` finding — resolve those first (as follow-up tasks), then return to T04.
- Do NOT stop to ask the human major-vs-minor — this part carries no breaking-grammar risk to gate
  on; proceed automatically per `CLAUDE.md`'s rule.
- Do NOT modify any file outside the Scope section, and do NOT touch any other row of the roadmap
  table besides Part 4's status cell.

## Implementation Steps

### Step 1: Bump `.claude-plugin/plugin.json`

Change:
```json
  "version": "3.1.0",
```
to:
```json
  "version": "3.2.0",
```

### Step 2: Bump `README.md`'s install snippet

Change:
```
{ "name": "reasonable", "source": "./reasonable", "version": "3.1.0" }
```
to:
```
{ "name": "reasonable", "source": "./reasonable", "version": "3.2.0" }
```

### Step 3: Bump `README.md`'s footer

Change:
```
*Design source of truth: `docs/DESIGN.md`. Normative vocabulary: `docs/glossary.md`. Version: v3.1.0.*
```
to:
```
*Design source of truth: `docs/DESIGN.md`. Normative vocabulary: `docs/glossary.md`. Version: v3.2.0.*
```

### Step 4: Update the roadmap's Part 4 status cell

In `docs/superpowers/plans/2026-07-08-reasonable-3.0-roadmap.md`'s series table, find this exact
row:

```
| P4 | The graph engine — containment-tree fold, dependency-edge computation (`needs`/`excludes`/`serves`/`informs`), edge lifting, as-lived vs. current projections | `lib/graph.mjs` (new) | §2, §2.1–§2.4 | P1 (folds effects), P3 (folds atoms) | Design drafted — plan not yet written |
```

Replace it with:

```
| P4 | The graph engine — containment-tree fold, dependency-edge computation (`needs`/`excludes`/`serves`/`informs`), edge lifting, as-lived vs. current projections | `lib/graph.mjs` (new) | §2, §2.1–§2.4 | P1 (folds effects), P3 (folds atoms) | Landed — v3.2.0 |
```

Do not touch any other row.

### Step 5: Run the full test suite

Run (see `../knowledge/running-tests.md`):

```bash
for t in test/*.test.mjs; do node "$t"; done
```

Expected: every file prints `all <N> checks pass. ✓` — no `FAIL` line anywhere in the output. This
is the whole suite, not just this plan's new files — confirming this plan introduced zero
regressions anywhere else in the engine.

### Step 6: Commit

```bash
git add .claude-plugin/plugin.json README.md docs/superpowers/plans/2026-07-08-reasonable-3.0-roadmap.md
git commit -m "chore(release): 3.2.0 — the graph engine: containment, edges, lifting, projections (reasonable 3.0 part 4)"
```

## Acceptance Criteria
- [ ] `.claude-plugin/plugin.json`'s version is `3.2.0`
- [ ] Both `README.md` version strings are `3.2.0`
- [ ] The roadmap's Part 4 status cell reads `Landed — v3.2.0`, no other row changed
- [ ] The full test suite (`for t in test/*.test.mjs; do node "$t"; done`) shows zero `FAIL` lines
- [ ] No file outside Scope was modified
