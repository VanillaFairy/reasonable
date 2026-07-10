# Conventions — P6e: The Topologist + `topology.html`

These are this repo's existing conventions (confirmed by reading `agents/route-planner.md`,
`agents/blind-test-writer.md`, `agents/census.md`, `lib/graph.mjs`, `lib/legibility.mjs`,
`lib/progress-map.mjs`, `test/legibility.test.mjs`, `test/graph-planned-edges.test.mjs`,
P6a's/P6b's/P6c's/P6d's `shared/conventions.md`, and `CLAUDE.md`) — follow them exactly, do not introduce
new ones.

## Two deliverables of different kinds

- **`agents/topologist.md`** is a **role constitution**: plain markdown, a YAML frontmatter tool
  allowlist, then a normative body. No code, no test, no `lib/` consumer. Author it (T01) and audit it
  (T02); it is never red/green (no runtime surface, and this repo has **no agent-`.md` linter** — see
  plan Flag 6).
- **`lib/topology-view.mjs`** is a **pure `lib/` calculus**: `.mjs`, native ESM, node builtins only. It
  follows every rule below.

## Module system (`lib/topology-view.mjs`)

- Every file is `.mjs`, native ESM. No `package.json` exists and none should be added — the plugin's hard
  invariant is "runs anywhere Node does, no dependencies, no build step."
- **Node builtins only. No third-party imports, ever.** `lib/topology-view.mjs` imports **only**
  `{ liftEdges } from './graph.mjs'` (the component-view quotient) — exactly the single-import discipline
  `lib/legibility.mjs` holds. It does **not** import `legibility.mjs` (findings arrive as an argument),
  `policy.mjs`/`goals.mjs`/`clause-id.mjs`/`ledger.mjs`, `rewrite.mjs`, or `node:fs`. The file is
  runtime-pure end to end: it returns a string, it never writes a file (P7 wires the writer).

## Naming

- Files: kebab-case — `lib/topology-view.mjs`, `test/topology-layout.test.mjs`,
  `test/topology-view.test.mjs`, `agents/topologist.md`.
- Functions: camelCase — `layoutTopology`, `renderTopologyHtml`.
- The view discriminant (`'component' | 'cone' | 'diff'`) and the diff tags
  (`'added' | 'retired' | 'rewired' | 'unchanged'`) are emitted as **string literals**, exactly as
  `graph.mjs`/`legibility.mjs` emit their edge kinds and finding kinds. Do NOT import a constant module
  for them. Diff tags surface in the HTML as a stable **`data-diff="<tag>"`** attribute (the test handle).

## Purity and error handling (`lib/topology-view.mjs`)

- **Both exports are pure** — they take in-memory arguments and return a plain value (a layout object; an
  HTML string). No disk, no `append`, no I/O. The file carries a single append-marker between its two
  halves (`layoutTopology` above, `renderTopologyHtml` below) — see "One file, two triads" — but both
  halves are pure.
- **Never throw on thin/degenerate input** — the same shape-not-value discipline
  `lib/legibility.mjs`/`lib/graph.mjs` hold. `layoutTopology({ nodes: [], edges: [] })` → an empty layout;
  `layoutTopology(undefined)` → an empty layout; `renderTopologyHtml(undefined)` → a minimal valid empty
  document; an unknown `view` → the `component` fallback; a `goalId` naming no cone → an empty diagram. A
  dangling edge (naming a node absent from `nodes`) is **ignored**, never fabricates a node.
