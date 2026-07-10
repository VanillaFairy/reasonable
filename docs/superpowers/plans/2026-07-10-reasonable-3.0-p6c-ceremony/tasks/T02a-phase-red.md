# T02a — Phase-degeneration predicate tests (red) — THE MANDATED PIN

**role:** red
**Depends on:** —
**Owns (stage only these):** `test/ceremony-phase.test.mjs`

> **Read first:** `../shared/interfaces.md` (§B — the three predicate signatures, the `Result` union,
> the degeneracy record, the outer-shell boundary and its flagged residue), `../shared/conventions.md`
> (the standalone-Node pure harness; assert the conservative *decision*, not a golden), DESIGN-3.0 §5.4
> (the phase-degeneration predicate — the roadmap's explicit "must pin it, not leave it prose"), and the
> plan's **Flagged calls** + **The mandated-pin discipline** sections. You are the `red` role: **write
> the failing tests only. Do not implement `lib/ceremony.mjs`.**
>
> **This is the mandated pin.** Decision 5 is the one place a struggling autonomous run could talk
> itself out of a scaffold, so your tests must be **unusually adversarial** — pin the *conservative,
> never-under-fires* property **directly**: a genuinely new goal cone MUST materialize; an amendment-only
> change with no new atoms/goals MUST degenerate; both "outer shell" edges MUST materialize.

**Files:**
- Create: `test/ceremony-phase.test.mjs`

- [ ] **Step 1: Write the failing test file**

Write `test/ceremony-phase.test.mjs` with exactly this content:

```js
// test/ceremony-phase.test.mjs — the phase-degeneration predicates (DESIGN-3.0 §5.4, reasonable 3.0
// Part 6c) — THE MANDATED PIN: the roadmap requires this pinned MECHANICALLY, not left as prose. Three
// pure predicates over the genesis graph, each returning a materialize/degenerate RESULT (never a silent
// skip). The adversarial spine is the CONSERVATIVE property: a genuinely new goal cone MUST materialize;
// an amendment-only change with no new atoms/goals MUST degenerate; the "outer shell" boundary must
// never under-fire. Pure, zero-I/O — genesis/lastRatified snapshots are hand-built.
import assert from 'node:assert';
import { scaffoldMaterializes, rechartingDegenerates, retroClassificationDegenerates } from '../lib/ceremony.mjs';

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.stack || e.message}`); process.exitCode = 1; }
}

// A snapshot: { goals:[readGoals-shaped], atoms:[charter-shaped] }. A goal's scenarioCitations name the
// component(s) that provide its scenario (the depth-0 boundary, at genesis component fidelity).
const goal = (id, citeComponents = []) => ({ id, scenario: `${id} scenario`, scenarioCitations: citeComponents.map((c) => ({ component: c, clause: `${c}#c1` })) });
const atom = (id, component) => ({ id, component, premises: [], purpose: 'x', locus: [], order: 0 });
const materialized = { result: 'materialize' };

// ── scaffoldMaterializes: introduces-a-new-goal-cone (THE conservative property, attacked head-on) ──

check('a genuinely NEW goal cone materializes the scaffold, everything else held constant', () => {
  const last = { goals: [goal('g1', ['lexer'])], atoms: [atom('a-1', 'lexer')] };
  const genesis = { goals: [goal('g1', ['lexer']), goal('g2', ['lexer'])], atoms: [atom('a-1', 'lexer')] }; // g2 new, NO new atom
  assert.deepStrictEqual(scaffoldMaterializes(genesis, last, ['lexer']), materialized);
});

check('the FIRST genesis (empty lastRatified) always materializes — its goals are all new', () => {
  const genesis = { goals: [goal('g1', ['lexer'])], atoms: [atom('a-1', 'lexer')] };
  assert.deepStrictEqual(scaffoldMaterializes(genesis, { goals: [], atoms: [] }, []), materialized);
});

// ── scaffoldMaterializes: touches-the-outer-shell (both edges must materialize) ──────────────────

check('a newly-chartered atom in a NOT-yet-skeletonized component materializes (a new top-level component)', () => {
  const last = { goals: [goal('g1', ['lexer'])], atoms: [atom('a-1', 'lexer')] };
  const genesis = { goals: [goal('g1', ['lexer'])], atoms: [atom('a-1', 'lexer'), atom('a-2', 'parser')] }; // parser not in skeleton
  assert.deepStrictEqual(scaffoldMaterializes(genesis, last, ['lexer']), materialized);
});

check('a newly-chartered depth-0 provider of a goal scenario materializes even if its component IS skeletonized', () => {
  const last = { goals: [goal('g1', ['lexer'])], atoms: [atom('a-1', 'lexer')] };
  // a-2 is a new atom in 'lexer' (already skeletonized) but 'lexer' is named by g1's scenarioCitations → depth-0 provider
  const genesis = { goals: [goal('g1', ['lexer'])], atoms: [atom('a-1', 'lexer'), atom('a-2', 'lexer')] };
  assert.deepStrictEqual(scaffoldMaterializes(genesis, last, ['lexer']), materialized);
});

