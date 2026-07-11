# Task T07a: reconcile goals/cones projection tests (red)

**Role:** `red` — you write ONLY the one failing test file below. Do NOT modify `lib/reconcile.mjs`.

> **Scoping note — read first.** `routeOrder` feeds `projectDirectives`'s WO-`.verticalSlice` grouping,
> a 2.x concept the atom/goal model does not share. This task tests only that `routeOrder`'s SOURCE
> flips to cone-derived data when `goals.json` is present — not a rewrite of WO/slice bookkeeping to be
> atom-native (`../shared/interfaces.md` §4's flagged scoping boundary, out of P7's stated scope). The
> fixture below uses goal ids that deliberately equal WO `.verticalSlice` values, purely to make the
> wiring observable through `DISPATCH` ordering.

## References
- Read: `../shared/interfaces.md` §4 **in full** (the additive step + the scoping boundary),
  `../shared/conventions.md` (migration safety — this is a live-engine test)
- Read: `../knowledge/running-tests.md`
- Read: `docs/superpowers/specs/2026-07-11-reasonable-3.0-p7-frontier-design.md` Decision 6, steps 1–3
- Read: `lib/reconcile.mjs` **the Layer-2 block** (≈ lines 637–735: `readRoute` → `routeOrder` →
  `projSlices` → `projectDirectives`), the self-check block (≈ lines 800–835:
  `routeSlices: Array.isArray(routeOrder) ? routeOrder : []`)
- Read: `test/reconcile-next-action.test.mjs` **in full** — copy its `newEffort()` harness (git init,
  config.json, journal.json, work-order specs, ledger.jsonl) verbatim; you EXTEND it with two optional
  params (`goals`, `policy`) that write `.reasonable/goals.json` / `.reasonable/policy.json` when
  provided
- Read: `lib/goals.mjs`'s `readGoals` (goal entry shape) and `lib/policy.mjs`'s `readPolicy` (the exact
  validated shape — `weights`/`legibility`/`cadence`/`dials`, all required if `policy.json` is written
  at all, else it is rejected wholesale) — your `policy.json` fixture must satisfy every one of these
  or `readPolicy` will return `{policy:null, diagnostic:'...'}` and the deriver falls back to empty
  weights
- Read: `lib/graph.mjs`'s `graphDivergence(effortRoot)` return shape (`{nodesOnlyAsLived,
  nodesOnlyCurrent, edgesOnlyAsLived, edgesOnlyCurrent}`)

## Dependencies
- Depends on: T06b (`deriveConeOrder`)
- Depended on by: T07b (implements against these locked tests), T07c (audits them)

## Scope
**Files:**
- Create: `test/reconcile-cones-projection.test.mjs`

**BOUNDARY — you MUST NOT modify any files outside this list. In particular, do NOT edit
`lib/reconcile.mjs`.**

## Positive Constraints (DO)
- Cover **goals.json present ⇒ cone-derived order feeds DISPATCH ordering**: two goals `g-a`/`g-b`
  (used AS the WOs' `.verticalSlice` values too — see the scoping note), each with a distinct cone size
  via `scenarioCitations`/atom-chartered events, `policy.json`'s `weights.unlocksCount: 1`; two ready
  WOs, one per slice/goal id. Assert the `DISPATCH` directives in `reconcile(root).nextAction` appear in
  the cone-derived order (the larger-cone goal's slice dispatches first), NOT `route.json`'s order (seed
  a DIFFERENT, contradicting `route.json` too, to prove goals.json wins when both are present — the
  additive step's priority, per Decision 6 step 2: "when `goals.json` is present").
- Cover **goals.json absent ⇒ the route.json path is untouched (regression)**: reuse (a trimmed copy
  of) one of `test/reconcile-next-action.test.mjs`'s own existing fixtures/assertions verbatim, with NO
  `goals.json` written, and confirm identical behavior.
- Cover **`graphDivergence` is surfaced as a note when non-empty**: this is hard to force with a
  from-scratch fixture (as-lived and current start identical for a fresh effort); instead, assert the
  SHAPE contract — `reconcile(root).notes` is an array (always), and when a divergence fixture cannot be
  cheaply constructed, add a `check()` that documents this with a `// KNOWN LIMIT` comment rather than
  asserting a false positive. (If you find a cheap way to force divergence — e.g. seeding a
  `.reasonable/contracts/` file the ledger's folded atoms don't cite — use it; otherwise flag it
  honestly for T07c to confirm is a reasonable limit, not a skipped requirement.)
