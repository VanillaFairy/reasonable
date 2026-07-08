// lib/effects.mjs — pure, zero-I/O shape validation for ledger event "effects" entries
// (DESIGN-3.0 §8). An effect is either a node effect ({nodeId, change}) or an edge effect
// ({from, to, edge, op}). This module knows nothing about the ledger, the graph, or atoms —
// it only knows the two shapes. No imports: this file must stay importable standalone by a
// future lib/rewrite.mjs (Part 5) without pulling in anything reasonable-specific.

export const EDGE_NAMES = Object.freeze(['needs', 'excludes', 'serves', 'informs']);
export const EDGE_OPS = Object.freeze(['add', 'remove']);

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

/** @returns {boolean} true iff entry is a well-formed node effect {nodeId: string, change: any} */
export function isNodeEffect(entry) {
  if (!isPlainObject(entry)) return false;
  if (!isNonEmptyString(entry.nodeId)) return false;
  if (!Object.prototype.hasOwnProperty.call(entry, 'change')) return false;
  // `undefined` is not a JSON value: a JSON.stringify round-trip through the ledger's own
  // persistence path silently drops a `change: undefined` key, making it indistinguishable
  // from an absent key. Reject it here so validation can't pass on something the ledger
  // can't actually durably store.
  if (entry.change === undefined) return false;
  return true;
}

/** @returns {boolean} true iff entry is a well-formed edge effect {from, to: string, edge: EDGE_NAMES, op: EDGE_OPS} */
export function isEdgeEffect(entry) {
  if (!isPlainObject(entry)) return false;
  if (!isNonEmptyString(entry.from)) return false;
  if (!isNonEmptyString(entry.to)) return false;
  if (!EDGE_NAMES.includes(entry.edge)) return false;
  if (!EDGE_OPS.includes(entry.op)) return false;
  return true;
}

/**
 * @param {unknown} effects - the candidate value of an event's `effects` field (may be undefined)
 * @returns {{ok: true} | {ok: false, error: string}}
 */
export function validateEffects(effects) {
  if (effects === undefined) return { ok: true };
  if (!Array.isArray(effects)) {
    return { ok: false, error: 'effects must be an array when present' };
  }
  for (let i = 0; i < effects.length; i += 1) {
    const entry = effects[i];
    const asNode = isNodeEffect(entry);
    const asEdge = isEdgeEffect(entry);
    if (asNode === asEdge) {
      // Either neither shape matched, or both did (ambiguous) — same rejection either way.
      return {
        ok: false,
        error: `effects[${i}] is neither a valid node effect ({nodeId, change}) nor a valid edge effect ({from, to, edge, op})`,
      };
    }
  }
  return { ok: true };
}
