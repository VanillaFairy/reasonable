# Task T01c: Clause-id shape + allocator audit (AUDIT)

**role: audit** — read-only adversarial review of T01a's tests AND T01b's implementation. You fix
nothing; findings become new tasks.

## References
- Read: `../shared/interfaces.md`, `../shared/architecture.md` (especially the "no per-component
  counter, no persisted registry" reasoning)
- Read: `test/clause-id.test.mjs`, `lib/clause-id.mjs`, the diff T01b made to `lib/ledger.mjs`
- Read: `docs/DESIGN-3.0.md` §4.2, §15 findings R3-6 (allocation concurrency) and the "Identity
  undefined" R4 fatal finding

## Dependencies
- Depends on: T01b. Depended on by: T05.

## Scope
No file modifications. Output = a findings report (your final message). You MAY run
`node test/clause-id.test.mjs`, `node test/ledger.test.mjs`, `node test/ledger-effects.test.mjs`
to verify claims — read-only execution, not editing.

## Audit checklist

1. **Contract coverage:** for each rule in `interfaces.md`'s `lib/clause-id.mjs` contract — is
   there a `check()` that would FAIL if the rule were broken? In particular: does a test actually
   prove two allocations for the SAME component get different seqs (not just "different ids" by
   coincidence)? Does a test prove a malformed component allocation writes NOTHING to the ledger
   (not just that it returns `ok:false`)?
2. **The concurrency claim, checked for real:** `architecture.md` claims the ledger's existing
   append lock makes two concurrent `clause-allocated` allocations impossible to collide. Does
   `lib/clause-id.mjs`'s `allocateClauseId` actually route through `append()` (which takes the
   lock) for the allocation itself, or does it compute the id some other way that would reintroduce
   a race? Read the actual code, don't take the doc's word for it.
3. **No per-component counter, no persisted registry — confirmed, not just claimed:** does
   `allocateClauseId` do anything beyond calling `append()` once and formatting its returned seq
   (no read of prior events, no scan for "the max id so far")? Does anything in this diff write to
   a contract `.md` file, front matter, or any new `.reasonable/` file? Either would be scope creep
   beyond what this task specified — flag it even if tests still pass.
4. **`allocatedClauseIds` honesty:** does it actually fold `clause-allocated` events specifically
   (checked via `e.type`), or would it also (wrongly) pick up an unrelated event that happens to
   carry a `component` field (e.g. `enrichment`, `characterization`)? Construct this case mentally
   and check the code guards it.
5. **Sycophancy:** does any test assert something incidental (exact regex object identity, property
   enumeration order, the literal numeric value of a seq beyond "greater than the previous one")
   rather than the documented contract?
6. **Zero regression:** run `node test/ledger.test.mjs` and `node test/ledger-effects.test.mjs`.
   Both must pass exactly as before this task. Any change beyond the one specified `EVENT_SCHEMAS`
   line and its comment word is a **critical** finding — this task's premise is a minimal,
   surgical `lib/ledger.mjs` diff.
7. **Scope discipline:** does `lib/clause-id.mjs` reach toward Part 3/4 concerns (e.g. validating
   that a component actually exists as a contract file, resolving an id against a live registry)?
   Flag any such over-reach even if it doesn't break a test.

## Output format
```
AUDIT clause-id: PASS | FINDINGS
- [gap|sycophant|defect|critical] <one-line> — <file:line> — proposed follow-up (new red test / impl fix)
```
Findings marked `gap` become new red tasks appended to this plan by the supervisor. A `critical`
finding (regression in `test/ledger.test.mjs` or `test/ledger-effects.test.mjs`) blocks T05 until
resolved.
