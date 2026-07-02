# Task T07: conclude appends via the controller

## References
- Read: `../shared/interfaces.md` §2 + §4, `../shared/conventions.md`
- Read: `lib/conclude.mjs` (current direct `appendJsonl` of `{type:'concluded', effort}`,
  around line 46) and `test/conclude.test.mjs`

## Dependencies
- Depends on: T03b. Depended on by: T14.

## Scope
**Files:**
- Modify: `lib/conclude.mjs`
- Modify: `test/conclude.test.mjs`

**BOUNDARY — nothing else.**

## Positive Constraints (DO)
- Replace the direct `appendJsonl(join(dotDir,'ledger.jsonl'), {type:'concluded', effort})` with
  `append(root, { type: 'concluded', effort })` from `./ledger.mjs` (regen default ON — the
  mirror should show the effort root `done` immediately). A `{ ok:false }` result here IS fatal
  for conclude (it's the whole point of the command) — surface the error as conclude surfaces
  other errors.
- Extend `test/conclude.test.mjs`: after conclude, assert the ledger's `concluded` line carries
  stamped `seq`/`ts`, and `.reasonable/progress.json` root status is `done`.

## Negative Constraints (DO NOT)
- Do NOT change conclude's other behavior (config load, git interactions, messages).

## Implementation Steps
1. Surgical edit + import swap; `node --check lib/conclude.mjs`.
2. Update test; `node test/conclude.test.mjs` → green.
3. Full suite → no NEW failures.
4. Commit:
```bash
git add lib/conclude.mjs test/conclude.test.mjs
git commit -m "refactor(conclude): append concluded via ledger controller — root folds to done

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

## Acceptance Criteria
- [ ] `grep -n "appendJsonl" lib/conclude.mjs` → no output
- [ ] progress.json root `done` after conclude (tested)
