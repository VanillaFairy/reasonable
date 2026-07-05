// test/ledger.test.mjs — the ledger controller (lib/ledger.mjs): the ONLY sanctioned write path
// to .reasonable/ledger.jsonl.
// Spec: docs/superpowers/plans/2026-07-02-unified-execution-tree-p1/shared/{architecture,interfaces}.md §2+§4
//
// This suite pins three things at once: (1) validateEvent's per-family acceptance rules, pure and
// synchronous; (2) append()'s script-authoritative STAMPING — an agent can never sneak its own
// seq/ts/attempt through, no matter which door (JS API, CLI flags, CLI --json) it knocks on; (3)
// the exact attempt-arithmetic state machine (fresh / reopen / continuation) computed from durable
// ledger history, never from caller-supplied hints.
//
// lib/progress-tree.mjs and lib/progress-map.mjs (which append() depends on for resolution) do not
// exist yet in Wave 1 — RED here is a missing-module error on lib/ledger.mjs itself.

import assert from 'node:assert';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { KINDS, EVENT_SCHEMAS, validateEvent, append } from '../lib/ledger.mjs';
import { buildTree } from '../lib/progress-map.mjs';
import { findByPath, countByStatus } from '../lib/progress-tree.mjs';

const LIB = join(dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'ledger.mjs');
const tmps = [];

function newEffort() {
  const root = mkdtempSync(join(tmpdir(), 'ledger-test-'));
  tmps.push(root);
  mkdirSync(join(root, '.reasonable'), { recursive: true });
  return root;
}

function seedLedger(root, events) {
  const body = events.map((e) => JSON.stringify(e)).join('\n') + (events.length ? '\n' : '');
  writeFileSync(join(root, '.reasonable', 'ledger.jsonl'), body);
}

function readLedgerLines(root) {
  const p = join(root, '.reasonable', 'ledger.jsonl');
  if (!existsSync(p)) return [];
  return readFileSync(p, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => JSON.parse(l));
}

function runCli(args) {
  return spawnSync(process.execPath, [LIB, ...args], { encoding: 'utf8', timeout: 15000 });
}

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.stack || e.message}`); process.exitCode = 1; }
}
async function checkAsync(name, fn) {
  try { await fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.stack || e.message}`); process.exitCode = 1; }
}

// ── validateEvent (pure, no I/O) ────────────────────────────────────────────────────

check('validateEvent: an unknown type is rejected', () => {
  assert.equal(validateEvent({ type: 'frobnicate-the-widget' }).ok, false);
});

check('validateEvent: legacy action-started is rejected at the write side (clean break)', () => {
  assert.equal(validateEvent({ type: 'action-started', level: 'section', label: 'x' }).ok, false);
});

check('validateEvent: node-planned requires title', () => {
  assert.equal(validateEvent({ type: 'node-planned', node: 'WO-1', kind: 'work-order' }).ok, false);
  assert.equal(validateEvent({ type: 'node-planned', node: 'WO-1', kind: 'work-order', title: 'wire it' }).ok, true);
});

check('validateEvent: node-planned rejects a kind outside KINDS', () => {
  assert.equal(validateEvent({ type: 'node-planned', node: 'WO-1', kind: 'not-a-kind', title: 'x' }).ok, false);
});

check('validateEvent: node-dispatched also rejects a bad kind (kind enum is not special-cased to one type)', () => {
  assert.equal(validateEvent({ type: 'node-dispatched', node: 'WO-1', kind: 'not-a-kind' }).ok, false);
  assert.equal(validateEvent({ type: 'node-dispatched', node: 'WO-1', kind: 'work-order' }).ok, true);
});

check('validateEvent: node-canceled requires a reason', () => {
  assert.equal(validateEvent({ type: 'node-canceled', node: 'WO-1' }).ok, false);
  assert.equal(validateEvent({ type: 'node-canceled', node: 'WO-1', reason: 'stale' }).ok, true);
});

check('validateEvent: report-canceled requires a reason', () => {
  assert.equal(validateEvent({ type: 'report-canceled', under: 'WO-1', node: 'x', reason: undefined }).ok, false);
  assert.equal(validateEvent({ type: 'report-canceled', under: 'WO-1', node: 'x', reason: 'stale' }).ok, true);
});

check('validateEvent: report-started requires under', () => {
  assert.equal(validateEvent({ type: 'report-started', node: 'x' }).ok, false);
  assert.equal(validateEvent({ type: 'report-started', under: 'WO-1', node: 'x' }).ok, true);
});

check('validateEvent: report-started rejects an absolute-looking (leading /) node — workers supply RELATIVE paths', () => {
  assert.equal(validateEvent({ type: 'report-started', under: 'WO-1', node: '/x' }).ok, false);
});

check('validateEvent: Family-3 is loose — a bare verdict validates', () => {
  assert.equal(validateEvent({ type: 'verdict', kind: 'green' }).ok, true);
});

check('validateEvent: Family-3 enrichment/characterization additionally require component', () => {
  assert.equal(validateEvent({ type: 'enrichment' }).ok, false);
  assert.equal(validateEvent({ type: 'enrichment', component: 'parser' }).ok, true);
  assert.equal(validateEvent({ type: 'characterization', clause: '§2' }).ok, false);
  assert.equal(validateEvent({ type: 'characterization', component: 'store', clause: '§2' }).ok, true);
});

check('validateEvent: Family-1 events accept workOrder in place of node (resolution is append\'s job)', () => {
  assert.equal(validateEvent({ type: 'node-dispatched', workOrder: 'WO-1', kind: 'work-order' }).ok, true);
  assert.equal(validateEvent({ type: 'node-planned', workOrder: 'WO-1', kind: 'work-order', title: 'x' }).ok, true);
  assert.equal(validateEvent({ type: 'node-canceled', workOrder: 'WO-1', reason: 'stale' }).ok, true);
});

