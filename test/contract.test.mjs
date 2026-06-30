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

// ── `## Input Seams` — the STATE-reading clause's mock-construction surface. ──────
// The sibling of `## Observable Seams`: a component test must both OBSERVE outputs
// (observable seams) AND construct the scenario by mocking the EXTERNAL STATE the unit
// reads (input seams — a store / hook / context). Like its sibling it is
// structured-but-footprint-zero: the blind-test-writer reads it to set the scenario up
// instead of defaulting the mock to its empty value (the false-green trap that left
// edge-path §8's auto-router branch never exercised — suite 370/370, proving nothing).
const CONTRACT_WITH_INPUT_SEAMS = `---
component: choice-edge
---

# Contract: choice-edge

## Citations
- graph-store §2

## Clauses
### §8 Auto-route deflects around a crossed node
When the straight source→target segment passes through a node bbox, the path deflects into a channel.
- Gate: vertical-slice:edge-paths / asserts \`autoroute_deflects_around_node\`

## Input Seams
- node bboxes: mock \`useStore\` to return nodes as \`{ id, position, width, height }\`; autoRoute receives every non-excluded node's bbox.
- excluded ids: mock \`useExcluded\` to return the set of node ids autoRoute skips.
`;

check('`## Input Seams` bullets parse into `inputSeams`', () => {
  const c = parseContract(CONTRACT_WITH_INPUT_SEAMS, 'choice-edge');
  assert.strictEqual(c.inputSeams.length, 2, 'two declared input seams');
  const byKey = Object.fromEntries(c.inputSeams.map((s) => [s.key, s]));
  assert.strictEqual(byKey['node bboxes'].mock, 'useStore', 'the state source to mock is captured');
  assert.strictEqual(byKey['excluded ids'].mock, 'useExcluded', 'per-bullet mock target captured');
});

check('`## Input Seams` is footprint-zero (no clauses, no citations leak)', () => {
  const c = parseContract(CONTRACT_WITH_INPUT_SEAMS, 'choice-edge');
  assert.strictEqual(c.clauses.length, 1, 'exactly the one real clause — input seams are not clauses');
  assert.strictEqual(c.clauses[0].id, '§8', 'the real clause is intact');
  assert.strictEqual(c.citations.length, 1, 'only the real `## Citations` edge — input seams add none');
  assert.strictEqual(c.citations[0].component, 'graph-store', 'the citation graph is unperturbed');
});

check('a clause after `## Input Seams` is not attributed to the section', () => {
  const TRAILING = CONTRACT_WITH_INPUT_SEAMS + `
### §9 Excluded nodes are skipped
A node in the excluded set is never deflected around.
- Gate: vertical-slice:edge-paths / asserts \`excluded_nodes_skipped\`
`;
  const c = parseContract(TRAILING, 'choice-edge');
  assert.strictEqual(c.clauses.length, 2, 'both real clauses parse');
  assert.strictEqual(c.clauses[1].gates.length, 1, 'the post-input-seams clause keeps its gate');
  assert.strictEqual(c.inputSeams.length, 2, 'the input-seams section is closed by the clause, not extended');
});

// Observable + Input seams coexist in one contract: disjoint, both footprint-zero.
const CONTRACT_WITH_BOTH_SEAMS = `---
component: choice-edge
---

# Contract: choice-edge

## Citations
- graph-store §2

## Clauses
### §8 Auto-route deflects around a crossed node
The path deflects into a channel when it would cross a node.
- Gate: vertical-slice:edge-paths / asserts \`autoroute_deflects\`

## Observable Seams
- component: default export \`ChoiceEdge\`
- path: the rendered edge path → \`[data-testid=edge-path]\`

## Input Seams
- node bboxes: mock \`useStore\` to return nodes as \`{ id, position, width, height }\`.
`;

check('Observable and Input seams coexist, disjoint and both footprint-zero', () => {
  const c = parseContract(CONTRACT_WITH_BOTH_SEAMS, 'choice-edge');
  assert.strictEqual(c.seams.length, 2, 'both observable seams parse');
  assert.strictEqual(c.inputSeams.length, 1, 'the input seam parses, separately');
  assert.strictEqual(c.seams.find((s) => s.key === 'component').importHint, 'ChoiceEdge', 'observable export captured');
  assert.strictEqual(c.inputSeams[0].mock, 'useStore', 'input mock target captured');
  assert.strictEqual(c.clauses.length, 1, 'one real clause; neither seam section leaks a clause');
  assert.strictEqual(c.citations.length, 1, 'one real citation; neither seam section leaks an edge');
});

if (process.exitCode) console.error(`\ncontract: FAILURES above (${passed} passed).`);
else console.log(`\ncontract: all ${passed} checks pass. ✓`);
