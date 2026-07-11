# Task T02a: `ready` + `pack` + `footprintsDisjoint` tests (red)

**Role:** `red` — you write ONLY the two failing test files below. Do NOT implement anything in
`lib/frontier.mjs` or `lib/footprint.mjs`.

> **Grounding note — read before writing anything.** `lib/footprint.mjs` today has **no CLI guard**
> (unlike `lib/ledger.mjs`'s `if (basename(process.argv[1]||'')==='ledger.mjs') runCli()`): its
> top-level code — including a bare `process.exit(1)` when no `.reasonable/` is discoverable from
> `process.cwd()` — runs **unconditionally at module load**. This repo itself has no `.reasonable/`
> (`CLAUDE.md`), so importing `lib/footprint.mjs` **after T02b adds the export but before it adds the
> guard** would kill the test process. `../shared/interfaces.md` §0 correction 1 requires T02b to wrap
> the CLI body in a guard FIRST. This task locks a regression test for exactly that guard, so a green
> run that regresses it fails loudly instead of silently exiting.

## References
- Read: `../shared/interfaces.md` §0 (correction 1 — the CLI-guard requirement, in full) and
  §1.2/§1.3 (the exact `ready`/`pack`/`footprintsDisjoint` signatures)
- Read: `../shared/conventions.md` (purity tier 1 — `lib/frontier.mjs` is pure, no filesystem in the
  `ready`/`pack` tests), `../shared/architecture.md` (correction 1's rationale)
- Read: `../knowledge/running-tests.md`
- Read: `docs/superpowers/specs/2026-07-11-reasonable-3.0-p7-frontier-design.md` Decision 2 (the pure
  loop calculus) and Decision 10 (reuse over reimplement)
- Read: `lib/footprint.mjs` in full — end to end (the PRIVATE `footprint()`/`independent()`/
  `lociOverlap()`/`prefix()` helpers you are pinning the extracted, exported form of, AND the
  unconditional top-level block lines ~19–30 you are pinning a regression test against)
- Read: `lib/ledger.mjs`'s bottom (`if (basename(process.argv[1] || '') === 'ledger.mjs') { runCli();
  }`) — the guard shape T02b must mirror; this task's regression test asserts the analogous behavior
  exists for `footprint.mjs`
- Read: `lib/graph.mjs`'s `needsEdges`/`deriveCurrent` region (the `Edge` shape `{from,to,edge,op}` and
  `AtomRecord` fields `{id, component, state, ...}` you build fixtures against)
- Read: `test/atom-cohesion.test.mjs` (the by-hand fixture harness style — zero filesystem)

## Dependencies
- Depends on: T01b (imports `lib/frontier.mjs`, which must already export `GATE_RESULT_KINDS`/`gateDue`
  so the module loads — this task's tests import `ready`/`pack`, not those two, but the file must exist)
- Depended on by: T02b (implements against these locked tests), T02c (audits them)

## Scope
**Files:**
- Create: `test/frontier-ready-pack.test.mjs`
- Create: `test/footprint-disjoint.test.mjs`

**BOUNDARY — you MUST NOT modify any files outside this list. In particular, do NOT edit
`lib/frontier.mjs` or `lib/footprint.mjs`.**

## Positive Constraints (DO)
- `test/footprint-disjoint.test.mjs` imports `{ footprintsDisjoint }` from `../lib/footprint.mjs` —
  this named export does not exist yet, so RED here is a **link-time `SyntaxError`** ("does not provide
  an export named 'footprintsDisjoint'"), thrown by Node's ESM loader **before it evaluates the module
  body** (export bindings are resolved statically at link time) — so this RED run does **not** trigger
  `footprint.mjs`'s unguarded top-level code. Do not confuse this with a module-not-found error; the
  file already exists as a CLI script.
- Include a **dedicated guard-regression check** that spawns a **child process** (via
  `node:child_process`'s `execFileSync`) that only imports `lib/footprint.mjs` (no CLI args, cwd = this
  repo root, which has no `.reasonable/`) and asserts it exits **0** and prints nothing resembling "No
  effort" — this is the test that would have caught the unguarded-CLI defect, and is what T02c audits
  for teeth. This check necessarily **also** fails today (before T02b adds the guard) — that is
  correct, it is part of the same RED file. Spawn via a small dynamic-import driver script written to a
  temp file (or a one-line `node --input-type=module -e "import('../lib/footprint.mjs')..."` inline
  string) so a real `process.exit(1)` in the CHILD never kills the test process itself.
- Cover `footprintsDisjoint`: disjoint on all three axes → `true`; locus overlap (ancestor-prefix, exact
  match, and identical unbounded glob) → `false`; shared contract → `false`; shared resource → `false`.
  Mirror `footprint.mjs`'s own `independent()` fixture shapes (`{locus, contracts, resources}`).
- Cover `ready(graph, flags)`: an atom whose state is `'chartered'`/`'ready'`/`"spec'd"` and whose every
  `needs` provider is `'merged'` or absent from `graph.atoms` is ready; a `'packed'`/`'in-flight'`/
  `'merged'`/`'retired'` atom is never ready regardless of edges; an atom with an unmet `needs` provider
  (provider present and NOT `'merged'`) is excluded; `frozen`/`guardHalted`/`barred` each independently
  exclude an otherwise-ready atom; the result is in `graph.atoms` order (deterministic).
- Cover `pack(footprints)`: a maximal disjoint wave via greedy first-fit — three mutually disjoint
  footprints → one wave of three, `deferred: []`; two that collide on locus/contract/resource → the
  first stays in `wave`, the second lands in `deferred`; verify determinism (same input → same
  wave/deferred split across two calls).

## Negative Constraints (DO NOT)
- Do NOT implement `footprintsDisjoint`, the CLI guard, `ready`, or `pack`.
- Do NOT test `GATE_RESULT_KINDS`/`gateDue` (T01, already locked) or `requiredRoles` (T03a).
- Do NOT touch the filesystem beyond the one guard-regression child-process spawn (which touches no
  file — it only imports a module and inspects its exit code/stdout).
- Do NOT run the guard-regression check by importing `footprint.mjs` directly in THIS process — that
  would `process.exit(1)` the whole test run today. It MUST run in a child process.
- Do NOT modify any file outside Scope.

## Implementation Steps

### Step 1: Write `test/footprint-disjoint.test.mjs`

```js
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
```

**Note on the static import above:** placing `import { footprintsDisjoint } from '../lib/footprint.mjs';`
as a top-level static import means the WHOLE FILE fails to load with a link-time `SyntaxError` today
(the export doesn't exist) — including the guard-regression `check()` above it, which therefore never
even registers. This is expected and correct for RED: the file fails to load at all, exactly like
`test/rewrite-router.test.mjs` did against a not-yet-created `lib/rewrite.mjs` in Part 5. Verify this in
Step 3 below.

### Step 2: Write `test/frontier-ready-pack.test.mjs`

```js
// test/frontier-ready-pack.test.mjs — the frontier ready-set and footprint-disjoint wave packing
// (DESIGN-3.0 §6; reasonable 3.0 Part 7, interfaces.md §1.2/§1.3). Pure, zero-I/O — every graph/
// footprint fixture is a hand-built object literal.

import assert from 'node:assert';
import { ready, pack } from '../lib/frontier.mjs';

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.stack || e.message}`); process.exitCode = 1; }
}

function atom(id, state, component = 'lexer') { return { id, component, state }; }
function edge(from, to) { return { from, to, edge: 'needs', op: 'add' }; }

// ── ready ────────────────────────────────────────────────────────────────────

check('a chartered atom with no needs edges is ready', () => {
  const graph = { atoms: [atom('a-1', 'chartered')], edges: [] };
  assert.deepStrictEqual(ready(graph, {}), ['a-1']);
});

check("'ready' and \"spec'd\" states are frontier-eligible too", () => {
  const graph = { atoms: [atom('a-1', 'ready'), atom('a-2', "spec'd")], edges: [] };
  assert.deepStrictEqual(ready(graph, {}), ['a-1', 'a-2']);
});

check('packed / in-flight / merged / retired atoms are NEVER on the frontier', () => {
  const graph = {
    atoms: [atom('a-1', 'packed'), atom('a-2', 'in-flight'), atom('a-3', 'merged'), atom('a-4', 'retired')],
    edges: [],
  };
  assert.deepStrictEqual(ready(graph, {}), []);
});

check('an atom whose needs-provider is merged is ready', () => {
  const graph = { atoms: [atom('a-1', 'ready'), atom('a-2', 'merged')], edges: [edge('a-1', 'a-2')] };
  assert.deepStrictEqual(ready(graph, {}), ['a-1']);
});

check('an atom whose needs-provider is absent from graph.atoms (already landed/external) is ready', () => {
  const graph = { atoms: [atom('a-1', 'ready')], edges: [edge('a-1', 'a-99')] };
  assert.deepStrictEqual(ready(graph, {}), ['a-1']);
});

check('an atom whose needs-provider is present and NOT merged is excluded', () => {
  const graph = { atoms: [atom('a-1', 'ready'), atom('a-2', 'in-flight')], edges: [edge('a-1', 'a-2')] };
  assert.deepStrictEqual(ready(graph, {}), []);
});

check('frozen excludes an otherwise-ready atom', () => {
  const graph = { atoms: [atom('a-1', 'ready')], edges: [] };
  assert.deepStrictEqual(ready(graph, { frozen: ['a-1'] }), []);
});

check('guardHalted excludes an otherwise-ready atom', () => {
  const graph = { atoms: [atom('a-1', 'ready')], edges: [] };
  assert.deepStrictEqual(ready(graph, { guardHalted: ['a-1'] }), []);
});

check('barred excludes an otherwise-ready atom', () => {
  const graph = { atoms: [atom('a-1', 'ready')], edges: [] };
  assert.deepStrictEqual(ready(graph, { barred: ['a-1'] }), []);
});

check('the result is in graph.atoms order, not sorted or reversed', () => {
  const graph = { atoms: [atom('a-3', 'ready'), atom('a-1', 'ready'), atom('a-2', 'ready')], edges: [] };
  assert.deepStrictEqual(ready(graph, {}), ['a-3', 'a-1', 'a-2']);
});

// ── pack ─────────────────────────────────────────────────────────────────────

function fp(id, over = {}) { return { id, locus: [], contracts: [], resources: [], ...over }; }

check('three mutually disjoint footprints all pack into one wave', () => {
  const fps = [
    fp('a-1', { locus: ['src/a/**'] }),
    fp('a-2', { locus: ['src/b/**'] }),
    fp('a-3', { locus: ['src/c/**'] }),
  ];
  const { wave, deferred } = pack(fps);
  assert.deepStrictEqual(wave.sort(), ['a-1', 'a-2', 'a-3']);
  assert.deepStrictEqual(deferred, []);
});

check('a colliding pair: the first stays in the wave, the second defers', () => {
  const fps = [
    fp('a-1', { contracts: ['lexer'] }),
    fp('a-2', { contracts: ['lexer'] }), // collides with a-1
    fp('a-3', { locus: ['src/c/**'] }),
  ];
  const { wave, deferred } = pack(fps);
  assert.deepStrictEqual(wave.sort(), ['a-1', 'a-3']);
  assert.deepStrictEqual(deferred, ['a-2']);
});

check('pack is deterministic across repeated calls on the same input', () => {
  const fps = [fp('a-1', { contracts: ['x'] }), fp('a-2', { contracts: ['x'] })];
  const r1 = pack(fps);
  const r2 = pack(fps);
  assert.deepStrictEqual(r1, r2);
});

if (process.exitCode) console.error(`\nfrontier-ready-pack: FAILURES above (${passed} passed).`);
else console.log(`\nfrontier-ready-pack: all ${passed} checks pass. ✓`);
```

