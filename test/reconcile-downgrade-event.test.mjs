// Standalone test for lib/reconcile.mjs's lost-work downgrade site emitting a `node-downgraded`
// ledger event through the ledger controller (lib/ledger.mjs `append`) — node builtins only.
// Run: node test/reconcile-downgrade-event.test.mjs
//
// Plan 1 "organs" rework, T06: lib/ledger.mjs's `append()` is now the sole sanctioned write path
// to `.reasonable/ledger.jsonl`. This pins the ONE reconcile call site that must use it — the
// lost-work crash downgrade (running-per-the-fold, no worktree, no commits landed) — and its
// non-fatal posture: recovery must never die because the progress tree hasn't seen this work
// order yet.
//
// T0.4 (retire the journal per-WO `status`): the journals here carry NO `status` field. The
// downgrade is driven by the LEDGER FOLD (a `node-dispatched` with no terminal folds to `running`),
// never by a journal status. A legacy `status` that disagrees with the fold NEVER governs the live
// decision (test 2).

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

// Build an effort. `workOrder` is the lane-registry record for WO-1 (NO `status` field by default —
// T0.4 retired it); pass one to model a legacy journal that still carries `status`.
function newEffort(ledgerLines, workOrder = { verticalSlice: 'slice-1', role: 'implementer' }) {
  const root = mkdtempSync(join(tmpdir(), 'rdge-')); tmps.push(root);
  git(root, 'init', '-q');
  const hooks = join(root, '.nohooks'); mkdirSync(hooks, { recursive: true });
  git(root, 'config', 'core.hooksPath', hooks);
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'user.name', 'Reconcile Downgrade Event Test');
  git(root, 'config', 'commit.gpgsign', 'false');
  write(root, 'README.md', 'base\n');
  write(root, '.gitignore', '.reasonable/\n.worktrees/\n.nohooks/\n');
  git(root, 'add', '-A'); git(root, 'commit', '-q', '-m', 'init');
  git(root, 'branch', 'effort/demo');

  write(root, '.reasonable/config.json', JSON.stringify({ effort: 'demo', runMode: 'autonomous', effortBranch: 'effort/demo' }) + '\n');
  write(root, '.reasonable/journal.json', JSON.stringify({
    effort: 'demo', currentVerticalSlice: 'slice-1', phase: 'vertical-slice-execution', supervision: 'standard',
    workOrders: { 'WO-1': workOrder },
    lanes: {}, inbox: [],
  }, null, 2) + '\n');
  write(root, '.reasonable/ledger.jsonl', ledgerLines.map((e) => JSON.stringify(e)).join('\n') + (ledgerLines.length ? '\n' : ''));
  return root;
}

function readLedgerLines(root) {
  const p = join(root, '.reasonable', 'ledger.jsonl');
  if (!existsSync(p)) return [];
  return readFileSync(p, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => JSON.parse(l));
}

