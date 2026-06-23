---
name: develop
description: Use when the user invokes /reasonable:develop, or asks to start a reasonable effort that should be human-supervised. The DEFAULT, fully-gated entry point to the reasonable methodology — every human-ratification gate (analysis sign-off, scaffold sign-off, each retro) BLOCKS and waits for explicit human approval. Protocol is absolute; no step or mechanical check may be skipped, consolidated, or guessed.
---

# reasonable: develop — GATED mode

**Announce at start:** "Using the reasonable methodology in **gated** mode — every ratification gate will block for your explicit approval."

This is the **gated** entry point and the default way to run `reasonable`. Whether an effort is
gated or autonomous is decided **only** by which entry skill the user invokes
(`reasonable:develop` vs `reasonable:develop-autonomously`) — it is never inferred from a standing
directive, and it is **never guessed or implied**. If you are unsure which the user wants, ask;
do not assume.

## The gated contract (non-negotiable once invoked)

- **Every human-ratification gate BLOCKS and waits** for explicit human approval — the analysis
  sign-off, the scaffold sign-off, and every retro. **Silence never ratifies.** You never
  self-approve a gate in this mode, for any reason.
- A standing instruction in CLAUDE.md or earlier in the conversation (e.g. "act autonomously",
  "make decisions for me", "be concise", "KISS") does **NOT** disable gating, skip a step, or
  consolidate an artifact. Only an **explicit, contemporaneous, per-step** instruction can
  authorize a single named deviation, and that deviation must be logged to the ledger
  (`type:"deviation"`) before you act on it. **There is no silent shortcut.**
- **Protocol is absolute.** Every phase step and every mechanical gate check (discriminator,
  mutation sampling, sanity scan, bidirectional mapping — via the `adversarial-audit` skill and the
  `lib/*.mjs` scripts) runs and is recorded. "Run it lean" / "consolidate the ceremony" is not a
  gated-mode option; if the work is too small to warrant the full protocol, that is a **triage**
  decision made *before* entering (route to `simple-task`), never a mid-effort shortcut.
- **The intent-verifier is a JUDGMENT adversary, not a mechanical check — so the dial may gate it.**
  The verification trio's adversary (the `intent-verifier`) renders a *semantic* verdict against a
  named reference above the artifact; it is **risk-gated**, not run unconditionally like the
  mechanical checks above. It runs where the write touches the floor or a shared contract, and may be
  skipped where the write is boxed-in (a present human trading a check for speed — D7). This is the
  one place the dial actually changes *whether* a check fires; the mechanical gate checks never skip.
  **The only mode difference for the adversary itself is when it escalates**, never whether it runs:
  in **gated** mode it escalates **early** (on the first whiff of an unsettleable fork — the present
  human is cheap); in autonomous mode it escalates **only the genuinely unsettleable**. In both
  modes an `escalate-intent-fork` crosses to the human inbox; in gated mode it surfaces in the
  briefing for your decision. Neither mode lets an `accept` *disarm* anything — it annotates only.

## Committing is authorized — and mandatory (the iron rule)

Invoking `reasonable:develop` **is** the standing authorization to commit the effort's own work product
as it proceeds — it supersedes the harness default "commit only when the user asks" for that work
product (see `using-reasonable`, the commit iron rule). This is **not** in tension with gated mode:
committing is *durability*, not *ratification*. Gated mode still blocks for your nod on the things
that are decisions — ratifying gates, merging to your branch, pushing — and reasonable **never**
auto-pushes or auto-merges to your branch. "Uncommitted == not done": the implementer's atomic
commit is mandatory, and no gate / slice / conclude passes over uncommitted work product (enforced
by `lib/commit-gate.mjs`, the conclude guard, and the Stop/SubagentStop backstop).

## How a gated run is shaped (the 2.0 substrate)

The orchestration substrate is the **Dynamic Workflows engine**, and it changes how the phases run
(architecture §7, §4). The vertical-slice loop is no longer main-session prose — it is a pure
workflow script, **one Workflow run per vertical slice, ending *at* the retro, never through it**
(D4). A background workflow **cannot block on a human and silence must never ratify**, so the run
never waits — it **returns a typed `GATE_RESULT`** and the *main session* (this skill) does the
blocking. Every human gate therefore lives here, in the main session, not inside a workflow.

Two engine limits govern what this skill launches directly (architecture §15, §16d):
- **One-level `workflow()` nesting.** `vertical-slice-runner` cannot call `workflow()` itself, so
  **spike / scaffold / characterization workflows are launched from the main session**, never inline
  from the runner.
- **The trap returns, it does not poll.** A machine-to-machine wall crosses via the `agent()` return
  value; only human / cross-session decisions cross via the on-disk inbox (architecture §8).

## Steps

**Rigid skill — one TodoWrite item per numbered step; do not skip or reorder.**

