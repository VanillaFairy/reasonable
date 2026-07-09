# Task T01a: Atom lifecycle + cohesion tests (red)

**Role:** `red` — you write ONLY the two failing test files below. Do not implement
`lib/atom.mjs`.

## References
- Read: `../shared/architecture.md`
- Read: `../shared/interfaces.md` (the exact `lib/atom.mjs` PURE-section contract you're testing)
- Read: `../shared/conventions.md`
- Read: `../knowledge/running-tests.md`
- Read: `docs/superpowers/specs/2026-07-09-reasonable-3.0-p3-atom-design.md` Decisions 5 and 6 (the
  full reasoning behind every edge in the lifecycle table and every cohesion criterion — read this
  before writing a test that assumes an edge or a criterion this doc doesn't actually pin)
- Read: `test/clause-id.test.mjs` (Part 2's fixture-writing style for a pure-shape module — no
  filesystem needed for these two files, since everything under test here is pure)

## Dependencies
- Depends on: — (none)
- Depended on by: T01b (implements against these locked tests), T01c (audits them)

## Scope

**Files:**
- Create: `test/atom-lifecycle.test.mjs`
- Create: `test/atom-cohesion.test.mjs`

**BOUNDARY — you MUST NOT modify any files outside this list. In particular, do NOT create
`lib/atom.mjs` — that is T01b's job.**

## Positive Constraints (DO)
- Write two complete, runnable test files following the exact harness convention in
  `../shared/conventions.md` (the `check()` pattern — no framework).
- `test/atom-lifecycle.test.mjs` imports `LIFECYCLE_STATES, TERMINAL_STATES, FLAG_NAMES,
  LIFECYCLE_TRANSITIONS, isValidTransition, isValidFlag` from `../lib/atom.mjs` (a module that
  does not exist yet — RED here is a "Cannot find module" error).
- `test/atom-cohesion.test.mjs` imports `cohesionComponents` from `../lib/atom.mjs`.
- Cover **every edge** in `../shared/interfaces.md`'s `LIFECYCLE_TRANSITIONS` table, both that it
  IS valid and that near-miss edges are NOT (see Implementation Steps for the exact list — do not
  invent edges the table doesn't have, and do not omit one it does).
- Cover all three cohesion criteria in `cohesionComponents` — (a) shared citation, (b) shared
  `demandedBy`, (c) locus overlap below the component root, including the "bare root locus
  contributes nothing" rule from the design doc's Decision 6 — plus transitivity (A coheres with B,
  B coheres with C via a *different* criterion ⇒ A, B, C are one component) and the disconnected
  case (R4's multi-component output).

## Negative Constraints (DO NOT)
- Do NOT implement `lib/atom.mjs`.
- Do NOT pin the exact wording of any error message — these two files test pure predicates/
  algorithms that return booleans/arrays, not `{ok, error}` envelopes; there's nothing to pin.
- Do NOT test the I/O half (`charterAtom`, `authorDelta`, etc.) — that's T02a's job, and those
  exports don't exist in this task's scope.
- Do NOT modify any file outside the Scope section.

## Implementation Steps

### Step 1: Write `test/atom-lifecycle.test.mjs`

```js
// test/atom-lifecycle.test.mjs — the atom's lifecycle state machine (DESIGN-3.0 §4.1, reasonable
// 3.0 Part 3): the pinned state list, the three orthogonal flags, and the adjacency table
// isValidTransition checks moves against. Pure, zero-I/O — no filesystem fixtures needed.

import assert from 'node:assert';
import {
  LIFECYCLE_STATES, TERMINAL_STATES, FLAG_NAMES, LIFECYCLE_TRANSITIONS,
  isValidTransition, isValidFlag,
} from '../lib/atom.mjs';

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.stack || e.message}`); process.exitCode = 1; }
}

// ── vocabulary ──────────────────────────────────────────────────────────────

