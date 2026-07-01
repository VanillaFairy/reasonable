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
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

import { reconcile } from '../lib/reconcile.mjs';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
const write = (root, rel, content) => {
  const p = join(root, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, content);
};

const tmps = [];
function newEffort(workOrders) {
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
  write(root, '.reasonable/ledger.jsonl', JSON.stringify({ seq: 1, type: 'ratification', gate: 'analysis' }) + '\n');
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

// 2 — the canonical docs/artifacts.md shape: status:"merged" with no separate merged field.
check('a work order with status:"merged" (no merged field) is also reported terminal', () => {
  const root = newEffort({
    'WO-A': { status: 'merged', verticalSlice: 'slice-1', role: 'implementer' },
  });
  const r = reconcile(root);
  assert.deepEqual(r.terminalWorkOrders, ['WO-A']);
});

// 3 — pending/dispatched/checkpointed/dead-end work orders are NOT terminal (a
//     dead-end may still un-bind and be re-dispatched once an input changes —
//     that is redispatch-guard.mjs's job, not this mechanical set).
check('pending/dispatched/checkpointed/dead-end work orders are not terminal', () => {
  const root = newEffort({
    'WO-B': { status: 'pending', verticalSlice: 's', role: 'implementer' },
    'WO-C': { status: 'dispatched', verticalSlice: 's', role: 'implementer' },
    'WO-D': { status: 'checkpointed', verticalSlice: 's', role: 'implementer' },
    'WO-E': { status: 'dead-end', verticalSlice: 's', role: 'implementer' },
  });
  const r = reconcile(root);
  assert.deepEqual(r.terminalWorkOrders, []);
});

for (const t of tmps) { try { rmSync(t, { recursive: true, force: true }); } catch { /* best effort */ } }

if (process.exitCode) console.error(`\nreconcile-terminal-workorders: FAILURES above (${passed} passed).`);
else console.log(`\nreconcile-terminal-workorders: all ${passed} checks passed. ✓`);
