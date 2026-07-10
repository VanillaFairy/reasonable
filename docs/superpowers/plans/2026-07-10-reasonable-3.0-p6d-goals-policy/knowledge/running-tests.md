# Running tests

There is no test runner and no `package.json` in this repo (`CLAUDE.md`). Run a single test file
directly with Node:

```bash
node test/goals-loader.test.mjs
node test/policy-loader.test.mjs
```

Run the **entire** suite (bash — this repo ships Git-for-Windows' `bash.exe` on Windows too):

```bash
for t in test/*.test.mjs; do node "$t"; done
```

There is no aggregate pass/fail summary across files — watch for any `FAIL` line in the output, or
check `$?`/`process.exitCode` per file. Each file sets `process.exitCode = 1` internally on any failed
`check()`, so a non-zero exit from the loop body means that file had at least one failure.

To confirm a specific file's status (rather than scrolling all output), run it alone and check the
exit code:

```bash
node test/goals-loader.test.mjs; echo "exit: $?"
```

Unlike P6a's pure fold, `readGoals` / `readPolicy` **read a real file** at
`<effortRoot>/.reasonable/goals.json` (resp. `policy.json`) — so their tests build a throwaway effort
dir with `mkdtempSync` + `mkdirSync('.reasonable')` + `writeFileSync`, exactly as `test/route.test.mjs`
does, and clean it up at the end. No git, no ledger, no `charterAtom` — the loaders are pure
read-and-validate over one file; a test that reaches for `git` or writes a ledger is doing too much.
