// test/redispatch-guard.test.mjs — the insanity guard (DESIGN §5.8; §5.6 / F12).
// Run: node test/redispatch-guard.test.mjs
//
// Pins the redispatch-guard's blocking predicate after T0.5. The guard now binds on THREE event
// shapes and stays CLEAR otherwise (exit 2 = blocked, 0 = clear):
//   (KEPT)  a refutation-surviving dead-end / verdict(infeasible, survivedSkeptic) whose `hash` still
//           matches the WO's current inputs — Defect B, in lockstep with dead-ends.mjs.
//   (NEW)   an UNRESOLVED blocking-class node-failed — a node-failed carrying a NON-EMPTY `reason`
//           (a reason-less node-failed is the schema's recoverable / "under investigation" transient
//           case and never binds).
//   (NEW)   an UNRESOLVED amendment drop for the WO (amendment.drops[].workOrder === id).
// Closure of the two NEW bindings is by `resolvesSeq` — the SAME rule lib/wo-status.mjs's
// blocked/dropped fold uses: a later ratification/amendment whose resolvesSeq equals the blocking
// event's own seq closes it, never a coincidental id mention.

import assert from 'node:assert';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const LIB = join(dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'redispatch-guard.mjs');
const tmps = [];

// A minimal effort: a work-order spec file (so the guard can hash its inputs) + a seeded ledger.
// The guard needs neither config.json nor journal.json.
function newEffort(id, wo, ledgerLines) {
  const root = mkdtempSync(join(tmpdir(), 'redispatch-'));
  tmps.push(root);
  mkdirSync(join(root, '.reasonable', 'work-orders'), { recursive: true });
  writeFileSync(join(root, '.reasonable', 'work-orders', `${id}.json`), JSON.stringify(wo) + '\n');
  writeFileSync(
    join(root, '.reasonable', 'ledger.jsonl'),
    ledgerLines.map((e) => JSON.stringify(e)).join('\n') + (ledgerLines.length ? '\n' : ''),
  );
  return root;
}

function run(root, id) {
  return spawnSync(process.execPath, [LIB, id, '--root', root], { encoding: 'utf8', timeout: 15000 });
}

// The WO's input hash as the guard computes it: sha256 of (gate + spec + contract texts). With a bare
// { gate } spec (no inputs.spec, no contracts), it collapses to sha256(gate).
const gateHash = (gate) => 'sha256:' + createHash('sha256').update(gate).digest('hex');

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.stack || e.message}`); process.exitCode = 1; }
}

// ── (KEPT) dead-end / verdict binding — Defect B, must still fire ──────────────────────────────

check('KEPT: a dead-end whose hash matches the WO inputs blocks re-dispatch (exit 2)', () => {
  const gate = 'ship the widget';
  const root = newEffort('WO-1', { gate }, [
    { seq: 1, type: 'dead-end', workOrder: 'WO-1', hash: gateHash(gate) },
  ]);
  const r = run(root, 'WO-1');
  assert.equal(r.status, 2, `expected BLOCKED; stderr=${r.stderr} stdout=${r.stdout}`);
});

check('KEPT: a verdict(infeasible, survivedSkeptic) whose hash matches also blocks (exit 2)', () => {
  const gate = 'ship the widget';
  const root = newEffort('WO-1', { gate }, [
    { seq: 1, type: 'verdict', kind: 'infeasible', survivedSkeptic: true, workOrder: 'WO-1', hash: gateHash(gate) },
  ]);
  const r = run(root, 'WO-1');
  assert.equal(r.status, 2, `expected BLOCKED; stderr=${r.stderr} stdout=${r.stdout}`);
});

check('KEPT: a dead-end whose hash no longer matches (inputs changed) is CLEAR (exit 0)', () => {
  const root = newEffort('WO-1', { gate: 'NEW gate' }, [
    { seq: 1, type: 'dead-end', workOrder: 'WO-1', hash: gateHash('OLD gate') }, // stale hash
  ]);
  const r = run(root, 'WO-1');
  assert.equal(r.status, 0, `expected CLEAR (inputs changed un-binds); stderr=${r.stderr}`);
});

// ── (NEW) blocking-class node-failed binding ──────────────────────────────────────────────────

check('NEW: an unresolved blocking node-failed (with a reason) blocks re-dispatch (exit 2)', () => {
  const root = newEffort('WO-1', { gate: 'g' }, [
    { seq: 1, type: 'node-planned', node: 's1/WO-1', kind: 'work-order', title: 'x' },
    { seq: 2, type: 'node-dispatched', node: 's1/WO-1', kind: 'work-order', attempt: 1 },
    { seq: 3, type: 'node-failed', workOrder: 'WO-1', node: 's1/WO-1', reason: 'binding constraint' },
  ]);
  const r = run(root, 'WO-1');
  assert.equal(r.status, 2, `expected BLOCKED on the open failure; stderr=${r.stderr} stdout=${r.stdout}`);
});

check('NEW: a node-failed closed by a later ratification{resolvesSeq} is CLEAR (exit 0)', () => {
  const root = newEffort('WO-1', { gate: 'g' }, [
    { seq: 1, type: 'node-planned', node: 's1/WO-1', kind: 'work-order', title: 'x' },
    { seq: 2, type: 'node-dispatched', node: 's1/WO-1', kind: 'work-order', attempt: 1 },
    { seq: 3, type: 'node-failed', workOrder: 'WO-1', node: 's1/WO-1', reason: 'wall' },
    { seq: 4, type: 'ratification', gate: 'retro', resolvesSeq: 3 }, // closes seq 3
  ]);
  const r = run(root, 'WO-1');
  assert.equal(r.status, 0, `a resolvesSeq-closed failure must clear; stderr=${r.stderr}`);
});

check('NEW: a REASON-LESS node-failed is transient (recoverable) and never binds (exit 0)', () => {
  // The blocking-class discriminator: reason-less = the schema's "recoverable / under investigation"
  // case. It must NOT block re-dispatch (only a reason-bearing wall does).
  const root = newEffort('WO-1', { gate: 'g' }, [
    { seq: 1, type: 'node-planned', node: 's1/WO-1', kind: 'work-order', title: 'x' },
    { seq: 2, type: 'node-dispatched', node: 's1/WO-1', kind: 'work-order', attempt: 1 },
    { seq: 3, type: 'node-failed', workOrder: 'WO-1', node: 's1/WO-1' }, // no reason
  ]);
  const r = run(root, 'WO-1');
  assert.equal(r.status, 0, `a reason-less node-failed is transient and must not block; stderr=${r.stderr}`);
});

check('NEW: a node-failed addressed by NODE PATH (no workOrder field) still binds via the WO id (exit 2)', () => {
  const root = newEffort('WO-1', { gate: 'g' }, [
    { seq: 1, type: 'node-planned', node: 's1/WO-1', kind: 'work-order', title: 'x' },
    { seq: 2, type: 'node-dispatched', node: 's1/WO-1', kind: 'work-order', attempt: 1 },
    { seq: 3, type: 'node-failed', node: 's1/WO-1', reason: 'wall' }, // addressed only by node path
  ]);
  const r = run(root, 'WO-1');
  assert.equal(r.status, 2, `the node path's last segment IS the WO id — it must bind; stderr=${r.stderr}`);
});

