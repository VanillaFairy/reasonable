# Shared Interfaces — Part 3: The Atom

Every function signature, table, and object shape below is the exact contract later tasks build
against. Do not drift from these names or shapes — later tasks reference them verbatim.

## `lib/atom.mjs` — PURE section (new — produced by T01b, consumed by T02b)

```js
// lib/atom.mjs — the atom's charter/delta split, lifecycle state machine, and minimality/cohesion
// law (DESIGN-3.0 §4, §4.1, §4.3, reasonable 3.0 Part 3). This file has two sections: PURE (this
// one — zero I/O, takes only in-memory data) and I/O (appended by T02b, below the marker comment
// — routes through lib/ledger.mjs's append()). The pure section decides only whether a proposed
// move is mechanically legal; which move a failed attempt SHOULD take (which R-code applies) is
// Part 5's judgment, not this file's.

/** Every atom lifecycle state, in DESIGN-3.0 §4.1's pinned order. 'chartered' is the only entry
 *  point; 'merged' and 'retired' are the only terminals. "in-flight" (DESIGN-3.0's prose umbrella
 *  for tests-red -> green -> audited) is not itself a state name here. */
export const LIFECYCLE_STATES = Object.freeze([
  'chartered', 'ready', "spec'd", 'packed', 'tests-red', 'green', 'audited',
  'merged', 'retired-pending', 'retired',
]);

/** The two states with no outgoing edge. */
export const TERMINAL_STATES = Object.freeze(['merged', 'retired']);

/** The three orthogonal flags (DESIGN-3.0 §4.1: "flags, not states"). Independent of
 *  LIFECYCLE_STATES and of each other. */
export const FLAG_NAMES = Object.freeze(['frozen', 'guard-halted', 'dispatch-barred']);

/**
 * The lifecycle adjacency table (design doc Decision 5). A plain object; every key is a
 * LIFECYCLE_STATES member, every value is the array of LIFECYCLE_STATES it may legally move to.
 * Exported so a caller (or a test) can enumerate valid moves without re-deriving them from
 * isValidTransition — but isValidTransition, not direct object access, is the sanctioned way to
 * ask "is this move legal."
 */
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

/**
 * @param {unknown} from - a candidate current state
 * @param {unknown} to - a candidate next state
 * @returns {boolean} true iff `to` is a legal move from `from` per LIFECYCLE_TRANSITIONS. Returns
 *   false (never throws) for any `from`/`to` that isn't a LIFECYCLE_STATES member at all.
 */
export function isValidTransition(from, to);

/**
 * @param {unknown} flag
 * @returns {boolean} true iff `flag` is a FLAG_NAMES member. Never throws.
 */
export function isValidFlag(flag);

/**
 * A single delta clause, as this module consumes it (design doc Decision 4). Not a class, not
 * exported as a type — documented here as the shape cohesionComponents and the I/O functions
 * below all assume:
 *   { clauseId: string, citations: Array<{component: string, clause: string}>,
 *     demandedBy: string | null, locus: string[] }
 * `clauseId` is pre-allocated by lib/clause-id.mjs's allocateClauseId (Part 2) — this module
 * never mints one. `citations`/`demandedBy` are the exact fields lib/contract.mjs's parseContract
 * already produces on a landed clause; `locus` is delta-only bookkeeping this module adds (never
 * present on a landed, on-disk contract clause).
 */

/**
 * Build the clause-cohesion graph (DESIGN-3.0 §4.3) over `clauses` and return its connected
 * components. Edges: (a) two clauses share an identical {component, clause} entry somewhere in
 * their `citations`; (b) two clauses have identical, non-null `demandedBy` strings; (c) two
 * clauses' `locus` globs overlap once each is stripped of the literal `componentRoot` prefix (see
 * design doc Decision 6 for the precise stripping rule — a locus glob equal to `componentRoot`
 * itself, once stripped to '', contributes nothing to (c); a glob that doesn't start with
 * `componentRoot` at all is compared unstripped, conservatively, rather than dropped).
 *
 * @param {Array<{clauseId: string, citations: Array<{component,clause}>, demandedBy: string|null,
 *   locus: string[]}>} clauses - a delta's clauses, all belonging to the same component (this
 *   function does not itself verify that — callers pass one atom's delta, never a cross-atom mix)
 * @param {string} componentRoot - the literal repo-relative path prefix this delta's clauses are
 *   rooted under (e.g. `'lib/lexer/'`) — the SAME string shape as a charter's own `locus` entries
 *   and 2.x `footprint.mjs`'s `wo.locus` (repo-relative, not component-slug-relative). The caller
 *   (whoever holds the atom's charter) already knows this string; `cohesionComponents` does not
 *   derive or guess it from the clauses themselves.
 * @returns {string[][]} connected components, each an array of clauseIds, in the order first
 *   encountered while walking `clauses`. Exactly one component means the delta coheres. More than
 *   one is R4's split proposal, verbatim — the outer array IS the proposed partition, no
 *   additional wrapping. An empty `clauses` array returns `[]` (zero components, not an error).
 */
export function cohesionComponents(clauses, componentRoot);

// ── I/O functions appended by T02b (see shared/conventions.md — do not edit above this line) ──
```

