// Standalone test for lib/progress.mjs — node builtins only (no runner).
// Run: node test/progress.test.mjs
//
// Builds a synthetic .reasonable/ effort on disk and checks that the deterministic
// projection (work-orders ∪ journal ∪ ledger ∪ inbox) yields the right nested tree,
// renders it, and writes the mirror — and that it degrades gracefully on a bare effort.

import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildModel, renderMarkdown, writeMirror } from '../lib/progress.mjs';

const LIB = join(dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'progress.mjs');

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

// E — effort scoping: the --hook regen attributes to the WRITTEN artifact, never cwd, so
// a repo hosting several efforts (each its own .reasonable/) never cross-writes mirrors.
check('effort-scoped: a journal write regenerates ONLY that effort (multi-effort repo)', () => {
  const base = mkdtempSync(join(tmpdir(), 'prog-multi-')); tmps.push(base);
  const A = join(base, 'effort-a'), B = join(base, 'effort-b');
  for (const r of [A, B]) {
    mkdirSync(join(r, '.reasonable'), { recursive: true });
    writeFileSync(join(r, '.reasonable', 'journal.json'), JSON.stringify({ effort: r.endsWith('a') ? 'A' : 'B', workOrders: {} }));
  }
  // PostToolUse payload for a write to A's journal — cwd deliberately set to B.
  execFileSync('node', [LIB, '--hook'], {
    input: JSON.stringify({ tool_name: 'Write', tool_input: { file_path: join(A, '.reasonable', 'journal.json') }, cwd: B }),
    stdio: ['pipe', 'pipe', 'pipe'], timeout: 15000,
  });
  assert.ok(existsSync(join(A, '.reasonable', 'progress.md')), "A's mirror regenerated (its journal changed)");
  assert.ok(!existsSync(join(B, '.reasonable', 'progress.md')), "B's mirror untouched, even though cwd was B");
});

// F — a coincidental journal.json outside .reasonable/ must NOT trigger a regen.
check('non-canonical journal.json (wrong parent) → no regen', () => {
  const root = newEffort(); seed(root);
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(join(root, 'src', 'journal.json'), '{}');
  execFileSync('node', [LIB, '--hook'], {
    input: JSON.stringify({ tool_name: 'Write', tool_input: { file_path: join(root, 'src', 'journal.json') }, cwd: root }),
    stdio: ['pipe', 'pipe', 'pipe'], timeout: 15000,
  });
  assert.ok(!existsSync(join(root, '.reasonable', 'progress.md')), 'a journal.json under src/ is not a canonical artifact');
});

// G — the ephemeral live channel (D19 tier-2) merges on top of the projection.
const liveLines = (...rows) => rows.map((r) => JSON.stringify(r)).join('\n') + '\n';

check('live merge: latest heartbeat per key attaches to its WO; effort-level for no-WO; TTL drops stale', () => {
  const root = newEffort(); seed(root);
  const NOW = Date.parse('2026-06-27T12:10:00Z');
  const iso = (msAgo) => new Date(NOW - msAgo).toISOString();
  write(root, '.reasonable/progress-live.jsonl', liveLines(
    { key: 'WO-3', wo: 'WO-3', stage: 'implement', role: 'implementer', tool: 'Edit', target: 'src/ChoiceEdge.tsx', ts: iso(8000) },
    { key: 'WO-3', wo: 'WO-3', stage: 'adjudicate', role: 'adjudicator', tool: 'Bash', target: 'npx vitest run', ts: iso(2000) }, // newer → wins
    { key: '@reconciler', wo: null, stage: 'reconcile', role: 'reconciler', tool: 'Bash', target: 'git rev-list …', ts: iso(3000) },
    { key: 'WO-STALE', wo: 'WO-STALE', stage: 'implement', role: 'implementer', tool: 'Edit', target: 'x', ts: iso(20 * 60 * 1000) }, // > TTL
  ));
  const m = buildModel(root, { now: NOW });
  const wo3 = m.slices.find((s) => s.id === 'slice-b').children.find((w) => w.id === 'WO-3');
  assert.ok(wo3.live, 'WO-3 carries a live heartbeat');
  assert.equal(wo3.live.stage, 'adjudicate', 'latest line per key wins (append-ordered)');
  assert.equal(wo3.live.tool, 'Bash');
  assert.ok(m.live.some((l) => l.stage === 'reconcile'), 'a no-work-order heartbeat surfaces at effort level');
  assert.ok(!m.live.some((l) => l.wo === 'WO-STALE'), 'a heartbeat older than the TTL is dropped');
  assert.equal(m.counts.live, 2, 'WO-3 (attached) + reconciler (effort); stale dropped');
});

