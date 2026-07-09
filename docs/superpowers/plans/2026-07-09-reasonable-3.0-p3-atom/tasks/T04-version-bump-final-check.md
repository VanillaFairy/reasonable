# Task T04: Version bump + final check

**Role:** none.

## References
- Read: `CLAUDE.md` (the versioning rule: every landed fix/feature gets a SemVer bump, in the
  same turn, in every place the version string appears; "patch and minor bumps happen
  automatically, without asking")
- Read: `docs/superpowers/specs/2026-07-09-reasonable-3.0-p3-atom-design.md`'s "Version bump:
  minor, automatic" section (why this part, unlike Part 2, does not stop to ask)
- Read: `../knowledge/running-tests.md`

## Dependencies
- Depends on: T02c, T03 (all prior work must be landed and audited clean)
- Depended on by: — (last task in this plan)

## Scope

**Files:**
- Modify: `.claude-plugin/plugin.json`
- Modify: `README.md`

**BOUNDARY — you MUST NOT modify any files outside this list.**

## Positive Constraints (DO)
- Bump the version from `3.0.0` to `3.1.0` — **minor**, because this part is purely additive: one
  new file (`lib/atom.mjs`) and six new, optional ledger event types, zero behavior change to any
  existing caller — the same shape as Part 1's automatic `2.7.2 → 2.8.0` bump, not Part 2's
  breaking-grammar `2.8.1 → 3.0.0` cutover. Per `CLAUDE.md`: "minor — backward-compatible new
  feature... Patch and minor bumps happen automatically, without asking."
- Update **every** place the version string appears (per `CLAUDE.md`): the `version` field in
  `.claude-plugin/plugin.json`, the install-snippet version in `README.md`, and the footer
  `Version:` line in `README.md`.
- Run the entire test suite and confirm zero failures before committing.

## Negative Constraints (DO NOT)
- Do NOT bump to `3.1.0` if any audit task (T01c/T02c) reported an unresolved `critical` or
  `defect` finding — resolve those first (as follow-up tasks), then return to T04.
- Do NOT stop to ask the human major-vs-minor (unlike Part 2's T05) — this part carries no
  breaking-grammar risk to gate on; proceed automatically per `CLAUDE.md`'s rule.
- Do NOT modify any file outside the Scope section.

## Implementation Steps

### Step 1: Bump `.claude-plugin/plugin.json`

Change:
```json
  "version": "3.0.0",
```
to:
```json
  "version": "3.1.0",
```

### Step 2: Bump `README.md`'s install snippet

Change:
```
{ "name": "reasonable", "source": "./reasonable", "version": "3.0.0" }
```
to:
```
{ "name": "reasonable", "source": "./reasonable", "version": "3.1.0" }
```

### Step 3: Bump `README.md`'s footer

Change:
```
*Design source of truth: `docs/DESIGN.md`. Normative vocabulary: `docs/glossary.md`. Version: v3.0.0.*
```
to:
```
*Design source of truth: `docs/DESIGN.md`. Normative vocabulary: `docs/glossary.md`. Version: v3.1.0.*
```

### Step 4: Run the full test suite

Run (see `../knowledge/running-tests.md`):

```bash
for t in test/*.test.mjs; do node "$t"; done
```

Expected: every file prints `all <N> checks pass. ✓` — no `FAIL` line anywhere in the output.
This is the whole suite, not just this plan's new files — confirming this plan introduced zero
regressions anywhere else in the engine.

### Step 5: Commit

```bash
git add .claude-plugin/plugin.json README.md
git commit -m "chore(release): 3.1.0 — the atom: charter/delta split, lifecycle, cohesion (reasonable 3.0 part 3)"
```

## Acceptance Criteria
- [ ] `.claude-plugin/plugin.json`'s version is `3.1.0`
- [ ] Both `README.md` version strings are `3.1.0`
- [ ] The full test suite (`for t in test/*.test.mjs; do node "$t"; done`) shows zero `FAIL` lines
- [ ] No file outside Scope was modified
