// lib/graph.mjs — the containment-tree fold, dependency-edge computation
// (needs/excludes/serves/informs), edge lifting, and the as-lived/current graph projections
// (DESIGN-3.0 §2, §2.1-§2.4, reasonable 3.0 Part 4). This file has two sections: PURE (this one —
// zero I/O, takes only in-memory atom records) and I/O (appended by T02b, below the marker comment
// — reads the ledger via lib/atom.mjs's foldAtomsFromEvents and live contracts via
// lib/contract.mjs). Dependency edges are always DERIVED here, never read off an `effects` entry —
// nothing in this codebase has ever written one (design doc's central scoping fact).

// ── containment tree (DESIGN-3.0 §2.1) ──────────────────────────────────────

export function containmentTree(atoms, { ownershipMap } = {}) {
  const root = { id: '', kind: 'root', children: [] };
  const groups = new Map(); // cumulative path -> group node, de-duplicates shared ancestors

  function groupNodeFor(path) {
    const segments = path.split('/');
    let parent = root;
    let cur = '';
    for (const seg of segments) {
      cur = cur ? `${cur}/${seg}` : seg;
      if (!groups.has(cur)) {
        const node = { id: cur, kind: 'group', children: [] };
        parent.children.push(node);
        groups.set(cur, node);
      }
      parent = groups.get(cur);
    }
    return parent;
  }

  for (const atom of atoms) {
    const path = (ownershipMap && ownershipMap[atom.component]) || atom.component;
    const parent = groupNodeFor(path);
    parent.children.push({ id: atom.id, kind: 'atom', children: [] });
  }
  return root;
}

// ── needs (DESIGN-3.0 §2.2) ──────────────────────────────────────────────────

/** clauseId -> atom.id that introduces it — the shared lookup `needsEdges` and `servesEdges` both
 *  need, extracted so neither re-derives its own copy. */
function providerMap(atoms) {
  const map = new Map();
  for (const atom of atoms) {
    for (const clause of atom.deltaClauses || []) map.set(clause.clauseId, atom.id);
  }
  return map;
}

