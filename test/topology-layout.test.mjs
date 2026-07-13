// test/topology-layout.test.mjs — P6e: the layered-DAG layout (DESIGN-3.0 §5.3, reasonable 3.0 Part 6e).
// Pure: { nodes, edges } subgraphs are hand-built literals — no ledger, no fs, no graph.mjs I/O fold.
// Pins the ALGORITHM's PROPERTIES (rank-consistency, determinism, no node loss, crossing reduction,
// cycle-safety, coordinate monotonicity), never a golden coordinate (the sweep params/gaps are cosmetic,
// plan Flag 4).
import assert from 'node:assert';
import { layoutTopology } from '../lib/topology-view.mjs';

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.stack || e.message}`); process.exitCode = 1; }
}

// Count edge crossings between edges that span the SAME adjacent rank-pair (all fixtures below are
// laid out with adjacent-rank edges, so this is exact): two edges cross iff their endpoints' orders
// are inverted between the two ranks.
function crossings(layout) {
  const pos = new Map(layout.nodes.map((n) => [n.id, { rank: n.rank, order: n.order }]));
  const es = layout.edges.map((e) => ({ a: pos.get(e.from), b: pos.get(e.to) })).filter((e) => e.a && e.b);
  let count = 0;
  for (let i = 0; i < es.length; i += 1) {
    for (let j = i + 1; j < es.length; j += 1) {
      const e1 = es[i], e2 = es[j];
      if (e1.a.rank !== e2.a.rank || e1.b.rank !== e2.b.rank) continue;
      if ((e1.a.order - e2.a.order) * (e1.b.order - e2.b.order) < 0) count += 1;
    }
  }
  return count;
}
const idSet = (layout) => new Set(layout.nodes.map((n) => n.id));
const byId = (layout) => new Map(layout.nodes.map((n) => [n.id, n]));

// ── longest-path ranking (EXACT — every edge crosses at least one rank boundary from→to) ──────────

check('rank-consistency: every edge goes from a strictly-lower rank to a strictly-higher rank', () => {
  // a diamond: s → a, s → b, a → t, b → t  (s rank0; a,b rank1; t rank2 by longest path)
  const g = {
    nodes: [{ id: 's' }, { id: 'a' }, { id: 'b' }, { id: 't' }],
    edges: [{ from: 's', to: 'a' }, { from: 's', to: 'b' }, { from: 'a', to: 't' }, { from: 'b', to: 't' }],
  };
  const L = layoutTopology(g);
  const r = byId(L);
  for (const e of L.edges) assert.ok(r.get(e.to).rank >= r.get(e.from).rank + 1, `edge ${e.from}->${e.to} not rank-increasing`);
});

check('longest-path: a node reachable by paths of different lengths takes the LONGEST', () => {
  // s → a → t  and  s → t : t must sit at rank 2 (the longest path), not rank 1
  const g = {
    nodes: [{ id: 's' }, { id: 'a' }, { id: 't' }],
    edges: [{ from: 's', to: 'a' }, { from: 'a', to: 't' }, { from: 's', to: 't' }],
  };
  const r = byId(layoutTopology(g));
  assert.strictEqual(r.get('s').rank, 0);
  assert.strictEqual(r.get('a').rank, 1);
  assert.strictEqual(r.get('t').rank, 2);
});

check('sources (no incoming edge) sit at rank 0', () => {
  const g = { nodes: [{ id: 'x' }, { id: 'y' }, { id: 'z' }], edges: [{ from: 'x', to: 'z' }, { from: 'y', to: 'z' }] };
  const r = byId(layoutTopology(g));
  assert.strictEqual(r.get('x').rank, 0);
  assert.strictEqual(r.get('y').rank, 0);
  assert.strictEqual(r.get('z').rank, 1);
});

// ── barycenter cross-reduction (PROPERTY, not a golden order — plan Flag 4) ────────────────────────

check('crossing reduction: the classic "X" is resolved to ZERO crossings', () => {
  // A,B on rank 0; C,D on rank 1. Edges A→D, B→C. Supplied in an order that, kept naively, crosses;
  // the barycenter must reorder rank 1 so D sits under A and C under B → no crossing.
  const x = {
    nodes: [{ id: 'A' }, { id: 'B' }, { id: 'C' }, { id: 'D' }],
    edges: [{ from: 'A', to: 'D' }, { from: 'B', to: 'C' }],
  };
  assert.strictEqual(crossings(layoutTopology(x)), 0, 'barycenter did not resolve the crossing');
});

check('crossing reduction: output has STRICTLY FEWER crossings than the naive input order', () => {
  const x = {
    nodes: [{ id: 'A' }, { id: 'B' }, { id: 'C' }, { id: 'D' }],
    edges: [{ from: 'A', to: 'D' }, { from: 'B', to: 'C' }],
  };
  // the naive input-order placement of THIS fixture (ranks are known: A,B rank0; C,D rank1; order =
  // insertion index within rank) has exactly one crossing:
  const naive = {
    nodes: [{ id: 'A', rank: 0, order: 0 }, { id: 'B', rank: 0, order: 1 },
            { id: 'C', rank: 1, order: 0 }, { id: 'D', rank: 1, order: 1 }],
    edges: x.edges,
  };
  assert.strictEqual(crossings(naive), 1);
  assert.ok(crossings(layoutTopology(x)) < crossings(naive), 'layout did not reduce crossings');
});

check('an already-optimal ordering stays crossing-free (never worsens)', () => {
  // A→C, B→D with A,B rank0 and C,D rank1 — already parallel; must stay 0 crossings.
  const g = {
    nodes: [{ id: 'A' }, { id: 'B' }, { id: 'C' }, { id: 'D' }],
    edges: [{ from: 'A', to: 'C' }, { from: 'B', to: 'D' }],
  };
  assert.strictEqual(crossings(layoutTopology(g)), 0);
});

// ── determinism + totality (no node dropped or duplicated) ────────────────────────────────────────

check('deterministic: two calls on the same subgraph return deep-equal layouts', () => {
  const g = {
    nodes: [{ id: 'A' }, { id: 'B' }, { id: 'C' }, { id: 'D' }, { id: 'E' }],
    edges: [{ from: 'A', to: 'C' }, { from: 'B', to: 'C' }, { from: 'C', to: 'D' }, { from: 'C', to: 'E' }],
  };
  assert.deepStrictEqual(layoutTopology(g), layoutTopology(g));
});

check('totality: every input node appears exactly once; per-rank orders are 0..k-1 distinct', () => {
  const g = {
    nodes: [{ id: 'A' }, { id: 'B' }, { id: 'C' }, { id: 'D' }],
    edges: [{ from: 'A', to: 'C' }, { from: 'B', to: 'C' }, { from: 'A', to: 'D' }],
  };
  const L = layoutTopology(g);
  assert.deepStrictEqual(idSet(L), new Set(['A', 'B', 'C', 'D']));
  assert.strictEqual(L.nodes.length, 4); // no duplication
  const byRank = new Map();
  for (const n of L.nodes) { if (!byRank.has(n.rank)) byRank.set(n.rank, []); byRank.get(n.rank).push(n.order); }
  for (const orders of byRank.values()) {
    assert.deepStrictEqual(orders.slice().sort((a, b) => a - b), orders.map((_, i) => i), 'orders not 0..k-1 distinct');
  }
});

check('passthrough: non-id node fields survive the layout (label, kind, diff)', () => {
  const g = { nodes: [{ id: 'A', label: 'lexer', kind: 'group', diff: 'added' }], edges: [] };
  const [n] = layoutTopology(g).nodes;
  assert.strictEqual(n.label, 'lexer');
  assert.strictEqual(n.kind, 'group');
  assert.strictEqual(n.diff, 'added');
});

// ── coordinates (grid: y increases with rank; same-rank nodes get distinct x) ─────────────────────

check('coordinates: y strictly increases with rank; same-rank nodes have distinct x', () => {
  const g = {
    nodes: [{ id: 'A' }, { id: 'B' }, { id: 'C' }],
    edges: [{ from: 'A', to: 'C' }, { from: 'B', to: 'C' }], // A,B rank0; C rank1
  };
  const r = byId(layoutTopology(g));
  assert.ok(r.get('C').y > r.get('A').y, 'higher rank did not get larger y');
  assert.notStrictEqual(r.get('A').x, r.get('B').x, 'same-rank nodes share an x');
  for (const n of layoutTopology(g).nodes) {
    assert.ok(Number.isFinite(n.x) && Number.isFinite(n.y), 'non-finite coordinate');
  }
});

check('ranks/width/height: the bounding box matches the actual rank/order extents (non-degenerate input)', () => {
  // A,B rank0 (2 orders); C,D rank1 (2 orders, C fed by both A and B, D fed by A); E rank2 (1 order).
  const g = {
    nodes: [{ id: 'A' }, { id: 'B' }, { id: 'C' }, { id: 'D' }, { id: 'E' }],
    edges: [{ from: 'A', to: 'C' }, { from: 'B', to: 'C' }, { from: 'A', to: 'D' }, { from: 'C', to: 'E' }],
  };
  const L = layoutTopology(g);
  const r = byId(L);

  // `ranks` is a COUNT: one past the highest rank actually assigned to a node — not the max rank
  // itself. Derive the max rank from the nodes' own `rank` field (never from `L.ranks` circularly).
  const maxRank = Math.max(...L.nodes.map((n) => n.rank));
  assert.strictEqual(L.ranks, maxRank + 1, 'ranks did not equal (max rank + 1)');

  // Derive the grid's per-step x/y spacing from the layout's OWN output — never a hardcoded
  // XGAP/YGAP (those are cosmetic constants local to lib/topology-view.mjs, not exported). Rank 0
  // holds two nodes (A, B) at two distinct orders, so their x's differ by exactly one order-step;
  // A (rank0) and C (rank1) are adjacent ranks, so their y's differ by exactly one rank-step.
  const rank0xs = L.nodes.filter((n) => n.rank === 0).map((n) => n.x).sort((a, b) => a - b);
  const xStep = rank0xs[1] - rank0xs[0];
  const yStep = r.get('C').y - r.get('A').y;
  assert.ok(xStep > 0, 'could not derive a positive x order-step from the fixture');
  assert.ok(yStep > 0, 'could not derive a positive y rank-step from the fixture');

  // width/height are the bounding box: (max order + 1) / (max rank + 1) steps — exactly the box
  // that contains every node, no more, no less. An off-by-one (dropped or extra `+1`) on either
  // formula throws this off by exactly one step, which this equality catches both ways.
  const maxOrder = Math.max(...L.nodes.map((n) => n.order));
  assert.strictEqual(L.width, (maxOrder + 1) * xStep, 'width is not (max order + 1) steps wide');
  assert.strictEqual(L.height, (maxRank + 1) * yStep, 'height is not (max rank + 1) steps tall');
});

// ── cycle-safety (defensive; never hangs, never throws — plan Flag 5) ─────────────────────────────

check('cycle-safety: a 2-cycle A→B→A lays out without hanging and keeps both nodes', () => {
  const g = { nodes: [{ id: 'A' }, { id: 'B' }], edges: [{ from: 'A', to: 'B' }, { from: 'B', to: 'A' }] };
  const L = layoutTopology(g);
  assert.deepStrictEqual(idSet(L), new Set(['A', 'B'])); // both survive; no throw, no infinite loop
});

// ── degenerate input (shape-not-value; never throws) ──────────────────────────────────────────────

check('empty and undefined subgraphs yield an empty layout, never throw', () => {
  assert.deepStrictEqual(layoutTopology({ nodes: [], edges: [] }), { nodes: [], edges: [], ranks: 0, width: 0, height: 0 });
  assert.deepStrictEqual(layoutTopology(undefined), { nodes: [], edges: [], ranks: 0, width: 0, height: 0 });
});

check('a dangling edge (naming a node absent from nodes) is ignored, never fabricates a node', () => {
  const g = { nodes: [{ id: 'A' }], edges: [{ from: 'A', to: 'ghost' }] };
  const L = layoutTopology(g);
  assert.deepStrictEqual(idSet(L), new Set(['A']));
});

if (process.exitCode) console.error(`\ntopology-layout: FAILURES above (${passed} passed).`);
else console.log(`\ntopology-layout: all ${passed} checks pass. ✓`);
