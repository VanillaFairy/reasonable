# Task T01b: Router + ladder + R1/R4/R9 impl (green)

**Role:** `green` — create `lib/rewrite.mjs` with its T01 section (top of the file, ending in the
T02b marker). Implement exactly what the locked tests require; do not modify any test file.

## References
- Read: `../shared/architecture.md`, `../shared/interfaces.md` (in full), `../shared/conventions.md`
- Read: `../knowledge/running-tests.md`
- Read: `test/rewrite-router.test.mjs` and `test/rewrite-simple-verdicts.test.mjs` (T01a's locked
  tests — the exact behavior you implement)
- Read: `lib/atom.mjs` (import `isValidTransition`, `cohesionComponents`), `lib/graph.mjs` (import
  `citationClosureOver`) — you import these; you do NOT edit them. `lib/effects.mjs` is the TESTS'
  validator (`validateEffects`), NOT a library dependency — the lib emits effect literals like
  `lib/graph.mjs` does, so it does not import `effects.mjs`

## Dependencies
- Depends on: T01a (locked tests)
- Depended on by: T01c (audits), T02a/T02b (append below your marker), T03a

## Scope
**Files:**
- Create: `lib/rewrite.mjs`

**BOUNDARY — you MUST NOT modify any files outside this list.** Do NOT modify
`test/rewrite-router.test.mjs` or `test/rewrite-simple-verdicts.test.mjs` — locked. If a test looks
wrong, stop and escalate; never edit it. Do NOT edit `lib/effects.mjs`, `lib/atom.mjs`, or
`lib/graph.mjs` — import from them only.

## Positive Constraints (DO)
- Implement the T01-section exports named in `../shared/interfaces.md`: `VERDICT_KINDS`,
  `RCODE_TO_KIND`, `computeVerdictEffects`, `routeRefutedPremise`, and the R1/R4/R9 rules registered
  into the shared `RULES` object.
- End the file with the exact marker comment shown in Step 1 so T02b can append below it.

## Negative Constraints (DO NOT)
- Do NOT implement R2/R3/R5/R6/R7 (T02b), ceremony/unwind/R8 (T03b), `scc`, or `dependentCone`.
- Do NOT do any I/O — no `readJsonl`, no `append`, no `fs`. Pure functions only.
- Do NOT import `lib/ledger.mjs`, `lib/footprint.mjs`, or `lib/route.mjs`.

## Implementation Steps

### Step 1: Write `lib/rewrite.mjs` (the whole T01 section)