check('the depth-0 boundary reads a bare-clause citation (no explicit component) via a local split', () => {
  const g = { id: 'g1', scenario: 's', scenarioCitations: [{ clause: 'lexer#c1' }] }; // no citation.component
  const last = { goals: [g], atoms: [atom('a-1', 'lexer')] };
  const genesis = { goals: [g], atoms: [atom('a-1', 'lexer'), atom('a-2', 'lexer')] };
  assert.deepStrictEqual(scaffoldMaterializes(genesis, last, ['lexer']), materialized);
});

// ── scaffoldMaterializes: DEGENERATES only wholly inside an already-skeletonized, non-shell cone ──

check('an amendment-only change (no new goal, no new atom) DEGENERATES with an evaluated-inputs record', () => {
  const snap = { goals: [goal('g1', ['lexer'])], atoms: [atom('a-1', 'lexer')] };
  const r = scaffoldMaterializes(snap, snap, ['lexer']);
  assert.strictEqual(r.result, 'degenerate');
  assert.strictEqual(r.degeneracy.type, 'phase-degenerated');
  assert.strictEqual(r.degeneracy.phase, 'scaffold');
  assert.deepStrictEqual(r.degeneracy.inputs, { newGoalIds: [], shellAtomIds: [] }); // ran-and-found-nothing
  assert.strictEqual(typeof r.degeneracy.reason, 'string');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(r)), r); // JSON-serializable (P7 appends it)
});

check('a new atom wholly inside an already-skeletonized, NON-scenario-cited component degenerates (interior)', () => {
  const last = { goals: [goal('g1', ['lexer'])], atoms: [atom('a-1', 'lexer')] };
  // a-2 is new but in 'io' (skeletonized) and 'io' is NOT named by any scenarioCitation → interior
  const genesis = { goals: [goal('g1', ['lexer'])], atoms: [atom('a-1', 'lexer'), atom('a-2', 'io')] };
  assert.strictEqual(scaffoldMaterializes(genesis, last, ['lexer', 'io']).result, 'degenerate');
});

check('conservative: an empty/degenerate snapshot never throws — it degenerates', () => {
  assert.strictEqual(scaffoldMaterializes(undefined, undefined, undefined).result, 'degenerate');
  assert.strictEqual(scaffoldMaterializes({}, {}, []).result, 'degenerate');
});

// ── rechartingDegenerates: empty amendment batch ⇔ degenerate ────────────────────────────────────

check('a non-empty amendment batch materializes; an empty one degenerates', () => {
  assert.deepStrictEqual(rechartingDegenerates([{ id: 'am-1' }]), materialized);
  const r = rechartingDegenerates([]);
  assert.strictEqual(r.result, 'degenerate');
  assert.strictEqual(r.degeneracy.type, 'phase-degenerated');
  assert.strictEqual(r.degeneracy.phase, 'recharter');
  assert.deepStrictEqual(r.degeneracy.inputs, { amendmentCount: 0 });
});

check('a non-array (absent) amendment batch degenerates, never throws', () => {
  assert.strictEqual(rechartingDegenerates(undefined).result, 'degenerate');
});

// ── retroClassificationDegenerates: <= 1 landed cone ⇔ degenerate ────────────────────────────────

check('a goal gate spanning >= 2 landed cones materializes; <= 1 degenerates', () => {
  assert.deepStrictEqual(retroClassificationDegenerates(2), materialized);
  assert.deepStrictEqual(retroClassificationDegenerates(5), materialized);
  assert.strictEqual(retroClassificationDegenerates(1).result, 'degenerate');
  assert.strictEqual(retroClassificationDegenerates(0).result, 'degenerate');
});

check('a non-finite landed-cone count is treated as 0 (degenerates), never throws', () => {
  const r = retroClassificationDegenerates(undefined);
  assert.strictEqual(r.result, 'degenerate');
  assert.strictEqual(r.degeneracy.phase, 'retro-classification');
  assert.strictEqual(r.degeneracy.inputs.landedConeCount, 0);
});

if (process.exitCode) console.error(`\nceremony-phase: FAILURES above (${passed} passed).`);
else console.log(`\nceremony-phase: all ${passed} checks pass. ✓`);
```

- [ ] **Step 2: Run it to verify it fails for the right reason**

Run: `node test/ceremony-phase.test.mjs`
Expected: **the import fails** because `lib/ceremony.mjs` either does not exist yet or does not export
the phase predicates — a module-not-found error, or `scaffoldMaterializes is not a function`. Either is
the correct red: the tests fail because the predicates are absent, not because an assertion is wrong.
(If T01b has already created `lib/ceremony.mjs` with only `classify`, the import of the three predicates
yields `undefined` and the first call throws — still the correct red.)

- [ ] **Step 3: Commit**

```bash
git add test/ceremony-phase.test.mjs
git commit -m "test(ceremony): phase-degeneration predicates — the mandated pin, conservative-never-under-fires (red, P6c)"
```

**Do not implement anything.** The `green` task (T02b) makes these pass.
