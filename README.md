# reasonable

> **Every claim reasoned, every reason checked.**

A Claude Code plugin that enforces **outside-in, contract-governed, adversarially verified
development** for agentic (LLM-driven) software work. Sibling of `vf-superpowers` in the
`vanillafairy` marketplace.

`reasonable` is **because it is** — a methodology whose every claim is reasoned and whose every
reason is checked by something that cannot be talked out of it.

---

## The disease it cures

The current state of the art runs *analyze → architect → spec every component → per-component
red/green TDD → assemble.* That is **bottom-up development in disguise**, and it fails two ways:

1. **Integration discovered too late** — the hardest errors live in the wiring, and bottom-up
   exercises the wiring last.
2. **Tests pin bricks too early** — per-component suites freeze APIs at the moment of *least*
   knowledge, before any integration has validated the decomposition.

The cure is not a more detailed plan (prediction is the failing strategy). It is two meta-principles:

> **1. Feedback beats prediction.** Let component shapes emerge from development history.
> **2. Capability beats discipline.** Enforce by hook / allowlist / fence what would otherwise be a
> prompt an agent can rationalize away. *Prompted rules die under pressure; capability rules cannot.*

Agile rituals assume human discipline and shared memory. **Agents have neither.** So every ritual is
reified into an **artifact** (a durable file) or a **gate** (an executable check).

## The Three Laws

Every mechanism in the plugin is one of these three, at some scale:

1. **Parity** — claims match reality exactly. Code matches contract (no more, no less). Tests match
   contracts 1:1. Journal matches git. Provenance matches custody. Verdicts match evidence.
2. **One-way membranes** — value crosses boundaries only in sanctioned form. Spike knowledge crosses
   as artifacts, never code. Contract changes cross as enrichments (free) or amendments (ceremonial).
   Approvals cross as explicit human acts, never timeouts.
3. **External verification** — no actor grades its own work. Tests are written blind to
   implementations. Verdicts come from read-only adjudicators. Infeasibility faces skeptics; success
   faces auditors; state faces reconciliation. The reusable shape is the **verification trio**
   (worker → adversary → orchestrator): a worker mutates, a fresh read-only **adversary** judges the
   *proposed* output against a reference above the artifact and *proposes* a verdict (it never
   self-executes the act it authorizes), and the orchestrator routes accept / reject / escalate.
   *(As with the commit iron rule under Law 1, the surface states the law and leaves its corollary —
   propose-not-act, read-only by capability — to `DESIGN.md` §4 and `docs/glossary.md`.)*

## Intellectual ancestry

The methodology braids established lineages; each citation is a free long-form manual.

| Pillar | Established name | Source |
|---|---|---|
| Walking skeleton + double-loop TDD | Outside-In / London School | Freeman & Pryce, *GOOS*; "walking skeleton" — Cockburn |
| User-visible scenario gates; parked suite as executable vision | BDD / Specification by Example | Dan North; Gojko Adzic |
| Vertical slices ordered by risk | Tracer bullets; story slicing | Hunt & Thomas, *The Pragmatic Programmer*; XP |
| Contracts, parity, must-lists | Design by Contract (spec-artifact flavor) | Bertrand Meyer |
| Provider-owned clauses + consumer citations | Consumer-Driven Contracts (inverted) | Ian Robinson; Pact |
| Depth growth by enrichment | Stepwise refinement | Wirth, 1971 |
| Spikes, retros | XP | Kent Beck |
| Separated roles; independent verification | Cleanroom Software Engineering | Harlan Mills, IBM |
| Crash-only state management | Crash-only software | Candea & Fox, 2003 |
| Expand/contract change propagation | Parallel-change migration | folklore, well documented |

**The genuinely new contribution** is the *agentic enforcement layer*: capability-enforced process
(allowlists/hooks instead of discipline), the adversarial agent pipeline (blind test-writer /
adjudicator / skeptic / auditor as separated powers), computed-footprint DAG scheduling, and
crash-only orchestration with a supervision dial. Every borrowed practice originally ran on team
culture; `reasonable` replaces culture with mechanism — hooks for norms, allowlists for trust,
journals for memory. That substitution *is* the working definition of "agentic methodology."

---

## Architecture: nouns, verbs, laws

> **Agents are nouns, skills are verbs, hooks are laws.** A role with a fixed manifest → agent. A
> mechanically checkable rule → hook. A procedure invoked from multiple contexts → skill.

