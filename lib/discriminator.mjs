// discriminator.mjs — a test must reject some state of the world, or it verifies
// nothing. Two duals:
//
//   Absence mode (greenfield, default; DESIGN §5.6 audit (a)) — a new/changed
//   test must FAIL on the pre-task commit. A test that passes on both the old and
//   new implementation verifies nothing; it proves something only if there exists
//   a state of the world it rejects. The test-after world's reconstruction of
//   "watch it fail first," fully automatic.
//     Mechanism: stand up a throwaway worktree at <base> (old code), overlay the
//     new/changed test files onto it, run the suite, assert RED.
//
//   Reverse / characterization mode (brownfield, --reverse; architecture §18 BF2)
//   — a characterization clause is born GREEN by observation ("pin what is, not
//   what should be"), so HEAD~ absence cannot vouch for it. Real teeth instead:
//   the test must (a) PASS on unmutated HEAD and (b) go RED, run alone, under at
//   least one locus-scoped source mutant. This is the exact dual of "RED at
//   HEAD~." It does NOT delegate to mutation-sample.mjs (that runs the whole
//   suite and reports only suite-wide survivors — on a covered legacy repo it
//   would pass vacuously for every characterization test, proving the suite has
//   teeth, not the new test). Per-test and mechanical, as Feathers requires.
//     Mechanism: stand up a throwaway worktree at HEAD, overlay ONLY the one
//     named test, assert it PASSES; then apply each locus-scoped source mutant in
//     turn, run ONLY that test, and assert it goes RED under at least one.
//
// Usage:
//   node discriminator.mjs [--base HEAD~1] [--test <name>] [--json]
//   node discriminator.mjs --reverse --test <name> --locus <glob> [--locus <glob> ...] [--json]
//
// Requires git + a testCommand (or testOneCommand) in .reasonable/config.json.
// All git runs go through execFile (no shell); only the configured test command
// is run via a shell, since it is intentionally a shell command line.

import { execSync } from 'node:child_process';
import { mkdtempSync, copyFileSync, mkdirSync, rmSync, existsSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { findEffortRoot, loadConfig, matchesAny, norm, relative, git, gitTry } from './effort.mjs';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const base = opt('--base', 'HEAD~1');
const testName = opt('--test', null);
const reverse = args.includes('--reverse');
const locus = [];
for (let i = 0; i < args.length; i++) if (args[i] === '--locus') locus.push(args[++i]);
const asJson = args.includes('--json');

// Trusted, config-provided shell command line (see config.json testCommand).
function runTest(cmd, cwd) {
  try { execSync(cmd, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }); return { pass: true }; }
  catch (e) { return { pass: false, out: (e.stdout || '') + (e.stderr || '') }; }
}

const effortRoot = findEffortRoot(process.cwd());
if (!effortRoot) fail('No effort (.reasonable/) found from cwd.');
const cfg = loadConfig(effortRoot);
if (!cfg.testCommand && !cfg.testOneCommand) fail('No testCommand/testOneCommand in config.json.');

const repo = gitTry(['rev-parse', '--show-toplevel'], effortRoot);
if (!repo.ok) fail('Not a git repository — discriminator needs git history.');
const repoRoot = repo.out.trim();

// ── Absence mode (greenfield default) — UNCHANGED ──────────────────────────────
function runAbsence() {
  // Which test files changed relative to base (committed + working tree)?
  const diff = gitTry(['diff', '--name-only', base, '--'], repoRoot);
  if (!diff.ok) fail(`git diff against ${base} failed: ${diff.out}`);
  const changed = diff.out.split(/\r?\n/).filter(Boolean).map(norm).filter((f) => matchesAny(f, cfg.testGlobs));
  if (!changed.length) fail(`No changed test files vs ${base}; nothing to discriminate.`);

  const tmp = mkdtempSync(join(tmpdir(), 'reasonable-disc-'));
  let result;
  try {
    git(['worktree', 'add', '--detach', tmp, base], repoRoot);
    for (const rel of changed) {            // overlay new tests onto OLD code
      const src = join(repoRoot, rel), dst = join(tmp, rel);
      if (!existsSync(src)) continue;       // test deleted at HEAD — skip
      mkdirSync(dirname(dst), { recursive: true });
      copyFileSync(src, dst);
    }
    const cmd = testName && cfg.testOneCommand
      ? cfg.testOneCommand.replace('{test}', testName)
      : cfg.testCommand;
    result = runTest(cmd, tmp);
  } finally {
    removeWorktree(tmp);
  }

  const discriminating = !result.pass;     // we WANT red at base
  const report = { mode: 'absence', base, changedTests: changed, testName, discriminating, ranGreenAtBase: result.pass };

  if (asJson) { console.log(JSON.stringify(report, null, 2)); process.exit(discriminating ? 0 : 1); }
  if (discriminating) {
    console.log(`✓ Discriminating: changed test(s) FAIL on ${base} (old code). They reject a real state of the world.`);
    console.log(`  Tests: ${changed.join(', ')}`);
    process.exit(0);
  }
  console.error(`✗ VACUOUS: changed test(s) PASS on ${base} (old code) too — they verify nothing.`);
  console.error(`  Tests: ${changed.join(', ')}\n  A test proves something only if there exists a state it rejects. Strengthen the assertion.`);
  process.exit(1);
}

