// test/effects.test.mjs — pure, zero-I/O shape validation for ledger event "effects" entries
// (DESIGN-3.0 §8; shared/interfaces.md for this task). lib/effects.mjs does not exist yet — this
// is Wave 1 of the plan, RED by construction: every check below must fail with a top-level
// "Cannot find module" error on import, not an individual assertion failure.
//
// Scope reminder (see shared/architecture.md): this module validates SHAPE only — a node effect
// is {nodeId: string, change: any}, an edge effect is {from, to: string, edge: one of the four
// fixed names, op: 'add'|'remove'}. It does not interpret effects, does not constrain `change`'s
// internal shape beyond "present", and does not check that a referenced nodeId/edge endpoint
// exists anywhere.

import assert from 'node:assert';
import { EDGE_NAMES, EDGE_OPS, isNodeEffect, isEdgeEffect, validateEffects } from '../lib/effects.mjs';

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.stack || e.message}`); process.exitCode = 1; }
}

// ── exports: EDGE_NAMES / EDGE_OPS ──────────────────────────────────────────────────────

check('EDGE_NAMES is exactly the four DESIGN-3.0 §2.2 edge names, in order', () => {
  assert.deepStrictEqual(EDGE_NAMES, ['needs', 'excludes', 'serves', 'informs']);
});

check('EDGE_OPS is exactly the two edge ops, in order', () => {
  assert.deepStrictEqual(EDGE_OPS, ['add', 'remove']);
});

check('EDGE_NAMES and EDGE_OPS are frozen (documented as "frozen array")', () => {
  assert.strictEqual(Object.isFrozen(EDGE_NAMES), true, 'EDGE_NAMES must be frozen');
  assert.strictEqual(Object.isFrozen(EDGE_OPS), true, 'EDGE_OPS must be frozen');
});

// ── isNodeEffect ─────────────────────────────────────────────────────────────────────────

check('isNodeEffect: accepts a well-formed {nodeId, change} with an object change payload', () => {
  assert.strictEqual(isNodeEffect({ nodeId: 'atom-1', change: { kind: 'created' } }), true);
});

check('isNodeEffect: change may be ANY JSON value — string, number, boolean, null all pass', () => {
  assert.strictEqual(isNodeEffect({ nodeId: 'atom-1', change: 'retired' }), true, 'string change');
  assert.strictEqual(isNodeEffect({ nodeId: 'atom-1', change: 0 }), true, 'falsy-but-present number change');
  assert.strictEqual(isNodeEffect({ nodeId: 'atom-1', change: false }), true, 'falsy-but-present boolean change');
  assert.strictEqual(isNodeEffect({ nodeId: 'atom-1', change: null }), true, 'null is a valid JSON value');
});

check('isNodeEffect: rejects a missing nodeId', () => {
  assert.strictEqual(isNodeEffect({ change: 'x' }), false);
});

check('isNodeEffect: rejects an empty-string nodeId', () => {
  assert.strictEqual(isNodeEffect({ nodeId: '', change: 'x' }), false);
});

check('isNodeEffect: rejects a non-string nodeId', () => {
  for (const bad of [42, true, null, ['a'], { a: 1 }]) {
    assert.strictEqual(isNodeEffect({ nodeId: bad, change: 'x' }), false, `nodeId ${JSON.stringify(bad)} must be rejected`);
  }
});

check('isNodeEffect: rejects an entry with no change key at all', () => {
  assert.strictEqual(isNodeEffect({ nodeId: 'atom-1' }), false);
});

// `undefined` is not a JSON value (DESIGN-3.0's pinned shape requires `change` to be "any JSON
// value"), and after a real JSON.stringify/parse round-trip through the ledger, a `change:
// undefined` key is dropped entirely — indistinguishable from an absent key. An explicit
// `change: undefined` must therefore be rejected exactly like a missing `change` key, or an
// entry could pass validation and then silently fail to round-trip through the ledger's own
// persistence path.
check('isNodeEffect: rejects an explicit change: undefined (not a JSON value, indistinguishable from absent after persistence)', () => {
  assert.strictEqual(isNodeEffect({ nodeId: 'a-1', change: undefined }), false);
});

