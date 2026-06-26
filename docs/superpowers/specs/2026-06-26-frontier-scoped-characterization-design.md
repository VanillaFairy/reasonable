# Design: Frontier-Scoped Characterization (defer the teeth)

**Date:** 2026-06-26
**Status:** approved (design ratified by the user; inventory form A)
**Motivating cost:** the brownfield analysis-time characterization pass
(`workflows/characterization.workflow.js`) was measured burning **millions of tokens** on a
medium codebase. The cost is structural, not accidental: the pass eagerly pins the *whole*
observable surface as tooth-bearing `characterized` clauses (born clause + parked test + reverse
discriminator + intent-verifier), so its cost is **linear in the legacy surface** — ~135k tokens ×
N scenarios + ~200k fixed, i.e. **~4N+5 agents**. For a surface of ~36 scenarios that is ~150
agents / ~5M tokens *before a single line of feature code is written*, and most of those pins are
for behaviour the effort will never touch.

## The principle (no new law — obey the one already written)

`agents/census.md` already states the **cost-asymmetry split**:

> "the topology census is cheap and global, done up front; behavioural pins are expensive and
> demand-driven, done later at the seam by the characterizer."

The current analysis-time workflow **violates that split** — it does the expensive,
demand-*less* behavioural pinning up front, across the whole surface. This is also a quiet
breach of the methodology's foundational *feedback beats prediction*: pinning behaviour the
effort has not yet decided to touch freezes exactly what a later change may move (the prediction
disease in miniature), as census.md and characterizer.md both warn.

The fix introduces no new mechanism. It makes the **workflow** honor the split census already
preaches:

> The analysis-time pass stops creating tooth-bearing pins. It becomes a **read-only,
> frontier-scoped observation** that writes a thin prose scenario inventory. Every tooth — born
> `characterized` clause, parked characterization test, BF2 reverse discriminator, intent-verifier
> adversary — **defers to first-touch genesis**, which already creates the full pin on first touch
> and now becomes the *sole* birthplace of a `characterized` clause.

## Why this is safe (what does NOT change)

Deferral relocates machinery; it deletes none of it.

- **The FLOOR (`baseline.json`) is untouched.** It remains the regression-containment fence for
  every pre-existing test (census still writes it). **No regression protection is weakened** —
  untouched seams stay floor-protected exactly as today.
- **First-touch genesis is untouched.** `workflows/vertical-slice-runner.workflow.js`
  (`provisionThenImplement`, the `a.brownfield && wo.characterizationNeeded` arm) already runs the
  full teeth in fixed atomic order: lane → born clause + parked test → BF2 reverse discriminator →
  risk-gated intent-verifier. It gains coherence: it now *always* has the implementer's
  `behaviorDelta` in hand (the analysis-time pass never did), so a pin never freezes what is about
  to move.
- **The `lib/` enforcement layer is untouched.** Fence BF5 (`contractBirth` window) / BF8
  (floor-containment), `discriminator.mjs --reverse` (BF2), and the contract clause grammar are all
  still exercised — at first touch. The `BF*` / `§18` citations stay valid and stable.

The cost does not *hide* in the slices — it shrinks. Untouched seams never pay; a touched seam
pays once, lazily, at first touch. **Total cost ∝ what you build, not what exists.**

## The new workflow shape

`workflows/characterization.workflow.js` is rewritten from ~7 phases / ~4N+5 agents to **three
agents, flat, regardless of codebase size**:

1. **Reconcile** (light) — read `runMode`, confirm `config.brownfield`, surface any
   floor-integrity diff as a NOTICE; halt only on AMBIGUOUS / runmode-absent. The D13
   UNEXPLAINED-breach stop-logic is dropped *here*: this pass no longer mutates the floor, so
   there is no pre-integration adversary to bypass. (Floor integrity stays fully enforced by
   reconcile in every *other* workflow and by the fence — unchanged.)
2. **Frontier probe + inventory write** (one `reasonable:census` agent, read-only on code) —
   read the drafted route + the change-intention + `baseline.json`; enumerate **only frontier
   scenarios** (those the drafted route intends to touch, or that carry integration risk), never
   the whole surface; write the prose `## Scenarios` inventory into those components' existing
   skeleton contracts. census already writes prose `## Topology`; this is the same observational,
   read-only-on-code, zero-teeth mandate.
3. **Scribe** (`reasonable:journal-writer`) — record the transition + the inventory into the
   derived index so the birth-ratification gate sees the frontier arrived as expected.

### Gone from this pass (relocated to first-touch, not deleted)

