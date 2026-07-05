// vertical-slice-runner-scope-expansion-no-spin.test.mjs — a `scope-expansion` OUTCOME must
// ESCALATE promptly (a cross-locus decision for the main-session membrane), never spin.
//
// THE BUG (sofia-plays graph-editor-ux-overhaul slice 4). The layout-surface implementer was
// fence-blocked on two cross-locus files (server/main.py + mcp_server/client.py) and correctly
// emitted kind:'scope-expansion'. The trap router set `needsAnotherPass = true` "to re-dispatch
// with the widened locus next iteration" — but NOTHING widened the locus (the lane's fence is
// licensed by the persisted work-order spec, which this pure script cannot rewrite). So every
// re-pass re-hit the SAME fence and re-emitted the SAME scope-expansion, spinning the
// budget-guarded loop until the agent cap tripped (~2.4M tokens burned). Worse, a co-occurring
// floor break then MASKED the real cause: toGateResult checked `regressions` before `state.blocked`,
// so the run returned {kind:'blocked', outcome:{kind:'unforeseen-regression'}} and the
// scope-expansion never surfaced at all.
//
// THE CONTRACT (this test): a scope-expansion (a) dispatches the implementer exactly ONCE — no
// re-pass without an actual grant — and (b) returns a `blocked` GATE_RESULT that SURFACES the
// scope-expansion as a BREAKING trap item, even when a floor break co-occurs.
//
// Run: node test/vertical-slice-runner-scope-expansion-no-spin.test.mjs

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

// Faithful-enough pipeline/parallel (same as the sibling runner tests): threads
// (prevResult, originalItem, index) through the stages, first stage receiving the item.
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

const WO = 'WO-1';
const WORKTREE = '/tmp/effort/.worktrees/WO-1';

const briefing = {
  halt: false, effortRoot: '/tmp/effort', currentVerticalSlice: 'slice-1', runMode: 'autonomous',
  brownfield: false, effortBranch: 'effort/x', baseBranch: 'master',
  terminalWorkOrders: [], trusted: [], staleTrusted: [], floor: [], floorUnexplained: 0, inbox: [],
};
// Thin-planner DECOMPOSITION: declared locus + contract SEEDS, no computed footprint.
const routePlan = {
  workOrders: [{
    id: WO, role: 'implementer', verticalSlice: 'slice-1',
    locus: ['src/**'], contractSeeds: ['comp'], resources: [],
    characterizationNeeded: false, behaviorDelta: [], forkCitations: [],
  }],
  rationale: 'one op',
};
// The dedicated footprint step's report over the persisted spec.
const footprintReport = { footprints: [{ id: WO, locus: ['src/**'], contracts: ['comp'], resources: [] }], independence: [] };

let passed = 0;
async function check(name, fn) {
  try { await fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.stack || e.message}`); process.exitCode = 1; }
}

await check('a scope-expansion escalates once (no spin) and surfaces past a co-occurring floor break', async () => {
  let implementCalls = 0;

  const agent = async (prompt, opts) => {
    const label = opts.label || '';
    if (label === 'reconcile') return briefing;
    if (label === 'route-plan') return routePlan;
    if (label === 'persist-work-orders') return { persisted: true, written: [WO] };
    if (label === 'footprint') return footprintReport;
    if (label === 'scribe:write-ahead') return { persisted: true, transition: 'dispatched' };
    if (label === `provision:${WO}` || label === `reprovision-blind-test:${WO}`) {
      return {
        provisioned: true, worktree: WORKTREE, branch: `lane/${WO}`,
        descriptorWritten: true, depsReady: true, journalRecorded: true, noOp: false,
      };
    }
    if (label === `implement:${WO}`) {
      implementCalls += 1;
      // The implementer is fence-blocked on a cross-locus file AND (as in slice 4) the change
      // trips a floor break it declared via behaviorDelta=[] (undeclared → would classify as an
      // unforeseen-regression, the masking case).
      return {
        kind: 'scope-expansion', workOrder: WO, verticalSlice: 'slice-1',
        detail: { scopeExpansionRequested: ['server/main.py — mount the layout router'] },
        floorBreak: { broke: true, floorTests: ['tests/old.py::stale'], loci: ['tests/old.py'] },
        behaviorDelta: [],
      };
    }
    if (label === 'scribe:journal') return { persisted: true, transition: 'wave recorded' };
    // downstream stages (intentVerify/blindTest/…) pass a non-green prev straight through,
    // so they must never dispatch an agent on a trapped lane:
    throw new Error(`unexpected agent() call on a trapped lane: ${label}`);
  };

  // Finite budget so that IF the loop spun (the bug) the test still terminates quickly and fails
  // on the assertions below rather than hanging.
  const budget = {
    total: 100,
    spent: () => implementCalls * 40,
    remaining: () => Math.max(0, 100 - implementCalls * 40),
  };
  const args = {
    effortRoot: '/tmp/effort', verticalSliceId: 'slice-1', runMode: 'autonomous',
    brownfield: false, budget: { total: 100 },
  };

  const run = loadRunner()(args, budget, noop, noop, agent, parallel, pipeline, noop);
  const result = await run();

  // (a) No spin: the implementer is dispatched exactly once — a scope-expansion is NOT re-passed
  //     without an actual grant.
  assert.equal(implementCalls, 1,
    `scope-expansion must escalate, not re-pass: implementer dispatched ${implementCalls}× (spin bug if >1)`);

  // (b) The result blocks and SURFACES the scope-expansion, not masked by the floor break.
  assert.equal(result.kind, 'blocked', `expected blocked, got ${JSON.stringify(result)}`);
  const items = (result.outcome && result.outcome.items) || [];
  assert.ok(
    items.some((i) => i.kind === 'scope-expansion' && i.workOrder === WO),
    `the scope-expansion must surface as a BREAKING trap item, got ${JSON.stringify(result.outcome)}`,
  );
});

if (process.exitCode) console.error(`\nvertical-slice-runner-scope-expansion-no-spin: FAILURES above (${passed} passed).`);
else console.log(`\nvertical-slice-runner-scope-expansion-no-spin: all ${passed} checks passed. ✓`);
