// Standalone test for lib/reconcile.mjs's lost-work downgrade site emitting a `node-downgraded`
// ledger event through the ledger controller (lib/ledger.mjs `append`) — node builtins only.
// Run: node test/reconcile-downgrade-event.test.mjs
//
// Plan 1 "organs" rework, T06: lib/ledger.mjs's `append()` is now the sole sanctioned write path
// to `.reasonable/ledger.jsonl`. This pins the ONE reconcile call site that must use it — the
// lost-work crash downgrade (dispatched → pending, no worktree, no commits landed) — and its
// non-fatal posture: recovery must never die because the progress tree hasn't seen this work
// order yet (no prior node-planned/node-dispatched to resolve `workOrder` against).

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

// A dispatched WO with no registered worktree and no branch → the exact lost-work-crash shape
// (`!wtExists && ahead === 0`, status !== 'checkpointed') the downgrade site handles.
function newEffort(ledgerLines) {
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
    workOrders: { 'WO-1': { status: 'dispatched', verticalSlice: 'slice-1', role: 'implementer' } },
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

// 1 — the node-planned/node-dispatched history exists → append() resolves WO-1 and lands a
//     node-downgraded line; the regenerated progress.json shows the attempt subtree failed with
//     detail "lost-work crash", and WO-1 itself pending (awaiting redispatch).
check('lost-work downgrade with a resolvable WO emits node-downgraded and regenerates progress.json', () => {
  const root = newEffort([
    { seq: 1, type: 'node-planned', node: 'WO-1', kind: 'work-order', title: 'wire the widget' },
    { seq: 2, type: 'node-dispatched', node: 'WO-1', kind: 'work-order', attempt: 1 },
  ]);
  const before = readLedgerLines(root).length;

  const r = reconcile(root);

  assert.equal(r.workOrders['WO-1'].status, 'pending', 'journal-side downgrade still happens');
  assert.ok(r.resolved.some((x) => x.kind === 'downgrade' && x.workOrder === 'WO-1'), 'downgrade recorded in resolved[]');

  const lines = readLedgerLines(root);
  assert.equal(lines.length, before + 1, 'exactly one new ledger line landed');
  const stamped = lines[lines.length - 1];
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

// 2 — DISCRIMINATOR: no prior node-planned/node-dispatched for WO-1 → append() cannot resolve
//     `workOrder` in the tree and returns {ok:false}. reconcile must still downgrade the journal
//     side, append NO ledger line, and never throw.
check('lost-work downgrade with an UNRESOLVABLE WO tolerates the append() miss: no ledger line, no throw', () => {
  const root = newEffort([]); // empty ledger — WO-1 has never been planned/dispatched in the tree
  const before = readLedgerLines(root).length;
  assert.equal(before, 0, 'sanity: ledger starts empty');

  let r;
  assert.doesNotThrow(() => { r = reconcile(root); }, 'an unresolvable node-downgraded must never throw');

  assert.equal(r.workOrders['WO-1'].status, 'pending', 'journal-side downgrade still happens despite the ledger miss');
  assert.ok(r.resolved.some((x) => x.kind === 'downgrade' && x.workOrder === 'WO-1'), 'downgrade still recorded in resolved[]');
  assert.ok(r.notes.some((n) => /WO-1/.test(n) && /not recorded/.test(n)), 'a non-fatal note records the ledger miss');

  const lines = readLedgerLines(root);
  assert.equal(lines.length, before, 'no ledger line appended when the node cannot be resolved');
});

// 3 — IDEMPOTENCY: reconcile() runs unconditionally on every SessionStart and has always been
//     safe to call repeatedly (pure reads, before this change). Calling it twice against the
//     SAME stuck fixture (journal.json is not rewritten between calls — that's the journal-
//     writer's job, not reconcile's) must land exactly ONE node-downgraded line, not two: the
//     second call must see the tree already reflects the downgrade (pending, detail "downgraded
//     — awaiting redispatch") and skip the append.
check('calling reconcile() twice against the same stuck WO appends node-downgraded only ONCE', () => {
  const root = newEffort([
    { seq: 1, type: 'node-planned', node: 'WO-1', kind: 'work-order', title: 'wire the widget' },
    { seq: 2, type: 'node-dispatched', node: 'WO-1', kind: 'work-order', attempt: 1 },
  ]);

  const r1 = reconcile(root);
  assert.equal(r1.workOrders['WO-1'].status, 'pending', 'first call downgrades journal-side');
  const afterFirst = readLedgerLines(root);
  const downgradesAfterFirst = afterFirst.filter((l) => l.type === 'node-downgraded' && l.workOrder === 'WO-1');
  assert.equal(downgradesAfterFirst.length, 1, 'first call appends exactly one node-downgraded line');

  const r2 = reconcile(root);
  assert.equal(r2.workOrders['WO-1'].status, 'pending', 'second call still reports the downgrade journal-side');
  const afterSecond = readLedgerLines(root);
  const downgradesAfterSecond = afterSecond.filter((l) => l.type === 'node-downgraded' && l.workOrder === 'WO-1');
  assert.equal(downgradesAfterSecond.length, 1, 'second call is a no-op on the ledger: still exactly one node-downgraded line, not two');
  assert.equal(afterSecond.length, afterFirst.length, 'no new ledger line of any kind landed on the second call');
});

for (const t of tmps) { try { rmSync(t, { recursive: true, force: true }); } catch { /* best effort */ } }

if (process.exitCode) console.error(`\nreconcile-downgrade-event: FAILURES above (${passed} passed).`);
else console.log(`\nreconcile-downgrade-event: all ${passed} checks passed. ✓`);
