# Task T03a: Ceremony + unwind + R8 tests (red)

**Role:** `red` — you write ONLY the test file below. Do NOT implement the T03 section.

## References
- Read: `../shared/interfaces.md` (the `ceremonyEscalation`/`unwindCeremonyEscalation` signatures and
  the identity invariant; the R8 payload)
- Read: `../shared/conventions.md`, `../knowledge/running-tests.md`
- Read: `docs/superpowers/specs/2026-07-09-reasonable-3.0-p5-rewrite-design.md` Decision 7 (the
  ceremony effect + the unwind — **the flagged open edge**) and Decision 5's R8 paragraph
- Read: `lib/rewrite.mjs` (T01+T02 sections — you import from it; `ceremonyEscalation`/
  `unwindCeremonyEscalation` don't exist yet, so RED is a named-import failure)

## Dependencies
- Depends on: T01b (module exists to import)
- Depended on by: T03b (implements against these), T03c (audits — with extra unwind teeth)

## Scope
**Files:**
- Create: `test/rewrite-ceremony.test.mjs`

**BOUNDARY — do NOT modify `lib/rewrite.mjs` or any other file.**

## Positive Constraints (DO)
- Cover `ceremonyEscalation`'s four triggers (a wide R2, a foreign-reaching R3, an
  integration-exposing R9, a second R1) firing, and their non-fire counterparts (narrow R2, empty
  R3, non-exposing R9, first R1).
- Cover **monotone-up + cap**: a cone already at the top band returns `null`; an unknown current band
  returns `null`.
- Cover the **headline invariant**: applying an escalation effect then its unwind is **identity** —
  no residual band raise, no residual armed check. Build a small `applyBand` fold in the test itself.
- Cover R8: `genesis` blocks the topology stage (provisional); `live` is batched retopology pressure
  (permanent); a bad scope HALTs.
- Assert `validateEffects` on the escalation effect, the unwind, and the R8 outputs.

## Negative Constraints (DO NOT)
- Do NOT implement anything in `lib/rewrite.mjs`. No filesystem.

## Implementation Steps

### Step 1: Write `test/rewrite-ceremony.test.mjs`

```js
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
  const esc = ceremonyEscalation(wideR2Verdict, wideR2State());
  assert.deepStrictEqual(esc, {
    nodeId: 'lexer',
    change: { band: 'full', from: 'standard', armed: ['deep-audit', 'scaffold-recheck', 'tighter-cadence'] },
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
```

### Step 2: Run to verify RED

Run: `node test/rewrite-ceremony.test.mjs`. Expected: a named-import failure
(`ceremonyEscalation`/`unwindCeremonyEscalation` not exported) — a genuine RED.

### Step 3: Commit

```bash
git add test/rewrite-ceremony.test.mjs
git commit -m "test(rewrite): lock the ceremony escalation, its unwind identity, and R8 (red)"
```

## Acceptance Criteria
- [ ] File exists, matches the harness convention, and fails RED for the right reason
- [ ] All four triggers (fire + non-fire), the monotone cap, the unknown-band guard, the
      **apply-then-unwind = identity** invariant, the null-unwind no-op, and R8's three cases are
      covered, each asserted `validateEffects`-valid where it emits effects
- [ ] No filesystem; no file outside Scope modified
