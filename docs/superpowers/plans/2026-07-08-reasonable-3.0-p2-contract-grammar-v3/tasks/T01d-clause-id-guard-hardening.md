# Task T01d: Harden `allocatedClauseIds`'s type guard against a mutation (gap fix from T01c audit)

**Role:** `red`-flavored test hardening — the implementation is already correct; this task closes
a test-coverage gap the T01c audit found via mutation testing. No production code changes.

## Why this task exists

T01c's audit mutated `lib/clause-id.mjs:86`'s filter from
`if (e.type !== 'clause-allocated' || typeof e.component !== 'string') continue;` to
`if (typeof e.component !== 'string') continue;` (dropping the `type` check) and ran the existing
`test/clause-id.test.mjs` unmodified against the mutant — **all 22 checks still passed.** The one
test aimed at this guard (`'allocatedClauseIds ignores non-clause-allocated ledger events'`) only
appends a `{type:'verdict'}` event, which has no `component` field at all, so the surviving
`typeof e.component !== 'string'` half of the guard alone was already enough to make that specific
test pass — it never exercised the `e.type !== 'clause-allocated'` half. The real, shipped code is
correct (confirmed by the audit's own live fold-forging test); only the test suite has the gap.

## References
- Read: `../shared/conventions.md` (the `check()` harness convention)
- Read: `lib/clause-id.mjs`'s `allocatedClauseIds` (the function this hardens — do not modify it)
- Read: `test/clause-id.test.mjs`'s existing `'allocatedClauseIds ignores non-clause-allocated
  ledger events'` check (the one this task adds a sibling to, not replaces)

## Dependencies
- Depends on: T01c (the audit that found this gap)
- Depended on by: T05 (this must land before the final check)

## Scope

**Files:**
- Modify: `test/clause-id.test.mjs` (append one new `check()` only)

**BOUNDARY — you MUST NOT modify `lib/clause-id.mjs` or any other file.** The implementation is
already correct; do not touch it. Do not modify any existing `check()` in `test/clause-id.test.mjs`
— append a new one only.

## Positive Constraints (DO)
- Add exactly one new `check()` to the `allocatedClauseIds` section of `test/clause-id.test.mjs`,
  immediately after the existing `'allocatedClauseIds ignores non-clause-allocated ledger events'`
  check, proving the `type` half of the guard specifically: append a **same-component-carrying**
  event of a *different* type (e.g. `{type: 'enrichment', component: 'lexer'}`) directly via
  `append()`, then call `allocateClauseId(root, 'ast')`, then assert `allocatedClauseIds(root)` has
  no `lexer` key (only `ast`) — this is the exact scenario the audit named, and it would fail
  against the mutant that dropped the `type` check (since `lexer` would wrongly appear, formatted
  from whatever seq the forged `enrichment` event happened to get).

## Negative Constraints (DO NOT)
- Do NOT modify `lib/clause-id.mjs` — the implementation is already correct; this is a test-only
  hardening task.
- Do NOT modify any other existing `check()` in the file.
- Do NOT modify any file outside Scope.

## Implementation Steps

### Step 1: Read the existing test file and the audit finding above

### Step 2: Append the new check

Add, immediately after the existing `'allocatedClauseIds ignores non-clause-allocated ledger
events'` check in `test/clause-id.test.mjs`:

```js
check('allocatedClauseIds does not fold in a same-component event of a DIFFERENT type (mutation-guard: T01c audit)', () => {
  const root = newEffort();
  append(root, { type: 'enrichment', component: 'lexer' }); // carries `component` but wrong `type`
  allocateClauseId(root, 'ast');
  const mirror = allocatedClauseIds(root);
  assert.ok(!('lexer' in mirror), 'an enrichment event must never be folded in as a clause-allocated id, even though it shares the component field');
  assert.strictEqual(Object.keys(mirror).length, 1);
});
```

### Step 3: Run the test to confirm it passes against the real (already-correct) implementation

Run: `node test/clause-id.test.mjs`

Expected: `clause-id: all 23 checks pass. ✓` (one more than before — 22 → 23), zero `FAIL` lines.
This is expected to pass immediately since `lib/clause-id.mjs` was already correct; this task closes
a proof gap, not a behavior gap.

### Step 4: Commit

```bash
git add test/clause-id.test.mjs
git commit -m "test(clause-id): prove allocatedClauseIds' type guard against a same-component, different-type event (T01c audit gap)"
```

## Acceptance Criteria
- [ ] `node test/clause-id.test.mjs` passes with 23/23 checks (one more than before)
- [ ] `lib/clause-id.mjs` was NOT modified
- [ ] No existing `check()` was modified — only one new one appended
- [ ] No file outside Scope was modified
