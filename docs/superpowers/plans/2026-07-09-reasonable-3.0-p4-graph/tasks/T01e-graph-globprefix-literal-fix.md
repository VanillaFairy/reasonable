# Task T01e: Fix `globPrefix`'s literal-path over-approximation (final-review finding)

**Role:** fix-with-test (a single small, well-understood correctness fix + its regression test —
not a full red/green/audit triad, since the bug and its fix are already independently verified and
precisely specified below).

## The finding (verbatim, from the final holistic review of the whole Part 4 branch)

> `excludesEdges`'s locus-overlap check silently over-approximates for this very repo's own
> directory layout — and the "mirrors footprint.mjs exactly" claim in three planning docs is
> false. `globPrefix` in `lib/graph.mjs` was copied from `lib/atom.mjs`'s already-shipped private
> `globPrefix`, which unconditionally strips a glob's trailing path segment. The *actual*
> `lib/footprint.mjs`'s `prefix()` only strips when a wildcard is present — a literal (non-glob)
> path is kept whole. Two atoms of different components, zero shared citations, whose loci are
> merely sibling literal files in the same directory (exactly this codebase's flat `lib/*.mjs`
> convention) get flagged `excludes`, where `footprint.mjs`'s real algorithm says independent.

Confirmed by reading `lib/footprint.mjs`'s real `prefix()`:
```js
function prefix(glob) {
  const g = norm(glob);
  const star = g.search(/[*?]/);
  const head = star === -1 ? g : g.slice(0, star);
  return head.replace(/\/[^/]*$/, (m) => (star === -1 ? m : '')); // keep dir part when wildcarded
}
```
When `star === -1` (no wildcard — a literal path), the replace callback returns `m` **unchanged**
— no stripping happens at all. `lib/graph.mjs`'s current `globPrefix` (and, pre-existing,
`lib/atom.mjs`'s own copy from Part 3) instead **always** strips the trailing segment regardless
of wildcard presence — a real behavioral divergence from the function it was documented as
mirroring, not a cosmetic difference.

**This is safe by the design's own stated tolerance** (§2.2: over-approximation "forfeits
parallelism, never correctness") — it never produces a wrong *edge absence*, only spurious
`excludes` edges — but it is a real, fixable defect in Part 4's own new code, worth correcting now
rather than compounding it. **Out of scope for this task:** `lib/atom.mjs`'s own copy of this same
bug (Part 3, already shipped) is a separate, pre-existing issue — not fixed here (fixing an
already-merged, already-reviewed Part 3 file is a different part's call to make; note it, don't
touch it).

## Dependencies
- Depends on: the final holistic review (this finding)
- Depended on by: — (last fix before merge to master)

## Scope

**Files:**
- Modify: `lib/graph.mjs` (the `globPrefix` function only, pure section)
- Modify: `test/graph-edges.test.mjs` (append one new regression test)

**BOUNDARY — you MUST NOT modify any other function in `lib/graph.mjs`, any existing `check()` in
`test/graph-edges.test.mjs`, or `lib/atom.mjs` (its own copy of this bug is explicitly out of
scope for this task).**

## Positive Constraints (DO)
- Fix `globPrefix` to conditionally strip only when a wildcard is present, exactly matching
  `lib/footprint.mjs`'s `prefix()` semantics (adapted to this file's existing signature — no
  `norm()` call needed here, since this file never received unnormalized paths in the first place;
  keep everything else about the function's shape identical).
- Add one new test proving the fix: two atoms of different components, zero shared citations,
  whose loci are distinct literal files in the same directory (e.g. `'lib/graph.mjs'` and
  `'lib/rewrite.mjs'`) — assert `excludesEdges` returns `[]` for that pair.
