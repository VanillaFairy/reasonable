// test/ledger-atom-verdict.test.mjs — the atom-verdict append-path wiring (DESIGN-3.0 §2.4, §7.2;
// reasonable 3.0 Part 7, interfaces.md §2). append() code-computes the provisional effect set for an
// atom-verdict event, exactly as it code-computes `seq` — no caller, and not the workflow, ever
// authors an effect set. Real .reasonable/ effort, real ledger, real append() — mirrors
// test/ledger-effects.test.mjs's harness verbatim.

import assert from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { validateEvent, append } from '../lib/ledger.mjs';
import { computeVerdictEffects } from '../lib/rewrite.mjs';
import { deriveCurrent } from '../lib/graph.mjs';

const tmps = [];

function newEffort() {
  const root = mkdtempSync(join(tmpdir(), 'ledger-atom-verdict-test-'));
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

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.stack || e.message}`); process.exitCode = 1; }
}

// ── schema shape ─────────────────────────────────────────────────────────────

check("validateEvent: 'atom-verdict' requires atomId + kind", () => {
  assert.equal(validateEvent({ type: 'atom-verdict', atomId: 'a-1', kind: 'checkpoint' }).ok, true);
  assert.equal(validateEvent({ type: 'atom-verdict', kind: 'checkpoint' }).ok, false);
  assert.equal(validateEvent({ type: 'atom-verdict', atomId: 'a-1' }).ok, false);
});

check("validateEvent: 'phase-degenerated' requires phase", () => {
  assert.equal(validateEvent({ type: 'phase-degenerated', phase: 'scaffold', reason: 'x', inputs: {} }).ok, true);
  assert.equal(validateEvent({ type: 'phase-degenerated' }).ok, false);
});

// ── the happy path: the CONTROLLER computes the effects, matching a direct computeVerdictEffects call ──

check('append: atom-verdict code-computes provisional effects, matching computeVerdictEffects on the same state', () => {
  const root = newEffort();
  seedLedger(root, [{ seq: 1, type: 'atom-chartered', component: 'lexer', premises: [], purpose: 'x', locus: [], order: 0 }]);

  const verdict = { atomId: 'a-1', kind: 'checkpoint', evidence: 'budget exhausted' };
  const stateForExpectation = deriveCurrent(root, { goals: [] }); // the SAME snapshot append() builds
  const expected = computeVerdictEffects(verdict, { ...stateForExpectation, priorVerdicts: [] });
  assert.equal(expected.ok, true, expected.error);

  const r = append(root, { type: 'atom-verdict', ...verdict });
  assert.equal(r.ok, true, r.error);
  assert.deepStrictEqual(r.event.effects, expected.provisional, 'the stamped effects match the pure calculus on the same snapshot');

  const stored = readLedgerLines(root).pop();
  assert.deepStrictEqual(stored.effects, expected.provisional, 'the WRITTEN line also carries the code-computed effects');
});

// ── fail-closed on an unknown/illegal verdict kind (§7.2 Totality) ─────────────

check('append: an unknown verdict kind HALTs — ok:false, nothing written', () => {
  const root = newEffort();
  seedLedger(root, [{ seq: 1, type: 'atom-chartered', component: 'lexer', premises: [], purpose: 'x', locus: [], order: 0 }]);
  const before = readFileSync(join(root, '.reasonable', 'ledger.jsonl'), 'utf8');

  const r = append(root, { type: 'atom-verdict', atomId: 'a-1', kind: 'not-a-real-kind' });
  assert.equal(r.ok, false);

  const after = readFileSync(join(root, '.reasonable', 'ledger.jsonl'), 'utf8');
  assert.equal(after, before, 'the ledger file is byte-for-byte unchanged after a HALTed atom-verdict');
});

// ── the no-model-in-the-loop boundary: a caller-supplied effects lie is OVERWRITTEN ────────────

check('append: a caller-supplied `effects` on an atom-verdict is OVERWRITTEN, never trusted', () => {
  const root = newEffort();
  seedLedger(root, [{ seq: 1, type: 'atom-chartered', component: 'lexer', premises: [], purpose: 'x', locus: [], order: 0 }]);

  const lie = [{ nodeId: 'a-1', change: { state: 'merged' } }]; // a lie: a-1 never merged
  const r = append(root, { type: 'atom-verdict', atomId: 'a-1', kind: 'checkpoint', evidence: 'x', effects: lie });
  assert.equal(r.ok, true, r.error);
  assert.notDeepStrictEqual(r.event.effects, lie, 'the caller-supplied effects must be replaced');
  assert.deepStrictEqual(r.event.effects, [
    { nodeId: 'a-1', change: { state: 'ready', reprice: { factor: 'α' }, evidence: 'x' } },
  ], 'the controller-computed R1 checkpoint effect is what actually lands');
});

// ── pendingPermanent is recorded, not applied ─────────────────────────────────

check('append: a verdict with a non-empty permanent set records it as pendingPermanent, NOT folded into effects', () => {
  const root = newEffort();
  seedLedger(root, [{ seq: 1, type: 'atom-chartered', component: 'lexer', premises: [], purpose: 'x', locus: [], order: 0 }]);

  // R3 ripple is the honest fixture for this invariant: unlike oversized (whose retirement is
  // PROVISIONAL — `retired-pending` — so its permanent set is empty by design, per shipped
  // lib/rewrite.mjs ruleOversized), ruleRipple genuinely returns BOTH a non-empty provisional (the
  // atom's dispatch-barred SET) and a non-empty permanent (the dispatch-barred CLEAR, ratified at a
  // gate). An empty manifest keeps the fixture minimal — no owner/foreign clauses to seed.
  const verdict = { atomId: 'a-1', kind: 'ripple', manifest: [] };
  const r = append(root, { type: 'atom-verdict', ...verdict });
  assert.equal(r.ok, true, r.error);
  assert.ok(Array.isArray(r.event.pendingPermanent), 'pendingPermanent is present on the stamped event');
  assert.ok(r.event.pendingPermanent.length > 0, 'ripple carries a non-empty permanent set (the ratified dispatch-bar clear)');
  // effects (provisional) is the dispatch-barred SET; pendingPermanent is the dispatch-barred CLEAR —
  // the same nodeId appears in both, but as distinct changes. The invariant: pendingPermanent is its
  // OWN field, never merged element-for-element into effects.
  assert.notDeepStrictEqual(r.event.effects, r.event.pendingPermanent, 'effects and pendingPermanent are distinct arrays');
});

// ── existing event types unaffected ───────────────────────────────────────────

check('append: the live 2.x `verdict` type (work-order-keyed) is completely unaffected by this branch', () => {
  const root = newEffort();
  const r = append(root, { type: 'verdict', outcome: 'green' });
  assert.equal(r.ok, true, r.error);
  assert.ok(!('pendingPermanent' in r.event), 'no pendingPermanent leaks onto an unrelated event type');
});

for (const t of tmps) { try { rmSync(t, { recursive: true, force: true }); } catch { /* best effort */ } }

if (process.exitCode) console.error(`\nledger-atom-verdict: FAILURES above (${passed} passed).`);
else console.log(`\nledger-atom-verdict: all ${passed} checks passed. ✓`);
