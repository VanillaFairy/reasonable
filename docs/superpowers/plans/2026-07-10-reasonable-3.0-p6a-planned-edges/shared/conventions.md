# Conventions — P6a: The Planned-Edge Fold

These are this repo's existing conventions (confirmed by reading `lib/graph.mjs`, `lib/atom.mjs`,
`lib/clause-id.mjs`, `test/graph-projections.test.mjs`, P5's `shared/conventions.md`, and
`CLAUDE.md`) — follow them exactly, do not introduce new ones.

## Module system

- Every file is `.mjs`, native ESM. No `package.json` exists and none should be added — the plugin's
  hard invariant is "runs anywhere Node does, no dependencies, no build step."
- Node builtins only. No third-party imports, ever. `plannedNeedsEdges` is pure and needs only the
  already-shipped `parseClauseId` from `lib/clause-id.mjs`.

## Naming

- Files: kebab-case (`test/graph-planned-edges.test.mjs`).
- Functions: camelCase (`plannedNeedsEdges`).
- Edge kinds (`'needs'`) and ops (`'add'`) are emitted as **string literals**, exactly as the shipped
  `needsEdges` emits them — do NOT import `lib/effects.mjs`'s `EDGE_NAMES`/`EDGE_OPS` into the
  library; `lib/effects.mjs` is the TESTS' validator only.

## Purity and error handling

- **`plannedNeedsEdges` is pure** — takes only the in-memory `charters` array, returns a plain array,
  reads no disk, calls no `append()`. It belongs in `graph.mjs`'s pure section (above the I/O marker).
- Treat absent optional fields as empty (`c.premises || []`) and a non-integer `order` as `0` — do
  not defensively validate the shape of a well-formed record. The function assumes it receives
  `foldAtoms`-shaped records, the same assumption `needsEdges` makes about `atom.deltaClauses`.
- Never throw for thin input: `plannedNeedsEdges([])` returns `[]`; a single charter returns `[]`;
  `parseClauseId` returning `null` is skipped, not an error.

## Edge construction

- Every emitted edge is exactly `{ from, to, edge: 'needs', op: 'add' }` — the same object shape
  `needsEdges` produces, so `liftEdges` and (later) the legibility law consume planned and actual
  edges uniformly. The tests assert this shape with `lib/effects.mjs`'s `validateEffects`.
- **Deduplicate** by `from`+`to` and **drop self-edges** (`from === to`), exactly as `needsEdges`
  does with its own `seen` Set.
- **No `undefined` properties.** Node's `assert.deepStrictEqual` treats `{a:1, b:undefined}` as not
  equal to `{a:1}`; emit only the four fixed keys.

## Testing — the exact harness convention (no test framework exists)

Every `test/*.test.mjs` file is a **standalone Node script**, run directly (`node
test/graph-planned-edges.test.mjs`), never through a runner (there isn't one). Copy this pattern
verbatim from `test/atom-cohesion.test.mjs` / `test/graph-projections.test.mjs`:

```js
import assert from 'node:assert';
import { plannedNeedsEdges } from '../lib/graph.mjs';
import { validateEffects } from '../lib/effects.mjs';

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.stack || e.message}`); process.exitCode = 1; }
}

check('a specific, named invariant', () => {
  assert.deepStrictEqual(actual, expected);
});

// ... more check() calls, one per invariant ...

if (process.exitCode) console.error(`\ngraph-planned-edges: FAILURES above (${passed} passed).`);
else console.log(`\ngraph-planned-edges: all ${passed} checks pass. ✓`);
```

Rules:
- No `describe`/`it`, no assertion library beyond `node:assert`, no mocking library.
- **All `charters` fixtures are built BY HAND** (plain object literals) — `plannedNeedsEdges` is pure,
  so **no filesystem is ever needed**. Do not `mkdtemp`, do not write a `.reasonable/`, do not call
  `charterAtom`/`foldAtoms`. A charter fixture is just `{ id, component, premises, order }`.
- **Sort edge arrays before comparing** when order is not contractually fixed (the existing graph
  tests compare with `[e.from, e.to].sort().join()` / `.some(...)`; there is no shared `sortEdges`
  helper to import). Define one locally at the top of the test file and use it on both sides of a
  `deepStrictEqual`:
  ```js
  const sortEdges = (es) => es.slice().sort((a, b) => `${a.from} ${a.to}`.localeCompare(`${b.from} ${b.to}`));
  ```
- Assert every result also passes `validateEffects(edges).ok === true` — shape-validity is pinned
  alongside content.
- Run one file: `node test/graph-planned-edges.test.mjs`. Run everything — see
  `../knowledge/running-tests.md`.

## Docs

- `docs/glossary.md` entries are one bullet each: `- **Term** — definition.`, cross-referencing other
  bold terms. T02 adds **planned edge / planned fidelity** only — not P6b–P6e's vocabulary.
- `docs/artifacts.md` has an existing note that planned-fidelity edges are "Part 6, not built yet"
  (in the graph/`## Topology` region). T02 updates that note to record P6a built the planned `needs`
  fold; it does **not** invent artifact grammar (P6a adds no artifact).

## Git / commits, and versioning

- Every task stages **only its own listed files**. `git add -A` / `git add .` is forbidden.
- Commit messages follow this repo's style: `type(scope): summary`
  (`test(graph):`, `feat(graph):`, `docs(glossary):`).
- **This plan does NOT bump the version.** Per the roadmap's 2026-07-09 versioning decision, P5–P8
  land on the shared refactoring line at `3.2.0` and bump once at the end of the generation. There is
  **no `version-bump-final-check` task** and **no `chore(release)` commit**. Do not touch
  `.claude-plugin/plugin.json` or the README. T03's only roadmap edit is moving the **P6a** status
  cell to `Landed — merged (no bump, 3.2.0)` — and only when the code + tests have merged.
