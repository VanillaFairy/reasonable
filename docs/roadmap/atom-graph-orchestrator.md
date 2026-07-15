# Problem: the atom graph has no live dispatcher

**Status:** **A1–A2 LANDED (2026-07-15); A3–A4 TODO.** A1 (genesis producer) is built — the `topologist`
is dispatched at analysis, a fenced `genesis-writer` persists the ratified `goals.json` + `policy.json` +
`ownership.json`, charters are appended as `atom-chartered` ledger events, the planned-needs fidelity +
the ownership-map nesting are wired into the graph projection (`deriveCurrent`), and the `route.json`
writes are retired. A2 (real Spec + Pack) is built on top of it — a fenced `spec-author` authors each
frontier atom's real delta, an independent `footprinter` runs the R4 cohesion check and the checkpoint-2
spec-time guard over what actually landed, and `frontier-wave`'s Spec+Pack legs pack on the real,
footprint-disjoint result instead of the `specdAtoms = [{ id: 'a-1' }]` placeholder — Dispatch and Merge
stay schematic, that's A3's. The rest of the four-phase build plan (A3–A4) is unchanged. The underlying
behavior is already designed in `docs/DESIGN-3.0.md` §3/§5/§6/§7; this sequences the *deferred build*
(`frontier-wave`'s Dispatch/Merge legs still shipped schematic on purpose — its own comments call the
real Dispatch/Merge "a later hardening pass"), not new design. The two genuinely-open pieces are flagged
in each phase: ceremony-dial **calibration** (§16 — needs ledger data, not assertable) and **brownfield
genesis**.
**Origin:** an architecture analysis (2026-07-13) comparing the 3.0 atom calculus against what the
live engine actually runs.

## Problem

The reasonable 3.0 atom graph is a rigorously unit-tested *pure calculus* — `lib/atom.mjs` (the
10-state lifecycle), `lib/graph.mjs` (the four-edge fold: needs/excludes/serves/informs),
`lib/frontier.mjs` (pack/ready/gateDue), `lib/ceremony.mjs` (the complexity classifier) — but it has
**no live dispatcher**. The running engine still dispatches 2.x work orders.
`workflows/frontier-wave.workflow.js` (lines ~152–201) is a schematic stub: it hardcodes
`specdAtoms = [{ id: 'a-1' }]`, dispatches literal prompt strings ("Implement a-1."), and its merge
step is a `log()` line. On a live effort all four dependency edges return `[]` — there are no delta
citations to fold, no `goals.json` producer to feed `servesEdges`, no R5 spike-insert producer to
feed `informsEdges`. In one phrase: a calculus without an orchestrator.

## Why it matters

