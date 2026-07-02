# Task T01a: progress-tree tests (RED)

**role: red** — you author the tests. You do NOT implement anything.

## References
- Read: `../shared/architecture.md`, `../shared/interfaces.md` §1, `../shared/conventions.md`
- Read: `docs/superpowers/plans/knowledge/running-tests.md`
- Read one existing test for style, e.g. `test/action-events.test.mjs`

## Dependencies
- Depends on: — (none). Depended on by: T01b (green), T01c (audit).

## Scope
**Files:**
- Create: `test/progress-tree.test.mjs`

**BOUNDARY — you MUST NOT create or modify any other file. In particular you MUST NOT create
`lib/progress-tree.mjs`.**

## Positive Constraints (DO)
- Derive every assertion from `shared/interfaces.md` §1 — it is the contract. Where the
  interface fixes a value (glyph, default label, TERMINAL membership), assert it exactly.
- Follow the repo test style exactly (`check(name, fn)` helper, `passed` counter,
  `process.exitCode`). progress-tree is pure — you need NO temp dirs, NO git.
- Cover this case matrix (one `check` each, at minimum):
  1. `createTree('fx')` root shape: `{id:'', label:'fx', status:'pending', detail:null, statusTs:null, notes:[], children:[]}`.
  2. `inject` deep path `'a/b/c'` auto-creates `a`, `a/b` as pending stubs with id-as-label.
  3. `inject` idempotent merge: re-inject existing path with new label → label updated, status
     NOT touched (set node active first, re-inject with `status:'pending'` → stays active).
  4. `inject` on a brand-new node honors `op.status` (e.g. `'active'`); default is `'pending'`.
  5. `update` sets label/detail; on a missing path it auto-creates first.
  6. `status` sets target status + detail + `statusTs` from `ts`.
  7. `status` recursive: build a subtree with a `done` child, a `canceled` child, an `active`
     child, and a `pending` grandchild; apply recursive `failed` → done/canceled untouched,
     active + pending grandchild → failed, TARGET set even if it was terminal.
  8. recursive status does NOT overwrite descendants' `detail`/`statusTs`.
  9. `note` appends `{text, ts}`; on a missing path auto-creates.
  10. Throwing cases (use `assert.throws`): unknown `op.op`; invalid status value; segment with
      a space; segment with `/` (i.e. path `'a//b'`); leading `/` path; empty segment.
  11. Ordering totality (use `assert.doesNotThrow`): `status` then `note` on paths that never
      had an `inject`.
  12. `findByPath`: `''` → root; deep hit; miss → null.
  13. `findById`: depth-first FIRST match when two siblings' subtrees both contain the id;
      returns `{node, path}` with the correct path string; miss → null.
  14. `countByStatus` excludes the root; counts every descendant.
  15. `renderMarkdown` invariants (NOT a byte-golden): a done node's line contains `✓` and its
      label; children indented exactly 2 spaces deeper than their parent; `detail` renders as
      `_(...)_`; an active node with `statusTs: '2026-07-02T10:04:31Z'` renders
      `[2026-07-02 10:04:31 UTC]`; a note renders as a `✎` bullet under its node.
- Import everything the interface exports: `STATUSES, TERMINAL, GLYPH, createTree, apply,
  findByPath, findById, countByStatus, renderMarkdown` — assert `STATUSES`/`TERMINAL`/`GLYPH`
  contents exactly.

## Negative Constraints (DO NOT)
- Do NOT implement the module, even a stub.
- Do NOT pin behavior the interface leaves open (e.g. exact full-document markdown bytes,
  property ordering in objects). Assert invariants.
- Do NOT invent extra API surface (no extra exports asserted).

## Implementation Steps

### Step 1: Write the test file
Skeleton (fill in all checks per the matrix above — this shape is mandatory):

```js
// test/progress-tree.test.mjs — generic progress tree component (spec: docs/superpowers/specs/2026-07-02-unified-execution-tree-design.md; contract: plan shared/interfaces.md §1)
import assert from 'node:assert/strict';
import {
  STATUSES, TERMINAL, GLYPH, createTree, apply,
  findByPath, findById, countByStatus, renderMarkdown,
} from '../lib/progress-tree.mjs';

let passed = 0, failed = 0;
function check(name, fn) {
  try { fn(); console.log(`  ok  ${name}`); passed++; }
  catch (e) { console.error(`FAIL  ${name}\n${e.stack}`); failed++; }
}

check('vocabulary is exact', () => {
  assert.deepEqual(STATUSES, ['pending', 'active', 'done', 'failed', 'canceled']);
  assert.deepEqual(TERMINAL, ['done', 'canceled']);
  assert.deepEqual(GLYPH, { pending: '·', active: '▶', done: '✓', failed: '✗', canceled: '⊘' });
});

check('inject auto-creates pending ancestors with id-as-label', () => {
  const t = createTree('fx');
  apply(t, { op: 'inject', path: 'a/b/c', label: 'leaf' });
  const a = findByPath(t, 'a');
  assert.equal(a.status, 'pending'); assert.equal(a.label, 'a');
  assert.equal(findByPath(t, 'a/b/c').label, 'leaf');
});

check('recursive status skips terminal descendants, always sets target', () => {
  const t = createTree('fx');
  apply(t, { op: 'inject', path: 'wo/attempt-1/impl/§4' });
  apply(t, { op: 'status', path: 'wo/attempt-1/impl/§4', status: 'done' });
  apply(t, { op: 'inject', path: 'wo/attempt-1/impl/§5' });
  apply(t, { op: 'status', path: 'wo/attempt-1/impl/§5', status: 'active' });
  apply(t, { op: 'status', path: 'wo/attempt-1', status: 'failed', recursive: true });
  assert.equal(findByPath(t, 'wo/attempt-1').status, 'failed');
  assert.equal(findByPath(t, 'wo/attempt-1/impl').status, 'failed');
  assert.equal(findByPath(t, 'wo/attempt-1/impl/§4').status, 'done');     // terminal survives
  assert.equal(findByPath(t, 'wo/attempt-1/impl/§5').status, 'failed');
});

// … one check per remaining matrix case …

if (failed) { console.error(`progress-tree: FAILURES above (${passed} passed).`); process.exitCode = 1; }
else console.log(`progress-tree: all ${passed} checks passed. ✓`);
```

### Step 2: Run to verify RED for the right reason
Run: `node test/progress-tree.test.mjs`
Expected: crash with `Cannot find module '.../lib/progress-tree.mjs'` (module not found — NOT a
syntax error in your own file; validate your syntax with `node --check test/progress-tree.test.mjs`).

### Step 3: Commit
```bash
git add test/progress-tree.test.mjs
git commit -m "test(progress-tree): lock generic tree component contract (RED)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

## Acceptance Criteria
- [ ] Every matrix case has a distinct `check`
- [ ] `node --check` passes; run fails only on missing module
- [ ] No file outside Scope touched
