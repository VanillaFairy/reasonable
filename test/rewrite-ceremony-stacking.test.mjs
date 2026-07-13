// test/rewrite-ceremony-stacking.test.mjs — the ceremony-escalation unwind under STACKING (two
// escalations on one cone before either resolves), reasonable 3.0 Part 7, interfaces.md §0 correction
// 3. Closes a REAL, demonstrated defect recorded in docs/artifacts.md's P5 retrospective (mutation
// testing proved the unwind correct only for a single, isolated escalation per cone) — this is the
// fix the retrospective named as P7's own architecture call. Pure, zero-I/O.

import assert from 'node:assert';
import { ceremonyEscalation, unwindCeremonyEscalation } from '../lib/rewrite.mjs';
import { validateEffects } from '../lib/effects.mjs';

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.stack || e.message}`); process.exitCode = 1; }
}

// A 3-band scale + a cone bound of 1, so any dead-end whose blast radius is width-3 escalates.
function baseState() {
  return {
    atoms: [{ id: 'a-1', component: 'lexer', state: "spec'd", deltaClauses: [] }],
    citationGraph: { w: ['x', 'y'], x: [], y: [] }, // closure(w) = [w,x,y], width 3
    bandScale: ['micro', 'standard', 'full'],
    bandBounds: { lexer: 1 },
  };
}
const verdictA = { kind: 'dead-end', atomId: 'a-1', premise: { component: 'w', clause: 'w#c1', layer: 'contract' } };
const verdictB = { kind: 'dead-end', atomId: 'a-1', premise: { component: 'w', clause: 'w#c2', layer: 'contract' } };

// ── distinct escalation ids ────────────────────────────────────────────────────

check('two escalations on the same cone get DISTINCT escalationIds', () => {
  const stateA = { ...baseState(), bands: { lexer: 'micro' }, escalations: {} };
  const escA = ceremonyEscalation(verdictA, stateA);
  assert.strictEqual(escA.change.escalationId, 'lexer#esc0');

  // B fires AFTER A's provisional raise has folded (band now 'standard') and A's escalation has been
  // recorded in the cone's own escalation history.
  const stateB = { ...baseState(), bands: { lexer: 'standard' }, escalations: { lexer: [escA] } };
  const escB = ceremonyEscalation(verdictB, stateB);
  assert.strictEqual(escB.change.escalationId, 'lexer#esc1');
  assert.notStrictEqual(escA.change.escalationId, escB.change.escalationId);
});

// ── the core fix: rejecting the LATER escalation leaves the EARLIER one's markers intact ──────

check("rejecting the LATER escalation (B) leaves the EARLIER one's (A) three armed markers fully intact", () => {
  const stateA = { ...baseState(), bands: { lexer: 'micro' }, escalations: {} };
  const escA = ceremonyEscalation(verdictA, stateA);
  const stateB = { ...baseState(), bands: { lexer: 'standard' }, escalations: { lexer: [escA] } };
  const escB = ceremonyEscalation(verdictB, stateB);

  const armed = new Set();
  for (const e of [escA, escB]) for (const a of e.change.armed) armed.add(a);
  assert.strictEqual(armed.size, 6, 'six DISTINCT markers (3 each), no collision between A and B');

  const unwindB = unwindCeremonyEscalation(escB);
  assert.ok(validateEffects(unwindB).ok);
  for (const u of unwindB) for (const d of u.change.disarmed) armed.delete(d);

  for (const c of ['deep-audit', 'scaffold-recheck', 'tighter-cadence']) {
    assert.ok(armed.has(`${c}@${escA.change.escalationId}`), `A's ${c} marker must survive B's unwind`);
    assert.ok(!armed.has(`${c}@${escB.change.escalationId}`), `B's ${c} marker must be gone`);
  }
  assert.strictEqual(armed.size, 3, 'exactly A\'s three markers remain');

  // Band reverts to B's OWN `from` (standard) — A's raise (micro->standard) is still valid.
  assert.strictEqual(unwindB[0].change.band, 'standard');
});

// ── the mirror case: rejecting the EARLIER escalation while the LATER one is pending ──────────

check("rejecting the EARLIER escalation (A) disarms ONLY A's markers, leaving B's fully intact", () => {
  const stateA = { ...baseState(), bands: { lexer: 'micro' }, escalations: {} };
  const escA = ceremonyEscalation(verdictA, stateA);
  const stateB = { ...baseState(), bands: { lexer: 'standard' }, escalations: { lexer: [escA] } };
  const escB = ceremonyEscalation(verdictB, stateB);

  const armed = new Set();
  for (const e of [escA, escB]) for (const a of e.change.armed) armed.add(a);

  const unwindA = unwindCeremonyEscalation(escA);
  assert.ok(validateEffects(unwindA).ok);
  for (const u of unwindA) for (const d of u.change.disarmed) armed.delete(d);

  for (const c of ['deep-audit', 'scaffold-recheck', 'tighter-cadence']) {
    assert.ok(!armed.has(`${c}@${escA.change.escalationId}`), "A's markers are gone");
    assert.ok(armed.has(`${c}@${escB.change.escalationId}`), "B's markers are untouched by A's unwind");
  }
  // NOTE (known, named residual — see the design doc's Decision 5): unwindA reverts the band to A's
  // OWN `from` ('micro'), which in this reject-the-earlier-while-later-is-pending ordering discards
  // B's still-pending raise to 'full' too. This test asserts the MARKER isolation (the demonstrated
  // bug this task closes); it does NOT assert the band value is correct under this specific
  // out-of-order rejection sequence — that is the narrower, still-open residual named in the design
  // doc, not silently glossed over here.
});

// ── validateEffects accepts the namespaced shape ──────────────────────────────

check('a computed escalation and its unwind both pass validateEffects', () => {
  const stateA = { ...baseState(), bands: { lexer: 'micro' }, escalations: {} };
  const escA = ceremonyEscalation(verdictA, stateA);
  assert.ok(validateEffects([escA]).ok);
  assert.ok(validateEffects(unwindCeremonyEscalation(escA)).ok);
});

if (process.exitCode) console.error(`\nrewrite-ceremony-stacking: FAILURES above (${passed} passed).`);
else console.log(`\nrewrite-ceremony-stacking: all ${passed} checks pass. ✓`);
