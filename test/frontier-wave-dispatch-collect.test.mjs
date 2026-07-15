// test/frontier-wave-dispatch-collect.test.mjs — RED half of A3b-i Task 3 (adversarial TDD triad).
//
// Pins the REAL per-atom Dispatch+Collect pipeline that frontier-wave.workflow.js's Dispatch phase
// must grow into (replacing the literal implementer/blind-test-writer/auditor-only loop it has today):
// per atom, in order, lane-provisioner (provision) -> implementer -> lane-provisioner (reprovision,
// only on green) -> blind-test-writer -> lane-committer (unconditional) -> adjudicator -> auditor
// (only once adjudicator is green), all concurrent across atoms via pipeline(), every agent() call
// guard()-wrapped so a budget throw becomes an R1 checkpoint rather than a wave-level budget-exhausted,
// and a bounded retry (cap 2 attempts total, ONE shared counter) that re-dispatches from the
// implementer and escalates to blocked-human on exhaustion.
//
// Harness mirrors test/frontier-wave-workflow.test.mjs EXACTLY: a stub agent() keyed on opts.label, a
// stub pipeline()/parallel(), a mockBudget, the same new Function(...) sandboxing trick.
//
// This file becomes READ-ONLY once committed — a separate GREEN agent implements against it as a
// locked contract, blind to this file's own reasoning.

import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const scriptPath = join(here, '..', 'workflows', 'frontier-wave.workflow.js');

const GLOBALS = ['args', 'budget', 'phase', 'log', 'agent', 'parallel', 'pipeline', 'workflow'];

function loadRunner() {
  const rawSource = readFileSync(scriptPath, 'utf8');
  const src = rawSource
    .replace(/^export\s+const\s+meta\b/m, 'const meta')
    .replace(/^export\s+default\s+/m, '');
  // eslint-disable-next-line no-new-func
  return new Function(...GLOBALS, `return (async () => { ${src}\n });`);
}

const mockBudget = { spent: () => 0, remaining: () => Infinity, total: null };
const noop = () => {};
async function pipeline(items, ...stages) {
  return Promise.all(items.map(async (item, i) => {
    let acc = item;
    for (const stage of stages) { try { acc = await stage(acc, item, i); } catch { acc = null; } }
    return acc;
  }));
}
async function parallel(thunks) {
  return Promise.all(thunks.map(async (t) => { try { return await t(); } catch { return null; } }));
}

// The REAL invocation shape (matches test/frontier-wave-workflow.test.mjs's runWith exactly).
function runWith(agent, budget = mockBudget) {
  const args = { effortRoot: '/tmp/effort', runMode: 'autonomous' };
  const run = loadRunner()(args, budget, noop, noop, agent, parallel, pipeline, noop);
  return run();
}