What the architecture delivers is a **deterministic pipeline with stochastic nodes**: the
orchestration graph (which step runs, with which inputs, in what order) is code; model judgment lives
*inside* nodes, never between them. Subagents don't make anything deterministic — they give **blame
isolation** (failures localize to a step with enumerable inputs) and **bias prevention** (an agent
can't lean on what it never saw).

### Agents (`agents/`) — the roles, each a constitution + tool allowlist
`implementer` · `blind-test-writer` · `adjudicator` · `auditor` · `skeptic` · `spike-runner` ·
`retro-synthesizer` · `scaffolder` · `route-planner`. Context manifests are enforced by **tool
allowlists** (e.g. the blind-test-writer has *no Bash*, so it literally cannot see the implementation).

### Skills (`skills/`) — the procedures
- **Entry skill** (asks the two axes and routes into the phases): `develop` — the single way to start an
  effort, invoked as `/reasonable:develop`. It asks **mode** (gated, the default, or autonomous) and
  **tier** (full, the default, or lite) up front, both explicit and never inferred. `develop-autonomously`
  remains as a thin alias that presets autonomous.
- **Phase skills** (orchestration checklists, run in the main session): `analysis`, `scaffolding`,
  `vertical-slice-execution`, `retro`.
- **Procedure skills** (the shared type system, cited by ≥2 roles): `component-contract`,
  `gate-mechanics` (+ per-stack `references/`), `contract-amendment`, `adversarial-audit`,
  `shared-context-session`.
- **Shared reference** (loaded on demand by the model, not a user command): `using-reasonable` —
  precedence, triage, the run mode and tier axes, the Three Laws, the phase map. The entry skill and several
  agent constitutions cite it; it carries `user-invocable: false`, so it never starts an effort.

### Hooks + engine (`hooks/`, `lib/`) — the law
A polyglot `run-hook.cmd` (Windows/Unix) dispatches extensionless bash shims that `exec` Node ESM
modules. **PreToolUse:** `fence` (blast-radius locus, enforcement-layer block, per-role test-path
rule, no-foreign-contracts, test/contract 1:1), `budget` (effort-budget counter → forced checkpoint),
`sanity` (lintable invariants). **SessionStart:** `session-start` (discoverability + supersession +
crash-only **reconciliation** briefing). **Invoked by skills:** `footprint` (the computed DAG),
`discriminator`, `mutation-sample`, `citation-resolve`, `burndown`, `redispatch-guard`,
`commit-accounting`. All hooks **fail open** when no `.reasonable/` effort is active — installing the
plugin never breaks an ordinary session.

### Artifacts (`docs/artifacts.md`) — the message bus
The filesystem is the message bus; agents share **artifacts, never conversation**. The effort lives in
`.reasonable/` in the target repo: `vision` · `topology` · `route` · vertical-slice specs · `contracts/` ·
`ledger` (append-only) · `journal` (+ inbox) · knowledge/bug-report/progress-verdict/ripple artifacts ·
`sanity-invariants` · `resource-lexicon` · `documentation-policy` · `supervision`.

---

## Precedence

`reasonable` **supersedes** (declared in its skill descriptions to prevent a silent skill-priority
coin-flip): superpowers/vf-superpowers `test-driven-development` (per-brick RED conflicts with
contract-governed tests), `writing-plans`, `executing-plans`. It **coexists with**
`systematic-debugging`, `verification-before-completion`, `using-git-worktrees`. **User instructions
(CLAUDE.md) outrank the plugin**, always.

## Installation

The plugin is registered in `vanillafairy/.claude-plugin/marketplace.json`:

```json
{ "name": "reasonable", "source": "./reasonable", "version": "2.6.0" }
```

**Requirements:** Node.js (the engine) and Git (worktrees, discriminator, provenance). On Windows,
Git for Windows provides the `bash.exe` the polyglot wrapper needs.

## Usage

Start any greenfield effort by invoking **`/reasonable:develop`** — the single entry, which asks the two
axes up front: **mode** (gated, the default, or autonomous) and **tier** (full, the default, or lite),
both explicit and never inferred. The
entry skill first triages applicability (the methodology engages when *topology is novel* OR
*decomposition is uncertain* OR *work spans ≥2 seams*; otherwise it routes you to a lighter path) and
then walks `analysis → scaffolding → vertical-slice-execution → retro`, looping the last two per
vertical slice until the route is empty.

## Applicability

A methodology that names its boundaries survives. `reasonable` is **not** for: small tasks in an
existing topology (use a lightweight path), spec-pinned components (classic TDD — the spec *is* the
suite), or pure research questions (spike mode). "Not applicable — choose freely" is a first-class
verdict, not a failure.

## Scope (v1)

**In:** greenfield **and brownfield** efforts; single repo; single orchestrator session; intra-vertical-slice
parallel lanes; the full methodology; Rust + TypeScript bindings. **Deferred:** cross-vertical-slice
parallelism via concurrent sessions; more stack bindings. (Brownfield retrofit — contracts characterized
just-in-time — is first-class; see [docs/architecture.md](docs/architecture.md) §18.)

---

*Design source of truth: `docs/DESIGN.md`. Normative vocabulary: `docs/glossary.md`. Version: v2.6.0.*
