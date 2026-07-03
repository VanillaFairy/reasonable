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
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { KINDS, EVENT_SCHEMAS, validateEvent, append } from '../lib/ledger.mjs';

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

check('append: report-started stamps seq + controller ts, resolves attempt-1 absolute node (fresh WO, no prior attempts)', () => {
  const root = newEffort();
  seedLedger(root, [
    { seq: 1, type: 'node-planned', node: 's1/WO-1', kind: 'work-order', title: 'wire the widget' },
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
  assert.match(stored.ts, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/, 'controller stamps its own ISO UTC clock');
  assert.equal(stored.node, 's1/WO-1/attempt-1/impl/§4', 'absolute node = path(under) + attempt-1 (no prior attempts) + relative');
  assert.equal(stored.under, 'WO-1', 'under is kept as provenance');
  // The returned stamped event must reflect the same ts-overwrite + resolved node (seq is assigned
  // inside the appendJsonl lock; whether the returned object also carries it back is left open —
  // see report's "ambiguities to escalate").
  assert.notEqual(r.event.ts, '1999-01-01T00:00:00.000Z');
  assert.equal(r.event.node, 's1/WO-1/attempt-1/impl/§4');
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

for (const t of tmps) { try { rmSync(t, { recursive: true, force: true }); } catch { /* best effort */ } }

if (process.exitCode) console.error(`\nledger: FAILURES above (${passed} passed).`);
else console.log(`\nledger: all ${passed} checks passed. ✓`);