let passed = 0;
async function check(name, fn) {
  try { await fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.stack || e.message}`); process.exitCode = 1; }
}

const ATOM = 'a-1';

function baseBriefing(over = {}) {
  return {
    halt: false, effortRoot: '/tmp/effort', currentVerticalSlice: null, runMode: 'autonomous',
    brownfield: false, effortBranch: 'effort/x', baseBranch: 'master',
    band: 'lite', mergedSinceGate: 0, eventsSinceGate: 0, inboxLoad: 0, inboxTripwire: 5,
    amendmentBatch: [], landedConeCount: 0, frontier: [ATOM], ...over,
  };
}

function atomIdFromLabel(label) {
  const idx = (label || '').indexOf(':');
  return idx === -1 ? undefined : label.slice(idx + 1);
}

// A single-atom, cohesive, checkpoint-2-clean footprint — the default so a wave forms even when a
// test only cares about some other step. A green default for every one of the seven NEW per-atom
// labels this task introduces, pattern-matched by PREFIX since labels now carry the atomId
// (`provision:<atomId>`, not a bare `provision`).
function defaultStub(label) {
  if (label === 'spec-author') return { ok: true, atomId: ATOM };
  if (label === 'footprinter') {
    return {
      footprints: [
        { id: ATOM, locus: [], contracts: [], resources: [], cohesion: { kind: 'ok' }, checkpoint2: { kind: 'ok' } },
      ],
    };
  }
  if (label.startsWith('provision:') || label.startsWith('reprovision:')) {
    const id = atomIdFromLabel(label);
    return { provisioned: true, worktree: `/tmp/lane/${id}`, branch: `lane/${id}`, descriptorWritten: true, depsReady: true, journalRecorded: true };
  }
  if (label.startsWith('implement:')) return { kind: 'green', atomId: atomIdFromLabel(label) };
  if (label.startsWith('blindtest:')) return { done: true };
  if (label.startsWith('committests:')) return { persisted: true, committed: ['test/x.test.mjs'] };
  if (label.startsWith('adjudicate:')) return { kind: 'green', atomId: atomIdFromLabel(label) };
  if (label.startsWith('audit:')) return { kind: 'green', atomId: atomIdFromLabel(label) };
  return {};
}

// The per-atom dispatch-stage sequence, in order, for one atomId — strips every other label
// (reconcile/spec-author/footprinter/other atoms) out of a full labels log.
function dispatchOrder(labels, atomId) {
  return labels.filter((l) => atomIdFromLabel(l) === atomId).map((l) => l.split(':')[0]);
}

const VALID_GATE_KINDS = ['goal-green', 'heartbeat', 'blocked-human', 'halt', 'starved', 'batch-full', 'budget-exhausted'];
function assertValidGate(result, msg) {
  assert.ok(result && typeof result.kind === 'string', `${msg || 'GATE_RESULT'} must be an object with a string kind, got ${JSON.stringify(result)}`);
  assert.ok(VALID_GATE_KINDS.includes(result.kind), `${msg || 'GATE_RESULT'} kind "${result.kind}" is not one of the 7 valid variants`);
}

function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// ── 1. the fully-green order ──────────────────────────────────────────────────

await check('a fully-green single-atom pipeline dispatches all seven labels in the exact order provision -> implement -> reprovision -> blindtest -> committests -> adjudicate -> audit', async () => {
  const labels = [];
  const agent = async (prompt, opts) => {
    const label = opts.label || '';
    labels.push(label);
    if (label === 'reconcile') return baseBriefing({ mergedSinceGate: 5 });
    return defaultStub(label);
  };
  const result = await runWith(agent);
  assertValidGate(result);
  assert.deepStrictEqual(
    dispatchOrder(labels, ATOM),
    ['provision', 'implement', 'reprovision', 'blindtest', 'committests', 'adjudicate', 'audit'],
  );
});

// ── 2. ripple stops the chain before blind-test-writer ────────────────────────

await check('a ripple OUTCOME from the implementer stops the chain before blind-test-writer is ever dispatched, and never triggers reprovision', async () => {
  const labels = [];
  const agent = async (prompt, opts) => {
    const label = opts.label || '';
    labels.push(label);
    if (label === 'reconcile') return baseBriefing({ mergedSinceGate: 5 });
    if (label.startsWith('implement:')) return { kind: 'ripple', atomId: ATOM, manifest: {} };
    return defaultStub(label);
  };
  const result = await runWith(agent);
  assertValidGate(result);
  assert.deepStrictEqual(dispatchOrder(labels, ATOM), ['provision', 'implement']);
  assert.ok(!labels.includes(`reprovision:${ATOM}`), 'reprovision only fires on a green implementer, never on ripple');
});

// ── 3. checkpoint from ANY stage stops the chain there, is not a retry trigger ─

const CHECKPOINT_CASES = [
  { stage: 'implement', forbiddenAfter: ['reprovision', 'blindtest', 'committests', 'adjudicate', 'audit'] },
  { stage: 'adjudicate', forbiddenAfter: ['audit'] },
];

for (const { stage, forbiddenAfter } of CHECKPOINT_CASES) {
  await check(`a checkpoint OUTCOME from ${stage} stops that atom's chain there — every later label is absent, and it is not a retry trigger`, async () => {
    const labels = [];
    const agent = async (prompt, opts) => {
      const label = opts.label || '';
      labels.push(label);
      if (label === 'reconcile') return baseBriefing({ mergedSinceGate: 5 });
      if (label.startsWith(`${stage}:`)) return { kind: 'checkpoint', atomId: ATOM };
      return defaultStub(label);
    };
    const result = await runWith(agent);
    assertValidGate(result);
    for (const forbidden of forbiddenAfter) {
      assert.ok(!labels.some((l) => l.startsWith(`${forbidden}:`)), `${forbidden} must not be dispatched once ${stage} returns checkpoint`);
    }
    assert.strictEqual(labels.filter((l) => l === `implement:${ATOM}`).length, 1, 'a checkpoint outcome is a progress verdict, not a bounded-retry-triggering failure — no re-dispatch of implement');
    assert.notStrictEqual(result.kind, 'budget-exhausted', 'a non-throwing checkpoint OUTCOME must not surface as the wave-level budget-exhausted GATE_RESULT either');
  });
}

