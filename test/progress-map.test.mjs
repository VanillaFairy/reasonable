// Standalone test for lib/progress-map.mjs — node builtins only (no runner).
// Run: node test/progress-map.test.mjs
//
// Pins the EVENT_MAP fold contract: a ledger event type maps to tree op(s), folded
// through lib/progress-tree.mjs's apply() into a progress tree. Tests assert on
// BEHAVIOR — the resulting tree state, inspected via findByPath — never on the
// internal shape of the op objects an EVENT_MAP entry returns. That internal shape
// (what key names an op literal uses) is a private contract between progress-map.mjs
// and progress-tree.mjs's apply(); shared/interfaces.md never spells it out, so
// pinning it here would be over-specification of a choice the spec leaves open.
// (See "Ambiguities to escalate" in the task report for this and other open points.)
//
// Neither lib/progress-map.mjs nor lib/progress-tree.mjs exists yet — this file is
// authored RED, ahead of both. Expected failure: "Cannot find module" for one of them.

import assert from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';

import { EVENT_MAP, foldEvents, buildTree, writeMirror } from '../lib/progress-map.mjs';
import { findByPath } from '../lib/progress-tree.mjs';

const tmps = [];
function newEffort() {
  const root = mkdtempSync(join(tmpdir(), 'pmap-'));
  tmps.push(root);
  mkdirSync(join(root, '.reasonable'), { recursive: true });
  return root;
}
function writeLedger(root, events) {
  writeFileSync(join(root, '.reasonable', 'ledger.jsonl'), events.map((e) => JSON.stringify(e)).join('\n') + '\n');
}
function writeJournal(root, journal) {
  writeFileSync(join(root, '.reasonable', 'journal.json'), JSON.stringify(journal));
}
function writeInbox(root, inbox) {
  writeFileSync(join(root, '.reasonable', 'inbox.json'), JSON.stringify(inbox));
}

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.stack || e.message}`); process.exitCode = 1; }
}

// ── the reopen fixture (case 1 & case 8 share it) ───────────────────────────────────
// A work order is planned, dispatched, does real work (§4 finishes, §5 is left
// active), then crashes (downgraded) and is redispatched as attempt-2.
const WO = 'slice-1/WO-1';
function reopenEvents() {
  return [
    { seq: 1, type: 'node-planned', node: WO, kind: 'work-order', title: 'Build parser', ts: '2026-07-01T09:00:00Z' },
    { seq: 2, type: 'node-dispatched', node: WO, kind: 'work-order', attempt: 1, ts: '2026-07-01T09:00:01Z' },
    { seq: 3, type: 'report-started', node: `${WO}/attempt-1/implementation/§4`, label: '§4', ts: '2026-07-01T09:00:05Z' },
    { seq: 4, type: 'report-finished', node: `${WO}/attempt-1/implementation/§4`, ts: '2026-07-01T09:05:00Z' },
    { seq: 5, type: 'report-started', node: `${WO}/attempt-1/implementation/§5`, label: '§5', ts: '2026-07-01T09:05:05Z' },
    { seq: 6, type: 'node-downgraded', node: WO, attempt: 1, ts: '2026-07-01T09:10:00Z' },
    { seq: 7, type: 'node-dispatched', node: WO, kind: 'work-order', attempt: 2, ts: '2026-07-01T09:15:00Z' },
    { seq: 8, type: 'report-started', node: `${WO}/attempt-2/implementation/§4`, label: '§4', ts: '2026-07-01T09:15:05Z' },
  ];
}

// ═══ Case 1 — reopen acceptance (the spec's end-to-end) ════════════════════════════
check('reopen acceptance: crash + redispatch seals attempt-1, preserves its done work, opens attempt-2', () => {
  const tree = foldEvents(reopenEvents(), 'demo');

  const attempt1 = findByPath(tree, `${WO}/attempt-1`);
  assert.ok(attempt1, 'attempt-1 exists');
  assert.equal(attempt1.status, 'failed', 'attempt-1 sealed failed by the downgrade');
  assert.equal(attempt1.detail, 'lost-work crash');

  const doneLeaf = findByPath(tree, `${WO}/attempt-1/implementation/§4`);
  assert.ok(doneLeaf, '§4 leaf survives under the sealed attempt');
  assert.equal(doneLeaf.status, 'done', 'a TERMINAL descendant is never swept by the recursive seal');

  const strandedLeaf = findByPath(tree, `${WO}/attempt-1/implementation/§5`);
  assert.ok(strandedLeaf, '§5 leaf survives under the sealed attempt');
  assert.equal(strandedLeaf.status, 'failed', 'a non-terminal (active) descendant IS swept by the recursive seal');

  const attempt2 = findByPath(tree, `${WO}/attempt-2`);
  assert.ok(attempt2, 'attempt-2 exists after redispatch');

  const wo = findByPath(tree, WO);
  assert.ok(wo, 'the work-order node itself exists');
  assert.equal(wo.status, 'active', 'redispatch returns the WO node to active');
});

// ═══ Case 2 — checkpoint continuation ══════════════════════════════════════════════
check('checkpoint continuation: re-dispatching the SAME attempt is a continuation, not a new attempt', () => {
  const events = [
    { seq: 1, type: 'node-planned', node: 'slice-1/WO-2', kind: 'work-order', title: 'Undo window', ts: '2026-07-01T10:00:00Z' },
    { seq: 2, type: 'node-dispatched', node: 'slice-1/WO-2', kind: 'work-order', attempt: 1, ts: '2026-07-01T10:00:01Z' },
    { seq: 3, type: 'node-checkpointed', node: 'slice-1/WO-2', ts: '2026-07-01T10:05:00Z' },
    { seq: 4, type: 'node-dispatched', node: 'slice-1/WO-2', kind: 'work-order', attempt: 1, ts: '2026-07-01T10:10:00Z' },
  ];
  const tree = foldEvents(events, 'demo');
  const wo = findByPath(tree, 'slice-1/WO-2');
  assert.equal(wo.children.length, 1, 'exactly one attempt child, not two');
  assert.equal(wo.status, 'active', 'the WO is active again after the reclaim');
  const attempt1 = findByPath(tree, 'slice-1/WO-2/attempt-1');
  assert.ok(attempt1);
  assert.notEqual(attempt1.status, 'failed', 'no failed subtree from a mere checkpoint/reclaim cycle');
});

// ═══ Case 3 — every Family-1 type maps per the table ═══════════════════════════════
check('family-1: node-planned → pending, label = title', () => {
  const tree = foldEvents([{ seq: 1, type: 'node-planned', node: 'x', kind: 'work-order', title: 'Do the thing' }], 'demo');
  const n = findByPath(tree, 'x');
  assert.ok(n);
  assert.equal(n.status, 'pending');
  assert.equal(n.label, 'Do the thing');
});

check('family-1: node-checkpointed → pending + detail "checkpointed"', () => {
  const tree = foldEvents([
    { seq: 1, type: 'node-planned', node: 'x', kind: 'work-order', title: 'T' },
    { seq: 2, type: 'node-checkpointed', node: 'x' },
  ], 'demo');
  const n = findByPath(tree, 'x');
  assert.equal(n.status, 'pending');
  assert.equal(n.detail, 'checkpointed');
});

check('family-1: node-completed → done (statusTs from ts)', () => {
  const tree = foldEvents([
    { seq: 1, type: 'node-planned', node: 'x', kind: 'work-order', title: 'T' },
    { seq: 2, type: 'node-completed', node: 'x', ts: '2026-07-01T11:00:00Z' },
  ], 'demo');
  const n = findByPath(tree, 'x');
  assert.equal(n.status, 'done');
  assert.equal(n.statusTs, '2026-07-01T11:00:00Z');
});

check('family-1: node-failed → failed + reason as detail', () => {
  const tree = foldEvents([
    { seq: 1, type: 'node-planned', node: 'x', kind: 'work-order', title: 'T' },
    { seq: 2, type: 'node-failed', node: 'x', reason: 'walked off a cliff', ts: '2026-07-01T11:00:00Z' },
  ], 'demo');
  const n = findByPath(tree, 'x');
  assert.equal(n.status, 'failed');
  assert.equal(n.detail, 'walked off a cliff');
});

check('family-1: node-canceled → canceled, recursive over non-terminal descendants', () => {
  const tree = foldEvents([
    { seq: 1, type: 'node-planned', node: 'x', kind: 'work-order', title: 'T' },
    { seq: 2, type: 'node-dispatched', node: 'x', kind: 'work-order', attempt: 1 },
    { seq: 3, type: 'report-started', node: 'x/attempt-1/implementation/§1', label: '§1' },
    { seq: 4, type: 'node-canceled', node: 'x', reason: 'scope cut' },
  ], 'demo');
  const n = findByPath(tree, 'x');
  assert.equal(n.status, 'canceled');
  assert.equal(n.detail, 'scope cut');
  const leaf = findByPath(tree, 'x/attempt-1/implementation/§1');
  assert.equal(leaf.status, 'canceled', 'the active leaf is swept along recursively');
});

check('family-1: concluded → the effort root goes done', () => {
  const tree = foldEvents([{ seq: 1, type: 'concluded' }], 'demo');
  const root = findByPath(tree, '');
  assert.equal(root.status, 'done');
});

check('family-1: approval-resolved → a note on the root, never structure', () => {
  const tree = foldEvents([{ seq: 1, type: 'approval-resolved', id: 'INBOX-3' }], 'demo');
  const root = findByPath(tree, '');
  assert.ok(root.notes.some((n) => n.text === 'approval resolved: INBOX-3'));
});

// ═══ Case 4 — a redispatch seals WITHOUT clobbering an existing crash detail ═══════
check('node-dispatched attempt>1 reseals the prior attempt but never overwrites its existing crash detail', () => {
  const events = [
    { seq: 1, type: 'node-planned', node: 'x', kind: 'work-order', title: 'T' },
    { seq: 2, type: 'node-dispatched', node: 'x', kind: 'work-order', attempt: 1 },
    { seq: 3, type: 'node-downgraded', node: 'x', attempt: 1 },
    { seq: 4, type: 'node-dispatched', node: 'x', kind: 'work-order', attempt: 2 },
  ];
  const tree = foldEvents(events, 'demo');
  const attempt1 = findByPath(tree, 'x/attempt-1');
  assert.equal(attempt1.status, 'failed');
  assert.equal(attempt1.detail, 'lost-work crash', "node-dispatched's own seal carries no detail — the downgrade's crash detail must survive");
});

// ═══ Case 5 — Family-2 worker reports (already-absolute node paths) ════════════════
check('family-2: report-started → injects + active, label + statusTs from the event', () => {
  const tree = foldEvents([
    { seq: 1, type: 'node-planned', node: 'x', kind: 'work-order', title: 'T' },
    { seq: 2, type: 'node-dispatched', node: 'x', kind: 'work-order', attempt: 1 },
    { seq: 3, type: 'report-started', node: 'x/attempt-1/implementation/§7', label: '§7', ts: '2026-07-01T12:00:00Z' },
  ], 'demo');
  const leaf = findByPath(tree, 'x/attempt-1/implementation/§7');
  assert.ok(leaf, 'the report inject-creates the leaf');
  assert.equal(leaf.status, 'active');
  assert.equal(leaf.label, '§7');
  assert.equal(leaf.statusTs, '2026-07-01T12:00:00Z');
});

check('family-2: report-started activates every ancestor container along the way, not just the leaf', () => {
  const tree = foldEvents([
    { seq: 1, type: 'node-planned', node: 'x', kind: 'work-order', title: 'T' },
    { seq: 2, type: 'node-dispatched', node: 'x', kind: 'work-order', attempt: 1 },
    { seq: 3, type: 'report-started', node: 'x/attempt-1/implementation/§7', label: '§7' },
  ], 'demo');
  assert.equal(findByPath(tree, 'x').status, 'active', 'the work order itself');
  assert.equal(findByPath(tree, 'x/attempt-1').status, 'active',
    'the attempt-1 container — this is the reported bug: it used to stay "· pending" while real work ran underneath it');
  assert.equal(findByPath(tree, 'x/attempt-1/implementation').status, 'active', 'the intermediate section folder too');
});

check('family-2: ancestor activation never resurrects an ancestor that has already reached a terminal status', () => {
  const tree = foldEvents([
    { seq: 1, type: 'node-planned', node: 'x', kind: 'work-order', title: 'T' },
    { seq: 2, type: 'node-dispatched', node: 'x', kind: 'work-order', attempt: 1 },
    { seq: 3, type: 'node-downgraded', node: 'x', attempt: 1 }, // seals x/attempt-1 failed
    { seq: 4, type: 'report-started', node: 'x/attempt-1/late-straggler', label: 'late' },
  ], 'demo');
  assert.equal(findByPath(tree, 'x/attempt-1').status, 'failed',
    'a sealed attempt must stay failed — ancestor activation only ever promotes a PENDING ancestor, never a terminal one');
});

check('family-2: report-finished → done', () => {
  const tree = foldEvents([
    { seq: 1, type: 'node-planned', node: 'x', kind: 'work-order', title: 'T' },
    { seq: 2, type: 'node-dispatched', node: 'x', kind: 'work-order', attempt: 1 },
    { seq: 3, type: 'report-started', node: 'x/attempt-1/implementation/§7', label: '§7' },
    { seq: 4, type: 'report-finished', node: 'x/attempt-1/implementation/§7', ts: '2026-07-01T12:05:00Z' },
  ], 'demo');
  const leaf = findByPath(tree, 'x/attempt-1/implementation/§7');
  assert.equal(leaf.status, 'done');
});

check('family-2: report-canceled → canceled + reason as detail', () => {
  const tree = foldEvents([
    { seq: 1, type: 'node-planned', node: 'x', kind: 'work-order', title: 'T' },
    { seq: 2, type: 'node-dispatched', node: 'x', kind: 'work-order', attempt: 1 },
    { seq: 3, type: 'report-started', node: 'x/attempt-1/implementation/§7', label: '§7' },
    { seq: 4, type: 'report-canceled', node: 'x/attempt-1/implementation/§7', reason: 'no longer needed' },
  ], 'demo');
  const leaf = findByPath(tree, 'x/attempt-1/implementation/§7');
  assert.equal(leaf.status, 'canceled');
  assert.equal(leaf.detail, 'no longer needed');
});

// ═══ Case 6 — Family-3 domain events fold to exactly one note ══════════════════════
check('family-3: enrichment with a node notes THAT node, formatted like actionLine, never split', () => {
  const tree = foldEvents([
    { seq: 1, type: 'node-planned', node: 'x', kind: 'work-order', title: 'T' },
    { seq: 2, type: 'enrichment', node: 'x', component: 'parser', clauses: ['§3', '§4'], ts: '2026-07-01T13:00:00Z' },
  ], 'demo');
  const n = findByPath(tree, 'x');
  assert.equal(n.children.length, 0, 'a domain note gains no tree structure');
  assert.equal(n.notes.length, 1, 'exactly one note — no enrichmentChildren fragment splitting');
  assert.equal(n.notes[0].text, 'enriched parser §3,§4');
});

check('family-3: enrichment with the SINGULAR `clause` field (not `clauses`) still folds — actionLine()\'s clausesOf() fallback ports verbatim', () => {
  const tree = foldEvents([
    { seq: 1, type: 'node-planned', node: 'x', kind: 'work-order', title: 'T' },
    { seq: 2, type: 'enrichment', node: 'x', component: 'parser', clause: '§7', ts: '2026-07-01T13:02:00Z' },
  ], 'demo');
  const n = findByPath(tree, 'x');
  assert.equal(n.children.length, 0, 'a domain note gains no tree structure');
  assert.equal(n.notes.length, 1, 'exactly one note, same shape as the plural-clauses case');
  assert.equal(n.notes[0].text, 'enriched parser §7', "clausesOf()'s singular-clause fallback wraps `clause` in a one-element array, same as `clauses: ['§7']` would");
});

check('family-3: an event with NO node notes the effort root', () => {
  const tree = foldEvents([
    { seq: 1, type: 'verdict', kind: 'reject', bindingConstraint: 'no-fabricated-data', ts: '2026-07-01T13:05:00Z' },
  ], 'demo');
  const root = findByPath(tree, '');
  assert.ok(root.notes.some((n) => n.text === 'verdict: reject (no-fabricated-data)'));
});

check('family-3: commit notes with the actionLine default format — never the legacy "type · workOrder" fallback', () => {
  const tree = foldEvents([
    { seq: 1, type: 'node-planned', node: 'x', kind: 'work-order', title: 'T' },
    { seq: 2, type: 'commit', node: 'x', workOrder: 'WO-9' },
  ], 'demo');
  const n = findByPath(tree, 'x');
  const text = n.notes[n.notes.length - 1].text;
  assert.equal(text, 'commit', 'a KNOWN Family-3 type uses its own formatter, never the legacy fallback (which would append " · WO-9")');
});

check('family-3: dead-end notes "dead-end → <knowledge>"', () => {
  const tree = foldEvents([
    { seq: 1, type: 'node-planned', node: 'x', kind: 'work-order', title: 'T' },
    { seq: 2, type: 'dead-end', node: 'x', knowledge: 'API rate-limited beyond usable throughput' },
  ], 'demo');
  const n = findByPath(tree, 'x');
  assert.ok(n.notes.some((note) => note.text === 'dead-end → API rate-limited beyond usable throughput'));
});

// ═══ Case 7 — legacy / unknown types degrade to a plain note, no structure ═════════
check('legacy: action-started/-finished/-obsoleted fold to "<type> · <workOrder>" notes, no structure', () => {
  const tree = foldEvents([
    { seq: 1, type: 'node-planned', node: 'x', kind: 'work-order', title: 'T' },
    { seq: 2, type: 'action-started', node: 'x', workOrder: 'WO-5', level: 'section', label: 'implementation' },
    { seq: 3, type: 'action-finished', node: 'x', workOrder: 'WO-5', level: 'section', label: 'implementation' },
    { seq: 4, type: 'action-obsoleted', node: 'x', workOrder: 'WO-5', level: 'item', ref: '§9' },
  ], 'demo');
  const n = findByPath(tree, 'x');
  assert.equal(n.children.length, 0, 'legacy events never reconstruct section/item structure');
  assert.deepEqual(n.notes.map((note) => note.text), [
    'action-started · WO-5',
    'action-finished · WO-5',
    'action-obsoleted · WO-5',
  ]);
});

check('legacy: an unknown made-up type with no node notes the root, "<type> · <workOrder>"', () => {
  const tree = foldEvents([{ seq: 1, type: 'mystery-event', workOrder: 'WO-2' }], 'demo');
  const root = findByPath(tree, '');
  assert.equal(root.children.length, 0, 'no structure gained from an unaddressable legacy event');
  assert.ok(root.notes.some((n) => n.text === 'mystery-event · WO-2'));
});

check('legacy: an unknown type with no node and no workOrder notes the root with just the type, no dangling separator', () => {
  const tree = foldEvents([{ seq: 1, type: 'totally-unknown' }], 'demo');
  const root = findByPath(tree, '');
  assert.equal(root.children.length, 0);
  assert.ok(root.notes.some((n) => n.text === 'totally-unknown'));
});

// ═══ Orphan sweep — a terminal transition closes stray ACTIVE descendants (lost-finish) ══
// A sub-report starts but its own finish event is lost (e.g. node-path drift stamps the finish
// onto a differently-pathed twin), so it lingers ▶active under a node that later completes. The
// parent's terminal transition must sweep the orphan closed — no stale "active 4h ago" leaf under
// a ✓done parent — while SPARING pending (never-run) descendants.
check('orphan sweep: report-finished closes a stray ACTIVE descendant whose own finish was lost', () => {
  const tree = foldEvents([
    { seq: 1, type: 'node-planned', node: 'x', kind: 'work-order', title: 'T' },
    { seq: 2, type: 'node-dispatched', node: 'x', kind: 'work-order', attempt: 1 },
    { seq: 3, type: 'report-started', node: 'x/attempt-1/audit/mutation-sampling', label: 'mutation-sampling' },
    { seq: 4, type: 'report-started', node: 'x/attempt-1/audit/mutation-sampling/run', label: 'run', ts: '2026-07-01T15:01:00Z' },
    { seq: 5, type: 'report-finished', node: 'x/attempt-1/audit/mutation-sampling', ts: '2026-07-01T15:10:00Z' },
  ], 'demo');
  assert.equal(findByPath(tree, 'x/attempt-1/audit/mutation-sampling').status, 'done', 'the finished node is done');
  assert.equal(findByPath(tree, 'x/attempt-1/audit/mutation-sampling/run').status, 'done',
    'the orphaned in-flight `run` child (its own finish lost) is swept done — no stale ▶active leaf under a ✓done parent');
});

check('orphan sweep spares a PENDING descendant: node-completed must not fake-complete a never-run step', () => {
  const tree = foldEvents([
    { seq: 1, type: 'node-planned', node: 'x', kind: 'work-order', title: 'T' },
    { seq: 2, type: 'report-started', node: 'x/live', label: 'live' },              // active, finish lost
    { seq: 3, type: 'node-planned', node: 'x/todo', kind: 'step', title: 'Todo' },  // pending, never started
    { seq: 4, type: 'node-completed', node: 'x', ts: '2026-07-01T16:00:00Z' },
  ], 'demo');
  assert.equal(findByPath(tree, 'x').status, 'done');
  assert.equal(findByPath(tree, 'x/live').status, 'done', 'an orphaned ACTIVE child is swept done');
  assert.equal(findByPath(tree, 'x/todo').status, 'pending', 'a PENDING child is SPARED — never-run work is not fake-completed');
});

check('orphan sweep: node-failed sweeps its stray ACTIVE descendants to failed', () => {
  const tree = foldEvents([
    { seq: 1, type: 'node-planned', node: 'x', kind: 'slice', title: 'Slice' },
    { seq: 2, type: 'report-started', node: 'x/wo/attempt-1', label: 'wo' },        // active
    { seq: 3, type: 'node-failed', node: 'x', reason: 'slice failed', ts: '2026-07-01T16:51:00Z' },
  ], 'demo');
  assert.equal(findByPath(tree, 'x').status, 'failed');
  assert.equal(findByPath(tree, 'x/wo/attempt-1').status, 'failed',
    'an in-flight descendant of a FAILED node is swept failed, not left ▶active');
});

// ═══ Case 8 — fold order-independence (sorts a COPY, never mutates the input) ══════
check('out-of-order seq: a shuffled input array folds to the IDENTICAL tree, and is left unmutated', () => {
  const inOrder = reopenEvents();
  const shuffled = reopenEvents().reverse(); // independent object graph from inOrder — seq values intact
  const before = shuffled.map((e) => ({ ...e }));

  const treeInOrder = foldEvents(inOrder, 'demo');
  const treeShuffled = foldEvents(shuffled, 'demo');

  assert.deepStrictEqual(treeShuffled, treeInOrder, 'seq — not array position — determines fold order');
  assert.deepStrictEqual(shuffled, before, "foldEvents must not sort (or otherwise mutate) the caller's array in place");
});

// ═══ Case 9 — buildTree: root label from journal.effort, else basename(root) ═══════
check('buildTree: root label is journal.effort when present', () => {
  const root = newEffort();
  writeJournal(root, { effort: 'demo-effort' });
  writeLedger(root, [{ seq: 1, type: 'node-planned', node: 'x', kind: 'work-order', title: 'T' }]);
  const tree = buildTree(root);
  assert.equal(tree.label, 'demo-effort');
});

check('buildTree: root label falls back to basename(root) with no journal.effort', () => {
  const root = newEffort();
  writeLedger(root, [{ seq: 1, type: 'node-planned', node: 'x', kind: 'work-order', title: 'T' }]);
  const tree = buildTree(root);
  assert.equal(tree.label, basename(root));
});

// ═══ Case 10 — writeMirror: both files, cost line, counts line, inbox banner ═══════
check('writeMirror: writes progress.json (tree + counts) and progress.md (header/counts/body/inbox)', () => {
  const root = newEffort();
  writeJournal(root, { effort: 'acme', cost: { agentsDispatched: 5, tokensSpent: 12345 } });
  writeLedger(root, [
    { seq: 1, type: 'node-planned', node: 'slice-1', kind: 'slice', title: 'Slice One' },
    { seq: 2, type: 'node-completed', node: 'slice-1' },
    { seq: 3, type: 'node-planned', node: 'slice-2', kind: 'slice', title: 'Slice Two' },
    { seq: 4, type: 'node-dispatched', node: 'slice-2', kind: 'slice', attempt: 1 },
  ]);
  writeInbox(root, { items: [{ id: 'INBOX-1', kind: 'topology-smell' }] });

  writeMirror(root);

  assert.ok(existsSync(join(root, '.reasonable', 'progress.json')));
  assert.ok(existsSync(join(root, '.reasonable', 'progress.md')));

  const j = JSON.parse(readFileSync(join(root, '.reasonable', 'progress.json'), 'utf8'));
  assert.ok(j.counts, 'progress.json carries a counts object');
  assert.equal(j.counts.done, 1, 'slice-1 is done');
  // slice-2 AND its freshly-opened slice-2/attempt-1 are both active — a container is never
  // left showing pending while the attempt underneath it is doing real work.
  assert.equal(j.counts.active, 2, 'slice-2 is active, and so is its attempt-1 child');
  assert.equal(j.counts.failed, 0);
  // Tree data lives either spread at the top level or nested under .tree — interfaces.md's
  // phrasing ("the tree, plus {counts}") does not pin which, so tolerate either reading.
  const treeRoot = Array.isArray(j.children) ? j : j.tree;
  assert.ok(treeRoot && Array.isArray(treeRoot.children), 'progress.json also carries the tree itself');

  const md = readFileSync(join(root, '.reasonable', 'progress.md'), 'utf8');
  assert.match(md, /^# reasonable · acme.*~5 agents.*tok/m, 'header carries the effort name and, since journal.cost is set, a cost segment');
  assert.match(md, /1\/3 done/, 'counts line: 1 of 3 non-root nodes done');
  assert.match(md, /2 active/, 'counts line: 2 active (slice-2 + its attempt-1 child)');
  assert.match(md, /0 failed/, 'counts line: 0 failed');
  assert.match(md, /Slice One/);
  assert.match(md, /Slice Two/);
  assert.match(md, /inbox: 1 awaiting you/, 'inbox banner present — inbox.json has one item');
  assert.match(md, /topology-smell/, 'inbox banner names the item kind');
});

check('writeMirror: no cost segment when journal.cost is absent; no inbox banner when inbox.json is absent or empty', () => {
  const root = newEffort();
  writeJournal(root, { effort: 'acme2' });
  writeLedger(root, [{ seq: 1, type: 'node-planned', node: 'x', kind: 'work-order', title: 'T' }]);
  writeMirror(root);
  const md = readFileSync(join(root, '.reasonable', 'progress.md'), 'utf8');
  assert.match(md, /# reasonable · acme2/);
  assert.doesNotMatch(md, /agents/, 'no cost segment with no journal.cost');
  assert.doesNotMatch(md, /inbox:/, 'no inbox banner with no inbox.json');

  writeInbox(root, { items: [] });
  writeMirror(root);
  const md2 = readFileSync(join(root, '.reasonable', 'progress.md'), 'utf8');
  assert.doesNotMatch(md2, /inbox:/, 'no inbox banner when inbox.json items is empty');
});

// ═══ Case 11 — fail-open: no ledger at all ═════════════════════════════════════════
check('writeMirror: an effort with NO ledger.jsonl still writes both mirrors (empty tree), never throws', () => {
  const root = newEffort(); // .reasonable/ exists, nothing else in it
  assert.doesNotThrow(() => writeMirror(root));
  assert.ok(existsSync(join(root, '.reasonable', 'progress.json')));
  assert.ok(existsSync(join(root, '.reasonable', 'progress.md')));
  const j = JSON.parse(readFileSync(join(root, '.reasonable', 'progress.json'), 'utf8'));
  const treeRoot = Array.isArray(j.children) ? j : j.tree;
  assert.ok(treeRoot, 'still a (empty) tree, not a crash');
  assert.deepEqual(treeRoot.children || [], [], 'nothing folded in — an empty tree');
});

// ═══ EVENT_MAP: export + shape (unit-level, no fold) ═══════════════════════════════
// Deliberately does NOT inspect the internal shape of the op objects an EVENT_MAP
// entry returns — only that an entry exists, that it produces an array, and (where
// the spec states an exact count) how MANY ops it produces.
const FAMILY_1 = ['node-planned', 'node-dispatched', 'node-checkpointed', 'node-downgraded', 'node-completed', 'node-failed', 'node-canceled', 'approval-resolved', 'concluded'];
const FAMILY_2 = ['report-started', 'report-finished', 'report-canceled'];
const FAMILY_3 = ['enrichment', 'amendment', 'characterization', 'characterization-promotion', 'change-characterized', 'change-characterized-planned', 'verdict', 'verifier-verdict', 'scope-expansion', 'budget-extension', 'dead-end', 'ratification', 'intent-check-failure', 'commit'];

check('EVENT_MAP: has a function entry for every Family-1/2/3 event type', () => {
  for (const type of [...FAMILY_1, ...FAMILY_2, ...FAMILY_3]) {
    assert.equal(typeof EVENT_MAP[type], 'function', `EVENT_MAP["${type}"] must be a function`);
  }
});

check('EVENT_MAP: report-started(e) returns a non-empty ops array (unit-level, no fold)', () => {
  const ops = EVENT_MAP['report-started']({ type: 'report-started', node: 'x/attempt-1/implementation/§1', label: '§1', ts: '2026-07-01T00:00:00Z' });
  assert.ok(Array.isArray(ops));
  assert.ok(ops.length > 0);
});

check('EVENT_MAP: every Family-3 type maps to EXACTLY one op', () => {
  for (const type of FAMILY_3) {
    const ops = EVENT_MAP[type]({ type, node: 'x', ts: '2026-07-01T00:00:00Z' });
    assert.ok(Array.isArray(ops), `${type}: must return an array`);
    assert.equal(ops.length, 1, `${type}: Family-3 events fold to exactly one note op`);
  }
});

check('EVENT_MAP: enrichment stays ONE op even with a multi-fragment note (no enrichmentChildren splitting)', () => {
  const ops = EVENT_MAP['enrichment']({
    type: 'enrichment', node: 'x', component: 'graph-store', clauses: ['§8', '§9'],
    note: '§8 does X. §9 does Y. Declared Input Seam: foo, not a constant. 12 tests passing, tsc clean.',
  });
  assert.ok(Array.isArray(ops));
  assert.equal(ops.length, 1);
});

check('EVENT_MAP: node-dispatched with attempt>1 returns MORE ops than attempt=1 (the extra seal-prior-attempt op)', () => {
  const first = EVENT_MAP['node-dispatched']({ type: 'node-dispatched', node: 'x', kind: 'work-order', attempt: 1 });
  const redispatch = EVENT_MAP['node-dispatched']({ type: 'node-dispatched', node: 'x', kind: 'work-order', attempt: 2 });
  assert.ok(Array.isArray(first) && Array.isArray(redispatch));
  assert.ok(redispatch.length > first.length, 'attempt>1 adds the seal-prior-attempt op on top of the always-run ones');
});

// ═══ Audit follow-up (T02d) — Finding 1: stale `detail` must clear on normal transitions ═══
// A checkpoint→reclaim→complete sequence must not leave a DONE node's `detail` stuck on
// 'checkpointed' forever — node-dispatched's "set active" op and node-completed's op must
// each pass `detail: null` so a stale annotation from an earlier state never survives.
check('finding1: checkpoint→reclaim→complete clears the stale "checkpointed" detail, not leaves it forever', () => {
  const events = [
    { seq: 1, type: 'node-planned', node: 'x', kind: 'work-order', title: 'T' },
    { seq: 2, type: 'node-dispatched', node: 'x', kind: 'work-order', attempt: 1 },
    { seq: 3, type: 'node-checkpointed', node: 'x' },
    { seq: 4, type: 'node-dispatched', node: 'x', kind: 'work-order', attempt: 1 },
    { seq: 5, type: 'node-completed', node: 'x', ts: '2026-07-01T14:00:00Z' },
  ];
  const tree = foldEvents(events, 'demo');
  const n = findByPath(tree, 'x');
  assert.equal(n.status, 'done');
  assert.equal(n.detail, null, 'node-completed must clear a stale detail (e.g. "checkpointed") left by an earlier state — not leave it hanging on a DONE node forever');
});

// ═══ Audit follow-up (T02d) — Finding 2: an event's ops must apply atomically ═══
// A corrupted node-dispatched event (attempt: '3 ', a string with a trailing space) makes
// op1 (seal attempt-2 failed) SUCCEED — creating a phantom "attempt-2" node with no basis in
// real work — before op2 (inject attempt-3, using the malformed string as a path segment)
// THROWS. The whole event must apply all-or-nothing: no phantom subtree survives, the real
// attempt-1 subtree is untouched, later valid events on other nodes still apply, and a
// fold-error note lands for the corrupted event.
check('finding2: a corrupted multi-op event applies atomically — no phantom subtree from a partially-applied event', () => {
  const events = [
    { seq: 1, type: 'node-planned', node: 'x', kind: 'work-order', title: 'T' },
    { seq: 2, type: 'node-dispatched', node: 'x', kind: 'work-order', attempt: 1 },
    { seq: 3, type: 'node-dispatched', node: 'x', kind: 'work-order', attempt: '3 ' },
    { seq: 4, type: 'node-planned', node: 'y', kind: 'work-order', title: 'Y' },
  ];
  const tree = foldEvents(events, 'demo');

  const phantom = findByPath(tree, 'x/attempt-2');
  assert.equal(phantom, null, 'a corrupted event that throws partway through its ops must leave NO trace — no phantom attempt-2 node from the op that succeeded before the throw');

  const attempt1 = findByPath(tree, 'x/attempt-1');
  assert.ok(attempt1, 'the real attempt-1 subtree, established by the earlier valid event, must survive completely unaffected');
  assert.equal(attempt1.label, 'attempt 1');

  const y = findByPath(tree, 'y');
  assert.ok(y, 'a later valid event on a DIFFERENT node still applies correctly after the corrupted event');
  assert.equal(y.status, 'pending');
  assert.equal(y.label, 'Y');

  const root = findByPath(tree, '');
  assert.ok(root.notes.some((note) => note.text.startsWith('[fold error]') && note.text.includes('node-dispatched')), 'the corrupted event degrades to a fold-error note instead of silently vanishing');
});

// ═══ Audit follow-up (T02d) — Finding 3: Family-3 formatted note TEXT, pinned per type ═══
// Only enrichment/verdict/commit/dead-end had a test asserting the actual `.text` string
// before this round. These ten round out the rest of formatText()'s switch.
check('family-3 text: amendment → "amended <component> <clauses> (<direction>)"', () => {
  const tree = foldEvents([
    { seq: 1, type: 'node-planned', node: 'x', kind: 'work-order', title: 'T' },
    { seq: 2, type: 'amendment', node: 'x', component: 'parser', clauses: ['§2'], direction: 'strengthen' },
  ], 'demo');
  const n = findByPath(tree, 'x');
  assert.equal(n.notes[0].text, 'amended parser §2 (strengthen)');
});

check('family-3 text: characterization → "characterized <component> <clauses> (<test>)"', () => {
  const tree = foldEvents([
    { seq: 1, type: 'node-planned', node: 'x', kind: 'work-order', title: 'T' },
    { seq: 2, type: 'characterization', node: 'x', component: 'parser', clauses: ['§5'], test: 'test_parser_basic' },
  ], 'demo');
  const n = findByPath(tree, 'x');
  assert.equal(n.notes[0].text, 'characterized parser §5 (test_parser_basic)');
});

check('family-3 text: characterization-promotion → "promoted <component> <clauses> FLOOR→TRUSTED"', () => {
  const tree = foldEvents([
    { seq: 1, type: 'node-planned', node: 'x', kind: 'work-order', title: 'T' },
    { seq: 2, type: 'characterization-promotion', node: 'x', component: 'parser', clauses: ['§5'] },
  ], 'demo');
  const n = findByPath(tree, 'x');
  assert.equal(n.notes[0].text, 'promoted parser §5 FLOOR→TRUSTED');
});

check('family-3 text: change-characterized → "superseded <component> <clauses>"', () => {
  const tree = foldEvents([
    { seq: 1, type: 'node-planned', node: 'x', kind: 'work-order', title: 'T' },
    { seq: 2, type: 'change-characterized', node: 'x', component: 'parser', clauses: ['§5'] },
  ], 'demo');
  const n = findByPath(tree, 'x');
  assert.equal(n.notes[0].text, 'superseded parser §5');
});

check('family-3 text: change-characterized-planned → same "superseded" formatter as change-characterized', () => {
  const tree = foldEvents([
    { seq: 1, type: 'node-planned', node: 'x', kind: 'work-order', title: 'T' },
    { seq: 2, type: 'change-characterized-planned', node: 'x', component: 'parser', clauses: ['§6'] },
  ], 'demo');
  const n = findByPath(tree, 'x');
  assert.equal(n.notes[0].text, 'superseded parser §6');
});

check('family-3 text: verifier-verdict → "adversary <verdict> <component>"', () => {
  const tree = foldEvents([
    { seq: 1, type: 'node-planned', node: 'x', kind: 'work-order', title: 'T' },
    { seq: 2, type: 'verifier-verdict', node: 'x', verdict: 'reject', component: 'parser' },
  ], 'demo');
  const n = findByPath(tree, 'x');
  assert.equal(n.notes[0].text, 'adversary reject parser');
});

check('family-3 text: scope-expansion → "scope +[<addedLocus...>]"', () => {
  const tree = foldEvents([
    { seq: 1, type: 'node-planned', node: 'x', kind: 'work-order', title: 'T' },
    { seq: 2, type: 'scope-expansion', node: 'x', addedLocus: ['lib/foo.mjs', 'lib/bar.mjs'] },
  ], 'demo');
  const n = findByPath(tree, 'x');
  assert.equal(n.notes[0].text, 'scope +[lib/foo.mjs, lib/bar.mjs]');
});

check('family-3 text: budget-extension → "budget +1 (extension <n>)"', () => {
  const tree = foldEvents([
    { seq: 1, type: 'node-planned', node: 'x', kind: 'work-order', title: 'T' },
    { seq: 2, type: 'budget-extension', node: 'x', extension: 2 },
  ], 'demo');
  const n = findByPath(tree, 'x');
  assert.equal(n.notes[0].text, 'budget +1 (extension 2)');
});

check('family-3 text: ratification → "ratified <gate> gate"', () => {
  const tree = foldEvents([
    { seq: 1, type: 'node-planned', node: 'x', kind: 'work-order', title: 'T' },
    { seq: 2, type: 'ratification', node: 'x', gate: 'scaffold' },
  ], 'demo');
  const n = findByPath(tree, 'x');
  assert.equal(n.notes[0].text, 'ratified scaffold gate');
});

check('family-3 text: intent-check-failure → "intent-check miss: <correctedChoice>"', () => {
  const tree = foldEvents([
    { seq: 1, type: 'node-planned', node: 'x', kind: 'work-order', title: 'T' },
    { seq: 2, type: 'intent-check-failure', node: 'x', correctedChoice: 'chose B instead of A' },
  ], 'demo');
  const n = findByPath(tree, 'x');
  assert.equal(n.notes[0].text, 'intent-check miss: chose B instead of A');
});

// ═══ Audit follow-up (T02d) — Finding 4: malformed-historical-event degrade path ═══
// A malformed event must degrade to a note instead of crashing the whole fold, and the
// events immediately before/after it must still apply correctly.
check('finding4a: a malformed node-completed (invalid whitespace path segment) degrades to a note; before/after events still apply', () => {
  const events = [
    { seq: 1, type: 'node-planned', node: 'x', kind: 'work-order', title: 'Before' },
    { seq: 2, type: 'node-completed', node: 'bad node', ts: '2026-07-01T15:00:00Z' },
    { seq: 3, type: 'node-planned', node: 'y', kind: 'work-order', title: 'After' },
  ];
  assert.doesNotThrow(() => foldEvents(events, 'demo'), 'a malformed historical event must never crash the whole fold');
  const tree = foldEvents(events, 'demo');

  const before = findByPath(tree, 'x');
  assert.ok(before, 'the event immediately before the malformed one still applied');
  assert.equal(before.status, 'pending');

  const after = findByPath(tree, 'y');
  assert.ok(after, 'the event immediately after the malformed one still applied');
  assert.equal(after.status, 'pending');

  const root = findByPath(tree, '');
  assert.ok(root.notes.some((note) => note.text.startsWith('[fold error]')), 'the malformed event degrades to a fold-error note instead of vanishing silently');
});

check('finding4b: a malformed report-started (missing node field entirely) degrades to a note; before/after events still apply', () => {
  const events = [
    { seq: 1, type: 'node-planned', node: 'x', kind: 'work-order', title: 'Before' },
    { seq: 2, type: 'report-started', label: 'orphan report' }, // no `node`/`under` field at all
    { seq: 3, type: 'node-planned', node: 'y', kind: 'work-order', title: 'After' },
  ];
  assert.doesNotThrow(() => foldEvents(events, 'demo'), 'a malformed historical event must never crash the whole fold');
  const tree = foldEvents(events, 'demo');

  const before = findByPath(tree, 'x');
  assert.ok(before, 'the event immediately before the malformed one still applied');
  assert.equal(before.status, 'pending');

  const after = findByPath(tree, 'y');
  assert.ok(after, 'the event immediately after the malformed one still applied');
  assert.equal(after.status, 'pending');

  const root = findByPath(tree, '');
  assert.ok(root.notes.some((note) => note.text.startsWith('[fold error]') && note.text.includes('report-started')), 'the malformed event degrades to a fold-error note instead of vanishing silently');
});

// ═══ Audit follow-up (T02d) — Finding 5: EVENT_MAP lookup must guard prototype pollution ═══
// A bare `EVENT_MAP[e.type]` lookup resolves 'constructor' to an INHERITED Object.prototype
// member instead of falling through to the unknown-type legacy fallback. It must degrade to
// the same "<type> · <workOrder>" note any other unknown type gets — not a confusing internal
// error produced by treating the inherited member as a mapper function.
check('finding5: an event type colliding with an inherited Object.prototype member ("constructor") falls through to the normal legacy fallback note', () => {
  const events = [{ seq: 1, type: 'constructor', workOrder: 'WO-1' }];
  assert.doesNotThrow(() => foldEvents(events, 'demo'), 'a prototype-colliding type must never crash the whole fold');
  const tree = foldEvents(events, 'demo');
  const root = findByPath(tree, '');
  assert.ok(root.notes.some((note) => note.text === 'constructor · WO-1'), 'must resolve via Object.hasOwn to the unknown-type legacy fallback ("constructor · WO-1"), never an inherited Object.prototype member treated as a mapper');
});

for (const t of tmps) { try { rmSync(t, { recursive: true, force: true }); } catch { /* best effort */ } }

if (process.exitCode) console.error(`\nprogress-map: FAILURES above (${passed} passed).`);
else console.log(`\nprogress-map: all ${passed} checks passed. ✓`);
