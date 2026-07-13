# T04a — Self-contained HTML renderer tests (red)

**role:** red
**Depends on:** —
**Owns (stage only these):** `test/topology-view.test.mjs`

> **Read first:** `../shared/interfaces.md` (§B2 — the `renderTopologyHtml` signature, the three views,
> the self-containment invariant, the diff tags, the optional legibility annotation),
> `../shared/conventions.md` (the pure string harness — assert with `.includes`/`RegExp`, never a DOM
> parser; the mandatory self-containment + diff/cone checks), `../knowledge/running-tests.md`, and the
> plan's **The self-containment discipline** + **Flag 2**. You are the `red` role: **write the failing
> tests only. Do not implement `renderTopologyHtml`.** Pin §5.3's intent — **self-containment (no CDN, no
> npm)**, the three views routing differently, the cone selecting the goal's atoms, and the diff tagging
> added/retired/rewired — never a golden SVG string.

**Files:**
- Create: `test/topology-view.test.mjs`

- [ ] **Step 1: Write the failing test file**

Write `test/topology-view.test.mjs` with exactly this content:

```js
// test/topology-view.test.mjs — P6e: the self-contained topology.html renderer (DESIGN-3.0 §5.3,
// reasonable 3.0 Part 6e). Pure: { containment, atoms, edges } graphs are hand-built literals in the
// lib/graph.mjs foldAsLived/deriveCurrent shape — no fs, no ledger. The output is a plain HTML string;
// assert on it with .includes / RegExp / attribute counts, NEVER a DOM parser (that would be a
// dependency — Law 1). The load-bearing pin is SELF-CONTAINMENT: no CDN, no npm, no external reference.
import assert from 'node:assert';
import { renderTopologyHtml } from '../lib/topology-view.mjs';

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.stack || e.message}`); process.exitCode = 1; }
}

const root = (children) => ({ id: '', kind: 'root', children });
const group = (id, atomIds) => ({ id, kind: 'group', children: atomIds.map((a) => ({ id: a, kind: 'atom', children: [] })) });

// two components, parser needs lexer
const twoComp = () => ({
  containment: root([group('lexer', ['a-1']), group('parser', ['a-2'])]),
  atoms: [{ id: 'a-1', component: 'lexer' }, { id: 'a-2', component: 'parser' }],
  edges: [{ from: 'a-2', to: 'a-1', edge: 'needs', op: 'add' }],
});
// same, plus a goal g1 that a-1 serves
const withGoal = () => ({
  containment: root([group('lexer', ['a-1']), group('parser', ['a-2'])]),
  atoms: [{ id: 'a-1', component: 'lexer' }, { id: 'a-2', component: 'parser' }],
  edges: [
    { from: 'a-2', to: 'a-1', edge: 'needs', op: 'add' },
    { from: 'a-1', to: 'g1', edge: 'serves', op: 'add' },
  ],
});
const count = (s, re) => (s.match(re) || []).length;

// ── SELF-CONTAINMENT: no CDN, no npm, no external reference (the load-bearing §5.3 + Law 1 pin) ─────

