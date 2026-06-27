# Task T01a: Discriminator standalone reverse path — author the test (role: red)

## References
- Read: `../shared/architecture.md`
- Read: `../shared/interfaces.md` (§1 — the exact CLI + JSON contract)
- Read: `../shared/conventions.md` (Node test files)
- Read: `../knowledge/run-tests.md`
- Read the existing harness to copy its shape: `test/commit-gate.test.mjs`
- Read the code under test: `lib/discriminator.mjs` (the `runReverse()` function + the config block
  at lines ~55–58)

## Dependencies
- Depends on: — (none)
- Depended on by: T01b (green)

## Role: red — you author the failing test ONLY. You do NOT modify `lib/discriminator.mjs`.

## Scope
**Files:**
- Create: `test/discriminator-reverse-standalone.test.mjs`

**BOUNDARY — you MUST NOT modify any files outside this list.** In particular, do NOT touch
`lib/discriminator.mjs` — that is T01b's job. If the test reveals the CLI contract is wrong,
escalate; do not edit the implementation to fit.

## Positive Constraints (DO)
- Build a throwaway git repo (no `.reasonable/` — this proves the path is effort-free) containing a
  one-line source with a mutable operator and a tiny single-test runner.
- Exercise the standalone reverse-discriminator contract from `interfaces.md §1` exactly:
  `--reverse --test <id> --locus <glob> --test-one-cmd '<cmd {test}>' --test-glob <glob> --tree
  <repo> --json`, with NO `--root` and NO effort.
- Assert all three behaviors: a teeth-y test is `admissible:true` (exit 0); a vacuous test is
  `admissible:false` (exit 1); and omitting `--test-one-cmd` with no effort fails with a clear
  error (exit 2).
- Use `n > 0` for the source. (Verified: the discriminator's mutation operators perturb ` > ` but
  NOT `>=`. A `>=` source would yield zero mutants and the test would be meaningless.)
- Clean up all temp repos at the end.

## Negative Constraints (DO NOT)
- Do NOT modify `lib/discriminator.mjs` (T01b owns it).
- Do NOT add a test framework dependency — builtins only.
- Do NOT create a `.reasonable/` dir in the throwaway repo — the point is that none is needed.

## Implementation Steps

### Step 1: Write the failing test

```javascript
// test/discriminator-reverse-standalone.test.mjs
// Standalone test for lib/discriminator.mjs reverse mode WITHOUT a .reasonable/ effort —
// node builtins only (no runner). Run: node test/discriminator-reverse-standalone.test.mjs
//
// Proves the effort-free flag path (tdd-audit's teeth engine): given --test-one-cmd and
// --tree on an arbitrary git repo, the per-test reverse discriminator confirms whether a
// flagged test has teeth. A test that goes RED under a locus mutant is admissible (teeth);
// a test that survives every locus mutant is admissible:false (mechanically-confirmed vacuous).

import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const discPath = join(here, '..', 'lib', 'discriminator.mjs');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
const write = (root, rel, content) => {
  const p = join(root, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
};

const tmps = [];
function newRepo() {
  const root = mkdtempSync(join(tmpdir(), 'disc-rev-'));
  tmps.push(root);
  git(root, 'init', '-q');
  const hooks = join(root, '.nohooks');
  mkdirSync(hooks, { recursive: true });
  git(root, 'config', 'core.hooksPath', hooks);
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'user.name', 'Disc Test');
  git(root, 'config', 'commit.gpgsign', 'false');

  // Source with a MUTABLE operator ( > is perturbed by the engine; >= is NOT).
  write(root, 'src/num.mjs', 'export const isPositive = (n) => n > 0;\n');
  // A single-test runner: `node tests/run.mjs <id>` exits non-zero on assertion failure.
  write(root, 'tests/run.mjs', [
    "import assert from 'node:assert';",
    "import { isPositive } from '../src/num.mjs';",
    'const which = process.argv[2];',
    "if (which === 'teeth') {",
    '  assert.strictEqual(isPositive(5), true);',
    '  assert.strictEqual(isPositive(-3), false);',
    "} else if (which === 'vacuous') {",
    "  assert.strictEqual(typeof isPositive, 'function');",
    '} else {',
    "  throw new Error('unknown test: ' + which);",
    '}',
    '',
  ].join('\n'));

  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'init');
  return root;
}

// Run the discriminator; capture exit code + parsed --json from stdout (printed on 0 and 1).
function runDisc(cwd, argv) {
  try {
    const out = execFileSync('node', [discPath, ...argv], { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
    return { code: 0, json: safeParse(out) };
  } catch (e) {
    const out = (e.stdout || '').toString();
    return { code: e.status ?? 1, json: safeParse(out), stderr: (e.stderr || '').toString() };
  }
}
function safeParse(s) { try { return JSON.parse(s); } catch { return null; } }

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.message}`); process.exitCode = 1; }
}

