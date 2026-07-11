# Running tests

There is no test runner and no `package.json` in this repo (`CLAUDE.md`). Run a single test file
directly with Node:

```bash
node test/frontier-gate.test.mjs
node test/frontier-ready-pack.test.mjs
node test/frontier-roles.test.mjs
node test/ledger-atom-verdict.test.mjs
node test/ledger-two-phase.test.mjs
node test/next-action-cones.test.mjs
node test/reconcile-cones-projection.test.mjs
node test/frontier-wave-workflow.test.mjs
node test/progress-map-atoms.test.mjs
```

Run the **entire** suite (bash — this repo ships Git-for-Windows' `bash.exe` on Windows too):

```bash
for t in test/*.test.mjs; do node "$t"; done
```

There is no aggregate pass/fail summary across files — watch for any `FAIL` line, or check
`$?`/`process.exitCode` per file. Each file sets `process.exitCode = 1` internally on any failed
`check()`, so a non-zero exit from the loop body means that file had at least one failure.

**Part 7 edits live-engine files** (`lib/ledger.mjs`, `lib/reconcile.mjs`, `lib/next-action.mjs`,
`lib/progress-map.mjs`) and `lib/footprint.mjs`. Every `green`/`audit` task therefore runs the **whole
suite**, not just its own new test — the migration's whole discipline is "green after every task."
Confirm a specific file:

```bash
node test/reconcile-cones-projection.test.mjs; echo "exit: $?"
```

## Two test styles in this part

- **Pure-lib tests** (`frontier-*`, `next-action-cones`) build `graph`/`verdict`/`footprint`/`state`
  fixtures as in-memory object literals and need **no filesystem** — no `mkdtemp`, no `.reasonable/`,
  no git. A pure-lib test that reaches for the filesystem is doing too much.
- **I/O tests** (`ledger-*`, `reconcile-*`, `progress-map-*`) build a throwaway git repo + `.reasonable/`
  in the OS temp dir and exercise the real path. **Read a shipped `test/reconcile*.test.mjs` (and a
  `test/*ledger*` test) first** and copy its scaffolding (temp-root creation, `append(...)`, git init,
  cleanup) — do not invent a new harness.

## Workflow tests

`test/workflow-load.test.mjs` iterates every `workflows/*.workflow.js` and asserts the purity
invariants (no `fs`/`Date`/`import`) + that the body loads — it covers `frontier-wave.workflow.js`
automatically once the file exists. Behavioral tests (`frontier-wave-workflow.test.mjs`) load the body
with the `new Function(...GLOBALS)` harness the shipped `vertical-slice-runner-*` tests use — read one
of those to copy the stub-`agent`/`budget`/`phase` injection pattern.
