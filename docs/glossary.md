# Glossary (normative)

Rules, hooks, agent constitutions, and skills may reference **only** these terms.
Informal words ("prototype", "stub", "skeleton", "rough", "MVP") carry **no
normative force** — no rule, hook, or constitution may key off them, and they
grant no exemption from contract parity. Normative text sticks to this
vocabulary; human prose can breathe.

This file is the single source of truth for the methodology's nouns. The README
carries the motto, family descriptor, ancestry, and the Three Laws; `docs/artifacts.md`
carries the on-disk format of every artifact named below.

---

## The two meta-principles

Every ruling in the methodology instantiates one of these:

1. **Feedback beats prediction.** Let component shapes emerge from development
   history instead of predicting them in an upfront plan.
2. **Capability beats discipline.** A rule that can be enforced by capability
   (tool allowlists, hooks, path fences) must be — prompted rules die under
   pressure; capability rules cannot be rationalized away.

## The Three Laws

Every mechanism is one of these three at some scale. A proposed rule that is not
one of the three is probably wrong.

1. **Parity** — claims match reality exactly. Code matches contract (no more, no
   less). Tests match contracts 1:1. Journal matches git. Provenance matches
   custody. Verdicts match evidence.
2. **One-way membranes** — value crosses boundaries only in sanctioned form.
   Spike knowledge crosses as artifacts, never code. Contract changes cross as
   enrichments (free) or amendments (ceremonial). Approvals cross as explicit
   human acts, never timeouts. Ripples cross as manifests.
3. **External verification** — no actor grades its own work. Tests are written
   blind to implementations. Verdicts come from read-only adjudicators.
   Infeasibility claims face skeptics. Success claims face auditors. State
   claims face reconciliation.

   *Corollary (the verifier/adversary family, §5.6):* an adversary *proposes* a
   verdict; it never self-executes the act its verdict authorizes. It is read-only
   **by capability**, judges a *proposed* output against a reference that sits
   **above** the artifact, and returns the verdict as data — the orchestrator (or
   a separate narrow writer) performs any resulting act. Grading and acting are
   different powers; the actor that judges may not be the actor that integrates.

---

## Terms

- **Component** — a dynamically implemented entity: at every moment its
  implementation exactly matches its current contract (**contract parity**), and
  its depth grows by enrichment. There is no "finished" kind of component, only
  components whose contracts have stopped growing. There is deliberately **no
  special noun** for an incomplete component.
- **Contract** — a component's current must-list; its only definition of done.
  Provider-owned clauses; consumers **cite**, never duplicate.
- **Contract parity** — the core invariant: *within contract = real; beyond
  contract = absent or loud; nothing in between.* A bare-200 endpoint is not a
  lie if the gate asserts exactly "exists, routes, returns 200." Dishonesty
  enters only when behavior silently exceeds or simulates the spec.
