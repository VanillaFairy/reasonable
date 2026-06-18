# reasonable 2.0 — architecture foundation  ⚠️ SUPERSEDED SKETCH

> **This is the original architecture sketch, kept for history. It was written *before* `principles.md`
> was refined, and a deny-by-default re-derivation found several of its load-bearing claims false (the
> fence does not fail closed; reconcile does not halt; durability is not inherited from `resumeFromRunId`;
> the intent half had no mechanism). The current, implementation-ready architecture is
> [architecture.md](architecture.md), which records exactly what changed and why (§21). Do not implement
> from this file.**

**Status:** foundational decision. This frames every other 2.0 redesign decision; read it first.

## The decision

Adopt **Claude Code Dynamic Workflows** as the orchestration substrate. reasonable supplies the
governance, the capability law, and the domain state — it stops hand-rolling the orchestration engine.

## Why

- Dynamic Workflows (CC research preview, May 2026) is a real deterministic JS orchestration engine:
  `agent()` / `parallel()` / `pipeline()`, `resumeFromRunId` (replay-based crash recovery), a token
  `budget`, and per-agent worktree isolation.
- It *delivers* the "deterministic pipeline, stochastic nodes" promise that `DESIGN.md` §6.1 makes but
  the v0.1 build doesn't — the fidelity audit found the orchestrator was prose interpreted by a
  stochastic LLM, the weakest-built layer in the plugin.
- `DESIGN.md` §6.3 already anticipated this: *"Deterministic workflow scripts are an optional
  accelerator where the platform offers them."* The platform now offers them.
- **Orchestration was never reasonable's distinctive contribution.** Contracts + adversarial
  verification + capability enforcement are. Adopting Workflows loses nothing distinctive and replaces
  the shakiest layer with a battle-tested one.

## The three layers

reasonable is not one harness *on top* of Workflows — it is three things, and only one is orchestration:

1. **Control plane → Workflows (generic).** How the graph runs, fans out across parallel agents, and
   survives a crash. Domain-blind; knows nothing about contracts or correctness.
2. **Capability law → reasonable hooks (cannot live in Workflows).** fence / locus / sanity /
   enforcement-layer immutability. A workflow script is deterministic *orchestration*, but the agents
   inside it can still do anything their tools allow — so the hooks are what make the membranes real.
   This sits *beside and under* the agents, not above the workflow.
3. **Governance + program + state → reasonable content.** Contracts, the ratchet, slices, the role
   constitutions, vision/route, retros, the tier dial, and the `.reasonable/` data plane.

> Engine (Workflows) + the program that runs on it + the capability law the engine can't enforce + the
> domain state the engine treats as opaque.

## What moves, what stays

| Moves to Workflows | Stays reasonable's |
|---|---|
| slice-execution loop → a workflow script | contracts, ratchet, parity, enrichment *semantics* |
| parallel slices → `parallel()` / `pipeline()` | the role *constitutions* + tool allowlists |
| role dispatch / fan-out → `agent()` | the capability hooks (fence / sanity / locus) |
| control-plane crash recovery → `resumeFromRunId` | the `.reasonable/` data plane (contracts, ledger) |
| effort budget → `budget` | vision/route split, retros, triage/tiers |
| lane isolation → `agent({isolation:'worktree'})` | domain trap semantics + data-plane crash-safety |

## The ceiling ("as much as possible")

Workflow scripts are **pure**: no filesystem, no `Date.now`/`random` — that purity is what makes replay
deterministic. All side effects happen *inside* agents. So the split is forced, not chosen:

- The whole **control plane** moves into the script.
- The **capability hooks** and the **`.reasonable/` state** stay outside the script, by construction.
- In practice: the script *orchestrates*; the agents do the I/O (edit files, run tests, write
  contracts/ledger); the hooks *fence* the agents; the `.reasonable/` artifacts are the shared state
  agents read and write.

## Durability — delegated, plus three constraints

There is **no bespoke WAL protocol to build.** Once the orchestrator is a Workflows script (not a
stochastic LLM hand-editing a journal), the trap/decide/resume/re-plan cycle inherits durability from
the engine: a trap is an `agent()` return (cached; the working model — see agenda #1), a resume is an
`agent()` call (replay-safe), and decision/re-plan state lives in script variables (replayed
deterministically by `resumeFromRunId`). Lost-trap, double-resume, torn re-plan, and zombie-wakeup all
evaporate — *given* the constraints below.

- **Constraint A — coordination state lives in the script.** The authoritative trap/decision/route
  state is the workflow run's control flow and variables, never hand-edited `.reasonable/` files. (The
  v0.1 model — an LLM maintaining a journal program-counter by hand — is exactly what this replaces.)
- **Constraint B — agent side effects are atomic.** A git commit is the unit of work (git is itself
  the intent-then-commit log); shared-artifact writes (e.g. the ledger) use temp+rename. This covers
  the one thing replay cannot: a half-written file from a mid-agent crash.
- **Cross-session note.** `resumeFromRunId` is **same-session only** — a cold restart (new session)
  cannot replay a prior run's cache. So cross-session recovery re-derives from on-disk state (git + the
  atomic artifacts) via a **reconcile pass**. That reconcile is the data plane's *only* durable
  obligation: re-derive from artifacts, never trust a hand-maintained program counter.

## Open questions — the redesign agenda (walk one at a time)

1. **How does a trap surface back into the script?** A workflow script has fixed control flow within a
   run; `agent()` returns its final message. A mid-agent capability-fence trap (an agent hitting its
   locus wall) must become a *structured return* the script branches on — or the script polls an inbox
   artifact between waves. Which fits Workflows' model?
2. **Dynamic re-plan vs fixed script.** reasonable's route re-sorts as it learns; a workflow run's
   control flow is fixed. How much dynamism comes from *re-launching* a freshly-generated script per
   slice, vs. loops-plus-budget *within* one script?
3. **Replay vs. changing domain state.** If a run replays the `agent()` prefix from cache but the
   `.reasonable/` contracts changed underneath, is the replay still valid? (Likely rule: re-derive,
   never trust cache across a contract change.)
4. **Hooks inside Workflows-managed worktrees.** `agent({isolation:'worktree'})` gives
   Workflows-spawned worktrees; do reasonable's lane descriptors + fence still bind correctly inside
   them?
