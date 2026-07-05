# Shared conventions

## Tests (standalone Node, no framework)

- There is **no test runner and no `package.json`.** Each test is a self-contained script:
  `node test/<name>.test.mjs`. It sets `process.exitCode = 1` on any failure and prints a summary.
- **No shared test-helper module.** Each test re-declares its own tiny harness inline. Copy the pattern
  from a sibling test; do not create a shared helper.
- Standard harness shape (copy from `test/ledger.test.mjs`, `test/reconcile-downgrade-event.test.mjs`):
  ```js
  import assert from 'node:assert';
  import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
  import { join } from 'node:path';
  import { tmpdir } from 'node:os';
  const tmps = [];
  function newEffort() { const d = mkdtempSync(join(tmpdir(), 'wo-status-')); tmps.push(d);
    mkdirSync(join(d, '.reasonable'), { recursive: true }); return d; }
  let passed = 0;
  function check(name, fn) { try { fn(); passed++; console.log('  ok  ' + name); }
    catch (e) { console.log('FAIL ' + name + ' — ' + e.message); process.exitCode = 1; } }
  // ... checks ...
  for (const t of tmps) rmSync(t, { recursive: true, force: true });
  console.log(`\n${passed} passed`);
  ```
- **Real git** when needed: `git init -q`, set `core.hooksPath` to an empty dir, set `user.email`/
  `user.name`, `commit.gpgsign=false`, seed + commit, `git branch effort/demo`. Copy from
  `reconcile-downgrade-event.test.mjs` lines ~27-53.
- **CLI/hook subprocess tests:** `spawnSync(process.execPath, [LIB, ...args], {encoding:'utf8'})` for lib
  CLIs; `execFileSync('node', [FENCE], {cwd, input: JSON.stringify(payload)})` for the fence, parsing the
  deny JSON. Import modules directly for unit calls.
- Every test file header carries a `// Run: node test/<name>.test.mjs` line.
- **Run the whole suite before reporting DONE:** `for t in test/*.test.mjs; do node "$t"; done` (bash) — no
  test file may regress. If a test asserted an OLD behavior your task deliberately changes, update that
  test and say so explicitly in your report (with the justification tied to the spec).

## Code style in `lib/`

- ESM, node builtins only. Match the surrounding file's idiom (small pure helpers, `export function`,
  early-return guards, fail-open on bad data where the file already does).
- Comments state constraints/reasons the code can't show, and cite DESIGN sections where the file already
  does (`§5.6`, `D3b`). Match existing comment density — don't narrate.
- Functions that parse machine artifacts are **conservative by construction** (over-approximate, never
  silently shrink a set) — this is a correctness property for footprints and trust-staleness.

## Commit discipline

- One focused commit per task, imperative subject, in your worktree. Do NOT bump the plugin version in an
  implementation task — the layer's doc-sync task owns the single version bump.
- Do NOT edit `docs/artifacts.md`, `DESIGN.md`, or `architecture.md` from an implementation task (the
  doc-sync task owns them, to keep one writer on those files). If your change alters a machine grammar,
  note the exact grammar delta in your report so the doc-sync task can transcribe it.

## Scope discipline

- Touch only the files in your task's **Scope** section. If you believe you must touch another, report
  DONE_WITH_CONCERNS or BLOCKED — do not silently widen scope.
- Use the exact signatures from `shared/interfaces.md`. If a signature there is wrong or insufficient,
  STOP and report it — do not invent a divergent one (parallel tasks depend on it).