check('the output references NO external resource (no CDN, no npm, fully inline)', () => {
  const html = renderTopologyHtml(twoComp(), { view: 'component' });
  assert.ok(!/https?:\/\//.test(html), 'contains an absolute http(s) URL');
  assert.ok(!/<script[^>]*\bsrc=/i.test(html), 'loads an external script');
  assert.ok(!/<link\b/i.test(html), 'contains a <link> (external stylesheet/font)');
  assert.ok(!/@import/i.test(html), 'contains a CSS @import');
  assert.ok(!/["'(]\/\//.test(html), 'contains a protocol-relative // URL');
  assert.ok(!/cdn/i.test(html), 'references a CDN');
});

check('the output is a single self-contained document: inline <style>, <svg>, inline <script>', () => {
  const html = renderTopologyHtml(twoComp(), { view: 'component' });
  assert.strictEqual(typeof html, 'string');
  assert.ok(html.length > 0);
  assert.ok(/<svg[\s>]/i.test(html), 'no inline <svg>');
  assert.ok(/<style[\s>]/i.test(html), 'no inline <style>');
  assert.ok(/<script[\s>]/i.test(html), 'no inline <script>');
});

// ── component view: one node element per component; the lifted dependency edge is drawn ────────────

check('component view: one node element per component, keyed by a stable handle', () => {
  const html = renderTopologyHtml(twoComp(), { view: 'component' });
  assert.ok(html.includes('data-node-id="lexer"'), 'missing lexer node');
  assert.ok(html.includes('data-node-id="parser"'), 'missing parser node');
  assert.strictEqual(count(html, /data-node-id=/g), 2, 'expected exactly two component nodes');
});

check('component view: the atom-level edge is LIFTED to a component-to-component edge', () => {
  const html = renderTopologyHtml(twoComp(), { view: 'component' });
  // the edge parser→lexer survives the component quotient (liftEdges); atom ids do NOT appear as nodes
  assert.ok(!html.includes('data-node-id="a-1"'), 'component view leaked an atom id as a node');
  assert.ok(/data-edge-kind="needs"/.test(html) || /needs/.test(html), 'lifted needs edge not drawn');
});

// ── view routing: component / cone / diff produce DIFFERENT content ────────────────────────────────

check('the three views route to different renderings', () => {
  const g = withGoal();
  const comp = renderTopologyHtml(g, { view: 'component' });
  const cone = renderTopologyHtml(g, { view: 'cone', goalId: 'g1' });
  const diff = renderTopologyHtml(g, { view: 'diff', lastRatified: twoComp() });
  assert.notStrictEqual(comp, cone);
  assert.notStrictEqual(comp, diff);
});

// ── cone view: only the atoms that SERVE the named goal ────────────────────────────────────────────

check('cone view selects exactly the atoms serving the goal (a-1 serves g1; a-2 does not)', () => {
  const html = renderTopologyHtml(withGoal(), { view: 'cone', goalId: 'g1' });
  assert.ok(html.includes('data-node-id="a-1"'), 'cone dropped the serving atom a-1');
  assert.ok(!html.includes('data-node-id="a-2"'), 'cone included a non-serving atom a-2');
});

check('cone view for an unknown goal renders an empty diagram, never throws', () => {
  const html = renderTopologyHtml(withGoal(), { view: 'cone', goalId: 'nope' });
  assert.strictEqual(typeof html, 'string');
  assert.ok(/<svg[\s>]/i.test(html));
  assert.ok(!html.includes('data-node-id="a-1"'));
});

// ── diff view: added / retired / unchanged / rewired, color-coded against lastRatified ─────────────

check('diff view tags added / retired / unchanged components against lastRatified', () => {
  const current = { containment: root([group('lexer', ['a-1']), group('parser', ['a-2'])]),
                    atoms: [{ id: 'a-1', component: 'lexer' }, { id: 'a-2', component: 'parser' }], edges: [] };
  const last = { containment: root([group('lexer', ['a-1']), group('io', ['a-9'])]),
                 atoms: [{ id: 'a-1', component: 'lexer' }, { id: 'a-9', component: 'io' }], edges: [] };
  const html = renderTopologyHtml(current, { view: 'diff', lastRatified: last });
  assert.ok(/data-diff="added"/.test(html), 'parser (new) not tagged added');
  assert.ok(/data-diff="retired"/.test(html), 'io (gone) not tagged retired');
  assert.ok(/data-diff="unchanged"/.test(html), 'lexer (kept) not tagged unchanged');
});

check('diff view tags a REWIRED edge between surviving components', () => {
  const cur = { containment: root([group('lexer', ['a-1']), group('parser', ['a-2'])]),
                atoms: [{ id: 'a-1', component: 'lexer' }, { id: 'a-2', component: 'parser' }],
                edges: [{ from: 'a-2', to: 'a-1', edge: 'needs', op: 'add' }] };
  const last = { containment: root([group('lexer', ['a-1']), group('parser', ['a-2'])]),
                 atoms: [{ id: 'a-1', component: 'lexer' }, { id: 'a-2', component: 'parser' }], edges: [] };
  const html = renderTopologyHtml(cur, { view: 'diff', lastRatified: last });
  assert.ok(/data-diff="rewired"/.test(html), 'the new edge between surviving components not tagged rewired');
});

// ── optional legibility annotation (Flag 2): a supplied finding annotates its node ─────────────────

check('a supplied legibility finding annotates the matching node; absent ⇒ no annotation', () => {
  const g = twoComp();
  const plain = renderTopologyHtml(g, { view: 'component' });
  assert.ok(!/data-finding=/.test(plain), 'annotated a node with no findings supplied');
  const annotated = renderTopologyHtml(g, { view: 'component', legibility: [{ kind: 'god-component', component: 'lexer', metric: 9, threshold: 3 }] });
  assert.ok(/data-finding="god-component"/.test(annotated), 'did not annotate the flagged node');
});

// ── degenerate input (never throws) ────────────────────────────────────────────────────────────────

check('an empty/undefined graph renders a minimal valid document, never throws', () => {
  const empty = renderTopologyHtml({ containment: root([]), atoms: [], edges: [] }, { view: 'component' });
  assert.ok(/<svg[\s>]/i.test(empty));
  const undef = renderTopologyHtml(undefined, { view: 'component' });
  assert.strictEqual(typeof undef, 'string');
  assert.ok(/<svg[\s>]/i.test(undef));
});

check('an unknown view falls back rather than throwing', () => {
  const html = renderTopologyHtml(twoComp(), { view: 'wat' });
  assert.strictEqual(typeof html, 'string');
  assert.ok(/<svg[\s>]/i.test(html));
});

if (process.exitCode) console.error(`\ntopology-view: FAILURES above (${passed} passed).`);
else console.log(`\ntopology-view: all ${passed} checks pass. ✓`);
```

- [ ] **Step 2: Run it to verify it fails for the right reason**

Run: `node test/topology-view.test.mjs`
Expected: **the checks fail** because `renderTopologyHtml` is not yet exported from
`lib/topology-view.mjs` (after T03b it exports only `layoutTopology`) — a
`SyntaxError: … does not provide an export named 'renderTopologyHtml'`, or every `check` throwing on the
undefined call. This is the correct red: the tests fail because the function does not exist, not because
an assertion is wrong.

- [ ] **Step 3: Commit**

```bash
git add test/topology-view.test.mjs
git commit -m "test(topology-view): self-contained renderer — no-CDN invariant + three views + diff tags (red, P6e)"
```

**Do not implement anything.** The `green` task (T04b) makes these pass.
