# Task T02b: Structural verdicts impl (green)

**Role:** `green` — append the T02 section to `lib/rewrite.mjs`, strictly below T01b's marker
(`// ── structural verdicts (R2/R3/R5/R6/R7) appended by T02b … ──`). Do not modify any test file,
and do not edit anything above that marker.

## References
- Read: `../shared/interfaces.md` (in full), `../shared/conventions.md`, `../knowledge/running-tests.md`
- Read: `test/rewrite-structural.test.mjs` (T02a's locked tests)
- Read: `lib/rewrite.mjs` in full (T01b's real section — you reuse its in-scope `atomById`,
  `transition`, `routeRefutedPremise`, and the `citationClosureOver` import)

## Dependencies
- Depends on: T02a (locked tests), T01b (the section you append to)
- Depended on by: T02c (audits), T03b (appends below your marker)

## Scope
**Files:**
- Modify: `lib/rewrite.mjs` (append only, strictly below T01b's marker)

**BOUNDARY — you MUST NOT modify any files outside this list.** Do NOT modify
`test/rewrite-structural.test.mjs` — locked. Do NOT edit anything above the marker. Do NOT edit
`lib/effects.mjs`/`lib/atom.mjs`/`lib/graph.mjs`.

## Positive Constraints (DO)
- Append `scc`, `dependentCone`, and the five rules `ruleDeadEnd`/`ruleRipple`/
  `ruleUnknownBlocking`/`ruleCycleDetected`/`ruleParityBreach`, each registered into `RULES`.
- Reuse T01's in-scope helpers (`atomById`, `transition`, `routeRefutedPremise`) and the
  `citationClosureOver` import — do NOT re-import or re-define them.
- End with the T03b marker comment (Step 1).

## Negative Constraints (DO NOT)
- Do NOT implement ceremony/unwind/R8 (T03b). Do NOT do any I/O. Do NOT re-declare `RULES`,
  `atomById`, `transition`, or re-import anything already imported in the T01 section.

## Implementation Steps

### Step 1: Append the T02 section to `lib/rewrite.mjs`

Immediately after the `// ── structural verdicts (R2/R3/R5/R6/R7) appended by T02b … ──` marker,
append:

```js

// scc — strongly-connected components over a directed edge list [{from,to},...] (Kosaraju; no deps,
// Law 1). Returns an array of components, each an array of node ids; a component of size > 1 is a
// cycle. (reasonable 3.0 Part 5 — R6's mechanical cycle detection.)
export function scc(edges) {
  const adj = new Map(), radj = new Map(), nodes = new Set();
  const push = (m, k, v) => { const a = m.get(k); if (a) a.push(v); else m.set(k, [v]); };
  for (const { from, to } of edges || []) {
    nodes.add(from); nodes.add(to);
    push(adj, from, to); push(radj, to, from);
  }
  const order = [], seen = new Set();
  const dfs1 = (u) => { seen.add(u); for (const v of adj.get(u) || []) if (!seen.has(v)) dfs1(v); order.push(u); };
  for (const n of nodes) if (!seen.has(n)) dfs1(n);
  const comp = new Map(), groups = [];
  const dfs2 = (u, g) => { comp.set(u, g); groups[g].push(u); for (const v of radj.get(u) || []) if (!comp.has(v)) dfs2(v, g); };
  let g = 0;
  for (let i = order.length - 1; i >= 0; i -= 1) {
    const u = order[i];
    if (!comp.has(u)) { groups[g] = []; dfs2(u, g); g += 1; }
  }
  return groups;
}

// dependentCone — every atom that transitively NEEDS atomId (reverse-reachability over the `needs`
// subset of edges). Returns a Set of atom ids, EXCLUDING atomId itself. (R7's dependent cone.)
export function dependentCone(atomId, edges) {
  const needs = (edges || []).filter((e) => e.edge === 'needs');
  const cone = new Set();
  let frontier = [atomId];
  while (frontier.length) {
    const next = [];
    for (const cur of frontier) {
      for (const e of needs) {
        if (e.to === cur && !cone.has(e.from)) { cone.add(e.from); next.push(e.from); }
      }
    }
    frontier = next;
  }
  return cone;
}

function citedComponents(atom) {
  return (atom.deltaClauses || []).flatMap((c) => (c.citations || []).map((ci) => ci.component));
}

// ── R2 dead-end ─────────────────────────────────────────────────────────────
// Provisional: atom → retired-pending; blast radius = widen-only citation closure of the refuted
// premise's component; every OTHER atom whose footprint closure intersects the radius freezes.
// Permanent: retirement stamped; a consumer-first amendment charter-intent for the amendment-class
// routes. Route via the §7.1 ladder.
function ruleDeadEnd(verdict, state) {
  const { atomId, premise } = verdict;
  const atom = atomById(state, atomId);
  if (!atom) return { error: `dead-end: unknown atomId ${JSON.stringify(atomId)}` };
  if (!isValidTransition(atom.state, 'retired-pending')) {
    return { error: `dead-end: ${atom.state} -> retired-pending is not a legal move` };
  }
  const graph = state.citationGraph || {};
  const radius = new Set(citationClosureOver(graph, [premise.component]));
  const provisional = [{ nodeId: atomId, change: { state: 'retired-pending', premise, blastRadius: [...radius].sort() } }];
  for (const other of state.atoms || []) {
    if (other.id === atomId) continue;
    const footprint = citationClosureOver(graph, [other.component, ...citedComponents(other)]);
    if (footprint.some((c) => radius.has(c))) {
      provisional.push({ nodeId: other.id, change: { flag: 'frozen', op: 'set', reason: 'R2 blast radius' } });
    }
  }
  const route = routeRefutedPremise(premise, state);
  const permanent = [{ nodeId: atomId, change: { state: 'retired', lineage: 'R2-gate' } }];
  if (route === 'amendment' || route === 'goal-respec' || route === 'topologist-recut') {
    permanent.push({ nodeId: `${atomId}/amend-0`, change: { charter: { demandedBy: 'gate:R2', route }, lineage: atomId } });
  }
  return { provisional, permanent, route };
}
RULES['dead-end'] = ruleDeadEnd;

// ── R3 ripple ─────────────────────────────────────────────────────────────
// Original atom blocks (dispatch-barred); foreign clauses wire to an existing owner (enrich, no
// double-charter) or a new charter-intent — enrichment dispatchable, amendment barred (§7).
function ruleRipple(verdict, state) {
  const { atomId, manifest } = verdict;
  const atom = atomById(state, atomId);
  if (!atom) return { error: `ripple: unknown atomId ${JSON.stringify(atomId)}` };
  const provisional = [{ nodeId: atomId, change: { flag: 'dispatch-barred', op: 'set', reason: 'R3 ripple' } }];
  for (const m of manifest || []) {
    const owner = (state.atoms || []).find((a) => (a.deltaClauses || []).some((c) => c.clauseId === m.clause));
    if (owner) {
      provisional.push({ nodeId: owner.id, change: { enrich: { component: m.component, clause: m.clause, type: m.type }, lineage: atomId } });
    } else if (m.type === 'enrich') {
      provisional.push({ nodeId: `${atomId}/foreign-${m.component}`, change: { charter: { component: m.component, clause: m.clause }, lineage: atomId, dispatchFree: true } });
    } else {
      provisional.push({ nodeId: `${atomId}/foreign-${m.component}`, change: { charter: { component: m.component, clause: m.clause }, flag: 'dispatch-barred', lineage: atomId } });
    }
  }
  const permanent = [{ nodeId: atomId, change: { flag: 'dispatch-barred', op: 'clear', reason: 'R3 amendment ratified' } }];
  return { provisional, permanent };
}
RULES['ripple'] = ruleRipple;

// ── R5 unknown-blocking ─────────────────────────────────────────────────────
// A spike node (charter-intent), informs-edges to the atom + its dependents, and the dependents
// leave the frontier (frozen). Permanent: consumed at the gate (knowledge → vision via retro).
function ruleUnknownBlocking(verdict, state) {
  const { atomId, question, dependents = [] } = verdict;
  const atom = atomById(state, atomId);
  if (!atom) return { error: `unknown-blocking: unknown atomId ${JSON.stringify(atomId)}` };
  const spikeId = `spike/${atomId}`;
  const provisional = [
    { nodeId: spikeId, change: { charter: { kind: 'spike', question }, lineage: atomId } },
    { from: spikeId, to: atomId, edge: 'informs', op: 'add' },
  ];
  for (const dep of dependents) {
    provisional.push({ from: spikeId, to: dep, edge: 'informs', op: 'add' });
    provisional.push({ nodeId: dep, change: { flag: 'frozen', op: 'set', reason: 'R5 awaits spike' } });
  }
  return { provisional, permanent: [{ nodeId: spikeId, change: { consumedAtGate: true } }] };
}
RULES['unknown-blocking'] = ruleUnknownBlocking;

// ── R6 cycle-detected ───────────────────────────────────────────────────────
// Mechanical SCC over the needs graph → a quarantined birth placeholder (dispatches nothing) and a
// dispatch-bar on every SCC member. Permanent: birth ratified, citations retargeted provider-first.
function ruleCycleDetected(verdict, state) {
  const { concept } = verdict;
  if (typeof concept !== 'string' || !concept) return { error: 'cycle-detected: a named shared concept is required' };
  const needs = (state.edges || []).filter((e) => e.edge === 'needs');
  const cycles = scc(needs).filter((grp) => grp.length > 1);
  if (!cycles.length) return { error: 'cycle-detected: no SCC of size > 1 in the needs graph' };
  const birthId = `birth/${concept}`;
  const provisional = [{ nodeId: birthId, change: { charter: { concept, quarantined: true }, dispatchesNothing: true } }];
  for (const member of [...new Set(cycles.flat())].sort()) {
    provisional.push({ nodeId: member, change: { flag: 'dispatch-barred', op: 'set', reason: 'R6 SCC' } });
  }
  const permanent = [{ nodeId: birthId, change: { birthRatified: true, retargetCitations: 'provider-first' } }];
  return { provisional, permanent };
}
RULES['cycle-detected'] = ruleCycleDetected;

// ── R7 parity-breach ────────────────────────────────────────────────────────
// Unmerged: revert lane-local to last green, re-enter as R1-shaped with adversary escalation.
// Merged: freeze the dependent cone ONLY. Permanent (merged): remediation ratified at the gate.
function ruleParityBreach(verdict, state) {
  const { atomId } = verdict;
  const atom = atomById(state, atomId);
  if (!atom) return { error: `parity-breach: unknown atomId ${JSON.stringify(atomId)}` };
  if (atom.state !== 'merged') {
    if (!isValidTransition(atom.state, 'ready')) {
      return { error: `parity-breach(unmerged): ${atom.state} -> ready is not a legal move` };
    }
    return {
      provisional: [{ nodeId: atomId, change: { state: 'ready', revertToGreen: true, adversaryEscalation: true, reprice: { factor: 'α' } } }],
      permanent: [],
    };
  }
  const provisional = [...dependentCone(atomId, state.edges || [])].sort()
    .map((dep) => ({ nodeId: dep, change: { flag: 'frozen', op: 'set', reason: 'R7 dependent cone' } }));
  return { provisional, permanent: [{ nodeId: atomId, change: { remediation: 'revert-or-forward-fix', gateRatified: true } }] };
}
RULES['parity-breach'] = ruleParityBreach;

// ── ceremony escalation + R8 appended by T03b — do not edit above this line ──
```

`isValidTransition`, `citationClosureOver`, `atomById`, `transition`, `routeRefutedPremise`, `RULES`
above are all defined/imported in T01b's section — they are in scope as ordinary same-module
bindings; do not re-import or re-declare them.

### Step 2: Run the locked tests

Run: `node test/rewrite-structural.test.mjs` → all pass. Re-run `node test/rewrite-router.test.mjs`
and `node test/rewrite-simple-verdicts.test.mjs` → still pass (you only appended below the marker).

### Step 3: Confirm zero regression

Run the whole suite (`../knowledge/running-tests.md`). Everything still green.

### Step 4: Commit

```bash
git add lib/rewrite.mjs
git commit -m "feat(rewrite): the structural verdicts R2/R3/R5/R6/R7 + scc/dependentCone"
```

## Acceptance Criteria
- [ ] `node test/rewrite-structural.test.mjs` passes; T01's two test files still pass
- [ ] Only content BELOW T01b's marker changed; the file now ends with the T03b marker line
- [ ] `scc`/`dependentCone` are dependency-free hand-written algorithms; no re-import/re-declare of
      T01's bindings
- [ ] Pure — no I/O anywhere; `lib/effects.mjs`/`atom.mjs`/`graph.mjs` untouched
- [ ] Whole suite still green; no file outside Scope modified
