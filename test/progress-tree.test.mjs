// test/progress-tree.test.mjs — generic progress tree component (spec: docs/superpowers/specs/2026-07-02-unified-execution-tree-design.md; contract: plan shared/interfaces.md §1)
//
// progress-tree.mjs is pure (zero I/O, no reasonable-specific knowledge) — no temp dirs, no git.
// Every assertion below is derived from shared/interfaces.md §1 alone; the implementation does
// not exist yet (RED). Run: node test/progress-tree.test.mjs
import assert from 'node:assert/strict';
import {
  STATUSES, TERMINAL, GLYPH, createTree, apply,
  findByPath, findById, countByStatus, renderMarkdown,
} from '../lib/progress-tree.mjs';

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.stack || e.message}`); process.exitCode = 1; }
}

// ── vocabulary ────────────────────────────────────────────────────────────────

check('vocabulary is exact', () => {
  assert.deepEqual(STATUSES, ['pending', 'active', 'done', 'failed', 'canceled']);
  assert.deepEqual(TERMINAL, ['done', 'canceled']);
  assert.deepEqual(GLYPH, { pending: '·', active: '▶', done: '✓', failed: '✗', canceled: '⊘' });
});

// ── 1. createTree ─────────────────────────────────────────────────────────────

check('createTree(label) returns the exact root shape', () => {
  const t = createTree('fx');
  assert.deepEqual(t, {
    id: '', label: 'fx', status: 'pending', detail: null,
    statusTs: null, notes: [], children: [],
  });
});

// ── 2. inject — auto-creates missing ancestors as pending stubs ──────────────

check('inject auto-creates pending ancestors with id-as-label', () => {
  const t = createTree('fx');
  apply(t, { op: 'inject', path: 'a/b/c', label: 'leaf' });
  const a = findByPath(t, 'a');
  assert.equal(a.status, 'pending'); assert.equal(a.label, 'a');
  const b = findByPath(t, 'a/b');
  assert.equal(b.status, 'pending'); assert.equal(b.label, 'b');
  const c = findByPath(t, 'a/b/c');
  assert.equal(c.label, 'leaf'); assert.equal(c.status, 'pending');
});

// ── 3. inject — idempotent merge on an existing path ─────────────────────────

check('inject on an existing path merges label/detail but never touches status', () => {
  const t = createTree('fx');
  apply(t, { op: 'inject', path: 'm', label: 'M1' });
  apply(t, { op: 'status', path: 'm', status: 'active' });
  // Re-inject with a different label AND an explicit status: status must be ignored on merge.
  apply(t, { op: 'inject', path: 'm', label: 'M2', status: 'pending' });
  let m = findByPath(t, 'm');
  assert.equal(m.label, 'M2', 'label overwritten because provided');
  assert.equal(m.status, 'active', 'status NOT touched by merge, even though op.status was given');
  // detail merges independently of label: providing only detail leaves label alone.
  apply(t, { op: 'inject', path: 'm', detail: 'dd' });
  m = findByPath(t, 'm');
  assert.equal(m.detail, 'dd');
  assert.equal(m.label, 'M2', 'label unchanged when this inject omitted it');
  assert.equal(m.status, 'active', 'status still untouched');
});

// ── 4. inject — brand-new node honors op.status; default is pending ──────────

check('inject on a brand-new node honors op.status; default is pending', () => {
  const t = createTree('fx');
  apply(t, { op: 'inject', path: 'brandnew', status: 'active' });
  const n1 = findByPath(t, 'brandnew');
  assert.equal(n1.status, 'active');
  apply(t, { op: 'inject', path: 'brandnew2' });
  const n2 = findByPath(t, 'brandnew2');
  assert.equal(n2.status, 'pending');
  assert.equal(n2.label, 'brandnew2', 'default label is the segment id');
});

// ── 5. update — sets provided fields; auto-creates on a missing path ─────────

check('update sets only the provided fields, and auto-creates missing ancestors first', () => {
  const t = createTree('fx');
  apply(t, { op: 'inject', path: 'u', label: 'U0' });
  apply(t, { op: 'update', path: 'u', label: 'U1', detail: 'd1' });
  let u = findByPath(t, 'u');
  assert.equal(u.label, 'U1'); assert.equal(u.detail, 'd1');
  apply(t, { op: 'update', path: 'u', detail: 'd2' }); // label omitted → unchanged
  u = findByPath(t, 'u');
  assert.equal(u.label, 'U1');
  assert.equal(u.detail, 'd2');
  // missing path: ancestors auto-created as pending stubs, then the leaf's fields are set.
  apply(t, { op: 'update', path: 'missing/deep', label: 'DeepLabel' });
  const anc = findByPath(t, 'missing');
  assert.equal(anc.status, 'pending'); assert.equal(anc.label, 'missing');
  const leaf = findByPath(t, 'missing/deep');
  assert.equal(leaf.label, 'DeepLabel');
  assert.equal(leaf.status, 'pending', 'update never sets status; brand-new node still defaults pending');
});

// ── 6. status — always sets target; detail/statusTs set only when provided ───

check('status sets target status + detail + statusTs from ts; omitted fields are untouched', () => {
  const t = createTree('fx');
  apply(t, { op: 'inject', path: 'n', label: 'N' });
  apply(t, { op: 'update', path: 'n', detail: 'initial detail' });
  apply(t, { op: 'status', path: 'n', status: 'active', ts: '2026-07-02T10:00:00Z' });
  let n = findByPath(t, 'n');
  assert.equal(n.status, 'active');
  assert.equal(n.statusTs, '2026-07-02T10:00:00Z');
  assert.equal(n.detail, 'initial detail', 'detail not provided on this call → untouched');
  apply(t, { op: 'status', path: 'n', status: 'done', detail: 'now done', ts: '2026-07-02T11:00:00Z' });
  n = findByPath(t, 'n');
  assert.equal(n.status, 'done');
  assert.equal(n.detail, 'now done');
  assert.equal(n.statusTs, '2026-07-02T11:00:00Z');
});

check('status on a missing path auto-creates ancestors then sets the target', () => {
  const t = createTree('fx');
  apply(t, { op: 'status', path: 'brand/new', status: 'active' });
  const anc = findByPath(t, 'brand');
  assert.equal(anc.status, 'pending', 'auto-created ancestor is a plain pending stub');
  const leaf = findByPath(t, 'brand/new');
  assert.equal(leaf.status, 'active');
});

// ── 7. status recursive — skips terminal descendants, always sets the target ─

check('recursive status sets every non-terminal descendant, spares terminal ones, and ALWAYS sets the target (even if the target itself was terminal)', () => {
  const t = createTree('fx');
  apply(t, { op: 'inject', path: 'wo' });
  apply(t, { op: 'status', path: 'wo', status: 'done' }); // target starts terminal
  apply(t, { op: 'inject', path: 'wo/child-done' });
  apply(t, { op: 'status', path: 'wo/child-done', status: 'done' });
  apply(t, { op: 'inject', path: 'wo/child-canceled' });
  apply(t, { op: 'status', path: 'wo/child-canceled', status: 'canceled' });
  apply(t, { op: 'inject', path: 'wo/child-active' });
  apply(t, { op: 'status', path: 'wo/child-active', status: 'active' });
  apply(t, { op: 'inject', path: 'wo/child-active/grandchild' }); // pending by default

  apply(t, { op: 'status', path: 'wo', status: 'failed', recursive: true });

  assert.equal(findByPath(t, 'wo').status, 'failed', 'target set even though it was terminal (done)');
  assert.equal(findByPath(t, 'wo/child-done').status, 'done', 'terminal descendant untouched');
  assert.equal(findByPath(t, 'wo/child-canceled').status, 'canceled', 'terminal descendant untouched');
  assert.equal(findByPath(t, 'wo/child-active').status, 'failed', 'non-terminal descendant converted');
  assert.equal(findByPath(t, 'wo/child-active/grandchild').status, 'failed', 'deep non-terminal descendant converted');
});

// ── 8. recursive status never touches descendants' detail/statusTs ───────────

check('recursive status does not overwrite descendants\' detail or statusTs', () => {
  const t = createTree('fx');
  apply(t, { op: 'inject', path: 'wo2/child' });
  apply(t, { op: 'status', path: 'wo2/child', status: 'active', detail: 'detail-x', ts: '2026-01-01T00:00:00Z' });
  apply(t, { op: 'status', path: 'wo2', status: 'failed', recursive: true }); // no detail/ts passed
  const child = findByPath(t, 'wo2/child');
  assert.equal(child.status, 'failed');
  assert.equal(child.detail, 'detail-x', 'descendant detail untouched by the recursive sweep');
  assert.equal(child.statusTs, '2026-01-01T00:00:00Z', 'descendant statusTs untouched by the recursive sweep');
});

// ── 9. note — appends {text, ts}; auto-creates on a missing path ─────────────

check('note pushes {text, ts} and auto-creates a missing path first', () => {
  const t = createTree('fx');
  apply(t, { op: 'inject', path: 'a' });
  apply(t, { op: 'note', path: 'a', text: 'hello', ts: '2026-07-02T09:00:00Z' });
  apply(t, { op: 'note', path: 'a', text: 'no ts given' });
  const a = findByPath(t, 'a');
  assert.deepEqual(a.notes[0], { text: 'hello', ts: '2026-07-02T09:00:00Z' });
  assert.deepEqual(a.notes[1], { text: 'no ts given', ts: null }, 'ts defaults to null, not undefined/omitted');
  // missing path auto-creates
  apply(t, { op: 'note', path: 'never/injected', text: 'first note' });
  const leaf = findByPath(t, 'never/injected');
  assert.ok(leaf, 'auto-created by the note op');
  assert.deepEqual(leaf.notes, [{ text: 'first note', ts: null }]);
});

// ── 10. throwing cases — malformed input always throws TypeError ─────────────

check('apply throws TypeError on every malformed-input case', () => {
  const fresh = () => createTree('fx');

  assert.throws(() => apply(fresh(), { op: 'frobnicate', path: 'a' }), TypeError, 'unknown op.op');
  assert.throws(() => apply(fresh(), { op: 'status', path: 'a', status: 'bogus-status' }), TypeError, 'invalid status value');
  assert.throws(() => apply(fresh(), { op: 'inject', path: 'a b' }), TypeError, 'segment containing a space');
  assert.throws(() => apply(fresh(), { op: 'inject', path: 'a//b' }), TypeError, 'segment with / (interior empty segment via a//b)');
  assert.throws(() => apply(fresh(), { op: 'inject', path: '/a' }), TypeError, 'leading / path');
  assert.throws(() => apply(fresh(), { op: 'inject', path: 'a/' }), TypeError, 'empty (trailing) segment');
  // Bonus per the documented grammar (ASCII control char scan, distinct from the \s check).
  assert.throws(() => apply(fresh(), { op: 'inject', path: 'a\x07b' }), TypeError, 'segment with an ASCII control character');
});

// ── 11. ordering totality — never throws when parents were never injected ────

check('status/note never throw for ordering reasons, even with no prior inject', () => {
  const t = createTree('fx');
  assert.doesNotThrow(() => apply(t, { op: 'status', path: 'z1/z2/z3', status: 'done' }));
  assert.doesNotThrow(() => apply(t, { op: 'note', path: 'q1/q2', text: 'hello' }));
  assert.equal(findByPath(t, 'z1/z2/z3').status, 'done');
  assert.equal(findByPath(t, 'q1/q2').notes.length, 1);
});

// ── 12. findByPath ────────────────────────────────────────────────────────────

check('findByPath: \'\' is the root, deep paths hit, unknown paths miss', () => {
  const t = createTree('fx');
  assert.equal(findByPath(t, ''), t);
  apply(t, { op: 'inject', path: 'x/y/z' });
  assert.equal(findByPath(t, 'x/y/z').id, 'z');
  assert.equal(findByPath(t, 'nonexistent/path'), null);
});

// ── 13. findById — depth-first pre-order, first match wins ───────────────────

check('findById returns the depth-first FIRST match among duplicate ids in different subtrees, with its path; miss is null', () => {
  const t = createTree('root');
  apply(t, { op: 'inject', path: 'left/dup', label: 'Left Dup' });
  apply(t, { op: 'inject', path: 'right/dup', label: 'Right Dup' });
  const found = findById(t, 'dup');
  assert.ok(found);
  assert.equal(found.node.label, 'Left Dup', 'left subtree was injected first → visited first in pre-order');
  assert.equal(found.path, 'left/dup');
  assert.equal(findById(t, 'does-not-exist'), null);
});

// ── 14. countByStatus — excludes the root, counts every descendant ───────────

check('countByStatus excludes the root and counts every descendant', () => {
  const t = createTree('root');
  apply(t, { op: 'status', path: '', status: 'active' }); // set the ROOT's own status explicitly
  apply(t, { op: 'inject', path: 'a', status: 'done' });
  apply(t, { op: 'inject', path: 'b', status: 'failed' });
  apply(t, { op: 'inject', path: 'b/c', status: 'active' });
  apply(t, { op: 'inject', path: 'd' }); // pending by default
  const counts = countByStatus(t);
  assert.deepEqual(counts, { pending: 1, active: 1, done: 1, failed: 1, canceled: 0 },
    'root is active but is NOT counted — only b/c contributes the single active count');
});

// ── 15. renderMarkdown — invariants, not a byte golden ────────────────────────

check('renderMarkdown: glyph+label, 2-space-per-depth indent, detail suffix, statusTs suffix, note bullets', () => {
  const t = createTree('Root Label');
  apply(t, { op: 'inject', path: 'a', label: 'Task A' });
  apply(t, { op: 'status', path: 'a', status: 'done' });
  apply(t, { op: 'inject', path: 'a/b', label: 'Sub B', detail: 'extra detail' });
  apply(t, { op: 'note', path: 'a', text: 'noted with ts', ts: '2026-07-02T09:00:00Z' });
  apply(t, { op: 'note', path: 'a', text: 'noted without ts' });
  apply(t, { op: 'inject', path: 'c', label: 'Task C' });
  apply(t, { op: 'status', path: 'c', status: 'active', ts: '2026-07-02T10:04:31Z' });

  const md = renderMarkdown(t);
  const lines = md.split('\n');
  const indentOf = (l) => l.match(/^(\s*)/)[1].length;
  const lineOf = (needle) => {
    const l = lines.find((x) => x.includes(needle));
    assert.ok(l, `expected a rendered line containing ${JSON.stringify(needle)}`);
    return l;
  };

  // done node: glyph + label on the same bullet
  const lineA = lineOf('Task A');
  assert.ok(lineA.includes(GLYPH.done), 'done node renders the done glyph');

  // 2-space-per-depth indent: a child is exactly 2 spaces deeper than its parent
  const lineB = lineOf('Sub B');
  assert.equal(indentOf(lineB) - indentOf(lineA), 2, 'child indented exactly 2 spaces deeper than parent');

  // detail suffix is the literal two-space-then-italic form
  assert.ok(lineB.includes('  _(extra detail)_'), 'detail renders as the documented "  _(detail)_" suffix');

  // active node with statusTs gets the literal reformatted UTC suffix
  const lineC = lineOf('Task C');
  assert.ok(lineC.includes(GLYPH.active), 'active node renders the active glyph');
  assert.ok(lineC.includes('[2026-07-02 10:04:31 UTC]'), 'statusTs reformatted to the documented bracket suffix');

  // notes render as a child bullet (✎) one indent level deeper than their node,
  // with a bracketed timestamp only when a ts was actually given.
  const noteWithTs = lineOf('noted with ts');
  const noteWithoutTs = lineOf('noted without ts');
  assert.ok(noteWithTs.includes('✎'));
  assert.ok(noteWithoutTs.includes('✎'));
  assert.equal(indentOf(noteWithTs) - indentOf(lineA), 2, 'note bullet is one level deeper than its node');
  assert.ok(noteWithTs.includes('['), 'a note WITH a ts renders a bracketed timestamp');
  assert.ok(!noteWithoutTs.includes('['), 'a note WITHOUT a ts renders no bracket at all');
});

// ── 16. [audit finding #1 — DEFECT] inject must not mutate ahead of validation ────

check('inject atomicity: a thrown TypeError (bad op.status) leaves the tree byte-identical to before the call', () => {
  // Scenario A: merge into an EXISTING node — the label must not be mutated ahead of the
  // op.status validation. A thrown inject must roll back the whole merge, not just skip status.
  {
    const t = createTree('fx');
    apply(t, { op: 'inject', path: 'x', label: 'orig' });
    const before = JSON.parse(JSON.stringify(t));
    assert.throws(() => apply(t, { op: 'inject', path: 'x', label: 'MUTATED', status: 'garbage' }), TypeError);
    assert.deepEqual(t, before, 'thrown inject on an existing node must leave the tree completely unchanged');
    assert.equal(findByPath(t, 'x').label, 'orig', 'label must NOT have been mutated to MUTATED by the thrown call');
  }

  // Scenario B: a brand-new node — the throw must not leave a permanently-created node behind.
  {
    const t = createTree('fx');
    const before = JSON.parse(JSON.stringify(t));
    assert.throws(() => apply(t, { op: 'inject', path: 'ghost', label: 'ghost-label', status: 'garbage' }), TypeError);
    assert.deepEqual(t, before, 'thrown inject must not leave a brand-new node in the tree');
    assert.equal(findByPath(t, 'ghost'), null, 'the ghost node must not exist after the throw');
  }

  // Scenario C: deep auto-created ancestors — none of a, a/b, a/b/c may survive the throw.
  {
    const t = createTree('fx');
    const before = JSON.parse(JSON.stringify(t));
    assert.throws(() => apply(t, { op: 'inject', path: 'a/b/c', status: 'garbage' }), TypeError);
    assert.deepEqual(t, before, 'thrown inject must not leave any auto-created ancestor in the tree');
    assert.equal(findByPath(t, 'a'), null, 'auto-created ancestor a must not exist after the throw');
    assert.equal(findByPath(t, 'a/b'), null, 'auto-created ancestor a/b must not exist after the throw');
    assert.equal(findByPath(t, 'a/b/c'), null, 'auto-created leaf a/b/c must not exist after the throw');
  }
});

// ── 17. [audit finding #2 — GAP] recursive sweep passes THROUGH a terminal node ───

check('recursive status sweep passes THROUGH a terminal node into its non-terminal children', () => {
  const t = createTree('fx');
  apply(t, { op: 'inject', path: 'wo/child-done/grandchild' });
  apply(t, { op: 'status', path: 'wo/child-done', status: 'done' });
  apply(t, { op: 'status', path: 'wo/child-done/grandchild', status: 'active' });

  apply(t, { op: 'status', path: 'wo', status: 'failed', recursive: true });

  assert.equal(findByPath(t, 'wo/child-done').status, 'done', 'the terminal node itself is spared by the sweep');
  assert.equal(findByPath(t, 'wo/child-done/grandchild').status, 'failed', 'the sweep still recurses into a terminal node\'s own children');
});

// ── 18. [audit finding #3 — GAP] findById: depth-asymmetric discriminator ────────

check('findById is genuinely depth-first pre-order: a deeper-but-earlier-injected id beats a shallower-but-later one', () => {
  const t = createTree('root');
  apply(t, { op: 'inject', path: 'left/deep/dup' });
  apply(t, { op: 'inject', path: 'right/dup' });
  const found = findById(t, 'dup');
  assert.ok(found);
  assert.equal(found.path, 'left/deep/dup', 'pre-order depth-first fully visits left\'s subtree before ever looking at right, regardless of depth');
  assert.equal(found.node, findByPath(t, 'left/deep/dup'), 'the returned node must be the left/deep/dup node, not right/dup');
});

// ── 19. [audit finding #4 — GAP] renderMarkdown excludes the root's own notes ────

check('renderMarkdown never surfaces a note attached to the root node itself', () => {
  const t = createTree('Root Label');
  apply(t, { op: 'note', path: '', text: 'a root-level note' });
  const md = renderMarkdown(t);
  assert.ok(!md.includes('a root-level note'), 'a root-level note must not appear anywhere in the rendered tree body');
});

if (process.exitCode) console.error(`\nprogress-tree: FAILURES above (${passed} passed).`);
else console.log(`\nprogress-tree: all ${passed} checks passed. ✓`);