const COMMON = (repo) => [
  '--reverse', '--locus', 'src/**',
  '--test-one-cmd', 'node tests/run.mjs {test}',
  '--test-glob', 'tests/**',
  '--tree', repo, '--json',
];

// A — a teeth-y test (asserts both branches) is admissible: passes on HEAD, RED under the `n > 0`→`n <= 0` mutant.
check('standalone: teeth-y test is admissible (exit 0)', () => {
  const repo = newRepo();
  const res = runDisc(repo, ['--test', 'teeth', ...COMMON(repo)]);
  assert.equal(res.code, 0, 'admissible test must exit 0');
  assert.ok(res.json, 'must emit --json');
  assert.equal(res.json.admissible, true);
  assert.equal(res.json.passesOnHead, true);
  assert.equal(res.json.redUnderMutant, true);
});

// B — a vacuous test (typeof check) survives every locus mutant → admissible:false.
check('standalone: vacuous test is mechanically-confirmed vacuous (exit 1)', () => {
  const repo = newRepo();
  const res = runDisc(repo, ['--test', 'vacuous', ...COMMON(repo)]);
  assert.equal(res.code, 1, 'inadmissible test must exit 1');
  assert.ok(res.json, 'must emit --json even on exit 1');
  assert.equal(res.json.admissible, false);
  assert.equal(res.json.passesOnHead, true);
  assert.equal(res.json.redUnderMutant, false);
});

// C — no effort AND no --test-one-cmd → a clear usage failure (exit 2), never a silent pass.
check('standalone: missing --test-one-cmd with no effort fails clearly (exit 2)', () => {
  const repo = newRepo();
  const res = runDisc(repo, ['--reverse', '--test', 'teeth', '--locus', 'src/**', '--tree', repo, '--json']);
  assert.equal(res.code, 2, 'usage failure exits 2');
  assert.ok(res.json && /test-one-cmd|standalone/i.test(res.json.error || ''), 'error must point at --test-one-cmd / standalone');
});

for (const t of tmps) { try { rmSync(t, { recursive: true, force: true }); } catch { /* best effort */ } }

if (process.exitCode) console.error(`\ndiscriminator-reverse-standalone: FAILURES above (${passed} passed).`);
else console.log(`\ndiscriminator-reverse-standalone: all ${passed} checks passed. ✓`);
```

### Step 2: Run the test to verify it FAILS for the right reason

Run: `node test/discriminator-reverse-standalone.test.mjs`

Expected: checks **A** and **B** FAIL. Before T01b, `lib/discriminator.mjs` finds no effort root
and calls `fail('No effort (.reasonable/) found …')` (exit 2) for every invocation — so the teeth
run exits 2 (not 0) and the vacuous run exits 2 (not 1). Check **C** may already pass (it expects
exit 2), but the suite as a whole reports FAILURES. This is the correct red: the standalone contract
does not exist yet.

### Step 3: Commit

```bash
git add test/discriminator-reverse-standalone.test.mjs
git commit -m "$(cat <<'EOF'
test(discriminator): red — standalone reverse path (effort-free teeth confirmation)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

## Acceptance Criteria
- [ ] `test/discriminator-reverse-standalone.test.mjs` exists and runs.
- [ ] Checks A and B FAIL before T01b (exit 2 from the no-effort guard), confirming red.
- [ ] No files outside Scope were modified (especially not `lib/discriminator.mjs`).
- [ ] The test uses `n > 0` (a mutable operator), not `>=`.
