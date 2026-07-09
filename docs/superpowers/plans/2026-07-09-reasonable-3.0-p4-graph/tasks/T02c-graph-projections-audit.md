# Task T02c: Graph projection audit (AUDIT)

**role: audit** — read-only adversarial review of T02a's tests AND T02b's implementation. You fix
nothing; findings become new tasks.

## References
- Read: `../shared/interfaces.md`, `../shared/architecture.md`
- Read: `docs/superpowers/specs/2026-07-09-reasonable-3.0-p4-graph-design.md` Decisions 1, 5, 6 and
  the "central scoping fact" section in full — the audit's job is partly to check the
  implementation against THIS reasoning, not just against the tests
- Read: `test/graph-projections.test.mjs`, the full current `lib/graph.mjs`, the diff T02b made to
  `lib/atom.mjs`
- Read: `docs/DESIGN-3.0.md` §2.4 (the as-lived/current split, "same ledger ⇒ same as-lived graph,"
  divergence "never silently absorbed")

## Dependencies
- Depends on: T02b. Depended on by: T03.

## Scope
No file modifications. Output = a findings report (your final message). You MAY run
`node test/graph-projections.test.mjs`, `node test/graph-containment.test.mjs`, `node
test/graph-edges.test.mjs`, and the full existing suite to verify claims — read-only execution, not
editing.

## Audit checklist

1. **`foldAsLived` never touches disk beyond the ledger file itself, checked in the code:** does
   `foldAsLived`'s implementation import or call anything from `lib/contract.mjs`? Any such call is
   a **critical** finding — the entire "as-lived is self-sufficient" claim (design doc's central
   scoping fact, DESIGN-3.0 §2.4) depends on this function reading nothing but
   `.reasonable/ledger.jsonl`.
2. **`deriveCurrent` genuinely uses the LIVE citation graph, not the ledger-native one:** read the
   import line and the call site — does `deriveCurrent` call the real `citationGraph` imported from
   `lib/contract.mjs` (aliased `liveCitationGraph`), or did the implementation accidentally reuse
   `ledgerCitationGraph` for both projections (which would make the whole disk-drift distinction
   this part exists to demonstrate silently vanish)?
3. **The disk-drift test, verified for real, not just "it passed":** re-run
   `test/graph-projections.test.mjs`'s "deriveCurrent sees a citation that exists ONLY in a landed,
   on-disk contract" check in isolation (or trace it by hand). Confirm the excludes edge really is
   present in `current.edges` and really is absent from `asLived.edges` — a test that happens to
   pass because BOTH sides show the edge (a weaker, less meaningful proof) would be a coverage gap
   worth flagging even though the assertion technically succeeded.
4. **`foldAtomFromEvents`/`foldAtomsFromEvents`, checked for behavior identity, not just existence:**
   confirm the renamed function's BODY is byte-for-byte the old `foldOneAtom`'s body (no logic
   change slipped in during the rename) and that `foldAtomsFromEvents` is genuinely `foldAtoms`'s
   old body minus its own `readJsonl` call — not a parallel reimplementation that could drift.
5. **Zero behavior change to `lib/atom.mjs`'s six existing I/O exports:** run
   `test/atom-ledger.test.mjs` and confirm every one of its checks still passes UNCHANGED — this is
   the single strongest evidence that `charterAtom`/`transitionAtom`/`authorDelta`/`enrichDelta`/
   `setFlag`/`clearFlag` were not touched by this diff (their internals all route through
   `loadAtom`, which now routes through the renamed function — any subtle behavior change there
   would show up as a regression here).
6. **`uptoSeq` bounding, checked at the boundary, not just "some seq":** does a test (or your own
   trace) confirm the boundary is inclusive (`e.seq <= uptoSeq`, an atom chartered exactly AT the
   cutoff seq is included) and that omitting `uptoSeq` folds the WHOLE ledger (not some default
   number that happens to work for small fixtures)?
7. **`graphDivergence`'s node-set claim, checked structurally:** the design doc claims node sets
   never diverge (both projections fold the same, whole ledger for atom state) — confirm no test
   silently assumes this without ever exercising a case where it COULD diverge (e.g., is there any
   code path where `foldAsLived`'s default `uptoSeq` and `deriveCurrent`'s always-whole-ledger fold
   could disagree on which atoms exist)? If `graphDivergence` always calls `foldAsLived(effortRoot)`
   with no `uptoSeq`, confirm that choice is deliberate and documented, not accidental.
8. **Sycophancy:** does any test assert something incidental (`Map`/`Set` iteration order, the exact
   internal field name of a folded atom record beyond what `interfaces.md` documents) rather than
   the documented contract?
9. **Zero regression, broadly:** run the full existing suite (see `../knowledge/running-tests.md`).
   Every file must pass exactly as before this task.
10. **Scope discipline:** does anything in this diff reach toward Part 5/6/7 concerns (deciding a
    verdict, applying a rewrite, reading `goals.json`/`policy.json` from disk, a frontier/dispatch
    concept)? Flag any such over-reach even if it doesn't break a test.

## Output format
```
AUDIT graph-projections: PASS | FINDINGS
- [gap|sycophant|defect|critical] <one-line> — <file:line> — proposed follow-up (new red test / impl fix)
```
Findings marked `gap` become new red tasks appended to this plan by the supervisor. A `critical`
finding (regression in any existing test file, the as-lived projection touching disk beyond the
ledger, or `deriveCurrent` silently reusing the ledger-native graph) blocks T03/T04 until resolved.
