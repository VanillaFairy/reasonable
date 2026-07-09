# Task T01a: Router + ladder + simple-verdict tests (red)

**Role:** `red` — you write ONLY the two failing test files below. Do NOT implement
`lib/rewrite.mjs`.

## References
- Read: `../shared/architecture.md`
- Read: `../shared/interfaces.md` in full (the exact public surface you're testing)
- Read: `../shared/conventions.md` (the harness pattern; the `undefined`-property gotcha)
- Read: `../knowledge/running-tests.md`
- Read: `docs/superpowers/specs/2026-07-09-reasonable-3.0-p5-rewrite-design.md` Decisions 2, 4, 5
  (R1/R4/R9), and 6 (the ladder)
- Read: `lib/atom.mjs` (`LIFECYCLE_TRANSITIONS`, `isValidTransition`, `cohesionComponents`) and
  `lib/effects.mjs` (`validateEffects`) — you import `validateEffects` into the tests
- Read: `test/atom-cohesion.test.mjs` (the by-hand fixture style — no filesystem)

## Dependencies
- Depends on: — (none)
- Depended on by: T01b (implements against these locked tests), T01c (audits them)

## Scope
**Files:**
- Create: `test/rewrite-router.test.mjs`
- Create: `test/rewrite-simple-verdicts.test.mjs`

**BOUNDARY — you MUST NOT modify any files outside this list. In particular, do NOT create
`lib/rewrite.mjs` — that is T01b's job.**

## Positive Constraints (DO)
- Both files import from `../lib/rewrite.mjs` (which does not exist yet — RED is a "Cannot find
  module" load error, NOT an assertion failure).
- Cover the router: `VERDICT_KINDS` (9 frozen kinds), `RCODE_TO_KIND` (R1–R9), an unknown kind and a
  missing kind both HALT (`{ok:false}`), a registered kind returns `{ok:true, provisional, permanent}`,
  and a rule-level HALT (illegal transition) propagates as `{ok:false}`.
- Cover `routeRefutedPremise` for all five routes.
- Cover R1/R4/R9 through `computeVerdictEffects`, asserting the exact effects AND
  `validateEffects(...).ok === true` for each.

## Negative Constraints (DO NOT)
- Do NOT implement `lib/rewrite.mjs`.
- Do NOT test R2/R3/R5/R6/R7 (T02a), ceremony, unwind, or R8 (T03a).
- Do NOT touch the filesystem — every fixture is a hand-built object literal.
- Do NOT modify any file outside Scope.

## Implementation Steps

### Step 1: Write `test/rewrite-router.test.mjs`

```js
// test/rewrite-router.test.mjs — the vocabulary, the total router (HALT on unknown), and the §7.1
// routing ladder (DESIGN-3.0 §7, §7.1, §7.2, reasonable 3.0 Part 5). Pure, zero-I/O.

import assert from 'node:assert';
import {
  VERDICT_KINDS, RCODE_TO_KIND, computeVerdictEffects, routeRefutedPremise,
} from '../lib/rewrite.mjs';

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.stack || e.message}`); process.exitCode = 1; }
}

// ── vocabulary ────────────────────────────────────────────────────────────────

check('VERDICT_KINDS is the nine kinds, frozen', () => {
  assert.deepStrictEqual([...VERDICT_KINDS], [
    'checkpoint', 'dead-end', 'ripple', 'oversized', 'unknown-blocking',
    'cycle-detected', 'parity-breach', 'illegible', 'stale-spec',
  ]);
  assert.ok(Object.isFrozen(VERDICT_KINDS));
});

check('RCODE_TO_KIND maps every R-code to its kind', () => {
  assert.strictEqual(RCODE_TO_KIND.R1, 'checkpoint');
  assert.strictEqual(RCODE_TO_KIND.R6, 'cycle-detected');
  assert.strictEqual(RCODE_TO_KIND.R9, 'stale-spec');
  assert.strictEqual(Object.keys(RCODE_TO_KIND).length, 9);
});

// ── the router: totality (§7.2) ────────────────────────────────────────────────

check('an unknown verdict kind HALTs (ok:false) — never a silent empty effect set', () => {
  const r = computeVerdictEffects({ kind: 'bogus' }, {});
  assert.strictEqual(r.ok, false);
  assert.ok(/unknown/i.test(r.error));
});

check('a missing verdict.kind HALTs', () => {
  assert.strictEqual(computeVerdictEffects({}, {}).ok, false);
  assert.strictEqual(computeVerdictEffects(null, {}).ok, false);
});

check('a registered kind returns {ok:true, provisional, permanent}', () => {
  const state = { atoms: [{ id: 'a-1', component: 'lexer', state: 'packed', deltaClauses: [] }] };
  const r = computeVerdictEffects({ kind: 'checkpoint', atomId: 'a-1', evidence: 'budget' }, state);
  assert.strictEqual(r.ok, true);
  assert.ok(Array.isArray(r.provisional));
  assert.ok(Array.isArray(r.permanent));
});

