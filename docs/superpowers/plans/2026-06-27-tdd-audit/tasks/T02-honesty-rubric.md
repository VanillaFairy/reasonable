# Task T02: Canonical honesty rubric

## References
- Read: `../shared/architecture.md`
- Read: `../shared/interfaces.md` (§4 — the canonical path)
- Read for voice: `agents/auditor.md`, `docs/glossary.md`
- Source material being consolidated: the honesty rubric in the external `tdd-audit` command and
  vf-superpowers' `adversarial-tdd/test-honesty-rubric.md`. This file becomes `reasonable`'s single
  copy.

## Dependencies
- Depends on: — (none)
- Depended on by: T03 (agent reads it), T04 (prompts cite it), T06 (effort agents cite it)

## Scope
**Files:**
- Create: `skills/tdd-audit/references/test-honesty-rubric.md`

**BOUNDARY — you MUST NOT modify any files outside this list.**

## Positive Constraints (DO)
- Write the file with the exact content in Step 1 (it is the single source of truth all callers
  cite — do not paraphrase it differently elsewhere).
- Keep the cross-plugin sync note (vf-superpowers cannot reference this at runtime).

## Negative Constraints (DO NOT)
- Do NOT add frontmatter — this is a reference doc, not a skill or agent.
- Do NOT invent new signals or verdict names; this rubric is cited verbatim by mechanical-confirm
  logic that keys off "SYCOPHANTIC".

## Implementation Steps

### Step 1: Create the rubric file

```markdown
# Test Honesty Rubric

The shared, normative rubric for judging whether a test is anchored to a behavior's **intent** or
merely reverse-engineered from the **implementation**. This is the ONE canonical copy in the
`reasonable` plugin. It is cited by:

- `skills/tdd-audit/SKILL.md` (its honesty + confirm lenses), via the workflow agent prompts;
- `agents/intent-verifier.md` and `agents/auditor.md` (the effort's verification adversaries).

> **Cross-plugin note.** vf-superpowers' `adversarial-tdd` keeps its own copy because a different
> plugin cannot reference this file at runtime. If you change the signals here, change it there too.
> Within `reasonable`, this is the only copy — never fork it.

## The core question

**A test that could only have been written by reading the code cannot be more correct than the
code.** For each test, ask: *would a different correct implementation still pass it, and would a
plausible bug fail it?* Judge against an **intent source** — a spec, docstring, issue reference,
type contract, acceptance criteria, contract clause, or CLAUDE.md rule — **not** against the
implementation. Where no intent source exists, that absence is itself a finding (signal 5).

## Signals (note each that is present)

| # | Signal | Looks like |
|---|--------|-----------|
| 1 | Implementation over-fit | Asserts an exact output/structure only THIS impl produces, where the spec permits alternatives (a specific tie-break, ordering, error string, field order). A different correct impl would fail it. |
| 2 | Invariant blindness | A governing invariant (sum/conservation, idempotence, round-trip, ordering, monotonicity, bound) is not asserted; only hand-picked examples are. |
| 3 | Happy-path mirroring | Only covers inputs the impl visibly handles; missing negative/boundary/error cases the SPEC implies. |
| 4 | Tautology / mock-only | Only assertions are on a mock or restate the impl; proves the double works, not the behavior. |
| 5 | Code-as-only-oracle | No independent intent source exists; the test could only have come from reading the impl → unverifiable by construction. |
| 6 | Change-detector | Asserts private/internal structure or exact logs, so refactors break it with no behavior change. |
| 7 | Co-authored smell (git, weak) | Test + impl introduced in the same commit by the same author, no intervening failing-test commit. Weak; tiebreak only, never alone. |

## Verdict per behavior

- **TRUSTWORTHY** — anchored to intent; would catch a wrong impl; survives a valid alternative impl.
- **SUSPECT** — partial anchoring; some over-fit or a missing spec-implied invariant/edge.
- **SYCOPHANTIC** — anchored only to the impl (over-fit and/or code-as-only-oracle and/or
  tautological); green proves nothing about correctness.

## Test-correctness flags (distinct from the honesty verdict)

Flag separately a test whose assertion **cannot fail** for any implementation, one that exercises
the **wrong** entity/index than it claims (and may pass only by accident), or one that never
actually invokes the path it purports to test. These are defects in the test itself, not just weak
anchoring.

## Mechanical confirmation (the `reasonable` teeth upgrade)

A SYCOPHANTIC verdict is a *suspicion* until confirmed. The per-test reverse-discriminator settles
it mechanically: mutate the test's locus and check whether the test goes RED.

- Survives every locus mutant (`admissible:false`) → **mechanically-confirmed vacuous**; the
  suspicion stands as proof.
- Goes RED under a mutant (`admissible:true`) → the test has teeth; **downgrade** the verdict —
  the model was wrong.

A model honesty verdict alone is never reported as proof; pair it with the mechanical result.
```

### Step 2: Commit

```bash
git add skills/tdd-audit/references/test-honesty-rubric.md
git commit -m "$(cat <<'EOF'
docs(tdd-audit): add canonical test-honesty rubric (single source)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

## Acceptance Criteria
- [ ] `skills/tdd-audit/references/test-honesty-rubric.md` exists with the 7-signal table, the three
      verdicts, the test-correctness flags, and the mechanical-confirmation section.
- [ ] No frontmatter.
- [ ] The cross-plugin sync note is present.
