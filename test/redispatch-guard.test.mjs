// test/redispatch-guard.test.mjs — the insanity guard (DESIGN §5.8; §5.6 / F12).
// Run: node test/redispatch-guard.test.mjs
//
// Pins the redispatch-guard's blocking predicate after T0.5. The guard binds on TWO event shapes and
// stays CLEAR otherwise (exit 2 = blocked, 0 = clear):
//   (KEPT)  a refutation-surviving dead-end / verdict(infeasible, survivedSkeptic) whose `hash` still
//           matches the WO's current inputs — Defect B, in lockstep with dead-ends.mjs. A changed
//           input un-binds it (the hash no longer matches).
//   (NEW)   an UNRESOLVED amendment drop for the WO (amendment.drops[].workOrder === id) — a
//           deliberate supersession: a dropped WO STAYS dropped until a restoring ratification whose
//           `resolvesSeq` equals the drop's own seq (never a coincidental id mention).
//
// A node-failed does NOT bind. It is a D19 non-terminal `failed ↻` lifecycle event — the WO is under
// investigation, not infeasible — so it must stay redispatchable. `resolvesSeq` has no real emitter,
// so a node-failed binding could never be cleared and would WEDGE the WO forever; and the only
// WO-addressed reason-bearing node-failed the pipeline emits is the dead-end ceremony's, already
// blocked by the hash-gated dead-end binding with the correct input-changed escape (see the
// ANTI-WEDGE discriminator at the end).

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

// ── node-failed is NON-blocking (under-investigation stays redispatchable) ──────────────────────

check('a reason-bearing node-failed ALONE does not block re-dispatch (under-investigation → exit 0)', () => {
  // A node-failed is a D19 `failed ↻` non-terminal lifecycle event — the WO is being investigated,
  // NOT an infeasibility verdict — so it must stay redispatchable. (It would also be uncloseable:
  // resolvesSeq has no real emitter, so a node-failed binding would wedge the WO forever.)
  const root = newEffort('WO-1', { gate: 'g' }, [
    { seq: 1, type: 'node-planned', node: 's1/WO-1', kind: 'work-order', title: 'x' },
    { seq: 2, type: 'node-dispatched', node: 's1/WO-1', kind: 'work-order', attempt: 1 },
    { seq: 3, type: 'node-failed', workOrder: 'WO-1', node: 's1/WO-1', reason: 'binding constraint' },
  ]);
  const r = run(root, 'WO-1');
  assert.equal(r.status, 0, `a node-failed is under-investigation, not a wall — must stay redispatchable; stderr=${r.stderr} stdout=${r.stdout}`);
});

