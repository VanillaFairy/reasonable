// vertical-slice-runner-green-no-mergesha.test.mjs — a vertical slice whose single work order
// passes the full in-run pipeline GREEN must return {kind:'green'}, NEVER {kind:'halt'}, and the
// journal scribe must never be asked to originate a mergeSha for it.
//
// THE BUG (sofia-plays graph-editor-ux-overhaul slice 3b, BUG 5). The run finished the whole
// pipeline (implement -> intent-verify -> blind-test -> adjudicate -> audit) GREEN, but the
// authoritative journalWrite handed the scribe `greenWorkOrders` with only "record the transitions".
// The scribe mapped green -> the only terminal status "merged", which content-references a mergeSha it
// was never given; D21 (never originate a SHA) forced persisted:false, and the runner turned a
// genuinely-green slice into {kind:'halt'}. A gate-passed WO is NOT merged: the merge to
// `merged`+SHA is the main session's post-run membrane act, so in-run the WO stays `dispatched` and
// nothing needs a SHA. The journalWrite prompt now says exactly that.
//
// This test also pins BUG 3's new stage: `commit-blind-tests` must run in the happy path (the narrow
// lane-committer that lands the blind-test-writer's tests onto the lane).
//
// Run: node test/vertical-slice-runner-green-no-mergesha.test.mjs

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

// Faithful-enough pipeline/parallel: enough of the engine's contract for the run to exercise the
// real stage sequencing. pipeline threads (prevResult, originalItem, index) through the stages, the
// first stage receiving the item as prevResult (mirrors the engine + the workflow's stage-0 shape).
async function pipeline(items, ...stages) {
  return Promise.all(items.map(async (item, i) => {
    let acc = item;
    for (const stage of stages) {
      try { acc = await stage(acc, item, i); } catch { acc = null; }
    }
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
const routePlan = {
  workOrders: [{
    id: WO, role: 'implementer', verticalSlice: 'slice-1',
    footprint: { locus: ['src/**'], contracts: ['comp'], resources: [] },
    characterizationNeeded: false, behaviorDelta: [], staleTrusted: [],
  }],
  rationale: 'one op',
};

// A faithful audit leaf: green, with the positive executed-suite evidence the gate keys on.
const auditLeaf = (check) => ({
  kind: 'green', workOrder: WO,
  detail: { check, suiteRan: true, trustedGreen: true, floorGreen: true },
  evidence: { check },
});

let passed = 0;
async function check(name, fn) {
  try { await fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.stack || e.message}`); process.exitCode = 1; }
}

await check('a fully-green slice returns green (never halt), no mergeSha asked of the scribe, commit stage runs', async () => {
  const labels = [];
  let scribeJournalPrompt = null;

  const agent = async (prompt, opts) => {
    const label = opts.label || '';
    labels.push(label);
    if (label === 'reconcile') return briefing;
    if (label === 'route-plan') return routePlan;
    if (label === 'persist-work-orders') return { persisted: true, written: [WO] };
    if (label === 'scribe:write-ahead') return { persisted: true, transition: 'dispatched' };
    if (label === `provision:${WO}` || label === `reprovision-blind-test:${WO}`) {
      return {
        provisioned: true, worktree: WORKTREE, branch: `lane/${WO}`,
        descriptorWritten: true, depsReady: true, journalRecorded: true, noOp: false,
      };
    }
    if (label === `implement:${WO}`) {
      return {
        kind: 'green', workOrder: WO, verticalSlice: 'slice-1',
        // own-contract-only enrichment => intent-verify risk-gate skips it (no verdict-writer)
        detail: { enrichment: { enriched: true, clauses: ['§1'], touchesSharedContract: false }, commit: 'deadbeef' },
      };
    }
    if (label === `blind-test:${WO}`) return { kind: 'green', workOrder: WO };
    if (label === `commit-blind-tests:${WO}`) {
      // BUG 3: the lane-committer must target the lane via --root <worktree>, never the main checkout.
      assert.match(prompt, /--root \/tmp\/effort\/\.worktrees\/WO-1/, 'commit-blind-tests must pass --root <laneWorktree>');
      assert.match(prompt, /Work-Order: WO-1/, 'the blind-test commit must carry a Work-Order trailer');
      return { persisted: true, transition: 'blind-tests-committed' };
    }
    if (label === `adjudicate:${WO}`) return { kind: 'green', workOrder: WO, detail: { suiteRan: true } };
    if (label.startsWith(`audit:`)) {
      const parts = label.split(':'); // audit:<check>:WO-1
      return auditLeaf(parts[1]);
    }
    if (label === 'scribe:journal') {
      scribeJournalPrompt = prompt;
      return { persisted: true, transition: 'wave recorded' };
    }
    throw new Error(`unexpected agent() call: ${label}`);
  };

  const args = { effortRoot: '/tmp/effort', verticalSliceId: 'slice-1', runMode: 'autonomous', brownfield: false };
  const run = loadRunner()(args, mockBudget, noop, noop, agent, parallel, pipeline, noop);
  const result = await run();

  assert.equal(result.kind, 'green', `expected a green GATE_RESULT, got ${JSON.stringify(result)}`);

  // BUG 5: the scribe must be told a gate-passed WO stays dispatched — not merged, no SHA.
  assert.ok(scribeJournalPrompt, 'the authoritative journal scribe must have been dispatched');
  assert.match(scribeJournalPrompt, /GATE-PASSED IS NOT MERGED/, 'the scribe prompt must carry the no-merge/no-SHA guard');
  assert.match(scribeJournalPrompt, /do NOT set status "merged"/, 'the scribe must be told to leave green WOs dispatched');

  // BUG 3: the commit-blind-tests stage must have run in the happy path.
  assert.ok(labels.includes(`commit-blind-tests:${WO}`), 'the commit-blind-tests stage must run for a green WO');
});

if (process.exitCode) console.error(`\nvertical-slice-runner-green-no-mergesha: FAILURES above (${passed} passed).`);
else console.log(`\nvertical-slice-runner-green-no-mergesha: all ${passed} checks passed. ✓`);
