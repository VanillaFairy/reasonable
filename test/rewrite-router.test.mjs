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
