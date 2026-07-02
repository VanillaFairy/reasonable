# Task T05: Retire action-report / action-events

## References
- Read: `../shared/architecture.md` (clean-break decision), `../shared/conventions.md`

## Dependencies
- Depends on: T03b (the replacement CLI exists). Depended on by: T04, T14.

## Scope
**Files:**
- Delete: `lib/action-report.mjs`, `lib/action-events.mjs`,
  `test/action-report.test.mjs`, `test/action-events.test.mjs`

**BOUNDARY — deletions only; you MUST NOT edit any surviving file.** (Lingering importers are
handled by T04/T11/T12 — you only VERIFY and report, below.)

## Implementation Steps

### Step 1: Inventory importers/referencers (verify, don't fix)
```bash
grep -rn "action-report\|action-events" lib/ hooks/ workflows/ agents/ skills/ docs/ test/ --include="*.mjs" --include="*.js" --include="*.md" --include="*.json" | grep -v "docs/superpowers"
```
Expected referencers at this point: `lib/progress.mjs` does NOT import them;
`lib/action-report.mjs` itself imports progress.mjs (dies with it); `agents/*.md`,
`workflows/*.js`, `docs/*` references are T11/T12/T10's surgical targets. If you find an
importer in `lib/` or `hooks/` OTHER than the two files being deleted, STOP and report.

### Step 2: Delete
```bash
git rm lib/action-report.mjs lib/action-events.mjs test/action-report.test.mjs test/action-events.test.mjs
```

### Step 3: Suite still runs
`for t in test/*.test.mjs; do node "$t" || echo "FAILED: $t"; done`
Expected: no NEW failures (note: `test/progress.test.mjs` still passes at this point — it tests
the old heuristics which are still present until T04).

### Step 4: Commit
```bash
git commit -m "refactor(ledger): retire action-report/action-events — subsumed by the ledger controller

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

## Acceptance Criteria
- [ ] Four files deleted via `git rm`, nothing else staged
- [ ] Referencer inventory reported in your final message (for the supervisor to cross-check T10–T12)
