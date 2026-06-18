# Problem: true cross-vertical-slice parallelism (multi-writer journal)

**Status:** TODO — deferred past v1. Opt-in growth path, not a default.
**Origin:** surfaced stress-testing [architecture.md](architecture.md) (the "does it support multiple
vertical slices in parallel?" probe). The architecture's §22 growth-path bullet **understates** this; that bullet
should be tightened to point here.

## What is broken

The architecture supports parallelism *within* a vertical slice (footprint-disjoint work-order waves) fully, and
deliberately runs **one vertical slice at a time** by default. §22 offers cross-vertical-slice parallelism as a growth path —
"a thin top-level parent run fanning out concurrent vertical-slice-runs, re-converging at a joint retro" — but that
bullet glosses over a durability blocker that the source design already flagged as unsolved.

The blocker: §18 makes the `journal-writer` scribe **"the script's single hand"** — exactly one serialized
writer of `journal.json` / `inbox.json` *per vertical-slice-run*. Fan out N concurrent vertical-slice-runs and you get **N
scribes contending on one shared journal**, breaking the single-writer invariant the whole durability /
reconcile model rests on. DESIGN.md already knows this: v1 scope explicitly **defers** "cross-vertical-slice
parallelism via concurrent sessions (multi-writer journal coordination)" (§10), and §5.12 states "single
writer per journal (the orchestrator)."

So as written, the growth path would re-introduce the multi-writer problem the base design avoided — the
same *class* of "asserted but not actually safe" error the deny-by-default re-derivation just removed
elsewhere.

## Why it matters

If someone reads §22 and turns on cross-vertical-slice parallelism naively, they corrupt the program counter under
load (torn/interleaved journal writes), and the crash-only reconcile guarantees no longer hold. This is a
correctness hazard hiding behind a one-line "documented growth path."

## The principle that keeps this opt-in, not default

Even once the durability blocker is solved, cross-vertical-slice parallelism stays **opt-in, footprint-gated,
route-planner-judged** — never the default. **Parallelism spends feedback, and feedback is the framework's
most valuable currency.** Vertical slice N's gate reprices the route before N+1 commits its shape; running them
concurrently commits later vertical slices on pre-feedback estimates — bottom-up's prediction disease through the
scheduler door (DESIGN §5.11 Ruling 3: parallelize *within* decisions, serialize *across* them). The default
must remain one vertical slice in flight.

## Failure modes a solution must prevent

1. **Multi-writer journal** (the blocker above) — N scribes on one `journal.json`/`inbox.json`.
2. **No cross-run freeze.** Within a vertical slice, an amendment freezes only footprint-intersecting lanes (DESIGN
   §5.11 Ruling 4). But each vertical-slice-run is a separate workflow execution with *fixed control flow* — you
   cannot reach in and pause a sibling run's in-flight lane. An amendment in vertical slice A that ripples into vertical slice
   B's footprint has no mechanism to halt B mid-flight.
3. **Joint-retro attention blow-up.** The success test bounds human attention to the ask + breaking forks. A
   joint retro lands N vertical slices' worth of divergences and possibly-conflicting route learnings at once — the
   opposite of bounded.
4. **Coarse footprints.** Vertical slices are much larger than work orders, so genuinely disjoint (uncorrelated)
   footprints are rarer; the route-planner can seldom *certify* two vertical slices safe to run together anyway.

## Candidate resolution (the design direction, not yet committed)

**The parent run owns the journal.** Children return their program-counter transitions to the parent rather
than each spawning a scribe — so there is still exactly **one** serialized writer, one level up. This is the
same "return, don't write" trick the architecture already uses for traps (§8). It also gives the parent the
natural seat to:

- sequence the joint retro (and split it back into per-vertical-slice reviews so the human still sees one vertical slice's
  divergences at a time), and
- enact cross-run freezes (the parent holds the footprint map across all live children, so it can withhold
  the next dispatch to any child whose footprint a confirmed amendment now intersects).

Footprint disjointness uses the same set-algebra as intra-vertical-slice waves, applied one level up; the
route-planner judges that concurrent vertical slices' learnings are plausibly uncorrelated before any fan-out.

Note the one-level `workflow()` nesting limit: the parent must be a **top-level** run launched by the main
session (it may call `workflow()` once to launch children); a child vertical-slice-runner still cannot call
`workflow()` itself, so `spike-needed` from a child returns up to the parent.

## How we'll know it's fixed

- Two or more vertical slices run concurrently with a **single** serialized journal writer and no torn-state under a
  crash-during-fan-out test.
- A confirmed amendment in one live vertical slice demonstrably freezes only the footprint-intersecting sibling
  vertical slices, not all of them, and not none.
- The human still reviews divergences **one vertical slice at a time** at the joint retro (attention stays bounded).
- The route-planner refuses to fan out vertical slices whose footprints (or learnings) are not certifiably
  uncorrelated — over-approximating toward serialization, never toward false parallelism.
