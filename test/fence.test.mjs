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
const bash = (command) => ({ tool_name: 'Bash', tool_input: { command } });

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
check('no-lane Edit inside effort → deny (D7b fail-closed, unchanged)', () => {
  const root = newEffort();
  assert.ok(runFence(root, edit(root, '.reasonable/ledger.jsonl')).denied);
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
