// Standalone test for lib/progress.mjs — node builtins only (no runner).
// Run: node test/progress.test.mjs
//
// Builds a synthetic .reasonable/ effort on disk and checks that the deterministic
// projection (work-orders ∪ journal ∪ ledger ∪ inbox) yields the right nested tree,
// renders it, and writes the mirror — and that it degrades gracefully on a bare effort.

import assert from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildModel, renderMarkdown, writeMirror } from '../lib/progress.mjs';

const tmps = [];
const write = (root, rel, content) => {
  const p = join(root, rel);
  mkdirSync(join(p, '..'), { recursive: true });
  writeFileSync(p, content);
};

function newEffort() {
  const root = mkdtempSync(join(tmpdir(), 'prog-test-'));
  tmps.push(root);
  mkdirSync(join(root, '.reasonable'), { recursive: true });
  return root;
}

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.stack || e.message}`); process.exitCode = 1; }
}

function seed(root) {
  write(root, '.reasonable/journal.json', JSON.stringify({
    effort: 'demo',
    currentVerticalSlice: 'slice-b',
    phase: 'vertical-slice-execution',
    cost: { agentsDispatched: 23, tokensSpent: 910000, updatedAt: '2026-06-27T12:00:00Z' },
    workOrders: {
      'WO-1': { status: 'merged', role: 'implementer', verticalSlice: 'slice-a' },
      'WO-2': { status: 'merged', role: 'implementer', verticalSlice: 'slice-b' },
      'WO-3': { status: 'dispatched', role: 'implementer', verticalSlice: 'slice-b' },
      'WO-4': { status: 'pending', role: 'implementer', verticalSlice: 'slice-b' },
    },
    inbox: [{ id: 'INBOX-1', kind: 'scope-expansion', class: 'ADVISORY' }],
  }));
  for (const [id, vs, output] of [
    ['WO-1', 'slice-a', 'parser core'],
    ['WO-2', 'slice-b', 'store defers delete until confirmed'],
    ['WO-3', 'slice-b', 'undo window'],
    ['WO-4', 'slice-b', 'audit'],
  ]) {
    write(root, `.reasonable/work-orders/${id}.json`, JSON.stringify({ id, role: 'implementer', verticalSlice: vs, output }));
  }
  for (const sid of ['slice-a', 'slice-b', 'slice-c']) {
    write(root, `.reasonable/vertical-slices/${sid}.md`, `# Vertical slice: ${sid}\n`);
  }
  const ledger = [
    { seq: 1, type: 'enrichment', component: 'parser', clauses: ['§3'], workOrder: 'WO-1', note: 'precedence' },
    { seq: 2, type: 'enrichment', component: 'store', clauses: ['§1'], workOrder: 'WO-2', note: 'defer semantics' },
    { seq: 3, type: 'characterization', component: 'store', clause: '§2', test: 'store::delete_ok', workOrder: 'WO-2' },
    { seq: 4, type: 'ratification', gate: 'analysis' }, // no workOrder — must not crash, not attach
  ].map((e) => JSON.stringify(e)).join('\n') + '\n';
  write(root, '.reasonable/ledger.jsonl', ledger);
}

// A — the projection shape.
check('projection: effort / cost / counts', () => {
  const root = newEffort(); seed(root);
  const m = buildModel(root);
  assert.equal(m.effort, 'demo');
  assert.equal(m.currentVerticalSlice, 'slice-b');
  assert.equal(m.cost.agentsDispatched, 23);
  assert.equal(m.counts.workOrders, 4);
  assert.equal(m.counts.workOrdersGreen, 2, 'WO-1 + WO-2 are merged');
  assert.equal(m.counts.atomicActions, 3, 'three ledger entries carry a workOrder');
});

check('projection: slices + derived statuses', () => {
  const root = newEffort(); seed(root);
  const m = buildModel(root);
  const byId = Object.fromEntries(m.slices.map((s) => [s.id, s]));
  assert.deepEqual(Object.keys(byId).sort(), ['slice-a', 'slice-b', 'slice-c']);
  assert.equal(byId['slice-a'].status, 'green', 'not current + all WOs merged');
  assert.equal(byId['slice-b'].status, 'active', 'is currentVerticalSlice');
  assert.equal(byId['slice-c'].status, 'pending', 'planned, no work orders');
});

check('projection: work orders + atomic actions hang off the right WO', () => {
  const root = newEffort(); seed(root);
  const m = buildModel(root);
  const sliceB = m.slices.find((s) => s.id === 'slice-b');
  assert.deepEqual(sliceB.children.map((w) => w.id), ['WO-2', 'WO-3', 'WO-4'], 'sorted, scoped to the slice');
  const wo2 = sliceB.children.find((w) => w.id === 'WO-2');
  assert.match(wo2.title, /store defers delete/);
  assert.equal(wo2.children.length, 2, 'enrichment + characterization');
  assert.match(wo2.children[0].title, /enriched store §1 — defer semantics/);
  assert.match(wo2.children[1].title, /characterized store §2 \(store::delete_ok\)/);
});

// B — the render.
check('render: markdown carries cost, slices, work orders, actions, inbox', () => {
  const root = newEffort(); seed(root);
  const md = renderMarkdown(buildModel(root));
  assert.match(md, /# reasonable · demo/);
  assert.match(md, /~23 agents · 910k tok/);
  assert.match(md, /\*\*slice-b\*\*/);
  assert.match(md, /`WO-3`/);
  assert.match(md, /✎ enriched parser §3 — precedence/);
  assert.match(md, /inbox: 1 awaiting you/);
});

// C — writeMirror materializes both files.
check('writeMirror writes progress.json + progress.md', () => {
  const root = newEffort(); seed(root);
  writeMirror(root);
  assert.ok(existsSync(join(root, '.reasonable', 'progress.json')), 'progress.json written');
  assert.ok(existsSync(join(root, '.reasonable', 'progress.md')), 'progress.md written');
  const j = JSON.parse(readFileSync(join(root, '.reasonable', 'progress.json'), 'utf8'));
  assert.equal(j.effort, 'demo');
  assert.equal(j.slices.length, 3);
});

// D — graceful on a bare effort (no journal/ledger/work-orders yet).
check('bare effort → empty tree, no throw', () => {
  const root = newEffort(); // .reasonable/ exists but is empty
  const m = buildModel(root);
  assert.equal(m.counts.workOrders, 0);
  assert.deepEqual(m.slices, []);
  assert.doesNotThrow(() => renderMarkdown(m));
});

for (const t of tmps) { try { rmSync(t, { recursive: true, force: true }); } catch { /* best effort */ } }

if (process.exitCode) console.error(`\nprogress: FAILURES above (${passed} passed).`);
else console.log(`\nprogress: all ${passed} checks passed. ✓`);
