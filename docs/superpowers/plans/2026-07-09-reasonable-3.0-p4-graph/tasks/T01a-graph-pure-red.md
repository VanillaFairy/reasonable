# Task T01a: Graph pure-function tests (red)

**Role:** `red` — you write ONLY the two failing test files below. Do not implement
`lib/graph.mjs`.

## References
- Read: `../shared/architecture.md`
- Read: `../shared/interfaces.md` (the exact `lib/graph.mjs` PURE-section contract you're testing)
- Read: `../shared/conventions.md`
- Read: `../knowledge/running-tests.md`
- Read: `docs/superpowers/specs/2026-07-09-reasonable-3.0-p4-graph-design.md` Decisions 2, 3, 4, 7,
  8 in full — the reasoning behind the containment fallback, the edge-computation rules, and why
  `excludes` is symmetric while the other three are not
- Read: `test/atom-cohesion.test.mjs` (the fixture-writing style for a pure-shape module — no
  filesystem needed for either file here, everything under test is pure)

## Dependencies
- Depends on: — (none)
- Depended on by: T01b (implements against these locked tests), T01c (audits them)

## Scope

**Files:**
- Create: `test/graph-containment.test.mjs`
- Create: `test/graph-edges.test.mjs`

**BOUNDARY — you MUST NOT modify any files outside this list. In particular, do NOT create
`lib/graph.mjs` — that is T01b's job.**

## Positive Constraints (DO)
- Write two complete, runnable test files following the exact harness convention in
  `../shared/conventions.md` (the `check()` pattern — no framework).
- `test/graph-containment.test.mjs` imports `containmentTree, liftEdges` from `../lib/graph.mjs` (a
  module that does not exist yet — RED here is a "Cannot find module" error).
- `test/graph-edges.test.mjs` imports `needsEdges, ledgerCitationGraph, citationClosureOver,
  excludesEdges, servesEdges, informsEdges` from `../lib/graph.mjs`.
- Cover the flat-by-component containment fallback, an ownership-map override (both single- and
  multi-segment paths), and a component absent from a supplied ownership map falling back to its
  own flat node.
- Cover edge lifting: a cross-child edge lifts, duplicate underlying edges of one kind collapse to
  one lifted entry, different edge kinds between the same pair lift separately, an edge entirely
  within one child never lifts, an unknown view id returns `[]`, a view with fewer than two children
  returns `[]`, and lifting works one level down from the root (not only at the root).
- Cover `needsEdges`: a real cross-atom edge, dedup across multiple citations to the same provider,
  a citation to an untracked clause producing no edge, no self-loop from citing your own atom's
  clause, and two distinct providers producing two distinct edges.
- Cover `ledgerCitationGraph`/`citationClosureOver`: unioning cited components across atoms of the
  same component, an atom with no delta clauses tracked, transitivity, and cycle-safety.
- Cover `excludesEdges`: same-component atoms always exclude (no citations, no locus needed),
  `from`/`to` ordered by atom id regardless of input order, no exclusion when components and loci
  are both disjoint, a locus overlap excluding despite disjoint citations, a transitive shared
  citation-closure component excluding, and an omitted `citationGraph` defaulting to `{}` rather
  than throwing.
- Cover `servesEdges`/`informsEdges`: both return `[]` with no second argument (and with an
  explicit empty array), a direct provide-serves edge, transitivity over `needs`, a goal citing an
  untracked clause producing nothing, a real `informs` pass-through, and a `spikeInforms` entry
  naming an atom id absent from the call's own `atoms` array being dropped rather than fabricated.

## Negative Constraints (DO NOT)
- Do NOT implement `lib/graph.mjs`.
- Do NOT test the I/O half (`foldAsLived`, `deriveCurrent`, `graphDivergence`, or `lib/atom.mjs`'s
  new exports) — that's T02a's job, and those exports don't exist in this task's scope.
- Do NOT modify any file outside the Scope section.

## Implementation Steps

### Step 1: Write `test/graph-containment.test.mjs`

```js
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
```

### Step 2: Write `test/graph-edges.test.mjs`

```js
// test/graph-edges.test.mjs — the four dependency-edge computations (DESIGN-3.0 §2.2, reasonable
// 3.0 Part 4): needs, excludes (+ the ledger-native citation graph/closure it shares with the
// as-lived projection), serves, informs. Pure, zero-I/O — atom-record fixtures are built by hand.

import assert from 'node:assert';
import {
  needsEdges, ledgerCitationGraph, citationClosureOver, excludesEdges, servesEdges, informsEdges,
} from '../lib/graph.mjs';

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.stack || e.message}`); process.exitCode = 1; }
}

