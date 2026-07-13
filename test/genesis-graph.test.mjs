// test/genesis-graph.test.mjs — A1 ACCEPTANCE: "does a real effort produce a non-empty genesis graph?"
//
// At pure genesis (charters only, NO deltas) a live effort's graph must light up: a NESTED containment
// tree (atoms under their component -> subeffort path — the Gap-D id-duality collapse), NON-EMPTY needs
// edges (the planned fold from charter premises), and a complexity band from classify(). Serves-cones
// stay EMPTY until the first deltas land (an A2 payoff) — asserted here as the honest boundary.
//
// Everything runs over pure exported functions (charterAtom / deriveCurrent / classify / deriveConeOrder)
// against a throwaway effort dir. Fixture pattern from test/graph-projections.test.mjs.
import assert from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { charterAtom } from '../lib/atom.mjs';
import { deriveCurrent } from '../lib/graph.mjs';
import { classify } from '../lib/ceremony.mjs';
import { deriveConeOrder } from '../lib/next-action.mjs';
import { readGoals } from '../lib/goals.mjs';

const tmps = [];
let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.stack || e.message}`); process.exitCode = 1; }
}

// A genesis effort: 3 chartered (NOT spec'd) atoms across 2 components, an ownership map that nests
// lexer under a subeffort path, a single goal, and NO route.json anywhere. Returns { root, ids }.
function genesisEffort() {
  const root = mkdtempSync(join(tmpdir(), 'genesis-graph-')); tmps.push(root);
  mkdirSync(join(root, '.reasonable'), { recursive: true });

  const lex0 = charterAtom(root, { component: 'lexer', premises: ['ledger:1'], purpose: 'tokenize', locus: ['lib/lexer/'], order: 0 });
  const lex1 = charterAtom(root, { component: 'lexer', premises: ['ledger:1'], purpose: 'tokenize more', locus: ['lib/lexer/'], order: 1 });
  const par0 = charterAtom(root, { component: 'parser', premises: ['cite:lexer#c1'], purpose: 'parse', locus: ['lib/parser/'], order: 0 });
  for (const r of [lex0, lex1, par0]) assert.ok(r.ok, `charterAtom failed: ${r.error}`);

  writeFileSync(join(root, '.reasonable', 'ownership.json'), JSON.stringify({
    lexer: 'frontend/parsing',
    parser: 'frontend',
  }, null, 2));

  writeFileSync(join(root, '.reasonable', 'goals.json'), JSON.stringify([
    { id: 'g-1', scenario: 'tokenize and parse an expression', scenarioCitations: [{ clause: 'lexer#c1' }] },
  ], null, 2));

  return { root, ids: { lex0: lex0.id, lex1: lex1.id, par0: par0.id } };
}

const { root, ids } = genesisEffort();
const goals = readGoals(root).goals;
const { containment, atoms, edges } = deriveCurrent(root, { goals });

// ── Gap D: the containment tree NESTS atoms under their subeffort path ───────

check('containment nests the lexer atoms under frontend/parsing (NOT flat)', () => {
  const frontend = containment.children.find((c) => c.id === 'frontend' && c.kind === 'group');
  assert.ok(frontend, 'a "frontend" group node exists at the root');
  const parsing = frontend.children.find((c) => c.id === 'frontend/parsing' && c.kind === 'group');
  assert.ok(parsing, 'a "frontend/parsing" group nests under frontend');
  assert.deepStrictEqual(parsing.children.map((c) => c.id).sort(), [ids.lex0, ids.lex1].sort());
});

check('the parser atom sits directly under the frontend group (its component maps to "frontend")', () => {
  const frontend = containment.children.find((c) => c.id === 'frontend');
  assert.ok(frontend.children.some((c) => c.kind === 'atom' && c.id === ids.par0));
});

// ── non-empty NEEDS edges (the planned fold) ────────────────────────────────

check('needs edges are NON-EMPTY at genesis (the A1 payoff)', () => {
  const needs = edges.filter((e) => e.edge === 'needs');
  assert.ok(needs.length > 0, 'genesis graph has needs edges');
  // intra-component: lex1 (order 1) needs lex0 (order 0)
  assert.ok(needs.some((e) => e.from === ids.lex1 && e.to === ids.lex0), 'intra-component planned edge present');
  // cross-component: parser (cite:lexer#c1) needs every lexer atom
  assert.ok(needs.some((e) => e.from === ids.par0 && e.to === ids.lex0), 'cross-component planned edge to lex0');
  assert.ok(needs.some((e) => e.from === ids.par0 && e.to === ids.lex1), 'cross-component planned edge to lex1');
});

check('serves edges are EMPTY at genesis (cone contents are an A2 payoff — no deltas yet)', () => {
  assert.strictEqual(edges.filter((e) => e.edge === 'serves').length, 0);
});

// ── the initial complexity band (classify) ──────────────────────────────────

check('classify() returns a band drawn from the policy bandScale', () => {
  const dials = {
    bandScale: ['low', 'mid', 'high'],
    classifier: { blastRadiusCutoffs: [2, 5], horizonCutoffs: [3], criticalityCutoffs: [2], autonomousPressure: 1, trustedRelief: 1 },
  };
  const band = classify(
    { blastRadius: 6, trustedSuiteCovers: false, criticality: 1, supervision: 'present-human', horizon: 1 },
    dials,
  );
  assert.ok(dials.bandScale.includes(band), `band ${JSON.stringify(band)} is a member of the scale`);
  assert.strictEqual(band, 'high'); // blastRadius 6 meets both cutoffs → riskUp 2 → scale[2]
});

// ── reconcile no longer degrades to empty: goal-level ordering lights up ─────

check('deriveConeOrder yields the goal order (non-empty routeOrder), cones empty until A2', () => {
  const { routeOrder, slices } = deriveConeOrder({ goals, atoms, weights: { unlocksCount: 1 } });
  assert.deepStrictEqual(routeOrder, ['g-1'], 'routeOrder is the declared goal order — NON-empty');
  assert.ok(slices.every((s) => s.woIds.length === 0), 'every cone is empty at genesis (A2 fills them)');
});

// ── the negative: no route.json exists, yet the whole genesis graph holds ────

check('NO route.json exists in the effort (retired), and the genesis graph is produced regardless', () => {
  assert.strictEqual(existsSync(join(root, '.reasonable', 'route.json')), false);
  assert.strictEqual(atoms.length, 3);
  assert.ok(edges.filter((e) => e.edge === 'needs').length > 0);
});

for (const d of tmps) { try { rmSync(d, { recursive: true, force: true }); } catch { /* best-effort cleanup */ } }

if (process.exitCode) console.error(`\ngenesis-graph: FAILURES above (${passed} passed).`);
else console.log(`\ngenesis-graph: all ${passed} checks pass. ✓`);
