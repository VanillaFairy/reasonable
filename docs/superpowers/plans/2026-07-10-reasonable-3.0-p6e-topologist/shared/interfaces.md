# Shared Interfaces — P6e: The Topologist + `topology.html`

**Version:** 1.0

P6e adds **two** files of different kinds. This document pins the **contract and semantics** of both;
the **literal implementation** lives only in the `author`/`green` tasks — the `red`/`audit` roles work
from the semantics here and write their own intent-faithful cases, never from the finished code.

Grounded in the shipped `agents/route-planner.md` / `agents/blind-test-writer.md` / `agents/census.md`
(the allowlist-as-enforcement precedent), `lib/graph.mjs` (`foldAsLived`/`deriveCurrent` return
`{ containment, atoms, edges }`; `liftEdges`, `servesEdges`, `plannedNeedsEdges`), and
`lib/legibility.mjs` (`legibilityFindings`'s finding shape + the `liftEdges`-only import discipline) —
**read them; do not assume.**

---

## A. `agents/topologist.md` — the role constitution (Decision 7, §5.1)

A **role constitution** (markdown-with-normative-force), **not code**. Its enforcement mechanism is the
**tool allowlist in the YAML frontmatter**, not its prose (the repo invariant: "the context manifest is
enforced by the tool allowlist, not by prose … weakening one silently breaks an adversarial separation").

### Frontmatter (the load-bearing part)

```yaml
---
name: topologist
description: <one paragraph — see T01; must say it PROPOSES goals.json/policy.json and cannot write them>
model: opus
tools: Read, Grep, Glob
---
```

- **`tools: Read, Grep, Glob`** — **exactly** `route-planner`'s shipped allowlist (verified by reading
  `agents/route-planner.md`): no `Write`, no `Edit`, **no `Bash`**. This is what makes "the topologist
  **proposes** `goals.json`/`policy.json`, it cannot **write** them" true **by capability, not by
  promise** — it has no tool that writes any file. (See plan Flag 1 for the one contestable residue: a
  reviewer could add scoped Bash for self-charter-append, mirroring `census`; not taken for P6e because
  the write/dispatch wiring is P7's.)
- `model: opus` — the topologist is the calculus's judgment organ; `route-planner`/`retro-synthesizer`
  are `opus` for the same reason (judgment-heavy planning). (`blind-test-writer`/`census` are `sonnet`
  because they transcribe/observe; the topologist reasons about topology, so `opus`.)
- `name` / `description` — `description` is the harness's routing surface; it MUST state the
  read-only-plus-propose constraint (so the constraint is legible at dispatch), and it MUST match the
  body (no capability named in prose that the allowlist denies).

### The body — the five §5.1 outputs it PROPOSES (structure only)

The constitution's normative content, mirroring `route-planner`'s structure (mandate → read-first →
outputs → forks → hard boundaries → forbidden moves → output). The five outputs (DESIGN-3.0 §5.1), each
**proposed as a structured return**, never persisted by the topologist:

1. **Component topology** — derived **subtractively from the vision** (structure is cheap to predict).
2. **The full initial chartering** — every atom's **charter** (component, premises, one-line purpose,
   coarse locus, intra-component `order` §2.2) — **never a delta, never a behavioral must** (§13, the 2.x
   law untouched). The orchestrator persists each charter through the sanctioned ledger path (the
   controller's `atom-chartered` event) — the topologist has no Bash, exactly as `route-planner` proposes
   the cut and the orchestrator records the route.
3. **The containment tree + the component→subeffort ownership map**.
4. **The priority-policy PROPOSAL** — `policy.json`'s content (weights, legibility thresholds, cadence,
   dials), proposed for human ratification (§3). **Vision-class, human-gated in both modes,
   agent-unwritable** — the topologist is on the enforcement-paths list and proposes it; a narrow writer
   persists it after the P7 gate.
5. **The complexity classification** — the t0-observable sizing (§5.4) per effort/subeffort; it predicts
   *how much ceremony*, never *what behavior*. It rides `lib/ceremony.mjs`'s `classify` (P6c) — the
   topologist supplies the t0 inputs; it does not re-implement the classifier.

### Post-genesis (Decision 7)

After genesis the topologist remains the calculus's judgment organ: it supplies **rewrite payloads** on
demand (split partitions, extraction concepts, spike questions, regroupings) and proposes **re-chartering
batches** at gates. Both ride the mechanical `retopologize` (re-derive edges, flag dead-premise atoms for
retirement, re-validate minimality + legibility). **Legibility is not the topologist's to compute** —
`lib/legibility.mjs` measures the shape and emits findings (P6b); the topologist *consumes* those findings
to propose a re-cut. It cites `.reasonable/intention.md` (the oracle) on every priority/scope fork, the
same D5b discipline as `route-planner`.

### What the constitution must NOT do (capability-enforced)

- **Never persist an enforcement-path artifact.** No `goals.json`/`policy.json` write, no direct
  `.reasonable/` write — it has no Write/Edit/Bash. It **proposes**; the human ratifies; a narrow writer /
  the orchestrator persists (the P7 gate).
- **Charters carry no behavior.** Structure only (§13) — component/premises/purpose/locus/order. A
  behavioral must in a charter is the prediction disease the whole methodology defers away from.
- **Never touch the vision.** The goal predicate never changes silently; the topologist re-topologizes
  the frontier, it does not re-write the north star.

---

## B. `lib/topology-view.mjs` — the pure `topology.html` generator (Decision 8, §5.3)

Two named exports (a **pure** calculus in two halves that share no sub-helper — see the plan's structural
call), the second composing the first:

```js
// B1. the pure layered-DAG layout (the genuinely-new algorithm)
export function layoutTopology(subgraph, opts = {});
//   subgraph : { nodes: [{ id, ...passthrough }], edges: [{ from, to, ...passthrough }] }  (a DAG)
//   opts     : { xGap?, yGap?, passes? } — cosmetic, all defaulted (plan Flag 4)
//   → { nodes: [{ ...input, rank, order, x, y }], edges: [ ...input ], ranks, width, height }

// B2. the self-contained HTML generator
export function renderTopologyHtml(graph, { view = 'component', goalId, lastRatified, legibility } = {});
//   graph        : { containment, atoms, edges }  — a lib/graph.mjs foldAsLived/deriveCurrent result
//   view         : 'component' | 'cone' | 'diff'
//   goalId       : required for view:'cone' — which goal's cone to draw
//   lastRatified : required for view:'diff' — a second graph, the color-code reference
//   legibility   : optional — a legibilityFindings(graph, policy)-shaped array; annotates matching nodes
//   → a single self-contained HTML string (inline SVG + inline <style> + inline vanilla <script>)
```

Both are **pure**: in-memory arguments in, plain value out. `lib/topology-view.mjs` imports **only**
`{ liftEdges } from './graph.mjs'` (for the component-view quotient) — exactly the single-import
discipline `lib/legibility.mjs` holds. **Not** `legibility.mjs` (findings arrive as `opts.legibility`),
**not** `policy.mjs`/`goals.mjs`/`ledger.mjs`/`clause-id.mjs`, **not** `node:fs`. No `append`, no disk,
no I/O. **P6e computes/renders a string; the caller writes the file, P7 wires the live producer** (Call
#1).

### B1. `layoutTopology(subgraph, opts) → layout`

A pure layered-DAG layout over a normalized `{ nodes, edges }` (any acyclic directed edge set; the view
projection in B2 decides *which* nodes/edges). Two well-known, dependency-free graph-drawing steps:

**1. Longest-path ranking (exact, pinned by equality).** `rank(n)` = the longest path length (in edges)
from any **source** (a node with no incoming edge) to `n`. Equivalently: `rank(n) = 0` for a source;
otherwise `rank(n) = 1 + max(rank(u))` over every edge `u → n`. **Property:** for every edge `u → v`,
`rank(v) ≥ rank(u) + 1` — every edge crosses at least one rank boundary in the `from → to` direction
(edge-direction convention, plan Flag 4). Computed by a memoized DFS/topo pass.

**2. Barycenter cross-reduction (heuristic, pinned by *properties* — plan Flag 4).** Within each rank,
order the nodes to reduce edge crossings: iteratively set each node's key to the **average order of its
neighbors in the adjacent rank**, re-sort each rank by that key, sweeping **down then up** for a few
passes (`opts.passes`, default e.g. 4). Pinned properties, never a golden order:
- **deterministic** — same `subgraph` in ⇒ identical `order`/`x`/`y` out (stable sort, fixed sweep);
- **total & injective per rank** — every input node appears exactly once; no node dropped or duplicated;
  within a rank, `order` values are `0..k-1` distinct;
- **crossing-monotone** — on a designed fixture, the crossing count after the barycenter passes is **≤**
  the crossing count of the initial (input-order) placement, and **strictly fewer** on the dedicated
  crossing-fixture (an "X" of two edges a swap resolves).

**3. Coordinates (grid).** `x = order * (opts.xGap ?? …)`, `y = rank * (opts.yGap ?? …)` (or transposed —
cosmetic, plan Flag 4). **Property:** nodes at the same rank have distinct `x`; `y` strictly increases
with `rank`. `width`/`height` are the bounding box.

**Cycle-safety (plan Flag 5).** The input *should* be a DAG (legibility + R6 catch cycles), but
`layoutTopology` must **never infinite-loop** on a stray back-edge — it ignores a back-edge into an
on-stack node during ranking, exactly as `lib/legibility.mjs`'s `chainFindings` does. It **degrades
gracefully; it does not throw and does not judge** a cycle (a cycle *verdict* is R6's job, not the
renderer's).

**Degenerate input (shape-not-value; never throws).** Empty `nodes` → `{ nodes: [], edges: [], ranks: 0,
width: 0, height: 0 }`. A `subgraph` of `undefined`/missing keys is treated as empty. An edge naming a
node absent from `nodes` is ignored (a dangling edge never fabricates a node) — the same defensive posture
as the shipped folds.

### B2. `renderTopologyHtml(graph, opts) → HTML string`

Projects `graph` into a `{ nodes, edges }` per `view`, lays it out via `layoutTopology`, and emits a
single **self-contained** HTML string. The three views (§5.3):

- **`view: 'component'`** (default) — the **component topology**. Nodes = the component groups
  (`graph.containment.children`, i.e. `containmentTree`'s top-level groups, keyed by `component`); edges =
  the **component quotient** of the dependency edges, `liftEdges(graph.containment, graph.edges, '')`
  (lift atom edges to the root's direct children — the reuse `legibility.mjs` already leans on). Each node
  is labeled by component; each lifted edge carries its `edge` kind.
- **`view: 'cone'` + `goalId`** — the **per-goal cone**. Nodes = the atoms that **serve** `goalId` (the
  `from` of every `serves` edge whose `to === goalId`, from `graph.edges`) plus the goal node itself;
  edges = the `needs` edges among those atoms. If `goalId` is absent or names no cone, render an empty (or
  "no such cone") diagram — never throw (plan Flag 2).
- **`view: 'diff'` + `lastRatified`** — the **diff view**: the same projection as `component` (the coarse
  ratification surface), with every node and edge tagged by comparison against `lastRatified` (projected
  the same way). Tags: **`added`** (id in `graph` only), **`retired`** (id in `lastRatified` only),
  **`rewired`** (an edge whose endpoints persist but whose `edge` kind changed, or an edge added/removed
  between surviving nodes), **`unchanged`** otherwise. Emitted as a stable **`data-diff="<tag>"`**
  attribute on each node/edge element (the test-observable handle) **and** a color class — so the test
  targets the semantic tag, not a CSS color value. "The human reviews deltas, never re-reviews the world."

**Self-containment (the load-bearing invariant, §5.3 + Law 1).** The returned string is **entirely
inline**: an inline `<style>`, an inline `<svg>` (one `<g data-node-id="…">` per node = rect + text; one
`<path>`/`<line>` per edge), and an inline vanilla `<script>` for local interactivity (e.g. hover
highlight). It contains **no** `http://` / `https://` / `<script src` / `<link ` / `@import` /
protocol-relative `//` URL / any `cdn` reference — **no CDN, no npm**. This is pinned mechanically by the
render red (grep the output string) and attacked by the render audit.

**Optional `legibility` annotation (plan Flag 2).** When `opts.legibility` is a findings array
(`legibilityFindings`-shaped: `{ kind, nodeId?|component?|cones?|chain?, metric, threshold }`), annotate
each matching node with a `data-finding="<kind>"` attribute (e.g. an `over-wide` group, a `god-component`).
Absent ⇒ no annotation. Never imports `legibility.mjs` — the caller passes the findings.

**Degenerate input (never throws).** An empty/absent `graph` → a minimal valid empty document (a
well-formed `<svg>` with no nodes), never an exception. An unknown `view` → falls back to `component`
(the safe default), or renders an empty document — never throws.

---

## Imports P6e adds

- **`agents/topologist.md`** — none (markdown). Its allowlist is `Read, Grep, Glob`.
- **`lib/topology-view.mjs`** — **only** `import { liftEdges } from './graph.mjs';` (the component-view
  quotient), exactly the single-import discipline `lib/legibility.mjs` holds. Nothing else — no
  `legibility.mjs`, no `policy.mjs`/`goals.mjs`, no `clause-id.mjs`, no `node:fs`, no `rewrite.mjs`. The
  file is runtime-pure end to end (it returns a string; the caller writes it — P7).
