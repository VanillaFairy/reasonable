# Task T14: Version 2.0.0 + final full-suite check

## References
- Read: `../shared/conventions.md`, `.claude-plugin/plugin.json`
- Read: `docs/superpowers/plans/knowledge/running-tests.md`

## Dependencies
- Depends on: ALL other tasks (final wave). Depended on by: —.

## Scope
**Files:**
- Modify: `.claude-plugin/plugin.json` (the `version` field ONLY)

⚠ This file carries UNRELATED uncommitted modifications (plan.md Pre-flight). Edit the version
field surgically; STOP if Pre-flight is unresolved.

## Implementation Steps

### Step 1: Full suite
`for t in test/*.test.mjs; do node "$t" || echo "FAILED: $t"; done`
Expected: every file green. Any failure → STOP, report to supervisor (do not fix here).

### Step 2: Cross-cutting greps (release hygiene)
```bash
grep -rn "action-report\|action-events" lib/ hooks/ workflows/ agents/ skills/ --include="*.mjs" --include="*.js" --include="*.md"
grep -rn "progress-live" lib/ hooks/ workflows/ agents/ skills/ docs/artifacts.md
```
Expected: no output. Any hit → STOP, report which task left it.

### Step 3: Version
In `.claude-plugin/plugin.json`, set `"version"` to `"2.0.0"` (major — ratified by the user in
the design discussion: ledger vocabulary, artifact shapes, and reporting norms all changed).

### Step 4: Commit
```bash
git add .claude-plugin/plugin.json
git commit -m "chore(release): 2.0.0 — unified execution tree plan 1 (organs) landed

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

### Step 5: Report
Final message: suite tally, grep results, version confirmed, plus anything the supervisor
should carry into Plan 2 (execution tree) — e.g. audit findings left open.

## Acceptance Criteria
- [ ] All tests green; hygiene greps clean; version 2.0.0 committed
