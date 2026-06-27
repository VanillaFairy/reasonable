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
  // NOTE: `.js` (CommonJS), NOT `.mjs` — the discriminator's mutation enumerator only
  // recognizes /\.(rs|ts|tsx|js|jsx|py|go|java|kt|swift)$/, so a `.mjs` source is skipped
  // (zero mutation sites) and the teeth test could never go red. `.js` + require keeps the
  // fixture runner-free and inside the mutable-extension set.
  write(root, 'src/num.js', 'const isPositive = (n) => n > 0;\nmodule.exports = { isPositive };\n');
  // A single-test runner: `node tests/run.js <id>` exits non-zero on assertion failure.
  write(root, 'tests/run.js', [
    "const assert = require('node:assert');",
    "const { isPositive } = require('../src/num.js');",
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
  '--test-one-cmd', 'node tests/run.js {test}',
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