- Cover **`goals.json` present but malformed ⇒ graceful fallback to route.json, never a crash**: a
  broken `goals.json` (invalid JSON) with a valid `route.json` present still produces working
  `DISPATCH` directives from the route path.

## Negative Constraints (DO NOT)
- Do NOT implement the reconcile change.
- Do NOT rewrite `projectDirectives`'s WO/slice grouping (out of scope — see the scoping note).
- Do NOT modify any file outside Scope.

## Implementation Steps

### Step 1: Write `test/reconcile-cones-projection.test.mjs`

```js
// test/reconcile-cones-projection.test.mjs — reconcile() selects the goals/cones frontier order when
// goals.json is present, falling back to route.json otherwise (DESIGN-3.0 §12; reasonable 3.0 Part 7,
// interfaces.md §4). Real git repo + hand-written .reasonable/ state, mirrors
// test/reconcile-next-action.test.mjs's harness, extended with goals.json/policy.json.

import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

import { reconcile } from '../lib/reconcile.mjs';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
const write = (root, rel, content) => {
  const p = join(root, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, content);
};

const tmps = [];
let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.stack || e.message}`); process.exitCode = 1; }
}

function newEffort({ workOrders, specs, ledger, route, goals, policy, currentVerticalSlice = 'g-a' }) {
  const root = mkdtempSync(join(tmpdir(), 'reconcile-cones-')); tmps.push(root);
  git(root, 'init', '-q');
  const hooks = join(root, '.nohooks'); mkdirSync(hooks, { recursive: true });
  git(root, 'config', 'core.hooksPath', hooks);
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'user.name', 'Reconcile Cones Test');
  git(root, 'config', 'commit.gpgsign', 'false');
  write(root, 'README.md', 'base\n');
  write(root, '.gitignore', '.reasonable/\n.worktrees/\n.nohooks/\n');
  git(root, 'add', '-A'); git(root, 'commit', '-q', '-m', 'init');
  git(root, 'branch', 'effort/demo');

  write(root, '.reasonable/config.json', JSON.stringify({ effort: 'demo', runMode: 'autonomous', effortBranch: 'effort/demo' }) + '\n');
  write(root, '.reasonable/journal.json', JSON.stringify({
    effort: 'demo', currentVerticalSlice, phase: 'vertical-slice-execution', supervision: 'standard',
    workOrders, lanes: {}, inbox: [],
  }, null, 2) + '\n');
  for (const [id, spec] of Object.entries(specs)) {
    write(root, `.reasonable/work-orders/${id}.json`, JSON.stringify(spec, null, 2) + '\n');
  }
  if (route) write(root, '.reasonable/route.json', JSON.stringify(route, null, 2) + '\n');
  if (goals !== undefined) write(root, '.reasonable/goals.json', typeof goals === 'string' ? goals : JSON.stringify(goals, null, 2) + '\n');
  if (policy) write(root, '.reasonable/policy.json', JSON.stringify(policy, null, 2) + '\n');
  write(root, '.reasonable/ledger.jsonl', ledger.map((e) => JSON.stringify(e)).join('\n') + (ledger.length ? '\n' : ''));
  return root;
}

const dispatchOrder = (r) =>
  (r.nextAction || []).filter((d) => d.kind === 'DISPATCH').map((d) => d.slice);

const VALID_POLICY = {
  weights: { unlocksCount: 1 },
  legibility: { maxWidth: 25, maxTangle: 5, maxChain: 10, r8Retries: 3 },
  cadence: { lite: { n: 5, m: 20 } },
  dials: { bandScale: ['lite', 'full'], phaseCutoffs: {}, cadenceIndex: {} },
};