```js
// lib/rewrite.mjs — the failure calculus (DESIGN-3.0 §7, §7.1, §7.2, reasonable 3.0 Part 5). A PURE
// library: given an already-typed, already-audited R1–R9 verdict and a read-only graph snapshot, it
// computes a two-phase {provisional, permanent} set of lib/effects.mjs-shaped effects. It computes;
// it never applies, reads disk, or appends a ledger event — the append-path wiring, the
// collision-free 3.0-verdict event type, and the effects-overlay fold are all Part 7's (see the
// design doc's central scoping decision). The file grows across three triads; each appends a
// disjoint section below its marker and registers verdict kinds into the shared RULES object by
// assignment (RULES['kind'] = fn), never by editing the router or a prior section.

// The library imports ONLY what it uses. Edge kinds ('needs'/'excludes'/…) and flag names
// ('frozen'/…) are emitted as string literals, exactly as lib/graph.mjs emits its edge kinds — so
// lib/effects.mjs is NOT imported here; it is the TESTS' validator, not a library dependency. State
// transitions ARE validated at emit time (isValidTransition), because an illegal transition is a
// caller error that must HALT — unlike a literal in this trusted code, which a test would catch.
import { isValidTransition, cohesionComponents } from './atom.mjs';
import { citationClosureOver } from './graph.mjs';

// ── vocabulary ──────────────────────────────────────────────────────────────

export const VERDICT_KINDS = Object.freeze([
  'checkpoint', 'dead-end', 'ripple', 'oversized', 'unknown-blocking',
  'cycle-detected', 'parity-breach', 'illegible', 'stale-spec',
]);

export const RCODE_TO_KIND = Object.freeze({
  R1: 'checkpoint', R2: 'dead-end', R3: 'ripple', R4: 'oversized', R5: 'unknown-blocking',
  R6: 'cycle-detected', R7: 'parity-breach', R8: 'illegible', R9: 'stale-spec',
});

// ── the RULES registry + the total router (§7.2 Totality) ────────────────────
// Each triad registers its verdict kinds into this shared object by assignment. The router reads it
// dynamically, so it "grows" as later sections register and is never itself edited.

const RULES = {};

export function computeVerdictEffects(verdict, state) {
  if (!verdict || typeof verdict.kind !== 'string') {
    return { ok: false, error: 'verdict.kind is required' };
  }
  const rule = Object.hasOwn(RULES, verdict.kind) ? RULES[verdict.kind] : undefined;
  if (!rule) return { ok: false, error: `unknown or unregistered verdict kind ${JSON.stringify(verdict.kind)}` };
  const result = rule(verdict, state || {});
  if (result && result.error) return { ok: false, error: result.error };
  const out = { ok: true, provisional: result.provisional, permanent: result.permanent };
  if (result.route !== undefined) out.route = result.route;
  return out;
}

// ── §7.1 routing ladder ─────────────────────────────────────────────────────

export function routeRefutedPremise(premise, state) {
  const layer = premise && premise.layer;
  if (layer === 'goal') return 'goal-respec';
  if (layer === 'intention') return 'intent-fork'; // always human, both modes (relies on P3's
                                                    // still-un-owned intention-citation grammar)
  if (layer === 'delta') return 're-charter';
  // contract layer (the default): a seam if the refuted clause's citation closure spans ≥2 foreign
  // components — an under-approximation the design flags (a single-component refutation never
  // mis-routes to a re-cut).
  const closure = citationClosureOver((state && state.citationGraph) || {}, [premise.component]);
  const foreign = closure.filter((c) => c !== premise.component);
  return foreign.length >= 2 ? 'topologist-recut' : 'amendment';
}

// ── shared effect-builder helpers ────────────────────────────────────────────

function atomById(state, atomId) {
  return (state.atoms || []).find((a) => a.id === atomId) || null;
}

// Build a validated transition effect, or return {error} if the move is illegal (§7.2 — a rule
// never emits an illegal {state} effect; an illegal move is a caller error → HALT).
function transition(atomId, from, to, extra) {
  if (!isValidTransition(from, to)) {
    return { error: `${atomId}: ${from} -> ${to} is not a legal move` };
  }
  return { effect: { nodeId: atomId, change: { state: to, ...extra } } };
}

// ── R1 checkpoint ────────────────────────────────────────────────────────────

function ruleCheckpoint(verdict, state) {
  const { atomId, evidence } = verdict;
  const atom = atomById(state, atomId);
  if (!atom) return { error: `checkpoint: unknown atomId ${JSON.stringify(atomId)}` };
  const prior = (state.priorVerdicts || []).filter((v) => v.atomId === atomId && v.kind === 'checkpoint').length;
  if (prior >= 1) {
    // second independent exhaustion → auto-promote toward R2 (§7 R1 row). A plain exhaustion carries
    // no refuted premise, so this promotes into the dead-end lane WITHOUT a blast radius.
    const t = transition(atomId, atom.state, 'retired-pending', { promotedFrom: 'checkpoint', evidence });
    if (t.error) return t;
    return { provisional: [t.effect], permanent: [] };
  }
  const t = transition(atomId, atom.state, 'ready', { reprice: { factor: 'α' }, evidence });
  if (t.error) return t;
  return { provisional: [t.effect], permanent: [] };
}
RULES['checkpoint'] = ruleCheckpoint;

// ── R4 oversized ───────────────────────────────────────────────────────────
// The rule VALIDATES the proposed partition against §4.3: no proposed group may split a cohesion
// component (cohesionComponents, lib/atom.mjs). Sub-atoms are charter-intents that inherit the
// parent's sanction and dispatch freely — the work was already in the ratified plan (§7).

function ruleOversized(verdict, state) {
  const { atomId, partition, componentRoot = '' } = verdict;
  const atom = atomById(state, atomId);
  if (!atom) return { error: `oversized: unknown atomId ${JSON.stringify(atomId)}` };
  if (!Array.isArray(partition) || partition.length < 2) {
    return { error: 'oversized: partition must group the atom into >= 2 sub-atoms' };
  }
  const cohesion = cohesionComponents(atom.deltaClauses || [], componentRoot);
  const groupOf = new Map();
  partition.forEach((group, i) => group.forEach((clauseId) => groupOf.set(clauseId, i)));
  for (const cc of cohesion) {
    const groups = new Set(cc.map((clauseId) => groupOf.get(clauseId)));
    if (groups.size !== 1) {
      return { error: 'oversized: proposed partition splits a §4.3 cohesion component' };
    }
  }
  const t = transition(atomId, atom.state, 'retired-pending', { supersededBy: 'partition' });
  if (t.error) return t;
  const provisional = [t.effect];
  partition.forEach((group, i) => {
    provisional.push({ nodeId: `${atomId}/sub-${i}`, change: { charter: { clauses: group }, lineage: atomId, dispatchFree: true } });
  });
  return { provisional, permanent: [] };
}
RULES['oversized'] = ruleOversized;

// ── R9 stale-spec ─────────────────────────────────────────────────────────
// Mechanical, no judgment: the spec'd atom → ready with a stale delta, and the colliding pair
// serializes (an excludes edge, ordered by atom id).

function ruleStaleSpec(verdict, state) {
  const { atomId, collidesWith } = verdict;
  const atom = atomById(state, atomId);
  if (!atom) return { error: `stale-spec: unknown atomId ${JSON.stringify(atomId)}` };
  const t = transition(atomId, atom.state, 'ready', { staleDelta: true });
  if (t.error) return t;
  const [from, to] = atomId < collidesWith ? [atomId, collidesWith] : [collidesWith, atomId];
  return { provisional: [t.effect, { from, to, edge: 'excludes', op: 'add' }], permanent: [] };
}
RULES['stale-spec'] = ruleStaleSpec;

// ── structural verdicts (R2/R3/R5/R6/R7) appended by T02b — do not edit above this line ──
```