check('isNodeEffect: rejects non-object entries (null, undefined, primitives, arrays)', () => {
  for (const bad of [null, undefined, 'x', 42, true, [], ['a', 'b']]) {
    assert.strictEqual(isNodeEffect(bad), false, `${JSON.stringify(bad)} must be rejected`);
  }
});

// ── isEdgeEffect ─────────────────────────────────────────────────────────────────────────

check('isEdgeEffect: accepts a well-formed entry for every fixed edge name and both ops', () => {
  for (const edge of EDGE_NAMES) {
    for (const op of EDGE_OPS) {
      assert.strictEqual(isEdgeEffect({ from: 'a', to: 'b', edge, op }), true, `edge=${edge} op=${op} must be accepted`);
    }
  }
});

check('isEdgeEffect: rejects an edge name outside the fixed vocabulary', () => {
  assert.strictEqual(isEdgeEffect({ from: 'a', to: 'b', edge: 'blocks', op: 'add' }), false);
});

check('isEdgeEffect: rejects an op that is not add/remove', () => {
  assert.strictEqual(isEdgeEffect({ from: 'a', to: 'b', edge: 'needs', op: 'update' }), false);
});

check('isEdgeEffect: rejects an empty-string from or to', () => {
  assert.strictEqual(isEdgeEffect({ from: '', to: 'b', edge: 'needs', op: 'add' }), false, 'empty from');
  assert.strictEqual(isEdgeEffect({ from: 'a', to: '', edge: 'needs', op: 'add' }), false, 'empty to');
});

check('isEdgeEffect: rejects a non-string from or to', () => {
  assert.strictEqual(isEdgeEffect({ from: 1, to: 'b', edge: 'needs', op: 'add' }), false, 'numeric from');
  assert.strictEqual(isEdgeEffect({ from: 'a', to: null, edge: 'needs', op: 'add' }), false, 'null to');
});

check('isEdgeEffect: rejects an entry missing any one of from/to/edge/op', () => {
  const base = { from: 'a', to: 'b', edge: 'needs', op: 'add' };
  for (const drop of ['from', 'to', 'edge', 'op']) {
    const entry = { ...base };
    delete entry[drop];
    assert.strictEqual(isEdgeEffect(entry), false, `missing ${drop} must be rejected`);
  }
});

check('isEdgeEffect: rejects non-object entries (null, undefined, primitives, arrays)', () => {
  for (const bad of [null, undefined, 'x', 42, true, [], ['a', 'b']]) {
    assert.strictEqual(isEdgeEffect(bad), false, `${JSON.stringify(bad)} must be rejected`);
  }
});

// ── isNodeEffect / isEdgeEffect together: the "both shapes" overlap case ──────────────────
// validateEffects' contract explicitly allows an entry to satisfy BOTH checks at once (that's
// what makes the "ambiguous" rejection possible below) — so isNodeEffect must not be disqualified
// merely because from/to/edge/op are ALSO present, and vice versa.

check('an entry carrying every field from both shapes satisfies isNodeEffect AND isEdgeEffect independently', () => {
  const both = { nodeId: 'atom-1', change: 'x', from: 'a', to: 'b', edge: 'needs', op: 'add' };
  assert.strictEqual(isNodeEffect(both), true, 'isNodeEffect only checks nodeId/change');
  assert.strictEqual(isEdgeEffect(both), true, 'isEdgeEffect only checks from/to/edge/op');
});

// ── validateEffects ──────────────────────────────────────────────────────────────────────

check('validateEffects: undefined is always valid (the field is optional)', () => {
  assert.deepStrictEqual(validateEffects(undefined), { ok: true });
});

check('validateEffects: an empty array is valid', () => {
  assert.deepStrictEqual(validateEffects([]), { ok: true });
});

check('validateEffects: a non-array value (present but wrong type) is rejected', () => {
  for (const bad of [{}, 'x', 42, true, null]) {
    const r = validateEffects(bad);
    assert.strictEqual(r.ok, false, `${JSON.stringify(bad)} must be rejected`);
    assert.match(r.error, /array/i, 'the error should say the field must be an array');
  }
});

