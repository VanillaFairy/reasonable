# Problem: a same-slice producer→consumer split has no merge boundary to cut the consumer from

**Status:** TODO — deferred past v1. Route-planner guidance (fold tightly-coupled same-slice splits
into one work order) is the interim mitigation; this file defines the mechanical fix that would let
the split stand instead.

**Origin:** the `validate_sequence`/`validate_story` incident (sofia-plays, vertical slice 3b). The
route-planner split a slice into a provider work order (`validate_sequence`) and a consumer
(`validate_story`) and sequenced them provider-first, per [route-planner.md](../../agents/route-planner.md)'s
producer/consumer rule. The consumer's lane was cut from the effort branch's HEAD at the moment its
wave was provisioned — which did not yet contain the provider's commit, because that commit sat
unmerged on the provider's own lane branch. `validate_story` could not recurse into `validate_sequence`.

## What is broken

`lib/branch.mjs` and the vertical-slice-execution skill (§7) solve this **across** vertical slices: a
green lane merges into the effort branch **once the whole slice gates GREEN**, so slice N+1's runner
invocation always provisions from a branch containing slices 1..N. That merge boundary sits *between
runner invocations* — there is exactly one per slice.

**Inside one runner invocation there is no such boundary.** `groupDisjoint` correctly serializes two
work orders that share a locus into separate waves (never runs them concurrently), but serializing the
*dispatch order* is not the same as making the earlier wave's commit *reachable*: nothing merges a
wave's green work product onto the effort branch before the next wave's lane-provisioner cuts its
worktree. A producer and consumer split into work orders of the *same* slice therefore has provider-first
*ordering* but not provider-first *basing* — the exact gap the effort-branch mechanism was built to
close, just one level down.

## Why it matters

The route-planner's own producer/consumer rule (`agents/route-planner.md`) actively recommends finer,
more reviewable work-order splits along producer/consumer lines. Followed literally for a same-slice
pair whose consumer must build against the provider's new code (a call, an import, a recursive
invocation — not just a review-time or audit-time relationship), that recommendation currently produces
a lane that cannot compile against code it depends on. The interim fix (this session, 2026-07-03) teaches
the route-planner to recognize that case and fold the pair into one work order instead — safe, but it
gives up the reviewability/bisectability the finer split exists for, for every same-slice hard
dependency, not just the ones that would actually break.

## Failure modes a solution must prevent

1. **Wrong-base lane** — a consumer's worktree cut from an effort-branch HEAD that lacks a same-slice
   provider's already-green commit (the incident above).
2. **Premature merge** — merging a wave's work product onto the effort branch before its own trio
   verification (intent-verify, blind-test, adjudicate) has completed would integrate unverified code;
   any mid-slice merge must happen only after the *individual work order's* OUTCOME reaches `green`,
   never earlier.
3. **Slice-gate audit timing** — the vertical-slice-gate mutation-sampling audit (`vertical-slice-execution`
   §2 step 5c) currently runs once, scoped to the whole slice, at slice close. A mid-slice merge must not
   let code escape onto the effort branch in a way that audit can no longer see or that lets a later
   revert of that WO (should the slice-level audit reject it) leave a dangling merge.
4. **Provenance / SHA accounting** — `lib/commit-accounting.mjs` and reconcile's lane-basing validation
   (`validateLaneBases`) currently assume exactly one merge per lane, at slice close. A mid-slice merge
   changes that cardinality and must still let reconcile account every lane's commits correctly after a
   crash.

## Candidate resolution (the design direction, not yet committed)

**Extend the effort-branch merge mechanism down to wave granularity, gated on the individual work
order's own green OUTCOME, not the slice's.** Concretely: once a wave's work orders each reach `green`
(their own full enrichment-pipeline OUTCOME, before the slice-level mutation-sampling audit runs), and
before the *next* wave's lane-provisioner cuts any worktree, dispatch a narrow merge step — same shape
as the lane-provisioner (privileged, narrow, git-only) — that runs `git merge --no-ff lane/<wo>` into the
effort branch for every green work order the next wave's footprint depends on. This mirrors the existing
"merge only when its gate is GREEN" rule from §7, just applied at the wave boundary the route-planner
already computes (`groupDisjoint`) rather than only at the slice boundary.

Open questions a real design pass must resolve:
- Does the slice-level mutation-sampling audit (§2 step 5c) need to move earlier (per-work-order) to
  match, or can it still run once at slice close over the union of merged work — and if a WO fails that
  later audit, how is an already-merged commit unwound (revert-and-refix vs. `--no-ff` history surgery)?
- Should this apply to *every* wave (uniform mechanism, simpler to reason about) or only when the
  route-planner's footprint computation shows the next wave actually depends on the current one
  (narrower blast radius, but a second code path)?
- Interaction with ripple resolution (§5), which already sequences single-contract runs topologically
  within one slice and explicitly "umbrellas the joint result before any merge" — does wave-granularity
  merging subsume that umbrella, or do ripples stay slice-scoped while ordinary work-order waves gain
  the finer merge?

## How we'll know it's fixed

- A same-slice producer/consumer split (like `validate_sequence`/`validate_story`) can stand as two work
  orders, and the consumer's lane, when provisioned, already contains the provider's green commit.
- No work order's code merges onto the effort branch before its own trio verification (intent-verify,
  blind-test, adjudicate) completes GREEN.
- Reconcile's lane-basing validation and SHA accounting remain correct across a crash occurring
  mid-wave-merge.
- The route-planner's same-slice fold-into-one-work-order rule becomes the exception (genuinely
  inseparable operations), not the default response to any hard same-slice dependency.
