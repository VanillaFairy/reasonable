// test/graph-containment.test.mjs — the containment tree fold and edge lifting (DESIGN-3.0 §2.1,
// §2.3, reasonable 3.0 Part 4). Pure, zero-I/O — atom-record and tree fixtures are built by hand.

import assert from 'node:assert';
import { containmentTree, liftEdges } from '../lib/graph.mjs';

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.stack || e.message}`); process.exitCode = 1; }
}

// ── containmentTree: the flat-by-component fallback (no ownershipMap) ──────

check('an empty atom list returns a bare root with no children', () => {
  const tree = containmentTree([]);
  assert.strictEqual(tree.id, '');
  assert.strictEqual(tree.kind, 'root');
  assert.deepStrictEqual(tree.children, []);
});

check('atoms of the same component group under one flat group node, directly under the root', () => {
  const atoms = [{ id: 'a-1', component: 'lexer' }, { id: 'a-2', component: 'lexer' }];
  const tree = containmentTree(atoms);
  assert.strictEqual(tree.children.length, 1);
  const group = tree.children[0];
  assert.strictEqual(group.id, 'lexer');
  assert.strictEqual(group.kind, 'group');
  assert.deepStrictEqual(group.children.map((c) => c.id).sort(), ['a-1', 'a-2']);
  assert.ok(group.children.every((c) => c.kind === 'atom'));
});

check('atoms of different components land under separate flat group nodes', () => {
  const atoms = [{ id: 'a-1', component: 'lexer' }, { id: 'a-2', component: 'ast' }];
  const tree = containmentTree(atoms);
  assert.deepStrictEqual(tree.children.map((c) => c.id).sort(), ['ast', 'lexer']);
});

// ── containmentTree: an optional ownershipMap ───────────────────────────────

check('an ownershipMap with a single-segment path behaves like the flat fallback, just renamed', () => {
  const atoms = [{ id: 'a-1', component: 'lexer' }];
  const tree = containmentTree(atoms, { ownershipMap: { lexer: 'frontend' } });
  assert.deepStrictEqual(tree.children.map((c) => c.id), ['frontend']);
  assert.deepStrictEqual(tree.children[0].children.map((c) => c.id), ['a-1']);
});

check('an ownershipMap with a multi-segment path nests group nodes in order, shared prefixes reused', () => {
  const atoms = [
    { id: 'a-1', component: 'button' },
    { id: 'a-2', component: 'validation' },
  ];
  const ownershipMap = { button: 'ui/button', validation: 'ui/button/validation' };
  const tree = containmentTree(atoms, { ownershipMap });
  assert.strictEqual(tree.children.length, 1);
  const ui = tree.children[0];
  assert.strictEqual(ui.id, 'ui');
  assert.strictEqual(ui.children.length, 1);
  const button = ui.children[0];
  assert.strictEqual(button.id, 'ui/button');
  const buttonAtomIds = button.children.filter((c) => c.kind === 'atom').map((c) => c.id);
  const buttonGroups = button.children.filter((c) => c.kind === 'group');
  assert.deepStrictEqual(buttonAtomIds, ['a-1']);
  assert.strictEqual(buttonGroups.length, 1);
  assert.strictEqual(buttonGroups[0].id, 'ui/button/validation');
  assert.deepStrictEqual(buttonGroups[0].children.map((c) => c.id), ['a-2']);
});

check('a component absent from ownershipMap falls back to its own flat component node', () => {
  const atoms = [{ id: 'a-1', component: 'lexer' }];
  const tree = containmentTree(atoms, { ownershipMap: { ast: 'frontend/ast' } });
  assert.deepStrictEqual(tree.children.map((c) => c.id), ['lexer']);
});

// Added beyond the spec's given examples: a partial ownershipMap (some components mapped, some
// not) is the realistic case once Part 6 starts ratifying an ownership map incrementally — the
// given examples only exercise "map covers everything relevant" or "map covers nothing relevant"
// in isolation, never both fallback paths coexisting in one tree. A naive implementation that
// special-cases "ownershipMap present => always nest, never flat-fallback per-component" would
// pass every given test but fail this one.
check('an ownershipMap covering only SOME components: mapped atoms nest via the map, unmapped atoms still fall back flat, both coexisting under the root', () => {
  const atoms = [
    { id: 'a-1', component: 'lexer' },
    { id: 'a-2', component: 'ast' },
  ];
  const tree = containmentTree(atoms, { ownershipMap: { lexer: 'frontend/lexer' } });
  assert.deepStrictEqual(tree.children.map((c) => c.id).sort(), ['ast', 'frontend']);

  const frontend = tree.children.find((c) => c.id === 'frontend');
  assert.strictEqual(frontend.kind, 'group');
  assert.strictEqual(frontend.children.length, 1);
  const lexerGroup = frontend.children[0];
  assert.strictEqual(lexerGroup.id, 'frontend/lexer');
  assert.strictEqual(lexerGroup.kind, 'group');
  assert.deepStrictEqual(lexerGroup.children.map((c) => c.id), ['a-1']);

  const astGroup = tree.children.find((c) => c.id === 'ast');
  assert.strictEqual(astGroup.kind, 'group');
  assert.deepStrictEqual(astGroup.children.map((c) => c.id), ['a-2']);
});

// ── liftEdges ────────────────────────────────────────────────────────────────

function twoGroupTree() {
  return {
    id: '', kind: 'root', children: [
      { id: 'lexer', kind: 'group', children: [{ id: 'a-1', kind: 'atom', children: [] }, { id: 'a-2', kind: 'atom', children: [] }] },
      { id: 'ast', kind: 'group', children: [{ id: 'a-3', kind: 'atom', children: [] }] },
    ],
  };
}

check('an edge between atoms in different children lifts to one edge between those children', () => {
  const tree = twoGroupTree();
  const edges = [{ from: 'a-1', to: 'a-3', edge: 'needs' }];
  assert.deepStrictEqual(liftEdges(tree, edges, ''), [{ from: 'lexer', to: 'ast', edge: 'needs' }]);
});

check('multiple underlying edges of the SAME kind between the same pair lift to exactly one entry', () => {
  const tree = twoGroupTree();
  const edges = [
    { from: 'a-1', to: 'a-3', edge: 'needs' },
    { from: 'a-2', to: 'a-3', edge: 'needs' },
  ];
  assert.deepStrictEqual(liftEdges(tree, edges, ''), [{ from: 'lexer', to: 'ast', edge: 'needs' }]);
});

check('edges of DIFFERENT kinds between the same pair each lift separately', () => {
  const tree = twoGroupTree();
  const edges = [
    { from: 'a-1', to: 'a-3', edge: 'needs' },
    { from: 'a-3', to: 'a-1', edge: 'excludes' },
  ];
  const lifted = liftEdges(tree, edges, '').slice().sort((x, y) => x.edge.localeCompare(y.edge));
  assert.deepStrictEqual(lifted, [
    { from: 'ast', to: 'lexer', edge: 'excludes' },
    { from: 'lexer', to: 'ast', edge: 'needs' },
  ]);
});

// Added beyond the spec's given examples: interfaces.md's own docstring calls liftEdges' inputs
// "ordered pairs", and DESIGN-3.0 §2.2 allows needs-cycles to arise structurally pre-merge (R6's
// SCC-in-needs verdict exists precisely because this can happen) — so two real underlying edges of
// the SAME kind, one in each direction between the same sibling pair, is a real (if rare) shape,
// not a hypothetical. The given "different kinds" test only proves direction is tracked at all; it
// never proves both directions of ONE kind can coexist without one silently clobbering the other
// (e.g. an implementation that keys a dedup Map by `${edge}` alone, ignoring direction, would
// collapse this to one entry and still pass every other check in this file).
check('needs edges in BOTH directions between the same sibling pair lift to TWO separate entries, one per direction (ordered pairs, not collapsed)', () => {
  const tree = twoGroupTree();
  const edges = [
    { from: 'a-1', to: 'a-3', edge: 'needs' },
    { from: 'a-3', to: 'a-1', edge: 'needs' },
  ];
  const lifted = liftEdges(tree, edges, '').slice().sort((x, y) => (x.from + x.to).localeCompare(y.from + y.to));
  assert.deepStrictEqual(lifted, [
    { from: 'ast', to: 'lexer', edge: 'needs' },
    { from: 'lexer', to: 'ast', edge: 'needs' },
  ]);
});

check('an edge entirely WITHIN one child never lifts (not a sibling-pair edge)', () => {
  const tree = twoGroupTree();
  assert.deepStrictEqual(liftEdges(tree, [{ from: 'a-1', to: 'a-2', edge: 'excludes' }], ''), []);
});

check('an unknown viewNodeId returns []', () => {
  const tree = twoGroupTree();
  assert.deepStrictEqual(liftEdges(tree, [{ from: 'a-1', to: 'a-3', edge: 'needs' }], 'bogus'), []);
});

check('a view node with fewer than two children returns [] (no sibling pairs to lift between)', () => {
  const tree = { id: '', kind: 'root', children: [{ id: 'lexer', kind: 'group', children: [] }] };
  assert.deepStrictEqual(liftEdges(tree, [{ from: 'a-1', to: 'a-3', edge: 'needs' }], ''), []);
});

check('liftEdges works at a NON-root view node too, one level down', () => {
  const tree = {
    id: '', kind: 'root', children: [
      { id: 'ui', kind: 'group', children: [
        { id: 'button', kind: 'group', children: [{ id: 'a-1', kind: 'atom', children: [] }] },
        { id: 'validation', kind: 'group', children: [{ id: 'a-2', kind: 'atom', children: [] }] },
      ] },
    ],
  };
  const edges = [{ from: 'a-2', to: 'a-1', edge: 'needs' }];
  assert.deepStrictEqual(liftEdges(tree, edges, 'ui'), [{ from: 'validation', to: 'button', edge: 'needs' }]);
  assert.deepStrictEqual(liftEdges(tree, edges, ''), []); // at the root, 'ui' is an only child — no pair
});

if (process.exitCode) console.error(`\ngraph-containment: FAILURES above (${passed} passed).`);
else console.log(`\ngraph-containment: all ${passed} checks pass. ✓`);
