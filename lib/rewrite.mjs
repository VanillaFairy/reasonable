// lib/rewrite.mjs — the failure calculus (DESIGN-3.0 §7, §7.1, §7.2, reasonable 3.0 Part 5). A PURE
// library: given an already-typed, already-audited R1–R9 verdict and a read-only graph snapshot, it
// computes a two-phase {provisional, permanent} set of lib/effects.mjs-shaped effects. It computes;
// it never applies, reads disk, or appends a ledger event — the append-path wiring, the
// collision-free 3.0-verdict event type, and the effects-overlay fold are all Part 7's (see the
// design doc's central scoping decision). The file grows across three triads; each appends a
// disjoint section below its marker and registers verdict kinds into the shared RULES object by
// assignment (RULES['kind'] = fn), never by editing the router or a prior section.

// The library imports ONLY what it uses. Edge kinds ('needs'/'excludes'/…) and flag names
// ('frozen'/…) are emitted as string literals, exactly as lib/graph.mjs emits its edge kinds — so
// lib/effects.mjs is NOT imported here; it is the TESTS' validator, not a library dependency. State
// transitions ARE validated at emit time (isValidTransition), because an illegal transition is a
// caller error that must HALT — unlike a literal in this trusted code, which a test would catch.
import { isValidTransition, cohesionComponents } from './atom.mjs';
import { citationClosureOver } from './graph.mjs';

// ── vocabulary ──────────────────────────────────────────────────────────────

export const VERDICT_KINDS = Object.freeze([
  'checkpoint', 'dead-end', 'ripple', 'oversized', 'unknown-blocking',
  'cycle-detected', 'parity-breach', 'illegible', 'stale-spec',
]);

export const RCODE_TO_KIND = Object.freeze({
  R1: 'checkpoint', R2: 'dead-end', R3: 'ripple', R4: 'oversized', R5: 'unknown-blocking',
  R6: 'cycle-detected', R7: 'parity-breach', R8: 'illegible', R9: 'stale-spec',
});

// ── the RULES registry + the total router (§7.2 Totality) ────────────────────
// Each triad registers its verdict kinds into this shared object by assignment. The router reads it
// dynamically, so it "grows" as later sections register and is never itself edited.

const RULES = {};

export function computeVerdictEffects(verdict, state) {
  if (!verdict || typeof verdict.kind !== 'string') {
    return { ok: false, error: 'verdict.kind is required' };
  }
  const rule = Object.hasOwn(RULES, verdict.kind) ? RULES[verdict.kind] : undefined;
  if (!rule) return { ok: false, error: `unknown or unregistered verdict kind ${JSON.stringify(verdict.kind)}` };
  const result = rule(verdict, state || {});
  if (result && result.error) return { ok: false, error: result.error };
  const out = { ok: true, provisional: result.provisional, permanent: result.permanent };
  if (result.route !== undefined) out.route = result.route;
  return out;
}

// ── §7.1 routing ladder ─────────────────────────────────────────────────────

export function routeRefutedPremise(premise, state) {
  const layer = premise && premise.layer;
  if (layer === 'goal') return 'goal-respec';
  if (layer === 'intention') return 'intent-fork'; // always human, both modes (relies on P3's
                                                    // still-un-owned intention-citation grammar)
  if (layer === 'delta') return 're-charter';
  // contract layer (the default): a seam if the refuted clause's citation closure spans ≥2 foreign
  // components — an under-approximation the design flags (a single-component refutation never
  // mis-routes to a re-cut).
  const closure = citationClosureOver((state && state.citationGraph) || {}, [premise.component]);
  const foreign = closure.filter((c) => c !== premise.component);
  return foreign.length >= 2 ? 'topologist-recut' : 'amendment';
}

// ── shared effect-builder helpers ────────────────────────────────────────────

function atomById(state, atomId) {
  return (state.atoms || []).find((a) => a.id === atomId) || null;
}

// Build a validated transition effect, or return {error} if the move is illegal (§7.2 — a rule
// never emits an illegal {state} effect; an illegal move is a caller error → HALT).
function transition(atomId, from, to, extra) {
  if (!isValidTransition(from, to)) {
    return { error: `${atomId}: ${from} -> ${to} is not a legal move` };
  }
  return { effect: { nodeId: atomId, change: { state: to, ...extra } } };
}

