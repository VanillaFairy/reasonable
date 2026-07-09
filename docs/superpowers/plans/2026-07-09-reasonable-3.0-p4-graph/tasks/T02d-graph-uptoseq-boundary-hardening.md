# Task T02d: `uptoSeq` inclusive-boundary hardening (T02c audit gap)

**Role:** test-hardening (append-only; not a full red/green/audit triad — the shipped implementation
is already correct, per T02c's own mutation check; this task closes a coverage gap, not a bug).

## References
- Read: T02c's audit finding (below) in full before touching anything.
- Read: `docs/superpowers/plans/2026-07-09-reasonable-3.0-p4-graph/shared/conventions.md`
- Read: `lib/graph.mjs`'s `foldAsLived` (the `uptoSeq` filter: `e.seq <= uptoSeq`)

## T02c's finding (verbatim)

> `[gap] uptoSeq inclusive-boundary claim (checklist item 6) is untested at the tight boundary —
> test/graph-projections.test.mjs:96-107 sets cutoffSeq to atom A's OWN last event (its
> authorDelta, well past its charter), then only asserts a DIFFERENT atom B chartered strictly
> after is excluded; it never checks A's folded shape (deltaClauses/state) at the cutoff, nor
> charters an atom exactly AT the cutoff seq. Confirmed by mutation: changing `lib/graph.mjs`'s
> `e.seq <= uptoSeq` to `e.seq < uptoSeq` leaves all 10 checks green — the off-by-one is invisible
> to this suite even though the current implementation is correct.**

## Dependencies
- Depends on: T02c (the audit that found this gap)
- Depended on by: T04 (version bump waits for this to land)

## Scope

**Files:**
- Modify: `test/graph-projections.test.mjs` (append ONE new `check()` — this is the one sanctioned
  exception to "never touch a locked test file": closing an audit-confirmed gap is exactly what
  this append-only task exists to do, mirroring Part 3's T01d precedent)

**BOUNDARY — you MUST NOT modify any existing `check()` call in this file, and MUST NOT touch any
other file. Do NOT modify `lib/graph.mjs` — the implementation is already correct.**

## Positive Constraints (DO)
- Add exactly one new test proving `foldAsLived`'s `uptoSeq` filter is inclusive at the tight
  boundary: charter an atom (capture the `atom-chartered` event's own seq via
  `Math.max(...readLedgerLines(root).map((e) => e.seq))` immediately after charting it, before any
  further events), then assert that atom IS present in `foldAsLived(root, {uptoSeq: thatSeq}).atoms`
  at that exact seq (not "well before," not "well after" — the atom's own charter event boundary).
- Run the file afterward and confirm all checks (the original 10 plus your new one) pass.

## Negative Constraints (DO NOT)
- Do NOT modify any of the existing 10 `check()` calls.
- Do NOT modify `lib/graph.mjs` — nothing here should turn red; this proves an already-true claim.
- Do NOT modify any file outside `test/graph-projections.test.mjs`.

## Implementation Steps

### Step 1: Append the new check

Add this `check()` call to `test/graph-projections.test.mjs`, near the existing `uptoSeq` test
(after the "foldAsLived at an earlier uptoSeq excludes atoms chartered after that seq" check):

```js
check('foldAsLived at uptoSeq exactly equal to an atom\'s OWN charter seq includes that atom (inclusive boundary)', () => {
  const root = newEffort();
  const { id } = charterAtom(root, { component: 'lexer', premises: ['ledger:1'], purpose: 'test atom', locus: [], order: 0 });
  const charterSeq = Math.max(...readLedgerLines(root).map((e) => e.seq));

  const atCutoff = foldAsLived(root, { uptoSeq: charterSeq });
  assert.deepStrictEqual(atCutoff.atoms.map((a) => a.id), [id]);

  const beforeCutoff = foldAsLived(root, { uptoSeq: charterSeq - 1 });
  assert.deepStrictEqual(beforeCutoff.atoms.map((a) => a.id), []);
});
```

(`charterAtom`, `readLedgerLines`, `newEffort`, `foldAsLived` are already imported/defined earlier
in this file — no new imports needed.)

### Step 2: Run the file and confirm all checks pass

Run: `node test/graph-projections.test.mjs`

Expected: `graph-projections: all 11 checks pass. ✓` (10 original + 1 new), zero `FAIL` lines.

### Step 3: Run the full suite to confirm zero regression

Run: `for t in test/*.test.mjs; do node "$t"; done` — all files pass, this is an append-only test
addition against already-correct code.

### Step 4: Commit

```bash
git add test/graph-projections.test.mjs
git commit -m "test(graph): pin foldAsLived's uptoSeq inclusive boundary (T02c audit gap)"
```

## Acceptance Criteria
- [ ] Exactly one new `check()` added; all 10 original checks byte-identical to before
- [ ] `node test/graph-projections.test.mjs` passes with 11/11 checks
- [ ] Full suite still passes with zero regressions
- [ ] No file outside `test/graph-projections.test.mjs` was modified
- [ ] `lib/graph.mjs` was NOT modified (the implementation was already correct)
