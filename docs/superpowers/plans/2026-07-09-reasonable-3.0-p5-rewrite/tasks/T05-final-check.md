# Task T05: Final check — full suite + roadmap status (NO version bump)

**Role:** direct (no triad). The closing task. **This part does NOT bump the version** — per the
roadmap's 2026-07-09 versioning decision, P5–P8 land on the shared refactoring line at `3.2.0` and
bump once at the end of the generation. There is no `chore(release)` commit and no README/`plugin.json`
edit here.

## References
- Read: `../../2026-07-08-reasonable-3.0-roadmap.md` — the "Versioning — the remaining parts do not
  bump" section and the "Keeping the status column current" rule (P5–P8 → `Landed — merged (no bump,
  3.2.0)`)
- Read: `../knowledge/running-tests.md`

## Dependencies
- Depends on: T03c (last audit clean), T04 (docs landed)
- Depended on by: — (final)

## Scope
**Files:**
- Modify: `docs/superpowers/plans/2026-07-08-reasonable-3.0-roadmap.md` (the P5 status cell + the
  "Part 5" section heading only)

**BOUNDARY — you MUST NOT modify any files outside this list. In particular, do NOT touch
`.claude-plugin/plugin.json` or `README.md` — no version bump this generation.**

## Implementation Steps

### Step 1: Run the entire test suite

```bash
for t in test/*.test.mjs; do node "$t"; done
```

Confirm zero `FAIL` lines across every file — the four new `test/rewrite-*.test.mjs` files and every
pre-existing test (nothing regressed: Part 5 only imported from `effects`/`atom`/`graph`, edited
none of them).

### Step 2: Verify the version was NOT bumped

Confirm `.claude-plugin/plugin.json` still reads `"version": "3.2.0"`, and the README install snippet
and footer still say `3.2.0`. If any of them changed, revert that change — the bump is deferred to
the end of the P5–P8 generation (a single major release, a human call at that point).

### Step 3: Move the roadmap P5 status cell to "Landed — merged (no bump, 3.2.0)"

In `docs/superpowers/plans/2026-07-08-reasonable-3.0-roadmap.md`, in the series table, change the P5
row's Status cell from `Planned` to `Landed — merged (no bump, 3.2.0)`. Also update the "Part 5"
section heading from `## Part 5 — design drafted, not yet planned` (or `— planned, not yet built`) to
`## Part 5 — landed (merged, no bump, 3.2.0)`, and add a one-line link to the plan:
`**Plan:** [\`2026-07-09-reasonable-3.0-p5-rewrite/plan.md\`](2026-07-09-reasonable-3.0-p5-rewrite/plan.md)`.

### Step 4: Commit

```bash
git add docs/superpowers/plans/2026-07-08-reasonable-3.0-roadmap.md
git commit -m "docs(roadmap): P5 (rewrite engine) landed — merged, no bump (3.2.0)"
```

## Acceptance Criteria
- [ ] Every `test/*.test.mjs` passes — zero `FAIL` lines across the whole suite
- [ ] `.claude-plugin/plugin.json`, the README install snippet, and the README footer all still say
      `3.2.0` — **no version bump**
- [ ] The roadmap P5 status cell reads `Landed — merged (no bump, 3.2.0)` and the Part 5 section links
      the plan
- [ ] No file outside Scope modified
