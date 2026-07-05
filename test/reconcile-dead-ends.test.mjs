// Standalone test for lib/reconcile.mjs `deadEnds` — node builtins only.
// Run: node test/reconcile-dead-ends.test.mjs
//
// WHY (thin-planner follow-up, 2026-07-05). The thin route-planner lost Bash, so it
// can no longer read the ledger's dead-end verdicts — the one fact that should
// dominate a replan. reconcile now folds the set mechanically (lib/dead-ends.mjs)
// and the briefing carries it, minus already-merged ids, with RETIREMENT semantics
// (a dead-ended id is never re-proposed; docs/roadmap/dead-end-blast-radius.md).

import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

import { reconcile } from '../lib/reconcile.mjs';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
const write = (root, rel, content) => {
  const p = join(root, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, content);
};

function newEffort(workOrders, ledgerLines) {
  const root = mkdtempSync(join(tmpdir(), 'rde-'));
  git(root, 'init', '-q');
  const hooks = join(root, '.nohooks'); mkdirSync(hooks, { recursive: true });
  git(root, 'config', 'core.hooksPath', hooks);
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'user.name', 'Reconcile DeadEnds Test');
  git(root, 'config', 'commit.gpgsign', 'false');
  write(root, 'README.md', 'base\n');
  write(root, '.gitignore', '.reasonable/\n.worktrees/\n');
  git(root, 'add', '-A'); git(root, 'commit', '-q', '-m', 'init');
  git(root, 'branch', 'effort/demo');
  write(root, '.reasonable/config.json', JSON.stringify({ effort: 'demo', runMode: 'autonomous', effortBranch: 'effort/demo' }) + '\n');
  write(root, '.reasonable/journal.json', JSON.stringify({
    effort: 'demo', currentVerticalSlice: 'slice-1', phase: 'vertical-slice-execution', supervision: 'standard',
    workOrders, lanes: {}, inbox: [],
  }, null, 2) + '\n');
  write(root, '.reasonable/ledger.jsonl', ledgerLines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  return root;
}

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.message}`); process.exitCode = 1; }
}

check('a ledger dead-end event surfaces in result.deadEnds with seq + hash', () => {
  const root = newEffort(
    { 'WO-X': { status: 'dead-end', verticalSlice: 'slice-1', role: 'implementer' } },
    [{ seq: 1, type: 'ratification', gate: 'analysis' },
     { seq: 2, type: 'dead-end', workOrder: 'WO-X', hash: 'sha256:aa' }],
  );
  const r = reconcile(root);
  assert.deepEqual(r.deadEnds, [{ workOrder: 'WO-X', ledgerSeq: 2, hash: 'sha256:aa' }]);
});

check('a refutation-surviving infeasible verdict surfaces; a merged id is excluded (terminal wins)', () => {
  const root = newEffort(
    {
      'WO-A': { status: 'dead-end', verticalSlice: 'slice-1', role: 'implementer' },
      'WO-B': { status: 'merged', verticalSlice: 'slice-1', role: 'implementer' },
    },
    [{ seq: 1, type: 'verdict', kind: 'infeasible', survivedSkeptic: true, workOrder: 'WO-A' },
     { seq: 2, type: 'dead-end', workOrder: 'WO-B', hash: null }], // later merged -> excluded
  );
  const r = reconcile(root);
  assert.deepEqual(r.deadEnds, [{ workOrder: 'WO-A', ledgerSeq: 1, hash: null }]);
  assert.deepEqual(r.terminalWorkOrders, ['WO-B'], 'sanity: WO-B is terminal, which is WHY it is excluded');
});

check('no binding events -> deadEnds is an empty array (field always present)', () => {
  const root = newEffort(
    { 'WO-C': { status: 'pending', verticalSlice: 'slice-1', role: 'implementer' } },
    [{ seq: 1, type: 'ratification', gate: 'analysis' }],
  );
  const r = reconcile(root);
  assert.deepEqual(r.deadEnds, []);
});

if (process.exitCode) console.error(`\nreconcile-dead-ends: FAILURES above (${passed} passed).`);
else console.log(`\nreconcile-dead-ends: all ${passed} checks passed. ✓`);