// ── goals.json present: cone-derived order wins, even over a contradicting route.json ────────

check('reconcile: with goals.json present, DISPATCH order follows the cone-derived order, overriding a CONTRADICTING route.json', () => {
  const root = newEffort({
    workOrders: { 'WO-a': { role: 'implementer', verticalSlice: 'g-a' }, 'WO-b': { role: 'implementer', verticalSlice: 'g-b' } },
    specs: {
      'WO-a': { verticalSlice: 'g-a', dependsOn: [] },
      'WO-b': { verticalSlice: 'g-b', dependsOn: [] },
    },
    // route.json says g-b first — the OPPOSITE of what the cone order below produces. If reconcile still
    // followed route.json, this check would observe ['g-b','g-a'] and FAIL — that is the point.
    route: { slices: ['g-b', 'g-a'], ratifiedAt: null, ledgerSeq: null },
    // goals: g-a's cone is BIGGER (a-5 provides lexer#c1 but itself cites a-7's lexer#c2, chaining a-7
    // into g-a's cone -> size 2) than g-b's (a-3 provides parser#c1 directly, no citations -> size 1).
    // Under unlocksCount weighting, g-a (score 2) must sort BEFORE g-b (score 1): routeOrder=['g-a','g-b'].
    goals: [
      { id: 'g-a', scenario: 'a', scenarioCitations: [{ clause: 'lexer#c1' }] },
      { id: 'g-b', scenario: 'b', scenarioCitations: [{ clause: 'parser#c1' }] },
    ],
    policy: VALID_POLICY,
    ledger: [
      { seq: 1, type: 'node-planned', node: 'WO-a', kind: 'work-order', title: 'a' },
      { seq: 2, type: 'node-planned', node: 'WO-b', kind: 'work-order', title: 'b' },
      { seq: 3, type: 'atom-chartered', component: 'parser', premises: [], purpose: 'y', locus: [], order: 0 }, // a-3: provides parser#c1, no citations
      { seq: 4, type: 'atom-delta-authored', atomId: 'a-3', clauses: [{ clauseId: 'parser#c1', citations: [], demandedBy: null, locus: [] }] },
      { seq: 5, type: 'atom-chartered', component: 'lexer', premises: [], purpose: 'x', locus: [], order: 0 }, // a-5: provides lexer#c1, cites lexer#c2
      {
        seq: 6, type: 'atom-delta-authored', atomId: 'a-5',
        clauses: [{ clauseId: 'lexer#c1', citations: [{ component: 'lexer', clause: 'lexer#c2' }], demandedBy: null, locus: [] }],
      },
      { seq: 7, type: 'atom-chartered', component: 'lexer', premises: [], purpose: 'z', locus: [], order: 0 }, // a-7: provides lexer#c2
      { seq: 8, type: 'atom-delta-authored', atomId: 'a-7', clauses: [{ clauseId: 'lexer#c2', citations: [], demandedBy: null, locus: [] }] },
    ],
  });

  const r = reconcile(root);
  assert.deepStrictEqual(dispatchOrder(r), ['g-a', 'g-b'], 'g-a\'s bigger cone (a-5+a-7 vs a-3 alone) dispatches first — the cone-derived order WINS over route.json\'s contradicting [g-b,g-a]');
});

// ── goals.json absent: the route.json path is UNCHANGED (regression) ──────────

check('reconcile: with NO goals.json, route.json still drives DISPATCH order exactly as before', () => {
  const root = newEffort({
    workOrders: { 'WO-a': { role: 'implementer', verticalSlice: 'slice-a' }, 'WO-b': { role: 'implementer', verticalSlice: 'slice-b' } },
    specs: {
      'WO-a': { verticalSlice: 'slice-a', dependsOn: [] },
      'WO-b': { verticalSlice: 'slice-b', dependsOn: [] },
    },
    route: { slices: ['slice-b', 'slice-a'], ratifiedAt: null, ledgerSeq: null },
    ledger: [
      { seq: 1, type: 'node-planned', node: 'WO-a', kind: 'work-order', title: 'a' },
      { seq: 2, type: 'node-planned', node: 'WO-b', kind: 'work-order', title: 'b' },
    ],
  });
  const r = reconcile(root);
  assert.deepStrictEqual(dispatchOrder(r), ['slice-b', 'slice-a'], 'route.json order preserved exactly, unchanged by this task');
});

