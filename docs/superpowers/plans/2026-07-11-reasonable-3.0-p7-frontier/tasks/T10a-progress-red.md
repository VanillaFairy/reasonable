# Task T10a: live-view fold tests (red)

**Role:** `red` — you write ONLY the one failing test file below. Do NOT modify `lib/progress-map.mjs`.

> **Grounding note — read before writing anything.** `EVENT_MAP` handlers are **stateless, one-event
> functions** by explicit design (`progress-map.mjs`'s own header comment: "this table does no
> stamping, no resolution, pure interpretation"). A bare `atom-transitioned` event carries only
> `{atomId, from, to}` — **not** `component` — so it CANNOT be injected at a `containmentTree`-nested
> path; `../shared/interfaces.md` §6's grounding correction pins the real, buildable design: **every
> atom node is injected FLAT, keyed by `atomId` as the top-level path segment** (e.g. `path: 'a-1'`, a
> direct child of the tree root). This still satisfies "aggregation by id, never double-counted" — the
> id IS the path, and ids are never reused.

## References
- Read: `../shared/interfaces.md` §6 **in full** (the corrected, flat-path design — do not test against
  a nested-containment expectation, it is explicitly out of scope), `../shared/conventions.md`
- Read: `../knowledge/running-tests.md`
- Read: `lib/progress-map.mjs` **in full** — `EVENT_MAP`'s existing entries (the `(e) => TreeOp[]`
  shape), `foldEvents(events, rootLabel)` (the pure fold you test — no filesystem needed)
- Read: `lib/progress-tree.mjs`'s `STATUSES` (`['pending','active','done','failed','panic','canceled']`
  — only six values; a lifecycle state must MAP onto one of these), `findByPath`, `displayStatus`
- Read: `lib/atom.mjs`'s `LIFECYCLE_TRANSITIONS` (the ten states you are mapping)
- Read: `test/progress-map.test.mjs` **in full** — copy its exact harness (`foldEvents(events, 'demo')`
  + `findByPath`/`displayStatus` inspection, **no filesystem**, no `.reasonable/` — this is a pure fold
  test)

## Dependencies
- Depends on: T04b (the `atom-verdict`/`phase-degenerated` event types must be registered in
  `EVENT_SCHEMAS` for these to be realistic fixtures, though `foldEvents` itself does not validate
  against schemas — it folds whatever array you hand it)
- Depended on by: T10b (implements against these locked tests), T10c (audits them)

## Scope
**Files:**
- Create: `test/progress-map-atoms.test.mjs`

**BOUNDARY — you MUST NOT modify any files outside this list. In particular, do NOT edit
`lib/progress-map.mjs` or `lib/progress-tree.mjs`.**

## Positive Constraints (DO)
- Import `{ foldEvents }` from `../lib/progress-map.mjs` (already exported — this is an EXTEND task,
  not a new-module task, so there is no module-load RED here) and `{ findByPath, displayStatus }` from
  `../lib/progress-tree.mjs`.
- Cover **`atom-chartered`** → the tree gains a node at `path: 'a-1'`, status `'pending'`, label
  reflecting `e.purpose`.
- Cover **`atom-delta-authored`**/**`delta-enrichment`** → a note is added to `a-1` (assert via
  `findByPath(tree, 'a-1').notes` containing text that mentions "delta").
- Cover **`atom-transitioned`** → status reflects `e.to` through the pinned lifecycle→tree-status map:
  test at least `chartered→pending`, `"spec'd"→active`, `merged→done`, `retired→canceled`. Use
  `displayStatus` to read the resolved status (the node's DERIVED status, matching how every other
  Family-1 test in `test/progress-map.test.mjs` reads it).
- Cover **`atom-flag-set`**/**`atom-flag-cleared`** → a note is added naming the flag (e.g. `'frozen'`)
  and the op (`'set'`/`'clear'`).
- Cover **`atom-verdict`** → a note is added naming the verdict `kind`.
- Cover **`phase-degenerated`** → a node is injected at `` `phase/${e.phase}` `` (e.g. `'phase/scaffold'`)
  — assert it exists and its label/note reflects "ran and found nothing" / the degeneracy reason
  (mirrors §5.4: a reviewer must see a phase that ran, not a silent skip).
- Cover **id-stability across a sequence**: chart → transition → transition again — assert there is
  still exactly ONE node at `path: 'a-1'` (no duplicate/second node created), proving aggregation by id.
- Cover **an unmapped event type still degrades to a plain note** (regression — confirm `foldEvents`'s
  existing `legacyFallback` behavior is untouched by your new entries).

