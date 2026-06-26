---
name: scaffolding
description: Use after analysis in a reasonable effort to build the walking skeleton (minimal end-to-end vertical slice, real wiring, thin behavior) and the parked top-level scenario suite, then verify the skeleton's invariants and get human sign-off. Rigid orchestration checklist — follow exactly.
---

# Scaffolding Phase

## Overview

Scaffolding occupies the genesis slot between analysis and the vertical-slice loop. It runs in **one of
two modes**, decided by `config.brownfield` (set by triage in `analysis`):

- **Greenfield (default).** Produce the **walking skeleton** — the first milestone — and the **parked
  scenario suite** that pins the outermost contracts. *Edges before nodes*: make the seams real on day
  one, keep behavior thin. Run in the main session; dispatch the `scaffolder` agent for the build.
- **Brownfield (BF7).** There is **no walking skeleton to build — the system already walks.** The slot's
  job becomes "build a thin frontier inventory of the route-intended scenarios." Launch
  `workflows/characterization.workflow.js` from the main session — the analysis-time **frontier
  inventory** pass (read-only; records a thin prose `## Scenarios` map of the route-intended /
  integration-risk scenarios; **defers every tooth-bearing pin to first-touch genesis**). The frontier
  inventory (`frontierScenarios` + `componentsTouched`) + the FLOOR (`baseline.json`) replace the
  parked scenario suite as the standing baseline.

The same slot, the same one-time ratification at the end. Pick the mode from `config.brownfield`, run
that mode's steps, skip the other's. Brownfield steps are no-ops when `config.brownfield` is unset.

## Mode behavior (gated vs autonomous)

Read both `mode` and `brownfield` from `.reasonable/config.json` (set by `reasonable:develop` /
`reasonable:develop-autonomously` and by triage in `analysis`). The sign-off gate behaves by `mode` —
**gated**: it **blocks** and waits for explicit human approval (*silence never ratifies*);
**autonomous**: self-ratify and **log** it to the ledger (`type:"ratification"`,
`approvedBy:"autonomous"`, with rationale), never blocking. In **both** modes every step and every
invariant check runs — **the protocol is absolute**, nothing is skipped or consolidated. `brownfield`
selects which step set runs (greenfield skeleton vs. brownfield frontier inventory), not whether the gate
blocks.

**Announce at start:** greenfield — "Using the scaffolding skill to build the walking skeleton."
Brownfield — "Using the scaffolding skill to build the frontier inventory (the system already walks;
pins are deferred to first-touch genesis)."

**Rigid skill — one TodoWrite item per step.** (`${reasonable}` in commands = this plugin's root
directory — `$CLAUDE_PLUGIN_ROOT` in hooks; substitute the installed absolute path.)

## Steps

0. **Confirm analysis ratified, then pick the mode.** Vision/topology/route (greenfield) or the topology
   census + `baseline.json` floor partition (brownfield) exist and are human-approved. If not, return to
   `analysis`. Read `config.brownfield`: **unset/false → run the Greenfield path; true → run the
   Brownfield path.** Run exactly one path; skip the other.

### Greenfield path (build the walking skeleton)

1. **Dispatch the `scaffolder` agent** (a fresh subagent) with: the topology sketch, the vision's user
   stories, and the stack binding. Its job: real wiring end-to-end with trivial behavior, the parked
   scenario suite (compiling), thin initial contracts, loud stubs everywhere off the skeleton path. The
   build runs in a **provisioned lane** (a real registered worktree + `.reasonable-lane.json` descriptor),
   born before the scaffolder so the floor-containment fence is armed and the born contracts exist as a
   pre-integration diff — never lane-less in the main checkout (D7).
2. **Verify the skeleton's invariants** (you, in the main session — do not take the agent's word):
   - **The skeleton is committed.** `node ${reasonable}/lib/commit-gate.mjs --check` is clean —
     "uncommitted == not done" (the commit iron rule). An uncommitted skeleton is one `git checkout`
     from gone; sign-off does not pass over it.
   - **Suite is green at every commit.** Run the test command. The promoted scenario(s) the skeleton
     satisfies are green; the rest are **parked**, not failing. `node ${reasonable}/lib/burndown.mjs`
     reports the parked count and the loud-stub count.
   - **Parked tests compile.** A parked test that doesn't compile pins nothing — confirm the suite
     *builds* with parked tests present.
   - **Real wiring, thin behavior.** Spot-check that seams are genuine function calls across real
     module boundaries (a real composition root), not stubs calling stubs. The skeleton is the chosen
     direction and it *ships* — it is not a spike.
   - **No canned data off-path.** Off-skeleton paths are loud stubs (panic/throw), never plausible
     fakes. `node ${reasonable}/lib/citation-resolve.mjs` confirms the thin contracts' citations
     resolve.
   - **No fake reachable from the production composition root.** A fake in `main`'s object graph is a
     parity violation even if tests pass.
3. **Verify the born contracts (the adversary, distinct from the structural checks above).** The checks in
   step 2 are *decidable* (compile / green / real-wiring / no-fake-in-composition-root). This is the
   *semantic* one a script cannot compute: do the born thin contracts' clauses **over- or under-claim what
   the skeleton actually wires?** A fresh-context, read-only `intent-verifier` judges each born contract
   against the **topology sketch + vision** — the oracle **above** the artifact (the contract is derived
   subtractively from them, so judging it against the skeleton it describes would be circular). It proposes
   `accept | reject | escalate` and **self-executes nothing**. **Risk-gated (D7):** always run it where a
   born contract enriches a shared contract (a `## Citations` bullet) or touches floor-tracked state; skip
   only a contract boxed into a brand-new component nothing depends on yet. **reject** → the main session
   re-specs the contract (a cited over/under-claim) and re-runs; **escalate** → the human inbox (autonomous:
   joins the always-escalate classes); **accept** → a narrow writer appends a `verifier-verdict` ledger event
   that **annotates** the contract `explained-by-verdict` (advisory only — *annotate, not disarm*). The
   human sign-off then ratifies a **pre-verified** artifact.
