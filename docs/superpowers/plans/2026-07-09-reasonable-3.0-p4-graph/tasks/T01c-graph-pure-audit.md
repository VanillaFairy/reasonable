# Task T01c: Graph pure-function audit (AUDIT)

**role: audit** — read-only adversarial review of T01a's tests AND T01b's implementation. You fix
nothing; findings become new tasks.

## References
- Read: `../shared/interfaces.md`, `../shared/architecture.md`
- Read: `docs/superpowers/specs/2026-07-09-reasonable-3.0-p4-graph-design.md` Decisions 2, 3, 4, 7,
  8 in full — the audit's job is partly to check the implementation against THIS reasoning, not
  just against the tests
- Read: `test/graph-containment.test.mjs`, `test/graph-edges.test.mjs`, `lib/graph.mjs`
- Read: `docs/DESIGN-3.0.md` §2.1 (containment), §2.2 (the four edge kinds, "same-contract atoms
  always serialize"), §2.3 (edge lifting), §15 (draft one's vacuous wave-packing-footprint
  cohesion mistake — the same class of defect this audit must rule out for `excludes`)

## Dependencies
- Depends on: T01b. Depended on by: T03.

## Scope
No file modifications. Output = a findings report (your final message). You MAY run
`node test/graph-containment.test.mjs`, `node test/graph-edges.test.mjs`, and the full existing
suite to verify claims — read-only execution, not editing.

## Audit checklist

1. **Contract coverage — containment:** does a `check()` exist for the flat fallback, an
   ownership-map override at both one and two segments, and a component absent from a supplied map?
   Is the "shared prefix reused, not duplicated" property (two atoms under nested paths sharing an
   ancestor segment) actually asserted structurally, not just eyeballed from a printed tree?
2. **Contract coverage — edge lifting:** cross-child lift, same-kind dedup, different-kind
   separation, within-child non-lift, unknown view id, single-child view, and a non-root view are
   all covered. Is dedup checked with a REAL duplicate (two distinct underlying edges of the same
   kind between the same pair), not just a single edge that happens to pass?
3. **`excludes` is not vacuous, checked for real:** DESIGN-3.0 §15 records draft one's cohesion
   relation being vacuously true for every pair under one contract. Confirm `excludesEdges` is NOT
   the mirror mistake — i.e., that a `citationClosureOver` call over a genuinely EMPTY graph (`{}`)
   does not silently make every atom pair `excludes` each other regardless of contents (trace
   through: does an atom with a distinct component and no citations produce a footprint disjoint
   from another such atom's, per the "two atoms of different components with no shared citation
   closure and disjoint loci do not exclude" test — and does the implementation's code path
   actually reach that `false` outcome, not just the test's assertion)?
4. **`excludes` symmetry, checked in the code, not just one test:** does `excludesEdges` ever
   produce BOTH `(a,b)` and `(b,a)` for the same underlying pair (a duplicate, direction-flipped
   entry) under any input order? Read the nested-loop bounds (`j = i + 1`, not `j = 0`) to confirm
   structurally, not just from the one ordering test.
5. **`needsEdges` self-loop and dedup, checked in the code:** does the `providerId === atom.id`
   guard actually exist in the shipped code (not just asserted by a test that happens not to
   exercise a trickier shape, e.g. two DIFFERENT clauses in one atom's delta where one cites the
   other)? Construct that case mentally (or via a throwaway script) and confirm no self-loop.
6. **`servesEdges` genuinely reuses `needsEdges`, not a parallel reimplementation:** read the code —
   does `servesEdges` call the real, exported `needsEdges` function, or does it duplicate a second,
   independent citation-walking loop? A second implementation is a parity risk this design
   explicitly wanted to avoid (see `interfaces.md`'s doc comment on `servesEdges`).
7. **No component-slug search, no disk read, anywhere in this file:** confirm no function here
   calls `readFileSync`/`existsSync`/imports `node:fs` or any `lib/*.mjs` module — the whole point
   of this section is that it's 100% pure. Any I/O reach is a **critical** finding (it would mean
   T02b's later ledger-native/live split, which depends on this section staying disk-free, is
   already broken).
8. **Sycophancy:** does any test assert something incidental (`Map`/`Set` iteration order beyond
   what a `.sort()` already normalizes, an internal helper function name never in `interfaces.md`)
   rather than the documented contract?
9. **Zero regression:** run the full existing suite (see `../knowledge/running-tests.md`). Every
   file must pass exactly as before this task — `lib/graph.mjs` is a brand-new, zero-import file
   that nothing else in the repo yet references.
10. **Scope discipline:** does `lib/graph.mjs`'s pure section reach toward T02's I/O concerns (an
    `import` of `lib/atom.mjs`/`lib/contract.mjs`/`lib/ledger.mjs`, an `effortRoot`-taking
    function)? Any such reach is a **critical** finding — the pure/I/O split is load-bearing for
    this plan's later one-file, two-task structure to hold together (mirroring Part 3's own
    T01c/T02b split).

## Output format
```
AUDIT graph-pure: PASS | FINDINGS
- [gap|sycophant|defect|critical] <one-line> — <file:line> — proposed follow-up (new red test / impl fix)
```
Findings marked `gap` become new red tasks appended to this plan by the supervisor. A `critical`
finding (regression in the existing suite, I/O leaking into the pure section, or a vacuous/
duplicate-producing edge computation) blocks T02a/T02b until resolved.
