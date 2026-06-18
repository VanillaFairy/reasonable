---
name: vertical-slice-execution
description: Use to drive one vertical slice of a reasonable effort to GREEN — the orchestrator checklist for launching the vertical-slice-runner workflow and routing its typed GATE_RESULT (green→retro, budget-exhausted→extend/re-plan, blocked→decide, halt→human), plus the membrane crossings the runner returns to you (spikes, dead-end ceremonies, ripple escalations, the approval inbox, lane merges, journal reconciliation). Rigid orchestration checklist — follow exactly.
---

# Vertical Slice Execution Phase

## Overview

This is the main-session decision plane, run **in the main session** (the runner can't block on a
human or launch another workflow). It drives one vertical slice — a user-visible scenario — to GREEN
end-to-end by **launching `workflows/vertical-slice-runner.workflow.js`** and **routing the typed
`GATE_RESULT`** it returns. You no longer hand-interpret the dispatch loop: the runner is the pure
in-run plane (reconcile → route-planner → `groupDisjoint` → per-wave enrichment `pipeline()` → trap
`switch` → scribe), and the control flow there is a **script, never improvised** (§7, §8). Your job is
the membrane: launch, route the result, and do the things the runner cannot — block on the human,
launch nested workflows (spike/scaffold), merge lanes, and reconcile the journal.

## Mode behavior (gated vs autonomous)

Read `mode` from `.reasonable/config.json` (set by `reasonable:run` / `reasonable:run-autonomously`)
and pass it to the runner in `args.runMode`. Approval gates (the inbox, merges, second budget
extensions) behave by mode — **gated**: they **block** for an explicit human nod (*silence never
consents*); **autonomous**: decide, **log** to the ledger (`approvedBy:"autonomous"`), and proceed
without blocking. The runner enforces this distinction inside its trap router; you enforce it at the
membrane crossings it hands back. In **both** modes the full enrichment pipeline (implement → blind
test → adjudicate → audit) and every mechanical gate check (discriminator, mutation sampling, sanity,
mapping) runs inside the runner — **the protocol is absolute**, never streamlined. A **vision
amendment** always routes to the human regardless of mode.

**Announce at start:** "Using vertical-slice-execution to drive vertical slice <id> to GREEN."

**Rigid skill — one TodoWrite item per numbered step; do not skip or reorder.**

**You are the single writer of *nothing* during the run** — the runner's lone serialized `journal-writer`
scribe owns the derived index (`journal.json` + `inbox.json`) while the run is in flight. You write the
journal only at the membrane: before launch (slice opening) and after the run returns (merges, slice
closing). Inside the run, you reconcile and read; you never co-write the index.

(`${reasonable}` in the commands below = this plugin's root directory — `$CLAUDE_PLUGIN_ROOT` in
hooks; substitute the installed absolute path when you invoke a script.)

## 0. Open the vertical slice
- Confirm exactly **one vertical slice in flight** (the default; cross-vertical-slice parallelism is opt-in, see §6).
- **Promote** the vertical slice's gate just-in-time (remove the ignore marker). Run the suite; confirm the
  gate is **RED** (open) and everything else is green. A gate that's already green pins nothing —
  investigate before proceeding.
- Record the slice opening in the journal (the last write you own before the run takes over the index).

## 1. Launch the vertical-slice-runner workflow
- Launch `workflows/vertical-slice-runner.workflow.js` with `args`: `effortRoot` (the main checkout,
  native path), `verticalSliceId`, the `route` snapshot, the contract paths, the per-slice
  `budget.total`, the supervision `profile`, `runMode`, and the brownfield flags (`brownfield`,
  `lowFloor`). The Workflow call returns **immediately** with a run id; the run executes in the
  background and notifies you on completion.
- **The runner is the loop — do not re-implement it.** Inside, deterministically and per the spec: it
  runs the reconcile prologue (HALT on AMBIGUOUS), dispatches the `route-planner` (footprints +
  resources + trust-staleness), packs work orders into disjoint waves via pure set-algebra
  (`groupDisjoint`, mirroring `lib/footprint.mjs` `independent()`), and per wave runs the enrichment
  `pipeline()`. Trust the typed return; verify evidence at §5/§7, never by re-running the wave logic
  yourself.
- **Crash recovery:** if the run dies mid-flight, relaunch with `{scriptPath, resumeFromRunId}` in the
  **same session** (the longest unchanged `agent()` prefix replays from cache). A cold restart cannot
  replay — re-launch fresh; the runner's reconcile prologue re-derives truth from git + ledger +
  contracts (no truth is lost; the derived index is rebuilt).

