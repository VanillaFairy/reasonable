// vertical-slice-runner-dead-end-retirement.test.mjs — RETIREMENT semantics for
// dead-ended work orders (thin-planner follow-up, 2026-07-05).
//
// A dead-ended work-order id must NEVER be re-run in-band: the briefing carries the
// reconcile-computed deadEnds set, the routePrompt marks those ids RETIRED, and the
// script drops any that slip through BEFORE persist/footprint/provision (capability
// beside discipline — the exact terminalWorkOrders pattern). A frontier left EMPTY
// after the drops is a human decision (BREAKING blocked, "frontier-stuck"), never a
// silent grind to a mislabeled budget-exhausted.
// Run: node test/vertical-slice-runner-dead-end-retirement.test.mjs

import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const scriptPath = join(here, '..', 'workflows', 'vertical-slice-runner.workflow.js');

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
async function pipeline(items, ...stages) {
  return Promise.all(items.map(async (item, i) => {
    let acc = item;
    for (let s = 0; s < stages.length; s++) acc = await stages[s](acc, item, i);
    return acc;
  }));
}
async function parallel(thunks) { return Promise.all(thunks.map((t) => t())); }

const LIVE = 'WO-S1-live';
const DEAD = 'WO-S1-dead';

function briefing() {
  return {
    halt: false, effortRoot: '/eff', currentVerticalSlice: 'slice-1', runMode: 'autonomous',
    brownfield: false, terminalWorkOrders: [], staleTrusted: [], floorUnexplained: 0,
    deadEnds: [{ workOrder: DEAD, ledgerSeq: 9, hash: 'sha256:h1' }],
    effortBranch: 'effort/demo',
  };
}
const wo = (id) => ({
  id, role: 'implementer', verticalSlice: 'slice-1',
  locus: [`src/${id}/**`], contractSeeds: ['comp-' + id], resources: [],
});

// Green-path agent mock for ONE live work order; records every call.
function makeAgent(calls, planWorkOrders) {
  return async (prompt, opts) => {
    const label = (opts && opts.label) || '';
    calls.push({ label, agentType: opts && opts.agentType, prompt });
    if (label === 'reconcile') return briefing();
    if (label === 'route-plan') return { workOrders: planWorkOrders, rationale: 'test cut' };
    if (opts && opts.agentType === 'reasonable:work-order-writer') return { persisted: true, written: [LIVE], note: null };
    if (opts && opts.agentType === 'reasonable:footprinter') {
      return { footprints: [{ id: LIVE, locus: [`src/${LIVE}/**`], contracts: ['comp-' + LIVE], resources: [] }], independence: [] };
    }
    if (label.startsWith('scribe:') || label.startsWith('commit-blind-tests:')) return { persisted: true, transition: label, note: null };
    if (label.startsWith('provision:') || label.startsWith('reprovision-blind-test:')) {
      return { provisioned: true, worktree: '/eff/.worktrees/' + LIVE, branch: 'lane/' + LIVE,
        descriptorWritten: true, depsReady: true, noOp: false, kind: null, note: null };
    }
    if (label.startsWith('implement:')) return { kind: 'green', workOrder: LIVE, verticalSlice: 'slice-1', detail: { commit: 'abc123' } };
    if (label.startsWith('blind-test:') || label.startsWith('adjudicate:')) return { kind: 'green', workOrder: LIVE, verticalSlice: 'slice-1', detail: { suiteRan: true } };
    if (label.startsWith('audit:')) {
      const isSuite = label.startsWith('audit:suite:');
      return { kind: 'green', workOrder: LIVE, verticalSlice: 'slice-1',
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

await check('a RETIRED (dead-ended) id is dropped before persist/footprint/provision; the live WO proceeds', async () => {
  const calls = [];
  const run = loadRunner()(baseArgs(), mockBudget, noop, noop, makeAgent(calls, [wo(LIVE), wo(DEAD)]), parallel, pipeline, noop);
  const result = await run();
  assert.equal(result.kind, 'green', `live WO must still gate green, got ${JSON.stringify(result).slice(0, 300)}`);

  const persist = calls.find((c) => c.agentType === 'reasonable:work-order-writer');
  assert.ok(persist, 'persist step must run for the surviving WO');
  assert.ok(!persist.prompt.includes(DEAD), 'the RETIRED id must never reach the persist request');
  const footprint = calls.find((c) => c.agentType === 'reasonable:footprinter');
  assert.ok(footprint && !footprint.prompt.includes(DEAD), 'the RETIRED id must never reach the footprint step');
  assert.ok(!calls.some((c) => (c.label || '') === `provision:${DEAD}`), 'the RETIRED id must never provision');
});

await check('the routePrompt carries the deadEnds set with RETIRED semantics (planner visibility)', async () => {
  const calls = [];
  const run = loadRunner()(baseArgs(), mockBudget, noop, noop, makeAgent(calls, [wo(LIVE)]), parallel, pipeline, noop);
  await run();
  const plan = calls.find((c) => c.label === 'route-plan');
  assert.ok(plan, 'route-plan must be dispatched');
  assert.match(plan.prompt, /RETIRED/, 'the planner must be told the ids are retired');
  assert.match(plan.prompt, new RegExp(DEAD), 'the planner must see the dead-ended id');
});

await check('a frontier left EMPTY after the retirement drop escalates BREAKING (frontier-stuck), nothing dispatched', async () => {
  const calls = [];
  const run = loadRunner()(baseArgs(), mockBudget, noop, noop, makeAgent(calls, [wo(DEAD)]), parallel, pipeline, noop);
  const result = await run();
  assert.equal(result.kind, 'blocked', `an emptied frontier must block, got ${JSON.stringify(result).slice(0, 300)}`);
  const item = result.outcome && result.outcome.items && result.outcome.items[0];
  assert.ok(item && item.class === 'BREAKING', 'the block must be BREAKING (a human decision)');
  assert.match(String(item.detail && item.detail.reason), /frontier-stuck/, 'the reason names the stuck frontier');
  assert.ok(!calls.some((c) => c.agentType === 'reasonable:work-order-writer'), 'nothing may persist on a stuck frontier');
  assert.ok(!calls.some((c) => (c.label || '').startsWith('provision:')), 'nothing may provision on a stuck frontier');
});

if (process.exitCode) console.error(`\ndead-end-retirement: FAILURES above (${passed} passed).`);
else console.log(`\ndead-end-retirement: all ${passed} checks passed. ✓`);