check('LIFECYCLE_STATES has exactly the ten pinned states, in DESIGN-3.0 §4.1 order', () => {
  assert.deepStrictEqual(LIFECYCLE_STATES, [
    'chartered', 'ready', "spec'd", 'packed', 'tests-red', 'green', 'audited',
    'merged', 'retired-pending', 'retired',
  ]);
});

check('LIFECYCLE_STATES is frozen', () => {
  assert.throws(() => { LIFECYCLE_STATES.push('bogus'); });
});

check('TERMINAL_STATES is exactly {merged, retired}', () => {
  assert.deepStrictEqual([...TERMINAL_STATES].sort(), ['merged', 'retired']);
});

check('FLAG_NAMES is exactly the three orthogonal flags', () => {
  assert.deepStrictEqual([...FLAG_NAMES].sort(), ['dispatch-barred', 'frozen', 'guard-halted']);
});

check('FLAG_NAMES is frozen', () => {
  assert.throws(() => { FLAG_NAMES.push('bogus'); });
});

// ── isValidTransition: the forward chain ───────────────────────────────────

check('the full forward chain is valid, one hop at a time', () => {
  const chain = ['chartered', 'ready', "spec'd", 'packed', 'tests-red', 'green', 'audited', 'merged'];
  for (let i = 0; i < chain.length - 1; i += 1) {
    assert.strictEqual(isValidTransition(chain[i], chain[i + 1]), true, `${chain[i]} -> ${chain[i + 1]}`);
  }
});

check('the forward chain cannot skip a hop', () => {
  assert.strictEqual(isValidTransition('chartered', "spec'd"), false);
  assert.strictEqual(isValidTransition('ready', 'packed'), false);
  assert.strictEqual(isValidTransition("spec'd", 'tests-red'), false);
  assert.strictEqual(isValidTransition('packed', 'green'), false);
  assert.strictEqual(isValidTransition('tests-red', 'audited'), false);
  assert.strictEqual(isValidTransition('green', 'merged'), false);
});

check('the forward chain cannot run backward (other than the pinned retry edges below)', () => {
  assert.strictEqual(isValidTransition('merged', 'audited'), false);
  assert.strictEqual(isValidTransition('audited', 'green'), false);
  assert.strictEqual(isValidTransition("spec'd", 'chartered'), false);
});

// ── isValidTransition: the retry-to-ready edges ────────────────────────────

check("spec'd, packed, tests-red, green, and audited can all retry back to ready", () => {
  for (const from of ["spec'd", 'packed', 'tests-red', 'green', 'audited']) {
    assert.strictEqual(isValidTransition(from, 'ready'), true, `${from} -> ready`);
  }
});

check('chartered and ready themselves have no retry-to-ready edge (nothing to retry yet)', () => {
  assert.strictEqual(isValidTransition('chartered', 'ready'), true, 'this IS the forward edge, not a retry — sanity check');
  assert.strictEqual(isValidTransition('ready', 'ready'), false, 'no self-loop');
});

// ── isValidTransition: the retirement edges ────────────────────────────────

check("spec'd, packed, tests-red, green, and audited can all retire to retired-pending", () => {
  for (const from of ["spec'd", 'packed', 'tests-red', 'green', 'audited']) {
    assert.strictEqual(isValidTransition(from, 'retired-pending'), true, `${from} -> retired-pending`);
  }
});

check('chartered -> retired-pending is deliberately NOT a valid edge (design doc Decision 5)', () => {
  assert.strictEqual(isValidTransition('chartered', 'retired-pending'), false);
});

check('ready -> retired-pending is deliberately NOT a valid edge (only in-flight-or-later states retire directly)', () => {
  assert.strictEqual(isValidTransition('ready', 'retired-pending'), false);
});

check('retired-pending -> retired is the only edge out of retired-pending', () => {
  assert.strictEqual(isValidTransition('retired-pending', 'retired'), true);
  assert.strictEqual(isValidTransition('retired-pending', 'ready'), false);
});

// ── isValidTransition: terminals have no outgoing edges ────────────────────

