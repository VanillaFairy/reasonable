# T01b — Legibility-law impl (green)

**role:** green
**Depends on:** T01a
**Owns (stage only these):** `lib/legibility.mjs`

> **Read first:** `../shared/interfaces.md`, `../shared/conventions.md`. You are the `green` role:
> **make the locked tests pass; write no tests.** `test/legibility.test.mjs` is **READ-ONLY — do not
> modify it.** If a test looks wrong, STOP and escalate to the supervisor; do not edit it to fit your
> implementation.

**Files:**
- Create: `lib/legibility.mjs`

- [ ] **Step 1: Read the locked tests**

Read `test/legibility.test.mjs` end to end. Note: fixtures are hand-built `{ containment, atoms, edges }`
graphs (via `containmentTree`) and a synthetic `policy` literal; density is `lifted / (C*(C-1))`; the
guard returns a strict-reduction boolean; every finding is `{ kind, metric, threshold, <locator> }`.

- [ ] **Step 2: Create `lib/legibility.mjs` with exactly this content**

```js
// lib/legibility.mjs — the legibility law (DESIGN-3.0 §5.2, reasonable 3.0 Part 6b). A PURE calculus
// over lib/graph.mjs's output: it measures the SHAPE of a graph against pinned policy thresholds and
// emits findings, plus the density-reduction guard that validates a regrouping proposal. It reads
// whatever graph.edges carries (P6a's planned edges at genesis, actual edges post-delta) — it is
// edge-source-agnostic; which fidelity to feed is the caller's (P7's) concern, never this file's.
//
// Two exports:
//   legibilityFindings(graph, policy) -> Finding[]            — width / tangle / coupling / chain
//   regroupingReducesTangle(proposal, tree, edges) -> boolean — R8's density-reduction guard
//
// A Finding is { kind, metric, threshold, <locator> } and is drop-in usable as the `proposal` of an
// R8 `illegible` verdict lib/rewrite.mjs already consumes (that rule threads `proposal` through
// opaquely, so this file OWNS the finding grammar; the composition is pinned by a test).
//
// Law 1 (dependency-free): the ONLY import is the pure liftEdges from graph.mjs. NOT effects.mjs (the
// tests' validator, not a lib dep), NOT rewrite.mjs (would risk an import cycle; the composition is
// one-directional), NOT policy.mjs (Decision 3 keeps the coupling at the object-shape level; the live
// policy wire is P7's). A missing/non-finite threshold DISABLES its check — never a fabricated default.

import { liftEdges } from './graph.mjs';

const finite = (v) => typeof v === 'number' && Number.isFinite(v);

// ── local tree helpers (graph.mjs's findNode/collectAtomIds are not exported; reimplement the two
//    tiny walks locally — the same call graph.mjs made reimplementing footprint.mjs's globPrefix) ──

function findNode(node, id) {
  if (!node) return null;
  if (node.id === id) return node;
  for (const child of node.children || []) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

function collectAtomIds(node) {
  const ids = new Set();
  (function walk(n) {
    if (n.kind === 'atom') ids.add(n.id);
    for (const child of n.children || []) walk(child);
  })(node);
  return ids;
}

function walkNodes(root) {
  const out = [];
  (function walk(n) { out.push(n); for (const child of n.children || []) walk(child); })(root);
  return out;
}

// ── 1. bounded width ──────────────────────────────────────────────────────────
function widthFindings(containment, maxWidth) {
  if (!finite(maxWidth) || !containment) return [];
  const findings = [];
  for (const node of walkNodes(containment)) {
    const w = (node.children || []).length;
    if (w > maxWidth) findings.push({ kind: 'over-wide', nodeId: node.id, metric: w, threshold: maxWidth });
  }
  return findings;
}

// ── 2. bounded tangle: cross-sibling density = distinct lifted edges / ordered sibling pairs ──
function tangleFindings(containment, edges, maxTangle) {
  if (!finite(maxTangle) || !containment) return [];
  const findings = [];
  for (const node of walkNodes(containment)) {
    const C = (node.children || []).length;
    if (C < 2) continue;
    const lifted = liftEdges(containment, edges || [], node.id);
    const density = lifted.length / (C * (C - 1));
    if (density > maxTangle) findings.push({ kind: 'over-tangled', nodeId: node.id, metric: density, threshold: maxTangle });
  }
  return findings;
}

// ── 3a. cross-cone coupling: cones from serves edges; density over exclusive members ──
function conesOf(edges) {
  const cones = new Map(); // goalId -> Set(atomId that serves it)
  for (const e of edges || []) {
    if (e.edge !== 'serves') continue;
    if (!cones.has(e.to)) cones.set(e.to, new Set());
    cones.get(e.to).add(e.from);
  }
  return cones;
}

function crossConeCouplingFindings(graph, maxCoupling) {
  if (!finite(maxCoupling)) return [];
  const cones = conesOf(graph.edges);
  const goals = [...cones.keys()].sort();
  const needs = (graph.edges || []).filter((e) => e.edge === 'needs');
  const findings = [];
  for (let i = 0; i < goals.length; i += 1) {
    for (let j = i + 1; j < goals.length; j += 1) {
      const A = cones.get(goals[i]);
      const B = cones.get(goals[j]);
      const exA = new Set([...A].filter((x) => !B.has(x)));
      const exB = new Set([...B].filter((x) => !A.has(x)));
      if (exA.size === 0 || exB.size === 0) continue;
      let cross = 0;
      for (const e of needs) {
        if ((exA.has(e.from) && exB.has(e.to)) || (exB.has(e.from) && exA.has(e.to))) cross += 1;
      }
      const density = cross / (2 * exA.size * exB.size);
      if (density > maxCoupling) {
        findings.push({ kind: 'cross-cone-coupling', cones: [goals[i], goals[j]], metric: density, threshold: maxCoupling });
      }
    }
  }
  return findings;
}

// ── 3b. god-component fan-in: distinct source COMPONENTS depending into a component ──
function godComponentFindings(graph, maxFanIn) {
  if (!finite(maxFanIn)) return [];
  const byId = new Map((graph.atoms || []).map((a) => [a.id, a.component]));
  const sources = new Map(); // targetComponent -> Set(sourceComponent)
  for (const e of graph.edges || []) {
    if (e.edge !== 'needs') continue;
    const sc = byId.get(e.from);
    const dc = byId.get(e.to);
    if (!sc || !dc || sc === dc) continue;
    if (!sources.has(dc)) sources.set(dc, new Set());
    sources.get(dc).add(sc);
  }
  const findings = [];
  for (const comp of [...sources.keys()].sort()) {
    const fanIn = sources.get(comp).size;
    if (fanIn > maxFanIn) findings.push({ kind: 'god-component', component: comp, metric: fanIn, threshold: maxFanIn });
  }
  return findings;
}

// ── 4. chain smell: longest ACYCLIC needs-chain (cycle-safe; a real needs-cycle is R6's domain) ──
function chainFindings(edges, maxChain) {
  if (!finite(maxChain)) return [];
  const adj = new Map();
  const nodes = new Set();
  for (const e of edges || []) {
    if (e.edge !== 'needs') continue;
    nodes.add(e.from); nodes.add(e.to);
    if (!adj.has(e.from)) adj.set(e.from, []);
    adj.get(e.from).push(e.to);
  }
  const best = new Map();     // node -> { len, path } of the longest acyclic chain starting there
  const onStack = new Set();
  function longest(u) {
    if (best.has(u)) return best.get(u);
    onStack.add(u);
    let child = { len: 0, path: [] };
    for (const v of adj.get(u) || []) {
      if (onStack.has(v)) continue;            // ignore a back-edge into an on-stack node (cycle-safe)
      const c = longest(v);
      if (c.len > child.len) child = c;
    }
    onStack.delete(u);
    const result = { len: child.len + 1, path: [u, ...child.path] };
    best.set(u, result);
    return result;
  }
  let winner = { len: 0, path: [] };
  for (const u of nodes) {
    const c = longest(u);
    if (c.len > winner.len) winner = c;
  }
  if (winner.len > maxChain) return [{ kind: 'over-serialized', chain: winner.path, metric: winner.len, threshold: maxChain }];
  return [];
}

// ── the union: read thresholds from policy.legibility; each disabled if its threshold is absent ──
export function legibilityFindings(graph, policy) {
  const g = graph || {};
  const L = (policy && policy.legibility) || {};
  return [
    ...widthFindings(g.containment, L.maxWidth),
    ...tangleFindings(g.containment, g.edges, L.maxTangle),
    ...crossConeCouplingFindings(g, L.maxCoupling),
    ...godComponentFindings(g, L.maxFanIn),
    ...chainFindings(g.edges, L.maxChain),
  ];
}

// ── the density-reduction guard (R8's validator; DESIGN-3.0 §5.2) ─────────────────────────────────
// True iff the regrouping STRICTLY reduces the number of dependency edges that cross group boundaries
// at proposal.nodeId. The total edge count under the node is invariant across groupings, so a raw
// cross-group count comparison IS a density comparison — and empty grouping strata (which move no
// atom) provably leave the cross count unchanged, so they are rejected. This closes the boundary
// rewrite.mjs's R8 rule leaves open ("applied only if it reduces measured density").
export function regroupingReducesTangle(proposal, tree, edges) {
  if (!proposal || !tree) return false;
  const N = findNode(tree, proposal.nodeId);
  if (!N || !(N.children || []).length) return false;

  // childOf: atomId -> the id of N's direct child whose subtree contains it
  const childOf = new Map();
  for (const child of N.children) for (const atomId of collectAtomIds(child)) childOf.set(atomId, child.id);

  const map = proposal.groupOf || {};
  const groupOf = (atomId) => {
    const c = childOf.get(atomId);
    if (c === undefined) return undefined;
    return Object.prototype.hasOwnProperty.call(map, c) ? map[c] : c;
  };

  let currentCross = 0;
  let proposedCross = 0;
  for (const e of edges || []) {
    const cf = childOf.get(e.from);
    const ct = childOf.get(e.to);
    if (cf === undefined || ct === undefined) continue; // an edge not fully under N
    if (cf !== ct) currentCross += 1;
    if (groupOf(e.from) !== groupOf(e.to)) proposedCross += 1;
  }
  return proposedCross < currentCross;
}
```

- [ ] **Step 3: Run the tests to verify they pass**

Run: `node test/legibility.test.mjs`
Expected: `legibility: all N checks pass. ✓` (no `FAIL` line, exit 0).

- [ ] **Step 4: Run the full suite to confirm zero regressions**

Run: `for t in test/*.test.mjs; do node "$t"; done`
Expected: no `FAIL` line anywhere — this part is purely additive (one new file, one new import from the
already-shipped `graph.mjs`), so every pre-existing test still passes unchanged.

- [ ] **Step 5: Commit**

```bash
git add lib/legibility.mjs
git commit -m "feat(legibility): legibilityFindings + regroupingReducesTangle — the legibility law (green, P6b)"
```

**Do not modify the test file, `docs/`, the roadmap, `plugin.json`, or the README.** Docs are T02;
the roadmap status cell is T03.
