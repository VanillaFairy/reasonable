// lib/atom.mjs — the atom's charter/delta split, lifecycle state machine, and minimality/cohesion
// law (DESIGN-3.0 §4, §4.1, §4.3, reasonable 3.0 Part 3). This file has two sections: PURE (this
// one — zero I/O, takes only in-memory data) and I/O (appended by T02b, below the marker comment
// — routes through lib/ledger.mjs's append()). The pure section decides only whether a proposed
// move is mechanically legal; which move a failed attempt SHOULD take (which R-code applies) is
// Part 5's judgment, not this file's.

export const LIFECYCLE_STATES = Object.freeze([
  'chartered', 'ready', "spec'd", 'packed', 'tests-red', 'green', 'audited',
  'merged', 'retired-pending', 'retired',
]);

export const TERMINAL_STATES = Object.freeze(['merged', 'retired']);

export const FLAG_NAMES = Object.freeze(['frozen', 'guard-halted', 'dispatch-barred']);

export const LIFECYCLE_TRANSITIONS = Object.freeze({
  chartered:         Object.freeze(['ready']),
  ready:             Object.freeze(["spec'd"]),
  "spec'd":          Object.freeze(['packed', 'ready', 'retired-pending']),
  packed:            Object.freeze(['tests-red', 'ready', 'retired-pending']),
  'tests-red':       Object.freeze(['green', 'ready', 'retired-pending']),
  green:             Object.freeze(['audited', 'ready', 'retired-pending']),
  audited:           Object.freeze(['merged', 'ready', 'retired-pending']),
  merged:            Object.freeze([]),
  'retired-pending': Object.freeze(['retired']),
  retired:           Object.freeze([]),
});

export function isValidTransition(from, to) {
  if (typeof from !== 'string' || typeof to !== 'string') return false;
  if (!Object.hasOwn(LIFECYCLE_TRANSITIONS, from)) return false;
  return LIFECYCLE_TRANSITIONS[from].includes(to);
}

export function isValidFlag(flag) {
  return typeof flag === 'string' && FLAG_NAMES.includes(flag);
}

// ── cohesion (DESIGN-3.0 §4.3) ──────────────────────────────────────────────

function citationKey(cite) {
  return `${cite.component}::${cite.clause}`;
}

/** Literal directory prefix of a glob (up to the first wildcard) — same algorithm as
 *  lib/footprint.mjs's private `prefix`, reimplemented here since that one isn't exported. */
function globPrefix(glob) {
  const star = glob.search(/[*?]/);
  const head = star === -1 ? glob : glob.slice(0, star);
  return head.replace(/\/[^/]*$/, '');
}

/** Strip `componentRoot` off the front of `glob` if present; if what remains is empty, this
 *  locus entry IS the bare root and is dropped (returns null). A glob that never started with
 *  `componentRoot` is returned unstripped (conservative — never silently dropped). */
function stripRoot(glob, componentRoot) {
  if (typeof glob !== 'string') return null;
  const stripped = glob.startsWith(componentRoot) ? glob.slice(componentRoot.length) : glob;
  return stripped === '' ? null : stripped;
}

/** True iff any glob in `a` overlaps (ancestor-or-equal prefix) any glob in `b` — same
 *  conservative ancestor-overlap rule as lib/footprint.mjs's private `lociOverlap`, applied to
 *  already-root-stripped glob lists. */
function anyOverlap(a, b) {
  for (const ga of a) for (const gb of b) {
    const pa = globPrefix(ga), pb = globPrefix(gb);
    if (pa === '' || pb === '') return true;
    if (pa === pb) return true;
    if ((pa + '/').startsWith(pb + '/') || (pb + '/').startsWith(pa + '/')) return true;
    if (ga === gb) return true;
  }
  return false;
}

