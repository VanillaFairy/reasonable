// Standalone test for lib/progress-live.mjs — node builtins only (no runner).
// Run: node test/progress-live.test.mjs
//
// Exercises the EPHEMERAL live channel (D19 tier-2): the role→stage map, append/read
// (latest-per-key + TTL), reset, the work-order / effort-root resolution from a tool-call
// payload, and the --hook CLI end-to-end (append a heartbeat + regenerate the mirror,
// fail-open, and no-op for the main session). The channel must NEVER touch canonical truth.

import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  stageOf, upsertLive, readLive, resetLive, resolveLiveContext, LIVE_FILE, LIVE_TTL_MS,
} from '../lib/progress-live.mjs';

const LIB = join(dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'progress-live.mjs');
const tmps = [];
const write = (root, rel, content) => {
  const p = join(root, rel);
  mkdirSync(join(p, '..'), { recursive: true });
  writeFileSync(p, content);
};

// A synthetic effort with one provisioned lane worktree + descriptor (the two-root layout
// the resolver relies on). Returns { root, worktree }.
function newEffortWithLane(woId = 'WO-9', role = 'implementer') {
  const root = mkdtempSync(join(tmpdir(), 'live-test-'));
  tmps.push(root);
  mkdirSync(join(root, '.reasonable'), { recursive: true });
  const worktree = join(root, '.worktrees', woId);
  mkdirSync(join(worktree, 'src'), { recursive: true });
  writeFileSync(join(worktree, '.reasonable-lane.json'), JSON.stringify({
    workOrder: woId, role, effortRoot: root, locus: ['src/**'], contracts: [],
  }));
  return { root, worktree };
}

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.stack || e.message}`); process.exitCode = 1; }
}

// A — role → stage.
check('stageOf maps every pipeline role to its stage; unknown → its own name; null → null', () => {
  assert.equal(stageOf('lane-provisioner'), 'provision');
  assert.equal(stageOf('implementer'), 'implement');
  assert.equal(stageOf('blind-test-writer'), 'blind-test');
  assert.equal(stageOf('adjudicator'), 'adjudicate');
  assert.equal(stageOf('auditor'), 'audit');
  assert.equal(stageOf('journal-writer'), 'scribe');
  assert.equal(stageOf('mystery-role'), 'mystery-role');
  assert.equal(stageOf(null), null);
});

// B — append + read: latest line per key wins; both WO and effort-level buckets.
check('upsertLive appends; readLive reduces to the latest line per key', () => {
  const { root } = newEffortWithLane();
  const NOW = Date.parse('2026-06-27T12:00:10Z');
  upsertLive(root, { key: 'WO-9', wo: 'WO-9', stage: 'implement', role: 'implementer', tool: 'Edit', target: 'a', ts: new Date(NOW - 4000).toISOString() });
  upsertLive(root, { key: 'WO-9', wo: 'WO-9', stage: 'implement', role: 'implementer', tool: 'Edit', target: 'b', ts: new Date(NOW - 1000).toISOString() });
  upsertLive(root, { key: '@reconciler', wo: null, stage: 'reconcile', role: 'reconciler', tool: 'Bash', target: 'git', ts: new Date(NOW - 2000).toISOString() });
  const live = readLive(root, { now: NOW });
  assert.equal(live.byWorkOrder['WO-9'].target, 'b', 'the latest WO-9 line wins');
  assert.equal(live.effort.length, 1, 'one no-WO heartbeat at effort level');
  assert.equal(live.effort[0].stage, 'reconcile');
});

// C — TTL: a heartbeat past the window is dropped.
check('readLive drops a heartbeat older than the TTL', () => {
  const { root } = newEffortWithLane();
  const NOW = Date.parse('2026-06-27T12:00:10Z');
  upsertLive(root, { key: 'WO-9', wo: 'WO-9', stage: 'implement', role: 'implementer', tool: 'Edit', target: 'old', ts: new Date(NOW - (LIVE_TTL_MS + 1000)).toISOString() });
  const live = readLive(root, { now: NOW });
  assert.ok(!live.byWorkOrder['WO-9'], 'stale heartbeat dropped');
});

// C2 — sinceMs (lastReconciled) filter resets the now-view.
check('readLive ignores heartbeats older than sinceMs (reconcile reset)', () => {
  const { root } = newEffortWithLane();
  const NOW = Date.parse('2026-06-27T12:00:10Z');
  upsertLive(root, { key: 'WO-9', wo: 'WO-9', stage: 'implement', role: 'implementer', tool: 'Edit', target: 'pre', ts: new Date(NOW - 5000).toISOString() });
  const live = readLive(root, { now: NOW, sinceMs: NOW - 1000 });
  assert.ok(!live.byWorkOrder['WO-9'], 'a heartbeat before sinceMs is ignored');
});

// D — resetLive truncates the channel.
check('resetLive truncates the channel', () => {
  const { root } = newEffortWithLane();
  upsertLive(root, { key: 'WO-9', wo: 'WO-9', stage: 'implement', role: 'implementer', tool: 'Edit', target: 'x' });
  assert.ok(readFileSync(join(root, '.reasonable', LIVE_FILE), 'utf8').length > 0);
  resetLive(root);
  assert.equal(readFileSync(join(root, '.reasonable', LIVE_FILE), 'utf8'), '', 'channel emptied');
  assert.deepEqual(readLive(root).effort, [], 'empty channel reads clean');
});

// E — resolveLiveContext: WO + effortRoot from an edit under a worktree (via the descriptor).
check('resolveLiveContext: edit under a lane worktree resolves WO + effortRoot from the descriptor', () => {
  const { root, worktree } = newEffortWithLane('WO-9');
  const ctx = resolveLiveContext({
    tool_name: 'Edit', tool_input: { file_path: join(worktree, 'src', 'ChoiceEdge.tsx') },
    cwd: root, agent_type: 'reasonable:implementer',
  });
  assert.equal(ctx.wo, 'WO-9', 'WO from the descriptor');
  assert.equal(ctx.effortRoot, root, 'effort root from the descriptor back-pointer');
  assert.equal(ctx.target, 'src/ChoiceEdge.tsx', 'human target = parent/name');
});

// E2 — resolveLiveContext: WO + effortRoot from a Bash command referencing the worktree.
check('resolveLiveContext: Bash command referencing the worktree resolves WO + effortRoot', () => {
  const { root, worktree } = newEffortWithLane('WO-7', 'adjudicator');
  const ctx = resolveLiveContext({
    tool_name: 'Bash', tool_input: { command: `git -C ${worktree} stash && npx vitest run --root ${worktree}` },
    cwd: root, agent_type: 'reasonable:adjudicator',
  });
  assert.equal(ctx.wo, 'WO-7', 'WO parsed from the worktree path in the command');
  assert.equal(ctx.effortRoot, root);
  assert.match(ctx.target, /git -C/, 'Bash target = the command head');
});

// E3 — a canonical .reasonable/ write (no worktree) → no WO, effort root from the path.
check('resolveLiveContext: canonical .reasonable/ write → wo:null, effort root resolved', () => {
  const { root } = newEffortWithLane('WO-9');
  const ctx = resolveLiveContext({
    tool_name: 'Edit', tool_input: { file_path: join(root, '.reasonable', 'contracts', 'parser.md') },
    cwd: root, agent_type: 'reasonable:implementer',
  });
  assert.equal(ctx.wo, null, 'a canonical write carries no work order');
  assert.equal(ctx.effortRoot, root);
});

// F — the --hook CLI end-to-end: a subagent edit appends a heartbeat AND regenerates the
// mirror with a ⟳ now line; canonical truth (journal/ledger) is untouched.
check('--hook CLI: a subagent edit appends a heartbeat and regenerates progress.md', () => {
  const { root, worktree } = newEffortWithLane('WO-9');
  // A minimal journal so the projection has a WO node for the heartbeat to attach to.
  write(root, '.reasonable/journal.json', JSON.stringify({
    effort: 'demo', currentVerticalSlice: 'slice-x',
    workOrders: { 'WO-9': { status: 'dispatched', role: 'implementer', verticalSlice: 'slice-x' } },
  }));
  const journalBefore = readFileSync(join(root, '.reasonable', 'journal.json'), 'utf8');
  execFileSync('node', [LIB, '--hook'], {
    input: JSON.stringify({
      tool_name: 'Edit', tool_input: { file_path: join(worktree, 'src', 'ChoiceEdge.tsx') },
      cwd: root, agent_type: 'reasonable:implementer',
    }),
    stdio: ['pipe', 'pipe', 'pipe'], timeout: 15000,
  });
  const live = readFileSync(join(root, '.reasonable', LIVE_FILE), 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(live.length, 1, 'one heartbeat appended');
  assert.equal(live[0].wo, 'WO-9');
  assert.equal(live[0].stage, 'implement');
  assert.equal(live[0].tool, 'Edit');
  assert.ok(existsSync(join(root, '.reasonable', 'progress.md')), 'mirror regenerated');
  // The heartbeat folds into the WO's active pipeline stage (implement), time-prefixed.
  assert.match(readFileSync(join(root, '.reasonable', 'progress.md'), 'utf8'), /▶ implement {2,}\[\d{2}:\d{2}:\d{2}\] ⟳ Edit src\/ChoiceEdge\.tsx/);
  // Canonical truth untouched — no heartbeat noise leaked into the journal.
  assert.equal(readFileSync(join(root, '.reasonable', 'journal.json'), 'utf8'), journalBefore, 'journal.json byte-identical');
  assert.ok(!existsSync(join(root, '.reasonable', 'ledger.jsonl')), 'no ledger written');
});

// F2 — the --hook CLI is a no-op for the MAIN SESSION (no agent_type) — not a heartbeat.
check('--hook CLI: the main session (no agent_type) appends nothing', () => {
  const { root, worktree } = newEffortWithLane('WO-9');
  execFileSync('node', [LIB, '--hook'], {
    input: JSON.stringify({
      tool_name: 'Edit', tool_input: { file_path: join(worktree, 'src', 'ChoiceEdge.tsx') }, cwd: root,
      // no agent_type → main session / orchestrator
    }),
    stdio: ['pipe', 'pipe', 'pipe'], timeout: 15000,
  });
  assert.ok(!existsSync(join(root, '.reasonable', LIVE_FILE)), 'no live channel written for the main session');
});

// F3 — the --hook CLI fails OPEN outside any effort (exit 0, nothing written).
check('--hook CLI: outside any effort it exits 0 and writes nothing (fail open)', () => {
  const bare = mkdtempSync(join(tmpdir(), 'live-bare-')); tmps.push(bare);
  // exit 0 or it throws; execFileSync throws on nonzero — so a clean return IS the assertion.
  execFileSync('node', [LIB, '--hook'], {
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'ls' }, cwd: bare, agent_type: 'reasonable:implementer' }),
    stdio: ['pipe', 'pipe', 'pipe'], timeout: 15000,
  });
  assert.ok(!existsSync(join(bare, '.reasonable')), 'no effort, nothing created');
});

// G — the agent TodoWrite channel: a todos line is captured WITHOUT clobbering the agent's
// positional heartbeat, and readLive correlates it to the unique live WO of that role.
check('todos: a @role TodoWrite correlates to the unique live WO of that role; positional heartbeat survives', () => {
  const { root } = newEffortWithLane('WO-9', 'implementer');
  const NOW = Date.parse('2026-06-27T12:00:10Z');
  upsertLive(root, { key: 'WO-9', wo: 'WO-9', stage: 'implement', role: 'implementer', tool: 'Edit', target: 'a.ts', ts: new Date(NOW - 3000).toISOString() });
  upsertLive(root, { key: '@implementer', wo: null, stage: 'implement', role: 'implementer', todos: [{ content: 'wire it', status: 'in_progress' }, { content: 'self-loop', status: 'pending' }], ts: new Date(NOW - 1000).toISOString() });
  const live = readLive(root, { now: NOW });
  assert.ok(live.byWorkOrder['WO-9'].todos, 'todos correlated onto the unique implementer WO');
  assert.equal(live.byWorkOrder['WO-9'].todos.length, 2);
  assert.equal(live.byWorkOrder['WO-9'].tool, 'Edit', 'a todos line never clobbers the positional (Edit) heartbeat');
  assert.equal(live.effort.length, 0, 'no duplicate effort-level entry once the todos correlate to a WO');
});

// G2 — honesty under parallel same-role lanes: with TWO live implementer WOs, a @role
// todos line cannot be attributed to one — it surfaces at effort level, never misattributed.
check('todos: ambiguous @role (2+ same-role WOs) → effort-level, never misattributed to a WO', () => {
  const { root } = newEffortWithLane('WO-A', 'implementer');
  const NOW = Date.parse('2026-06-27T12:00:10Z');
  upsertLive(root, { key: 'WO-A', wo: 'WO-A', stage: 'implement', role: 'implementer', tool: 'Edit', target: 'a.ts', ts: new Date(NOW - 3000).toISOString() });
  upsertLive(root, { key: 'WO-B', wo: 'WO-B', stage: 'implement', role: 'implementer', tool: 'Edit', target: 'b.ts', ts: new Date(NOW - 3000).toISOString() });
  upsertLive(root, { key: '@implementer', wo: null, stage: 'implement', role: 'implementer', todos: [{ content: 'something', status: 'pending' }], ts: new Date(NOW - 1000).toISOString() });
  const live = readLive(root, { now: NOW });
  assert.ok(!live.byWorkOrder['WO-A'].todos && !live.byWorkOrder['WO-B'].todos, 'never pinned to a guessed WO');
  assert.ok(live.effort.some((e) => Array.isArray(e.todos) && e.todos.length), 'todos surface at effort level instead');
});

// G3 — the --hook CLI end-to-end: a subagent's Edit gives the positional heartbeat, a
// following TodoWrite appends a TODOS line (no positional tool), and readLive correlates
// the todos onto the WO. (The rendered subtree is covered in progress.test.mjs; the hook's
// mirror regen is debounced, so this asserts the canonical channel + correlation directly.)
check('--hook CLI: a subagent TodoWrite appends a todos line (no tool); readLive correlates it to the WO', () => {
  const { root, worktree } = newEffortWithLane('WO-9', 'implementer');
  write(root, '.reasonable/journal.json', JSON.stringify({
    effort: 'demo', currentVerticalSlice: 's',
    workOrders: { 'WO-9': { status: 'dispatched', role: 'implementer', verticalSlice: 's' } },
  }));
  for (const payload of [
    { tool_name: 'Edit', tool_input: { file_path: join(worktree, 'src', 'x.ts') }, cwd: root, agent_type: 'reasonable:implementer' },
    { tool_name: 'TodoWrite', tool_input: { todos: [{ content: 'wire autoRoute', status: 'in_progress', activeForm: 'wiring' }, { content: 'self-loop guard', status: 'pending', activeForm: 'guarding' }] }, cwd: root, agent_type: 'reasonable:implementer' },
  ]) execFileSync('node', [LIB, '--hook'], { input: JSON.stringify(payload), stdio: ['pipe', 'pipe', 'pipe'], timeout: 15000 });
  const lines = readFileSync(join(root, '.reasonable', LIVE_FILE), 'utf8').trim().split('\n').map(JSON.parse);
  const todoLine = lines.find((l) => Array.isArray(l.todos));
  assert.ok(todoLine && !todoLine.tool, 'the todos line carries todos and no positional tool');
  assert.equal(todoLine.todos.length, 2);
  const live = readLive(root);
  assert.ok(live.byWorkOrder['WO-9'] && live.byWorkOrder['WO-9'].todos, 'todos correlated onto the unique implementer WO');
  assert.equal(live.byWorkOrder['WO-9'].tool, 'Edit', 'the positional (Edit) heartbeat is intact');
});

for (const t of tmps) { try { rmSync(t, { recursive: true, force: true }); } catch { /* best effort */ } }

if (process.exitCode) console.error(`\nprogress-live: FAILURES above (${passed} passed).`);
else console.log(`\nprogress-live: all ${passed} checks passed. ✓`);
