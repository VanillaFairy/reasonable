# Task T03a: `requiredRoles` tests (red)

**Role:** `red` — you write ONLY the one failing test file below. Do NOT implement `requiredRoles`.

## References
- Read: `../shared/interfaces.md` §1.4 (the exact `requiredRoles(wave, context)` signature and its four
  role-toggling rules), `../shared/conventions.md`, `../shared/architecture.md`
- Read: `../knowledge/running-tests.md`
- Read: `docs/superpowers/specs/2026-07-11-reasonable-3.0-p7-frontier-design.md` Decision 9 (lazy,
  role-minimal provisioning) and Decision 10 (reuse over reimplement)
- Read: `lib/ceremony.mjs` **in full** — especially `rechartingDegenerates(amendmentBatch)` and
  `retroClassificationDegenerates(landedConeCount)`, both returning `{result:'materialize'}` or
  `{result:'degenerate', degeneracy:{type:'phase-degenerated', phase, reason, inputs}}`. You build
  fixtures that DRIVE these real functions (via `requiredRoles`), not mocks of them.
- Read: `test/atom-cohesion.test.mjs` (the by-hand fixture harness style)

## Dependencies
- Depends on: T03... actually T01b (module must exist), and reuses T02b's marker convention
- Depended on by: T03b (implements against these locked tests), T03c (audits them)

## Scope
**Files:**
- Create: `test/frontier-roles.test.mjs`

**BOUNDARY — you MUST NOT modify any files outside this list. In particular, do NOT edit
`lib/frontier.mjs` or `lib/ceremony.mjs`.**

## Positive Constraints (DO)
- Import `{ requiredRoles }` from `../lib/frontier.mjs` — RED here is an assertion failure
  (`requiredRoles` is `undefined`), since the file already exists (T01b/T02b) but has not yet appended
  the T03 section.
- Cover the **always-present core**: a single-atom, greenfield, no-amendment, single-cone wave returns
  exactly `['auditor', 'blind-test-writer', 'implementer']` (sorted).
- Cover **brownfield conditional roles**: `census`/`characterizer` join the set only when
  `context.brownfield === true` **and** `context.brownfieldInput` is a non-empty array; brownfield=true
  with an EMPTY `brownfieldInput` must NOT add them (the phase-degeneration discipline — empty input is
  a proven no-op, not a waived guard); brownfield=false with a non-empty `brownfieldInput` must NOT add
  them either (both halves of the AND matter).
- Cover **`topologist` re-chartering**: joins the set only when `context.amendmentBatch` is a non-empty
  array (drives `rechartingDegenerates` to `'materialize'`); an empty/absent `amendmentBatch` must NOT
  add it.
- Cover **`retro-synthesizer`**: joins the set only when `context.landedConeCount >= 2` (drives
  `retroClassificationDegenerates` to `'materialize'`); `0` or `1` must NOT add it.
- Cover **determinism + sortedness**: the returned array is always sorted (assert with a literal
  pre-sorted array, not `.sort()` on the actual output — a test that sorts before comparing can't catch
  an unsorted implementation).
- Cover a **maximal case**: all four conditions true at once → all seven roles present, sorted.

## Negative Constraints (DO NOT)
- Do NOT implement `requiredRoles`.
- Do NOT test `gateDue`/`ready`/`pack` (T01/T02, already locked).
- Do NOT touch the filesystem — hand-built fixtures only.
- Do NOT mock `rechartingDegenerates`/`retroClassificationDegenerates` — let the real `lib/ceremony.mjs`
  functions run (importing them here only to build INPUT fixtures that drive them through
  `requiredRoles`, never to call them directly and duplicate the logic under test).
- Do NOT modify any file outside Scope.

## Implementation Steps

### Step 1: Write `test/frontier-roles.test.mjs`

```js
// test/frontier-roles.test.mjs — lazy, role-minimal provisioning (DESIGN-3.0 §6 draft-five;
// reasonable 3.0 Part 7, interfaces.md §1.4). requiredRoles reuses lib/ceremony.mjs's
// phase-degeneration predicates applied to ROLE DISPATCH. Pure, zero-I/O.

import assert from 'node:assert';
import { requiredRoles } from '../lib/frontier.mjs';

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.stack || e.message}`); process.exitCode = 1; }
}

const wave = { atomIds: ['a-1'] };

// ── the always-present core ───────────────────────────────────────────────────

check('a single-atom greenfield wave with no amendments/brownfield/multi-cone needs only the core three roles', () => {
  const roles = requiredRoles(wave, {});
  assert.deepStrictEqual(roles, ['auditor', 'blind-test-writer', 'implementer']);
});

