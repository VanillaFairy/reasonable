# Task T03: Consumer regression — footprint.mjs / citation-resolve.mjs against v3 grammar

**Role:** none (direct task, not a red/green/audit triad — this proves EXISTING, already-decided
behavior keeps working under the new grammar; it is not new behavior needing adversarial
authorship).

## References
- Read: `../shared/architecture.md` (the "Consumer impact — verified, not assumed" section)
- Read: `lib/footprint.mjs` in full — confirm for yourself it only ever reads `.component` off a
  citation entry (via `citationClosure`), never a `§` literal, never any assumption about clause-id
  shape
- Read: `lib/citation-resolve.mjs` in full — confirm for yourself it only ever does opaque
  `Set.has()` checks (via `danglingCitations`), same as above

## Dependencies
- Depends on: T02b (the rewritten `lib/contract.mjs`)
- Depended on by: T05

## Scope

**Files:**
- Create: `test/contract-consumers.test.mjs`
- Modify: `lib/footprint.mjs` — **only if** Step 2 below reveals a real, necessary fix
- Modify: `lib/citation-resolve.mjs` — **only if** Step 2 below reveals a real, necessary fix

**BOUNDARY — you MUST NOT modify any files outside this list.**

## Positive Constraints (DO)
- Test `citationClosure()` and `danglingCitations()` directly (imported from `../lib/contract.mjs`
  — these are the exact functions `lib/footprint.mjs` and `lib/citation-resolve.mjs` each import
  and delegate to) against contract fixtures written in the v3 grammar.
- Cover: a multi-component citation chain closes transitively (the same property
  `citationClosure` already had); a citation to a real clause resolves clean; a citation to a
  nonexistent clause id is still caught as `unknown clause`; a citation to a nonexistent component
  is still caught as `unknown component`.
- If (and only if) a check in Step 2 actually fails, read the failure, find the real shape
  assumption in whichever consumer file has it, and fix it minimally — then explain in your final
  report exactly what was wrong and why the fix is narrow.

## Negative Constraints (DO NOT)
- Do NOT modify `lib/footprint.mjs` or `lib/citation-resolve.mjs` if the new test passes without
  any change — this task's expectation (backed by reading both files) is that neither needs a
  source edit. Do not "improve" either file speculatively.
- Do NOT modify `lib/contract.mjs`, `test/contract.test.mjs`, or `test/contract-v3-grammar.test.mjs`.
- Do NOT modify any file outside the Scope section.

## Implementation Steps

### Step 1: Write the regression test

```js
// contract-consumers.test.mjs — regression coverage for lib/contract.mjs's two downstream
// consumers, lib/footprint.mjs (imports citationClosure) and lib/citation-resolve.mjs (imports
// danglingCitations), against the v3 grammar (reasonable 3.0 Part 2). Neither consumer had a
// dedicated test before this plan — both are exercised here at the function level (the exact
// functions each CLI script delegates to), closing a real pre-existing coverage gap on the two
// files this rewrite named as blast radius.

import assert from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { citationClosure, danglingCitations } from '../lib/contract.mjs';

const tmps = [];
function newEffort() {
  const root = mkdtempSync(join(tmpdir(), 'contract-consumers-test-'));
  tmps.push(root);
  mkdirSync(join(root, '.reasonable', 'contracts'), { recursive: true });
  return root;
}
function writeContract(root, component, text) {
  writeFileSync(join(root, '.reasonable', 'contracts', `${component}.md`), text);
}

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.stack || e.message}`); process.exitCode = 1; }
}

// A three-component citation chain under v3 grammar: evaluator cites lexer, lexer cites ast.
function setUpChain(root) {
  writeContract(root, 'ast', `---
component: ast
---

## Clauses

### ast#c1 Builds a literal node
Body.
`);
  writeContract(root, 'lexer', `---
component: lexer
---

## Clauses

### lexer#c1 Tokenizes an integer literal
Body.
- Cites: ast#c1
`);
  writeContract(root, 'evaluator', `---
component: evaluator
---

## Clauses

### evaluator#c1 Evaluates an integer literal
Body.
- Cites: lexer#c1
`);
}

