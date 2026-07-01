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

import { buildModel, renderMarkdown, writeMirror, replayActions } from '../lib/progress.mjs';

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

// G — action events (D19 replacement for the old per-tool-call heartbeat): agents report their
// own progress as action-started / action-finished / action-obsoleted ledger lines, replayed
// SEQUENTIALLY (never accumulated by hand) into an ordered section list, each holding an ordered
// item list.

check('replayActions: a single section with two items, one done one active', () => {
  const { sections } = replayActions([
    { seq: 1, type: 'action-started', level: 'section', label: 'implementation', ts: '2026-06-27T09:00:00Z' },
    { seq: 2, type: 'action-started', level: 'item', kind: 'clause', ref: '§1', label: '§1 exists', ts: '2026-06-27T09:00:05Z' },
    { seq: 3, type: 'action-finished', level: 'item', ref: '§1', ts: '2026-06-27T09:01:00Z' },
    { seq: 4, type: 'action-started', level: 'item', kind: 'clause', ref: '§2', label: '§2 routes', ts: '2026-06-27T09:01:05Z' },
  ]);
  assert.equal(sections.length, 1);
  assert.equal(sections[0].label, 'implementation');
  assert.equal(sections[0].status, 'active', 'no matching section finish yet');
  assert.deepEqual(sections[0].items.map((i) => [i.ref, i.status]), [['§1', 'done'], ['§2', 'active']]);
});

check('replayActions: a repeated action-started for an open ref is a no-op, not a second row', () => {
  const { sections } = replayActions([
    { seq: 1, type: 'action-started', level: 'section', label: 'implementation' },
    { seq: 2, type: 'action-started', level: 'item', kind: 'adhoc', ref: 'extract-helper', ts: '2026-06-27T09:00:05Z' },
    { seq: 3, type: 'action-started', level: 'item', kind: 'adhoc', ref: 'extract-helper', ts: '2026-06-27T09:00:09Z' },
  ]);
  assert.equal(sections[0].items.length, 1, 'no duplicate row for the re-affirmed ref');
  assert.equal(sections[0].items[0].startedAt, '2026-06-27T09:00:05Z', 'keeps the ORIGINAL start time');
  assert.equal(sections[0].items[0].status, 'active');
});

check('replayActions: an obsoleted item shows its own status + reason, regardless of start/finish', () => {
  const { sections } = replayActions([
    { seq: 1, type: 'action-started', level: 'section', label: 'implementation' },
    { seq: 2, type: 'action-started', level: 'item', kind: 'clause', ref: '§4' },
    { seq: 3, type: 'action-obsoleted', level: 'item', kind: 'clause', ref: '§4', reason: "covered by §3's new helper" },
  ]);
  const item = sections[0].items[0];
  assert.equal(item.status, 'obsolete');
  assert.equal(item.reason, "covered by §3's new helper");
});

check('replayActions: obsolete is terminal — a later finished event does not flip it back', () => {
  const { sections } = replayActions([
    { seq: 1, type: 'action-started', level: 'section', label: 'implementation' },
    { seq: 2, type: 'action-started', level: 'item', kind: 'clause', ref: '§4' },
    { seq: 3, type: 'action-obsoleted', level: 'item', kind: 'clause', ref: '§4', reason: 'moot' },
    { seq: 4, type: 'action-finished', level: 'item', ref: '§4' }, // stray, out-of-order report
  ]);
  assert.equal(sections[0].items[0].status, 'obsolete', 'obsoleted is terminal once reported');
});

check('replayActions: a finish/obsolete with no prior started still renders, never throws', () => {
  assert.doesNotThrow(() => {
    const { sections } = replayActions([
      { seq: 1, type: 'action-started', level: 'section', label: 'audit' },
      { seq: 2, type: 'action-finished', level: 'item', kind: 'step', ref: 'discriminator-check' },
    ]);
    assert.equal(sections[0].items[0].status, 'done', 'best-effort render, no crash');
  });
});

