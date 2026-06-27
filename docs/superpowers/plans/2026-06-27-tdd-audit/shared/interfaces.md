# Shared Interfaces

**Version:** 1.0

Every contract referenced by more than one task, with exact shapes. Tasks must match these
verbatim.

## 1. Standalone reverse-discriminator CLI

**Produced by:** T01b (`lib/discriminator.mjs`)
**Consumed by:** T01a (test), T04 (workflow Confirm node)

New effort-free invocation (no `--root`, no `.reasonable/` required):

```
node <reasonableRoot>/lib/discriminator.mjs \
  --reverse \
  --test '<test-id>' \
  --locus '<src-glob>' [--locus '<src-glob>' ...] \
  --test-one-cmd '<command with {test} placeholder>' \
  [--test-glob '<glob>' ...] \
  --tree '<targetRepoRoot>' \
  --json
```

- `--test-one-cmd` — REQUIRED in standalone mode. The command that runs exactly ONE test; `{test}`
  is substituted with `--test`'s value. Must exit non-zero when the test fails.
- `--test-glob` — OPTIONAL, repeatable. Globs that identify test files (so locus mutation never
  mutates a test). Defaults to the engine defaults (`**/tests/**`, `**/*.test.*`, `**/*.spec.*`,
  `**/*_test.*`) when omitted.
- `--tree` — the working tree to operate in (the audited repo). Git ops + the worktree-at-HEAD run
  here.
- The existing `--root <effortRoot>` (config-driven) path is unchanged; `--test-one-cmd` is only
  consulted when no effort is found.

**JSON output (`--json`)** — the existing reverse-mode report, unchanged:

```json
{
  "mode": "reverse",
  "testName": "<test-id>",
  "locus": ["<src-glob>"],
  "passesOnHead": true,
  "sitesTried": 3,
  "redUnderMutant": true,
  "admissible": true,
  "killingMutant": { "file": "src/num.mjs", "line": 1, "from": "...", "to": "..." }
}
```

**Exit code:** `0` iff `admissible` is true (passes on HEAD AND red under ≥1 locus mutant); `1` if
inadmissible (vacuous or not a pin); `2` on a usage/`fail()` error. The `--json` payload is printed
on stdout in all of the `0`/`1` cases (a consumer that catches a non-zero exit must still parse
stdout).

**Verdict semantics for the audit:** a honesty-flagged test that comes back `admissible:false`
(passes on HEAD, no locus mutant turns it red) is **mechanically-confirmed vacuous** — it proves
nothing. `admissible:true` means the test has teeth, so the model's sycophancy suspicion was wrong.

## 2. test-auditor agent identity

**Produced by:** T03 (`agents/test-auditor.md`)
**Consumed by:** T04 (`agentType: 'reasonable:test-auditor'`)

- `name: test-auditor`, `model: sonnet`, `tools: Read, Grep, Glob, Bash` (no Edit/Write).
- Dispatched with a **lens** named in the prompt, one of:
  `survey | coverage | integration | runner | stale | quality | honesty | confirm`.

## 3. Workflow identity & args

**Produced by:** T04 (`workflows/tdd-audit.workflow.js`)
**Consumed by:** T05 (`skills/tdd-audit/SKILL.md`)

- Registered name: `reasonable-tdd-audit` (launched **by name**, not scriptPath).
- `args` shape:

```js
{
  targetRoot: '<absolute path to the repo being audited>',  // the audited working tree
  reasonableRoot: '<absolute path to the reasonable plugin root>', // $CLAUDE_PLUGIN_ROOT
  scope: '<optional subdir / glob to narrow the audit>'      // optional
}
```

- Return value (the script's terminal `return`) — must match `T04`'s `return` exactly:

```js
{
  kind: 'report',
  verdict: 'PASS' | 'NEEDS WORK' | 'FAILING',     // overall, coverage × honesty × teeth
  confirmedVacuous: [ { testId, killingMutant } ], // admissible:false — mechanically proven vacuous
  hadTeeth: [ { testId } ],                        // admissible:true — honesty suspicion downgraded
  findings: { coverage: [...], integration, runner, stale, quality, honesty, scan },
  correctnessFlags: [ { kind, location, what } ],  // source-bug + defective-test
  skipped: [ '<check> — <reason>' ],               // e.g. 'mapping — no contracts present'
  error: '<string>'                                // present ONLY when Survey failed (verdict FAILING)
}
```

The render step (T05) must read these defensively — on a Survey failure the report carries `error`
and `skipped` but may omit `confirmedVacuous` / `findings`.

> **Future refinement (out of scope for this plan):** a per-subproject verdict column (the original
> command's "overall = worst subproject"). v1 returns one overall verdict; the subproject breakdown
> is visible in `findings`, and per-subproject scoring can layer on later without changing this shape.

## 4. Canonical honesty rubric path

**Produced by:** T02
**Consumed by:** T03 (agent reads it for the honesty/confirm lens), T04 (prompts point to it),
T06 (effort agents cite it)

Path (relative to the plugin root): `skills/tdd-audit/references/test-honesty-rubric.md`.
Agents reference it as `${reasonable}/skills/tdd-audit/references/test-honesty-rubric.md` where
`${reasonable}` is the plugin root given at dispatch.