function cohere(a, b, componentRoot) {
  // (a) a common provider clause
  const aCites = new Set(a.citations.map(citationKey));
  if (b.citations.some((c) => aCites.has(citationKey(c)))) return true;
  // (b) shared, non-null demanded-by
  if (a.demandedBy !== null && a.demandedBy === b.demandedBy) return true;
  // (c) loci overlap below the component root
  const strippedA = (a.locus || []).map((g) => stripRoot(g, componentRoot)).filter((g) => g !== null);
  const strippedB = (b.locus || []).map((g) => stripRoot(g, componentRoot)).filter((g) => g !== null);
  if (strippedA.length && strippedB.length && anyOverlap(strippedA, strippedB)) return true;
  return false;
}

export function cohesionComponents(clauses, componentRoot) {
  const n = clauses.length;
  const parent = clauses.map((_, i) => i);
  function find(i) { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; }
  function union(i, j) { const ri = find(i), rj = find(j); if (ri !== rj) parent[ri] = rj; }

  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      if (cohere(clauses[i], clauses[j], componentRoot)) union(i, j);
    }
  }

  const groups = new Map();
  for (let i = 0; i < n; i += 1) {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(clauses[i].clauseId);
  }
  return [...groups.values()];
}

// ── I/O functions appended by T02b (see shared/conventions.md — do not edit above this line) ──

import { append } from './ledger.mjs';
import { readJsonl } from './effort.mjs';
import { join } from 'node:path';
import { DEMANDED_BY_TAGS } from './contract.mjs';

const COMPONENT_RE = /^[a-z0-9][a-z0-9-]*$/;
const PREMISE_RE = new RegExp(`^(?:${DEMANDED_BY_TAGS.join('|')}):\\S.*$`, 'i');
const IN_FLIGHT_STATES = Object.freeze(['packed', 'tests-red', 'green', 'audited']);

function ledgerPath(effortRoot) {
  return join(effortRoot, '.reasonable', 'ledger.jsonl');
}

/** Fold every atom-* event belonging to `atomId` out of an ALREADY-LOADED events array — exposed so
 *  a caller holding its own pre-filtered event array (e.g. a seq-bounded slice) can fold without
 *  re-reading the ledger file itself (reasonable 3.0 Part 4 — lib/graph.mjs's as-lived projection
 *  is this function's first caller). loadAtom/foldAtoms below are still the ordinary,
 *  whole-ledger read surface for everyone else. */
export function foldAtomFromEvents(events, atomId) {
  let record = null;
  for (const e of events) {
    if (e.type === 'atom-chartered') {
      if (`a-${e.seq}` !== atomId) continue;
      record = {
        id: atomId,
        component: e.component,
        premises: e.premises || [],
        purpose: e.purpose || '',
        locus: e.locus || [],
        order: e.order,
        state: 'chartered',
        flags: new Set(),
        deltaClauses: [],
      };
      continue;
    }
    if (!record || e.atomId !== atomId) continue;
    switch (e.type) {
      case 'atom-transitioned':
        record.state = e.to;
        break;
      case 'atom-delta-authored':
        record.deltaClauses = e.clauses || [];
        record.state = "spec'd";
        break;
      case 'delta-enrichment':
        record.deltaClauses = [...record.deltaClauses, e.clause];
        break;
      case 'atom-flag-set':
        record.flags.add(e.flag);
        break;
      case 'atom-flag-cleared':
        record.flags.delete(e.flag);
        break;
      default:
        break;
    }
  }
  return record;
}