check('validateEvent: node-completed/node-failed require only node; reason is optional on node-failed', () => {
  assert.equal(validateEvent({ type: 'node-completed' }).ok, false);
  assert.equal(validateEvent({ type: 'node-completed', node: 'WO-1' }).ok, true);
  assert.equal(validateEvent({ type: 'node-failed', node: 'WO-1' }).ok, true);
});

check('validateEvent: approval-resolved requires id; concluded has no required fields', () => {
  assert.equal(validateEvent({ type: 'approval-resolved' }).ok, false);
  assert.equal(validateEvent({ type: 'approval-resolved', id: 'INBOX-1' }).ok, true);
  assert.equal(validateEvent({ type: 'concluded' }).ok, true);
});

// ── T0.5 (§5.6, F12): amendment/ratification carry OPTIONAL structured drops + resolvesSeq ──────
// Both fields are additive and never required (old events lack them); the shape is validated only
// when present, so a malformed drop can never land raw and detonate at fold time.

check('validateEvent: amendment with well-formed drops + resolvesSeq validates', () => {
  assert.equal(validateEvent({
    type: 'amendment', component: 'c',
    drops: [{ workOrder: 'WO-1' }, { workOrder: 'WO-2', supersededBy: 'WO-9' }], resolvesSeq: 7,
  }).ok, true);
});

check('validateEvent: ratification with resolvesSeq validates; a bare amendment/ratification still validates (fields optional)', () => {
  assert.equal(validateEvent({ type: 'ratification', gate: 'retro', resolvesSeq: 3 }).ok, true);
  assert.equal(validateEvent({ type: 'amendment', component: 'c' }).ok, true);
  assert.equal(validateEvent({ type: 'ratification', gate: 'retro' }).ok, true);
});

check('validateEvent: malformed drops are rejected (not an array / missing workOrder / bad supersededBy / null entry)', () => {
  assert.equal(validateEvent({ type: 'amendment', drops: 'WO-1' }).ok, false, 'drops must be an array');
  assert.equal(validateEvent({ type: 'amendment', drops: [{ supersededBy: 'WO-9' }] }).ok, false, 'each drop needs a workOrder');
  assert.equal(validateEvent({ type: 'amendment', drops: [{ workOrder: '' }] }).ok, false, 'workOrder must be non-empty');
  assert.equal(validateEvent({ type: 'amendment', drops: [{ workOrder: 'WO-1', supersededBy: 5 }] }).ok, false, 'supersededBy, when present, must be a string');
  assert.equal(validateEvent({ type: 'amendment', drops: [null] }).ok, false, 'a null drop is malformed');
});

check('validateEvent: a non-numeric resolvesSeq is rejected on both amendment and ratification', () => {
  assert.equal(validateEvent({ type: 'ratification', gate: 'retro', resolvesSeq: 'three' }).ok, false);
  assert.equal(validateEvent({ type: 'amendment', component: 'c', resolvesSeq: null }).ok, false);
});

check('exports: KINDS is exact; EVENT_SCHEMAS is a registry that excludes legacy action-* types', () => {
  assert.deepEqual(KINDS, ['work-order', 'spike', 'scaffold', 'grill-pass', 'slice', 'phase']);
  assert.equal(typeof EVENT_SCHEMAS, 'object');
  assert.ok(EVENT_SCHEMAS);
  for (const t of [
    'node-planned', 'node-dispatched', 'node-checkpointed', 'node-downgraded', 'node-completed',
    'node-failed', 'node-canceled', 'approval-resolved', 'concluded',
    'report-started', 'report-finished', 'report-canceled',
    'enrichment', 'verdict', 'commit',
  ]) {
    assert.ok(EVENT_SCHEMAS[t], `EVENT_SCHEMAS has an entry for ${t}`);
  }
  for (const t of ['action-started', 'action-finished', 'action-obsoleted']) {
    assert.ok(!EVENT_SCHEMAS[t], `legacy type ${t} must not be in the write-side registry`);
  }
});

// ── append (I/O): stamping, attempt arithmetic, spoof resistance ───────────────────
//
// Fixtures nest the target work order under a slice segment (`s1/WO-1`) rather than at the tree
// root, specifically so that resolving `workOrder: 'WO-1'` / `under: 'WO-1'` exercises REAL
// findById resolution (segment id -> full path), not a trivial identity case where id === path.

check('append: report-started stamps seq + controller ts, resolves the absolute node under the live attempt (base, no wrapper)', () => {
  const root = newEffort();
  seedLedger(root, [
    { seq: 1, type: 'node-planned', node: 's1/WO-1', kind: 'work-order', title: 'wire the widget' },
    { seq: 2, type: 'node-dispatched', node: 's1/WO-1', kind: 'work-order', attempt: 1 },
  ]);
  const before = readLedgerLines(root).length;
  const r = append(root, {
    type: 'report-started', under: 'WO-1', node: 'impl/§4', label: 'clause four',
    ts: '1999-01-01T00:00:00.000Z', // agent-forged — must be overwritten
  });
  assert.equal(r.ok, true, r.error);
  const lines = readLedgerLines(root);
  assert.equal(lines.length, before + 1, 'exactly one new line appended');
  const stored = lines[lines.length - 1];
  assert.equal(stored.seq, before + 1, 'seq is script-assigned, last + 1');
  assert.notEqual(stored.ts, '1999-01-01T00:00:00.000Z', 'agent-supplied ts is overwritten, never trusted');
  assert.match(stored.ts, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?[+-]\d{2}:\d{2}$/, 'controller stamps its own local ISO clock, with a numeric offset (not UTC Z)');
  assert.equal(stored.node, 's1/WO-1/impl/§4', 'absolute node = path(under) + attempt-1 (no prior attempts) + relative');
  assert.equal(stored.under, 'WO-1', 'under is kept as provenance');
  // The returned stamped event must reflect the same ts-overwrite + resolved node (seq is assigned
  // inside the appendJsonl lock; whether the returned object also carries it back is left open —
  // see report's "ambiguities to escalate").
  assert.notEqual(r.event.ts, '1999-01-01T00:00:00.000Z');
  assert.equal(r.event.node, 's1/WO-1/impl/§4');
});

