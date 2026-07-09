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

export const CLAUSE_ID_PATTERN = '[a-z0-9][a-z0-9-]*#c\\d+';
export const CLAUSE_ID_RE = new RegExp(`^${CLAUSE_ID_PATTERN}$`);

const PARSE_RE = /^([a-z0-9][a-z0-9-]*)#c(\d+)$/;

export function parseClauseId(id) {
  if (typeof id !== 'string') return null;
  const m = PARSE_RE.exec(id);
  if (!m) return null;
  return { component: m[1], n: Number(m[2]) };
}

export function formatClauseId(component, n) {
  return `${component}#c${n}`;
}

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
