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

| Part | Builds | New/changed files | DESIGN-3.0 sections | Depends on | Status |
|---|---|---|---|---|---|
| **P1** | Ledger event **effects** field — the structural mechanism every later part writes its own effects through | `lib/effects.mjs` (new), `lib/ledger.mjs` (extend) | §2.4, §7, §8 | — (builds on the existing `lib/ledger.mjs` controller) | Landed — v2.8.0 |
| P2 | Contract grammar v3 — durable per-contract clause ids, per-clause citations, `demanded-by` provenance | `lib/contract.mjs` (breaking rewrite) | §4.2, §12 | P1 (clause-id allocation is a ledger event) | Landed — v3.0.0 |
| P3 | The atom — charter/delta split, the full lifecycle state machine, the minimality/cohesion law | `lib/atom.mjs` (new) | §4, §4.1, §4.3 | P2 (atoms cite clause ids) | Landed — v3.1.0 |
| P4 | The graph engine — containment-tree fold, dependency-edge computation (`needs`/`excludes`/`serves`/`informs`), edge lifting, as-lived vs. current projections | `lib/graph.mjs` (new) | §2, §2.1–§2.4 | P1 (folds effects), P3 (folds atoms) | Landed — v3.2.0 |
| P5 | The rewrite engine — the failure calculus, verdict types R1–R9, two-phase (provisional/permanent) effect application, **and the ceremony-escalation effect** (a verdict may ratchet a cone's complexity band up — grow-ceremony-on-evidence) | `lib/rewrite.mjs` (new) | §7, §7.1, §7.2, §17 | P4 (rewrites the graph), P3 (transitions atom states) | Landed — merged (no bump, 3.2.0) |
| P6 | The topology stage (heart № 2) — **split into P6a–P6e** (see Part 6): planned edges, the legibility law, the ceremony dial (complexity classifier + phase degeneration), `goals.json`/`policy.json` (**additive**, carrying the ceremony-sizing dials), the topologist role, `topology.html` | `lib/graph.mjs` (extend), `lib/legibility.mjs`, `lib/ceremony.mjs`, `lib/goals.mjs`, `lib/policy.mjs`, `lib/topology-view.mjs`, `agents/topologist.md` (all new/additive); `route.json` superseded but **retired in P7's migration**, not here | §3, §5, §5.1–§5.4, §9, §17 | P4 (measures the graph), P3 (charters atoms) | Split → P6a–P6e (P6a planned) |
| P7 | The frontier loop + gates — `lib/frontier.mjs`, the frontier-wave workflow, `GATE_RESULT`, **band-indexed** gate cadence, live progress view, 2.x→3.0 migration, **plus lazy role-minimal provisioning (the micro-effort fast path)** | `lib/frontier.mjs` (new), `workflows/frontier-wave.workflow.js` (new) | §6, §9, §12, §17 | P5 (dispatches on verdicts), P6 (reads goals/policy) | Not started |
| P8 | The zero-commit **scout** — standalone pre-effort exploration reusing the spike quarantine, writing no `.reasonable/` state, seeding the genesis graph | `skills/scout/` (new); reuses the `spike-runner` agent + quarantine fence | §17 | P6 (its output seeds the topologist's genesis graph) | Not started |

Rough shape of the dependency chain: **P1 → P2 → P3 → P4 → P5 → (P6, P7)**, with **P8** sitting on
P6 (the scout seeds the topologist's genesis graph, so it needs P6's chartering shape). P6 and P7
sit on top of P5 but don't depend on each other; P8 can follow P6 independently of P7. So once P5
lands, P6 / P7 / P8 are three loosely-coupled plans, not a strict chain.

### Versioning — the remaining parts do not bump

**Decision (2026-07-09): the plugin version stays at `3.2.0` through the rest of the series, and
bumps exactly once, at the very end.** P5–P8 are one continuous refactoring toward the live 3.0
methodology; there are no consumable intermediate builds between here and the terminal release, so
per-part bumps would only mint versions nobody installs. Each remaining part lands its code and
tests on the shared refactoring line **without a `chore(release)` bump** — `plugin.json`, the README
install snippet, and the README footer all stay `3.2.0` until the whole generation is done. The
single terminal bump then ships the completed 3.0 in one release; its number is a human call at that
point, and a **major** one, since the methodology going live is a breaking behavior change.

This overrides, **for P5–P8 only**, both this repo's standing "every change gets a version bump"
rule (`CLAUDE.md`) and the per-part `version-bump-final-check` task the earlier parts carried —
those applied because P1–P4 were each independently shippable, which P5–P8 are not.

### Keeping the status column current

**Rule — the status cell updates in the same commit that changes the underlying fact, never as a
follow-up.** The column is a live index of what's actually on disk and in the release history, not
a changelog someone remembers to update later:

- **Not started → Design drafted**: the moment a design doc for the part lands under
  `docs/superpowers/specs/`, its row's status changes in that same commit.
- **Design drafted → Planned**: the moment the part's `plan.md` lands under
  `docs/superpowers/plans/`, its row's status changes in that same commit.
- **Planned → Landed** — two regimes:
  - **P1–P4 (already shipped):** in the same commit as the part's own `chore(release)` bump, citing
    the version that shipped it — `Landed — v3.0.0` etc. Never marked Landed ahead of its release.
  - **P5–P8 (no per-part bump, see *Versioning* above):** mark the row **`Landed — merged (no bump,
    3.2.0)`** when the part's code + tests merge to the refactoring line. The version stays `3.2.0`;
    only the single terminal, whole-generation release carries the (major) bump.

If a part's status and its actual files on disk ever disagree, trust the files — `git log` and
`ls` on the relevant `specs/`/`plans/` paths are authoritative, this table is derived from them.

## What this roadmap is not

It is not itself an implementation plan — no task list, no code, nothing to execute. Parts 1–4
(below) are the plans in the series written to that level of detail so far, each one written only
after the part before landed. **Parts 5–8 are not written yet as plans.** Their *design* is now
specified in `DESIGN-3.0.md` — including the draft-five *pay-as-you-go ceremony* amendment folded
across §5.4 / §7 / §9 / §17 and summarised per part below — but the per-part `plan.md` files are
not written. Write them one at a time, after the part before has landed, so each reflects what the
previous part's implementation actually taught (exactly the feedback-over-prediction principle the
design argues for). The draft-five amendment is why the count grew from seven parts to eight: the
scout (P8) is a genuinely new pre-effort capability that doesn't fold into any in-effort part.

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

## Part 3

**Plan:** [`2026-07-09-reasonable-3.0-p3-atom/plan.md`](2026-07-09-reasonable-3.0-p3-atom/plan.md)

Builds `lib/atom.mjs`: the atom's charter/delta split, its full lifecycle state machine (ten
states plus three orthogonal flags), and the minimality/cohesion law (DESIGN-3.0 §4, §4.1, §4.3).
Deliberately scoped to **the atom's own mechanics only**: this part does not fold atoms into the
dependency graph (that's Part 4's `lib/graph.mjs`), does not decide which verdict (R1–R9) applies
to a failed attempt or apply one (that's Part 5's `lib/rewrite.mjs`), and does not touch the
frontier loop or its guard checkpoints (Part 7). Purely additive — one new file, six new optional
ledger event types, zero behavior change to any existing caller — so unlike Part 2 it bumps the
version automatically (minor), with no human-gate STOP. See the plan's design doc for every place
DESIGN-3.0 left a concrete shape unstated and how this plan resolved it, including a real,
flagged, un-owned gap: citing `intention.md` from a premise has no grammar yet, and this part does
not invent one.

