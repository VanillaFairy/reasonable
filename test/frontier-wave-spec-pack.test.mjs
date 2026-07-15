// test/frontier-wave-spec-pack.test.mjs — the A2 ACCEPTANCE test (A2 plan Task 7): the real path a
// vertical-slice wave actually walks, end to end, over a throwaway ledger-backed effort — not a
// restatement of any one lib's unit tests. Three atoms are chartered -> readied -> spec'd (real
// authorDelta calls, real allocateClauseId-minted clause ids), a real goals.json is written citing
// two of their OWN minted clause ids, and the three payoffs A2 promised over A1 are exercised
// together, in the order a live effort would hit them:
//
//   1. serves edges are NON-EMPTY (lib/graph.mjs's deriveCurrent + lib/goals.mjs's readGoals) — at
//      A1 this was structurally empty because serves needs spec-time delta clauses, which A1 had no
//      path to create.
//   2. footprint + pack (lib/graph.mjs's exported atomFootprint + lib/frontier.mjs's pack) group the
//      two locus-disjoint atoms into one wave and defer the locus-colliding third atom.
//   3. the planned -> actual refinement: enriching a spec'd atom's delta with a cross-atom citation
//      (lib/atom.mjs's enrichDelta) turns into a real ACTUAL needs edge — and a fourth atom left
//      merely CHARTERED, carrying a `cite:` premise, contributes only a PLANNED needs edge alongside
//      it, so the same graph carries both fidelities at once without conflating them.
//
// Fixture pattern (temp effort factory, check(name, fn) harness, makeClause helper) copied from
// test/atom-ledger.test.mjs and test/footprint-atoms.test.mjs.

import assert from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { charterAtom, transitionAtom, authorDelta, enrichDelta, loadAtom } from '../lib/atom.mjs';
import { allocateClauseId } from '../lib/clause-id.mjs';
import { deriveCurrent, atomFootprint } from '../lib/graph.mjs';
import { readGoals } from '../lib/goals.mjs';
import { pack } from '../lib/frontier.mjs';

const tmps = [];
function newEffort() {
  const root = mkdtempSync(join(tmpdir(), 'frontier-wave-spec-pack-test-'));
  tmps.push(root);
  mkdirSync(join(root, '.reasonable'), { recursive: true });
  return root;
}

function makeClause(root, component, { citations = [], demandedBy = null, locus = [] } = {}) {
  const alloc = allocateClauseId(root, component);
  assert.strictEqual(alloc.ok, true, alloc.error);
  return { clauseId: alloc.clauseId, citations, demandedBy, locus };
}

/** Charter -> ready ONE atom in `component`. Returns the minted atom id. */
function charterReady(root, component) {
  const r = charterAtom(root, {
    component, premises: ['ledger:1'], purpose: `${component} atom`, locus: [], order: 0,
  });
  assert.strictEqual(r.ok, true, r.error);
  const t = transitionAtom(root, r.id, 'ready');
  assert.strictEqual(t.ok, true, t.error);
  return r.id;
}

