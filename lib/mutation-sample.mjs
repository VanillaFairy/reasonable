// mutation-sample.mjs — mutate the implementation k times; surviving mutants
// expose vacuous tests (DESIGN §5.6 audit (c), §5.9). Most expensive audit, so
// run at vertical-slice gates, not per task. Also catches test-value-keyed branching:
// hardcoded input→output pairs survive most mutations.
//
// Deterministic by construction (stride sampling, no RNG) so a re-run reproduces.
// Mutates only git-tracked source in scope, restoring each file from memory after
// every trial — never leaves the tree dirty.
//
// Usage:
//   node mutation-sample.mjs [k] [--scope <glob> ...] [--json]
//
// Requires testCommand in .reasonable/config.json. On a multi-stack config
// (testCommand is a per-stack {globs, command} list) each mutant runs the suite of
// the stack that owns the MUTATED FILE; a plain string is the single-stack case.

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { findEffortRoot, rootFromArgv, loadConfig, matchesAny, norm, relative, testCommandFor } from './effort.mjs';

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const scope = [];
for (let i = 0; i < args.length; i++) if (args[i] === '--scope') scope.push(args[++i]);
const kArg = args.find((a) => /^\d+$/.test(a));
const _ti = args.indexOf('--tree');
const tree = _ti >= 0 ? args[_ti + 1] : null; // the lane worktree where the code under test lives (two-root)

const effortRoot = rootFromArgv(process.argv, process.cwd());
if (!effortRoot) { console.error('No effort found (pass --root <effortRoot> or run from inside the effort).'); process.exit(2); }
const cfg = loadConfig(effortRoot);
if (!cfg.testCommand) { console.error('No testCommand in config.json.'); process.exit(2); }
// Config comes from the effort root; the code to mutate + the suite to run live in the
// lane worktree (--tree) in a two-root effort, else the effort root (single-root).
const treeRoot = tree || effortRoot;
const K = Number(kArg || cfg.mutationK || 5);

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
  for (const e of es) { const p = join(dir, e); let st; try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) { if (!SKIP_DIRS.has(e)) yield* walk(p); } else if (st.isFile()) yield p; }
}

// Enumerate candidate mutation sites in scope (source, not tests).
const sites = [];
for (const file of walk(treeRoot)) {
  const rel = norm(relative(treeRoot, file));
  if (!/\.(rs|ts|tsx|js|jsx|py|go|java|kt|swift)$/.test(rel)) continue;
  if (matchesAny(rel, cfg.testGlobs)) continue;
  if (scope.length && !matchesAny(rel, scope)) continue;
  const text = readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);
  lines.forEach((line, li) => {
    for (const [re, repl] of MUTATIONS) {
      re.lastIndex = 0;
      if (re.test(line)) sites.push({ file, rel, li, re, repl, original: line });
    }
  });
}

if (!sites.length) { out({ k: K, sampled: 0, survivors: [], note: 'no mutable sites in scope' }); }

// Deterministic stride sample of K sites.
const stride = Math.max(1, Math.floor(sites.length / K));
const sampled = [];
for (let i = 0; i < sites.length && sampled.length < K; i += stride) sampled.push(sites[i]);

// Run the suite of the stack owning the mutated file (multi-stack) — mutating a
// `.py` source and running `npm test` would let every mutant survive vacuously.
function testsPass(cmd) {
  try { execSync(cmd, { cwd: treeRoot, stdio: ['ignore', 'pipe', 'pipe'] }); return true; }
  catch { return false; }
}

const survivors = [];
const unresolved = []; // sites whose file no stack owns — can't verify (loud gap, never a wrong-stack run)
for (const s of sampled) {
  const cmd = testCommandFor(cfg, s.rel);
  if (!cmd) { unresolved.push(s.rel); continue; }
  const text = readFileSync(s.file, 'utf8');
  const lines = text.split(/\r?\n/);
  s.re.lastIndex = 0;
  const mutatedLine = lines[s.li].replace(s.re, s.repl);
  if (mutatedLine === lines[s.li]) continue;
  lines[s.li] = mutatedLine;
  writeFileSync(s.file, lines.join('\n'));
  try {
    if (testsPass(cmd)) survivors.push({ file: s.rel, line: s.li + 1, from: s.original.trim(), to: mutatedLine.trim() });
  } finally {
    writeFileSync(s.file, text); // restore exact original bytes
  }
}

out({ k: K, sampled: sampled.length, survivors, ...(unresolved.length ? { unresolved } : {}) });

function out(report) {
  if (asJson) { console.log(JSON.stringify(report, null, 2)); process.exit(report.survivors && report.survivors.length ? 1 : 0); }
  console.log(`Mutation sampling: ${report.sampled} mutants run (k=${report.k}).`);
  if (!report.survivors || !report.survivors.length) { console.log('No survivors — sampled assertions are not vacuous. ✓'); process.exit(0); }
  console.log(`\nSurvivors (${report.survivors.length}) — the suite did NOT catch these behavior changes:`);
  for (const m of report.survivors) console.log(`  ${m.file}:${m.line}\n    ${m.from}\n  → ${m.to}`);
  console.log('\nA surviving mutant means a test asserts too weakly there (or branches on test values). Strengthen it.');
  process.exit(1);
}