check('live merge: a heartbeat older than journal.lastReconciled is ignored (reset on reconcile)', () => {
  const root = newEffort();
  const NOW = Date.parse('2026-06-27T12:10:00Z');
  write(root, '.reasonable/journal.json', JSON.stringify({
    effort: 'demo', currentVerticalSlice: 's', lastReconciled: new Date(NOW - 1000).toISOString(),
    workOrders: { 'WO-1': { status: 'dispatched', role: 'implementer', verticalSlice: 's' } },
  }));
  // First: only a heartbeat that PREDATES the last reconcile — must be ignored.
  write(root, '.reasonable/progress-live.jsonl', liveLines(
    { key: 'WO-1', wo: 'WO-1', stage: 'implement', role: 'implementer', tool: 'Edit', target: 'pre', ts: new Date(NOW - 5000).toISOString() },
  ));
  let wo1 = buildModel(root, { now: NOW }).slices[0].children[0];
  assert.ok(!wo1.live, 'a heartbeat older than lastReconciled is not shown');
  // Then: a post-reconcile heartbeat shows.
  write(root, '.reasonable/progress-live.jsonl', liveLines(
    { key: 'WO-1', wo: 'WO-1', stage: 'implement', role: 'implementer', tool: 'Edit', target: 'pre', ts: new Date(NOW - 5000).toISOString() },
    { key: 'WO-1', wo: 'WO-1', stage: 'implement', role: 'implementer', tool: 'Edit', target: 'fresh', ts: new Date(NOW - 200).toISOString() },
  ));
  wo1 = buildModel(root, { now: NOW }).slices[0].children[0];
  assert.ok(wo1.live && wo1.live.target === 'fresh', 'a post-reconcile heartbeat shows');
});

check('render: live heartbeats render as ⟳ now lines (per-WO + effort-level), with a literal [HH:MM:SS] timestamp', () => {
  const root = newEffort(); seed(root);
  const NOW = Date.parse('2026-06-27T12:10:00Z');
  write(root, '.reasonable/progress-live.jsonl', liveLines(
    { key: 'WO-3', wo: 'WO-3', stage: 'implement', role: 'implementer', tool: 'Edit', target: 'src/ChoiceEdge.tsx', ts: new Date(NOW - 3000).toISOString() },
    { key: '@reconciler', wo: null, stage: 'reconcile', role: 'reconciler', tool: 'Bash', target: 'git rev-list …', ts: new Date(NOW - 1000).toISOString() },
  ));
  const md = renderMarkdown(buildModel(root, { now: NOW }));
  assert.match(md, /▶ implement {2,}\[12:09:57\] ⟳ Edit src\/ChoiceEdge\.tsx/, 'per-WO heartbeat folds into the active stage, time-prefixed');
  assert.match(md, /\[12:09:59\] ⟳ \*\*now\*\* · reconcile · Bash git rev-list/, 'effort-level heartbeat line, time-prefixed');
  assert.doesNotMatch(md, /ago/, 'no stale relative age — literal timestamps only');
});

