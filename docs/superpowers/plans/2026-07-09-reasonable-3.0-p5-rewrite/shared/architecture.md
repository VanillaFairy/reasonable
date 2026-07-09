# Architecture — Part 5: The Rewrite Engine

Read the design doc first: `docs/superpowers/specs/2026-07-09-reasonable-3.0-p5-rewrite-design.md`.
This file is the one-page orientation; the design doc carries the reasoning and the flagged calls.

## The one-sentence shape

`lib/rewrite.mjs` is a **pure library** that maps an already-typed, already-audited R1–R9 verdict
plus a read-only graph snapshot to a two-phase `{provisional, permanent}` set of `effects.mjs`-shaped
effects. It computes; it never applies, never reads disk, never appends a ledger event.

## Why pure, and why no `lib/ledger.mjs` change (the confirmed pivotal call)

DESIGN-3.0's prose says the calculus is "hosted inside the ledger controller's append path." The
plan does **not** wire that now, for a decisive reason: the `verdict` event type is **already live**
in `EVENT_SCHEMAS` for 2.x skeptic/adjudicator/auditor judgments, so branching `append()` on
`type:'verdict'` today would misfire on real data. Nothing produces a 3.0 R1–R9 verdict until Part
7's frontier loop, which is the part that can give the 3.0 verdict a collision-free home and wire the
computation in. So Part 5 delivers the *computation*; Part 7 delivers the *wiring* and the *apply*.
This was confirmed with the user before this plan was written. (Full reasoning: design doc, "The
central scoping fact this design turns on".)

## Module boundaries (one file, three appended sections)

`lib/rewrite.mjs` grows across the three green tasks, each owning a disjoint section below a marker
comment — the exact convention `lib/graph.mjs` uses:

- **T01 section (top)** — `VERDICT_KINDS`, `RCODE_TO_KIND`, the shared `RULES = {}` registry, the
  total router `computeVerdictEffects` (HALT on unknown), `routeRefutedPremise` (the §7.1 ladder),
  and the three pure state-transition rules R1/R4/R9 registered into `RULES`. Ends with the marker
  `// ── structural verdicts appended by T02b (do not edit above this line) ──`.
- **T02 section (middle)** — the new pure graph helpers `scc` / `dependentCone`, and the five
  structural rules R2/R3/R5/R6/R7 registered into `RULES`. Ends with its own T03b marker.
- **T03 section (bottom)** — `ceremonyEscalation`, `unwindCeremonyEscalation`, and the R8 rule.

## The registry pattern (why the router never gets edited)

The router is written **once** (T01) and reads `RULES[kind]` dynamically. Later triads add kinds by
**assignment** — `RULES['dead-end'] = ruleDeadEnd;` — inside their own appended section. No later
task edits the router or a prior section's literal, so there is never a merge conflict, and the
"append below the marker, never edit above" rule holds file-wide. The verdict kind is a genuine
runtime selector across three tasks, which is exactly the bar for a dispatch registry over a fixed
`switch` (per `CLAUDE.md`'s "add abstraction only when something selects among implementations at
runtime").

## Design decisions (the short list — see the design doc for each in full)

- **Effects are data, not actions.** A rule returns effect *descriptions*; born nodes (R4 sub-atoms,
  R5 spike, R6 placeholder) are **charter-intents** addressed by a synthetic anchor, because a real
  `a-<seq>` id can only be minted at apply time (Part 7).
- **Every `{state}` effect is validated legal before emission** with `isValidTransition`; an illegal
  move is a caller error → the rule returns `{ error }` (a HALT), never an illegal effect.
- **Reuse over reimplement.** Blast radius (R2) = `citationClosureOver`; cohesion validation (R4) =
  `cohesionComponents`; the enums come from `atom.mjs`/`effects.mjs`. Only SCC (R6) and the cone walk
  (R7) are new — small, pure, dependency-free (Law 1).
- **The ceremony unwind is the teeth.** It is a pure inverse (clear the band raise back to `from`,
  disarm the armed checks) with a headline `apply-then-unwind = identity` test — DESIGN-3.0's own
  untested open edge, made testable.

## What this part is NOT (all deferred, all named in the design doc)

Applying an effect, minting a born id, a git revert, calling `charterAtom` (Part 7); the append-path
wiring + the 3.0-verdict event type + the effects-overlay fold (Part 7); the complexity-band
vocabulary/thresholds and the legibility density metric (Part 6); the R1 reprice factor α (§16,
uncalibrated). Each is a flagged boundary, not a bug.
