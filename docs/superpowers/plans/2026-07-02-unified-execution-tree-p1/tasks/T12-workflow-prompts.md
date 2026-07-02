# Task T12: Workflow prompt text — controller CLI + section ids

## References
- Read: `../shared/interfaces.md` §2 + §4, `../shared/conventions.md` (workflow purity!)
- Read: `workflows/vertical-slice-runner.workflow.js`, `workflows/scaffold.workflow.js`,
  `workflows/spike.workflow.js`, `workflows/coherence-grill.workflow.js` — locate every prompt
  passage that mentions `action-report`, "append … to ledger.jsonl", or "Append exactly this
  event" (`grep -n "action-report\|ledger.jsonl" workflows/*.js`)

## Dependencies
- Depends on: T03b. Depended on by: T14.

## Scope
**Files:**
- Modify: `workflows/vertical-slice-runner.workflow.js`, `workflows/scaffold.workflow.js`,
  `workflows/spike.workflow.js`, `workflows/coherence-grill.workflow.js`

**BOUNDARY — nothing else. PROMPT STRINGS ONLY: you change text inside string literals; you do
NOT add imports, fs, Date, or any script logic (workflow purity is a hard substrate rule —
`test/workflow-load.test.mjs` enforces loadability).**

⚠ `workflows/vertical-slice-runner.workflow.js` carries UNRELATED uncommitted modifications
(plan.md Pre-flight). Surgical string edits only; STOP if Pre-flight is unresolved.

## Positive Constraints (DO)
- Replace every `action-report.mjs` invocation instruction with the equivalent
  `node lib/ledger.mjs append --root <effortRoot> --type report-… --under <workOrder> --node …`
  form (interfaces §4 grammar). The old `--level section|item` vocabulary is GONE — section =
  first path segment, item = second.
- Replace every "append exactly this event to .reasonable/ledger.jsonl" instruction (runner
  ~line 656 verdict block, scaffold ~lines 297–384 contract-birth/scribe blocks) with the
  `--json '<same object>'` CLI form — the OBJECT text stays identical, only the delivery
  mechanism changes.
- Section ids in dispatch prompts: where the runner composes stage prompts, make the section id
  explicit and slug-shaped per stage (`implementation`, `tests`, `adjudication`, `audit`,
  `post-audit-fixes`), and for a REWORK round instruct the round-stamped id (`audit-2`,
  `post-audit-fixes-2`) — the workflow already knows the round count in its routing variables;
  interpolate it into the prompt string (pure string work, allowed).
- Where prompts previously told a worker its ledger line lands via file append, align the
  wording with T11's constitutions (CLI, D3a unchanged).

## Negative Constraints (DO NOT)
- Do NOT alter routing logic, schemas, budgets, or any non-string code.
- Do NOT introduce lifecycle-event emission here — the provisioner/skills own that (T11/T13).

## Implementation Steps
1. Grep-driven inventory; edit each string passage.
2. `node --check` each workflow file; run `node test/workflow-load.test.mjs` → green.
3. Verify: `grep -n "action-report" workflows/` → no output.
4. Commit:
```bash
git add workflows/vertical-slice-runner.workflow.js workflows/scaffold.workflow.js workflows/spike.workflow.js workflows/coherence-grill.workflow.js
git commit -m "docs(workflows): prompts route all ledger writes through the controller CLI; explicit round-stamped section ids

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

## Acceptance Criteria
- [ ] No action-report / direct-append instructions left in any workflow prompt
- [ ] workflow-load test green; zero non-string code changes (`git diff` review)