## Negative Constraints (DO NOT)
- Do NOT implement the new `EVENT_MAP` entries.
- Do NOT assert a nested/containment-derived path for any atom event — flat `atomId` paths only (see
  the grounding note).
- Do NOT touch the filesystem — `foldEvents` is pure; build event arrays by hand.
- Do NOT modify any file outside Scope.

## Implementation Steps

### Step 1: Write `test/progress-map-atoms.test.mjs`

```js
// test/progress-map-atoms.test.mjs — the 3.0 atom / verdict / degeneration events folded into the
// progress tree (DESIGN-3.0 §8; reasonable 3.0 Part 7, interfaces.md §6). EVENT_MAP handlers stay
// stateless (progress-map.mjs's own invariant) — every atom node is injected FLAT, keyed by atomId
// (the interfaces.md §6 grounding correction), never at a containment-nested path. Pure fold, zero I/O.

import assert from 'node:assert';
import { foldEvents } from '../lib/progress-map.mjs';
import { findByPath, displayStatus } from '../lib/progress-tree.mjs';

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.stack || e.message}`); process.exitCode = 1; }
}

// ── atom-chartered ───────────────────────────────────────────────────────────

check('atom-chartered injects a pending node at the FLAT atomId path', () => {
  const tree = foldEvents([
    { seq: 1, type: 'atom-chartered', atomId: 'a-1', component: 'lexer', purpose: 'tokenize input', ts: '2026-07-11T00:00:00Z' },
  ], 'demo');
  const found = findByPath(tree, 'a-1');
  assert.ok(found, 'a-1 exists as a direct child of root');
  assert.strictEqual(displayStatus(found.node), 'pending');
});

// ── atom-delta-authored / delta-enrichment ────────────────────────────────────

check('atom-delta-authored adds a note to the atom node', () => {
  const tree = foldEvents([
    { seq: 1, type: 'atom-chartered', atomId: 'a-1', component: 'lexer', purpose: 'x', ts: '2026-07-11T00:00:00Z' },
    { seq: 2, type: 'atom-delta-authored', atomId: 'a-1', clauses: [{ clauseId: 'lexer#c1' }], ts: '2026-07-11T00:01:00Z' },
  ], 'demo');
  const found = findByPath(tree, 'a-1');
  assert.ok(found.node.notes.some((n) => /delta/i.test(n.text)));
});

check('delta-enrichment also adds a note to the atom node', () => {
  const tree = foldEvents([
    { seq: 1, type: 'atom-chartered', atomId: 'a-1', component: 'lexer', purpose: 'x', ts: '2026-07-11T00:00:00Z' },
    { seq: 2, type: 'delta-enrichment', atomId: 'a-1', clause: { clauseId: 'lexer#c2' }, ts: '2026-07-11T00:02:00Z' },
  ], 'demo');
  const found = findByPath(tree, 'a-1');
  assert.ok(found.node.notes.some((n) => /delta/i.test(n.text)));
});

// ── atom-transitioned: the lifecycle -> tree-status map ───────────────────────

check('atom-transitioned to "chartered"-adjacent states maps to pending/active/done/canceled correctly', () => {
  function transitionedStatus(to) {
    const tree = foldEvents([
      { seq: 1, type: 'atom-chartered', atomId: 'a-1', component: 'lexer', purpose: 'x', ts: '2026-07-11T00:00:00Z' },
      { seq: 2, type: 'atom-transitioned', atomId: 'a-1', from: 'chartered', to, ts: '2026-07-11T00:01:00Z' },
    ], 'demo');
    return displayStatus(findByPath(tree, 'a-1').node);
  }
  assert.strictEqual(transitionedStatus('chartered'), 'pending');
  assert.strictEqual(transitionedStatus("spec'd"), 'active');
  assert.strictEqual(transitionedStatus('merged'), 'done');
  assert.strictEqual(transitionedStatus('retired'), 'canceled');
});

// ── atom-flag-set / atom-flag-cleared ──────────────────────────────────────────

check('atom-flag-set/cleared add notes naming the flag and the op', () => {
  const tree = foldEvents([
    { seq: 1, type: 'atom-chartered', atomId: 'a-1', component: 'lexer', purpose: 'x', ts: '2026-07-11T00:00:00Z' },
    { seq: 2, type: 'atom-flag-set', atomId: 'a-1', flag: 'frozen', reason: 'R2 blast radius', ts: '2026-07-11T00:01:00Z' },
    { seq: 3, type: 'atom-flag-cleared', atomId: 'a-1', flag: 'frozen', ts: '2026-07-11T00:02:00Z' },
  ], 'demo');
  const notes = findByPath(tree, 'a-1').node.notes.map((n) => n.text);
  assert.ok(notes.some((t) => /frozen/.test(t) && /set/i.test(t)));
  assert.ok(notes.some((t) => /frozen/.test(t) && /clear/i.test(t)));
});