### Step 3: Run both to verify they fail for the right reason

Run: `node test/footprint-disjoint.test.mjs` — expected a link-time `SyntaxError` naming the missing
`footprintsDisjoint` export (`lib/footprint.mjs` exists but does not export it yet); the file's `check()`
calls never even register. **Confirm this run does NOT hang or print "No effort"** — if it does, the
static import somehow evaluated the module body, which would indicate a Node version difference; stop
and escalate rather than silence it.

Run: `node test/frontier-ready-pack.test.mjs` — expected `FAIL` lines (assertion failures — `ready`/
`pack` are `undefined` in the T01-only `lib/frontier.mjs`), not a module-load error.

### Step 4: Commit

```bash
git add test/footprint-disjoint.test.mjs test/frontier-ready-pack.test.mjs
git commit -m "test(frontier): lock ready/pack, the footprintsDisjoint export, and the footprint.mjs CLI-guard regression (red, P7)" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

## Acceptance Criteria
- [ ] Both files exist and match the harness convention exactly
- [ ] `footprint-disjoint.test.mjs` fails on the missing named export (link-time `SyntaxError`, module
      body never evaluated); `frontier-ready-pack.test.mjs` fails on assertions
- [ ] The CLI-guard regression check spawns a **child process** and never risks killing the test runner
- [ ] `footprintsDisjoint`'s three axes (locus/contract/resource), `ready`'s state-eligibility +
      needs-satisfaction + flag-exclusion + ordering, and `pack`'s greedy-first-fit determinism are all
      covered
- [ ] No filesystem touched beyond the guard-regression child-process spawn; no file outside Scope
      modified; neither `lib/frontier.mjs` nor `lib/footprint.mjs` was edited
