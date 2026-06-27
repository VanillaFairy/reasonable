# Run the reasonable test suite

There is no test runner — each test is a standalone Node script using builtins only.

Run one test file:

```bash
node test/discriminator-reverse-standalone.test.mjs
```

Run the workflow-load purity gate (every `workflows/*.workflow.js` must construct under the engine
function-scope wrap — catches duplicate top-level bindings and illegal top-level `export`):

```bash
node test/workflow-load.test.mjs
```

Run all tests (no aggregate runner exists; loop):

```bash
for t in test/*.test.mjs; do echo "== $t =="; node "$t"; done
```

A passing test prints `… all N checks passed. ✓` and exits 0. A failure prints `FAIL  <name>` and
sets a non-zero exit code.

**Requirements:** Node.js and Git on PATH (the engine shells out to git; on Windows, Git-for-Windows
supplies `bash.exe`). Tests build throwaway git repos in the OS temp dir.
