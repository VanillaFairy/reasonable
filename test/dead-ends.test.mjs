// dead-ends.test.mjs — pin lib/dead-ends.mjs, the pure ledger fold behind the
// briefing's deadEnds set (retirement semantics: a dead-ended work-order id is
// never re-proposed in-band; docs/roadmap/dead-end-blast-radius.md). The binding
// predicate mirrors lib/redispatch-guard.mjs EXACTLY: a first-class `dead-end`
// event, or a `verdict` kind:"infeasible" that survived the skeptic.
// Run: node test/dead-ends.test.mjs

import assert from 'node:assert';
import { deadEndSet } from '../lib/dead-ends.mjs';

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.message}`); process.exitCode = 1; }
}

check('a first-class dead-end event binds', () => {
  const out = deadEndSet([
    { seq: 3, type: 'dead-end', workOrder: 'WO-X', hash: 'sha256:aa' },
  ]);
  assert.deepStrictEqual(out, [{ workOrder: 'WO-X', ledgerSeq: 3, hash: 'sha256:aa' }]);
});

check('a refutation-surviving infeasible verdict binds; a non-surviving one does not', () => {
  const out = deadEndSet([
    { seq: 4, type: 'verdict', kind: 'infeasible', survivedSkeptic: true, workOrder: 'WO-A' },
    { seq: 5, type: 'verdict', kind: 'infeasible', workOrder: 'WO-B' }, // no skeptic survival
  ]);
  assert.deepStrictEqual(out, [{ workOrder: 'WO-A', ledgerSeq: 4, hash: null }]);
});

check('unrelated event types never bind', () => {
  const out = deadEndSet([
    { seq: 1, type: 'enrichment', component: 'c', workOrder: 'WO-A' },
    { seq: 2, type: 'verdict', kind: 'green', workOrder: 'WO-A' },
    { seq: 3, type: 'node-failed', workOrder: 'WO-A' }, // recoverable, not a dead end
  ]);
  assert.deepStrictEqual(out, []);
});

check('latest binding event per work order wins (one entry, newest seq + hash)', () => {
  const out = deadEndSet([
    { seq: 2, type: 'dead-end', workOrder: 'WO-X', hash: 'sha256:old' },
    { seq: 7, type: 'dead-end', workOrder: 'WO-X', hash: 'sha256:new' },
  ]);
  assert.deepStrictEqual(out, [{ workOrder: 'WO-X', ledgerSeq: 7, hash: 'sha256:new' }]);
});

check('a later green verdict does NOT clear the entry (conservative; only a merge excludes, and the caller does that)', () => {
  const out = deadEndSet([
    { seq: 2, type: 'dead-end', workOrder: 'WO-X', hash: null },
    { seq: 9, type: 'verdict', kind: 'green', workOrder: 'WO-X' },
  ]);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].workOrder, 'WO-X');
});

check('empty/garbage-safe: null lines, missing workOrder, no ledger', () => {
  assert.deepStrictEqual(deadEndSet([]), []);
  assert.deepStrictEqual(deadEndSet(null), []);
  assert.deepStrictEqual(deadEndSet([null, {}, { type: 'dead-end' }]), []); // no workOrder -> skip
});

if (process.exitCode) console.error(`\ndead-ends: FAILURES above (${passed} passed).`);
else console.log(`\ndead-ends: all ${passed} checks pass. ✓`);
