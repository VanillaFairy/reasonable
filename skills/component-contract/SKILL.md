---
name: component-contract
description: Use when writing, enriching, reviewing, or citing a component contract in a reasonable effort — defines the must-list format, topology-subtractive vs behavior-additive derivation, the minimality check, citation discipline, and contract parity. The shared type system the implementer, blind-test-writer, adjudicator, auditor, and route-planner must all cite for adversarial review to be commensurable.
---

# Component Contracts

## Overview

A **contract** is a component's current must-list — its only definition of done. This skill is the
paradigm's **shared type system**: producer, judge, and auditor must cite the same constitution for
adversarial review to be commensurable. If the implementer means one thing by "the contract" and the
auditor means another, the whole verification chain is incoherent.

**Normative vocabulary lives in `docs/glossary.md`. The on-disk grammar lives in `docs/artifacts.md`
(§ contracts). This skill is the *how-to*.**

**Announce at start:** "Using the component-contract skill to <write/enrich/cite> a contract for this vertical slice."

## The core invariant: contract parity

> *Within contract = real; beyond contract = absent or loud; nothing in between.*

A bare-200 endpoint is not a lie if the gate asserts exactly "endpoint exists, routes, returns 200."
Dishonesty enters only when behavior **silently exceeds or simulates** the spec. This cuts both ways:
under-delivery (a clause unimplemented) and over-delivery (behavior the contract doesn't name) are
both parity violations.

## Derivation is split by cost asymmetry

This is the rule that prevents the prediction disease from relocating into per-component specs.

| Aspect | Derived | From | Why |
|---|---|---|---|
| **Topology** (name, location, owner, relationships) | **subtractively** | the vision | structure is cheap to predict, expensive to move |
| **Behavior** (what it does) | **additively** | vertical-slice gates | behavior is expensive to predict, cheap to grow |

**No behavioral musts from the vision document, ever.** Every behavioral clause enters a contract
only when a vertical slice's gate demands it. Authoring a component's final behavior upfront is the prediction
disease in disguise.

## Contract file shape (parsed by the hook engine — keep the grammar)

```markdown
---
component: parser
owner: vertical-slice:expr-eval
status: active            # active | sealed — DESCRIPTIVE ONLY, never gates anything
---

# Contract: parser

## Topology
- Lives at: `src/parser/`
- Depends on: lexer, ast
- Consumed by: evaluator

## Citations
- lexer §1            # consumer cites provider; never restates the provider's text

## Clauses
### §1 Exists and routes
`parse(tokens: &[Token]) -> Result<Ast, ParseError>` is public and total over its input.
- Gate: vertical-slice:expr-eval / asserts parses_integer_literal
```

- **Clauses** are `### §N Title`. The number is the citation handle. One must per clause.
- **Citations** are bullets under `## Citations`, each `- <component> §<n>`. This is what makes the
  footprint DAG computable (`lib/footprint.mjs`) and what `lib/citation-resolve.mjs` checks.
- Each clause **should** carry a `- Gate:` line so the auditor's assertion↔clause mapping is checkable by vertical-slice gate.

## The minimality check (YAGNI as a mechanical test)

A component is correctly sized when **(a)** the vertical-slice gate passes and **(b)** removing any behavior
would fail the gate or violate a named topological invariant.

> **Every public member must be justifiable by pointing at a gate assertion or a topological
> invariant.** If you can't point, delete it.

Over-building under a vague spec is the most common implementer failure. This check is the antidote,
and it is mechanical — you either can cite a gate assertion for a member, or you cannot.

## Materials on vs off the active path

| Position | Material | Rule |
|---|---|---|
| On the active vertical-slice path | **thin-real** | genuine, minimal. A faked node un-verifies every edge through it. |
| Off the active path | **loud stub** | panics/throws (`todo!()` / `throw new NotImplementedError`). Never canned data. |
| Behind a test seam | **fake** | legal here ONLY; never reachable from the production composition root. |

Visibility ≠ wiring: a fake exported `pub` for cross-crate test use is fine; a fake in `main`'s object
graph is a violation. Do **not** `#[cfg(test)]`-gate a fake that downstream test crates import — that
breaks their compilation; the rule is about *wiring*, not visibility.

## Observable seams (render-coupled clauses)

A behavioral clause says **what** is observable (a self-loop renders as a bezier arc; a guard badge
sits at the midpoint; one handle per waypoint). A test of that clause also needs the **observable
seam** — the *public test-observation surface*: how to **load** the unit (the export to import) and
how to **find** each element (a stable test handle: `data-testid` / `role`). That surface is **API
surface, not behaviour**, so it is legitimately **contract-level** — and declaring it is what lets the
blind-test-writer target a render clause instead of guessing the implementation (and dying at
module-load / "element not found" before any assertion runs).

> **"Observable seam" ≠ the brownfield `- Seam:` line.** The `- Seam:` clause line (in `## Topology`
> or a `characterized` clause) is a **code locus** — Feathers' sensing seam, where a characterization
> test attaches. An **observable seam** is the **render-observation surface** (export + DOM handle).
> Different concept, different section; keep them distinct (see `docs/glossary.md`).

Declare them in a `## Observable Seams` section — **prose-shaped, footprint-zero** (like `## Scenarios`:
zero `### §N` clauses, zero `## Citations` bullets, so the citation DAG is unperturbed). One bullet
per observable, `- <key>: <the export and/or a stable handle>`:

```markdown
## Observable Seams
- component: default export `ChoiceEdge` (the edge component to import)
- guard-badge: the guard badge at the midpoint → `[data-testid=guard-badge]`
- waypoint: each waypoint affordance → `[data-testid=edge-waypoint]`
```

Who does what:

- **The implementer** declares a clause's observable seam and **exposes it in the DOM** (emits the
  `data-testid`, exports the declared shape). A declared seam the DOM doesn't expose is a **parity
  violation**, exactly like a clause the code doesn't satisfy.
