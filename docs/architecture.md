# reasonable — architecture

**Status:** the implementation architecture. This is how the `reasonable` methodology sits on the Claude
Code **Dynamic Workflows** engine, derived from [principles.md](principles.md) under the framework's own
posture (*default-deny*). It is the *how* to [DESIGN.md](DESIGN.md)'s *what*; the two are kept in step with
the plugin as it stands.

Every claim it makes about the code is verified against `lib/`. The methodology's own honest caveat carries
through from principles.md: a design is proven only in practice, by the dogfood efforts that exercise the
loop — not on paper.

---

## 1. Grounding

Read in this order; each is load-bearing and this document does not restate them:

- **[principles.md](principles.md)** — the *why*. One posture (default-deny) → one invariant (deliver the
  ask, no less/no more) → three means (external verification · capability over discipline · feedback over
  prediction) → the human contract (a competent owner, served, never policed). This is the single source of
  truth; every decision below cites it.
- **The Dynamic Workflows engine** — the *substrate*. A single **pure** JavaScript script orchestrates many
  stochastic subagents deterministically. The purity rules are absolute and they *force* most of this
  architecture: no filesystem, no `Date.now`/`Math.random`/`new Date()` (they throw), fixed control flow
  within a run. All side effects happen **inside agents**. Hooks: `agent()` (optionally schema-forced),
  `parallel()` (barrier), `pipeline()` (no barrier), `log()`, `phase()`, `args`, `budget`, `workflow()`
  (one-level nesting). `resumeFromRunId` is replay-based crash recovery but **same-session only**.
  Concurrency caps at `min(16, cores-2)`; 1000 agents per run lifetime; 4096 items per fan-out call.
- **[DESIGN.md](DESIGN.md) + [artifacts.md](artifacts.md)** — the *program*. The full methodology
  (vertical slices, contracts, the §5.6 enrichment pipeline, retros, the ratchet) and its on-disk data
  plane. This is what runs *on* the substrate.
- **The `lib/` engine** — the dependency-free Node modules that enforce all of the above:
  `fence.mjs`, `reconcile.mjs`, `footprint.mjs`, `effort.mjs`, `contract.mjs`, and their siblings.

---

## 2. The orchestration substrate

**Dynamic Workflows is *the* orchestration substrate — there is one orchestration path, the pure
vertical-slice script.** (D1)

Workflows is the *orchestration* substrate only. Durability is not the engine's to provide (see §11) — so
"the engine orchestrates" and "the engine gives almost no durability" sit on different planes and do not
conflict: durability is reasonable's own, via git + the append-only ledger + reconcile.

---

## 3. The four planes

reasonable names **four planes**, and reserves **control plane** for its canonical meaning in DESIGN.md
(§5.12) and the glossary — *the human*. The engine is a substrate, never the control plane. (D2)

| Plane | Who/what | Owns |
|---|---|---|
| **Human decision plane** *(the control plane)* | the principal, via main-session skills | vision, the intention + its ratification, route re-sort approval, amendment ratification, breaking-fork resolution, the supervision dial, run-mode + tier selection |
| **Orchestration substrate** | the Workflows engine + the pure vertical-slice script | how one vertical-slice-shaped run fans out, loops, branches, budgets, replays — **deterministic orchestration, zero capability containment** |
| **Capability law** | reasonable hooks + per-agentType allowlists | the fence / locus / sanity / enforcement-immutability — binds *beside and under* the agents, entirely orthogonal to the engine |
| **Program + state** | reasonable content + `.reasonable/` | the intention oracle, contracts, ratchet, vertical slices, route, retros, ledger, journal — the data plane the engine treats as opaque |

The load-bearing fact under this split: **the engine's determinism fences nothing.** A subagent spawned by
`agent()` can do anything its tools allow, exactly like an Agent-tool subagent. So the capability law cannot
live in the script; it lives in hooks the harness fires regardless of who spawned the agent.

---

## 4. The control-plane split — what moves into the script, what cannot

Script purity forces the boundary; it is not a matter of taste.

**Moves into the pure vertical-slice script (orchestration):** the in-run control flow — dispatch waves, the §5.6
enrichment pipeline as `pipeline()`, adversarial fan-out as `parallel()`, the trap `switch`, the
budget-guarded retry/checkpoint loop, the disjointness set-algebra that groups work orders into parallel
waves.

**Cannot move in (stays in the human decision plane / the data plane / the agents):**
- **Deciding what the next run is** — route re-sort, amendments, re-priced siblings. The script's control
  flow is fixed per run; re-planning happens *between* runs (§10).
- **Human-blocking gates** — a background workflow cannot block on a human, and silence must never ratify.
  So gates live in the main session; the run *returns a typed result* instead of waiting (§8).
- **All I/O** — every file edit, test run, contract/ledger write happens inside an agent. The script never
  touches disk.
- **Cross-session recovery** — the script is pure and same-session; durable recovery re-derives from disk
  (§11).

---

## 5. Analysis and the coherence-grill — the intention as oracle

The *intent* half of the framework runs here. principles.md leans on an **intention** — a decision-policy,
grilled into existence, adversarially coherence-checked, then used as the **oracle** that lets a machine
resolve later forks the way the principal would.

**Mechanism (D15):** a main-session phase skill `reasonable:analysis` runs *before* any vertical slice and produces a
fence-protected `.reasonable/intention.md`. The main session first **pre-drains** the obvious forks in cheap
shared context (the worker drafting — Law 3 keeps the verifier separate), then wraps a
`coherence-grill.workflow.js` whose **stop condition is adversarial, not heuristic**: a `grill-adversary`
agent loops hunting forks the draft intention leaves open, returning each pass the **independent batch at the
draft's highest open altitude tier** (*approach* forks — which can restructure the design — before *detail*
forks). Each batch returns to the main session and is put to the human — *this is the human's attention spent
up front, the sanctioned place.* Batching + altitude ordering cut the **number** of grill→answer→re-grill
rounds (the old shape was one fork per pass, quadratic in fork count, and grilled detail an approach pivot
could delete); the stop is untouched — the loop terminates only when the adversary returns "no ambiguous fork
found" from a from-scratch attack (principles.md's stop condition — *not* "the next question seems low-value").

The ratified `intention.md` is the cited **oracle** (§9) and a fence-enforced artifact — in the fence's
`enforcementPaths`, alongside the ledger, journal, supervision, config, and inbox.

**The falsifiable defeater (D18).** principles.md's success test has teeth: *a human correcting a
non-breaking agent choice after the fact is a recorded failure of the intent-check.* Realized as a ledger
entry `{type:'intent-check-failure', verticalSliceId, correctedChoice, shouldHavePinged}` written by the retro
whenever the human corrects a choice the agent did not escalate. A rising count is the observable signal that
the intention is too weak an oracle — routing back to enrich it. Without this, "never policing" is
unfalsifiable, the exact shape the framework forbids.

**In a brownfield effort** the same analysis phase also runs the topology census and partitions the existing
suite into the regression floor, and the coherence-grill mines the existing legacy behaviour for legacy
incoherence (the *change* still has an intention even when the legacy system embodies none) — see §18.

---

## 6. Purity consequences — the script moves the program counter, it never writes it

