// Standalone test for lib/reconcile.mjs `terminalWorkOrders` — node builtins only.
// Run: node test/reconcile-terminal-workorders.test.mjs
//
// THE BUG (sofia-plays graph-editor-ux-overhaul, slice 2, 2026-06-27+). The
// vertical-slice-runner re-dispatched a work order the journal already showed
// `status:"green", merged:true` — twice. Root cause: nothing in the reconcile /
// route-planning path ever computed "which work orders are already terminal
// (merged)" as a mechanical fact, so an LLM route-planner re-including one on
// disk (`.reasonable/work-orders/<id>.json` persists indefinitely) went
// unchecked. This pins reconcile.mjs computing that set deterministically —
// never eyeballed — so the workflow can filter on it before ever dispatching.

import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

import { reconcile } from '../lib/reconcile.mjs';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
const write = (root, rel, content) => {
  const p = join(root, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, content);
};

const tmps = [];
function newEffort(workOrders, ledgerLines = [{ seq: 1, type: 'ratification', gate: 'analysis' }]) {
  const root = mkdtempSync(join(tmpdir(), 'rtw-')); tmps.push(root);
  git(root, 'init', '-q');
  const hooks = join(root, '.nohooks'); mkdirSync(hooks, { recursive: true });
  git(root, 'config', 'core.hooksPath', hooks);
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'user.name', 'Reconcile Terminal Test');
  git(root, 'config', 'commit.gpgsign', 'false');
  write(root, 'README.md', 'base\n');
  write(root, '.gitignore', '.reasonable/\n.worktrees/\n');
  git(root, 'add', '-A'); git(root, 'commit', '-q', '-m', 'init');
  git(root, 'branch', 'effort/demo');

  write(root, '.reasonable/config.json', JSON.stringify({ effort: 'demo', runMode: 'autonomous', effortBranch: 'effort/demo' }) + '\n');
  write(root, '.reasonable/journal.json', JSON.stringify({
    effort: 'demo', currentVerticalSlice: 'slice-2', phase: 'vertical-slice-execution', supervision: 'standard',
    workOrders, lanes: {}, inbox: [],
  }, null, 2) + '\n');
  write(root, '.reasonable/ledger.jsonl', ledgerLines.map((e) => JSON.stringify(e)).join('\n') + '\n');
  return root;
}

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.message}`); process.exitCode = 1; }
}

// 1 — the exact reproduction shape: status:"green" + merged:true + mergeSha.
check('a work order with status:"green", merged:true is reported terminal', () => {
  const root = newEffort({
    'WO-S2-auto-route-core': { status: 'green', verticalSlice: 'slice-2', role: 'implementer', merged: true, mergeSha: 'cc63dcf' },
    'WO-S2-wire-autoroute-into-edge': { status: 'pending', verticalSlice: 'slice-2', role: 'implementer' },
  });
  const r = reconcile(root);
  assert.deepEqual(r.terminalWorkOrders, ['WO-S2-auto-route-core'],
    `expected only the merged WO in terminalWorkOrders, got ${JSON.stringify(r.terminalWorkOrders)}`);
});

// 2 — T0.4: the authoritative merged signal is now the ledger FOLD's `done`. The merge membrane act
//     appends node-completed (skills/vertical-slice-execution/SKILL.md §7), which folds to `done` — so a
//     status-free journal WO whose ledger shows node-completed is reported terminal (no journal status).
check('a status-free WO whose ledger folds to done (node-completed at merge) is reported terminal', () => {
  const root = newEffort(
    { 'WO-A': { verticalSlice: 'slice-1', role: 'implementer' } }, // NO status field (T0.4)
    [{ seq: 1, type: 'node-planned', node: 'slice-1/WO-A', kind: 'work-order', title: 'a' },
     { seq: 2, type: 'node-dispatched', node: 'slice-1/WO-A', kind: 'work-order', attempt: 1 },
     { seq: 3, type: 'node-completed', node: 'slice-1/WO-A' }],
  );
  const r = reconcile(root);
  assert.deepEqual(r.terminalWorkOrders, ['WO-A']);
});

// 3 — a status-free WO whose fold is pending (or absent) is NOT terminal (a dead-end may still un-bind
//     and be re-dispatched once an input changes — that is redispatch-guard.mjs's job, not this set).
check('a fold-pending / not-yet-merged work order is not terminal', () => {
  const root = newEffort(
    { 'WO-B': { verticalSlice: 's', role: 'implementer' },   // no ledger events → absent from fold
      'WO-C': { verticalSlice: 's', role: 'implementer' } }, // planned-not-dispatched → pending
    [{ seq: 1, type: 'node-planned', node: 's/WO-C', kind: 'work-order', title: 'c' }],
  );
  const r = reconcile(root);
  assert.deepEqual(r.terminalWorkOrders, []);
});

// 4 — REGRESSION (the merged-terminal exemption defect). A merged WO can carry a still-live-LOOKING
//     lane registry (branch + worktree) in the exact legacy/migration resume state this effort targets:
//     the lane was merged into the effort branch (0 ahead), its worktree is gone, and its ledger has
//     node-planned+node-dispatched but NO node-completed yet (so the fold reads `running`). Without the
//     merged exemption in isLive, the per-WO recovery loop treated it as live and appended a spurious
//     node-downgraded — a genuinely-merged terminal WO then drifts to `pending` on the next reconcile.
//     A merged WO must be terminal EVERYWHERE (isLive returns false), never a recovery subject.
check('a merged WO with a live-looking lane registry (no node-completed) is NOT downgraded — stays terminal', () => {
  const readLedger = (root) => {
    const p = join(root, '.reasonable', 'ledger.jsonl');
    return existsSync(p) ? readFileSync(p, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => JSON.parse(l)) : [];
  };
  const root = newEffort(
    { 'WO-1': { verticalSlice: 'slice-1', role: 'implementer', branch: 'lane/WO-1', worktree: '.worktrees/WO-1', merged: true } },
    [{ seq: 1, type: 'node-planned', node: 'WO-1', kind: 'work-order', title: 'w' },
     { seq: 2, type: 'node-dispatched', node: 'WO-1', kind: 'work-order', attempt: 1 }], // NO node-completed
  );
  // The lane branch exists at the effort-branch tip (merged → 0 ahead); the worktree is gone (never created).
  git(root, 'branch', 'lane/WO-1', 'effort/demo');
  const before = readLedger(root);

  const r = reconcile(root);

  assert.ok(!readLedger(root).some((l) => l.type === 'node-downgraded' && l.workOrder === 'WO-1'),
    'a merged WO must NEVER get a spurious node-downgraded');
  // T2.3 (§7.1): reconcile appends its per-call next-action projection, so the only new line is that
  // projection — the merged WO still gets no node-downgraded of its own.
  const after = readLedger(root);
  assert.equal(after.length, before.length + 1, 'exactly one new line: the per-call next-action projection (§7.1), never a downgrade of the merged WO');
  assert.equal(after[after.length - 1].type, 'next-action', 'the sole new line is the projection');
  assert.ok(!r.resolved.some((x) => x.kind === 'downgrade' && x.workOrder === 'WO-1'),
    'a merged WO is never a downgrade subject');
  assert.deepEqual(r.terminalWorkOrders, ['WO-1'], 'the merged WO is terminal');
  assert.equal(r.workOrderStatuses['WO-1'], 'done', 'the derived status is done (terminal), never drifted to pending/running');
});

for (const t of tmps) { try { rmSync(t, { recursive: true, force: true }); } catch { /* best effort */ } }

if (process.exitCode) console.error(`\nreconcile-terminal-workorders: FAILURES above (${passed} passed).`);
else console.log(`\nreconcile-terminal-workorders: all ${passed} checks passed. ✓`);
