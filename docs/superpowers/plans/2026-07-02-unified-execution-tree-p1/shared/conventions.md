# Conventions — Plan 1

## Repo invariants (violating any of these fails review)

- `lib/` is dependency-free: node builtins (`node:fs`, `node:path`, `node:child_process`, …) and
  relative imports only. No package.json exists; never create one.
- Workflow scripts (`workflows/*.workflow.js`) are pure: no `fs`, no imports, no `Date.now()` /
  `Math.random()` / `new Date()`. T12 edits PROMPT STRINGS only.
- `docs/DESIGN.md` section numbers are cited from code (`§5.9`, `§D19`, …). Never renumber.
- Hooks fail OPEN outside an effort (no `.reasonable/` ⇒ allow/no-op), CLOSED inside one.
- Only glossary terms carry normative force.

## Git discipline (critical for this plan)

The working tree carries unrelated in-flight modifications (see plan.md Pre-flight). Therefore:

- **Stage explicitly, file by file:** `git add <exact paths from your task's Scope>`.
- **NEVER** `git add -A`, `git add .`, or `git commit -a`.
- If your task modifies a file that already has uncommitted changes (e.g. `docs/artifacts.md`),
  edit surgically and stage it anyway ONLY if the Pre-flight resolved the dirt; otherwise STOP
  and report.
- Commit messages: conventional style seen in `git log` — `feat(scope): …`, `fix(scope): …`,
  `docs(scope): …`, `test(scope): …`. End every commit message with:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- Ignore `ERROR: Failed to parse repository information` stderr noise from git commit — see
  `docs/superpowers/plans/knowledge/git-commit-stderr-noise.md`.

## Code style

- ESM `.mjs`, top-of-file comment block explaining the module's role and citing DESIGN sections
  where relevant (match the density/voice of existing `lib/*.mjs`).
- Statuses are lowercase strings: `pending | active | done | failed | canceled`.
- One glyph vocabulary, defined ONCE in `lib/progress-tree.mjs`:
  `· pending  ▶ active  ✓ done  ✗ failed  ⊘ canceled`.
- CLI arg handling: reuse `rootFromArgv` / `argvWithoutRoot` / `findEffortRoot` from
  `lib/effort.mjs` — see `docs/superpowers/plans/knowledge/cli-root-convention.md`. Never invent
  a new argument-parsing scheme.
- Errors from library functions: return `{ ok: false, error }` shapes (never throw across the
  CLI boundary); CLIs print to stderr and exit 1 (fail loud). One deliberate exception:
  `progress-tree.mjs`'s `apply` THROWS on malformed ops by contract (a mapper bug must surface
  loudly) — see interfaces §1.

## Tests

- Follow `docs/superpowers/plans/knowledge/running-tests.md` EXACTLY: standalone
  `node test/<name>.test.mjs`, local `check(name, fn)` helper, `passed` counter, temp fixtures
  under `mkdtempSync(join(tmpdir(), '<prefix>-'))`, cleanup loop over a `tmps` array, exit code
  via `process.exitCode`. Copy the shape from any existing `test/*.test.mjs`.
- Red tasks: tests must fail for the RIGHT reason (module not found / assertion, never a syntax
  error in the test itself). Verify by running.
- Prefer invariant assertions over brittle full-string goldens for rendered markdown: assert
  line presence/order/indentation, not the entire byte-exact document (unless the case is tiny).

## Adversarial-TDD discipline

- `red` tasks own the test file; they NEVER implement.
- `green` tasks treat the red task's test file as **READ-ONLY**. A wrong test is escalated to
  the supervisor, never edited.
- `audit` tasks report findings only; fixes become new tasks.
