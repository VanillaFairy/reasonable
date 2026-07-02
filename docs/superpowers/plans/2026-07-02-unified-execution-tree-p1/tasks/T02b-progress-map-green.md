# Task T02b: progress-map implementation (GREEN)

**role: green** — implement against locked tests. You write NO tests.

## References
- Read: `../shared/architecture.md`, `../shared/interfaces.md` §1–§3, `../shared/conventions.md`
- Read: `test/progress-map.test.mjs` (locked — READ-ONLY)
- Read: `lib/progress.mjs` (port `actionLine` switch → `formatText`; port the header/cost-line
  helpers `fmtTokens`/`costLine`/`humanTs` style; do NOT port replay/enrichment/ts-suppression)
- Read: `lib/effort.mjs` exports (readJson, readJsonl, writeJson, basename, join, existsSync)

## Dependencies
- Depends on: T02a, T01b. Depended on by: T03b, T04, T02c.

## Scope
**Files:**
- Create: `lib/progress-map.mjs`

**BOUNDARY — you MUST NOT modify any other file. `test/progress-map.test.mjs` is READ-ONLY —
a wrong test is escalated, never edited.**

## Positive Constraints (DO)
- Exports exactly per interfaces §3: `EVENT_MAP`, `foldEvents(events, rootLabel)`,
  `buildTree(root)`, `writeMirror(root)`.
- `EVENT_MAP`: one entry per Family-1/2/3 type, each a pure `(event) => op[]` per the §2 table.
  Unknown types are handled by the FOLD's fallback (not table entries): note per §2.
- `foldEvents`: copy, sort by `seq` (0 default), fold each event's ops through
  `apply` from `progress-tree.mjs`. Wrap each event's application so one bad historical event
  degrades to a root note instead of killing the fold (the fold is total over history).
- `writeMirror`: compose `progress.md` per the §3 layout; `progress.json` = the tree plus
  `counts` from `countByStatus`. Fail-open on absent ledger. Cost line from `journal.cost`,
  inbox banner from `inbox.json` — the two documented exceptions; nothing else off-ledger.
- Top-of-file comment: this is the read-side fold (D19 rework), events are facts / this table
  is interpretation, cite the spec path.

## Negative Constraints (DO NOT)
- Do NOT import `lib/ledger.mjs` (import direction is ledger → map, never back).
- Do NOT port `replayActions` / `sectionsFromEnrichment` / `enrichmentChildren` / the
  ts-suppression scan in ANY form. No label matching, no epoch comparison, no heuristics.
- Do NOT let any Family-3 or unknown event change a status.

## Implementation Steps

### Step 1: Read the locked tests end to end.

### Step 2: Implement `lib/progress-map.mjs` per interfaces §3.

### Step 3: Run locked tests
`node test/progress-map.test.mjs` → all green.

### Step 4: Full suite sanity
`for t in test/*.test.mjs; do node "$t" || echo "FAILED: $t"; done` → no NEW failures.

### Step 5: Commit
```bash
git add lib/progress-map.mjs
git commit -m "feat(progress-map): read-side EVENT_MAP fold — ledger to progress tree, mirrors composed here

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

## Acceptance Criteria
- [ ] Locked tests green, test file unmodified (`git diff --stat test/progress-map.test.mjs` empty)
- [ ] `grep -n "ledger.mjs" lib/progress-map.mjs` → no output
- [ ] No heuristic survivors: `grep -nE "replayActions|sectionsFromEnrichment|enrichmentChildren" lib/progress-map.mjs` → no output
