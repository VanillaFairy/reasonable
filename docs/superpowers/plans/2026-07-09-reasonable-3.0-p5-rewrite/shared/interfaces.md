# Shared Interfaces — Part 5: The Rewrite Engine

**Version:** 1.0

This is the exact public surface of `lib/rewrite.mjs` every task in this plan tests or implements.
Every signature here is **pure** — no `effortRoot`, no disk, no `append()`. Grounded in the shipped
exports of `lib/effects.mjs`, `lib/atom.mjs`, `lib/graph.mjs` (read them; do not assume).

## The two effect shapes (from `lib/effects.mjs` — unchanged, reused verbatim)

Every effect this engine emits is one of exactly two shapes `lib/effects.mjs`'s `validateEffects`
already accepts:

- **Node effect** — `{ nodeId, change }`. `nodeId` a non-empty string; `change` any JSON value
  (never `undefined`). Part 5 owns the `change` sub-vocabulary (below).
- **Edge effect** — `{ from, to, edge, op }`. `edge ∈ ['needs','excludes','serves','informs']`
  (`EDGE_NAMES`); `op ∈ ['add','remove']` (`EDGE_OPS`).

**Every rule's `provisional` and `permanent` arrays MUST pass `validateEffects` by construction** —
the tests assert this for each rule.

### The `change` sub-vocabulary (Part 5 pins this — `effects.mjs` leaves `change` free-form)

| `change` shape | meaning | emitted by |
|---|---|---|
| `{ state: <LIFECYCLE_STATE>, …extra }` | an atom lifecycle transition (validated legal with `isValidTransition` **before** emission) | R1, R2, R4, R7, R9 |
| `{ flag: <FLAG_NAME>, op: 'set'\|'clear', reason? }` | a flag move (flag name a pinned literal: `frozen`/`guard-halted`/`dispatch-barred`) | R2, R3, R5, R6, R7 |
| `{ charter: {…}, lineage, … }` | a **birth intent** — a new node whose real `a-<seq>` id is minted only at apply (Part 7); addressed by a synthetic anchor key here | R2, R3, R4, R5, R6 |
| `{ reprice: { factor } }` (part of a `{state}` change) | R1/R2 repricing annotation — `factor: 'α'` is **symbolic**, uncalibrated (§16) | R1, R2, R7 |
| `{ band: <bandName>, from: <bandName>, armed: [<check>…] }` | a ceremony-escalation band raise (records `from` so the unwind is exact) | `ceremonyEscalation` |

A transition the `LIFECYCLE_TRANSITIONS` table forbids is a **programmer error in the caller's
verdict** — the rule returns `{ error }` (a HALT), it never emits an illegal `{state}` effect.

## Vocabulary

```js
export const VERDICT_KINDS = Object.freeze([
  'checkpoint',       // R1
  'dead-end',         // R2
  'ripple',           // R3
  'oversized',        // R4
  'unknown-blocking', // R5
  'cycle-detected',   // R6
  'parity-breach',    // R7
  'illegible',        // R8
  'stale-spec',       // R9
]);

export const RCODE_TO_KIND = Object.freeze({
  R1: 'checkpoint', R2: 'dead-end', R3: 'ripple', R4: 'oversized', R5: 'unknown-blocking',
  R6: 'cycle-detected', R7: 'parity-breach', R8: 'illegible', R9: 'stale-spec',
});
```

## The router (total — §7.2 Totality)

```js
/**
 * The single entry point Part 7 will call. Total: an unknown/unregistered kind HALTs (fail-closed).
 * @param {{kind: string, ...payload}} verdict
 * @param {GraphState} state
 * @returns {{ok:true, provisional:Effect[], permanent:Effect[], route?:string}}
 *        | {ok:false, error:string}
 */
export function computeVerdictEffects(verdict, state);
```

