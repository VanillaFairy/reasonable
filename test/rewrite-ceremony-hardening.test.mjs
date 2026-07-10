// test/rewrite-ceremony-hardening.test.mjs — T03c audit follow-up (T03d): two narrow hardening
// checks on unwindCeremonyEscalation. Locked test/rewrite-ceremony.test.mjs is untouched; this file
// adds coverage alongside it, not in place of it. The THIRD T03c finding (stacked escalations on one
// cone are not exactly unwound — armed markers are unnamespaced) is a deliberate, documented
// exclusion from this task; see the T03d task file.

import assert from 'node:assert';
import { ceremonyEscalation, unwindCeremonyEscalation } from '../lib/rewrite.mjs';

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.stack || e.message}`); process.exitCode = 1; }
}

// Same {bands, armed} fold as test/rewrite-ceremony.test.mjs's own `applyBand` helper — duplicated
// here rather than imported, because that file is locked and the helper is a local, unexported fn.
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

// ── T03d-1: an unrelated pre-armed marker on the same cone survives unwind ─────

check('an unrelated pre-armed marker on the same cone survives unwind (T03d-1, already correct)', () => {
  // Seed the cone with an armed marker that belongs to some OTHER escalation, not the one we unwind.
  const start = { bands: { lexer: 'standard' }, armed: new Set(['lexer:pre-existing-guard']) };
  const esc = ceremonyEscalation(wideR2Verdict, wideR2State());
  const raised = applyBand(start, [esc]);
  assert.ok(raised.armed.has('lexer:pre-existing-guard'), 'sanity: the pre-armed marker is still there before unwind');
  assert.strictEqual(raised.armed.size, 4); // the 3 escalation markers + the 1 pre-existing one

  const unwound = applyBand(raised, unwindCeremonyEscalation(esc));
  assert.strictEqual(unwound.bands.lexer, 'standard'); // band restored to `from`
  assert.ok(unwound.armed.has('lexer:pre-existing-guard'), 'the unrelated pre-armed marker must survive the unwind');
  assert.deepStrictEqual([...unwound.armed].sort(), ['lexer:pre-existing-guard']); // and nothing else remains
});

// ── T03d-3: a malformed hand-built effect (band present, `from` missing) must not unwind ──

check("unwindCeremonyEscalation on a malformed effect (band present, `from` missing) returns [], not band: undefined (T03d-3)", () => {
  const malformed = { nodeId: 'x', change: { band: 'full' } }; // no `from` — not something ceremonyEscalation ever produces
  assert.deepStrictEqual(unwindCeremonyEscalation(malformed), []);
});

if (process.exitCode) console.error(`\nrewrite-ceremony-hardening: FAILURES above (${passed} passed).`);
else console.log(`\nrewrite-ceremony-hardening: all ${passed} checks pass. ✓`);