## 2. The enrichment pipeline (what the runner realizes — do not run it by hand)
The runner sequences this per contract, in the one order that closes three rot vectors. The naive
`implement → update contract → update tests → make green → audit` rots; this order doesn't. You do not
drive these stages — you read this so you can interpret the `GATE_RESULT` and the ledger:

1. **Provision + implement.** The `lane-provisioner` creates the worktree + `.reasonable-lane.json` +
   journal record *before* the fenced worker (closes the descriptor-less window). The `implementer`
   then builds thin-real on path, loud stubs off path, **writes its own contract enrichment + ledger
   line in its one atomic commit**, and emits an `OUTCOME`. (Rot guard 3: the contract is written by
   the implementer fresh from the code, so the **retro** reviews contract diffs at intent level.) On a
   brownfield first touch the runner folds in the in-run `characterizer` genesis (provider-first, after
   the implementer's `behaviorDelta`) — an **agent sequence, never a nested `workflow()`** (one-level
   nesting forbids it).
2. **Blind test.** The `blind-test-writer` — a *fresh context* — gets **only** the old and new contract
   text. It never sees the implementation or the diff; it has no Bash. (Rot guard 1: tests written
   looking at code assert what the code does.)
3. **Adjudication fork.** The runner runs the tests; for each red it dispatches the read-only
   `adjudicator` with the failing test + the contract clause as the sole arbiter: *implementation
   violates contract* → fix the implementation (test untouched); *test mistranslates a clause* → fix
   the test, citing the clause. (Rot guard 2: green-ness is never the goal of test-editing; most reds
   are impl-bugs.) A scope/jurisdiction fork cites `.reasonable/intention.md` (the oracle).
4. **Audit** (`adversarial-audit` skill), as a read-only `parallel()` leaf, escalating: **(a)**
   discriminator per enrichment (new tests must FAIL at the pre-task commit); **(b)** bidirectional
   mapping; **(c)** mutation sampling at the **vertical-slice gate**; **(d)** reverse discriminator for
   characterization clauses. Gate = **AND over all checks**. Collapses to one discriminator at the low
   floor.

The pipeline uses `pipeline()` (**no barrier**): a fast-trapping lane is triaged the instant its chain
returns, not after the slowest lane.

## 3. Routing the typed GATE_RESULT (your core job)
When the run completes it returns exactly one tagged `GATE_RESULT` (§7). Switch on `kind` and run the
matching arm — **this replaces hand-interpreting the loop**:

```
GATE_RESULT =
  | { kind:'green',            evidence }               // → §7: close the slice, invoke the retro
  | { kind:'budget-exhausted', progress, lastOutcome }  // → §3a: extend budget / re-plan
  | { kind:'blocked',          outcome }                // → §3b: a trap needs a human decision
  | { kind:'halt',             reason }                 // → §3c: durability/reconcile halt → human
```

`green`, `budget-exhausted`, `blocked`, and `halt` are genuinely **different human decisions** with
different shapes — "returned green" and "ran out of budget mid-slice" must not masquerade as each
other. Do not collapse the arms.

