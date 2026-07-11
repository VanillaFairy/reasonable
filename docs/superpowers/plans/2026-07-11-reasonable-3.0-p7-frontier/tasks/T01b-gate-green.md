# Task T01b: GATE_RESULT + `gateDue` impl (green)

**Role:** `green` — create `lib/frontier.mjs` with its T01 section (the top of the file, ending in the
T02b marker). Implement exactly what the locked test requires; do not modify any test file.

## References
- Read: `../shared/architecture.md`, `../shared/interfaces.md` (in full — **§1.1** is your contract),
  `../shared/conventions.md` (the three purity tiers — **`lib/frontier.mjs` is PURE**)
- Read: `../knowledge/running-tests.md`
- Read: `test/frontier-gate.test.mjs` (T01a's locked test — the exact behavior you implement)
- Read: `lib/rewrite.mjs` (the sibling pure-calculus file — copy its header shape and the
  "grows across triads, each appends a disjoint section below its marker" structure)
- Read: `lib/graph.mjs` around its `// ── I/O functions appended by T02b … ──` marker (the repo's
  precedent for a **later section adding its own `import` line below the marker** — you will rely on
  that precedent in T02b/T03b, so build the marker to expect it)

## Dependencies
- Depends on: T01a (locked test)
- Depended on by: T01c (audits), T02a/T02b (append below your marker), T03a/T03b

## Scope
**Files:**
- Create: `lib/frontier.mjs`

**BOUNDARY — you MUST NOT modify any files outside this list.** Do NOT modify
`test/frontier-gate.test.mjs` — locked. If a test looks wrong, stop and escalate; never edit it. This
task writes ONLY the top section (`GATE_RESULT_KINDS` + `gateDue`) and ends at the T02b marker — do
NOT write `ready`/`pack`/`requiredRoles` (later triads).

## Positive Constraints (DO)
- Implement the two T01-section exports named in `../shared/interfaces.md` §1.1: `GATE_RESULT_KINDS`
  (the seven kinds, frozen, in the pinned order) and `gateDue(state, policy)` (the total gate
  function, decision order pinned in §1.1).
- The T01 section needs **no imports** — `gateDue` is pure over its `state` + `policy` arguments (all
  counts are pre-folded by the caller). Do not add an import line this section does not use.
- End the file with the exact marker comment shown in Step 1 so T02b can append below it.

## Negative Constraints (DO NOT)
- Do NOT implement `ready`/`pack` (T02b) or `requiredRoles` (T03b).
- Do NOT do any I/O — no `readJsonl`, no `readPolicy`, no `fs`. `gateDue` receives the already-loaded
  `policy` object; it does not read it from disk (that is reconcile's / the workflow's job).
- Do NOT return `'budget-exhausted'` from `gateDue` — it is the workflow's budget-guard outcome
  (§1.1 note). Do NOT return `{ kind: null }` — the non-firing answer is the in-band `{ kind: 'none' }`
  sentinel.
- Do NOT add `node:fs`, `Date`, `Math.random`, or any third-party import (Law 1; purity tier 1).

## Implementation Steps

### Step 1: Write `lib/frontier.mjs` (the whole T01 section)

```js
// lib/frontier.mjs — the pure frontier-loop calculus (DESIGN-3.0 §6 the frontier loop, §9 the
// band-indexed gate cadence, §7.2 totality; reasonable 3.0 Part 7). Verdict / graph / policy /
// footprint data in, plain values out: NO disk, NO append(), NO Date, NO Math.random — the same
// purity tier as lib/rewrite.mjs and lib/ceremony.mjs, unit-tested by hand-built fixtures.
//
// The file grows across three triads, each appending a DISJOINT section below its marker (never
// editing a prior section), exactly like lib/rewrite.mjs's RULES sections and lib/graph.mjs's
// appended I/O block. The only sibling-lib dependencies are pure, dependency-free helpers, and — per
// lib/graph.mjs's own precedent — each appended section declares the one `import` it needs at the top
// of that section (ESM hoists top-level imports, so this is legal and is the repo's established shape):
//   • T02b's pack imports footprintsDisjoint from ./footprint.mjs (interfaces.md §0 correction 1);
//   • T03b's requiredRoles imports rechartingDegenerates / retroClassificationDegenerates from
//     ./ceremony.mjs (interfaces.md §1.4 — reuse the shipped degeneration predicates, never re-derive
//     them; this is the design's Decision 9/10 "reuse over reimplement").
// Never node:fs, never an I/O module, never a third-party package.
//
// The frontier WORKFLOW (workflows/frontier-wave.workflow.js) cannot import this file — the workflow
// substrate forbids `import` (CLAUDE.md invariant 5) — so it INLINES pure mirrors of pack + gateDue,
// each with a `// Mirrors lib/frontier.mjs <fn> EXACTLY` comment (the repo's groupDisjoint precedent,
// interfaces.md §0 correction 2). This file is the unit-tested source of truth those mirrors track.

// ── the exhaustive GATE_RESULT union (§6, §9) ────────────────────────────────
// Frozen; the array order is the DECISION order gateDue evaluates — immediate-fire classes first, then
// batched/floor, with budget-exhausted (the workflow's guard outcome, never a gateDue return) and the
// totality HALT last. `blocked-human`, `goal-green` and `starved` fire REGARDLESS of band; the band
// only ever moves the `heartbeat` floor (§9).
export const GATE_RESULT_KINDS = Object.freeze([
  'blocked-human',    // an always-human class (policy/goal change §3, intent fork §7.1) — BOTH modes
  'goal-green',       // a goal cone reached green — the deep umbrella audit runs at THIS gate
  'starved',          // frontier empty / below quorum while gate-held material exists (liveness valve)
  'batch-full',       // a batched class grew past its pinned bound
  'heartbeat',        // the band-indexed floor tripped (N merged atoms OR M events since last gate)
  'budget-exhausted', // the wave budget spent, no wall claimed (R1) — surfaced by the WORKFLOW guard
  'halt',             // durability / totality failure (fail-closed inside an effort)
]);

// The fixed evaluation order of the batched classes, so batch-full is deterministic when several trip.
const BATCH_ORDER = ['amendments', 'deadEndPermanence', 'extractions', 'retopology'];

/**
 * The total gate function (§7.2 totality generalized from the router to the loop). Returns EXACTLY one
 * { kind, detail? } where kind ∈ GATE_RESULT_KINDS ∪ { 'none' }. Immediate-fire classes are checked
 * first and short-circuit; then batched/floor; an unrecognized control state is a `halt`, never a
 * silent fall-through; and a check that trips nothing returns the in-band `'none'` sentinel (keep
 * looping) — never `{ kind: null }` and never an empty object. `gateDue` never returns
 * `'budget-exhausted'` (the workflow's budget membrane surfaces that).
 *
 * @param {object} state   — a pre-digested GateState snapshot (interfaces.md §1.1); every count is
 *                            already folded, gateDue does no I/O.
 * @param {object} policy  — readPolicy().policy; reads policy.cadence[band] = { n, m }.
 * @returns {{ kind: string, detail?: object }}   kind ∈ GATE_RESULT_KINDS ∪ { 'none' }
 */
export function gateDue(state, policy) {
  // 1. totality: an unknown/unrecognized control state HALTs (fail-closed inside an effort).
  if (state.controlState !== undefined && state.controlState !== 'ok') {
    return { kind: 'halt', detail: { controlState: state.controlState } };
  }
  // 2. always-human class (policy/goal change, intent fork) — blocks in BOTH modes.
  if (state.blockedHuman) {
    return { kind: 'blocked-human', detail: state.blockedHuman };
  }
  // 3. a goal cone reached green — the deep umbrella audit runs at this gate.
  if (state.goalGreen) {
    return { kind: 'goal-green', detail: state.goalGreen };
  }
  // 4. the inbox load tripwire is an immediate-fire heartbeat (NOT a distinct kind — §6's union has
  //    seven; the tripwire routes to heartbeat). Disabled at tripwire 0.
  if (state.inboxTripwire > 0 && state.inboxLoad >= state.inboxTripwire) {
    return { kind: 'heartbeat', detail: { reason: 'inbox-load' } };
  }
  // 5. the liveness valve: a wide freeze empties the frontier while gate-held material waits.
  if (state.frontierSize < state.quorum && state.gateHeldCount > 0) {
    return { kind: 'starved' };
  }
  // 6. a batched class grew past its pinned bound (first in BATCH_ORDER wins — deterministic).
  for (const k of BATCH_ORDER) {
    const count = (state.batches && state.batches[k]) || 0;
    const bound = state.batchBounds && state.batchBounds[k];
    if (Number.isFinite(bound) && count >= bound) {
      return { kind: 'batch-full', detail: { class: k } };
    }
  }
  // 7. the band-indexed floor (§9): N merged atoms OR M events since the last fired gate. The band is
  //    the cone's complexity band; fall back to a defined default band (the first cadence key) only
  //    when state.band is absent. A band with no cadence entry cannot trip the floor.
  const band = state.band !== undefined
    ? state.band
    : Object.keys((policy && policy.cadence) || {})[0];
  const cad = policy && policy.cadence ? policy.cadence[band] : undefined;
  if (cad && (state.mergedSinceGate >= cad.n || state.eventsSinceGate >= cad.m)) {
    return { kind: 'heartbeat' };
  }
  // 8. nothing tripped — the in-band, non-firing sentinel (the loop keeps going).
  return { kind: 'none' };
}

// ── ready/pack appended by T02b (do not edit above this line) ──
```

### Step 2: Run the locked test to verify it passes

Run: `node test/frontier-gate.test.mjs`

Expected: `frontier-gate: all <N> checks pass. ✓`, zero `FAIL` lines.

### Step 3: Confirm zero regression to the existing suite

Run the whole suite (this repo ships Git-for-Windows' `bash.exe`):

```bash
for t in test/*.test.mjs; do node "$t"; done
```

No `FAIL` line anywhere. `lib/frontier.mjs` is a brand-new file that nothing else imports yet, so this
is a sanity pass — but Part 7 edits live-engine files later, so establish the green-after-every-task
habit now.

### Step 4: Commit

```bash
git add lib/frontier.mjs
git commit -m "feat(frontier): the pure loop calculus — GATE_RESULT + total gateDue (green, P7)" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

## Acceptance Criteria
- [ ] `node test/frontier-gate.test.mjs` passes with zero failures
- [ ] `lib/frontier.mjs` ends with the exact `// ── ready/pack appended by T02b (do not edit above
      this line) ──` marker line
- [ ] The file header states: pure, node-builtins-only, cites DESIGN-3.0 §6/§9, names the two
      later-section sibling imports (footprintsDisjoint, the ceremony predicates), and notes the
      workflow inlines mirrors because the substrate forbids `import`
- [ ] The T01 section has **no import line** (it needs none); no `fs`/`Date`/`Math.random`
- [ ] `gateDue` never returns `'budget-exhausted'` and never `{ kind: null }` (returns `'none'`)
- [ ] The whole existing suite still passes; no file outside Scope was modified
