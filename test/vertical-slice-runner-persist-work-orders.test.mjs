// vertical-slice-runner-persist-work-orders.test.mjs — the route-planner's computed work
// orders must be PERSISTED to .reasonable/work-orders/<id>.json before the lane-provisioner
// runs, or the provisioner (which reads that immutable file as its locus license) refuses.
//
// THE BUG (sofia-plays, 2026-07-02). The route-planner returns a plan, but that plan lived ONLY
// in memory — nothing authored the immutable work-order spec files. On a slice whose WO files did
// not already exist on disk, the lane-provisioner correctly refused ("the immutable work-order
// file that must license locus/contracts was never authored"), which surfaced as {kind:'blocked',
// outcome:{kind:'trap', items:[{class:'BREAKING', kind:'other', ...}]}} on the very first NEW
// slice. Slices 1-2 hid the gap only because an earlier flow version had left their WO files on
// disk (the files are gitignored runtime state).
//
// The fix: a dedicated narrow work-order-writer, dispatched serially right after the route-planner
// returns and BEFORE the wave loop provisions any lane, persists each work order's spec.
//
// THIN-PLANNER UPDATE (docs/roadmap/thin-planner.md). The planner now returns a DECOMPOSITION
// (declared locus + contract SEEDS, NO computed footprint); a dedicated FOOTPRINT step runs
// lib/footprint.mjs over the persisted specs to fold the closure. So the Plan-phase ordering
// contract this file pins is now three-step: persist specs -> footprint them -> provision.
// Run: node test/vertical-slice-runner-persist-work-orders.test.mjs

import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const scriptPath = join(here, '..', 'workflows', 'vertical-slice-runner.workflow.js');

// Mirrors vertical-slice-runner-reconcile-halt.test.mjs: wrap the workflow body in an async
// function scoped over the engine globals, then INVOKE it with mocks.
const GLOBALS = ['args', 'budget', 'phase', 'log', 'agent', 'parallel', 'pipeline', 'workflow'];
function loadRunner() {
  const src = readFileSync(scriptPath, 'utf8')
    .replace(/^export\s+const\s+meta\b/m, 'const meta')
    .replace(/^export\s+default\s+/m, '');
  // eslint-disable-next-line no-new-func
  return new Function(...GLOBALS, `return (async () => { ${src}\n });`);
}

const noop = () => {};
const mockBudget = { spent: () => 0, remaining: () => Infinity, total: null };

// Faithful stand-ins for the engine's pipeline()/parallel() (see the Workflow tool contract):
//   pipeline(items, ...stages): each item flows through ALL stages independently; stage 0 gets
//   (item, item, i), later stages get (prevResult, item, i). parallel(thunks): run all, collect.
async function pipeline(items, ...stages) {
  return Promise.all(items.map(async (item, i) => {
    let acc = item;
    for (let s = 0; s < stages.length; s++) acc = await stages[s](acc, item, i);
    return acc;
  }));
}
async function parallel(thunks) { return Promise.all(thunks.map((t) => t())); }

const WO_ID = 'WO-S3-layout-module';
const LOCUS = 'src/layout/**';
const CONTRACT = 'layout';

function briefing() {
  return {
    halt: false, effortRoot: '/eff', currentVerticalSlice: 'slice-1', runMode: 'autonomous',
    brownfield: false, terminalWorkOrders: [], trusted: [], staleTrusted: [], floor: [],
    floorUnexplained: 0, inbox: [], effortBranch: 'effort/demo',
  };
}
// The THIN planner returns a DECOMPOSITION: declared locus + contract SEEDS + resources per
// work order — NO computed footprint (the dedicated footprint step folds the closure downstream).
function decomposition() {
  return {
    workOrders: [{
      id: WO_ID, role: 'implementer', verticalSlice: 'slice-1',
      locus: [LOCUS], contractSeeds: [CONTRACT], resources: [],
    }],
    rationale: 'single work order for the new slice',
  };
}

// A by-label agent mock that drives ONE work order all the way to a green gate. `persistOk`
// controls whether the (new) work-order-writer reports a durable persist. Records every call
// in order so we can assert the WO files are persisted BEFORE the first provision.
function makeAgent(calls, { persistOk = true } = {}) {
  return async (prompt, opts) => {
    const label = (opts && opts.label) || '';
    calls.push({ label, agentType: opts && opts.agentType, prompt });
    if (label === 'reconcile') return briefing();
    if (label === 'route-plan') return decomposition();
    if (opts && opts.agentType === 'reasonable:work-order-writer') {
      return { persisted: persistOk, written: persistOk ? [WO_ID] : [], note: null };
    }
    // The dedicated FOOTPRINT step: runs lib/footprint.mjs over the persisted specs and returns
    // the closure + independence. Echoes the seed as the (trivial) closure for this one-WO slice.
    if (opts && opts.agentType === 'reasonable:footprinter') {
      return { footprints: [{ id: WO_ID, locus: [LOCUS], contracts: [CONTRACT], resources: [] }], independence: [] };
    }
    if (label.startsWith('scribe:')) return { persisted: true, transition: label, note: null };
    // BUG 3: the narrow lane-committer that lands the blind-test-writer's tests onto the lane.
    if (label.startsWith('commit-blind-tests:')) return { persisted: true, transition: label, note: null };
    if (label.startsWith('provision:') || label.startsWith('reprovision-blind-test:')) {
      return { provisioned: true, worktree: '/eff/.worktrees/' + WO_ID, branch: 'lane/' + WO_ID,
        descriptorWritten: true, depsReady: true, noOp: false, kind: null, note: null };
    }
    if (label.startsWith('implement:')) {
      // green with NO contract enrichment -> intentVerify short-circuits (no adversary needed).
      return { kind: 'green', workOrder: WO_ID, verticalSlice: 'slice-1', detail: { commit: 'abc123' } };
    }
    if (label.startsWith('blind-test:') || label.startsWith('adjudicate:')) {
      return { kind: 'green', workOrder: WO_ID, verticalSlice: 'slice-1', detail: { suiteRan: true } };
    }
    if (label.startsWith('audit:')) {
      // The `suite` leaf carries the positive executed-suite evidence the gate keys on.
      const isSuite = label.startsWith('audit:suite:');
      return { kind: 'green', workOrder: WO_ID, verticalSlice: 'slice-1',
        detail: isSuite ? { suiteRan: true, trustedGreen: true, floorGreen: true } : {} };
    }
    throw new Error(`unexpected agent() call: ${label} (agentType ${opts && opts.agentType})`);
  };
}

