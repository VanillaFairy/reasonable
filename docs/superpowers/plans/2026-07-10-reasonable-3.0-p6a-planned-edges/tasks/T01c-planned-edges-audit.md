# T01c — Planned-edge audit

**role:** audit
**Depends on:** T01b
**Owns:** nothing (read-only — report findings; do not edit code, tests, or docs)

> **Read first:** `../shared/interfaces.md`, `../shared/conventions.md`, and DESIGN-3.0 §2.2 (the two
> edge fidelities). You are the `audit` role: adversarially verify the T01a tests AND the T01b
> implementation. You have Bash for read-only verification (running tests, throwaway git checks). You
> **fix nothing** — you report gap findings, each of which becomes a new `red` task the supervisor
> schedules.

**The audit checklist — run each, report the result:**

- [ ] **Discriminator (teeth): the tests must fail without the implementation.** The tests are
  meaningless if they pass against a stub. Verify:
  ```bash
  git stash                       # set aside nothing if tree is clean; else confirm scope first
  git show HEAD~1:lib/graph.mjs > /tmp/graph-preP6a.mjs 2>/dev/null || true
  ```
  Simpler and definitive: temporarily replace the body of `plannedNeedsEdges` with `return [];` in a
  scratch copy and confirm **multiple checks FAIL** (they must — the cross/intra/combined cases all
  expect non-empty output). A test suite that still passes against `return []` has no teeth. Restore.
  Report: how many checks fail against the empty stub (expect the majority; only the "empty/single",
  "self-edge", and the degenerate no-edge cases survive).

- [ ] **Bidirectional §2.2 mapping.** Walk both directions and report any unmapped item:
  - **Every assertion → a §2.2 clause.** Each `check()` pins either (a) the cross-component quotient,
    (b) the intra-component order strata, dedup, the shape, or a documented degeneracy. Flag any test
    that pins something §2.2 does **not** say (an over-fitted golden the spec leaves open).
  - **Every §2.2 (planned-edge) clause → an assertion.** The quotient ("every atom of component B"),
    the intra-component ordering, and the planned/actual shape-parity are each covered. Flag any §2.2
    planned-edge requirement with **no** test. (Known-and-correct scope boundary, not a gap: `excludes`,
    `serves`, `informs` planned edges are **not** in P6a — §2.2 planned fidelity is `needs`-only;
    do not flag their absence.)

- [ ] **Adversarial gap hunt — propose failing cases the suite misses.** Actively try to break the
  implementation. Candidates to check the suite covers (add a finding for any it misses):
  - a charter whose `premises` field is **absent** (not `[]`) — does `c.premises || []` hold?
  - a `cite:` premise with **uppercase** or malformed component (`cite:Lexer#c1`) — `parseClauseId`
    returns null (lowercase-only), so no edge; is that the intended, tested behavior?
  - **three or more** components in a citation chain (parser→ast→lexer) — the quotient is direct, not
    transitive; confirm no transitive planned edge is emitted (parser cites ast only ⇒ no parser→lexer).
  - a component with **non-contiguous** order values (0, 5, 9) — strata are by distinct value, so
    5-needs-0 and 9-needs-5; confirm the "immediate predecessor stratum" holds under gaps.

- [ ] **Purity + Law 1.** Confirm `plannedNeedsEdges` reads no disk, calls no `append()`, imports
  nothing I/O-bearing, and that the only new import is the pure `parseClauseId`. Confirm `lib/` stays
  dependency-free (no third-party import).

- [ ] **Regression + additivity.** Run the full suite:
  ```bash
  for t in test/*.test.mjs; do node "$t"; done
  ```
  Confirm no `FAIL` anywhere and that **no existing function in `graph.mjs` changed behavior** (P6a is
  additive — `needsEdges`, `deriveCurrent`, `foldAsLived`, `graphDivergence` are untouched).

**Report format:** a short list of findings, each `CONFIRMED` (reproduced) or `PLAUSIBLE`, with the
concrete input → wrong/ missing output. If the suite is clean and the mapping is total, say so plainly
— an empty findings list is the correct result for a solid triad. Any confirmed gap becomes a new
`red` task (T01a-2, …) the supervisor dispatches before T02.
