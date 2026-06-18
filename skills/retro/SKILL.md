---
name: retro
description: Use at every vertical-slice gate in a reasonable effort — the mandatory blocking heartbeat that reviews gate evidence, runs the three-way divergence classification (born characterized clauses included), records intent-check-failure entries, batches planned supersessions as advisory, consumes the trust-staleness set, approves amendment batches, ratifies the route re-sort, tunes budgets and the supervision dial, and clears the approval inbox. Rigid orchestration checklist — follow exactly. The human is the control plane here.
---

# Retro Phase

## Overview

The retro is the **mandatory blocking heartbeat**. The system always stops at a vertical-slice gate and runs
the retro **with the human**. Between retros the system is autonomous *within the approved vertical slice*;
at the retro, the human is the control plane (vision, route, amendments, dial). This is a legitimate
**shared-context session** (retro approval is judgment-across-artifacts).

## Mode behavior (gated vs autonomous)

Read `mode` from `.reasonable/config.json` (set by `reasonable:run` / `reasonable:run-autonomously`).
The retro is a ratification gate, so mode governs whether it blocks — **gated**: the retro **blocks**;
present gate evidence, divergence classification, and the amendment batch, and wait for explicit human
approval of each item (*silence never approves*). **autonomous**: perform the same review, then
**self-approve and log** each decision to the ledger (`type:"ratification"`/`approvedBy:"autonomous"`,
with rationale), and proceed without blocking. In **both** modes the full review runs — gate evidence
is re-checked, every divergence is classified three ways (no unclassified divergence), and the route
is re-sorted. **The protocol is absolute.** The one exception autonomous mode must still escalate to
the human: a **vision amendment** (queue it in the inbox, surface it; never silently self-approve a
change to the user's goal).

**Announce at start:** "Using the retro skill — the blocking heartbeat for vertical slice <id>."

**Rigid skill — one TodoWrite item per step. Nothing proceeds to the next vertical slice until this completes.**

## Steps

1. **Confirm gate evidence — and that it is committed.** The vertical slice's promoted scenarios are
   GREEN and the vertical-slice-gate audit (discriminator, mapping, mutation, sanity, proportionality
   — `adversarial-audit` skill) passed. Re-run the checks yourself; the gate is the merge condition,
   not a vibe. **Then confirm the work product is committed**: `node ${reasonable}/lib/commit-gate.mjs
   --check` must be clean. "Uncommitted == not done" (the commit iron rule) — a slice does not close
   over an uncommitted tree; green evidence sitting in an unsaved working tree is one `git checkout`
   from gone.
2. **Dispatch the `retro-synthesizer`** (or run it in-session with the human present) to review the
   vertical slice's **contract diffs against the vertical-slice spec and vision** — the intent-level edge a
   tests-vs-contract audit cannot catch (it would bless a sycophantic contract). It produces the
   **three-way divergence classification**: every divergence is exactly one of
   **(a) fix the code**, **(b) amend the vision** (human-approved re-vision), **(c) deliberate
   deferral**. *There is no fourth bucket — an unclassified divergence is forbidden.*
   - **Born characterized clauses (brownfield, §18).** Any clause born GREEN by characterization this
     vertical slice (provenance `characterized`, untrusted) is also classified three ways — a
     characterization test has no internal tell that it pinned a bug, so the human is the only check:
     **keep** (the pin faithfully captures intended legacy behaviour — leave it FLOOR), **fix-it-pins-a-bug**
     (the pin froze a defect; the change must move it — route to a grown test / `change-characterized`,
     never bless the bug), or **defer** (acknowledged but out of this vertical slice's scope). *Same rule:
     no unclassified born clause.*
3. **Approve the amendment batch (human, blocking).** Proposed contract *weakenings* are batched with a
   reason each. The human approves or rejects **individually**. Each approval is appended to the ledger
   `approvedBy:"human"` (`contract-amendment` skill). The blind-test-writer re-derives affected tests
   from the new contract text in a normal pipeline run. **Silence never approves.**
4. **Confirm the planned-supersession advisory batch (brownfield, BF9).** Floor breaks the implementer
   **declared up front** via `behaviorDelta`, each with a matching new grown test governing the locus,
   are **advisory-batched** — `change-characterized-planned` events the orchestrator already logged
   (`approvedBy:"orchestrator"`). They are *presented and counted, not individually gated*; the
   `behaviorDelta`-first declaration is what earns the advisory treatment and keeps routine
   behaviour-changing edits out of the human's gate. **Contrast:** an *undeclared* legacy-behaviour change
   (`AMEND-CHARACTERIZED`) is a ratchet weakening and rides the step-3 amendment batch (human-gated); an
   unforeseen floor break with no matching `behaviorDelta`/grown test is a **BREAKING** regression handled
   in step 9 (backward-path triage), never here.
5. **Ratify the route re-sort, consuming the trust-staleness set (D13).** The `route-planner` proposes the
   re-sorted frontier (best-first by information gain) with logged rationale, **and** the set of
   trusted-green tests whose governing clause was amended or extended since their last verification —
   computed mechanically from this vertical slice's ledger event stream (the assertion↔clause mapping is
   the contract's citation, not eyeballed). Confirm those exact stale tests are marked for re-verification
   in the next vertical slice's work orders — no blanket re-check, just the affected ones. The human
   ratifies the frontier. The **vision** never changes here — only the **route**. The route file is
   human-editable any time; you pick it up at the next dispatch wave.
6. **Clear the approval inbox (BREAKING first, ADVISORY counted).** Resolve queued items in class order:
   **BREAKING** items (intent-fork, vision amendment, second budget extension, reconcile HALT) are decided
   **individually before progress**; **ADVISORY** items (logged ratifications in autonomous mode, the
   `kind:"other"` walls and per-gate gated-mode terminations batched here, planned supersessions from
   step 4, drift notes) are presented as a count. A **vision amendment** is human-gated, always,
   individually — even in autonomous mode. Unfreeze the lanes each item was freezing. **Inbox-load
   tripwire:** if this vertical slice's BREAKING items exceed the threshold, surface *that* as a meta-signal
   that the intention is under-specified — route back to enrich the oracle, not suppress the items.
7. **Record intent-check-failures (D18, the falsifiable defeater).** For **every** non-breaking choice the
   human corrected this vertical slice that the agent did **not** escalate, append a ledger entry
   `{type:"intent-check-failure", verticalSlice:<id>, correctedChoice:<what>, shouldHavePinged:true,
   retro:<id>}` (`contract-amendment` skill / `docs/artifacts.md` ledger grammar). This is the only thing
   that makes "never policing" falsifiable — a human silently fixing the agent's call *is* a recorded
   miss. A **rising** intent-check-failure count is the observable signal the intention is too weak an
   oracle → route back to enrich `intention.md`. *Do not skip this because "the fix was small" — the small
   un-escalated corrections are exactly the signal.*
8. **Tune budgets and the dial** from this vertical slice's telemetry — checkpoint frequency, audit hit rates,
   footprint-bug counts, the intent-check-failure trend. Budgets start tight and loosen with data per
   work-order class. Adjust `supervision.json` (strict / standard / trusting) if the human wants. **No
   profile waives a mechanical check.**
9. **Handle backward-path triage** if any arose this vertical slice:
   - **Post-merge defect** → triage to exactly one of: *test gap* (blind-test-writer strengthens
     contract tests from a **bug-report artifact** — reproduction evidence, never the implementation —
     red confirms, then a normal fix work order); *contract mis-states intent* (amendment ceremony);
     *contract silent* (enrichment/jurisdiction). **A hotfix is an expedited vertical slice — same pipeline,
     zero exemptions** (urgent is exactly when corners get cut).
   - **Provenance drift** (`lib/commit-accounting.mjs` found unaccounted commits) → drift-check the
     external edit against contracts; a parity violation becomes an inbox item ("your edit exceeds
     `parser` §2: enrich the contract, or revert?"). The system never blocks the human; it refuses to
     let the artifact layer silently rot.
10. **Update the journal** (vertical slice closed, route advanced) and decide:
   - Route has more vertical slices → invoke `vertical-slice-execution` for the next best-first vertical slice.
   - Route empty / effort complete → invoke `finishing-a-development-branch` to integrate, **then conclude
     the effort.** Once the work is integrated, run `node ${reasonable}/lib/conclude.mjs`: it appends a final
     `concluded` ledger event and archives `.reasonable/` aside to `.reasonable.done-<effort>/`. This
     **releases the blast-radius fence**, which keys on the mere presence of `.reasonable/` — an effort that
     integrates but never concludes leaves its bookkeeping in place and the fence then blocks *every* edit of
     the next effort (it cannot even scaffold). Conclusion is the symmetric close of the walking skeleton that
     opened the effort; archival keeps the ledger/decisions/vision auditable and is reversible by renaming back.

## Discipline
- **The human owns the goal.** You bring evidence and proposals; the human ratifies. Never amend the
  vision or pass a gate on the human's behalf.
- **Classify everything.** The poison is the unclassified divergence. Every one gets a bucket — and that
  now includes every born `characterized` clause (keep / fix-it-pins-a-bug / defer).
- **A silent human correction is a recorded miss.** Never police; but every un-escalated choice the human
  fixes is an `intent-check-failure` in the ledger. Logging it is how "never policing" stays falsifiable.
- **Retros govern contracts, never tests.** Tests are derived; if contracts change correctly, they
  re-derive. The trust-staleness set decides which trusted tests *re-run*, never how they are written.

## Output
A ratified vertical slice closure: approved amendments logged, planned supersessions advisory-batched, the
trust-staleness set folded into the next route, the route re-sorted and ratified, intent-check-failures
recorded, the inbox cleared (BREAKING decided, ADVISORY counted), budgets/dial tuned, the journal advanced.
Then the next vertical slice, or finishing.
