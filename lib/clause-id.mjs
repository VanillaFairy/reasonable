// lib/clause-id.mjs — the durable clause-id shape (`<component>#c<N>`, DESIGN-3.0 §4.2) and its
// ledger-backed allocator (reasonable 3.0 Part 2). Split from lib/contract.mjs: the shape half
// (parseClauseId/formatClauseId/CLAUSE_ID_RE) is pure and imported by the parser; the allocate
// half needs lib/ledger.mjs's append() and is imported by whichever future spec-time pipeline
// mints a new clause. There is no per-component counter and no persisted registry — the id's
// numeric suffix is simply the seq the ledger's own append lock already assigns atomically, so
// two concurrent allocations can never collide without any extra fold logic.

import { append } from './ledger.mjs';
import { readJsonl } from './effort.mjs';
import { join } from 'node:path';

const COMPONENT_RE = /^[a-z0-9][a-z0-9-]*$/;

/** Regex source string (no anchors) for one clause id: a component slug + '#c' + digits. */
export const CLAUSE_ID_PATTERN = '[a-z0-9][a-z0-9-]*#c\\d+';
/** Anchored RegExp built from CLAUSE_ID_PATTERN — tests a WHOLE string, not a substring. */
export const CLAUSE_ID_RE = new RegExp(`^${CLAUSE_ID_PATTERN}$`);

const PARSE_RE = /^([a-z0-9][a-z0-9-]*)#c(\d+)$/;

/**
 * @param {unknown} id
 * @returns {{component: string, n: number} | null} — null for anything malformed
 *   (wrong shape, non-string, positional `§N`, uppercase component, etc.). Never throws.
 */
export function parseClauseId(id) {
  if (typeof id !== 'string') return null;
  const m = PARSE_RE.exec(id);
  if (!m) return null;
  return { component: m[1], n: Number(m[2]) };
}

/**
 * @param {string} component
 * @param {number} n
 * @returns {string} — `${component}#c${n}`. The exact inverse of parseClauseId.
 */
export function formatClauseId(component, n) {
  return `${component}#c${n}`;
}

/**
 * Allocate a new, durable clause id for `component` by appending a `clause-allocated` ledger
 * event under the ledger controller's existing append lock (lib/ledger.mjs's append()). The
 * numeric suffix is the seq that append assigns to THIS event — always unique, always
 * increasing across the WHOLE ledger (not scoped per component), never reused. No fold over
 * prior allocations is needed or performed.
 *
 * @param {string} effortRoot
 * @param {string} component - must match /^[a-z0-9][a-z0-9-]*$/ (the same component-slug shape
 *   citations already require)
 * @returns {{ok: true, clauseId: string, seq: number} | {ok: false, error: string}}
 *   - a malformed component is rejected BEFORE any ledger append happens (nothing is written)
 *   - any failure append() itself reports (e.g. no .reasonable/ at effortRoot) is passed through
 *     verbatim as {ok: false, error}
 */
export function allocateClauseId(effortRoot, component) {
  if (typeof component !== 'string' || !COMPONENT_RE.test(component)) {
    return {
      ok: false,
      error: `allocateClauseId: component must match ${COMPONENT_RE} (got ${JSON.stringify(component)})`,
    };
  }
  const result = append(effortRoot, { type: 'clause-allocated', component });
  if (!result.ok) return { ok: false, error: result.error };
  const seq = result.event.seq;
  return { ok: true, clauseId: formatClauseId(component, seq), seq };
}

/**
 * Fold every `clause-allocated` event in this effort's ledger into a per-component list of the
 * ids ever allocated (in ledger order — the order they were minted, not sorted). This is the
 * "derived mirror" DESIGN-3.0 §4.2 names: computed fresh from the ledger, never cached to disk,
 * exactly like lib/contract.mjs's existing citationGraph(). An effort with no clause-allocated
 * events yet returns `{}`.
 *
 * @param {string} effortRoot
 * @returns {Object<string, string[]>} — e.g. `{lexer: ['lexer#c1', 'lexer#c5'], ast: ['ast#c3']}`
 */
export function allocatedClauseIds(effortRoot) {
  const ledgerPath = join(effortRoot, '.reasonable', 'ledger.jsonl');
  const events = readJsonl(ledgerPath);
  const byComponent = {};
  for (const e of events) {
    if (e.type !== 'clause-allocated' || typeof e.component !== 'string') continue;
    (byComponent[e.component] ||= []).push(formatClauseId(e.component, e.seq));
  }
  return byComponent;
}