check('NEW: closure is by EXACT resolvesSeq — a ratification naming the wrong seq does NOT clear (exit 2)', () => {
  const root = newEffort('WO-1', { gate: 'g' }, [
    { seq: 1, type: 'node-planned', node: 's1/WO-1', kind: 'work-order', title: 'x' },
    { seq: 2, type: 'node-dispatched', node: 's1/WO-1', kind: 'work-order', attempt: 1 },
    { seq: 3, type: 'node-failed', workOrder: 'WO-1', node: 's1/WO-1', reason: 'wall' },
    { seq: 4, type: 'ratification', gate: 'retro', workOrder: 'WO-1', resolvesSeq: 99 }, // wrong seq
  ]);
  const r = run(root, 'WO-1');
  assert.equal(r.status, 2, `a coincidental id mention with the wrong resolvesSeq must NOT clear; stderr=${r.stderr}`);
});

// ── (NEW) amendment-drop binding ──────────────────────────────────────────────────────────────

check('NEW: an unresolved amendment drop for the WO blocks re-dispatch (exit 2)', () => {
  const root = newEffort('WO-1', { gate: 'g' }, [
    { seq: 1, type: 'node-planned', node: 's1/WO-1', kind: 'work-order', title: 'x' },
    { seq: 2, type: 'amendment', component: 'c', drops: [{ workOrder: 'WO-1', supersededBy: 'WO-9' }] },
  ]);
  const r = run(root, 'WO-1');
  assert.equal(r.status, 2, `a dropped WO must not be re-dispatched; stderr=${r.stderr} stdout=${r.stdout}`);
});

check('NEW: an amendment drop restored by a later ratification{resolvesSeq} is CLEAR (exit 0)', () => {
  const root = newEffort('WO-1', { gate: 'g' }, [
    { seq: 1, type: 'node-planned', node: 's1/WO-1', kind: 'work-order', title: 'x' },
    { seq: 2, type: 'amendment', component: 'c', drops: [{ workOrder: 'WO-1' }] },
    { seq: 3, type: 'ratification', gate: 'retro', resolvesSeq: 2 }, // restores the drop at seq 2
  ]);
  const r = run(root, 'WO-1');
  assert.equal(r.status, 0, `a restored drop must clear; stderr=${r.stderr}`);
});

check('NEW: a drop naming a DIFFERENT work order does not bind THIS WO (exit 0)', () => {
  const root = newEffort('WO-1', { gate: 'g' }, [
    { seq: 1, type: 'node-planned', node: 's1/WO-1', kind: 'work-order', title: 'x' },
    { seq: 2, type: 'amendment', component: 'c', drops: [{ workOrder: 'WO-OTHER' }] },
  ]);
  const r = run(root, 'WO-1');
  assert.equal(r.status, 0, `a drop of another WO must not block this one; stderr=${r.stderr}`);
});

// ── clean WO ──────────────────────────────────────────────────────────────────────────────────

check('a clean WO with no binding event is CLEAR (exit 0)', () => {
  const root = newEffort('WO-1', { gate: 'g' }, [
    { seq: 1, type: 'node-planned', node: 's1/WO-1', kind: 'work-order', title: 'x' },
    { seq: 2, type: 'node-dispatched', node: 's1/WO-1', kind: 'work-order', attempt: 1 },
  ]);
  const r = run(root, 'WO-1');
  assert.equal(r.status, 0, `no binding event — must be clear; stderr=${r.stderr}`);
});

for (const t of tmps) { try { rmSync(t, { recursive: true, force: true }); } catch { /* best effort */ } }

if (process.exitCode) console.error(`\nredispatch-guard: FAILURES above (${passed} passed).`);
else console.log(`\nredispatch-guard: all ${passed} checks passed. ✓`);
