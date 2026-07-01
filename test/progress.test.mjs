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
  assert.equal(byId['slice-b'].status, 'active', 'WO-3 is dispatched — real started work, not merely the cursor');
  assert.equal(byId['slice-c'].status, 'pending', 'planned, no work orders');
});

// B2 — `active` means work has actually STARTED (≥1 work order dispatched or checkpointed),
// NOT merely that the slice is the current cursor. The cursor (currentVerticalSlice) advances
// to the next slice at retro — BEFORE any work order or lane exists — so that slice must read
// `pending`, never `active`. (The exact sofia-plays shape: slice 3 went `active` the instant
// slice 2's retro moved the cursor, with zero work orders under it.) And a `checkpointed`
// work order — started, then paused — is still started work, so its slice is `active`, never
// silently `pending`.
check('projection: the current cursor slice with no started work is pending, not active', () => {
  const root = newEffort();
  write(root, '.reasonable/journal.json', JSON.stringify({
    effort: 'demo',
    currentVerticalSlice: 'slice-next', // the cursor sits here…
    workOrders: {
      'WO-done': { status: 'merged', role: 'implementer', verticalSlice: 'slice-prev' },
      'WO-paused': { status: 'checkpointed', role: 'implementer', verticalSlice: 'slice-work' },
    },
    // …but slice-next has ZERO work orders — the cursor alone must not paint it active.
  }));
  const byId = Object.fromEntries(buildModel(root).slices.map((s) => [s.id, s]));
  assert.equal(byId['slice-next'].status, 'pending', 'the cursor alone never makes a slice active');
  assert.equal(byId['slice-prev'].status, 'green', 'all work orders merged');
  assert.equal(byId['slice-work'].status, 'active', 'a checkpointed (started, paused) work order still counts as started');
});

