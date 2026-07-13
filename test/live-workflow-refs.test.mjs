// live-workflow-refs.test.mjs — every `*.workflow.js` FILE named by a LIVE orchestration
// surface (skills/, agents/, docs/architecture.md) must actually EXIST in workflows/.
// Catches the rename-drift class: a workflow is renamed (vertical-slice-runner.workflow.js
// -> frontier-wave.workflow.js) but a launch/reference in a live skill or the authoritative
// architecture doc still names the deleted file.
//
// Deliberately NOT scanned: workflows/ itself (a workflow header may name its deleted
// predecessor as a historical note) and docs/superpowers/** (point-in-time plans and specs,
// CLAUDE.md invariant #7). Only the `<name>.workflow.js` filename form is matched — bare-prose
// mentions of an old name are out of scope here.
// Run: node test/live-workflow-refs.test.mjs

import assert from 'node:assert';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

// Ground truth: workflow files that actually exist right now.
const realWorkflows = new Set(
  readdirSync(join(root, 'workflows')).filter((n) => n.endsWith('.workflow.js')),
);

// Live surfaces that describe the CURRENT system.
const SURFACE_DIRS = ['skills', 'agents'];
const SURFACE_FILES = [join('docs', 'architecture.md')];

function collect(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...collect(p));
    else if (e.name.endsWith('.md') || e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

const files = [
  ...SURFACE_DIRS.flatMap((d) => collect(join(root, d))),
  ...SURFACE_FILES.map((f) => join(root, f)),
];

const REF = /\b([\w-]+\.workflow\.js)\b/g;
const violations = [];
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(REF)) {
    if (!realWorkflows.has(m[1])) {
      violations.push(`${relative(root, f).replace(/\\/g, '/')} references ${m[1]} (no such file in workflows/)`);
    }
  }
}

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.message}`); process.exitCode = 1; }
}

check('every workflow named by a live surface exists in workflows/', () => {
  assert.deepStrictEqual(violations, [], `\n  - ${violations.join('\n  - ')}`);
});

if (process.exitCode) console.error(`\nlive-workflow-refs: FAILURES above (${passed} passed).`);
else console.log(`\nlive-workflow-refs: all referenced workflows exist. ✓`);