## Part 4

**Design doc:** [`2026-07-09-reasonable-3.0-p4-graph-design.md`](../specs/2026-07-09-reasonable-3.0-p4-graph-design.md)

**Plan:** [`2026-07-09-reasonable-3.0-p4-graph/plan.md`](2026-07-09-reasonable-3.0-p4-graph/plan.md)

Builds `lib/graph.mjs`: the containment-tree fold, the four dependency-edge computations
(`needs`/`excludes`/`serves`/`informs`), edge lifting, and the as-lived-vs-current projection split
(DESIGN-3.0 §2, §2.1–§2.4). Deliberately scoped to **actual-fidelity edges only** (post-spec,
clause-level — planned-fidelity edges need Part 6's topologist ordering data, not built yet) and to
**reading**, never writing, a ledger event — no new `EVENT_SCHEMAS` entry, no rewrite verdicts (Part
5), no topology/goals data (Part 6), no frontier/dispatch (Part 7). The central finding this part's
design doc turns on: nothing in the shipped engine has ever written a real `effects` array (Part
3's `lib/atom.mjs` never attaches one to its own events), so `needs`/`excludes` are always *derived*
from ledger-embedded delta clauses and live contracts, never read off `effects` — which makes the
as-lived and current graph projections **provably identical today**, and gives the divergence check
DESIGN-3.0 requires (§2.4) a real job right now: catching a contract hand-edited outside the
ledger-governed pipeline, not just a someday rewrite-skew detector. Purely additive — one new file
plus one small, backward-compatible export addition to the already-shipped `lib/atom.mjs` (so a
seq-bounded atom fold can be composed without duplicating its per-event switch) — so like Parts 1
and 3 it bumps the version automatically (minor), no human-gate STOP. See the plan's design doc for
two real, flagged, un-owned gaps this part does not invent a fix for (no atom field carries resource
claims yet, so `excludes` treats them as always empty — the safe, under-approximating direction of
error; and planned-fidelity edges are deferred whole rather than half-built against a topologist
ordering scheme Part 6 hasn't specified yet), plus one contestable proportionality call (no
`graph.json` disk mirror yet — nothing reads it today, so wiring it into `lib/ledger.mjs`'s `append()`
is deferred to whichever part first needs to read it outside a test).

## Part 5 — landed (merged, no bump, 3.2.0)

**Design doc:** [`2026-07-09-reasonable-3.0-p5-rewrite-design.md`](../specs/2026-07-09-reasonable-3.0-p5-rewrite-design.md)

**Plan:** [`2026-07-09-reasonable-3.0-p5-rewrite/plan.md`](2026-07-09-reasonable-3.0-p5-rewrite/plan.md)

**Design:** DESIGN-3.0 §7, §7.1, §7.2 — **including the draft-five ceremony-escalation effect**
(the ruling before §7.1).

The design doc turns on one pivotal, flagged scoping call: **Part 5 builds `lib/rewrite.mjs` as a
pure calculus library** — a total function from `(verdict, graphState)` to a two-phase
`{provisional, permanent}` effect set (in `lib/effects.mjs`'s validated shape), reusing Parts 1/3/4's
pure surfaces — and **defers the append-path wiring, the collision-free 3.0-verdict event type, and
the effects-overlay fold to Part 7** (the part that first produces and collects a verdict). The
reason is decisive, not a proportionality guess: the shipped `verdict` event type is already live for
2.x skeptic/auditor judgments, so keying effect-computation off `type:'verdict'` inside `append()`
today would misfire on real data. The ceremony-escalation **unwind** — DESIGN-3.0's own
still-untested assertion (draft-five open edge (c)) — is built and tested here with an explicit
apply-then-unwind = identity invariant, in its own triad.

Builds `lib/rewrite.mjs`: the failure calculus, the R1–R9 verdict types, and two-phase
(provisional-at-verdict / permanent-at-gate) effect application, hosted inside the ledger
controller's append path so the effect sets are code-computed, never model-authored (§2.4). The
draft-five addition this part now owns: the **ceremony-escalation effect** — a verdict (a wide R2, a
foreign-reaching R3, an integration-exposing R9, a second R1) may attach an effect that ratchets the
affected cone's complexity band *up*, deepening its audit tier, re-arming a scaffold/legibility check
the low band had found vacuous, and tightening its gate cadence. Monotone (up only), two-phase like
every other effect, and — the open edge the design flags for attack — its permanent-raise rejection
must unwind exactly as R7's provisional cone freeze does; P5 is where that unwind gets built and
tested, not just asserted.

## Part 6 — split into P6a–P6e; P6a planned

**Design doc (whole stage):**
[`2026-07-10-reasonable-3.0-p6-topology-design.md`](../specs/2026-07-10-reasonable-3.0-p6-topology-design.md)

**Design:** DESIGN-3.0 §3, §5, §5.1–**§5.4**, §9, §17 — **including the draft-five sizing classifier
and phase-degeneration ruling (§5.4)**.

Builds the topology stage: planned edges, the legibility law (`lib/legibility.mjs`), the ceremony dial
(the **complexity classifier** §5.1 + the **phase-degeneration** predicate §5.4), the `goals.json` /
`policy.json` pair (carrying the **ceremony-sizing dials**), the topologist role, and `topology.html`.
The design doc **pins the phase-degeneration predicate mechanically** (the open edge the roadmap
required P6 to close, not leave as prose) and flags the calibration residues (the classifier's
thresholds and band→cutoff maps stay uncalibrated `policy.json` defaults, §16).

Two scoping calls were confirmed with the human before any plan was written (the discipline P5's doc
used for its pivotal call):

- **P6 is additive.** The roadmap's `route.mjs (retire)` cannot mean "delete it this part":
  `route.mjs` is imported by `reconcile.mjs`, the recovery prologue that runs every session, so
  deleting it breaks the live 2.x engine between parts (the roadmap's own "keeps working between
  parts" invariant). §12 puts the `nextAction` rebuild-over-goals/cones inside the **migration**,
  which is **P7's**. So P6 builds the new engine/grammar/role/viewer as new files *alongside* the live
  route path; **P7's migration retires `route.mjs` and rebuilds the projection.** This mirrors P5's
  "build the calculus, defer the wiring to P7" exactly.
- **P6 splits into a sub-series** — it is ~2–3× P5 and spans five subsystems (one of which, planned
  edges, is work P4 deferred). Each sub-part is planned and landed **one at a time**, so each reflects
  what the previous taught (the design's own feedback-beats-prediction thesis). Execution model
  (human-set): plans authored in Opus, implemented by a series of fresh **Sonnet subagents** under
  subagent-driven-development (one per red/green/audit role, Opus supervising).

| Sub-part | Builds | New/changed files | Depends on | Status |
|---|---|---|---|---|
| **P6a** | The **planned-edge fold** — component-quotient `needs` (from `cite:` premises) + intra-component ordering (from `order`). Finishes P4's deferral. | `lib/graph.mjs` (extend, additive) | P3, P4 | Landed — merged (no bump, 3.2.0) |
| **P6b** | The **legibility law** — bounded width, tangle density, coupling & chain smells, and R8's density-reduction guard. Pure over planned+actual edges. | `lib/legibility.mjs` (new) | P6a | Landed — merged (no bump, 3.2.0) |
| **P6c** | The **ceremony dial** — the complexity classifier (t0 risk → band) + the **phase-degeneration predicate** (mechanically pinned) + band-scale mechanics. | `lib/ceremony.mjs` (new) | P6a, P6d | Landed — merged (no bump, 3.2.0) |
| **P6d** | **`goals.json` + `policy.json`** grammar + conservative loaders (weights, legibility/cadence thresholds, ceremony-sizing dials). Additive; `route.mjs` untouched. | `lib/goals.mjs`, `lib/policy.mjs` (new) | — | Landed — merged (no bump, 3.2.0) |
| **P6e** | The **topologist role** + **`topology.html`** viewer (self-contained layered-DAG renderer; component / cone / diff views). | `agents/topologist.md`, `lib/topology-view.mjs` (new) | P6a–P6d | Planned |

**Sub-series dependency order:** P6a → P6d → { P6b, P6c } → P6e. P6a is the foundation (genesis
legibility is vacuous without planned edges — a charter has no deltas, so `needsEdges` returns `[]`).
The P6b–P6e plans are written just-in-time, each after its predecessor lands.

## Part 7 — not yet planned

**Design:** DESIGN-3.0 §6, §9, §12, §17 — **including the draft-five lazy-provisioning bullet (§6)
and band-indexed heartbeat-floor ruling (§9)**.

Builds `lib/frontier.mjs`, the frontier-wave workflow, the exhaustive `GATE_RESULT` union, gate
cadence, the live progress view, and the 2.x→3.0 migration. The draft-five additions this part now
owns: **lazy, role-minimal provisioning** — a wave stands up only the roles its atoms need
(implementer + blind-test-writer + per-atom auditor + fences for a single-atom effort; census /
characterizer / re-chartering / retro-synthesizer only on non-empty input), with the lane
infrastructure stood up on first need rather than at entry, while the lane = atom accounting stays
untouched; and the **band-indexed heartbeat floor** (§9), where the gate cadence N/M scale with the
cone's complexity band so a micro-effort isn't dragged through a full retro cadence, with the
starvation valve and always-human classes unconditional.

## Part 8 — not yet planned (new in draft five)

**Design:** DESIGN-3.0 §17 (the zero-commit scout ruling).

Builds the **scout**: the spike-runner's quarantine machinery made launchable standalone, before
any `.reasonable/` state exists, as the sanctioned pre-effort exploration surface the methodology
currently lacks (today a spike is a route item *inside* a committed effort). Its deliverable is a
knowledge artifact — a shape sketch, a feasibility verdict, a candidate decomposition — and on
convergence it **seeds the genesis graph** so analysis starts warm. Depends on P6 because the seed
must be charter-shaped (the open edge flagged for attack: nothing yet mechanically enforces that the
seed carries *structure only*, so the scout could otherwise smuggle behavioral prediction past the
§13 law). Reuses the existing quarantine fence unchanged — scout code never reaches mainline;
re-entry is always rewrite-from-knowledge. A genuinely new capability, which is why it is its own
part rather than a fold into P5–P7.
