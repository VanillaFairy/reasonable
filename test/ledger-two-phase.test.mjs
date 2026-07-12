// test/ledger-two-phase.test.mjs — the two-phase ratification fold (DESIGN-3.0 §7.2, §2.4; reasonable
// 3.0 Part 7, interfaces.md §2). "Pending permanence" is a FOLD over the ledger (every atom-verdict
// whose seq has no consuming ratification above it), never a mutable side-table — this file proves
// that by calling the fold twice and getting the identical answer. Real .reasonable/ effort, real
// append(), mirrors test/ledger-effects.test.mjs's harness verbatim.

import assert from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { validateEvent, append } from '../lib/ledger.mjs';
import { unwindCeremonyEscalation } from '../lib/rewrite.mjs';

const tmps = [];

function newEffort() {
  const root = mkdtempSync(join(tmpdir(), 'ledger-two-phase-test-'));
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

// ── schema shape ─────────────────────────────────────────────────────────────

check('validateEvent: ratifiesSeqs/rejectsSeqs, when present, must be arrays of positive integers', () => {
  assert.equal(validateEvent({ type: 'ratification', ratifiesSeqs: [1, 2] }).ok, true);
  assert.equal(validateEvent({ type: 'ratification', rejectsSeqs: [3] }).ok, true);
  assert.equal(validateEvent({ type: 'ratification', ratifiesSeqs: 'not-an-array' }).ok, false);
  assert.equal(validateEvent({ type: 'ratification', ratifiesSeqs: [0] }).ok, false);
  assert.equal(validateEvent({ type: 'ratification', ratifiesSeqs: [-1] }).ok, false);
  assert.equal(validateEvent({ type: 'ratification', ratifiesSeqs: [1.5] }).ok, false);
});

check('validateEvent: a plain ratification with neither field still validates (backward compat)', () => {
  assert.equal(validateEvent({ type: 'ratification' }).ok, true);
  assert.equal(validateEvent({ type: 'ratification', drops: [{ workOrder: 'WO-1' }] }).ok, true);
});

// ── the accept fold: reuses a REAL atom-verdict pendingPermanent ──────────────

check('append: ratification with ratifiesSeqs folds the referenced verdict\'s pendingPermanent verbatim', () => {
  const root = newEffort();
  seedLedger(root, [
    { seq: 1, type: 'atom-chartered', component: 'lexer', premises: [], purpose: 'x', locus: [], order: 0 },
    {
      seq: 2, type: 'atom-delta-authored', atomId: 'a-1',
      clauses: [
        { clauseId: 'lexer#c1', citations: [], demandedBy: null, locus: [] },
        { clauseId: 'lexer#c2', citations: [], demandedBy: 'goal:g1', locus: [] },
      ],
    },
  ]);
  const v = append(root, {
    type: 'atom-verdict', atomId: 'a-1', kind: 'ripple', manifest: [],
  });
  assert.equal(v.ok, true, v.error);
  assert.ok(v.event.pendingPermanent.length > 0, 'the ripple verdict produced a real pendingPermanent set');

  const r = append(root, { type: 'ratification', ratifiesSeqs: [v.event.seq] });
  assert.equal(r.ok, true, r.error);
  assert.deepStrictEqual(r.event.effects, v.event.pendingPermanent, 'the ratification folds the exact pendingPermanent set');
});

// ── the reject/unwind fold: seeded ceremony-escalation effect, unwound via the real pure inverse ──

check('append: ratification with rejectsSeqs unwinds a ceremony-escalation effect via unwindCeremonyEscalation', () => {
  const root = newEffort();
  const escalation = { nodeId: 'lexer', change: { band: 'full', from: 'lite', armed: ['deep-audit', 'scaffold-recheck', 'tighter-cadence'] } };
  seedLedger(root, [
    {
      seq: 1, type: 'atom-verdict', atomId: 'a-1', kind: 'ripple',
      manifest: [{ component: 'other', clause: 'other#c1', type: 'enrich' }],
      effects: [
        { nodeId: 'a-1', change: { flag: 'dispatch-barred', op: 'set', reason: 'R3 ripple' } },
        escalation,
      ],
      pendingPermanent: [{ nodeId: 'a-1', change: { flag: 'dispatch-barred', op: 'clear', reason: 'R3 amendment ratified' } }],
    },
  ]);

  const expectedUnwind = unwindCeremonyEscalation(escalation);
  const r = append(root, { type: 'ratification', rejectsSeqs: [1] });
  assert.equal(r.ok, true, r.error);
  assert.deepStrictEqual(r.event.effects, expectedUnwind, 'the ratification folds the exact unwind effects');
});

// ── both refs in one ratification: union ──────────────────────────────────────

check('append: a ratification naming both ratifiesSeqs and rejectsSeqs folds BOTH sets (union)', () => {
  const root = newEffort();
  const escalation = { nodeId: 'lexer', change: { band: 'full', from: 'lite', armed: ['deep-audit'] } };
  seedLedger(root, [
    { seq: 1, type: 'atom-chartered', component: 'lexer', premises: [], purpose: 'x', locus: [], order: 0 },
    {
      seq: 2, type: 'atom-verdict', atomId: 'a-1', kind: 'ripple', manifest: [],
      effects: [escalation], pendingPermanent: [{ nodeId: 'a-1', change: { flag: 'dispatch-barred', op: 'clear' } }],
    },
  ]);
  const r = append(root, { type: 'ratification', ratifiesSeqs: [2], rejectsSeqs: [2] });
  assert.equal(r.ok, true, r.error);
  const expected = [
    { nodeId: 'a-1', change: { flag: 'dispatch-barred', op: 'clear' } },
    ...unwindCeremonyEscalation(escalation),
  ];
  assert.deepStrictEqual(r.event.effects, expected);
});

// ── backward compatibility: no new fields, no change ──────────────────────────

check('append: a ratification with only drops/resolvesSeq behaves exactly as before (no effects field)', () => {
  const root = newEffort();
  const r = append(root, { type: 'ratification', drops: [{ workOrder: 'WO-1' }] });
  assert.equal(r.ok, true, r.error);
  assert.ok(!('effects' in r.event), 'no effects key appears when neither ratifiesSeqs nor rejectsSeqs is sent');
});

// ── the fold is derived, never a mutable side-table ───────────────────────────

check('append: calling the same ratification fold twice yields the identical effects both times', () => {
  const root = newEffort();
  seedLedger(root, [
    { seq: 1, type: 'atom-chartered', component: 'lexer', premises: [], purpose: 'x', locus: [], order: 0 },
    {
      seq: 2, type: 'atom-delta-authored', atomId: 'a-1',
      clauses: [
        { clauseId: 'lexer#c1', citations: [], demandedBy: null, locus: [] },
        { clauseId: 'lexer#c2', citations: [], demandedBy: 'goal:g1', locus: [] },
      ],
    },
  ]);
  const v = append(root, {
    type: 'atom-verdict', atomId: 'a-1', kind: 'ripple', manifest: [],
  });
  const r1 = append(root, { type: 'ratification', ratifiesSeqs: [v.event.seq] });
  const r2 = append(root, { type: 'ratification', ratifiesSeqs: [v.event.seq] });
  assert.equal(r1.ok, true, r1.error);
  assert.equal(r2.ok, true, r2.error);
  assert.deepStrictEqual(r1.event.effects, r2.event.effects, 'the fold re-derives identically — no consumed/mutated state');
});

for (const t of tmps) { try { rmSync(t, { recursive: true, force: true }); } catch { /* best effort */ } }

if (process.exitCode) console.error(`\nledger-two-phase: FAILURES above (${passed} passed).`);
else console.log(`\nledger-two-phase: all ${passed} checks passed. ✓`);
