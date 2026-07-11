// test/frontier-roles.test.mjs — lazy, role-minimal provisioning (DESIGN-3.0 §6 draft-five;
// reasonable 3.0 Part 7, interfaces.md §1.4). requiredRoles reuses lib/ceremony.mjs's
// phase-degeneration predicates applied to ROLE DISPATCH. Pure, zero-I/O.

import assert from 'node:assert';
import { requiredRoles } from '../lib/frontier.mjs';

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.stack || e.message}`); process.exitCode = 1; }
}

const wave = { atomIds: ['a-1'] };

// ── the always-present core ───────────────────────────────────────────────────

check('a single-atom greenfield wave with no amendments/brownfield/multi-cone needs only the core three roles', () => {
  const roles = requiredRoles(wave, {});
  assert.deepStrictEqual(roles, ['auditor', 'blind-test-writer', 'implementer']);
});

// ── brownfield (census/characterizer) — BOTH halves of the AND matter ────────

check('brownfield=true with a NON-EMPTY brownfieldInput adds census + characterizer', () => {
  const roles = requiredRoles(wave, { brownfield: true, brownfieldInput: ['legacy/foo.js'] });
  assert.deepStrictEqual(roles, [
    'auditor', 'blind-test-writer', 'census', 'characterizer', 'implementer',
  ]);
});

check('brownfield=true with an EMPTY brownfieldInput does NOT add census/characterizer (proven no-op)', () => {
  const roles = requiredRoles(wave, { brownfield: true, brownfieldInput: [] });
  assert.deepStrictEqual(roles, ['auditor', 'blind-test-writer', 'implementer']);
});

check('brownfield=false with a non-empty brownfieldInput does NOT add census/characterizer', () => {
  const roles = requiredRoles(wave, { brownfield: false, brownfieldInput: ['legacy/foo.js'] });
  assert.deepStrictEqual(roles, ['auditor', 'blind-test-writer', 'implementer']);
});

// ── topologist re-chartering ──────────────────────────────────────────────────

check('a non-empty amendmentBatch adds topologist (rechartingDegenerates materializes)', () => {
  const roles = requiredRoles(wave, { amendmentBatch: [{ component: 'lexer', clause: 'lexer#c1' }] });
  assert.deepStrictEqual(roles, ['auditor', 'blind-test-writer', 'implementer', 'topologist']);
});

check('an empty amendmentBatch does NOT add topologist', () => {
  const roles = requiredRoles(wave, { amendmentBatch: [] });
  assert.deepStrictEqual(roles, ['auditor', 'blind-test-writer', 'implementer']);
});

check('an absent amendmentBatch does NOT add topologist', () => {
  const roles = requiredRoles(wave, {});
  assert.ok(!roles.includes('topologist'));
});

// ── retro-synthesizer cross-cone classification ───────────────────────────────

check('landedConeCount >= 2 adds retro-synthesizer (retroClassificationDegenerates materializes)', () => {
  const roles = requiredRoles(wave, { landedConeCount: 2 });
  assert.deepStrictEqual(roles, ['auditor', 'blind-test-writer', 'implementer', 'retro-synthesizer']);
});

check('landedConeCount 0 or 1 does NOT add retro-synthesizer', () => {
  assert.deepStrictEqual(requiredRoles(wave, { landedConeCount: 0 }), ['auditor', 'blind-test-writer', 'implementer']);
  assert.deepStrictEqual(requiredRoles(wave, { landedConeCount: 1 }), ['auditor', 'blind-test-writer', 'implementer']);
});

// ── determinism + sortedness (assert against a LITERAL sorted array, never re-sort the output) ──

check('the returned array is always sorted, asserted against a literal', () => {
  const roles = requiredRoles(wave, { brownfield: true, brownfieldInput: ['x'] });
  assert.deepStrictEqual(roles, ['auditor', 'blind-test-writer', 'census', 'characterizer', 'implementer']);
});

// ── the maximal case: all four conditions true at once ────────────────────────

check('every conditional role fires together yields all seven roles, sorted', () => {
  const roles = requiredRoles(wave, {
    brownfield: true,
    brownfieldInput: ['legacy/foo.js'],
    amendmentBatch: [{ component: 'lexer', clause: 'lexer#c1' }],
    landedConeCount: 3,
  });
  assert.deepStrictEqual(roles, [
    'auditor', 'blind-test-writer', 'census', 'characterizer', 'implementer',
    'retro-synthesizer', 'topologist',
  ]);
});

if (process.exitCode) console.error(`\nfrontier-roles: FAILURES above (${passed} passed).`);
else console.log(`\nfrontier-roles: all ${passed} checks pass. ✓`);
