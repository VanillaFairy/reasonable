// Standalone test for lib/commit-accounting.mjs — node builtins only. Run: node test/commit-accounting.test.mjs
//
// T0.4 verification: commit-accounting partitions commits into accounted (recorded in the journal's
// LANE REGISTRY — `workOrders[].commits` + `mergedCommits`) vs unaccounted (external input). It reads
// ONLY those lane-registry fields, never a per-WO `status`, so retiring `status` (T0.4) leaves it
// correct. This pins that: a STATUS-FREE journal still accounts its recorded commits and flags an
// external commit as unaccounted.

import assert from 'node:assert';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const LIB = join(here, '..', 'lib', 'commit-accounting.mjs');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
const write = (root, rel, content) => {
  const p = join(root, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, content);
};
const commit = (root, rel, body, msg) => {
  write(root, rel, body); git(root, 'add', '-A'); git(root, 'commit', '-q', '-m', msg);
  return git(root, 'rev-parse', 'HEAD').trim();
};

const tmps = [];
function newEffort() {
  const root = mkdtempSync(join(tmpdir(), 'ca-')); tmps.push(root);
  git(root, 'init', '-q');
  const hooks = join(root, '.nohooks'); mkdirSync(hooks, { recursive: true });
  git(root, 'config', 'core.hooksPath', hooks);
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'user.name', 'Commit Accounting Test');
  git(root, 'config', 'commit.gpgsign', 'false');
  // Make %h (abbreviated) at least 12 chars so the module's 12-char-prefix accounting is exact.
  git(root, 'config', 'core.abbrev', '12');
  write(root, '.gitignore', '.reasonable/\n.nohooks/\n');
  const base = commit(root, 'README.md', 'base\n', 'init');
  return { root, base };
}

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.stack || e.message}`); process.exitCode = 1; }
}

function runJson(root, since) {
  const res = spawnSync(process.execPath, [LIB, '--root', root, '--since', since, '--json'], { encoding: 'utf8' });
  assert.equal(res.status, 0, `CLI exited non-zero: ${res.stderr}`);
  return JSON.parse(res.stdout);
}

// 1 — a STATUS-FREE journal accounts its lane-registry commits (workOrders[].commits + mergedCommits)
//     and flags an external commit as unaccounted.
check('status-free journal: recorded lane commits are accounted; an external commit is unaccounted', () => {
  const { root, base } = newEffort();
  const shaWork = commit(root, 'src/feature.js', 'export const f = 1;\n', 'feat: WO-1 work product');
  const shaMerged = commit(root, 'src/merged.js', 'export const m = 1;\n', 'merge: slice-1 lane');
  const shaExternal = commit(root, 'src/human.js', 'export const h = 1;\n', 'human: hotfix by hand');

  // No per-WO `status` anywhere — only the lane registry.
  write(root, '.reasonable/journal.json', JSON.stringify({
    effort: 'demo', currentVerticalSlice: 'slice-1', phase: 'vertical-slice-execution',
    workOrders: { 'WO-1': { verticalSlice: 'slice-1', role: 'implementer', worktree: '.worktrees/WO-1', branch: 'lane/WO-1', commits: [shaWork] } },
    mergedCommits: [shaMerged], lanes: {}, inbox: [],
  }, null, 2) + '\n');

  const out = runJson(root, base);
  const unaccountedShas = out.unaccounted.map((c) => c.sha);
  assert.ok(unaccountedShas.some((s) => shaExternal.startsWith(s)), `the external commit must be unaccounted; got ${JSON.stringify(out.unaccounted)}`);
  assert.ok(!unaccountedShas.some((s) => shaWork.startsWith(s)), 'the recorded WO commit must be accounted (not flagged)');
  assert.ok(!unaccountedShas.some((s) => shaMerged.startsWith(s)), 'the recorded merged commit must be accounted (not flagged)');
  assert.equal(out.unaccounted.length, 1, `exactly one unaccounted (the external commit); got ${JSON.stringify(out.unaccounted)}`);
});

// 2 — with everything recorded, nothing is unaccounted (the status-free journal fully accounts its lane).
check('status-free journal: all recorded commits accounted → empty unaccounted set', () => {
  const { root, base } = newEffort();
  const a = commit(root, 'src/a.js', 'export const a = 1;\n', 'feat: a');
  const b = commit(root, 'src/b.js', 'export const b = 1;\n', 'feat: b');
  write(root, '.reasonable/journal.json', JSON.stringify({
    effort: 'demo',
    workOrders: { 'WO-1': { commits: [a] }, 'WO-2': { commits: [b] } },
    mergedCommits: [], lanes: {}, inbox: [],
  }, null, 2) + '\n');
  const out = runJson(root, base);
  assert.deepEqual(out.unaccounted, [], `nothing external → no unaccounted; got ${JSON.stringify(out.unaccounted)}`);
});

for (const t of tmps) { try { rmSync(t, { recursive: true, force: true }); } catch { /* best effort */ } }

if (process.exitCode) console.error(`\ncommit-accounting: FAILURES above (${passed} passed).`);
else console.log(`\ncommit-accounting: all ${passed} checks passed. ✓`);
