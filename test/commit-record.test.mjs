// Standalone test for lib/commit-record.mjs — node builtins only (no runner).
// Run: node test/commit-record.test.mjs
//
// THE REGRESSION (sofia-plays graph-editor, 2026-06-27, D20). A lane commit landed but
// the session hit its limit before the accounting ledger line was appended. reconcile's
// SHA-accounting found a lane commit with no recorded SHA and no ledger line → AMBIGUOUS
// → HALT, stranding ~20 min of committed work. This test reproduces that exact frozen
// state in a throwaway repo and proves the fix: the commit-record hook accounts the commit
// the instant it lands, flipping reconcile from HALT to RECLAIM. Also pins the trust anchor
// (a mismatched trailer is NOT auto-accounted) and idempotency.

import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { reconcile } from '../lib/reconcile.mjs';
import { recordCommit } from '../lib/commit-record.mjs';
import { readJsonl, norm } from '../lib/effort.mjs';

const here = dirname(fileURLToPath(import.meta.url));

const git = (cwd, ...args) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
const write = (root, rel, content) => {
  const p = join(root, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, content);
};
const ledgerOf = (root) => readJsonl(join(root, '.reasonable', 'ledger.jsonl'));

const tmps = [];
function newRepo(prefix) {
  const root = mkdtempSync(join(tmpdir(), prefix)); tmps.push(root);
  git(root, 'init', '-q');
  const hooks = join(root, '.nohooks'); mkdirSync(hooks, { recursive: true });
  git(root, 'config', 'core.hooksPath', hooks);
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'user.name', 'Commit Record Test');
  git(root, 'config', 'commit.gpgsign', 'false');
  write(root, 'README.md', 'base\n');
  write(root, '.gitignore', '.reasonable/\n.worktrees/\n.nohooks/\n');
  git(root, 'add', '-A'); git(root, 'commit', '-q', '-m', 'init');
  git(root, 'branch', 'effort/demo');
  return root;
}

/**
 * Provision a lane and land ONE Work-Order-trailered work-product commit on it, WITHOUT
 * appending any ledger line — the exact "session died after commit, before accounting" state.
 * Returns { worktree, sha, command } (command = a realistic `git -C <worktree> commit` string).
 */
function landUnaccountedLaneCommit(root, woId, trailerWO) {
  const worktree = join(root, '.worktrees', woId);
  git(root, 'worktree', 'add', '-q', worktree, '-b', `lane/${woId}`, 'effort/demo');
  // The lane descriptor (the trust anchor) — written by the provisioner before the worker runs.
  write(worktree, '.reasonable-lane.json', JSON.stringify({ workOrder: woId, effortRoot: root, role: 'implementer', locus: ['src/**'] }) + '\n');
  write(worktree, 'src/feature.js', `export const f = '${woId}';\n`);
  git(worktree, 'add', 'src');
  git(worktree, 'commit', '-q', '-m', `feat(${woId}): work product`, '-m', `Work-Order: ${trailerWO}`);
  const sha = git(worktree, 'rev-parse', 'HEAD').trim();
  return { worktree, sha, command: `git -C "${norm(worktree)}" commit -m "feat: work product"` };
}

function newEffort(prefix, woId = 'WO-A', trailerWO = 'WO-A') {
  const root = newRepo(prefix);
  write(root, '.reasonable/config.json', JSON.stringify({ effort: 'demo', runMode: 'autonomous', effortBranch: 'effort/demo' }) + '\n');
  write(root, '.reasonable/journal.json', JSON.stringify({
    effort: 'demo', currentVerticalSlice: 'slice-1', phase: 'vertical-slice-execution', supervision: 'standard',
    workOrders: { [woId]: { status: 'dispatched', role: 'implementer', verticalSlice: 'slice-1', worktree: `.worktrees/${woId}`, branch: `lane/${woId}` } },
    lanes: { [`.worktrees/${woId}`]: woId }, inbox: [],
  }, null, 2) + '\n');
  // A non-empty ledger that does NOT name the lane commit (mirrors the 44-event sofia ledger).
  write(root, '.reasonable/ledger.jsonl', JSON.stringify({ seq: 1, type: 'ratification', gate: 'analysis', runMode: 'autonomous' }) + '\n');
  const lane = landUnaccountedLaneCommit(root, woId, trailerWO);
  return { root, ...lane, woId };
}

