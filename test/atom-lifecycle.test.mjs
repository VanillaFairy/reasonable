// test/atom-lifecycle.test.mjs — the atom's lifecycle state machine (DESIGN-3.0 §4.1, reasonable
// 3.0 Part 3): the pinned state list, the three orthogonal flags, and the adjacency table
// isValidTransition checks moves against. Pure, zero-I/O — no filesystem fixtures needed.

import assert from 'node:assert';
import {
  LIFECYCLE_STATES, TERMINAL_STATES, FLAG_NAMES, LIFECYCLE_TRANSITIONS,
  isValidTransition, isValidFlag,
} from '../lib/atom.mjs';

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.stack || e.message}`); process.exitCode = 1; }
}

// ── vocabulary ──────────────────────────────────────────────────────────────

check('LIFECYCLE_STATES has exactly the ten pinned states, in DESIGN-3.0 §4.1 order', () => {
  assert.deepStrictEqual(LIFECYCLE_STATES, [
    'chartered', 'ready', "spec'd", 'packed', 'tests-red', 'green', 'audited',
    'merged', 'retired-pending', 'retired',
  ]);
});

check('LIFECYCLE_STATES is frozen', () => {
  assert.throws(() => { LIFECYCLE_STATES.push('bogus'); });
});

check('TERMINAL_STATES is exactly {merged, retired}', () => {
  assert.deepStrictEqual([...TERMINAL_STATES].sort(), ['merged', 'retired']);
});

check('FLAG_NAMES is exactly the three orthogonal flags', () => {
  assert.deepStrictEqual([...FLAG_NAMES].sort(), ['dispatch-barred', 'frozen', 'guard-halted']);
});

check('FLAG_NAMES is frozen', () => {
  assert.throws(() => { FLAG_NAMES.push('bogus'); });
});

// ── isValidTransition: the forward chain ───────────────────────────────────

check('the full forward chain is valid, one hop at a time', () => {
  const chain = ['chartered', 'ready', "spec'd", 'packed', 'tests-red', 'green', 'audited', 'merged'];
  for (let i = 0; i < chain.length - 1; i += 1) {
    assert.strictEqual(isValidTransition(chain[i], chain[i + 1]), true, `${chain[i]} -> ${chain[i + 1]}`);
  }
});

check('the forward chain cannot skip a hop', () => {
  assert.strictEqual(isValidTransition('chartered', "spec'd"), false);
  assert.strictEqual(isValidTransition('ready', 'packed'), false);
  assert.strictEqual(isValidTransition("spec'd", 'tests-red'), false);
  assert.strictEqual(isValidTransition('packed', 'green'), false);
  assert.strictEqual(isValidTransition('tests-red', 'audited'), false);
  assert.strictEqual(isValidTransition('green', 'merged'), false);
});

check('the forward chain cannot run backward (other than the pinned retry edges below)', () => {
  assert.strictEqual(isValidTransition('merged', 'audited'), false);
  assert.strictEqual(isValidTransition('audited', 'green'), false);
  assert.strictEqual(isValidTransition("spec'd", 'chartered'), false);
});

// ── isValidTransition: the retry-to-ready edges ────────────────────────────

check("spec'd, packed, tests-red, green, and audited can all retry back to ready", () => {
  for (const from of ["spec'd", 'packed', 'tests-red', 'green', 'audited']) {
    assert.strictEqual(isValidTransition(from, 'ready'), true, `${from} -> ready`);
  }
});

check('chartered and ready themselves have no retry-to-ready edge (nothing to retry yet)', () => {
  assert.strictEqual(isValidTransition('chartered', 'ready'), true, 'this IS the forward edge, not a retry — sanity check');
  assert.strictEqual(isValidTransition('ready', 'ready'), false, 'no self-loop');
});

// ── isValidTransition: the retirement edges ────────────────────────────────

check("spec'd, packed, tests-red, green, and audited can all retire to retired-pending", () => {
  for (const from of ["spec'd", 'packed', 'tests-red', 'green', 'audited']) {
    assert.strictEqual(isValidTransition(from, 'retired-pending'), true, `${from} -> retired-pending`);
  }
});

check('chartered -> retired-pending is deliberately NOT a valid edge (design doc Decision 5)', () => {
  assert.strictEqual(isValidTransition('chartered', 'retired-pending'), false);
});

check('ready -> retired-pending is deliberately NOT a valid edge (only in-flight-or-later states retire directly)', () => {
  assert.strictEqual(isValidTransition('ready', 'retired-pending'), false);
});

check('retired-pending -> retired is the only edge out of retired-pending', () => {
  assert.strictEqual(isValidTransition('retired-pending', 'retired'), true);
  assert.strictEqual(isValidTransition('retired-pending', 'ready'), false);
});

// ── isValidTransition: terminals have no outgoing edges ────────────────────

check('merged and retired have zero outgoing edges to any other state', () => {
  for (const term of TERMINAL_STATES) {
    for (const other of LIFECYCLE_STATES) {
      if (other === term) continue;
      assert.strictEqual(isValidTransition(term, other), false, `${term} -> ${other} must be false`);
    }
  }
});

// ── isValidTransition: malformed input never throws ────────────────────────

check('isValidTransition returns false (never throws) for unknown or non-string states', () => {
  assert.strictEqual(isValidTransition('bogus', 'ready'), false);
  assert.strictEqual(isValidTransition('chartered', 'bogus'), false);
  assert.strictEqual(isValidTransition(null, 'ready'), false);
  assert.strictEqual(isValidTransition('chartered', undefined), false);
  assert.strictEqual(isValidTransition(42, {}), false);
});

// ── LIFECYCLE_TRANSITIONS: the raw table matches isValidTransition exactly ─

check('LIFECYCLE_TRANSITIONS and isValidTransition agree on every (from, to) pair over LIFECYCLE_STATES', () => {
  for (const from of LIFECYCLE_STATES) {
    for (const to of LIFECYCLE_STATES) {
      const inTable = (LIFECYCLE_TRANSITIONS[from] || []).includes(to);
      assert.strictEqual(isValidTransition(from, to), inTable, `${from} -> ${to}`);
    }
  }
});

// ── isValidFlag ──────────────────────────────────────────────────────────────

check('isValidFlag accepts every FLAG_NAMES member', () => {
  for (const f of FLAG_NAMES) assert.strictEqual(isValidFlag(f), true, f);
});

check('isValidFlag rejects an unknown flag name, never throws', () => {
  assert.strictEqual(isValidFlag('bogus'), false);
  assert.strictEqual(isValidFlag(null), false);
  assert.strictEqual(isValidFlag(undefined), false);
});

if (process.exitCode) console.error(`\natom-lifecycle: FAILURES above (${passed} passed).`);
else console.log(`\natom-lifecycle: all ${passed} checks pass. ✓`);