check('a rule-level HALT (illegal transition) propagates as ok:false', () => {
  const state = { atoms: [{ id: 'a-1', component: 'lexer', state: 'merged', deltaClauses: [] }] };
  const r = computeVerdictEffects({ kind: 'checkpoint', atomId: 'a-1', evidence: 'budget' }, state);
  assert.strictEqual(r.ok, false);
  assert.ok(/merged/.test(r.error));
});

// ── the §7.1 routing ladder ─────────────────────────────────────────────────

check('a goal-layer premise routes to goal-respec', () => {
  assert.strictEqual(routeRefutedPremise({ layer: 'goal', component: 'g', clause: 'g#c1' }, {}), 'goal-respec');
});

check('an intention-layer premise routes to the always-human intent-fork', () => {
  assert.strictEqual(routeRefutedPremise({ layer: 'intention', component: 'i', clause: 'i#c1' }, {}), 'intent-fork');
});

check("a delta-layer premise (the atom's own mis-spec) routes to re-charter", () => {
  assert.strictEqual(routeRefutedPremise({ layer: 'delta', component: 'lexer', clause: 'lexer#c1' }, {}), 're-charter');
});

check('a single-component contract premise routes to amendment', () => {
  const state = { citationGraph: { x: ['y'], y: [] } };
  assert.strictEqual(routeRefutedPremise({ layer: 'contract', component: 'x', clause: 'x#c1' }, state), 'amendment');
});

check('a contract premise whose closure spans ≥2 foreign components routes to a topologist re-cut', () => {
  const state = { citationGraph: { x: ['y', 'z'], y: [], z: [] } };
  assert.strictEqual(routeRefutedPremise({ layer: 'contract', component: 'x', clause: 'x#c1' }, state), 'topologist-recut');
});

if (process.exitCode) console.error(`\nrewrite-router: FAILURES above (${passed} passed).`);
else console.log(`\nrewrite-router: all ${passed} checks pass. ✓`);
```

### Step 2: Write `test/rewrite-simple-verdicts.test.mjs`

```js
// test/rewrite-simple-verdicts.test.mjs — the three pure state-transition verdicts R1 (checkpoint),
// R4 (oversized), R9 (stale-spec) (DESIGN-3.0 §7, reasonable 3.0 Part 5). Pure, zero-I/O.