export function needsEdges(atoms) {
  const providerOf = providerMap(atoms);
  const edges = [];
  const seen = new Set();
  for (const atom of atoms) {
    for (const clause of atom.deltaClauses || []) {
      for (const citation of clause.citations || []) {
        const providerId = providerOf.get(citation.clause);
        if (!providerId || providerId === atom.id) continue;
        const key = `${atom.id} ${providerId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        edges.push({ from: atom.id, to: providerId, edge: 'needs', op: 'add' });
      }
    }
  }
  return edges;
}

// ── the ledger-native citation graph (feeds excludes; both projections) ────

export function ledgerCitationGraph(atoms) {
  const graph = {};
  for (const atom of atoms) {
    const set = graph[atom.component] || (graph[atom.component] = new Set());
    for (const clause of atom.deltaClauses || []) {
      for (const citation of clause.citations || []) set.add(citation.component);
    }
  }
  const result = {};
  for (const [component, set] of Object.entries(graph)) result[component] = [...set];
  return result;
}

export function citationClosureOver(citationGraph, seeds) {
  const seen = new Set();
  const stack = [...seeds];
  while (stack.length) {
    const c = stack.pop();
    if (seen.has(c)) continue;
    seen.add(c);
    for (const dep of citationGraph[c] || []) if (!seen.has(dep)) stack.push(dep);
  }
  return [...seen];
}

// ── excludes (DESIGN-3.0 §2.2) ───────────────────────────────────────────────

/** Literal directory prefix of a glob (up to the first wildcard) — same algorithm as
 *  lib/footprint.mjs's private `prefix` / lib/atom.mjs's private `globPrefix`, reimplemented here
 *  since neither is exported (design doc Decision 4). */
function globPrefix(glob) {
  const star = glob.search(/[*?]/);
  if (star !== -1) return glob.slice(0, star).replace(/\/[^/]*$/, '');
  return glob.endsWith('/') ? glob.slice(0, -1) : glob;
}

/** True iff any glob in `a` overlaps (ancestor-or-equal prefix) any glob in `b` — same
 *  conservative rule as lib/footprint.mjs's private `lociOverlap`. */
function lociOverlap(a, b) {
  for (const ga of a) for (const gb of b) {
    const pa = globPrefix(ga), pb = globPrefix(gb);
    if (pa === '' || pb === '') return true;
    if (pa === pb) return true;
    if ((pa + '/').startsWith(pb + '/') || (pb + '/').startsWith(pa + '/')) return true;
    if (ga === gb) return true;
  }
  return false;
}

function atomLocus(atom) {
  const deltaLoci = (atom.deltaClauses || []).flatMap((c) => c.locus || []);
  return deltaLoci.length ? deltaLoci : (atom.locus || []);
}

function atomFootprint(atom, citationGraph) {
  const citedComponents = (atom.deltaClauses || []).flatMap((c) => (c.citations || []).map((ci) => ci.component));
  const seeds = [atom.component, ...citedComponents];
  return {
    locus: atomLocus(atom),
    contracts: citationClosureOver(citationGraph, seeds),
    resources: [], // no atom field carries resource claims yet — design doc Decision 4, a named gap
  };
}

function intersect(a, b) { return a.filter((x) => b.includes(x)); }

export function excludesEdges(atoms, { citationGraph = {} } = {}) {
  const footprints = atoms.map((atom) => ({ id: atom.id, ...atomFootprint(atom, citationGraph) }));
  const edges = [];
  for (let i = 0; i < footprints.length; i += 1) {
    for (let j = i + 1; j < footprints.length; j += 1) {
      const fa = footprints[i], fb = footprints[j];
      const excludes = lociOverlap(fa.locus, fb.locus)
        || intersect(fa.contracts, fb.contracts).length > 0
        || intersect(fa.resources, fb.resources).length > 0;
      if (excludes) {
        const [from, to] = fa.id < fb.id ? [fa.id, fb.id] : [fb.id, fa.id];
        edges.push({ from, to, edge: 'excludes', op: 'add' });
      }
    }
  }
  return edges;
}

// ── serves / informs (DESIGN-3.0 §2.2, design doc Decision 7) ──────────────

export function servesEdges(atoms, goals = []) {
  if (!goals.length) return [];
  const needs = needsEdges(atoms); // {from needs to} — "to" provides for "from"
  const providerOf = providerMap(atoms);
  const edges = [];
  for (const goal of goals) {
    const servesSet = new Set();
    const stack = (goal.scenarioCitations || []).map((c) => providerOf.get(c.clause)).filter(Boolean);
    while (stack.length) {
      const atomId = stack.pop();
      if (servesSet.has(atomId)) continue;
      servesSet.add(atomId);
      edges.push({ from: atomId, to: goal.id, edge: 'serves', op: 'add' });
      for (const e of needs) if (e.from === atomId) stack.push(e.to);
    }
  }
  return edges;
}

export function informsEdges(atoms, spikeInforms = []) {
  const atomIds = new Set(atoms.map((a) => a.id));
  return spikeInforms
    .filter((s) => atomIds.has(s.atomId))
    .map((s) => ({ from: s.spikeId, to: s.atomId, edge: 'informs', op: 'add' }));
}

// ── edge lifting (DESIGN-3.0 §2.3) ──────────────────────────────────────────

function findNode(node, id) {
  if (node.id === id) return node;
  for (const child of node.children) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

function collectAtomIds(node) {
  const ids = new Set();
  (function walk(n) {
    if (n.kind === 'atom') ids.add(n.id);
    for (const child of n.children) walk(child);
  })(node);
  return ids;
}

export function liftEdges(tree, edges, viewNodeId) {
  const view = findNode(tree, viewNodeId);
  if (!view) return [];
  const memberSets = view.children.map((child) => ({ id: child.id, members: collectAtomIds(child) }));
  const lifted = [];
  const seen = new Set();
  for (let i = 0; i < memberSets.length; i += 1) {
    for (let j = 0; j < memberSets.length; j += 1) {
      if (i === j) continue;
      const a = memberSets[i], b = memberSets[j];
      for (const e of edges) {
        if (a.members.has(e.from) && b.members.has(e.to)) {
          const key = `${a.id} ${b.id} ${e.edge}`;
          if (seen.has(key)) continue;
          seen.add(key);
          lifted.push({ from: a.id, to: b.id, edge: e.edge });
        }
      }
    }
  }
  return lifted;
}

// ── I/O functions appended by T02b (see shared/conventions.md — do not edit above this line) ──

import { foldAtomsFromEvents } from './atom.mjs';
import { readJsonl } from './effort.mjs';
import { join } from 'node:path';
import { citationGraph as liveCitationGraph } from './contract.mjs';

function ledgerPath(effortRoot) {
  return join(effortRoot, '.reasonable', 'ledger.jsonl');
}

export function foldAsLived(effortRoot, { uptoSeq } = {}) {
  const events = readJsonl(ledgerPath(effortRoot))
    .filter((e) => uptoSeq === undefined || e.seq <= uptoSeq);
  const folded = foldAtomsFromEvents(events);
  const atoms = Object.values(folded);
  const containment = containmentTree(atoms);
  const graph = ledgerCitationGraph(atoms);
  const edges = [
    ...needsEdges(atoms),
    ...excludesEdges(atoms, { citationGraph: graph }),
  ];
  return { containment, atoms, edges };
}

export function deriveCurrent(effortRoot, { goals = [], spikeInforms = [] } = {}) {
  const events = readJsonl(ledgerPath(effortRoot));
  const folded = foldAtomsFromEvents(events);
  const atoms = Object.values(folded);
  const containment = containmentTree(atoms);
  const graph = liveCitationGraph(effortRoot);
  const edges = [
    ...needsEdges(atoms),
    ...excludesEdges(atoms, { citationGraph: graph }),
    ...servesEdges(atoms, goals),
    ...informsEdges(atoms, spikeInforms),
  ];
  return { containment, atoms, edges };
}

function edgeKey(e) { return `${e.from} ${e.to} ${e.edge}`; }

export function graphDivergence(effortRoot) {
  const asLived = foldAsLived(effortRoot);
  const current = deriveCurrent(effortRoot);
  const asLivedIds = new Set(asLived.atoms.map((a) => a.id));
  const currentIds = new Set(current.atoms.map((a) => a.id));
  const asLivedEdgeMap = new Map(asLived.edges.map((e) => [edgeKey(e), e]));
  const currentEdgeMap = new Map(current.edges.map((e) => [edgeKey(e), e]));

  return {
    nodesOnlyAsLived: [...asLivedIds].filter((id) => !currentIds.has(id)),
    nodesOnlyCurrent: [...currentIds].filter((id) => !asLivedIds.has(id)),
    edgesOnlyAsLived: [...asLivedEdgeMap.entries()].filter(([k]) => !currentEdgeMap.has(k)).map(([, e]) => e),
    edgesOnlyCurrent: [...currentEdgeMap.entries()].filter(([k]) => !asLivedEdgeMap.has(k)).map(([, e]) => e),
  };
}
