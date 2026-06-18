---
name: analysis
description: Use at the start of a reasonable effort to grill the vision into formalized user stories, sketch the topology, draft the initial route, triage applicability, and emit the standing artifacts (documentation-integration policy, resource lexicon, sanity invariants, config). On the brownfield branch (fourth triage trigger) it also runs the census (topology census + baseline.json floor partition) and emits the change-intention. Rigid orchestration checklist — follow exactly. Ends with human ratification.
---

# Analysis Phase

## Overview

Analysis turns an idea into the **vision** (stable north star) and the **route** (volatile frontier),
and stands up the effort's standing artifacts. It is run in the main session, with the human present —
this is a legitimate **shared-context session** (grilling is judgment-across-artifacts).

## Mode behavior (gated vs autonomous)

Read `mode` from `.reasonable/config.json` (set by `reasonable:run` / `reasonable:run-autonomously`).
This phase's human-ratification gate behaves by mode — **gated**: the gate **blocks** and waits for
explicit human approval (*silence never ratifies*); **autonomous**: self-ratify and **log** the
decision to the ledger (`type:"ratification"`, `approvedBy:"autonomous"`, with rationale), never
blocking. In **both** modes every step and every mechanical check runs — **the protocol is absolute**,
nothing is skipped or consolidated to "run lean." A **vision amendment** is the one thing autonomous
mode must never self-approve silently: log it to the inbox and surface it for the human.

**Announce at start:** "Using the analysis skill to grill the vision and set up the effort."

**This is a rigid skill — create a TodoWrite item per step below and follow them in order.**

## The grilling protocol

Grill the human into a precise vision, **one question at a time**, in prose, **with a recommended
answer per question** — never option menus. **Explore the codebase instead of asking when the codebase
can answer.** Walk the decision tree branch by branch; resolve each before opening the next. (This is
the grill-me lineage — see the `grill-me` skill if available.)

The vision you are extracting has three parts:
- **Grilled user stories** — user-visible scenarios, sharp enough to become parked scenario tests.
- **Topology sketch** — components, names, ownership, relationships, derived *subtractively* from the
  stories. **No behavioral musts here** — behavior is additive-from-gates only.
- **Quality attributes** — the non-functional budget (latency, memory, startup), each marked *local*
  (a quality clause in a contract) or *global* (a system-invariant test owned by a breadth pass).

## Steps (each a todo)

1. **Triage applicability** (see `using-reasonable`). Confirm the effort warrants the methodology
   (novel topology OR uncertain decomposition OR ≥2 seams OR **ungoverned existing code is
   touched/risked by a change** — the fourth, *brownfield*, trigger). If none fire, say so and route to
   the lightweight/spec-pinned/spike/not-applicable exit. **"Not applicable" is a first-class verdict.**
   If the fourth trigger fires, set `config.brownfield = true` and run the **brownfield branch** below
   (BF7); otherwise leave it `false` and the brownfield steps are no-ops.
2. **Grill the vision.** Produce `.reasonable/vision.md` (stories + quality attributes) and
   `.reasonable/topology.md` (the sketch). Spawn a **spike** now for any feasibility unknown that
   blocks the vision (the first of three spike spawn points).
3. **Draft the initial route.** Produce `.reasonable/route.md`: the ordered vertical slice frontier, best-first
   by integration risk / expected information gain. The first item is always the **walking skeleton**.
4. **Documentation-integration policy.** Survey the project's existing documentation practice (KB,
   INDEX.md, wiki — its own business) and emit `.reasonable/documentation-policy.md`: how contracts
   relate to existing docs, who cites whom, the drift rule. **Recommended default** (not a mandate):
   contracts are the source of truth for *what a component promises*; docs keep rationale/gotchas/
   navigation and *cite* contract clauses rather than restating them. Host conventions get adapters,
   not mandates.
5. **Resource lexicon.** Emit `.reasonable/resource-lexicon.json`: the declarable runtime resources
   (ports, databases, named singletons, "the interactive desktop"). A shared exclusive claim is a
   serialization point. (For the dogfood widget: the tray icon + global hooks are a singleton claim.)