This is the single reason the "ceremony is a dial, not a constant" ruling
(`docs/DESIGN-3.0.md` §5.4/§17) does not actually run. A simple task is therefore still
all-or-nothing: either triaged out of the plugin to the external `simple-task` skill, or made to pay
the full `analysis → scaffold → slice → retro` chain (`tier=lite` only thins the audit's mutation
sample — it doesn't touch the pipeline itself). And the "slice is a degenerate cone" unification
(§3) never fires either, because `servesEdges` has no `goals.json` to compute a serves-cone from and
returns `[]` regardless of what actually happened.

## Failure modes a fix must prevent

1. **Any agent-writable path that sizes ceremony *down*.** The classifier band and the
   `policy.json` dials are vision-class, human-gated, on the enforcement-paths list (§3's
   anti-attack) — a struggling autonomous run must never be able to buy its own rigor down, however
   indirectly the dispatcher wiring makes that possible.
2. **Asserting uncalibrated thresholds.** §16 requires the classifier's inputs, its band cutoffs,
   and its gate-cadence indices to be settled with ledger data, not asserted into existence to make
   the dispatcher demoable.
3. **A phase that is *cut* rather than *proven empty*.** Degeneration must record a ledger event,
   never a silent skip (§5.4) — the dispatcher has to compute the mechanical predicate, not just
   short-circuit when a phase looks unnecessary.
4. **Breaking parity or the commit iron rule at the new atom merge path.** The stubbed `log()` line
   stands in for a real `--no-ff` topological merge; whatever replaces it has to keep the same
   guarantees the 2.x merge path already enforces.

## The plan — four build phases (A1–A4)

Every primitive underneath is built and unit-tested (`lib/atom.mjs`, `lib/graph.mjs`,
`lib/frontier.mjs`, `lib/ceremony.mjs`, `lib/rewrite.mjs`, the `goals`/`policy` loaders). The work is
to wire that tested calculus into a live dispatcher and finish the genesis producer, in dependency
order — the head of the chain first, because you cannot pack real atoms until real atoms exist.

### A1 — Genesis producer *(the head; DESIGN-3.0 §5 topology stage + §3)*

Dispatch the `topologist` (the agent exists but is never dispatched) at analysis to propose its five
§5.1 outputs — component topology, structure-only charters, the containment tree + **ownership map**,
the `policy.json` proposal, and the t0 complexity band (calling `lib/ceremony.mjs`'s `classify()`). A
narrow, human-gated writer persists the ratified `goals.json` + `policy.json` + charters (they are
vision-class, agent-unwritable — capability, not prompt); `analysis` stops writing the retired
`route.json`. The `goals`/`policy` loaders and `reconcile`'s preference for `goals.json` already
exist — this is the producer they've been waiting for.

**Ships (as built):** a live effort finally has a non-empty genesis graph — the **planned `needs` edges**
compute (from charter premises, via `needsEdgesWithPlanned`), the containment tree **nests** under the
ownership map, `reconcile` stops degrading to empty (it reads `goals.json` and derives the **goal-level**
cone order — a non-empty `routeOrder`), and `classify()` sets the initial band. **Serves-cones stay empty
until the first deltas land — an A2 payoff, NOT A1:** `servesEdges` keys off spec-time `deltaClauses` a
structure-only charter does not have, so feeding `goals.json` alone cannot populate the serves-cones at
genesis — the goal-level ordering lights up at A1, the cone *contents* fill at A2. **Gap D** (the
Node/Atom id-duality collapse — one id space, atoms nesting under their `component → subeffort`
containment path instead of rendering flat beside the 2.x Node tree) lands here, via the ownership map
(in `deriveCurrent`; `foldAsLived` stays ledger-only and flat). The 2.x route/work-order path is **kept
as transitional coexistence** until the atom graph becomes the live dispatcher (A3) — A1 is additive, not
a rip-out. *Open piece: brownfield genesis — how the census skeleton and characterized clauses seed the
charters (§16) — is deferred; A1 targets greenfield genesis first.*

### A2 — Real Spec + Pack *(§6 — spec first, pack second)* — LANDED

Replace the `specdAtoms = [{ id: 'a-1' }]` placeholder: for each frontier atom, author its real
delta, refine planned → actual edges, and run the cohesion check (R4) + the spec-time guard
(checkpoint-2) — all before dispatch. Pack on **actual** footprints; `lib/frontier.mjs`'s `pack` is
already tested and just needed real spec'd atoms to chew on.

**Ships (as built):** `frontier-wave`'s Spec+Pack legs are de-schematized. For every atom in the
wave's frontier, the fenced `spec-author` authors the real delta — its own component's contract
text plus the matching `atom-delta-authored` machine delta (`lib/spec.mjs --author`) — moving the
atom `ready → spec'd`. The read-only `footprinter` then independently runs the R4 cohesion check and
the checkpoint-2 spec-time guard over what actually *landed* (`lib/spec.mjs --guard`, never the
author's own say-so — no worker grades its own artifact), and any oversized or guard-halted atom is
dropped out of the wave before packing. `pack` runs on **actual** footprints (`lib/footprint.mjs`'s
new `--atoms` mode, sourced from real ledger atoms instead of declared specs) — `frontier-wave` packs
real atoms into real, footprint-disjoint waves. Two payoffs light up as a direct consequence of real
deltas existing for the first time: the **serves-cone contents fill** (`servesEdges` now has
real `deltaClauses` to fold a goal's `scenarioCitations` through, where before it always returned
`[]`), and the **planned → actual `needs` edges refine** (`needsEdges`' clause-level citations
replace the coarser genesis-time `plannedNeedsEdges` quotient as each delta lands). See
`docs/artifacts.md`'s "The spec stage" section for the exact CLI/agent shapes. Dispatch and Merge are
**untouched, still schematic** — literal prompt strings and a `log()` line — that de-schematization
is A3's.

**Deferred to A3 (named, not overlooked):** A2 **computes and routes** the two spec-time verdicts; it
does not persist either one's *effect*. Neither an **R4 split** (chartering the sub-atoms a
`{kind:'oversized', partition}` verdict implies) nor a **checkpoint-2 halt**'s atom-state change
(`atom-flag-set: guard-halted`) is written to the ledger today — `frontier-wave` reads the verdict and
holds the atom out of the wave in memory only; the write-through is the **verdict→state fold**
(`atom-verdict` → `lib/rewrite.mjs`'s effects → `atom-transitioned`), which is still A3's to wire.
Likewise the **blast-radius archival lifecycle** (§7.2: a radius closes when its remediation
amendment batch lands) has no producer yet — `lib/spec.mjs`'s `liveBlastRadii` always reads the
full, ever-growing live set, since nothing yet retires one. All three ride A3's fold, alongside the
Dispatch/Merge de-schematization proper.

### A3 — Real Dispatch + Merge + the verdict→state fold *(§6 + §7 — the meaty phase)*

De-schematize Dispatch (the enrichment `pipeline()`: blind-test → implement + in-flight enrichment →
adjudicate → audit, real agents instead of literal prompt strings) and Merge (one `--no-ff` per
audited atom, topological order by actual `needs` edges — replacing the `log()` line). Then wire the
piece the design marks as "later work": `atom-verdict` → `lib/rewrite.mjs`'s failure calculus
(effects) → `atom-transitioned` — the driver the 10-state machine has never had live — and connect
`ready()`'s flag filter to the folded `atom.flags`.

**Ships:** `frontier-wave` drives real atoms `chartered → … → merged` and the gate returns a real
seven-variant `GATE_RESULT` computed from real state. **This is the moment the keystone turns** — the
atom graph becomes the live dispatcher. *Highest-risk phase: the verdict→state fold has never run
against a live effort.*

**A3a — verdict→state fold, state half (LANDED, 2026-07-15):** the effects-overlay fold in
`lib/atom.mjs`'s `foldAtomFromEvents` now applies a computed `atom-verdict`/`ratification` effect's
`{state}`/`{flag,op}` entries to real atom state (addressed by `nodeId`, two-phase: provisional
immediately, permanent only via a later ratification's own effects) — the driver the 10-state machine
had never had live. `lib/frontier.mjs`'s new `readyFlagLists(atoms)` connects that folded state to the
frontier: a flagged atom now actually leaves dispatch eligibility (wired into `agents/reconciler.md`'s
`frontier` computation). Both adversarially audited, PASS; a later final review caught one more gap
the audit's own charge had named but not actually tested — the overlay set any string in a flag
entry without checking it against `FLAG_NAMES`, since fixed (`isValidFlag`, same discipline
`setFlag`/`clearFlag` already applied on the write side).

**A3b-i — real Dispatch + Collect (LANDED, 2026-07-15):** a real atom now reaches `audited` for the
first time, driven by a real per-atom pipeline (lane-provisioner → implementer → lane-provisioner
reprovision → blind-test-writer → lane-committer → adjudicator → auditor), dispatched concurrently
across a wave via `pipeline()`, with a shared bounded retry (cap 2 attempts, escalating to
`blocked-human`) and `guard()`-wrapped budget handling turning per-atom throws into R1 checkpoints
rather than a wave-level `budget-exhausted`. `CORE_ROLES` gained `adjudicator` (closing DESIGN-3.0 §6's
four-unconditional-stage gap) and `verdict-writer`'s remit generalized to land any single ledger event
(not just `verifier-verdict`), including the new `atom-transitioned`/`atom-verdict` shapes. Two of the
failure calculus's nine rows — R1 (checkpoint) and R3 (ripple) — now get real production, folding
through A3a's already-built overlay; an acceptance test (`test/frontier-wave-lifecycle.test.mjs`)
proves the composition end to end over a real ledger. Built as an adversarial-TDD triad
(RED/GREEN/AUDIT); the audit found one real gap — the auditor role had been given an unspecified
`checkpoint` OUTCOME carve-out it was never granted (no such vocabulary exists in `agents/auditor.md`,
unlike the adjudicator/implementer, which both document it) — closed via a follow-on RED+GREEN pair (a
fresh test pinning the correct routing, a fresh fix removing the 3-line carve-out).

**Explicitly deferred beyond A3b-i, named rather than overlooked:** sub-atom birth materialization
(an R4 split's `{charter:{...}}` effect becoming a real `atom-chartered` event — the partial-charter +
placeholder-id shape needs the parent's context to resolve, deliberately not attempted in A3a);
checkpoint-2-halt *production* (appending the real `guard-halted` verdict from a footprinter's report —
A3a only made the flag-application side real, not the append side); blast-radius archival lifecycle
(needs births + a folded `lineage` field, per `lib/spec.mjs`'s existing forward-note); and, now that
Dispatch is real as of A3b-i, only **Merge** de-schematization remains (still schematic — a `log()`
line — A3b-ii's job). A3b-i's own scope-out and its audit surfaced several more gaps, named rather than
overlooked:

- **R2** (dead-end, infeasible+skeptic-confirmed) — needs a `premise{component,clause,layer}` shape
  neither `implementer.md`'s `infeasible` nor `skeptic.md`'s `CONFIRMED` documents emitting verbatim.
- **R5** (unknown-blocking, spike-needed) — needs a `dependents` computation (which atoms leave the
  frontier) no agent supplies.
- **R4-via-audit-refutation / R7** (parity-breach) — `agents/auditor.md` has zero `kind`-tagged OUTCOME
  vocabulary today; both need that gap closed first (flag this as the single biggest remaining gap for
  a future plan).
- **`jurisdiction`'s downstream fate** as an R-code (currently a bounded in-workflow retry, not
  promoted to a verdict).
- **Multi-atom `blocked-human` aggregation** surfaces only the FIRST blocked atom's failure detail when
  ≥2 atoms in one wave hit the retry cap simultaneously — a real (if narrow) information-loss gap the
  audit found; not fixed in A3b-i since the spec explicitly left the `blockedHuman` detail's field
  layout open, but worth a future decision.
- **Collect-phase `verdict-writer` dispatches never check their own return value** (all ~4-7 per wave:
  the `spec'd→packed` batch transition plus the three post-green lifecycle events) — a `persisted:false`
  ack or a `guard()`-caught throw during any of these is silently ignored today. Confirmed by the audit
  to be a PRE-EXISTING, systemic gap (not newly introduced by A3b-i), but worth closing in a future
  hardening pass given the tension with Law 1 (parity) and `agents/journal-writer.md`'s own "a failure
  ack is a HALT upstream, never a swallow" principle for its sibling role.
- **Guard()-throw test coverage** exists only for `provision`/`implement` of the seven pipeline stages,
  not `reprovision`/`blindtest`/`committests`/`adjudicate`/`audit` — lower priority, since all seven
  stages share the same `budgetCeiling()` helper (reducing per-site divergence risk), but a gap worth
  closing with a light coverage pass.

### A4 — Ceremony dial live *(§5.4/§9 — the buildable half of the ceremony gap)*

Route `classify()`'s band through `requiredRoles` (role-minimal provisioning) and `gateDue`'s
band-indexed cadence — both are built and tested but fed placeholder constants today. Pin the
phase-degeneration predicate mechanically ("does this introduce a new goal-cone / touch the outer
shell?", still undefined per §16), recording each degeneration as a ledger event, never a silent
skip. Ship uncalibrated defaults plus a ledger-data harness.

**Ships:** a simple task runs as a cheap single-atom effort — most phases *provably* empty, none
turned off. The "ceremony is a dial" / "both ends" payoff finally cashes out. *Open piece:
**calibration** — the classifier thresholds, band cutoffs, and cadence indices — cannot be finalized
in code; §16 pins them to real ledger data, i.e. dogfooding reasonable on live projects.*

## Scope & sequencing

- **Multi-part, week-scale.** Each phase is roughly one of the repo's "P-parts." A1 is the right
  first bite: self-contained, it lights up the whole graph, and its acceptance is cleanly testable
  ("does a real effort produce a non-empty genesis graph?").
- **Risk concentrates in A3** (the verdict→state fold) and **the A1 migration** (route.json →
  goals.json touches the entire entry flow). A2 turned out mostly mechanical once A1 landed, as
  predicted — its only real judgment call was fencing the spec-author's contract write onto the
  canonical (no-lane) allowlist rather than the lane-scoped one; **the fold's state half, A3a, also
  landed clean — zero defects on adversarial audit** — so A3's remaining risk concentrates in
  Dispatch/Merge de-schematization and birth materialization (A3b), not the fold mechanism itself.
- **Two things this plan cannot finalize in code:** A4's calibration (dogfooding, above) and
  brownfield genesis (A1 note) — both deliberately left open, not overlooked.
- **What sits behind this file:** gap **B**'s buildable half is A4; **B**'s calibration is the
  dogfooding dependency; **D** lands inside A1/A3; and **C** (the knowledge brick,
  `knowledge-brick.md`) stays a separate net-new design that only becomes reachable once A3 is live.
  This on-ramp is the prerequisite that makes a proportionate simple-task lane real.
