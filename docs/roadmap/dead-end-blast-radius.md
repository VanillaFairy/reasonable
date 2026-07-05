# Problem: a dead end refutes a premise, but the system only records a work order

**Status:** TODO — problem + design direction defined below. **This one supersedes pinned design**
(D§5.8's hash-unbind semantics), so the resolution must land through a deliberate `DESIGN.md`
amendment + glossary update, never through a workflow patch alone.
**Origin:** the thin-planner follow-up discussion (2026-07-05): dead-end knowledge generalizes to a
shared, dynamically-built knowledge graph over the effort — and a dead end must never be *directly
repurposed*; it has a **blast radius** that may demand a full replan.
**Interim (landed 2026-07-05, v2.3.0):** reconcile computes the dead-end set (`lib/dead-ends.mjs`),
the briefing carries it, the routePrompt marks those ids RETIRED, and the runner drops re-proposals +
escalates a stuck frontier BREAKING. That closes the *id-level* loop. This file is about the
*premise-level* loop it cannot close.

## What is broken

1. **The dead-end record is WO-centric; the refuted premise is implicit.** A `dead-end` ledger event
   names a work order and an input *hash* — a digest of {gate + spec + cited contract texts}. The
   hash blocks an *identical* re-run, but the **assumption that actually died** ("charts can be
   rasterized client-side on an edge runtime") is never a node anything can cite or traverse.
2. **Blast radius is therefore uncomputable.** Dead-ends propagate along *assumption* coupling, not
   structural coupling: two work orders can share zero files and zero contracts and still die of the
   same idea. No traversal over the existing graph (loci, citations) finds the sibling that leans on
   the dead premise. Today that correlation lives only in the planner's judgment ("re-price the
   neighborhood") — prose, not capability.
3. **Id-level retirement cannot catch a rebranded dead idea.** The interim drop blocks the *old id*;
   nothing blocks the same doomed approach re-proposed under a fresh id with a clean hash. Only a
   premise-level record can.
4. **D§5.8's hash-unbind is permission-shaped.** As pinned, an input change makes the *same* WO id
   dispatchable again — the "directly repurposed" path. That inverts the intended flow: a changed
   input should feed a **replan** that may produce successor work under new identity; it should never
   auto-relicense the old node.

## Why it matters

A dead end is the paradigm's highest-value feedback — prediction corrected by reality ("feedback
beats prediction"). If the system cannot (a) say *what* was refuted, (b) find *who else* leans on it,
and (c) force re-entry through a replan, then the feedback is spent once and leaks: pipelines re-walk
craters under new names, and a vision-level refutation can be silently papered over by a local
decomposition. In autonomous mode there is no human to catch either.

## Failure modes a solution must prevent

1. **Rebranded resurrection** — the dead premise back under a new WO id/hash, undetected.
2. **Minimal-perturbation resurrection** — nudging an input just enough to flip the hash, then
   re-running the same id ("directly repurposed"). Retirement must make this path not exist.
3. **Silent local patch of a vision-level refutation** — a decomposition that routes *around* a dead
   premise the intention itself cites, instead of escalating the intent fork.
4. **Knowledge rot** — an assumption registry nothing parses and nothing gates becomes stale prose
   (the plugin's own warning). Every record here must have a mechanical consumer.
5. **Blast-radius narrowing** — judgment may *widen* the computed radius, never shrink it below the
   mechanical bound (same doctrine as the conservative footprint).

## Candidate resolution (design direction, not yet committed)

**One new edge type in the graph that already exists — refutation — plus one mechanical join.**

- **Premise reification.** The dead-end ledger event grows a `refutes` field: the contract clause(s)
  and/or a first-class assumption record ("A-12: client-side canvas rasterization is available")
  that the verdict killed. Assumptions live where clauses live — citable, parsed, pinned in
  `docs/artifacts.md` (grammar is load-bearing, invariant #3). The WO stays as *where* the
  refutation was discovered; the premise becomes *what* was refuted.
- **Blast radius = computed closure, widen-only.** radius(dead-end) = citation-closure over the
  `refutes` set (contracts citing a refuted clause, WOs whose footprints intersect it, route nodes
  whose specs cite it). Computed, not declared — judgment (planner/retro) may widen, never narrow.
  If the closure reaches `intention.md`'s citations, the dead end is **vision-level**: always an
  intent fork to the human; no agent may resolve it (the "full replan" rung).
- **Context self-routing.** Any future work order whose footprint intersects a dead-end's blast
  radius gets that dead-end record injected into its planning/dispatch context automatically —
  footprint intersection is existing machinery. The knowledge routes itself to whoever works near
  the crater; no agent has to remember to look. This is the mechanical consumer that keeps the
  registry from rotting (failure mode 4), and the only structural defense against rebranding
  (failure mode 1) short of judgment.
- **Retirement supersedes hash-unbind (the D§5.8 amendment).** A dead-ended WO id is terminal for
  dispatch purposes, permanently — like `merged`, with its own journal status (`dead-end` already
  exists). `redispatch-guard.mjs` is repurposed from permission-check ("hash changed ⇒ clear") to
  retirement enforcement ("dead-ended id ⇒ blocked, period"). The *legitimate* path back into the
  crater: a replan consumes the dead-end record, produces successor WOs under new ids, and those
  new specs cite the amended inputs — the hash machinery survives as provenance, not as license.
  **Proposed glossary wording** (lands only with the DESIGN amendment): *"Dead end — a
  refutation-surviving infeasibility verdict; a retroactive spike. Code dies on its branch;
  knowledge is harvested; the verdict enters the ledger naming the refuted premise. The work-order
  id retires permanently: re-entry is always replan-from-knowledge, never repurpose-the-dead-WO."*
- **Escalation ladder** (the organs all exist; this pins the routing rule):

  | Blast radius reaches | Replanner | Gate |
  |---|---|---|
  | only this slice's cut | thin route-planner re-cuts | in-run |
  | route ordering / other slices | route re-sort | retro-ratified |
  | `intention.md` citations | vision amendment | human, always |

- **The knowledge-graph frame (why this is not a new subsystem).** The effort already persists a
  knowledge graph in shards: contracts+citations (structure), the ledger (events), spike artifacts
  (experiments), intention.md (intent). This design adds the missing *refutation* edge and joins it
  to the existing footprint machinery. It is NOT a parallel wiki: every artifact added here is
  machine-parsed and has a mechanical consumer, per the plugin's own survival rules.

## How we'll know it's fixed

- A dead-end ledger event names its refuted premise; `docs/artifacts.md` pins the grammar and a lib
  parses it.
- Blast radius is a computed set with a test; judgment paths can only widen it.
- A new WO whose footprint intersects a live blast radius receives the dead-end record in its
  dispatch context, mechanically.
- `redispatch-guard.mjs` blocks a dead-ended id regardless of hash; the DESIGN §5.8 text and the
  glossary entry say retirement, and code comments citing §5.8 are updated in the same change
  (invariant #4).
- A vision-level refutation cannot be resolved by any agent — it always surfaces as an intent fork.