The script has no filesystem. So it can **move** the methodology's program counter (decide the next
transition) but it can never **write** it. This forces a clean writer-role split by **data class** — and
keeps the worker's commit and its ledger line a single atomic effect: a separate scribe writing the ledger
*after* the worker committed would be two atomic effects, re-opening the torn window.

- **Authoritative state → the worker's own atomic commit (D3a).** Each worker agent collapses its terminal
  side effects into **one** git commit: work product + its own ledger/verdict entry + a `Work-Order`
  trailer, together. Git and the ledger never diverge because they land together. *The ledger and git are
  truth.*
- **Derived state → one serialized scribe (D3b).** A lone `journal-writer` agent, dispatched only from a
  non-parallel position, writes the *derived, rebuildable* index — `journal.json` (program-counter
  transitions, write-ahead `status:'dispatched'` before a worker runs) and `inbox.json`. Because this layer
  is derived from git+ledger, a torn or **null** scribe write is recoverable: reconcile rebuilds it. A null
  scribe return is therefore a **HALT** (the script must not proceed believing a transition persisted), not
  a swallow — but the halt loses no truth.

**Footprint computation relocates; the algebra stays.** Reading contract files and running
`lib/footprint.mjs` is I/O — it moves into the route-planner agent, which already must read the route. The
pure **set-algebra** (are two footprints disjoint?) stays in the script. The route-planner returns, per work
order, both the locus/citation footprint **and** the resource-claim set; the script's `groupDisjoint`
serializes a wave on locus overlap **or** shared contract **or** shared resource — mirroring
`independent()` in [footprint.mjs:67-72](../lib/footprint.mjs#L67-L72) exactly (verified: the lib already
computes and serializes on resources). (D11)

---

## 7. The run unit — one run per vertical slice, terminating *at* the retro

**One Workflow run = exactly one vertical slice, ending at the retro gate, never through it.** (D4)

The run drives the vertical slice toward GREEN, has the worker persist gate evidence + a proposed route re-sort to
disk atomically, and **returns a typed `GATE_RESULT`**. The human-blocking retro then runs in the main
session; the next vertical slice is a fresh re-launch. The return is a tagged union so the main session routes the
outcomes that are genuinely different decisions:

```
GATE_RESULT =
  | { kind:'green',            evidence }              // ratify at the retro
  | { kind:'budget-exhausted', progress, lastOutcome } // extend budget / re-plan
  | { kind:'blocked',          outcome }               // a trap needs a human decision
  | { kind:'halt',             reason }                 // durability/reconcile halt -> human
```

The `budget-exhausted` arm is first-class on purpose: the common hard-vertical-slice exit (the loop runs out before
GREEN) must not masquerade as a gate. "Returned green" and "ran out of budget mid-vertical-slice" are different human
decisions and carry different shapes.

This is what makes "silence is frozen, never approved" enforceable: the engine can't block on a human, so it
doesn't try — it returns, and the *main session* is where blocking (in gated mode) actually happens.

---

## 8. The trap protocol

**A mid-agent capability trap surfaces as a structured `agent()` return the script branches on — not a
polled inbox.** (D5) The fence denies a tool call mid-agent; the agent converts the denial (or any wall)
into its structured final message via `opts.schema`. Every lane-running agent is forced to emit an `OUTCOME`
tagged union, and the script runs `switch(outcome.kind)`. The trap *steers an existing budget-guarded loop*;
it does not grow control flow (which a fixed run forbids).

```
OUTCOME.kind =
  green | scope-expansion | ripple | jurisdiction | seam-undeclared | blind-redo | spike-needed |
  infeasible | checkpoint | intent-fork | other
```