- **Cycle-safety, never a cycle verdict.** `layoutTopology` must not infinite-loop on a stray back-edge —
  ignore a back-edge into an on-stack node during ranking, exactly as `lib/legibility.mjs`'s
  `chainFindings` does. Degrade gracefully; do not throw; do not judge the cycle (that is R6's job).
- **Self-containment is a hard invariant, not a preference.** The HTML string carries **no** external
  reference (`http`/`https`/`<script src`/`<link `/`@import`/protocol-relative `//`/`cdn`). Inline every
  byte of CSS, JS, and geometry. §5.3: "no CDN, no npm."

## Determinism

- `layoutTopology` is deterministic — a **stable** sort by the barycenter key, a fixed sweep count, no
  `Math.random`, no `Date`. Same input ⇒ byte-identical layout ⇒ byte-identical HTML. The graph tests
  `sortEdges` before comparing; the layout/render tests likewise compare against a **stable** derived
  quantity (rank map, crossing count, the set of `data-diff` tags), never wall-clock or iteration order.

## Testing — the exact harness convention (no test framework exists)

Both test files are **standalone Node scripts**, run directly (`node test/topology-layout.test.mjs`),
never through a runner (there isn't one). **Both are PURE — no filesystem is ever needed** (like
P6a's/P6b's/P6c's pure folds, unlike P6d's loaders). Copy this pattern verbatim from
`test/legibility.test.mjs` / `test/graph-planned-edges.test.mjs`:

```js
import assert from 'node:assert';
import { layoutTopology /* or renderTopologyHtml */ } from '../lib/topology-view.mjs';

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.stack || e.message}`); process.exitCode = 1; }
}

// ... check() calls ...

if (process.exitCode) console.error(`\ntopology-…: FAILURES above (${passed} passed).`);
else console.log(`\ntopology-…: all ${passed} checks pass. ✓`);
```

Rules:

- No `describe`/`it`, no assertion library beyond `node:assert`, no mocking library, no DOM library. The
  render tests treat the output as a **plain string** — assert on `.includes(...)`, a `RegExp`, and
  attribute counts; do **not** pull in a DOM/HTML parser (that would be a dependency; Law 1).
- **All fixtures are built BY HAND** (plain object literals) — the layout's `{ nodes, edges }`, and the
  render's `{ containment, atoms, edges }` graphs. Both exports are pure, so **no filesystem** is ever
  needed. Do not `mkdtemp`, do not write a `.reasonable/`, do not import `lib/graph.mjs`'s I/O folds
  (`foldAsLived`/`deriveCurrent`) — build the small `{ containment, atoms, edges }` graph directly, the
  same way `test/legibility.test.mjs` hand-builds its `{ containment, atoms, edges }` fixtures. (You MAY
  hand-build a containment tree in the graph.mjs shape — `{ id:'', kind:'root', children:[{ id:'lexer',
  kind:'group', children:[{ id:'a-1', kind:'atom', children:[] }] }, …] }` — since `renderTopologyHtml`'s
  component projection reads it via `liftEdges`.)
- **Assert PROPERTIES and INTENT, not over-fitted goldens.** For the layout, pin the *rank-consistency
  property* (`rank(v) ≥ rank(u)+1` for every edge), *determinism* (two calls deep-equal), *no node loss*,
  and *crossing reduction* (crossings-after ≤ crossings-before; strictly fewer on the crossing-fixture) —
  **not** a golden coordinate per node. For the render, pin *self-containment*, *view routing*, *diff
  tagging*, and *cone selection* — **not** a golden SVG string. Where `shared/interfaces.md` flags a
  mechanism as contestable (the barycenter parameters, the edge-direction convention, the option set),
  assert the *property*, never the incidental number. Escalate to the supervisor rather than pinning a
  value the interfaces flag as open.
- **The self-containment check is mandatory** in the render test (the one load-bearing §5.3/Law 1
  invariant): the returned string matches **none** of `/https?:\/\//`, `/<script[^>]*\bsrc=/i`,
  `/<link\b/i`, `/@import/i`, `/["'(]\/\//` (protocol-relative), `/cdn/i`.
- **The crossing-reduction fixture is mandatory** in the layout test (the one genuinely-new algorithm
  property): a two-rank "X" (`A,B` on rank 0; `C,D` on rank 1; edges `A→D`, `B→C`) where the input order
  crosses and a swap resolves it — assert the barycentered order has **strictly fewer** crossings than the
  input order.
- Run one file: `node test/topology-layout.test.mjs`. Run everything — see `../knowledge/running-tests.md`.

