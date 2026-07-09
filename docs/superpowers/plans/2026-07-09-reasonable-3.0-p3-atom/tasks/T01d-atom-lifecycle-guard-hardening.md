# Task T01d: Lifecycle table + prototype-guard hardening

**Role:** test-hardening (not a red/green/audit triad — the T01c audit confirmed the shipped
implementation is already correct; this task adds proof, not a behavior change, mirroring how
Part 2's T01d closed an analogous audit gap).

## Why this task exists

The T01c audit (read-only, adversarial) found two non-critical `gap` findings against
`test/atom-lifecycle.test.mjs`, both confirmed by hand-injecting a bug and observing the existing
suite fail to catch it:

1. **No independent table pin.** The suite derives its oracle from the same
   `LIFECYCLE_TRANSITIONS` object it's testing (`isValidTransition` and `LIFECYCLE_TRANSITIONS`
   cross-checked against each other, not against an independently-authored expected shape), and
   only spot-checks a few "reverse of forward" near-misses rather than every one. The audit
   confirmed a hand-injected `packed: [...,'merged']` bug (a spurious extra edge) passes every
   existing `check()` unmodified.
2. **The `Object.hasOwn` guard has zero targeted coverage.** Existing malformed-input checks cover
   `'bogus'`/`null`/`undefined`/`42`/`{}`, none of which would catch a regression to the
   superficially-safe-but-wrong `(LIFECYCLE_TRANSITIONS[from] || []).includes(to)` idiom — which
   passes `'bogus'` but throws on `'__proto__'`. This repo already has this exact defect-class
   pattern in `test/ledger.test.mjs` (following commit `39459d1`); this file didn't mirror it.

## References
- Read: `../shared/conventions.md`, `../shared/interfaces.md`
- Read: `test/atom-lifecycle.test.mjs` in full (you are appending to it, not rewriting it)
- Read: `lib/atom.mjs`'s `LIFECYCLE_TRANSITIONS`/`isValidTransition` (already correct — confirm,
  don't change)
- Read: `test/ledger.test.mjs` lines ~474–487 (the established `Object.hasOwn`-defect-class test
  pattern this task mirrors)

## Dependencies
- Depends on: T01c (the audit that found these gaps), T01b (the real implementation)
- Depended on by: T04 (must be landed and clean before the final version bump)

## Scope

**Files:**
- Modify: `test/atom-lifecycle.test.mjs` (append-only — add new `check()` calls; do not remove or
  alter any existing one)

**BOUNDARY — you MUST NOT modify any files outside this list. Do NOT touch `lib/atom.mjs` — the
audit confirmed the implementation is already correct; this task proves it, it does not change it.**

## Positive Constraints (DO)
- Add a `check()` that asserts `LIFECYCLE_TRANSITIONS` equals an independently-typed-out literal
  object (not derived from importing and echoing the same constant back — write out the full
  expected table by hand, from `../shared/interfaces.md`, so a spurious edge added to the real
  table would make this specific assertion fail even if every other check in the file still
  passed).
- Add explicit `check()`s for the four previously-uncovered direct-reverse pairs: `isValidTransition('ready',
  'chartered')`, `isValidTransition('packed', "spec'd")`, `isValidTransition('tests-red', 'packed')`,
  `isValidTransition('green', 'tests-red')` — all must be `false`.
- Add a `check()` proving the `Object.hasOwn` guard against prototype-shadowing inputs:
  `isValidTransition('__proto__', 'ready')`, `isValidTransition('constructor', 'ready')`,
  `isValidTransition('toString', 'ready')`, `isValidTransition('hasOwnProperty', 'ready')` — all
  must be `false`, not throw.
- Verify your new checks actually catch the two bugs the audit hand-injected: temporarily
  reproduce each bug locally (a spurious `packed -> merged` edge; the bare
  `(LIFECYCLE_TRANSITIONS[from] || []).includes(to)` idiom instead of the `Object.hasOwn` guard),
  confirm your new checks fail against the buggy version, then revert — this is how you confirm
  the new tests have real teeth, not just cosmetic coverage. Do not leave the bug in place; do not
  commit any change to `lib/atom.mjs`.

