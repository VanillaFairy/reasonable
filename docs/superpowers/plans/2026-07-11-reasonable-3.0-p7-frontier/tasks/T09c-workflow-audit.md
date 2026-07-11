# Task T09c: `frontier-wave.workflow.js` audit — teeth on purity + lane=atom untouched

**Role:** `audit` — adversarially audit the T09 tests and implementation. **Read-only** on `lib/`,
`workflows/`, and `test/`: you report findings; you do not fix.

## References
- Read: `../shared/interfaces.md` §5 (in full), `../shared/conventions.md` (workflow substrate purity)
- Read: `workflows/frontier-wave.workflow.js`, `test/frontier-wave-workflow.test.mjs`
- Read: `test/vertical-slice-runner-green-no-mergesha.test.mjs` (the precedent invocation pattern —
  `loadRunner()(args, budget, phase, log, agent, parallel, pipeline, workflow)` called POSITIONALLY,
  then the returned zero-arg async function awaited)

## Dependencies
- Depends on: T09b
- Depended on by: T11 (docs + skill repoint), T12 (final check)

## What to check (report each as PASS / FINDING)

1. **The invocation pattern is the REAL one, not an invented shortcut.** Confirm
   `test/frontier-wave-workflow.test.mjs` calls the loaded function POSITIONALLY —
   `loadRunner()(args, budget, phase, log, agent, parallel, pipeline, workflow)` (or an equivalent named
   helper) — matching `GLOBALS`' exact order, then awaits the returned async function. A test that tries
   to pass a single options OBJECT (e.g. via `eval()`-based name lookup) is fundamentally broken — the
   engine's function-scope wrap takes POSITIONAL arguments, not a bag of named globals. (This exact
   defect existed in an early draft of this task; confirm it was caught and fixed to the positional
   form.)
2. **Discriminator (teeth) on GATE_RESULT routing.** Confirm each of the seven-variant checks fails
   against a stub `gateDue` that always returns `{kind:'heartbeat'}` (must fail every non-heartbeat
   check) and one that always returns `{kind:'none'}` (must fail every firing check).
3. **Budget exhaustion is checked at EVERY dispatch point, not just one.** Re-trace the implementation:
   confirm a `guard()`-caught throw during `implementer`, `blind-test-writer`, `auditor`, OR any
   role-dispatch call (`census`/`characterizer`/`topologist`/`retro-synthesizer`) each independently
   short-circuit the run to `{kind:'budget-exhausted'}`. A version that only checks the COLLECT loop
   (auditor) while silently discarding a `census`/`implementer` throw's guard result would pass the
   locked test's specific fixture (which throws in `implementer`) ONLY if that exact path is checked —
   confirm by reading the code, not by re-running the one locked scenario, that ALL dispatch points are
   guarded consistently (this exact gap existed in an early draft; confirm it was caught and fixed).
4. **`blocked-human` fires in BOTH run modes**, confirmed by two actual test invocations (`gated` and
   `autonomous`), not asserted once and assumed symmetric.
5. **Role-minimal dispatch is genuinely conditional.** Confirm the workflow's inlined `requiredRoles`
   mirror uses the SAME four conditions as `lib/frontier.mjs`'s real `requiredRoles` (re-read both side
   by side) — a drifted mirror (e.g. a typo'd threshold) is a finding even if the one locked test
   happens to still pass.
6. **Purity is real, not just grep-shallow.** Confirm zero `import`/`require`/`fs.`/`Date.now()`/
   `new Date(`/`Math.random()` anywhere in the file (re-run the local regex check AND
   `node test/workflow-load.test.mjs`, which independently proves the file loads under the engine's
   function-scope wrap with no duplicate top-level bindings).
7. **Lane = atom is untouched.** Confirm the implementation makes no claim about lane/journal/ledger
   accounting beyond what `../shared/interfaces.md` §5 pins (dispatch role-minimally; lane infrastructure
   deferred to first need) — this scope's schematic Spec/Merge stages should not silently invent new
   lane-provisioning behavior not backed by a locked test.
8. **`workflows/vertical-slice-runner.workflow.js` and its five dedicated tests are genuinely gone.**
   Confirm via `ls`/`git status` — no orphaned references anywhere (`grep -rn
   "vertical-slice-runner" workflows/ test/ skills/ agents/` should show nothing live except historical
   prose, e.g. in this plan's own docs or `skills/vertical-slice-execution/SKILL.md` pending its T11
   repoint).

## Deliverable
A short report: each check PASS or a specific FINDING (file:line + the missing case). Gap findings
become new `red` tasks (`T09d-*-hardening-red.md`) before T10. If everything passes, say so plainly and
name the discriminator evidence for checks 1 and 3 specifically (both are real defects this plan's own
authoring process caught and fixed — confirm the fixes are genuinely present, not just described).

## Acceptance Criteria
- [ ] All eight checks reported PASS or FINDING with evidence
- [ ] No file was modified (read-only audit)
- [ ] Any FINDING is written as a concrete, actionable new `red` task
- [ ] `node test/workflow-load.test.mjs` was re-run and confirmed passing
