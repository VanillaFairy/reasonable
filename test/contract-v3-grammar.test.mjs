// test/contract-v3-grammar.test.mjs — the v3 contract grammar (DESIGN-3.0 §4.2, reasonable 3.0
// Part 2): durable clause ids (`<component>#c<N>`, retiring positional `§N`), per-clause
// citations, and required per-clause `demanded-by` provenance. Scoped to the NEW grammar surface
// only — Scenarios/Seams/Provenance/Supersession regression coverage lives in
// test/contract.test.mjs (migrated to the new heading syntax, assertions unchanged).

import assert from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { parseContract, missingDemandedBy } from '../lib/contract.mjs';

const tmps = [];
function newEffort() {
  const root = mkdtempSync(join(tmpdir(), 'contract-v3-test-'));
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

// ── v3 clause-id headings ───────────────────────────────────────────────────────

const V3_BASIC = `---
component: lexer
---

## Clauses

### lexer#c12 Tokenizes an integer literal
\`tokenize\` recognizes ASCII digit runs as INT tokens.
- Gate: vertical-slice:expr-eval / asserts \`tokenizes_integer\`
- Demanded-by: gate:vertical-slice:expr-eval / asserts \`tokenizes_integer\`
`;

check('a v3 clause heading (<component>#c<N>) parses with id/component/n split out', () => {
  const c = parseContract(V3_BASIC, 'lexer');
  assert.strictEqual(c.clauses.length, 1);
  assert.strictEqual(c.clauses[0].id, 'lexer#c12');
  assert.strictEqual(c.clauses[0].component, 'lexer');
  assert.strictEqual(c.clauses[0].n, 12);
  assert.strictEqual(c.clauses[0].title, 'Tokenizes an integer literal');
});

check('positional §N headings no longer parse as clauses at all (hard cutover)', () => {
  const OLD = `---
component: lexer
---

## Clauses

### §12 Tokenizes an integer literal
\`tokenize\` recognizes ASCII digit runs as INT tokens.
`;
  const c = parseContract(OLD, 'lexer');
  assert.strictEqual(c.clauses.length, 0, 'a §N heading must not be recognized as a v3 clause');
});

// ── per-clause citations ─────────────────────────────────────────────────────────

const V3_WITH_CITES = `---
component: evaluator
---

## Clauses

### evaluator#c1 Evaluates an integer literal expression
Returns the integer value.
- Gate: vertical-slice:expr-eval / asserts \`evaluates_integer\`
- Cites: lexer#c12
- Cites: ast#c3
- Demanded-by: cite:evaluator#c1
`;

check('per-clause `- Cites:` bullets attach to the clause, repeatable', () => {
  const c = parseContract(V3_WITH_CITES, 'evaluator');
  assert.strictEqual(c.clauses[0].citations.length, 2);
  assert.deepStrictEqual(c.clauses[0].citations.map((x) => x.clause).sort(), ['ast#c3', 'lexer#c12']);
});

check("the flat, file-level citations array is the union of every clause's citations, tagged with citingClause", () => {
  const c = parseContract(V3_WITH_CITES, 'evaluator');
  assert.strictEqual(c.citations.length, 2);
  const byClause = Object.fromEntries(c.citations.map((x) => [x.clause, x]));
  assert.strictEqual(byClause['lexer#c12'].component, 'lexer');
  assert.strictEqual(byClause['lexer#c12'].citingClause, 'evaluator#c1');
});

check('citations attach ONLY to the clause they appear under, not to a sibling clause', () => {
  const TWO_CLAUSES = V3_WITH_CITES + `
### evaluator#c2 Evaluates a boolean literal
Returns true or false.
- Gate: vertical-slice:expr-eval / asserts \`evaluates_boolean\`
- Demanded-by: gate:vertical-slice:expr-eval / asserts \`evaluates_boolean\`
`;
  const c = parseContract(TWO_CLAUSES, 'evaluator');
  assert.strictEqual(c.clauses.length, 2);
  assert.strictEqual(c.clauses[1].citations.length, 0, 'the second clause cites nothing');
  assert.strictEqual(c.citations.length, 2, "only the first clause's two citations show up file-wide");
});

// ── demanded-by ───────────────────────────────────────────────────────────────────

check('a well-formed `- Demanded-by:` line parses into demandedBy verbatim', () => {
  const c = parseContract(V3_WITH_CITES, 'evaluator');
  assert.strictEqual(c.clauses[0].demandedBy, 'cite:evaluator#c1');
});

check('all four demanded-by tags parse (goal|gate|cite|ledger)', () => {
  const cases = [
    'goal:parses-arithmetic',
    'gate:vertical-slice:expr-eval / asserts `parses_integer_literal`',
    'cite:lexer#c12',
    'ledger:47',
  ];
  for (const value of cases) {
    const text = `---
component: x
---

## Clauses

### x#c1 Title
Body.
- Demanded-by: ${value}
`;
    const c = parseContract(text, 'x');
    assert.strictEqual(c.clauses[0].demandedBy, value, `value "${value}" should parse verbatim`);
  }
});

check('a clause with no `- Demanded-by:` line has demandedBy: null (parser never throws)', () => {
  const text = `---
component: x
---

## Clauses

### x#c1 Title
Body, no demanded-by line at all.
`;
  const c = parseContract(text, 'x');
  assert.strictEqual(c.clauses[0].demandedBy, null);
});

check("a `- Demanded-by:` line with an unrecognized tag is NOT parsed (stays null, not a throw)", () => {
  const text = `---
component: x
---

## Clauses

### x#c1 Title
Body.
- Demanded-by: whatever:something
`;
  const c = parseContract(text, 'x');
  assert.strictEqual(c.clauses[0].demandedBy, null);
});

check('a duplicated `- Demanded-by:` line keeps the LAST one (matches existing Provenance overwrite tolerance)', () => {
  const text = `---
component: x
---

## Clauses

### x#c1 Title
Body.
- Demanded-by: goal:first
- Demanded-by: goal:second
`;
  const c = parseContract(text, 'x');
  assert.strictEqual(c.clauses[0].demandedBy, 'goal:second');
});

check('a characterized (brownfield) clause also carries demanded-by, e.g. referencing its own characterization ledger event', () => {
  const text = `---
component: store
---

## Clauses

### store#c3 Deletion returns immediately (brownfield, characterized)
\`delete(id)\` returns Ok synchronously today.
- Provenance: characterized (test: delete_returns_ok, seam: src/store/delete.rs)
- Seam: src/store/delete.rs
- Demanded-by: ledger:14
`;
  const c = parseContract(text, 'store');
  assert.strictEqual(c.clauses[0].provenance, 'characterized');
  assert.strictEqual(c.clauses[0].demandedBy, 'ledger:14');
});

// ── missingDemandedBy (filesystem-level completeness check) ───────────────────────

check('missingDemandedBy flags a clause with no demanded-by, across the whole effort', () => {
  const root = newEffort();
  writeContract(root, 'lexer', `---
component: lexer
---

## Clauses

### lexer#c1 Has no demanded-by
Body.
`);
  writeContract(root, 'ast', `---
component: ast
---

## Clauses

### ast#c1 Has a demanded-by
Body.
- Demanded-by: goal:parses-arithmetic
`);
  const missing = missingDemandedBy(root);
  assert.strictEqual(missing.length, 1);
  assert.strictEqual(missing[0].component, 'lexer');
  assert.strictEqual(missing[0].clause, 'lexer#c1');
});

check('missingDemandedBy reports nothing when every clause has one', () => {
  const root = newEffort();
  writeContract(root, 'ast', `---
component: ast
---

## Clauses

### ast#c1 Has a demanded-by
Body.
- Demanded-by: goal:parses-arithmetic
`);
  assert.deepStrictEqual(missingDemandedBy(root), []);
});

for (const d of tmps) {
  try { rmSync(d, { recursive: true, force: true }); }
  catch { /* best-effort cleanup */ }
}

if (process.exitCode) console.error(`\ncontract-v3-grammar: FAILURES above (${passed} passed).`);
else console.log(`\ncontract-v3-grammar: all ${passed} checks pass. ✓`);
