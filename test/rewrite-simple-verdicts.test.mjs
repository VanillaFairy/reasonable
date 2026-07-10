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
