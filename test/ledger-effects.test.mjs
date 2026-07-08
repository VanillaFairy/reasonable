// test/ledger-effects.test.mjs — pins the `effects` field integration on lib/ledger.mjs's
// validateEvent()/append() (DESIGN-3.0 §2.4 + §8; Plan 1 task T02, shared/interfaces.md).
//
// Scope: this file does NOT re-test lib/effects.mjs's own shape rules — test/effects.test.mjs
// already covers isNodeEffect/isEdgeEffect/validateEffects exhaustively. This file pins only the
// WIRING into the ledger controller:
//   - validateEvent() must call into validateEffects() exactly once, cross-cutting across every
//     event type (not hardcoded to one), STRICTLY AFTER that type's own required-field / kind /
//     custom-validate checks and before the final { ok: true } return.
//   - append() must carry a valid `effects` array through to the written ledger line verbatim
//     (including surviving the Family-1/Family-2 stamped.node/stamped.attempt rewrites), reject a
//     malformed one before any file write happens, and leave an event with no `effects` field at
//     all behaving exactly as it does today (no regression).
//
// RED-by-construction: today's validateEvent ignores unrecognized fields entirely, so every
// "malformed effects must be rejected" assertion below currently observes { ok: true } where it
// expects { ok: false } — that's an ASSERTION MISMATCH (a named FAIL line), not a module-load
// crash. If a crash shows up instead, something else is wrong; stop and look.

import assert from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { validateEvent, append } from '../lib/ledger.mjs';

const tmps = [];

function newEffort() {
  const root = mkdtempSync(join(tmpdir(), 'ledger-effects-test-'));
  tmps.push(root);
  mkdirSync(join(root, '.reasonable'), { recursive: true });
  return root;
}

// Copied verbatim (pattern) from test/ledger.test.mjs.
function seedLedger(root, events) {
  const body = events.map((e) => JSON.stringify(e)).join('\n') + (events.length ? '\n' : '');
  writeFileSync(join(root, '.reasonable', 'ledger.jsonl'), body);
}

