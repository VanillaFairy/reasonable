// sanity.mjs — the lintable subset of the sanity invariants (DESIGN §5.9 Ruling 3,
// §6.5). "Reasonable" must be written down to be adjudicable; the regex-checkable
// taboos (no test-conditioned branching, no sleep-as-synchronization, …) become a
// hook so the adjudicator rules with citations instead of taste. The rest stay in
// the auditor checklist.
//
// Two modes:
//   (default) PreToolUse — reads hook JSON on stdin; blocks an edit whose NEW
//             content introduces a forbidden pattern, but only inside a lane.
//   scan      `node sanity.mjs scan` — walk the tree and report all hits (exit 1
//             if any), for vertical-slice-gate / CI use.
//
// Invariants come from config.json `lintableInvariants: [{id, pattern, message}]`.

import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  readStdinJson, findLane, findEffortRoot, rootFromArgv, loadConfig, matchesAny, norm, relative, deny,
} from './effort.mjs';

const mode = process.argv.includes('scan') ? 'scan' : 'pretooluse';

function compile(invariants) {
  return (invariants || []).map((inv) => ({ ...inv, re: safeRe(inv.pattern) })).filter((i) => i.re);
}
function safeRe(p) { try { return new RegExp(p); } catch { return null; } }

if (mode === 'pretooluse') {
  const input = await readStdinJson();
  const ti = input.tool_input || {};
  const path = ti.file_path || ti.notebook_path;
  if (!path) process.exit(0);

  const lane = findLane(path) || findLane(input.cwd || process.cwd());
  if (!lane) process.exit(0); // not governed

  const cfg = loadConfig(lane.effortRoot || lane.__root);
  const invs = compile(cfg.lintableInvariants);
  if (!invs.length) process.exit(0);

  // Gather the NEW content this edit introduces.
  let content = '';
  if (typeof ti.content === 'string') content += ti.content + '\n';
  if (typeof ti.new_string === 'string') content += ti.new_string + '\n';
  if (Array.isArray(ti.edits)) for (const e of ti.edits) if (typeof e.new_string === 'string') content += e.new_string + '\n';
  if (!content.trim()) process.exit(0);

  for (const inv of invs) {
    inv.re.lastIndex = 0;
    if (inv.re.test(content)) {
      deny(`Sanity invariant "${inv.id}" violated: ${inv.message} (DESIGN §5.9 Ruling 3). ` +
        `This is a standing project taboo. An insane solution is insane relative to stated norms — ` +
        `if the norm is wrong, change it via a human-approved meta work order, not in a lane.`);
    }
  }
  process.exit(0);
}

// scan mode
const effortRoot = rootFromArgv(process.argv, process.cwd());
if (!effortRoot) { console.error('No effort found (pass --root <effortRoot> or run from inside the effort).'); process.exit(2); }
const cfg = loadConfig(effortRoot);
const invs = compile(cfg.lintableInvariants);
if (!invs.length) { console.log('No lintable invariants configured.'); process.exit(0); }

const SKIP = new Set(['.git', 'node_modules', 'target', 'dist', 'build', '.worktrees', '.reasonable', '.next', 'out']);
function* walk(dir) {
  let es; try { es = readdirSync(dir); } catch { return; }
  for (const e of es) { const p = join(dir, e); let st; try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) { if (!SKIP.has(e)) yield* walk(p); } else if (st.isFile()) yield p; }
}

const hits = [];
for (const file of walk(effortRoot)) {
  const rel = norm(relative(effortRoot, file));
  if (matchesAny(rel, cfg.testGlobs)) continue;
  if (!/\.(rs|ts|tsx|js|jsx|py|go|java|kt|swift)$/.test(rel)) continue;
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((line, i) => {
    for (const inv of invs) { inv.re.lastIndex = 0; if (inv.re.test(line)) hits.push({ rel, line: i + 1, id: inv.id, message: inv.message, text: line.trim() }); }
  });
}

if (!hits.length) { console.log('No sanity-invariant violations. ✓'); process.exit(0); }
console.error(`Sanity-invariant violations (${hits.length}):`);
for (const h of hits) console.error(`  ${h.rel}:${h.line}  [${h.id}] ${h.message} — ${h.text}`);
process.exit(1);
