# Task T08: commit-record appends via the controller

## References
- Read: `../shared/interfaces.md` §2 (Family 3 + workOrder resolution) + §4, `../shared/conventions.md`
- Read: `lib/commit-record.mjs` (the custody hook; direct `appendJsonl` around line 83) and
  `test/commit-record.test.mjs`

## Dependencies
- Depends on: T03b. Depended on by: T14.

## Scope
**Files:**
- Modify: `lib/commit-record.mjs`
- Modify: `test/commit-record.test.mjs`

**BOUNDARY — nothing else.**

## Positive Constraints (DO)
- Replace the direct append of `{ type:'commit', workOrder, commit: sha, role, by:'commit-record' }`
  with `append(lane.effortRoot, { …same fields }, { regen: true })` from `./ledger.mjs`.
- PRESERVE the hook's fail-open posture: commit-record is a PostToolUse hook that must never
  disturb a session. An `{ ok:false }` append result is swallowed the same way the current code
  swallows its errors (the custody line is best-effort healing, not a gate).
- The `commit` type is Family-3 loose; the controller stamps `node` when the workOrder resolves
  in the tree, else the event lands node-less (root note in the fold) — both fine here.
- Update `test/commit-record.test.mjs` only where assertions touch the appended line's shape
  (it now carries `seq`/`ts` stamps; `by:'commit-record'` unchanged).

## Negative Constraints (DO NOT)
- Do NOT change the SHA-accounting detection logic or the hook wiring.
- Do NOT make append failures loud here (hook context — fail open).

## Implementation Steps
1. Surgical swap + import; `node --check lib/commit-record.mjs`.
2. `node test/commit-record.test.mjs` → green.
3. Full suite → no NEW failures.
4. Commit:
```bash
git add lib/commit-record.mjs test/commit-record.test.mjs
git commit -m "refactor(commit-record): custody line lands via ledger controller

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

## Acceptance Criteria
- [ ] `grep -n "appendJsonl" lib/commit-record.mjs` → no output
- [ ] Fail-open preserved (a bad append cannot exit non-zero from the hook path)