// ── R1 checkpoint ────────────────────────────────────────────────────────────

function ruleCheckpoint(verdict, state) {
  const { atomId, evidence } = verdict;
  const atom = atomById(state, atomId);
  if (!atom) return { error: `checkpoint: unknown atomId ${JSON.stringify(atomId)}` };
  const prior = (state.priorVerdicts || []).filter((v) => v.atomId === atomId && v.kind === 'checkpoint').length;
  if (prior >= 1) {
    // second independent exhaustion → auto-promote toward R2 (§7 R1 row). A plain exhaustion carries
    // no refuted premise, so this promotes into the dead-end lane WITHOUT a blast radius.
    const t = transition(atomId, atom.state, 'retired-pending', { promotedFrom: 'checkpoint', evidence });
    if (t.error) return t;
    return { provisional: [t.effect], permanent: [] };
  }
  const t = transition(atomId, atom.state, 'ready', { reprice: { factor: 'α' }, evidence });
  if (t.error) return t;
  return { provisional: [t.effect], permanent: [] };
}
RULES['checkpoint'] = ruleCheckpoint;

// ── R4 oversized ───────────────────────────────────────────────────────────
// The rule VALIDATES the proposed partition against §4.3: no proposed group may split a cohesion
// component (cohesionComponents, lib/atom.mjs). Sub-atoms are charter-intents that inherit the
// parent's sanction and dispatch freely — the work was already in the ratified plan (§7).

function ruleOversized(verdict, state) {
  const { atomId, partition, componentRoot = '' } = verdict;
  const atom = atomById(state, atomId);
  if (!atom) return { error: `oversized: unknown atomId ${JSON.stringify(atomId)}` };
  if (!Array.isArray(partition) || partition.length < 2) {
    return { error: 'oversized: partition must group the atom into >= 2 sub-atoms' };
  }
  const cohesion = cohesionComponents(atom.deltaClauses || [], componentRoot);
  const groupOf = new Map();
  partition.forEach((group, i) => group.forEach((clauseId) => groupOf.set(clauseId, i)));
  for (const cc of cohesion) {
    const groups = new Set(cc.map((clauseId) => groupOf.get(clauseId)));
    if (groups.size !== 1) {
      return { error: 'oversized: proposed partition splits a §4.3 cohesion component' };
    }
  }
  const t = transition(atomId, atom.state, 'retired-pending', { supersededBy: 'partition' });
  if (t.error) return t;
  const provisional = [t.effect];
  partition.forEach((group, i) => {
    provisional.push({ nodeId: `${atomId}/sub-${i}`, change: { charter: { clauses: group }, lineage: atomId, dispatchFree: true } });
  });
  return { provisional, permanent: [] };
}
RULES['oversized'] = ruleOversized;

// ── R9 stale-spec ─────────────────────────────────────────────────────────
// Mechanical, no judgment: the spec'd atom → ready with a stale delta, and the colliding pair
// serializes (an excludes edge, ordered by atom id).

function ruleStaleSpec(verdict, state) {
  const { atomId, collidesWith } = verdict;
  const atom = atomById(state, atomId);
  if (!atom) return { error: `stale-spec: unknown atomId ${JSON.stringify(atomId)}` };
  const t = transition(atomId, atom.state, 'ready', { staleDelta: true });
  if (t.error) return t;
  const [from, to] = atomId < collidesWith ? [atomId, collidesWith] : [collidesWith, atomId];
  return { provisional: [t.effect, { from, to, edge: 'excludes', op: 'add' }], permanent: [] };
}
RULES['stale-spec'] = ruleStaleSpec;

