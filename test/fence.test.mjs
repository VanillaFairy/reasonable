// Standalone test for lib/fence.mjs — node builtins only (no runner).
// Run: node test/fence.test.mjs
//
// Two halves:
//   • the structured-edit fence (Edit/Write/…) — pins today's behavior so the
//     refactor into categorical() is provably safe;
//   • the Bash backstop (law 7) — proves a lane can no longer route around the
//     enforcement-layer / contract-authority laws via shell redirection, while a
//     no-lane Bash write (census, the orchestrator's main checkout) stays allowed.

import assert from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const FENCE = join(here, '..', 'lib', 'fence.mjs');

const tmps = [];
const write = (root, rel, content) => {
  const p = join(root, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, content);
};

/** A bare effort root (has .reasonable/, optionally a lane descriptor). */
function newEffort({ lane } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'fence-test-')); tmps.push(root);
  write(root, '.reasonable/config.json', JSON.stringify({ effort: 'demo' }) + '\n');
  if (lane) write(root, '.reasonable-lane.json', JSON.stringify({ effortRoot: root, ...lane }) + '\n');
  return root;
}

/** Run the fence with a PreToolUse payload; return {denied, reason}. */
function runFence(cwd, payload) {
  const out = execFileSync('node', [FENCE], {
    cwd, input: JSON.stringify({ cwd, ...payload }), stdio: ['pipe', 'pipe', 'pipe'],
  }).toString().trim();
  if (!out) return { denied: false, reason: '' };
  const j = JSON.parse(out);
  return {
    denied: j.hookSpecificOutput && j.hookSpecificOutput.permissionDecision === 'deny',
    reason: (j.hookSpecificOutput && j.hookSpecificOutput.permissionDecisionReason) || '',
  };
}
const edit = (root, rel) => ({ tool_name: 'Edit', tool_input: { file_path: join(root, rel) } });
const editAbs = (abs) => ({ tool_name: 'Edit', tool_input: { file_path: abs } });
const bash = (command) => ({ tool_name: 'Bash', tool_input: { command } });
// Stamp a payload with the harness agent-role (the identity the fence governs
// canonical .reasonable/ writes by). A reasonable:<role> mirrors a workflow agent()
// dispatch; absent => main session (trusted control plane).
const as = (payload, role) => ({ ...payload, agent_type: role });

/**
 * A realistic TWO-ROOT effort: `.reasonable/` at the effort root, and a lane
 * worktree nested at `<root>/.worktrees/wo1/` carrying its own descriptor whose
 * `effortRoot` back-points at the root. The root has NO descriptor (so a canonical
 * `.reasonable/` write resolves to the no-lane identity path, exactly as in
 * production where a subagent's cwd is the effort root). Returns { root, wt }.
 */
