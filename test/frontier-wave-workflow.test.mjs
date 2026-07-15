// test/frontier-wave-workflow.test.mjs — the frontier-wave workflow's behavioral contract: the
// exhaustive 7-variant GATE_RESULT (DESIGN-3.0 §6, §9), role-minimal dispatch (§6 draft-five), and
// purity (CLAUDE.md invariant 5). Mirrors test/vertical-slice-runner-green-no-mergesha.test.mjs's
// harness exactly — a stub agent() keyed on opts.label, stub pipeline/parallel, a mockBudget.

import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const scriptPath = join(here, '..', 'workflows', 'frontier-wave.workflow.js');

const GLOBALS = ['args', 'budget', 'phase', 'log', 'agent', 'parallel', 'pipeline', 'workflow'];

let rawSource = null;
function loadRunner() {
  rawSource = readFileSync(scriptPath, 'utf8');
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

// The REAL invocation shape (verified against test/vertical-slice-runner-green-no-mergesha.test.mjs,
// the shipped precedent): loadRunner() returns the outer (args, budget, phase, log, agent, parallel,
// pipeline, workflow) => asyncFn — call it POSITIONALLY (never via eval/name-matching), matching
// GLOBALS' order exactly, then await the returned zero-arg async function.
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

// A single-atom, cohesive, checkpoint-2-clean footprint — the default so a wave forms even when a
// test only cares about some other step (gate routing, budget, roles). Tests that need a specific
// pack shape (multi-atom, R4 drop, checkpoint-2 drop) override 'spec-author'/'footprinter' directly.
function defaultStub(label) {
  if (label === 'spec-author') return { ok: true, atomId: ATOM };
  if (label === 'footprinter') {
    return {
      footprints: [
        { id: ATOM, locus: [], contracts: [], resources: [], cohesion: { kind: 'ok' }, checkpoint2: { kind: 'ok' } },
      ],
    };
  }
  return {};
}

// ── the 7-variant GATE_RESULT union ───────────────────────────────────────────

await check('a heartbeat-floor wave returns {kind:"heartbeat"} — not the retired 4-variant "green"', async () => {
  const labels = [];
  const agent = async (prompt, opts) => {
    labels.push(opts.label || '');
    if (opts.label === 'reconcile') return baseBriefing({ mergedSinceGate: 5 }); // trips a lite-band floor of n=5
    if (opts.label === 'implementer') return { done: true };
    if (opts.label === 'blind-test-writer') return { done: true };
    if (opts.label === 'auditor') return { kind: 'green', atomId: ATOM };
    return defaultStub(opts.label);
  };
  const result = await runWith(agent);
  assert.strictEqual(result.kind, 'heartbeat');
  assert.notStrictEqual(result.kind, 'green', 'the retired 4-variant kind must never be returned');
});

await check('a goal-completing merge returns {kind:"goal-green"}', async () => {
  const agent = async (prompt, opts) => {
    if (opts.label === 'reconcile') return baseBriefing({ goalGreen: { goalId: 'g-1' } });
    if (opts.label === 'auditor') return { kind: 'green', atomId: ATOM };
    return defaultStub(opts.label);
  };
  const result = await runWith(agent);
  assert.strictEqual(result.kind, 'goal-green');
});

for (const runMode of ['gated', 'autonomous']) {
  await check(`an intent-fork verdict returns {kind:"blocked-human"} in ${runMode} mode (always human, both modes)`, async () => {
    const agent = async (prompt, opts) => {
      if (opts.label === 'reconcile') return baseBriefing({ runMode, blockedHuman: { class: 'intent-fork', ref: 'i#1' } });
      return defaultStub(opts.label);
    };
    const result = await runWith(agent);
    assert.strictEqual(result.kind, 'blocked-human');
  });
}

await check('a budget-guard throw returns {kind:"budget-exhausted"}, never halt', async () => {
  const agent = async (prompt, opts) => {
    if (opts.label === 'reconcile') return baseBriefing();
    if (opts.label === 'implementer') throw new Error('budget ceiling');
    return defaultStub(opts.label);
  };
  const budget = { spent: () => Infinity, remaining: () => 0, total: 1 };
  const result = await runWith(agent, budget);
  assert.strictEqual(result.kind, 'budget-exhausted');
});

await check('a halting reconcile briefing returns {kind:"halt"} immediately, no wave dispatched', async () => {
  const labels = [];
  const agent = async (prompt, opts) => {
    labels.push(opts.label || '');
    if (opts.label === 'reconcile') return baseBriefing({ halt: true, haltReason: 'ambiguous config' });
    return defaultStub(opts.label);
  };
  const result = await runWith(agent);
  assert.strictEqual(result.kind, 'halt');
  assert.ok(!labels.includes('implementer'), 'no atom dispatch happens after a halting reconcile');
});

// ── role-minimal dispatch ─────────────────────────────────────────────────────

await check('a single-atom greenfield wave never dispatches census/characterizer/topologist/retro-synthesizer', async () => {
  const labels = [];
  const agent = async (prompt, opts) => {
    labels.push(opts.label || '');
    if (opts.label === 'reconcile') return baseBriefing({ mergedSinceGate: 5 });
    if (opts.label === 'auditor') return { kind: 'green', atomId: ATOM };
    return defaultStub(opts.label);
  };
  await runWith(agent);
  for (const forbidden of ['census', 'characterizer', 'topologist', 'retro-synthesizer']) {
    assert.ok(!labels.includes(forbidden), `${forbidden} must not be dispatched for a single-atom greenfield wave`);
  }
});

// ── Spec/Pack: real spec-author + footprinter fences (A2 de-schematization) ──

await check('a multi-atom disjoint pack dispatches every packed atom (two-atom wave)', async () => {
  const labels = [];
  const agent = async (prompt, opts) => {
    labels.push(opts.label || '');
    if (opts.label === 'reconcile') return baseBriefing({ frontier: ['a-1', 'a-2'], mergedSinceGate: 5 });
    if (opts.label === 'spec-author') return { ok: true, atomId: opts.atomId };
    if (opts.label === 'footprinter') {
      return {
        footprints: [
          { id: 'a-1', locus: ['locus/a-1'], contracts: [], resources: [], cohesion: { kind: 'ok' }, checkpoint2: { kind: 'ok' } },
          { id: 'a-2', locus: ['locus/a-2'], contracts: [], resources: [], cohesion: { kind: 'ok' }, checkpoint2: { kind: 'ok' } },
        ],
      };
    }
    if (opts.label === 'auditor') return { kind: 'green', atomId: opts.atomId };
    return defaultStub(opts.label);
  };
  const result = await runWith(agent);
  const implementerCalls = labels.filter((l) => l === 'implementer').length;
  assert.strictEqual(implementerCalls, 2, 'both disjoint-footprint atoms must be packed and dispatched into this wave');
  assert.strictEqual(result.kind, 'heartbeat', 'run still returns a valid 7-variant gate result');
});

await check('an oversized-cohesion atom is held out of the wave (R4 drop), run still gates', async () => {
  const labels = [];
  const agent = async (prompt, opts) => {
    labels.push(opts.label || '');
    if (opts.label === 'reconcile') return baseBriefing({ mergedSinceGate: 5 });
    if (opts.label === 'spec-author') return { ok: true, atomId: opts.atomId };
    if (opts.label === 'footprinter') {
      return {
        footprints: [
          { id: ATOM, locus: [], contracts: [], resources: [], cohesion: { kind: 'oversized' }, checkpoint2: { kind: 'ok' } },
        ],
      };
    }
    return defaultStub(opts.label);
  };
  const result = await runWith(agent);
  assert.ok(!labels.includes('implementer'), 'an oversized (R4) atom must not be dispatched into the wave');
  assert.strictEqual(result.kind, 'heartbeat', 'run still returns a valid 7-variant gate result on an empty wave');
});

await check('a guard-halted checkpoint-2 atom is held out of the wave, run still gates', async () => {
  const labels = [];
  const agent = async (prompt, opts) => {
    labels.push(opts.label || '');
    if (opts.label === 'reconcile') return baseBriefing({ mergedSinceGate: 5 });
    if (opts.label === 'spec-author') return { ok: true, atomId: opts.atomId };
    if (opts.label === 'footprinter') {
      return {
        footprints: [
          { id: ATOM, locus: [], contracts: [], resources: [], cohesion: { kind: 'ok' }, checkpoint2: { kind: 'guard-halted' } },
        ],
      };
    }
    return defaultStub(opts.label);
  };
  const result = await runWith(agent);
  assert.ok(!labels.includes('implementer'), 'a checkpoint-2 guard-halted atom must not be dispatched into the wave');
  assert.strictEqual(result.kind, 'heartbeat', 'run still returns a valid 7-variant gate result on an empty wave');
});

// ── purity (redundant, local check alongside test/workflow-load.test.mjs) ────

await check('the workflow source contains no import/require/fs/Date/Math.random', () => {
  loadRunner(); // populates rawSource as a side effect
  assert.doesNotMatch(rawSource, /^\s*import\s/m);
  assert.doesNotMatch(rawSource, /\brequire\s*\(/);
  assert.doesNotMatch(rawSource, /\bfs\.\w+\(/);
  assert.doesNotMatch(rawSource, /\bDate\.now\(\)/);
  assert.doesNotMatch(rawSource, /\bnew Date\(/);
  assert.doesNotMatch(rawSource, /\bMath\.random\(\)/);
});

if (process.exitCode) console.error(`\nfrontier-wave-workflow: FAILURES above (${passed} passed).`);
else console.log(`\nfrontier-wave-workflow: all ${passed} checks passed. ✓`);
