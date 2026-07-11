# Task T12: Final check — full suite + roadmap status (NO version bump)

**Role:** direct (no triad). The closing task. **This part does NOT bump the version** — per the
roadmap's 2026-07-09 versioning decision, P5–P8 land on the shared refactoring line at `3.2.0` and
bump once (major) at the end of the generation. There is no `chore(release)` commit and no
README/`plugin.json` edit here.

## References
- Read: `../../2026-07-08-reasonable-3.0-roadmap.md` — the "Versioning" section and the "Keeping the
  status column current" rule (P5–P8 → `Landed — merged (no bump, 3.2.0)`)
- Read: `../knowledge/running-tests.md`
- Read: `../shared/architecture.md` — confirm every phase (A–F) landed as designed before closing

## Dependencies
- Depends on: T11 (docs landed)
- Depended on by: — (final)

## Scope
**Files:**
- Modify: `docs/superpowers/plans/2026-07-08-reasonable-3.0-roadmap.md` (the P7 status cell + the
  "Part 7" section heading only)

**BOUNDARY — you MUST NOT modify any files outside this list. In particular, do NOT touch
`.claude-plugin/plugin.json` or `README.md` — no version bump this generation.**

## Implementation Steps

### Step 1: Run the entire test suite

```bash
for t in test/*.test.mjs; do node "$t"; done
```

Confirm zero `FAIL` lines across every file — every new Part 7 test (`frontier-gate`,
`frontier-ready-pack`, `footprint-disjoint`, `frontier-roles`, `ledger-atom-verdict`,
`ledger-two-phase`, `next-action-cones`, `reconcile-cones-projection`, `frontier-wave-workflow`,
`progress-map-atoms`) and every pre-existing test that survived the migration (route.test.mjs and the
five `vertical-slice-runner-*` tests are gone by design — confirm their ABSENCE, not their presence).

### Step 2: Confirm the deletions actually happened

```bash
ls lib/route.mjs 2>&1 | grep -q "No such file" && echo "route.mjs: gone, good" || echo "route.mjs STILL EXISTS — STOP"
ls workflows/vertical-slice-runner.workflow.js 2>&1 | grep -q "No such file" && echo "vertical-slice-runner: gone, good" || echo "STILL EXISTS — STOP"
grep -rn "readRoute\|from '\./route\.mjs'\|from '\.\./lib/route\.mjs'" lib/ workflows/ test/ 2>/dev/null
```

The last command must return **nothing** (no live import of the retired module anywhere).

### Step 3: Verify the version was NOT bumped

Confirm `.claude-plugin/plugin.json` still reads `"version": "3.2.0"`, and the README install snippet
and footer still say `3.2.0`. If any of them changed, revert that change — the bump is deferred to the
end of the P5–P8 generation (a single major release, a human call at that point).

### Step 4: Move the roadmap P7 status cell to "Landed — merged (no bump, 3.2.0)"

In `docs/superpowers/plans/2026-07-08-reasonable-3.0-roadmap.md`, in the series table, change the P7
row's Status cell from `Planned` to `Landed — merged (no bump, 3.2.0)`. Also update the `## Part 7 —
planned` section heading to `## Part 7 — landed (merged, no bump, 3.2.0)`.

### Step 5: Commit

```bash
git add docs/superpowers/plans/2026-07-08-reasonable-3.0-roadmap.md
git commit -m "docs(roadmap): P7 (frontier loop + gates) landed — merged, no bump (3.2.0)" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

## Acceptance Criteria
- [ ] Every `test/*.test.mjs` passes — zero `FAIL` lines across the whole suite
- [ ] `lib/route.mjs`, `test/route.test.mjs`, `workflows/vertical-slice-runner.workflow.js`, and its
      five dedicated tests are all confirmed absent; nothing imports the retired module
- [ ] `.claude-plugin/plugin.json`, the README install snippet, and the README footer all still say
      `3.2.0` — **no version bump**
- [ ] The roadmap P7 status cell reads `Landed — merged (no bump, 3.2.0)` and the Part 7 section
      heading matches
- [ ] No file outside Scope modified
