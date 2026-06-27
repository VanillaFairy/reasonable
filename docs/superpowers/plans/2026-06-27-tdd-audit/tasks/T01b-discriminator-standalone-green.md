# Task T01b: Discriminator standalone reverse path — implement (role: green)

## References
- Read: `../shared/architecture.md`
- Read: `../shared/interfaces.md` (§1 — the exact CLI + JSON contract)
- Read: `../shared/conventions.md` (hard invariant #1: `lib/` is dependency-free)
- Read: `../knowledge/run-tests.md`
- Read: `lib/effort.mjs` (`rootFromArgv`, `loadConfig` — note `loadConfig(null)` returns safe
  defaults including `testGlobs`)

## Dependencies
- Depends on: T01a (the locked test)
- Depended on by: T04 (the workflow Confirm node invokes this CLI)

## Role: green — implement the minimal change to pass the locked test. You write NO tests.

## Scope
**Files:**
- Modify: `lib/discriminator.mjs`

**BOUNDARY — you MUST NOT modify any files outside this list.**

## Negative Constraints (DO NOT)
- Do NOT modify `test/discriminator-reverse-standalone.test.mjs` — it was authored by T01a and is
  **locked**. If a test looks wrong, escalate; never edit it to make impl easier.
- Do NOT change the existing config-driven path's behavior (the characterizer depends on it). The
  `if (effortRoot)` branch must remain exactly equivalent to today.
- Do NOT add any dependency or import beyond what the file already imports.
- Do NOT touch `runReverse()`'s mutation logic — only config resolution and one error string.

## Positive Constraints (DO)
- Add `--test-one-cmd` and repeatable `--test-glob` flag parsing.
- When no effort root is found but `--test-one-cmd` is given, synthesize an ad-hoc config from
  `loadConfig(null)` (defaults) plus the flag, so the same `runReverse()` runs.
- Keep the standalone path **reverse-mode only** in spirit (absence mode needs a pre-task commit).

## Implementation Steps

### Step 1: Read the locked test
Run: `node test/discriminator-reverse-standalone.test.mjs` and confirm checks A and B FAIL with
exit-2 (`No effort …`) — the red you are about to turn green.

### Step 2: Add flag parsing

In `lib/discriminator.mjs`, find the argument-parsing block (the `--locus` loop, ~line 46):

```javascript
const locus = [];
for (let i = 0; i < args.length; i++) if (args[i] === '--locus') locus.push(args[++i]);
const asJson = args.includes('--json');
```

Insert the two new flags immediately after the `--locus` loop (before or after `asJson`, either
order):

```javascript
const testOneCmdFlag = opt('--test-one-cmd', null);
const testGlobFlags = [];
for (let i = 0; i < args.length; i++) if (args[i] === '--test-glob') testGlobFlags.push(args[++i]);
```

### Step 3: Make config resolution effort-optional

Find the config-resolution block (~lines 55–58):

```javascript
const effortRoot = rootFromArgv(process.argv, process.cwd());
if (!effortRoot) fail('No effort (.reasonable/) found (pass --root <effortRoot> or run from inside the effort).');
const cfg = loadConfig(effortRoot);
if (!cfg.testCommand && !cfg.testOneCommand) fail('No testCommand/testOneCommand in config.json.');
```

Replace it with:

```javascript
const effortRoot = rootFromArgv(process.argv, process.cwd());
// Config resolution. With an effort present, config.json drives the run (the
// characterizer's reverse path; the greenfield absence path). STANDALONE
// (tdd-audit on an arbitrary repo with no .reasonable/): accept the single-test
// command + test globs as flags and synthesize an ad-hoc config, so the SAME
// runReverse() serves both callers. The flag path is reverse-mode only — absence
// mode needs a known pre-task commit, which a retrospective audit has not.
let cfg;
if (effortRoot) {
  cfg = loadConfig(effortRoot);
} else if (testOneCmdFlag) {
  cfg = { ...loadConfig(null), testOneCommand: testOneCmdFlag };
  if (testGlobFlags.length) cfg.testGlobs = testGlobFlags;
} else {
  fail('No effort (.reasonable/) found. Pass --root <effortRoot>, or (standalone) --reverse with --test-one-cmd "<cmd with {test}>".');
}
if (!cfg.testCommand && !cfg.testOneCommand) fail('No testCommand/testOneCommand (config.json, or --test-one-cmd for standalone).');
```

(Note: `cfg` changes from `const` to `let`. `fail()` calls `process.exit`, so `cfg` is always
assigned before the next line runs.)

### Step 4: Update the reverse-mode error string

Find (in `runReverse()`, ~line 131):

```javascript
  if (!cfg.testOneCommand) fail('--reverse requires testOneCommand in config.json (it runs ONLY the one test).');
```

Replace with:

```javascript
  if (!cfg.testOneCommand) fail('--reverse requires testOneCommand (config.json) or --test-one-cmd (standalone) — it runs ONLY the one test.');
```

### Step 5: Run the test to verify it PASSES

Run: `node test/discriminator-reverse-standalone.test.mjs`
Expected: `discriminator-reverse-standalone: all 3 checks passed. ✓` (exit 0).

### Step 6: Verify no regression in the existing suite

Run: `node test/workflow-load.test.mjs` (unrelated but cheap) and any discriminator-touching test.
Then sanity-check the effort path is untouched by reading the diff: the `if (effortRoot)` branch
must be behavior-identical to the original (same `loadConfig(effortRoot)` call).

### Step 7: Commit

```bash
git add lib/discriminator.mjs
git commit -m "$(cat <<'EOF'
feat(discriminator): green — effort-free reverse path via --test-one-cmd/--test-glob

Standalone teeth confirmation for tdd-audit: when no .reasonable/ effort is
present, synthesize config from flags and run the same runReverse(). The
config-driven characterizer path is unchanged.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

## Acceptance Criteria
- [ ] All 3 checks in `test/discriminator-reverse-standalone.test.mjs` pass.
- [ ] The T01a test file was NOT modified.
- [ ] The `if (effortRoot)` branch calls `loadConfig(effortRoot)` exactly as before (no behavior
      change for the characterizer / effort callers).
- [ ] `lib/discriminator.mjs` still imports only node builtins + `./effort.mjs` (no new deps).
