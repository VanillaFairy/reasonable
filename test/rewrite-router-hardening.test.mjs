// test/rewrite-router-hardening.test.mjs — audit follow-up hardening for lib/rewrite.mjs's T01
// section (DESIGN-3.0 §7, reasonable 3.0 Part 5). T01c's adversarial audit (confirmed by mutation
// testing) found two real coverage gaps where the underlying implementation was already correct but
// no test would catch a regression: (1) R1's `priorVerdicts` filter is scoped by BOTH `atomId` and
// `kind` — deleting the `atomId` half left all prior checks green; (2) R4/R9 both guard against an
// unknown atomId, but only R1 had a "HALTs on an unknown atom" test — deleting either guard left all
// prior checks green. This file backfills exactly those three gaps. Pure, zero-I/O; does not modify
// lib/rewrite.mjs or either locked T01a test file (test/rewrite-router.test.mjs,
// test/rewrite-simple-verdicts.test.mjs).

import assert from 'node:assert';
import { computeVerdictEffects } from '../lib/rewrite.mjs';
import { validateEffects } from '../lib/effects.mjs';

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.stack || e.message}`); process.exitCode = 1; }
}
function valid(r) { return validateEffects([...r.provisional, ...r.permanent]).ok; }

// ── R1 cross-atom isolation ──────────────────────────────────────────────────
// ruleCheckpoint's second-exhaustion promotion must be scoped to the SAME atom AND the SAME kind.
// A prior checkpoint verdict for a *different* atom, and a prior verdict for the *same* atom but a
// *different* kind, must both be ignored — the atom under judgment's own first checkpoint still
// returns the plain ready+reprice shape, never the retired-pending promotion.

check('R1: a different atom\'s prior checkpoint does not spuriously promote this atom', () => {
  const state = {
    atoms: [{ id: 'a-1', component: 'lexer', state: 'packed', deltaClauses: [] }],
    priorVerdicts: [
      { atomId: 'a-2', kind: 'checkpoint' }, // different atom — must not count toward a-1's tally
    ],
  };
  const r = computeVerdictEffects({ kind: 'checkpoint', atomId: 'a-1', evidence: 'first for a-1' }, state);
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.provisional, [
    { nodeId: 'a-1', change: { state: 'ready', reprice: { factor: 'α' }, evidence: 'first for a-1' } },
  ]);
  assert.deepStrictEqual(r.permanent, []);
  assert.ok(valid(r));
});

check('R1: a prior verdict for the same atom but a different kind does not spuriously promote it', () => {
  const state = {
    atoms: [{ id: 'a-1', component: 'lexer', state: 'packed', deltaClauses: [] }],
    priorVerdicts: [
      { atomId: 'a-1', kind: 'dead-end' }, // same atom, different kind — must not count as a checkpoint
    ],
  };
  const r = computeVerdictEffects({ kind: 'checkpoint', atomId: 'a-1', evidence: 'first for a-1' }, state);
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.provisional, [
    { nodeId: 'a-1', change: { state: 'ready', reprice: { factor: 'α' }, evidence: 'first for a-1' } },
  ]);
  assert.deepStrictEqual(r.permanent, []);
  assert.ok(valid(r));
});

check('R1: combining a foreign atomId AND a foreign kind in priorVerdicts still does not promote', () => {
  const state = {
    atoms: [{ id: 'a-1', component: 'lexer', state: 'packed', deltaClauses: [] }],
    priorVerdicts: [
      { atomId: 'a-2', kind: 'checkpoint' },
      { atomId: 'a-1', kind: 'dead-end' },
    ],
  };
  const r = computeVerdictEffects({ kind: 'checkpoint', atomId: 'a-1', evidence: 'first for a-1' }, state);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.provisional[0].change.state, 'ready');
  assert.ok(valid(r));
});

// ── R4 oversized: unknown atomId HALTs ───────────────────────────────────────

check('R4 (oversized) HALTs on an unknown atomId', () => {
  const state = { atoms: [] };
  const partition = [['lexer#c1'], ['lexer#c2']];
  const r = computeVerdictEffects({ kind: 'oversized', atomId: 'a-99', partition, componentRoot: '' }, state);
  assert.strictEqual(r.ok, false);
  assert.ok(/unknown atomId/i.test(r.error));
});

// ── R9 stale-spec: unknown atomId HALTs ──────────────────────────────────────

check('R9 (stale-spec) HALTs on an unknown atomId', () => {
  const state = { atoms: [] };
  const r = computeVerdictEffects({ kind: 'stale-spec', atomId: 'a-99', collidesWith: 'a-5' }, state);
  assert.strictEqual(r.ok, false);
  assert.ok(/unknown atomId/i.test(r.error));
});

if (process.exitCode) console.error(`\nrewrite-router-hardening: FAILURES above (${passed} passed).`);
else console.log(`\nrewrite-router-hardening: all ${passed} checks pass. ✓`);
