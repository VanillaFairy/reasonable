# Task T01c: progress-tree audit (AUDIT)

**role: audit** — read-only adversarial review of T01a's tests AND T01b's implementation. You
fix nothing; findings become new tasks.

## References
- Read: `../shared/interfaces.md` §1 (the contract), `../shared/conventions.md`
- Read: `test/progress-tree.test.mjs`, `lib/progress-tree.mjs`
- Read: spec §"Component 1" in `docs/superpowers/specs/2026-07-02-unified-execution-tree-design.md`

## Dependencies
- Depends on: T01b. Depended on by: T14.

## Scope
No file modifications. Output = a findings report (your final message).

## Audit checklist
1. **Contract coverage:** for each rule in interfaces §1 (idempotent-merge status untouched;
   auto-create in ALL four ops; recursive terminal skip; target-always-set; segment grammar;
   default label = id; countByStatus excludes root; render invariants) — is there a test that
   would FAIL if the rule were broken? Name the missing ones.
2. **Sycophancy:** do any tests assert what the implementation happens to do rather than what
   the interface says (e.g. byte-golden markdown, property order)? Would the test survive a
   correct alternative implementation?
3. **Implementation honesty:** hidden extra behavior (mutation of op objects, extra exports,
   accidental status changes on merge, recursive status cascading detail)?
4. **Never-remove:** construct (mentally) any op sequence that makes a node disappear or lose
   terminal-status children's state. If one exists, that is a CRITICAL finding.
5. **Totality vs loudness:** ordering never throws; malformed always throws — test BOTH
   directions covered?

## Output format
```
AUDIT progress-tree: PASS | FINDINGS
- [gap|sycophant|defect|critical] <one-line> — <file:line> — proposed follow-up (new red test / impl fix)
```
Findings marked `gap` become new red tasks appended to this plan by the supervisor.
