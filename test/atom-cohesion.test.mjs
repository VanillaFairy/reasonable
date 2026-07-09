// test/atom-cohesion.test.mjs — the minimality/cohesion law (DESIGN-3.0 §4.3, reasonable 3.0 Part
// 3): a delta's clauses cohere iff they form one connected component of the clause-cohesion graph
// (shared provider citation | shared demanded-by | locus overlap below the component root). Pure,
// zero-I/O — clause objects are constructed by hand, no filesystem fixtures needed.

import assert from 'node:assert';
import { cohesionComponents } from '../lib/atom.mjs';

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.stack || e.message}`); process.exitCode = 1; }
}

// This delta's atom charter declares component 'lexer', physically rooted at 'lib/lexer/' — every
// locus fixture below is a real repo-relative glob under that root, matching how a charter's own
// `locus` field and 2.x's wo.locus are both already written (see interfaces.md's `componentRoot`
// param doc — cohesionComponents is NOT told the component slug 'lexer', it is told this literal
// path-prefix string, which the caller already knows because it's the one declaring loci under it).
const ROOT = 'lib/lexer/';

function sortedComponents(components) {
  return components.map((c) => [...c].sort()).sort((a, b) => a[0].localeCompare(b[0]));
}

function clause(clauseId, { citations = [], demandedBy = null, locus = [] } = {}) {
  return { clauseId, citations, demandedBy, locus };
}

// ── empty / trivial ─────────────────────────────────────────────────────────

check('an empty delta returns zero components', () => {
  assert.deepStrictEqual(cohesionComponents([], ROOT), []);
});

check('a single clause is its own component', () => {
  const c = clause('lexer#c1');
  assert.deepStrictEqual(cohesionComponents([c], ROOT), [['lexer#c1']]);
});

check('two clauses sharing nothing are two separate components', () => {
  const a = clause('lexer#c1', { citations: [{ component: 'ast', clause: 'ast#c1' }] });
  const b = clause('lexer#c2', { citations: [{ component: 'ast', clause: 'ast#c2' }] });
  assert.deepStrictEqual(sortedComponents(cohesionComponents([a, b], ROOT)), [['lexer#c1'], ['lexer#c2']]);
});

// ── criterion (a): shared provider citation ─────────────────────────────────

check('two clauses citing the SAME provider clause cohere', () => {
  const provider = { component: 'ast', clause: 'ast#c1' };
  const a = clause('lexer#c1', { citations: [provider] });
  const b = clause('lexer#c2', { citations: [provider, { component: 'ast', clause: 'ast#c2' }] });
  assert.deepStrictEqual(sortedComponents(cohesionComponents([a, b], ROOT)), [['lexer#c1', 'lexer#c2']]);
});

check('citing DIFFERENT providers does not cohere via (a) alone', () => {
  const a = clause('lexer#c1', { citations: [{ component: 'ast', clause: 'ast#c1' }] });
  const b = clause('lexer#c2', { citations: [{ component: 'ast', clause: 'ast#c2' }] });
  assert.deepStrictEqual(sortedComponents(cohesionComponents([a, b], ROOT)), [['lexer#c1'], ['lexer#c2']]);
});

// ── criterion (b): shared demanded-by ───────────────────────────────────────

check('two clauses with the identical demandedBy string cohere', () => {
  const a = clause('lexer#c1', { demandedBy: 'gate:vertical-slice:x / asserts `y`' });
  const b = clause('lexer#c2', { demandedBy: 'gate:vertical-slice:x / asserts `y`' });
  assert.deepStrictEqual(sortedComponents(cohesionComponents([a, b], ROOT)), [['lexer#c1', 'lexer#c2']]);
});

check('two clauses with DIFFERENT demandedBy strings do not cohere via (b) alone', () => {
  const a = clause('lexer#c1', { demandedBy: 'goal:g1' });
  const b = clause('lexer#c2', { demandedBy: 'goal:g2' });
  assert.deepStrictEqual(sortedComponents(cohesionComponents([a, b], ROOT)), [['lexer#c1'], ['lexer#c2']]);
});

check('two null demandedBy values never cohere with each other via (b) — null is not a shared value', () => {
  const a = clause('lexer#c1', { demandedBy: null });
  const b = clause('lexer#c2', { demandedBy: null });
  assert.deepStrictEqual(sortedComponents(cohesionComponents([a, b], ROOT)), [['lexer#c1'], ['lexer#c2']]);
});

// ── criterion (c): locus overlap below the component root ──────────────────

check('two clauses whose loci share a subdirectory BELOW the component root cohere', () => {
  const a = clause('lexer#c1', { locus: [`${ROOT}tokenizer/scan.mjs`] });
  const b = clause('lexer#c2', { locus: [`${ROOT}tokenizer/errors.mjs`] });
  assert.deepStrictEqual(sortedComponents(cohesionComponents([a, b], ROOT)), [['lexer#c1', 'lexer#c2']]);
});

check('two clauses whose loci are BOTH exactly the bare component root do not cohere via (c) — the root alone is excluded', () => {
  const a = clause('lexer#c1', { locus: [ROOT] });
  const b = clause('lexer#c2', { locus: [ROOT] });
  assert.deepStrictEqual(sortedComponents(cohesionComponents([a, b], ROOT)), [['lexer#c1'], ['lexer#c2']]);
});

check('two clauses with disjoint sub-paths below the root do not cohere via (c)', () => {
  const a = clause('lexer#c1', { locus: [`${ROOT}tokenizer/scan.mjs`] });
  const b = clause('lexer#c2', { locus: [`${ROOT}errors/report.mjs`] });
  assert.deepStrictEqual(sortedComponents(cohesionComponents([a, b], ROOT)), [['lexer#c1'], ['lexer#c2']]);
});

check('a clause with no locus at all contributes nothing to (c) (does not spuriously cohere)', () => {
  const a = clause('lexer#c1', { locus: [] });
  const b = clause('lexer#c2', { locus: [`${ROOT}tokenizer/scan.mjs`] });
  assert.deepStrictEqual(sortedComponents(cohesionComponents([a, b], ROOT)), [['lexer#c1'], ['lexer#c2']]);
});

check('a locus that does not start with componentRoot at all is treated as already-stripped (conservative fallback, never silently dropped)', () => {
  const a = clause('lexer#c1', { locus: ['some/other/path.mjs'] });
  const b = clause('lexer#c2', { locus: ['some/other/path.mjs'] });
  assert.deepStrictEqual(sortedComponents(cohesionComponents([a, b], ROOT)), [['lexer#c1', 'lexer#c2']]);
});

// ── transitivity and the disconnected (R4) case ─────────────────────────────

check('cohesion is transitive across DIFFERENT criteria: A~B via (a), B~C via (b) => {A,B,C} one component', () => {
  const provider = { component: 'ast', clause: 'ast#c1' };
  const a = clause('lexer#c1', { citations: [provider] });
  const b = clause('lexer#c2', { citations: [provider], demandedBy: 'goal:g1' });
  const c = clause('lexer#c3', { demandedBy: 'goal:g1' });
  assert.deepStrictEqual(sortedComponents(cohesionComponents([a, b, c], ROOT)), [['lexer#c1', 'lexer#c2', 'lexer#c3']]);
});

check('a delta with two genuinely disconnected clusters returns two components (R4 split payload)', () => {
  const provider1 = { component: 'ast', clause: 'ast#c1' };
  const provider2 = { component: 'eval', clause: 'eval#c1' };
  const a = clause('lexer#c1', { citations: [provider1] });
  const b = clause('lexer#c2', { citations: [provider1] });
  const c = clause('lexer#c3', { citations: [provider2] });
  const d = clause('lexer#c4', { citations: [provider2] });
  const result = sortedComponents(cohesionComponents([a, b, c, d], ROOT));
  assert.strictEqual(result.length, 2);
  assert.deepStrictEqual(result, [['lexer#c1', 'lexer#c2'], ['lexer#c3', 'lexer#c4']]);
});

check('every input clauseId appears in exactly one output component (partition property)', () => {
  const provider = { component: 'ast', clause: 'ast#c1' };
  const clauses = [
    clause('lexer#c1', { citations: [provider] }),
    clause('lexer#c2', { citations: [provider] }),
    clause('lexer#c3', { demandedBy: 'goal:solo' }),
  ];
  const components = cohesionComponents(clauses, ROOT);
  const flat = components.flat().sort();
  assert.deepStrictEqual(flat, ['lexer#c1', 'lexer#c2', 'lexer#c3']);
});

if (process.exitCode) console.error(`\natom-cohesion: FAILURES above (${passed} passed).`);
else console.log(`\natom-cohesion: all ${passed} checks pass. ✓`);
