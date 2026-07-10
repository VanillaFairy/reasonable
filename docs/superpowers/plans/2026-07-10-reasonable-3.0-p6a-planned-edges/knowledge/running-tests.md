# Running tests

There is no test runner and no `package.json` in this repo (`CLAUDE.md`). Run a single test file
directly with Node:

```bash
node test/graph-planned-edges.test.mjs
```

Run the **entire** suite (bash — this repo ships Git-for-Windows' `bash.exe` on Windows too):

```bash
for t in test/*.test.mjs; do node "$t"; done
```

There is no aggregate pass/fail summary across files — watch for any `FAIL` line in the output, or
check `$?`/`process.exitCode` per file. Each file sets `process.exitCode = 1` internally on any
failed `check()`, so a non-zero exit from the loop body means that file had at least one failure.

To confirm a specific file's status (rather than scrolling all output), run it alone and check the
exit code:

```bash
node test/graph-planned-edges.test.mjs; echo "exit: $?"
```

`plannedNeedsEdges` is **pure** — its tests build `charters` fixtures as in-memory object literals
(`{ id, component, premises, order }`) and need no filesystem, no `.reasonable/`, no git, and no call
to `charterAtom`/`foldAtoms`. A test that reaches for `mkdtemp` or writes a ledger is doing too much;
the whole of P6a is a pure function of its one argument.