function edgesFrom(edges, atomId, edgeKind) {
  return edges.filter((e) => e.from === atomId && e.edge === edgeKind);
}
function hasEdge(edges, from, to, edge) {
  return edges.some((e) => e.from === from && e.to === to && e.edge === edge);
}

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.stack || e.message}`); process.exitCode = 1; }
}

check('a live wave: serves populates, footprint+pack groups the disjoint pair, delta-enrichment turns a planned dependency into an actual needs edge', () => {
  const root = newEffort();

  // ── charter -> ready three atoms ──────────────────────────────────────────
  const aA = charterReady(root, 'lexer');
  const aB = charterReady(root, 'parser');
  const aC = charterReady(root, 'emitter');

  // ── spec them: authorDelta with real, allocated clause ids ───────────────
  const aAClause = makeClause(root, 'lexer', { locus: ['lib/lexer/**'], demandedBy: 'goal:goal-1' });
  const aAClauseId = aAClause.clauseId;
  const specA = authorDelta(root, aA, [aAClause]);
  assert.strictEqual(specA.ok, true, specA.error);

  const bClause = makeClause(root, 'parser', { locus: ['lib/parser/**'], demandedBy: 'goal:goal-1' });
  const bClauseId = bClause.clauseId;
  const specB = authorDelta(root, aB, [bClause]);
  assert.strictEqual(specB.ok, true, specB.error);

  // a-C's delta locus COLLIDES with a-A's (same glob) even though it's a distinct component.
  const cClause = makeClause(root, 'emitter', { locus: ['lib/lexer/**'], demandedBy: 'goal:goal-1' });
  const specC = authorDelta(root, aC, [cClause]);
  assert.strictEqual(specC.ok, true, specC.error);

  // ── goals.json citing a-A's and a-B's OWN minted clause ids ───────────────
  writeFileSync(join(root, '.reasonable', 'goals.json'), JSON.stringify([{
    id: 'goal-1',
    scenario: 'Lexing feeds parsing end to end.',
    scenarioCitations: [
      { component: 'lexer', clause: aAClauseId },
      { component: 'parser', clause: bClauseId },
    ],
  }], null, 2));

  const { goals, diagnostic } = readGoals(root);
  assert.strictEqual(diagnostic, null, diagnostic);
  assert.strictEqual(goals.length, 1);

  // ── 1. serves edges: the A2 payoff, empty at A1 ───────────────────────────
  const g1 = deriveCurrent(root, { goals });
  assert.ok(
    hasEdge(g1.edges, aA, 'goal-1', 'serves'),
    'a-A must serve goal-1 — its OWN minted clause id is directly cited by scenarioCitations',
  );
  assert.ok(
    hasEdge(g1.edges, aB, 'goal-1', 'serves'),
    'a-B must serve goal-1 — its OWN minted clause id is directly cited by scenarioCitations',
  );
  const servesEdgesOnly = g1.edges.filter((e) => e.edge === 'serves');
  assert.strictEqual(servesEdgesOnly.length, 2, 'exactly a-A and a-B serve — a-C is cited by nobody');
  assert.ok(
    !servesEdgesOnly.some((e) => e.from === aC),
    'a-C must NOT serve goal-1 — a discriminator: a broken servesEdges that serves every spec\'d atom would fail this',
  );

  // ── 2. footprint + pack: the disjoint pair packs, the locus-collider defers ─
  const footprints = [aA, aB, aC].map((id) => {
    const atom = loadAtom(root, id);
    return { id, ...atomFootprint(atom, {}) };
  });
  const { wave, deferred } = pack(footprints);
  assert.ok(wave.includes(aA), 'a-A is packed');
  assert.ok(wave.includes(aB), 'a-B is packed (disjoint locus from a-A)');
  assert.ok(!wave.includes(aC), 'a-C is NOT packed — a discriminator against a pack that ignores locus collisions');
  assert.ok(deferred.includes(aC), 'a-C is deferred — locus collision with the already-packed a-A');
  assert.ok(!deferred.includes(aA) && !deferred.includes(aB), 'the disjoint pair is never deferred');

  // ── sanity: BEFORE enrichment a-A has no needs edge at all ────────────────
  const beforeEnrich = deriveCurrent(root, { goals });
  assert.strictEqual(
    edgesFrom(beforeEnrich.edges, aA, 'needs').length, 0,
    'a-A cites nothing cross-atom yet — no needs edge should exist before the delta-enrichment below',
  );

  // ── 3. planned -> actual refinement: enrich a-A's delta with a citation to a-B's clause ──
  const toPacked = transitionAtom(root, aA, 'packed');
  assert.strictEqual(toPacked.ok, true, toPacked.error);
  const enrichClause = makeClause(root, 'lexer', {
    citations: [{ component: 'parser', clause: bClauseId }],
    demandedBy: 'goal:goal-1',
    locus: [],
  });
  const enriched = enrichDelta(root, aA, enrichClause);
  assert.strictEqual(enriched.ok, true, enriched.error);

  const afterEnrich = deriveCurrent(root, { goals });
  assert.ok(
    hasEdge(afterEnrich.edges, aA, aB, 'needs'),
    'the ACTUAL needs edge a-A -> a-B must appear, derived from the delta citation just enriched in',
  );
  const aANeedsAfter = edgesFrom(afterEnrich.edges, aA, 'needs');
  assert.strictEqual(
    aANeedsAfter.length, 1,
    'a-A (spec\'d) must have EXACTLY the one needs edge sourced from its delta citation — not a duplicate planned edge',
  );

  // ── 4. a fourth, CHARTERED-not-spec'd atom with a `cite:` premise still contributes a
  //        PLANNED needs edge, coexisting with a-A's ACTUAL one in the SAME graph ──────────
  const aDCharter = charterAtom(root, {
    component: 'cli', premises: ['cite:parser#c1'], purpose: 'cli atom', locus: [], order: 0,
  });
  assert.strictEqual(aDCharter.ok, true, aDCharter.error);
  const aD = aDCharter.id;
  // a-D is deliberately left CHARTERED — never transitioned, never spec'd.

  const finalGraph = deriveCurrent(root, { goals });
  assert.ok(
    hasEdge(finalGraph.edges, aD, aB, 'needs'),
    'a-D (chartered-only, cite:parser#c1 premise) must contribute a PLANNED needs edge to a-B (the parser atom)',
  );
  const aANeedsFinal = edgesFrom(finalGraph.edges, aA, 'needs');
  assert.strictEqual(
    aANeedsFinal.length, 1,
    'a-A\'s (spec\'d) needs must STILL come only from its own delta citation — a-D\'s charter never leaks into it',
  );
});

for (const d of tmps) {
  try { rmSync(d, { recursive: true, force: true }); }
  catch { /* best-effort cleanup */ }
}

if (process.exitCode) console.error(`\nfrontier-wave-spec-pack: FAILURES above (${passed} passed).`);
else console.log(`\nfrontier-wave-spec-pack: all ${passed} checks pass. ✓`);