function clause(clauseId, { citations = [], demandedBy = null, locus = [] } = {}) {
  return { clauseId, citations, demandedBy, locus };
}
function atom(id, component, deltaClauses = []) {
  return { id, component, deltaClauses };
}
function sortEdges(edges) {
  return edges.slice().sort((a, b) => (a.from + a.to + a.edge).localeCompare(b.from + b.to + b.edge));
}

// ── needsEdges ───────────────────────────────────────────────────────────────

check('A citing a clause B introduces produces exactly one needs edge, A -> B', () => {
  const a = atom('a-1', 'lexer', [clause('lexer#c1', { citations: [{ component: 'ast', clause: 'ast#c1' }] })]);
  const b = atom('a-2', 'ast', [clause('ast#c1')]);
  assert.deepStrictEqual(needsEdges([a, b]), [{ from: 'a-1', to: 'a-2', edge: 'needs', op: 'add' }]);
});

check('multiple clauses/citations to the SAME provider atom dedupe to one edge', () => {
  const a = atom('a-1', 'lexer', [
    clause('lexer#c1', { citations: [{ component: 'ast', clause: 'ast#c1' }] }),
    clause('lexer#c2', { citations: [{ component: 'ast', clause: 'ast#c2' }] }),
  ]);
  const b = atom('a-2', 'ast', [clause('ast#c1'), clause('ast#c2')]);
  assert.deepStrictEqual(needsEdges([a, b]), [{ from: 'a-1', to: 'a-2', edge: 'needs', op: 'add' }]);
});

check('a citation to a clause id no tracked atom introduces produces no edge', () => {
  const a = atom('a-1', 'lexer', [clause('lexer#c1', { citations: [{ component: 'ast', clause: 'ast#c99' }] })]);
  assert.deepStrictEqual(needsEdges([a]), []);
});

check("citing one of your OWN atom's clauses never produces a self-loop", () => {
  const a = atom('a-1', 'lexer', [
    clause('lexer#c1'),
    clause('lexer#c2', { citations: [{ component: 'lexer', clause: 'lexer#c1' }] }),
  ]);
  assert.deepStrictEqual(needsEdges([a]), []);
});

check('two atoms each providing a distinct clause A cites both produce two separate needs edges', () => {
  const a = atom('a-1', 'lexer', [clause('lexer#c1', {
    citations: [{ component: 'ast', clause: 'ast#c1' }, { component: 'eval', clause: 'eval#c1' }],
  })]);
  const b = atom('a-2', 'ast', [clause('ast#c1')]);
  const c = atom('a-3', 'eval', [clause('eval#c1')]);
  assert.deepStrictEqual(sortEdges(needsEdges([a, b, c])), sortEdges([
    { from: 'a-1', to: 'a-2', edge: 'needs', op: 'add' },
    { from: 'a-1', to: 'a-3', edge: 'needs', op: 'add' },
  ]));
});

// ── ledgerCitationGraph / citationClosureOver ───────────────────────────────

check('ledgerCitationGraph unions cited components across every atom of the same component', () => {
  const a = atom('a-1', 'lexer', [clause('lexer#c1', { citations: [{ component: 'ast', clause: 'ast#c1' }] })]);
  const b = atom('a-2', 'lexer', [clause('lexer#c2', { citations: [{ component: 'eval', clause: 'eval#c1' }] })]);
  assert.deepStrictEqual(ledgerCitationGraph([a, b]).lexer.slice().sort(), ['ast', 'eval']);
});

