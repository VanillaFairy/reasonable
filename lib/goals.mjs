// lib/goals.mjs — the pure loader for `.reasonable/goals.json` (reasonable 3.0 Part 6d).
//
// goals.json is the machine-parsed twin of the ratified top-level scenario set (DESIGN-3.0 §3, §5.5):
// an ARRAY of goal entries, each { id, scenario, scenarioCitations, ratifiedAt?, ledgerSeq? }. Its
// `scenarioCitations` are the per-clause references lib/graph.mjs's `servesEdges` consumes to compute
// each goal's cone — servesEdges reads `citation.clause` (a `component#cN` ref), so this loader
// validates each citation carries a non-empty-string `clause` and preserves the citation objects
// verbatim, so the loaded goals compose with servesEdges without a translation layer.
//
// Law 1 (dependency-free): node builtins only — no imports beyond node:fs/node:path. In particular it
// does NOT import parseClauseId from clause-id.mjs — that would drag in ledger.mjs/effort.mjs; the
// loader validates `clause` is a non-empty string, leaving clause-id well-formedness to the write path.
//
// CONSERVATIVE BY DESIGN, modeled EXACTLY on lib/route.mjs's readRoute:
//   - absent goals.json     -> { goals: null, diagnostic: null }   (a pre-ratification effort state)
//   - present but malformed  -> { goals: null, diagnostic: '<reason>' }  (never a repair, never a
//                              partial trust — ONE bad entry fails the WHOLE load)
//   - valid                  -> { goals: [ ...normalized entries ], diagnostic: null }
// Nothing reads goals.json until P7 wires the frontier loop; P6d builds the loader only.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * @param {string} effortRoot
 * @returns {{ goals: Array<object> | null, diagnostic: string | null }}
 */
export function readGoals(effortRoot) {
  const path = join(effortRoot, '.reasonable', 'goals.json');
  if (!existsSync(path)) return { goals: null, diagnostic: null };

  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    return { goals: null, diagnostic: `goals.json: invalid JSON — ${(e && e.message) || String(e)}` };
  }

  if (!Array.isArray(parsed)) {
    return { goals: null, diagnostic: 'goals.json: expected a JSON array of goal entries' };
  }

  const goals = [];
  for (let i = 0; i < parsed.length; i += 1) {
    const entry = parsed[i];
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      return { goals: null, diagnostic: `goals.json: entry ${i}: expected an object` };
    }
    const { id, scenario, scenarioCitations, ratifiedAt, ledgerSeq } = entry;
    if (typeof id !== 'string' || id.length === 0) {
      return { goals: null, diagnostic: `goals.json: entry ${i}: "id" must be a non-empty string` };
    }
    if (typeof scenario !== 'string' || scenario.length === 0) {
      return { goals: null, diagnostic: `goals.json: entry ${i}: "scenario" must be a non-empty string` };
    }
    if (!Array.isArray(scenarioCitations)) {
      return { goals: null, diagnostic: `goals.json: entry ${i}: "scenarioCitations" must be an array` };
    }
    for (let j = 0; j < scenarioCitations.length; j += 1) {
      const cite = scenarioCitations[j];
      if (cite === null || typeof cite !== 'object' || Array.isArray(cite) ||
          typeof cite.clause !== 'string' || cite.clause.length === 0) {
        return {
          goals: null,
          diagnostic: `goals.json: entry ${i}: scenarioCitations[${j}] must be an object with a non-empty string "clause"`,
        };
      }
    }
    goals.push({
      id,
      scenario,
      scenarioCitations,
      ratifiedAt: typeof ratifiedAt === 'string' ? ratifiedAt : null,
      ledgerSeq: Number.isFinite(ledgerSeq) ? ledgerSeq : null,
    });
  }

  return { goals, diagnostic: null };
}