let passed = 0;
async function check(name, fn) {
  try { await fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.stack || e.message}`); process.exitCode = 1; }
}

const baseArgs = () => ({ effortRoot: '/eff', verticalSliceId: 'slice-1', runMode: 'autonomous', tier: 'lite' });

await check('a work-order-writer persists the WO specs BEFORE any lane is provisioned', async () => {
  const calls = [];
  const run = loadRunner()(baseArgs(), mockBudget, noop, noop, makeAgent(calls), parallel, pipeline, noop);
  const result = await run();

  const persistIdx = calls.findIndex((c) => c.agentType === 'reasonable:work-order-writer');
  const footprintIdx = calls.findIndex((c) => c.agentType === 'reasonable:footprinter');
  const provisionIdx = calls.findIndex((c) => (c.label || '').startsWith('provision:'));
  assert.notEqual(persistIdx, -1, 'the runner must dispatch a work-order-writer to persist the WO specs');
  assert.notEqual(footprintIdx, -1, 'the runner must dispatch a footprint step to compute the closure over the persisted specs');
  assert.notEqual(provisionIdx, -1, 'a lane must be provisioned on a healthy slice');
  // The ordering contract of the thin-planner flow: persist the specs, THEN footprint them (the
  // closure needs the specs on disk), THEN provision (grouping needs the footprints).
  assert.ok(persistIdx < footprintIdx,
    `specs must be persisted BEFORE footprinting (persist@${persistIdx} vs footprint@${footprintIdx})`);
  assert.ok(footprintIdx < provisionIdx,
    `footprints must be computed BEFORE provisioning (footprint@${footprintIdx} vs provision@${provisionIdx})`);

  // A NEW slice must not blow up on the missing WO file: it drives to a green gate, not blocked/other.
  assert.equal(result.kind, 'green', `expected a green gate, got ${JSON.stringify(result).slice(0, 300)}`);
});

await check("the thin planner's declared locus + contract seeds round-trip into the persist request", async () => {
  const calls = [];
  const run = loadRunner()(baseArgs(), mockBudget, noop, noop, makeAgent(calls), parallel, pipeline, noop);
  await run();
  const persist = calls.find((c) => c.agentType === 'reasonable:work-order-writer');
  assert.ok(persist, 'work-order-writer must be dispatched');
  assert.match(persist.prompt, new RegExp(WO_ID), 'the persist request must name the work order id');
  assert.match(persist.prompt, /src\/layout/, 'the persist request must carry the declared locus');
  assert.match(persist.prompt, new RegExp(CONTRACT), 'the persist request must carry the contract seeds');
});

await check('a footprint step returning fewer footprints than work orders HALTs (never groups a partial set)', async () => {
  const calls = [];
  // A footprint agent that drops the only WO's footprint (an under-computed set). The runner must
  // HALT rather than group a wave on it — an under-computed overlap could run conflicting WOs together.
  const shortFootprintAgent = async (prompt, opts) => {
    const label = (opts && opts.label) || '';
    calls.push({ label, agentType: opts && opts.agentType });
    if (label === 'reconcile') return briefing();
    if (label === 'route-plan') return decomposition();
    if (opts && opts.agentType === 'reasonable:work-order-writer') return { persisted: true, written: [WO_ID], note: null };
    if (opts && opts.agentType === 'reasonable:footprinter') return { footprints: [], independence: [], note: 'spec missing' };
    throw new Error(`unexpected agent() call after a short footprint report: ${label}`);
  };
  const run = loadRunner()(baseArgs(), mockBudget, noop, noop, shortFootprintAgent, parallel, pipeline, noop);
  const result = await run();
  assert.equal(result.kind, 'halt', `a short footprint report must HALT, got ${JSON.stringify(result).slice(0, 200)}`);
  const provisioned = calls.some((c) => (c.label || '').startsWith('provision:'));
  assert.equal(provisioned, false, 'no lane may be provisioned when the footprint set is partial (D11)');
});

await check('if WO specs cannot be persisted, the runner HALTs and NEVER provisions a lane-less worker', async () => {
  const calls = [];
  const run = loadRunner()(baseArgs(), mockBudget, noop, noop, makeAgent(calls, { persistOk: false }), parallel, pipeline, noop);
  const result = await run();
  assert.equal(result.kind, 'halt', `a failed WO-spec persist must HALT, got ${JSON.stringify(result).slice(0, 300)}`);
  const provisioned = calls.some((c) => (c.label || '').startsWith('provision:'));
  assert.equal(provisioned, false, 'no lane may be provisioned once WO-spec persistence has failed (D7)');
});

if (process.exitCode) console.error(`\nvertical-slice-runner-persist-work-orders: FAILURES above (${passed} passed).`);
else console.log(`\nvertical-slice-runner-persist-work-orders: all ${passed} checks passed. ✓`);