4. **Initialize contracts in the ledger.** Record the births (the thin contracts) so the retro can see
   the topology arrived as expected.
5. **Update the journal** to phase `scaffolding` → ready for `vertical-slice-execution`; record the
   skeleton's commit. Then go to **Sign-off**.

### Brownfield path (frontier inventory — BF7)

There is no skeleton to build; the system already walks. Record a thin frontier inventory of the
route-intended / integration-risk scenarios as the baseline for the vertical-slice loop.

1. **Confirm the floor exists.** `census` (run in `analysis`) has emitted the topology census and written
   `.reasonable/baseline.json` (the existing suite partitioned into the FLOOR — untrusted, per-test
   `{id, locus, fileHash}`). If `baseline.json` is missing, return to `analysis`; the frontier inventory
   pass needs the floor partition before it can map integration-risk scenarios.
2. **Launch `workflows/characterization.workflow.js` from the main session** (it mirrors
   `scaffold.workflow.js`; one-level `workflow()` nesting forbids launching it from a runner). It is the
   analysis-time **frontier inventory** pass — read-only; records a thin prose `## Scenarios` map of the
   route-intended / integration-risk scenarios and scribes it; **defers every tooth-bearing pin to
   first-touch genesis** inside the vertical-slice-runner. It returns a typed `CHARACTERIZATION_RESULT`
   (it cannot block on a human — that is the sign-off gate below). This is the **analysis-time frontier
   inventory only**; the in-run, first-touch genesis (the `characterization-needed` arm) lives inside the
   vertical-slice-runner, not here.

   The frontier pass returns a typed result; route by `kind`:
   - **`ratify`** — the frontier inventory was built (or is honestly empty) and scribed. Present
     `frontierScenarios` + `inventoryWritten` (+ any `floorNotice`) to the human **birth-ratification
     gate**. The gate reviews a small, reviewable frontier map + confirms the FLOOR stands — it does
     **not** review a tooth-bearing corpus (there is none; teeth are born lazily at first touch).
     Silence never ratifies.
   - **`no-op`** — `config.brownfield` is not set; the greenfield scaffold path is unaffected.
   - **`halt`** — reconcile AMBIGUOUS (`sha-custody` / `ledger-without-commit` / `runmode-absent` /
     `two-lanes-one-wo`), a null inventory, or a failed scribe. Surface `reason` (+ `evidence`); do
     not ratify.
   - **`checkpoint`** — a budget ceiling or terminal agent error; resumable, not a verification gap.

   A `floorNotice` on any result is **advisory** (this read-only pass mutates no floor state) — log
   it for the human; it never blocks ratification.

3. **Update the journal** to phase `scaffolding` (frontier inventory built + scribed) → ready for
   `vertical-slice-execution`; record the frontier inventory (`frontierScenarios` + `componentsTouched`).
   Then go to **Sign-off**.

### Sign-off (both paths — the final step)

**Human sign-off (blocking).** Present what the chosen path produced — **greenfield**: the skeleton
(with the green promoted scenario, if any), the parked count, where the loud stubs are, the thin
contracts, **and the born-contract adversary's verdicts** (the contracts the human ratifies are already
adversary-reviewed against topology + vision; any escalation is surfaced, never silently ratified).
**Brownfield**: the frontier inventory (`frontierScenarios` + `inventoryWritten`, plus any `floorNotice`)
so the human can confirm the FLOOR stands and review the thin scenario map before the vertical-slice loop
begins. There is no tooth-bearing corpus at this stage — pins are born lazily at first touch inside the
runner. The human ratifies (the last one-time ratification before the vertical-slice loop).
**Silence never ratifies.**

## Discipline

- **Verify, don't trust.** Confirm the invariants yourself with commands, not by reading the agent's or
  workflow's summary — the skeleton's value is in real seams; the frontier inventory's value is in an
  honest, reviewable scenario map before any pins exist.
- **Thin means thin (greenfield).** If the scaffolder implemented real behavior in a node, that's
  vertical slice work that leaked in — send it back. The skeleton validates seams, not features. The
  born-contract adversary catches the contract-side leak: a clause that over-claims behaviour the
  skeleton does not wire is a reject against topology + vision.
- **Frontier inventory is read-only (brownfield).** The analysis-time pass records a thin scenario map;
  it never pins, never fixes, and never edits production src. Tooth-bearing pins are born lazily at
  first touch inside the vertical-slice-runner.
- **Green always.** Greenfield: anything red (not parked) is a regression — fix before sign-off.
  Brownfield: a broken floor test is a reconcile AMBIGUOUS → HALT — resolve before sign-off.

## Output

**Greenfield:** a ratified walking skeleton, a compiling parked scenario suite, thin contracts
(adversary-reviewed against topology + vision before sign-off).
**Brownfield:** a ratified frontier inventory (`frontierScenarios` + `inventoryWritten`), the FLOOR
standing as the regression-containment fence. Tooth-bearing pins are deferred to first-touch genesis
inside the vertical-slice-runner. Either way the journal is advanced to the vertical-slice loop. Then
invoke `vertical-slice-execution` for the first vertical slice (best-first item on the route — for
greenfield, the item after the skeleton).