function newTwoRoot({ role = 'implementer', contracts = ['graph-canvas'], contractBirth = false, locus = ['src/**'], testEditsAllowed = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'fence-2r-')); tmps.push(root);
  write(root, '.reasonable/config.json', JSON.stringify({ effort: 'demo' }) + '\n');
  const wtRel = join('.worktrees', 'wo1');
  write(root, join(wtRel, '.reasonable-lane.json'),
    JSON.stringify({ effortRoot: root, workOrder: 'WO-1', role, locus, contracts, contractBirth, testEditsAllowed }) + '\n');
  return { root, wt: join(root, wtRel) };
}

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.message}`); process.exitCode = 1; }
}

const IMPL = { workOrder: 'WO-1', role: 'implementer', locus: ['src/**'], contracts: ['parser'], testEditsAllowed: false };

// ── structured-edit fence: behavior preserved through the refactor ──────────────
check('Edit enforcement layer (ledger) → deny', () => {
  const root = newEffort({ lane: IMPL });
  assert.ok(runFence(root, edit(root, '.reasonable/ledger.jsonl')).denied);
});
check('Edit foreign contract → deny', () => {
  const root = newEffort({ lane: IMPL });
  assert.ok(runFence(root, edit(root, '.reasonable/contracts/other.md')).denied);
});
check('Edit own contract → allow', () => {
  const root = newEffort({ lane: IMPL });
  assert.equal(runFence(root, edit(root, '.reasonable/contracts/parser.md')).denied, false);
});
check('Edit out-of-locus src → deny', () => {
  const root = newEffort({ lane: IMPL });
  assert.ok(runFence(root, edit(root, 'lib/x.rs')).denied);
});
check('Edit in-locus src → allow', () => {
  const root = newEffort({ lane: IMPL });
  assert.equal(runFence(root, edit(root, 'src/main.rs')).denied, false);
});

// ── Bash backstop: the bypass is closed ────────────────────────────────────────
check('Bash append to ledger → deny (was the bypass)', () => {
  const root = newEffort({ lane: IMPL });
  const r = runFence(root, bash('echo forged >> .reasonable/ledger.jsonl'));
  assert.ok(r.denied, 'ledger forge via shell must be denied');
  assert.match(r.reason, /Enforcement layer/);
});
check('Bash overwrite foreign contract → deny', () => {
  const root = newEffort({ lane: IMPL });
  assert.ok(runFence(root, bash('cat /tmp/x > .reasonable/contracts/other.md')).denied);
});
check('Bash write to own contract → allow', () => {
  const root = newEffort({ lane: IMPL });
  assert.equal(runFence(root, bash('printf hi > .reasonable/contracts/parser.md')).denied, false);
});
check('Bash test command → allow', () => {
  const root = newEffort({ lane: IMPL });
  assert.equal(runFence(root, bash('cargo test --all')).denied, false);
});
check('Bash write to in-locus src → allow (locus not policed for Bash)', () => {
  const root = newEffort({ lane: IMPL });
  assert.equal(runFence(root, bash('echo x > src/main.rs')).denied, false);
});

// ── no-lane: Bash stays open (census/orchestrator); structured edit stays closed ─
check('no-lane Bash to ledger → allow (census/orchestrator path)', () => {
  const root = newEffort(); // effort, but NO lane descriptor
  assert.equal(runFence(root, bash('echo x >> .reasonable/ledger.jsonl')).denied, false);
});
// Identity model: the MAIN SESSION (no agent_type) is the trusted control plane and
// is not fenced; a SUBAGENT (agent_type set) is governed. This replaces the old blanket
// "no-lane structured edit inside an effort → deny": the discriminator is now WHO acts.
check('main-session Edit to .reasonable/ → allow (trusted control plane)', () => {
  const root = newEffort();
  assert.equal(runFence(root, edit(root, '.reasonable/ledger.jsonl')).denied, false);
});
check('subagent (non-owner) Edit to .reasonable/ → deny (identity-governed)', () => {
  const root = newEffort();
  const r = runFence(root, as(edit(root, '.reasonable/ledger.jsonl'), 'reasonable:auditor'));
  assert.ok(r.denied, 'an auditor may not write the ledger');
  assert.match(r.reason, /Identity-governed/);
});
check('subagent code edit outside any lane → deny (presumed hostile)', () => {
  const root = newEffort();
  assert.ok(runFence(root, as(edit(root, 'src/main.rs'), 'reasonable:implementer')).denied);
});

// ── Two-root layout (the lane-root fix) + identity governance of canonical writes ──
check('two-root: in-locus code write in the worktree → allow', () => {
  const { root, wt } = newTwoRoot();
  assert.equal(runFence(root, as(editAbs(join(wt, 'src/main.rs')), 'reasonable:implementer')).denied, false);
});
check('two-root: worktree-local .reasonable/ write → deny (§3b parallel-bootstrap guard)', () => {
  const { root, wt } = newTwoRoot();
  const r = runFence(root, as(editAbs(join(wt, '.reasonable/contracts/graph-canvas.md')), 'reasonable:implementer'));
  assert.ok(r.denied, 'a worktree-local .reasonable/ write must be denied');
  assert.match(r.reason, /effort root/);
});
check('two-root: canonical contract write by implementer → allow', () => {
  const { root } = newTwoRoot();
  assert.equal(
    runFence(root, as(edit(root, '.reasonable/contracts/graph-canvas.md'), 'reasonable:implementer')).denied,
    false,
  );
});
check('two-root: canonical contract write by a read-only role → deny', () => {
  const { root } = newTwoRoot();
  assert.ok(runFence(root, as(edit(root, '.reasonable/contracts/graph-canvas.md'), 'reasonable:auditor')).denied);
});
check('two-root: journal.json by journal-writer → allow; by implementer → deny', () => {
  const { root } = newTwoRoot();
  assert.equal(runFence(root, as(edit(root, '.reasonable/journal.json'), 'reasonable:journal-writer')).denied, false);
  assert.ok(runFence(root, as(edit(root, '.reasonable/journal.json'), 'reasonable:implementer')).denied);
});
check('two-root: ledger append by a contract-writer or the scribe → allow; by a read-only role → deny', () => {
  const { root } = newTwoRoot();
  assert.equal(runFence(root, as(edit(root, '.reasonable/ledger.jsonl'), 'reasonable:journal-writer')).denied, false);
  assert.equal(runFence(root, as(edit(root, '.reasonable/ledger.jsonl'), 'reasonable:characterizer')).denied, false);
  assert.ok(runFence(root, as(edit(root, '.reasonable/ledger.jsonl'), 'reasonable:auditor')).denied);
});
check('two-root: baseline.json by census → allow; config.json by any subagent → deny', () => {
  const { root } = newTwoRoot();
  assert.equal(runFence(root, as(edit(root, '.reasonable/baseline.json'), 'reasonable:census')).denied, false);
  assert.ok(runFence(root, as(edit(root, '.reasonable/config.json'), 'reasonable:census')).denied);
});
check('two-root: work-order spec by work-order-writer → allow; by the proposing route-planner or any other role → deny', () => {
  const { root } = newTwoRoot();
  const wo = '.reasonable/work-orders/WO-1.json';
  assert.equal(runFence(root, as(edit(root, wo), 'reasonable:work-order-writer')).denied, false);
  // The propose/persist membrane: the route-planner PROPOSES the plan but must not PERSIST it.
  assert.ok(runFence(root, as(edit(root, wo), 'reasonable:route-planner')).denied, 'the route-planner proposes; it may not write the spec');
  assert.ok(runFence(root, as(edit(root, wo), 'reasonable:implementer')).denied, 'the implementer may not forge its own work order');
  // And the Bash backstop closes the same forge surface for a non-owner.
  assert.ok(runFence(root, as(bash('echo forged > .reasonable/work-orders/WO-2.json'), 'reasonable:implementer')).denied);
});
check('two-root: census skeleton contract via Bash (no lane at cwd) → allow', () => {
  const { root } = newTwoRoot();
  assert.equal(runFence(root, as(bash('cat /tmp/x > .reasonable/contracts/graph-canvas.md'), 'reasonable:census')).denied, false);
});
check('two-root: read-only role Bash forge of ledger from effort root → deny (backstop closed)', () => {
  const { root } = newTwoRoot();
  const r = runFence(root, as(bash('echo forged >> .reasonable/ledger.jsonl'), 'reasonable:auditor'));
  assert.ok(r.denied, 'a read-only role may not Bash-forge the ledger');
  // ...but a stray subagent writing config via Bash is still denied (the real forge surface):
  assert.ok(runFence(root, as(bash('echo x >> .reasonable/config.json'), 'reasonable:implementer')).denied);
});
// The bug-report regression: provision a lane in a gitignored two-root repo; the
// characterizer must NOT be able to emit a worktree-local skeleton (forcing canonical),
// and a canonical born contract by the characterizer is allowed.
check('regression: characterizer cannot write a worktree-local skeleton (no parallel .reasonable/)', () => {
  const { root, wt } = newTwoRoot({ role: 'characterizer', contractBirth: true, testEditsAllowed: true });
  assert.ok(runFence(root, as(editAbs(join(wt, '.reasonable/contracts/graph-canvas.md')), 'reasonable:characterizer')).denied);
  assert.equal(runFence(root, as(edit(root, '.reasonable/contracts/graph-canvas.md'), 'reasonable:characterizer')).denied, false);
});
check('two-root: unknown/unprefixed subagent role → deny on .reasonable/ (governed, not trusted)', () => {
  const { root } = newTwoRoot();
  assert.ok(runFence(root, as(edit(root, '.reasonable/ledger.jsonl'), 'workflow-subagent')).denied);
  assert.ok(runFence(root, as(edit(root, '.reasonable/contracts/graph-canvas.md'), 'general-purpose')).denied);
});
check('two-root: canonical write with cwd=worktree → identity-governed, not denied (isUnder gate)', () => {
  const { root, wt } = newTwoRoot();
  // cwd is the worktree (the rare non-default case): findLane(cwd) resolves the lane, but the
  // canonical target is NOT under the worktree, so the fence must take the identity path, not the
  // code path (which would mis-judge it out-of-locus and deny). Regresses the cwd-fallback edge.
  assert.equal(runFence(wt, as(edit(root, '.reasonable/contracts/graph-canvas.md'), 'reasonable:implementer')).denied, false);
});

// ── spike quarantine also applies to Bash (escape-via-shell closed) ─────────────
// quarantineRoot must match the effort root, so build the lane after the root exists.
function spikeEffort() {
  const root = mkdtempSync(join(tmpdir(), 'fence-spk-')); tmps.push(root);
  write(root, '.reasonable/config.json', JSON.stringify({ effort: 'demo' }) + '\n');
  write(root, '.reasonable-lane.json',
    JSON.stringify({ effortRoot: root, role: 'spike-runner', quarantineOnly: true, quarantineRoot: join(root, 'q') }) + '\n');
  return root;
}
check('spike Bash outside quarantine → deny', () => {
  const root = spikeEffort();
  assert.ok(runFence(root, bash('echo x > outside.txt')).denied);
});
check('spike Bash inside quarantine → allow', () => {
  const root = spikeEffort();
  assert.equal(runFence(root, bash('echo x > q/inside.txt')).denied, false);
});

for (const t of tmps) { try { rmSync(t, { recursive: true, force: true }); } catch { /* best effort */ } }

if (process.exitCode) console.error(`\nfence: FAILURES above (${passed} passed).`);
else console.log(`\nfence: all ${passed} checks passed. ✓`);