// ── Reverse / characterization mode (brownfield, §18 BF2) ──────────────────────
// Same source-mutation operators as mutation-sample.mjs (deliberately NOT calling
// it — see the header), applied here per-clause-locus against a single test.
const MUTATIONS = [
  [/===/g, '!=='], [/!==/g, '==='],
  [/([^=!<>])==([^=])/g, '$1!=$2'], [/([^=!<>])!=([^=])/g, '$1==$2'],
  [/\s&&\s/g, ' || '], [/\s\|\|\s/g, ' && '],
  [/\btrue\b/g, 'false'], [/\bfalse\b/g, 'true'],
  [/\s<\s/g, ' >= '], [/\s>\s/g, ' <= '],
];
const SKIP_DIRS = new Set(['.git', 'node_modules', 'target', 'dist', 'build', '.worktrees', '.reasonable', '.next', 'out']);
function* walk(dir) {
  let es; try { es = readdirSync(dir); } catch { return; }
  for (const e of es) {
    const p = join(dir, e); let st; try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) { if (!SKIP_DIRS.has(e)) yield* walk(p); }
    else if (st.isFile()) yield p;
  }
}

function runReverse() {
  if (!testName) fail('--reverse requires --test <name> (the single characterization test).');
  if (!cfg.testOneCommand) fail('--reverse requires testOneCommand in config.json (it runs ONLY the one test).');
  if (!locus.length) fail('--reverse requires at least one --locus <glob> (the clause locus to mutate).');

  const cmd = cfg.testOneCommand.replace('{test}', testName);
  const tmp = mkdtempSync(join(tmpdir(), 'reasonable-disc-rev-'));
  let report;
  try {
    git(['worktree', 'add', '--detach', tmp, 'HEAD'], repoRoot);

    // (a) The test must PASS on unmutated HEAD — a characterization pin is born
    // GREEN; if it is already red on HEAD it pins nothing real.
    const onHead = runTest(cmd, tmp);
    const passesOnHead = onHead.pass;

    // (b) Enumerate locus-scoped source mutation sites in the worktree, then run
    // ONLY this one test under each mutant until one makes it go RED.
    const sites = enumerateLocusSites(tmp);
    const mutants = []; // {file, line, from, to, red}
    let redUnderMutant = false;
    if (passesOnHead) {
      for (const s of sites) {
        if (redUnderMutant) break;          // one RED suffices (§18 v1)
        const original = readFileSync(s.file, 'utf8');
        const lines = original.split(/\r?\n/);
        s.re.lastIndex = 0;
        const mutatedLine = lines[s.li].replace(s.re, s.repl);
        if (mutatedLine === lines[s.li]) continue;
        lines[s.li] = mutatedLine;
        writeFileSync(s.file, lines.join('\n'));
        let red;
        try { red = !runTest(cmd, tmp).pass; }
        finally { writeFileSync(s.file, original); } // restore exact original bytes
        if (red) {
          redUnderMutant = true;
          mutants.push({ file: s.rel, line: s.li + 1, from: s.original.trim(), to: mutatedLine.trim(), red: true });
        }
      }
    }

    const admissible = passesOnHead && redUnderMutant;
    report = {
      mode: 'reverse', testName, locus,
      passesOnHead, sitesTried: sites.length, redUnderMutant, admissible,
      killingMutant: mutants[0] || null,
    };
  } finally {
    removeWorktree(tmp);
  }

  if (asJson) { console.log(JSON.stringify(report, null, 2)); process.exit(report.admissible ? 0 : 1); }
  if (report.admissible) {
    console.log(`✓ Characterization test has teeth: PASSES on HEAD and goes RED under a locus mutant.`);
    console.log(`  Test: ${report.testName}`);
    const m = report.killingMutant;
    if (m) console.log(`  Killed by ${m.file}:${m.line}\n    ${m.from}\n  → ${m.to}`);
    process.exit(0);
  }
  if (!report.passesOnHead) {
    console.error(`✗ NOT A PIN: ${report.testName} does not PASS on unmutated HEAD — a characterization test must pin current behaviour.`);
  } else {
    console.error(`✗ VACUOUS: ${report.testName} PASSES on HEAD but no locus mutant (${report.sitesTried} tried) makes it RED — it pins nothing in its locus.`);
    console.error(`  Locus: ${report.locus.join(', ')}\n  Tighten the assertion so it rejects a real change at the seam.`);
  }
  process.exit(1);
}

// Enumerate candidate mutation sites inside `root` whose file matches the clause
// locus globs (source, never tests). Returns {file, rel, li, re, repl, original}.
function enumerateLocusSites(root) {
  const sites = [];
  for (const file of walk(root)) {
    const rel = norm(relative(root, file));
    if (!/\.(rs|ts|tsx|js|jsx|py|go|java|kt|swift)$/.test(rel)) continue;
    if (matchesAny(rel, cfg.testGlobs)) continue;     // never mutate tests
    if (!matchesAny(rel, locus)) continue;            // only the clause locus
    let text; try { text = readFileSync(file, 'utf8'); } catch { continue; }
    const lines = text.split(/\r?\n/);
    lines.forEach((line, li) => {
      for (const [re, repl] of MUTATIONS) {
        re.lastIndex = 0;
        if (re.test(line)) sites.push({ file, rel, li, re, repl, original: line });
      }
    });
  }
  return sites;
}

// ── shared ─────────────────────────────────────────────────────────────────────
function removeWorktree(tmp) {
  if (!gitTry(['worktree', 'remove', '--force', tmp], repoRoot).ok) {
    try { rmSync(tmp, { recursive: true, force: true }); } catch {}
  }
}

function fail(msg) {
  if (asJson) console.log(JSON.stringify({ error: msg }, null, 2));
  else console.error(`discriminator: ${msg}`);
  process.exit(2);
}

// Dispatch LAST — runs only after MUTATIONS / SKIP_DIRS and every helper are
// initialized, so reverse mode never touches a still-in-TDZ const. (Absence mode
// was unaffected only because it reads neither; reverse mode reads both.)
if (reverse) runReverse(); else runAbsence();