// ── malformed goals.json: graceful fallback to route.json, never a crash ─────

check('reconcile: a malformed goals.json falls back to route.json gracefully (no crash)', () => {
  const root = newEffort({
    workOrders: { 'WO-a': { role: 'implementer', verticalSlice: 'slice-a' } },
    specs: { 'WO-a': { verticalSlice: 'slice-a', dependsOn: [] } },
    route: { slices: ['slice-a'], ratifiedAt: null, ledgerSeq: null },
    goals: 'not valid json {{{',
    ledger: [{ seq: 1, type: 'node-planned', node: 'WO-a', kind: 'work-order', title: 'a' }],
  });
  const r = reconcile(root);
  assert.deepStrictEqual(dispatchOrder(r), ['slice-a'], 'falls back to the route path; no throw');
});

// ── notes is always an array (the divergence-surfacing contract, shape-only) ──

check('reconcile: notes is always an array (graphDivergence surfacing never crashes the briefing)', () => {
  const root = newEffort({
    workOrders: { 'WO-a': { role: 'implementer', verticalSlice: 'g-a' } },
    specs: { 'WO-a': { verticalSlice: 'g-a', dependsOn: [] } },
    goals: [{ id: 'g-a', scenario: 'a', scenarioCitations: [] }],
    policy: VALID_POLICY,
    ledger: [{ seq: 1, type: 'node-planned', node: 'WO-a', kind: 'work-order', title: 'a' }],
  });
  const r = reconcile(root);
  assert.ok(Array.isArray(r.notes));
  // KNOWN LIMIT: forcing genuine as-lived/current graph divergence needs a hand-edited contract file
  // outside the ledger-governed pipeline (§2.4's own example) — out of this fixture's cheap reach.
  // T07c should confirm this is a reasonable limit for the red suite, not a skipped requirement.
});

for (const t of tmps) { try { rmSync(t, { recursive: true, force: true }); } catch { /* best effort */ } }

if (process.exitCode) console.error(`\nreconcile-cones-projection: FAILURES above (${passed} passed).`);
else console.log(`\nreconcile-cones-projection: all ${passed} checks passed. ✓`);
```

### Step 2: Run the test to verify it fails for the right reason

Run: `node test/reconcile-cones-projection.test.mjs`

Expected: `FAIL` on the first check — today `reconcile()` always reads `route.json` regardless of
`goals.json`, so `dispatchOrder` follows `route.json`'s `[g-b, g-a]`, which genuinely **disagrees** with
this fixture's expected `['g-a', 'g-b']` (the cone-derived order — g-a's cone is bigger). The other three
checks should currently PASS (they describe today's actual route-path/fallback behavior) — that is fine;
they exist as regression pins for T07b, not RED-by-construction.

### Step 3: Commit

```bash
git add test/reconcile-cones-projection.test.mjs
git commit -m "test(reconcile): lock goals.json/cones selection over route.json, with graceful fallback (red, P7)" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

## Acceptance Criteria
- [ ] `test/reconcile-cones-projection.test.mjs` exists and matches the reconcile I/O harness
      convention exactly
- [ ] The first check's fixture is verified by hand (trace `servesEdges`' walk against the ledger) to
      make route.json's order and the cone-derived order genuinely disagree — confirm before running
- [ ] The regression (no goals.json) and malformed-goals-fallback checks pass against TODAY's code
      (they are not red-by-construction — they pin existing behavior)
- [ ] No file outside Scope modified; `lib/reconcile.mjs` NOT edited
