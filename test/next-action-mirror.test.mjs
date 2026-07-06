// Standalone test for the §7.1 next-action MIRROR RENDER (T2.3): progress-map.mjs re-derives the
// LATEST `next-action` ledger event into progress.json.nextAction + a ▶ NEXT block in progress.md, so
// the directive SURVIVES the wholesale mirror regen by construction. Node builtins only, no git needed
// (writeMirror / append use fs only). Run: node test/next-action-mirror.test.mjs
//
// The crux is the regen-clobber regression: a NON-next-action append (regen:true) rebuilds the whole
// mirror from the ledger — the NEXT block must be re-rendered, never erased, and the mechanical
// staleness K must increment. That is the whole point of persisting the projection in the ledger
// rather than poking it into progress.json (which the next regen would overwrite).

import assert from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { append } from '../lib/ledger.mjs';
import { writeMirror, buildTree } from '../lib/progress-map.mjs';

const tmps = [];

function newEffort(events = []) {
  const root = mkdtempSync(join(tmpdir(), 'na-mirror-')); tmps.push(root);
  mkdirSync(join(root, '.reasonable'), { recursive: true });
  seedLedger(root, events);
  return root;
}
function seedLedger(root, events) {
  const body = events.map((e) => JSON.stringify(e)).join('\n') + (events.length ? '\n' : '');
  writeFileSync(join(root, '.reasonable', 'ledger.jsonl'), body);
}
function readProgressJson(root) {
  const p = join(root, '.reasonable', 'progress.json');
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null;
}
function readProgressMd(root) {
  const p = join(root, '.reasonable', 'progress.md');
  return existsSync(p) ? readFileSync(p, 'utf8') : '';
}

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.stack || e.message}`); process.exitCode = 1; }
}

// ── 1. the render carries the directives + fresh (K=0) ───────────────────────────────────────────
check('writeMirror renders the latest next-action into progress.json.nextAction + a ▶ NEXT block', () => {
  const root = newEffort([
    { seq: 1, type: 'node-planned', node: 'WO-1', kind: 'work-order', title: 'wire' },
    { seq: 2, type: 'node-dispatched', node: 'WO-1', kind: 'work-order', attempt: 1 },
    { seq: 3, type: 'next-action', computedFrom: 2, directives: [
      { kind: 'DISPATCH', slice: 'expr-eval', workOrders: ['WO-12', 'WO-13'] },
      { kind: 'RUNNING', workOrders: ['WO-1'] },
    ] },
  ]);

  writeMirror(root);
  const p = readProgressJson(root);
  assert.equal(typeof p.nextAction, 'string', 'progress.json.nextAction is a string');
  assert.match(p.nextAction, /DISPATCH slice expr-eval → WO-12, WO-13/, 'the DISPATCH directive renders recognizably');
  assert.match(p.nextAction, /RUNNING WO-1/, 'the RUNNING directive renders recognizably');
  assert.match(p.nextAction, /computed at seq 2/, 'the staleness suffix names computedFrom');
  assert.match(p.nextAction, /fresh/, 'K === 0 right after projection → fresh (no non-next-action event past computedFrom)');

  const md = readProgressMd(root);
  assert.match(md, /▶ \*\*NEXT\*\*/, 'progress.md carries a ▶ NEXT block');
  assert.match(md, /DISPATCH slice expr-eval → WO-12, WO-13/, 'the NEXT block carries the directives');
});

// ── 2. THE CRUX — regen-clobber regression (§9): a NON-next-action append re-renders, never erases ─
check('a subsequent non-next-action append RE-RENDERS the NEXT block (survives regen) and increments K', () => {
  const root = newEffort([
    { seq: 1, type: 'node-planned', node: 'WO-1', kind: 'work-order', title: 'wire' },
    { seq: 2, type: 'node-dispatched', node: 'WO-1', kind: 'work-order', attempt: 1 },
    { seq: 3, type: 'next-action', computedFrom: 2, directives: [{ kind: 'RUNNING', workOrders: ['WO-1'] }] },
  ]);
  writeMirror(root);
  assert.match(readProgressJson(root).nextAction, /RUNNING WO-1 — computed at seq 2, fresh/, 'baseline: NEXT present, fresh');

  // A NON-next-action event with regen:true → the mirror is rebuilt WHOLESALE from the ledger.
  const r = append(root, { type: 'node-checkpointed', node: 'WO-1' }, { regen: true });
  assert.equal(r.ok, true, 'the checkpoint append succeeded');

  const p = readProgressJson(root);
  assert.equal(typeof p.nextAction, 'string', 'the NEXT projection SURVIVED the wholesale regen (re-derived from the ledger, not clobbered)');
  assert.match(p.nextAction, /RUNNING WO-1/, 'still the same latest directive');
  assert.match(p.nextAction, /computed at seq 2, 1 event\(s\) since/, 'K incremented by 1 — one non-next-action event (the checkpoint) landed past computedFrom');
  assert.match(readProgressMd(root), /▶ \*\*NEXT\*\*/, 'the ▶ NEXT block is still present in progress.md');
});

// ── 3. latest-next-action-wins ───────────────────────────────────────────────────────────────────
check('two next-action events → the mirror renders the LATEST only', () => {
  const root = newEffort([
    { seq: 1, type: 'node-planned', node: 'WO-1', kind: 'work-order', title: 'wire' },
    { seq: 2, type: 'node-dispatched', node: 'WO-1', kind: 'work-order', attempt: 1 },
    { seq: 3, type: 'next-action', computedFrom: 2, directives: [{ kind: 'RUNNING', workOrders: ['WO-1'] }] },
    { seq: 4, type: 'node-checkpointed', node: 'WO-1' },
    { seq: 5, type: 'next-action', computedFrom: 4, directives: [{ kind: 'DISPATCH', slice: 's1', workOrders: ['WO-2'] }] },
  ]);
  writeMirror(root);
  const p = readProgressJson(root);
  assert.match(p.nextAction, /DISPATCH slice s1 → WO-2/, 'the LATEST (seq 5) directive renders');
  assert.doesNotMatch(p.nextAction, /RUNNING WO-1/, 'the earlier (seq 3) directive is NOT rendered');
  assert.match(p.nextAction, /computed at seq 4/, 'the staleness anchor is the LATEST event\'s computedFrom');
});

// ── 4. the K counter: only non-next-action events past computedFrom; a later next-action never inflates K
check('K counts only non-next-action events after computedFrom; a sibling next-action does not inflate it', () => {
  const root = newEffort([
    { seq: 1, type: 'node-planned', node: 'WO-1', kind: 'work-order', title: 'wire' },   // non-NA, seq>0
    { seq: 2, type: 'node-dispatched', node: 'WO-1', kind: 'work-order', attempt: 1 },   // non-NA, seq>1
    { seq: 3, type: 'next-action', computedFrom: 5, directives: [{ kind: 'RUNNING', workOrders: ['WO-1'] }] }, // an OLDER NA
    { seq: 4, type: 'next-action', computedFrom: 1, directives: [{ kind: 'DISPATCH', slice: 's1', workOrders: ['WO-2'] }] }, // LATEST NA, computedFrom 1
    { seq: 5, type: 'node-checkpointed', node: 'WO-1' },                                  // non-NA, seq>1
  ]);
  writeMirror(root);
  const p = readProgressJson(root);
  // Latest NA is seq 4 (computedFrom 1). Non-next-action events with seq > 1: seq 2 and seq 5 → K = 2.
  // The seq-3 next-action (also seq > 1) must NOT count toward K.
  assert.match(p.nextAction, /DISPATCH slice s1 → WO-2/, 'the latest NA (seq 4) is the one rendered');
  assert.match(p.nextAction, /computed at seq 1, 2 event\(s\) since/, 'K = 2 (seq 2 + seq 5); the seq-3 next-action is excluded');
});

// ── 5. no next-action event → the key + the block are omitted (session-start falls back) ─────────
check('no next-action event in the ledger → progress.json.nextAction omitted and no ▶ NEXT block', () => {
  const root = newEffort([
    { seq: 1, type: 'node-planned', node: 'WO-1', kind: 'work-order', title: 'wire' },
    { seq: 2, type: 'node-dispatched', node: 'WO-1', kind: 'work-order', attempt: 1 },
  ]);
  writeMirror(root);
  const p = readProgressJson(root);
  assert.equal(Object.hasOwn(p, 'nextAction'), false, 'the nextAction key is omitted when no projection exists');
  assert.doesNotMatch(readProgressMd(root), /▶ \*\*NEXT\*\*/, 'no ▶ NEXT block without a projection');
});

// ── 6. empty-ledger projection (no computedFrom) renders "computed at seq 0, fresh" ──────────────
check('a next-action with no computedFrom (empty-ledger projection) renders "computed at seq 0"', () => {
  const root = newEffort([
    { seq: 1, type: 'next-action', directives: [{ kind: 'LAND' }] }, // computedFrom OMITTED
  ]);
  writeMirror(root);
  assert.match(readProgressJson(root).nextAction, /LAND — computed at seq 0, fresh/,
    'absent computedFrom defaults to seq 0; K = 0 (no non-next-action event past 0)');
});

// ── 7. EVENT_MAP no-op: a next-action produces NO tree op (no spurious legacyFallback note) ──────
check('a next-action event maps to NO tree op (no spurious note on the root)', () => {
  const root = newEffort([
    { seq: 1, type: 'next-action', computedFrom: 1, directives: [{ kind: 'LAND' }] },
  ]);
  const tree = buildTree(root);
  assert.equal(tree.children.length, 0, 'no tree node was created for the projection');
  assert.equal(tree.notes.length, 0, 'no note landed on the root — the []-entry keeps it off legacyFallback');
});

// ── 8. empty directive set renders "(idle)" ─────────────────────────────────────────────────────
check('an empty directive set renders "(idle)"', () => {
  const root = newEffort([
    { seq: 1, type: 'node-planned', node: 'WO-1', kind: 'work-order', title: 'wire' },
    { seq: 2, type: 'next-action', computedFrom: 1, directives: [] },
  ]);
  writeMirror(root);
  assert.match(readProgressJson(root).nextAction, /\(idle\) — computed at seq 1, fresh/, 'empty set → (idle)');
});

for (const t of tmps) { try { rmSync(t, { recursive: true, force: true }); } catch { /* best effort */ } }

if (process.exitCode) console.error(`\nnext-action-mirror: FAILURES above (${passed} passed).`);
else console.log(`\nnext-action-mirror: all ${passed} checks passed. ✓`);
