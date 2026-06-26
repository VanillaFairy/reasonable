// workflow-load.test.mjs — every workflows/*.workflow.js must LOAD under the engine's
// function-scope wrap. The Workflow engine runs each script as one function body (that is
// what makes top-level `return`, `args`, `budget`, `phase`, `agent`, … work), so two
// top-level bindings of the same name are a hard `SyntaxError: Identifier '<x>' has
// already been declared` — which `node --check` on the raw .js does NOT catch (the bare
// top-level `return`/`await` shape it checks is not the shape the engine loads).
//
// This caught a real regression: a helper `function lane(a)` collided with the pre-existing
// `const lane = await guard(...)`. Run: node test/workflow-load.test.mjs

import assert from 'node:assert';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, '..', 'workflows');

// The globals the engine injects; declaring them as params makes the wrap faithful.
const GLOBALS = ['args', 'budget', 'phase', 'log', 'agent', 'parallel', 'pipeline', 'workflow'];

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.message}`); process.exitCode = 1; }
}

for (const f of readdirSync(dir).filter((n) => n.endsWith('.workflow.js'))) {
  check(`${f} loads under the engine function-scope wrap`, () => {
    const src = readFileSync(join(dir, f), 'utf8')
      // `export` is illegal inside a function body. Strip both shapes the engine accepts:
      // a top-level body (`export const meta` + bare top-level statements) and an
      // `export default async function run() {...}` wrapper.
      .replace(/^export\s+const\s+meta\b/m, 'const meta')
      .replace(/^export\s+default\s+/m, '');
    // Construct (does NOT execute) the body as one async function — exactly the scope the
    // engine uses. A duplicate top-level binding throws SyntaxError here.
    // eslint-disable-next-line no-new-func
    new Function(...GLOBALS, `return (async () => { ${src}\n });`);
  });
}

if (process.exitCode) console.error(`\nworkflow-load: FAILURES above (${passed} passed).`);
else console.log(`\nworkflow-load: all ${passed} workflow(s) load. ✓`);
