// next-action.mjs — the deterministic DECISION PROJECTION (DESIGN §7.3, §7.1).
//
// `projectDirectives(state)` turns a fully-reconciled effort state into an ORDERED SET of directives.
// It is a SET, not a scalar: at `active` lifecycle several truths can hold at once (work is running AND
// separately-ready work can be dispatched AND a wall needs a decision), and the projection surfaces all
// of them so the parallel-dispatch property (§7.3) is preserved — never collapsing the honest frontier
// to a single "next step".
//
// PURE by construction (Law 1 + the §9 decision table): no node:fs, no node:child_process, no Date, no
// git. `reconcile()` does every messy read (route.json, the WO specs, the progress tree for the canceled
// flag) and hands this function a pre-digested `state`. Keeping the projection I/O-free is exactly what
// makes it table-testable and deterministic — the same `state` always projects the same directives.
//
// This file is §7.3's PROJECTION only. The adversarial self-check that strips a directive the
// redispatch-guard / amendment-drop / dead-end / land-nonempty rules forbid is T2.4
// (`selfCheckDirectives`), NOT here. projectDirectives emits the directives the STATE supports; it
// consults no guard, no git, no drop logic. Persisting the result as a `next-action` ledger event and
// rendering it into the mirror is T2.3. This module stops at the pure projection.
//
//   Directive = { kind, slice?, workOrders?, workOrder?, detail? }
//   kind ∈ 'HALT' | 'AMBIGUOUS' | 'DECIDE' | 'RUNNING' | 'DISPATCH' | 'RETRO' | 'OPEN' | 'LAND'
//        | 'CONCLUDE' | 'DONE'
//
// The `state` shape reconcile assembles (see lib/reconcile.mjs):
//   {
//     halt: boolean, haltReason: string|null, ambiguities: [{ haltReason, ... }],
//     openInbox: [{ kind, breaking?, ... }],
//     lifecycle: 'active' | 'at-land-gate' | 'half-concluded',
//     routeOrder: string[] | null,                       // readRoute(...).route?.slices ?? null
//     workOrders: [ { id, slice, status, dependsOn: string[],
//                     terminal, blocked, canceled, running } ],   // one per known WO (journal ∪ ledger)
//     slices: [ { id, woIds: string[], allDone, retroDone } ],    // in routeOrder; [] when underivable
//   }

import { servesEdges } from './graph.mjs';

/**
 * Project a reconciled effort `state` into an ordered SET of directives (§7.3).
 * @param {object} state  — pre-digested by reconcile(); see the shape above.
 * @returns {Array<{kind:string, slice?:string, workOrders?:string[], workOrder?:string, detail?:string}>}
 */