// G2 — atomic-action lines carry the same literal [HH:MM:SS] prefix, sliced from the
// ledger entry's ts; an action with no ts degrades to no prefix (never a crash, never NaN).
check('render: action lines are time-prefixed from the ledger ts; tsless action → no prefix', () => {
  const root = newEffort();
  write(root, '.reasonable/journal.json', JSON.stringify({
    effort: 'demo', currentVerticalSlice: 's',
    workOrders: { 'WO-1': { status: 'dispatched', role: 'implementer', verticalSlice: 's' } },
  }));
  write(root, '.reasonable/ledger.jsonl', liveLines(
    { seq: 1, type: 'enrichment', component: 'edge-path', clauses: ['§8'], workOrder: 'WO-1', note: 'autoRoute bypass', ts: '2026-06-27T09:04:11Z' },
    { seq: 2, type: 'commit', workOrder: 'WO-1' }, // no ts → graceful, no prefix
  ));
  const md = renderMarkdown(buildModel(root));
  assert.match(md, /\[09:04:11\] ✎ enriched edge-path §8 — autoRoute bypass/, 'ledger ts prefixes the action line');
  assert.match(md, /- ✎ commit/, 'a tsless action renders with no time prefix, no NaN');
  assert.doesNotMatch(md, /\[NaN/, 'never a NaN timestamp');
});

// H — the FROZEN-WAVE fix end to end (D19 acceptance #1). The exact state the user
// observed: a wave just started — the write-ahead has set currentVerticalSlice + flipped
// this wave's work orders to `dispatched`, NO ledger action has landed yet (the implementer
// is mid-run), and a live heartbeat shows the current stage. Before the fix this rendered
// `pending` with currentVerticalSlice:null; now it reads active + the live stage.
check('frozen-wave fix: write-ahead journal + live heartbeat → active slice + WO + current stage', () => {
  const root = newEffort();
  const NOW = Date.parse('2026-06-27T12:10:00Z');
  // The journal state the per-wave write-ahead produces (no ledger entries yet).
  write(root, '.reasonable/journal.json', JSON.stringify({
    effort: 'fireside', currentVerticalSlice: 'choice-edge', phase: 'vertical-slice-execution',
    workOrders: {
      'WO-A': { status: 'dispatched', role: 'implementer', verticalSlice: 'choice-edge' },
      'WO-B': { status: 'dispatched', role: 'implementer', verticalSlice: 'choice-edge' },
    },
  }));
  // A live heartbeat: WO-A is mid-implement (a 6-minute implementer's Edit).
  write(root, '.reasonable/progress-live.jsonl', liveLines(
    { key: 'WO-A', wo: 'WO-A', stage: 'implement', role: 'implementer', tool: 'Edit', target: 'src/ChoiceEdge.tsx', ts: new Date(NOW - 4000).toISOString() },
  ));
  const m = buildModel(root, { now: NOW });
  assert.equal(m.currentVerticalSlice, 'choice-edge', 'slice is current, not null');
  const slice = m.slices.find((s) => s.id === 'choice-edge');
  assert.equal(slice.status, 'active', 'slice reads active, NOT pending (the frozen-wave bug)');
  const woA = slice.children.find((w) => w.id === 'WO-A');
  assert.equal(woA.status, 'dispatched', 'WO flipped to dispatched by the write-ahead');
  assert.ok(woA.live && woA.live.stage === 'implement', 'and shows its current stage live');
  // The rendered mirror a pinned human sees: active slice, the WO, its pipeline scaffold,
  // and the live tool folded into the current (implement) stage.
  const md = renderMarkdown(m);
  assert.match(md, /slice \*\*choice-edge\*\*/);
  assert.match(md, /▶ \*\*choice-edge\*\*  _\(active\)_/, 'active glyph on the slice');
  assert.match(md, /- ✓ provision/, 'a reached stage shows done in the scaffold');
  assert.match(md, /- ▶ implement {2,}\[12:09:56\] ⟳ Edit src\/ChoiceEdge\.tsx/, 'live stage + tool folded into the active pipeline stage');
  assert.match(md, /- · blind-test/, 'a not-yet-reached stage shows pending');
  assert.match(md, /- · audit/, 'the final stage is pending');
  assert.doesNotMatch(md, /choice-edge\*\*  _\(pending\)_/, 'the slice is never shown pending');
});

// I — the per-WO pipeline scaffold: a dispatched WO renders the fixed stage checklist with
// stages before the live one DONE, the live stage ACTIVE (carrying the heartbeat), later
// stages PENDING. Unevidenced conditional stages (characterize / intent-verify) are HIDDEN
// (the projection never predicts a stage that may not run).
check('pipeline: dispatched WO → done<active<pending, conditionals hidden when unevidenced', () => {
  const root = newEffort();
  const NOW = Date.parse('2026-06-27T12:10:00Z');
  write(root, '.reasonable/journal.json', JSON.stringify({
    effort: 'demo', currentVerticalSlice: 's',
    workOrders: { 'WO-1': { status: 'dispatched', role: 'implementer', verticalSlice: 's' } },
  }));
  write(root, '.reasonable/progress-live.jsonl', liveLines(
    { key: 'WO-1', wo: 'WO-1', stage: 'blind-test', role: 'blind-test-writer', tool: 'Write', target: 'edge.test.ts', ts: new Date(NOW - 1000).toISOString() },
  ));
  const wo = buildModel(root, { now: NOW }).slices[0].children[0];
  assert.deepEqual(wo.pipeline.map((p) => p.stage), ['provision', 'implement', 'blind-test', 'adjudicate', 'audit'], 'backbone only — characterize/intent-verify hidden');
  const byStage = Object.fromEntries(wo.pipeline.map((p) => [p.stage, p.status]));
  assert.equal(byStage.provision, 'done', 'a stage before the live one is done');
  assert.equal(byStage.implement, 'done');
  assert.equal(byStage['blind-test'], 'active', 'the live stage is active');
  assert.equal(byStage.adjudicate, 'pending', 'a stage after the live one is pending');
  assert.equal(byStage.audit, 'pending');
});

// J — a merged WO: every backbone stage is done (no active, no pending).
check('pipeline: merged WO → every backbone stage done', () => {
  const root = newEffort();
  write(root, '.reasonable/journal.json', JSON.stringify({
    effort: 'demo', currentVerticalSlice: 's',
    workOrders: { 'WO-1': { status: 'merged', role: 'implementer', verticalSlice: 's' } },
  }));
  const wo = buildModel(root).slices[0].children[0];
  assert.deepEqual(wo.pipeline.map((p) => p.stage), ['provision', 'implement', 'blind-test', 'adjudicate', 'audit']);
  assert.ok(wo.pipeline.every((p) => p.status === 'done'), 'all stages done on a merged WO');
});

// K — evidence-gated conditionals: a characterization action surfaces `characterize`, a
// verifier-verdict surfaces `intent-verify`, each at its canonical position, marked done.
check('pipeline: conditional stages appear (in order) only when the ledger evidences them', () => {
  const root = newEffort();
  const NOW = Date.parse('2026-06-27T12:10:00Z');
  write(root, '.reasonable/journal.json', JSON.stringify({
    effort: 'bf', currentVerticalSlice: 's',
    workOrders: { 'WO-1': { status: 'dispatched', role: 'implementer', verticalSlice: 's' } },
  }));
  write(root, '.reasonable/ledger.jsonl', liveLines(
    { seq: 1, type: 'characterization', component: 'legacy', clause: '§1', workOrder: 'WO-1', ts: '2026-06-27T11:00:00Z' },
    { seq: 2, type: 'enrichment', component: 'legacy', clauses: ['§2'], workOrder: 'WO-1', ts: '2026-06-27T11:05:00Z' },
    { seq: 3, type: 'verifier-verdict', component: 'legacy', verdict: 'accept', workOrder: 'WO-1', ts: '2026-06-27T11:06:00Z' },
  ));
  write(root, '.reasonable/progress-live.jsonl', liveLines(
    { key: 'WO-1', wo: 'WO-1', stage: 'adjudicate', role: 'adjudicator', tool: 'Bash', target: 'vitest', ts: new Date(NOW - 1000).toISOString() },
  ));
  const wo = buildModel(root, { now: NOW }).slices[0].children[0];
  assert.deepEqual(
    wo.pipeline.map((p) => p.stage),
    ['provision', 'characterize', 'implement', 'intent-verify', 'blind-test', 'adjudicate', 'audit'],
    'both conditionals woven in at their canonical positions',
  );
  const byStage = Object.fromEntries(wo.pipeline.map((p) => [p.stage, p.status]));
  assert.equal(byStage.characterize, 'done', 'characterize evidenced + behind the frontier → done');
  assert.equal(byStage['intent-verify'], 'done', 'intent-verify evidenced + behind the frontier → done');
  assert.equal(byStage.adjudicate, 'active', 'the live stage is the frontier');
  assert.equal(byStage.audit, 'pending');
});

// L — a spawned agent's own TodoWrite list renders as a checklist subtree under the stage
// running it (correlated to the WO by role), updated live with no model in the loop.
check('render: a live agent todo list renders as a checklist subtree under its active stage', () => {
  const root = newEffort();
  const NOW = Date.parse('2026-06-27T12:10:00Z');
  write(root, '.reasonable/journal.json', JSON.stringify({
    effort: 'demo', currentVerticalSlice: 's',
    workOrders: { 'WO-1': { status: 'dispatched', role: 'implementer', verticalSlice: 's' } },
  }));
  write(root, '.reasonable/progress-live.jsonl', liveLines(
    { key: 'WO-1', wo: 'WO-1', stage: 'implement', role: 'implementer', tool: 'Edit', target: 'edge.ts', ts: new Date(NOW - 2000).toISOString() },
    { key: '@implementer', wo: null, stage: 'implement', role: 'implementer', todos: [{ content: 'add CORNER_RADIUS', status: 'completed' }, { content: 'build path', status: 'in_progress' }], ts: new Date(NOW - 1000).toISOString() },
  ));
  const md = renderMarkdown(buildModel(root, { now: NOW }));
  assert.match(md, /- ▶ implement {2,}\[.*\] ⟳ Edit edge\.ts/, 'active implement stage carries the heartbeat');
  assert.match(md, /☑ add CORNER_RADIUS/, 'a completed agent todo renders under the stage');
  assert.match(md, /▶ build path/, 'an in-progress agent todo renders under the stage');
});

// M — ordering & timestamp trust. The action trail is ordered by `seq` (the monotonic
// append clock = causal order), NEVER by ts. A ts that is later than some higher-seq
// sibling's is provably wrong (an agent-authored ledger line with a guessed timestamp) and
// is SUPPRESSED — better no time than a misleading one. (The exact sofia-plays shape.)
check('render: actions ordered by seq; a future-dated (vs successors) ts is suppressed, never reordered', () => {
  const root = newEffort();
  write(root, '.reasonable/journal.json', JSON.stringify({
    effort: 'demo', currentVerticalSlice: 's',
    workOrders: { 'WO-1': { status: 'merged', role: 'implementer', verticalSlice: 's' } },
  }));
  // ledger.jsonl deliberately appended OUT of file order to prove we sort by seq, with an
  // enrichment whose agent-authored ts (09:58) is later than the checkpoint/merge after it.
  write(root, '.reasonable/ledger.jsonl', liveLines(
    { seq: 47, type: 'checkpoint', workOrder: 'WO-1', ts: '2026-06-30T08:27:56Z' },
    { seq: 45, type: 'commit', workOrder: 'WO-1', ts: '2026-06-30T07:47:01.379Z' },
    { seq: 46, type: 'enrichment', component: 'edge-router', clauses: ['§1'], note: 'pure autoRoute', workOrder: 'WO-1', ts: '2026-06-30T09:58:00Z' },
    { seq: 48, type: 'merge', workOrder: 'WO-1', ts: '2026-06-30T08:27:56Z' },
  ));
  const wo = buildModel(root).slices[0].children[0];
  assert.deepEqual(wo.children.map((a) => a.seq), [45, 46, 47, 48], 'sorted by seq (causal order), not file order');
  const md = renderMarkdown(buildModel(root));
  assert.match(md, /\[07:47:01\] ✎ commit/, 'a trustworthy ts is shown');
  assert.match(md, /\[08:27:56\] ✎ checkpoint/);
  assert.match(md, /- ✎ enriched edge-router/, 'the enrichment renders…');
  assert.doesNotMatch(md, /\[09:58:00\]/, '…WITHOUT its provably future-dated 09:58 ts');
});

for (const t of tmps) { try { rmSync(t, { recursive: true, force: true }); } catch { /* best effort */ } }

if (process.exitCode) console.error(`\nprogress: FAILURES above (${passed} passed).`);
else console.log(`\nprogress: all ${passed} checks passed. ✓`);
