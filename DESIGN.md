# Reasonable — Design Document

**Status:** Built — v0.1.0. This is the living design reference, kept in step with the plugin as it stands.
**Design date:** 2026-06-12 · **Last reconciled with build:** 2026-06-15
**Origin:** A full-day grilling session (grill-me protocol) between VanillaFairy and Claude, walking the complete decision tree of a new development methodology and the plugin that enforces it. Every ruling below was explicitly debated and accepted; rejected alternatives are recorded in §9 because the *reasons* are as load-bearing as the decisions.
**Audience:** Anyone extending or auditing the plugin. This document is the single source of truth for *why* `reasonable` is shaped the way it is; the normative vocabulary lives in `docs/glossary.md` and the on-disk artifact formats in `docs/artifacts.md`. Where this document and the build disagree, one of them is wrong — reconcile, never ignore.

---

## 0. What this document is

This is the design for **`reasonable`** — a Claude Code plugin (sibling of `vf-superpowers` in the `vanillafairy` marketplace at `c:\work\claude\vanillafairy\`) that enforces an outside-in, contract-governed, adversarially verified development methodology for agentic (LLM-driven) software work. The plugin is built (v0.1.0); this document is kept in step with it.

It is deliberately rich: it contains not just the rulings but the reasoning chains, the rejected alternatives, the failure modes each mechanism guards against, and the vocabulary. It began as the founding brief a fresh session built the plugin from; it now serves as the standing design reference. Two companion documents carry the load-bearing detail and are the canonical copies of what they cover: `docs/glossary.md` (normative vocabulary) and `docs/artifacts.md` (on-disk artifact formats).

§6 maps this design onto the actual plugin layout; §12 records how the build went and what remains.

---

## 1. The name

**reasonable** — because it is. The methodology's essence in one motto: *every claim reasoned, every reason checked.*

When docs need a family label for the methodology itself, use: **outside-in, contract-governed, adversarially verified development**. "Outside-in" is borrowed deliberately from the London-school/GOOS lineage (§3) — it is accurate, unencumbered, and sends newcomers to the right prior art. Do **not** brand the methodology "Cleanroom" (connotes formal verification and statistical testing we don't do) or "Design by Contract" (an Eiffel Software term meaning runtime assertions).

---

## 2. Motivation: the disease this cures

The current state of the art (superpowers-style flows) runs: analyze → architect → spec every component → implement each component with per-component red/green TDD → assemble. This is **bottom-up development in disguise**. A high-level plan exists, but construction starts with low-level bricks assembled later. Two failure modes follow:

1. **Integration discovered too late.** Testability exists per-brick but not across bricks. When integration tests finally run, revealed seam errors require changes to many already-"finished" components. The hardest errors live in the *wiring*, and bottom-up exercises the wiring last.
2. **Tests pin bricks too early.** Per-component test suites freeze component APIs at the moment of *least* knowledge — before any integration has validated the decomposition. The plan's component specs are predictions; the tests turn predictions into commitments.

The cure is **not** a more detailed upfront plan (prediction is the failing strategy; more of it fails harder). The cure is inverting the build direction and letting component shapes *emerge from development history* — while replacing the trust-based disciplines of classic agile with machine-enforced ones, because the practitioners are LLMs:

- Agile rituals assume human discipline and shared memory. **Agents have neither.** Every ritual must be reified into an artifact (a durable file) or a gate (an executable check).
- Agents under pressure rationalize. Every rule that can be enforced by capability (tool allowlists, hooks, path fences) must be, because **prompted rules die under pressure; capability rules cannot be rationalized away.**

> The two meta-principles that every single ruling below instantiates:
> **(1) Feedback beats prediction.** **(2) Capability beats discipline.**

---

## 3. Intellectual ancestry — and what is genuinely new

The methodology braids five established lineages. Keep this table in the plugin's docs; each citation is a free long-form manual.

| Pillar | Established name | Source |
|---|---|---|
| Walking skeleton + double-loop TDD | Outside-In TDD / London School | Freeman & Pryce, *Growing Object-Oriented Software, Guided by Tests* (GOOS); "walking skeleton" coined by Alistair Cockburn |
| Characterization tests + seams (brownfield contract genesis) | *Working Effectively with Legacy Code* | Michael Feathers 2004 |
| User-visible scenario gates; parked suite as executable vision | BDD / Specification by Example / living documentation | Dan North; Gojko Adzic |
| Vertical slices ordered by risk | Tracer bullets; story slicing | Hunt & Thomas, *The Pragmatic Programmer*; XP |
| Contracts, parity, must-lists | Design by Contract (spec-artifact flavor, not runtime assertions) | Bertrand Meyer |
| Provider-owned clauses + consumer citations | Consumer-Driven Contracts (inverted) | Ian Robinson 2006; Pact |
| Depth growth by enrichment | Stepwise refinement | Wirth 1971 |
| Spikes, retros | XP | Kent Beck |
| Separated roles; independent verification | Cleanroom Software Engineering | Harlan Mills, IBM |
| Crash-only state management | Crash-only software | Candea & Fox 2003 |
| Expand/contract change propagation | Parallel-change DB migration pattern | folklore, well documented |

**Genuinely new (the plugin's actual contribution):** the agentic enforcement layer. Capability-enforced process (allowlists/hooks instead of discipline), the adversarial agent pipeline (blind test-writer / adjudicator / skeptic / auditor as separated powers), computed-footprint DAG scheduling, crash-only orchestration with a supervision dial. Every borrowed practice originally ran on *team culture*; `reasonable` replaces culture with mechanism — hooks for norms, allowlists for trust, journals for memory. That substitution is the working definition of "agentic methodology."

---

## 4. The Three Laws

Everything in §5 is one of these three, applied at a particular scale. They are the compression test for any future extension: a proposed rule that isn't one of these three is probably wrong.

1. **Parity** — claims match reality exactly. Code matches contract (no more, no less). Tests match contracts 1:1. Journal matches git. Provenance matches custody. Verdicts match evidence.
2. **One-way membranes** — value crosses boundaries only in sanctioned form. Spike knowledge crosses as artifacts, never code. Contract changes cross as enrichments (free) or amendments (ceremonial). Approvals cross as explicit human acts, never timeouts. Ripples cross as manifests.
3. **External verification** — no actor grades its own work. Tests are written blind to implementations. Verdicts come from read-only adjudicators. Infeasibility claims face skeptics. Success claims face auditors. State claims face reconciliation.

---

## 5. The methodology

### 5.1 Walking skeleton and staged gates

- The first milestone of any effort is a **walking skeleton**: a minimal end-to-end vertical slice with *real wiring* and trivial behavior. Edges (seams) become real on day one; nodes (behavior) stay thin. *Edges before nodes* — the hardest integration errors live in the wiring, so wire first, behave later.
- Development proceeds as **stages**, each formalized in two places: a spec, and a **gate** — an executable test that is RED when the stage opens and GREEN when it closes (the outer loop of GOOS's double loop).
- **The suite is green at every commit.** "Expected red" does not exist as a runtime state. Future gates are **parked** (ignore-marked, §5.3), not failing.
- A stage that truly cannot have an automated gate (e.g., "the animation feels smooth") must name its *manual verification procedure* in the spec — a justified exception, never a default. "We may or may not have a test" is the hole through which agents ship vapor.
- An effort **concludes** symmetrically: when the route empties, the retro integrates the branch and then *tears down its own bookkeeping* — `lib/conclude.mjs` archives `.reasonable/` aside to `.reasonable.done-<effort>/`. This is not cosmetic. The blast-radius fence (§6.5) keys on the *presence* of `.reasonable/`, not on whether the effort is still live, so an effort that finishes but never concludes leaves the whole repo fenced against all subsequent work — the next effort cannot even scaffold. Capability rules (§4) cure the policing problem, but a capability that never *releases* becomes its own trap; the walking skeleton opens an effort, conclusion closes it. Archival (not deletion) keeps the ledger auditable and is reversible by renaming back.

### 5.2 Vertical slices and traversal theory

Model the system as a graph: root = entry point/top-level scenario, interior nodes = subsystems, leaves = components touching reality. A development paradigm is a *traversal order*, and a traversal order is a *schedule for retiring edge risk*:

| Traversal | Paradigm | Where integration risk dies |
|---|---|---|
| Post-order (children first) | Bottom-up TDD (the disease) | At the root, last |
| BFS (level by level) | Horizontal layering | At the leaves, last |
| DFS probe (root→leaf path) | One vertical slice / tracer bullet | Along that path, immediately |
| IDDFS (re-walk deeper each pass) | Breadth pass keeping system runnable | Continuously, breadth-wise |
| Best-first (expand by heuristic) | Risk-ordered vertical-slice selection | Where the heuristic sends you |

**Rulings:**
- The default unit of work is the **vertical slice**: a user-visible scenario driven to GREEN end-to-end, touching whatever components it needs. Vertical slices are ordered **best-first by integration risk / expected information gain** — where uncertainty is highest, because what you learn reprices the rest of the route.
- Occasional **breadth passes** (IDDFS-flavored) handle cross-cutting concerns (threading model, error propagation, logging). Their gate: all promoted scenarios still green + new invariant tests.
- BFS (complete a layer in isolation) and post-order (build bricks, assemble later) are **banned as primary strategies**. Horizontal descent recreates the disease one level down: you build layer N against stubs of layer N+1 and discover the seam is wrong only when N+1 becomes real.
- Frontier discipline: DFS keeps the open-stub frontier to one path's worth; wide frontiers are unverified promises accruing interest.
- Litmus test: if a stage's completion can't be demoed to a non-engineer, it's probably a horizontal stage in disguise.

### 5.3 Test lifecycle: parking, promotion, just-in-time

- **Top-level scenario tests** (phrased purely in user-visible terms; stable regardless of internals) are written at scaffold time and **parked**: ignore-marked with a reason string (Rust: `#[ignore = "pending: vertical slice 4, panel IPC"]`). Parked tests must still **compile** (or import-check) — they pin the outermost contracts, so topology drift surfaces immediately rather than at promotion.
- **Stage/vertical-slice gates are written just-in-time** when their stage opens, informed by everything the descent has taught. Pre-writing deep-stage tests would pin internal seams exactly when they should stay fluid — the disease re-imported.
- **Promotion** (removing the ignore marker) is the formal act of opening a stage; GREEN is the formal act of closing it. The parked count is the burndown, queryable mechanically.
- Why parking matters for agents specifically: a suite where red is sometimes expected trains agents to *explain away* failures — the exact reflex you never want reinforced. With parking, the invariant "everything unparked is green" holds at every commit, so any red is *always* a regression.

### 5.4 Components and contracts

**Terminology ruling (hard-won, see §9):** there is **no special noun** for a deliberately incomplete component. The glossary entry does all the work:

> **Component** — a dynamically implemented entity: at any moment its implementation exactly matches its current contract (**contract parity**), and its depth grows by enrichment. There is no "finished" kind of component, only components whose contracts have stopped growing.

- **Contract** = the component's current must-list; its only definition of done. Examples of stage-appropriate musts, from the originating discussion: UI — buttons exist as objects with specified parent, geometry, text, distinguishable from background (not wired, not polished); gamedev — mobs are cubes that spawn, follow basic movement, are killable (no models, no animations); API — endpoints exist, route, and return the defined status codes (no processing, no error handling).
- **Contract parity** (the core invariant): *within contract = real; beyond contract = absent or loud; nothing in between.* A bare-200 endpoint is not a lie if the gate asserts exactly "endpoint exists, routes, returns 200." Dishonesty enters only when behavior silently exceeds or simulates the spec.
- **Derivation is split by cost asymmetry:**
  - *Topology* (where the entity lives, its name, owner, relationships) is derived **subtractively from the vision** — structure is cheap to predict and expensive to move.
  - *Behavior* is accumulated **additively from gates** — every behavioral must enters the contract only when a vertical-slice gate demands it. No behavioral musts from the vision document, ever.
  - *Behavior, in brownfield,* is **characterized** — the `characterizer` pins current behavior of legacy code on a vertical slice's path as a baseline clause marked `provenance: characterized` (untrusted), **after** the implementer declares its `behaviorDelta`, scoped to the work-order locus (the Feathers seam). Born GREEN-by-observation — the dual of behavior-additive's born-RED-at-a-gate — it becomes a trusted governing clause only once a vertical slice exercises it and it earns teeth (the per-test reverse discriminator + mapping). See architecture §18.
  - Minimality is gate-defined and agent-checkable: a component is correctly sized when (a) the vertical-slice gate passes and (b) removing any behavior would fail the gate or violate a named topological invariant. Every public member must be justifiable by pointing at a gate assertion or invariant. This is YAGNI as a mechanical check — over-building is the most common agent failure under vague specs.
- **Materials rule:**
  - On the active vertical-slice path: **thin-real only** — genuine, minimal implementations. A node that fakes its output un-verifies every edge through it.
  - Off-path: **loud stubs** (`todo!("vertical slice 4: settings persistence")`-equivalents). Never canned data — plausible fake values are landmines someone will traverse and trust. Loud stubs are unfakeable (they panic/throw), self-documenting, and greppable as a second burndown. In compiled languages the panic IS the lint.
  - **Fakes are legal in exactly one place:** behind a trait/interface seam, used by tests, never reachable from the production composition root. Visibility ≠ wiring: a fake exported `pub` from a production crate (necessary for cross-crate test use in Rust) is fine; a fake wired into `main`'s object graph is not. Word this precisely in the plugin — an agent reading "no fakes in production" might try to `#[cfg(test)]`-gate a fake and break downstream test compilation.
  - Since loud stubs panic, a scenario gate physically cannot pass while one remains on-path — the material enforces the process.
- **Contract tests exist from the component's birth**, assert exactly the current must-list (RED at stage open, GREEN at close), and are **provisional by design** — snapshots of current contract depth, not final specifications. The inner red-green loop survives: every new must enters as a RED assertion first. "Crystallization" is not an event that grants tests; it is merely the description of a component whose contract has stopped churning.
- **Informal language clause:** words like "prototype," "stub," "skeleton" in prose carry **no normative force** — no rule, hook, or constitution may reference them, and they grant no exemption from contract parity. Normative documents stick to glossary vocabulary; human prose can breathe.

### 5.5 Vision and route: drift control

Without a held big picture, vertical slices drift — emergent design degenerates into accretion, and local errors compound multiplicatively along the traversal. The cure is not more upfront detail; it is splitting two objects with different change cadences:

- **Vision** (the north star): formalized, *grilled* user stories; the topology sketch; quality attributes. Coarse, stable, expensive to change. In traversal vocabulary: the goal predicate and the heuristic. **Vision amendments are human-gated, always, individually.**
- **Route** (the vertical-slice frontier): the ordered backlog of vertical slices and current contracts. Detailed, volatile, **re-sorted freely by the agent after every vertical slice with logged rationale**. The frontier re-sorts on every expansion; the goal never silently changes.

Mechanisms:
- The **parked scenario suite is the vision's executable core** — the machine-checkable fragment that cannot rot (it must compile).
- **Retro after every vertical slice** runs a **three-way divergence classification**. Every divergence between what-was-built and the vision gets exactly one of: **(a) fix the code** (drift was error — correct now, while dependents are few), **(b) amend the vision** (drift was learning — formal, logged, human-approved re-vision event), **(c) record a deliberate deferral**. The poison is the *unclassified* divergence; the procedure makes that impossible.
- **Amendment authority split:** route re-sorting — agent, autonomous, logged. Contract amendments — agent proposes at retro, human approves in batch. Vision amendments — human-gated, always.
- Breadth passes are the reconciliation points where accumulated cross-vertical-slice inconsistencies get re-squared (dead-reckoning needs star fixes).
- Agent context windows are ephemeral; the vision must be a named durable artifact loaded at every vertical-slice session start.

### 5.6 The enrichment pipeline

How a component's contract grows when implementation teaches. The naive pipeline (implement → update contract → update tests → make green → audit) contains **three rot vectors**; the corrected pipeline closes them:

1. **Enrichment task done** (implementation work in a lane).
2. **Implementer enriches the contract** — adds the newly learned musts. The *contract diff* is logged to the ledger for retro review. (Rot vector 3 guard: the contract was written by the implementer fresh from the code, so the **retro reviews contract diffs against vertical-slice spec and vision** — the top edge. A sycophantic contract would pass any tests-vs-contract audit with honors; only intent-level review catches it.)
3. **Blind test-writer** — a *fresh-context* agent that receives the old and new contract text **only** — never the implementation diff — translates the contract delta into test changes. It does not run the tests (no Bash in its allowlist); it formalizes expectations blind. (Rot vector 1 guard: tests written while looking at code assert what the code *does*, not what the contract *says*. Don't audit the disease in later — don't create it. "Separate agent" means fresh context, not the same conversation wearing a different hat.)
4. **Adjudication fork** — run the tests; every red is judged with **the contract text as arbiter**: implementation violates contract → fix implementation (test untouched); test demonstrably mistranslates a clause → fix test, *citing the clause*. (Rot vector 2 guard: "iterate on the tests until green" makes test-editing the default resolution of every red — the ratchet violation formalized into procedure. Green-ness is never the goal state of test-editing.) The adjudicator is **read-only**: it produces verdicts and fixes nothing — separating the power to judge from the power to act.
5. **Audit** — mechanical teeth, in escalating cost order:
   - **(a) Discriminator check** — every new/changed test must *fail* on the pre-task commit (run in a worktree at `HEAD~`). A test passing on both old and new implementations verifies nothing. This is the test-after world's reconstruction of "watch it fail first": a test proves something only if there exists a state of the world it rejects. Fully automatic; run per enrichment.
   - **(b) Bidirectional mapping** — every new assertion cites a contract clause; every new clause has at least one assertion. Catches invented tests and untested promises.
   - **(c) Mutation sampling** — mutate the implementation k times; surviving mutants expose vacuous tests. Most expensive; run at vertical-slice gates, not per task.
   - **(d) Reverse discriminator** *(brownfield characterization clauses only)* — a clause born GREEN by characterization has no `HEAD~` at which it was RED, so admission instead mutates the cited clause locus at HEAD, **overlays and runs only that one characterization test**, and requires RED. Per-test teeth, the dual of (a). It does **not** use mutation sampling, which runs the whole suite and cannot attribute a kill to one test. See architecture §18.

**Brownfield enrichment** from a characterized baseline has three ceremonial-distinct moves: *promote-to-grown* (a gate now demands the behavior — the clause sheds `characterized`, gains a Gate line, runs the normal pipeline), *amend-characterized* (an **undeclared** change to legacy behavior — human-gated, like a weakening), and *supersede-planned* (an amend the implementer **declared** up front via `behaviorDelta` — advisory-batched). The two-oracle collision (a new grown test contradicting a characterized floor pin) is classified mechanically: a floor break that a declared `behaviorDelta` plus a new governing grown test explain is a *planned supersession*, not a regression. See architecture §18.

**The ratchet (test/contract governance):**
- Contracts may be **strengthened freely** (additive — the paradigm working). Contracts may be **weakened only via a ledger-logged amendment** approved at retro (rare, deliberate, ceremonial). Make the rare thing ceremonial and the common thing impossible.
- **Tests track contracts 1:1.** Any test diff must reference a contract diff in the same change — *enforceable by a dumb structural CI hook plus ledger lookup, no semantics needed*. Test edits without a contract delta are violations.
- **Retros govern contracts and never touch tests.** Tests are derived artifacts.
- Derivation direction is the deep rule: you cannot audit an artifact against the thing it was derived from — derivation makes agreement tautological. Every artifact derives from the layer *above* and is checked against the layer *below*.

**Residual rot, stated honestly:** a blind test-writer can still write weak assertions (mitigated by discriminator + mutation, not eliminated); mutation sampling is sampling; vague contract language passes vagueness through — the retro's human eyes on contract diffs is the one non-automatable link.

### 5.7 Spikes (and POCs)

Spikes are **aligned in process, extraterritorial in code** — first-class route items whose deliverable is information.

| | Vertical slice | Spike |
|---|---|---|
| Gate | scenario test GREEN | a falsifiable question answered *with evidence* |
| Deliverable | code under contract parity | knowledge artifact |
| Code rules | full law | **law-free zone** — no contracts, parity, audits |
| Failure | gate stays RED | timebox expires with **no verdict** ("no" is success!) |

- **Knowledge artifact format (mandatory):** question / method / evidence / verdict / confidence / **expiry note** (what versions/conditions it tested against — spike conclusions rot).
- **Three spawn points:** Analysis (feasibility unknowns blocking the vision); route planning/retro (frontier un-orderable because uncertainty dominates); **mid-vertical-slice escalation** (implementer hits a blocking unknown → escalates → orchestrator spawns a spike; never explore in-vertical-slice — that's how exploration debris lands in production paths).
- **Three leak channels, three guards:**
  1. Code leak → re-entry only through the pipeline; the spike-runner agent is *path-fenced to the quarantine workspace by hook* — it cannot write to mainline.
  2. Conclusion leak (knowledge laundering) → the evidence-formatted artifact; findings enter the vision only through the retro.
  3. Anchoring leak → **the vertical-slice implementer never reads spike code**; it reads the knowledge artifact, which may *quote curated excerpts* (the exact API incantation that worked is evidence; the spike author curates evidence vs accident). **Re-entry is rewrite-from-knowledge, never refactor-from-spike** — upgrading quarantined code in place is the canonical mechanism by which POCs become production.
- **Skeleton-vs-spike rule:** proving the end-to-end viability of the *chosen* direction is not a spike — that's the walking skeleton, and it ships. Spikes are for *competing* directions and narrow falsifiable unknowns. One direction → skeleton (kept); N directions or a yes/no → spike (discarded).
- Vertical slice/spike is exploration/exploitation: spikes buy information, vertical slices spend it. Zero spikes = overfit to initial estimates; constant spiking = never ship. The retro renegotiates the exchange rate.

### 5.8 Dead ends and the escalation ladder

What happens when implementing X within the strict requirements is infeasible.

- **A dead end is a retroactive spike.** The failed attempt answered an unscheduled question ("is X feasible under these constraints?"). Reclassify: knowledge artifact harvested (same format), code dies on its branch, verdict enters the ledger.
- **Branch discipline (prerequisite made explicit):** vertical-slice work happens on branches; **gate-GREEN is the merge condition**. Dead-end code never touches mainline by construction.
- **False failure gets the same adversarial treatment as false success.** Agents claim infeasibility dishonestly — "can't be done" frequently means "my approach didn't work and I'm out of budget." An unaudited infeasibility verdict amputates a feasible subtree. So: infeasibility claims must meet an **evidence standard** — enumerate the approaches attempted, name the **binding constraint** (the specific requirement that cannot be met and why), ideally a minimal reproduction of the blocker — and then a **fresh-context skeptic** gets a timebox to refute ("find a way, or confirm the wall is real"). Only refutation-surviving verdicts bind. Symmetry: one auditor refutes "it works," another refutes "it can't work."
- **Escalation ladder** — the verdict's binding constraint determines backtrack distance; every level already has its amendment mechanism:

| Binding constraint lives in… | Resolution |
|---|---|
| the work order (mis-specified) | orchestrator reissues — no ceremony |
| one contract clause | ratchet weakening: ledger amendment at retro |
| two contracts jointly / a seam | topology issue → route planner, possibly breadth pass |
| the vertical-slice gate | vertical-slice respec; gate amended via ledger |
| the vision | vision amendment — human-gated, always |

- The route planner **re-prices sibling nodes** after a confirmed dead end (infeasibility is correlated across a neighborhood).
- **Insanity guard:** the ledger records refutation-surviving verdicts keyed by work order; a hook **blocks re-dispatch of an identical work order unless an input changed** (contract amended, topology revised, new spike knowledge — verdict expiry notes are what un-bind old verdicts when dependencies upgrade).
- Cost note: each confirmed dead end spends two agent budgets (attempt + skeptic). Acceptable insurance; optionally reserve the skeptic for verdicts that would trigger contract weakening or higher.
- The plan is falsifiable *by the implementation*: gates push verified code up; infeasibility evidence pushes spec amendments down; both flow through the same ledger.

### 5.9 Desperation control (the frantic-GREEN problem)

The complement of false failure: **undeclared failure** — an agent thrashing toward GREEN with increasingly insane solutions (special-casing test values, monkey-patches, scope sprawl) instead of declaring a wall. Agents thrash because each local step feels like progress; **self-detection is structurally unreliable, so every tripwire lives outside the agent**.

- **Ruling 1 — the unforeseen edge case is a jurisdiction question.** Under contract parity, an edge case the contract doesn't name is *out of contract*; silently satisfying it is **exceeding the contract** — a parity violation, unauthorized contract interpretation. Constitutional trigger: *the moment you find yourself handling a case the contract doesn't name, you are holding a contract question, not a coding task — halt and escalate* (adjudicator rules in/out-of-contract; or enrichment ceremony if genuinely new scope).
- **Ruling 2 — mechanical tripwires:**
  1. **Effort budgets** per work order (attempts/turns/tool-calls — denomination is build-phase). Exhaustion forces a **checkpoint**: halt, emit a progress verdict (what was tried, what binds, current hypothesis), return to orchestrator. A hook counts; the agent doesn't get a vote. Start budgets tight (checkpoints are cheap) and let retros loosen per work-order class with data.
  2. **Blast-radius fence** — the work order declares its expected locus; out-of-locus edits are **hard-blocked**; the implementer requests scope expansion from the orchestrator — a cheap, logged message. Calibration principle: *asking must be cheaper than sneaking.*
  3. **Churn-without-progress monitor** — failing-assertion count flat/rising while cumulative diff grows across attempts → thrash flag.
  - Plus auditor-side: **proportionality review** (small contract delta + huge winning diff = suspicious even when green) and test-value-keyed branching detection (mutation sampling catches hardcoded input→output pairs).
- **Ruling 3 — sanity invariants artifact.** "Reasonable" must be written down to be adjudicable: the project's standing taboos (no test-conditioned branching, no sleeps as synchronization, no swallowed errors, no global mutable state, …). Lintable subset → hooks; the rest → auditor checklist. An insane solution is insane *relative to stated norms*; state them and the adjudicator rules with citations instead of taste.
- **Ruling 4 — escalation protocol.** Checkpoint → progress verdict → orchestrator triage: extend budget once (logged; second extension needs retro-level approval) / re-spec / spawn spike / route contract question / open dead-end ceremony. The standard second move: **fresh-context retry** — re-dispatch the same work order to a *new* implementer carrying only the progress verdict, never the failed transcript (thrash lives in the transcript; sunk cost is context pollution). Statistics: attempts within one context are correlated; across contexts nearly independent — so **two independent budget exhaustions auto-promote to the dead-end ceremony** with stronger evidence than one agent's ten attempts.
- Economic principle uniting all of it: **make escalation cheaper than heroics.** Budgets give stopping a deadline, progress verdicts give it a dignified artifact, fresh retries give it a future. Desperation fills the vacuum when a process offers no honorable retreat.
- The trio, complete: false success ← auditor; false failure ← skeptic; undeclared failure ← budgets + fences. Same disease (claims diverging from reality), same cure shape (external evidence standards, never self-report).

### 5.10 Cross-contract ripple

When implementing X affects more than its parent component.

- **Ruling 1 — seams have one owner.** The *provider's* contract holds the clause; consumers **cite** it (`uses A §3`). Never duplicate seam descriptions across contracts (spec-level duplication = drift = the disease at the documentation layer). Payoffs: a hook verifies citations resolve; **the citation graph makes any change's ripple set computable by a script** — "which contracts must adjust" becomes a query, not a discovery. Cost accepted: a contract's reading context includes its cited closure (bounded, enumerable, still implementation-blind).
- **Ruling 2 — implementers never touch foreign contracts.** The fence stops them at their locus; the escalation artifact is a **ripple manifest**: which contracts, which clauses, and whether each change is an enrichment or an amendment.
- **Ruling 3 — ripple resolution is a topologically ordered sequence of single-contract pipeline runs**, not one transaction. Parity must hold at every commit for every component, so:
  - **Enrichments flow provider-first** (B gains capability through the full pipeline, then A builds on it).
  - **Amendments flow consumer-first** (every consumer stops relying, then the provider weakens; no citation ever dangles).
  - This is the expand/contract migration pattern, rediscovered — any system with providers, consumers, and a no-broken-states invariant lands here.
  - Each step is the ordinary §5.6 pipeline, sequenced by the orchestrator on the vertical-slice branch; the vertical-slice gate umbrellas the joint result before any merge.
  - **A cycle in the ripple (A needs B's change needs A's) is a topology smell** — a hidden shared concept wants extraction; escalate to retro.
- **Ruling 4 — extraction is a ripple with a birth in it.** When X reveals A, B, C share a concept: the new component is born first (contract + thin implementation through the pipeline), then existing contracts adjust to cite it (provider-first again). This is the "components crystallize from history" payoff arriving on schedule; the retro sees the birth in the ledger.

### 5.11 Parallel execution

- **Ruling 1 — the DAG is computed, not declared.** (Deliberate departure from vf-superpowers, where the plan author hand-declares task DAGs; hand-declared DAGs go stale.) Define a work order's **footprint** = declared locus ∪ citation closure of touched contracts. **Two work orders are independent iff their footprints are disjoint** — a set intersection, recomputed fresh at dispatch time, conservative by construction (over-approximation forfeits parallelism, never correctness). Declared edges remain legal as *overrides* only. Consequence for humans: you review footprints (loci, citations), and any rendered DAG in a plan document is a *view*, not a source of truth.
- **Ruling 2 — isolation by worktree, merge by topology, conflicts are evidence.** One git worktree per work order; merges back to the vertical-slice branch in §5.10's topological order. Since parallel lanes had provably disjoint footprints, **a merge conflict between them is a footprint bug** — an under-declared locus or missing citation. Log it; the scheduler's failures debug the spec layer.
- **Ruling 3 — parallelize within decisions, serialize across them.**
  - *Intra-vertical-slice:* aggressive. Work orders inside a vertical slice implement an already-made decision; adversarial fan-out (audits, skeptics, mutation) is read-only and embarrassingly parallel; pipeline stages overlap across contracts where dependencies permit.
  - *Inter-vertical-slice:* **parallelism spends feedback** — the paradigm's most valuable currency. Vertical slice N's gate reprices the route before N+1 commits; five concurrent vertical slices = four committed on pre-feedback estimates = bottom-up's prediction disease through the scheduler door. Cross-vertical-slice parallelism is **opt-in, footprint-gated, route-planner-judged** (learnings must be plausibly uncorrelated). Default: one vertical slice in flight.
- **Ruling 4 — events freeze by footprint intersection.** Ripple manifests, amendment requests, dead-end verdicts, checkpoints freeze only lanes whose footprints intersect the affected contracts; disjoint lanes run on. Confirmed dead ends re-price siblings before the next dispatch wave.
- The isomorphism to keep: work order = hermetic build rule, footprint = declared inputs/outputs, orchestrator = scheduler, worktree = sandbox. Forty years of build-system theory becomes importable the moment dependencies are declared data.

### 5.12 Control, resumability, supervision

Resumability and supervision are one question: **where does authoritative state live?** In artifacts, not agent context.

**Run mode is the outermost control axis — chosen only by the entry skill, never inferred.** An effort runs in exactly one of two modes, selected solely by *which* skill the user invokes:
- **`reasonable:run` — gated (the default).** Every human-ratification gate (analysis sign-off, scaffold sign-off, every vertical-slice retro) *blocks* and waits for explicit human approval. Silence never ratifies.
- **`reasonable:run-autonomously` — autonomous.** The same gates *self-ratify and are logged* (`type:"ratification"`, `approvedBy:"autonomous"`, with rationale); the system never blocks on the human. Autonomy means "do not wait for the human," **never** "skip a step": every phase step and every mechanical check still runs. One act stays human-gated even here — a **vision amendment** (a change to the user's stated goal) is queued to the inbox and surfaced, never silently self-approved. Autonomy decides the *how*; it never silently redefines the *what*.

The load-bearing guard: **mode is never selected from a standing or background directive.** "Act autonomously" / "KISS" / "be concise" in CLAUDE.md or earlier in the conversation does *not* enable autonomous mode and does *not* license skipping a step — only an explicit, contemporaneous invocation of the autonomous entry does. This is the one-sentence difference between *autonomous* (trustworthy) and *unsupervised*. The chosen mode is recorded in `.reasonable/config.json` and carried through every phase; `using-reasonable` is the shared reference both entries read first.

- **Crash-only execution: the session is a cache; the artifacts are the truth.** No graceful-shutdown path — recovery is the only path, therefore tested every session. Mechanisms:
  - **Execution journal** — the methodology's program counter: current vertical slice; work orders with statuses (`pending / dispatched / checkpointed / merged / dead-end`); in-flight lanes with worktree paths; the approval inbox. Updated by the orchestrator at every state transition. **Single writer per journal** (the orchestrator); lanes report via their own artifacts.
  - **Reconciliation at session start** — the journal is *intent*; ground truth is git + tests + ledger. Verify every claim against reality; **conservatively downgrade anything unverifiable** (journal says "dispatched," branch has no commits → "pending"); recompute the DAG (derived, can't be stale); emit a **briefing** (current vertical slice, lanes, burndown, inbox items awaiting the human); continue.
- **The retro is the mandatory blocking heartbeat.** The system always stops at a vertical-slice gate and runs the retro with the human: ratify/reorder the route, approve amendment batches, classify divergences, adjust budgets, turn the supervision dial. Between retros the system is autonomous *within the approved vertical slice*. The route is a file — the human may edit it any time; the orchestrator picks it up at the next dispatch wave. Analysis adds one-time ratifications: vision, topology, initial route, scaffold.
- **Approval inbox for interrupts** (vision-amendment requests, skeptic-confirmed dead ends, topology smells, second budget extensions): items queue; freezes are footprint-scoped; when *every* lane is blocked the system stops fully and presents the inbox. **Hard rule: no human gate may ever be passed by timeout or absence — silence means frozen, never approved.** This single sentence is what makes "autonomous" trustworthy.
- **Supervision dial** — the *finer* control nested inside gated mode. The run mode (above) decides *whether* the human is waited for at all; the dial decides, within gated mode, *how often* (for between-gate judgment approvals only — no setting ever waives a mechanical check). The **entry skill sets the initial profile** — `run` starts **strict**, `run-autonomously` starts **trusting** — lower-level phases never override it, and the retro tunes it thereafter (`supervision.json`). The settings: **strict** — every work-order batch and merge needs a nod; **standard** — retro-blocking + inbox interrupts, merges to the vertical-slice branch autonomous (gate-protected and revertible); **trusting** — amendment batches pre-approve unless flagged.
- Control-plane/data-plane summary: **the human is the control plane** (vision, route, amendments, dial); **agents are the data plane** (everything between gates).

### 5.13 Worktree mechanics

- **Orphan accounting in reconciliation:** worktree with no journal lane → harvest commits if they verify, else sweep and re-dispatch; journal lane with no worktree → downgrade to pending. Worktrees are cattle; journal+git is the registry; the registry is checked against the pasture every session start.
- **Resource footprints:** worktrees isolate *source trees only*. Work orders declare **resource claims** from a small project **resource lexicon** (ports, databases, named singletons, "the interactive desktop" — e.g., an app under test that installs a tray icon and a global mouse hook is a singleton claim). The scheduler treats a shared resource as a serialization point, exactly like an overlapping file locus. The lexicon lives beside the sanity-invariants artifact; same retro-time maintenance.
- **The human checkout is sacrosanct** — no agent ever works in it. Symmetrically, **lane worktrees are agent territory** — the human intervenes by canceling the lane via the inbox, then editing; never by committing into an in-flight worktree.
- Build-phase practicalities: per-stack binding tables must name the shared-build-cache strategy (Rust: `sccache` / shared `CARGO_TARGET_DIR` where safe — per-worktree cold builds are multi-GB brutal); CI mirroring of hooks.

### 5.14 The backward paths

The forward path (idea → merged code) is §5.1–5.13. Four backward paths, equally binding:

**(A) Post-merge defects.** A green-suite bug means one of exactly three things; triage routes it:
1. *Test gap* — behavior violates the contract, tests too weak → fix **starts with the ratchet's free direction**: the blind test-writer strengthens contract tests from a **bug-report artifact** (reproduction evidence; never the implementation), red confirms, then a normal work order fixes.
2. *Contract mis-states intent* → amendment ceremony, not a code fix.
3. *Contract silent* → enrichment/jurisdiction question (same as §5.9 Ruling 1).
Severity decides route position. **A hotfix is an expedited vertical slice — same pipeline, zero exemptions** ("urgent" is precisely when agents cut corners).

**(B) Provenance: distinguishing human edits from agent work — default-deny.** The workflow never recognizes *human* edits; it recognizes *its own* and classifies the rest as external:
1. *Structural:* agent commits are born only in registered worktrees on lane branches and reach shared branches only through orchestrator merges. First-parent history: orchestrator merge-commits are agentic; direct commits are human.
2. *Authoritative — journal commit accounting:* lanes report commit SHAs at checkpoint/completion; the orchestrator records every merge it performs. Reconciliation partitions all new commits into accounted/unaccounted. **Unaccounted = external input** (the human, a collaborator without the plugin, another tool — the workflow doesn't care which) → drift-checked against contracts → parity violations raise inbox items ("your edit exceeds `parser` §2: enrich the contract, or revert?"). The system never blocks the human; it refuses to let the artifact layer silently rot.
3. *Convenience, never truth:* agent commits carry `Work-Order: WO-123` trailers for readability — checked against the journal, not trusted (desperate agents can forge; human cherry-picks copy them). Cherry-pick semantics fall out of SHA accounting for free: new SHA = unaccounted = the human took custody = drift-checked. Correct.
- **Polarity (the design decision):** misclassifying agent work as human is harmless (extra scrutiny); misclassifying human work as agentic is silent rot (assumes contract sync that never happened). Nothing is ever presumed agentic; the journal must positively claim it.

**(C) Documentation orthogonality.** The plugin is **orthogonal to whatever documentation system a project follows** (KBs, INDEX.md conventions, wikis are the project's own business). At Analysis, survey the project's documentation practice and emit a **documentation-integration policy** as an effort artifact: how contracts relate to existing docs, who cites whom, what the drift rule is. Contracts are *complementary* to docs. The **recommended default policy** (not a mandate): contracts are the source of truth for *what a component promises*; docs keep rationale/gotchas/navigation and **cite** contract clauses rather than restating them (§5.10 citation discipline); a drift check covers the boundary. This is the binding-table pattern (§6.7) extended from languages to documentation systems: host conventions get adapters, not mandates.

**(D) The enforcement layer is outside the jurisdiction of the governed.** Plugin config, hook scripts, agent constitutions, supervision profiles, budgets, and the ledger are **permanently outside every work order's locus** — the fence blocks them categorically. They change only by the human or a dedicated human-approved meta work order. This is a *security* property and must hold adversarially: a desperate agent that can't satisfy a gate but can edit the gate's definition has an obvious move. Self-exempting enforcement isn't enforcement.

**(E) Non-functional requirements.** Vision quality attributes compile into executable gates or they will degrade monotonically across twenty green vertical slices: **quality clauses** in contracts where the budget is local ("decides within 5ms"); **system invariant tests** owned by breadth passes where the budget is global (startup time, memory ceiling). Both under the same ratchet. Benchmark flakiness is real: binding tables owe a measurement-harness entry (thresholds with headroom, fixed-load environments).

---

## 6. Plugin architecture

### 6.1 Design thesis

Reify every ritual into an artifact or a gate; enforce every enforceable rule by capability. **Prompts ask models to be disciplined; hooks make indiscipline impossible.** Every rule moved from prompt to hook survives model pressure, context truncation, and rationalization — the three ways prompted rules die.

A clarification the docs must state: subagents do not make anything deterministic — LLM nodes stay stochastic. What the architecture delivers is **a deterministic orchestration graph** (which step runs, with which inputs, in what order — code, not judgment), **blame isolation** (failures localize to a step with enumerable inputs), and **bias prevention** (an agent can't lean on what it never saw). Promise exactly this: *deterministic pipeline, stochastic nodes.* The orchestrator's control flow is a script/checklist, never improvised; model judgment lives inside nodes, not between them.

### 6.2 The noun/verb/law triage

**Agents are nouns, skills are verbs, hooks are laws.** A role with a fixed manifest → agent. A mechanically checkable rule → hook. What remains for skills: procedures invoked from multiple contexts, and shared-context disciplines. Most plugin-design failures are category errors — a rule shipped as prose (dies under pressure), a role shipped as a skill (loses its tool fence), a procedure duplicated into five constitutions (drifts into five dialects).

### 6.3 Agents

Every role = a dedicated agent definition (plugin `agents/` directory). The **agent definition holds the constitution** (rules, output format, gate, forbidden moves); the **dispatch prompt holds the work order** (artifact paths, which contract diff, which vertical slice). If a rule repeats in dispatch prompts, it belongs in the constitution. **Context manifests are enforced by tool allowlists** (harness-level) plus PreToolUse path hooks (path-level) — blindness by capability, not promise. Clean context means *fresh subagent*, never the same conversation wearing a different hat.

| Agent | Sees (context manifest) | Produces | Tools (enforced) | Model note |
|---|---|---|---|---|
| `implementer` | vertical-slice spec + relevant contracts (+cited closure) | code + contract enrichment + ripple manifests | full edit on src within locus; **test-file edits denied by hook**; enforcement layer denied | Sonnet-class (user preference) |
| `blind-test-writer` | old + new contract text **only** | test changes | Read + Edit/Write on test paths; **no Bash** (can't run tests, can't `git diff`) | Sonnet-class |
| `adjudicator` | failing test + contract text | verdict artifact (impl-bug / test-bug-with-cited-clause) | **read-only** | strongest available — wrong verdicts silently corrupt the ledger |
| `auditor` | test diff + git history | discriminator/mapping/mutation/proportionality report | read-only + Bash (worktrees at `HEAD~`, mutation runs) | Sonnet-class |
| `skeptic` | infeasibility verdict + evidence | refutation or confirmation | read-only + Bash, timeboxed | strongest available |
| `spike-runner` | spike question contract | knowledge artifact | full tools, **path-fenced to quarantine** | Sonnet-class |
| `retro-synthesizer` | contract diffs + vision + ledger | three-way classifications → human | read-only + ledger append | strongest available |
| `scaffolder` | topology sketch | walking skeleton + parked scenario suite | full edit | Sonnet-class |
| `route-planner` | vision + current state + verdicts | vertical-slice ordering + footprint computation | read-only + route write | strongest available |

Platform constraint that shaped this: **subagents can't dispatch subagents** — so orchestrators are NOT agents; orchestration runs in the main session via phase skills (flat fan-out, portable). Deterministic workflow scripts are an optional accelerator where the platform offers them.

Model bindings are configurable; the defaults above encode the user's standing preference (Sonnet for implementer/reviewer-class roles) and the principle that judgment roles whose errors corrupt the ledger get the strongest model.

### 6.4 Skills

**Entry skills** (how an effort starts — they set the run mode (§5.12) and route into the phases):
1. `run` — the **gated** (default) entry. Every ratification gate blocks for explicit human approval.
2. `run-autonomously` — the **autonomous** entry. Gates self-ratify and are logged; the system never blocks; every step and every mechanical check still runs. Selectable only by explicit, contemporaneous invocation — never from a standing directive.
3. `using-reasonable` — the **shared reference** (precedence and supersession, applicability triage, the two run modes, the Three Laws, the phase map, where things live). Read first by both entries; also useful standalone.

**Phase skills** (user-invocable orchestration checklists; rigid — follow exactly):
1. `analysis` — vision grilling (grill-me style: one question at a time, in prose with a recommended answer per question, never option menus; explore the codebase instead of asking when possible), topology sketch, initial route, **applicability triage** (§7), documentation-integration policy, resource lexicon, sanity invariants. Outcomes include "this workflow is not applicable — choose freely."
2. `scaffolding` — walking skeleton + parked scenario suite + sign-offs.
3. `vertical-slice-execution` — the orchestrator checklist: dispatch waves, pipeline sequencing, tripwires, inbox, journal upkeep.
4. `retro` — gate evidence review, three-way classification, amendment batches, route re-sort ratification, budget/dial tuning.

**Procedure skills** (invoked by ≥2 roles/phases — the shared type system):
1. `component-contract` — must-list format, topology-subtractive/behavior-additive derivation, minimality check, citation discipline. *The paradigm's shared type system: producer, judge, and auditor must cite the same constitution for adversarial review to be commensurable.*
2. `gate-mechanics` — PARK / PROMOTE / GATE / LOUD-STUB primitives + per-stack binding references (§6.7).
3. `contract-amendment` — the ratchet, ledger entry format, amendment ceremony.
4. `adversarial-audit` — judgment half of auditing; the mechanical half (discriminator, mutation) is **scripts the skill invokes** — never ask a model to simulate what a script can compute.
5. `shared-context-session` — when live shared context is legitimate (judgment-across-artifacts roles: grilling, retro approval, debugging-with-history) and how to conduct it without leaking artifacts downstream blind roles must not have seen.

**Folded, not extracted** (single-role procedures live in their agent's constitution): adjudication fork, divergence classification, spike running. Extracting single-role procedures adds indirection without reuse.

### 6.5 Hooks and the engine (the law — make this pile as large as possible)

**Engine.** The law runs through a polyglot `hooks/run-hook.cmd` that works on Windows and Unix: it dispatches extensionless bash shims that `exec` Node ESM modules in `lib/*.mjs` (the real, cross-platform logic). **Every hook fails open when no `.reasonable/` effort is active** — installing the plugin never disturbs an ordinary session. When an effort *is* active but the engine cannot run (no bash/Node), it fails **loud**, so enforcement is never silently off while an effort believes itself guarded.

The pile splits two ways:

**Event-hooks** (registered in `hooks/hooks.json`, fired by the harness):
- `session-start` (SessionStart) — discoverability + supersession banner + crash-only **reconciliation** briefing.
- `fence` (PreToolUse on edits) — blast-radius locus, enforcement-layer block, per-role test-path rule, no-foreign-contracts, test/contract 1:1. Reads the lane's `.reasonable-lane.json` to bind the law to the governed.
- `sanity` (PreToolUse on edits) — the lintable sanity-invariant subset.
- `budget` (PreToolUse on edits + Bash) — effort-budget counter → forced checkpoint.

**Skill-invoked scripts** (`lib/*.mjs`, called by the orchestrator/skills, not by harness events): `footprint` (the computed DAG), `discriminator`, `mutation-sample`, `citation-resolve`, `burndown`, `redispatch-guard`, `commit-accounting`, `reconcile` — plus the shared parsers (`contract`, `effort`) the rest build on.

Each rule below is independently enforceable; whatever a dumb script can check, a dumb script does:
- Test diff requires matching contract diff + amendment/enrichment ledger record.
- Blast-radius fence: edits outside the work order's declared locus blocked; scope-expansion request flow.
- Enforcement layer (config, hooks, constitutions, budgets, ledger, profiles) outside every locus, categorically.
- Citation resolution: every contract citation points at an existing clause.
- Parked-test burndown + loud-stub burndown queries.
- No fake reachable from the production composition root (wiring check, not visibility check).
- Effort-budget counting + forced checkpoint.
- Identical work-order re-dispatch block (keyed on work-order hash vs ledger verdicts).
- Discriminator check runner (new tests fail on `HEAD~` in a worktree).
- Commit accounting support: work-order trailers stamped on agent commits; journal SHA recording.
- Lintable sanity invariants.
- Path fences: spike-runner → quarantine; blind-test-writer → test paths; implementer → no test files.

### 6.6 Artifacts (the message bus)

The filesystem is the message bus; agents share artifacts, never conversation. Inventory (formats now pinned in `docs/artifacts.md`): **vision** (grilled user stories, quality attributes) · **topology sketch** · **route** (vertical-slice frontier; human-editable) · **vertical-slice specs** · **contracts** (per component; provider-owned clauses) · **ledger** (append-only: enrichments, amendments, verdicts, scope expansions, budget extensions) · **execution journal** (+ approval inbox) · **knowledge artifacts** (spike/dead-end verdicts with expiry) · **bug-report artifacts** · **progress verdicts** · **ripple manifests** · **sanity invariants** · **resource lexicon** · **documentation-integration policy** · **supervision profile** · **config** (stack bindings + run mode). Collectively: the **effort artifacts** (an *effort* = one engagement of the methodology on a project, analysis → completion).

**On disk:** all effort artifacts live under `.reasonable/` at the *target* project root (not the plugin directory); the presence of that directory is what tells every hook an effort is active. `docs/artifacts.md` pins each format and marks the **machine-parsed** ones (`config.json`, `journal.json`, `ledger.jsonl`, `supervision.json`, `contracts/*`, `work-orders/*`, `inbox.json`, `resource-lexicon.json`) whose grammar the engine depends on, versus prose artifacts (vision, vertical-slice specs) with only a recommended shape. Each in-flight lane worktree additionally carries a `.reasonable-lane.json` descriptor — the work order narrowed to what the fence enforces, with a back-pointer to the main checkout's `.reasonable/`. The token `${reasonable}` in any skill or constitution means the installed plugin root (the env var `$CLAUDE_PLUGIN_ROOT` in hooks).

### 6.7 Per-stack bindings

The paradigm's primitives are abstract; languages and ecosystems get binding tables (reference files under `gate-mechanics`): PARK (`#[ignore = "reason"]` / `test.skip` / `@pytest.mark.skip(reason=...)`), LOUD-STUB (`todo!()` / `throw new NotImplementedError`), burndown queries, measurement harness for quality gates, shared-build-cache strategy, worktree cost notes. Adding a stack = adding one reference file; no agent or skill changes. Documentation systems get the same treatment via the Analysis-stage integration policy (§5.14C). **Host conventions get adapters, not mandates.**

### 6.8 Precedence and coexistence

The plugin **supersedes** (and must declare so explicitly in its skill descriptions, to prevent invisible skill-priority coin flips at session start): superpowers/vf-superpowers `test-driven-development` (per-brick RED mandate conflicts with contract-governed tests), `writing-plans`, `executing-plans`. It **coexists with**: `systematic-debugging`, `verification-before-completion` (aligned in spirit), `using-git-worktrees` (subsumed by lane mechanics but not contradicted). User instructions (CLAUDE.md) outrank the plugin, per standard priority.

### 6.9 Marketplace integration

`c:\work\claude\vanillafairy\.claude-plugin\marketplace.json` registers the plugin — `{ "name": "reasonable", "source": "./reasonable", "version": "0.1.0" }` is present and live alongside `vf-superpowers`. The structural conventions (plugin manifest, skills/agents layout) follow `vf-superpowers/`.

---

## 7. Applicability and triage

A methodology that names its own boundaries gets routed around legitimately and survives; one that claims universality gets silently abandoned. **Triage is an Analysis-stage outcome.** The paradigm engages when **(topology is novel) OR (decomposition is uncertain) OR (work spans ≥2 seams) OR (ungoverned existing code is touched/risked by a change)** — the fourth, brownfield, trigger (architecture §18). Otherwise, four exits:

1. **Small tasks** (bugfix/single-component change in existing topology) → lightweight path (e.g., a simple-task flow).
2. **Spec-pinned components** (contract fully known and externally fixed: CRC32, frozen wire format, an RFC) → classic bottom-up TDD — the spec *is* the test suite, there's nothing to discover. Also legal *inside* vertical slices: when a work order touches a spec-pinned component, the implementer builds it spec-first; parity holds trivially (the contract arrived complete).
3. **Research questions** → spike mode (§5.7).
4. **Not applicable** → Claude is free to choose whatever methodology fits. A first-class verdict, not a failure.

v1 targets **greenfield** efforts (new projects/subsystems) **and brownfield** efforts (changes to existing code, governed just-in-time — architecture §18) in a **single repo**, with a **single orchestrator session** and intra-vertical-slice parallelism.

---

## 8. Glossary (normative)

The canonical, maintained glossary is **`docs/glossary.md`** — the single source of truth for the methodology's nouns; this section mirrors it. Rules, hooks, agent constitutions, and skills may reference only these terms. Informal words ("prototype", "stub", "skeleton", "MVP") carry no normative force.

- **Component** — a dynamically implemented entity: implementation exactly matches its current contract at every moment; depth grows by enrichment. There is no "finished" kind.
- **Contract** — a component's current must-list; its only definition of done. Provider-owned clauses; consumers cite.
- **Clause** — one numbered must in a contract (`§N`). The unit of citation, the unit of enrichment, the unit a test assertion maps to.
- **Contract parity** — the core invariant: within contract = real; beyond contract = absent or loud; nothing in between.
- **Enrichment** — additive contract growth (the ratchet's free direction).
- **Amendment** — gated contract weakening (ceremonial, ledger-logged, retro-approved).
- **Ratchet** — strengthen freely, weaken ceremonially; tests track contracts 1:1.
- **Gate** — a stage's acceptance test: RED at open, GREEN at close. The merge condition.
- **Parked / Promoted** — a future gate's two states (ignore-marked but compiling / live).
- **Loud stub** — off-contract code path that fails unmissably when touched; never returns plausible data.
- **Thin-real** — a genuine, minimal implementation on the active vertical-slice path. A node that fakes its output un-verifies every edge through it.
- **Fake** — a test double behind a trait/interface seam, used by tests, **never reachable from the production composition root**. Legal in exactly one place; visibility ≠ wiring.
- **Depth** — informal measure of accumulated contract; descriptive, never normative.
- **Vertical slice** — a vertical stage: one user-visible scenario driven GREEN end-to-end.
- **Breadth pass** — a cross-cutting stage gated by "all promoted scenarios green + invariants."
- **Walking skeleton** — the first milestone: minimal end-to-end vertical slice, real wiring, thin behavior.
- **Vision / Route** — stable goal artifact (human-gated) / volatile vertical-slice frontier (agent-sorted, human-ratified at retro).
- **Retro** — the mandatory blocking heartbeat at every gate; three-way divergence classification (fix / amend / defer).
- **Ledger** — append-only record of enrichments, amendments, verdicts, extensions.
- **Work order** — one atomic dispatch: named artifact inputs, artifact output, gate, locus, resource claims, budget.
- **Lane** — one work order in flight in its own git worktree. Agent territory; the human never works in a lane. Identified on disk by a `.reasonable-lane.json` descriptor, which the fence reads to bind the law to the governed.
- **Locus / Footprint** — a work order's declared edit scope / locus ∪ citation closure; disjoint footprints = parallelizable.
- **Ripple manifest** — escalation artifact enumerating cross-contract impact (clause, enrichment-vs-amendment).
- **Spike** — a route item whose gate is a falsifiable question and whose deliverable is a knowledge artifact; code is law-free and quarantined.
- **Knowledge artifact** — question / method / evidence / verdict / confidence / expiry.
- **Dead end** — a refutation-surviving infeasibility verdict; a retroactive spike.
- **Skeptic** — fresh-context agent that tries to refute infeasibility claims.
- **Progress verdict** — the checkpoint artifact: what was tried, what binds, current hypothesis.
- **Effort budget** — harness-counted cap forcing checkpoints.
- **Checkpoint** — the forced halt at budget exhaustion: emit a progress verdict, return to the orchestrator. The agent gets no vote.
- **Sanity invariants** — the project's written taboos; lintable subset enforced by hooks.
- **Resource lexicon** — declarable runtime resources (ports, singletons); shared claim = serialization point.
- **Journal / Reconciliation / Briefing** — execution state of record / session-start verify-and-downgrade against ground truth / the resulting human summary.
- **Approval inbox** — queued human decisions; footprint-scoped freezes; silence never consents.
- **Run mode** — gated (`reasonable:run`, default — gates block) vs autonomous (`reasonable:run-autonomously` — gates self-ratify and log, never block, no step skipped). The outermost control axis; chosen only by the entry skill, never inferred from a standing directive.
- **Supervision profile** — strict / standard / trusting dial; the finer control nested inside gated mode. Initial profile set by the entry skill (`run`→strict, `run-autonomously`→trusting); lower-level phases never override it; tuned at vertical-slice retro. No profile waives a mechanical check.
- **Effort / Effort artifacts** — one engagement of the methodology on a project / its durable document set (§6.6).

---

## 9. Rejected alternatives (keep these reasons)

| Rejected | In favor of | Why |
|---|---|---|
| Big-bang RED (full scenario suite failing for weeks by design) | Walking skeleton + parking | A RED test gives zero integration feedback until the end — it documents intent early but discovers seam errors at the same late moment; and red-sometimes-expected destroys the agent's only trustworthy completion signal |
| Horizontal layer-by-layer descent (BFS) | Vertical slices | Recreates late-integration one level down; "layer N done" has no user-visible gate; widest possible stub frontier |
| Stage tests all written upfront | Just-in-time per stage | Pre-written deep tests pin internal seams at the moment of least knowledge — contradicts "benefit from development history" |
| Canned-data fakes in production wiring | Thin-real on path, loud stubs off path | Plausible lies make gates winnable without the real thing; agents under pressure leave them in; loud stubs are unfakeable |
| Full-description-then-chip spec for behavior ("subtractive everywhere") | Topology subtractive, behavior additive | Authoring every entity's final form upfront is the prediction disease relocated into per-component specs; structure is cheap-to-predict/dear-to-move, behavior is the reverse |
| "Crystallization triggers" granting components their test suites at a threshold | Contract tests from birth, provisional | The simpler model: tests always assert exactly the current contract; "crystallized" is just a contract that stopped churning |
| Tests-as-immutable (classic TDD letter) | The ratchet | Real teams edit tests constantly without governing it; the ratchet keeps the spirit (code answers to tests) while governing the letter (strengthen free, weaken ceremonial) |
| Retro governs tests | Retro governs contracts; tests are derived | Cleaner derivation chain; yields the mechanical test-diff-requires-contract-diff hook |
| "Iterate on tests until green" | Adjudication fork, contract as arbiter | As phrased, it makes test-editing the default resolution of every red — the ratchet violation formalized into procedure |
| Role cards as reference docs in dispatch prompts | Dedicated agent definitions | Agent definitions carry tool allowlists — manifests become harness-enforced capability boundaries instead of prompt text |
| A special noun for incomplete components (armature / blockout / rough-in / instar / baseline / prototype / milestone were all evaluated) | Glossary-defined "component" + non-normative informal words | A term naming a *phase of life* shouldn't be a noun (nouns multiply rules; states share them); hooks would need a classification step; "prototype" specifically teaches disposability — the rewrite instinct the enrichment pipeline exists to prevent; "milestone" is an event, not an artifact |
| Hand-declared task DAGs (vf-superpowers style) | Computed footprint DAG | Declared DAGs go stale; footprints are derived at dispatch from the same artifacts the fence enforces; declared edges survive as overrides only |
| Refactor-the-POC-into-production | Rewrite-from-knowledge | Upgrading quarantined code in place is the canonical POC-becomes-production disaster; knowledge artifacts with curated quotes are the only sanctioned crossing |
| Trusting infeasibility claims | Skeptic refutation + evidence standard | "Can't be done" frequently means "my approach failed"; unaudited verdicts amputate feasible subtrees |
| Timeout-as-consent for approvals | Silence = frozen | The one-sentence difference between autonomous and unsupervised |
| Mandating a docs structure (contracts replace project KBs) | Per-project documentation-integration policy at Analysis | The workflow must be orthogonal to host documentation systems; adapters, not mandates |

---

## 10. v1 scope

**In:** greenfield efforts; **brownfield efforts** (changes to existing code, contracts characterized just-in-time — architecture §18); single repo; single orchestrator session; intra-vertical-slice parallel lanes; the full methodology of §5; agents/skills/hooks of §6; Rust + TypeScript binding tables (the author's active stacks).
**Deferred:** cross-vertical-slice parallelism via concurrent sessions (multi-writer journal coordination); additional stack bindings.

**Brownfield is no longer deferred** (architecture §18), with two corrections to this section's original sketch, both forced by the framework's own posture: (1) the existing suite enters as an untrusted **regression floor** held green for no-regression, **not** wholesale-**promoted gates** (trust-by-assertion, which the bidirectional-mapping audit rejects); and (2) contracts are **characterized just-in-time at first touch, after the change's `behaviorDelta`**, never bulk-reverse-engineered up front (prediction at the moment of least knowledge). Honest scope: the floor protects only **pre-tested** legacy behavior — untested behavior gets no pre-merge regression guarantee, only the §5.14A post-merge path.

## 11. Build-phase parameters

**Resolved in the build** (all pinned in `docs/artifacts.md`): artifact file formats and locations (`.reasonable/` at the target root); the ledger entry schema (`ledger.jsonl`); mutation-sampling `k` and skeptic timebox (`supervision.json` defaults `mutationK: 8`, `skepticTimeboxTurns: 15`); budget denominations and defaults (turns / tool-calls / attempts, started tight in `supervision.json`); contract file placement (per-component files under `.reasonable/contracts/`).

**Still open, deliberately:** build-cache strategy details per stack (the `gate-mechanics` binding tables sketch it but leave specifics to the project); CI mirroring of hooks; retro telemetry capture (audit hit rates, footprint-bug counts, checkpoint frequency — the data retros tune budgets with) is classified by the retro but not yet aggregated mechanically.

## 12. Build outcome and what remains

The plugin was built from this document, broadly along the order suggested below; §6 maps what that produced. Notes for anyone extending it:

1. **Source-of-truth split that emerged.** Vocabulary settled into `docs/glossary.md` and on-disk artifact formats into `docs/artifacts.md`; this document keeps the reasoning chains and the rejected alternatives. Keep all three in sync — where they disagree, one is wrong.
2. **Build order taken:** glossary + artifact formats first (everything cites them) → hooks/engine (`run-hook.cmd` + `lib/*.mjs`) → agent constitutions → procedure skills → phase skills → entry skills (`run` / `run-autonomously` / `using-reasonable`) → binding tables (Rust, TypeScript).
3. **The noun/verb/law triage (§6.2) is the routing rule for new rules:** role → agent, mechanical check → hook, multi-context procedure → skill. Every rule in §5 marked hook-enforceable lives in §6.5's pile, not in prose — if a dumb script can check it, a dumb script does.
4. **Rigid vs flexible skills:** pipeline-order skills are written "follow exactly"; judgment-procedure skills are written to adapt. The `analysis` grilling protocol stayed grill-me style — one question at a time, prose with a recommended answer, explore-don't-ask when the codebase can answer.
5. **README** carries the motto (*every claim reasoned, every reason checked*), the family descriptor (outside-in, contract-governed, adversarially verified), the ancestry table (§3), and the Three Laws (§4), as planned.

**Still pending — the dogfood plan.** The first real effort should be a greenfield widget for the author's Fireside project (a Windows tray-resident plugin shell — multi-hotzone widget wrapper is the long-term vision), exercising gates, contracts, resource claims (tray icon + global hooks are singleton resources), and the full pipeline. This is the methodology's first real test against itself; until it runs, the plugin is verified by construction, not by use.