check('append: attempt arithmetic — a fresh node (no attempts yet) dispatches at attempt 1, workOrder resolves to its real path', () => {
  const root = newEffort();
  seedLedger(root, [
    { seq: 1, type: 'node-planned', node: 's1/WO-1', kind: 'work-order', title: 'wire it' },
  ]);
  const r = append(root, { type: 'node-dispatched', workOrder: 'WO-1', kind: 'work-order' });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.event.attempt, 1);
  assert.equal(r.event.node, 's1/WO-1', 'workOrder resolved via findById to its actual tree path, not assumed identity');
  const stored = readLedgerLines(root)[readLedgerLines(root).length - 1];
  assert.equal(stored.attempt, 1);
  assert.equal(stored.node, 's1/WO-1');
});

check('append: attempt arithmetic — a failed latest attempt forces a reopen (attempt N+1)', () => {
  const root = newEffort();
  seedLedger(root, [
    { seq: 1, type: 'node-planned', node: 's1/WO-1', kind: 'work-order', title: 'wire it' },
    { seq: 2, type: 'node-dispatched', node: 's1/WO-1', kind: 'work-order', attempt: 1 },
    { seq: 3, type: 'node-downgraded', node: 's1/WO-1', attempt: 1 },
  ]);
  const r = append(root, { type: 'node-dispatched', workOrder: 'WO-1', kind: 'work-order' });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.event.attempt, 2, 'downgraded sealed attempt-1 failed — dispatch reopens at attempt 2');
});

check('append: attempt arithmetic — a checkpointed (not failed) latest attempt is a continuation (same N, no reopen)', () => {
  const root = newEffort();
  seedLedger(root, [
    { seq: 1, type: 'node-planned', node: 's1/WO-1', kind: 'work-order', title: 'wire it' },
    { seq: 2, type: 'node-dispatched', node: 's1/WO-1', kind: 'work-order', attempt: 1 },
    { seq: 3, type: 'node-checkpointed', node: 's1/WO-1' },
  ]);
  const r = append(root, { type: 'node-dispatched', workOrder: 'WO-1', kind: 'work-order' });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.event.attempt, 1, 'checkpoint reclaim: same attempt, never a fresh one');
});

check('append: agent-forged attempt/seq are ignored — the controller\'s computed values always win', () => {
  const root = newEffort();
  seedLedger(root, [
    { seq: 1, type: 'node-planned', node: 's1/WO-1', kind: 'work-order', title: 'wire it' },
  ]);
  const r = append(root, { type: 'node-dispatched', workOrder: 'WO-1', kind: 'work-order', attempt: 999, seq: 12345 });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.event.attempt, 1, 'forged attempt is overwritten by the computed value');
  const stored = readLedgerLines(root); const last = stored[stored.length - 1];
  assert.equal(last.attempt, 1, 'the persisted line carries the computed attempt, not the forged 999');
  assert.equal(last.seq, 2, 'the persisted line carries the script-assigned seq, not the forged 12345');
});

check('append: an unresolvable `under` fails loud — nothing is appended', () => {
  const root = newEffort(); // empty tree — nothing can resolve
  const before = readLedgerLines(root).length;
  const r = append(root, { type: 'report-started', under: 'GHOST', node: 'x' });
  assert.equal(r.ok, false);
  assert.ok(r.error, 'carries a diagnostic message');
  assert.equal(readLedgerLines(root).length, before, 'no partial append when resolution fails');
});

check('append: a validateEvent failure returns {ok:false} and never throws across the call, nothing appended', () => {
  const root = newEffort();
  let result;
  assert.doesNotThrow(() => { result = append(root, { type: 'not-a-real-type' }); });
  assert.equal(result.ok, false);
  assert.equal(readLedgerLines(root).length, 0);
});

check('append: Family-1 event with an UNRESOLVABLE workOrder is fatal — same field name as Family-3, opposite behavior', () => {
  const root = newEffort(); // empty tree — nothing can resolve
  const before = readLedgerLines(root).length;
  const r = append(root, { type: 'node-dispatched', workOrder: 'GHOST', kind: 'work-order' });
  assert.equal(r.ok, false, 'Family-1 resolution failure MUST fail the append (unlike Family-3\'s best-effort workOrder)');
  assert.ok(r.error, 'carries a diagnostic message');
  assert.equal(readLedgerLines(root).length, before, 'no partial append when a Family-1 workOrder is unresolvable');
});

check('append: Family-3 event with a RESOLVABLE workOrder gets node stamped', () => {
  const root = newEffort();
  seedLedger(root, [
    { seq: 1, type: 'node-planned', node: 's1/WO-1', kind: 'work-order', title: 'wire it' },
  ]);
  const r = append(root, { type: 'enrichment', component: 'parser', clauses: ['§1'], workOrder: 'WO-1' });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.event.node, 's1/WO-1', 'a resolvable workOrder is stamped onto node for Family-3 too');
});

check('append: Family-3 event with an UNRESOLVABLE workOrder is non-fatal (unlike Family 1/2, which fail loud)', () => {
  const root = newEffort(); // empty tree — workOrder cannot resolve
  const r = append(root, { type: 'enrichment', component: 'parser', clauses: ['§1'], workOrder: 'GHOST' });
  assert.equal(r.ok, true, 'a Family-3 resolution miss does not fail the append');
  assert.ok(r.event.node === undefined || r.event.node === null, 'node is left absent rather than guessed');
});

check('append: a successful append regenerates the mirror (progress.json)', () => {
  const root = newEffort();
  const progressPath = join(root, '.reasonable', 'progress.json');
  assert.ok(!existsSync(progressPath), 'sanity: nothing written yet');
  const r = append(root, { type: 'node-planned', node: 'WO-solo', kind: 'work-order', title: 'solo' });
  assert.equal(r.ok, true, r.error);
  assert.ok(existsSync(progressPath), 'a successful append regenerates the mirror by default');
});

