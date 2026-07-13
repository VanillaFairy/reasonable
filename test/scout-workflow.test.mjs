// test/scout-workflow.test.mjs — the scout workflow's behavioral contract (reasonable 3.0 Part 8,
// DESIGN-3.0 §17, docs/superpowers/specs/2026-07-12-reasonable-3.0-p8-scout-design.md "Call 2" /
// "Call 4" / "The scout workflow — spike.workflow.js minus the effort"). One `Run scout` phase, NO
// lane-provisioner, NO effortRoot, NO ledger. Typed union mirrors spike.workflow.js: result |
// budget-exhausted | blocked. Copies the loadRunner()/runWith() harness from
// test/frontier-wave-workflow.test.mjs (the shipped precedent) — WITH ONE FIX, explained below.

import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const scriptPath = join(here, '..', 'workflows', 'scout.workflow.js');
const GLOBALS = ['args', 'budget', 'phase', 'log', 'agent', 'parallel', 'pipeline', 'workflow'];

let rawSource = null;

// HARNESS FIX (verified empirically against both shapes before this file was committed — see the
// commit message / task report for the reproduction): frontier-wave-workflow.test.mjs's loadRunner
// wraps the script body verbatim inside `(async () => { ${src} })` and relies on a top-level `return`
// inside `src` to produce a value. That is exactly right for frontier-wave.workflow.js, which is
// written as bare top-level statements ending in `return gateDue(...)`. But test/workflow-load.test.mjs
// documents that the engine accepts a SECOND authoring shape too: `export default async function
// run() {...}` (the shape workflows/spike.workflow.js actually uses, and the shape this scout workflow
// is spec'd to use — "spike.workflow.js minus phase 1"). A bare function DECLARATION never invokes
// itself: wrapped verbatim, the arrow function just declares `run` and implicitly returns `undefined`,
// so EVERY assertion below would fail forever — even against a fully correct implementation — because
// the harness, not the workflow, is what's broken. The one-line fix: after the (possibly absent) `run`
// declaration, explicitly call it if it exists. This is a no-op for the frontier-wave shape (its
// top-level `return` already fires first, so the appended line is unreachable dead code) and is what
// makes the function-wrapper shape actually execute.
function loadRunner() {
  rawSource = readFileSync(scriptPath, 'utf8');
  const src = rawSource
    .replace(/^export\s+const\s+meta\b/m, 'const meta')
    .replace(/^export\s+default\s+/m, '');
  const invokeRunIfDeclared = '\nreturn typeof run === "function" ? run() : undefined;';
  // eslint-disable-next-line no-new-func
  return new Function(...GLOBALS, `return (async () => { ${src}${invokeRunIfDeclared}\n });`);
}

const mockBudget = { spent: () => 0, remaining: () => Infinity, total: null };
const overBudget = { spent: () => 100, remaining: () => 0, total: 100 };
const noop = () => {};
async function parallel(thunks) { return Promise.all(thunks.map(async (t) => { try { return await t(); } catch { return null; } })); }
async function pipeline(items, ...stages) {
  return Promise.all(items.map(async (item) => { let a = item; for (const s of stages) { try { a = await s(a); } catch { a = null; } } return a; }));
}

// The REAL invocation shape (matches frontier-wave-workflow.test.mjs): loadRunner() returns the outer
// (args, budget, phase, log, agent, parallel, pipeline, workflow) => asyncFn — call it POSITIONALLY,
// matching GLOBALS' order exactly, then await the returned zero-arg async function.
function runWith(agent, over = {}, budget = mockBudget) {
  const args = {
    workspaceRoot: '/tmp/scout-ws',
    scout: { id: 's1', question: 'what is the right decomposition for a token-auth module?', timebox: '20 turns', ...over },
  };
  const run = loadRunner()(args, budget, noop, noop, agent, parallel, pipeline, noop);
  return run();
}

