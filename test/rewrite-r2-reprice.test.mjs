// test/rewrite-r2-reprice.test.mjs — locks R2 (ruleDeadEnd)'s sibling-reprice annotation, the audit
// follow-up finding from T02c: DESIGN-3.0 §7's R2 row says "siblings sharing citations reprice", but
// the shipped ruleDeadEnd never emitted a {reprice:{factor:'α'}} effect. See
// docs/superpowers/plans/2026-07-09-reasonable-3.0-p5-rewrite/tasks/T02d-r2-reprice-red.md for the
// supervisor's resolution of the "siblings" ambiguity: a DIRECT citer of the exact refuted clause
// ({component: premise.component, clause: premise.clause}) is a strict SUBSET of the wider,
// closure-based "intersecting atoms" (frozen) population — it gets BOTH frozen AND repriced. An atom
// that's only closure-adjacent (its footprint's citation closure touches the blast radius through
// some OTHER component) without directly citing the exact refuted clause gets frozen only.
//
// This is a fresh fixture, deliberately independent of test/rewrite-structural.test.mjs's existing R2
// fixture (which exercises the basic freeze path, not this reprice annotation) — do not merge or
// duplicate the two. Pure, zero-I/O — no filesystem.

import assert from 'node:assert';
import { computeVerdictEffects } from '../lib/rewrite.mjs';
import { validateEffects } from '../lib/effects.mjs';

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.stack || e.message}`); process.exitCode = 1; }
}

check('R2 reprices a sibling that directly cites the exact refuted clause, but only freezes a closure-adjacent non-citer', () => {
  const premise = { component: 'db', clause: 'db#c7', layer: 'contract' };
  const state = {
    atoms: [
      // the dying atom — cites the premise's exact clause, refuted.
      { id: 'b-1', component: 'core', state: "spec'd", deltaClauses: [{ clauseId: 'core#c1', citations: [{ component: 'db', clause: 'db#c7' }] }] },
      // a sibling that ALSO directly cites {component: premise.component, clause: premise.clause} —
      // must get BOTH frozen AND reprice.
      { id: 'b-2', component: 'sib', state: 'packed', deltaClauses: [{ clauseId: 'sib#c1', citations: [{ component: 'db', clause: 'db#c7' }] }] },
      // an atom whose citation CLOSURE touches the blast radius through an intermediate component
      // ('helper' cites 'db'), but whose own citation is to 'helper#c1', NOT the exact refuted
      // clause — must be frozen only, no reprice.
      { id: 'b-3', component: 'mid', state: 'packed', deltaClauses: [{ clauseId: 'mid#c1', citations: [{ component: 'helper', clause: 'helper#c1' }] }] },
    ],
    citationGraph: { core: ['db'], db: [], helper: ['db'], sib: ['db'], mid: ['helper'] },
  };
  const r = computeVerdictEffects({ kind: 'dead-end', atomId: 'b-1', premise }, state);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.route, 'amendment');

  // dying atom's own retirement effect — unchanged existing logic, always first.
  assert.deepStrictEqual(r.provisional[0], {
    nodeId: 'b-1',
    change: { state: 'retired-pending', premise, blastRadius: ['db'] },
  });

  // Per-node effect sets, extracted by nodeId (preserving each node's OWN relative order — a reprice
  // effect is a strict addition on top of the existing freeze logic, so it always comes after that
  // node's frozen effect, whether ruleDeadEnd emits it inline in the same loop iteration or in a
  // later second pass over the atoms). Cross-node interleaving is deliberately NOT pinned here — both
  // strategies are legal per the task file's green-side wording ("extend the existing freeze loop (or
  // add a second pass)").
  const effectsFor = (nodeId) => r.provisional.filter((e) => e.nodeId === nodeId).map((e) => e.change);

  assert.deepStrictEqual(effectsFor('b-2'), [
    { flag: 'frozen', op: 'set', reason: 'R2 blast radius' },
    { reprice: { factor: 'α' } },
  ]);
  assert.deepStrictEqual(effectsFor('b-3'), [
    { flag: 'frozen', op: 'set', reason: 'R2 blast radius' },
  ]);

  // No stray effects beyond the dying atom (1) + the sibling's two entries + the adjacent atom's one.
  assert.strictEqual(r.provisional.length, 4);

  // Permanent effects are untouched by this addition.
  assert.deepStrictEqual(r.permanent, [
    { nodeId: 'b-1', change: { state: 'retired', lineage: 'R2-gate' } },
    { nodeId: 'b-1/amend-0', change: { charter: { demandedBy: 'gate:R2', route: 'amendment' }, lineage: 'b-1' } },
  ]);

  assert.strictEqual(validateEffects([...r.provisional, ...r.permanent]).ok, true);
});

if (process.exitCode) console.error(`\nrewrite-r2-reprice: FAILURES above (${passed} passed).`);
else console.log(`\nrewrite-r2-reprice: all ${passed} checks pass. ✓`);