check('validateEffects: a single well-formed node effect passes', () => {
  const r = validateEffects([{ nodeId: 'atom-1', change: { kind: 'created' } }]);
  assert.deepStrictEqual(r, { ok: true });
});

check('validateEffects: a single well-formed edge effect passes', () => {
  const r = validateEffects([{ from: 'a', to: 'b', edge: 'needs', op: 'add' }]);
  assert.deepStrictEqual(r, { ok: true });
});

check('validateEffects: a mixed array of node and edge effects passes', () => {
  const r = validateEffects([
    { nodeId: 'atom-1', change: 'created' },
    { from: 'a', to: 'b', edge: 'serves', op: 'add' },
    { nodeId: 'atom-2', change: 'retired' },
    { from: 'c', to: 'd', edge: 'informs', op: 'remove' },
  ]);
  assert.deepStrictEqual(r, { ok: true });
});

check('validateEffects: a malformed node effect (bad nodeId) is rejected with its index in the error', () => {
  const r = validateEffects([{ nodeId: '', change: 'x' }]);
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /effects\[0\]/);
});

check('validateEffects: a malformed edge effect (unknown edge name) is rejected with its index in the error', () => {
  const r = validateEffects([{ from: 'a', to: 'b', edge: 'blocks', op: 'add' }]);
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /effects\[0\]/);
});

check('validateEffects: an invalid op is rejected', () => {
  const r = validateEffects([{ from: 'a', to: 'b', edge: 'needs', op: 'delete' }]);
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /effects\[0\]/);
});

check('validateEffects: a node effect with change: undefined is rejected (not a JSON value; the ledger round-trip would silently drop it)', () => {
  const r = validateEffects([{ nodeId: 'a-1', change: undefined }]);
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /effects\[0\]/);
});

check('validateEffects: an entry satisfying NEITHER shape is rejected (missing/garbage fields)', () => {
  const r = validateEffects([{ foo: 'bar' }]);
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /effects\[0\]/);
});

check('validateEffects: an entry satisfying BOTH shapes (ambiguous) is rejected, not silently accepted as either', () => {
  const r = validateEffects([{ nodeId: 'atom-1', change: 'x', from: 'a', to: 'b', edge: 'needs', op: 'add' }]);
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /effects\[0\]/);
});

check('validateEffects: a non-object entry (string/number/null/array) inside the array is rejected', () => {
  for (const bad of ['x', 42, null, [], true]) {
    const r = validateEffects([bad]);
    assert.strictEqual(r.ok, false, `${JSON.stringify(bad)} as an entry must be rejected`);
    assert.match(r.error, /effects\[0\]/);
  }
});

check('validateEffects: the FIRST offending index is reported, not a later one', () => {
  const r = validateEffects([
    { nodeId: 'ok', change: 'x' },      // index 0: valid
    { nodeId: '' },                     // index 1: first bad one
    { from: 'a', to: 'b', edge: 'nope', op: 'add' }, // index 2: also bad
  ]);
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /effects\[1\]/, 'must point at the first failing entry, index 1');
});

check('validateEffects: an index beyond 0 is correctly reported for a later failure', () => {
  const r = validateEffects([
    { nodeId: 'ok-1', change: 'x' },
    { from: 'a', to: 'b', edge: 'needs', op: 'add' },
    { nodeId: 'bad', change: 'x', from: 'a', to: 'b', edge: 'needs', op: 'add' }, // ambiguous, index 2
  ]);
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /effects\[2\]/);
});

check('validateEffects: does not mutate its input array or entries (pure)', () => {
  const input = [
    { nodeId: 'atom-1', change: { kind: 'created' } },
    { from: 'a', to: 'b', edge: 'needs', op: 'add' },
  ];
  const before = JSON.stringify(input);
  validateEffects(input);
  assert.strictEqual(JSON.stringify(input), before, 'validateEffects must not mutate what it is given');
});

if (process.exitCode) console.error(`\neffects: FAILURES above (${passed} passed).`);
else console.log(`\neffects: all ${passed} checks pass. ✓`);
