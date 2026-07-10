# Running tests

There is no test runner and no `package.json` in this repo (`CLAUDE.md`). Run a single test file
directly with Node:

```bash
node test/topology-layout.test.mjs
node test/topology-view.test.mjs
```

Run the **entire** suite (bash — this repo ships Git-for-Windows' `bash.exe` on Windows too):

```bash
for t in test/*.test.mjs; do node "$t"; done
```

There is no aggregate pass/fail summary across files — watch for any `FAIL` line in the output, or check
`$?`/`process.exitCode` per file. Each file sets `process.exitCode = 1` internally on any failed
`check()`, so a non-zero exit from the loop body means that file had at least one failure.

To confirm a specific file's status (rather than scrolling all output), run it alone and check the exit
code:

```bash
node test/topology-view.test.mjs; echo "exit: $?"
```

`layoutTopology` and `renderTopologyHtml` are both **pure** — their tests build `{ nodes, edges }` and
`{ containment, atoms, edges }` fixtures as in-memory object literals and need **no filesystem**, no
`.reasonable/`, no git, and no import of `lib/graph.mjs`'s I/O folds (`foldAsLived`/`deriveCurrent`). A
test that reaches for `mkdtemp` or writes a ledger is doing too much; the whole of P6e's `lib/` half is
two pure functions of their arguments. `renderTopologyHtml` returns a **string** — assert on it with
`.includes(...)`, a `RegExp`, and attribute counts; do **not** import a DOM/HTML parser (that would be a
third-party dependency, forbidden by Law 1).

**Note — `agents/topologist.md` has no test.** It is a role constitution (markdown), verified by the T02
read-only audit, not by a Node script — this repo has no agent-`.md` linter (nothing in `lib/*.mjs` reads
`agents/*.md`). Do not write a test file for it; do not add one to the suite.