check('replayActions: an item event with NO section ever opened is silently ignored, never throws', () => {
  assert.doesNotThrow(() => {
    const { sections } = replayActions([
      { seq: 1, type: 'action-started', level: 'item', kind: 'clause', ref: '§4', label: 'orphan' },
      { seq: 2, type: 'action-finished', level: 'item', ref: '§4' },
    ]);
    assert.deepEqual(sections, [], 'unaddressable item events produce no section, not a crash');
  });
});

check('replayActions: item identity resets per section — the same ref in two sections is two rows', () => {
  const { sections } = replayActions([
    { seq: 1, type: 'action-started', level: 'section', label: 'implementation' },
    { seq: 2, type: 'action-started', level: 'item', kind: 'clause', ref: '§4' },
    { seq: 3, type: 'action-finished', level: 'item', ref: '§4' },
    { seq: 4, type: 'action-finished', level: 'section', label: 'implementation' },
    { seq: 5, type: 'action-started', level: 'section', label: 'post-audit fixes' },
    { seq: 6, type: 'action-started', level: 'item', kind: 'clause', ref: '§4' }, // reopened in a NEW section
  ]);
  assert.equal(sections.length, 2);
  assert.equal(sections[0].items.length, 1);
  assert.equal(sections[0].items[0].status, 'done');
  assert.equal(sections[1].items.length, 1, 'a fresh row in the new section, not merged with the old one');
  assert.equal(sections[1].items[0].status, 'active');
});

check('replayActions: an explicitly finished section is done even as the last section in the run', () => {
  const { sections } = replayActions([
    { seq: 1, type: 'action-started', level: 'section', label: 'audit', ts: '2026-06-27T10:00:00Z' },
    { seq: 2, type: 'action-finished', level: 'section', label: 'audit', ts: '2026-06-27T10:05:00Z' },
  ]);
  assert.equal(sections[0].status, 'done');
});

