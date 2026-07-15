// test/atom-verdict-fold.test.mjs — the verdict/ratification EFFECTS OVERLAY inside
// foldAtomFromEvents (DESIGN-3.0 §7.2, §8; reasonable 3.0 Part 7/8). lib/ledger.mjs's append()
// already code-computes and stamps a real `.effects` array onto atom-verdict events (provisional)
// and onto ratification events (permanent, once ratifiesSeqs/rejectsSeqs resolve) — see
// test/ledger-atom-verdict.test.mjs and test/ledger-two-phase.test.mjs, which pin THAT side and are
// untouched here. Nothing today ever APPLIES those stamped effects to atom state/flags; that is the
// gap this file pins the correct fold-side behavior for.
//
// Two invariants dominate this file, per the task spec:
//   (1) addressing — an effect entry's own `nodeId` is the atom it targets, independent of the
//       carrying event's `atomId`/subject (DESIGN-3.0 §8: one verdict can enumerate one addressed
//       entry per affected atom, e.g. an R2 dead-end freezing a whole neighborhood of OTHER atoms).
//   (2) two-phase timing — a verdict's `.effects` (provisional) folds immediately; its
//       `.pendingPermanent` NEVER folds directly, only a LATER ratification event's own `.effects`
//       (which references the verdict) can move the permanent state (DESIGN-3.0 §7.2).
//
// Most checks below call foldAtomFromEvents directly on a plain in-memory events array — no
// filesystem needed, since the function takes only in-memory data. The `foldAsLived`/`deriveCurrent`
// and `append()` integration checks at the bottom use a real .reasonable/ledger.jsonl, per the
// shared harness convention (test/ledger-atom-verdict.test.mjs).

import assert from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { foldAtomFromEvents, charterAtom, loadAtom } from '../lib/atom.mjs';
import { append } from '../lib/ledger.mjs';
import { foldAsLived, deriveCurrent } from '../lib/graph.mjs';

