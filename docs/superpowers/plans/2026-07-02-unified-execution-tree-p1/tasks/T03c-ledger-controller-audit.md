# Task T03c: ledger controller audit (AUDIT)

**role: audit** — read-only adversarial review of T03a tests + T03b implementation.

## References
- Read: `../shared/interfaces.md` §2 + §4, `test/ledger.test.mjs`, `lib/ledger.mjs`
- Read: spec §"Component 2" + "Attempt semantics" in
  `docs/superpowers/specs/2026-07-02-unified-execution-tree-design.md`

## Dependencies
- Depends on: T03b. Depended on by: T14.

## Scope
No file modifications. Output = findings report (final message), same format as T01c.

## Audit checklist
1. **Spoof resistance:** can a caller smuggle `seq`, `ts`, `attempt`, or an absolute `node`
   through any path (JS API, flag form, `--json` form)? Try field names in different positions.
   CRITICAL if yes.
2. **Attempt arithmetic edges:** dispatched on a node that was `node-failed` (dead-end) — does
   it stamp latest+1 per the interface's reopen rule? Downgraded with zero attempts? Two
   downgrades in a row? Which of these are TESTED?
3. **Atomicity/races:** is stamping computed BEFORE the lock while another append could change
   `latest`? (Read the code path honestly; a stale-attempt race under two concurrent
   dispatched-appends for the same node — how bad, and is it plausible under the current
   single-runner usage? Report, don't fix.)
4. **Validation gaps:** any Family-1 type appendable without a resolvable node? `--json`
   combined with field flags? Empty-string values?
5. **Regen honesty:** does `{regen:false}` really skip, and does a writeMirror failure surface
   or swallow?
6. **Test sycophancy:** any test asserting incidental implementation choices (exact error
   strings beyond the `ledger:` prefix, object key order)?

## Output format
Same as T01c (`AUDIT ledger: PASS | FINDINGS` + typed one-liners).