- Looks `verdict.kind` up in the internal `RULES` registry with `Object.hasOwn` (prototype-safe,
  matching `ledger.mjs`'s `validateEvent`).
- Unknown OR not-yet-registered kind ⇒ `{ ok:false, error: \`unknown verdict kind …\` }`.
- A registered kind runs its rule; if the rule returns `{ error }` (an illegal transition, a bad
  payload) the router propagates `{ ok:false, error }`; otherwise it returns
  `{ ok:true, provisional, permanent, route? }`.
- The router does **not** compute ceremony escalation — that is a sibling call Part 7 makes
  (`ceremonyEscalation`), per the design's "alongside its structural payload" framing.

## The §7.1 routing ladder

```js
/**
 * Classify where a refuted premise lives → the escalation route. Pure.
 * @param {{component:string, clause:string, layer:'delta'|'contract'|'goal'|'intention'}} premise
 * @param {GraphState} state  (uses state.citationGraph for the seam test)
 * @returns {'re-charter'|'amendment'|'topologist-recut'|'goal-respec'|'intent-fork'}
 */
export function routeRefutedPremise(premise, state);
```

Mapping (DESIGN-3.0 §7.1):

| `premise.layer` | rule | route |
|---|---|---|
| `'goal'` | tag | `'goal-respec'` |
| `'intention'` | tag (relies on P3's un-owned intention-citation grammar — see gaps) | `'intent-fork'` (**always human**) |
| `'delta'` | the atom's own delta | `'re-charter'` |
| `'contract'` | `citationClosureOver(state.citationGraph, [premise.component])` has ≥2 foreign components | `'topologist-recut'` |
| `'contract'` | otherwise | `'amendment'` |

## Ceremony escalation (T03 — the flagged open edge)

```js
/**
 * A verdict may ratchet the affected cone's complexity band UP (monotone, capped at the top band).
 * Fires only on the four §7 triggers: a wide R2, a foreign-reaching R3, an integration-exposing R9,
 * a second R1. Returns null when no trigger fires or the cone is already at the top band. Pure.
 * @returns {Effect|null}  a node effect { nodeId: coneId, change: { band, from, armed:[...] } }
 */
export function ceremonyEscalation(verdict, state);

/**
 * The exact inverse of a ceremony-escalation effect — restores the cone to its pre-escalation state
 * by pure subtraction (clear the band raise back to `from`, disarm every armed check). Because the
 * escalation only ever ARMED checks (never disarmed a guard), the unwind adds nothing.
 * INVARIANT (tested): applying `e` then `unwindCeremonyEscalation(e)` is identity — no residual band
 * raise, no residual armed check. This is DESIGN-3.0 open edge (c), built and tested, not asserted.
 * @returns {Effect[]}
 */
export function unwindCeremonyEscalation(escalationEffect);
```

## New pure graph helpers (T02 — the only genuinely new algorithms)

```js
/** Strongly-connected components over a directed edge list [{from,to},...] (Kosaraju; no deps).
 *  Returns an array of components, each an array of node ids. A component of size > 1 is a cycle. */
export function scc(edges);

/** The dependent cone of `atomId`: every atom that transitively NEEDS it (reverse-reachability over
 *  the `needs` subset of `edges`). Returns a Set of atom ids, EXCLUDING atomId itself. */
export function dependentCone(atomId, edges);
```

## The `GraphState` input shape (pinned here; Part 7 supplies a live instance)

```js
// GraphState — a read-only snapshot of the current graph. Part 5 tests build these by hand; Part 7
// builds them from graph.mjs's deriveCurrent + Part 6's band data.
{
  atoms,         // Array<{ id, component, deltaClauses, state, flags, ... }> — folded atom records
  edges,         // Array<Effect edge> {from,to,edge,op} — deriveCurrent's dependency edges
  citationGraph, // { [component]: string[] } — cited components (deriveCurrent's live graph)
  bands,         // { [coneId]: bandName }        — Part 6 data; a synthetic fixture today
  bandScale,     // string[] low→high             — Part 6 vocabulary; a synthetic fixture today
  bandBounds,    // { [coneId]: number }          — per-cone blast-width bound (ceremony trigger)
  priorVerdicts, // Array<{ atomId, kind }>       — read only by R1's auto-promote + the 2nd-R1 trigger
}
```

Every field is optional; a rule that reads a missing field treats it as empty (`state.edges || []`,
`state.priorVerdicts || []`, …) — never throws for a thin `state`, matching `graph.mjs`'s
"no charters yet → `{}`" tolerance.

## Per-kind verdict payloads (what the audited model judgment supplies; Part 5 consumes)

```js
{ kind:'checkpoint',       atomId, evidence }
{ kind:'dead-end',         atomId, premise:{component,clause,layer} }
{ kind:'ripple',           atomId, manifest:[{component,clause,type:'enrich'|'amend'}] }
{ kind:'oversized',        atomId, partition:[[clauseId,...], ...], componentRoot? }
{ kind:'unknown-blocking', atomId, question, dependents:[atomId,...] }
{ kind:'cycle-detected',   concept }                       // the SCC is read from state.edges
{ kind:'parity-breach',    atomId, breachEvidence }
{ kind:'illegible',        scope:'genesis'|'live', proposal }
{ kind:'stale-spec',       atomId, collidesWith }          // the colliding atom id
```

Ceremony triggers additionally read: `verdict.coneId` (or, absent it, the atom's `component` as its
cone, matching `graph.mjs`'s flat-by-component containment fallback); R9's integration trigger reads
an optional `verdict.integrationExposed` boolean; R2's wide trigger compares
`citationClosureOver(...).length` against `state.bandBounds[coneId]`.

## Imports (from already-shipped, already-exported surfaces — none edited)

**The library (`lib/rewrite.mjs`) imports only what it uses:**

```js
import { isValidTransition, cohesionComponents } from './atom.mjs';
import { citationClosureOver } from './graph.mjs';
```

Edge kinds (`'needs'`/`'excludes'`/…) and flag names (`'frozen'`/`'dispatch-barred'`/…) are emitted
as **string literals**, exactly as the shipped `lib/graph.mjs` emits its own edge kinds — so the
library does **not** import `lib/effects.mjs`. State transitions ARE validated at emit time with
`isValidTransition` (an illegal transition is a caller error that must HALT); flag/edge literals in
this trusted code cannot be mistyped without a test catching it. No unused imports; no import of
`lib/ledger.mjs`, `lib/footprint.mjs`, `lib/route.mjs`, `node:fs`, or anything I/O-bearing.

**The tests import the validator** (`lib/effects.mjs`), to assert every rule's output is well-shaped:

```js
import { validateEffects } from '../lib/effects.mjs';
```
