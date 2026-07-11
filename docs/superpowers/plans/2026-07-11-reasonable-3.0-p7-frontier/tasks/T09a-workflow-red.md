# Task T09a: `frontier-wave.workflow.js` behavioral tests (red)

**Role:** `red` — you write ONLY the one failing test file below. Do NOT create
`workflows/frontier-wave.workflow.js`.

## References
- Read: `../shared/interfaces.md` §5 **in full** (the phase sequence, the 7-variant `GATE_RESULT`
  routing, role-minimal dispatch, lane=atom reuse) and §0 correction 2 (the workflow inlines mirrors —
  it cannot import `lib/frontier.mjs`)
- Read: `../shared/conventions.md` (workflow substrate purity rules)
- Read: `../knowledge/running-tests.md`
- Read: `workflows/vertical-slice-runner.workflow.js` **in full** — the file this one replaces; copy its
  substrate conventions (`export const meta`, the injected `GLOBALS`, inline schema `const`s, `guard()`,
  the inlined `groupDisjoint`, prompt-builders passing artifact paths) exactly
- Read: `test/vertical-slice-runner-green-no-mergesha.test.mjs` **in full** — the exact harness you
  copy: `loadRunner()` (strip `export`, wrap in `new Function(...GLOBALS, ...)`), a stub `agent(prompt,
  opts)` keyed on `opts.label`, stub `pipeline`/`parallel`, a `mockBudget`
- Read: `test/workflow-load.test.mjs` (auto-covers every `workflows/*.workflow.js` for the
  duplicate-top-level-binding purity check — you do not need to duplicate that check here, it runs
  automatically once your file exists)

## Dependencies
- Depends on: T03c (Phase A closed — the workflow mirrors `frontier.mjs`'s `pack`/`gateDue`), T05c
  (Phase B — the workflow appends `atom-verdict` events), T08c (Phase C — the final `reconcile` shape)
- Depended on by: T09b (implements against these locked tests), T09c (audits them)

## Scope
**Files:**
- Create: `test/frontier-wave-workflow.test.mjs`

**BOUNDARY — you MUST NOT modify any files outside this list. In particular, do NOT create
`workflows/frontier-wave.workflow.js` and do NOT delete `workflows/vertical-slice-runner.workflow.js`
(both are T09b's job).**

## Positive Constraints (DO)
- `loadRunner()` reads `workflows/frontier-wave.workflow.js` — this file does not exist yet, so RED here
  is a `readFileSync` `ENOENT` error, not an assertion failure. This is expected and correct (mirrors
  how T01a's RED was a module-not-found error).
- Cover the **7-variant `GATE_RESULT` union**: stub a fully-green single-atom wave (one packed atom,
  audited green, merged) with no gate condition tripped except a heartbeat floor — assert the run
  returns `{kind:'heartbeat', ...}` (not the retired `{kind:'green'}` four-variant shape).
- Cover **`goal-green`**: stub a wave whose merge completes a goal's cone — assert `{kind:'goal-green',
  ...}`.
- Cover **`blocked-human`**: stub a verdict routing to `intent-fork` (an `atomId` whose refuted premise
  is `layer:'intention'`) — assert `{kind:'blocked-human', ...}`, **in both a `gated` and an
  `autonomous` run-mode briefing** (always-human, both modes).
- Cover **`budget-exhausted`**: stub the budget guard throwing mid-wave (mirror the shipped runner's
  `guard()` catch pattern) — assert `{kind:'budget-exhausted', ...}`, never a `halt`.
- Cover **`halt`**: stub the reconcile briefing returning `halt:true` — assert `{kind:'halt', ...}`
  returned immediately, no wave dispatch attempted.
- Cover **role-minimal dispatch**: stub a single-atom, non-brownfield, empty-amendment-batch,
  single-landed-cone context — assert the `agent` stub is **never** called with a `census`,
  `characterizer`, `topologist`, or `retro-synthesizer` label (only `implementer`, `blind-test-writer`,
  `auditor`, and the reconcile/spec/pack/merge/gate-adjacent labels fire).
- Cover **purity**: assert (by string-searching the loaded source, mirroring how you'd expect
  `test/workflow-load.test.mjs` to already guard the load-time shape) that the file contains no
  top-level `import`, `require`, `fs.`, `Date.now()`, or `new Date()` — a lightweight redundant check
  local to this file, since `test/workflow-load.test.mjs` only proves it LOADS, not that it stayed pure.

## Negative Constraints (DO NOT)
- Do NOT implement `workflows/frontier-wave.workflow.js`.
- Do NOT delete `workflows/vertical-slice-runner.workflow.js`.
- Do NOT modify any file outside Scope.

## Implementation Steps

### Step 1: Write `test/frontier-wave-workflow.test.mjs`

```js
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
    amendmentBatch: [], landedConeCount: 0, ...over,
  };
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
    return {};
  };
  const result = await runWith(agent);
  assert.strictEqual(result.kind, 'heartbeat');
  assert.notStrictEqual(result.kind, 'green', 'the retired 4-variant kind must never be returned');
});

await check('a goal-completing merge returns {kind:"goal-green"}', async () => {
  const agent = async (prompt, opts) => {
    if (opts.label === 'reconcile') return baseBriefing({ goalGreen: { goalId: 'g-1' } });
    if (opts.label === 'auditor') return { kind: 'green', atomId: ATOM };
    return {};
  };
  const result = await runWith(agent);
  assert.strictEqual(result.kind, 'goal-green');
});

for (const runMode of ['gated', 'autonomous']) {
  await check(`an intent-fork verdict returns {kind:"blocked-human"} in ${runMode} mode (always human, both modes)`, async () => {
    const agent = async (prompt, opts) => {
      if (opts.label === 'reconcile') return baseBriefing({ runMode, blockedHuman: { class: 'intent-fork', ref: 'i#1' } });
      return {};
    };
    const result = await runWith(agent);
    assert.strictEqual(result.kind, 'blocked-human');
  });
}

await check('a budget-guard throw returns {kind:"budget-exhausted"}, never halt', async () => {
  const agent = async (prompt, opts) => {
    if (opts.label === 'reconcile') return baseBriefing();
    if (opts.label === 'implementer') throw new Error('budget ceiling');
    return {};
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
    return {};
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
    return {};
  };
  await runWith(agent);
  for (const forbidden of ['census', 'characterizer', 'topologist', 'retro-synthesizer']) {
    assert.ok(!labels.includes(forbidden), `${forbidden} must not be dispatched for a single-atom greenfield wave`);
  }
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
```

### Step 2: Run the test to verify it fails for the right reason

Run: `node test/frontier-wave-workflow.test.mjs`

Expected: an `ENOENT` error reading `workflows/frontier-wave.workflow.js` (the file does not exist yet)
— the whole file fails to run past its first `loadRunner()` call, which is correct RED.

### Step 3: Commit

```bash
git add test/frontier-wave-workflow.test.mjs
git commit -m "test(frontier-wave): lock the 7-variant GATE_RESULT, role-minimal dispatch, and purity (red, P7)" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

## Acceptance Criteria
- [ ] `test/frontier-wave-workflow.test.mjs` exists and matches the shipped workflow-test harness
      convention exactly
- [ ] Running it fails with `ENOENT` (the file does not exist), not an assertion failure
- [ ] All seven `GATE_RESULT` variants, always-human blocked-human in both run modes, role-minimal
      dispatch, and purity are covered
- [ ] No file outside Scope modified; `workflows/frontier-wave.workflow.js` was NOT created;
      `workflows/vertical-slice-runner.workflow.js` was NOT deleted