check('merged and retired have zero outgoing edges to any other state', () => {
  for (const term of TERMINAL_STATES) {
    for (const other of LIFECYCLE_STATES) {
      if (other === term) continue;
      assert.strictEqual(isValidTransition(term, other), false, `${term} -> ${other} must be false`);
    }
  }
});

// ── isValidTransition: malformed input never throws ────────────────────────

check('isValidTransition returns false (never throws) for unknown or non-string states', () => {
  assert.strictEqual(isValidTransition('bogus', 'ready'), false);
  assert.strictEqual(isValidTransition('chartered', 'bogus'), false);
  assert.strictEqual(isValidTransition(null, 'ready'), false);
  assert.strictEqual(isValidTransition('chartered', undefined), false);
  assert.strictEqual(isValidTransition(42, {}), false);
});

// ── LIFECYCLE_TRANSITIONS: the raw table matches isValidTransition exactly ─

check('LIFECYCLE_TRANSITIONS and isValidTransition agree on every (from, to) pair over LIFECYCLE_STATES', () => {
  for (const from of LIFECYCLE_STATES) {
    for (const to of LIFECYCLE_STATES) {
      const inTable = (LIFECYCLE_TRANSITIONS[from] || []).includes(to);
      assert.strictEqual(isValidTransition(from, to), inTable, `${from} -> ${to}`);
    }
  }
});

// ── isValidFlag ──────────────────────────────────────────────────────────────

check('isValidFlag accepts every FLAG_NAMES member', () => {
  for (const f of FLAG_NAMES) assert.strictEqual(isValidFlag(f), true, f);
});

check('isValidFlag rejects an unknown flag name, never throws', () => {
  assert.strictEqual(isValidFlag('bogus'), false);
  assert.strictEqual(isValidFlag(null), false);
  assert.strictEqual(isValidFlag(undefined), false);
});

if (process.exitCode) console.error(`\natom-lifecycle: FAILURES above (${passed} passed).`);
else console.log(`\natom-lifecycle: all ${passed} checks pass. ✓`);
```

### Step 2: Write `test/atom-cohesion.test.mjs`

```js
// test/atom-cohesion.test.mjs — the minimality/cohesion law (DESIGN-3.0 §4.3, reasonable 3.0 Part
// 3): a delta's clauses cohere iff they form one connected component of the clause-cohesion graph
// (shared provider citation | shared demanded-by | locus overlap below the component root). Pure,
// zero-I/O — clause objects are constructed by hand, no filesystem fixtures needed.