check('append: opts.regen === false suppresses the mirror regen', () => {
  const root = newEffort();
  const progressPath = join(root, '.reasonable', 'progress.json');
  const r = append(root, { type: 'node-planned', node: 'WO-solo', kind: 'work-order', title: 'solo' }, { regen: false });
  assert.equal(r.ok, true, r.error);
  assert.ok(!existsSync(progressPath), 'regen: false must suppress the mirror write');
});

// ── CLI ──────────────────────────────────────────────────────────────────────────

check('CLI: flag form appends and exits 0; the stored event carries the flag fields', () => {
  const root = newEffort();
  const res = runCli(['append', '--root', root, '--type', 'node-planned', '--node', 'WO-cli', '--kind', 'work-order', '--title', 'cli wired']);
  assert.equal(res.status, 0, res.stderr);
  const lines = readLedgerLines(root);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].type, 'node-planned');
  assert.equal(lines[0].node, 'WO-cli');
  assert.equal(lines[0].kind, 'work-order');
  assert.equal(lines[0].title, 'cli wired');
});

check('CLI: --json form appends a Family-3 payload with an array field verbatim, stamped', () => {
  const root = newEffort();
  const payload = JSON.stringify({ type: 'enrichment', component: 'parser', clauses: ['§1', '§2'] });
  const res = runCli(['append', '--root', root, '--json', payload]);
  assert.equal(res.status, 0, res.stderr);
  const lines = readLedgerLines(root);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].type, 'enrichment');
  assert.equal(lines[0].component, 'parser');
  assert.deepEqual(lines[0].clauses, ['§1', '§2'], 'array field survives verbatim through --json');
  assert.ok(lines[0].ts, 'controller-stamped ts present');
});

check('CLI: --json form cannot be used to smuggle a forged seq/ts either', () => {
  const root = newEffort();
  seedLedger(root, [{ seq: 1, type: 'commit' }]);
  const payload = JSON.stringify({ type: 'enrichment', component: 'x', seq: 99999, ts: '1999-01-01T00:00:00.000Z' });
  const res = runCli(['append', '--root', root, '--json', payload]);
  assert.equal(res.status, 0, res.stderr);
  const lines = readLedgerLines(root);
  const stored = lines[lines.length - 1];
  assert.equal(stored.seq, 2, 'the CLI cannot be used to smuggle a forged seq');
  assert.notEqual(stored.ts, '1999-01-01T00:00:00.000Z', 'the CLI cannot be used to smuggle a forged ts');
});

check('CLI: a malformed call (unknown type) exits non-zero, stderr says "ledger:", nothing appended', () => {
  const root = newEffort();
  const res = runCli(['append', '--root', root, '--type', 'not-a-real-type', '--node', 'WO-x']);
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /ledger:/);
  assert.equal(readLedgerLines(root).length, 0, 'nothing appended on a rejected event');
});

check('CLI: no .reasonable/ at --root exits non-zero with the same clean "ledger:" stderr contract', () => {
  const bare = mkdtempSync(join(tmpdir(), 'ledger-bare-'));
  tmps.push(bare);
  const res = runCli(['append', '--root', bare, '--type', 'node-planned', '--node', 'WO-x', '--kind', 'work-order', '--title', 'x']);
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /ledger:/, 'a missing effort surfaces the same clean ledger: <error> contract, not a raw crash');
});

// ── concurrency ──────────────────────────────────────────────────────────────────

await checkAsync('CLI concurrency: 12 parallel appends land as 12 unique, gapless, parseable lines', async () => {
  const root = newEffort();
  seedLedger(root, [
    { seq: 1, type: 'node-planned', node: 'WO-1', kind: 'work-order', title: 'concurrent target' },
    { seq: 2, type: 'node-dispatched', node: 'WO-1', kind: 'work-order', attempt: 1 },
  ]);
  const before = readLedgerLines(root).length;
  const N = 12;
  const runs = Array.from({ length: N }, (_, i) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      LIB, 'append', '--root', root, '--type', 'report-started',
      '--under', 'WO-1', '--node', `ref-${i}`, '--label', `ref ${i}`,
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`child ${i} exited ${code}: ${stderr}`))));
  }));
  await Promise.all(runs);
  const lines = readLedgerLines(root);
  assert.equal(lines.length, before + N, 'all 12 concurrent appends landed');
  for (const l of lines) assert.ok(l && typeof l === 'object', 'every line parses as JSON');
  const newSeqs = lines.slice(before).map((l) => l.seq).sort((a, b) => a - b);
  assert.equal(new Set(newSeqs).size, N, 'seq values are unique under concurrency — no lost update');
  for (let i = 0; i < N; i++) {
    assert.equal(newSeqs[i], before + 1 + i, 'seq values are gapless, forming one contiguous run');
  }
});

// ── audit round 3: EVENT_SCHEMAS[type] prototype-pollution bypass (finding 1) ──────
// A `type` matching an inherited Object.prototype member name (`__proto__`, `toString`,
// `hasOwnProperty`, `constructor`, ...) must be treated as "unknown type", exactly like any
// other genuinely-unknown type. A plain bracket lookup (`EVENT_SCHEMAS[type]`) instead resolves
// these to the INHERITED value, skipping every required-field/kind check entirely — an
// unvalidated arbitrary payload would land verbatim in the ledger.

check('validateEvent: a __proto__ type is rejected, not resolved to the inherited Object.prototype value', () => {
  assert.equal(validateEvent({ type: '__proto__', anything: 'goes' }).ok, false);
});

check('validateEvent: a toString type is rejected, not resolved to Object.prototype.toString', () => {
  assert.equal(validateEvent({ type: 'toString' }).ok, false);
});

check('validateEvent: a hasOwnProperty type is rejected, not resolved to Object.prototype.hasOwnProperty', () => {
  assert.equal(validateEvent({ type: 'hasOwnProperty' }).ok, false);
});

