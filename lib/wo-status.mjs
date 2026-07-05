// wo-status.mjs — work-order status as a fold of the ledger (pure, no I/O).
//
// §5.1 (F2, F8): a work order's status is the SOURCE-OF-TRUTH ledger fold, not a field read from
// `journal.workOrders`. reconcile() computes each WO's status by folding `ledger.jsonl` and treats
// the journal's per-WO `status` as a cache it cross-checks and warns on — never the source. This is
// the same shape reconcile already uses for `trustStaleness()` / `deadEndSet()`: a pure fold of the
// append-only event stream, order-independent (sorts a copy by seq).
//
// The motivating incident: a WO that lives in `ledger.jsonl` (+ a live worktree) but never made it
// into `journal.workOrders` was INVISIBLE to the journal-only derivation. Keyed on the ledger, it is
// visible again.
//
// Law 1 (dependency-free): node builtins only — in fact NO I/O at all. The caller passes an events
// array already read via readJsonl().
//
// WO IDENTITY. A WO is addressed in the ledger either by its bare id (`workOrder: 'WO-12'`, the
// lane-provisioner's shortcut) or by its absolute tree path (`node: 'expr-eval/WO-12'`, or the
// `expr-eval/WO-12[2]` reopen sibling the controller mints — see ledger.mjs). Both collapse to the
// same canonical key here: the bare work-order id (the base node's last path segment, `[k]` stripped).
// That is the SAME id space `journal.workOrders` keys on and `deadEndSet`/amendment `drops` use, so
// reconcile can cross-check `fold.get(id)` against `journal.workOrders[id]` directly.

// Strip a trailing `[k]` attempt marker from a path's last segment → the base path.
function baseOf(path) { return String(path).replace(/\[\d+\]$/, ''); }

// The last '/'-segment of a path (the whole string when there is no '/').
function lastSegment(path) { const i = path.lastIndexOf('/'); return i < 0 ? path : path.slice(i + 1); }

// The canonical bare work-order id an event addresses, or null. `workOrder` (a bare id) wins; else
// the base node path's last segment (so `expr-eval/WO-12` and `expr-eval/WO-12[2]` both → `WO-12`).
function woIdOf(e) {
  if (typeof e.workOrder === 'string' && e.workOrder) return e.workOrder;
  if (typeof e.node === 'string' && e.node) return lastSegment(baseOf(e.node));
  return null;
}

// A ratification/amendment closes a node-failed (clears BLOCKED) or restores an amendment drop
// (clears DROPPED) ONLY by `resolvesSeq` equal to that failing/dropping event's own seq — never by a
// coincidental work-order-id mention. A cleared WO returns to the inert `pending` baseline (a later
// node-dispatched re-opens it to running). A resolvesSeq matching nothing currently blocked/dropped is
// a harmless no-op (conservative: it never invents a transition).
function applyClosure(state, resolvesSeq, seq) {
  if (!Number.isFinite(resolvesSeq)) return;
  for (const [id, st] of state) {
    if ((st.status === 'blocked' && st.blockedBy === resolvesSeq) ||
        (st.status === 'dropped' && st.droppedBy === resolvesSeq)) {
      state.set(id, { status: 'pending', lastSeq: seq });
    }
  }
}

/**
 * Fold an array of parsed ledger events into the ledger-truth status of each work order.
 *
 * @param {object[]} events  parsed ledger lines (any order; a copy is sorted by seq internally)
 * @returns {Map<string, {status:'pending'|'running'|'blocked'|'dropped'|'done', lastSeq:number,
 *                         blockedBy?:number, droppedBy?:number}>}
 *          one entry per work order that has ANY status-bearing event. A WO with no events is absent.
 *
 * Status semantics (pinned — shared/interfaces.md §T0.1):
 *   running  — the last node-dispatched with no later terminal (node-completed/-failed/-canceled).
 *   blocked  — the last terminal is node-failed with no later resolving ratification/amendment.
 *   dropped  — an amendment `drops:[{workOrder}]` with no later restoring ratification.
 *   done     — a node-completed (or a terminal `merged`) with no later reopening node-dispatched.
 *   pending  — planned/dispatched but the rules above leave nothing decisive (planned-not-yet-
 *              dispatched; a resolved failure with no redispatch; a lost-work downgrade; a cancel).
 * Attempts are `base[k]` siblings: a reopen (node-dispatched after a terminal) returns the WO to
 * running. `next-action` and node-checkpointed events are ignored — they never set WO status.
 */
export function foldWorkOrderStatuses(events) {
  const sorted = [...(events || [])]
    .filter((e) => e && typeof e === 'object')
    .sort((a, b) => (Number(a.seq) || 0) - (Number(b.seq) || 0));

  // Pass 1 — which bare ids are WORK ORDERS. A node-completed/-failed for a SLICE or PHASE addresses
  // by a bare `node` path too, so status is folded ONLY for ids a `kind:'work-order'` plan/dispatch
  // (or an amendment drop) declared — never minting a phantom WO from a container's terminal event.
  const known = new Set();
  for (const e of sorted) {
    if ((e.type === 'node-planned' || e.type === 'node-dispatched') && e.kind === 'work-order') {
      const id = woIdOf(e);
      if (id) known.add(id);
    } else if (e.type === 'amendment' && Array.isArray(e.drops)) {
      for (const d of e.drops) if (d && typeof d.workOrder === 'string' && d.workOrder) known.add(d.workOrder);
    }
  }

  // Pass 2 — fold to the last decisive event per WO. Processing in seq order makes each rule's
  // "last X with no later Y" fall out: a later event simply overwrites the earlier state.
  const state = new Map();
  for (const e of sorted) {
    const seq = Number(e.seq) || 0;
    const id = woIdOf(e);
    switch (e.type) {
      case 'node-planned':
        if (e.kind === 'work-order' && id && !state.has(id)) state.set(id, { status: 'pending', lastSeq: seq });
        break;
      case 'node-dispatched':
        // First dispatch or a reopen sibling — running, clearing any prior block/drop.
        if (id && known.has(id)) state.set(id, { status: 'running', lastSeq: seq });
        break;
      case 'node-completed':
      case 'merged': // forward-compat: a terminal merge is DONE (no such ledger type emitted today)
        if (id && known.has(id)) state.set(id, { status: 'done', lastSeq: seq });
        break;
      case 'node-failed':
        if (id && known.has(id)) state.set(id, { status: 'blocked', lastSeq: seq, blockedBy: seq });
        break;
      case 'node-canceled':
        // Stops running; not one of the positive states → back to the inert pending baseline.
        if (id && known.has(id)) state.set(id, { status: 'pending', lastSeq: seq });
        break;
      case 'node-downgraded':
        // A lost-work crash voids the dispatched attempt → pending, awaiting redispatch (mirrors
        // reconcile's own dispatched→pending downgrade). NOT blocked: it needs no resolution.
        if (id && known.has(id)) state.set(id, { status: 'pending', lastSeq: seq });
        break;
      case 'amendment':
        if (Array.isArray(e.drops)) {
          for (const d of e.drops) {
            if (d && typeof d.workOrder === 'string' && d.workOrder) {
              state.set(d.workOrder, { status: 'dropped', lastSeq: seq, droppedBy: seq });
            }
          }
        }
        applyClosure(state, Number(e.resolvesSeq), seq); // an amendment may also close a node-failed
        break;
      case 'ratification':
        applyClosure(state, Number(e.resolvesSeq), seq);
        break;
      default:
        break; // node-checkpointed, next-action, every Family-3 domain event: not WO status.
    }
  }
  return state;
}
