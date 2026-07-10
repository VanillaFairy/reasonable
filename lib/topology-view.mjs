// lib/topology-view.mjs — the `topology.html` generator (DESIGN-3.0 §5.3, reasonable 3.0 Part 6e). A
// PURE calculus in two halves: B1 (this one) the layered-DAG LAYOUT — longest-path ranks + barycenter
// cross-reduction — over a normalized { nodes, edges } subgraph; B2 (appended by T04b, below the marker)
// the self-contained HTML RENDERER that projects a graph into a view, lays it out here, and emits inline
// SVG + vanilla JS (no CDN, no npm). The ONLY import is the pure liftEdges from graph.mjs (the
// component-view quotient), exactly the single-import discipline lib/legibility.mjs holds. No I/O: both
// exports return a plain value; the caller writes the file (P7 wires the live producer). Law 1.

import { liftEdges } from './graph.mjs';

const XGAP = 160;
const YGAP = 90;

// ── B1. the layered-DAG layout ────────────────────────────────────────────────
//
// layoutTopology({ nodes:[{id,...}], edges:[{from,to,...}] }, opts?) ->
//   { nodes:[{...input, rank, order, x, y}], edges:[...kept input edges], ranks, width, height }
//
// Longest-path ranking: rank(n) = 0 for a source (no incoming edge), else 1 + max(rank(pred)). Then a
// barycenter sweep (down then up, `opts.passes` times) orders each rank to reduce crossings. Pure,
// deterministic (stable tie-break by original index), cycle-safe (a back-edge into an on-stack node
// contributes nothing — never hangs, never throws; a cycle VERDICT is R6's job, not the renderer's).
export function layoutTopology(subgraph, opts = {}) {
  const nodes = (subgraph && subgraph.nodes) || [];
  const rawEdges = (subgraph && subgraph.edges) || [];
  if (!nodes.length) return { nodes: [], edges: [], ranks: 0, width: 0, height: 0 };

  const ids = new Set(nodes.map((n) => n.id));
  const edges = rawEdges.filter((e) => e && ids.has(e.from) && ids.has(e.to)); // drop dangling edges

  const succ = new Map();
  const preds = new Map();
  for (const id of ids) { succ.set(id, []); preds.set(id, []); }
  for (const e of edges) { succ.get(e.from).push(e.to); preds.get(e.to).push(e.from); }

  // longest-path rank, memoized, cycle-safe
  const rank = new Map();
  const onStack = new Set();
  function rankOf(u) {
    if (rank.has(u)) return rank.get(u);
    if (onStack.has(u)) return 0;            // back-edge into an on-stack node: contributes nothing
    onStack.add(u);
    let best = 0;
    for (const p of preds.get(u)) best = Math.max(best, rankOf(p) + 1);
    onStack.delete(u);
    rank.set(u, best);
    return best;
  }
  for (const n of nodes) rankOf(n.id);

  // initial per-rank order = input insertion order within the rank
  const ranksMap = new Map();               // rank -> [id] in current order
  for (const n of nodes) {
    const rk = rank.get(n.id);
    if (!ranksMap.has(rk)) ranksMap.set(rk, []);
    ranksMap.get(rk).push(n.id);
  }

  const orderOf = new Map();
  const reindex = () => { for (const arr of ranksMap.values()) arr.forEach((id, i) => orderOf.set(id, i)); };
  reindex();

  // barycenter cross-reduction: order each rank by the average position of its neighbors in the
  // adjacent rank; sweep down (by predecessors) then up (by successors), a few passes.
  const bary = (id, neighborMap) => {
    const ns = neighborMap.get(id);
    if (!ns || !ns.length) return orderOf.get(id);      // no neighbor: hold position
    let s = 0;
    for (const m of ns) s += orderOf.get(m);
    return s / ns.length;
  };
  const sweep = (ranksInOrder, neighborMap) => {
    for (const rk of ranksInOrder) {
      const arr = ranksMap.get(rk);
      if (!arr || arr.length < 2) continue;
      const keyed = arr.map((id, i) => ({ id, k: bary(id, neighborMap), i }));
      keyed.sort((a, b) => (a.k - b.k) || (a.i - b.i)); // stable: original index breaks ties
      const sorted = keyed.map((x) => x.id);
      ranksMap.set(rk, sorted);
      sorted.forEach((id, i) => orderOf.set(id, i));      // update immediately so the next rank sees it
    }
  };
  const passes = Number.isInteger(opts.passes) ? opts.passes : 4;
  const asc = [...ranksMap.keys()].sort((a, b) => a - b);
  const desc = asc.slice().reverse();
  for (let p = 0; p < passes; p += 1) {
    sweep(asc, preds);   // down: order rank r by its predecessors (rank r-1)
    sweep(desc, succ);   // up:   order rank r by its successors  (rank r+1)
  }

  const maxRank = asc[asc.length - 1];
  let maxOrder = 0;
  const outNodes = nodes.map((n) => {
    const rk = rank.get(n.id);
    const ord = orderOf.get(n.id);
    if (ord > maxOrder) maxOrder = ord;
    return { ...n, rank: rk, order: ord, x: ord * XGAP, y: rk * YGAP };
  });

  return {
    nodes: outNodes,
    edges,
    ranks: maxRank + 1,
    width: (maxOrder + 1) * XGAP,
    height: (maxRank + 1) * YGAP,
  };
}

// ── B2. renderTopologyHtml appended by T04b — do not edit above this line ──