Lane provisioning + the two-root fenced-mutator dance, the per-scenario census-check agent, the
characterizer, the intent-verifier trio + verdict-writer, and the GREEN-on-HEAD invariant-verify.
All of this exists to *safely land a parked test (code) onto floor-tracked files*; with no parked
test written at analysis time, none of it is needed here. It runs intact at first touch.

### New result shape

```
{ kind: 'ratify' | 'no-op' | 'halt' | 'checkpoint',
  runMode, frontierScenarios, inventoryWritten, floorNotice, note }
```

No `pinned` / `verdicts` / `invariant` / `suspectedBugs` — those are first-touch concepts now.
`suspectedBug` (and its human three-way classification), the status-quo-green default (D12), and
the intent-verifier all continue to operate, at first touch, where pins are actually born.

## The thin inventory artifact (form A)

A `## Scenarios` section, added to each **frontier** component's existing census skeleton contract
(`.reasonable/contracts/<component>.md`). Prose, one bullet per frontier scenario:

```
## Scenarios
- delete-returns-immediately: `delete(id)` returns Ok synchronously today (seam: `src/store/delete.rs`; floor: delete_returns_ok)
- confirm-delete-prompts: deleting prompts for confirmation before removal (seam: `src/ui/confirm.rs`; floor: —)
```

Load-bearing properties (mirrors `## Topology`):

- **Parser-invisible.** It contains **zero `### §N` clauses** and **zero `## Citations` bullets**,
  so `lib/contract.mjs` (clause parser) and the citation-graph reader see nothing. It is an
  advisory map, not a governed artifact.
- **Footprint-zero.** Only `## Citations` bullets feed `lib/footprint.mjs`; a prose scenario list
  adds no closure weight, exactly as census's prose `- Depends on:` keeps an untouched neighbour at
  zero footprint.
- **Advisory only.** Consumed by the route-planner (frontier ordering with observable context) and
  read by the human at the birth-ratification gate. First-touch genesis still **independently**
  births the real `characterized` clause from the seam + `behaviorDelta`; the inventory is a hint,
  never a substitute, and the two never need reconciliation.

## The gate (birth-ratification, lighter and more meaningful)

The scaffolding sign-off gate stops ratifying a 256-pin tooth-bearing corpus (un-reviewable, a
rubber stamp) and instead ratifies a **frontier scenario inventory** (small, reviewable) plus the
confirmation that the FLOOR stands. Silence still never ratifies.

## Files

- **Rewritten:** `workflows/characterization.workflow.js` (the bulk of the work — new three-agent
  shape, frontier-scoped probe, prose-inventory write, new result union).
- **Edited:**
  - `skills/scaffolding/SKILL.md` + `skills/develop/SKILL.md` (launch + lighter result routing +
    the sign-off gate over the new result shape).
  - `agents/census.md` (add the frontier `## Scenarios` inventory to its read-only mandate).
  - `agents/characterizer.md` (drop the analysis-time framing; it runs only at first-touch now —
    always with a `behaviorDelta`).
  - `docs/DESIGN.md` §18 + `docs/architecture.md` §18 (describe thin-inventory + defer-to-first-touch;
    **§-numbers stay stable** — invariant #4).
  - `docs/artifacts.md` (the `## Scenarios` prose inventory format, beside `## Topology`).
  - `docs/glossary.md` (note characterization is lazy / first-touch; define "frontier inventory").
- **Untouched (explicitly):** `lib/*.mjs` (fence BF5/BF8, `discriminator.mjs --reverse` BF2,
  `baseline.mjs`, `contract.mjs`), `hooks/`, and the first-touch arm of
  `workflows/vertical-slice-runner.workflow.js`.

## Testing

This repo's tests are standalone node scripts over throwaway git repos; workflows themselves are
not unit-tested (they are pure orchestration). Verification is therefore:

- **Grammar:** a `## Scenarios` prose section round-trips through `lib/contract.mjs` as **zero
  clauses / zero citations** (extend an existing contract-parse test, or add a focused one) — proving
  parser-invisibility and footprint-zero.
- **Workflow shape (review-level):** the rewritten script keeps engine purity (no `fs`,
  no `Date.now`/`Math.random`/`new Date()`, no imports, `meta` a pure literal), returns the new
  typed union, and reduces the agent count to a fixed 3 independent of scenario count.
- **Routing:** `skills/scaffolding/SKILL.md` routes every `kind` of the new result union; the
  removed kinds (`escalate` over verdicts, `invariant-failed`) have no dangling consumers.
- **No-regression argument (documented, not a test):** the FLOOR partition and the first-touch
  teeth are unchanged, so brownfield regression protection is identical; only the *timing* of
  behavioural pins moves from eager to lazy.
