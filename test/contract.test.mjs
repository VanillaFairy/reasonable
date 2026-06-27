// contract.test.mjs — pin the grammar invariants the frontier-inventory design leans on:
// a `## Scenarios` prose section is PARSER-INVISIBLE (zero clauses, zero citations) and does
// not perturb a real clause's provenance/gates — exactly like `## Topology`. The parser
// (lib/contract.mjs) is unchanged; this is a regression guard, green from the first run.
// Run: node test/contract.test.mjs

import assert from 'node:assert';
import { parseContract } from '../lib/contract.mjs';

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.message}`); process.exitCode = 1; }
}

// A census skeleton contract carrying a `## Scenarios` frontier inventory: prose, zero teeth.
const SKELETON_WITH_SCENARIOS = `---
component: store
---

## Topology
- Lives at: \`src/store/\`
- Depends on: db
- Consumed by: api

## Clauses

## Scenarios
- delete-returns-immediately: \`delete(id)\` returns Ok synchronously today (seam: \`src/store/delete.rs\`; floor: delete_returns_ok)
- confirm-delete-prompts: deleting prompts for confirmation before removal (seam: \`src/ui/confirm.rs\`; floor: —)
`;

check('a `## Scenarios` section yields ZERO clauses', () => {
  const c = parseContract(SKELETON_WITH_SCENARIOS, 'store');
  assert.strictEqual(c.clauses.length, 0, 'frontier scenarios must not parse as clauses');
});

check('a `## Scenarios` section yields ZERO citations (footprint-zero)', () => {
  const c = parseContract(SKELETON_WITH_SCENARIOS, 'store');
  assert.strictEqual(c.citations.length, 0, 'frontier scenarios must add no citation-graph edges');
});

// Robustness: even when the component LATER grows a real clause, a trailing `## Scenarios`
// section must not be mis-attributed to it (no stray provenance/gate/citation bleed).
const GROWN_THEN_SCENARIOS = `---
component: store
---

## Clauses

### §1 Deletes a row
\`delete(id)\` removes the row.
- Gate: vertical-slice:del / asserts \`deletes_row\`

## Scenarios
- legacy-soft-delete: delete only marks a tombstone today (seam: \`src/store/delete.rs\`; floor: soft_delete_marks)
`;

check('a `## Scenarios` after a clause does not perturb that clause', () => {
  const c = parseContract(GROWN_THEN_SCENARIOS, 'store');
  assert.strictEqual(c.clauses.length, 1, 'exactly the one real clause');
  assert.strictEqual(c.clauses[0].provenance, 'grown', 'scenarios must not flip provenance to characterized');
  assert.strictEqual(c.clauses[0].gates.length, 1, 'the real gate is intact');
  assert.strictEqual(c.citations.length, 0, 'no citations leak from scenarios');
});

// ── `## Observable Seams` — the render-clause public test-observation surface. ────
// It is structured (the blind-test-writer TARGETS a declared handle instead of guessing)
// but, like `## Scenarios`, parser-INVISIBLE to clauses/citations (footprint-zero).
const CONTRACT_WITH_SEAMS = `---
component: choice-edge
---

## Citations
- graph-store §1

## Clauses

### §5 Self-loop renders as a bezier arc
A self-referential edge renders as a curved bezier arc, not a straight line.
- Gate: vertical-slice:edge-paths / asserts \`self_loop_is_arc\`

## Observable Seams
- component: default export \`ChoiceEdge\` (the edge component to import)
- guard-badge: the guard badge at the midpoint → \`[data-testid=guard-badge]\`
- waypoint: each waypoint affordance → \`[data-testid=edge-waypoint]\`
`;

check('`## Observable Seams` bullets parse into `seams`', () => {
  const c = parseContract(CONTRACT_WITH_SEAMS, 'choice-edge');
  assert.strictEqual(c.seams.length, 3, 'three declared seams');
  const byKey = Object.fromEntries(c.seams.map((s) => [s.key, s]));
  assert.strictEqual(byKey['component'].importHint, 'ChoiceEdge', 'the export to import is captured');
  assert.strictEqual(byKey['guard-badge'].handle, '[data-testid=guard-badge]', 'the stable handle is captured');
  assert.strictEqual(byKey['waypoint'].handle, '[data-testid=edge-waypoint]', 'per-element handle captured');
});

check('`## Observable Seams` is footprint-zero (no clauses, no citations leak)', () => {
  const c = parseContract(CONTRACT_WITH_SEAMS, 'choice-edge');
  assert.strictEqual(c.clauses.length, 1, 'exactly the one real clause — seams are not clauses');
  assert.strictEqual(c.clauses[0].id, '§5', 'the real clause is intact');
  assert.strictEqual(c.citations.length, 1, 'only the real `## Citations` edge — seams add none');
  assert.strictEqual(c.citations[0].component, 'graph-store', 'the citation graph is unperturbed');
});

check('a clause after `## Observable Seams` is not attributed to the section', () => {
  const TRAILING_CLAUSE = CONTRACT_WITH_SEAMS + `
### §6 Guard badge shows the guard label
The badge text is the guard's label.
- Gate: vertical-slice:edge-paths / asserts \`badge_shows_label\`
`;
  const c = parseContract(TRAILING_CLAUSE, 'choice-edge');
  assert.strictEqual(c.clauses.length, 2, 'both real clauses parse');
  assert.strictEqual(c.clauses[1].gates.length, 1, 'the post-seams clause keeps its gate');
  assert.strictEqual(c.seams.length, 3, 'the seams section is closed by the clause, not extended');
});

if (process.exitCode) console.error(`\ncontract: FAILURES above (${passed} passed).`);
else console.log(`\ncontract: all ${passed} checks pass. ✓`);
