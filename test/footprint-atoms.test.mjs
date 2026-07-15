// test/footprint-atoms.test.mjs — lib/footprint.mjs's `--atoms` CLI mode: footprints computed
// from REAL spec'd ledger atoms (never a work-order JSON file), reasonable 3.0 A2 Task 2. Exercises
// lib/graph.mjs's newly-EXPORTED atomFootprint end-to-end through the CLI (child process, mirroring
// test/footprint-disjoint.test.mjs's execFileSync pattern), and confirms lib/frontier.mjs's pack()
// packs the disjoint pair and defers the collider from those SAME footprints. Effort-fixture pattern
// and makeClause() copied from test/atom-ledger.test.mjs.

import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { charterAtom, transitionAtom, authorDelta } from '../lib/atom.mjs';
import { allocateClauseId } from '../lib/clause-id.mjs';
import { pack } from '../lib/frontier.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const footprintCli = join(here, '..', 'lib', 'footprint.mjs');

const tmps = [];
function newEffort() {
  const root = mkdtempSync(join(tmpdir(), 'footprint-atoms-test-'));
  tmps.push(root);
  mkdirSync(join(root, '.reasonable'), { recursive: true });
  return root;
}

function makeClause(root, component, { citations = [], demandedBy = null, locus = [] } = {}) {
  const alloc = allocateClauseId(root, component);
  return { clauseId: alloc.clauseId, citations, demandedBy, locus };
}

/** Charter -> ready -> authorDelta ONE atom in `component`, spec'd with a single delta clause
 *  carrying `locus` and `citations` (the shape atomFootprint reads). Returns the minted atom id. */
function specAtom(root, component, { locus, citations = [] }) {
  const { id } = charterAtom(root, {
    component, premises: ['ledger:1'], purpose: `${component} atom`, locus: [], order: 0,
  });
  transitionAtom(root, id, 'ready');
  const clause = makeClause(root, component, { citations, locus, demandedBy: 'goal:g1' });
  authorDelta(root, id, [clause]);
  return id;
}

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.stack || e.message}`); process.exitCode = 1; }
}

check("--atoms --json reports one footprint per spec'd atom (contracts = citation CLOSURE) and flags the collision", () => {
  const root = newEffort();

  // Two disjoint atoms: distinct loci, distinct cited components.
  const idLexer = specAtom(root, 'lexer', {
    locus: ['lib/lexer/**'],
    citations: [{ component: 'shared-util', clause: 'shared-util#c1' }],
  });
  const idParser = specAtom(root, 'parser', {
    locus: ['lib/parser/**'],
    citations: [{ component: 'io-util', clause: 'io-util#c1' }],
  });
  // A third atom that COLLIDES with idLexer: shares the cited component (shared-util), distinct locus.
  const idAst = specAtom(root, 'ast', {
    locus: ['lib/ast/**'],
    citations: [{ component: 'shared-util', clause: 'shared-util#c9' }],
  });

  const out = execFileSync(
    process.execPath, [footprintCli, '--atoms', '--root', root, '--json'],
    { encoding: 'utf8' },
  );
  const parsed = JSON.parse(out);

  assert.ok(Array.isArray(parsed.footprints), 'footprints is an array');
  assert.ok(Array.isArray(parsed.independence), 'independence is an array');
  assert.strictEqual(parsed.footprints.length, 3, "one footprint per spec'd atom");

  const byId = Object.fromEntries(parsed.footprints.map((f) => [f.id, f]));
  assert.deepStrictEqual(new Set(Object.keys(byId)), new Set([idLexer, idParser, idAst]));

  assert.deepStrictEqual(byId[idLexer].locus, ['lib/lexer/**']);
  assert.ok(
    byId[idLexer].contracts.includes('shared-util'),
    'contracts carries the citation CLOSURE, not the raw cites list',
  );
  assert.ok(
    byId[idLexer].contracts.includes('lexer'),
    "contracts folds in the atom's OWN component — the fact that discriminates a closure from a raw cites list",
  );
  assert.deepStrictEqual(byId[idLexer].resources, []);

  const collision = parsed.independence.find((p) =>
    [p.a, p.b].sort().join() === [idLexer, idAst].sort().join());
  assert.ok(collision, 'the lexer/ast pair must appear in the independence report');
  assert.strictEqual(collision.ok, false, 'sharing the shared-util contract makes them non-independent');

  const disjointPair = parsed.independence.find((p) =>
    [p.a, p.b].sort().join() === [idLexer, idParser].sort().join());
  assert.ok(disjointPair, 'the lexer/parser pair must appear in the independence report');
  assert.strictEqual(disjointPair.ok, true, 'distinct loci + distinct cited components are independent');

  // Feeding these SAME footprints into pack() packs the two disjoint atoms and defers the collider.
  const { wave, deferred } = pack(parsed.footprints);
  assert.ok(wave.includes(idLexer), 'idLexer is packed');
  assert.ok(wave.includes(idParser), 'idParser is packed (disjoint from idLexer)');
  assert.ok(deferred.includes(idAst), 'idAst is deferred (collides with the already-packed idLexer)');
});

for (const d of tmps) {
  try { rmSync(d, { recursive: true, force: true }); }
  catch { /* best-effort cleanup */ }
}

if (process.exitCode) console.error(`\nfootprint-atoms: FAILURES above (${passed} passed).`);
else console.log(`\nfootprint-atoms: all ${passed} checks pass. ✓`);