6. **Sanity invariants.** Emit `.reasonable/sanity-invariants.md`: the project's standing taboos (no
   test-conditioned branching, no sleeps-as-synchronization, no swallowed errors, no global mutable
   state, …). Put the regex-checkable subset into `config.json` `lintableInvariants` (the rest is the
   auditor's checklist).
7. **Config + supervision.** Emit `.reasonable/config.json` from the stack binding table
   (`gate-mechanics/references/<stack>.md`): build/test commands, test globs, park marker, loud-stub
   markers, enforcement paths, lintable invariants. Emit `.reasonable/supervision.json` —
   **preserve the supervision `profile` the entry skill (`run`/`run-autonomously`) already set; only
   write a profile if none is set, falling back to `standard`.** Default budgets — start **tight**,
   retros loosen with data.
8. **Initialize the journal and ledger.** Empty `.reasonable/journal.json` (phase `analysis`) and an
   empty `.reasonable/ledger.jsonl`, empty `.reasonable/inbox.json`.
9. **Human ratification (blocking).** Present vision, topology, initial route, and the standing
   artifacts. The human ratifies each — these are one-time ratifications (vision, topology, initial
   route, scaffold-to-come). **Silence never ratifies.** Nothing proceeds to scaffolding without it.

## Brownfield branch (BF7) — runs only when `config.brownfield = true`

Brownfield is **not a second methodology** — it is one slot swap on this same checklist. When the
fourth triage trigger fired (step 1), insert these steps; everything else above stays exactly as
written. When `config.brownfield` is unset, every step here is a no-op and the greenfield path is
untouched ("one foundation, both ends").

B1. **Run the census** (dispatch the read-only `census` agent — it must read existing code, so it
    cannot be blinded). It does two jobs in one pass:
    - **Topology census.** Read the import graph → emit one skeleton contract per component:
      `## Topology` filled with `- Depends on:` *prose* deps, `## Clauses` **empty**, **zero
      `## Citations` bullets**. Only Citations bullets feed the footprint closure, so prose-only deps
      keep an untouched neighbour's footprint weight at **zero** — the citation closure cannot explode
      into whole-codebase governance.
    - **Floor partition.** Partition the existing suite → `.reasonable/baseline.json`: each
      pre-existing test as a **FLOOR** entry `{id, locus (per-file glob over-approximation), fileHash}`,
      with `trusted: []`. FLOOR tests are **untrusted** (earn zero correctness credit) yet held green as
      a containment fence: `computeGreen = floorGreen && trustedGreen`. Add `baseline.json` to
      `config.json` `enforcementPaths` so an agent cannot rewrite the floor it is held to.

B2. **The coherence-grill still runs.** There is no system vision to grill, but the *change* has an
    intention even when the legacy system embodies none — so the grill's **oracle is the
    change-intention**. Run it as in the greenfield steps, with one added fork source: the
    grill-adversary **mines the characterization corpus for legacy incoherence** (e.g. module A rounds
    half-up while module B rounds half-even) and surfaces each contradiction as an **`intent-fork`** to
    the human, exactly like any other ambiguous fork. For a one-line ask, use a **micro-intention**
    (`scope: micro` — the change sentence + `behaviorDelta` + the touched seam's born contracts), which
    the §17 low floor ratifies in one nod at the single retro; no full grill for a one-line ask.

B3. **Emit `.reasonable/intention.md`** (the ratified change-intention) and add it to
    `enforcementPaths`. It becomes the cited **oracle** fork-resolving agents must reference downstream.

These slot in **before** human ratification (step 9): the human ratifies the brownfield artifacts —
the census skeletons, `baseline.json`, and `intention.md` — alongside the standing set.

## Discipline

- **The vision is human-gated, always.** You draft; the human owns the goal.
- **Coarse and stable.** Resist the urge to over-detail the vision — detail belongs in the route,
  which re-sorts freely. More upfront prediction fails harder; that is the disease.
- **Explore before asking.** Every question you can answer by reading the codebase, answer that way.

## Output

The ratified `.reasonable/` standing artifacts (vision, topology, route, documentation-policy,
resource-lexicon, sanity-invariants, config, supervision, empty journal/ledger/inbox) and a
go/no-go for scaffolding. **On the brownfield branch, also:** the census skeleton topology contracts,
`baseline.json` (the FLOOR partition), and the ratified `intention.md` (the change-intention oracle).
Then invoke the `scaffolding` skill (in brownfield mode it characterizes the top-level scenarios as a
parked baseline rather than building a walking skeleton).