## `lib/atom.mjs` — I/O section (appended — produced by T02b, below T01b's marker)

```js
import { append } from './ledger.mjs';
import { readJsonl } from './effort.mjs';
import { join } from 'node:path';

/**
 * Charter a new atom: allocate its id and record its charter (design doc Decision 3). Premises
 * use the exact tagged-reference syntax lib/contract.mjs's DEMANDED_BY_RE already defines
 * (`goal:<id>` | `gate:<verbatim gate string>` | `cite:<component>#c<N>` | `ledger:<seq>`) —
 * import DEMANDED_BY_TAGS from '../lib/contract.mjs' and reuse its regex source rather than
 * re-deriving one; do not add an `intention:` tag (design doc Decision 3's flagged, un-owned gap
 * — out of scope here).
 *
 * @param {string} effortRoot
 * @param {{component: string, premises: string[], purpose: string, locus: string[], order: number}} charter
 * @returns {{ok: true, id: string, seq: number} | {ok: false, error: string}}
 *   - component must match /^[a-z0-9][a-z0-9-]*$/ (same slug shape clause ids/citations require)
 *   - every premises[] entry must match the demanded-by tag grammar; purpose must be a non-empty
 *     string; locus must be an array (may be empty); order must be a non-negative integer
 *   - any shape violation is rejected BEFORE any ledger append happens (nothing is written)
 *   - the id is `a-${seq}` where seq is the seq append() assigns to the atom-chartered event
 */
export function charterAtom(effortRoot, charter);

/**
 * Author the initial delta for a chartered atom, transitioning it ready -> spec'd. Rejects (writes
 * nothing) if the atom is not currently in the 'ready' state (checked via loadAtom).
 *
 * @param {string} effortRoot
 * @param {string} atomId
 * @param {Array<{clauseId, citations, demandedBy, locus}>} clauses - see the PURE section's clause
 *   shape doc; every clauseId must already be allocated (this function does not allocate one)
 * @returns {{ok: true} | {ok: false, error: string}}
 */
export function authorDelta(effortRoot, atomId, clauses);

/**
 * Record an in-flight delta-enrichment (DESIGN-3.0 §4.1 — the event type name is pinned by
 * DESIGN-3.0 itself, not invented here). Rejects if the atom is not currently in one of the
 * in-flight states ('packed', 'tests-red', 'green', 'audited'). Does NOT itself re-run cohesion,
 * footprint, or the spec-time guard — DESIGN-3.0 says enrichment "mechanically re-runs" those
 * checks, but running them is the CALLER's job (a later part's pipeline): this function's only
 * job is to durably record that the enrichment happened. A caller that wants the post-enrichment
 * cohesion answer calls cohesionComponents itself, separately, on the updated clause list.
 *
 * @param {string} effortRoot
 * @param {string} atomId
 * @param {{clauseId, citations, demandedBy, locus}} clause - one additional clause
 * @returns {{ok: true} | {ok: false, error: string}}
 */
export function enrichDelta(effortRoot, atomId, clause);

/**
 * Transition an atom from its current state to `to`. Reads the current state via loadAtom, checks
 * isValidTransition(current, to), and only then appends. Rejects (writes nothing) on an illegal
 * move or an unknown atomId.
 *
 * @param {string} effortRoot
 * @param {string} atomId
 * @param {string} to - a LIFECYCLE_STATES member
 * @returns {{ok: true, from: string, to: string} | {ok: false, error: string}}
 */