## Negative Constraints (DO NOT)
- Do NOT modify `lib/atom.mjs` — nothing here is a behavior change.
- Do NOT modify `test/atom-cohesion.test.mjs` or any other test file.
- Do NOT remove, weaken, or reorder any existing `check()` in `test/atom-lifecycle.test.mjs`.
- Do NOT modify any file outside the Scope section.

## Implementation Steps

### Step 1: Read the current file and the real implementation

Read `test/atom-lifecycle.test.mjs` and `lib/atom.mjs` in full.

### Step 2: Append the new checks

Add these `check()` calls near the end of `test/atom-lifecycle.test.mjs`, before the final
`if (process.exitCode) ...` summary block:

```js
// ── T01d: independent table pin + prototype-guard hardening (T01c audit gap) ──

check('LIFECYCLE_TRANSITIONS matches an independently-authored expected table exactly (not self-referential)', () => {
  assert.deepStrictEqual(LIFECYCLE_TRANSITIONS, {
    chartered:         ['ready'],
    ready:             ["spec'd"],
    "spec'd":          ['packed', 'ready', 'retired-pending'],
    packed:            ['tests-red', 'ready', 'retired-pending'],
    'tests-red':       ['green', 'ready', 'retired-pending'],
    green:             ['audited', 'ready', 'retired-pending'],
    audited:           ['merged', 'ready', 'retired-pending'],
    merged:            [],
    'retired-pending': ['retired'],
    retired:           [],
  });
});

check('the four previously-implicit direct-reverse pairs are each invalid', () => {
  assert.strictEqual(isValidTransition('ready', 'chartered'), false);
  assert.strictEqual(isValidTransition('packed', "spec'd"), false);
  assert.strictEqual(isValidTransition('tests-red', 'packed'), false);
  assert.strictEqual(isValidTransition('green', 'tests-red'), false);
});

check('isValidTransition guards against Object.prototype-shadowing "from" values (never throws, never resolves to an inherited member)', () => {
  assert.strictEqual(isValidTransition('__proto__', 'ready'), false);
  assert.strictEqual(isValidTransition('constructor', 'ready'), false);
  assert.strictEqual(isValidTransition('toString', 'ready'), false);
  assert.strictEqual(isValidTransition('hasOwnProperty', 'ready'), false);
});
```

### Step 3: Prove the new checks have teeth (do this locally, revert before committing)

1. Temporarily edit your local `lib/atom.mjs` copy: add `'merged'` to the `packed` array in
   `LIFECYCLE_TRANSITIONS`. Run `node test/atom-lifecycle.test.mjs` — the new "independently-
   authored expected table" check must now FAIL. Revert the edit.
2. Temporarily edit `isValidTransition` to the bare, unguarded form:
   `return (LIFECYCLE_TRANSITIONS[from] || []).includes(to);` (remove the `Object.hasOwn` line).
   Run `node test/atom-lifecycle.test.mjs` — the new prototype-guard check must now FAIL (it will
   throw or misbehave on `'__proto__'`). Revert the edit.
3. Confirm `git diff lib/atom.mjs` is empty before proceeding — you must not commit any change to
   this file.

### Step 4: Run the locked test to verify it passes against the real (unmodified) implementation

Run: `node test/atom-lifecycle.test.mjs`

Expected: `atom-lifecycle: all <N> checks pass. ✓` (N now larger than before — 19 + 3 new checks),
zero `FAIL` lines.

### Step 5: Run the existing suite to confirm zero regression

Run every existing test file (see `../knowledge/running-tests.md`).

### Step 6: Commit

```bash
git add test/atom-lifecycle.test.mjs
git commit -m "test(atom): pin the lifecycle table independently + prove the prototype guard (T01c audit gap)"
```

## Acceptance Criteria
- [ ] `test/atom-lifecycle.test.mjs` has the three new `check()` calls, appended (not replacing
      anything existing)
- [ ] `node test/atom-lifecycle.test.mjs` passes with zero failures against the real, unmodified
      `lib/atom.mjs`
- [ ] The full existing suite still passes with zero failures
- [ ] `lib/atom.mjs` was NOT modified (confirmed via `git diff` showing no changes to it)
- [ ] You verified locally (per Step 3) that each new check actually catches the bug it's meant to
      catch, then reverted before committing
- [ ] No file outside Scope was modified