// ── atom-verdict ───────────────────────────────────────────────────────────────

check('atom-verdict adds a note naming the verdict kind', () => {
  const tree = foldEvents([
    { seq: 1, type: 'atom-chartered', atomId: 'a-1', component: 'lexer', purpose: 'x', ts: '2026-07-11T00:00:00Z' },
    { seq: 2, type: 'atom-verdict', atomId: 'a-1', kind: 'checkpoint', effects: [], ts: '2026-07-11T00:01:00Z' },
  ], 'demo');
  const notes = findByPath(tree, 'a-1').node.notes.map((n) => n.text);
  assert.ok(notes.some((t) => /checkpoint/.test(t)));
});

// ── phase-degenerated ──────────────────────────────────────────────────────────

check('phase-degenerated injects a node showing the phase RAN and FOUND NOTHING, never a silent skip', () => {
  const tree = foldEvents([
    { seq: 1, type: 'phase-degenerated', phase: 'scaffold', reason: 'no new goal cone and no newly-chartered atom touches the outer shell', inputs: { newGoalIds: [], shellAtomIds: [] }, ts: '2026-07-11T00:00:00Z' },
  ], 'demo');
  const found = findByPath(tree, 'phase/scaffold');
  assert.ok(found, 'a node for the degenerated phase exists');
  const text = [found.node.label, ...found.node.notes.map((n) => n.text)].filter(Boolean).join(' ');
  assert.ok(/no new goal cone|ran|found nothing/i.test(text), 'the record shows WHY it degenerated, not a bare skip');
});

// ── id stability across a sequence (aggregation by id, no duplication) ────────

check('a chartered atom transitioned twice still has exactly ONE node at its flat path', () => {
  const tree = foldEvents([
    { seq: 1, type: 'atom-chartered', atomId: 'a-1', component: 'lexer', purpose: 'x', ts: '2026-07-11T00:00:00Z' },
    { seq: 2, type: 'atom-transitioned', atomId: 'a-1', from: 'chartered', to: 'ready', ts: '2026-07-11T00:01:00Z' },
    { seq: 3, type: 'atom-transitioned', atomId: 'a-1', from: 'ready', to: "spec'd", ts: '2026-07-11T00:02:00Z' },
  ], 'demo');
  assert.strictEqual(tree.children.filter((c) => c.id === 'a-1').length, 1);
});

// ── regression: an unmapped type still degrades to a plain note ──────────────

check('an unmapped event type still degrades to a plain note (legacyFallback untouched)', () => {
  const tree = foldEvents([{ seq: 1, type: 'some-legacy-type', node: '', ts: '2026-07-11T00:00:00Z' }], 'demo');
  assert.ok(tree.notes.some((n) => /some-legacy-type/.test(n.text)));
});

if (process.exitCode) console.error(`\nprogress-map-atoms: FAILURES above (${passed} passed).`);
else console.log(`\nprogress-map-atoms: all ${passed} checks passed. ✓`);
```

### Step 2: Run the test to verify it fails for the right reason

Run: `node test/progress-map-atoms.test.mjs`

Expected: `FAIL` lines for every atom/verdict/degeneration check (today these event types fall through to
`legacyFallback` — a plain note on the ROOT, not an injected node at `a-1`/`phase/scaffold`) — assertion
failures, not a module-load error (`foldEvents` already exists and is already exported).

### Step 3: Commit

```bash
git add test/progress-map-atoms.test.mjs
git commit -m "test(progress-map): lock the 3.0 atom/verdict/degeneration EVENT_MAP entries — flat atomId paths (red, P7)" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

## Acceptance Criteria
- [ ] `test/progress-map-atoms.test.mjs` exists and matches the pure-fold harness convention exactly
      (no filesystem)
- [ ] Running it fails with assertion failures (not a module-load error)
- [ ] Every new event type, the lifecycle→status map (all four sampled states), id stability, and the
      unmapped-type regression are covered
- [ ] No filesystem touched; no file outside Scope modified; `lib/progress-map.mjs`/`lib/progress-tree.mjs`
      NOT edited
