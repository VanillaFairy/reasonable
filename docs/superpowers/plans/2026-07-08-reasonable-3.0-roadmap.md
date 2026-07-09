# Reasonable 3.0 — Implementation Roadmap

> **Read this before opening any of the per-part plans.** It exists so the whole series is
> visible in one place — what each part builds, in what order, and why that order was chosen.

## Status: design not yet ratified

`docs/DESIGN-3.0.md` is still a **draft**. Its own header says so plainly: this is draft four,
it repairs the round-three adversarial review, but **draft four has not yet faced its own
independent attack**. Nothing in it has normative force yet — no ratification gate has approved
it, and no human has signed off on the topology it proposes.

The user has asked to plan the implementation anyway, accepting that risk explicitly: **plan
now, flag the risk.** So every plan in this series carries this note, and this rule follows from
it:

> **Do not build past Part 1 until Part 1 has landed and been reviewed.** The design's own
> thesis is "feedback beats prediction" — building six more parts against an unreviewed draft
> repeats exactly the mistake DESIGN-3.0 exists to fix. If ratification changes the shape of the
> event grammar, the graph fold, or the atom lifecycle, everything downstream of Part 1 has to
> change with it. Treat Parts 2–7 below as a **sequencing plan**, not a backlog to build blind.

## Why a series, not one plan

`docs/DESIGN-3.0.md` redesigns the methodology across several genuinely separable subsystems —
the writing-plans skill's own scope check says a spec this size should split into one plan per
subsystem, each landing working, testable software on its own. A second reason, specific to this
codebase: the existing 2.x engine (`lib/ledger.mjs`, `lib/contract.mjs`, `lib/footprint.mjs`,
`lib/reconcile.mjs`, `lib/route.mjs`) is a real, working system with real tests. Each part below
touches a bounded slice of it, so the plugin keeps working (and keeps passing its existing test
suite) between parts, rather than sitting broken through one giant rewrite.

## The series

| Part | Builds | New/changed files | DESIGN-3.0 sections | Depends on |
|---|---|---|---|---|
| **P1** | Ledger event **effects** field — the structural mechanism every later part writes its own effects through | `lib/effects.mjs` (new), `lib/ledger.mjs` (extend) | §2.4, §7, §8 | — (builds on the existing `lib/ledger.mjs` controller) |
| P2 | Contract grammar v3 — durable per-contract clause ids, per-clause citations, `demanded-by` provenance | `lib/contract.mjs` (breaking rewrite) | §4.2, §12 | P1 (clause-id allocation is a ledger event) |
| P3 | The atom — charter/delta split, the full lifecycle state machine, the minimality/cohesion law | `lib/atom.mjs` (new) | §4, §4.1, §4.3 | P2 (atoms cite clause ids) |
| P4 | The graph engine — containment-tree fold, dependency-edge computation (`needs`/`excludes`/`serves`/`informs`), edge lifting, as-lived vs. current projections | `lib/graph.mjs` (new) | §2, §2.1–§2.4 | P1 (folds effects), P3 (folds atoms) |
| P5 | The rewrite engine — the failure calculus, verdict types R1–R9, two-phase (provisional/permanent) effect application | `lib/rewrite.mjs` (new) | §7, §7.1, §7.2 | P4 (rewrites the graph), P3 (transitions atom states) |
| P6 | The topology stage — `lib/legibility.mjs`, the topologist role, `goals.json`/`policy.json` replacing `route.json`, `topology.html` | `lib/legibility.mjs` (new), `lib/route.mjs` (retire), `agents/topologist.md` (new) | §3, §5, §5.1–§5.3 | P4 (measures the graph), P3 (charters atoms) |
| P7 | The frontier loop + gates — `lib/frontier.mjs`, the frontier-wave workflow, `GATE_RESULT`, gate cadence, live progress view, 2.x→3.0 migration | `lib/frontier.mjs` (new), `workflows/frontier-wave.workflow.js` (new) | §6, §9, §12 | P5 (dispatches on verdicts), P6 (reads goals/policy) |

Rough shape of the dependency chain: **P1 → P2 → P3 → P4 → P5 → (P6, P7)**. P6 and P7 both sit
on top of P5 but don't depend on each other — once P5 lands they could run as two independent
plans rather than strictly sequential.

## What this roadmap is not

It is not itself an implementation plan — no task list, no code, nothing to execute. Part 1
(below) is the first plan in the series written to that level of detail. **Parts 2–7 are not
written yet.** Write them one at a time, after the part before has landed, so each one reflects
what the previous part's implementation actually taught (exactly the feedback-over-prediction
principle the design argues for).

## Part 1

**Plan:** [`2026-07-08-reasonable-3.0-p1-ledger-effects/plan.md`](2026-07-08-reasonable-3.0-p1-ledger-effects/plan.md)

Adds the `effects` field to the ledger event grammar — the mechanism every later part (the
rewrite engine, the graph fold) will use to record what it changed. Deliberately scoped to
**shape validation only**: this part does not interpret an effect, fold it into a live
structure, or change what any existing event type means. It only teaches the ledger controller
to accept, validate, and pass through an optional `effects` array on any event — pure addition,
zero behavior change for every existing caller.

## Part 2

**Plan:** [`2026-07-08-reasonable-3.0-p2-contract-grammar-v3/plan.md`](2026-07-08-reasonable-3.0-p2-contract-grammar-v3/plan.md)

Teaches `lib/contract.mjs` and `lib/ledger.mjs` to speak the v3 contract grammar: durable,
ledger-allocated clause ids (`<component>#c<N>`, replacing positional `§N` addressing), citations
attached per clause instead of file-level, and a required `demanded-by` provenance line on every
clause. Deliberately scoped to **grammar only**: this part does not compute the clause-cohesion
graph itself (DESIGN-3.0 §4.3, Part 3) or resolve what a `demanded-by` reference actually points
to — it only teaches the parser and the ledger to speak the shape those later parts will read.
This is a **hard, breaking cutover** of an on-disk, machine-parsed grammar (no dual-format
compatibility, per DESIGN-3.0 §12) — see the plan's design doc for why the version-bump question
(minor vs. major) is left for explicit human confirmation rather than decided in the plan.
