# Running tests

There is no test runner and no `package.json` in this repo (`CLAUDE.md`). Run a single test file
directly with Node:

```bash
node test/graph-containment.test.mjs
node test/graph-edges.test.mjs
node test/graph-projections.test.mjs
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
node test/graph-containment.test.mjs; echo "exit: $?"
```