export function projectDirectives(state) {
  const s = state || {};
  const workOrders = Array.isArray(s.workOrders) ? s.workOrders : [];
  const routeOrder = Array.isArray(s.routeOrder) ? s.routeOrder : [];
  const slices = Array.isArray(s.slices) ? s.slices : [];

  // ── 1. GLOBAL (first match wins → a single-element set). ────────────────────────────────
  // A halt or a breaking decision governs the whole effort; nothing else runs while one holds.
  if (s.halt) {
    const detail = s.haltReason ?? null;
    // reconcile folds the halt CLASS into state: an unsettleable AMBIGUOUS configuration (its
    // `ambiguities` partition — a torn window, a SHA-custody breach, a runMode-absent cold restart,
    // two lanes on one WO, or the multi-root effort-discovery shadow) projects as AMBIGUOUS; a halt
    // that is NOT an ambiguity — the floor-integrity unexplained-breach STOP (D13), `halt` true with
    // an empty `ambiguities` — projects as HALT. Checked AMBIGUOUS-first per §7.3.
    if (Array.isArray(s.ambiguities) && s.ambiguities.length > 0) return [{ kind: 'AMBIGUOUS', detail }];
    return [{ kind: 'HALT', detail }];
  }
  const breaking = (Array.isArray(s.openInbox) ? s.openInbox : []).find((i) => i && i.breaking === true);
  if (breaking) return [{ kind: 'DECIDE', detail: `inbox: ${breaking.kind ?? '?'}` }];

  // ── 2. lifecycle-driven. ────────────────────────────────────────────────────────────────
  if (s.lifecycle === 'at-land-gate') return [{ kind: 'LAND' }];
  if (s.lifecycle === 'half-concluded') return [{ kind: 'CONCLUDE' }];
  // else `active` → the SET below.

  const byId = new Map(workOrders.map((w) => [w.id, w]));
  const isDone = (id) => (byId.get(id) || {}).status === 'done';
  const directives = [];

  // (a) every BLOCKED WO → DECIDE — an open node-failed: a human decides redispatch or drop.
  for (const w of workOrders) {
    if (w.blocked === true) directives.push({ kind: 'DECIDE', workOrder: w.id });
  }

  // (b) every RUNNING WO → collected into ONE RUNNING directive (live work, in flight).
  const running = workOrders.filter((w) => w.running === true).map((w) => w.id);
  if (running.length) directives.push({ kind: 'RUNNING', workOrders: running });

  // (c) every READY WO grouped by slice, one DISPATCH per slice, IN routeOrder.
  // READY (Corrections C + D, pinned): its own status is `pending` — the only dispatchable live state
  // (running WOs are drawn off by RUNNING above, blocked by DECIDE, and done/dropped are terminal, so
  // `pending` is precisely "not-yet-started and not-abandoned") — AND it is not canceled (a canceled
  // WO folds to `pending` in the ledger, so the tree-derived `canceled` flag is the real terminal
  // signal) — AND EVERY dependency is `done` (dep.status === 'done'; a dep that is missing, pending,
  // running, blocked, dropped, or canceled — canceled never folds to `done` — leaves the WO not ready).
  const isReady = (w) =>
    w.status === 'pending' && w.canceled !== true &&
    (Array.isArray(w.dependsOn) ? w.dependsOn : []).every((d) => isDone(d));
  const readyBySlice = new Map();
  const sliceSeen = [];
  for (const w of workOrders) {
    if (!isReady(w)) continue;
    const key = w.slice ?? null;
    if (!readyBySlice.has(key)) { readyBySlice.set(key, []); sliceSeen.push(key); }
    readyBySlice.get(key).push(w.id);
  }
  // routeOrder slices first (a route-priced frontier is dispatched in its ratified order), then any
  // ready slice the route does not name (incl. a null-slice WO) in first-seen order.
  const emitOrder = [
    ...routeOrder.filter((sid) => readyBySlice.has(sid)),
    ...sliceSeen.filter((sid) => !routeOrder.includes(sid)),
  ];
  for (const sid of emitOrder) {
    directives.push({ kind: 'DISPATCH', slice: sid, workOrders: readyBySlice.get(sid) });
  }

  // (d) a slice whose WOs are all done but whose retro has NOT passed → RETRO (the gate heartbeat).
  for (const sl of slices) {
    if (sl && sl.allDone === true && sl.retroDone !== true) directives.push({ kind: 'RETRO', slice: sl.id });
  }

  // (e) a retro-passed slice whose SUCCESSOR in routeOrder has no planned WOs yet → OPEN the successor
  // (its work orders need to be planned next).
  for (const sl of slices) {
    if (!sl || sl.retroDone !== true) continue;
    const i = routeOrder.indexOf(sl.id);
    if (i < 0 || i + 1 >= routeOrder.length) continue;
    const nextId = routeOrder[i + 1];
    const nextSlice = slices.find((x) => x && x.id === nextId);
    if (nextSlice && Array.isArray(nextSlice.woIds) && nextSlice.woIds.length === 0) {
      directives.push({ kind: 'OPEN', slice: nextId });
    }
  }

  // (f) nothing actionable AND every known WO is terminal → DONE. Guarded on a non-empty WO set so an
  // early effort with nothing planned (vacuously "all-terminal") never mis-reads as DONE.
  if (directives.length === 0 && workOrders.length > 0 && workOrders.every((w) => w.terminal === true)) {
    return [{ kind: 'DONE' }];
  }
  return directives;
}

