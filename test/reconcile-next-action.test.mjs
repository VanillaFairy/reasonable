// Standalone wiring test for reconcile() assembling the §7.3 decision projection into
// result.nextAction — real git repo + hand-written ledger + WO specs + route.json. Node builtins only.
// Run: node test/reconcile-next-action.test.mjs
//
// The pure projection (lib/next-action.mjs `projectDirectives`) is table-tested in next-action.test.mjs.
// THIS pins reconcile's impure state assembly: reading route.json, enriching each WO with dependsOn +
// verticalSlice from its SPEC (the journal registry does NOT carry them), and detecting a canceled WO
// via the progress TREE (node-canceled folds to the inert `pending`, so only the tree can tell it from a
// fresh WO). Two properties the spec calls out:
//   • a WO the JOURNAL never registered but the ledger + its spec show still DISPATCHes;
//   • a canceled WO (tree-detected) stays OUT of DISPATCH; and a dependsOn dep that is not `done` gates.

import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
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

// Build a born, active effort. `workOrders` is the journal LANE REGISTRY (no verticalSlice/dependsOn —
// those live only on the specs); `specs` writes each .reasonable/work-orders/<id>.json; `ledger` is the
// raw event array; `route` is route.json's slice order.
function newEffort({ workOrders, specs, ledger, route, currentVerticalSlice = 'slice-1' }) {
  const root = mkdtempSync(join(tmpdir(), 'rna-')); tmps.push(root);
  git(root, 'init', '-q');
  const hooks = join(root, '.nohooks'); mkdirSync(hooks, { recursive: true });
  git(root, 'config', 'core.hooksPath', hooks);
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'user.name', 'Reconcile NextAction Test');
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
  write(root, '.reasonable/ledger.jsonl', ledger.map((e) => JSON.stringify(e)).join('\n') + (ledger.length ? '\n' : ''));
  return root;
}

const dispatchIds = (r) =>
  (r.nextAction || []).filter((d) => d.kind === 'DISPATCH').flatMap((d) => d.workOrders);

// ── 1. a journal-omitted (ledger-only) WO + Correction D (canceled) + dependsOn gating, one effort ──
check('reconcile().nextAction: ledger-only WO DISPATCHes; a canceled WO and an unmet-dep WO do NOT', () => {
  const root = newEffort({
    // Lane REGISTRY: WO-ledger-only is DELIBERATELY absent (the journal never recorded it).
    workOrders: {
      'WO-known': { role: 'implementer', verticalSlice: 'slice-1' },
      'WO-canceled': { role: 'implementer', verticalSlice: 'slice-1' },
      'WO-gated': { role: 'implementer', verticalSlice: 'slice-1' },
    },
    specs: {
      'WO-known': { verticalSlice: 'slice-1', dependsOn: [] },
      'WO-ledger-only': { verticalSlice: 'slice-1', dependsOn: [] },
      'WO-canceled': { verticalSlice: 'slice-1', dependsOn: [] },
      'WO-gated': { verticalSlice: 'slice-1', dependsOn: ['WO-known'] }, // WO-known is pending, not done
    },
    route: { slices: ['slice-1'], ratifiedAt: null, ledgerSeq: null },
    ledger: [
      { seq: 1, type: 'node-planned', node: 'WO-known', kind: 'work-order', title: 'known' },
      { seq: 2, type: 'node-planned', node: 'WO-ledger-only', kind: 'work-order', title: 'ledger only' },
      { seq: 3, type: 'node-planned', node: 'WO-canceled', kind: 'work-order', title: 'to cancel' },
      { seq: 4, type: 'node-canceled', node: 'WO-canceled', workOrder: 'WO-canceled', reason: 'superseded' },
      { seq: 5, type: 'node-planned', node: 'WO-gated', kind: 'work-order', title: 'gated' },
    ],
  });

  const r = reconcile(root);

  assert.equal(r.halt, false, 'sanity: no halt — the active SET should drive');
  assert.ok(Array.isArray(r.nextAction), 'nextAction is an array of directives');

  const dispatched = dispatchIds(r);
  assert.ok(dispatched.includes('WO-ledger-only'),
    'a WO the journal never registered, surfaced from the ledger + its spec, still DISPATCHes under its slice');
  assert.ok(dispatched.includes('WO-known'), 'the journal-registered ready WO dispatches');
  assert.ok(!dispatched.includes('WO-canceled'),
    'Correction D / tree-detected cancel: a canceled WO (fold reads pending) stays OUT of DISPATCH');
  assert.ok(!dispatched.includes('WO-gated'),
    'dependsOn gating: WO-gated waits — its dep WO-known is not done');

  // The DISPATCH is grouped under the spec-declared slice, in routeOrder.
  const disp = (r.nextAction || []).filter((d) => d.kind === 'DISPATCH');
  assert.deepEqual(disp.map((d) => d.slice), ['slice-1']);
  assert.deepEqual(disp[0].workOrders, ['WO-known', 'WO-ledger-only']);
});

// ── 2. once the dep is DONE, the gated WO DISPATCHes (the readiness edge flips at reconcile level) ──
check('reconcile().nextAction: a gated WO DISPATCHes once its dependency folds to done', () => {
  const root = newEffort({
    workOrders: {
      'WO-known': { role: 'implementer', verticalSlice: 'slice-1' },
      'WO-gated': { role: 'implementer', verticalSlice: 'slice-1' },
    },
    specs: {
      'WO-known': { verticalSlice: 'slice-1', dependsOn: [] },
      'WO-gated': { verticalSlice: 'slice-1', dependsOn: ['WO-known'] },
    },
    route: { slices: ['slice-1'] },
    ledger: [
      { seq: 1, type: 'node-planned', node: 'WO-known', kind: 'work-order', title: 'known' },
      { seq: 2, type: 'node-dispatched', node: 'WO-known', kind: 'work-order', attempt: 1 },
      { seq: 3, type: 'node-completed', node: 'WO-known', kind: 'work-order' }, // folds WO-known → done
      { seq: 4, type: 'node-planned', node: 'WO-gated', kind: 'work-order', title: 'gated' },
    ],
  });

  const r = reconcile(root);
  const dispatched = dispatchIds(r);
  assert.ok(!dispatched.includes('WO-known'), 'the done dependency does not re-dispatch');
  assert.ok(dispatched.includes('WO-gated'), 'WO-gated is now ready — its dep is done');
});

// ── 3. forward-compat: NO route.json and specs lacking dependsOn still reconcile + project. ──
check('reconcile().nextAction: pre-route, pre-dependsOn effort still projects WO-level directives', () => {
  const root = newEffort({
    workOrders: { 'WO-1': { role: 'implementer', verticalSlice: 'slice-1' } },
    specs: { 'WO-1': { verticalSlice: 'slice-1' } }, // legacy spec: no dependsOn field
    route: null,                                     // pre-route.json effort
    ledger: [{ seq: 1, type: 'node-planned', node: 'WO-1', kind: 'work-order', title: 'lone' }],
  });

  let r;
  assert.doesNotThrow(() => { r = reconcile(root); }, 'a pre-route / pre-dependsOn effort must still reconcile');
  assert.ok(Array.isArray(r.nextAction), 'nextAction still present');
  assert.ok(dispatchIds(r).includes('WO-1'), 'the lone pending WO dispatches (dependsOn defaulted to [])');
});

for (const t of tmps) { try { rmSync(t, { recursive: true, force: true }); } catch { /* best effort */ } }

if (process.exitCode) console.error(`\nreconcile-next-action: FAILURES above (${passed} passed).`);
else console.log(`\nreconcile-next-action: all ${passed} checks passed. ✓`);