function payload(root, command, agentType = 'reasonable:implementer') {
  return { tool_name: 'Bash', tool_input: { command }, cwd: root, agent_type: agentType };
}

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.message}`); process.exitCode = 1; }
}

// 1 — the incident: an unaccounted lane commit HALTS reconcile (AMBIGUOUS, unaccounted custody).
check('BEFORE record: unaccounted lane commit → reconcile HALTS', () => {
  const { root, sha } = newEffort('cr-halt-');
  const r = reconcile(root);
  assert.equal(r.halt, true, 'must halt on the unaccounted lane commit');
  assert.match(r.haltReason || '', /no recorded SHA and no ledger line/, 'halt reason names the custody gap');
  // sanity: the work is in git, just unaccounted.
  assert.ok(sha && sha.length >= 7);
});

// 2 — the fix: recordCommit accounts the just-landed commit (acted, correct sha + WO).
check('recordCommit: accounts the lane HEAD commit', () => {
  const { root, sha, command, woId } = newEffort('cr-act-');
  const res = recordCommit(payload(root, command));
  assert.equal(res.acted, true, 'must act on an unaccounted trailered lane commit');
  assert.equal(res.sha, sha, 'records the lane HEAD sha');
  assert.equal(res.workOrder, woId);
  const line = ledgerOf(root).find((e) => e.type === 'commit' && e.commit === sha);
  assert.ok(line, 'a {type:"commit"} ledger line now names the commit');
  assert.equal(line.workOrder, woId);
});

// 3 — halt → reclaim: after recording, reconcile RESOLVES the same effort (reclaim, no halt).
check('AFTER record: reconcile RECLAIMS instead of halting', () => {
  const { root, command } = newEffort('cr-reclaim-');
  assert.equal(reconcile(root).halt, true, 'precondition: halts before recording');
  recordCommit(payload(root, command));
  const r = reconcile(root);
  assert.equal(r.halt, false, 'must NOT halt once the commit is accounted');
  assert.ok((r.resolved || []).some((x) => x.workOrder === 'WO-A' && x.kind === 'reclaim'), 'WO-A reclaimed');
});

// 4 — idempotent: re-firing on a later Bash does not double-account.
check('recordCommit: idempotent (one custody line per sha)', () => {
  const { root, sha, command } = newEffort('cr-idem-');
  assert.equal(recordCommit(payload(root, command)).acted, true);
  const second = recordCommit(payload(root, command));
  assert.equal(second.acted, false);
  assert.equal(second.reason, 'already-accounted');
  const count = ledgerOf(root).filter((e) => e.type === 'commit' && e.commit === sha).length;
  assert.equal(count, 1, 'exactly one commit line for the sha');
});

// 5 — trust anchor: a commit whose trailer does NOT match the lane descriptor is NOT accounted
//     (trailers are hints, not anchors — a forged/copied trailer cannot self-account).
check('recordCommit: mismatched trailer is NOT auto-accounted', () => {
  const { root, command } = newEffort('cr-trailer-', 'WO-B', 'WO-OTHER'); // descriptor WO-B, trailer WO-OTHER
  const res = recordCommit(payload(root, command));
  assert.equal(res.acted, false);
  assert.equal(res.reason, 'trailer-mismatch');
  assert.equal(ledgerOf(root).filter((e) => e.type === 'commit').length, 0, 'no custody line written');
});

// 6 — scope: a Bash call that does not target a lane worktree is a silent no-op.
check('recordCommit: non-lane Bash → no-op', () => {
  const { root } = newEffort('cr-nonlane-');
  const res = recordCommit(payload(root, 'ls -la')); // no worktree token; cwd=root has no lane descriptor
  assert.equal(res.acted, false);
  assert.equal(res.reason, 'no-lane');
});

// 7 — wiring: the hook runs end-to-end from a stdin payload (process boundary), fail-open.
check('hook CLI: records via stdin payload, exits 0', () => {
  const { root, sha, command } = newEffort('cr-cli-');
  const LIB = join(here, '..', 'lib', 'commit-record.mjs');
  execFileSync('node', [LIB, '--hook'], { cwd: root, input: JSON.stringify(payload(root, command)), stdio: ['pipe', 'pipe', 'pipe'] });
  assert.ok(ledgerOf(root).some((e) => e.type === 'commit' && e.commit === sha), 'the hook process accounted the commit');
});

for (const t of tmps) { try { rmSync(t, { recursive: true, force: true }); } catch { /* best effort */ } }

if (process.exitCode) console.error(`\ncommit-record: FAILURES above (${passed} passed).`);
else console.log(`\ncommit-record: all ${passed} checks passed. ✓`);
