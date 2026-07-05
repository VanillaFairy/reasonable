// Standalone test for lib/wo-status.mjs `foldWorkOrderStatuses` — node builtins only, no I/O.
// Run: node test/wo-status.test.mjs
//
// Pins §5.1 (F2, F8): a work order's status is the ledger fold — the SOURCE of truth — not a field
// read from journal.workOrders. Covers the five pinned statuses, resolvesSeq closure/restore, the
// reopen sibling, order-independence, the slice/phase non-minting guard, and the motivating incident
// (a WO present in the ledger but absent from the journal is visible again).

import assert from 'node:assert';
import { foldWorkOrderStatuses } from '../lib/wo-status.mjs';

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.stack || e.message}`); process.exitCode = 1; }
}

// A WO planned + dispatched under a slice, addressed the way the real pipeline stamps it.
const planned = (seq, node) => ({ seq, type: 'node-planned', node, kind: 'work-order', title: 'x' });
const dispatched = (seq, node, attempt = 1) => ({ seq, type: 'node-dispatched', node, kind: 'work-order', attempt });
const completed = (seq, node) => ({ seq, type: 'node-completed', node });
const failed = (seq, node, reason) => ({ seq, type: 'node-failed', node, ...(reason ? { reason } : {}) });

// ── the five statuses ──────────────────────────────────────────────────────────────────

check('dispatched with no terminal → running', () => {
  const f = foldWorkOrderStatuses([planned(1, 'S/WO-1'), dispatched(2, 'S/WO-1')]);
  assert.deepEqual(f.get('WO-1'), { status: 'running', lastSeq: 2 });
});

check('dispatched → completed → done', () => {
  const f = foldWorkOrderStatuses([planned(1, 'S/WO-1'), dispatched(2, 'S/WO-1'), completed(3, 'S/WO-1')]);
  assert.deepEqual(f.get('WO-1'), { status: 'done', lastSeq: 3 });
});

check('planned but never dispatched → pending', () => {
  const f = foldWorkOrderStatuses([planned(1, 'S/WO-1')]);
  assert.deepEqual(f.get('WO-1'), { status: 'pending', lastSeq: 1 });
});

check('failed with no later resolution → blocked (blockedBy names the node-failed seq)', () => {
  const f = foldWorkOrderStatuses([planned(1, 'S/WO-1'), dispatched(2, 'S/WO-1'), failed(3, 'S/WO-1', 'wall')]);
  assert.deepEqual(f.get('WO-1'), { status: 'blocked', lastSeq: 3, blockedBy: 3 });
});

check('a WO with no events at all is absent from the map', () => {
  const f = foldWorkOrderStatuses([planned(1, 'S/WO-1')]);
  assert.equal(f.has('WO-2'), false);
  assert.equal(f.size, 1);
});

// ── resolvesSeq closure / restore ────────────────────────────────────────────────────────

check('failed then ratification{resolvesSeq} with no later dispatch → pending (block cleared)', () => {
  const f = foldWorkOrderStatuses([
    planned(1, 'S/WO-1'), dispatched(2, 'S/WO-1'), failed(3, 'S/WO-1', 'wall'),
    { seq: 4, type: 'ratification', gate: 'retro', resolvesSeq: 3 },
  ]);
  assert.deepEqual(f.get('WO-1'), { status: 'pending', lastSeq: 4 });
});

check('failed then resolving amendment{resolvesSeq} then redispatch → running', () => {
  const f = foldWorkOrderStatuses([
    planned(1, 'S/WO-1'), dispatched(2, 'S/WO-1'), failed(3, 'S/WO-1', 'wall'),
    { seq: 4, type: 'amendment', component: 'c', resolvesSeq: 3 },
    dispatched(5, 'S/WO-1[2]', 2),
  ]);
  assert.deepEqual(f.get('WO-1'), { status: 'running', lastSeq: 5 });
});

check('a ratification whose resolvesSeq matches no blocked WO is a no-op (never invents a transition)', () => {
  const f = foldWorkOrderStatuses([
    planned(1, 'S/WO-1'), dispatched(2, 'S/WO-1'), failed(3, 'S/WO-1', 'wall'),
    { seq: 4, type: 'ratification', gate: 'retro', resolvesSeq: 99 }, // wrong seq
  ]);
  assert.deepEqual(f.get('WO-1'), { status: 'blocked', lastSeq: 3, blockedBy: 3 });
});

check('resolution matches ONLY by resolvesSeq, never by a coincidental workOrder-id mention', () => {
  // A ratification that names WO-1 but carries the WRONG resolvesSeq must NOT clear the block.
  const f = foldWorkOrderStatuses([
    planned(1, 'S/WO-1'), dispatched(2, 'S/WO-1'), failed(3, 'S/WO-1', 'wall'),
    { seq: 4, type: 'ratification', gate: 'retro', workOrder: 'WO-1', resolvesSeq: 2 },
  ]);
  assert.equal(f.get('WO-1').status, 'blocked');
});

// ── drop / restore ────────────────────────────────────────────────────────────────────────

check('amendment drops → dropped (droppedBy names the amendment seq)', () => {
  const f = foldWorkOrderStatuses([
    planned(1, 'S/WO-1'), dispatched(2, 'S/WO-1'),
    { seq: 3, type: 'amendment', component: 'c', drops: [{ workOrder: 'WO-1', supersededBy: 'WO-9' }] },
  ]);
  assert.deepEqual(f.get('WO-1'), { status: 'dropped', lastSeq: 3, droppedBy: 3 });
});

check('drop then restoring ratification{resolvesSeq} → not dropped (pending)', () => {
  const f = foldWorkOrderStatuses([
    planned(1, 'S/WO-1'), dispatched(2, 'S/WO-1'),
    { seq: 3, type: 'amendment', component: 'c', drops: [{ workOrder: 'WO-1' }] },
    { seq: 4, type: 'ratification', gate: 'retro', resolvesSeq: 3 },
  ]);
  assert.deepEqual(f.get('WO-1'), { status: 'pending', lastSeq: 4 });
});

check('a dropped WO that never appeared in a plan/dispatch is still known via the drop', () => {
  const f = foldWorkOrderStatuses([
    { seq: 1, type: 'amendment', component: 'c', drops: [{ workOrder: 'WO-orphan' }] },
  ]);
  assert.deepEqual(f.get('WO-orphan'), { status: 'dropped', lastSeq: 1, droppedBy: 1 });
});

// ── reopen / downgrade / cancel ─────────────────────────────────────────────────────────

check('reopen: node-failed then a later node-dispatched sibling → running', () => {
  const f = foldWorkOrderStatuses([
    planned(1, 'S/WO-1'), dispatched(2, 'S/WO-1'), failed(3, 'S/WO-1', 'wall'),
    dispatched(4, 'S/WO-1[2]', 2),
  ]);
  assert.deepEqual(f.get('WO-1'), { status: 'running', lastSeq: 4 });
});

check('node-downgraded (lost-work crash) → pending, awaiting redispatch', () => {
  const f = foldWorkOrderStatuses([
    planned(1, 'S/WO-1'), dispatched(2, 'S/WO-1'),
    { seq: 3, type: 'node-downgraded', node: 'S/WO-1', workOrder: 'WO-1' },
  ]);
  assert.deepEqual(f.get('WO-1'), { status: 'pending', lastSeq: 3 });
});

check('node-canceled stops running → pending baseline', () => {
  const f = foldWorkOrderStatuses([
    planned(1, 'S/WO-1'), dispatched(2, 'S/WO-1'),
    { seq: 3, type: 'node-canceled', node: 'S/WO-1', reason: 'route re-sort' },
  ]);
  assert.deepEqual(f.get('WO-1'), { status: 'pending', lastSeq: 3 });
});

// ── the incident shape ───────────────────────────────────────────────────────────────────

check('INCIDENT: a WO dispatched in the ledger (absent from the journal) folds to running — visible', () => {
  // Only the ledger — no journal at all. The fold still reports the live WO, so reconcile can
  // surface it instead of dropping it (the journal-only derivation made it invisible).
  const f = foldWorkOrderStatuses([planned(1, 'S/WO-ghost'), dispatched(2, 'S/WO-ghost')]);
  assert.deepEqual(f.get('WO-ghost'), { status: 'running', lastSeq: 2 });
});

// ── work-order vs container discrimination ───────────────────────────────────────────────

check('a node-completed for a SLICE / PHASE never mints a work order', () => {
  const f = foldWorkOrderStatuses([
    { seq: 1, type: 'node-planned', node: 'expr-eval', kind: 'slice', title: 'expr-eval' },
    { seq: 2, type: 'node-dispatched', node: 'expr-eval', kind: 'slice', attempt: 1 },
    { seq: 3, type: 'node-planned', node: 'expr-eval/WO-12', kind: 'work-order', title: 'p' },
    { seq: 4, type: 'node-dispatched', node: 'expr-eval/WO-12', kind: 'work-order', attempt: 1 },
    completed(5, 'expr-eval/WO-12'),
    completed(6, 'expr-eval'), // the slice completes — must NOT create a WO keyed 'expr-eval'
  ]);
  assert.equal(f.has('expr-eval'), false);
  assert.deepEqual(f.get('WO-12'), { status: 'done', lastSeq: 5 });
  assert.equal(f.size, 1);
});

// ── forward-compat: next-action is ignored ───────────────────────────────────────────────

check('next-action events are ignored entirely (Layer 2 projections, never status input)', () => {
  const f = foldWorkOrderStatuses([
    planned(1, 'S/WO-1'), dispatched(2, 'S/WO-1'),
    { seq: 3, type: 'next-action', workOrder: 'WO-1', action: 'whatever' },
  ]);
  assert.deepEqual(f.get('WO-1'), { status: 'running', lastSeq: 2 });
});

// ── order-independence ───────────────────────────────────────────────────────────────────

check('order-independence: a shuffled event array folds to the identical map', () => {
  const events = [
    planned(1, 'S/WO-1'), dispatched(2, 'S/WO-1'), failed(3, 'S/WO-1', 'wall'),
    { seq: 4, type: 'ratification', gate: 'retro', resolvesSeq: 3 }, dispatched(5, 'S/WO-1[2]', 2),
    planned(6, 'S/WO-2'), dispatched(7, 'S/WO-2'), completed(8, 'S/WO-2'),
    { seq: 9, type: 'amendment', component: 'c', drops: [{ workOrder: 'WO-3' }] },
  ];
  const inOrder = foldWorkOrderStatuses(events);
  const shuffled = foldWorkOrderStatuses([events[7], events[0], events[4], events[8], events[2], events[6], events[1], events[3], events[5]]);
  const norm = (m) => JSON.stringify([...m.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1));
  assert.equal(norm(shuffled), norm(inOrder));
  assert.deepEqual(inOrder.get('WO-1'), { status: 'running', lastSeq: 5 });
  assert.deepEqual(inOrder.get('WO-2'), { status: 'done', lastSeq: 8 });
  assert.deepEqual(inOrder.get('WO-3'), { status: 'dropped', lastSeq: 9, droppedBy: 9 });
});

// ── robustness ──────────────────────────────────────────────────────────────────────────

check('empty / null / non-array inputs fold to an empty map without throwing', () => {
  assert.equal(foldWorkOrderStatuses([]).size, 0);
  assert.equal(foldWorkOrderStatuses(null).size, 0);
  assert.equal(foldWorkOrderStatuses(undefined).size, 0);
});

check('garbage entries (null, non-objects) are skipped, not fatal', () => {
  const f = foldWorkOrderStatuses([null, 5, 'x', planned(1, 'S/WO-1'), dispatched(2, 'S/WO-1')]);
  assert.deepEqual(f.get('WO-1'), { status: 'running', lastSeq: 2 });
});

if (process.exitCode) console.error(`\nwo-status: FAILURES above (${passed} passed).`);
else console.log(`\nwo-status: all ${passed} checks passed. ✓`);
