// test/rewrite-ceremony.test.mjs — the ceremony-escalation effect, its UNWIND (DESIGN-3.0 open edge
// c: the R7-shaped unwind, asserted but never tested — tested here), and R8 (DESIGN-3.0 §7, §5.4,
// §9, §17, reasonable 3.0 Part 5). Pure, zero-I/O.

import assert from 'node:assert';
import { computeVerdictEffects, ceremonyEscalation, unwindCeremonyEscalation } from '../lib/rewrite.mjs';
import { validateEffects } from '../lib/effects.mjs';

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.stack || e.message}`); process.exitCode = 1; }
}

// Fold band effects onto a {bands, armed} state — the apply semantics the invariant is stated over.
function applyBand(st, effects) {
  const bands = { ...st.bands };
  const armed = new Set(st.armed);
  for (const e of effects) {
    if (e.change.band !== undefined) bands[e.nodeId] = e.change.band;
    for (const a of e.change.armed || []) armed.add(`${e.nodeId}:${a}`);
    for (const d of e.change.disarmed || []) armed.delete(`${e.nodeId}:${d}`);
  }
  return { bands, armed };
}

const wideR2State = () => ({
  atoms: [{ id: 'a-1', component: 'lexer', state: "spec'd", deltaClauses: [] }],
  citationGraph: { w: ['x', 'y'], x: [], y: [] }, // closure(w) = [w,x,y], width 3
  bands: { lexer: 'standard' },
  bandScale: ['micro', 'standard', 'full'],
  bandBounds: { lexer: 1 }, // the cone's band assumed a radius <= 1; 3 > 1 → escalate
});
const wideR2Verdict = { kind: 'dead-end', atomId: 'a-1', premise: { component: 'w', clause: 'w#c1', layer: 'contract' } };

// ── ceremonyEscalation: triggers ──────────────────────────────────────────────

check('a WIDE R2 (blast radius past the cone band bound) ratchets the band up one step', () => {
  // reasonable 3.0 Part 7 (interfaces.md §0 correction 3): ceremonyEscalation now namespaces every
  // escalation by a stable escalationId (state.escalations[coneId]'s length at call time — 0 here,
  // since wideR2State() carries no escalations field, defaulting to []) and tags every armed marker
  // with it, so a rejected escalation can never strip a co-resident one's markers. This is the ONE
  // assertion in this file the shape change touches; every other check in this file is unaffected.
  const esc = ceremonyEscalation(wideR2Verdict, wideR2State());
  assert.deepStrictEqual(esc, {
    nodeId: 'lexer',
    change: {
      escalationId: 'lexer#esc0',
      band: 'full',
      from: 'standard',
      armed: ['deep-audit@lexer#esc0', 'scaffold-recheck@lexer#esc0', 'tighter-cadence@lexer#esc0'],
    },
  });
  assert.ok(validateEffects([esc]).ok);
});

check('a NARROW R2 (radius within the band bound) does not escalate', () => {
  const state = wideR2State(); state.bandBounds = { lexer: 5 }; // 3 <= 5
  assert.strictEqual(ceremonyEscalation(wideR2Verdict, state), null);
});

check('a foreign-reaching R3 escalates; an empty manifest does not', () => {
  const base = { atoms: [{ id: 'a-1', component: 'lexer', state: 'packed', deltaClauses: [] }], bands: { lexer: 'micro' }, bandScale: ['micro', 'standard', 'full'] };
  assert.ok(ceremonyEscalation({ kind: 'ripple', atomId: 'a-1', manifest: [{ component: 'io', clause: 'io#c1', type: 'amend' }] }, base));
  assert.strictEqual(ceremonyEscalation({ kind: 'ripple', atomId: 'a-1', manifest: [] }, base), null);
});

check('an integration-exposing R9 escalates; a plain R9 does not', () => {
  const base = { atoms: [{ id: 'a-1', component: 'lexer', state: "spec'd", deltaClauses: [] }], bands: { lexer: 'micro' }, bandScale: ['micro', 'standard', 'full'] };
  assert.ok(ceremonyEscalation({ kind: 'stale-spec', atomId: 'a-1', collidesWith: 'a-2', integrationExposed: true }, base));
  assert.strictEqual(ceremonyEscalation({ kind: 'stale-spec', atomId: 'a-1', collidesWith: 'a-2' }, base), null);
});

check('a SECOND R1 escalates; the first does not', () => {
  const base = { atoms: [{ id: 'a-1', component: 'lexer', state: 'packed', deltaClauses: [] }], bands: { lexer: 'micro' }, bandScale: ['micro', 'standard', 'full'] };
  const withPrior = { ...base, priorVerdicts: [{ atomId: 'a-1', kind: 'checkpoint' }] };
  assert.ok(ceremonyEscalation({ kind: 'checkpoint', atomId: 'a-1', evidence: 'x' }, withPrior));
  assert.strictEqual(ceremonyEscalation({ kind: 'checkpoint', atomId: 'a-1', evidence: 'x' }, base), null);
});

// ── ceremonyEscalation: monotone up, capped (§7 "ratchets up only") ────────────

check('a cone already at the top band does not escalate (capped, never wraps)', () => {
  const state = wideR2State(); state.bands = { lexer: 'full' };
  assert.strictEqual(ceremonyEscalation(wideR2Verdict, state), null);
});

check('an unknown current band is not placed on the scale (returns null, never guesses)', () => {
  const state = wideR2State(); state.bands = { lexer: 'mystery' };
  assert.strictEqual(ceremonyEscalation(wideR2Verdict, state), null);
});

// ── the unwind: apply-then-unwind = IDENTITY (DESIGN-3.0 open edge c) ───────────

check('applying an escalation then its unwind restores the cone EXACTLY — no residual band, no residual armed check', () => {
  const start = { bands: { lexer: 'standard' }, armed: new Set() };
  const esc = ceremonyEscalation(wideR2Verdict, wideR2State());
  const raised = applyBand(start, [esc]);
  assert.strictEqual(raised.bands.lexer, 'full');
  assert.strictEqual(raised.armed.size, 3);
  const unwound = applyBand(raised, unwindCeremonyEscalation(esc));
  assert.deepStrictEqual(unwound.bands, start.bands);
  assert.strictEqual(unwound.armed.size, 0);
  assert.ok(validateEffects(unwindCeremonyEscalation(esc)).ok);
});

check('unwinding a null / non-band effect is a no-op (empty array)', () => {
  assert.deepStrictEqual(unwindCeremonyEscalation(null), []);
  assert.deepStrictEqual(unwindCeremonyEscalation({ nodeId: 'a-1', change: { flag: 'frozen', op: 'set' } }), []);
});

// ── R8 illegible ─────────────────────────────────────────────────────────────

check('genesis-R8 blocks the topology stage (provisional)', () => {
  const r = computeVerdictEffects({ kind: 'illegible', scope: 'genesis', proposal: { recut: 'ab' } }, {});
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.provisional, [{ nodeId: 'topology', change: { blocked: true, reason: 'genesis-R8', proposal: { recut: 'ab' } } }]);
  assert.deepStrictEqual(r.permanent, []);
  assert.ok(validateEffects([...r.provisional, ...r.permanent]).ok);
});

check('live-R8 is batched retopology pressure (permanent, no provisional effect)', () => {
  const r = computeVerdictEffects({ kind: 'illegible', scope: 'live', proposal: { regroup: 'cd' } }, {});
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.provisional, []);
  assert.deepStrictEqual(r.permanent, [{ nodeId: 'topology', change: { retopologyPressure: true, proposal: { regroup: 'cd' } } }]);
});

check('R8 with a bad scope HALTs', () => {
  assert.strictEqual(computeVerdictEffects({ kind: 'illegible', scope: 'nonsense', proposal: {} }, {}).ok, false);
});

if (process.exitCode) console.error(`\nrewrite-ceremony: FAILURES above (${passed} passed).`);
else console.log(`\nrewrite-ceremony: all ${passed} checks pass. ✓`);