- **The blind-test-writer** *targets* the declared seam (imports the declared export, queries the
  declared handle). It still never reads the implementation and never asserts what the code does.
- **The adjudicator** runs the suite; a render test that died because it couldn't *observe* the unit
  is classified deterministically (`lib/seam.mjs`) as **`seam-undeclared`** → a seam-declaration
  re-pass (implementer declares + exposes), **not** a blind redo. That is the loop the old
  `fix-test → intent-fork` could never close.

**Prefer function-level where the contract is exact.** If a clause's observable is a **pure value** (a
path string, a coordinate, a parsed token), make it an **exported function** and test that — no seam,
no render harness needed. Reserve observable seams for **genuinely render-only** observations. A
contract with `§1–§4` function-level and only `§5–§7` render-only (each with a declared seam) is the
healthy shape.

## Input seams (state-reading clauses)

A component test does **two** things: it **drives the inputs** into the scenario under test, and it
**observes the outputs**. Observable seams cover the second. But a clause whose behaviour depends on
**external state** the component reads — a store via `useStore`, a hook, a context — also needs the
blind-test-writer to know **how to mock that state** to set the scenario up. Without it the blind
writer (blind to the code) mocks the store to its **safe empty default**, the scenario never occurs,
and the behaviour is **never exercised even though the suite is green**.

> This is not hypothetical. In Slice 2, `ChoiceEdge` read node bboxes from the ReactFlow store and
> called `autoRoute`, but no input seam declared how a test supplies those bboxes — so the blind
> writer mocked `useStore` to `[]` for **every** test, no edge ever crossed a node, and the
> auto-router branch — the whole new behaviour — ran **zero times**. Suite 370/370, proving nothing.

Declare them in a `## Input Seams` section — **prose-shaped, footprint-zero** (like `## Observable
Seams`: zero `### §N` clauses, zero `## Citations` bullets). One bullet per state source,
`- <key>: mock <state source> to return <shape>; <how to trigger the scenario>`:

```markdown
## Observable Seams
- export: default `ChoiceEdge` (memo(ChoiceEdgeComponent))
## Input Seams
- node bboxes: mock `useStore` to return nodes as `{ id, position:{x,y}, width, height }`.
  autoRoute receives the bboxes of all non-excluded nodes. To exercise a CROSSING, supply a node
  whose bbox the straight source→target segment passes through.
```

Who does what:

- **The implementer** declares a clause's input seam — it **wrote the selectors/hooks, so it alone
  knows their mock shape**. A behaviour clause whose scenario can't be set up without an undeclared
  input seam is the implementer's defect — the same discipline as the observable-seam obligation.
- **The blind-test-writer** *consumes* the input seam to **construct the scenario** (mock the named
  state source to a non-empty value that triggers the behaviour), not just observe the output. It
  still never reads the implementation and never asserts what the code does.
- When a clause describes behaviour that depends on external state with **no declared input seam**,
  the blind-test-writer emits the **`seam-undeclared`** flag (naming the clause + the missing input)
  **rather than defaulting the mock to empty and silently not testing the behaviour**. Unlike the
  output side — where `lib/seam.mjs` computes `seam-undeclared` from a render *red* — a missing input
  seam produces a **false green**, so the blind-writer must raise it **proactively** while writing the
  test. The orchestrator then re-dispatches the implementer to declare the mock shape.

## Enrichment vs amendment (the ratchet — see contract-amendment skill)

- **Enrichment** (adding a clause): free, additive, the paradigm working. The implementer does it in
  its own contract and reports the diff; the orchestrator logs it.
- **Amendment** (weakening/removing a clause): ceremonial, ledger-logged, retro-approved, rare.
- **Tests track contracts 1:1.** A test diff without a matching contract diff is a violation (a hook
  enforces it). Contracts are governed; tests are derived.

## Citation discipline (one owner per seam)

The **provider** owns the clause; consumers **cite** it (`uses parser §1`). **Never duplicate a seam
description across contracts** — spec-level duplication is drift, the disease at the documentation
layer. Payoff: the citation graph makes any change's ripple set computable by a script, and a hook
verifies every citation resolves.

## Informal-language clause

Words like "prototype", "stub", "skeleton", "MVP" in prose carry **no normative force**. No rule, hook,
or constitution may reference them; they grant no exemption from contract parity. Stick to glossary
vocabulary in anything normative; let human prose breathe elsewhere.

## Common mistakes

- **Writing behavior from the vision.** Topology is subtractive; behavior is additive-from-vertical-slice-gates only.
- **A member with no gate to point at.** YAGNI violation — delete it or add the gate first.
- **Restating a provider's clause in a consumer.** Cite it; don't copy it.
- **Canned data off-path.** Use a loud stub; a plausible fake value is a landmine.
- **A state-reading clause with no input seam.** The blind writer mocks the store to empty, the
  scenario never occurs, and the green proves nothing. Declare the mock shape in `## Input Seams`.
- **Treating `status: sealed` as an exemption.** It is descriptive. Parity applies regardless.