check('validateEvent: a constructor type is rejected, not resolved to Object.prototype.constructor', () => {
  assert.equal(validateEvent({ type: 'constructor' }).ok, false);
});

check('append: a __proto__-typed event is rejected — no unvalidated payload reaches the ledger via the JS API', () => {
  const root = newEffort();
  const before = readLedgerLines(root).length;
  const r = append(root, { type: '__proto__', anything: 'goes' });
  assert.equal(r.ok, false, 'the prototype-pollution bypass must not let an arbitrary payload through append()');
  assert.equal(readLedgerLines(root).length, before, 'nothing appended for a rejected event');
});

check('CLI: a __proto__-typed --json payload exits non-zero — the bypass must not reach the ledger via the CLI door either', () => {
  const root = newEffort();
  const res = runCli(['append', '--root', root, '--json', JSON.stringify({ type: '__proto__', anything: 'goes' })]);
  assert.notEqual(res.status, 0, 'must not exit 0 for a type that bypasses schema validation via the inherited prototype');
  assert.equal(readLedgerLines(root).length, 0, 'nothing appended');
});

// ── audit round 3: append() must never let a mirror-regen failure escape (finding 2) ──────
// The ledger LINE is durably written (appendJsonl, under the lock) BEFORE the mirror-regen step
// runs. A throw from that later, best-effort step must never propagate out of append() — the
// documented contract is "never throws" — and must never mask the fact that the line already
// landed (a caller with no ok:false signal has no way to know a retry would duplicate work).

check('append: writeMirror throwing after a successful ledger write does not propagate — the line is already durable', () => {
  const root = newEffort();
  // Force writeMirror's internal writeFileSync(progress.json, ...) to throw EISDIR by making
  // the mirror's own output path a directory instead of a file.
  mkdirSync(join(root, '.reasonable', 'progress.json'));
  const before = readLedgerLines(root).length;
  let result;
  assert.doesNotThrow(() => {
    result = append(root, { type: 'node-planned', node: 'WO-mirror-fail', kind: 'work-order', title: 'x' });
  }, 'append() must never let a mirror-regen failure escape as an uncaught exception');
  const lines = readLedgerLines(root);
  assert.equal(lines.length, before + 1, 'the ledger append itself succeeded even though the mirror regen threw');
  assert.equal(lines[lines.length - 1].node, 'WO-mirror-fail');
  assert.ok(result, 'append() returned instead of throwing');
});

check('CLI: writeMirror throwing after a successful ledger append must not crash with a raw Node stack trace', () => {
  const root = newEffort();
  mkdirSync(join(root, '.reasonable', 'progress.json'));
  const res = runCli(['append', '--root', root, '--type', 'node-planned', '--node', 'WO-cli-mirror-fail', '--kind', 'work-order', '--title', 'x']);
  // Whatever the exit code, this must stay inside the documented `ledger: <error>` contract —
  // never an uncaught-exception crash (a raw multi-line Node stack trace with no 'ledger:' prefix).
  assert.ok(res.status === 0 || /ledger:/.test(res.stderr),
    'must either exit cleanly or print the documented ledger: <error> contract, never an uncaught-exception crash');
  assert.ok(!/\n\s+at .+:\d+:\d+/.test(res.stderr), 'must not leak a raw Node stack trace to stderr');
  assert.equal(readLedgerLines(root).length, 1, 'the ledger write already succeeded before the mirror regen ran');
});

// ── T0.2: locking correctness (§5.3 mirror atomicity + §5.4 attempt-slot race) ─────────────
// append() now runs attempt-resolution + seq + file-append + mirror-regen under ONE hold of the
// ledger lock. buildTree()/attempt arithmetic used to run BEFORE the lock and writeMirror AFTER it.
// The two checks below are DISCRIMINATORS: each was confirmed to go RED on the pre-fix lib
// (commit a6348eb) and GREEN on the fix (see the task report's discriminator evidence). Both drive
// a genuine race and seed a slow prior ledger (BASELINE noise) so the pre-fix unlocked regen /
// resolution window is wide enough to lose reliably. See shared/interfaces.md §T0.2.
//
// NOTE — there is deliberately no "N concurrent dispatches → attempts 1..N" test: the attempt state
// machine treats a plain re-dispatch of a LIVE (non-failed) attempt as a continuation (same slot),
// so N concurrent PLAIN dispatches on one node all resolve to the one live slot — the correct
// answer, lock or no lock (the fold collapses them). Distinct slots require an intervening seal;
// that path is the §5.4 race below plus the sequential reopen-chain correctness check.

