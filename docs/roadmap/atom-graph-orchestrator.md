# Problem: the atom graph has no live dispatcher

**Status:** TODO — problem defined below, with a four-phase build plan (A1–A4). The underlying
behavior is already designed in `docs/DESIGN-3.0.md` §3/§5/§6/§7; this sequences the *deferred build*
(`frontier-wave` shipped schematic on purpose — its own comments call the real Spec/Pack/Merge "a
later hardening pass"), not new design. The two genuinely-open pieces are flagged in each phase:
ceremony-dial **calibration** (§16 — needs ledger data, not assertable) and **brownfield genesis**.
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

**Ships:** a live effort finally has a non-empty genesis graph — `needs`/`serves` edges compute,
cones appear, `reconcile` stops degrading to empty, and `classify()` sets the initial band. **Gap D**
(the Node/Atom id-duality collapse — one id space, atoms nesting under their `component → subeffort`
containment path instead of rendering flat beside the 2.x Node tree) lands here, via the ownership
map. *Open piece: brownfield genesis — how the census skeleton and characterized clauses seed the
charters (§16) — is deferred; A1 targets greenfield genesis first.*

### A2 — Real Spec + Pack *(§6 — spec first, pack second)*

Replace the `specdAtoms = [{ id: 'a-1' }]` placeholder: for the top frontier atom, author its real
delta (the blind-test-writer translates it, per clause), refine planned → actual edges, and run the
cohesion check (R4) + the spec-time guard (checkpoint-2) — all before dispatch. Pack on **actual**
footprints; `lib/frontier.mjs`'s `pack` is already tested and just needs real spec'd atoms to chew
on.

**Ships:** `frontier-wave` packs real atoms into real, footprint-disjoint waves.

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
  goals.json touches the entire entry flow). A2 is mostly mechanical once A1 lands.
- **Two things this plan cannot finalize in code:** A4's calibration (dogfooding, above) and
  brownfield genesis (A1 note) — both deliberately left open, not overlooked.
- **What sits behind this file:** gap **B**'s buildable half is A4; **B**'s calibration is the
  dogfooding dependency; **D** lands inside A1/A3; and **C** (the knowledge brick,
  `knowledge-brick.md`) stays a separate net-new design that only becomes reachable once A3 is live.
  This on-ramp is the prerequisite that makes a proportionate simple-task lane real.