| kind | the script's pre-written arm |
|---|---|
| `green` | record |
| `scope-expansion` | grant+log (autonomous) or inbox (gated) |
| `ripple` | sequence provider-first / consumer-first single-contract pipeline runs (§5.10) |
| `jurisdiction` | dispatch the adjudicator (which cites the oracle) |
| `seam-undeclared` | **seam-declaration re-pass (ADVISORY)**, two paths by which side of the test is starved. **Output:** a render-clause red the `lib/seam.mjs` classifier calls a seam-observation failure (module-load / export-shape / element-not-found), NOT a behaviour mismatch → the implementer enriches `## Observable Seams` + exposes the handle. **Input:** a state-reading clause whose scenario the blind-writer cannot construct (no declared mock for the store/hook/context it reads) — raised **proactively, no red** (a missing input seam is a *false green*, invisible to `lib/seam.mjs`) → the implementer enriches `## Input Seams` with the mock shape. Either way the blind-writer then targets / sets up the declared seam. Bounded (escalates to `intent-fork` after a few passes) — never a blind redo, which could not close the loop. |
| `blind-redo` | **blind-redo re-pass (ADVISORY)** — a fixable TEST defect the workflow resolves itself instead of escalating: the blind-writer mistranslated a clause, or built an **unrealizable premise** (`lib/seam.mjs` `kind:"premise"` — a FK/unique/not-null/check violation the product enforces by design fired in the test's arrange, so no assertion ran). The **implementation is left intact**; the blind-writer rebuilds the offending test against the (possibly clarified) contract with a realizable premise. Bounded (escalates to `intent-fork` after a few passes, or immediately if the clause fundamentally requires the forbidden state). This closes the `fix-test → intent-fork` gap for backend premise errors, the dual of `seam-undeclared` for render-observation failures. |
| `spike-needed` | **return** to the main session to launch the spike workflow (nesting limit, §12) |
| `infeasible` | dispatch the skeptic; two independent exhaustions auto-promote to the dead-end ceremony |
| `checkpoint` | triage the budget: extend once / fresh-context retry / escalate |
| `intent-fork` | **human inbox (BREAKING)** — an ambiguity neither code nor intention can settle (§9) |
| `other` | **human inbox (BREAKING)** — an unknown wall the schema can't name; fail-safe |

`intent-fork` and `other` are deliberately distinct (D12): one is "the oracle can't settle this scope
question," the other is "I hit a wall this schema has no tag for." Both fail safe to the human, but they are
different decisions.

Two engine details the protocol must respect:
- **`pipeline()` not `parallel()`** for the enrichment chain — no barrier, so a fast-trapping lane is triaged
  the instant *its* chain returns, not after the slowest lane.
- **null vs throw.** `agent()` returns `null` on user-skip or terminal API error → a verification gap → the
  vertical slice does **not** close. But a *budget-ceiling* `throw` is different: every `agent()` is wrapped in a
  `guard()` that catches the throw and re-tags it as `{kind:'checkpoint'}`, so a real budget ceiling is never
  misread as a correctness gap (§12, D16b).

The inbox is **demoted** to two narrow jobs: the human-gated freeze queue, and the cross-session
reconciliation surface. Machine-to-machine traps cross via the return value; human/cross-session decisions
cross via the on-disk inbox.

---

## 9. The intention as oracle, and the intent-fork arm

Fork-resolving agents (the adjudicator, the route-planner, any agent facing a scope/priority choice) are
**required to cite `.reasonable/intention.md`** when they resolve a fork. (D5b)

- A fork the intention **does** settle → the agent resolves it in-band, cites the clause, records it to the
  ledger, and **does not** ping the human.
- A fork the intention **cannot** settle (no clause covers it, or two clauses conflict) → `intent-fork` →
  the human inbox.

This is the mechanism behind principles.md's "the intention is the oracle" and "an ambiguity neither code
nor intention can settle is a fork → ping/halt, never a silent guess." It is also what keeps human attention
*bounded*: most forks the oracle settles, so they never reach the human; only the genuinely unsettleable
ones do, and each one's answer enriches the intention so the system gets quieter within a stable scope.

---

## 10. Dynamism

**Inter-vertical-slice dynamism comes from re-launching; intra-vertical-slice dynamism comes from looping.** (D6)

- **Between vertical slices:** re-launch a *freshly parameterized* vertical-slice script — fixed, audited **source** plus
  per-vertical-slice **args** (vertical-slice id, route snapshot, contract paths, per-vertical-slice budget, supervision profile, run
  mode). All inter-vertical-slice dynamism (route re-sort, amendments, re-priced siblings, dial change) rides in the
  args. "Freshly generated" means fresh *args*, **never** model-authored JS — a model writing the
  orchestration script would be the governed editing the enforcement layer (§5.14D).
- **Within a vertical slice:** `budget`-guarded loops plus `pipeline()`/`parallel()` — variable iteration *count*,
  fixed *shape* (enrichment iterations, dispatch waves, ripple as a topologically ordered loop,
  retry/checkpoint).

A looping cross-vertical-slice script is banned because it would commit vertical slice N+1's control flow before vertical slice N's
gate produced the feedback that reprices it — the prediction disease through the scheduler door. The split
is mode-independent.

---

## 11. Replay vs. changing state — and the WAL question

**`resumeFromRunId` is demoted off the correctness path entirely.** (D9) It is a pure **speed**
optimization: a same-session cache with zero authority. The sole correctness authority is the
**unconditional reconcile prologue** that re-derives truth from git+ledger+contracts at the start of *every*
run. The pure script carries no freshness logic (it can't — it has no filesystem).

**The args-drop fallback (D18).** That same property — the prologue runs an agent whose cwd *is* the
effort root — is also what makes the run resilient when `args` fails to propagate. Launching the runner by
**registered name** passes `args` reliably; launching by `scriptPath` has been observed to deliver an
**empty `args`** (so `effortRoot` / `verticalSliceId` arrive undefined). Because the pure script can't read
disk, the recovery lives in the *first agent*: when `args` lacks the effort root, the reconciler resolves
it from its own cwd (the nearest `.reasonable/` ancestor) and the open slice from effort state, and returns
both in the BRIEFING; the script threads them into `a` for every downstream stage, and HALTs only if even
that recovery fails. Prefer launch-by-name so the fallback never has to fire — but the run no longer depends
on it.

Reconcile re-derives truth every run rather than trusting any same-session prefix-staleness guarantee. Such
a guarantee would rest on a false premise: the engine caches on `agent()` **call identity** (prompt/args/order),
not on a contract *file* changing under a textually-identical call — so a read-only consumer whose prompt
doesn't embed the contract text **would** be served stale. Since nothing downstream trusts the cache for
correctness, a stale prefix is at worst **slower, never wrong** — reconcile re-derives truth regardless.

### The WAL question

There is **no bespoke WAL** — and the reason is load-bearing.

- **Durability is not "inherited from `resumeFromRunId`" (D8).** `resumeFromRunId` is same-session-only and
  the script is pure — it provides *no* durability across the exact event durability exists for (a crash that
  ends the session). The engine does not give durability for free.
- **No bespoke WAL is needed, for the correct reason.** Git plus the append-only ledger **already are** the
  write-ahead log. Git is itself an intent-then-commit log; the ledger is append-only. There is no separate
  WAL protocol to invent.
- **What that requires.** Git+ledger only *function* as a WAL given two things: (1) the worker's terminal
  effects collapse into **one** atomic commit, so git is never ahead of the ledger (D3a — a separate-scribe
  design would re-create the torn window); and (2) reconcile is a **total, halting** recovery function (D8b —
  see §11). These two — atomic-commit discipline + a halting reconcile — are the durability obligation, not a
  bespoke WAL.

---

## 12. Durability — three non-peer layers

Each layer is checked against the one below it (the §5.6 derivation rule applied to the program counter
itself).

1. **git + ledger = truth.** A git commit is the unit of work; the worker's one atomic commit binds work
   product + ledger line + trailer. No torn window.
2. **`.reasonable/` index (journal/inbox) = derived, rebuildable, non-authoritative.** Written only by the
   lone serialized scribe, write-ahead (`status:'dispatched'` before a worker runs). A null/torn write
   HALTS (D3b) but loses no truth — reconcile rebuilds it from layer 1.
3. **script memory + `resumeFromRunId` = volatile cache, zero authority** (§11). A cold restart discards it;
   nothing trusts it for correctness.

**Cross-session recovery is the only authoritative path and runs unconditionally as every run's prologue**
(crash-only: recovery is the only path, so it is tested every session). Reconcile (D8b —
[reconcile.mjs](../lib/reconcile.mjs)) is a **total function**: it partitions every artifact configuration
into

- **RESOLVED** — downgrade dispatched-with-no-work to pending; re-claim an orphan-in-registered-lane whose
  SHA reconciles and whose atomic commit included its ledger line; merge clean green.
- **SAFE-DEFAULT** — a conservative downgrade that loses no truth.
- **AMBIGUOUS** — an orphan commit whose trailer doesn't match the journal SHA, a ledger entry with no
  commit, two lanes claiming one work order, an absent `config.runMode` → set `{halt:true, haltReason,
  evidence}` and present it to the human as a **blocking** decision. **Never a recovery-time guess.**

**Trailers are hints, not anchors.** DESIGN §5.14B calls Work-Order trailers "convenience, never truth"
(agents can forge them). SHA accounting against the ledger is truth; the trailer is only a re-claim hint.
A trailer is never a recovery *anchor* — SHA accounting is; a trailer mismatch is AMBIGUOUS → halt.

**The checkpoint-commit anchor fix (D8b).** Verified hole: harvest keys on `commitsAhead > 0`
([reconcile.mjs:30-39](../lib/reconcile.mjs#L30-L39)), so a 0-commit checkpoint lane downgrades to pending
and **loses the checkpoint**. Fix: a checkpoint-only lane must persist at least one trailered checkpoint
commit so `commitsAhead > 0` holds; reconcile treats a registered lane with a checkpoint commit and a
matching SHA as a live checkpoint, not pending.

**The commit-custody-window fix (D20).** Point 1's atomic-commit discipline ("work product + ledger line +
trailer in one step") is a *fiction at one instant*: the ledger is gitignored, so it cannot live **inside**
the commit — it is a git commit *then* a separate on-disk append, and a session-limit stop landing between
them strands a real, trailered lane commit with **no** ledger line. reconcile correctly reads that as
unaccounted custody → AMBIGUOUS → HALT (the dual of "a ledger entry with no commit"). Observed in the wild
(sofia-plays graph-editor, 2026-06-27): a fully-committed slice froze a resume behind a halt, and the
natural recovery (re-dispatch) would re-run the whole pipeline — ~20 min of work redone. Fix — *capability
beats discipline*: a **synchronous** `PostToolUse(Bash)` hook ([commit-record.mjs](../lib/commit-record.mjs))
fires the instant a lane commit lands and appends the `{type:"commit"}` custody line **itself**, keyed to the
lane **descriptor** (not the forgeable trailer), idempotent, fail-open. The commit→ledger window shrinks from
minutes (until the agent logs it, or the next wave's journal write) to the hook's own execution and no longer
depends on the agent; reconcile then **reclaims** the commit instead of halting. This is the recovery dual of
the D19 progress mirror: D19's agent-reported action event is an ephemeral presentation *pointer*; the D20 custody line is a
durable recovery *anchor* — one observed write, two readers.

---

## 13. Capability law and worktrees

**The fence does not bind inside an engine-spawned worktree — and today it does not bind inside *any*
descriptor-less location, because it fails OPEN.** This is the headline correction.

The structured-edit path in `fence.mjs` resolves the governing lane with
`findLane(tgt) || findLane(input.cwd)`. When a lane IS found — a code write whose ancestor carries the
descriptor — the existing locus / floor / test-path rules bind. When NO lane is found, the fence does
**not** fail open unconditionally; it branches (D7b + the identity model — citing functions, not line
numbers, so the references survive edits):

- a **canonical `.reasonable/` write** is governed by the worker's harness role (`roleOf(input.agent_type)`)
  against the role×artifact matrix (`governReasonable`) — the control-surface law, detailed in the two-root /
  identity section of `docs/artifacts.md`. This is the mechanism that makes the canonical write governable at
  all: a subagent's cwd is the effort root and the descriptor lives in a sibling worktree, so neither
  `findLane(tgt)` nor `findLane(cwd)` can reach it — the unforgeable `agent_type` stamp can;
- a **subagent code edit outside any lane** is **denied** ("presumed hostile"): `findEffortRoot` is
  reachable, so the edit is inside an active effort with no governing descriptor;
- the **main session** (no `agent_type`) is the trusted control plane and is allowed;
- only when **no effort is reachable at all** (a plain repo / external checkout) is everything allowed.

So the fence fails **closed** for an ungoverned subagent inside an effort, and open only outside one.

**reasonable owns lane lifecycle, not the engine (D7).** A privileged `lane-provisioner` agent runs
`git worktree add` (nesting the worktree at `<effortRoot>/.worktrees/<wo>`), writes `.reasonable-lane.json`
(with the `effortRoot` back-pointer so hooks inside the worktree reach the canonical `.reasonable/`), and
records the lane in the journal **before** the fenced worker is dispatched, **without** `isolation:'worktree'`.
Because a subagent's cwd is the effort root (not the worktree), the worker writes code by absolute path under
the worktree and runs git with `git -C <worktree>`; the descriptor it finds via `findLane(target)` governs
those code edits. This ordering closes the descriptor-less window: the fail-closed rule blocks exactly the
descriptor-less window and engine-spawned worktrees, never a legitimately provisioned worker.

`agent({isolation:'worktree'})` is reserved **only** for ephemeral read-only throwaway work (e.g.
discriminator tests at `HEAD~`) that produces no merged commits. Using it for a lane is forbidden: "auto-
removed if unchanged" would sweep a checkpoint-only lane.

A lane can also be **re-provisioned mid-life**, on the SAME worktree, when its pipeline stage moves to a
new role — most commonly `implementer` → `blind-test-writer` once the implementer's commit + contract
enrichment has landed. The runner calls the lane-provisioner a second time, **unconditionally** (never a
judgment call left to a model), to rewrite `.reasonable-lane.json`'s `role`/`testEditsAllowed`/`locus` in
place before the new role's first tool call; the worktree, its deps, and the journal record are untouched.
This re-applies the same provision-before-fence discipline at the transition, not only at birth — without
it, the new role's first tool call hits the OLD role's descriptor and the fence correctly, but unhelpfully,
denies it as if the worker had gone rogue.

**Locus authority is the immutable main-checkout work-order file**, fence-protected categorically — not the
`.reasonable-lane.json` descriptor (which a desperate worker could otherwise forge). Retained facts: a lane
cannot self-seed its descriptor (`.reasonable-lane.json` is in `ENFORCEMENT_BUILTINS`, and a write to it by
any role other than the `lane-provisioner` is denied); the spike quarantine fence and the per-role test-path
rules — both in `categorical()` — bind as described.

**The script holds zero enforcement authority** and is designed as hostile. The script cannot refuse to emit
an `agent()` lacking an agentType — the substrate gives it no validation hook over its own calls, so that is
author discipline only; the real protection is that a bare `agent()` spawns the
default subagent, which the per-agentType hooks never grant a lane allowlist — so its edits are denied by
**absence of grant**, not by the script.

---

## 14. Run mode, tier, and the supervision dial

**Run mode and tier are the two orthogonal axes the entry skill resolves** — `reasonable:develop` *asks*
both up front (mode: gated | autonomous; tier: full | lite), **never inferred from a standing directive**
(the one-sentence difference between *autonomous* and *unsupervised*). `reasonable:develop-autonomously`
remains a thin alias that presets autonomous. (D10)

- **Writer.** The entry skill writes `{runMode:'gated'|'autonomous', tier:'full'|'lite'}` into
  `.reasonable/config.json`. `config.json` is fence-protected ([effort.mjs:112](../lib/effort.mjs#L112)),
  so an agent cannot self-promote mode or self-lower the tier.
- **Reader.** Reconcile reads `config.runMode` and `config.tier`, includes both in the briefing, and the
  main session re-asserts them into the next launch's args (resolving each slice's effective tier as
  `slice.tier ?? config.tier`). **If `config.runMode` is absent on a cold restart, reconcile HALTS** —
  defaulting to the "safer" mode is still an inference, and the framework forbids inferring mode. An absent
  `tier` is **not** a halt — it defaults to `full` (the safe direction), backward-compatible with efforts
  predating the field.

At each gate the script branches on the carried mode: **gated** → persist an inbox item and **return**;
**autonomous** → the worker appends a `ratification` ledger entry and the run **continues**. The one
exception even in autonomous mode: a **vision/intention amendment** always terminates to the inbox and is
surfaced — autonomy decides the *how*, never silently redefines the *what*.

The **supervision dial** (strict / standard / trusting) is the finer control *inside* gated mode; the entry
skill sets the initial profile (gated→strict, autonomous→trusting), lower phases never override it,
and the retro tunes it. No profile waives a mechanical check.

The **tier** (full / lite) is the orthogonal *depth* axis: it parameterizes per-slice **verification depth**,
not human involvement. `lite` is the §17 audit-depth collapse made user-selectable — the vertical-slice
audit drops only the iterative mutation-sample; it waives no guard, is per-slice overridable in `route.md`
(effective tier `slice.tier ?? config.tier`) and raise-only for agents, and composes freely with either run
mode.

---

## 15. Budget, agent-count, and nesting ceilings

- **Per-vertical-slice budget ≠ the engine's turn pool (D16a).** `budget.spent()` spans the whole turn (main loop +
  all workflows); the per-vertical-slice budget is passed in args. The loop guards on
  `min(per-vertical-slice-remaining, budget.remaining())`.
- **Budget throw → checkpoint, not gap (D16b).** Because the engine *throws* when `spent ≥ total`, every
  `agent()` inside a wave is `guard()`-wrapped so the throw becomes a `{kind:'checkpoint'}` OUTCOME — a
  budget ceiling is never silently read as a verification gap (an implicit pass/fail).
- **1000-agent lifetime cap (D16c).** The route-planner sizes waves so a vertical slice can't plausibly approach
  1000; on approach the script emits a checkpoint-and-split `GATE_RESULT`.
- **One-level `workflow()` nesting (D16d).** This is *why* spikes and the scaffold are launched by the **main
  session**, never inline from the vertical-slice runner. `vertical-slice-runner` cannot call `workflow()` itself.

---

## 16. Trust invalidation — the event

principles.md: trust is earned, persistent, **event-invalidated** — re-verify a trusted-green test only when
its behavior is extended or its governing clause is amended; no re-checking churn. (D13)

Mechanism: the append-only ledger **is** the event log; every enrichment/amendment entry names its component
(verified: `isContractPath`/`contractName` in `lib/fence.mjs` and `contract.mjs` citation parsing). The
route-planner/reconciler computes, from the ledger event stream, the set of trusted-green tests whose
governing clause was amended/extended since their last verification, and marks **exactly those** for
re-verification in the next vertical slice's work orders. The assertion↔clause mapping is the contract's citation,
mechanical, not eyeballed — so this is no blanket re-check, just the specific affected tests.

---

## 17. The low floor and inbox attention

**The low floor is a parameterization, not a second philosophy (D14).** A typo gets the *same*
`vertical-slice-runner` workflow with a minimal route in args: one work order, one wave, the fence active (capability
is scale-free, always on), one discriminator check in the audit stage, no scaffold, no multi-vertical-slice loop.
`reasonable:analysis` triages applicability (DESIGN §7) and emits the floor-case route. "Only machinery
scales" = same workflow, same fence, fewer stages — and the task is still escalatable mid-flight via the
trap if it reveals a seam.

**Inbox attention is bounded and prioritized (D17).** A noisy inbox is a silent failure of the success test
(attention goes *only* to ask + breaking forks). So: every inbox item carries a class — **BREAKING**
(decide before progress: intent-fork, vision amendment, second budget extension, reconcile HALT) vs
**ADVISORY** (logged ratifications in autonomous mode, drift notes). The briefing presents BREAKING first
and merely counts ADVISORY. An **inbox-load tripwire**: if BREAKING items for one vertical slice exceed a threshold,
*that* is surfaced as a meta-signal that the intention is under-specified — routing back to enrich it (the
principled fix for inbox noise, not suppression). `kind:'other'` and per-gate gated-mode terminations are
ADVISORY-batched at the retro, not streamed one-per-event.

For a small **brownfield** change (e.g. adding a confirmation dialog to an existing delete) the same low
floor applies, with one addition: the touched seam is characterized just-in-time before the single
discriminating test, and a legitimately-moved pin is classified as a planned supersession rather than a false
regression. §18 walks the example end to end.

---

## 18. Brownfield — contracts born from existing code

Brownfield is **not a second methodology.** It is one new contract *provenance*, two new roles, and a few
parameters on the same machinery. When an effort has no legacy (`config.brownfield` unset, `baseline.json`
empty), every mechanism below is a no-op, so the greenfield path of §1–17 is untouched — "one foundation,
both ends."

**The reframe (Feathers).** Greenfield clauses are *born RED at a gate* — assert what the code should do,
watch it fail, make it pass. Brownfield clauses are *born GREEN by characterization* — pin what the code
already does. Same ratchet, run from the opposite end. A characterization test is how a contract is born in
legacy code; a Feathers *seam* is a fence locus. (DESIGN §3 ancestry gains Feathers as the brownfield analog
to GOOS.)

### Contract genesis — born GREEN, just-in-time, after intent (BF1, BF4, BF9)

A clause now carries a **provenance**: `grown` (greenfield default, born RED at a gate) or `characterized`
(brownfield, born GREEN by observation, **untrusted**). A characterized clause carries
`- Provenance: characterized (test: <name>, seam: <locus>)`, parsed by a one-regex twin to the existing
`- Gate:` extractor ([contract.mjs:39](../lib/contract.mjs#L39)); when the touching change intends to move
it, also a `- Supersession: pending` line. (Verified: the ledger grammar today carries no clause provenance,
so this is the missing carrier — without it a characterized *bug*-clause would inherit trusted-green status.)

Genesis runs in two layers with different cadences (the §5.4 cost-asymmetry split, extended):

- **Topology census, up front (cheap, observed).** A read-only `census` pass reads the import graph and
  emits one skeleton contract per component: `## Topology` filled with `- Depends on:` *prose*, `## Clauses`
  **empty**, **zero `## Citations` bullets**. Only Citations bullets feed the footprint closure, so prose
  deps keep an untouched neighbour's footprint weight at **zero** — the citation closure cannot explode into
  whole-codebase governance.
- **Characterized behavioural clause, just-in-time at first touch — and *after* the change declares its
  `behaviorDelta`.** When a vertical slice first touches a component, the implementer first records a
  `behaviorDelta` (the observable behaviours this change intends to move). Only then does the `characterizer`
  pin current behaviour, stamping `supersession: pending` on any clause the `behaviorDelta` names. Ordering
  matters: pinning *before* the change is designed would freeze exactly the behaviour the change is about to
  alter — the prediction disease in miniature. The closure grows by demand-driven characterization at the
  seam (O(seams crossed), never O(call graph)): a characterized clause adds a Citations bullet only for the
  specific neighbour the change actually consumes, and that neighbour then gets its own one-clause pin.

### Real teeth for a characterization test (BF2)

A characterization clause is admissible only if its test (a) **passes on unmutated HEAD** and (b) goes
**RED, when run alone**, under at least one locus-scoped source mutant. This **reverse discriminator** is the
exact dual of greenfield's "RED at HEAD~." It lives in `discriminator.mjs`, reusing that file's
single-test overlay — the locus stack's `oneCommand` with `{test}` interpolated (`oneTemplate.replace('{test}', testName)`,
selected per stack so a `.py` locus runs pytest and a `.ts` locus runs the TS runner — a locus spanning
two stacks fails loud, verified [discriminator.mjs:185](../lib/discriminator.mjs#L185)). It explicitly does **not** delegate to
`mutation-sample.mjs`, which (verified [mutation-sample.mjs:98](../lib/mutation-sample.mjs#L98)) runs the
*whole suite* and reports only suite-wide survivors — on a covered legacy repo that would pass vacuously for
every characterization test, proving the *suite* has teeth, not the new test. The relocation keeps Feathers'
"pin what is, not what should be" mechanical **and per-test**.

### The trust model — three statuses (BF3, BF8)

principles.md: legacy/un-governed green is untrusted by default; the invariant's *no-more* includes
*no-regression*. The apparent paradox ("untrusted, yet its green gates me") resolves by splitting **trust**
from **gating**:

- **TRUSTED** — adversarially-checked (discriminator + mapping + mutation). Earned, persistent,
  event-invalidated. (unchanged)
- **FLOOR** — the existing suite. Earns **zero** correctness credit, but breaking it is a forbidden
  regression, so it is held green as a **containment fence**. Each floor test carries a captured locus.
- **UNKNOWN** — existing behaviour no test pins at all (the dark matter). Characterized on demand; explicitly
  **outside** the pre-merge floor guarantee.

**Green at a brownfield gate is a conjunction:** `computeGreen = floorGreen && trustedGreen`. This rejects
DESIGN §10's old "declare existing suites as promoted gates" — that is trust-by-assertion (a wholesale-
promoted legacy test maps to no clause, so the bidirectional-mapping audit cannot pass). A FLOOR test is
**promoted to TRUSTED one at a time**, by citing a characterized/enriched clause and surviving the pipeline
(including the BF2 reverse discriminator), logged as a `characterization-promotion` event.

**Floor containment is a real prevent-before fence, not detect-after.** `.reasonable/baseline.json` (new,
machine-parsed, added to `enforcementPaths`) stores per floor test `{id, locus (file-glob over-
approximation), fileHash}`. The fence treats the union of floor loci like a declared locus: an undeclared
src edit intersecting it is denied unless the lane declares `floorImpact`. Floor **integrity** in reconcile
uses a *stable* invariant (per-test fileHash + locus vs. the last accounted `characterization-promotion` /
`change-characterized` / declared-`floorImpact` event) — an unaccounted floor change is AMBIGUOUS → HALT.
This is a **new reconcile pass**, not a fold into the commit-only D8b partition (floor integrity is a
test-set property, not a commit property).

### The two-oracle collision — the confirmation-dialog case (BF6, BF9)

The hard case brownfield must handle: a change that **legitimately moves pinned behaviour** (deletion used to
return `Ok` immediately; now it returns `Pending` until confirmed). The new grown test contradicts the
characterized floor pin. Resolved **mechanically**, not by eyeball: `toGateResult` consults the slice's
`behaviorDelta` and the loci of its new grown RED-at-HEAD tests. A floor break where (a) the change declared
a matching `behaviorDelta` **and** (b) a new grown test now governs that locus is a **planned supersession**
→ the advisory `change-characterized-planned` ceremony, **not** a regression. A floor break with neither is
an **unforeseen regression** → BREAKING. So enrichment from a characterized baseline has three moves:

- **PROMOTE-TO-GROWN** — a gate now demands the behaviour; the clause sheds `characterized`, gains a Gate
  line, runs the normal pipeline (trust-conferring).
- **AMEND-CHARACTERIZED** — the change deliberately alters legacy behaviour *undeclared* — human-gated, like
  a ratchet weakening.
- **SUPERSEDE-PLANNED** — an amend the implementer **declared** up front via `behaviorDelta` —
  advisory-batched, not per-edit BREAKING.

Adding new behaviour *beside* characterized behaviour (Feathers' sprout/wrap) is free enrichment. This split
is what stops routine behaviour-changing edits from flooding the human inbox (the attention-bounded success
test).

### The entry flow (BF7)

Triage gains a **fourth engagement trigger**: *ungoverned existing code touched/risked by a change.* When it
fires, `config.brownfield: true`. The phase flow is **one slot swap, not a new tree**:

- **analysis** — triage → brownfield verdict; the `census` emits the topology census and partitions the
  existing suite into `baseline.json` (FLOOR, untrusted, per-test locus + fileHash). The coherence-grill
  **still runs** — its oracle is the *change*-intention, and the existing legacy behaviour becomes an extra
  fork source the grill-adversary mines (legacy incoherence — module A rounds half-up, B half-even —
  surfaces as an `intent-fork`). This answers "there's no vision to grill": the *change* has an intention
  even when the legacy system embodies none.
- **scaffolding (brownfield mode)** — there is no walking skeleton to build (the system already walks), so
  the slot's job becomes a **read-only frontier inventory**: a main-session
  `characterization.workflow.js` runs `census` (read-only on code) to enumerate **only the frontier**
  observable scenarios (route-intended / integration-risk — not the whole surface) and record them as
  a thin prose `## Scenarios` map in the existing skeleton contracts. It writes **no parked test and
  no born `characterized` clause** — every tooth (born clause + parked test + BF2 reverse
  discriminator + intent-verifier) is **deferred to first-touch genesis**. This is the cost-asymmetry
  split made literal: cheap, frontier-scoped observation up front; expensive, demand-driven pins lazy
  at the seam. The FLOOR (`baseline.json`) is unchanged, so regression protection is identical — only
  the *timing* of behavioural pins moves from eager to lazy.
- **vertical slices** — the **identical** runner/pipeline/trap/retro loop, plus a conditional first stage: a
  `characterization-needed` OUTCOME arm that, on first touch of ungoverned code, records the `behaviorDelta`
  and dispatches the characterizer provider-first. **This genesis runs as an in-run agent sequence inside the
  running vertical-slice-runner — not a nested `workflow()`** (the one-level nesting limit forbids it; this
  parallels DESIGN §5.10's "extraction is a ripple with a birth in it"). `characterization.workflow.js` is
  used only for the analysis-time frontier inventory pass, launched from the main session — and is **the
  sole birthplace of a `characterized` clause**.

### The low floor, brownfield (the worked example, now resolved)

"Change user deletion so it requires confirmation" runs as **one work order**: triage → brownfield + the §17
low floor (no multi-vertical-slice loop, no full coherence-grill); the implementer declares
`behaviorDelta: [delete now defers until confirmed]`; a read-only seam pass sets the locus; the characterizer
pins current deletion behaviour (the return-path pin born `supersession: pending`, the untouched audit-log
pin born plain), each admitted by the BF2 reverse discriminator; one blind-written grown test for the new
behaviour (RED on HEAD~, full teeth); the two-oracle collision is classified as a *planned supersession*, not
a regression; the gate = the new test GREEN **and** every floor test except the superseded one GREEN. The
oracle is a **micro-intention** (`scope: micro` — the change sentence + behaviorDelta + the touched seam's
born contracts), ratified in one nod at the single retro. No full grill for a one-line ask. This is the
scale-free promise of §17 finally delivered for brownfield.

### Two new roles (BF5)

- **`census`** (read-only) — runs once at analysis: scans the dep graph → skeleton topology contracts (zero
  clauses, zero citations); partitions the existing suite → `baseline.json`. The initial trusted set is
  empty.
- **`characterizer`** (fenced mutator) — read-only on production code (it **must** read code, so it is the
  structural *inverse* of the blind-test-writer and cannot be blinded); writes only born `characterized`
  contracts (gated on `lane.contractBirth`) and parked characterization tests, in the fixed atomic order
  *contract → ledger event → test* (the write-ordering that avoids a fence deadlock). Its unavoidable
  anchoring leak is contained by a one-way membrane: downstream re-entry into the trusted set is
  rewrite-from-contract, never read-the-legacy-code (the spike's rewrite-from-knowledge rule).

### Honest scope (stated, not buried)

The floor protects only **pre-tested** legacy behaviour. UNKNOWN (untested) behaviour — the bulk of a typical
legacy repo — gets **no pre-merge regression protection**; a regression there is caught only post-merge via
the DESIGN §5.14A backward path. principles.md's no-regression is unqualified, so this narrowing is named
here and in DESIGN §10, not hidden. Two residuals remain, both brownfield twins of principles.md's
irreducible residual: a characterization test can faithfully **pin a bug** (no internal tell — caught only by
the human three-way classification at the birth-ratification gate, or a downstream discovery), and there is
**no mechanical completeness check** for characterization (you cannot discriminate against behaviour you
never pinned).

---

## 19. The script topology

Twelve greenfield components, plus three brownfield ones (gated on `config.brownfield`, §18). Workflows are
`*.workflow.js`; the rest are agents, the pure script's own structures, or main-session skills.

| Component | Kind | Responsibility |
|---|---|---|
| **`reasonable:analysis`** | main-session skill | grill the vision → intention; pre-drain obvious forks; launch the coherence-grill; ratify `intention.md`; triage applicability; emit the initial route |
| **`coherence-grill.workflow.js`** | workflow (adversarial loop) | `while(true){ a = agent(grill-adversary, FORKS_OR_NONE); if(no-fork) break; return forks-to-human }` (each batch = independent forks at the highest open altitude tier) then an `intention-writer` worker persists `intention.md` atomically |
| **`scaffold.workflow.js`** | workflow (short pipeline) | walking skeleton + parked scenario suite, real wiring, thin behavior → invariant-verify (read-only) → scribe; ends at scaffold sign-off (main session takes it) |
| **`vertical-slice-runner.workflow.js`** | workflow (one run per vertical slice) | the pure in-run plane: reconcile prologue → route-planner (footprints + resources + staleness) → `groupDisjoint` → per wave the enrichment `pipeline()` → trap `switch` → scribe the derived index → return a typed `GATE_RESULT` |
| **enrichment pipeline** | `pipeline()` inside vertical-slice-runner | `pipeline(workOrders, provisionThenImplement, blindTest, adjudicate, audit)` — no barrier; the implementer worker writes its own ledger line in its atomic commit; the adjudicator cites the oracle; each call `guard()`-wrapped |
| **adversarial fan-out** | `parallel()` leaf (barrier) | the auditor's escalating checks run together (gate = AND over all): discriminator + bidirectional-mapping per enrichment, mutation sampling at the vertical-slice gate; read-only, no worktree isolation; collapses to one discriminator at the floor |
| **trap router** | pure JS `switch` (not an agent) | maps each OUTCOME kind to its pre-written membrane crossing (§8); never throws on a trap |
| **`lane-provisioner`** | privileged narrow agent | `git worktree add` + write `.reasonable-lane.json` + record the lane — before the worker; idempotent; ensures a checkpoint-only lane has a trailered commit |
| **`journal-writer` (scribe)** | the script's single derived-index hand | writes only `journal.json` + `inbox.json`; serial, awaited; null return → HALT (§6) |
| **reconcile** | agent wrapping rewritten `lib/reconcile.mjs` + SessionStart hook | the unconditional, total, halting recovery prologue (§12); reads `config.runMode`; computes the trust-staleness set |
| **main-session orchestrator** | entry/phase skills (the human decision plane) | `reasonable:develop` (asks mode + tier) / `:retro`: write `config.runMode` + `tier`, run reconcile, present the briefing (BREAKING first), block for the human in gated mode, apply route re-sort + amendment batch + intent-check records at the retro, then re-launch the next vertical slice; launch spike/scaffold (never inline) |
| **`spike.workflow.js`** | workflow (single timeboxed agent) | quarantined falsifiable spike → knowledge artifact; spike-runner path-fenced to quarantine (the quarantine rule in `fence.mjs` `categorical()`); launched by the main session (nesting limit) |
| **`census`** *(brownfield, §18)* | read-only agent | once at analysis: dep-graph → skeleton topology contracts (zero clauses/citations); partition the existing suite → `baseline.json` (FLOOR, untrusted) |
| **`characterizer`** *(brownfield, §18)* | fenced mutator agent | read-only on src; pins current behaviour as `characterized` clauses + parked characterization tests, just-in-time at first touch, after the implementer's `behaviorDelta` |
| **`characterization.workflow.js`** *(brownfield, §18)* | workflow (short pipeline) | analysis-time **frontier inventory** pass — read-only `census` records a prose `## Scenarios` map of the frontier; **no teeth** (deferred to first-touch). First-touch genesis is the in-run agent sequence in the vertical-slice-runner. |

`vertical-slice-runner` sketch (shape, not final code):

```js
export const meta = { /* pure literal */ }
const state = await agent(reconcilePrompt(args), { agentType:'reasonable:reconciler', schema:BRIEFING })
if (state.halt) return { kind:'halt', reason: state.haltReason }
const plan = await agent(routePrompt(state, args), { agentType:'reasonable:route-planner', schema:DECOMPOSITION }) // THIN: cut + locus + contract SEEDS (no closure)
await persistWorkOrders(plan, args)            // narrow writer -> immutable specs (D7)
const fp = await agent(footprintPrompt(ids, args), { agentType:'reasonable:footprinter', schema:FOOTPRINT_REPORT }) // decidable fence: footprint.mjs over the specs -> closure + independence
const waves = groupDisjoint(attachFootprints(plan, fp)) // pure set-algebra: locus | contract | resource
let verticalSliceGreen = false
while (!verticalSliceGreen && withinBudget(args, budget) && withinAgentCap()) {
  for (const wave of waves) {
    const outcomes = await pipeline(wave.workOrders, implementStage, blindTestStage, adjudicateStage, auditStage)
    for (const o of outcomes.filter(Boolean)) state = route(o, state, args.mode)   // the trap switch
    const ack = await journalWrite(state)      // serial; the script's only derived-index write
    if (ack === null) return { kind:'halt', reason:'scribe-null: index not persisted' }
  }
  verticalSliceGreen = computeGreen(state)
}
return toGateResult(verticalSliceGreen, state, budget)  // green | budget-exhausted | blocked
```

---

## 20. Roles and allowlists (the agentType lattice)

All bind identically whether spawned by the Agent tool or `agent()` (same registry); the capability comes
from the per-agentType allowlist + the PreToolUse hooks, never the script.

- **Read-only verifiers:** `reconciler`, `route-planner`, `adjudicator`, `auditor`, `skeptic`,
  `retro-synthesizer`, `grill-adversary`, `census` (brownfield).
- **Fenced mutator workers** (reasonable-owned worktree, own-ledger-line atomic commit): `implementer`,
  `blind-test-writer` (tests only), `scaffolder`, `intention-writer`, `characterizer` (brownfield —
  read-only on src; born-contract + characterization-test writes only), `spike-runner` (quarantine only).
- **Privileged narrow:** `lane-provisioner` (git worktree + descriptor write only), `journal-writer`
  (derived index only).

The full set spans the verifiers, fenced mutators, and privileged-narrow roles above — including
`grill-adversary`, `intention-writer`, `lane-provisioner`, `journal-writer`, `reconciler` (a dispatched
agent wrapping the reconcile lib), and — for brownfield — `census` and `characterizer`.

---

## 21. The mechanism inventory

Each mechanism, the gap it closes, and the decision that governs it.

| # | Mechanism | Gap it closes | Decision |
|---|---|---|---|
| 1 | **Fence fails closed inside an effort** — `findLane` null → `findEffortRoot`; deny an ungoverned subagent, govern a `.reasonable/` write by `agent_type`, allow the main session (the no-lane branch in `fence.mjs`) | was unconditional fail-open | D7b |
| 2 | **reconcile = total halting function** (RESOLVED / SAFE-DEFAULT / AMBIGUOUS→halt) | never halts ([reconcile.mjs](../lib/reconcile.mjs)) | D8b |
| 3 | **Checkpoint-only lane persists a trailered commit**; reconcile anchors on it | harvest keys on `ahead>0`, loses 0-commit checkpoints | D8b |
| 4 | **Worker writes its own ledger line in its atomic commit**; scribe writes only the derived index | orchestrator writes both via lib | D3 |
| 5 | **`config.runMode` field** + reconcile reads it + absent→halt | no run-mode field anywhere | D10 |
| 6 | **`intention.md`** + the coherence-grill workflow + add to `enforcementPaths` | does not exist | D15 |
| 7 | **Fork-resolving agents cite the intention oracle**; `intent-fork` OUTCOME arm | no oracle, no arm | D5b |
| 8 | **Intent-check-failure ledger entry** recorded at the retro | does not exist | D18 |
| 9 | **The `vertical-slice-runner` / `coherence-grill` / `scaffold` / `spike` workflow scripts** + the OUTCOME/GATE_RESULT schemas + `guard()` wrapper | orchestration was main-session prose | D4, D5, D16b |
| 10 | **New agentTypes:** `grill-adversary`, `intention-writer`, `lane-provisioner`, `journal-writer`, `reconciler` | partial | §20 |
| 11 | **Trust-staleness set** computed from ledger events by the route-planner | not computed | D13 |
| 12 | **Inbox BREAKING/ADVISORY classes** + load tripwire | flat inbox | D17 |
| 13 | **Clause `provenance`** (`grown`\|`characterized`) + `Provenance`/`Seam`/`Supersession` parser twins; `characterized` excluded from the trusted set | no clause provenance | BF1 |
| 14 | **Reverse discriminator** mode in `discriminator.mjs` (single-test: mutate the clause locus at HEAD, run only that test, require RED) | only HEAD~ absence-mode | BF2 |
| 15 | **`baseline.json`** + the `census` role (topology census + floor partition with per-test `{id, locus, fileHash}`) | does not exist | BF3/BF4 |
| 16 | **Floor-containment fence rule** (union of floor loci treated as a declared locus; `floorImpact` opt-out) + `baseline.json` in `enforcementPaths` | fence is path-glob only | BF8 |
| 17 | **Floor-integrity reconcile pass** (per-test fileHash+locus vs. accounted events → AMBIGUOUS→HALT) | reconcile is commit-only | BF8 |
| 18 | **`behaviorDelta`** field + two-oracle collision classifier in `toGateResult` + ledger events `characterization` / `characterization-promotion` / `change-characterized[-planned]` | none | BF6/BF9 |
| 19 | **`characterizer` role** + `characterization.workflow.js` + the in-run `characterization-needed` genesis prologue | does not exist | BF5/BF7 |
| 20 | **Triage fourth trigger** (ungoverned code touched) + `config.brownfield` + `scope:micro` intention | greenfield-only triage | BF7 |

Items 13–20 are brownfield and are no-ops when `config.brownfield` is unset (§18).

Foundational modules these build on: `footprint.mjs` (resources + `independent()`), `contract.mjs` (citation
graph), the enforcement/quarantine/test-path fence rules, `effort.mjs` helpers (`findEffortRoot`, config
load, `enforcementPaths` incl. `config.json`).

**Versioning.** The plugin version — `.claude-plugin/plugin.json` and the `vanillafairy` marketplace entry —
tracks the methodology generation, not the build count.

---

## 22. Design lineage

reasonable's orchestration is a *pure script* (orchestration) + a *worker-owned ledger* (authoritative
durability) + a *serialized scribe* (derived index) + a *reconcile gate* (recovery). This replaced an
earlier generation in which the orchestrator was prose a main-session model interpreted by hand — the
weakest-built layer, now a deterministic engine. Durability is reasonable's own (git + ledger + reconcile),
not the engine's; the intent half (coherence-grill, the intention oracle, the intent-check defeater) is
first-class.

---

## 23. Settled defaults

| Fork | Resolution |
|---|---|
| **Orchestration path** | **One path** — the pure vertical-slice script on Dynamic Workflows (§2). |
| **Cross-vertical-slice parallelism** | **v1 default: one vertical slice in flight** (parallelism spends feedback). Growth path: a thin top-level parent run fanning out concurrent vertical-slice-runs and re-converging at a joint retro — must be launched by the main session (one-level nesting), route-planner-judged. |
| **Out-of-band contract mutation** | **v1 default: rely on reconcile re-deriving** every run (resume is non-authoritative, so a stale cache is slower-never-wrong). Revisit only if dogfood shows out-of-band edits are frequent enough that wasted re-derivation hurts. |
| **Reconcile halt threshold** | **v1 default: conservative** — anything not provably RESOLVED/SAFE-DEFAULT halts to the human (a halt is cheap; a wrong auto-resolve is silent rot). Tighten toward permissive only as dogfood proves specific configurations unambiguous. Deliberately *not* coupled to run-mode (recovery correctness must not depend on supervision appetite). |
| **Brownfield: risk-set scope** (§18) | **v1: characterize the seam's observable boundary only.** Deeper regressions route through the §5.14A backward path; a non-gating "characterization coverage" advisory at the retro flags thin spots. No mechanical completeness check exists — the brownfield twin of the irreducible residual. |
| **Brownfield: floor-locus granularity** (§18) | **v1: per-file over-approximation** (matches the glob-based fence + footprint algebra; forfeits convenience, never correctness). Growth path: lazily-computed real coverage for the floor tests a slice's locus intersects. |
| **Brownfield: ratification threshold** (§18) | **v1: born clauses advisory-batched**; only auditor/characterizer-flagged suspicious pins go BREAKING. `behaviorDelta`-first ordering already removes the largest inbox-flood source; the exact threshold is calibrated by the brownfield dogfood. |
| **Brownfield: census role count** (§18) | **v1: one folded `census` role** (topology-read + floor-partition); the `characterizer` stays separate (a fenced mutator with an anti-anchoring constitution). Split into `topology-reader` + `baseline-classifier` if separation-of-concerns outweighs role count. |
| **Brownfield: reverse-discriminator sampling** (§18) | **v1: RED under one sampled locus mutant suffices** (the dual of greenfield's single RED-at-HEAD~). Promote to a k-sample threshold only if the dogfood shows weak pins slipping through. |

---

## 24. Proof is in use

By the framework's own first principle, construction settles only whether the design is *sound*, never
whether it *works* — that is settled in practice, by the dogfood efforts that drive the whole loop:
intention → coherence-grill → scaffold → vertical slices → adversarial verification → breaking discovery →
enrich. Brownfield carries its own proof obligation: the §18 mechanisms — the per-test reverse discriminator,
floor containment, `behaviorDelta`-ordered pinning, the floor-integrity reconcile pass — are exercised only
by a real legacy-codebase effort. The honest status stays exactly what principles.md says: a design is
proven by use, which is where it now lives.
