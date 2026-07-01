// vertical-slice-runner-reconcile-halt.test.mjs — a hard agent() throw at the reconcile
// or route-plan step must produce a typed {kind:'halt', ...} GATE_RESULT, never crash the
// whole workflow run uncaught.
//
// THE BUG (sofia-plays graph-editor-ux-overhaul, 2026-07-01). The reconciler burned all 5
// StructuredOutput retries wrapping its answer as {"input": "<json-string>"} instead of
// passing the schema's fields as the tool call's own top-level arguments (a model call-
// shape habit, also seen on the lane-provisioner in the same session). The engine's
// resulting throw ("StructuredOutput retry cap (5) exceeded") was not caught anywhere in
// vertical-slice-runner.workflow.js and crashed the run before phase('Reconcile') ever
// completed - despite the reconcile prologue's own comment already saying "a reconcile
// failure is a HALT, not a budget checkpoint" (the code just never delivered that for a
// throw, only for a null/`.halt` return). Run: node test/vertical-slice-runner-reconcile-halt.test.mjs

import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const scriptPath = join(here, '..', 'workflows', 'vertical-slice-runner.workflow.js');

// Mirrors workflow-load.test.mjs's engine function-scope wrap - but here we actually
// INVOKE the resulting function with mock globals instead of merely constructing it.
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
const RETRY_CAP_ERROR = 'agent({schema}): StructuredOutput retry cap (5) exceeded - 5 failed calls with no valid output';

let passed = 0;
async function check(name, fn) {
  try { await fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.stack || e.message}`); process.exitCode = 1; }
}

await check('a hard agent() throw at the reconcile step halts, never crashes the run', async () => {
  const run = loadRunner()({}, mockBudget, noop, noop,
    async (_prompt, opts) => {
      if (opts.label === 'reconcile') throw new Error(RETRY_CAP_ERROR);
      throw new Error(`unexpected agent() call: ${opts.label}`);
    },
    noop, noop, noop);
  const result = await run();
  assert.equal(result.kind, 'halt', `expected a typed halt, got ${JSON.stringify(result)}`);
  assert.match(result.reason, /StructuredOutput retry cap/, 'the halt reason should carry the underlying agent() failure');
});

await check('a hard agent() throw at the route-plan step halts, never crashes the run', async () => {
  const briefing = {
    halt: false, effortRoot: '/tmp/effort', currentVerticalSlice: 'slice-1', runMode: 'autonomous',
    brownfield: false, terminalWorkOrders: [], trusted: [], staleTrusted: [], floor: [], floorUnexplained: 0, inbox: [],
  };
  const args = { effortRoot: '/tmp/effort', verticalSliceId: 'slice-1', runMode: 'autonomous' };
  const run = loadRunner()(args, mockBudget, noop, noop,
    async (_prompt, opts) => {
      if (opts.label === 'reconcile') return briefing;
      if (opts.label === 'route-plan') throw new Error(RETRY_CAP_ERROR);
      throw new Error(`unexpected agent() call: ${opts.label}`);
    },
    noop, noop, noop);
  const result = await run();
  assert.equal(result.kind, 'halt', `expected a typed halt, got ${JSON.stringify(result)}`);
  assert.match(result.reason, /StructuredOutput retry cap/, 'the halt reason should carry the underlying agent() failure');
});

if (process.exitCode) console.error(`\nvertical-slice-runner-reconcile-halt: FAILURES above (${passed} passed).`);
else console.log(`\nvertical-slice-runner-reconcile-halt: all ${passed} checks passed. ✓`);
