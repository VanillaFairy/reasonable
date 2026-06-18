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
- **Treating `status: sealed` as an exemption.** It is descriptive. Parity applies regardless.
