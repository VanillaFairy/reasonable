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

// ── goals.json absent: route.json is RETIRED (T08 cutover) — no slice ordering, first-seen fallback ──

check('reconcile: with NO goals.json, there is no slice ordering (route.json retired) — DISPATCH falls to first-seen WO order', () => {
  const root = newEffort({
    workOrders: { 'WO-a': { role: 'implementer', verticalSlice: 'slice-a' }, 'WO-b': { role: 'implementer', verticalSlice: 'slice-b' } },
    specs: {
      'WO-a': { verticalSlice: 'slice-a', dependsOn: [] },
      'WO-b': { verticalSlice: 'slice-b', dependsOn: [] },
    },
    // A route.json is seeded but DELIBERATELY IGNORED post-cutover (T08): route.json is retired, so its
    // [slice-b, slice-a] order has no effect. With no goals.json, routeOrder is null and DISPATCH emits
    // in first-seen WO order (WO-a before WO-b → slice-a before slice-b).
    route: { slices: ['slice-b', 'slice-a'], ratifiedAt: null, ledgerSeq: null },
    ledger: [
      { seq: 1, type: 'node-planned', node: 'WO-a', kind: 'work-order', title: 'a' },
      { seq: 2, type: 'node-planned', node: 'WO-b', kind: 'work-order', title: 'b' },
    ],
  });
  const r = reconcile(root);
  assert.deepStrictEqual(dispatchOrder(r), ['slice-a', 'slice-b'], 'route.json is retired — first-seen WO order governs, NOT route.json\'s [slice-b, slice-a]');
});

// ── malformed goals.json: no route fallback anymore (T08 cutover) — degrades, never crashes ─────

check('reconcile: a malformed goals.json degrades gracefully (no slice ordering, no crash) — route.json is retired', () => {
  const root = newEffort({
    workOrders: { 'WO-a': { role: 'implementer', verticalSlice: 'slice-a' } },
    specs: { 'WO-a': { verticalSlice: 'slice-a', dependsOn: [] } },
    // route.json seeded but ignored (retired). A malformed goals.json → routeOrder null + a diagnostic
    // note; the single ready WO still DISPATCHes in first-seen order. The point is graceful degradation,
    // not a fallback to route.json (there is none anymore).
    route: { slices: ['slice-a'], ratifiedAt: null, ledgerSeq: null },
    goals: 'not valid json {{{',
    ledger: [{ seq: 1, type: 'node-planned', node: 'WO-a', kind: 'work-order', title: 'a' }],
  });
  const r = reconcile(root);
  assert.deepStrictEqual(dispatchOrder(r), ['slice-a'], 'degrades to first-seen order; no throw, no route fallback');
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
