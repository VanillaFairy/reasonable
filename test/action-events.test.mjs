// Standalone test for lib/action-events.mjs — node builtins only (no runner).
// Run: node test/action-events.test.mjs

import assert from 'node:assert';
import { LEVELS, KINDS, EVENT_TYPES, STAGE_ITEM_CATALOG, validateActionEvent } from '../lib/action-events.mjs';

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.stack || e.message}`); process.exitCode = 1; }
}

check('vocabulary: the three event types, two levels, three kinds', () => {
  assert.deepEqual(EVENT_TYPES, ['action-started', 'action-finished', 'action-obsoleted']);
  assert.deepEqual(LEVELS, ['section', 'item']);
  assert.deepEqual(KINDS, ['clause', 'step', 'adhoc']);
});

check("STAGE_ITEM_CATALOG: the auditor's four fixed steps", () => {
  assert.deepEqual(STAGE_ITEM_CATALOG.audit, ['discriminator-check', 'bidirectional-mapping', 'mutation-sampling', 'proportionality-review']);
});

check('validateActionEvent: a section requires workOrder + label, nothing else', () => {
  assert.deepEqual(validateActionEvent('action-started', { workOrder: 'WO-1', level: 'section', label: 'implementation' }), { ok: true });
  assert.equal(validateActionEvent('action-started', { workOrder: 'WO-1', level: 'section' }).ok, false, 'missing label');
  assert.equal(validateActionEvent('action-started', { level: 'section', label: 'x' }).ok, false, 'missing workOrder');
});

check('validateActionEvent: an item requires kind + ref', () => {
  assert.deepEqual(validateActionEvent('action-started', { workOrder: 'WO-1', level: 'item', kind: 'clause', ref: '§4' }), { ok: true });
  assert.equal(validateActionEvent('action-started', { workOrder: 'WO-1', level: 'item', ref: '§4' }).ok, false, 'missing kind');
  assert.equal(validateActionEvent('action-started', { workOrder: 'WO-1', level: 'item', kind: 'clause' }).ok, false, 'missing ref');
  assert.equal(validateActionEvent('action-started', { workOrder: 'WO-1', level: 'item', kind: 'bogus', ref: 'x' }).ok, false, 'unknown kind');
});

check('validateActionEvent: an adhoc ref must be a lowercase kebab-slug', () => {
  assert.equal(validateActionEvent('action-started', { workOrder: 'WO-1', level: 'item', kind: 'adhoc', ref: 'extract-helper' }).ok, true);
  assert.equal(validateActionEvent('action-started', { workOrder: 'WO-1', level: 'item', kind: 'adhoc', ref: '42' }).ok, false, 'bare number rejected');
  assert.equal(validateActionEvent('action-started', { workOrder: 'WO-1', level: 'item', kind: 'adhoc', ref: 'has space' }).ok, false, 'whitespace rejected');
  assert.equal(validateActionEvent('action-started', { workOrder: 'WO-1', level: 'item', kind: 'adhoc', ref: 'Upper' }).ok, false, 'uppercase rejected');
  assert.equal(validateActionEvent('action-started', { workOrder: 'WO-1', level: 'item', kind: 'adhoc', ref: 'red-1' }).ok, true, 'a trailing numeric segment is fine');
});

check('validateActionEvent: a clause/step ref is exempt from the adhoc slug shape', () => {
  assert.equal(validateActionEvent('action-started', { workOrder: 'WO-1', level: 'item', kind: 'clause', ref: '§4' }).ok, true);
  assert.equal(validateActionEvent('action-started', { workOrder: 'WO-1', level: 'item', kind: 'step', ref: 'discriminator-check' }).ok, true);
});

check('validateActionEvent: action-obsoleted requires a reason', () => {
  assert.equal(validateActionEvent('action-obsoleted', { workOrder: 'WO-1', level: 'item', kind: 'clause', ref: '§4' }).ok, false, 'missing reason');
  assert.equal(validateActionEvent('action-obsoleted', { workOrder: 'WO-1', level: 'item', kind: 'clause', ref: '§4', reason: 'covered by §3' }).ok, true);
});

check('validateActionEvent: rejects an unknown event type', () => {
  assert.equal(validateActionEvent('action-teleported', { workOrder: 'WO-1', level: 'section', label: 'x' }).ok, false);
});

if (process.exitCode) console.error(`\naction-events: FAILURES above (${passed} passed).`);
else console.log(`\naction-events: all ${passed} checks passed. ✓`);