let passed = 0;
async function check(name, fn) {
  try { await fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.stack || e.message}`); process.exitCode = 1; }
}

const convergedVerdict = {
  question: 'q', method: 'm', evidence: 'e', verdict: 'converged', confidence: 'high',
  expiry: 'tested against node 22; re-verify on a stack change',
  reportPath: '/tmp/scout-ws/scout-report.md', seedPath: '/tmp/scout-ws/seed.json', timeboxExpired: false,
};

// ── module identity ───────────────────────────────────────────────────────────

await check('the workflow declares meta.name === "scout"', () => {
  loadRunner(); // populates rawSource as a side effect
  assert.match(rawSource, /export const meta\s*=\s*\{[\s\S]*?name:\s*['"]scout['"]/,
    'meta.name must literally be "scout" (the contract this suite is written against)');
});

// ── the typed-union routing ───────────────────────────────────────────────────

await check('a converged scout returns {kind:"result"} carrying scoutId, verdict, report and seed', async () => {
  const agent = async (_p, opts) => (opts.label === 'scout' ? convergedVerdict : {});
  const r = await runWith(agent);
  assert.strictEqual(r.kind, 'result');
  assert.strictEqual(r.scoutId, 's1');
  assert.strictEqual(r.verdict.verdict, 'converged');
  assert.strictEqual(r.report, '/tmp/scout-ws/scout-report.md');
  assert.strictEqual(r.seed, '/tmp/scout-ws/seed.json');
});

await check('an infeasible scout is a successful result (a "no"), carrying no seed', async () => {
  const agent = async (_p, opts) => (opts.label === 'scout'
    ? { ...convergedVerdict, verdict: 'infeasible', seedPath: undefined } : {});
  const r = await runWith(agent);
  assert.strictEqual(r.kind, 'result');
  assert.strictEqual(r.verdict.verdict, 'infeasible');
  assert.ok(!r.seed, 'infeasible carries no seed');
  assert.ok(r.report, 'infeasible still carries the report — the knowledge artifact was written either way');
});

await check('an inconclusive scout (timebox expired) is also a returnable result, carrying no seed', async () => {
  const agent = async (_p, opts) => (opts.label === 'scout'
    ? { ...convergedVerdict, verdict: 'inconclusive', seedPath: undefined, timeboxExpired: true } : {});
  const r = await runWith(agent);
  assert.strictEqual(r.kind, 'result');
  assert.strictEqual(r.verdict.verdict, 'inconclusive');
  assert.ok(!r.seed, 'inconclusive carries no seed');
});

await check('a null scout-runner return -> {kind:"blocked"}', async () => {
  const agent = async (_p, opts) => (opts.label === 'scout' ? null : {});
  const r = await runWith(agent);
  assert.strictEqual(r.kind, 'blocked');
});

await check('a missing question -> {kind:"blocked"} (a scout must carry one shape-discovery question)', async () => {
  const agent = async () => convergedVerdict;
  const r = await runWith(agent, { question: '' });
  assert.strictEqual(r.kind, 'blocked');
});

await check('a budget ceiling during the scout -> {kind:"budget-exhausted"}', async () => {
  const agent = async () => { throw new Error('token budget ceiling exceeded'); };
  const r = await runWith(agent, {}, overBudget);
  assert.strictEqual(r.kind, 'budget-exhausted');
});

// ── the no-effort dispatch shape (Call 1 / Call 2) ────────────────────────────

await check('the scout is dispatched with reasonable:spike-runner and NO effortRoot in its prompt', async () => {
  let seenPrompt = null, seenType = null;
  const agent = async (prompt, opts) => { if (opts.label === 'scout') { seenPrompt = prompt; seenType = opts.agentType; } return convergedVerdict; };
  await runWith(agent);
  assert.strictEqual(seenType, 'reasonable:spike-runner', 'the scout reuses the spike-runner agent (Call 2)');
  assert.ok(/\/tmp\/scout-ws/.test(seenPrompt), 'the prompt must name the disposable workspace');
  // NOTE: the prompt is EXPECTED to say things like "there is NO effortRoot" in prose (design Call 2:
  // "states plainly that this is a scout dispatch — no effort, no ledger") — so the bare word
  // "effortRoot" is not itself a violation. What's forbidden is COMPUTING/ROUTING one: a `--root` CLI
  // flag or a `ledger.mjs` invocation (the concrete "every ledger fact goes through the controller …
  // --root <effortRoot>" leakage Call 2 names). Test the real invariant, not the word.
  assert.ok(!/--root\b|ledger\.mjs/i.test(seenPrompt),
    'a scout dispatch must not ROUTE anything through an actual effortRoot (no --root flag, no ledger.mjs invocation) — the constitution\'s ledger section is vacuous for a scout (Call 2)');
});

await check('the scout dispatches exactly ONE agent call — no lane-provisioner (no effort to nest a worktree under)', async () => {
  const dispatches = [];
  const agent = async (_prompt, opts) => { dispatches.push(opts.agentType || opts.label || ''); return convergedVerdict; };
  await runWith(agent);
  assert.strictEqual(dispatches.length, 1, `expected exactly one agent dispatch, got ${dispatches.length}: ${JSON.stringify(dispatches)}`);
  assert.ok(!dispatches.some((d) => /lane-provisioner/i.test(d)),
    'no lane-provisioner / quarantine-provisioning dispatch — the scout workflow is spike.workflow.js MINUS phase 1 (design Call 1)');
});

await check('the workflow announces the "Run scout" phase', async () => {
  const seenPhases = [];
  const agent = async () => convergedVerdict;
  const args = { workspaceRoot: '/tmp/scout-ws', scout: { id: 's1', question: 'q' } };
  const run = loadRunner()(args, mockBudget, (name) => seenPhases.push(name), noop, agent, parallel, pipeline, noop);
  await run();
  assert.ok(seenPhases.includes('Run scout'), `expected a "Run scout" phase call, got: ${JSON.stringify(seenPhases)}`);
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

if (process.exitCode) console.error(`\nscout-workflow: FAILURES above (${passed} passed).`);
else console.log(`\nscout-workflow: all ${passed} checks passed. ✓`);