check('ledgerCitationGraph has an empty entry for a component with no citations tracked', () => {
  const a = atom('a-1', 'lexer', []);
  assert.deepStrictEqual(ledgerCitationGraph([a]), { lexer: [] });
});

check('citationClosureOver is transitive', () => {
  const graph = { lexer: ['ast'], ast: ['eval'], eval: [] };
  assert.deepStrictEqual(citationClosureOver(graph, ['lexer']).sort(), ['ast', 'eval', 'lexer']);
});

check('citationClosureOver never loops forever on a cycle', () => {
  const graph = { a: ['b'], b: ['a'] };
  assert.deepStrictEqual(citationClosureOver(graph, ['a']).sort(), ['a', 'b']);
});

// ── excludesEdges ────────────────────────────────────────────────────────────

check('two atoms of the SAME component always exclude, even with no citations or locus', () => {
  const a = atom('a-1', 'lexer', [clause('lexer#c1')]);
  const b = atom('a-2', 'lexer', [clause('lexer#c2')]);
  const graph = ledgerCitationGraph([a, b]);
  assert.deepStrictEqual(excludesEdges([a, b], { citationGraph: graph }),
    [{ from: 'a-1', to: 'a-2', edge: 'excludes', op: 'add' }]);
});

check('from/to are ordered by atom id regardless of input order (symmetric, deterministic)', () => {
  const a = atom('a-2', 'lexer', []);
  const b = atom('a-1', 'lexer', []);
  const graph = ledgerCitationGraph([a, b]);
  assert.deepStrictEqual(excludesEdges([a, b], { citationGraph: graph }),
    [{ from: 'a-1', to: 'a-2', edge: 'excludes', op: 'add' }]);
});

check('two atoms of DIFFERENT components with no shared citation closure and disjoint loci do not exclude', () => {
  const a = atom('a-1', 'lexer', [clause('lexer#c1', { locus: ['lib/lexer/scan.mjs'] })]);
  const b = atom('a-2', 'ast', [clause('ast#c1', { locus: ['lib/ast/build.mjs'] })]);
  const graph = ledgerCitationGraph([a, b]);
  assert.deepStrictEqual(excludesEdges([a, b], { citationGraph: graph }), []);
});

check('two atoms of different components with OVERLAPPING loci exclude despite disjoint citations', () => {
  const a = atom('a-1', 'lexer', [clause('lexer#c1', { locus: ['lib/shared/util.mjs'] })]);
  const b = atom('a-2', 'ast', [clause('ast#c1', { locus: ['lib/shared/util.mjs'] })]);
  const graph = ledgerCitationGraph([a, b]);
  assert.deepStrictEqual(excludesEdges([a, b], { citationGraph: graph }),
    [{ from: 'a-1', to: 'a-2', edge: 'excludes', op: 'add' }]);
});

check('two atoms whose citation closures transitively share a component exclude, even indirectly', () => {
  const a = atom('a-1', 'lexer', [clause('lexer#c1', { citations: [{ component: 'ast', clause: 'ast#c1' }] })]);
  const b = atom('a-2', 'eval', [clause('eval#c1', { citations: [{ component: 'ast', clause: 'ast#c1' }] })]);
  const graph = ledgerCitationGraph([a, b]); // lexer -> [ast], eval -> [ast]
  assert.deepStrictEqual(excludesEdges([a, b], { citationGraph: graph }),
    [{ from: 'a-1', to: 'a-2', edge: 'excludes', op: 'add' }]);
});

check('excludesEdges defaults an omitted citationGraph to {} rather than throwing', () => {
  const a = atom('a-1', 'lexer', []);
  const b = atom('a-2', 'ast', []);
  assert.deepStrictEqual(excludesEdges([a, b]), []);
});

// ── servesEdges ──────────────────────────────────────────────────────────────

check('servesEdges returns [] when called with no goals (the default, always today)', () => {
  const a = atom('a-1', 'lexer', [clause('lexer#c1')]);
  assert.deepStrictEqual(servesEdges([a]), []);
  assert.deepStrictEqual(servesEdges([a], []), []);
});

