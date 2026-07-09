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
