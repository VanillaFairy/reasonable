# Running tests

There is no test runner and no `package.json` in this repo (`CLAUDE.md`). Run a single test file
directly with Node:

```bash
node test/ceremony-classify.test.mjs
node test/ceremony-phase.test.mjs
```

Run the **entire** suite (bash — this repo ships Git-for-Windows' `bash.exe` on Windows too):

```bash
for t in test/*.test.mjs; do node "$t"; done
```

There is no aggregate pass/fail summary across files — watch for any `FAIL` line in the output, or
check `$?`/`process.exitCode` per file. Each file sets `process.exitCode = 1` internally on any failed
`check()`, so a non-zero exit from the loop body means that file had at least one failure.

To confirm a specific file's status (rather than scrolling all output), run it alone and check the exit
code:

```bash
node test/ceremony-classify.test.mjs; echo "exit: $?"
```

`classify`, `scaffoldMaterializes`, `rechartingDegenerates`, and `retroClassificationDegenerates` are
all **pure** — their tests build `inputs` / `dials` / `genesis` / `lastRatified` fixtures as in-memory
object literals and need no filesystem, no `.reasonable/`, no git, and no import of
`lib/policy.mjs`/`lib/goals.mjs`. A test that reaches for `mkdtemp` or writes a ledger is doing too much;
the whole of P6c is four pure functions of their arguments. The **only** shipped import a test makes is
`ceremonyEscalation` (from `lib/rewrite.mjs`) + `validateEffects` (from `lib/effects.mjs`) in the
classify test's round-trip check — the composition boundary that proves `classify` emits into the exact
`bandScale` `ceremonyEscalation` indexes into.