function readLedgerLines(root) {
  const p = join(root, '.reasonable', 'ledger.jsonl');
  if (!existsSync(p)) return [];
  return readFileSync(p, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => JSON.parse(l));
}

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.stack || e.message}`); process.exitCode = 1; }
}

// ── validateEvent: accepts/rejects `effects`, pure, no I/O ─────────────────────────────────

check("validateEvent: a well-formed `effects` array is accepted on 'verdict' (Family 3, the loosest type)", () => {
  const r = validateEvent({ type: 'verdict', effects: [{ nodeId: 'atom-1', change: { kind: 'created' } }] });
  assert.equal(r.ok, true, r.error);
});

check("validateEvent: a well-formed `effects` array is ALSO accepted on 'node-completed' (Family 1 — proves the check isn't hardcoded to one type)", () => {
  const r = validateEvent({ type: 'node-completed', node: 'WO-1', effects: [{ from: 'a', to: 'b', edge: 'needs', op: 'add' }] });
  assert.equal(r.ok, true, r.error);
});

check("validateEvent: a malformed top-level `effects` (not an array) is rejected on 'verdict', error prefixed with the type", () => {
  const r = validateEvent({ type: 'verdict', effects: 'not-an-array' });
  assert.equal(r.ok, false);
  assert.match(r.error, /^verdict:/, 'error is prefixed with the event type');
});

check("validateEvent: a malformed `effects` entry (neither node nor edge shape) is rejected on 'node-completed' too — same wiring, different type", () => {
  const r = validateEvent({ type: 'node-completed', node: 'WO-1', effects: [{ foo: 'bar' }] });
  assert.equal(r.ok, false);
  assert.match(r.error, /^node-completed:/, 'error is prefixed with the event type');
  assert.match(r.error, /effects\[0\]/, 'the offending index is surfaced (documented sub-prefix)');
});

check('validateEvent: an empty `effects: []` array validates on its own (no entries to reject)', () => {
  assert.equal(validateEvent({ type: 'verdict', effects: [] }).ok, true);
});

// ── ordering: effects validation runs STRICTLY AFTER a type's own checks ──────────────────────
// shared/interfaces.md pins the new check's placement: "after the existing schema.validate check
// and before the final return { ok: true }" — i.e. after EVERY earlier gate the function already
// runs (the required-fields loop, the 'kind' enum check, and any per-type custom validate). An
// event that is invalid for its OWN reasons must report THAT error, never a coincidental effects
// complaint — even when its `effects` value would itself be malformed.

check('validateEvent: a missing required field wins over a malformed effects (node-completed needs node/workOrder)', () => {
  const r = validateEvent({ type: 'node-completed', effects: 'garbage-not-an-array' });
  assert.equal(r.ok, false);
  assert.match(r.error, /requires 'node' or 'workOrder'/, 'reports the missing-node error, not an effects error');
  assert.doesNotMatch(r.error, /effects/i, 'must not mention effects at all — the required-field check wins');
});

check('validateEvent: a different required-field failure (enrichment needs component) also wins over a malformed effects', () => {
  const r = validateEvent({ type: 'enrichment', effects: [{ foo: 'bar' }] });
  assert.equal(r.ok, false);
  assert.match(r.error, /missing required field 'component'/);
  assert.doesNotMatch(r.error, /effects/i);
});

check("validateEvent: a bad 'kind' enum value wins over a malformed effects", () => {
  const r = validateEvent({ type: 'node-dispatched', node: 'WO-1', kind: 'not-a-kind', effects: 'garbage' });
  assert.equal(r.ok, false);
  assert.match(r.error, /kind must be one of/);
  assert.doesNotMatch(r.error, /effects/i);
});

check("validateEvent: a type's own custom validate() (amendment's malformed `drops`) wins over a malformed effects", () => {
  const r = validateEvent({ type: 'amendment', drops: 'not-an-array', effects: 'also-not-an-array' });
  assert.equal(r.ok, false);
  assert.match(r.error, /'drops', when present, must be an array/);
  assert.doesNotMatch(r.error, /effects must be an array/, 'the drops-shape error wins, not the effects-shape one');
});

check("validateEvent: once a type's own checks all pass, a malformed effects DOES surface (proves the wiring actually runs, isn't dead code)", () => {
  // amendment with WELL-FORMED drops but malformed effects — nothing left to fail on except effects.
  const r = validateEvent({ type: 'amendment', drops: [{ workOrder: 'WO-1' }], effects: [{ foo: 'bar' }] });
  assert.equal(r.ok, false);
  assert.match(r.error, /^amendment:/);
  assert.match(r.error, /effects\[0\]/);
});

// ── append(): a valid `effects` array round-trips verbatim ────────────────────────────────────

check('append: a valid `effects` array lands in ledger.jsonl verbatim (Family 3, no node resolution involved)', () => {
  const root = newEffort();
  const effects = [
    { nodeId: 'atom-1', change: { kind: 'created' } },
    { from: 'atom-1', to: 'atom-2', edge: 'needs', op: 'add' },
  ];
  const r = append(root, { type: 'verdict', outcome: 'green', effects });
  assert.equal(r.ok, true, r.error);
  assert.deepStrictEqual(r.event.effects, effects, 'the returned stamped event carries effects verbatim');
  const stored = readLedgerLines(root).pop();
  assert.deepStrictEqual(stored.effects, effects, 'the WRITTEN ledger line carries effects verbatim');
});

check('append: a valid `effects` array survives Family-1 resolution — node/attempt get rewritten by the controller, effects does not', () => {
  const root = newEffort();
  seedLedger(root, [{ seq: 1, type: 'node-planned', node: 's1/WO-1', kind: 'work-order', title: 'wire it' }]);
  const effects = [{ nodeId: 'WO-1', change: 'dispatched' }];
  const r = append(root, { type: 'node-dispatched', workOrder: 'WO-1', kind: 'work-order', effects });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.event.attempt, 1, 'Family-1 attempt arithmetic still runs normally');
  assert.equal(r.event.node, 's1/WO-1', 'Family-1 node resolution still runs normally (workOrder -> real path)');
  assert.deepStrictEqual(r.event.effects, effects, 'effects survives the family-specific stamped.node/attempt rewrite untouched');
  const stored = readLedgerLines(root).pop();
  assert.deepStrictEqual(stored.effects, effects, 'the written line also carries effects verbatim');
});

check('append: a valid `effects` array survives Family-2 resolution (report-started) too', () => {
  const root = newEffort();
  seedLedger(root, [
    { seq: 1, type: 'node-planned', node: 's1/WO-1', kind: 'work-order', title: 'wire it' },
    { seq: 2, type: 'node-dispatched', node: 's1/WO-1', kind: 'work-order', attempt: 1 },
  ]);
  const effects = [{ from: 'a', to: 'b', edge: 'serves', op: 'add' }];
  const r = append(root, { type: 'report-started', under: 'WO-1', node: 'impl/x', effects });
  assert.equal(r.ok, true, r.error);
  assert.deepStrictEqual(r.event.effects, effects, 'effects survives Family-2\'s under/node resolution untouched');
  const stored = readLedgerLines(root).pop();
  assert.deepStrictEqual(stored.effects, effects);
});

// ── append(): a rejected `effects` array writes NOTHING to ledger.jsonl ────────────────────────

check('append: a malformed `effects` array is rejected on a brand-new effort — no ledger.jsonl is ever created', () => {
  const root = newEffort();
  const ledgerPath = join(root, '.reasonable', 'ledger.jsonl');
  const r = append(root, { type: 'verdict', effects: 'not-an-array' });
  assert.equal(r.ok, false);
  assert.equal(existsSync(ledgerPath), false, 'validation runs before any file is ever touched');
});

check('append: a malformed `effects` entry is rejected — the ledger file is byte-for-byte unchanged (read back, not just the return value)', () => {
  const root = newEffort();
  const seed = append(root, { type: 'verdict', outcome: 'seed' });
  assert.equal(seed.ok, true, seed.error);
  const ledgerPath = join(root, '.reasonable', 'ledger.jsonl');
  const before = readFileSync(ledgerPath, 'utf8');
  const r = append(root, { type: 'verdict', effects: [{ foo: 'bar' }] });
  assert.equal(r.ok, false, 'a malformed effects entry must reject the whole append');
  const after = readFileSync(ledgerPath, 'utf8');
  assert.equal(after, before, 'the ledger file is byte-for-byte unchanged after the rejected append');
  assert.equal(readLedgerLines(root).length, 1, 'still exactly the one seeded line — nothing partial landed');
});

// ── append(): an empty `effects: []` round-trips as `[]`, not stripped to absent ───────────────

check('append: an empty `effects: []` round-trips as `[]` on the written line, not stripped to absent', () => {
  const root = newEffort();
  const r = append(root, { type: 'verdict', effects: [] });
  assert.equal(r.ok, true, r.error);
  const stored = readLedgerLines(root).pop();
  assert.ok('effects' in stored, 'the effects key is present at all');
  assert.deepStrictEqual(stored.effects, [], 'an empty array stays [], never stripped/undefined');
});

// ── backward compatibility: no `effects` field behaves exactly as before ───────────────────────

check('append: an event with NO `effects` field behaves identically to today — ok, stamped, no effects key written', () => {
  const root = newEffort();
  const r = append(root, { type: 'verdict', outcome: 'green' });
  assert.equal(r.ok, true, r.error);
  const stored = readLedgerLines(root).pop();
  assert.equal(stored.seq, 1);
  assert.match(stored.ts, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?[+-]\d{2}:\d{2}$/, 'controller ts stamp unaffected');
  assert.ok(!('effects' in stored), 'no effects key appears when the caller never sent one');
});

check('append: seq/ts stamping is IDENTICAL whether or not `effects` is present — same numbering, same ts format, back to back', () => {
  const root = newEffort();
  const withoutEffects = append(root, { type: 'verdict', outcome: 'a' });
  const withEffects = append(root, { type: 'verdict', outcome: 'b', effects: [{ nodeId: 'atom-1', change: 'x' }] });
  assert.equal(withoutEffects.ok, true, withoutEffects.error);
  assert.equal(withEffects.ok, true, withEffects.error);
  const lines = readLedgerLines(root);
  assert.equal(lines[0].seq, 1);
  assert.equal(lines[1].seq, 2, 'seq numbering continues normally regardless of the effects field');
  const tsPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?[+-]\d{2}:\d{2}$/;
  assert.match(lines[0].ts, tsPattern);
  assert.match(lines[1].ts, tsPattern);
});

check('append: a Family-1 event with no `effects` field still runs attempt arithmetic exactly as before (no regression from the new check)', () => {
  const root = newEffort();
  seedLedger(root, [{ seq: 1, type: 'node-planned', node: 's1/WO-1', kind: 'work-order', title: 'wire it' }]);
  const r = append(root, { type: 'node-dispatched', workOrder: 'WO-1', kind: 'work-order' });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.event.attempt, 1);
  assert.equal(r.event.node, 's1/WO-1');
  assert.ok(!('effects' in r.event), 'no effects key when the caller never sent one');
});

for (const t of tmps) { try { rmSync(t, { recursive: true, force: true }); } catch { /* best effort */ } }

if (process.exitCode) console.error(`\nledger-effects: FAILURES above (${passed} passed).`);
else console.log(`\nledger-effects: all ${passed} checks passed. ✓`);