check('citationClosure (the function lib/footprint.mjs imports) transitively closes over v3 per-clause citations', () => {
  const root = newEffort();
  setUpChain(root);
  const closure = citationClosure(root, ['evaluator']);
  assert.deepStrictEqual(
    [...closure].sort(), ['ast', 'evaluator', 'lexer'],
    'the closure must reach ast transitively through lexer, exactly as it did under file-level citations',
  );
});

check('danglingCitations (the function lib/citation-resolve.mjs imports) resolves a real v3 citation as clean', () => {
  const root = newEffort();
  setUpChain(root);
  assert.deepStrictEqual(danglingCitations(root), [], 'every citation in the chain resolves to a real clause');
});

check('danglingCitations still catches a citation to a nonexistent clause id under v3 shape', () => {
  const root = newEffort();
  writeContract(root, 'ast', `---
component: ast
---

## Clauses

### ast#c1 Builds a literal node
Body.
`);
  writeContract(root, 'lexer', `---
component: lexer
---

## Clauses

### lexer#c1 Tokenizes an integer literal
Body.
- Cites: ast#c99
`);
  const dangling = danglingCitations(root);
  assert.strictEqual(dangling.length, 1);
  assert.strictEqual(dangling[0].reason, 'unknown clause');
  assert.strictEqual(dangling[0].clause, 'ast#c99');
});

check('danglingCitations still catches a citation to a nonexistent component under v3 shape', () => {
  const root = newEffort();
  writeContract(root, 'lexer', `---
component: lexer
---

## Clauses

### lexer#c1 Tokenizes an integer literal
Body.
- Cites: nonexistent#c1
`);
  const dangling = danglingCitations(root);
  assert.strictEqual(dangling.length, 1);
  assert.strictEqual(dangling[0].reason, 'unknown component');
});

for (const d of tmps) {
  try { rmSync(d, { recursive: true, force: true }); }
  catch { /* best-effort cleanup */ }
}

if (process.exitCode) console.error(`\ncontract-consumers: FAILURES above (${passed} passed).`);
else console.log(`\ncontract-consumers: all ${passed} checks pass. ✓`);
```

### Step 2: Run it

Run: `node test/contract-consumers.test.mjs`

**Expected: it passes with zero failures, with NO changes to `lib/footprint.mjs` or
`lib/citation-resolve.mjs`.** This is the expected outcome based on reading both files (neither
contains a `§` literal or a clause-id shape assumption — see References above).

**If it fails:** this means one of the two files DOES have an undocumented shape assumption this
plan's analysis missed. Read the actual failure, locate the real assumption in whichever file
broke, and fix it with the smallest possible change that restores the property — do not weaken the
test to match a broken consumer. Document exactly what you found and fixed in your final report;
this is a real, reportable finding, not a routine step.

### Step 3: Run the full existing suite touching these two files' CLI surface (sanity, not a new test)

These two files are CLI scripts with no exports of their own beyond what `lib/contract.mjs`
provides — there is no existing dedicated test file for either (confirmed: no
`test/footprint*.test.mjs` or `test/citation-resolve*.test.mjs` exists in this repo). No further
action needed here beyond what Step 2 already covers.

### Step 4: Commit

If no source changes were needed:
```bash
git add test/contract-consumers.test.mjs
git commit -m "test(contract): regression-pin footprint/citation-resolve's consumption of the v3 grammar"
```

If a source fix was needed (adjust the file list to whichever file you actually touched):
```bash
git add test/contract-consumers.test.mjs lib/footprint.mjs
git commit -m "fix(footprint): <describe the specific v3-grammar assumption fixed>"
```

## Acceptance Criteria
- [ ] `test/contract-consumers.test.mjs` exists and passes with zero failures
- [ ] `lib/footprint.mjs` and `lib/citation-resolve.mjs` are unmodified, UNLESS a real, documented
      failure required a narrow fix (in which case the fix and its reasoning are in the commit
      message and your final report)
- [ ] No file outside Scope was modified