import assert from 'node:assert';
import { computeVerdictEffects } from '../lib/rewrite.mjs';
import { validateEffects } from '../lib/effects.mjs';

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.stack || e.message}`); process.exitCode = 1; }
}
function valid(r) { return validateEffects([...r.provisional, ...r.permanent]).ok; }

// ── R1 checkpoint ──────────────────────────────────────────────────────────────

check('R1 first exhaustion re-enters the atom to ready with an α reprice annotation', () => {
  const state = { atoms: [{ id: 'a-1', component: 'lexer', state: 'packed', deltaClauses: [] }] };
  const r = computeVerdictEffects({ kind: 'checkpoint', atomId: 'a-1', evidence: 'budget exhausted' }, state);
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.provisional, [
    { nodeId: 'a-1', change: { state: 'ready', reprice: { factor: 'α' }, evidence: 'budget exhausted' } },
  ]);
  assert.deepStrictEqual(r.permanent, []);
  assert.ok(valid(r));
});

check('R1 SECOND independent exhaustion auto-promotes toward R2 (atom → retired-pending)', () => {
  const state = {
    atoms: [{ id: 'a-1', component: 'lexer', state: 'packed', deltaClauses: [] }],
    priorVerdicts: [{ atomId: 'a-1', kind: 'checkpoint' }],
  };
  const r = computeVerdictEffects({ kind: 'checkpoint', atomId: 'a-1', evidence: 'again' }, state);
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.provisional, [
    { nodeId: 'a-1', change: { state: 'retired-pending', promotedFrom: 'checkpoint', evidence: 'again' } },
  ]);
  assert.ok(valid(r));
});

check('R1 on an unknown atom HALTs', () => {
  const r = computeVerdictEffects({ kind: 'checkpoint', atomId: 'a-99', evidence: 'x' }, { atoms: [] });
  assert.strictEqual(r.ok, false);
});

// ── R4 oversized ─────────────────────────────────────────────────────────────

function clause(clauseId, { citations = [], demandedBy = null, locus = [] } = {}) {
  return { clauseId, citations, demandedBy, locus };
}

check('R4 replaces the atom with sub-atoms when the partition respects §4.3 cohesion', () => {
  const deltaClauses = [
    clause('lexer#c1', { citations: [{ component: 'x', clause: 'x#c1' }] }),
    clause('lexer#c2', { citations: [{ component: 'x', clause: 'x#c1' }] }), // shares provider → coheres with c1
    clause('lexer#c3', { demandedBy: 'goal:g3' }),                            // isolated
  ];
  const state = { atoms: [{ id: 'a-1', component: 'lexer', state: "spec'd", deltaClauses }] };
  const partition = [['lexer#c1', 'lexer#c2'], ['lexer#c3']]; // does NOT split the {c1,c2} cohesion group
  const r = computeVerdictEffects({ kind: 'oversized', atomId: 'a-1', partition, componentRoot: '' }, state);
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.provisional, [
    { nodeId: 'a-1', change: { state: 'retired-pending', supersededBy: 'partition' } },
    { nodeId: 'a-1/sub-0', change: { charter: { clauses: ['lexer#c1', 'lexer#c2'] }, lineage: 'a-1', dispatchFree: true } },
    { nodeId: 'a-1/sub-1', change: { charter: { clauses: ['lexer#c3'] }, lineage: 'a-1', dispatchFree: true } },
  ]);
  assert.deepStrictEqual(r.permanent, []);
  assert.ok(valid(r));
});

check('R4 HALTs when the proposed partition splits a §4.3 cohesion component', () => {
  const deltaClauses = [
    clause('lexer#c1', { citations: [{ component: 'x', clause: 'x#c1' }] }),
    clause('lexer#c2', { citations: [{ component: 'x', clause: 'x#c1' }] }), // coheres with c1
    clause('lexer#c3', { demandedBy: 'goal:g3' }),
  ];
  const state = { atoms: [{ id: 'a-1', component: 'lexer', state: "spec'd", deltaClauses }] };
  const partition = [['lexer#c1', 'lexer#c3'], ['lexer#c2']]; // SPLITS {c1,c2}
  const r = computeVerdictEffects({ kind: 'oversized', atomId: 'a-1', partition, componentRoot: '' }, state);
  assert.strictEqual(r.ok, false);
  assert.ok(/cohesion/i.test(r.error));
});

check('R4 HALTs on a degenerate (<2 group) partition', () => {
  const state = { atoms: [{ id: 'a-1', component: 'lexer', state: "spec'd", deltaClauses: [clause('lexer#c1')] }] };
  const r = computeVerdictEffects({ kind: 'oversized', atomId: 'a-1', partition: [['lexer#c1']], componentRoot: '' }, state);
  assert.strictEqual(r.ok, false);
});

// ── R9 stale-spec ─────────────────────────────────────────────────────────────

check('R9 sends the spec-d atom back to ready with a stale delta and serializes the colliding pair', () => {
  const state = { atoms: [{ id: 'a-2', component: 'lexer', state: "spec'd", deltaClauses: [] }] };
  const r = computeVerdictEffects({ kind: 'stale-spec', atomId: 'a-2', collidesWith: 'a-5' }, state);
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.provisional, [
    { nodeId: 'a-2', change: { state: 'ready', staleDelta: true } },
    { from: 'a-2', to: 'a-5', edge: 'excludes', op: 'add' },
  ]);
  assert.deepStrictEqual(r.permanent, []);
  assert.ok(valid(r));
});

check('R9 orders the excludes edge by atom id regardless of which side collided', () => {
  const state = { atoms: [{ id: 'a-7', component: 'lexer', state: "spec'd", deltaClauses: [] }] };
  const r = computeVerdictEffects({ kind: 'stale-spec', atomId: 'a-7', collidesWith: 'a-3' }, state);
  assert.deepStrictEqual(r.provisional[1], { from: 'a-3', to: 'a-7', edge: 'excludes', op: 'add' });
});

if (process.exitCode) console.error(`\nrewrite-simple-verdicts: FAILURES above (${passed} passed).`);
else console.log(`\nrewrite-simple-verdicts: all ${passed} checks pass. ✓`);
```

### Step 3: Run both to verify they fail for the right reason

Run: `node test/rewrite-router.test.mjs` and `node test/rewrite-simple-verdicts.test.mjs`

Expected: a module-load error (`Cannot find module '.../lib/rewrite.mjs'`), **not** an assertion
failure inside a `check()`. If you see `FAIL` lines instead, `lib/rewrite.mjs` already exists — stop
and investigate (this task is running out of order).

### Step 4: Commit

```bash
git add test/rewrite-router.test.mjs test/rewrite-simple-verdicts.test.mjs
git commit -m "test(rewrite): lock the router, routing ladder, and R1/R4/R9 contract (red)"
```

## Acceptance Criteria
- [ ] Both files exist and match the harness convention exactly
- [ ] Running either fails with a module-not-found error (RED for the right reason)
- [ ] `VERDICT_KINDS`, `RCODE_TO_KIND`, router totality (unknown + missing kind + rule HALT), all
      five ladder routes, and R1/R4/R9 (happy path + each HALT) are covered
- [ ] Every rule's output is asserted valid with `validateEffects`
- [ ] No filesystem is touched; no file outside Scope was modified; `lib/rewrite.mjs` was NOT created