function readProgress(root) {
  const p = join(root, '.reasonable', 'progress.json');
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null;
}

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.stack || e.message}`); process.exitCode = 1; }
}

// 1 — the node-planned/node-dispatched history folds WO-1 to `running` (no journal status needed) →
//     append() resolves WO-1 and lands a node-downgraded line; the regenerated progress.json shows the
//     attempt subtree failed with detail "lost-work crash", and WO-1 itself pending.
check('status-free journal: a fold-running WO with no lane on disk downgrades, emitting node-downgraded', () => {
  const root = newEffort([
    { seq: 1, type: 'node-planned', node: 'WO-1', kind: 'work-order', title: 'wire the widget' },
    { seq: 2, type: 'node-dispatched', node: 'WO-1', kind: 'work-order', attempt: 1 },
  ]);
  const before = readLedgerLines(root).length;

  const r = reconcile(root);

  // No journal `status` exists; the DERIVED status map reflects the downgrade, and resolved[] records it.
  assert.equal(r.workOrderStatuses['WO-1'], 'pending', 'derived status reflects the downgrade (no journal field written)');
  assert.equal(r.workOrders['WO-1'].status, undefined, 'the journal carries NO per-WO status field (T0.4)');
  assert.ok(r.resolved.some((x) => x.kind === 'downgrade' && x.workOrder === 'WO-1'), 'downgrade recorded in resolved[]');

  const lines = readLedgerLines(root);
  // T2.3 (§7.1): reconcile now appends TWO lines on a crash-recovery call — the node-downgraded seal
  // AND a per-call next-action projection (a recorded event, like the verdicts the ledger already
  // carries). The projection is appended LAST, so the node-downgraded is fetched by filter, not tail.
  assert.equal(lines.length, before + 2, 'two new ledger lines: the node-downgraded seal + the per-call next-action projection');
  assert.ok(lines.some((l) => l.type === 'next-action'), 'a next-action projection also landed (per-call, §7.1)');
  const downgrades = lines.filter((l) => l.type === 'node-downgraded' && l.workOrder === 'WO-1');
  assert.equal(downgrades.length, 1, 'exactly one node-downgraded line');
  const stamped = downgrades[0];
  assert.equal(stamped.type, 'node-downgraded');
  assert.equal(stamped.workOrder, 'WO-1');
  assert.equal(stamped.node, 'WO-1', 'append() resolved workOrder to its tree node');
  assert.equal(stamped.attempt, 1, 'append() stamped the attempt number');
  assert.ok(stamped.ts, 'append() stamped its own ts');

  const progress = readProgress(root);
  assert.ok(progress, 'progress.json was regenerated (append()\'s default regen:true)');
  const wo1 = progress.children.find((c) => c.id === 'WO-1');
  assert.ok(wo1, 'WO-1 node present in the progress tree');
  assert.equal(wo1.status, 'failed', 'the downgrade seals the WO (its live attempt) failed');
  assert.equal(wo1.detail, 'lost-work crash', 'carrying the lost-work crash detail — the retry will be a sibling');
  assert.deepEqual(wo1.children.map((c) => c.id), [], 'no attempt wrapper — attempt 1 IS the WO node itself');
});

// 2 — T0.4 DISCRIMINATOR: a LEGACY journal still carrying status:'dispatched', but with an EMPTY ledger
//     (fold absent) AND no lane registry (no worktree/branch), is NOT treated as live. The fold governs,
//     not the journal status: reconcile does NOT downgrade it, appends NO ledger line, and never throws.
check('legacy status:"dispatched" does NOT govern: no fold + no lane → not live, no downgrade, no ledger line', () => {
  const root = newEffort([], { status: 'dispatched', verticalSlice: 'slice-1', role: 'implementer' });
  const before = readLedgerLines(root).length;
  assert.equal(before, 0, 'sanity: ledger starts empty (fold has no entry for WO-1)');

  let r;
  assert.doesNotThrow(() => { r = reconcile(root); }, 'reconcile must never throw on a status-only legacy claim');

  assert.ok(!r.resolved.some((x) => x.kind === 'downgrade' && x.workOrder === 'WO-1'),
    'the retired status must NOT drive a downgrade — the fold (absent) governs');
  // T2.3 (§7.1): no node-downgraded (the WO is not live), but reconcile still appends its per-call
  // next-action projection — so exactly ONE new line lands, and it is the projection, never a downgrade.
  const after = readLedgerLines(root);
  assert.ok(!after.some((l) => l.type === 'node-downgraded'), 'no node-downgraded — the WO is not live per the fold+registry');
  assert.equal(after.length, before + 1, 'exactly one new line: the per-call next-action projection (§7.1)');
  assert.equal(after[after.length - 1].type, 'next-action', 'the sole new line is the projection');
  assert.equal(r.workOrderStatuses['WO-1'], 'pending', 'a registered WO with no ledger events reads pending in the derived map');
});

// 3 — IDEMPOTENCY: reconcile() runs unconditionally on every SessionStart. A stuck WO kept LIVE by its
//     registered lane (a `branch` — a lane-registry fact) re-enters the downgrade branch on the second
//     call; the `alreadyRecorded` tree guard must still land exactly ONE node-downgraded line, not two.
check('calling reconcile() twice against the same stuck WO appends node-downgraded only ONCE', () => {
  const root = newEffort([
    { seq: 1, type: 'node-planned', node: 'WO-1', kind: 'work-order', title: 'wire the widget' },
    { seq: 2, type: 'node-dispatched', node: 'WO-1', kind: 'work-order', attempt: 1 },
  ], { verticalSlice: 'slice-1', role: 'implementer', branch: 'lane/WO-1' }); // branch keeps it live on re-pass

  const r1 = reconcile(root);
  assert.equal(r1.workOrderStatuses['WO-1'], 'pending', 'first call downgrades (derived status)');
  const afterFirst = readLedgerLines(root);
  const downgradesAfterFirst = afterFirst.filter((l) => l.type === 'node-downgraded' && l.workOrder === 'WO-1');
  assert.equal(downgradesAfterFirst.length, 1, 'first call appends exactly one node-downgraded line');

  const r2 = reconcile(root);
  assert.equal(r2.workOrderStatuses['WO-1'], 'pending', 'second call still reports the downgrade (derived status)');
  const afterSecond = readLedgerLines(root);
  const downgradesAfterSecond = afterSecond.filter((l) => l.type === 'node-downgraded' && l.workOrder === 'WO-1');
  assert.equal(downgradesAfterSecond.length, 1, 'second call is a no-op on node-downgraded: still exactly one, not two (the alreadyRecorded tree guard)');
  // T2.3 (§7.1): the node-downgraded is still deduped, but reconcile appends one next-action projection
  // PER CALL — a deliberate behavior change (projections are recorded events, not deduped like the seal).
  const naFirst = afterFirst.filter((l) => l.type === 'next-action').length;
  const naSecond = afterSecond.filter((l) => l.type === 'next-action').length;
  assert.equal(naSecond, naFirst + 1, 'the second call appends exactly one more next-action projection (per-call, §7.1)');
  assert.equal(afterSecond.length, afterFirst.length + 1, 'the ONLY new line on the second call is that next-action — no duplicate node-downgraded');
});

// 4 — an UNRESOLVABLE downgrade tolerates the append() miss: a WO kept live by its branch registry but
//     with NO node-planned/node-dispatched in the ledger → append() cannot resolve the tree node and
//     returns {ok:false}. reconcile records the downgrade (derived status), appends NO line, never throws.
check('lost-work downgrade with an UNRESOLVABLE tree node tolerates the append() miss: no ledger line, no throw', () => {
  const root = newEffort([], { verticalSlice: 'slice-1', role: 'implementer', branch: 'lane/WO-1' });
  const before = readLedgerLines(root).length;
  assert.equal(before, 0, 'sanity: ledger starts empty');

  let r;
  assert.doesNotThrow(() => { r = reconcile(root); }, 'an unresolvable node-downgraded must never throw');

  assert.equal(r.workOrderStatuses['WO-1'], 'pending', 'derived downgrade still recorded despite the ledger miss');
  assert.ok(r.resolved.some((x) => x.kind === 'downgrade' && x.workOrder === 'WO-1'), 'downgrade still recorded in resolved[]');
  assert.ok(r.notes.some((n) => /WO-1/.test(n) && /not recorded/.test(n)), 'a non-fatal note records the ledger miss');
  // T2.3 (§7.1): the node-downgraded could not be resolved (no tree node) → no such line. But reconcile
  // still appends its per-call next-action projection — so exactly ONE new line lands, and it is the projection.
  const after = readLedgerLines(root);
  assert.ok(!after.some((l) => l.type === 'node-downgraded'), 'no node-downgraded line appended when the node cannot be resolved');
  assert.equal(after.length, before + 1, 'exactly one new line: the per-call next-action projection (§7.1)');
  assert.equal(after[after.length - 1].type, 'next-action', 'the sole new line is the projection');
});

for (const t of tmps) { try { rmSync(t, { recursive: true, force: true }); } catch { /* best effort */ } }

if (process.exitCode) console.error(`\nreconcile-downgrade-event: FAILURES above (${passed} passed).`);
else console.log(`\nreconcile-downgrade-event: all ${passed} checks passed. ✓`);
