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
