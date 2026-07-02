# Task T11: Agent constitutions — reporting via the controller CLI

## References
- Read: `../shared/interfaces.md` §2 + §4 (CLI grammar), `../shared/conventions.md`
- Read: the current reporting paragraphs — `grep -n "action-report" agents/*.md` and
  `grep -n "ledger.jsonl" agents/*.md` locate every passage to touch

## Dependencies
- Depends on: T03b. Depended on by: T14.

## Scope
**Files (modify only these):**
- `agents/implementer.md`, `agents/blind-test-writer.md`, `agents/characterizer.md`,
  `agents/auditor.md`, `agents/adjudicator.md`, `agents/scaffolder.md`,
  `agents/spike-runner.md`, `agents/lane-provisioner.md`, `agents/intention-writer.md`

**BOUNDARY — do NOT touch `agents/journal-writer.md`, `agents/work-order-writer.md` (their
duties are unchanged in Plan 1), and do NOT change any tool allowlist in any frontmatter —
allowlists are load-bearing adversarial separations.**

## Positive Constraints (DO)
- ONE uniform reporting paragraph, phrased once and adapted per role (do not reinvent per
  file). Core text to adapt:

  > **Progress + ledger discipline (2.0):** every ledger fact you record goes through the
  > controller — `node lib/ledger.mjs append --root <effortRoot> …` — never a direct write or
  > shell append to `ledger.jsonl` (the fence denies it). Report your own progress as you work:
  > open your stage section once with
  > `--type report-started --under <workOrder> --node <section-id>` (the section id is in your
  > dispatch prompt), then per unit of work
  > `--type report-started/--type report-finished --under <workOrder> --node <section-id>/<item-id>`
  > (item ids: contract clause refs like `§4`, your fixed step slugs, or a short kebab slug),
  > `--type report-canceled … --reason '…'` when an item becomes moot, and close your section
  > with `report-finished` as your last act. Domain events (your enrichment/characterization/
  > verdict line) go through the same CLI using `--json '<the exact event object>'`.

- Per-role adaptations:
  - **implementer / blind-test-writer / characterizer:** items = contract clause refs; the
    atomic-commit rule (D3a) is UNCHANGED — the domain ledger line still lands with the commit,
    now via the CLI (`--json`). implementer also: on a `checkpoint` OUTCOME, emit
    `--type node-checkpointed --workOrder <id> --kind work-order` as the last act.
  - **auditor:** items = its four fixed step slugs (`discriminator-check`,
    `bidirectional-mapping`, `mutation-sampling`, `proportionality-review`) — these slugs now
    live HERE (the code catalog died with action-events.mjs).
  - **adjudicator:** items = one kebab slug per red it rules on.
  - **lane-provisioner:** ADD a duty — immediately after provisioning (before the worker is
    dispatched), emit `--type node-dispatched --workOrder <id> --kind work-order`. On a
    re-provision after a lost-work downgrade this same call opens the fresh attempt (the
    controller does the arithmetic; the provisioner never computes attempts).
  - **scaffolder / spike-runner / intention-writer:** replace their raw-append instructions
    ("append exactly this JSON line…") with the `--json` CLI form; section/item reporting per
    the uniform paragraph (spike/scaffold section ids come from their dispatch prompts).
- Remove every reference to `action-report.mjs` and to hand-appending `ledger.jsonl`
  (including rationalization-table rows that mention them — update those rows, keep the
  table format).

## Negative Constraints (DO NOT)
- Do NOT alter any rule outside the reporting/ledger passages (fences, loci, OUTCOME unions,
  membranes stay byte-identical).
- Do NOT touch frontmatter/allowlists.

## Implementation Steps
1. `grep -rn "action-report\|ledger.jsonl" agents/` — enumerate targets.
2. Edit the nine files per above.
3. Verify: `grep -rn "action-report" agents/` → no output;
   `grep -rln "append.*ledger.jsonl" agents/` → only journal-writer/work-order-writer non-matches
   (i.e., no worker instructed to append directly).
4. Commit:
```bash
git add agents/implementer.md agents/blind-test-writer.md agents/characterizer.md agents/auditor.md agents/adjudicator.md agents/scaffolder.md agents/spike-runner.md agents/lane-provisioner.md agents/intention-writer.md
git commit -m "docs(agents): report through the ledger controller CLI — uniform 2.0 reporting paragraph

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

## Acceptance Criteria
- [ ] No `action-report` references; no direct-append instructions to workers
- [ ] Allowlists byte-identical (`git diff agents/ | grep -E "^[-+]tools:"` → empty)
- [ ] lane-provisioner carries the node-dispatched duty; implementer the node-checkpointed duty