await checkAsync('CLI concurrency §5.3: the mirror is regenerated atomically under the lock — published counts never go backwards, never tear, and agree with the final ledger', async () => {
  // NON-idempotent burst: N distinct nodes each driven to `done` concurrently, so counts.done
  // climbs 0→N. Poll progress.json throughout. On the fix (regen inside the lock, tmp+rename) the
  // published `done` is monotonic and every read parses; on the pre-fix lib (writeMirror OUTSIDE
  // the lock, plain overwrite) a slow earlier-computed mirror lands after a fresher one → `done`
  // goes BACKWARDS (and/or a reader catches a half-written file). RED on a6348eb, GREEN on the fix.
  const N = 24;
  const BASELINE = 600; // prior events make each unlocked fold slow enough that regens reorder
  const ROUNDS = 3;     // per round the pre-fix lib loses reliably (measured 6/6); rounds add margin
  for (let round = 0; round < ROUNDS; round++) {
    const root = newEffort();
    const seed = [];
    let seq = 1;
    for (let b = 0; b < BASELINE; b++) seed.push({ seq: seq++, type: 'commit', note: `noise-${b}` });
    for (let k = 1; k <= N; k++) {
      seed.push({ seq: seq++, type: 'node-planned', node: `n${k}`, kind: 'work-order', title: `t${k}` });
      seed.push({ seq: seq++, type: 'node-dispatched', node: `n${k}`, kind: 'work-order', attempt: 1 });
    }
    seedLedger(root, seed);
    const progressPath = join(root, '.reasonable', 'progress.json');

    let running = N;
    for (let i = 1; i <= N; i++) {
      const child = spawn(process.execPath, [LIB, 'append', '--root', root, '--type', 'node-completed', '--node', `n${i}`], { stdio: 'ignore' });
      child.on('close', () => { running -= 1; });
    }

    // Poll the published mirror while the burst lands. Track the last cleanly-read done count and
    // whether it ever regressed; count any read that fails to parse as a torn (half-written) read.
    let lastDone = null; let wentBackwards = null; let torn = 0;
    while (running > 0) {
      if (existsSync(progressPath)) {
        let raw = null;
        try { raw = readFileSync(progressPath, 'utf8'); } catch { raw = null; }
        if (raw) {
          try {
            const done = JSON.parse(raw).counts.done;
            if (lastDone !== null && done < lastDone && wentBackwards === null) wentBackwards = `${lastDone}→${done}`;
            lastDone = done;
          } catch { torn += 1; }
        }
      }
      await new Promise((r) => setTimeout(r, 0));
    }

    assert.equal(wentBackwards, null, `published done count went backwards (a stale mirror landed after a fresher one): ${wentBackwards}`);
    assert.equal(torn, 0, 'progress.json must always parse — a tmp+rename publish is never observed half-written');
    const mirror = JSON.parse(readFileSync(progressPath, 'utf8'));
    assert.equal(mirror.counts.done, N, 'the final mirror reflects all N completions (not a stale earlier snapshot)');
    assert.deepEqual(mirror.counts, countByStatus(buildTree(root)), 'final progress.json agrees with a fresh fold of the ledger');
    const leftovers = readdirSync(join(root, '.reasonable')).filter((f) => /\.tmp-/.test(f));
    assert.deepEqual(leftovers, [], 'no progress.*.tmp-* left behind after the atomic writes');
  }
});

await checkAsync('CLI concurrency §5.4: a dispatch racing a seal never continues the sealed attempt — attempt resolution reads committed state under the lock', async () => {
  // Race a node-downgraded (seal attempt 1) against a node-dispatched (reopen) on one live node.
  // On the fix (resolution + append atomic under the lock) the dispatch either lands BEFORE the
  // seal or, seeing the committed seal, reopens to attempt 2 — so a node-dispatched(attempt 1) is
  // never at a higher seq than a node-downgraded(attempt 1). On the pre-fix lib the dispatch
  // resolves attempt from a pre-seal snapshot and "continues" the sealed attempt 1. RED on a6348eb
  // (measured 7–11/12 rounds), GREEN on the fix (0/12).
  const BASELINE = 400; // widens the pre-fix resolve→append window so the stale read lands reliably
  const ROUNDS = 12;
  let continuedSealed = 0;
  for (let round = 0; round < ROUNDS; round++) {
    const root = newEffort();
    const seed = [];
    let seq = 1;
    for (let b = 0; b < BASELINE; b++) seed.push({ seq: seq++, type: 'commit', note: `noise-${b}` });
    seed.push({ seq: seq++, type: 'node-planned', node: 'WO', kind: 'work-order', title: 'race' });
    seed.push({ seq: seq++, type: 'node-dispatched', node: 'WO', kind: 'work-order', attempt: 1 });
    seedLedger(root, seed);

    const spawnAppend = (args) => new Promise((resolve) => {
      const c = spawn(process.execPath, [LIB, 'append', '--root', root, ...args], { stdio: 'ignore' });
      c.on('close', () => resolve());
    });
    await Promise.all([
      spawnAppend(['--type', 'node-downgraded', '--workOrder', 'WO']),
      spawnAppend(['--type', 'node-dispatched', '--workOrder', 'WO', '--kind', 'work-order']),
    ]);

    const lines = readLedgerLines(root);
    const sealed = lines.filter((l) => l.type === 'node-downgraded' && l.attempt === 1).map((l) => l.seq);
    const maxSealed = sealed.length ? Math.max(...sealed) : -1;
    const dispatchedAttempt1 = lines.filter((l) => l.type === 'node-dispatched' && l.attempt === 1);
    // A dispatched(attempt 1) at a HIGHER seq than the seal == a dispatch that continued the sealed
    // attempt instead of reopening. That is the §5.4 stale-read bug.
    if (maxSealed >= 0 && dispatchedAttempt1.some((l) => l.seq > maxSealed)) continuedSealed += 1;
  }
  assert.equal(continuedSealed, 0, `a dispatch continued a sealed attempt in ${continuedSealed}/${ROUNDS} rounds — attempt resolution must read committed ledger state under the lock`);
});

check('CLI correctness (sequential): a reopen chain mints DISTINCT [k] attempt slots 1..N — resolution reads committed state', () => {
  // Deterministic CORRECTNESS test (not a concurrency discriminator — five separate CLI processes
  // run one after another, so it also passes on the pre-fix lib). It pins that the attempt state
  // machine mints distinct siblings when each dispatch is preceded by a seal.
  const root = newEffort();
  seedLedger(root, [
    { seq: 1, type: 'node-planned', node: 's1/WO', kind: 'work-order', title: 'reopen target' },
  ]);
  const N = 5;
  const attempts = [];
  for (let k = 1; k <= N; k++) {
    const d = runCli(['append', '--root', root, '--type', 'node-dispatched', '--workOrder', 'WO', '--kind', 'work-order']);
    assert.equal(d.status, 0, d.stderr);
    const disp = readLedgerLines(root).filter((l) => l.type === 'node-dispatched');
    attempts.push(disp[disp.length - 1].attempt);
    // Seal it failed so the NEXT dispatch is a genuine reopen (not a continuation).
    const g = runCli(['append', '--root', root, '--type', 'node-downgraded', '--workOrder', 'WO']);
    assert.equal(g.status, 0, g.stderr);
  }
  assert.deepEqual(attempts, [1, 2, 3, 4, 5], 'each reopen mints the next DISTINCT attempt slot — no two reopens collide on one [k]');
});

