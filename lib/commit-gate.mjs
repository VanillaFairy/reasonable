// commit-gate.mjs — the "done == committed" law (the commit iron rule).
//
// Law 1 (Parity) corollary: a gate pass / slice close / conclude over an
// uncommitted working tree is a false "done" — the claim contradicts reality,
// and the work is one `git checkout` from gone. This module is the single source
// of truth for "is the effort's own work product committed?" and, when asked,
// commits it. Committing is DURABILITY, not ratification — so it runs in both run
// modes (gated and autonomous); the gated control plane still owns the acts that
// ARE decisions (ratifying a gate, merging to the human's branch, pushing).
//
// SCOPE = SAFETY. It stages ONLY the effort's work product: files inside the
// declared loci (a lane's `locus`, or the union of the work-orders' loci) plus
// the tracked `.reasonable/` artifacts. It NEVER runs `git add -A` over the
// human's unrelated WIP, and never auto-adds untracked files of unknown
// provenance. It NEVER pushes and NEVER merges.
//
// Fails OPEN when no effort is active (like every lib hook) — installing the
// plugin must never commit in a plain repo.
//
// Usage:
//   node commit-gate.mjs --check               # exit 1 if in-scope work is uncommitted
//   node commit-gate.mjs --commit "<message>"  # commit in-scope work product, print SHA
//
// Also exports commitGate() / resolveScope() for the Stop backstop and conclude.

import {
  findEffortRoot, rootFromArgv, argvWithoutRoot, findLane, readJson, gitTry, norm, matchesAny,
  readdirSync, join, basename,
} from './effort.mjs';

/**
 * Resolve what this invocation may commit, and where.
 * Returns { treeRoot, effortRoot, loci, source } or null when no effort is reachable.
 *   - source 'lane'        — inside a lane worktree; loci = the lane's declared locus.
 *   - source 'work-orders' — main checkout; loci = union of the work-orders' loci.
 *   - source 'fallback'    — main checkout, no determinable loci (degenerate/legacy).
 */
export function resolveScope(start) {
  const lane = findLane(start);
  if (lane) {
    return {
      treeRoot: lane.__root,
      effortRoot: lane.effortRoot || lane.__root,
      loci: Array.isArray(lane.locus) ? lane.locus : [],
      source: 'lane',
    };
  }
  const effortRoot = findEffortRoot(start);
  if (!effortRoot) return null;

  const loci = [];
  try {
    const woDir = join(effortRoot, '.reasonable', 'work-orders');
    for (const f of readdirSync(woDir)) {
      if (!f.endsWith('.json')) continue;
      const wo = readJson(join(woDir, f));
      if (wo && Array.isArray(wo.locus)) loci.push(...wo.locus);
    }
  } catch { /* no work-orders dir — fall through to fallback */ }

  return {
    treeRoot: effortRoot,
    effortRoot,
    loci,
    source: loci.length ? 'work-orders' : 'fallback',
  };
}

/** Parse `git status --porcelain` into {xy, path, untracked} entries (gitignored already excluded).
 * `--untracked-files=all` lists files individually rather than collapsing an untracked directory
 * to `dir/` — per-file granularity is what scoping and explicit-pathspec staging require. */
function changedEntries(treeRoot) {
  const r = gitTry(['status', '--porcelain', '--untracked-files=all'], treeRoot);
  if (!r.ok) return [];
  const out = [];
  for (const raw of r.out.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const xy = raw.slice(0, 2);
    let path = raw.slice(3);
    const arrow = path.indexOf(' -> '); // rename/copy: keep the destination
    if (arrow >= 0) path = path.slice(arrow + 4);
    path = path.replace(/^"(.*)"$/, '$1'); // git quotes paths with special chars
    out.push({ xy, path: norm(path), untracked: xy === '??' });
  }
  return out;
}