### 3a. `budget-exhausted` — extend or re-plan
The budget-guarded loop ran out before GREEN (the common hard-slice exit, first-class on purpose).
Triage from `progress` + `lastOutcome`: **extend once** (logged; a second extension needs retro
approval) and re-launch the runner with a larger `budget.total` / **re-spec** / **spawn a spike**
(§3b) / **route a contract question** / **open a dead-end ceremony** (§4). The standard second move is
a **fresh-context retry** — re-launch the runner; it re-dispatches to a *new* implementer carrying only
the progress verdict, never the failed transcript. **Two independent budget exhaustions auto-promote to
the dead-end ceremony** (cross-context attempts are nearly independent — stronger evidence than one
agent's ten tries).

### 3b. `blocked` — a trap needs a human decision (the runner's BREAKING crossings)
The runner returns `blocked` when a trap arm hit a wall it cannot cross from inside a single run.
Inspect `outcome.kind` and act:
- **`spike-needed`** → the runner cannot call `workflow()` (one-level nesting). **You launch
  `workflows/spike.workflow.js`** in a quarantine workspace. Harvest its knowledge artifact through the
  retro; the slice implementer later does **rewrite-from-knowledge**, never reads the spike code. Then
  re-launch the runner.
- **`infeasible`** (dead-end claim) → run the **dead-end ceremony** (§4): dispatch a fresh `skeptic` to
  refute before binding anything.
- **`intent-fork`** → an ambiguity neither code nor `intention.md` can settle → **human inbox
  (BREAKING)**; in gated mode block for the decision, in autonomous mode this is the one class that
  still routes to the human (it can turn on a vision/scope choice). A **vision amendment** always
  routes to the human regardless of mode.
- **`other`** → an unknown wall the schema can't name → **human inbox (BREAKING)**; fail-safe.
- **`unforeseen-regression`** (a floor break the change did not declare via `behaviorDelta`, mechanically
  classified by `toGateResult`'s two-oracle classifier) → BREAKING; present the broken floor tests and
  block. (A *planned* supersession — declared `behaviorDelta` + a new grown test now governing the
  locus — rides along as **advisory**, batched at the retro, not blocking.)

The runner's in-run trap router already handled the **machine-to-machine** arms (`scope-expansion`
grant/inbox, `ripple` resequencing, `jurisdiction` adjudication, `checkpoint` budget triage) by
steering its own budget-guarded loop — those do not surface here. You only handle the BREAKING
crossings it returns.

### 3c. `halt` — durability / reconcile halt → human
The reconcile prologue found an **AMBIGUOUS** configuration (or the scribe could not persist the
index). Truth is intact — reconcile rebuilds the derived index from git + ledger + contracts. Present
`reason` to the human; do **not** guess a recovery state (defaulting to a "safer" mode is a forbidden
inference). Resolve the ambiguity, then re-launch.

## 4. Spikes & dead ends (information vs. walls)
- **Mid-slice spike** (surfaced as a `blocked` / `spike-needed` `GATE_RESULT`): **you** launch
  `workflows/spike.workflow.js` (a `spike-runner` in a quarantine workspace) — never explore in-slice,
  and the runner cannot launch it (nesting limit). Harvest its knowledge artifact through the retro; the
  slice implementer later does **rewrite-from-knowledge**, never reads the spike code.
- **Dead end** (`infeasible`): an infeasibility claim must meet the evidence standard (approaches
  tried, binding constraint named, minimal repro). Dispatch a fresh **`skeptic`** (timeboxed) to
  refute. Only a **refutation-surviving** verdict binds → append a `verdict`/`dead-end` to the ledger
  **with the work-order hash** (the redispatch guard keys on it); the route-planner re-prices siblings.
  Before re-dispatching any previously dead-ended work order, the runner's route-planner runs
  `node ${reasonable}/lib/redispatch-guard.mjs <wo-id>` — blocked unless an input changed.

## 5. Ripple resolution (what the runner sequences — escalate only the cycles)
A ripple manifest names the affected contracts/clauses and enrichment-vs-amendment per change. The
runner resolves it **inside the run** as a **topologically ordered sequence of single-contract pipeline
runs**, not one transaction (parity holds at every commit):
- **Enrichments flow provider-first** (B gains the capability through the full pipeline, then A builds
  on it).
- **Amendments flow consumer-first** (every consumer stops relying, then the provider weakens — no
  citation ever dangles; verified with `lib/citation-resolve.mjs`).
- The **vertical-slice gate umbrellas the joint result** before any merge.
- **Extraction is a ripple with a birth:** the new component is born first (contract + thin impl
  through the pipeline), then existing contracts adjust to cite it (provider-first).

What returns to **you**: a **ripple cycle (A needs B needs A) is a topology smell** — a hidden shared
concept wants extraction. The runner cannot grow new control flow to chase it, so it surfaces as a
`blocked` crossing (or an inbox item). Escalate to the retro; do not force it.

## 6. The approval inbox & freezes
- The runner's scribe queues interrupts (vision-amendment requests, skeptic-confirmed dead ends,
  topology smells, second budget extensions, provenance drift) into `.reasonable/inbox.json` with a
  **BREAKING / ADVISORY** class. A freeze is **footprint-scoped**: only lanes whose footprints
  intersect the affected contracts freeze; disjoint lanes run on.
- **When the run returns `blocked` (or every lane is frozen), stop fully and present the inbox to the
  human — BREAKING first, ADVISORY merely counted.** **No human gate is ever passed by timeout or
  absence — silence means frozen, never approved.**