check('append: the mirror is published atomically — progress.json parses and no progress.*.tmp-* is left behind (uncontended)', () => {
  const root = newEffort();
  const r = append(root, { type: 'node-planned', node: 'WO-solo', kind: 'work-order', title: 'solo' });
  assert.equal(r.ok, true, r.error);
  const mirror = JSON.parse(readFileSync(join(root, '.reasonable', 'progress.json'), 'utf8'));
  assert.ok(mirror && typeof mirror === 'object', 'progress.json parses (never a torn read)');
  const leftovers = readdirSync(join(root, '.reasonable')).filter((f) => /\.tmp-/.test(f));
  assert.deepEqual(leftovers, [], 'atomic tmp+rename leaves no stray temp file after a successful regen');
});

// ── audit round 3: other required string fields aren't type-checked (finding 4) ───────────
// Only `node`/`workOrder` get the isNonEmptyString check. Every other required field is checked
// only for `!== undefined`, never for type — an empty string, null, array, or object all
// currently pass.

check('validateEvent: node-planned rejects a non-string title (empty, null, array, object) — not just undefined', () => {
  assert.equal(validateEvent({ type: 'node-planned', node: 'x', kind: 'work-order', title: '' }).ok, false);
  assert.equal(validateEvent({ type: 'node-planned', node: 'x', kind: 'work-order', title: null }).ok, false);
  assert.equal(validateEvent({ type: 'node-planned', node: 'x', kind: 'work-order', title: ['a', 'b'] }).ok, false);
  assert.equal(validateEvent({ type: 'node-planned', node: 'x', kind: 'work-order', title: {} }).ok, false);
});

check('validateEvent: enrichment rejects a non-string component (array, null) — not just undefined', () => {
  assert.equal(validateEvent({ type: 'enrichment', component: ['a'] }).ok, false);
  assert.equal(validateEvent({ type: 'enrichment', component: null }).ok, false);
});

// ── audit round 3: node-downgraded on a never-dispatched node fabricates a phantom attempt (finding 5) ──
// Downgrading a node with ZERO attempts ever (planned, never dispatched) currently stamps
// attempt:1 and creates a phantom "attempt-1, failed" subtree for an attempt that never existed.

check('append: node-downgraded on a planned-but-never-dispatched node is rejected, not stamped with a phantom attempt-1', () => {
  const root = newEffort();
  seedLedger(root, [
    { seq: 1, type: 'node-planned', node: 'WO-1', kind: 'work-order', title: 'never dispatched' },
  ]);
  const before = readLedgerLines(root).length;
  const r = append(root, { type: 'node-downgraded', workOrder: 'WO-1' });
  assert.equal(r.ok, false, 'downgrading a node with zero attempts ever must fail — there is nothing to downgrade');
  assert.equal(readLedgerLines(root).length, before, 'no phantom attempt-1 line is appended');
});

// ── audit round 3: report-* on a never-dispatched node is silently accepted (finding 6) ────
// A report-started/-finished/-canceled against a work order that has NEVER been node-dispatched
// (zero attempts) is currently accepted, producing an internally inconsistent tree (the parent
// stays pending while a leaf under a fabricated attempt-1 shows active).

check('append: report-started against a work order that was planned but never dispatched is rejected (fail loud, symmetric with the unplanned-node guard)', () => {
  const root = newEffort();
  seedLedger(root, [
    { seq: 1, type: 'node-planned', node: 'WO-1', kind: 'work-order', title: 'never dispatched' },
  ]);
  const before = readLedgerLines(root).length;
  const r = append(root, { type: 'report-started', under: 'WO-1', node: '§4' });
  assert.equal(r.ok, false, 'a worker cannot report progress on a work order that was never dispatched to it');
  assert.equal(readLedgerLines(root).length, before, 'no line appended for a report against an undispatched work order');
});

for (const t of tmps) { try { rmSync(t, { recursive: true, force: true }); } catch { /* best effort */ } }

// ── audit round 4: Family-1 direct-node resolution must be BY PATH, not by last segment ────
// Segment ids are unique among SIBLINGS only (progress-tree contract) — e.g. every slice has a
// `retro` child. Resolving a direct `node` path by findById on its last segment reads a
// DIFFERENT node's attempt state: with s1/retro failed, the FIRST dispatch of s2/retro was
// stamped attempt 2, fabricating a phantom "attempt-1 failed" subtree under s2/retro.

check('append: first dispatch of s2/retro stamps attempt 1 even when s1/retro (same trailing segment) already failed', () => {
  const root = newEffort();
  seedLedger(root, [
    { seq: 1, type: 'node-planned', node: 's1', kind: 'slice', title: 'slice 1' },
    { seq: 2, type: 'node-planned', node: 's1/retro', kind: 'phase', title: 'retro 1' },
    { seq: 3, type: 'node-planned', node: 's2', kind: 'slice', title: 'slice 2' },
    { seq: 4, type: 'node-planned', node: 's2/retro', kind: 'phase', title: 'retro 2' },
    { seq: 5, type: 'node-dispatched', node: 's1/retro', kind: 'phase', attempt: 1 },
    { seq: 6, type: 'node-failed', node: 's1/retro', reason: 'gate blocked' },
  ]);
  const r = append(root, { type: 'node-dispatched', node: 's2/retro', kind: 'phase' });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.event.attempt, 1, 'fresh node dispatches at attempt 1 — s1/retro\'s failure must not leak in');
  assert.equal(r.event.node, 's2/retro', 'attempt 1 is the base node itself — no [k] suffix, no leaked reopen');
  const tree = buildTree(root);
  const s2retro = findByPath(tree, 's2/retro');
  assert.deepEqual(s2retro.children.map((c) => c.id), [], 'no attempt wrapper child, and no phantom s2/retro[2] sibling');
});