check('projection: work orders + atomic actions hang off the right WO', () => {
  const root = newEffort(); seed(root);
  const m = buildModel(root);
  const sliceB = m.slices.find((s) => s.id === 'slice-b');
  assert.deepEqual(sliceB.children.map((w) => w.id), ['WO-2', 'WO-3', 'WO-4'], 'sorted, scoped to the slice');
  const wo2 = sliceB.children.find((w) => w.id === 'WO-2');
  assert.match(wo2.title, /store defers delete/);
  assert.equal(wo2.children.length, 2, 'enrichment + characterization');
  assert.equal(wo2.children[0].title, 'enriched store §1', 'the parent line names component + clauses, no run-on note');
  assert.deepEqual(wo2.children[0].children, ['clauses: §1', 'defer semantics'], 'an unstructured note degrades to a clause-summary child + a free-text child');
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
  assert.match(md, /✎ enriched parser §3\n/);
  assert.match(md, /      - clauses: §3\n/);
  assert.match(md, /      - precedence\n/);
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

// G2 — atomic-action lines carry the same literal human-readable UTC datetime prefix
// (full date, no raw ISO "T…Z" notation), derived from the ledger entry's ts; an action
// with no ts degrades to no prefix (never a crash, never NaN).
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
  assert.match(md, /\[2026-06-27 09:04:11 UTC\] ✎ enriched edge-path §8\n/, 'ledger ts prefixes the parent enrichment line with a full human-readable datetime');
  assert.doesNotMatch(md, /enriched edge-path §8 — autoRoute bypass/, 'the note is no longer mashed into the parent line as a run-on suffix');
  assert.match(md, /      - clauses: §8\n/, 'an unstructured note still gets a clause-summary child');
  assert.match(md, /      - autoRoute bypass\n/, 'and the free-text note becomes its own child line');
  assert.match(md, /- ✎ commit/, 'a tsless action renders with no time prefix, no NaN');
  assert.doesNotMatch(md, /\[NaN/, 'never a NaN timestamp');
});

// G3 — an `enrichment` note authored with real structure (clause markers, a declared seam,
// a verification summary) renders as one child bullet per fragment, matching the visual
// density of the section/item action-event subtree — never one run-on paragraph. Splitting
// is regex-only (clause markers, seam/verification phrasing): no LLM in the loop, per D19.
check('render: a structured enrichment note splits into clause/seam/verification children', () => {
  const root = newEffort();
  write(root, '.reasonable/journal.json', JSON.stringify({
    effort: 'demo', currentVerticalSlice: 's',
    workOrders: { 'WO-1': { status: 'dispatched', role: 'implementer', verticalSlice: 's' } },
  }));
  write(root, '.reasonable/ledger.jsonl', [
    {
      seq: 1, type: 'enrichment', component: 'graph-store', clauses: ['§8', '§9'], workOrder: 'WO-1',
      note: '§8 now validates the selector before storing it. §9 rejects a constant selector. '
        + 'Declared Input Seam: useStore selector state, not a constant. 12 tests passing, tsc clean.',
      ts: '2026-06-27T09:04:11Z',
    },
  ].map((e) => JSON.stringify(e)).join('\n') + '\n');
  const md = renderMarkdown(buildModel(root));
  assert.match(md, /\[2026-06-27 09:04:11 UTC\] ✎ enriched graph-store §8,§9\n/, 'the parent line names component + clauses only');
  assert.match(md, /      - §8 now validates the selector before storing it\.\n/, 'clause §8 gets its own child line');
  assert.match(md, /      - §9 rejects a constant selector\.\n/, 'clause §9 gets its own child line');
  assert.match(md, /      - Declared Input Seam: useStore selector state, not a constant\.\n/, 'the declared seam is a distinct child, not folded into prose');
  assert.match(md, /      - 12 tests passing, tsc clean\.\n/, 'the verification summary is a distinct child');
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
  assert.match(md, /- ▶ post-audit fixes {2,}\[2026-06-27 09:22:05 UTC\]/);
  assert.match(md, /- ▶ bug B {2,}\[2026-06-27 09:25:05 UTC\]/);
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
  assert.match(md, /⊘ §4 — legacy branch — covered by §3's helper/, 'a clause item surfaces its § ref alongside the description');
  assert.doesNotMatch(md, /✓ legacy branch/);
});

// A clause item is identified by its § ref. Surface it — `✓ §8 — <what it covers>` — so a
// live-reported clause reads consistently with the derived checklist's bare `✓ §8`, and the
// § numbers in an `✎ enriched …` line map to visible ticks above. A clause reported with no
// description shows just its ref (never `§8 — §8`); non-clause items keep their plain label.
check('render: a clause item surfaces its § ref; a bare-ref clause shows just the ref, an adhoc item its label', () => {
  const root = newEffort();
  write(root, '.reasonable/journal.json', JSON.stringify({
    effort: 'demo', currentVerticalSlice: 's',
    workOrders: { 'WO-1': { status: 'checkpointed', role: 'implementer', verticalSlice: 's' } },
  }));
  write(root, '.reasonable/ledger.jsonl', [
    { seq: 1, type: 'action-started', workOrder: 'WO-1', level: 'section', label: 'implementation' },
    { seq: 2, type: 'action-started', workOrder: 'WO-1', level: 'item', kind: 'clause', ref: '§8', label: 'auto-router bypassed for manual waypoints' },
    { seq: 3, type: 'action-finished', workOrder: 'WO-1', level: 'item', ref: '§8' },
    { seq: 4, type: 'action-started', workOrder: 'WO-1', level: 'item', kind: 'clause', ref: '§9' }, // reported with no description
    { seq: 5, type: 'action-started', workOrder: 'WO-1', level: 'item', kind: 'adhoc', ref: 'extract-helper', label: 'extract the shared helper' },
  ].map((e) => JSON.stringify(e)).join('\n') + '\n');
  const md = renderMarkdown(buildModel(root));
  assert.match(md, /- ✓ §8 — auto-router bypassed for manual waypoints/, 'a described clause reads "§8 — <what it covers>"');
  assert.match(md, /- ▶ §9\n/, 'a clause reported with no description shows just its ref, never "§9 — §9"');
  assert.match(md, /- ▶ extract the shared helper\n/, 'a non-clause (adhoc) item keeps its plain label, no ref prefix');
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
  assert.match(md, /\[2026-06-30 07:47:01 UTC\] ✎ commit/, 'a trustworthy ts is shown');
  assert.match(md, /\[2026-06-30 08:27:56 UTC\] ✎ checkpoint/);
  assert.match(md, /- ✎ enriched edge-router/, 'the enrichment renders…');
  assert.doesNotMatch(md, /\[2026-06-30 09:58:00 UTC\]/, '…WITHOUT its provably future-dated 09:58 ts');
});

// N — crash-boundary rendering (the dispatch epoch, D19). A second action-started for a
// STILL-OPEN section under a DIFFERENT dispatch epoch is a resumed run after a crash: the old
// section is sealed `dead` (keeping ONLY its durably-finished/obsoleted items — unfinished work
// migrates to the resumer, which re-reports it), and a fresh section opens. A SAME-epoch reopen
// (or an epoch-less legacy reopen, where provenance is absent) is a conservative no-op — never a
// spurious ✗. The epoch is stamped by action-report from the journal; replayActions only reads it.
check('replayActions: a different-epoch reopen seals the old section dead, keeping only finished items', () => {
  const { sections } = replayActions([
    { seq: 1, type: 'action-started', level: 'section', label: 'implementation', dispatch: 1, ts: '2026-07-01T09:00:00Z' },
    { seq: 2, type: 'action-started', level: 'item', kind: 'clause', ref: 'A', dispatch: 1 },
    { seq: 3, type: 'action-finished', level: 'item', ref: 'A', dispatch: 1 },
    { seq: 4, type: 'action-started', level: 'item', kind: 'clause', ref: 'B', dispatch: 1 }, // active at crash
    { seq: 5, type: 'action-started', level: 'section', label: 'implementation', dispatch: 2, ts: '2026-07-01T09:05:00Z' }, // resume
    { seq: 6, type: 'action-started', level: 'item', kind: 'clause', ref: 'B', dispatch: 2 },
  ]);
  assert.equal(sections.length, 2, 'a dead attempt + a live resume — two sections');
  assert.equal(sections[0].status, 'dead');
  assert.equal(sections[0].crashedAt, '2026-07-01T09:05:00Z', 'sealed at the resume point');
  assert.deepEqual(sections[0].items.map((i) => i.ref), ['A'], 'unfinished B is dropped from the dead section');
  assert.equal(sections[1].status, 'active');
  assert.deepEqual(sections[1].items.map((i) => [i.ref, i.status]), [['B', 'active']], 'B migrated to the resume');
});

check('replayActions: a same-epoch reopen of an open section is a no-op, not a dead+resume split', () => {
  const { sections } = replayActions([
    { seq: 1, type: 'action-started', level: 'section', label: 'implementation', dispatch: 1 },
    { seq: 2, type: 'action-started', level: 'section', label: 'implementation', dispatch: 1 },
  ]);
  assert.equal(sections.length, 1, 'one section, not a phantom dead+resume');
  assert.equal(sections[0].status, 'active');
});

check('replayActions: an epoch-less (legacy) reopen of an open section collapses — never a spurious ✗', () => {
  const { sections } = replayActions([
    { seq: 1, type: 'action-started', level: 'section', label: 'adjudicate' },
    { seq: 2, type: 'action-started', level: 'section', label: 'adjudicate' }, // both epoch-less → both null
  ]);
  assert.equal(sections.length, 1, 'absent provenance → conservative collapse');
  assert.notEqual(sections[0].status, 'dead');
});

check('render: a dead attempt renders with the ✗ glyph + crash time, resume holds the migrated item', () => {
  const root = newEffort();
  write(root, '.reasonable/journal.json', JSON.stringify({
    effort: 'demo', currentVerticalSlice: 's',
    workOrders: { 'WO-1': { status: 'dispatched', role: 'implementer', verticalSlice: 's', dispatchEpoch: 2 } },
  }));
  write(root, '.reasonable/ledger.jsonl', [
    { seq: 1, type: 'action-started', workOrder: 'WO-1', level: 'section', label: 'implementation', dispatch: 1, ts: '2026-07-01T09:00:00Z' },
    { seq: 2, type: 'action-started', workOrder: 'WO-1', level: 'item', kind: 'adhoc', ref: 'feature-a', label: 'feature A', dispatch: 1, ts: '2026-07-01T09:00:05Z' },
    { seq: 3, type: 'action-finished', workOrder: 'WO-1', level: 'item', ref: 'feature-a', dispatch: 1, ts: '2026-07-01T09:01:00Z' },
    { seq: 4, type: 'action-started', workOrder: 'WO-1', level: 'item', kind: 'adhoc', ref: 'feature-b', label: 'feature B', dispatch: 1, ts: '2026-07-01T09:01:05Z' },
    { seq: 5, type: 'action-started', workOrder: 'WO-1', level: 'section', label: 'implementation', dispatch: 2, ts: '2026-07-01T09:05:00Z' },
    { seq: 6, type: 'action-started', workOrder: 'WO-1', level: 'item', kind: 'adhoc', ref: 'feature-b', label: 'feature B', dispatch: 2, ts: '2026-07-01T09:05:05Z' },
  ].map((e) => JSON.stringify(e)).join('\n') + '\n');
  const md = renderMarkdown(buildModel(root));
  assert.match(md, /- ✗ implementation {2,}\[2026-07-01 09:05:00 UTC\]/, 'dead attempt: ✗ glyph + crash time');
  assert.match(md, /- ✓ feature A/, 'the finished item stays under the dead attempt');
  assert.equal((md.match(/✗ implementation/g) || []).length, 1, 'exactly one dead attempt');
  const wo = buildModel(root).slices[0].children[0];
  assert.equal(wo.sections.length, 2);
  assert.equal(wo.sections[1].status, 'active');
  assert.deepEqual(wo.sections[1].items.map((i) => [i.label, i.status]), [['feature B', 'active']], 'feature B migrated to the live resume');
});

// I — the enrichment fallback checklist. A completed work order that predates live
// action-event reporting (D19) has no `action-*` events, but its terminal `enrichment` ledger
// event still records which contract clauses it delivered. The renderer derives a done-checklist
// from those clauses — so every green implementer shows its items ticked, live-reported or not —
// WITHOUT overriding a run that DID report. (The exact slice-1 / auto-route-core shape.)
check('enrichment fallback: a no-action-event WO derives a done checklist from its enrichment clauses', () => {
  const root = newEffort();
  write(root, '.reasonable/journal.json', JSON.stringify({
    effort: 'demo', currentVerticalSlice: 's',
    workOrders: { 'WO-old': { status: 'merged', role: 'implementer', verticalSlice: 's' } },
  }));
  write(root, '.reasonable/ledger.jsonl', [
    { seq: 1, type: 'enrichment', component: 'edge-path', clauses: ['§1', '§2', '§3'], workOrder: 'WO-old', note: 'orthogonal buildPath', ts: '2026-06-27T09:00:00Z' },
    { seq: 2, type: 'merge', workOrder: 'WO-old', ts: '2026-06-27T10:00:00Z' },
  ].map((e) => JSON.stringify(e)).join('\n') + '\n');
  const wo = buildModel(root).slices[0].children[0];
  assert.equal(wo.sections.length, 1, 'one derived section per enriched component');
  assert.equal(wo.sections[0].label, 'edge-path');
  assert.equal(wo.sections[0].status, 'done');
  assert.deepEqual(
    wo.sections[0].items.map((i) => [i.ref, i.status]),
    [['§1', 'done'], ['§2', 'done'], ['§3', 'done']],
    'each delivered clause ticked done',
  );
  const md = renderMarkdown(buildModel(root));
  assert.match(md, /- ✓ edge-path/, 'derived section renders with a ✓');
  assert.match(md, /- ✓ §1/, 'clause §1 renders as a done item');
  assert.match(md, /- ✓ §3/);
});

check('enrichment fallback: two enriched components → two derived sections, clauses deduped in order', () => {
  const root = newEffort();
  write(root, '.reasonable/journal.json', JSON.stringify({
    effort: 'demo', currentVerticalSlice: 's',
    workOrders: { 'WO-two': { status: 'merged', role: 'implementer', verticalSlice: 's' } },
  }));
  write(root, '.reasonable/ledger.jsonl', [
    { seq: 1, type: 'enrichment', component: 'edge-router', clauses: ['§1', '§2'], workOrder: 'WO-two', ts: '2026-06-30T09:00:00Z' },
    { seq: 2, type: 'enrichment', component: 'edge-path', clauses: ['§8'], workOrder: 'WO-two', ts: '2026-06-30T09:30:00Z' },
    { seq: 3, type: 'enrichment', component: 'edge-router', clauses: ['§2', '§3'], workOrder: 'WO-two', ts: '2026-06-30T10:00:00Z' },
  ].map((e) => JSON.stringify(e)).join('\n') + '\n');
  const wo = buildModel(root).slices[0].children[0];
  assert.deepEqual(wo.sections.map((s) => s.label), ['edge-router', 'edge-path'], 'one section per component, first-seen order');
  assert.deepEqual(wo.sections[0].items.map((i) => i.ref), ['§1', '§2', '§3'], 'clauses unioned across events, deduped, in order');
});

check('enrichment fallback: a WO with LIVE action-events is NOT overridden by the enrichment fallback', () => {
  const root = newEffort();
  write(root, '.reasonable/journal.json', JSON.stringify({
    effort: 'demo', currentVerticalSlice: 's',
    workOrders: { 'WO-live': { status: 'checkpointed', role: 'implementer', verticalSlice: 's' } },
  }));
  write(root, '.reasonable/ledger.jsonl', [
    { seq: 1, type: 'action-started', workOrder: 'WO-live', level: 'section', label: 'implementation', ts: '2026-07-01T09:00:00Z' },
    { seq: 2, type: 'action-started', workOrder: 'WO-live', level: 'item', kind: 'clause', ref: '§8', label: 'bypass', ts: '2026-07-01T09:00:05Z' },
    { seq: 3, type: 'action-finished', workOrder: 'WO-live', level: 'item', ref: '§8', ts: '2026-07-01T09:01:00Z' },
    { seq: 4, type: 'enrichment', component: 'edge-path', clauses: ['§8', '§9'], workOrder: 'WO-live', ts: '2026-07-01T09:02:00Z' },
  ].map((e) => JSON.stringify(e)).join('\n') + '\n');
  const wo = buildModel(root).slices[0].children[0];
  assert.equal(wo.sections.length, 1);
  assert.equal(wo.sections[0].label, 'implementation', 'the LIVE section wins; the enrichment fallback does not fire');
  assert.deepEqual(wo.sections[0].items.map((i) => i.ref), ['§8'], 'only the live-reported items, not the enrichment clause set');
});

check('enrichment fallback: a WO with neither action-events nor enrichment clauses has no sections (no crash)', () => {
  const root = newEffort();
  write(root, '.reasonable/journal.json', JSON.stringify({
    effort: 'demo', currentVerticalSlice: 's',
    workOrders: { 'WO-bare': { status: 'merged', role: 'implementer', verticalSlice: 's' } },
  }));
  write(root, '.reasonable/ledger.jsonl', [
    { seq: 1, type: 'commit', workOrder: 'WO-bare', ts: '2026-06-27T09:00:00Z' },
    { seq: 2, type: 'merge', workOrder: 'WO-bare', ts: '2026-06-27T10:00:00Z' },
  ].map((e) => JSON.stringify(e)).join('\n') + '\n');
  const wo = buildModel(root).slices[0].children[0];
  assert.deepEqual(wo.sections, [], 'nothing to derive → empty, same as before');
});

for (const t of tmps) { try { rmSync(t, { recursive: true, force: true }); } catch { /* best effort */ } }

if (process.exitCode) console.error(`\nprogress: FAILURES above (${passed} passed).`);
else console.log(`\nprogress: all ${passed} checks passed. ✓`);
