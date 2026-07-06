// Standalone test for lib/next-action.mjs `projectDirectives` — PURE, no git, no fs.
// Run: node test/next-action.test.mjs
//
// Pins the §7.3 decision-projection table: projectDirectives(state) turns a fully-reconciled effort
// state into an ORDERED SET of directives (a set, not a scalar — parallel work surfaces together).
// Every fixture here is a hand-built `state` object (no I/O) so the projection stays deterministic and
// table-testable. reconcile() is what assembles the real `state` (see reconcile-next-action.test.mjs);
// this file exercises the pure projection in isolation.
//
// Directive = { kind, slice?, workOrders?, workOrder?, detail? }
//   kind ∈ 'HALT'|'AMBIGUOUS'|'DECIDE'|'RUNNING'|'DISPATCH'|'RETRO'|'OPEN'|'LAND'|'CONCLUDE'|'DONE'

import assert from 'node:assert';
import { projectDirectives } from '../lib/next-action.mjs';

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.stack || e.message}`); process.exitCode = 1; }
}

// ── fixture builders ────────────────────────────────────────────────────────────────────
function st(overrides = {}) {
  return {
    halt: false, haltReason: null, ambiguities: [],
    openInbox: [], lifecycle: 'active', routeOrder: null,
    workOrders: [], slices: [],
    ...overrides,
  };
}
function wo(id, o = {}) {
  return {
    id,
    slice: o.slice ?? null,
    status: o.status ?? 'pending',
    dependsOn: o.dependsOn ?? [],
    terminal: o.terminal ?? false,
    blocked: o.blocked ?? false,
    canceled: o.canceled ?? false,
    running: o.running ?? false,
  };
}
const kinds = (ds) => ds.map((d) => d.kind);
const byKind = (ds, k) => ds.filter((d) => d.kind === k);

// ── 1. GLOBAL first-match precedence: AMBIGUOUS > HALT > breaking-inbox-DECIDE > lifecycle ──

check('halt with ambiguities → single AMBIGUOUS (wins over active dispatchable work)', () => {
  const ds = projectDirectives(st({
    halt: true, haltReason: 'two lanes claim work order WO-1',
    ambiguities: [{ haltReason: 'two lanes claim work order WO-1' }],
    lifecycle: 'active',
    workOrders: [wo('WO-1', { status: 'pending' })], // would DISPATCH but must be suppressed
  }));
  assert.deepEqual(ds, [{ kind: 'AMBIGUOUS', detail: 'two lanes claim work order WO-1' }]);
});

check('halt with NO ambiguities (floor-integrity STOP) → single HALT', () => {
  const ds = projectDirectives(st({
    halt: true, haltReason: 'unexplained floor-integrity breach in autonomous mode — STOP (D13)',
    ambiguities: [],
    lifecycle: 'active',
    workOrders: [wo('WO-1', { status: 'pending' })],
  }));
  assert.deepEqual(ds, [{ kind: 'HALT', detail: 'unexplained floor-integrity breach in autonomous mode — STOP (D13)' }]);
});

check('a breaking openInbox item (no halt) → single DECIDE naming its kind (beats lifecycle dispatch)', () => {
  const ds = projectDirectives(st({
    openInbox: [{ kind: 'ripple-escalation', breaking: true }],
    lifecycle: 'active',
    workOrders: [wo('WO-1', { status: 'pending' })],
  }));
  assert.deepEqual(ds, [{ kind: 'DECIDE', detail: 'inbox: ripple-escalation' }]);
});

check('a NON-breaking openInbox item does NOT short-circuit — lifecycle drives on', () => {
  const ds = projectDirectives(st({
    openInbox: [{ kind: 'advisory', breaking: false }],
    lifecycle: 'active',
    workOrders: [wo('WO-1', { status: 'pending', slice: 's1' })],
    routeOrder: ['s1'],
  }));
  assert.deepEqual(kinds(ds), ['DISPATCH']);
});

// ── 2. lifecycle terminal states ────────────────────────────────────────────────────────

check('lifecycle at-land-gate → [LAND]', () => {
  assert.deepEqual(projectDirectives(st({ lifecycle: 'at-land-gate' })), [{ kind: 'LAND' }]);
});

check('lifecycle half-concluded → [CONCLUDE]', () => {
  assert.deepEqual(projectDirectives(st({ lifecycle: 'half-concluded' })), [{ kind: 'CONCLUDE' }]);
});

// ── 3. the active SET — parallel-dispatch property (§7.3) ────────────────────────────────

check('mixed RUNNING + DISPATCH: live work and separately-ready work BOTH surface', () => {
  const ds = projectDirectives(st({
    lifecycle: 'active',
    routeOrder: ['s1'],
    workOrders: [
      wo('WO-run', { status: 'running', running: true, slice: 's1' }),
      wo('WO-ready', { status: 'pending', slice: 's1' }),
    ],
  }));
  assert.deepEqual(kinds(ds), ['RUNNING', 'DISPATCH']);
  assert.deepEqual(byKind(ds, 'RUNNING')[0].workOrders, ['WO-run']);
  assert.deepEqual(byKind(ds, 'DISPATCH')[0], { kind: 'DISPATCH', slice: 's1', workOrders: ['WO-ready'] });
});

check('every running WO collects into ONE RUNNING directive', () => {
  const ds = projectDirectives(st({
    lifecycle: 'active',
    workOrders: [
      wo('WO-a', { status: 'running', running: true }),
      wo('WO-b', { status: 'running', running: true }),
    ],
  }));
  assert.deepEqual(byKind(ds, 'RUNNING'), [{ kind: 'RUNNING', workOrders: ['WO-a', 'WO-b'] }]);
});

check('DECIDE + DISPATCH: a blocked WO beside a ready one — both surface, DECIDE first', () => {
  const ds = projectDirectives(st({
    lifecycle: 'active',
    routeOrder: ['s1'],
    workOrders: [
      wo('WO-blocked', { status: 'blocked', blocked: true, slice: 's1' }),
      wo('WO-ready', { status: 'pending', slice: 's1' }),
    ],
  }));
  assert.deepEqual(kinds(ds), ['DECIDE', 'DISPATCH']);
  assert.deepEqual(byKind(ds, 'DECIDE')[0], { kind: 'DECIDE', workOrder: 'WO-blocked' });
  assert.deepEqual(byKind(ds, 'DISPATCH')[0].workOrders, ['WO-ready']);
});

check('DISPATCH groups ready WOs by slice, emitted in routeOrder', () => {
  const ds = projectDirectives(st({
    lifecycle: 'active',
    routeOrder: ['s1', 's2'],
    workOrders: [
      wo('WO-2', { status: 'pending', slice: 's2' }),
      wo('WO-1a', { status: 'pending', slice: 's1' }),
      wo('WO-1b', { status: 'pending', slice: 's1' }),
    ],
  }));
  const disp = byKind(ds, 'DISPATCH');
  assert.deepEqual(disp.map((d) => d.slice), ['s1', 's2'], 'slices emitted in routeOrder, not WO order');
  assert.deepEqual(disp[0].workOrders, ['WO-1a', 'WO-1b']);
  assert.deepEqual(disp[1].workOrders, ['WO-2']);
});

// ── 4. the readiness predicate — Corrections C + D (pinned exactly) ──────────────────────

check('dependsOn gating: a WO whose dep is not `done` does NOT DISPATCH', () => {
  const ds = projectDirectives(st({
    lifecycle: 'active',
    routeOrder: ['s1'],
    workOrders: [
      wo('WO-dep', { status: 'pending', slice: 's1' }),               // dependency, still pending
      wo('WO-b', { status: 'pending', slice: 's1', dependsOn: ['WO-dep'] }),
    ],
  }));
  const dispatched = byKind(ds, 'DISPATCH').flatMap((d) => d.workOrders);
  assert.ok(dispatched.includes('WO-dep'), 'the dependency itself is ready and dispatches');
  assert.ok(!dispatched.includes('WO-b'), 'WO-b is gated: its dep is not done');
});

check('dependsOn gating: WO becomes DISPATCH once its dep is `done`', () => {
  const ds = projectDirectives(st({
    lifecycle: 'active',
    routeOrder: ['s1'],
    workOrders: [
      wo('WO-dep', { status: 'done', terminal: true, slice: 's1' }),
      wo('WO-b', { status: 'pending', slice: 's1', dependsOn: ['WO-dep'] }),
    ],
  }));
  const dispatched = byKind(ds, 'DISPATCH').flatMap((d) => d.workOrders);
  assert.deepEqual(dispatched, ['WO-b'], 'the done dep does not re-dispatch; WO-b now dispatches');
});

check('Correction D: a WO whose dep is CANCELED stays out of DISPATCH (canceled dep is terminal-abandoned)', () => {
  const ds = projectDirectives(st({
    lifecycle: 'active',
    routeOrder: ['s1'],
    workOrders: [
      // A canceled WO folds to status `pending` (the fold) but carries canceled:true (tree-derived);
      // its status is NOT `done`, so any dependent stays gated.
      wo('WO-c', { status: 'pending', canceled: true, terminal: true, slice: 's1' }),
      wo('WO-b', { status: 'pending', slice: 's1', dependsOn: ['WO-c'] }),
    ],
  }));
  const dispatched = byKind(ds, 'DISPATCH').flatMap((d) => d.workOrders);
  assert.ok(!dispatched.includes('WO-c'), 'the canceled WO itself never dispatches');
  assert.ok(!dispatched.includes('WO-b'), 'Correction D: a canceled dep leaves the dependent not ready');
});

check('a WO that is itself canceled stays out of DISPATCH even with no deps', () => {
  const ds = projectDirectives(st({
    lifecycle: 'active',
    routeOrder: ['s1'],
    workOrders: [wo('WO-c', { status: 'pending', canceled: true, terminal: true, slice: 's1' })],
  }));
  assert.ok(!byKind(ds, 'DISPATCH').flatMap((d) => d.workOrders).includes('WO-c'));
});

check('a WO with a MISSING dep (not present in state) is not ready', () => {
  const ds = projectDirectives(st({
    lifecycle: 'active',
    routeOrder: ['s1'],
    workOrders: [wo('WO-b', { status: 'pending', slice: 's1', dependsOn: ['WO-ghost'] })],
  }));
  assert.deepEqual(byKind(ds, 'DISPATCH'), []);
});

// ── 5. RETRO / OPEN (derived from journal position) ──────────────────────────────────────

check('a slice all-done but not retro-passed → RETRO', () => {
  const ds = projectDirectives(st({
    lifecycle: 'active',
    routeOrder: ['s1', 's2'],
    workOrders: [
      wo('WO-1', { status: 'done', terminal: true, slice: 's1' }),
      wo('WO-2', { status: 'pending', slice: 's2' }),
    ],
    slices: [
      { id: 's1', woIds: ['WO-1'], allDone: true, retroDone: false },  // current, finished → retro it
      { id: 's2', woIds: ['WO-2'], allDone: false, retroDone: false },
    ],
  }));
  assert.deepEqual(byKind(ds, 'RETRO'), [{ kind: 'RETRO', slice: 's1' }]);
  assert.deepEqual(byKind(ds, 'DISPATCH')[0].slice, 's2');
});

check('a retro-passed slice whose successor has NO planned WOs → OPEN the successor', () => {
  const ds = projectDirectives(st({
    lifecycle: 'active',
    routeOrder: ['s1', 's2', 's3'],
    workOrders: [
      wo('WO-1', { status: 'done', terminal: true, slice: 's1' }),
      wo('WO-3', { status: 'pending', slice: 's3' }), // s3 keeps the frontier open
    ],
    slices: [
      { id: 's1', woIds: ['WO-1'], allDone: true, retroDone: true },  // retro passed
      { id: 's2', woIds: [], allDone: false, retroDone: false },      // successor of s1, unplanned
      { id: 's3', woIds: ['WO-3'], allDone: false, retroDone: false },
    ],
  }));
  assert.deepEqual(byKind(ds, 'OPEN'), [{ kind: 'OPEN', slice: 's2' }]);
  assert.deepEqual(byKind(ds, 'RETRO'), [], 'a retro-passed slice does not re-RETRO');
});

check('no slices digest (routeOrder-underivable) → RETRO/OPEN omitted, WO-level still emitted', () => {
  const ds = projectDirectives(st({
    lifecycle: 'active',
    routeOrder: null,
    workOrders: [wo('WO-1', { status: 'pending', slice: 's1' })],
    slices: [],
  }));
  assert.deepEqual(kinds(ds), ['DISPATCH'], 'a null-slice fallback: WO still dispatches, no RETRO/OPEN guessed');
});

// ── 6. all-terminal → DONE ───────────────────────────────────────────────────────────────

check('every known WO terminal and nothing to do → [DONE]', () => {
  const ds = projectDirectives(st({
    lifecycle: 'active', // dropped WOs keep the frontier "open" yet nothing is actionable
    workOrders: [
      wo('WO-1', { status: 'done', terminal: true }),
      wo('WO-2', { status: 'dropped', terminal: true }),
      wo('WO-3', { status: 'pending', canceled: true, terminal: true }),
    ],
  }));
  assert.deepEqual(ds, [{ kind: 'DONE' }]);
});

check('an effort with NO work orders is NOT DONE (empty set, nothing to project)', () => {
  const ds = projectDirectives(st({ lifecycle: 'active', workOrders: [], slices: [] }));
  assert.deepEqual(ds, [], 'vacuous all-terminal must not read as DONE');
});

// ── 7. totality / conservative input handling ────────────────────────────────────────────

check('projectDirectives tolerates a sparse/garbage state without throwing', () => {
  assert.doesNotThrow(() => projectDirectives({}));
  assert.doesNotThrow(() => projectDirectives(undefined));
  assert.deepEqual(projectDirectives({ lifecycle: 'active' }), []);
});

if (process.exitCode) console.error(`\nnext-action: FAILURES above (${passed} passed).`);
else console.log(`\nnext-action: all ${passed} checks passed. ✓`);
