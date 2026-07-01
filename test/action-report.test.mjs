// Standalone test for lib/action-report.mjs — node builtins only (no runner).
// Run: node test/action-report.test.mjs

import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { reportAction } from '../lib/action-report.mjs';

const LIB = join(dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'action-report.mjs');
const tmps = [];

function newEffort() {
  const root = mkdtempSync(join(tmpdir(), 'action-report-test-'));
  tmps.push(root);
  mkdirSync(join(root, '.reasonable'), { recursive: true });
  writeFileSync(join(root, '.reasonable', 'journal.json'), JSON.stringify({
    effort: 'demo', currentVerticalSlice: 's',
    workOrders: { 'WO-1': { status: 'dispatched', role: 'implementer', verticalSlice: 's' } },
  }));
  return root;
}

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.stack || e.message}`); process.exitCode = 1; }
}

check('reportAction: a valid section-started call appends + regenerates the mirror', () => {
  const root = newEffort();
  const result = reportAction(root, 'started', { workOrder: 'WO-1', level: 'section', label: 'implementation' });
  assert.deepEqual(result, { ok: true });
  const ledger = readFileSync(join(root, '.reasonable', 'ledger.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(ledger.length, 1);
  assert.equal(ledger[0].type, 'action-started');
  assert.equal(ledger[0].level, 'section');
  assert.equal(ledger[0].label, 'implementation');
  assert.ok(existsSync(join(root, '.reasonable', 'progress.md')), 'mirror regenerated');
});

check('reportAction: an invalid call (missing label) is rejected, nothing appended', () => {
  const root = newEffort();
  const result = reportAction(root, 'started', { workOrder: 'WO-1', level: 'section' });
  assert.equal(result.ok, false);
  assert.match(result.error, /label/);
  assert.ok(!existsSync(join(root, '.reasonable', 'ledger.jsonl')), 'no partial append on validation failure');
});

check('reportAction: an unknown verb is rejected', () => {
  const root = newEffort();
  const result = reportAction(root, 'teleported', { workOrder: 'WO-1', level: 'section', label: 'x' });
  assert.equal(result.ok, false);
  assert.match(result.error, /unknown verb/);
});

check('CLI: a valid item-started call over the command line appends and exits 0', () => {
  const root = newEffort();
  execFileSync('node', [
    LIB, '--root', root, '--workOrder', 'WO-1',
    '--level', 'item', '--kind', 'clause', '--ref', '§4', '--label', 'precedence handling', 'started',
  ], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 15000 });
  const ledger = readFileSync(join(root, '.reasonable', 'ledger.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(ledger.length, 1);
  assert.equal(ledger[0].kind, 'clause');
  assert.equal(ledger[0].ref, '§4');
});

check('CLI: fails loud (non-zero exit, stderr message) on a malformed call', () => {
  const root = newEffort();
  assert.throws(() => {
    execFileSync('node', [
      LIB, '--root', root, '--workOrder', 'WO-1', '--level', 'item', '--kind', 'adhoc', '--ref', 'HAS SPACE', 'started',
    ], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 15000 });
  }, /Command failed/);
  assert.ok(!existsSync(join(root, '.reasonable', 'ledger.jsonl')), 'no partial append on a failed CLI call');
});

check('CLI: an obsoleted call requires --reason', () => {
  const root = newEffort();
  assert.throws(() => {
    execFileSync('node', [
      LIB, '--root', root, '--workOrder', 'WO-1', '--level', 'item', '--kind', 'clause', '--ref', '§4', 'obsoleted',
    ], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 15000 });
  });
});

for (const t of tmps) { try { rmSync(t, { recursive: true, force: true }); } catch { /* best effort */ } }

if (process.exitCode) console.error(`\naction-report: FAILURES above (${passed} passed).`);
else console.log(`\naction-report: all ${passed} checks passed. ✓`);
