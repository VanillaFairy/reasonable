// trust-staleness.test.mjs — pin lib/trust-staleness.mjs (D13). Trust is earned,
// persistent, EVENT-invalidated: a trusted-green test is re-verified only when its
// governing clause is amended or extended SINCE that test's last verification — never
// on a churn schedule. This logic was extracted verbatim from reconcile.mjs (which had
// it as a private, untested function) so it has a home and a test. reconcile.mjs threads
// the derived flat staleTrusted id list into the briefing. Run: node test/trust-staleness.test.mjs

import assert from 'node:assert';
import { trustStaleness } from '../lib/trust-staleness.mjs';

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.message}`); process.exitCode = 1; }
}

// A green verdict names test T under A §1, then A §1 is amended AFTER it → T is stale.
check('a clause amended after its test was verified marks the test stale', () => {
  const ledger = [
    { seq: 1, type: 'verdict', kind: 'green', component: 'evaluator', clause: '§1', test: 'eval_add_test' },
    { seq: 2, type: 'amendment', component: 'evaluator', clause: '§1' },
  ];
  const { staleTests, staleClauses } = trustStaleness(ledger);
  assert.strictEqual(staleTests.length, 1, 'exactly one stale test');
  assert.strictEqual(staleTests[0].test, 'eval_add_test');
  assert.strictEqual(staleTests[0].component, 'evaluator');
  assert.strictEqual(staleTests[0].clause, '§1');
  assert.strictEqual(staleTests[0].verifiedAtSeq, 1);
  assert.strictEqual(staleTests[0].invalidatedAtSeq, 2);
  assert.strictEqual(staleTests[0].by, 'amendment');
  assert.deepStrictEqual(staleClauses, ['evaluator §1']);
});

// The event ORDER is what matters: a clause amended BEFORE the test's verification is
// already accounted for by that verification — not stale.
check('a clause amended before its test was verified is NOT stale', () => {
  const ledger = [
    { seq: 1, type: 'amendment', component: 'evaluator', clause: '§1' },
    { seq: 2, type: 'verdict', kind: 'green', component: 'evaluator', clause: '§1', test: 'eval_add_test' },
  ];
  const { staleTests } = trustStaleness(ledger);
  assert.strictEqual(staleTests.length, 0, 'verification post-dates the amend → current');
});

// An enrichment (behavior extended) invalidates just like an amendment.
check('an enrichment on the governing clause invalidates the test', () => {
  const ledger = [
    { seq: 1, type: 'verdict', kind: 'green', component: 'parser', clause: '§3', test: 'parse_test' },
    { seq: 2, type: 'enrichment', component: 'parser', clause: '§3' },
  ];
  const { staleTests } = trustStaleness(ledger);
  assert.strictEqual(staleTests.length, 1);
  assert.strictEqual(staleTests[0].by, 'enrichment');
});

// A verification that names no clause cannot be mapped to a change → skipped, never
// a phantom stale entry.
check('a green verification with no clause is skipped (no clause to invalidate)', () => {
  const ledger = [
    { seq: 1, type: 'verdict', kind: 'green', component: 'parser', test: 'parse_test' },
    { seq: 2, type: 'amendment', component: 'parser', clause: '§3' },
  ];
  const { staleTests } = trustStaleness(ledger);
  assert.strictEqual(staleTests.length, 0);
});

// A characterization-promotion counts as a green verification (brownfield floor pin).
check('a characterization-promotion is a green verification', () => {
  const ledger = [
    { seq: 1, type: 'characterization-promotion', component: 'legacy', clause: '§2', test: 'legacy_char_test' },
    { seq: 2, type: 'amendment', component: 'legacy', clause: '§2' },
  ];
  const { staleTests } = trustStaleness(ledger);
  assert.strictEqual(staleTests.length, 1);
  assert.strictEqual(staleTests[0].test, 'legacy_char_test');
});

// The MOST RECENT verification wins: a re-verify after the amend makes the test current
// again (trust re-earned).
check('a re-verification after the amend clears staleness (trust re-earned)', () => {
  const ledger = [
    { seq: 1, type: 'verdict', kind: 'green', component: 'evaluator', clause: '§1', test: 'eval_add_test' },
    { seq: 2, type: 'amendment', component: 'evaluator', clause: '§1' },
    { seq: 3, type: 'verdict', kind: 'green', component: 'evaluator', clause: '§1', test: 'eval_add_test' },
  ];
  const { staleTests } = trustStaleness(ledger);
  assert.strictEqual(staleTests.length, 0, 'seq-3 re-verify post-dates the seq-2 amend');
});

// A non-green verdict does not earn trust, so it cannot become stale (nothing to invalidate).
check('a non-green verdict does not count as a verification', () => {
  const ledger = [
    { seq: 1, type: 'verdict', kind: 'red', component: 'evaluator', clause: '§1', test: 'eval_add_test' },
    { seq: 2, type: 'amendment', component: 'evaluator', clause: '§1' },
  ];
  const { staleTests } = trustStaleness(ledger);
  assert.strictEqual(staleTests.length, 0);
});

if (process.exitCode) console.error(`\ntrust-staleness: FAILURES above (${passed} passed).`);
else console.log(`\ntrust-staleness: all ${passed} checks pass. ✓`);