### Step 2: Run the locked tests to verify they pass

Run: `node test/rewrite-router.test.mjs` and `node test/rewrite-simple-verdicts.test.mjs`

Expected: `rewrite-router: all <N> checks pass. ✓` and `rewrite-simple-verdicts: all <N> checks
pass. ✓`, zero `FAIL` lines.

### Step 3: Confirm zero regression to the existing suite

Run `node test/effects.test.mjs`, `node test/atom-cohesion.test.mjs`, `node test/graph-edges.test.mjs`
(and any other `test/*.test.mjs`). All must still pass — you imported from those modules but edited
none of them.

### Step 4: Commit

```bash
git add lib/rewrite.mjs
git commit -m "feat(rewrite): the failure-calculus router, routing ladder, and R1/R4/R9"
```

## Acceptance Criteria
- [ ] `node test/rewrite-router.test.mjs` and `node test/rewrite-simple-verdicts.test.mjs` pass with
      zero failures
- [ ] `lib/rewrite.mjs` ends with the exact `// ── structural verdicts … appended by T02b … ──`
      marker line
- [ ] The file is pure — no `fs`, no `readJsonl`, no `append`; imports only `isValidTransition`/
      `cohesionComponents` (atom.mjs) and `citationClosureOver` (graph.mjs); no unused imports
- [ ] `lib/effects.mjs`, `lib/atom.mjs`, `lib/graph.mjs` were NOT modified
- [ ] The whole existing suite still passes; no file outside Scope was modified
