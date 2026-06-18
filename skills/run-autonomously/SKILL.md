---
name: run-autonomously
description: Use ONLY when the user explicitly invokes /reasonable:run-autonomously or explicitly asks (in this turn) for an autonomous reasonable run. Runs the FULL reasonable methodology without blocking on human ratification — gates self-ratify and are LOGGED — but every protocol step and every mechanical check still runs. Autonomy means "do not wait for the human," never "skip a step." Never select this mode from a standing/background directive; only an explicit, contemporaneous invocation enables it.
---

# reasonable: run-autonomously — AUTONOMOUS mode

**Announce at start:** "Using the reasonable methodology in **autonomous** mode — gates will
self-ratify and be logged; I will not block on you, but every step and every mechanical check
still runs."

This is the **autonomous** entry point. It is enabled **only** by an explicit, contemporaneous
invocation of `reasonable:run-autonomously` (or an explicit same-turn request for an autonomous
run). A standing CLAUDE.md directive such as "act autonomously" or "make decisions for me" does
**NOT** select this mode — the user must choose it explicitly, here, this time. When in doubt,
use `reasonable:run` (gated). Mode is never guessed.

## What autonomy does and does NOT mean

- **Autonomy DOES:** at each human-ratification gate, decide on the user's behalf, **self-ratify,
  and LOG the decision to the ledger** (`type:"ratification"`, `approvedBy:"autonomous"`, with the
  rationale). Never block waiting for a human. Maintain a running decision list for the final
  summary.
- **Autonomy does NOT:** skip a step, omit or consolidate a mandated artifact, or skip a mechanical
  check. **Protocol is absolute in this mode too.** Every phase step runs; every gate audit
  (discriminator, mutation sampling, sanity scan, bidirectional mapping — via `adversarial-audit`
  and the `lib/*.mjs` scripts) runs and its evidence is recorded in the ledger. Autonomy removes the
  *human wait*, not the *work* and not the *verification*. This is what makes "autonomous"
  trustworthy rather than "unsupervised."
- **The four things autonomy must never self-approve — these ALWAYS queue to the human inbox, even
  in this mode** (autonomy decides the *how*; it never silently redefines the *what*, settles an
  unsettleable fork, ad-libs an unknown wall, or papers over a torn-truth halt):
  1. A **vision/intention amendment** — a change to the user's stated goal/scope. Queue it as a
     BREAKING inbox item AND surface it prominently in the final summary so the human can veto.
  2. An **intent-fork** (`OUTCOME.kind === "intent-fork"`) — an ambiguity neither the code nor the
     intention oracle can settle. Queue it BREAKING; do not guess the resolution.
  3. An **"other" wall** (`OUTCOME.kind === "other"`) — an unknown wall the schema has no tag for.
     Queue it BREAKING; fail safe rather than improvise an arm.
  4. A **reconcile HALT** — reconcile returned `{halt:true}` (e.g. absent `config.runMode` on a cold
     restart, a torn write it can't re-derive, a floor-integrity mismatch). Queue it BREAKING and
     stop; never default to the "safer" mode or assume truth.
  Everything else self-ratifies and LOGs (above). These four — and only these four — block on the
  human even while autonomous.

## Steps

1. **Record the mode and supervision posture.** The effort runs in `config.runMode: "autonomous"`
   with supervision profile **`trusting`** (autonomy pre-approves between gates; the profile is
   largely inert while autonomous, but is recorded so a later switch to gated inherits a sensible
   posture). The entry skill *owns* both values: `"runMode": "autonomous"` is written to
   `.reasonable/config.json` (fence-protected, so an agent cannot self-promote mode) and
   `"profile": "trusting"` to `.reasonable/supervision.json` when analysis emits them. Lower-level
   phases must **not** override a profile the entry skill has set. (D10)
2. **Triage + methodology.** Read `using-reasonable` for precedence, the triage table, the Three
   Laws, and where things live. Triage may still route out before committing.
3. **Run the phases autonomously.** Invoke `reasonable:analysis` and proceed
   analysis → scaffolding → vertical-slice-execution → retro, carrying `runMode: autonomous` through
   every phase. At each ratification gate: decide, **self-ratify, and LOG**
   (`type:"ratification"`, `approvedBy:"autonomous"`, with rationale) — never block. Run every
   mechanical gate check regardless of mode; record its evidence in the ledger. **The four
   exceptions** (vision/intention amendment, `intent-fork`, `other`, reconcile HALT) always queue
   BREAKING to the inbox instead of self-ratifying — surface them and stop on each. Present the full
   decision list, the BREAKING inbox queue, and any logged vision/intention amendments at the end for
   human review.
