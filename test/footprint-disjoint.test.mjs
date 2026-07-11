// test/footprint-disjoint.test.mjs — the extracted, exported footprint-disjointness algebra
// (DESIGN-3.0 §6 "packing happens only on actual footprints"; reasonable 3.0 Part 7,
// interfaces.md §0 correction 1). Mirrors lib/footprint.mjs's PRIVATE independent() EXACTLY — this
// test pins the newly-EXPORTED form so lib/frontier.mjs's pack can import it without re-deriving the
// set-algebra. Also locks the CLI-guard regression: importing lib/footprint.mjs from a cwd with no
// .reasonable/ must NOT process.exit(1) once T02b lands (correction 1 — a real, previously-unfired
// latent defect this plan surfaces and fixes). Pure; the guard check spawns a CHILD process so a real
// exit(1) in that child can never kill this test run.

import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.stack || e.message}`); process.exitCode = 1; }
}

// ── the CLI-guard regression (child process — a real exit(1) here must not kill this run) ──────

check('importing lib/footprint.mjs from a cwd with no .reasonable/ does NOT process.exit(1)', () => {
  // repoRoot itself has no .reasonable/ (CLAUDE.md: this plugin repo is never developed by
  // dogfooding its own methodology) — exactly the condition that trips the unguarded top-level code.
  const out = execFileSync(
    process.execPath,
    ['--input-type=module', '-e', "import('../lib/footprint.mjs').then(()=>console.log('IMPORT_OK'))"],
    { cwd: here, encoding: 'utf8' }, // execFileSync throws on non-zero exit — that IS the failure signal
  );
  assert.ok(/IMPORT_OK/.test(out), `expected the import to complete and print IMPORT_OK, got: ${out}`);
  assert.ok(!/No effort/.test(out), 'the unguarded CLI body must not run its "No effort" branch on import');
});

// The import section above imports named exports lazily via dynamic import() in the check above; the
// STATIC named import below is what makes THIS FILE's own RED failure a link-time SyntaxError (Node
// resolves named-export bindings before evaluating the module body, so this static import fails
// before footprint.mjs's top-level code ever runs — unlike the dynamic import() above, which is
// intentionally deferred so its OWN check controls exactly when evaluation happens).
import { footprintsDisjoint } from '../lib/footprint.mjs';

function fp(id, { locus = [], contracts = [], resources = [] } = {}) {
  return { id, locus, contracts, resources };
}

check('two footprints with no shared locus/contract/resource are disjoint', () => {
  const a = fp('a-1', { locus: ['src/lexer/**'], contracts: ['lexer'] });
  const b = fp('a-2', { locus: ['src/parser/**'], contracts: ['parser'] });
  assert.strictEqual(footprintsDisjoint(a, b), true);
});

check('an ancestor-prefix locus overlap is NOT disjoint', () => {
  const a = fp('a-1', { locus: ['src/lexer/**'] });
  const b = fp('a-2', { locus: ['src/lexer/scanner.mjs'] });
  assert.strictEqual(footprintsDisjoint(a, b), false);
});

check('an identical unbounded glob is NOT disjoint', () => {
  const a = fp('a-1', { locus: ['src/**'] });
  const b = fp('a-2', { locus: ['src/**'] });
  assert.strictEqual(footprintsDisjoint(a, b), false);
});

check('a shared contract is NOT disjoint, even with disjoint loci', () => {
  const a = fp('a-1', { locus: ['src/lexer/**'], contracts: ['shared-util'] });
  const b = fp('a-2', { locus: ['src/parser/**'], contracts: ['shared-util'] });
  assert.strictEqual(footprintsDisjoint(a, b), false);
});

check('a shared resource is NOT disjoint, even with disjoint loci and contracts', () => {
  const a = fp('a-1', { locus: ['src/lexer/**'], resources: ['db:migrations'] });
  const b = fp('a-2', { locus: ['src/parser/**'], resources: ['db:migrations'] });
  assert.strictEqual(footprintsDisjoint(a, b), false);
});

check('symmetry: footprintsDisjoint(a,b) === footprintsDisjoint(b,a)', () => {
  const a = fp('a-1', { locus: ['src/lexer/**'] });
  const b = fp('a-2', { locus: ['src/lexer/scanner.mjs'] });
  assert.strictEqual(footprintsDisjoint(a, b), footprintsDisjoint(b, a));
});

if (process.exitCode) console.error(`\nfootprint-disjoint: FAILURES above (${passed} passed).`);
else console.log(`\nfootprint-disjoint: all ${passed} checks pass. ✓`);