// The output self-check (DESIGN §7.4) — the projection's adversarial verification, applied to
// projectDirectives' output BEFORE it is persisted (reconcile appends the checked set). It is the third
// Law (external verification) on the projection itself: the projection PROPOSES, this mechanical adversary
// REFUTES, and a refused directive is REPLACED by a reasoned `DECIDE` (which never auto-executes → it
// escalates in autonomous mode exactly as in gated, §7.4). It refuses three ways:
//   - a DISPATCH/RUNNING naming a redispatch-guard-flagged WO — an unresolved amendment drop or a
//     hash-matched dead-end/infeasible verdict (drop is authoritative over a spec file still on disk →
//     kills resurrection, robustness matrix S12). Refuses the WHOLE directive, naming the offending id(s).
//   - an OPEN of a slice not in the ratified route (a retired slice).
//   - a LAND while the frontier is still non-empty (open work remains).
//
// PURE (Law 1 + the §9 table): the ledger/hash work is reconcile's `redispatchBlock` calls, pre-digested
// into `context.guardBlocked`. NOTE (Correction F): it does NOT refuse on `node-downgraded` — a downgraded
// WO is the D19 legitimate reopen (refusing it would wedge crash recovery); the guard never binds
// node-downgraded, so such a WO is simply absent from `guardBlocked` and passes.
//
// @param {Array} directives  the projected set (projectDirectives output)
// @param {{ guardBlocked:{[woId]:{reason}}, routeSlices:string[], frontierNonEmpty:boolean }} context
// @returns {{ directives: Array, refusals: Array<{directive, reason}> }}
export function selfCheckDirectives(directives, context) {
  const arr = Array.isArray(directives) ? directives : [];
  const ctx = context || {};
  const guardBlocked = (ctx.guardBlocked && typeof ctx.guardBlocked === 'object') ? ctx.guardBlocked : {};
  const routeSlices = Array.isArray(ctx.routeSlices) ? ctx.routeSlices : [];
  const frontierNonEmpty = ctx.frontierNonEmpty === true;

  const out = [];
  const refusals = [];
  // Build the replacement DECIDE, carrying the offending slice/workOrder forward so the human sees WHAT
  // was refused (a DECIDE never auto-executes — that IS the escalation, in both run modes).
  const decide = (src, detail) => {
    const d = { kind: 'DECIDE', detail };
    if (src.slice !== undefined) d.slice = src.slice;
    if (src.workOrder !== undefined) d.workOrder = src.workOrder;
    return d;
  };

  for (const d of arr) {
    if (!d || typeof d !== 'object') { out.push(d); continue; }

    if (d.kind === 'DISPATCH' || d.kind === 'RUNNING') {
      const wos = Array.isArray(d.workOrders) ? d.workOrders : [];
      const blocked = wos.filter((id) => guardBlocked[id]);
      if (blocked.length) {
        const reason = blocked
          .map((id) => `${id}: ${(guardBlocked[id] && guardBlocked[id].reason) || 'redispatch-guard blocked'}`)
          .join('; ');
        refusals.push({ directive: d, reason });
        out.push(decide(d, `${d.kind} refused (redispatch-guard) — ${reason}`));
        continue;
      }
    }

    // DEFENSE-IN-DEPTH: the OPEN and LAND rules below cannot fire under the CURRENT projection —
    // projectDirectives only emits OPEN for `routeOrder[i+1]` (always in `routeSlices`) and only emits LAND
    // at `lifecycle==='at-land-gate'` (⟺ the frontier is empty ⟺ `frontierNonEmpty===false`), because
    // reconcile hands this function the SAME `routeOrder`/`frontierOpen` the projection read. They are kept
    // as invariants a FUTURE projection change (a more liberal OPEN/LAND) cannot silently violate — the
    // self-check would catch it. The load-bearing rule today is the guard-block above (DISPATCH/RUNNING).
    if (d.kind === 'OPEN' && !routeSlices.includes(d.slice)) {
      const reason = `slice ${d.slice} is not in the ratified route (retired) — OPEN refused`;
      refusals.push({ directive: d, reason });
      out.push(decide(d, reason));
      continue;
    }

    if (d.kind === 'LAND' && frontierNonEmpty) {
      const reason = 'the frontier is non-empty — LAND refused (open work remains)';
      refusals.push({ directive: d, reason });
      out.push(decide(d, reason));
      continue;
    }

    out.push(d);
  }
  return { directives: out, refusals };
}

// ── deriveConeOrder — the goals/cones frontier order (DESIGN-3.0 §3; reasonable 3.0 Part 7) ────────
//
// PURE, exactly like projectDirectives above: reconcile does the disk reads (readGoals/deriveCurrent/
// readPolicy) and hands this function {goals, atoms, weights}. Produces the SAME routeOrder/slices
// shape projectDirectives already consumes — only the INPUT to the projection changes, not the
// projection itself.
//
// Of DESIGN-3.0 §3's six priority axes (integration-risk, expected information gain, unlocks-count,
// goal proximity, staleness pressure, cost), only unlocks-count has a computable proxy from these
// inputs alone: a goal's CONE SIZE (how many atoms its completion carries toward green). The other
// five need telemetry (blast-radius history, staleness timestamps, cost estimates) this function does
// not have access to — NOT implemented, named here rather than faked. An absent/non-numeric
// weights.unlocksCount degrades to 0 for every goal, which — combined with the stable sort below —
// yields the honest neutral default: the ORIGINAL goal order, unchanged.

/**
 * @param {{ goals: Array<{id,scenario,scenarioCitations}>, atoms: Array, weights: object }} inputs
 * @returns {{ routeOrder: string[], slices: Array<{id, woIds: string[]}> }}
 */
export function deriveConeOrder({ goals = [], atoms = [], weights = {} } = {}) {
  if (!goals.length) return { routeOrder: [], slices: [] };

  const edges = servesEdges(atoms, goals); // {from:atomId, to:goalId, edge:'serves'}
  const coneOf = new Map(goals.map((g) => [g.id, new Set()]));
  for (const e of edges) {
    const cone = coneOf.get(e.to);
    if (cone) cone.add(e.from);
  }

  const unlocksWeight = typeof weights.unlocksCount === 'number' ? weights.unlocksCount : 0;
  const scored = goals.map((g, idx) => ({
    id: g.id,
    idx,
    score: unlocksWeight * (coneOf.get(g.id) || new Set()).size,
  }));
  // Stable sort: descending score, ties broken by ORIGINAL input order (idx ascending).
  scored.sort((a, b) => (b.score - a.score) || (a.idx - b.idx));

  return {
    routeOrder: scored.map((s) => s.id),
    slices: goals.map((g) => ({ id: g.id, woIds: [...(coneOf.get(g.id) || [])].sort() })),
  };
}
