// test/scout-seed.test.mjs — the genesis-seed grammar (reasonable 3.0 Part 8, DESIGN-3.0 §17, §13).
// The seed's draftCharters are STRUCTURE ONLY: the exact charter fields, no Delta/clause/behavioral
// slot. validateSeedShape is the mechanical answer to §15 open edge (d). readSeed mirrors the
// lib/policy.mjs loader TRICHOTOMY (absent -> {null,null}; malformed JSON -> {null,diagnostic};
// valid -> {parsed,null}), but — unlike readPolicy — does no shape checking at all: shape is
// validateSeedShape's job alone (Call 3's explicit two-function split).

import assert from 'node:assert';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readSeed, validateSeedShape } from '../lib/scout-seed.mjs';

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.stack || e.message}`); process.exitCode = 1; }
}

const validSeed = () => ({
  goalsSketch: [{ id: 'gs-1', scenario: 'a user can sign in with a session token' }],
  draftCharters: [
    { component: 'auth', premises: ['goal:gs-1'], purpose: 'issues + checks session tokens',
      locus: ['src/auth/**'], order: 0 },
  ],
});

// ── validateSeedShape ──────────────────────────────────────────────────────────

check('a well-formed seed validates ok', () => {
  const r = validateSeedShape(validSeed());
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.errors, []);
});

check('a draft charter carrying a Delta/clause/behavioral field is REJECTED (structure-only fence)', () => {
  const seed = validSeed();
  seed.draftCharters[0].clauses = [{ must: 'reject expired tokens' }]; // a behavioral slot
  const r = validateSeedShape(seed);
  assert.strictEqual(r.ok, false);
  assert.ok(r.errors.some((e) => /clauses|extra|unexpected|structure/i.test(e)),
    `expected a structure-only rejection naming the offending key; got ${JSON.stringify(r.errors)}`);
});

check('other stray charter keys (delta / musts / behavior / assert) are also rejected', () => {
  for (const key of ['delta', 'musts', 'behavior', 'assert']) {
    const seed = validSeed();
    seed.draftCharters[0][key] = 'anything';
    assert.strictEqual(validateSeedShape(seed).ok, false, `key "${key}" must be rejected`);
  }
});

// ── the five allowed charter fields, each validated by the SAME grammar real charters use
// (lib/atom.mjs: COMPONENT_RE, PREMISE_RE, purpose non-empty string, locus array, order
// non-negative integer — confirmed against the live lib/atom.mjs source before writing these). ──

check('a malformed component (uppercase) is rejected via the charter grammar', () => {
  const seed = validSeed();
  seed.draftCharters[0].component = 'Auth';
  assert.strictEqual(validateSeedShape(seed).ok, false);
});

check('a malformed premise (bad tag) is rejected via the charter grammar', () => {
  const seed = validSeed();
  seed.draftCharters[0].premises = ['nope:gs-1'];
  assert.strictEqual(validateSeedShape(seed).ok, false);
});

check('premises must be an array, not a bare string', () => {
  const seed = validSeed();
  seed.draftCharters[0].premises = 'goal:gs-1';
  assert.strictEqual(validateSeedShape(seed).ok, false);
});

check('an empty or non-string purpose is rejected via the charter grammar (non-empty string)', () => {
  for (const bad of ['', 42]) {
    const seed = validSeed();
    seed.draftCharters[0].purpose = bad;
    assert.strictEqual(validateSeedShape(seed).ok, false, `purpose ${JSON.stringify(bad)} must be rejected`);
  }
});

check('locus must be an array via the charter grammar', () => {
  const seed = validSeed();
  seed.draftCharters[0].locus = 'src/auth/**';
  assert.strictEqual(validateSeedShape(seed).ok, false);
});

// Audit gap (P8): validateCharterShape's locus check was Array.isArray only — no per-element
// string check (unlike premises). A nested object masquerading as a behavioral must (e.g. a
// {must: ...} clause smuggled in as a locus entry) rode straight through undetected. This is the
// exact scenario the audit demonstrated, disproving the "purpose is the only structure-only
// escape" claim below. Every locus element must be a string, same discipline premises already get.
check('a locus element that is not a string (a nested behavioral-must object) is rejected via the charter grammar', () => {
  const seed = validSeed();
  seed.draftCharters[0].locus = [{ must: 'reject expired tokens within 50ms' }];
  assert.strictEqual(validateSeedShape(seed).ok, false);
});

check('a non-integer order is rejected via the charter grammar', () => {
  const seed = validSeed();
  seed.draftCharters[0].order = 1.5;
  assert.strictEqual(validateSeedShape(seed).ok, false);
});

check('a negative order is rejected via the charter grammar (non-negative integer)', () => {
  const seed = validSeed();
  seed.draftCharters[0].order = -1;
  assert.strictEqual(validateSeedShape(seed).ok, false);
});

// ── goalsSketch / draftCharters container shape ─────────────────────────────────

check('goalsSketch must be an array of {id, scenario}', () => {
  const seed = validSeed();
  seed.goalsSketch = [{ id: 'gs-1' }]; // missing scenario
  assert.strictEqual(validateSeedShape(seed).ok, false);
});

check('goalsSketch must itself be an array, not e.g. a bare object', () => {
  const seed = validSeed();
  seed.goalsSketch = { id: 'gs-1', scenario: 'x' };
  assert.strictEqual(validateSeedShape(seed).ok, false);
});

check('draftCharters must itself be an array, not e.g. a bare object', () => {
  const seed = validSeed();
  seed.draftCharters = { component: 'auth' };
  assert.strictEqual(validateSeedShape(seed).ok, false);
});

check('an empty draftCharters array is valid (a goals-only sketch is a legitimate seed)', () => {
  const seed = validSeed();
  seed.draftCharters = [];
  assert.strictEqual(validateSeedShape(seed).ok, true);
});

check('a non-object seed is rejected', () => {
  assert.strictEqual(validateSeedShape(null).ok, false);
  assert.strictEqual(validateSeedShape([]).ok, false);
});

// ── the DOCUMENTED RESIDUAL (open edge (d)): a behavioral must hidden in the ─────
// non-normative `purpose` prose is NOT caught by the shape fence — identical to §13's
// own boundary for real charters. Asserted so it is a deliberate boundary, not a miss.
check('a behavioral must smuggled into the free-prose purpose is NOT caught by the shape fence (documented §13 residual)', () => {
  const seed = validSeed();
  seed.draftCharters[0].purpose = 'MUST reject every expired token within 50ms'; // prose smuggling
  // The shape fence only guards STRUCTURE; prose in `purpose` is non-normative by §13, so this passes
  // the mechanical fence and is caught downstream by the topologist membrane + the human genesis gate.
  assert.strictEqual(validateSeedShape(seed).ok, true);
});

// ── readSeed (the lib/policy.mjs loader TRICHOTOMY; shape checking is NOT its job) ──────────────

check('readSeed on an absent path -> {seed:null, diagnostic:null}', () => {
  const r = readSeed(join(tmpdir(), 'definitely-absent-seed-xyz.json'));
  assert.deepStrictEqual(r, { seed: null, diagnostic: null });
});

check('readSeed on malformed JSON -> {seed:null, diagnostic:<reason>}', () => {
  const dir = mkdtempSync(join(tmpdir(), 'scout-seed-'));
  try {
    const p = join(dir, 'seed.json');
    writeFileSync(p, '{ not json');
    const r = readSeed(p);
    assert.strictEqual(r.seed, null);
    assert.ok(typeof r.diagnostic === 'string' && r.diagnostic.length > 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

check('readSeed on a valid seed -> {seed:<parsed verbatim>, diagnostic:null}', () => {
  const dir = mkdtempSync(join(tmpdir(), 'scout-seed-'));
  try {
    const p = join(dir, 'seed.json');
    writeFileSync(p, JSON.stringify(validSeed()));
    const r = readSeed(p);
    assert.strictEqual(r.diagnostic, null);
    assert.strictEqual(r.seed.draftCharters[0].component, 'auth');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

check('readSeed does NOT validate structure-only-ness — that is validateSeedShape\'s job (separation)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'scout-seed-'));
  try {
    const bad = validSeed(); bad.draftCharters[0].clauses = [{ must: 'x' }];
    const p = join(dir, 'seed.json');
    writeFileSync(p, JSON.stringify(bad));
    const r = readSeed(p);
    assert.strictEqual(r.diagnostic, null, 'readSeed only parses; it does not run the structure fence');
    assert.strictEqual(validateSeedShape(r.seed).ok, false, 'validateSeedShape is where the fence lives');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

if (process.exitCode) console.error(`\nscout-seed: FAILURES above (${passed} passed).`);
else console.log(`\nscout-seed: all ${passed} checks passed. ✓`);
