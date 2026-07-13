# Problem: knowledge work is not a first-class brick

**Status:** Net-new design. Must face an independent adversarial pass before ratification, and it
depends on the atom-graph orchestrator ([atom-graph-orchestrator.md](atom-graph-orchestrator.md))
existing first.
**Origin:** the same 2026-07-13 architecture analysis that surfaced the orchestrator gap.

## Problem

The atom (the 3.0 "brick") is delivery-shaped: its success terminal is `merged` — audited code
landed via `--no-ff`. A spike / scout / investigation produces something else entirely — a
**knowledge artifact, code discarded** — and today that's modeled as a *different* mechanism: a 2.x
execution-tree Node with a `Kind ∈ spike | scaffold | grill-pass | …`, whose knowledge crosses to the
delivery graph as an `informs` **edge** (`lib/graph.mjs`), never as a node in its own right. So "a
dynamic graph of atomic bricks" is really a graph of *delivery* bricks with investigations bolted on
as edges. The "one node set" thesis (`docs/DESIGN-3.0.md` §2 — "one set of nodes, two orthogonal
structures over it") is realized only at the old Node layer; the atom never absorbed it.

## Why it matters

The span "simple task → complex investigation" crosses a seam where the primitive changes kind —
exactly the generalization a single dev methodology needs to own rather than paper over. The
exploratory end is second-class today: an out-of-band excursion launched from the main session, its
result carried back by hand, rather than a first-class node the frontier loop schedules, prices, and
folds like everything else.

## Failure modes a fix must prevent

1. **Breaching the one-way membrane (Law 2).** Spike code must never reach mainline. A knowledge
   brick has to keep its law-free quarantine workspace and its code-discard property — preserved by
   its *terminal state and quarantine flag*, not by being hived off as a wholly separate primitive.
2. **A knowledge brick claiming a delivery terminal (`merged`), or a delivery brick claiming the
   knowledge terminal.** The two success shapes must stay distinguishable at the type level, not
   just by convention.
3. **Losing the "no mainline knowledge-writer" property** that `workflows/spike.workflow.js`
   deliberately enforces today — nothing about unifying the primitive should reopen that path.

## Candidate direction

Lift `Kind` onto the atom (`deliver | investigate`) and fork the lifecycle by kind: a `deliver` atom
terminates `audited → merged`, same as today; an `investigate` atom terminates `→ harvested` (a
knowledge artifact), its lane law-free, its code discarded. Two payoffs worth testing once this
exists:

- `informs` collapses into `needs`-over-a-knowledge-atom — one fewer edge kind to reason about.
- An investigation becomes a first-class graph node, so a simple task and a complex investigation
  are one primitive at different sizes, instead of two mechanisms that happen to cooperate.

This unifies the two primitives the analysis found sitting side by side today — the `Node`-with-
`Kind` and the `Atom`.

## Status / caveat

Net-new design, not a wiring gap like the orchestrator problem. It must face an independent
adversarial pass before ratification, precisely because it touches Law 2 and would compose with the
ceremony-dial material that is itself the youngest, not-yet-attacked part of `DESIGN-3.0.md` (§17).
It depends on the atom-graph orchestrator on-ramp existing first — there is no live graph to make
investigations first-class *in* until then.
