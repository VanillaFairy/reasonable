// test/graph-projections.test.mjs — the as-lived vs. current graph projections (DESIGN-3.0 §2.4,
// reasonable 3.0 Part 4): foldAsLived (ledger-only, self-sufficient), deriveCurrent (ledger + live
// contracts), graphDivergence (the diff between them), plus lib/atom.mjs's two new additive
// exports (foldAtomFromEvents/foldAtomsFromEvents) that make foldAsLived's seq-bounded fold
// possible. Fixture pattern copied from test/atom-ledger.test.mjs's newEffort()/readLedgerLines().

import assert from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  charterAtom, transitionAtom, authorDelta, loadAtom, foldAtoms,
  foldAtomFromEvents, foldAtomsFromEvents,
} from '../lib/atom.mjs';
import { allocateClauseId } from '../lib/clause-id.mjs';
import { foldAsLived, deriveCurrent, graphDivergence } from '../lib/graph.mjs';

const tmps = [];
function newEffort() {
  const root = mkdtempSync(join(tmpdir(), 'graph-projections-test-'));
  tmps.push(root);
  mkdirSync(join(root, '.reasonable'), { recursive: true });
  return root;
}
function writeContract(root, component, body) {
  const dir = join(root, '.reasonable', 'contracts');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${component}.md`), body, 'utf8');
}
function readLedgerLines(root) {
  const p = join(root, '.reasonable', 'ledger.jsonl');
  if (!existsSync(p)) return [];
  return readFileSync(p, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => JSON.parse(l));
}
function driveToSpecd(root, component, { citations = [] } = {}) {
  const { id } = charterAtom(root, { component, premises: ['ledger:1'], purpose: 'test atom', locus: [], order: 0 });
  transitionAtom(root, id, 'ready');
  const alloc = allocateClauseId(root, component);
  authorDelta(root, id, [{ clauseId: alloc.clauseId, citations, demandedBy: null, locus: [] }]);
  return id;
}
function landedContractCitingAst(component) {
  return [
    '---',
    `component: ${component}`,
    '---',
    '',
    '## Clauses',
    '',
    `### ${component}#c1 An already-landed clause`,
    '- Cites: ast#c1',
    '- Demanded-by: goal:g1',
    '',
  ].join('\n');
}

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.stack || e.message}`); process.exitCode = 1; }
}

// ── lib/atom.mjs's two new exports ──────────────────────────────────────────

check('foldAtomFromEvents/foldAtomsFromEvents agree EXACTLY with loadAtom/foldAtoms over the same events', () => {
  const root = newEffort();
  const idA = driveToSpecd(root, 'lexer');
  driveToSpecd(root, 'ast');
  const events = readLedgerLines(root);

  assert.deepStrictEqual(foldAtomFromEvents(events, idA), loadAtom(root, idA));
  assert.deepStrictEqual(foldAtomsFromEvents(events), foldAtoms(root));
});

check('foldAtomFromEvents returns null for an id that was never chartered, matching loadAtom', () => {
  const root = newEffort();
  const events = readLedgerLines(root);
  assert.strictEqual(foldAtomFromEvents(events, 'a-99999'), null);
  assert.strictEqual(loadAtom(root, 'a-99999'), null);
});

// ── foldAsLived: self-sufficient, ledger-only ───────────────────────────────

check('foldAsLived computes a needs edge purely from ledger-embedded delta clauses, no contracts dir on disk', () => {
  const root = newEffort();
  const idB = driveToSpecd(root, 'ast');
  const bClauseId = loadAtom(root, idB).deltaClauses[0].clauseId;
  const idA = driveToSpecd(root, 'lexer', { citations: [{ component: 'ast', clause: bClauseId }] });

  assert.strictEqual(existsSync(join(root, '.reasonable', 'contracts')), false, 'sanity: no contracts dir at all');
  const { edges } = foldAsLived(root);
  assert.ok(edges.some((e) => e.from === idA && e.to === idB && e.edge === 'needs'));
});

check('foldAsLived at an earlier uptoSeq excludes atoms chartered after that seq', () => {
  const root = newEffort();
  const idA = driveToSpecd(root, 'lexer');
  const cutoffSeq = Math.max(...readLedgerLines(root).map((e) => e.seq));
  driveToSpecd(root, 'ast'); // chartered AFTER the cutoff

  const bounded = foldAsLived(root, { uptoSeq: cutoffSeq });
  assert.deepStrictEqual(bounded.atoms.map((a) => a.id), [idA]);

  const unbounded = foldAsLived(root);
  assert.strictEqual(unbounded.atoms.length, 2);
});

check('two atoms of the same component always exclude in the as-lived projection too', () => {
  const root = newEffort();
  const idA = driveToSpecd(root, 'lexer');
  const idB = driveToSpecd(root, 'lexer');
  const { edges } = foldAsLived(root);
  assert.ok(edges.some((e) => e.edge === 'excludes' && [e.from, e.to].sort().join() === [idA, idB].sort().join()));
});

// ── deriveCurrent: sees the REAL, live contract graph too ──────────────────

check('deriveCurrent sees a citation that exists ONLY in a landed, on-disk contract, which foldAsLived cannot', () => {
  const root = newEffort();
  const idLexer = driveToSpecd(root, 'lexer'); // its OWN tracked delta clause cites nothing
  const idAst = driveToSpecd(root, 'ast');
  writeContract(root, 'lexer', landedContractCitingAst('lexer'));

  const asLived = foldAsLived(root);
  const current = deriveCurrent(root);
  const hasExcludes = (edges) => edges.some((e) => e.edge === 'excludes'
    && [e.from, e.to].sort().join() === [idLexer, idAst].sort().join());

  assert.strictEqual(hasExcludes(asLived.edges), false, 'as-lived never sees the disk-only citation');
  assert.strictEqual(hasExcludes(current.edges), true, 'current sees it via the live contract file');
});

check('deriveCurrent returns no serves/informs edges when called with neither argument', () => {
  const root = newEffort();
  driveToSpecd(root, 'lexer');
  const { edges } = deriveCurrent(root);
  assert.ok(!edges.some((e) => e.edge === 'serves' || e.edge === 'informs'));
});

// ── graphDivergence ──────────────────────────────────────────────────────────

check('graphDivergence is EMPTY on an effort whose contracts were only ever touched through this ledger', () => {
  const root = newEffort();
  const idB = driveToSpecd(root, 'ast');
  const bClauseId = loadAtom(root, idB).deltaClauses[0].clauseId;
  driveToSpecd(root, 'lexer', { citations: [{ component: 'ast', clause: bClauseId }] });

  assert.deepStrictEqual(graphDivergence(root), {
    nodesOnlyAsLived: [], nodesOnlyCurrent: [], edgesOnlyAsLived: [], edgesOnlyCurrent: [],
  });
});

check('graphDivergence surfaces an excludes edge that exists in current but not as-lived (disk-only citation)', () => {
  const root = newEffort();
  const idLexer = driveToSpecd(root, 'lexer');
  const idAst = driveToSpecd(root, 'ast');
  writeContract(root, 'lexer', landedContractCitingAst('lexer'));

  const diff = graphDivergence(root);
  assert.deepStrictEqual(diff.nodesOnlyAsLived, []);
  assert.deepStrictEqual(diff.nodesOnlyCurrent, []);
  assert.deepStrictEqual(diff.edgesOnlyAsLived, []);
  assert.ok(diff.edgesOnlyCurrent.some((e) => e.edge === 'excludes'
    && [e.from, e.to].sort().join() === [idLexer, idAst].sort().join()));
});

// ── empty-effort baseline ───────────────────────────────────────────────────

check('foldAsLived/deriveCurrent/graphDivergence all handle an effort with no atoms at all', () => {
  const root = newEffort();
  assert.deepStrictEqual(foldAsLived(root).atoms, []);
  assert.deepStrictEqual(deriveCurrent(root).atoms, []);
  assert.deepStrictEqual(graphDivergence(root), {
    nodesOnlyAsLived: [], nodesOnlyCurrent: [], edgesOnlyAsLived: [], edgesOnlyCurrent: [],
  });
});

for (const d of tmps) {
  try { rmSync(d, { recursive: true, force: true }); }
  catch { /* best-effort cleanup */ }
}

if (process.exitCode) console.error(`\ngraph-projections: FAILURES above (${passed} passed).`);
else console.log(`\ngraph-projections: all ${passed} checks pass. ✓`);