/** Is a changed entry part of the effort's own work product (and thus committable)? */
function inScope(entry, scope) {
  const p = entry.path;
  if (p === '.reasonable' || p.startsWith('.reasonable/')) return true; // effort artifacts
  if (scope.loci.length && matchesAny(p, scope.loci)) return true;      // inside a declared locus
  // Fallback only: loci unknown → a TRACKED modification is presumed effort work;
  // an UNTRACKED file of unknown provenance is left for the human (never swept).
  if (scope.source === 'fallback' && !entry.untracked) return true;
  return false;
}

/**
 * The durability check / action.
 * opts.commit=false → report only. opts.commit=true → stage in-scope work product
 * (explicit pathspec, never `git add -A`) and commit with opts.message.
 */
export function commitGate(start, { commit = false, message = null } = {}) {
  const scope = resolveScope(start || process.cwd());
  if (!scope) return { active: false, clean: true }; // fail open — no effort

  const entries = changedEntries(scope.treeRoot);
  const toStage = entries.filter((e) => inScope(e, scope)).map((e) => e.path);
  const leftUntracked = entries
    .filter((e) => e.untracked && !inScope(e, scope))
    .map((e) => e.path);

  const result = {
    active: true,
    source: scope.source,
    treeRoot: scope.treeRoot,
    inScope: toStage,
    leftUntracked,
    clean: toStage.length === 0,
    warnings: [],
  };
  if (scope.source === 'fallback' && leftUntracked.length) {
    result.warnings.push(
      `loci undeterminable — left ${leftUntracked.length} untracked file(s) unstaged ` +
      `(never swept blindly): ${leftUntracked.join(', ')}`,
    );
  }

  if (!commit || !toStage.length) {
    result.committed = false;
    return result;
  }

  const add = gitTry(['add', '--', ...toStage], scope.treeRoot);
  if (!add.ok) { result.committed = false; result.error = `git add failed: ${add.out.trim()}`; return result; }

  const msg = message || 'chore(reasonable): auto-commit work product (commit-gate backstop)';
  const c = gitTry(['commit', '-m', msg], scope.treeRoot);
  if (!c.ok) { result.committed = false; result.error = `git commit failed: ${c.out.trim()}`; return result; }

  const sha = gitTry(['rev-parse', 'HEAD'], scope.treeRoot);
  result.committed = true;
  result.sha = sha.ok ? sha.out.trim() : null;
  result.clean = true;
  return result;
}

// CLI — exact basename match so importing commitGate() does not trip the CLI block.
if (basename(process.argv[1] || '') === 'commit-gate.mjs') {
  const args = argvWithoutRoot(process.argv).slice(2);
  const ci = args.indexOf('--commit');
  const wantCommit = ci >= 0;
  const message = wantCommit ? (args[ci + 1] && !args[ci + 1].startsWith('--') ? args[ci + 1] : null) : null;

  const res = commitGate(rootFromArgv(process.argv, process.cwd()), { commit: wantCommit, message });

  if (!res.active) { console.log('reasonable commit-gate: no active effort — no-op.'); process.exit(0); }
  for (const w of res.warnings) console.error(`reasonable commit-gate: WARNING — ${w}`);

  if (wantCommit) {
    if (res.error) { console.error(`reasonable commit-gate: ${res.error}`); process.exit(1); }
    if (res.committed) console.log(`reasonable commit-gate: committed ${res.inScope.length} path(s) as ${res.sha}.`);
    else console.log('reasonable commit-gate: nothing in-scope to commit (clean). ✓');
    process.exit(0);
  }

  // --check (default): is the effort's own work product committed?
  if (res.clean) { console.log('reasonable commit-gate: clean — all in-scope work product is committed. ✓'); process.exit(0); }
  console.error(`reasonable commit-gate: UNCOMMITTED in-scope work product (${res.inScope.length}):`);
  for (const p of res.inScope) console.error(`  ${p}`);
  console.error('\n"Done" entails committed (Law 1, Parity). Commit this work product ' +
    '(`commit-gate --commit "<msg>"`) before declaring the gate / slice / effort done.');
  process.exit(1);
}