- **Cross-vertical-slice parallelism** (opt-in) means more than one runner in flight. Disjoint
  footprints make it safe; an overlap is serialized. Keep one slice in flight by default — five slices
  at once spends feedback.

## 7. Close the vertical slice → retro (the `green` arm)
On a `green` `GATE_RESULT`, the runner has already verified the gate math internally — but you confirm
it at the membrane before merging and closing:
- **Confirm the work product is committed.** `node ${reasonable}/lib/commit-gate.mjs --check` is clean
  in each lane before its merge — "uncommitted == not done" (the commit iron rule). A lane's
  implementer commit is mandatory; a green result over an uncommitted lane tree is invalid.
- **Verify the gate evidence yourself.** The slice's promoted scenarios are GREEN and the
  vertical-slice-gate audit (mutation + sanity + proportionality + mapping, `adversarial-audit` skill)
  passed. The gate is the merge condition, not a vibe — re-check, don't trust the summary.
- **Merge each lane (gate-GREEN is the merge condition).** A lane merges to the vertical-slice branch
  **only when its gate is GREEN**; merge in the ripple's topological order. Lanes had provably
  **disjoint footprints**, so **a merge conflict between them is a footprint bug** — an under-declared
  locus or missing citation. Log it (it debugs the spec layer); fix the footprint. Record every merge
  SHA in the journal (provenance accounting; `lib/commit-accounting.mjs`).
- **Update the journal** (work orders `merged`; vertical slice closing) — a write you own again now the
  run has returned.
- **Invoke the `retro` skill** — the mandatory blocking heartbeat. The run ended **at** the retro gate,
  never through it; the human-blocking retro runs here, in the main session. Do not open the next
  vertical slice before the retro runs.

## Run mode and the supervision profile
Two distinct controls govern human involvement; **neither ever waives a mechanical check.**

The run **mode** — `gated` (`reasonable:run`) or `autonomous` (`reasonable:run-autonomously`), set at
entry, recorded in `config.json`, and passed to the runner as `args.runMode` — governs **gate-blocking
at the membrane**:
- **gated:** every ratification gate and merge waits for an explicit human nod. Silence never consents.
- **autonomous:** gates self-ratify and are logged; merges proceed (gate-protected, revertible,
  recorded). Every mechanical gate check still runs inside the runner; a vision amendment still routes
  to the human.

The supervision **profile** — `strict | standard | trusting` in `supervision.json` — is the *finer*
dial **within gated mode**: it governs how often the human is consulted for between-gate *judgment*
approvals (work-order dispatch batches, merges to the vertical-slice branch, amendment batches), not
whether gates block. The entry skill sets the initial profile (gated→`strict`, autonomous→`trusting`);
the retro tunes it. **No profile ever pre-approves mechanical evidence** — discriminator, mutation,
sanity, and mapping run regardless; `trusting` only pre-approves amendment *batches* unless flagged. In
autonomous mode the profile is largely inert (nothing waits on the human).

Both modes are equally strict about the *procedure*; they differ only in whether the human is waited
on. Changing mode or profile mid-effort requires an explicit human instruction, logged.

## Common mistakes
- **Re-implementing the dispatch loop in the main session.** Launch the runner; it owns reconcile,
  routing, `groupDisjoint`, the enrichment `pipeline()`, and the trap `switch`. You route its typed
  `GATE_RESULT` and handle the membrane crossings — nothing more.
- **Co-writing the journal during the run.** The runner's lone scribe owns the derived index in flight;
  you write it only at the membrane (slice opening, merges, slice closing).
- **Treating `budget-exhausted` as a gate** (or as a failure). It is a first-class, distinct human
  decision: extend once / re-plan / spike / dead-end. Don't conflate it with `green` or `blocked`.
- **Trying to launch a spike or scaffold from inside the runner.** One-level `workflow()` nesting
  forbids it — the runner returns `spike-needed`/`blocked` and *you* launch the nested workflow.
- **Letting the implementer write tests, or the test-writer see code.** Both break the verification
  chain. The runner enforces fresh blind subagents, capability-enforced.
- **Iterating tests to green.** The runner's adjudication fork rules; most reds are impl-bugs.
- **Five vertical slices at once.** That spends feedback. One slice in flight by default.
- **Resolving a ripple as one big commit.** The runner sequences topologically ordered single-contract
  runs; parity at every commit. You only escalate the cycles.
- **Passing a human gate by timeout.** Never. Silence is frozen.
