// test/frontier-wave-lifecycle.test.mjs — the A3b-i ACCEPTANCE test (A3b-i plan Task 4): proves the
// COMPOSITION of real, already-merged pieces — lib/atom.mjs's charter/transition/authorDelta I/O
// surface, lib/ledger.mjs's real append() (which code-computes an atom-verdict's effects via
// lib/rewrite.mjs), and lib/atom.mjs's foldAtomFromEvents effects overlay (also exercised through
// lib/graph.mjs's deriveCurrent projection) — reach exactly the shape Task 3b's Collect stage would
// produce. This file does NOT invoke the frontier-wave workflow itself (that needs a real agent
// runtime, out of scope for a unit test); it manually drives real ledger calls in the exact sequence
// Collect's verdict-writer dispatches would make, then asserts the ledger-backed state lands where
// the workflow's own stub-harness tests (Task 3) already assume it does.
//
// Fixture pattern (temp effort factory, charterReady/makeClause helpers, sync check(name, fn)
// harness) copied from test/frontier-wave-spec-pack.test.mjs; the real-append()-then-loadAtom
// integration idiom copied from test/atom-verdict-fold.test.mjs.

import assert from 'node:assert';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { charterAtom, transitionAtom, authorDelta, loadAtom } from '../lib/atom.mjs';
import { allocateClauseId } from '../lib/clause-id.mjs';
import { deriveCurrent } from '../lib/graph.mjs';
import { append } from '../lib/ledger.mjs';

