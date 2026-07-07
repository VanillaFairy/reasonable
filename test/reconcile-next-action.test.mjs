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
import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

import { reconcile, briefing } from '../lib/reconcile.mjs';
import { hashWorkOrder } from '../lib/redispatch-guard.mjs';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
const write = (root, rel, content) => {
  const p = join(root, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, content);
};
const readLedger = (root) => {
  const p = join(root, '.reasonable', 'ledger.jsonl');
  return existsSync(p) ? readFileSync(p, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => JSON.parse(l)) : [];
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

// ── 4. reconcile PERSISTS the projection as a next-action ledger event (per call) + renders it ──
check('reconcile() appends a next-action event carrying result.nextAction + computedFrom; the mirror renders it; one PER CALL', () => {
  const root = newEffort({
    workOrders: { 'WO-1': { role: 'implementer', verticalSlice: 'slice-1' } },
    specs: { 'WO-1': { verticalSlice: 'slice-1', dependsOn: [] } },
    route: { slices: ['slice-1'] },
    ledger: [{ seq: 1, type: 'node-planned', node: 'WO-1', kind: 'work-order', title: 'lone' }],
  });
  const beforeLatestSeq = readLedger(root).reduce((m, e) => Math.max(m, Number(e.seq) || 0), 0); // 1

  const r = reconcile(root);

  const nas = readLedger(root).filter((l) => l.type === 'next-action');
  assert.equal(nas.length, 1, 'reconcile appended exactly one next-action event');
  const na = nas[0];
  assert.deepEqual(na.directives, r.nextAction, 'the event carries result.nextAction verbatim');
  assert.equal(na.computedFrom, beforeLatestSeq, 'computedFrom = the ledger latest seq just before the projection append');
  assert.ok(na.seq > beforeLatestSeq, 'the projection is stamped after the pre-existing events');
  assert.ok(na.ts, 'append() stamped its own ts');

  // The mirror renders the latest projection: progress.json.nextAction (a string) + a ▶ NEXT block.
  const p = JSON.parse(readFileSync(join(root, '.reasonable', 'progress.json'), 'utf8'));
  assert.equal(typeof p.nextAction, 'string', 'progress.json.nextAction is a string');
  assert.match(p.nextAction, /DISPATCH slice slice-1 → WO-1/, 'the DISPATCH projection renders recognizably into the mirror string');
  assert.match(readFileSync(join(root, '.reasonable', 'progress.md'), 'utf8'), /▶ \*\*NEXT\*\*/, 'progress.md carries a ▶ NEXT block');

  // Per-call (§7.1): a SECOND reconcile appends ANOTHER next-action — projections are recorded events,
  // never deduped like the crash-recovery node-downgraded seal.
  reconcile(root);
  assert.equal(readLedger(root).filter((l) => l.type === 'next-action').length, 2, 'reconcile appends one next-action PER CALL');
});

// ── 5. the briefing shows a NEXT line rendering the directive set ──
check('briefing() renders a NEXT line from result.nextAction', () => {
  const root = newEffort({
    workOrders: { 'WO-1': { role: 'implementer', verticalSlice: 'slice-1' } },
    specs: { 'WO-1': { verticalSlice: 'slice-1', dependsOn: [] } },
    route: { slices: ['slice-1'] },
    ledger: [{ seq: 1, type: 'node-planned', node: 'WO-1', kind: 'work-order', title: 'lone' }],
  });
  const text = briefing(reconcile(root));
  assert.match(text, /NEXT: .*DISPATCH slice slice-1 → WO-1/, 'the briefing carries a NEXT line beside Lifecycle');
});

// ── 6. the output self-check (§7.4, S12): a guard-flagged WO is REFUSED (DECIDE), never DISPATCHed ──
// A WO with a node-planned (the fold reads it PENDING — a verdict is Family 3, ignored by wo-status) so the
// projection WOULD DISPATCH it, PLUS a hash-matched refutation-surviving infeasibility verdict. The gap the
// self-check closes: the fold/projection alone would resurrect a confirmed dead end; the self-check refuses
// it with the SAME redispatch-guard predicate (redispatchBlock) and downgrades it to a DECIDE — BEFORE the
// projection is persisted, so the next-action event never records a DISPATCH of the flagged WO.
check('reconcile().nextAction: a hash-matched dead-ended WO is refused (DECIDE), never DISPATCHed; the persisted event carries the DECIDE', () => {
  const spec = { verticalSlice: 'slice-1', dependsOn: [] };
  const root = newEffort({
    workOrders: { 'WO-dead': { role: 'implementer', verticalSlice: 'slice-1' } },
    specs: { 'WO-dead': spec },
    route: { slices: ['slice-1'] },
    ledger: [{ seq: 1, type: 'node-planned', node: 'WO-dead', kind: 'work-order', title: 'infeasible' }],
  });
  // The verdict's `hash` must equal the WO's CURRENT input hash for the guard to bind (Defect B) — compute
  // it the same way the guard does. (The id does not enter the hash; hashWorkOrder folds gate + spec +
  // contracts only.) A bare spec (no gate/inputs/contracts) hashes the empty string, deterministically.
  const hash = hashWorkOrder(root, spec);
  appendFileSync(join(root, '.reasonable', 'ledger.jsonl'),
    JSON.stringify({ seq: 2, type: 'verdict', workOrder: 'WO-dead', kind: 'infeasible', survivedSkeptic: true, hash }) + '\n');

  const r = reconcile(root);
  assert.ok(!dispatchIds(r).includes('WO-dead'),
    'a redispatch-guard-flagged (dead-ended) WO is NEVER DISPATCHed — the self-check refuses it');
  const decides = (r.nextAction || []).filter((d) => d.kind === 'DECIDE');
  assert.ok(decides.some((d) => /WO-dead/.test(d.detail || '')),
    'the refused DISPATCH is downgraded to a DECIDE naming WO-dead (S12: dead-end/drop authoritative over the on-disk spec)');
  // The self-check runs BEFORE the persist: the next-action event carries the DECIDE, not a DISPATCH.
  const na = readLedger(root).filter((l) => l.type === 'next-action').pop();
  assert.ok(na && Array.isArray(na.directives) && na.directives.some((d) => d.kind === 'DECIDE' && /WO-dead/.test(d.detail || '')),
    'the PERSISTED next-action event carries the self-checked DECIDE, never a DISPATCH of the flagged WO');
  assert.ok(!na.directives.some((d) => d.kind === 'DISPATCH' && (d.workOrders || []).includes('WO-dead')),
    'no persisted DISPATCH names the flagged WO');
  assert.ok((r.notes || []).some((n) => /self-check refused/.test(n) && /WO-dead/.test(n)),
    'reconcile surfaces a self-check refusal note');
});

for (const t of tmps) { try { rmSync(t, { recursive: true, force: true }); } catch { /* best effort */ } }

if (process.exitCode) console.error(`\nreconcile-next-action: FAILURES above (${passed} passed).`);
else console.log(`\nreconcile-next-action: all ${passed} checks passed. ✓`);
