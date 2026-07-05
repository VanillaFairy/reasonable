// Standalone test for lib/reconcile.mjs after T0.4 retired the journal's per-work-order `status`
// field — node builtins only. Run: node test/reconcile-status-retired.test.mjs
//
// T0.4 (spec §5.2, F8). `journal.workOrders[id].status` is gone. A work order's status is the LEDGER
// FOLD (lib/wo-status.mjs), the source of truth. This pins:
//   1. a status-FREE journal (lane registry only) → reconcile derives every WO status from the fold,
//      exposes it as result.workOrderStatuses, and computes terminalWorkOrders from the fold's `done`.
//   2. a LEGACY journal still carrying `status` that DISAGREES with the fold → the fold wins and a
//      cross-check warning note fires; the legacy status never governs.
//   3. the lost-checkpoint-anchor AMBIGUOUS halt is sourced from the durable ledger `node-checkpointed`
//      event (the fold folds a checkpoint into `running`), NOT from a journal status — and a plain
//      dispatched WO in the same git shape is a downgrade, not a halt (the ledger distinguishes them).

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
function newEffort(workOrders, ledgerLines, lanes = {}) {
  const root = mkdtempSync(join(tmpdir(), 'rsr-')); tmps.push(root);
  git(root, 'init', '-q');
  const hooks = join(root, '.nohooks'); mkdirSync(hooks, { recursive: true });
  git(root, 'config', 'core.hooksPath', hooks);
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'user.name', 'Reconcile Status Retired Test');
  git(root, 'config', 'commit.gpgsign', 'false');
  write(root, 'README.md', 'base\n');
  write(root, '.gitignore', '.reasonable/\n.worktrees/\n.nohooks/\n');
  git(root, 'add', '-A'); git(root, 'commit', '-q', '-m', 'init');
  git(root, 'branch', 'effort/demo');

  write(root, '.reasonable/config.json', JSON.stringify({ effort: 'demo', runMode: 'autonomous', effortBranch: 'effort/demo' }) + '\n');
  write(root, '.reasonable/journal.json', JSON.stringify({
    effort: 'demo', currentVerticalSlice: 'slice-1', phase: 'vertical-slice-execution', supervision: 'standard',
    workOrders, lanes, inbox: [],
  }, null, 2) + '\n');
  write(root, '.reasonable/ledger.jsonl', ledgerLines.map((e) => JSON.stringify(e)).join('\n') + (ledgerLines.length ? '\n' : ''));
  return root;
}

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.stack || e.message}`); process.exitCode = 1; }
}

// 1 — a STATUS-FREE journal (every WO record is lane-registry only) → reconcile derives each status
//     from the ledger fold and exposes it as result.workOrderStatuses; terminalWorkOrders is the
//     fold's `done`. The field is truly unneeded: nothing here reads a journal status.
check('status-free journal: every WO status is derived from the ledger fold', () => {
  const root = newEffort(
    {
      'WO-done': { verticalSlice: 'slice-1', role: 'implementer' },
      'WO-blocked': { verticalSlice: 'slice-1', role: 'implementer' },
      'WO-dropped': { verticalSlice: 'slice-1', role: 'implementer' },
      'WO-pending': { verticalSlice: 'slice-1', role: 'implementer' },
    },
    [
      { seq: 1, type: 'node-planned', node: 'slice-1/WO-done', kind: 'work-order', title: 'd' },
      { seq: 2, type: 'node-dispatched', node: 'slice-1/WO-done', kind: 'work-order', attempt: 1 },
      { seq: 3, type: 'node-completed', node: 'slice-1/WO-done' },
      { seq: 4, type: 'node-planned', node: 'slice-1/WO-blocked', kind: 'work-order', title: 'b' },
      { seq: 5, type: 'node-dispatched', node: 'slice-1/WO-blocked', kind: 'work-order', attempt: 1 },
      { seq: 6, type: 'node-failed', node: 'slice-1/WO-blocked', reason: 'wall' },
      { seq: 7, type: 'node-planned', node: 'slice-1/WO-dropped', kind: 'work-order', title: 'x' },
      { seq: 8, type: 'amendment', component: 'c', drops: [{ workOrder: 'WO-dropped' }] },
      { seq: 9, type: 'node-planned', node: 'slice-1/WO-pending', kind: 'work-order', title: 'p' },
    ],
  );
  const r = reconcile(root);
  assert.equal(r.halt, false, `must not halt; haltReason: ${r.haltReason || ''}`);
  assert.deepEqual(r.workOrderStatuses, {
    'WO-done': 'done', 'WO-blocked': 'blocked', 'WO-dropped': 'dropped', 'WO-pending': 'pending',
  }, 'workOrderStatuses is the fold, verbatim');
  assert.deepEqual(r.terminalWorkOrders, ['WO-done'], 'terminal = the fold\'s done');
  // None of the journal records has a `status` key — prove the derivation used none.
  for (const wo of Object.values(r.workOrders)) assert.equal(wo.status, undefined, 'no journal status field exists');
});

// 2 — a LEGACY journal still carrying `status` that DISAGREES with the fold → the fold WINS and a
//     cross-check warning note fires (the legacy value never governs). Mirrors the T0.1 note shape.
check('legacy status disagreeing with the fold → fold wins + a warning note (never governs)', () => {
  const root = newEffort(
    { 'WO-1': { status: 'dispatched', verticalSlice: 'slice-1', role: 'implementer' } }, // legacy claim
    [
      { seq: 1, type: 'node-planned', node: 'slice-1/WO-1', kind: 'work-order', title: 'w' },
      { seq: 2, type: 'node-dispatched', node: 'slice-1/WO-1', kind: 'work-order', attempt: 1 },
      { seq: 3, type: 'node-completed', node: 'slice-1/WO-1' }, // fold says DONE
    ],
  );
  const r = reconcile(root);
  assert.ok(
    r.notes.some((n) => /WO-1/.test(n) && /disagrees with ledger fold 'done'/.test(n) && /legacy/.test(n)),
    `expected a legacy-status disagreement note; got: ${JSON.stringify(r.notes)}`,
  );
  assert.equal(r.workOrderStatuses['WO-1'], 'done', 'the fold (done) wins over the legacy dispatched');
  assert.ok(!r.resolved.some((x) => x.workOrder === 'WO-1' && x.kind === 'downgrade'),
    'a fold-done WO is never downgraded, whatever the legacy status claimed');
});

// 3 — the lost-checkpoint-anchor AMBIGUOUS halt is sourced from the ledger `node-checkpointed`, NOT a
//     journal status. A checkpointed WO with no worktree and no commits → AMBIGUOUS (anchor lost).
check('ledger node-checkpointed drives the lost-checkpoint-anchor AMBIGUOUS halt (no journal status)', () => {
  const root = newEffort(
    { 'WO-1': { verticalSlice: 'slice-1', role: 'implementer' } }, // status-free
    [
      { seq: 1, type: 'node-planned', node: 'WO-1', kind: 'work-order', title: 'w' },
      { seq: 2, type: 'node-dispatched', node: 'WO-1', kind: 'work-order', attempt: 1 },
      { seq: 3, type: 'node-checkpointed', node: 'WO-1' }, // checkpoint recorded, but no commit/worktree
    ],
  );
  const r = reconcile(root);
  assert.equal(r.halt, true, 'a checkpoint with no on-disk anchor must halt');
  assert.ok(/checkpoint anchor missing/.test(r.haltReason || ''), `halt names the checkpoint anchor: ${r.haltReason || ''}`);
  assert.ok(r.notes.some((n) => /WO-1/.test(n) && /checkpoint anchor lost/.test(n)),
    `expected a lost-checkpoint note; got: ${JSON.stringify(r.notes)}`);
});

// 4 — DISCRIMINATOR: the SAME git shape (no worktree, no commits) but the ledger's last lifecycle event
//     is a plain node-dispatched (NOT a checkpoint) → a lost-work DOWNGRADE, never the checkpoint halt.
//     Proves the halt keys on the ledger checkpoint signal, not merely on "running + no lane".
check('plain dispatched (no checkpoint) in the same git shape → downgrade, not the checkpoint halt', () => {
  const root = newEffort(
    { 'WO-1': { verticalSlice: 'slice-1', role: 'implementer' } },
    [
      { seq: 1, type: 'node-planned', node: 'WO-1', kind: 'work-order', title: 'w' },
      { seq: 2, type: 'node-dispatched', node: 'WO-1', kind: 'work-order', attempt: 1 },
    ],
  );
  const r = reconcile(root);
  assert.equal(r.halt, false, 'a plain lost dispatch is a safe downgrade, not a halt');
  assert.ok(r.resolved.some((x) => x.kind === 'downgrade' && x.workOrder === 'WO-1'),
    'the plain dispatched WO is downgraded');
  assert.ok(!/checkpoint anchor/.test(r.haltReason || ''), 'no checkpoint-anchor ambiguity for a plain dispatch');
});

for (const t of tmps) { try { rmSync(t, { recursive: true, force: true }); } catch { /* best effort */ } }

if (process.exitCode) console.error(`\nreconcile-status-retired: FAILURES above (${passed} passed).`);
else console.log(`\nreconcile-status-retired: all ${passed} checks passed. ✓`);
