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
  job becomes "characterize the observable top-level scenarios as a parked baseline." Launch
  `workflows/characterization.workflow.js` from the main session (it mirrors `scaffold.workflow.js`).
  Here invariant-verify means **GREEN on HEAD** — the inverse of the greenfield discriminator's
  RED-on-HEAD~ — not "the skeleton ships." The parked corpus + the FLOOR (`baseline.json`) replace the
  parked scenario suite as the standing baseline.

The same slot, the same one-time ratification at the end. Pick the mode from `config.brownfield`, run
that mode's steps, skip the other's. Brownfield steps are no-ops when `config.brownfield` is unset.

## Mode behavior (gated vs autonomous)

Read both `mode` and `brownfield` from `.reasonable/config.json` (set by `reasonable:run` /
`reasonable:run-autonomously` and by triage in `analysis`). The sign-off gate behaves by `mode` —
**gated**: it **blocks** and waits for explicit human approval (*silence never ratifies*);
**autonomous**: self-ratify and **log** it to the ledger (`type:"ratification"`,
`approvedBy:"autonomous"`, with rationale), never blocking. In **both** modes every step and every
invariant check runs — **the protocol is absolute**, nothing is skipped or consolidated. `brownfield`
selects which step set runs (greenfield skeleton vs. characterization corpus), not whether the gate
blocks.

**Announce at start:** greenfield — "Using the scaffolding skill to build the walking skeleton."
Brownfield — "Using the scaffolding skill to characterize the observable baseline (the system already
walks)."

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
   scenario suite (compiling), thin initial contracts, loud stubs everywhere off the skeleton path.
2. **Verify the skeleton's invariants** (you, in the main session — do not take the agent's word):
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
3. **Initialize contracts in the ledger.** Record the births (the thin contracts) so the retro can see
   the topology arrived as expected.
4. **Update the journal** to phase `scaffolding` → ready for `vertical-slice-execution`; record the
   skeleton's commit. Then go to **Sign-off**.

### Brownfield path (characterize the observable baseline — BF7)

There is no skeleton to build; the system already walks. Pin what it *already does* as a parked baseline.

1. **Confirm the floor exists.** `census` (run in `analysis`) has emitted the topology census and written
   `.reasonable/baseline.json` (the existing suite partitioned into the FLOOR — untrusted, per-test
   `{id, locus, fileHash}`). If `baseline.json` is missing, return to `analysis`; the corpus pass needs
   the floor partition before it can characterize a seam.
2. **Launch `workflows/characterization.workflow.js` from the main session** (it mirrors
   `scaffold.workflow.js`; one-level `workflow()` nesting forbids launching it from a runner). It runs
   the corpus pipeline: reconcile → read-only probe of the observable top-level scenarios → per-scenario
   `census` skeleton check + `characterizer` pin (born `characterized` clause + parked characterization
   test, each admitted by the **BF2 reverse discriminator**) → invariant-verify → scribe. It returns a
   typed `CHARACTERIZATION_RESULT` (it cannot block on a human — that is the sign-off gate below). This
   is the **analysis-time corpus pass only**; the in-run, first-touch genesis (the
   `characterization-needed` arm) lives inside the vertical-slice-runner, not here.
3. **Verify the corpus invariant** (you, in the main session — do not take the workflow's word). The
   inversion: a characterization corpus is born **GREEN-by-observation**, so its invariant is the inverse
   of greenfield's RED-on-HEAD~:
   - **GREEN on HEAD.** Every parked characterization test **PASSES on unmutated HEAD** (run each alone).
     A pin already red on HEAD pins nothing real and is a corpus failure.
   - **Parked tests compile.** A parked characterization test that doesn't compile/import pins nothing.
     `node ${reasonable}/lib/burndown.mjs` reports the parked count and the loud-stub count.
   - **Floor is green.** The FLOOR (`baseline.json`) passes — the containment fence holds. Floor
     integrity is a reconcile invariant; an unaccounted floor change is AMBIGUOUS → HALT, not a pass.
   - **No pin blessed past the reverse discriminator.** Each `characterized` clause's test (a) passes on
     unmutated HEAD and (b) goes RED under a locus-scoped mutant
     (`node ${reasonable}/lib/discriminator.mjs --reverse …`). It explicitly does **not** delegate to
     `mutation-sample.mjs` (whole-suite — passes vacuously per characterization test).
   - **Suspected-bug pins surfaced.** A characterization test can faithfully pin a *bug* with no internal
     tell. Any `suspectedBug` pin is carried to the human three-way classification at sign-off — never
     silently blessed, never fixed (the characterizer pins, it never edits production src).
4. **Update the journal** to phase `scaffolding` (characterization corpus built + parked) → ready for
   `vertical-slice-execution`; record the corpus births (clause + parked test + component). Then go to
   **Sign-off**.

### Sign-off (both paths)

5. **Human sign-off (blocking).** Present what the chosen path produced — **greenfield**: the skeleton
   (with the green promoted scenario, if any), the parked count, where the loud stubs are, the thin
   contracts. **Brownfield**: the parked characterization corpus (born `characterized` pins, each GREEN
   on HEAD and reverse-discriminator-admitted), the FLOOR coverage, the inadmissible pins (not blessed
   into the suite), and any suspected-bug pins for the three-way classification. The human ratifies (the
   last one-time ratification before the vertical-slice loop). **Silence never ratifies.**

## Discipline

- **Verify, don't trust.** Confirm the invariants yourself with commands, not by reading the agent's or
  workflow's summary — the skeleton's value is in real seams; the corpus's value is in GREEN-on-HEAD pins
  with teeth.
- **Thin means thin (greenfield).** If the scaffolder implemented real behavior in a node, that's
  vertical slice work that leaked in — send it back. The skeleton validates seams, not features.
- **Pin what is, never what should be (brownfield).** The characterizer records current behavior, bugs
  and all; it never fixes and never edits production src. A wrong-looking pin is flagged for the human,
  not corrected.
- **Green always.** Greenfield: anything red (not parked) is a regression — fix before sign-off.
  Brownfield: a pin red on HEAD, or a broken floor test, fails the corpus — resolve before sign-off.

## Output

**Greenfield:** a ratified walking skeleton, a compiling parked scenario suite, thin contracts.
**Brownfield:** a ratified parked characterization corpus (born `characterized` pins, GREEN on HEAD),
the FLOOR standing as the regression-containment fence — invariant-verify = GREEN on HEAD. Either way
the journal is advanced to the vertical-slice loop. Then invoke `vertical-slice-execution` for the first
vertical slice (best-first item on the route — for greenfield, the item after the skeleton).
