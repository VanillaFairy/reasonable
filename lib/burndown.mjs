// burndown.mjs — the two mechanical burndowns (DESIGN §5.3, §6.5):
//   parked tests  = #[ignore="pending:…"] / .skip / @pytest.mark.skip  (the vision's debt)
//   loud stubs    = todo!() / unimplemented!() / NotImplementedError    (the off-path debt)
// Both are queryable counts: "everything unparked is green" is the invariant a
// parked count makes auditable, and a scenario gate physically cannot pass while
// a loud stub remains on-path.
//
// Usage: node burndown.mjs [--json]   (also exports computeBurndown for reconcile)

import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { findEffortRoot, rootFromArgv, loadConfig, matchesAny, norm, relative } from './effort.mjs';

const SKIP_DIRS = new Set(['.git', 'node_modules', 'target', 'dist', 'build', '.worktrees', '.reasonable', '.next', 'out']);

function* walk(dir) {
  let entries; try { entries = readdirSync(dir); } catch { return; }
  for (const e of entries) {
    const p = join(dir, e);
    let st; try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) { if (!SKIP_DIRS.has(e)) yield* walk(p); }
    else if (st.isFile()) yield p;
  }
}

/** Compute parked-test and loud-stub inventories for an effort. */
export function computeBurndown(effortRoot, cfg) {
  cfg = cfg || loadConfig(effortRoot);
  const parkRe = new RegExp(cfg.parkMarkerRegex || 'pending:');
  const stubMarkers = cfg.loudStubMarkers || [];
  const parked = [];
  const stubs = [];
  for (const file of walk(effortRoot)) {
    const rel = norm(relative(effortRoot, file));
    if (!/\.(rs|ts|tsx|js|jsx|py|go|java|kt|swift|c|cc|cpp|h|hpp)$/.test(rel)) continue;
    let text; try { text = readFileSync(file, 'utf8'); } catch { continue; }
    const isTest = matchesAny(rel, cfg.testGlobs);
    text.split(/\r?\n/).forEach((line, i) => {
      if (isTest && parkRe.test(line)) parked.push({ file: rel, line: i + 1, text: line.trim() });
      if (stubMarkers.some((m) => line.includes(m))) stubs.push({ file: rel, line: i + 1, text: line.trim() });
    });
  }
  return { parked, stubs };
}

// CLI
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('burndown.mjs')) {
  const asJson = process.argv.includes('--json');
  const effortRoot = rootFromArgv(process.argv, process.cwd());
  if (!effortRoot) { console.error('No effort (.reasonable/) found (pass --root <effortRoot> or run from inside the effort).'); process.exit(1); }
  const { parked, stubs } = computeBurndown(effortRoot);
  if (asJson) {
    console.log(JSON.stringify({ parkedCount: parked.length, loudStubCount: stubs.length, parked, stubs }, null, 2));
  } else {
    console.log(`Parked tests (vision burndown): ${parked.length}`);
    for (const p of parked) console.log(`  ${p.file}:${p.line}  ${p.text}`);
    console.log(`\nLoud stubs (off-path burndown): ${stubs.length}`);
    for (const s of stubs) console.log(`  ${s.file}:${s.line}  ${s.text}`);
    console.log('\nInvariant: everything unparked is green; any red is a regression. ' +
      'A scenario gate cannot pass while a loud stub remains on its path.');
  }
}