// ── 4. two atoms in one wave dispatch concurrently (no barrier) ───────────────

await check('two atoms in one wave dispatch their per-atom chains concurrently — a sequential for-loop would deadlock this test', async () => {
  const labels = [];
  let provisionBCalled = false;
  let releaseA;
  const aGate = new Promise((res) => { releaseA = res; });

  const agent = async (prompt, opts) => {
    const label = opts.label || '';
    labels.push(label);
    if (label === 'reconcile') return baseBriefing({ frontier: ['a-1', 'a-2'], mergedSinceGate: 5 });
    if (label === 'spec-author') return { ok: true, atomId: opts.atomId };
    if (label === 'footprinter') {
      return {
        footprints: [
          { id: 'a-1', locus: ['locus/a-1'], contracts: [], resources: [], cohesion: { kind: 'ok' }, checkpoint2: { kind: 'ok' } },
          { id: 'a-2', locus: ['locus/a-2'], contracts: [], resources: [], cohesion: { kind: 'ok' }, checkpoint2: { kind: 'ok' } },
        ],
      };
    }
    if (label === 'provision:a-2') {
      provisionBCalled = true;
      releaseA();
      return defaultStub(label);
    }
    if (label === 'implement:a-1') {
      // Atom A's implementer stage must not resolve before atom B's chain has visibly started —
      // proves the two chains run concurrently under pipeline(), never one after another behind a
      // barrier (a barriered for-loop would leave provision:a-2 uncalled and this would time out).
      await withTimeout(aGate, 1500, "timed out waiting for atom B's provision — dispatch is not concurrent (a barriered for-loop would deadlock here)");
      assert.ok(provisionBCalled, "atom B's provision must have already fired by the time atom A reaches implement");
      return defaultStub(label);
    }
    return defaultStub(label);
  };

  const result = await runWith(agent);
  assertValidGate(result);
  assert.ok(provisionBCalled, "atom B's provision must have fired during this run");
  assert.deepStrictEqual(
    dispatchOrder(labels, 'a-1'),
    ['provision', 'implement', 'reprovision', 'blindtest', 'committests', 'adjudicate', 'audit'],
    'atom A still completes its full chain once released',
  );
  assert.deepStrictEqual(
    dispatchOrder(labels, 'a-2'),
    ['provision', 'implement', 'reprovision', 'blindtest', 'committests', 'adjudicate', 'audit'],
    'atom B completes its own full chain independently of atom A',
  );
});

// ── 5. lane-committer persisted:false routes to the bounded retry, not a crash ─

await check('a lane-committer persisted:false ack routes to the bounded retry (fresh implementer pass), not a crash', async () => {
  const labels = [];
  let committestsCalls = 0;
  const agent = async (prompt, opts) => {
    const label = opts.label || '';
    labels.push(label);
    if (label === 'reconcile') return baseBriefing({ mergedSinceGate: 5 });
    if (label.startsWith('committests:')) {
      committestsCalls += 1;
      return committestsCalls === 1 ? { persisted: false, reason: 'commit-gate reported uncommitted work product' } : { persisted: true };
    }
    return defaultStub(label);
  };
  const result = await runWith(agent);
  assertValidGate(result);
  assert.strictEqual(labels.filter((l) => l === `implement:${ATOM}`).length, 2, 'a persisted:false ack triggers the same bounded retry (fresh implementer pass) as a verification-gap failure');
  assert.notStrictEqual(result.kind, 'blocked-human', 'a retry that succeeds on attempt 2 must not escalate');
});

