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

// renderTopologyHtml(graph, { view, goalId?, lastRatified?, legibility? }) -> a self-contained HTML
// string (inline SVG + inline <style> + inline vanilla <script>; NO CDN, NO npm — §5.3 + Law 1). Three
// views: 'component' (the containment top-level quotient via liftEdges), 'cone' (the atoms serving one
// goal), 'diff' (component quotient color-coded added/retired/rewired against lastRatified). Pure: returns
// a string; the caller writes topology.html (P7 wires the producer). Never throws on thin input.

const NODE_W = 120;
const NODE_H = 40;

function esc(v) {
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// component quotient: nodes = the containment tree's top-level groups (components); edges = the atom
// edges lifted to those groups (serves edges point at goals, not components, so liftEdges drops them).
function componentProjection(graph) {
  const containment = (graph && graph.containment) || { id: '', kind: 'root', children: [] };
  const nodes = (containment.children || []).map((c) => ({ id: c.id, label: c.id, kind: 'component' }));
  const edges = liftEdges(containment, (graph && graph.edges) || [], '');
  return { nodes, edges };
}

// per-goal cone: the atoms with a `serves` edge to goalId, plus the goal node; edges = needs among them
// plus the serves edges into the goal. An unknown/empty goal → an empty diagram (never throws).
function coneProjection(graph, goalId) {
  const edges = (graph && graph.edges) || [];
  const serving = [...new Set(edges.filter((e) => e.edge === 'serves' && e.to === goalId).map((e) => e.from))];
  if (!serving.length) return { nodes: [], edges: [] };
  const set = new Set(serving);
  const nodes = serving.map((id) => ({ id, label: id, kind: 'atom' }));
  nodes.push({ id: goalId, label: goalId, kind: 'goal' });
  const coneEdges = [
    ...edges.filter((e) => e.edge === 'needs' && set.has(e.from) && set.has(e.to)),
    ...edges.filter((e) => e.edge === 'serves' && e.to === goalId),
  ];
  return { nodes, edges: coneEdges };
}

// diff: the component quotient of `graph` vs `lastRatified`, each node/edge tagged. added (current-only),
// retired (last-only), rewired (an edge present-in-current-only or kind-changed, both endpoints
// surviving), unchanged otherwise.
function diffProjection(graph, lastRatified) {
  const cur = componentProjection(graph);
  const prev = componentProjection(lastRatified);
  const prevNodes = new Set(prev.nodes.map((n) => n.id));
  const curNodes = new Set(cur.nodes.map((n) => n.id));
  const key = (e) => `${e.from} ${e.to}`;
  const prevEdges = new Map(prev.edges.map((e) => [key(e), e]));
  const curEdges = new Map(cur.edges.map((e) => [key(e), e]));

  const nodes = [
    ...cur.nodes.map((n) => ({ ...n, diff: prevNodes.has(n.id) ? 'unchanged' : 'added' })),
    ...prev.nodes.filter((n) => !curNodes.has(n.id)).map((n) => ({ ...n, diff: 'retired' })),
  ];
  const edges = [
    ...cur.edges.map((e) => {
      const p = prevEdges.get(key(e));
      const surviving = prevNodes.has(e.from) && prevNodes.has(e.to);
      let diff = 'unchanged';
      if (!p) diff = surviving ? 'rewired' : 'added';
      else if (p.edge !== e.edge) diff = 'rewired';
      return { ...e, diff };
    }),
    ...prev.edges.filter((e) => !curEdges.has(key(e))).map((e) => ({ ...e, diff: 'retired' })),
  ];
  return { nodes, edges };
}

function project(graph, view, goalId, lastRatified) {
  if (view === 'cone') return coneProjection(graph, goalId);
  if (view === 'diff') return diffProjection(graph, lastRatified || { containment: { id: '', kind: 'root', children: [] }, atoms: [], edges: [] });
  return componentProjection(graph); // 'component' and the unknown-view fallback
}

// findings -> a lookup from a node id to its finding kind (only kinds that carry a node/component locator)
function findingIndex(legibility) {
  const map = new Map();
  for (const f of legibility || []) {
    const id = f.nodeId || f.component;
    if (id != null) map.set(id, f.kind);
  }
  return map;
}

export function renderTopologyHtml(graph, { view = 'component', goalId, lastRatified, legibility } = {}) {
  const projected = project(graph, view, goalId, lastRatified);
  const layout = layoutTopology(projected);
  const pos = new Map(layout.nodes.map((n) => [n.id, n]));
  const findings = findingIndex(legibility);

  const cx = (n) => n.x + NODE_W / 2;
  const cy = (n) => n.y + NODE_H / 2;

  const edgeSvg = layout.edges.map((e) => {
    const a = pos.get(e.from);
    const b = pos.get(e.to);
    if (!a || !b) return '';
    const diffAttr = e.diff ? ` data-diff="${esc(e.diff)}"` : '';
    const cls = `edge edge-${esc(e.edge || 'dep')}${e.diff ? ` diff-${esc(e.diff)}` : ''}`;
    return `<line class="${cls}" data-edge-kind="${esc(e.edge || 'dep')}"${diffAttr} `
      + `x1="${cx(a)}" y1="${cy(a)}" x2="${cx(b)}" y2="${cy(b)}" />`;
  }).join('\n    ');

  const nodeSvg = layout.nodes.map((n) => {
    const diffAttr = n.diff ? ` data-diff="${esc(n.diff)}"` : '';
    const finding = findings.get(n.id);
    const findAttr = finding ? ` data-finding="${esc(finding)}"` : '';
    const cls = `node node-${esc(n.kind || 'node')}${n.diff ? ` diff-${esc(n.diff)}` : ''}${finding ? ' flagged' : ''}`;
    return `<g class="${cls}" data-node-id="${esc(n.id)}"${diffAttr}${findAttr} transform="translate(${n.x},${n.y})">`
      + `<rect width="${NODE_W}" height="${NODE_H}" rx="6" />`
      + `<text x="${NODE_W / 2}" y="${NODE_H / 2}" dominant-baseline="central" text-anchor="middle">${esc(n.label != null ? n.label : n.id)}</text>`
      + `</g>`;
  }).join('\n    ');

  const w = Math.max(layout.width + NODE_W, NODE_W);
  const h = Math.max(layout.height + NODE_H, NODE_H);
  const title = `topology — ${esc(view)}${view === 'cone' && goalId ? ` (${esc(goalId)})` : ''}`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; font: 13px system-ui, sans-serif; }
  .topology { padding: 12px; }
  svg { max-width: 100%; height: auto; }
  .node rect { fill: #eef; stroke: #557; stroke-width: 1.5; }
  .node text { fill: #113; }
  .node-goal rect { fill: #efe; stroke: #575; }
  .edge { stroke: #889; stroke-width: 1.5; fill: none; }
  .edge-serves { stroke-dasharray: 4 3; }
  .node.flagged rect { stroke: #a50; stroke-width: 3; }
  .diff-added rect, line.diff-added { stroke: #2a7; }
  .diff-retired rect, line.diff-retired { stroke: #c33; stroke-dasharray: 5 4; }
  .diff-rewired rect, line.diff-rewired { stroke: #d90; }
  .diff-unchanged rect { stroke: #99a; }
  .node.hi rect { stroke-width: 3; }
</style>
</head>
<body>
<div class="topology">
<h1>${title}</h1>
<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${title}">
    ${edgeSvg}
    ${nodeSvg}
</svg>
</div>
<script>
  var nodes = document.querySelectorAll('.node');
  nodes.forEach(function (g) {
    g.addEventListener('mouseenter', function () { g.classList.add('hi'); });
    g.addEventListener('mouseleave', function () { g.classList.remove('hi'); });
  });
</script>
</body>
</html>`;
}