/**
 * Validate a charter's five STRUCTURE-ONLY fields (§13) — component / premises / purpose / locus /
 * order — without appending anything. The shared shape check charterAtom and the Part-8 scout seed
 * (lib/scout-seed.mjs) both use, so the seed's draft charters are charter-shaped by construction, not
 * by a re-declared copy of these rules.
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function validateCharterShape(charter) {
  const { component, premises, purpose, locus, order } = charter || {};
  if (typeof component !== 'string' || !COMPONENT_RE.test(component)) {
    return { ok: false, error: `charter: component must match ${COMPONENT_RE} (got ${JSON.stringify(component)})` };
  }
  if (!Array.isArray(premises) || premises.some((p) => typeof p !== 'string' || !PREMISE_RE.test(p))) {
    return { ok: false, error: 'charter: every premise must be a well-formed tagged reference (goal:|gate:|cite:|ledger:)' };
  }
  if (typeof purpose !== 'string' || purpose.length === 0) {
    return { ok: false, error: 'charter: purpose must be a non-empty string' };
  }
  if (!Array.isArray(locus)) {
    return { ok: false, error: 'charter: locus must be an array' };
  }
  if (!Number.isInteger(order) || order < 0) {
    return { ok: false, error: 'charter: order must be a non-negative integer' };
  }
  return { ok: true };
}

export function charterAtom(effortRoot, charter) {
  const shape = validateCharterShape(charter);
  if (!shape.ok) return { ok: false, error: shape.error };
  const { component, premises, purpose, locus, order } = charter;
  const result = append(effortRoot, { type: 'atom-chartered', component, premises, purpose, locus, order });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, id: `a-${result.event.seq}`, seq: result.event.seq };
}

export function transitionAtom(effortRoot, atomId, to) {
  const atom = loadAtom(effortRoot, atomId);
  if (!atom) return { ok: false, error: `transitionAtom: unknown atomId ${JSON.stringify(atomId)}` };
  if (!isValidTransition(atom.state, to)) {
    return { ok: false, error: `transitionAtom: ${atom.state} -> ${to} is not a legal move` };
  }
  const result = append(effortRoot, { type: 'atom-transitioned', atomId, from: atom.state, to });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, from: atom.state, to };
}

export function authorDelta(effortRoot, atomId, clauses) {
  const atom = loadAtom(effortRoot, atomId);
  if (!atom) return { ok: false, error: `authorDelta: unknown atomId ${JSON.stringify(atomId)}` };
  if (atom.state !== 'ready') {
    return { ok: false, error: `authorDelta: atom must be in 'ready' state (currently '${atom.state}')` };
  }
  const result = append(effortRoot, { type: 'atom-delta-authored', atomId, clauses });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true };
}

export function enrichDelta(effortRoot, atomId, clause) {
  const atom = loadAtom(effortRoot, atomId);
  if (!atom) return { ok: false, error: `enrichDelta: unknown atomId ${JSON.stringify(atomId)}` };
  if (!IN_FLIGHT_STATES.includes(atom.state)) {
    return { ok: false, error: `enrichDelta: atom must be in an in-flight state (currently '${atom.state}')` };
  }
  const result = append(effortRoot, { type: 'delta-enrichment', atomId, clause });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true };
}

export function setFlag(effortRoot, atomId, flag, reason) {
  const atom = loadAtom(effortRoot, atomId);
  if (!atom) return { ok: false, error: `setFlag: unknown atomId ${JSON.stringify(atomId)}` };
  if (!isValidFlag(flag)) return { ok: false, error: `setFlag: flag must be one of ${FLAG_NAMES.join(', ')}` };
  const result = append(effortRoot, { type: 'atom-flag-set', atomId, flag, reason });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true };
}

export function clearFlag(effortRoot, atomId, flag) {
  const atom = loadAtom(effortRoot, atomId);
  if (!atom) return { ok: false, error: `clearFlag: unknown atomId ${JSON.stringify(atomId)}` };
  if (!isValidFlag(flag)) return { ok: false, error: `clearFlag: flag must be one of ${FLAG_NAMES.join(', ')}` };
  const result = append(effortRoot, { type: 'atom-flag-cleared', atomId, flag });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true };
}

/** Fold every chartered atom out of an ALREADY-LOADED events array — foldAtoms's own body, minus
 *  its own readJsonl call (reasonable 3.0 Part 4 — lib/graph.mjs's as-lived projection needs this
 *  composable with a pre-filtered event array). */
export function foldAtomsFromEvents(events) {
  const ids = events.filter((e) => e.type === 'atom-chartered').map((e) => `a-${e.seq}`);
  const result = {};
  for (const id of ids) result[id] = foldAtomFromEvents(events, id);
  return result;
}

export function loadAtom(effortRoot, atomId) {
  const events = readJsonl(ledgerPath(effortRoot));
  return foldAtomFromEvents(events, atomId);
}

export function foldAtoms(effortRoot) {
  const events = readJsonl(ledgerPath(effortRoot));
  return foldAtomsFromEvents(events);
}
