# Task T02a: progress-map tests (RED)

**role: red** — you author the tests. You do NOT implement anything.

## References
- Read: `../shared/architecture.md`, `../shared/interfaces.md` §1–§3, `../shared/conventions.md`
- Read: `docs/superpowers/plans/knowledge/running-tests.md`
- Read: `lib/progress.mjs` `actionLine()` (lines ~126–145) — `formatText` ports it verbatim

## Dependencies
- Depends on: — (interfaces only; the tests will import modules that may not exist yet).
  Depended on by: T02b, T02c.

## Scope
**Files:**
- Create: `test/progress-map.test.mjs`

**BOUNDARY — you MUST NOT create or modify any other file. NOT `lib/progress-map.mjs`, NOT
`lib/progress-tree.mjs`.**

## Positive Constraints (DO)
- `foldEvents` cases are pure (events array in, tree out — no fs). `buildTree`/`writeMirror`
  cases use a temp effort dir: `mkdtempSync(join(tmpdir(), 'pmap-'))` containing `.reasonable/`
  with a hand-written `ledger.jsonl` (one JSON line per event, `seq` fields you assign),
  optional `journal.json` / `inbox.json`. Track dirs in `tmps`, clean up at the end.
- Case matrix (one `check` each, at minimum):
  1. **Reopen acceptance (the spec's end-to-end):** fold
     `node-planned(s1/WO-1)`, `node-dispatched(attempt:1)`, `report-started(§4 abs path)`,
     `report-finished(§4)`, `report-started(§5)`, `node-downgraded(attempt:1)`,
     `node-dispatched(attempt:2)`, `report-started(attempt-2 item)` →
     assert: `attempt-1` failed with detail `'lost-work crash'`; `…attempt-1/implementation/§4`
     still `done`; `…/§5` `failed`; `attempt-2` exists; WO node `active`.
  2. **Checkpoint continuation:** `node-dispatched(attempt:1)`, `node-checkpointed`,
     `node-dispatched(attempt:1)` again → ONE attempt child, WO active, no failed subtree.
  3. Every Family-1 type maps per the interfaces §2 table (planned→pending+title-label;
     checkpointed→pending+detail; completed→done; failed→failed+reason detail;
     canceled→canceled recursive; concluded→root done; approval-resolved→root note).
  4. `node-dispatched attempt>1` seals WITHOUT overwriting an existing crash detail
     (downgraded first, then dispatched → attempt-1 detail stays `'lost-work crash'`).
  5. Family-2 report types: started→inject+active(+statusTs from event ts); finished→done;
     canceled→canceled with reason detail. (Absolute `node` paths — the mapper never sees
     relative ones.)
  6. Family-3: an `enrichment` with `node` folds to ONE note on that node whose text matches
     the `actionLine` format (`enriched <component> <clauses>`); an event with NO `node` notes
     the root. At least 3 more Family-3 types spot-checked (`verdict`, `commit`, `dead-end`).
  7. Legacy/unknown: `action-started` and a made-up type fold to root/node notes with
     `<type> · <workOrder>` text; the tree gains NO structure from them.
  8. Out-of-order seq: shuffle the reopen fixture's array order (seq values intact) →
     identical tree to case 1 (fold sorts a copy; input array not mutated).
  9. `buildTree` on a temp effort reads the ledger and uses `journal.effort` as root label;
     without journal → `basename(root)`.
  10. `writeMirror` writes BOTH `progress.json` (parse it: has `counts` + the tree) and
      `progress.md`; markdown contains the header `# reasonable · <effort>`, the counts line,
      and the body; NO cost segment when `journal.cost` absent, present when set; inbox banner
      only when `inbox.json` has items.
  11. Fail-open: `writeMirror` on an effort with NO ledger file → still writes both mirrors
      (empty tree), does not throw.
- `EVENT_MAP` is exported — assert it has an entry for every Family-1/2/3 type and that
  `EVENT_MAP['report-started'](e)` returns ops (unit-level, no fold).

## Negative Constraints (DO NOT)
- Do NOT implement anything. Do NOT test controller stamping (that's T03a's job) — feed the
  mapper already-stamped events, as it will receive them in production.
- Do NOT byte-golden the whole markdown; assert line invariants.

## Implementation Steps

### Step 1: Write the test file
Repo test shape (`check`, `passed`, `tmps` cleanup). Import:
```js
import { EVENT_MAP, foldEvents, buildTree, writeMirror } from '../lib/progress-map.mjs';
import { findByPath } from '../lib/progress-tree.mjs';
```

### Step 2: Verify RED for the right reason
Run: `node test/progress-map.test.mjs`
Expected: `Cannot find module` for `lib/progress-map.mjs` OR `lib/progress-tree.mjs` — in
Wave 1 neither exists yet and either missing import is the right RED reason. Validate own
syntax first with `node --check test/progress-map.test.mjs`.

### Step 3: Commit
```bash
git add test/progress-map.test.mjs
git commit -m "test(progress-map): lock EVENT_MAP fold contract incl. reopen acceptance (RED)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

## Acceptance Criteria
- [ ] Reopen acceptance test present exactly as case 1
- [ ] Every matrix case a distinct `check`; syntax valid; fails only on missing module
- [ ] No file outside Scope touched
