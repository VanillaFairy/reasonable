// test/per-stack-command.test.mjs
// Regression for the stack-blind mechanical-audit bug: on a multi-stack effort
// (e.g. python+typescript) the mechanical teeth ran ONE effort-global testCommand,
// so a `.py` file was "verified" by `cd admin && npm test` — a hollow check. The
// fix: testCommand/testOneCommand may be a per-stack list of {globs, command,
// oneCommand}; the tools select the stack of the FILE UNDER TEST, and the green
// gate runs EVERY stack. A single-string testCommand stays the single-stack fast path.
//
// Two layers of proof:
//   (1) unit — the selection helpers in lib/effort.mjs pick the right command by file;
//   (2) e2e — mutation-sample and the absence discriminator actually run the
//       stack-appropriate command (a "survives if the WRONG stack ran" harness).
//
// Node builtins only. Run: node test/per-stack-command.test.mjs

import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadConfig,
  testCommandFor,
  testOneCommandFor,
  allTestCommands,
} from '../lib/effort.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const mutPath = join(here, '..', 'lib', 'mutation-sample.mjs');
const discPath = join(here, '..', 'lib', 'discriminator.mjs');

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.stack || e.message}`); process.exitCode = 1; }
}

// ── (1) unit: selection helpers ────────────────────────────────────────────────
// A real python+typescript config, exactly the shape the failing run needed.
const mixed = {
  ...loadConfig(null),
  stack: 'python+typescript',
  testCommand: [
    { globs: ['server/**'], command: 'python -m pytest server/tests -q', oneCommand: 'python -m pytest server/tests -q -k {test}' },
    { globs: ['admin/**'],  command: 'cd admin && npm test',            oneCommand: 'cd admin && npm test -- {test}' },
    { globs: ['client/**'], command: 'cd client && npm test',           oneCommand: 'cd client && npm test -- {test}' },
  ],
};
const single = { ...loadConfig(null), stack: 'rust', testCommand: 'cargo test', testOneCommand: 'cargo test {test}' };

check('multi-stack: full-suite command selected by the file under test', () => {
  assert.equal(testCommandFor(mixed, 'server/layout/engine.py'), 'python -m pytest server/tests -q');
  assert.equal(testCommandFor(mixed, 'admin/src/graph.ts'),      'cd admin && npm test');
  assert.equal(testCommandFor(mixed, 'client/src/app.tsx'),      'cd client && npm test');
});

check('multi-stack: {test}-templated command selected by the file under test', () => {
  assert.equal(testOneCommandFor(mixed, 'server/tests/unit/test_layout_bfs.py'), 'python -m pytest server/tests -q -k {test}');
  assert.equal(testOneCommandFor(mixed, 'admin/src/foo.test.ts'),                'cd admin && npm test -- {test}');
});

check('multi-stack: a file matching no stack resolves to null (loud gap, never the wrong stack)', () => {
  assert.equal(testCommandFor(mixed, 'docs/notes.rb'), null);
  assert.equal(testOneCommandFor(mixed, 'docs/notes.rb'), null);
});

check('multi-stack: the green gate runs every stack', () => {
  assert.deepEqual(allTestCommands(mixed), [
    'python -m pytest server/tests -q',
    'cd admin && npm test',
    'cd client && npm test',
  ]);
});

check('single-stack: a string testCommand is unchanged (matches every file)', () => {
  assert.equal(testCommandFor(single, 'src/whatever.rs'), 'cargo test');
  assert.equal(testCommandFor(single, 'anything/at/all'), 'cargo test');
  assert.equal(testOneCommandFor(single, 'src/x.rs'), 'cargo test {test}');
  assert.deepEqual(allTestCommands(single), ['cargo test']);
});

// ── shared git-repo fixtures ────────────────────────────────────────────────────
const git = (cwd, ...args) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
const write = (root, rel, content) => {
  const p = join(root, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
};
const tmps = [];
function newRepo() {
  const root = mkdtempSync(join(tmpdir(), 'per-stack-'));
  tmps.push(root);
  git(root, 'init', '-q');
  const hooks = join(root, '.nohooks');
  mkdirSync(hooks, { recursive: true });
  git(root, 'config', 'core.hooksPath', hooks);
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'user.name', 'Per-Stack Test');
  git(root, 'config', 'commit.gpgsign', 'false');
  return root;
}
// A runner-free mini "suite": `node run.js <stack>` runs every <stack>/tests/*.test.js.
// Each stack tests ONLY its own source, so running the WRONG stack's command over
// another stack's mutation lets the mutant survive — the teeth of these e2e checks.
const RUN_JS = [
  "const fs = require('node:fs');",
  "const path = require('node:path');",
  "const which = process.argv[2];",
  "const dir = path.join(which, 'tests');",
  "let files = [];",
  "try { files = fs.readdirSync(dir); } catch {}",
  "for (const f of files) if (f.endsWith('.test.js')) require(path.resolve(dir, f));",
  "",
].join('\n');
const calc = (op) => `module.exports = { isPos: (n) => n ${op} 0 };\n`;
const calcTest = (expectZero) => [
  "const assert = require('node:assert');",
  "const { isPos } = require('../calc.js');",
  `assert.strictEqual(isPos(0), ${expectZero});`,
  "assert.strictEqual(isPos(1), true);",
  "",
].join('\n');

function runJson(cwd, bin, argv) {
  try {
    const out = execFileSync('node', [bin, ...argv], { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
    return { code: 0, json: safeParse(out) };
  } catch (e) {
    return { code: e.status ?? 1, json: safeParse((e.stdout || '').toString()), stderr: (e.stderr || '').toString() };
  }
}
function safeParse(s) { try { return JSON.parse(s); } catch { return null; } }

// A mixed-stack config.json written into <root>/.reasonable so the libs resolve it via --root.
function writeMixedConfig(root) {
  write(root, '.reasonable/config.json', JSON.stringify({
    stack: 'py+ts',
    testCommand: [
      { globs: ['py/**'], command: 'node run.js py', oneCommand: 'node run.js py {test}' },
      { globs: ['ts/**'], command: 'node run.js ts', oneCommand: 'node run.js ts {test}' },
    ],
  }, null, 2));
}

// ── (2a) e2e: mutation-sample runs the mutated file's stack ─────────────────────
// Both stacks have a `n > 0` source pinned by their own test. A `.py`-scoped run
// must run `node run.js py`, which KILLS the py mutant. If it wrongly ran the ts
// command, the py mutant would SURVIVE (ts tests never touch py/calc.js).
function mutationRepo() {
  const root = newRepo();
  write(root, 'run.js', RUN_JS);
  write(root, 'py/calc.js', calc('>'));
  write(root, 'py/tests/calc.test.js', calcTest(false)); // isPos(0) === false pins `> 0`
  write(root, 'ts/calc.js', calc('>'));
  write(root, 'ts/tests/calc.test.js', calcTest(false));
  writeMixedConfig(root);
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'init');
  return root;
}

check('e2e mutation-sample: a py-scoped mutant is killed by the py command (not surviving under a wrong-stack run)', () => {
  const root = mutationRepo();
  const res = runJson(root, mutPath, ['--scope', 'py/**', '--root', root, '--tree', root, '--json']);
  assert.ok(res.json, `must emit --json (stderr: ${res.stderr || ''})`);
  assert.equal(res.json.sampled, 1, 'exactly one py mutation site');
  assert.deepEqual(res.json.survivors, [], 'py mutant must be KILLED → the py command was selected and actually ran the py tests');
  assert.equal(res.code, 0);
});

check('e2e mutation-sample: a ts-scoped mutant is killed by the ts command', () => {
  const root = mutationRepo();
  const res = runJson(root, mutPath, ['--scope', 'ts/**', '--root', root, '--tree', root, '--json']);
  assert.ok(res.json, `must emit --json (stderr: ${res.stderr || ''})`);
  assert.equal(res.json.sampled, 1);
  assert.deepEqual(res.json.survivors, [], 'ts mutant must be KILLED → the ts command was selected');
});

// ── (2b) e2e: the absence discriminator runs the overlaid test's stack ──────────
// Base pins isPos(0)===true (source `n >= 0`). The changed test flips to
// isPos(0)===false; overlaid on the base source it must go RED — but ONLY if the
// discriminator selects the correct stack command for that test file.
function discriminatorRepo(stack) {
  const root = newRepo();
  write(root, 'run.js', RUN_JS);
  for (const s of ['py', 'ts']) {
    write(root, `${s}/calc.js`, calc('>=')); // base: isPos(0) === true
    write(root, `${s}/tests/calc.test.js`, calcTest(true));
  }
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'base');
  const base = git(root, 'rev-parse', 'HEAD').trim();
  // Working-tree "change": tighten ONE stack's test (and its source) — the other is untouched.
  write(root, `${stack}/calc.js`, calc('>'));
  write(root, `${stack}/tests/calc.test.js`, calcTest(false));
  writeMixedConfig(root); // untracked → not in `git diff base`, harmless to selection
  return { root, base };
}

check('e2e discriminator: a changed py test is discriminating via the py command', () => {
  const { root, base } = discriminatorRepo('py');
  const res = runJson(root, discPath, ['--base', base, '--root', root, '--json']);
  assert.ok(res.json, `must emit --json (stderr: ${res.stderr || ''})`);
  assert.equal(res.json.discriminating, true, 'the py command must run the overlaid py test and see it fail on base');
  assert.equal(res.code, 0);
});

check('e2e discriminator: a changed ts test is discriminating via the ts command', () => {
  const { root, base } = discriminatorRepo('ts');
  const res = runJson(root, discPath, ['--base', base, '--root', root, '--json']);
  assert.ok(res.json, `must emit --json (stderr: ${res.stderr || ''})`);
  assert.equal(res.json.discriminating, true, 'the ts command must run the overlaid ts test and see it fail on base');
});

for (const t of tmps) { try { rmSync(t, { recursive: true, force: true }); } catch { /* best effort */ } }

if (process.exitCode) console.error(`\nper-stack-command: FAILURES above (${passed} passed).`);
else console.log(`\nper-stack-command: all ${passed} checks passed. ✓`);