// ── structural verdicts (R2/R3/R5/R6/R7) appended by T02b — do not edit above this line ──

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
    // T02d-r2-reprice-red.md: DESIGN-3.0 §7's R2 row also says "siblings sharing citations reprice" —
    // a narrower, more literal population than the closure-based freeze above (supervisor-resolved
    // reading, since the design prose alone doesn't pin the mechanics): any OTHER atom that directly
    // cites the exact refuted clause gets an additional, separate reprice effect layered on top of
    // (never instead of) its frozen effect. A direct citer is, by construction, always also inside the
    // wider frozen population (its own component is trivially in its own closure).
    const exactCiter = (other.deltaClauses || []).some((c) =>
      (c.citations || []).some((ci) => ci.component === premise.component && ci.clause === premise.clause));
    if (exactCiter) {
      provisional.push({ nodeId: other.id, change: { reprice: { factor: 'α' } } });
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

// The cone an atom belongs to — flat-by-component today (matches lib/graph.mjs's containment
// fallback); Part 6's ownership map refines this without changing this call's shape.
function atomCone(atomId, state) {
  const atom = atomById(state, atomId);
  return atom ? atom.component : null;
}

// The four §7 triggers that may ratchet a cone's band UP. Returns {coneId} or null. Every threshold
// is caller-supplied (state.bandBounds) — this invents no magic number (design doc Decision 7).
function escalationTrigger(verdict, state) {
  const coneId = verdict.coneId || (verdict.atomId ? atomCone(verdict.atomId, state) : null);
  if (!coneId) return null;
  switch (verdict.kind) {
    case 'dead-end': {
      const radius = citationClosureOver(state.citationGraph || {}, [verdict.premise.component]);
      const bound = (state.bandBounds || {})[coneId];
      return typeof bound === 'number' && radius.length > bound ? { coneId } : null;
    }
    case 'ripple':
      return (verdict.manifest || []).length > 0 ? { coneId } : null;
    case 'stale-spec':
      return verdict.integrationExposed === true ? { coneId } : null;
    case 'checkpoint': {
      const prior = (state.priorVerdicts || []).filter((v) => v.atomId === verdict.atomId && v.kind === 'checkpoint').length;
      return prior >= 1 ? { coneId } : null;
    }
    default:
      return null;
  }
}

// A verdict may ratchet the affected cone's complexity band UP — monotone, capped at the top band,
// never down (§7 "ratchets up only"; the tier one-way ratchet). Records `from` so the unwind is
// exact. A sibling call Part 7 makes alongside computeVerdictEffects; the router does not call it.
export function ceremonyEscalation(verdict, state) {
  const trigger = escalationTrigger(verdict, state || {});
  if (!trigger) return null;
  const { coneId } = trigger;
  const scale = (state && state.bandScale) || [];
  const current = state && state.bands ? state.bands[coneId] : undefined;
  const idx = scale.indexOf(current);
  if (idx === -1) return null;              // unknown band — cannot place it; never guesses
  const nextIdx = Math.min(idx + 1, scale.length - 1);
  if (nextIdx === idx) return null;         // already at the top band — up only
  return {
    nodeId: coneId,
    change: { band: scale[nextIdx], from: current, armed: ['deep-audit', 'scaffold-recheck', 'tighter-cadence'] },
  };
}

// The exact inverse of a ceremony-escalation effect. Because the escalation only ARMED checks (it
// disarmed no guard), the unwind is pure subtraction: restore the band to `from`, disarm every armed
// check. INVARIANT (locked test): applying an escalation then its unwind is IDENTITY — no residual
// band raise, no residual armed check. This is DESIGN-3.0 open edge (c), built and tested — not
// asserted. A rejected permanent raise unwinds exactly as R7's provisional cone freeze does.
export function unwindCeremonyEscalation(escalationEffect) {
  if (!escalationEffect || !escalationEffect.change || escalationEffect.change.band === undefined) return [];
  const { nodeId, change } = escalationEffect;
  return [{ nodeId, change: { band: change.from, disarmed: change.armed || [] } }];
}

// ── R8 illegible ────────────────────────────────────────────────────────────
// genesis-R8 blocks the topology stage; live-R8 is batched retopology pressure. The density metric
// that TRIGGERS and VALIDATES a regrouping is lib/legibility.mjs (Part 6, not built) — this rule
// emits the proposal SHAPE; the "applied only if it reduces measured density" guard is Part 6's
// (design doc Decision 5 — a named, un-owned gap).
function ruleIllegible(verdict) {
  const { scope, proposal } = verdict;
  if (scope !== 'genesis' && scope !== 'live') {
    return { error: `illegible: scope must be 'genesis' or 'live' (got ${JSON.stringify(scope)})` };
  }
  if (scope === 'genesis') {
    return { provisional: [{ nodeId: 'topology', change: { blocked: true, reason: 'genesis-R8', proposal } }], permanent: [] };
  }
  return { provisional: [], permanent: [{ nodeId: 'topology', change: { retopologyPressure: true, proposal } }] };
}
RULES['illegible'] = ruleIllegible;