- **Clause** — one must in a contract, addressed by a **durable, allocated id**
  (`<component>#c<N>`, e.g. `lexer#c12` — reasonable 3.0 Part 2, DESIGN-3.0 §4.2), never a
  positional number. The id is minted once (a `clause-allocated` ledger event, serialized under
  the ledger controller's append lock) and never reused, even if the clause is later retired from
  the file. The unit of citation, the unit of enrichment, the unit a test assertion maps to, and
  the unit a **demanded-by** line names a provenance for.
- **Demanded-by** — a clause's required provenance line, naming the citable demander that
  justified adding it: a goal-scenario assertion (`goal:<id>`), a gate (`gate:<verbatim gate
  string>`), a consuming clause/atom citation (`cite:<component>#c<N>`), or a chartering rewrite
  event (`ledger:<seq>`) (DESIGN-3.0 §4.2). Load-bearing on the clause-cohesion graph (§4.3, a
  later part) and the anti-padding audit. Syntax-checked at parse time
  (`lib/contract.mjs`'s `missingDemandedBy`); resolving what a reference actually points to is
  later work.
- **Topology** — where an entity lives, its name, owner, relationships. Derived
  **subtractively from the vision** (structure is cheap to predict, expensive to
  move).
- **Behavior** — what a component does. Accumulated **additively from gates** —
  every behavioral must enters a contract only when a vertical slice's gate demands it.
  No behavioral musts from the vision document, ever.
- **Enrichment** — additive contract growth. The ratchet's free direction.
- **Amendment** — gated contract weakening: ceremonial, ledger-logged,
  retro-approved, rare.
- **Ratchet** — strengthen freely, weaken ceremonially; tests track contracts
  1:1. Make the rare thing ceremonial and the common thing impossible.
- **Gate** — a stage's acceptance test: RED at open, GREEN at close. The merge
  condition. A stage that genuinely cannot have an automated gate must name a
  **manual verification procedure** in its spec — a justified exception, never a
  default.
- **Parked / Promoted** — a future gate's two states. *Parked* = ignore-marked
  with a reason string but still compiling/importing (it pins outermost
  contracts so topology drift surfaces immediately). *Promoted* = ignore marker
  removed, live. Promotion opens a stage; GREEN closes it.
- **Loud stub** — an off-contract code path that fails unmissably when touched
  (panics/throws). Never returns plausible data. Self-documenting, greppable
  (a second burndown), unfakeable. In compiled languages the panic *is* the lint.
- **Thin-real** — a genuine, minimal implementation on the active vertical slice path. A
  node that fakes its output un-verifies every edge through it.
- **Fake** — a test double behind a trait/interface seam, used by tests, **never
  reachable from the production composition root**. Legal in exactly one place.
  Visibility ≠ wiring: a fake exported `pub` for cross-crate test use is fine; a
  fake wired into `main`'s object graph is not.
- **Observable seam** — the **public test-observation surface** of a render-coupled
  clause: the *export* a test imports and a *stable handle* (`data-testid` / `role`)
  per queried element, declared in a contract's `## Observable Seams` section. It is
  **API surface, not behaviour** — declaring and targeting it does not break the
  blind-test-writer's blindness — so it is legitimately contract-level. The implementer
  **exposes** the declared seam in the DOM (a contract-parity obligation: a declared
  seam the DOM doesn't expose is a violation); the blind-test-writer **targets** it
  (import the declared export, query the declared handle) instead of guessing the
  implementation. **Distinct from the brownfield `- Seam:` line** (a code locus —
  Feathers' sensing seam, where a characterization test attaches): same word root,
  disjoint concept, kept apart by context (section vs clause-body line). Prefer a
  **function-level** observable (an exported pure value) where the contract is exact;
  reserve observable seams for genuinely render-only observations.
- **Input seam** — the **input-side sibling** of the observable seam: the **external state
  a clause reads** (a store via `useStore`, a hook, a context) and **how a test mocks that
  state** to construct the scenario, declared in a contract's `## Input Seams` section. A
  component test drives the inputs *and* observes the outputs; the observable seam is the
  output surface, the input seam is the input surface. It is **scenario-construction surface,
  not behaviour** (the mock *shape* is public; what the code computes from it is not) — so,
  like its sibling, it does not break the blind-test-writer's blindness. The **implementer**
  declares it (it wrote the selectors/hooks, so it alone knows **what store state they
  consume**); the **blind-test-writer** consumes it to **set the scenario up** instead of
  defaulting the mock to its empty value. For a **selector store** (`useStore(selector)`) the
  seam declares the **state the selector reads**, and the test drives the **real selector**
  against it (`(selector) => selector(mockState)`) — mocking the hook to a **constant** output
  (even a non-empty one) bypasses the selector, so the logic under test never runs. Its absence
  is the disease this prevents: a blind writer that mocks a store to `[]` (or to a constant) for
  every test sets up a scenario that never occurs, so the behaviour is **never exercised even
  though the suite is green**. **Distinct from the `- Seam:` line** (a
  code locus) and from the observable seam (the output surface): three disjoint uses of the
  word, kept apart by context.
- **Test conventions** — the stack's test-harness conventions (module system, runner,
  render lib, setup), recorded once per stack in `.reasonable/test-conventions.md` and
  fed into **every** blind-test-writer dispatch. **Detected or declared, never guessed**:
  emitting CJS `require` in an ESM repo, or the wrong runner/render API, is a
  self-inflicted module-load failure, not a contract question. Public test surface, like
  the observable seam. The hard machine-read bindings stay in `config.json`; this is the
  prose narrative the writer (and the implementer, when it exposes a seam) follows.
- **`seam-undeclared`** — the **OUTCOME disposition** for a clause whose test could not be
  written or run because a seam was undeclared. It has **two emission paths**, by which side
  of the test is starved:
  - **Output (computed from a red).** A render-clause red that died because the test could not
    *observe* the unit (a **module-load** death, **export-shape** mismatch, or
    **element-not-found**), classified **deterministically** by `lib/seam.mjs` (never eyeballed
    — *never simulate what a script can compute*), **not** because behaviour disagreed. The
    re-pass enriches `## Observable Seams` + exposes the handle.
  - **Input (proactive flag, no red).** A behaviour clause that depends on **external state**
    (a store / hook / context) the test must mock to construct the scenario, but with **no
    declared input seam**. There is no red to classify here — defaulting the mock to empty would
    produce a **false green** — so the **blind-writer raises it proactively** while writing the
    test (it cannot set the scenario up), naming the clause + the missing input. The re-pass
    enriches `## Input Seams` with the mock shape.

  Either way it routes a **seam-declaration re-pass** (the implementer declares the missing seam,
  then the blind-writer targets it / sets the scenario up), bounded so it escalates to the human
  after a few passes rather than looping. It is the deterministic replacement for the
  `fix-test → intent-fork → blind redo` loop, which a blind redo could never close (it cannot fix
  a seam it cannot see).
- **Depth** — informal measure of accumulated contract. Descriptive, never
  normative.
- **Vertical slice** — the default unit of work: a vertical stage; one user-visible
  scenario driven GREEN end-to-end, touching whatever components it needs.
  Ordered **best-first by integration risk / expected information gain**.
- **Breadth pass** — a cross-cutting stage (threading model, error propagation,
  logging) gated by "all promoted scenarios still green + new invariant tests."
  The reconciliation point where cross-vertical-slice inconsistencies get re-squared.
- **Walking skeleton** — the first milestone: a minimal end-to-end vertical slice with
  *real wiring* and trivial behavior. *Edges before nodes.* It ships; it is not
  a spike.
- **Vision** — the north star: grilled user stories, topology sketch, quality
  attributes. Coarse, stable, expensive to change. **Human-gated, always,
  individually.** In traversal vocabulary: the goal predicate and the heuristic.
- **Route** — the ordered backlog of vertical slices and current contracts; the vertical slice
  frontier. Detailed, volatile, **re-sorted freely by the agent after every
  vertical slice with logged rationale**. Human-editable file (`route.md`); human-ratified at retro.
  Its **machine twin**, `route.json` (Layer 2), carries only the ratified slice **order** — written by
  the orchestrator after ratification and kept in sync at every retro re-sort; `route.md` itself is
  never parsed.
- **Retro** — the mandatory blocking heartbeat at every vertical slice gate. Runs a
  **three-way divergence classification**: every divergence between built and
  vision gets exactly one of (a) **fix the code**, (b) **amend the vision**
  (human-approved), (c) **record a deliberate deferral**. The poison is the
  *unclassified* divergence.
- **Ledger** — append-only record of node lifecycle, worker reports, and domain events
  (enrichments, amendments, verdicts, scope expansions, budget extensions, …). The
  methodology's audit log, and the sole source the progress tree (D19) is folded from.
- **Ledger controller** — `lib/ledger.mjs`, the **sole validated write path** onto
  `ledger.jsonl`. An agent can propose an event's content but never its coordinates: the
  controller validates the event's shape, then stamps `seq` (monotonic), `ts` (its own
  clock — an agent-supplied one is always overwritten), `attempt`, and the resolved
  absolute `node`, discarding whatever the caller sent for any of them. Every write, from
  every actor, goes in through its CLI (`node lib/ledger.mjs append …`) or JS API — there
  is no other door.
- **Effect** — an optional, additive `effects` array any ledger event may carry (DESIGN-3.0
  §8): a code-computed record of exactly what that event changed, so the graph *as lived* can
  eventually be replayed from the ledger alone. Two shapes only — **node effect** and **edge
  effect** (below). Absent on every pre-3.0 event, and remains valid when absent (the field is
  optional, never required) — the 2.x ledger vocabulary keeps reading unchanged. Currently
  validated for **shape only** (`lib/effects.mjs` `validateEffects`, wired into `lib/ledger.mjs`'s
  `validateEvent`); nothing yet *folds* an effect into a live structure — that is the future graph
  engine's job.
- **Node effect** — an effect entry `{nodeId, change}`: `nodeId` is the stable id of the node the
  event changed; `change` is a free-form description of what changed, shaped by whichever future
  engine writes it (must be an actual JSON value — `change: undefined` is rejected).
- **Edge effect** — an effect entry `{from, to, edge, op}`: a dependency edge added or removed
  between two node ids. `edge` ∈ `needs | excludes | serves | informs`; `op` ∈ `add | remove`.
- **Node** — a dispatchable unit of the execution tree (a work order, a slice, a spike, a
  scaffold, a worker's own reported span of work, …), addressed by a `/`-joined path from
  the tree root. A node carries a STORED status, an optional free-text detail, and a list
  of notes. Its **displayed** status is one of six (`pending · | active ▶ | done ✓ |
  failed ↻ | panic 💥 | canceled ⊘`) and is **derived**: a leaf shows its own stored status;
  a container is a pure function of its children (§ **Derived status**), so no status is
  ever cascaded down or healed back. The progress mirror (`progress.json` / `progress.md`,
  D19) is a **full replay** of the ledger into this tree — never patched incrementally — so
  a fix to the fold re-renders all history correctly on the next regen, nothing to migrate.
- **Derived status** — the displayed status of a *container* node, computed from its LIVE
  children: any live `panic` → `panic` (a terminal failure compromises the unit); else all
  live `done` → `done`; else any live `active` or `failed` → `active` (`failed` = in motion,
  see below); else `pending`. An authored terminal on the node itself wins over derivation
  (a `done` from node-completed; a detail-bearing `failed`/`panic`/`canceled` from a real
  event). Canceled children and superseded attempts are shown but excluded.
- **failed vs panic** — `failed` (↻) is **non-terminal**: the node is down and *under
  investigation* (an investigator is looking for a workaround). It never completes on its
  own and blocks its parent's `done`, but does not by itself compromise the parent. `panic`
  (💥) is **terminal, unrecoverable**: it escalates to the user and (via derivation)
  compromises the parent, which itself enters `failed` and the loop climbs.
- **Kind** — the enum classifying a node: `work-order | spike | scaffold | grill-pass |
  slice | phase`. Stamped once, at `node-planned`, and carried on every Family-1 lifecycle
  event for that node.
- **Attempt** — a re-run is a **sibling** `name[k]` (`WO`, `WO[2]`, `WO[3]`, …), NOT a
  wrapper node — attempt 1 IS the base node itself. The **ledger controller** owns the
  `[k]`: agents send the base path, and it decides fresh vs. reopen vs. continuation from
  the tree's own state at dispatch time. A **reopen** (the live attempt already sealed
  `failed`/`panic`) mints the next sibling `base[k]` beside the old one, which stays as
  visible history; a **continuation** (e.g. a checkpoint reclaim) re-uses the same node.
  The old attempt is never edited — retry is append-a-sibling, never seal-and-nest.
- **Report event** — the `report-started` / `report-finished` / `report-canceled` ledger
  event trio (Family 2) a dispatched worker appends to narrate its own progress, addressed
  **relative to its own node** (`under`, the base id); the ledger controller resolves it to
  the absolute path under the *live* attempt, so a worker never tracks which attempt it is in.
  Replaces the retired `action-started` / `action-finished` / `action-obsoleted` trio.
- **Work order** — one atomic dispatch: named artifact inputs, an artifact
  output, a gate, a **locus**, **resource claims**, a **budget**, and a **`dependsOn`** readiness edge
  (Layer 2 — the ids of work orders whose output must already exist; `[]` when nothing is awaited).
  `dependsOn` is orthogonal to the footprint: footprint independence says two work orders *can* run in
  the same wave without collision; `dependsOn` says whether one's input *exists yet*.
- **Locus** — a work order's declared edit scope (path globs).
- **Footprint** — `locus ∪ citation-closure of touched contracts`. Two work
  orders are independent **iff their footprints are disjoint**. Computed fresh at
  dispatch, conservative by construction (over-approximation forfeits
  parallelism, never correctness).
- **Ripple manifest** — escalation artifact enumerating cross-contract impact:
  which contracts, which clauses, and whether each change is an enrichment or an
  amendment.
- **Spike** — a route item whose gate is a falsifiable question and whose
  deliverable is a **knowledge artifact**; its code is law-free and quarantined,
  and is **discarded** (re-entry is rewrite-from-knowledge, never
  refactor-from-spike). "No" is a successful spike outcome.
- **Knowledge artifact** — the mandatory spike/dead-end output:
  question / method / evidence / verdict / confidence / **expiry note** (what
  versions/conditions it tested against — spike conclusions rot).
- **Dead end** — a refutation-surviving infeasibility verdict; a retroactive
  spike. Code dies on its branch; knowledge is harvested; verdict enters the
  ledger.
- **Worker-adversary-orchestrator trio** (a.k.a. **verification trio**; plain
  alias **make-and-check**) — the named generalization of Law 3. A **worker**
  (the mutator) executes; an **adversary** (fresh context, read-only *by
  capability*, default-deny) judges the worker's *proposed* output against a
  named reference that sits *above* the artifact, *before* it is integrated; an
  **orchestrator** (deterministic control flow) dispatches both, routes
  accept / reject / escalate, and loops — *spawning* the adversary rather than
  spending its own scarce context. Reserve "trio" for this concept; the renamed
  rot-vector triad is **the three lies** (below). Not everything is trio-wrapped:
  see the **three-condition selectivity** below — any condition failing leaves
  the check a **fence**.
- **Verifier / adversary** (the family) — any read-only judge in a trio. Family
  invariant (all three hold): **fresh context** + **read-only by capability** +
  **propose-not-act** (returns a verdict as data; never performs the act its
  verdict authorizes). The capability set is **per-instance** — default
  Read / Grep / Glob, with Bash granted *only* where judging requires running a
  pinned test (so "no Bash" is **not** a family invariant; the skeptic has Bash
  by necessity). Instances: auditor, adjudicator, skeptic, grill-adversary,
  intent-verifier.
- **Intent-verifier** — the adversary placed on the pin / characterization
  worker. Its reference (oracle) is the **baseline-intent / standing baseline**:
  is this pin in the baseline we promised to capture? right seam? does it
  *legitimately* touch floor-tracked files, consistent with the characterizer's
  own `suspectedBug` flag? It **must not** judge whether the *legacy behavior is
  correct* — there is no reference above the artifact for that (the
  characterizer's bug-pin blind spot), which stays the human three-way
  classification's job. An instance of the **verifier/adversary** family.
- **Frontier inventory** — the brownfield analysis-time artifact: a thin, prose `## Scenarios`
  section (zero clauses, zero citations — parser-invisible, footprint-zero) recording the
  observable top-level scenarios on the effort's frontier (route-intended / integration-risk).
  Written read-only by `census` via `characterization.workflow.js`. Advisory: it feeds the
  route-planner and the human birth-ratification gate; it confers no trust and pins no behaviour.
- **First-touch genesis** — the **only** point a born `characterized` clause (with its parked
  characterization test + BF2 reverse discriminator + intent-verifier) is created: just-in-time,
  inside the running vertical-slice-runner, after the implementer declares its `behaviorDelta`.
  Analysis-time characterization is now a read-only frontier inventory only (no teeth); pinning
  behaviour eagerly, before a change has decided to touch it, is the prediction disease this defers
  away from.
- **Pre-integration verification** — the placement rule for an adversary: it
  judges the worker's *proposed* output *before* that output is integrated into
  the protected state (codebase / floor / cited reference), against a reference
  *above* the artifact. Judging a thing against what it was derived from is
  circular (agreement is tautological); the reference must dominate the
  derivation.
- **Three-condition selectivity** — the conjunction that makes a check a trio
  rather than a fence; *all three* must hold, and *any* failing keeps it a fence
  / gate (never trio-wrapped): (1) **oracle-dependence** — the verdict is a
  semantic judgment against a reference *above* the artifact; (2)
  **degrade-if-wrong** — a wrong *accept* corrupts **effort truth** (codebase /
  floor / cited reference); (3) **non-decidability** — no script can compute the
  verdict (*never simulate what a script can compute*). Mechanical binaries
  (footprint/overlap, behaviorDelta-completeness, census skeleton emission,
  transcription, discriminator/mutation/collision-classifier) and the decidable
  fences (enforcementPaths / quarantine / role / locus / SHA / runmode /
  two-lanes, and the sanity-regex hard-deny) are **false trios** — they stay
  fences.
- **The three tiers** — the ordered defense line a verdict passes through:
  **fence** (decidable, front-line) → **adversary** (judgment) → **backstop
  tripwire** (mechanical reconcile, last line).
- **Fence** — a decidable, front-line capability block (a synchronous hook or a
  computed binary): it *cannot* spawn a verifier and needs none, because a script
  settles it. The blast-radius fence, the quarantine / role / locus / SHA /
  runmode / two-lanes checks, and the sanity-regex hard-deny are fences.
- **Backstop tripwire** — the *last* line: a mechanical reconcile check that
  still fires and surfaces even after the front-line fence and the adversary. The
  byte-level **floor-integrity hash** is a backstop tripwire — it cannot tell a
  harmless additive pin from a real regression, so it is demoted from a
  first-line *ambiguous→HALT* to a backstop that still fires, **annotated** by any
  explaining verdict but **never silenced** by one (see *explained-by-verdict*).
- **Explained-by-verdict** — the **advisory** annotation an adversary *accept*
  places on a floor diff. **Annotate, not disarm**: the reconcile floor pass
  *still* surfaces the diff, and in autonomous mode *still* queues it to the human
  inbox; the always-escalate classes (including floor-integrity-mismatch) stay
  intact. A missing or half-written verdict can therefore only cause *more* human
  surfacing, never less — the failure direction is toward scrutiny.
- **The three lies** — the rot-vector triad (renamed from the former bare
  "trio"): false success ← auditor; false failure ← skeptic; undeclared failure
  ← budgets + fences. Same disease (claims diverging from reality), same cure
  shape (external evidence standards, never self-report). Distinct from the
  **verification trio** above.
- **Verifier-verdict** (ledger event) — the durable, **proposed** verdict an
  adversary returns as data and a narrow writer (or the orchestrator) appends to
  the on-disk append-only ledger, content-referencing the commit/hash it judged
  (like `baseline.json` pinning file hashes — *no* git commit of orchestration
  state). Shape: `{"type":"verifier-verdict", component, diffRef,
  verdict:"accept|reject|escalate", oracle, by:"intent-verifier", proposed:true,
  seq, commit}`. An autonomous `escalate` joins the always-escalate classes (a
  fifth disposition, queued breaking).
- **Skeptic** — a fresh-context agent that tries to *refute* an infeasibility
  claim ("find a way, or confirm the wall is real"). Only refutation-surviving
  verdicts bind. An instance of the **verifier/adversary** family (its reference:
  the infeasibility claim it must break; it carries Bash by necessity).
- **Auditor** — verifies *success* claims (discriminator / bidirectional mapping
  / mutation / proportionality). Symmetry: one auditor refutes "it works,"
  another (the skeptic) refutes "it can't work." An instance of the
  **verifier/adversary** family (its reference: the success claim against the
  contract + sanity invariants).
- **Adjudicator** — read-only agent that judges each red test with the contract
  text as arbiter: implementation violates contract → fix implementation; test
  mistranslates a clause → fix test *citing the clause*. Produces verdicts;
  fixes nothing. An instance of the **verifier/adversary** family (its reference:
  the contract text; its arbiter verdict is downstream-backstopped by the
  test↔contract parity fence and the discriminator).
- **Grill-adversary** — a fresh-context agent that hunts the forks the draft
  intention leaves open; each pass returns the **independent batch at the draft's
  highest open altitude tier** (*approach* forks — which can restructure the
  design — before *detail* forks), or (when a genuine attack survives) clears the
  draft. Batching + altitude ordering cut the number of grill→answer→re-grill
  rounds; the adversarial stop is unchanged. An instance of the
  **verifier/adversary** family (its reference: draft coherence against vision +
  slice spec).
- **Progress verdict** — the checkpoint artifact: what was tried, what binds,
  current hypothesis. Emitted when a budget is exhausted.
- **Effort budget** — a harness-counted cap (attempts/turns/tool-calls) that
  forces a checkpoint on exhaustion. The agent does not get a vote.
- **Checkpoint** — the forced halt at budget exhaustion: emit a progress
  verdict, return to the orchestrator.
- **Blast-radius fence** — the hard block on edits outside a work order's
  declared locus. The implementer requests scope expansion (a cheap, logged
  message) rather than sneaking. Calibration: *asking must be cheaper than
  sneaking.*
- **Sanity invariants** — the project's written standing taboos (no
  test-conditioned branching, no sleeps as synchronization, no swallowed errors,
  no global mutable state, …). Lintable subset → hooks; the rest → auditor
  checklist. An insane solution is insane *relative to stated norms*.
- **Resource lexicon** — declarable runtime resources (ports, databases, named
  singletons, "the interactive desktop"). A shared claim is a serialization
  point, exactly like an overlapping file locus.
- **Journal** — the execution state of record (the methodology's program
  counter): current vertical slice; the lane registry (in-flight lanes with
  worktree paths, commits); the program-counter pointers; the approval inbox. It
  does **not** store a per-work-order status — a work order's status is a **fold of
  the ledger** (`lib/wo-status.mjs`: `pending / running / blocked / dropped / done`),
  the source of truth. **Single serialized scribe: `journal-writer` (D3b).**
- **Reconciliation** — session-start verify-and-downgrade of the journal against
  ground truth (git + tests + ledger). Conservatively downgrade anything
  unverifiable; recompute the DAG (derived, can't be stale).
- **Briefing** — the human-facing summary reconciliation emits: current vertical slice,
  lanes, burndown, inbox items awaiting the human.
- **`nextAction` / directive** — the deterministic **decision projection** (Layer 2): an ordered **SET**
  of directives (`{kind, slice?, workOrders?, workOrder?, detail?}`, `kind` ∈ `HALT | AMBIGUOUS | DECIDE
  | RUNNING | DISPATCH | RETRO | OPEN | LAND | CONCLUDE | DONE`) `lib/next-action.mjs`'s pure
  `projectDirectives` computes from reconcile's own reconstructed state — never a scalar "the next
  step," because several directives can hold true at once (work running, separately-ready work
  dispatchable, a wall needing a decision). Refined by an **output self-check**
  (`selfCheckDirectives`) — the verification trio applied to the projection itself — which downgrades a
  `DISPATCH`/`RUNNING` the redispatch guard would block, an `OPEN` of a retired slice, or a `LAND` over
  a non-empty frontier to a `DECIDE`. Persisted as one `next-action` ledger event per `reconcile()` call
  and re-derived, latest-wins, into `progress.json.nextAction` + the mirror's `▶ NEXT` block on every
  regen — so it survives a wholesale mirror rebuild by construction, carrying a mechanical **staleness**
  suffix (`fresh` / `<K> event(s) since`).
- **Approval inbox** — queued human decisions (vision-amendment requests,
  skeptic-confirmed dead ends, topology smells, second budget extensions).
  Footprint-scoped freezes. **Silence never consents** — a human gate is never
  passed by timeout or absence.
- **Supervision profile** — the strict / standard / trusting dial; the finer
  control nested inside gated mode (the run mode decides *whether* the human is
  waited on; the profile decides *how often*, for between-gate judgment
  approvals). The **initial** profile is set by the entry skill (gated→strict,
  autonomous→trusting); lower-level phases never override it; the retro
  tunes it thereafter. No profile ever waives a mechanical check. A config
  artifact (`supervision.json`). Control-plane/data-plane: the human is the
  control plane (vision, route, amendments, dial); agents are the data plane
  (everything between gates).
- **Tier** — the `full` (default) / `lite` ceremony-depth axis, orthogonal to run
  mode. An effort default in `config.json` (fence-protected), per-slice overridable
  in `route.md` (effective tier `slice.tier ?? config.tier`, raise-only for agents;
  absent defaults to `full`). `lite` is the low-floor audit collapse made
  user-selectable — the vertical-slice audit drops only the iterative
  mutation-sample; it waives **no** guard and thins nothing else. The run mode
  decides *whether* the human is waited on; the profile, *how often*; the tier, *how
  deep* each slice's verification runs.
- **Effort** — one engagement of the methodology on a project, analysis →
  completion. Lives in `.reasonable/` — at the target project root (one effort),
  or nested at `.reasonable-efforts/<name>/.reasonable/` when several efforts
  share one repo. Its **birth signature** (`config.effort`, a non-empty name
  stamped once at birth) is what `effortBirthState` reads to tell a real,
  born effort apart from a stray or pre-birth directory.
- **Effort artifacts** — the durable document set of an effort (see
  `docs/artifacts.md`).
- **Effort discovery** — `resolveActiveEffort(cwd)`, the additive SessionStart
  wrapper (up-walk, then a down-scan of every born nested effort) that resolves
  `{kind: resolved | none | multiple, ...}`. `multiple` is the normal shape for
  parallel efforts, not an error. Does not replace the pre-existing up-walk the
  fence and CLIs use.
- **Lifecycle** — the born-effort state reconcile classifies: `active` (open
  work remains), `at-land-gate` (frontier empty, not yet landed to base),
  `half-concluded` (landed to base, still live). Dir-name states (concluded,
  abandoned, stray) are effort discovery's job, not reconcile's.
- **`reasonable:conclude` / `reasonable:abandon`** — the two ways an effort's
  bookkeeping is torn down, symmetric twins (`lib/conclude.mjs` /
  `lib/abandon.mjs`): a final ledger event (`concluded` / `abandoned`), then
  `.reasonable/` renamed aside (never deleted) to `.reasonable.done-<effort>/` /
  `.reasonable.abandoned-<effort>/`. `conclude` closes an effort that
  **finished**; `abandon` closes one the operator is **walking away from**.
  Either releases the blast-radius fence and drops the effort out of discovery;
  archival keeps the ledger/decisions/vision auditable and is reversible
  (rename back). The commit iron rule still binds: both HALT rather than
  archive over uncommitted in-scope work.
- **Lane** — one work order in flight in its own git worktree. Agent territory;
  the human never works in a lane. Identified on disk by a `.reasonable-lane.json`
  descriptor at the worktree root — this is what the fence reads to bind the law
  to the governed.
- **Effort branch** — the dedicated **integration branch** (`effort/<name>`,
  `config.effortBranch`) reasonable maintains for an effort: created off the base
  branch at effort start and checked out in the main checkout for the effort's
  duration. **Every lane is cut from it** (explicit base, never a bare HEAD) and
  **every green lane auto-merges back into it** at the slice gate (`--no-ff`,
  logged, no escalation), so a slice that depends on earlier slices is always cut
  from a base that already contains them. The *one default integration resolution*,
  applied every slice. Null on an effort predating branch hygiene (lanes then cut
  from bare HEAD).
- **Base branch** — the ref an effort started from (`config.baseBranch`, e.g.
  `master`). **Written exactly once**, at effort end, by the single
  `effortBranch → baseBranch` merge — the natural human review gate (gated blocks;
  autonomous logs / leaves it as the one deliberate landing). Untouched for the
  whole effort; per-slice hygiene never reaches it.
- **Build-on-stale** — a lane cut from the wrong base (e.g. the base branch, or a
  HEAD missing an earlier green slice) instead of the effort branch, so it builds
  on stale code. Reconcile **surfaces** it (a live lane that does not descend from
  the effort branch) as an inconsistency to re-base — never a halt (the work is
  intact in git), and never a silent integration of stale code.

---

## Vocabulary the methodology deliberately rejects

These were evaluated and rejected; do not reintroduce them:

- A **special noun** for incomplete components (armature / blockout / rough-in /
  instar / baseline / prototype / milestone). A term naming a *phase of life*
  multiplies rules; states share them. "Prototype" specifically teaches
  disposability — the rewrite instinct the enrichment pipeline exists to prevent.
- **"Crystallization"** as an event that grants a component its tests. Contract
  tests exist from birth; "crystallized" merely describes a contract that
  stopped churning.
- **Big-bang RED** (a full scenario suite failing for weeks by design). Red is
  never an expected runtime state; future gates are *parked*, not failing.
- **Tests-as-immutable** (classic TDD letter) — replaced by the ratchet.
- **Hand-declared task DAGs** — replaced by computed footprints; declared edges
  survive only as overrides.