const tmps = [];
function newEffort() {
  const root = mkdtempSync(join(tmpdir(), 'atom-verdict-fold-test-'));
  tmps.push(root);
  mkdirSync(join(root, '.reasonable'), { recursive: true });
  return root;
}
function seedLedger(root, events) {
  const body = events.map((e) => JSON.stringify(e)).join('\n') + (events.length ? '\n' : '');
  writeFileSync(join(root, '.reasonable', 'ledger.jsonl'), body);
}

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.stack || e.message}`); process.exitCode = 1; }
}

// ── (a) a provisional {state} node effect overlays onto the SUBJECT atom's own state ───────────

const checkpointEvents = [
  { seq: 1, type: 'atom-chartered', component: 'lexer', premises: [], purpose: 'x', locus: [], order: 0 },
  { seq: 2, type: 'atom-transitioned', atomId: 'a-1', from: 'chartered', to: 'ready' },
  { seq: 3, type: 'atom-transitioned', atomId: 'a-1', from: 'ready', to: "spec'd" },
  { seq: 4, type: 'atom-transitioned', atomId: 'a-1', from: "spec'd", to: 'packed' },
  { seq: 5, type: 'atom-transitioned', atomId: 'a-1', from: 'packed', to: 'tests-red' },
  {
    seq: 6, type: 'atom-verdict', atomId: 'a-1', kind: 'checkpoint',
    effects: [{ nodeId: 'a-1', change: { state: 'retired-pending', promotedFrom: 'checkpoint', evidence: '2nd exhaustion' } }],
  },
];

check("foldAtomFromEvents: a provisional {state} node effect on an 'atom-verdict' overlays onto the SUBJECT atom's own state", () => {
  const a1 = foldAtomFromEvents(checkpointEvents, 'a-1');
  assert.equal(
    a1.state, 'retired-pending',
    'the verdict\'s own state effect must fold in — today\'s switch has no "atom-verdict" case at all, '
    + 'so an un-overlaid fold leaves state at its pre-verdict value ("tests-red")',
  );
});

// ── (b) addressing: effects[].nodeId names the target, independent of the event's own atomId ───
// DESIGN-3.0 §8: one verdict event can carry entries addressed to OTHER atoms (an R2 dead-end
// provisionally freezing a whole blast-radius neighborhood).

const blastRadiusEvents = [
  { seq: 1, type: 'atom-chartered', component: 'lexer', premises: [], purpose: 'x', locus: [], order: 0 },
  { seq: 2, type: 'atom-chartered', component: 'parser', premises: [], purpose: 'y', locus: [], order: 0 },
  {
    seq: 3, type: 'atom-verdict', atomId: 'a-1', kind: 'dead-end',
    effects: [
      { nodeId: 'a-1', change: { state: 'retired-pending', premise: 'lexer#c1', blastRadius: ['a-2'] } },
      { nodeId: 'a-2', change: { flag: 'frozen', op: 'set', reason: 'R2 blast radius' } },
      { nodeId: 'a-2', change: { reprice: { factor: 'α' } } },
    ],
  },
];

check('foldAtomFromEvents: the SUBJECT atom (event.atomId) folds only the effect entry that actually names it', () => {
  const a1 = foldAtomFromEvents(blastRadiusEvents, 'a-1');
  assert.equal(a1.state, 'retired-pending');
  assert.ok(
    !a1.flags.has('frozen'),
    'the frozen-flag entry is addressed to a-2 (nodeId:"a-2"), not a-1 — an implementation that dumps '
    + 'the whole effects array onto the event\'s own atomId would wrongly leak this onto a-1',
  );
});

check('foldAtomFromEvents: an effect entry addressed to a DIFFERENT atom (nodeId !== event.atomId) still lands on that atom', () => {
  const a2 = foldAtomFromEvents(blastRadiusEvents, 'a-2');
  assert.ok(
    a2.flags.has('frozen'),
    'a-2 is named only in effects[].nodeId, never in the verdict event\'s own atomId ("a-1") — an '
    + 'implementation that skips events where e.atomId !== the folding atomId (today\'s existing guard) '
    + 'would never see this entry',
  );
  assert.equal(
    a2.state, 'chartered',
    'a-2 has no state-changing entry addressed to it (only its own reprice/flag entries) — it must stay '
    + 'at its chartered baseline, unaffected by a-1\'s own retired-pending entry',
  );
});

// ── (c) {flag,op} set/clear, off a NON-verdict event type — the overlay must be generic per the ──
// spec ("fold .effects off EVERY event type that carries it ... don't special-case by event type").

const flagGenericEvents = [
  { seq: 1, type: 'atom-chartered', component: 'lexer', premises: [], purpose: 'x', locus: [], order: 0 },
  { seq: 2, type: 'amendment', effects: [{ nodeId: 'a-1', change: { flag: 'guard-halted', op: 'set', reason: 'checkpoint 2' } }] },
];

check("foldAtomFromEvents: {flag,op:'set'} adds the named flag, even carried by a non-verdict event type ('amendment')", () => {
  const a1 = foldAtomFromEvents(flagGenericEvents, 'a-1');
  assert.ok(a1.flags.has('guard-halted'), 'the overlay must not be hardcoded to only look at atom-verdict/ratification events');
});

check("foldAtomFromEvents: {flag,op:'clear'} removes a previously-set flag", () => {
  // Sanity gate FIRST: if the flag were never actually set (e.g. the overlay is entirely absent),
  // "the flag is not present after a clear" would hold VACUOUSLY — that would prove nothing about
  // op:'clear' specifically. Asserting the pre-clear state here means this check can only pass once
  // set-then-clear both really happen, not merely "nothing happened at all".
  const beforeClear = foldAtomFromEvents(flagGenericEvents, 'a-1');
  assert.ok(beforeClear.flags.has('guard-halted'), 'sanity: the flag must already be set before the clear event — otherwise this check would pass vacuously');

  const withClear = [
    ...flagGenericEvents,
    { seq: 3, type: 'amendment', effects: [{ nodeId: 'a-1', change: { flag: 'guard-halted', op: 'clear' } }] },
  ];
  const a1 = foldAtomFromEvents(withClear, 'a-1');
  assert.ok(!a1.flags.has('guard-halted'), 'op:"clear" must remove the flag added by the earlier op:"set" entry');
});

// ── (d) the two-phase rule: provisional folds now; pendingPermanent NEVER folds directly — only a ──
// LATER ratification event's own .effects (already computed by lib/ledger.mjs, unchanged/out of
// scope here) can move state/flags to the permanent value.

const deadEndVerdictOnly = [
  { seq: 1, type: 'atom-chartered', component: 'lexer', premises: [], purpose: 'x', locus: [], order: 0 },
  {
    seq: 2, type: 'atom-verdict', atomId: 'a-1', kind: 'dead-end',
    effects: [{ nodeId: 'a-1', change: { state: 'retired-pending', premise: 'lexer#c1', blastRadius: [] } }],
    pendingPermanent: [{ nodeId: 'a-1', change: { state: 'retired', lineage: 'R2-gate' } }],
  },
];

check('foldAtomFromEvents: a verdict\'s pendingPermanent state NEVER folds directly, before any ratification exists', () => {
  const a1 = foldAtomFromEvents(deadEndVerdictOnly, 'a-1');
  assert.equal(a1.state, 'retired-pending', 'the provisional effect must land');
  assert.notEqual(a1.state, 'retired', 'pendingPermanent must never be read off the verdict event directly');
});

check('foldAtomFromEvents: re-folding the identical, still-unratified ledger a second time still never surfaces the permanent state', () => {
  const first = foldAtomFromEvents(deadEndVerdictOnly, 'a-1');
  const second = foldAtomFromEvents(deadEndVerdictOnly, 'a-1');
  assert.equal(first.state, 'retired-pending');
  assert.equal(second.state, 'retired-pending', 'folding again (simulating time passing with no ratification ever appended) must not change the answer');
});

check('foldAtomFromEvents: once a LATER ratification event carries its OWN effects folding the permanent state, the state moves', () => {
  const ratified = [
    ...deadEndVerdictOnly,
    { seq: 3, type: 'ratification', ratifiesSeqs: [2], effects: [{ nodeId: 'a-1', change: { state: 'retired', lineage: 'R2-gate' } }] },
  ];
  const a1 = foldAtomFromEvents(ratified, 'a-1');
  assert.equal(a1.state, 'retired', 'the ratification\'s own .effects (not the verdict\'s pendingPermanent) is what actually moves state');
});

const rippleVerdictOnly = [
  { seq: 1, type: 'atom-chartered', component: 'lexer', premises: [], purpose: 'x', locus: [], order: 0 },
  {
    seq: 2, type: 'atom-verdict', atomId: 'a-1', kind: 'ripple', manifest: [],
    effects: [{ nodeId: 'a-1', change: { flag: 'dispatch-barred', op: 'set', reason: 'R3 ripple' } }],
    pendingPermanent: [{ nodeId: 'a-1', change: { flag: 'dispatch-barred', op: 'clear', reason: 'R3 amendment ratified' } }],
  },
];

check('foldAtomFromEvents: the same two-phase rule holds for flags — a dispatch-barred SET (provisional) holds until ratified', () => {
  const a1 = foldAtomFromEvents(rippleVerdictOnly, 'a-1');
  assert.ok(a1.flags.has('dispatch-barred'), 'the provisional SET must land');
});

check('foldAtomFromEvents: a LATER ratification\'s own effects can CLEAR a flag set by an earlier verdict\'s provisional effect', () => {
  // Sanity gate FIRST, same reasoning as the plain set/clear check above: if the provisional SET
  // never actually landed, "the flag is absent after the ratification" would hold VACUOUSLY (nothing
  // was ever there to clear) and this check would prove nothing about the ratification's own effects.
  const beforeRatify = foldAtomFromEvents(rippleVerdictOnly, 'a-1');
  assert.ok(beforeRatify.flags.has('dispatch-barred'), 'sanity: the provisional SET must have landed before ratification — otherwise this check would pass vacuously');

  const ratified = [
    ...rippleVerdictOnly,
    { seq: 3, type: 'ratification', ratifiesSeqs: [2], effects: [{ nodeId: 'a-1', change: { flag: 'dispatch-barred', op: 'clear', reason: 'R3 amendment ratified' } }] },
  ];
  const a1 = foldAtomFromEvents(ratified, 'a-1');
  assert.ok(!a1.flags.has('dispatch-barred'), 'the ratification\'s own effects (never pendingPermanent read directly) is what clears the flag');
});

// ── (e) isolation: non-state/non-flag change shapes must never touch atom state/flags ──────────

const staleSpecEvents = [
  { seq: 1, type: 'atom-chartered', component: 'lexer', premises: [], purpose: 'x', locus: [], order: 0 },
  { seq: 2, type: 'atom-chartered', component: 'other', premises: [], purpose: 'y', locus: [], order: 0 },
  {
    seq: 3, type: 'atom-verdict', atomId: 'a-1', kind: 'stale-spec',
    effects: [
      { nodeId: 'a-1', change: { state: 'ready', staleDelta: true } },
      { from: 'a-1', to: 'a-2', edge: 'excludes', op: 'add' },
    ],
  },
];

check('foldAtomFromEvents: a same-event EDGE effect ({from,to,edge,op}) does not crash the fold and never touches atom state/flags', () => {
  assert.doesNotThrow(() => foldAtomFromEvents(staleSpecEvents, 'a-1'));
  assert.doesNotThrow(() => foldAtomFromEvents(staleSpecEvents, 'a-2'));
  const a1 = foldAtomFromEvents(staleSpecEvents, 'a-1');
  const a2 = foldAtomFromEvents(staleSpecEvents, 'a-2');
  assert.equal(a1.state, 'ready', 'the co-located NODE effect (nodeId:"a-1") still applies normally');
  assert.equal(a1.flags.size, 0);
  assert.equal(a2.state, 'chartered', 'an edge effect has no nodeId/change — it must never be mistaken for a node effect touching a-2');
  assert.equal(a2.flags.size, 0);
});

const repriceOnlyEvents = [
  { seq: 1, type: 'atom-chartered', component: 'lexer', premises: [], purpose: 'x', locus: [], order: 0 },
  { seq: 2, type: 'atom-transitioned', atomId: 'a-1', from: 'chartered', to: 'ready' },
  { seq: 3, type: 'atom-verdict', atomId: 'a-1', kind: 'dead-end', effects: [{ nodeId: 'a-1', change: { reprice: { factor: 'α' } } }] },
];

check('foldAtomFromEvents: a node effect whose change carries neither state nor flag (a bare reprice) leaves state/flags untouched', () => {
  const a1 = foldAtomFromEvents(repriceOnlyEvents, 'a-1');
  assert.equal(a1.state, 'ready', 'state must remain whatever the prior atom-transitioned event set — reprice is not a lifecycle fact');
  assert.equal(a1.flags.size, 0);
});

const birthEvents = [
  { seq: 1, type: 'atom-chartered', component: 'lexer', premises: [], purpose: 'x', locus: [], order: 0 },
  {
    seq: 2, type: 'atom-verdict', atomId: 'a-1', kind: 'oversized',
    effects: [
      { nodeId: 'a-1', change: { state: 'retired-pending', supersededBy: 'partition' } },
      { nodeId: 'a-1/sub-0', change: { charter: { clauses: [] }, lineage: 'a-1', dispatchFree: true } },
    ],
  },
];

check('foldAtomFromEvents: a charter/"birth" node effect (an R4 split\'s sub-atom) does not crash the fold and does not change the parent\'s state/flags', () => {
  const parent = foldAtomFromEvents(birthEvents, 'a-1');
  assert.equal(parent.state, 'retired-pending', 'the parent\'s own state entry still applies');
  assert.equal(parent.flags.size, 0, 'the birth entry addresses a-1/sub-0, not a-1 — it must not leak a flag onto the parent');
  assert.doesNotThrow(
    () => foldAtomFromEvents(birthEvents, 'a-1/sub-0'),
    'folding the id named only inside a birth effect (never an actual atom-chartered event) must not throw — '
    + 'materializing the birth as a real atom is explicitly out of scope for this task',
  );
});

// ── purity: no side effects, no hidden mutable state ────────────────────────────────────────────

check('foldAtomFromEvents: is pure — folding the identical events array twice yields identical state and flags', () => {
  const events = [
    { seq: 1, type: 'atom-chartered', component: 'lexer', premises: [], purpose: 'x', locus: [], order: 0 },
    { seq: 2, type: 'atom-verdict', atomId: 'a-1', kind: 'ripple', manifest: [], effects: [{ nodeId: 'a-1', change: { flag: 'dispatch-barred', op: 'set', reason: 'r' } }] },
  ];
  const first = foldAtomFromEvents(events, 'a-1');
  const second = foldAtomFromEvents(events, 'a-1');
  assert.equal(first.state, second.state);
  assert.deepStrictEqual([...first.flags].sort(), [...second.flags].sort());
});

// ── (f) both graph projections (lib/graph.mjs) reflect the overlay via the SAME fold — no ───────
// double-implementation. Real .reasonable/ledger.jsonl, matching the shared harness convention.

function seedBlastRadiusLedger(root) {
  seedLedger(root, [
    { seq: 1, type: 'atom-chartered', component: 'lexer', premises: [], purpose: 'x', locus: [], order: 0 },
    { seq: 2, type: 'atom-chartered', component: 'parser', premises: [], purpose: 'y', locus: [], order: 0 },
    {
      seq: 3, type: 'atom-verdict', atomId: 'a-1', kind: 'dead-end',
      effects: [
        { nodeId: 'a-1', change: { state: 'retired-pending', premise: 'lexer#c1', blastRadius: ['a-2'] } },
        { nodeId: 'a-2', change: { flag: 'frozen', op: 'set', reason: 'R2 blast radius' } },
      ],
    },
  ]);
}

check('foldAsLived: the effects overlay is reflected through the ledger-only projection (addressing across atoms)', () => {
  const root = newEffort();
  seedBlastRadiusLedger(root);
  const { atoms } = foldAsLived(root);
  const a1 = atoms.find((a) => a.id === 'a-1');
  const a2 = atoms.find((a) => a.id === 'a-2');
  assert.equal(a1.state, 'retired-pending');
  assert.ok(a2.flags.has('frozen'), 'a-2 must carry the frozen flag even though the verdict event\'s own atomId is a-1');
  assert.equal(a2.state, 'chartered', 'a-2 has no state-changing effect addressed to it');
});

check('deriveCurrent: the SAME overlay is reflected through the live projection — proves the fold is shared, not duplicated', () => {
  const root = newEffort();
  seedBlastRadiusLedger(root);
  const { atoms } = deriveCurrent(root, { goals: [] });
  const a1 = atoms.find((a) => a.id === 'a-1');
  const a2 = atoms.find((a) => a.id === 'a-2');
  assert.equal(a1.state, 'retired-pending');
  assert.ok(a2.flags.has('frozen'), 'a-2 must carry the frozen flag even though the verdict event\'s own atomId is a-1');
  assert.equal(a2.state, 'chartered');
});

// ── integration: the REAL append() stamping composes with the fold-side overlay end to end ─────

check('integration: real append() code-computes a checkpoint\'s provisional effect; loadAtom folds it in (chartered -> ready)', () => {
  const root = newEffort();
  const charter = charterAtom(root, { component: 'lexer', premises: [], purpose: 'tokenize', locus: [], order: 0 });
  assert.equal(charter.ok, true, charter.error);

  const before = loadAtom(root, charter.id);
  assert.equal(before.state, 'chartered', 'sanity: a freshly chartered atom starts in the chartered state');

  const v = append(root, { type: 'atom-verdict', atomId: charter.id, kind: 'checkpoint', evidence: 'budget exhausted' });
  assert.equal(v.ok, true, v.error);
  assert.equal(v.event.effects.length, 1);
  assert.equal(v.event.effects[0].nodeId, charter.id);
  assert.equal(v.event.effects[0].change.state, 'ready', 'sanity: this is the REAL code-computed R1-checkpoint effect from lib/rewrite.mjs, not invented by this test');

  const after = loadAtom(root, charter.id);
  assert.equal(after.state, 'ready', 'loadAtom (which folds via foldAtomFromEvents) must reflect the verdict\'s provisional state effect once the overlay exists');
});

for (const t of tmps) { try { rmSync(t, { recursive: true, force: true }); } catch { /* best effort */ } }

if (process.exitCode) console.error(`\natom-verdict-fold: FAILURES above (${passed} passed).`);
else console.log(`\natom-verdict-fold: all ${passed} checks passed. ✓`);
