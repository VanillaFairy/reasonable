# Shared Interfaces — P6a: The Planned-Edge Fold

**Version:** 1.0

The exact public surface P6a adds to `lib/graph.mjs`. One pure function. Grounded in the shipped
exports of `lib/graph.mjs`, `lib/atom.mjs`, `lib/clause-id.mjs` (read them; do not assume).

## The one new export

```js
/**
 * PLANNED needs edges (DESIGN-3.0 §2.2) — genesis-time dependency edges derived from charters
 * ALONE, before any delta exists. `needsEdges` reads `deltaClauses[].citations` (spec-time data a
 * charter does not have) and returns [] at genesis; this is its planned-fidelity sibling.
 *
 * @param {Array<{id:string, component:string, premises?:string[], order?:number}>} charters
 *        Folded atom records (as from `foldAtoms` / `foldAtomsFromEvents`). Reads only id,
 *        component, premises, order — ignores every other field.
 * @returns {Array<{from:string, to:string, edge:'needs', op:'add'}>}
 *        Deduplicated, no self-edges. Same shape as `needsEdges` — planned vs actual is which
 *        function produced the array, never a per-edge tag.
 *
 * Two sources, unioned (§2.2):
 *  (a) cross-component quotient — for each charter A in component X, each premise `cite:Y#cN`
 *      whose `parseClauseId('Y#cN').component` is a component Y ≠ X, A planned-needs EVERY atom of
 *      component Y (from:A, to:each provider). A premise that is not `cite:`-tagged, or whose ref
 *      does not parse as a clause id (e.g. a future intention address — P3's un-owned gap), yields
 *      no edge. A cite into A's own component yields no cross edge (that is source (b)'s job).
 *  (b) intra-component ordering — within one component, group atoms by `order`; every atom in an
 *      order stratum planned-needs every atom in the immediately-preceding non-empty stratum
 *      (from:later, to:earlier). Equal-order atoms are concurrent (no edge between them). A charter
 *      with a non-integer/absent `order` is treated as order 0.
 */
export function plannedNeedsEdges(charters);
```

## The `needs` edge direction (match `needsEdges` exactly)

A `needs` edge `{from: A, to: B}` means **A needs B** — A cannot start before B lands. The shipped
`needsEdges` emits `{from: atom.id, to: providerId}` (the consumer needs the provider). Planned edges
follow the same direction: the atom with the `cite:` premise needs the cited component's atoms; the
later-order atom needs the earlier-order atom.

## Imports P6a adds to `lib/graph.mjs`

```js
import { parseClauseId } from './clause-id.mjs';
```

`parseClauseId(id)` is **pure** — returns `{component, n} | null`, never throws (read
`lib/clause-id.mjs`). It is the shipped shape helper; do **not** re-implement the `<component>#c<N>`
regex locally (DRY — Decision 9 reuses public exports, mirrors only *private* ones). No other new
import; no `node:fs`, no `append`, nothing I/O-bearing — the pure section stays runtime-pure.

## Placement in `lib/graph.mjs`

`lib/graph.mjs` has two sections split by the marker line
`// ── I/O functions appended by T02b (see shared/conventions.md — do not edit above this line) ──`.
`plannedNeedsEdges` is **pure** (in-memory charters in, edges out) so it belongs in the **pure**
section: insert it **immediately above that I/O marker**, under its own sub-section comment, and add
the `parseClauseId` import at the top of the file (after the header comment block). This is a pure
addition to the pure section, not an edit of the I/O section — P6a is the sole editor of `graph.mjs`,
so there is no concurrent triad to conflict with.