## One file, two triads (the append-marker)

`lib/topology-view.mjs` is **one file** (Cross-cutting Decision 1 — the `topology.html` generator is one
responsibility) but is built by **two triads**: T03 (the layout) creates it and leaves the marker

```
// ── B2. renderTopologyHtml appended by T04b — do not edit above this line ──
```

as the file's last line (below `layoutTopology` and its `import { liftEdges }`); T04 (the renderer)
**appends its section below the marker and edits nothing above it** — the exact append-don't-edit
discipline `lib/rewrite.mjs`/`lib/ceremony.mjs` used to grow across their triads and `lib/graph.mjs` used
for P6a. The renderer *calls* `layoutTopology` (a composition, not a shared sub-helper), so nothing else
crosses the marker.

## The constitution (`agents/topologist.md`) — authoring discipline

- **Mirror `route-planner.md`'s structure**: frontmatter (name/description/model/tools) → an opening
  mandate → "Read first" → the outputs → priority/scope forks (cite the oracle) → hard boundaries
  (capability-enforced) → a forbidden-moves table → "Your output". Keep the prose in the relaxed,
  human-readable normative register the other constitutions use.
- **The allowlist is `tools: Read, Grep, Glob` — verbatim `route-planner`'s.** This is the load-bearing
  line; do not add `Write`/`Edit`/`Bash`. Preserving this allowlist is preserving an adversarial
  separation (CLAUDE.md).
- **Only glossary terms carry normative force** (Invariant 6). Use the normative vocabulary
  (**charter**, **premise**, **topology**, **cone**, **legibility law**, **complexity classification**,
  **intention**, **ratification**); do not let the constitution key off informal words.
- The constitution names §-references to `docs/DESIGN-3.0.md` (§5.1, §5.4, §13, §2.2, §3) — keep them
  stable (Invariant 4: DESIGN section numbers are cited from the corpus).

## Docs

- `docs/glossary.md` entries are one bullet each: `- **Term** — definition.`, cross-referencing other
  bold terms. T05 adds **Topologist** only — every other P6 term (**goals.json**, **policy.json**,
  **Ceremony-sizing dial**, **Complexity band**, **Complexity classifier**, **Phase degeneration**,
  **Cone**, **Stratum**, **Planned fidelity**, **Legibility law**) already landed with P6a–P6d, so
  cross-link them, do not re-define. Cross-link **Route** / **route-planner** (the lineage), **Charter**,
  **Cone**, **Legibility law**, **Complexity classifier**.
- `docs/artifacts.md`: T05 registers **`topology.html`** as a **derived, non-`*` view** (like the
  `progress.{json,md}` lines — **not** a `*` machine-parsed artifact, since it is regenerated and never
  parsed back), generated by `lib/topology-view.mjs`; and notes on the `goals.json`/`policy.json` entries
  that **the topologist proposes them and cannot write them** (agent-unwritable; a narrow writer persists
  after ratification — the write path is P7's). It does **not** invent a machine-parsed grammar for
  `topology.html` (there is none — it is disposable output).

## Git / commits, and versioning

- Every task stages **only its own listed files**. `git add -A` / `git add .` is forbidden.
- Commit messages follow this repo's style: `type(scope): summary`
  (`feat(topologist):`, `test(topology-view):`, `feat(topology-view):`, `docs(glossary,artifacts):`,
  `docs(roadmap):`).
- **This plan does NOT bump the version.** Per the roadmap's 2026-07-09 versioning decision, P5–P8
  (P6a–P6e included) land on the shared refactoring line at `3.2.0` and bump **once at the end of the
  whole generation** (after P7/P8) — **not** after P6e. P6e is P6's tail, not the generation's tail.
  There is **no `version-bump-final-check` task** and **no `chore(release)` commit.** Do not touch
  `.claude-plugin/plugin.json` or the README. T06's roadmap edits (P6e cell → `Landed — merged (no bump,
  3.2.0)`, and the top-level P6 roll-up to "all landed") are **status-cell fact updates, not a bump.**
