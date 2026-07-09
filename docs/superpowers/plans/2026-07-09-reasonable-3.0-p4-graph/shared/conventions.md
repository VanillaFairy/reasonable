# Conventions — Part 4: The Graph Engine

These are this repo's existing conventions (confirmed by reading `lib/atom.mjs`, `lib/effects.mjs`,
`lib/contract.mjs`, `lib/footprint.mjs`, `lib/effort.mjs`, `test/atom-cohesion.test.mjs`,
`test/atom-ledger.test.mjs`, `CLAUDE.md`, and Part 3's own `shared/conventions.md`) — follow them
exactly, do not introduce new ones.

## Module system

- Every file is `.mjs`, native ESM (`import`/`export`). No `package.json` exists in this repo and
  none should be added — the plugin's hard invariant is "runs anywhere Node does, no dependencies,
  no build step."
- Node builtins only: `node:assert`, `node:fs`, `node:os`, `node:path`. No third-party imports,
  ever.

## Naming

- Files: kebab-case (`lib/graph.mjs`, `test/graph-containment.test.mjs`).
- Functions: camelCase (`containmentTree`, `needsEdges`, `foldAsLived`).
- The four edge-kind strings (`'needs'`, `'excludes'`, `'serves'`, `'informs'`) match
  `lib/effects.mjs`'s existing `EDGE_NAMES` exactly — do not invent new spellings or casing.
- Edge entries are always the shape `{from, to, edge, op}` — the exact shape
  `lib/effects.mjs`'s `isEdgeEffect` already validates. Every edge-producing function in this part
  emits `op: 'add'` (nothing in this part ever removes an edge — removal is a rewrite-engine
  concern, Part 5).

## Error handling

- Every **pure** function in this part (`containmentTree`, `needsEdges`, `ledgerCitationGraph`,
  `citationClosureOver`, `excludesEdges`, `servesEdges`, `informsEdges`, `liftEdges`) returns a
  plain value (an array, an object) — **never throws**, matching `cohesionComponents`'s and
  `citationGraph()`'s existing "operates on already-shaped data, no result envelope" style. A
  malformed atom record (missing `deltaClauses`, wrong types) is a **programmer error in the
  caller** — these functions assume they receive already-folded atom records (e.g. from
  `foldAtoms`/`foldAtomsFromEvents`), the same assumption `cohesionComponents` already makes about
  its own clause-array input.
- `foldAsLived`/`deriveCurrent`/`graphDivergence` (the **projection** functions) also return a plain
  value, never a `{ok, ...}` envelope and never throw for an effort with no ledger yet — an empty or
  missing ledger file folds to zero atoms, zero edges, exactly like `foldAtoms`'s existing "no
  charters yet → `{}`" behavior. They are **read-only**: nothing in this part calls `append()`.

## Testing — the exact harness convention (no test framework exists)

Every `test/*.test.mjs` file is a **standalone Node script**, run directly (`node
test/foo.test.mjs`), never through a runner (there isn't one). Copy this pattern verbatim from
`test/atom-cohesion.test.mjs` / `test/atom-ledger.test.mjs`:

```js
import assert from 'node:assert';
// ... other imports ...

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.stack || e.message}`); process.exitCode = 1; }
}

check('a specific, named invariant', () => {
  assert.strictEqual(actual, expected);
});

// ... more check() calls, one per invariant, run top to bottom ...