export function transitionAtom(effortRoot, atomId, to);

/**
 * @param {string} effortRoot
 * @param {string} atomId
 * @param {string} flag - a FLAG_NAMES member
 * @param {string} reason - free text, why the flag is being set (recorded, never validated for
 *   content — matches this codebase's existing tolerance for free-text `reason` fields elsewhere)
 * @returns {{ok: true} | {ok: false, error: string}}
 */
export function setFlag(effortRoot, atomId, flag, reason);

/** @returns {{ok: true} | {ok: false, error: string}} - same shape as setFlag; clearing an
 *  already-clear flag is a no-op success (idempotent), not an error. */
export function clearFlag(effortRoot, atomId, flag);

/**
 * Fold every atom-chartered / atom-delta-authored / delta-enrichment / atom-transitioned /
 * atom-flag-set / atom-flag-cleared event for ONE atom id, in ledger order, into its current
 * record. The "derived mirror" pattern (matches allocatedClauseIds/citationGraph — computed
 * fresh, never cached to disk).
 *
 * @param {string} effortRoot
 * @param {string} atomId
 * @returns {{id: string, component: string, premises: string[], purpose: string, locus: string[],
 *   order: number, state: string, flags: Set<string>, deltaClauses: Array<object>} | null} - null
 *   if this id was never chartered (no atom-chartered event with this id exists)
 */
export function loadAtom(effortRoot, atomId);

/**
 * @param {string} effortRoot
 * @returns {Object<string, ReturnType<typeof loadAtom>>} - every chartered atom, keyed by id. An
 *   effort with no atom-chartered events returns `{}`.
 */
export function foldAtoms(effortRoot);
```

## `lib/ledger.mjs` (existing — modified by T02b)

No new function exports. **Six new lines** in the existing `EVENT_SCHEMAS` object, in the Family 3
block, immediately after the `'clause-allocated'` entry:

```js
export const EVENT_SCHEMAS = {
  // ... Family 1 and Family 2 entries unchanged ...

  // Family 3 — domain events, loose validation. enrichment/characterization/clause-allocated/
  // atom-chartered additionally require `component`; the rest of the atom-lifecycle events
  // (reasonable 3.0 Part 3) key on `atomId` instead. Everything else here has no required fields
  // of its own.
  'enrichment': { required: ['component'] },
  'amendment': { required: [], validate: validateDropsAndResolvesSeq },
  'characterization': { required: ['component'] },
  'clause-allocated': { required: ['component'] },
  'atom-chartered': { required: ['component'] },
  'atom-delta-authored': { required: ['atomId'] },
  'delta-enrichment': { required: ['atomId'] },
  'atom-transitioned': { required: ['atomId', 'from', 'to'] },
  'atom-flag-set': { required: ['atomId', 'flag'] },
  'atom-flag-cleared': { required: ['atomId', 'flag'] },
  'characterization-promotion': { required: [] },
  // ... rest of Family 3 unchanged ...
};
```

Note the comment update (documents the new `atomId`-keyed sub-family) — keep it accurate, it is
not just a code change. `FAMILY_1_TYPES`, `FAMILY_2_TYPES`, `validateEvent()`'s generic loop, and
`append()`'s own internals are **not** touched — none of these six new types need `node`/
`workOrder` address resolution, so Family 3's existing generic handling (the `else` branch in
`append()`'s locked callback) already does the right thing for all of them, exactly as it already
does for `clause-allocated`.

## Error/result-shape conventions (all new functions)

- `charterAtom`/`authorDelta`/`enrichDelta`/`transitionAtom`/`setFlag`/`clearFlag`: `{ok: true,
  ...}` / `{ok: false, error}` — matches `allocateClauseId`'s own envelope exactly.
- `isValidTransition`/`isValidFlag`: plain boolean, never throws — matches `CLAUSE_ID_RE.test()`'s
  predicate style.
- `cohesionComponents`: plain array of arrays, never throws — matches `citationGraph()`'s existing
  "operates on already-parsed shapes, no result envelope" style.
- `loadAtom`: folded record or `null`, never throws — matches `loadContract`'s existing style.
- `foldAtoms`: plain object, never throws — matches `allocatedClauseIds`'s exact contract.