// ── 6. bounded retry from the adjudicator: exactly one re-dispatch, then either recovery or blocked-human ─

await check('an adjudicator failure on attempt 1 triggers exactly ONE re-dispatch of implement:<atomId>, and a green attempt 2 recovers without escalating', async () => {
  const labels = [];
  let adjudicateCalls = 0;
  const agent = async (prompt, opts) => {
    const label = opts.label || '';
    labels.push(label);
    if (label === 'reconcile') return baseBriefing({ mergedSinceGate: 5 });
    if (label.startsWith('adjudicate:')) {
      adjudicateCalls += 1;
      return adjudicateCalls === 1 ? { kind: 'other', atomId: ATOM } : { kind: 'green', atomId: ATOM };
    }
    return defaultStub(label);
  };
  const result = await runWith(agent);
  assertValidGate(result);
  assert.strictEqual(labels.filter((l) => l === `implement:${ATOM}`).length, 2, 'exactly one retry (2 total implementer dispatches) after a single adjudicator failure');
  assert.strictEqual(labels.filter((l) => l.startsWith('provision:')).length, 1, 'the retry reuses the already-provisioned lane — it re-dispatches from the implementer, never a second initial provision');
  assert.strictEqual(labels.filter((l) => l === `audit:${ATOM}`).length, 1, 'a recovered attempt 2 reaches the auditor exactly once');
  assert.notStrictEqual(result.kind, 'blocked-human', 'a recovered retry must not escalate to blocked-human');
});

await check('an adjudicator failure on BOTH attempts (cap of 2) escalates to blocked-human, and never issues a 3rd implementer dispatch', async () => {
  const labels = [];
  const agent = async (prompt, opts) => {
    const label = opts.label || '';
    labels.push(label);
    if (label === 'reconcile') return baseBriefing({ mergedSinceGate: 5 });
    if (label.startsWith('adjudicate:')) return { kind: 'other', atomId: ATOM };
    return defaultStub(label);
  };
  const result = await runWith(agent);
  assertValidGate(result);
  assert.strictEqual(result.kind, 'blocked-human', 'exhausting the 2-attempt cap must route the atom to blocked-human');
  assert.strictEqual(labels.filter((l) => l === `implement:${ATOM}`).length, 2, 'the retry cap is 2 attempts total — never a 3rd implementer dispatch');
  // The spec leaves the blockedHuman detail's exact field layout open (only the general shape
  // {class:'atom-dispatch-exhausted', atomId, detail} is suggested, not pinned). We assert only that
  // SOME signal identifying the stuck atom is discoverable in the result, not a specific field path.
  assert.ok(JSON.stringify(result).includes(ATOM), 'the blocked-human GATE_RESULT should surface which atom is stuck, in whatever detail shape the implementer chooses');
});

await check('the adjudicator and auditor share ONE retry counter (2 total attempts), not two separate caps', async () => {
  const labels = [];
  let adjudicateCalls = 0;
  let auditCalls = 0;
  const agent = async (prompt, opts) => {
    const label = opts.label || '';
    labels.push(label);
    if (label === 'reconcile') return baseBriefing({ mergedSinceGate: 5 });
    if (label.startsWith('adjudicate:')) {
      adjudicateCalls += 1;
      return adjudicateCalls === 1 ? { kind: 'other', atomId: ATOM } : { kind: 'green', atomId: ATOM };
    }
    if (label.startsWith('audit:')) {
      auditCalls += 1;
      return { kind: 'other', atomId: ATOM }; // always fails when reached
    }
    return defaultStub(label);
  };
  const result = await runWith(agent);
  assertValidGate(result);
  assert.strictEqual(result.kind, 'blocked-human', 'attempt 1 fails at the adjudicator, attempt 2 fails at the auditor — the shared cap of 2 is exhausted either way');
  assert.strictEqual(labels.filter((l) => l === `implement:${ATOM}`).length, 2, 'a SHARED counter allows only 2 total implementer dispatches even though the two failures happened at two different stages');
  assert.strictEqual(auditCalls, 1, 'the auditor is only reached once (on attempt 2, after the adjudicator recovered) — a 3rd attempt never happens');
});

// ── 7. the initial lane-provisioner hard-stop: no fenced worker dispatched lane-less ─