1. **Write `config.runMode = "gated"` and the supervision posture (D10).** The entry skill *owns*
   both values. Write `"runMode": "gated"` into `.reasonable/config.json` and `"profile": "strict"`
   into `.reasonable/supervision.json` (gated = maximum oversight). `config.json` is fence-protected
   (`enforcementPaths`), so an agent cannot self-promote the mode. **Mode is never inferred** from a
   standing directive — only this explicit `reasonable:develop` invocation sets it. Lower phases must
   **not** override the profile this skill set (they may write it only if it is unset, falling back
   to `standard`).
2. **Triage + methodology.** Read `using-reasonable` for the precedence rules, the triage table
   (is the methodology even applicable?), the Three Laws, and where things live. Triage may still
   route *out* (a first-class verdict) — but once you commit to a `reasonable` effort, the protocol
   is absolute. (A typo / tiny change is the **low floor** — the *same* runner with a minimal route
   in args, not a second philosophy; see architecture §17.)
3. **Run the SessionStart reconcile (the unconditional prologue).** Before any run — including a
   cold restart — dispatch the `reconciler` agent (wrapping `lib/reconcile.mjs`). It re-derives truth
   from git + ledger + contracts; it is the **only** authoritative recovery path (architecture §11–12).
   Reconcile reads `config.runMode` into the briefing; **if `runMode` is absent/null it HALTS** —
   defaulting to a "safer" mode is still an inference, which the framework forbids. Any AMBIGUOUS
   artifact configuration (orphan commit, ledger entry with no commit, two lanes claiming one work
   order) likewise sets `{halt:true}` → a **blocking** human decision, never a recovery-time guess.
4. **Present the briefing — BREAKING first (D17).** Surface the reconcile briefing to the human.
   Present **BREAKING** inbox items first (intent-fork, vision amendment, second budget extension,
   reconcile HALT) and decide each before progress; merely **count** ADVISORY items (logged
   notes, batched gated-mode terminations). If BREAKING items for one vertical slice exceed the
   load tripwire, surface *that* as a meta-signal that the intention is under-specified — route back
   to enrich it, do not suppress.
5. **Run analysis gated (the intention oracle).** Invoke `reasonable:analysis`. It grills the vision,
   launches `coherence-grill.workflow.js` (each ambiguous fork returns to *you* to put to the human),
   ratifies the fence-protected `.reasonable/intention.md`, triages applicability, and emits the
   initial route. **STOP at the analysis sign-off, present the artifacts, and wait** for explicit
   human approval. Silence is frozen, never approved.
6. **Launch the scaffold from the main session.** Invoke `reasonable:scaffolding`, which launches
   `scaffold.workflow.js` (walking skeleton + parked scenario suite → read-only invariant-verify).
   **This skill launches it — never the runner** (the one-level nesting limit). **STOP at the scaffold
   sign-off and wait** for the human. *(Brownfield: launch `characterization.workflow.js` here instead
   — the analysis-time corpus pass; first-touch genesis runs in-run inside the runner, not as a nested
   workflow.)*
7. **Launch one vertical-slice run per vertical slice, and route its `GATE_RESULT` (D4, §7).** For the
   best-first vertical slice on the route, launch `workflows/vertical-slice-runner.workflow.js` with
   fresh **args** (vertical-slice id, route snapshot, contract paths, per-vertical-slice budget,
   `mode: "gated"`, supervision profile). Re-assert `runMode` into the args from the reconcile briefing.
   The run drives the slice toward GREEN, persists gate evidence + a proposed route re-sort atomically,
   and **returns a typed `GATE_RESULT`** — a tagged union you branch on:
   - **`green`** → run the **retro** (step 8). Do not open the next slice before it.
   - **`budget-exhausted`** → a human decision (extend budget / re-plan), **not** a gate. Present
     `progress` + `lastOutcome` and **wait** — a second budget extension is BREAKING.
   - **`blocked`** → a trap needs a human decision (`intent-fork` / `other` fail safe to you; a
     `spike-needed` arm means **you** launch `spike.workflow.js` from the main session, per the
     nesting limit). Resolve, then re-launch the slice.
   - **`halt`** → a durability/reconcile halt → present the evidence and **block**. Never auto-resolve.
8. **Run the retro gated (the blocking heartbeat).** On a `green` result, invoke `reasonable:retro`.
   Re-check the gate evidence yourself, classify every divergence three ways, approve the amendment
   batch and route re-sort **item by item**, clear the inbox, tune budgets/dial, and record any
   `intent-check-failure` (the human correcting an un-escalated non-breaking choice — the falsifiable
   defeater, D18). **STOP and wait** for explicit human approval of each item. Silence never ratifies.
9. **Loop or finish.** Route has more vertical slices → return to step 7 and **re-launch** a freshly
   parameterized runner for the next best-first slice (inter-slice dynamism rides in the *args*, never
   in model-authored JS). Route empty → invoke `finishing-a-development-branch` to integrate.