const tmps = [];
function newEffort() {
  const root = mkdtempSync(join(tmpdir(), 'frontier-wave-lifecycle-test-'));
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

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.stack || e.message}`); process.exitCode = 1; }
}

check('a real ledger-backed effort: one atom rides the full lifecycle to audited via real atom-transitioned events, a second atom\'s real R1 checkpoint verdict folds to ready, a third atom\'s real R3 ripple verdict folds a dispatch-barred flag', () => {
  const root = newEffort();

  // ── atom A: the full lifecycle — chartered -> ready -> spec'd -> packed -> tests-red -> green ──
  // -> audited. authorDelta's own atom-delta-authored event is what carries ready -> spec'd (it is
  // NOT a plain atom-transitioned move — see LIFECYCLE_TRANSITIONS, which has no "spec'd" entry
  // under 'ready'); every step after that is a real transitionAtom call, which appends exactly the
  // {type:'atom-transitioned', atomId, from, to} shape Task 3b's Collect stage's verdict-writer
  // dispatches construct.
  const aA = charterReady(root, 'lexer');
  const clauseA = makeClause(root, 'lexer', { locus: ['lib/lexer/**'] });
  const specA = authorDelta(root, aA, [clauseA]);
  assert.strictEqual(specA.ok, true, specA.error);

  for (const to of ['packed', 'tests-red', 'green', 'audited']) {
    const t = transitionAtom(root, aA, to);
    assert.strictEqual(t.ok, true, t.error);
  }

  assert.strictEqual(
    loadAtom(root, aA).state, 'audited',
    'loadAtom must fold the whole real atom-transitioned chain through to audited',
  );
  const g1 = deriveCurrent(root, { goals: [] });
  const gA = g1.atoms.find((a) => a.id === aA);
  assert.ok(gA, 'atom A must appear in the deriveCurrent projection');
  assert.strictEqual(
    gA.state, 'audited',
    'deriveCurrent (the live projection) must agree with loadAtom (both fold via the same foldAtomFromEvents)',
  );

  // ── atom B: a DIFFERENT atom, parked at packed, takes a real R1 checkpoint verdict ──────────────
  // ruleCheckpoint (lib/rewrite.mjs): the FIRST checkpoint against a given atom is a plain retry —
  // it transitions the atom back to 'ready' (only a SECOND independent exhaustion promotes to
  // retired-pending). This is a real, code-computed effect — append() calls computeVerdictEffects
  // itself; nothing here invents the effect shape.
  const aB = charterReady(root, 'parser');
  const clauseB = makeClause(root, 'parser', { locus: ['lib/parser/**'] });
  const specB = authorDelta(root, aB, [clauseB]);
  assert.strictEqual(specB.ok, true, specB.error);
  const toPackedB = transitionAtom(root, aB, 'packed');
  assert.strictEqual(toPackedB.ok, true, toPackedB.error);

  const checkpointVerdict = append(root, {
    type: 'atom-verdict', atomId: aB, kind: 'checkpoint', evidence: 'budget exhausted mid-pack',
  });
  assert.strictEqual(checkpointVerdict.ok, true, checkpointVerdict.error);
  assert.strictEqual(
    checkpointVerdict.event.effects.length, 1,
    'sanity: a first checkpoint on a fresh atom code-computes exactly one provisional effect',
  );
  assert.strictEqual(checkpointVerdict.event.effects[0].nodeId, aB);
  assert.strictEqual(
    checkpointVerdict.event.effects[0].change.state, 'ready',
    'sanity: this is the REAL code-computed R1 plain-retry effect from lib/rewrite.mjs\'s ruleCheckpoint, not invented by this test',
  );

  assert.strictEqual(
    loadAtom(root, aB).state, 'ready',
    'loadAtom must fold the checkpoint verdict\'s provisional {state:"ready"} effect (R1 plain retry) onto atom B',
  );

  // ── atom C: a THIRD atom takes a real R3 ripple verdict ──────────────────────────────────────
  // ruleRipple (lib/rewrite.mjs) reads manifest[].component (the field lib/rewrite.mjs actually
  // expects — the implementer's earlier draft used `contract`, renamed to `component` per Task 3's
  // fix) and unconditionally sets a dispatch-barred flag on the SUBJECT atom as its first provisional
  // effect, regardless of the atom's current lifecycle state.
  const aC = charterReady(root, 'emitter');

  const rippleVerdict = append(root, {
    type: 'atom-verdict',
    atomId: aC,
    kind: 'ripple',
    manifest: [{ component: 'other', clause: 'other#c1', type: 'enrich' }],
  });
  assert.strictEqual(rippleVerdict.ok, true, rippleVerdict.error);
  assert.strictEqual(rippleVerdict.event.effects[0].nodeId, aC);
  assert.deepStrictEqual(
    rippleVerdict.event.effects[0].change,
    { flag: 'dispatch-barred', op: 'set', reason: 'R3 ripple' },
    'sanity: this is the REAL code-computed R3 provisional effect from lib/rewrite.mjs\'s ruleRipple — the atom\'s own '
    + 'dispatch-barred flag, unconditional and rename-independent (it does not itself read manifest[].component); '
    + 'the rename is verified separately below, against the manifest-loop entry that actually reads that field',
  );

  const afterRipple = loadAtom(root, aC);
  assert.ok(
    afterRipple.flags.has('dispatch-barred'),
    'loadAtom must fold the ripple verdict\'s provisional {flag:"dispatch-barred", op:"set"} effect onto atom C',
  );

  // The manifest loop's own entry (effects[1], not effects[0]) is what actually reads
  // manifest[].component: no atom in this effort owns clause 'other#c1', and the manifest entry's
  // type is 'enrich', so ruleRipple's else-if branch fires, building a synthetic foreign-component
  // node addressed as `${atomId}/foreign-${m.component}` with `change.charter.component: m.component`.
  // Both the synthetic node id AND the charter's component field are built FROM manifest[].component
  // — under the m.contract bug (manifest carries no `contract` key) both would instead read
  // "${aC}/foreign-undefined" / undefined. This is the assertion that actually discriminates the
  // rename; effects[0]/the dispatch-barred flag above cannot, since it never reads that field.
  const foreignEntry = rippleVerdict.event.effects.find((e) => e.nodeId !== aC);
  assert.ok(
    foreignEntry,
    'the ripple verdict must carry a second effect entry from the manifest loop, addressed to a synthetic foreign-component node',
  );
  assert.strictEqual(
    foreignEntry.nodeId, `${aC}/foreign-other`,
    'the synthetic node id must be built from manifest[].component ("other") — under an m.contract bug this would read '
    + `"${aC}/foreign-undefined" instead, since the manifest entry carries no 'contract' key`,
  );
  assert.strictEqual(
    foreignEntry.change.charter.component, 'other',
    'the foreign charter-intent\'s own component field must be built from manifest[].component, not manifest[].contract',
  );
});

for (const d of tmps) {
  try { rmSync(d, { recursive: true, force: true }); }
  catch { /* best-effort cleanup */ }
}

if (process.exitCode) console.error(`\nfrontier-wave-lifecycle: FAILURES above (${passed} passed).`);
else console.log(`\nfrontier-wave-lifecycle: all ${passed} checks pass. ✓`);