if (process.exitCode) console.error(`\n<subject>: FAILURES above (${passed} passed).`);
else console.log(`\n<subject>: all ${passed} checks pass. ✓`);
```

Rules:
- No `describe`/`it`, no assertion library beyond `node:assert`, no mocking library.
- Each `check()` call is independent — order matters only for readability, not correctness.
- The two pure test files (`graph-containment`, `graph-edges`) build atom-record fixtures **by
  hand** (plain object literals: `{id, component, deltaClauses}`) — no filesystem needed, mirroring
  `test/atom-cohesion.test.mjs`'s pure fixture style exactly.
- The projections test file (`graph-projections`) needs a **real, filesystem-backed effort** — use
  `mkdtempSync(join(tmpdir(), '<prefix>-'))`, push the path to a module-level `tmps` array, and
  clean up with `rmSync(d, {recursive:true, force:true})` in a best-effort `try/catch` at the end of
  the file, copied from `test/atom-ledger.test.mjs`'s `newEffort()` helper. Where a test needs a
  **live contract file** (to exercise `deriveCurrent`'s real-disk citation graph, as opposed to
  `foldAsLived`'s ledger-native one), write it directly with `writeFileSync` under
  `.reasonable/contracts/<component>.md`, following the v3 grammar `lib/contract.mjs` parses
  (`### <component>#c<N> Title`, `- Cites: <id>`, `- Demanded-by: <tag>:<value>` — see
  `docs/artifacts.md`'s `## contracts/<component>.md` section for a worked example).
- Run one file: `node test/graph-containment.test.mjs`. Run everything — see
  `../knowledge/running-tests.md`.

## Docs

- `docs/artifacts.md` entries follow a fixed three-part shape: prose intro → fenced example →
  field-by-field prose. Match it exactly (see T03). This part's docs task **supersedes** (does not
  duplicate) the existing "Scope note" at the end of the "Effects — the optional cross-cutting
  field (3.0)" section, which currently says folding an effect "is future work (DESIGN-3.0's graph
  engine and rewrite engine)" — that future work has now partly arrived; the note must say so
  precisely (the graph engine folds `effects`, the rewrite engine still doesn't produce any).
- `docs/glossary.md` entries are one bullet each: `- **Term** — definition.`, cross-referencing
  other bold terms. Match it exactly (see T03).
- Per DESIGN-3.0 §12, companion doc updates (`glossary.md`, `artifacts.md`) are a **ratification
  precondition** for new normative vocabulary — T03 lands in the wave right after both audits are
  clean, not as an afterthought several tasks later.
- T03 adds glossary entries **only** for terms this part actually implements (**Containment tree**,
  **Dependency graph**, **Needs**, **Excludes**, **Serves**, **Informs**, **Edge lifting**,
  **As-lived graph**, **Current graph**) plus names the two flagged, un-owned gaps (resource claims,
  planned-fidelity edges) explicitly — not the full §12 vocabulary list (`legibility law`, `cone`,
  `stratum`, `wave`, `spec queue`, `starvation quorum`), which belongs to whichever later part
  actually builds that behavior.

## Git / commits

- Every task stages **only its own listed files**. `git add -A` / `git add .` is forbidden.
- Commit messages follow this repo's existing style: `type(scope): summary` (`feat(graph):`,
  `test(graph):`, `docs(artifacts):`, `chore(release):`).
- **This plan bumps the version automatically, minor.** Purely additive — one new file plus a
  strictly backward-compatible export addition to `lib/atom.mjs`, zero behavior change to any
  existing caller of either file — the same shape as Parts 1 and 3's automatic bumps. T04 does not
  stop to ask; see the design doc's "Version bump" section for the reasoning repeated there.

## The one shared-file touch: T02b modifies `lib/atom.mjs`

Every other task's file-conflict rule holds throughout this plan: no two tasks without a dependency
edge touch the same file. **T02b is the one deliberate, narrow exception carried over from this
part's own design** — it makes a small, additive change to the already-shipped `lib/atom.mjs`
(exporting `foldAtomFromEvents`/`foldAtomsFromEvents`, refactoring `loadAtom`/`foldAtoms` to call
them) alongside appending `lib/graph.mjs`'s I/O section, because the two changes are one dependent
unit of work (the projection functions this task also writes are `lib/atom.mjs`'s only caller for
the new exports). **T02b must not modify any other existing export's signature or behavior in
`lib/atom.mjs`** — the audit (T02c) explicitly checks this with a regression run of
`test/atom-lifecycle.test.mjs`, `test/atom-cohesion.test.mjs`, and `test/atom-ledger.test.mjs` (all
three must still pass, unchanged).