check('a reason-LESS node-failed also does not block (exit 0)', () => {
  const root = newEffort('WO-1', { gate: 'g' }, [
    { seq: 1, type: 'node-planned', node: 's1/WO-1', kind: 'work-order', title: 'x' },
    { seq: 2, type: 'node-dispatched', node: 's1/WO-1', kind: 'work-order', attempt: 1 },
    { seq: 3, type: 'node-failed', workOrder: 'WO-1', node: 's1/WO-1' }, // no reason
  ]);
  const r = run(root, 'WO-1');
  assert.equal(r.status, 0, `no node-failed binding at all — must be clear; stderr=${r.stderr}`);
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

check('NEW: drop closure is by EXACT resolvesSeq — a ratification naming the wrong seq does NOT restore (exit 2)', () => {
  const root = newEffort('WO-1', { gate: 'g' }, [
    { seq: 1, type: 'node-planned', node: 's1/WO-1', kind: 'work-order', title: 'x' },
    { seq: 2, type: 'amendment', component: 'c', drops: [{ workOrder: 'WO-1' }] },
    { seq: 3, type: 'ratification', gate: 'retro', workOrder: 'WO-1', resolvesSeq: 99 }, // wrong seq
  ]);
  const r = run(root, 'WO-1');
  assert.equal(r.status, 2, `a coincidental mention with the wrong resolvesSeq must NOT un-drop; stderr=${r.stderr}`);
});

// LAST-WRITE-WINS among drops (the guard must agree with lib/wo-status.mjs's `dropped` fold): only the
// LATEST drop of a WO governs. Restoring the latest clears the WO even if an EARLIER drop was never
// resolved; restoring only an earlier drop leaves the latest still blocking.
check('double-drop: drop@2, drop@5, ratify resolvesSeq:5 → latest drop restored → CLEAR (exit 0)', () => {
  const root = newEffort('WO-1', { gate: 'g' }, [
    { seq: 1, type: 'node-planned', node: 's1/WO-1', kind: 'work-order', title: 'x' },
    { seq: 2, type: 'amendment', component: 'c', drops: [{ workOrder: 'WO-1' }] },
    { seq: 5, type: 'amendment', component: 'c', drops: [{ workOrder: 'WO-1' }] },
    { seq: 6, type: 'ratification', gate: 'retro', resolvesSeq: 5 }, // restores the LATEST drop
  ]);
  const r = run(root, 'WO-1');
  assert.equal(r.status, 0, `the latest drop (seq 5) is restored — the guard must match the fold's pending; stderr=${r.stderr}`);
});

check('double-drop: drop@2, drop@5, ratify resolvesSeq:2 → latest drop still open → BLOCKED (exit 2)', () => {
  const root = newEffort('WO-1', { gate: 'g' }, [
    { seq: 1, type: 'node-planned', node: 's1/WO-1', kind: 'work-order', title: 'x' },
    { seq: 2, type: 'amendment', component: 'c', drops: [{ workOrder: 'WO-1' }] },
    { seq: 5, type: 'amendment', component: 'c', drops: [{ workOrder: 'WO-1' }] },
    { seq: 6, type: 'ratification', gate: 'retro', resolvesSeq: 2 }, // restores only the EARLIER drop
  ]);
  const r = run(root, 'WO-1');
  assert.equal(r.status, 2, `restoring only the earlier drop leaves the latest (seq 5) blocking; stderr=${r.stderr}`);
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

// ── ANTI-WEDGE DISCRIMINATOR ────────────────────────────────────────────────────────────────────
// The exact wedge a node-failed binding would cause. The dead-end ceremony emits a reason-bearing
// `node-failed --workOrder` ALONGSIDE its `dead-end` event (skills/vertical-slice-execution §4). When
// the WO's inputs later CHANGE, the hash-gated dead-end binding correctly clears (redispatch is
// allowed) — but a node-failed binding is UNCLOSEABLE (resolvesSeq has no real emitter), so it would
// block FOREVER, breaking the guard's own "blocked unless an input changed" contract. With node-failed
// NON-binding, the input-change escape works. This FAILS (exit 2) with the node-failed binding present
// and PASSES (exit 0) once it is removed — the regression guard for the wedge.
check('ANTI-WEDGE: a dead-ended WO whose inputs later CHANGE is redispatchable despite its node-failed (exit 0)', () => {
  const root = newEffort('WO-1', { gate: 'NEW gate' }, [
    { seq: 1, type: 'node-planned', node: 's1/WO-1', kind: 'work-order', title: 'x' },
    { seq: 2, type: 'node-dispatched', node: 's1/WO-1', kind: 'work-order', attempt: 1 },
    // The dead-end ceremony's two ledger lines: the accompanying failure + the hash-gated verdict.
    { seq: 3, type: 'node-failed', workOrder: 'WO-1', node: 's1/WO-1', reason: 'binding constraint' },
    { seq: 4, type: 'dead-end', workOrder: 'WO-1', hash: gateHash('OLD gate') }, // stale hash → inputs changed
  ]);
  const r = run(root, 'WO-1');
  assert.equal(r.status, 0, `inputs changed (dead-end hash stale) — the WO must be redispatchable; a node-failed must not wedge it; stderr=${r.stderr} stdout=${r.stdout}`);
});

for (const t of tmps) { try { rmSync(t, { recursive: true, force: true }); } catch { /* best effort */ } }

if (process.exitCode) console.error(`\nredispatch-guard: FAILURES above (${passed} passed).`);
else console.log(`\nredispatch-guard: all ${passed} checks passed. ✓`);
