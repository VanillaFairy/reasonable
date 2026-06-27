# Task T05: tdd-audit skill

## References
- Read: `../shared/architecture.md`
- Read: `../shared/interfaces.md` (§3 — workflow name, args, return shape)
- Read for the user-invocable + launch-by-name idiom: `skills/develop/SKILL.md`,
  `skills/vertical-slice-execution/SKILL.md` (how it launches a workflow and routes the typed result)

## Dependencies
- Depends on: T04 (the workflow must exist to launch by name)
- Depended on by: T07 (inventory references it)

## Scope
**Files:**
- Create: `skills/tdd-audit/SKILL.md`

**BOUNDARY — you MUST NOT modify any files outside this list.**

## Positive Constraints (DO)
- Frontmatter must NOT include `user-invocable: false` (so it becomes `/reasonable:tdd-audit`).
- Launch the workflow **by name** (`reasonable-tdd-audit`), never by scriptPath (scriptPath drops
  args).
- Make read-only explicit: render the report, route findings, never edit code.

## Negative Constraints (DO NOT)
- Do NOT add an effort flow (no analysis/scaffolding/.reasonable writes).
- Do NOT have the skill itself run the lenses or the discriminator — that's the workflow's job.

## Implementation Steps

### Step 1: Create the skill

```markdown
---
name: tdd-audit
description: Use when the user invokes /reasonable:tdd-audit or asks to audit an existing test suite for coverage, quality, and HONESTY (sycophantic tests that babysit the implementation) — with MECHANICAL confirmation of each honesty flag via the per-test reverse-discriminator. Runs standalone on any repo (no reasonable effort needed); a read-only diagnostic that reports, never fixes. NOT an effort entry point.
---

# reasonable: tdd-audit — mechanically-confirmed test-honesty diagnostic

**Announce at start:** "Using tdd-audit to audit <target>'s test suite — read-only, with
mechanical teeth confirmation."

A **diagnostic**, not an effort. It does **not** enter `analysis → scaffolding → …`, writes no
`.reasonable/` state, and never edits code. It launches the `reasonable-tdd-audit` workflow and
renders the typed report.

**Rigid checklist — one TodoWrite item per numbered step.**

(`${reasonable}` = this plugin's root — `$CLAUDE_PLUGIN_ROOT` in hooks; the installed absolute path
otherwise.)

## 1. Resolve the target
- `targetRoot` — the repo to audit (default: the current working directory).
- `reasonableRoot` — `$CLAUDE_PLUGIN_ROOT` (this plugin's root).
- `scope` — optional subdir/glob to narrow the audit.

## 2. Launch the workflow BY NAME
Launch `Workflow({ name: 'reasonable-tdd-audit', args: { targetRoot, reasonableRoot, scope } })`.
Launch **by name**, not by `scriptPath` — the name path passes `args` reliably (`scriptPath` drops
them). The call returns immediately with a run id; the run executes in the background and notifies
you on completion. Do not re-implement the lenses or the discriminator — the workflow owns them.

## 3. Render the report (the typed return)
On the `{ kind: 'report', … }` return, present, in this order:
- **Verdict** — `PASS | NEEDS WORK | FAILING` (coverage × honesty × teeth).
- **Mechanically-confirmed vacuous tests** (`confirmedVacuous`) — the headline: tests the
  reverse-discriminator proved survive a locus mutant. This is the value the soft audit can't give.
- **Downgraded flags** (`hadTeeth`) — honesty suspicions the mechanism refuted; report them honestly.
- **Per-lens findings** — coverage (untested/partial HIGH first), integration, runner health,
  stale/disabled, quality gaps.
- **Correctness flags** — suspected source bugs + defective tests; surface security-relevant ones
  prominently.
- **Skipped checks** (`skipped`) — render this prominently. A skip is never a pass ("mapping — no
  contracts present", "teeth — not a git repo"). No silent caps.

## 4. Route findings — do NOT fix
This skill reports; it does not change code. Route, don't act:
- Untested / PARTIAL HIGH behaviours → write tests test-first (the `tdd` / `adversarial-tdd` skills).
- Confirmed-vacuous / defective tests → fix the test, then re-confirm it has teeth (re-run the
  audit, or mutate the locus and watch it go red).
- Correctness flags → triage as bugfix-under-TDD; surface security ones loudly.

Do not silently fold fixes into the audit — a report you also edited from is no longer independent.

## Note
This supersedes the external `tdd-audit` command: same capability, plus mechanical confirmation, in
one place inside the plugin.
```

### Step 2: Commit

```bash
git add skills/tdd-audit/SKILL.md
git commit -m "$(cat <<'EOF'
feat(tdd-audit): add user-invocable tdd-audit diagnostic skill

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

## Acceptance Criteria
- [ ] `skills/tdd-audit/SKILL.md` exists; frontmatter has NO `user-invocable: false`.
- [ ] It launches `reasonable-tdd-audit` by name with `{ targetRoot, reasonableRoot, scope }`.
- [ ] The render step surfaces `confirmedVacuous` as the headline and `skipped` prominently.
- [ ] It routes findings and explicitly refuses to fix code.
