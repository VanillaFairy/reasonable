# Conventions — P6b: The Legibility Law

These are this repo's existing conventions (confirmed by reading `lib/graph.mjs`, `lib/rewrite.mjs`,
`lib/policy.mjs`, `lib/effects.mjs`, `test/graph-containment.test.mjs`, `test/graph-edges.test.mjs`,
`test/rewrite-ceremony.test.mjs`, P6a's + P6d's `shared/conventions.md`, and `CLAUDE.md`) — follow
them exactly, do not introduce new ones.

## Module system

- Every file is `.mjs`, native ESM. No `package.json` exists and none should be added — the plugin's
  hard invariant is "runs anywhere Node does, no dependencies, no build step."
- **Node builtins only.** No third-party imports, ever. `lib/legibility.mjs` imports **only**
  `liftEdges` from `./graph.mjs` (see `shared/interfaces.md` → "Imports"). It does **not** import
  `effects.mjs`, `rewrite.mjs`, `policy.mjs`, `node:fs`, or anything I/O-bearing — the whole file is
  runtime-pure.

## Naming

- Files: kebab-case — `lib/legibility.mjs`, `test/legibility.test.mjs`.
- Functions: camelCase — `legibilityFindings`, `regroupingReducesTangle`.
- Finding `kind` strings and edge kinds (`'needs'`, `'serves'`, …) are emitted as **string literals**,
  exactly as `graph.mjs`/`rewrite.mjs` emit theirs — do NOT import `effects.mjs`'s `EDGE_NAMES`;
  `lib/effects.mjs` is the TESTS' validator only.

## Purity and error handling

- **Both exports are pure** — they take in-memory arguments (`graph`/`policy`, or `proposal`/`tree`/
  `edges`), return a plain value, read no disk, call no `append()`. `lib/legibility.mjs` has no I/O
  section and no marker comment (unlike `graph.mjs`, which has a pure/I/O split) — it is pure end to
  end.
- **A missing/non-finite threshold disables its check** — never throw, never fabricate a default. If
  `policy.legibility.maxWidth` is absent, `legibilityFindings` emits no `over-wide` findings. This is
  the same shape-not-value / never-fabricate discipline `lib/policy.mjs` and `lib/route.mjs` hold.
- **Never throw on thin/degenerate input:** `legibilityFindings({containment: emptyRoot, atoms: [],
  edges: []}, policy)` → `[]`; a `policy` with no `legibility` block → `[]`; `regroupingReducesTangle`
  on a `nodeId` not in the tree → `false` (a non-existent regrouping reduces nothing).
- Treat absent optional fields defensively only where the shipped folds already do (`e.edge`,
  `atom.component`); do not add validation for well-formed records — the function assumes
  `graph.mjs`-shaped input, the same assumption `liftEdges` makes about its tree.

## Finding construction

- Every finding is exactly `{ kind, metric, threshold, <locator> }` per the grammar in
  `shared/interfaces.md` — no `undefined` properties (Node's `assert.deepStrictEqual` treats
  `{a:1, b:undefined}` as unequal to `{a:1}`; emit only the fixed keys for each kind).
- A finding must be **drop-in usable as an R8 `illegible` verdict's `proposal`** — a plain,
  JSON-serializable object (the composition contract; pinned by a red test through
  `computeVerdictEffects`).
- Determinism: sort multi-element locators (`cones`, and the finding array where order is not
  otherwise fixed) so the output is stable, exactly as the graph tests `sortEdges` before comparing.

## Testing — the exact harness convention (no test framework exists)

`test/legibility.test.mjs` is a **standalone Node script**, run directly (`node
test/legibility.test.mjs`), never through a runner (there isn't one). **Like P6a's pure fold and
unlike P6d's loaders, this is PURE — no filesystem is ever needed.** Copy this pattern verbatim from
`test/graph-containment.test.mjs` / `test/rewrite-ceremony.test.mjs`:

```js
import assert from 'node:assert';
import { legibilityFindings, regroupingReducesTangle } from '../lib/legibility.mjs';
import { containmentTree } from '../lib/graph.mjs';        // build fixtures the shipped way
import { computeVerdictEffects } from '../lib/rewrite.mjs'; // for the R8 composition check
import { validateEffects } from '../lib/effects.mjs';       // validator only, never a lib dep

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.stack || e.message}`); process.exitCode = 1; }
}

// ... check() calls, one per invariant ...

if (process.exitCode) console.error(`\nlegibility: FAILURES above (${passed} passed).`);
else console.log(`\nlegibility: all ${passed} checks pass. ✓`);
```

Rules:

- No `describe`/`it`, no assertion library beyond `node:assert`, no mocking library.
- **All fixtures are built BY HAND** (plain object literals, or `containmentTree([...atoms])` for a
  tree) — `legibilityFindings`/`regroupingReducesTangle` are pure, so **no filesystem** is ever
  needed. Do not `mkdtemp`, do not write a `.reasonable/`, do not call `foldAtoms`/`deriveCurrent`. A
  `graph` fixture is `{ containment, atoms, edges }`; edges are `{ from, to, edge, op }` literals;
  the `policy` fixture is a synthetic `{ legibility: { maxWidth, maxTangle, maxChain, maxCoupling,
  maxFanIn } }` literal — **never an import of `lib/policy.mjs`** (Decision 3).
- **Assert INTENT, not over-fitted goldens.** Where the spec pins a formula (density = lifted/pairs),
  assert the computed number; where it leaves a metric contestable (the exact cross-cone density),
  assert the *decision* (finding present / absent) under thresholds you choose to make the case
  unambiguous. Escalate to the supervisor rather than pinning a value `shared/interfaces.md` flags as
  open.
- **The R8 composition check is mandatory** (the one load-bearing boundary): feed a finding as an
  `illegible` verdict's `proposal` and assert `computeVerdictEffects` returns a valid effect for both
  `scope: 'genesis'` and `scope: 'live'`, with `validateEffects(...).ok === true`.
- Run one file: `node test/legibility.test.mjs`. Run everything — see `../knowledge/running-tests.md`.

## Docs

- `docs/glossary.md` entries are one bullet each: `- **Term** — definition.`, cross-referencing other
  bold terms. T02 adds **Legibility law**, **Cone**, **Stratum**, and **Legibility finding** only —
  not P6c/P6e's vocabulary (**complexity band**, **complexity classifier**, **phase degeneration**,
  **topologist** land with the sub-part that introduces them).
- `docs/artifacts.md`: P6b adds **no new artifact** (`legibility.mjs` is a pure calculus, nothing on
  disk). T02 updates the graph-engine section's forward-reference ("the legibility law … is Part 6b")
  to record it is built, and adds the two P6b-coined keys (`maxCoupling`, `maxFanIn`) to the
  `policy.json` `legibility` bullet — it does **not** invent artifact grammar or edit `lib/policy.mjs`.

## Git / commits, and versioning

- Every task stages **only its own listed files**. `git add -A` / `git add .` is forbidden.
- Commit messages follow this repo's style: `type(scope): summary`
  (`test(legibility):`, `feat(legibility):`, `docs(glossary):`, `docs(roadmap):`).
- **This plan does NOT bump the version.** Per the roadmap's 2026-07-09 versioning decision, P5–P8
  (P6a–P6e included) land on the shared refactoring line at `3.2.0` and bump once at the end of the
  generation. There is **no `version-bump-final-check` task** and **no `chore(release)` commit**. Do
  not touch `.claude-plugin/plugin.json` or the README. T03's only roadmap edit is moving the **P6b**
  status cell to `Landed — merged (no bump, 3.2.0)` — and only when the code + tests have merged.
