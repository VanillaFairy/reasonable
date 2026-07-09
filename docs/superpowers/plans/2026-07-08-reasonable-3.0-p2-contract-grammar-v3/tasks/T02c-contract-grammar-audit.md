# Task T02c: Contract grammar v3 audit (AUDIT)

**role: audit** — read-only adversarial review of T02a's tests AND T02b's implementation
(including the `test/contract.test.mjs` migration). You fix nothing; findings become new tasks.

## References
- Read: `../shared/interfaces.md`, `../shared/architecture.md`
- Read: `test/contract-v3-grammar.test.mjs`, `test/contract.test.mjs`, `lib/contract.mjs`
- Read: `docs/DESIGN-3.0.md` §4.2, §4.3 (the cohesion relation this grammar feeds, to sanity-check
  nothing here silently drifts from what it will need to read), §12, §15 findings R3-5, R3-6, and
  the "Identity undefined" R4 row

## Dependencies
- Depends on: T02b. Depended on by: T05.

## Scope
No file modifications. Output = a findings report (your final message). You MAY run
`node test/contract-v3-grammar.test.mjs`, `node test/contract.test.mjs`,
`node test/clause-id.test.mjs` to verify claims — read-only execution, not editing.

## Audit checklist

1. **Contract coverage:** for each rule in `interfaces.md`'s new `lib/contract.mjs` surface — is
   there a `check()` (in either test file) that would FAIL if the rule were broken? In particular:
   is there a test proving a `§N` heading produces **zero** clauses (not just that a v3 heading
   parses correctly — the absence of the old behavior is the actual breaking-change claim, and
   needs its own positive proof)?
2. **The migration's honesty:** diff `test/contract.test.mjs` against what it looked like before
   this task (available in `git log -p` / `git show` on the previous commit). Confirm EVERY
   non-heading, non-citation-placement, non-id-string line is byte-for-byte identical — no
   assertion was loosened, removed, or reworded to make the migration "easier." Confirm the check
   count is unchanged (10 before, 10 after).
3. **Citation attachment correctness:** construct (mentally, or by reading the test) a contract
   with TWO clauses where only the FIRST cites something. Does the implementation ever leak that
   citation onto the second clause, or into a citation issued before the `CLAUSE_RE` match that set
   `current`? Read the actual loop order in `parseContract()` — citations/demanded-by/provenance
   parsing all happen inside `if (current)`, guarded correctly only if `current` is reassigned
   exactly at each heading.
4. **`demanded-by` tag-vocabulary fidelity:** does `DEMANDED_BY_TAGS` exactly match the four tags
   architecture.md names (`goal`, `gate`, `cite`, `ledger` — no more, no fewer, no typos)? Does the
   regex actually anchor the tag (i.e. would a clause with `- Demanded-by: goalish:x` wrongly
   match `goal`'s prefix)? Try this case against the real regex, don't just read it and assume.
5. **`missingDemandedBy` / `danglingCitations` parity:** both are structurally similar
   (parse-permissively, audit separately). Does `missingDemandedBy` follow the exact same shape
   conventions as the pre-existing `danglingCitations` (plain array, no envelope, iterates
   `allComponents`)? Any unexplained divergence is worth flagging even if not wrong.
6. **Zero collateral change:** confirm `citationGraph`, `citationClosure`, `danglingCitations`,
   `parseFrontmatter`, `contractsDir`, `contractPath`, `loadContract`, `allComponents`, the seam-
   parsing helpers, `PROVENANCE_RE`, `SUPERSESSION_RE`, `SEAM_RE` are **byte-for-byte** identical to
   the pre-Part-2 version (`git show <prev-commit>:lib/contract.mjs`). Any unexplained textual
   diff in these is a finding, even if behavior is unaffected.
7. **Sycophancy:** does any test assert on incidental behavior (property enumeration order, exact
   array ordering not documented as significant) rather than the documented contract?
8. **Scope discipline:** does anything in this diff reach toward §4.3's actual cohesion-graph
   computation (e.g. computing "coherence" between two clauses, resolving whether a `demanded-by`
   reference is real) rather than just parsing/validating shape? Flag any such over-reach.

## Output format
```
AUDIT contract-grammar-v3: PASS | FINDINGS
- [gap|sycophant|defect|critical] <one-line> — <file:line> — proposed follow-up (new red test / impl fix)
```
Findings marked `gap` become new red tasks appended to this plan by the supervisor. A `critical`
finding (a check count mismatch in the migrated `test/contract.test.mjs`, or evidence that `§N`
still parses) blocks T05 until resolved.