// G2 — atomic-action lines carry the same literal [HH:MM:SS] prefix, sliced from the
// ledger entry's ts; an action with no ts degrades to no prefix (never a crash, never NaN).
check('render: action lines are time-prefixed from the ledger ts; tsless action → no prefix', () => {
  const root = newEffort();
  write(root, '.reasonable/journal.json', JSON.stringify({
    effort: 'demo', currentVerticalSlice: 's',
    workOrders: { 'WO-1': { status: 'dispatched', role: 'implementer', verticalSlice: 's' } },
  }));
  write(root, '.reasonable/ledger.jsonl', [
    { seq: 1, type: 'enrichment', component: 'edge-path', clauses: ['§8'], workOrder: 'WO-1', note: 'autoRoute bypass', ts: '2026-06-27T09:04:11Z' },
    { seq: 2, type: 'commit', workOrder: 'WO-1' }, // no ts → graceful, no prefix
  ].map((e) => JSON.stringify(e)).join('\n') + '\n');
  const md = renderMarkdown(buildModel(root));
  assert.match(md, /\[09:04:11\] ✎ enriched edge-path §8 — autoRoute bypass/, 'ledger ts prefixes the action line');
  assert.match(md, /- ✎ commit/, 'a tsless action renders with no time prefix, no NaN');
  assert.doesNotMatch(md, /\[NaN/, 'never a NaN timestamp');
});

// H — the acceptance scenario: an audit finds bugs, a "post-audit fixes" section is appended
// (never rewriting the original implementation/audit sections), followed by a second "audit"
// pass — the exact shape a rework cycle must render as.
check('render: post-audit-fixes rework renders as new sections, never rewriting history', () => {
  const root = newEffort();
  write(root, '.reasonable/journal.json', JSON.stringify({
    effort: 'demo', currentVerticalSlice: 's',
    workOrders: { 'WO-1': { status: 'checkpointed', role: 'implementer', verticalSlice: 's' } },
  }));
  write(root, '.reasonable/ledger.jsonl', [
    { seq: 1, type: 'action-started', workOrder: 'WO-1', level: 'section', label: 'implementation', ts: '2026-06-27T09:00:00Z' },
    { seq: 2, type: 'action-started', workOrder: 'WO-1', level: 'item', kind: 'adhoc', ref: 'feature-x', label: 'feature X', ts: '2026-06-27T09:00:05Z' },
    { seq: 3, type: 'action-finished', workOrder: 'WO-1', level: 'item', ref: 'feature-x', ts: '2026-06-27T09:10:00Z' },
    { seq: 4, type: 'action-started', workOrder: 'WO-1', level: 'item', kind: 'adhoc', ref: 'feature-y', label: 'feature Y', ts: '2026-06-27T09:10:05Z' },
    { seq: 5, type: 'action-finished', workOrder: 'WO-1', level: 'item', ref: 'feature-y', ts: '2026-06-27T09:20:00Z' },
    { seq: 6, type: 'action-finished', workOrder: 'WO-1', level: 'section', label: 'implementation', ts: '2026-06-27T09:20:00Z' },
    { seq: 7, type: 'action-started', workOrder: 'WO-1', level: 'section', label: 'audit', ts: '2026-06-27T09:20:05Z' },
    { seq: 8, type: 'action-started', workOrder: 'WO-1', level: 'item', kind: 'step', ref: 'discriminator-check', ts: '2026-06-27T09:20:10Z' },
    { seq: 9, type: 'action-finished', workOrder: 'WO-1', level: 'item', ref: 'discriminator-check', ts: '2026-06-27T09:21:00Z' },
    { seq: 10, type: 'action-started', workOrder: 'WO-1', level: 'item', kind: 'step', ref: 'mutation-sampling', ts: '2026-06-27T09:21:05Z' },
    { seq: 11, type: 'action-finished', workOrder: 'WO-1', level: 'item', ref: 'mutation-sampling', ts: '2026-06-27T09:22:00Z' },
    { seq: 12, type: 'action-finished', workOrder: 'WO-1', level: 'section', label: 'audit', ts: '2026-06-27T09:22:00Z' },
    { seq: 13, type: 'action-started', workOrder: 'WO-1', level: 'section', label: 'post-audit fixes', ts: '2026-06-27T09:22:05Z' },
    { seq: 14, type: 'action-started', workOrder: 'WO-1', level: 'item', kind: 'adhoc', ref: 'bug-a', label: 'bug A', ts: '2026-06-27T09:22:10Z' },
    { seq: 15, type: 'action-finished', workOrder: 'WO-1', level: 'item', ref: 'bug-a', ts: '2026-06-27T09:25:00Z' },
    { seq: 16, type: 'action-started', workOrder: 'WO-1', level: 'item', kind: 'adhoc', ref: 'bug-b', label: 'bug B', ts: '2026-06-27T09:25:05Z' },
  ].map((e) => JSON.stringify(e)).join('\n') + '\n');
  const wo = buildModel(root).slices[0].children[0];
  assert.deepEqual(wo.sections.map((s) => s.label), ['implementation', 'audit', 'post-audit fixes']);
  assert.equal(wo.sections[0].status, 'done');
  assert.equal(wo.sections[1].status, 'done');
  assert.equal(wo.sections[2].status, 'active', 'the tail section is the one still open');
  assert.equal(wo.sections[2].items[0].status, 'done', 'bug A finished');
  assert.equal(wo.sections[2].items[1].status, 'active', 'bug B is the current work');

  const md = renderMarkdown(buildModel(root));
  assert.match(md, /- ✓ implementation/);
  assert.match(md, /- ✓ audit/);
  assert.match(md, /- ▶ post-audit fixes {2,}\[09:22:05\]/);
  assert.match(md, /- ▶ bug B {2,}\[09:25:05\]/);
  assert.doesNotMatch(md, /now:/, 'no floating "now" fallback line anywhere');
  assert.doesNotMatch(md, /⟳/, 'no heartbeat glyph — the heartbeat tier is gone');
});

check('render: an obsoleted clause shows its own glyph + reason, never the done glyph', () => {
  const root = newEffort();
  write(root, '.reasonable/journal.json', JSON.stringify({
    effort: 'demo', currentVerticalSlice: 's',
    workOrders: { 'WO-1': { status: 'dispatched', role: 'implementer', verticalSlice: 's' } },
  }));
  write(root, '.reasonable/ledger.jsonl', [
    { seq: 1, type: 'action-started', workOrder: 'WO-1', level: 'section', label: 'implementation' },
    { seq: 2, type: 'action-started', workOrder: 'WO-1', level: 'item', kind: 'clause', ref: '§4', label: 'legacy branch' },
    { seq: 3, type: 'action-obsoleted', workOrder: 'WO-1', level: 'item', kind: 'clause', ref: '§4', reason: "covered by §3's helper" },
  ].map((e) => JSON.stringify(e)).join('\n') + '\n');
  const md = renderMarkdown(buildModel(root));
  assert.match(md, /⊘ legacy branch — covered by §3's helper/);
  assert.doesNotMatch(md, /✓ legacy branch/);
});

check('render: a started-but-never-finished item stays visibly active even after the section closes (honest gap)', () => {
  const root = newEffort();
  write(root, '.reasonable/journal.json', JSON.stringify({
    effort: 'demo', currentVerticalSlice: 's',
    workOrders: { 'WO-1': { status: 'dispatched', role: 'implementer', verticalSlice: 's' } },
  }));
  write(root, '.reasonable/ledger.jsonl', [
    { seq: 1, type: 'action-started', workOrder: 'WO-1', level: 'section', label: 'implementation' },
    { seq: 2, type: 'action-started', workOrder: 'WO-1', level: 'item', kind: 'clause', ref: '§4', label: 'left dangling' },
    { seq: 3, type: 'action-finished', workOrder: 'WO-1', level: 'section', label: 'implementation' },
    { seq: 4, type: 'action-started', workOrder: 'WO-1', level: 'section', label: 'audit' },
  ].map((e) => JSON.stringify(e)).join('\n') + '\n');
  const wo = buildModel(root).slices[0].children[0];
  assert.equal(wo.sections[0].items[0].status, 'active', 'never silently promoted to done just because the section closed');
});

check('render: no advance preview — a section never appears before its own action-started lands', () => {
  const root = newEffort();
  write(root, '.reasonable/journal.json', JSON.stringify({
    effort: 'demo', currentVerticalSlice: 's',
    workOrders: { 'WO-1': { status: 'dispatched', role: 'implementer', verticalSlice: 's' } },
  }));
  write(root, '.reasonable/ledger.jsonl', JSON.stringify(
    { seq: 1, type: 'action-started', workOrder: 'WO-1', level: 'section', label: 'implementation' },
  ) + '\n');
  const md = renderMarkdown(buildModel(root));
  assert.doesNotMatch(md, /· audit/, 'audit never previews before it has started');
  assert.doesNotMatch(md, /blind-test/, 'blind-test never previews before it has started');
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
  write(root, '.reasonable/ledger.jsonl', [
    { seq: 47, type: 'checkpoint', workOrder: 'WO-1', ts: '2026-06-30T08:27:56Z' },
    { seq: 45, type: 'commit', workOrder: 'WO-1', ts: '2026-06-30T07:47:01.379Z' },
    { seq: 46, type: 'enrichment', component: 'edge-router', clauses: ['§1'], note: 'pure autoRoute', workOrder: 'WO-1', ts: '2026-06-30T09:58:00Z' },
    { seq: 48, type: 'merge', workOrder: 'WO-1', ts: '2026-06-30T08:27:56Z' },
  ].map((e) => JSON.stringify(e)).join('\n') + '\n');
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
