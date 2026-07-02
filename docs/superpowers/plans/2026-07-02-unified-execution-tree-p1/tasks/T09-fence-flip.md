# Task T09: Fence flip — direct ledger writes denied for every role

## References
- Read: `../shared/architecture.md` (law changes), `../shared/conventions.md`
- Read: `lib/fence.mjs` — `classifyReasonable` (LEDGER class, ~line 129), the
  `REASONABLE_WRITE_PERMS` role matrix (search for it near the top), `governReasonable`, and the
  Bash backstop that routes shell writes through the same matrix
- Read: `test/fence.test.mjs` and `test/shell-writes.test.mjs` — find every existing expectation
  about LEDGER writes

## Dependencies
- Depends on: T03b (the sanctioned CLI exists before the old path closes). Depended on by: T14.

## Scope
**Files:**
- Modify: `lib/fence.mjs`
- Modify: `test/fence.test.mjs`

**BOUNDARY — nothing else. (`test/shell-writes.test.mjs` only if it asserts a LEDGER
permission — inspect first; if untouched by the flip, leave it.)**

## Positive Constraints (DO)
- In `REASONABLE_WRITE_PERMS`, set the `LEDGER` class to an EMPTY allowlist: no subagent role
  may Edit/Write/shell-append `.reasonable/ledger.jsonl` anymore. The main session (role null)
  remains the trusted control plane exactly as the surrounding code already treats it.
- Update the deny message for LEDGER to name the sanctioned path, e.g.:
  `"…append via 'node lib/ledger.mjs append …' — the ledger controller is the only write path (2.0)."`
  Keep the existing message style (DESIGN § citation included).
- Tests: adjust any test that asserted a role COULD write LEDGER; add two checks —
  (a) implementer structured-edit to `.reasonable/ledger.jsonl` → deny, reason mentions
  `lib/ledger.mjs`; (b) Bash `echo '{...}' >> .reasonable/ledger.jsonl` from a worker → deny
  via the backstop. Verify a `node lib/ledger.mjs append --root …` Bash command is NOT treated
  as a write target by `extractWriteTargets` (add a check).
- Fail-open posture outside an effort is untouched — do not touch that logic.

## Negative Constraints (DO NOT)
- Do NOT weaken/alter any OTHER class row (CONTRACT, INDEX, WORKORDER, …).
- Do NOT touch hooks.json or the dispatch chain.

## Implementation Steps
1. Flip the matrix row + message; `node --check lib/fence.mjs`.
2. Update/add tests; `node test/fence.test.mjs` (and shell-writes if touched) → green.
3. Full suite → no NEW failures.
4. Commit:
```bash
git add lib/fence.mjs test/fence.test.mjs
git commit -m "feat(fence): deny direct ledger writes for every role — controller CLI is the only crossing

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

## Acceptance Criteria
- [ ] LEDGER allowlist empty; deny reason names the controller CLI
- [ ] Backstop denies shell appends; controller invocation itself not flagged (all tested)
