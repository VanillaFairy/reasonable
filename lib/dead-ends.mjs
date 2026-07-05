// dead-ends.mjs — the dead-end set, folded from the ledger (pure, no I/O).
//
// A DEAD END is a refutation-surviving infeasibility verdict (glossary: "a
// retroactive spike — code dies on its branch; knowledge is harvested; verdict
// enters the ledger"). The ledger records it as either a first-class `dead-end`
// event or a `verdict` kind:"infeasible" with survivedSkeptic — the SAME two
// shapes lib/redispatch-guard.mjs treats as binding (its lines 38-40); keep the
// predicates in lockstep if either changes.
//
// This module exists so the reconcile briefing can carry the set (`deadEnds`) to
// the Bash-less thin route-planner — RETIREMENT semantics: a dead-ended id is
// never re-proposed in-band; successor work arrives under a NEW id via a replan
// that consumed the dead-end (docs/roadmap/dead-end-blast-radius.md). The fold is
// conservative: a later green verdict does NOT clear an entry — only a merge
// (terminal) excludes it, and the CALLER applies that subtraction (reconcile.mjs
// filters on terminalWorkOrders) so this stays a pure ledger fold.
//
// Law 1 (dependency-free): node builtins only — in fact NO I/O at all.

/** A binding dead-end event (mirrors redispatch-guard.mjs's predicate). */
function isBindingDeadEnd(e) {
  if (!e || typeof e !== 'object' || !e.workOrder) return false;
  if (e.type === 'dead-end') return true;
  return e.type === 'verdict' && e.kind === 'infeasible' && !!e.survivedSkeptic;
}

/**
 * Fold the ledger into the dead-end set: one entry per work order carrying a
 * binding infeasibility verdict, keeping the LATEST such event's seq + hash.
 * @returns [{ workOrder, ledgerSeq, hash }]
 */
export function deadEndSet(ledger) {
  const byWo = new Map();
  for (const e of ledger || []) {
    if (!isBindingDeadEnd(e)) continue;
    const seq = Number(e.seq) || 0;
    const prev = byWo.get(e.workOrder);
    if (!prev || seq >= prev.ledgerSeq) {
      byWo.set(e.workOrder, { workOrder: e.workOrder, ledgerSeq: seq, hash: e.hash || null });
    }
  }
  return [...byWo.values()];
}