- Re-run every existing `check()` in `test/graph-edges.test.mjs` and `test/graph-containment.test.mjs`
  (which also exercises `excludesEdges`/`lociOverlap` indirectly is NOT the case — containment
  tests don't touch this function; but confirm anyway) to make sure the fix doesn't change any
  already-asserted outcome (the existing "overlapping loci" test uses a directory-vs-nested-file
  pair, which still overlaps correctly under the corrected logic — verify this by tracing it, not
  by assuming).

## Negative Constraints (DO NOT)
- Do NOT modify `lib/atom.mjs` — its identical, pre-existing copy of this bug is explicitly out of
  scope; note it in your report as a follow-up worth a future, separate fix, don't touch it here.
- Do NOT modify any existing `check()` in `test/graph-edges.test.mjs`.
- Do NOT modify any other function in `lib/graph.mjs`.

## Implementation Steps

### Step 1: Fix `globPrefix`

In `lib/graph.mjs`, find:

```js
function globPrefix(glob) {
  const star = glob.search(/[*?]/);
  const head = star === -1 ? glob : glob.slice(0, star);
  return head.replace(/\/[^/]*$/, '');
}
```

Replace with:

```js
function globPrefix(glob) {
  const star = glob.search(/[*?]/);
  const head = star === -1 ? glob : glob.slice(0, star);
  return head.replace(/\/[^/]*$/, (m) => (star === -1 ? m : ''));
}
```

### Step 2: Add the regression test

In `test/graph-edges.test.mjs`, add this check near the existing excludesEdges tests:

```js
check('two atoms with DISTINCT literal file loci in the SAME directory do not exclude on locus alone (no wildcard means no ancestor-directory truncation)', () => {
  const a = atom('a-1', 'lexer', [clause('lexer#c1', { locus: ['lib/graph.mjs'] })]);
  const b = atom('a-2', 'ast', [clause('ast#c1', { locus: ['lib/rewrite.mjs'] })]);
  const graph = ledgerCitationGraph([a, b]);
  assert.deepStrictEqual(excludesEdges([a, b], { citationGraph: graph }), []);
});
```

### Step 3: Trace the existing "overlapping loci" test against the fix

Read the existing check "two atoms of different components with OVERLAPPING loci exclude despite
disjoint citations" (both loci `'lib/shared/util.mjs'`, identical strings) and confirm: with the
fixed `globPrefix`, identical literal paths still produce `pa === pb` (same string in, same string
out when unstripped) — the `ga === gb` fallback check in `lociOverlap` also independently catches
exact-string-equality regardless. Confirm by running the test, not just by reasoning.

Also trace the directory-vs-nested-file test the T01a red agent added (`'lib/shared/'` vs
`'lib/shared/util.mjs'`) — `'lib/shared/'` has no wildcard, so under the fix it is now returned
**unchanged** (`'lib/shared/'`, not stripped to `'lib/shared'`); confirm the ancestor-prefix check
in `lociOverlap` (`(pa + '/').startsWith(pb + '/')` etc.) still detects this pair as overlapping —
trace it by hand or run the test, don't assume.

### Step 4: Run tests

Run `node test/graph-edges.test.mjs` and `node test/graph-containment.test.mjs` — all checks
(existing + your new one) must pass. Then run the full suite (`for t in test/*.test.mjs; do node
"$t"; done`) to confirm zero regressions.

### Step 5: Commit

```bash
git add lib/graph.mjs test/graph-edges.test.mjs
git commit -m "fix(graph): globPrefix must not strip a literal (non-wildcarded) locus's last segment"
```

## Acceptance Criteria
- [ ] `globPrefix` matches `lib/footprint.mjs`'s `prefix()` semantics (conditional strip on
      wildcard presence)
- [ ] New regression test added and passing; no existing check in either graph test file was
      modified or now fails
- [ ] Full suite passes with zero regressions
- [ ] `lib/atom.mjs` was NOT touched (its identical pre-existing bug is explicitly out of scope)
- [ ] No file outside `lib/graph.mjs` and `test/graph-edges.test.mjs` was modified