// ── brownfield (census/characterizer) — BOTH halves of the AND matter ────────

check('brownfield=true with a NON-EMPTY brownfieldInput adds census + characterizer', () => {
  const roles = requiredRoles(wave, { brownfield: true, brownfieldInput: ['legacy/foo.js'] });
  assert.deepStrictEqual(roles, [
    'auditor', 'blind-test-writer', 'census', 'characterizer', 'implementer',
  ]);
});

check('brownfield=true with an EMPTY brownfieldInput does NOT add census/characterizer (proven no-op)', () => {
  const roles = requiredRoles(wave, { brownfield: true, brownfieldInput: [] });
  assert.deepStrictEqual(roles, ['auditor', 'blind-test-writer', 'implementer']);
});

check('brownfield=false with a non-empty brownfieldInput does NOT add census/characterizer', () => {
  const roles = requiredRoles(wave, { brownfield: false, brownfieldInput: ['legacy/foo.js'] });
  assert.deepStrictEqual(roles, ['auditor', 'blind-test-writer', 'implementer']);
});

// ── topologist re-chartering ──────────────────────────────────────────────────

check('a non-empty amendmentBatch adds topologist (rechartingDegenerates materializes)', () => {
  const roles = requiredRoles(wave, { amendmentBatch: [{ component: 'lexer', clause: 'lexer#c1' }] });
  assert.deepStrictEqual(roles, ['auditor', 'blind-test-writer', 'implementer', 'topologist']);
});

check('an empty amendmentBatch does NOT add topologist', () => {
  const roles = requiredRoles(wave, { amendmentBatch: [] });
  assert.deepStrictEqual(roles, ['auditor', 'blind-test-writer', 'implementer']);
});

check('an absent amendmentBatch does NOT add topologist', () => {
  const roles = requiredRoles(wave, {});
  assert.ok(!roles.includes('topologist'));
});

// ── retro-synthesizer cross-cone classification ───────────────────────────────

check('landedConeCount >= 2 adds retro-synthesizer (retroClassificationDegenerates materializes)', () => {
  const roles = requiredRoles(wave, { landedConeCount: 2 });
  assert.deepStrictEqual(roles, ['auditor', 'blind-test-writer', 'implementer', 'retro-synthesizer']);
});

check('landedConeCount 0 or 1 does NOT add retro-synthesizer', () => {
  assert.deepStrictEqual(requiredRoles(wave, { landedConeCount: 0 }), ['auditor', 'blind-test-writer', 'implementer']);
  assert.deepStrictEqual(requiredRoles(wave, { landedConeCount: 1 }), ['auditor', 'blind-test-writer', 'implementer']);
});

// ── determinism + sortedness (assert against a LITERAL sorted array, never re-sort the output) ──

check('the returned array is always sorted, asserted against a literal', () => {
  const roles = requiredRoles(wave, { brownfield: true, brownfieldInput: ['x'] });
  assert.deepStrictEqual(roles, ['auditor', 'blind-test-writer', 'census', 'characterizer', 'implementer']);
});

// ── the maximal case: all four conditions true at once ────────────────────────

check('every conditional role fires together yields all seven roles, sorted', () => {
  const roles = requiredRoles(wave, {
    brownfield: true,
    brownfieldInput: ['legacy/foo.js'],
    amendmentBatch: [{ component: 'lexer', clause: 'lexer#c1' }],
    landedConeCount: 3,
  });
  assert.deepStrictEqual(roles, [
    'auditor', 'blind-test-writer', 'census', 'characterizer', 'implementer',
    'retro-synthesizer', 'topologist',
  ]);
});

if (process.exitCode) console.error(`\nfrontier-roles: FAILURES above (${passed} passed).`);
else console.log(`\nfrontier-roles: all ${passed} checks pass. ✓`);
```

### Step 2: Run the test to verify it fails for the right reason

Run: `node test/frontier-roles.test.mjs`

Expected: `FAIL` lines (assertion failures — `requiredRoles` is `undefined` in the T01+T02-only
`lib/frontier.mjs`), not a module-load error.

### Step 3: Commit

```bash
git add test/frontier-roles.test.mjs
git commit -m "test(frontier): lock requiredRoles — lazy role-minimal provisioning (red, P7)" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

## Acceptance Criteria
- [ ] `test/frontier-roles.test.mjs` exists and matches the harness convention exactly
- [ ] Running it fails with assertion failures (not a module-load error)
- [ ] The always-present core, both brownfield AND-halves, topologist, retro-synthesizer, sortedness,
      and the all-conditions-true maximal case are all covered
- [ ] No filesystem touched; no file outside Scope modified; `lib/frontier.mjs`/`lib/ceremony.mjs` NOT edited