const HARD_STOP_ACKS = [
  { name: 'no worktree at all', ack: { provisioned: false, worktree: null, descriptorWritten: false } },
  { name: 'worktree present but descriptor not written', ack: { provisioned: false, worktree: '/tmp/lane/x', descriptorWritten: false } },
];
for (const { name, ack } of HARD_STOP_ACKS) {
  await check(`a non-provisioned lane ack (${name}) hard-stops the atom before any fenced worker is dispatched`, async () => {
    const labels = [];
    const agent = async (prompt, opts) => {
      const label = opts.label || '';
      labels.push(label);
      if (label === 'reconcile') return baseBriefing({ mergedSinceGate: 5 });
      if (label.startsWith('provision:')) return ack;
      return defaultStub(label);
    };
    const result = await runWith(agent);
    assertValidGate(result);
    assert.ok(!labels.some((l) => l.startsWith('implement:')), 'no fenced worker may be dispatched into a lane-less atom');
  });
}

// ── 8. budget-ceiling throws become an R1 checkpoint, never the wave-level budget-exhausted kind ─

await check('a guard-caught budget throw from the implementer becomes an R1 checkpoint, not a wave-level budget-exhausted GATE_RESULT', async () => {
  const labels = [];
  const agent = async (prompt, opts) => {
    const label = opts.label || '';
    labels.push(label);
    if (label === 'reconcile') return baseBriefing({ mergedSinceGate: 5 });
    if (label.startsWith('implement:')) throw new Error('budget ceiling');
    return defaultStub(label);
  };
  const result = await runWith(agent);
  assertValidGate(result);
  assert.notStrictEqual(result.kind, 'budget-exhausted', 'a per-atom dispatch throw must NOT surface as the wave-level budget-exhausted GATE_RESULT — that kind stays reserved for the Spec/Pack guard');
  assert.ok(
    !labels.some((l) => l.startsWith('reprovision:') || l.startsWith('blindtest:') || l.startsWith('committests:') || l.startsWith('adjudicate:') || l.startsWith('audit:')),
    'no later stage runs for an atom whose implementer dispatch hit the budget ceiling',
  );
});

await check('a guard-caught budget throw from the initial lane-provisioner call becomes an R1 checkpoint, not a wave-level budget-exhausted GATE_RESULT', async () => {
  const labels = [];
  const agent = async (prompt, opts) => {
    const label = opts.label || '';
    labels.push(label);
    if (label === 'reconcile') return baseBriefing({ mergedSinceGate: 5 });
    if (label.startsWith('provision:')) throw new Error('budget ceiling');
    return defaultStub(label);
  };
  const result = await runWith(agent);
  assertValidGate(result);
  assert.notStrictEqual(result.kind, 'budget-exhausted');
  assert.ok(!labels.some((l) => l.startsWith('implement:')), 'no fenced worker dispatched off a budget-exhausted provision');
});

await check('when every atom in the wave hits budget exhaustion, Gate still computes a valid 7-variant result from real ledger state — never budget-exhausted, never a crash', async () => {
  const agent = async (prompt, opts) => {
    const label = opts.label || '';
    if (label === 'reconcile') return baseBriefing({ frontier: ['a-1', 'a-2'], mergedSinceGate: 5 });
    if (label === 'spec-author') return { ok: true, atomId: opts.atomId };
    if (label === 'footprinter') {
      return {
        footprints: [
          { id: 'a-1', locus: ['locus/a-1'], contracts: [], resources: [], cohesion: { kind: 'ok' }, checkpoint2: { kind: 'ok' } },
          { id: 'a-2', locus: ['locus/a-2'], contracts: [], resources: [], cohesion: { kind: 'ok' }, checkpoint2: { kind: 'ok' } },
        ],
      };
    }
    if (label.startsWith('implement:')) throw new Error('budget ceiling');
    return defaultStub(label);
  };
  const result = await runWith(agent);
  assertValidGate(result);
  assert.notStrictEqual(result.kind, 'budget-exhausted');
});

if (process.exitCode) console.error(`\nfrontier-wave-dispatch-collect: FAILURES above (${passed} passed).`);
else console.log(`\nfrontier-wave-dispatch-collect: all ${passed} checks passed. ✓`);
