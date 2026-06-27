# Conventions (for this plan)

Follow the patterns already in the `reasonable` repo — these are the ones this plan leans on.

## Hard invariants (must not break)

1. **`lib/` is dependency-free.** Node builtins (`node:fs`, `node:child_process`, …) and relative
   imports only. No package.json, no npm.
2. **Hooks/engine fail OPEN outside an effort.** No `.reasonable/` reachable ⇒ allow / no-op. The
   discriminator's new standalone path honors this: it runs only when given explicit flags, and
   never assumes an effort.
3. **Workflow scripts are pure.** No `fs`, `Date.now()`, `Math.random()`, `new Date()`, or imports
   in `workflows/*.workflow.js`. All side effects happen inside agents. `meta` is a pure literal.
   The script must LOAD under `test/workflow-load.test.mjs` (no duplicate top-level bindings — a
   helper `function foo` and a `const foo` collide).
4. **Agent allowlists are load-bearing.** `test-auditor` gets `Read, Grep, Glob, Bash` and **no**
   `Edit`/`Write`. Do not add write tools — the missing capability *is* the audit-independence
   guarantee.

## Markdown artifacts (skills, agents)

- Agent/skill files start with YAML frontmatter. A skill is user-invocable iff it does **not** carry
  `user-invocable: false`. Agents carry `name`, `description`, `model`, `tools`.
- Match the existing voice: normative, terse, "Forbidden moves" tables where a role has tempting
  rationalizations. See `agents/auditor.md`, `agents/census.md` for the house style.

## Node test files

- Standalone, builtins only, no runner. Pattern: `import assert from 'node:assert'`, a `check(name,
  fn)` helper that counts pass/fail and sets `process.exitCode`, throwaway git repos in
  `mkdtempSync(join(tmpdir(), 'prefix-'))`, cleaned up at the end. Copy the harness shape from
  `test/commit-gate.test.mjs`.
- Throwaway repos must set `core.hooksPath` to an empty dir, `user.email`, `user.name`,
  `commit.gpgsign=false`, and make at least one commit (the reverse discriminator does
  `git worktree add --detach <tmp> HEAD`).

## Commits

- One commit per task (per the bite-sized steps). Conventional-commit style with a scope, e.g.
  `feat(tdd-audit): …`, `test(discriminator): …`, `docs(reasonable): …`.
- End commit messages with the co-author trailer:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- LF line endings (the repo recently standardized on LF; don't reintroduce CRLF).