check('append: dispatching a node whose path is unplanned still fails loud even when its last segment exists elsewhere', () => {
  const root = newEffort();
  seedLedger(root, [
    { seq: 1, type: 'node-planned', node: 's1', kind: 'slice', title: 'slice 1' },
    { seq: 2, type: 'node-planned', node: 's1/retro', kind: 'phase', title: 'retro 1' },
  ]);
  const r = append(root, { type: 'node-dispatched', node: 's2/retro', kind: 'phase' });
  assert.equal(r.ok, false, 's2/retro was never planned — a same-id sibling elsewhere must not vouch for it');
  assert.match(r.error, /unplanned/);
});

check('append: a malformed Family-1 node path (whitespace segment) is rejected, never lands raw in the ledger', () => {
  const root = newEffort();
  const before = readLedgerLines(root).length;
  const r = append(root, { type: 'node-planned', node: 'has space/x', kind: 'phase', title: 'bad' });
  assert.equal(r.ok, false);
  assert.match(r.error, /malformed node path/);
  assert.equal(readLedgerLines(root).length, before, 'nothing appended');
});

check('append: a malformed report-* relative path (whitespace segment) is rejected, never lands raw in the ledger', () => {
  const root = newEffort();
  seedLedger(root, [
    { seq: 1, type: 'node-planned', node: 's1/WO-1', kind: 'work-order', title: 'wire it' },
    { seq: 2, type: 'node-dispatched', node: 's1/WO-1', kind: 'work-order', attempt: 1 },
  ]);
  const before = readLedgerLines(root).length;
  const r = append(root, { type: 'report-started', under: 'WO-1', node: 'impl/has space' });
  assert.equal(r.ok, false);
  assert.match(r.error, /malformed relative node path/);
  assert.equal(readLedgerLines(root).length, before, 'nothing appended');
});

// BUG 4 (self-nested node paths on a re-dispatched slice / second attempt): resolveFamily2
// must build `${under's path}/attempt-N/${relative segment}` by APPENDING only the segment,
// and must reject a caller that hands back an already-qualified path instead of a bare segment
// — on BOTH attempt-1 and attempt-2, since the real-world corruption only ever surfaced on a
// reopened (attempt-2) work order.

check('append: report-started on a reopened WO resolves under the live `[2]` sibling — clean, non-doubled', () => {
  const root = newEffort();
  seedLedger(root, [
    { seq: 1, type: 'node-planned', node: 's1/WO-1', kind: 'work-order', title: 'wire it' },
    { seq: 2, type: 'node-dispatched', node: 's1/WO-1', kind: 'work-order', attempt: 1 },
    { seq: 3, type: 'node-downgraded', node: 's1/WO-1' }, // seals the first attempt failed
  ]);
  // The reopen dispatch goes through the controller so it MINTS the sibling s1/WO-1[2].
  const d = append(root, { type: 'node-dispatched', node: 's1/WO-1', kind: 'work-order' });
  assert.equal(d.ok, true, d.error);
  assert.equal(d.event.node, 's1/WO-1[2]', 'the reopen dispatch mints the sibling, not a wrapper');
  assert.equal(d.event.attempt, 2);
  const r = append(root, { type: 'report-started', under: 'WO-1', node: 'audit/mutation-sampling' });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.event.attempt, 2);
  assert.equal(r.event.node, 's1/WO-1[2]/audit/mutation-sampling', 'the report lands under the live sibling — appended only the relative segment, no doubled prefix');
});

check('append: report-started rejects an already-qualified `node` (the full attempt path echoed back) on attempt-1', () => {
  const root = newEffort();
  seedLedger(root, [
    { seq: 1, type: 'node-planned', node: 's1/WO-1', kind: 'work-order', title: 'wire it' },
    { seq: 2, type: 'node-dispatched', node: 's1/WO-1', kind: 'work-order', attempt: 1 },
  ]);
  const before = readLedgerLines(root).length;
  const r = append(root, { type: 'report-started', under: 'WO-1', node: 's1/WO-1/attempt-1/audit/mutation-sampling' });
  assert.equal(r.ok, false, 'a self-qualified node must never silently double-nest');
  assert.match(r.error, /already-qualified path/);
  assert.equal(readLedgerLines(root).length, before, 'nothing appended');
});

check('append: report-started rejects an already-qualified `node` on attempt-2 (the exact BUG 4 shape)', () => {
  const root = newEffort();
  seedLedger(root, [
    { seq: 1, type: 'node-planned', node: 's1/WO-1', kind: 'work-order', title: 'wire it' },
    { seq: 2, type: 'node-dispatched', node: 's1/WO-1', kind: 'work-order', attempt: 1 },
    { seq: 3, type: 'node-downgraded', node: 's1/WO-1', attempt: 1 },
    { seq: 4, type: 'node-dispatched', node: 's1/WO-1', kind: 'work-order', attempt: 2 },
  ]);
  const before = readLedgerLines(root).length;
  // Mirrors the real ledger's malformed line: the caller echoed back the full qualified
  // slice/WO/attempt path instead of the bare "audit/mutation-sampling" segment.
  const r1 = append(root, { type: 'report-started', under: 'WO-1', node: 's1/WO-1/attempt-2/audit/mutation-sampling' });
  assert.equal(r1.ok, false);
  assert.match(r1.error, /already-qualified path/);
  // The other observed shape: qualified slice/WO prefix without the attempt segment.
  const r2 = append(root, { type: 'report-started', under: 'WO-1', node: 's1/WO-1/implementation' });
  assert.equal(r2.ok, false);
  assert.match(r2.error, /already-qualified path/);
  assert.equal(readLedgerLines(root).length, before, 'neither malformed call appended anything');
});

if (process.exitCode) console.error(`\nledger: FAILURES above (${passed} passed).`);
else console.log(`\nledger: all ${passed} checks passed. ✓`);
