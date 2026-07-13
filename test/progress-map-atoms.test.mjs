// test/progress-map-atoms.test.mjs — the 3.0 atom / verdict / degeneration events folded into the
// progress tree (DESIGN-3.0 §8; reasonable 3.0 Part 7, interfaces.md §6). EVENT_MAP handlers stay
// stateless (progress-map.mjs's own invariant) — every atom node is injected FLAT, keyed by atomId
// (the interfaces.md §6 grounding correction), never at a containment-nested path. Pure fold, zero I/O.
//
// Grounding correction (this task's own red pass): findByPath returns the NODE directly, never a
// {node, path} wrapper — verified against test/progress-map.test.mjs's real usage (`wo.status`,
// `displayStatus(wo)`, never `wo.node`). The original task-file draft assumed a wrapper shape; fixed
// here to match the real, shipped API.

import assert from 'node:assert';
import { foldEvents } from '../lib/progress-map.mjs';
import { findByPath, displayStatus } from '../lib/progress-tree.mjs';

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.stack || e.message}`); process.exitCode = 1; }
}

// ── atom-chartered ───────────────────────────────────────────────────────────

check('atom-chartered injects a pending node at the FLAT atomId path', () => {
  const tree = foldEvents([
    { seq: 1, type: 'atom-chartered', atomId: 'a-1', component: 'lexer', purpose: 'tokenize input', ts: '2026-07-11T00:00:00Z' },
  ], 'demo');
  const found = findByPath(tree, 'a-1');
  assert.ok(found, 'a-1 exists as a direct child of root');
  assert.strictEqual(displayStatus(found), 'pending');
});

// ── atom-delta-authored / delta-enrichment ────────────────────────────────────

check('atom-delta-authored adds a note to the atom node', () => {
  const tree = foldEvents([
    { seq: 1, type: 'atom-chartered', atomId: 'a-1', component: 'lexer', purpose: 'x', ts: '2026-07-11T00:00:00Z' },
    { seq: 2, type: 'atom-delta-authored', atomId: 'a-1', clauses: [{ clauseId: 'lexer#c1' }], ts: '2026-07-11T00:01:00Z' },
  ], 'demo');
  const found = findByPath(tree, 'a-1');
  assert.ok(found.notes.some((n) => /delta/i.test(n.text)));
});

check('delta-enrichment also adds a note to the atom node', () => {
  const tree = foldEvents([
    { seq: 1, type: 'atom-chartered', atomId: 'a-1', component: 'lexer', purpose: 'x', ts: '2026-07-11T00:00:00Z' },
    { seq: 2, type: 'delta-enrichment', atomId: 'a-1', clause: { clauseId: 'lexer#c2' }, ts: '2026-07-11T00:02:00Z' },
  ], 'demo');
  const found = findByPath(tree, 'a-1');
  assert.ok(found.notes.some((n) => /delta/i.test(n.text)));
});

// ── atom-transitioned: the lifecycle -> tree-status map ───────────────────────

check('atom-transitioned to "chartered"-adjacent states maps to pending/active/done/canceled correctly', () => {
  function transitionedStatus(to) {
    const tree = foldEvents([
      { seq: 1, type: 'atom-chartered', atomId: 'a-1', component: 'lexer', purpose: 'x', ts: '2026-07-11T00:00:00Z' },
      { seq: 2, type: 'atom-transitioned', atomId: 'a-1', from: 'chartered', to, ts: '2026-07-11T00:01:00Z' },
    ], 'demo');
    return displayStatus(findByPath(tree, 'a-1'));
  }
  assert.strictEqual(transitionedStatus('chartered'), 'pending');
  assert.strictEqual(transitionedStatus("spec'd"), 'active');
  assert.strictEqual(transitionedStatus('merged'), 'done');
  assert.strictEqual(transitionedStatus('retired'), 'canceled');
});

// ── atom-flag-set / atom-flag-cleared ──────────────────────────────────────────

check('atom-flag-set/cleared add notes naming the flag and the op', () => {
  const tree = foldEvents([
    { seq: 1, type: 'atom-chartered', atomId: 'a-1', component: 'lexer', purpose: 'x', ts: '2026-07-11T00:00:00Z' },
    { seq: 2, type: 'atom-flag-set', atomId: 'a-1', flag: 'frozen', reason: 'R2 blast radius', ts: '2026-07-11T00:01:00Z' },
    { seq: 3, type: 'atom-flag-cleared', atomId: 'a-1', flag: 'frozen', ts: '2026-07-11T00:02:00Z' },
  ], 'demo');
  const notes = findByPath(tree, 'a-1').notes.map((n) => n.text);
  assert.ok(notes.some((t) => /frozen/.test(t) && /set/i.test(t)));
  assert.ok(notes.some((t) => /frozen/.test(t) && /clear/i.test(t)));
});

// ── atom-verdict ───────────────────────────────────────────────────────────────

check('atom-verdict adds a note naming the verdict kind', () => {
  const tree = foldEvents([
    { seq: 1, type: 'atom-chartered', atomId: 'a-1', component: 'lexer', purpose: 'x', ts: '2026-07-11T00:00:00Z' },
    { seq: 2, type: 'atom-verdict', atomId: 'a-1', kind: 'checkpoint', effects: [], ts: '2026-07-11T00:01:00Z' },
  ], 'demo');
  const notes = findByPath(tree, 'a-1').notes.map((n) => n.text);
  assert.ok(notes.some((t) => /checkpoint/.test(t)));
});

// ── phase-degenerated ──────────────────────────────────────────────────────────

check('phase-degenerated injects a node showing the phase RAN and FOUND NOTHING, never a silent skip', () => {
  const tree = foldEvents([
    { seq: 1, type: 'phase-degenerated', phase: 'scaffold', reason: 'no new goal cone and no newly-chartered atom touches the outer shell', inputs: { newGoalIds: [], shellAtomIds: [] }, ts: '2026-07-11T00:00:00Z' },
  ], 'demo');
  const found = findByPath(tree, 'phase/scaffold');
  assert.ok(found, 'a node for the degenerated phase exists');
  const text = [found.label, ...found.notes.map((n) => n.text)].filter(Boolean).join(' ');
  assert.ok(/no new goal cone|ran|found nothing/i.test(text), 'the record shows WHY it degenerated, not a bare skip');
});

// ── id stability across a sequence (aggregation by id, no duplication) ────────

check('a chartered atom transitioned twice still has exactly ONE node at its flat path', () => {
  const tree = foldEvents([
    { seq: 1, type: 'atom-chartered', atomId: 'a-1', component: 'lexer', purpose: 'x', ts: '2026-07-11T00:00:00Z' },
    { seq: 2, type: 'atom-transitioned', atomId: 'a-1', from: 'chartered', to: 'ready', ts: '2026-07-11T00:01:00Z' },
    { seq: 3, type: 'atom-transitioned', atomId: 'a-1', from: 'ready', to: "spec'd", ts: '2026-07-11T00:02:00Z' },
  ], 'demo');
  assert.strictEqual(tree.children.filter((c) => c.id === 'a-1').length, 1);
});

// ── regression: an unmapped type still degrades to a plain note ──────────────

check('an unmapped event type still degrades to a plain note (legacyFallback untouched)', () => {
  const tree = foldEvents([{ seq: 1, type: 'some-legacy-type', node: '', ts: '2026-07-11T00:00:00Z' }], 'demo');
  assert.ok(tree.notes.some((n) => /some-legacy-type/.test(n.text)));
});

if (process.exitCode) console.error(`\nprogress-map-atoms: FAILURES above (${passed} passed).`);
else console.log(`\nprogress-map-atoms: all ${passed} checks passed. ✓`);
