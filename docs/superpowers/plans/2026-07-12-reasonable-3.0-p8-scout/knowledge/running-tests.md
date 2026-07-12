# Running tests

There is no test runner and no `package.json` in this repo (`CLAUDE.md`). Run a single test file
directly with Node:

```bash
node test/scout-seed.test.mjs
node test/scout-workflow.test.mjs
```

Run the **entire** suite (bash — this repo ships Git-for-Windows' `bash.exe` on Windows too), to
confirm no green/audit task regressed a sibling:

```bash
for t in test/*.test.mjs; do node "$t"; done
```

There is no aggregate pass/fail summary across files — watch for any `FAIL` line, or check
`$?`/`process.exitCode` per file. Each file sets `process.exitCode = 1` internally on any failed
`check()`, so a non-zero exit from the loop body means that file had at least one failure. Confirm a
specific file:

```bash
node test/scout-seed.test.mjs; echo "exit: $?"
```

## Two test styles in this part

- **Pure-lib tests** (`scout-seed`) build `seed` object literals / write a tiny JSON file to a
  `mkdtemp` dir and exercise `readSeed` / `validateSeedShape` directly. No git, no `.reasonable/`.
- **Workflow tests** (`scout-workflow`) load the workflow body with the `new Function(...GLOBALS)`
  harness the shipped `test/frontier-wave-workflow.test.mjs` uses — a stub `agent()` keyed on
  `opts.label`, a `mockBudget`, stub `parallel`/`pipeline`/`phase`/`log`. **Read
  `test/frontier-wave-workflow.test.mjs` first** and copy its `loadRunner()` / `runWith()` scaffolding
  verbatim — do not invent a new harness.

## Workflow purity (automatic)

`test/workflow-load.test.mjs` iterates every `workflows/*.workflow.js` and asserts the purity
invariants (no `fs`/`Date`/`import`) + that the body loads under the engine function-scope wrap — it
covers `scout.workflow.js` automatically once the file exists. A `green` task that adds the workflow
runs this file too.
