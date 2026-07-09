# Running tests

There is no test runner and no `package.json` in this repo (`CLAUDE.md`). Run a single test file
directly with Node:

```bash
node test/rewrite-router.test.mjs
node test/rewrite-simple-verdicts.test.mjs
node test/rewrite-structural.test.mjs
node test/rewrite-ceremony.test.mjs
```

Run the **entire** suite (bash — this repo ships Git-for-Windows' `bash.exe` on Windows too):

```bash
for t in test/*.test.mjs; do node "$t"; done
```

There is no aggregate pass/fail summary across files — watch for any `FAIL` line in the output, or
check `$?`/`process.exitCode` per file. Each file sets `process.exitCode = 1` internally on any
failed `check()`, so a non-zero exit from the loop body means that file had at least one failure.

To confirm a specific file failed (rather than scrolling all output), run it alone and check the
exit code:

```bash
node test/rewrite-router.test.mjs; echo "exit: $?"
```

These tests are **pure** — they build `verdict`/`state` fixtures as in-memory object literals and
need no filesystem, no `.reasonable/`, no git. A test that reaches for `mkdtemp` or writes a ledger
is doing too much; the whole of Part 5 is a pure function of its arguments.
