// test/ceremony-classify.test.mjs — the complexity classifier (DESIGN-3.0 §5.4, reasonable 3.0 Part
// 6c): a pure, MONOTONE map from five t0-observable risk inputs to a band drawn from the SAME ordered
// dials.bandScale array lib/rewrite.mjs's ceremonyEscalation ratchets through. Pure, zero-I/O — inputs
// and a synthetic `dials` fixture are built by hand; the round-trip check imports the shipped
// ceremonyEscalation to prove classify emits into the exact scale it indexes.
import assert from 'node:assert';
import { classify } from '../lib/ceremony.mjs';
import { ceremonyEscalation } from '../lib/rewrite.mjs';
import { validateEffects } from '../lib/effects.mjs';

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.stack || e.message}`); process.exitCode = 1; }
}

// A synthetic dials fixture: bandScale is the ordered risk vocabulary; classifier carries the (flagged
// uncalibrated) per-axis cutoffs P6c coins. Deep-cloned per test so a mutation never leaks.
const dials = () => structuredClone({
  bandScale: ['micro', 'standard', 'full'],
  phaseCutoffs: { micro: 'skip-scaffold', standard: 'materialize', full: 'materialize' }, // classify never reads these
  cadenceIndex: { micro: 0, standard: 1, full: 2 },                                       // nor these
  classifier: {
    blastRadiusCutoffs: [10, 100],   // <10 -> 0, [10,100) -> 1, >=100 -> 2
    horizonCutoffs: [2, 5],          // ordinal cutoffs
    criticalityCutoffs: [1, 2],      // ordinal cutoffs
    autonomousPressure: 1,           // an autonomous run adds one band of pressure
    trustedRelief: 1,                // a trusted suite already covering the locus relieves one band
  },
});
const lowRisk = { blastRadius: 0, trustedSuiteCovers: false, criticality: 0, supervision: 'present-human', horizon: 0 };

// ── output vocabulary: always a member of dials.bandScale (never invents a name) ──────────────────

check('classify always returns a band drawn from dials.bandScale', () => {
  const d = dials();
  const band = classify({ ...lowRisk, blastRadius: 15 }, d);
  assert.ok(d.bandScale.includes(band), `${band} not in bandScale`);
});

check('an absent or empty bandScale yields null (never guesses a band)', () => {
  assert.strictEqual(classify(lowRisk, { classifier: {} }), null);
  assert.strictEqual(classify(lowRisk, { bandScale: [] }), null);
  assert.strictEqual(classify(lowRisk, undefined), null);
});

// ── the mapping: max-of-per-axis-pressure, trusted-suite relief, clamped ──────────────────────────

check('all-low inputs land in the lowest band (index 0)', () => {
  assert.strictEqual(classify(lowRisk, dials()), 'micro');
});

check('a mid blast radius alone lifts one band (pressure 1 -> standard)', () => {
  assert.strictEqual(classify({ ...lowRisk, blastRadius: 15 }, dials()), 'standard');
});

check('a huge blast radius saturates the top band (pressure 2 -> full), never past it (clamp)', () => {
  assert.strictEqual(classify({ ...lowRisk, blastRadius: 10000 }, dials()), 'full');
});

check('axes combine by MAX, not sum (two axes each at pressure 1 -> standard, not full)', () => {
  assert.strictEqual(classify({ ...lowRisk, blastRadius: 15, criticality: 1 }, dials()), 'standard');
});

check('an autonomous run adds a band of pressure over an otherwise-identical human-supervised run', () => {
  const d = dials(); const scale = d.bandScale;
  const auto = classify({ ...lowRisk, supervision: 'autonomous' }, d);
  const human = classify({ ...lowRisk, supervision: 'present-human' }, d);
  assert.ok(scale.indexOf(auto) >= scale.indexOf(human));
  assert.strictEqual(auto, 'standard'); // 0 risk-up + autonomousPressure 1 -> index 1
  assert.strictEqual(human, 'micro');
});

check('a trusted suite covering the locus RELIEVES one band (index falls, floored at 0)', () => {
  const covered = classify({ ...lowRisk, blastRadius: 15, trustedSuiteCovers: true }, dials()); // 1 - 1 = 0
  assert.strictEqual(covered, 'micro');
  const floored = classify({ ...lowRisk, trustedSuiteCovers: true }, dials()); // 0 - 1 -> clamp 0
  assert.strictEqual(floored, 'micro');
});

// ── MONOTONE: raising the risk on ANY axis never LOWERS the band (§5.4, the headline property) ─────

check('monotone: raising blastRadius never lowers the band index', () => {
  const d = dials(); const scale = d.bandScale;
  let prev = -1;
  for (const br of [0, 9, 10, 50, 99, 100, 5000]) {
    const idx = scale.indexOf(classify({ ...lowRisk, blastRadius: br }, d));
    assert.ok(idx >= prev, `blastRadius ${br} lowered the band`);
    prev = idx;
  }
});

check('monotone: raising criticality, then horizon, never lowers the band index', () => {
  const d = dials(); const scale = d.bandScale;
  let prev = -1;
  for (const c of [0, 1, 2, 9]) { const idx = scale.indexOf(classify({ ...lowRisk, criticality: c }, d)); assert.ok(idx >= prev, `criticality ${c} lowered`); prev = idx; }
  prev = -1;
  for (const h of [0, 1, 2, 5, 20]) { const idx = scale.indexOf(classify({ ...lowRisk, horizon: h }, d)); assert.ok(idx >= prev, `horizon ${h} lowered`); prev = idx; }
});

check('monotone / anti-gaming: dropping trusted coverage (higher risk) never lowers the band', () => {
  const d = dials(); const scale = d.bandScale;
  const inflated = { ...lowRisk, blastRadius: 15, horizon: 10, criticality: 2 };
  const withTrust = scale.indexOf(classify({ ...inflated, trustedSuiteCovers: true }, d));
  const without = scale.indexOf(classify({ ...inflated, trustedSuiteCovers: false }, d));
  assert.ok(without >= withTrust, 'losing trusted coverage lowered the band');
});

// ── the minimal-driver anti-gaming clause (§5.4): horizon is a bare ordinal, monotone-up ──────────

check('minimal driver: a larger horizon (inflated footprint) can only RAISE the band, never lower it', () => {
  const d = dials(); const scale = d.bandScale;
  const small = scale.indexOf(classify({ ...lowRisk, horizon: 1 }, d));
  const inflated = scale.indexOf(classify({ ...lowRisk, horizon: 50 }, d));
  assert.ok(inflated >= small, 'inflating the horizon bought a lower band — the minimal-driver clause is broken');
});

// ── shape-not-value: absent classifier thresholds disable a lift, never fabricate one ─────────────

check('a dials with no classifier block loads clean: every axis contributes 0 -> lowest band', () => {
  const inputs = { blastRadius: 9999, criticality: 9, horizon: 9, supervision: 'autonomous', trustedSuiteCovers: false };
  assert.strictEqual(classify(inputs, { bandScale: ['micro', 'standard', 'full'] }), 'micro');
});

check('an absurd-but-well-formed cutoff loads and fires per the numbers given (shape, never value)', () => {
  const d = dials(); d.classifier.blastRadiusCutoffs = [0]; // every non-negative blastRadius meets it
  assert.strictEqual(classify({ ...lowRisk, blastRadius: 0 }, d), 'standard'); // pressure 1
});

// ── the load-bearing composition: classify emits into the SAME scale ceremonyEscalation ratchets ──

const wideR2State = (band, bandScale) => ({
  atoms: [{ id: 'a-1', component: 'lexer', state: "spec'd", deltaClauses: [] }],
  citationGraph: { w: ['x', 'y'], x: [], y: [] }, // closure(w) = [w,x,y], width 3
  bands: { lexer: band },
  bandScale,
  bandBounds: { lexer: 1 }, // the cone assumed radius <= 1; 3 > 1 → escalate
});
const wideR2Verdict = { kind: 'dead-end', atomId: 'a-1', premise: { component: 'w', clause: 'w#c1', layer: 'contract' } };

check('round-trip: a classified NON-top band ratchets up exactly one step through ceremonyEscalation', () => {
  const d = dials();
  const band = classify({ ...lowRisk, blastRadius: 15 }, d); // 'standard' (index 1 of 3)
  assert.strictEqual(band, 'standard');
  assert.notStrictEqual(d.bandScale.indexOf(band), -1); // classify's output IS a member of the scale
  const esc = ceremonyEscalation(wideR2Verdict, wideR2State(band, d.bandScale));
  // reasonable 3.0 Part 7 (interfaces.md §0 correction 3): ceremonyEscalation namespaces every
  // escalation by a stable escalationId (state.escalations[coneId]'s length — 0 here, since
  // wideR2State carries no escalations field, defaulting to []) and tags every armed marker with it,
  // so stacked escalations on one cone unwind independently. This round-trip assertion tracks the same
  // shape change as test/rewrite-ceremony.test.mjs's WIDE-R2 check.
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

check('round-trip: a classified TOP band is capped by ceremonyEscalation (no escalation, never wraps)', () => {
  const d = dials();
  const band = classify({ ...lowRisk, blastRadius: 10000 }, d); // 'full' (top)
  assert.strictEqual(band, 'full');
  assert.strictEqual(ceremonyEscalation(wideR2Verdict, wideR2State(band, d.bandScale)), null);
});

// ── audit follow-up (P6c, T01c): close two surviving-mutant gaps + two minor shape-only gaps ─────

check('clamp ceiling: an axis producing pressure beyond bandScale length still caps cleanly (no undefined band)', () => {
  const d = dials();
  d.classifier.blastRadiusCutoffs = [1, 2, 3, 4, 5]; // 5 ascending cutoffs on a 3-band scale (top index 2) —
                                                       // raw pressure can reach 5, far past the scale's ceiling
  const band = classify({ ...lowRisk, blastRadius: 100 }, d); // meets all 5 cutoffs -> raw pressure 5
  assert.strictEqual(band, 'full'); // must clamp to the top band, never undefined / out-of-range
  assert.ok(d.bandScale.includes(band));
});

check('monotone / anti-gaming (isolated from saturation): dropping trusted coverage strictly raises the band away from the top', () => {
  const d = dials(); const scale = d.bandScale;
  const nearMid = { ...lowRisk, blastRadius: 15 }; // pressure 1 of 2 -- deliberately UNSATURATED (top is pressure 2)
  const withTrust = scale.indexOf(classify({ ...nearMid, trustedSuiteCovers: true }, d));
  const without = scale.indexOf(classify({ ...nearMid, trustedSuiteCovers: false }, d));
  assert.ok(without > withTrust, 'losing trusted coverage must strictly raise the band once away from saturation');
});

check('a negative-but-well-formed cutoff loads and fires per the numbers given (shape, never value)', () => {
  const d = dials();
  d.classifier.blastRadiusCutoffs = [-5, -1]; // both negative, ascending
  const band = classify({ ...lowRisk, blastRadius: -3 }, d); // meets -5, not -1 -> pressure 1
  assert.strictEqual(band, 'standard');
});

check('fully-absent inputs never throws and behaves as all-zero risk (lowest band)', () => {
  const d = dials();
  assert.strictEqual(classify(undefined, d), 'micro');
  assert.strictEqual(classify(null, d), 'micro');
  assert.doesNotThrow(() => classify(undefined, undefined));
  assert.doesNotThrow(() => classify(null, null));
});

if (process.exitCode) console.error(`\nceremony-classify: FAILURES above (${passed} passed).`);
else console.log(`\nceremony-classify: all ${passed} checks pass. ✓`);
