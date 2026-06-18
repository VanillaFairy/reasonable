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
- **Clause** — one numbered must in a contract (`§N`). The unit of citation, the
  unit of enrichment, the unit a test assertion maps to.
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
  vertical slice with logged rationale**. Human-editable file; human-ratified at retro.
- **Retro** — the mandatory blocking heartbeat at every vertical slice gate. Runs a
  **three-way divergence classification**: every divergence between built and
  vision gets exactly one of (a) **fix the code**, (b) **amend the vision**
  (human-approved), (c) **record a deliberate deferral**. The poison is the
  *unclassified* divergence.
- **Ledger** — append-only record of enrichments, amendments, verdicts, scope
  expansions, budget extensions. The methodology's audit log.
- **Work order** — one atomic dispatch: named artifact inputs, an artifact
  output, a gate, a **locus**, **resource claims**, a **budget**.
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
- **Skeptic** — a fresh-context agent that tries to *refute* an infeasibility
  claim ("find a way, or confirm the wall is real"). Only refutation-surviving
  verdicts bind.
- **Auditor** — verifies *success* claims (discriminator / bidirectional mapping
  / mutation / proportionality). Symmetry: one auditor refutes "it works,"
  another (the skeptic) refutes "it can't work."
- **Adjudicator** — read-only agent that judges each red test with the contract
  text as arbiter: implementation violates contract → fix implementation; test
  mistranslates a clause → fix test *citing the clause*. Produces verdicts;
  fixes nothing.
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
  counter): current vertical slice; work-order statuses
  (`pending / dispatched / checkpointed / merged / dead-end`); in-flight lanes
  with worktree paths; the approval inbox. **Single writer: the orchestrator.**
- **Reconciliation** — session-start verify-and-downgrade of the journal against
  ground truth (git + tests + ledger). Conservatively downgrade anything
  unverifiable; recompute the DAG (derived, can't be stale).
- **Briefing** — the human-facing summary reconciliation emits: current vertical slice,
  lanes, burndown, inbox items awaiting the human.
- **Approval inbox** — queued human decisions (vision-amendment requests,
  skeptic-confirmed dead ends, topology smells, second budget extensions).
  Footprint-scoped freezes. **Silence never consents** — a human gate is never
  passed by timeout or absence.
- **Supervision profile** — the strict / standard / trusting dial; the finer
  control nested inside gated mode (the run mode decides *whether* the human is
  waited on; the profile decides *how often*, for between-gate judgment
  approvals). The **initial** profile is set by the entry skill (`run`→strict,
  `run-autonomously`→trusting); lower-level phases never override it; the retro
  tunes it thereafter. No profile ever waives a mechanical check. A config
  artifact (`supervision.json`). Control-plane/data-plane: the human is the
  control plane (vision, route, amendments, dial); agents are the data plane
  (everything between gates).
- **Effort** — one engagement of the methodology on a project, analysis →
  completion.
- **Effort artifacts** — the durable document set of an effort (see
  `docs/artifacts.md`).
- **Lane** — one work order in flight in its own git worktree. Agent territory;
  the human never works in a lane. Identified on disk by a `.reasonable-lane.json`
  descriptor at the worktree root — this is what the fence reads to bind the law
  to the governed.

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