import assert from 'node:assert';
import { cohesionComponents } from '../lib/atom.mjs';

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.stack || e.message}`); process.exitCode = 1; }
}

// This delta's atom charter declares component 'lexer', physically rooted at 'lib/lexer/' — every
// locus fixture below is a real repo-relative glob under that root, matching how a charter's own
// `locus` field and 2.x's wo.locus are both already written (see interfaces.md's `componentRoot`
// param doc — cohesionComponents is NOT told the component slug 'lexer', it is told this literal
// path-prefix string, which the caller already knows because it's the one declaring loci under it).
const ROOT = 'lib/lexer/';

function sortedComponents(components) {
  return components.map((c) => [...c].sort()).sort((a, b) => a[0].localeCompare(b[0]));
}

function clause(clauseId, { citations = [], demandedBy = null, locus = [] } = {}) {
  return { clauseId, citations, demandedBy, locus };
}

// ── empty / trivial ─────────────────────────────────────────────────────────

check('an empty delta returns zero components', () => {
  assert.deepStrictEqual(cohesionComponents([], ROOT), []);
});

check('a single clause is its own component', () => {
  const c = clause('lexer#c1');
  assert.deepStrictEqual(cohesionComponents([c], ROOT), [['lexer#c1']]);
});

check('two clauses sharing nothing are two separate components', () => {
  const a = clause('lexer#c1', { citations: [{ component: 'ast', clause: 'ast#c1' }] });
  const b = clause('lexer#c2', { citations: [{ component: 'ast', clause: 'ast#c2' }] });
  assert.deepStrictEqual(sortedComponents(cohesionComponents([a, b], ROOT)), [['lexer#c1'], ['lexer#c2']]);
});

// ── criterion (a): shared provider citation ─────────────────────────────────

check('two clauses citing the SAME provider clause cohere', () => {
  const provider = { component: 'ast', clause: 'ast#c1' };
  const a = clause('lexer#c1', { citations: [provider] });
  const b = clause('lexer#c2', { citations: [provider, { component: 'ast', clause: 'ast#c2' }] });
  assert.deepStrictEqual(sortedComponents(cohesionComponents([a, b], ROOT)), [['lexer#c1', 'lexer#c2']]);
});

check('citing DIFFERENT providers does not cohere via (a) alone', () => {
  const a = clause('lexer#c1', { citations: [{ component: 'ast', clause: 'ast#c1' }] });
  const b = clause('lexer#c2', { citations: [{ component: 'ast', clause: 'ast#c2' }] });
  assert.deepStrictEqual(sortedComponents(cohesionComponents([a, b], ROOT)), [['lexer#c1'], ['lexer#c2']]);
});

// ── criterion (b): shared demanded-by ───────────────────────────────────────

check('two clauses with the identical demandedBy string cohere', () => {
  const a = clause('lexer#c1', { demandedBy: 'gate:vertical-slice:x / asserts `y`' });
  const b = clause('lexer#c2', { demandedBy: 'gate:vertical-slice:x / asserts `y`' });
  assert.deepStrictEqual(sortedComponents(cohesionComponents([a, b], ROOT)), [['lexer#c1', 'lexer#c2']]);
});

check('two clauses with DIFFERENT demandedBy strings do not cohere via (b) alone', () => {
  const a = clause('lexer#c1', { demandedBy: 'goal:g1' });
  const b = clause('lexer#c2', { demandedBy: 'goal:g2' });
  assert.deepStrictEqual(sortedComponents(cohesionComponents([a, b], ROOT)), [['lexer#c1'], ['lexer#c2']]);
});

check('two null demandedBy values never cohere with each other via (b) — null is not a shared value', () => {
  const a = clause('lexer#c1', { demandedBy: null });
  const b = clause('lexer#c2', { demandedBy: null });
  assert.deepStrictEqual(sortedComponents(cohesionComponents([a, b], ROOT)), [['lexer#c1'], ['lexer#c2']]);
});

// ── criterion (c): locus overlap below the component root ──────────────────

check('two clauses whose loci share a subdirectory BELOW the component root cohere', () => {
  const a = clause('lexer#c1', { locus: [`${ROOT}tokenizer/scan.mjs`] });
  const b = clause('lexer#c2', { locus: [`${ROOT}tokenizer/errors.mjs`] });
  assert.deepStrictEqual(sortedComponents(cohesionComponents([a, b], ROOT)), [['lexer#c1', 'lexer#c2']]);
});

check('two clauses whose loci are BOTH exactly the bare component root do not cohere via (c) — the root alone is excluded', () => {
  const a = clause('lexer#c1', { locus: [ROOT] });
  const b = clause('lexer#c2', { locus: [ROOT] });
  assert.deepStrictEqual(sortedComponents(cohesionComponents([a, b], ROOT)), [['lexer#c1'], ['lexer#c2']]);
});

check('two clauses with disjoint sub-paths below the root do not cohere via (c)', () => {
  const a = clause('lexer#c1', { locus: [`${ROOT}tokenizer/scan.mjs`] });
  const b = clause('lexer#c2', { locus: [`${ROOT}errors/report.mjs`] });
  assert.deepStrictEqual(sortedComponents(cohesionComponents([a, b], ROOT)), [['lexer#c1'], ['lexer#c2']]);
});

check('a clause with no locus at all contributes nothing to (c) (does not spuriously cohere)', () => {
  const a = clause('lexer#c1', { locus: [] });
  const b = clause('lexer#c2', { locus: [`${ROOT}tokenizer/scan.mjs`] });
  assert.deepStrictEqual(sortedComponents(cohesionComponents([a, b], ROOT)), [['lexer#c1'], ['lexer#c2']]);
});

check('a locus that does not start with componentRoot at all is treated as already-stripped (conservative fallback, never silently dropped)', () => {
  const a = clause('lexer#c1', { locus: ['some/other/path.mjs'] });
  const b = clause('lexer#c2', { locus: ['some/other/path.mjs'] });
  assert.deepStrictEqual(sortedComponents(cohesionComponents([a, b], ROOT)), [['lexer#c1', 'lexer#c2']]);
});

// ── transitivity and the disconnected (R4) case ─────────────────────────────

check('cohesion is transitive across DIFFERENT criteria: A~B via (a), B~C via (b) => {A,B,C} one component', () => {
  const provider = { component: 'ast', clause: 'ast#c1' };
  const a = clause('lexer#c1', { citations: [provider] });
  const b = clause('lexer#c2', { citations: [provider], demandedBy: 'goal:g1' });
  const c = clause('lexer#c3', { demandedBy: 'goal:g1' });
  assert.deepStrictEqual(sortedComponents(cohesionComponents([a, b, c], ROOT)), [['lexer#c1', 'lexer#c2', 'lexer#c3']]);
});

check('a delta with two genuinely disconnected clusters returns two components (R4 split payload)', () => {
  const provider1 = { component: 'ast', clause: 'ast#c1' };
  const provider2 = { component: 'eval', clause: 'eval#c1' };
  const a = clause('lexer#c1', { citations: [provider1] });
  const b = clause('lexer#c2', { citations: [provider1] });
  const c = clause('lexer#c3', { citations: [provider2] });
  const d = clause('lexer#c4', { citations: [provider2] });
  const result = sortedComponents(cohesionComponents([a, b, c, d], ROOT));
  assert.strictEqual(result.length, 2);
  assert.deepStrictEqual(result, [['lexer#c1', 'lexer#c2'], ['lexer#c3', 'lexer#c4']]);
});

check('every input clauseId appears in exactly one output component (partition property)', () => {
  const provider = { component: 'ast', clause: 'ast#c1' };
  const clauses = [
    clause('lexer#c1', { citations: [provider] }),
    clause('lexer#c2', { citations: [provider] }),
    clause('lexer#c3', { demandedBy: 'goal:solo' }),
  ];
  const components = cohesionComponents(clauses, ROOT);
  const flat = components.flat().sort();
  assert.deepStrictEqual(flat, ['lexer#c1', 'lexer#c2', 'lexer#c3']);
});

if (process.exitCode) console.error(`\natom-cohesion: FAILURES above (${passed} passed).`);
else console.log(`\natom-cohesion: all ${passed} checks pass. ✓`);
```

### Step 3: Run both to verify they fail for the right reason

Run: `node test/atom-lifecycle.test.mjs` and `node test/atom-cohesion.test.mjs`

Expected: a top-level throw / module-load error, something like `Cannot find module
'.../lib/atom.mjs'` — **not** an assertion failure inside a `check()`. If you see individual
`FAIL` lines instead of a load error, `lib/atom.mjs` already exists (stop and investigate — this
task is running out of order).

### Step 4: Commit

```bash
git add test/atom-lifecycle.test.mjs test/atom-cohesion.test.mjs
git commit -m "test(atom): lock the atom lifecycle + cohesion contract (red)"
```

## Acceptance Criteria
- [ ] Both test files exist and match the harness convention exactly
- [ ] Running either fails with a module-not-found error (RED for the right reason)
- [ ] Every edge in `interfaces.md`'s `LIFECYCLE_TRANSITIONS` table has at least one `check()`
      proving it valid, and every documented non-edge has one proving it invalid
- [ ] All three cohesion criteria, transitivity, and the disconnected (multi-component) case are
      each covered
- [ ] No file outside Scope was modified
- [ ] `lib/atom.mjs` was NOT created by this task