check('an atom providing a goal-cited clause serves that goal', () => {
  const a = atom('a-1', 'lexer', [clause('lexer#c1')]);
  const goals = [{ id: 'g-1', scenarioCitations: [{ component: 'lexer', clause: 'lexer#c1' }] }];
  assert.deepStrictEqual(servesEdges([a], goals), [{ from: 'a-1', to: 'g-1', edge: 'serves', op: 'add' }]);
});

check("serving is TRANSITIVE over needs: a provider's own dependency also serves the goal", () => {
  const a = atom('a-1', 'lexer', [clause('lexer#c1', { citations: [{ component: 'ast', clause: 'ast#c1' }] })]);
  const b = atom('a-2', 'ast', [clause('ast#c1')]);
  const goals = [{ id: 'g-1', scenarioCitations: [{ component: 'lexer', clause: 'lexer#c1' }] }];
  assert.deepStrictEqual(sortEdges(servesEdges([a, b], goals)), sortEdges([
    { from: 'a-1', to: 'g-1', edge: 'serves', op: 'add' },
    { from: 'a-2', to: 'g-1', edge: 'serves', op: 'add' },
  ]));
});

check('a goal citing a clause no tracked atom introduces produces no serves edges', () => {
  const a = atom('a-1', 'lexer', [clause('lexer#c1')]);
  const goals = [{ id: 'g-1', scenarioCitations: [{ component: 'ast', clause: 'ast#c99' }] }];
  assert.deepStrictEqual(servesEdges([a], goals), []);
});

// ── informsEdges ─────────────────────────────────────────────────────────────

check('informsEdges returns [] when called with no spikeInforms (the default, always today)', () => {
  const a = atom('a-1', 'lexer', []);
  assert.deepStrictEqual(informsEdges([a]), []);
  assert.deepStrictEqual(informsEdges([a], []), []);
});

check('a spikeInforms entry naming a real atomId becomes one informs edge', () => {
  const a = atom('a-1', 'lexer', []);
  const spikeInforms = [{ spikeId: 'spike-1', atomId: 'a-1' }];
  assert.deepStrictEqual(informsEdges([a], spikeInforms), [{ from: 'spike-1', to: 'a-1', edge: 'informs', op: 'add' }]);
});

check("a spikeInforms entry naming an atomId NOT in this call's atoms is dropped, not fabricated", () => {
  const a = atom('a-1', 'lexer', []);
  const spikeInforms = [{ spikeId: 'spike-1', atomId: 'a-99' }];
  assert.deepStrictEqual(informsEdges([a], spikeInforms), []);
});

if (process.exitCode) console.error(`\ngraph-edges: FAILURES above (${passed} passed).`);
else console.log(`\ngraph-edges: all ${passed} checks pass. ✓`);
```

### Step 3: Run both to verify they fail for the right reason

Run: `node test/graph-containment.test.mjs` and `node test/graph-edges.test.mjs`

Expected: a top-level throw / module-load error, something like `Cannot find module
'.../lib/graph.mjs'` — **not** an assertion failure inside a `check()`. If you see individual
`FAIL` lines instead of a load error, `lib/graph.mjs` already exists (stop and investigate — this
task is running out of order).

### Step 4: Commit

```bash
git add test/graph-containment.test.mjs test/graph-edges.test.mjs
git commit -m "test(graph): lock the containment, edge-computation, and lifting contract (red)"
```

## Acceptance Criteria
- [ ] Both test files exist and match the harness convention exactly
- [ ] Running either fails with a module-not-found error (RED for the right reason)
- [ ] Every function named in `interfaces.md`'s PURE section has at least one `check()`
- [ ] The flat fallback, an ownership-map override (single- and multi-segment), and the
      absent-from-map fallback are all covered for `containmentTree`
- [ ] Cross-child lift, same-kind dedup, different-kind separation, within-child non-lift, unknown
      view id, and single-child view are all covered for `liftEdges`
- [ ] All five `needsEdges` behaviors, all four `excludesEdges` behaviors plus the
      `citationGraph`-omitted default, and both `servesEdges`/`informsEdges` empty-default plus
      real-edge plus dropped-unknown-id cases are covered
- [ ] No file outside Scope was modified
- [ ] `lib/graph.mjs` was NOT created by this task
