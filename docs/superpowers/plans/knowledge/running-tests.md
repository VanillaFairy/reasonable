# Running tests in this repo

There is no package.json and no test runner. Every test is a standalone Node script using
builtins only (`node:assert`, `node:fs`, `node:child_process`).

**Run one test file:**

```bash
node test/<name>.test.mjs
```

Exit code is 0 on all-pass, 1 on any failure (`process.exitCode` is set, never a thrown
uncaught exception). Output ends with either:

```
<suite>: all N checks passed. ✓
```

or, with failures printed above:

```
<suite>: FAILURES above (N passed).
```

**Run every test file:**

```bash
for t in test/*.test.mjs; do node "$t"; done
```

There is no aggregate runner — this loop is the closest thing to "run the whole suite."

**Style convention every test file in this repo follows** (see any `test/*.test.mjs` for a full
example): a local `check(name, fn)` helper that wraps one assertion block in try/catch, prints
`  ok  <name>` or `FAIL  <name>` with the stack, and increments a `passed` counter; temp fixtures
are built under `mkdtempSync(join(tmpdir(), '<prefix>-'))` and cleaned up in a trailing loop over
a `tmps` array. New test files must follow this exact shape — don't introduce a different
assertion/reporting style.
