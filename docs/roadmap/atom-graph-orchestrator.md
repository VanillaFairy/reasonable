# Problem: the atom graph has no live dispatcher

**Status:** TODO — problem defined below; candidate direction sketched, not designed.
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

## Candidate direction

- A live producer for `goals.json` + `policy.json` — the topologist already **proposes but cannot
  write** them (`docs/glossary.md`); this is the wiring that lets it act, migrating the retired
  `route.json` the rest of the way.
- De-schematize `frontier-wave`'s Spec/Pack/Merge steps to read real work-order specs and footprints
  and emit real `atom-verdict`/merge events instead of the placeholder atom and log line.
- Wire `lib/ceremony.mjs`'s `classify()` at genesis to write the band into `policy.json.dials`, so
  `requiredRoles` and `gateDue` index a real band instead of today's placeholder constants.
- A precise mechanical spec for the phase-degeneration predicate — "does this introduce a new
  goal-cone / touch the outer shell?" — since §16 flags this as still undefined.
- Fold in the Node/Atom id-duality collapse: one id space, atoms nesting under their
  `component → subeffort` containment path via the (unbuilt) ownership map, so atoms stop rendering
  flat beside the 2.x Node tree.

## Note

This is a "finish the P5–P8 buildout + calibrate," not new design. It lands first: it's the
prerequisite that makes a proportionate simple-task lane real.
