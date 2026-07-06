---
name: develop
description: Use when the user invokes /reasonable:develop, or asks to start a reasonable effort. The single entry point to the reasonable methodology — it resolves the two orthogonal axes up front (mode gated|autonomous, tier full|lite), both chosen EXPLICITLY and logged, never inferred, then runs analysis → scaffolding → vertical-slice-execution → retro. Protocol is absolute; no step or mechanical check is ever skipped, consolidated, or guessed.
argument-hint: "[mode: gated|autonomous] [tier: full|lite]"
---

# reasonable: develop — the effort entry

This is the **single** entry point to a `reasonable` effort. It resolves two **orthogonal** axes —
**mode** (does a gate block?) and **tier** (how much per-slice ceremony?) — then runs the phases
`analysis → scaffolding → vertical-slice-execution → retro`, looping the last two per vertical slice.

## Step 0 — resolve the two axes (both explicit, both logged, neither ever inferred)

Both axes are set **only here**, by an explicit answer. Neither is ever inferred from a standing
directive (CLAUDE.md, "act autonomously", "KISS", "be quick") and neither is ever guessed. Take each
from the invocation arguments if supplied; otherwise **ASK the human**, presenting each as a fill-in
placeholder:

  • **mode** = `<gated | autonomous>` — do human-ratification gates **block and wait** (gated) or
    **self-ratify-and-log** (autonomous)?
  • **tier** = `<full | lite>` — the **effort-default** ceremony depth (per-slice overridable in
    `route.md`). What `lite` thins, and what it never touches, is spelled out under *Tier behavior* below.

`gated` and `full` are the **safe defaults** (more oversight, more verification). `autonomous` and
`lite` are each an explicit **opt-in** — the human must choose them, here, this time. If no explicit
answer can be obtained (a truly non-interactive start), take the safe default **gated + full** and log
that the safe default was assumed; **never** default toward autonomous or lite. When unsure, ask.

Write the resolved values — and the effort's **birth signature** — into `.reasonable/config.json`:
- `"runMode"` ∈ `"gated" | "autonomous"` (fence-protected — an agent cannot self-promote the mode).
- `"tier"` ∈ `"full" | "lite"` (the effort default; fence-protected — an agent cannot self-lower it).
- `"effort"` — the effort **name**: a short, stable, human-readable slug for *what this effort is
  about*, taken from the user's stated goal in this invocation. This is the effort's **birth signature**
  — the durable mark that later tells a born effort (even a crashed one) apart from a stray directory:
  `effortBirthState` reads it, `conclude` archives under it, and analysis (Step 7a) slugs it into the
  `effort/<name>` branch. Write it **now, non-empty** — never leave it blank (a missing signature reads
  as a foreign/hand-edited effort and HALTs recovery). Fence-protected, like the axes above.

**Birth location — refuse a bare repo-root birth beside real nested efforts (§6.4, F5).** Before writing
`config.json` at a **bare repo-root** cwd (no explicit `--root`), check whether
`<repoRoot>/.reasonable-efforts/` already holds a **born** effort (`assertNoAmbiguousBirth(repoRoot).ambiguous`).
If it does, **REFUSE the bare repo-root birth**: a repo-root `.reasonable/` written next to real nested
efforts would **shadow** them in the up-walk (a run that lost its `--root` silently re-births the repo).
Instead, birth explicitly nested — pass `--root .reasonable-efforts/<name>/` (a short slug for this effort)
so the new effort sits beside its siblings, never over them. The fence enforces this at the write itself,
so a slipped bare birth is denied there too; do it right here so it never gets that far. A **truly first**
effort in a plain repo (no `.reasonable-efforts/`) births at the repo root exactly as before.

**Open the execution tree's first node.** The instant config is durable, plant `analysis` as the tree's
root phase node and mark it running, so the progress tree has real content from step 0 — not just once
analysis gets around to writing its own artifacts:
```
node ${reasonable}/lib/ledger.mjs append --root <effortRoot> --type node-planned --node analysis --kind phase --title 'analysis'
node ${reasonable}/lib/ledger.mjs append --root <effortRoot> --type node-dispatched --node analysis --kind phase
```

Write the supervision posture into `.reasonable/supervision.json` (D10): `"profile": "strict"` for
gated (maximum oversight), `"profile": "trusting"` for autonomous (autonomy pre-approves between
gates). The entry skill *owns* these values; lower phases must **not** override the profile — they may
write it only if it is unset, falling back to `standard`.

**Announce**, once resolved: *"Using the reasonable methodology in **{mode}** mode at the **{tier}**
tier."* Add the one-line gloss for each:
- gated — "every ratification gate will block for your explicit approval; silence never ratifies."
- autonomous — "gates self-ratify and are logged; I will not block on you, but every step and every
  mechanical check still runs."
- full — "full ceremony on every vertical slice."
- lite — "lite per-slice ceremony by default (overridable per slice); the coherence-grill and the
  walking skeleton stay at full strength."

## Mode behavior — gated vs autonomous

Mode changes **only whether a human-ratification gate blocks**. It never changes *what runs*: every
phase step and every mechanical gate check (discriminator, mutation sampling, sanity scan,
bidirectional mapping — via the `adversarial-audit` skill and the `lib/*.mjs` scripts) runs and is
recorded in **both** modes. "Run it lean" / "consolidate the ceremony" is not a mode option; if the
work is too small to warrant the protocol, that is a **triage** decision made *before* entering (route
to `simple-task`), never a mid-effort shortcut. A standing preference never silently weakens the
protocol; only an **explicit, contemporaneous, per-step** instruction can authorize a single named
deviation, logged to the ledger (`type:"deviation"`) before you act on it.

**Gated (the default).** Every human-ratification gate — the analysis sign-off, the scaffold sign-off,
and every retro — **blocks and waits** for explicit human approval. **Silence never ratifies.** You
never self-approve a gate in this mode, for any reason.

**Autonomous.** At each gate, decide on the human's behalf, **self-ratify, and LOG** the decision to
the ledger (`type:"ratification"`, `approvedBy:"autonomous"`, with rationale); never block. Maintain a
running decision list for the final summary. Autonomy removes the *human wait*, not the *work* and not
the *verification* — that is what makes "autonomous" trustworthy rather than "unsupervised."

**The five things autonomous mode must never self-approve — these ALWAYS queue BREAKING to the human
inbox, even while autonomous** (autonomy decides the *how*; it never silently redefines the *what*,
settles an unsettleable fork, ad-libs an unknown wall, papers over a torn-truth halt, or grinds past a
surprise regression):
  1. A **vision/intention amendment** — a change to the user's stated goal/scope. Queue BREAKING and
     surface it prominently in the final summary so the human can veto.
  2. An **intent-fork** (`OUTCOME.kind === "intent-fork"`) — an ambiguity neither the code nor the
     intention oracle can settle. Queue BREAKING; do not guess the resolution.
  3. An **"other" wall** (`OUTCOME.kind === "other"`) — an unknown wall the schema has no tag for.
     Queue BREAKING; fail safe rather than improvise an arm.
  4. A **reconcile HALT** — reconcile returned `{halt:true}` (absent `config.runMode` on a cold
     restart, a ledger-line-without-commit torn window, an SHA-custody / mismatched-trailer conflict,
     two lanes claiming one work order). Queue BREAKING and stop; never default to the "safer" mode.
  5. An **UNEXPLAINED floor-integrity-mismatch** (D13) — a surfaced floor diff that NO `accept`
     verifier-verdict explains (a regression that bypassed the pre-integration adversary,
     `reconcile.floorIntegrity.unexplained > 0`). In autonomous mode this STOPS the loop: queue
     BREAKING and halt. An **EXPLAINED** floor diff (the adversary accepted it pre-integration) is the
     exception — a non-blocking NOTICE: it surfaces and is logged, but the run continues.

A born `characterized` classification is **not** a sixth always-escalate class: an **orthogonal** pin
(one the task neither restates nor moves) self-ratifies and is LOGGED like any other gate, because
*changing* unstated behaviour would itself be the scope violation. The human is engaged only on a
**positive conflict signal** — the characterizer's `suspectedBug` flag, or the intent-verifier
detecting tension between frozen behaviour and the stated change — which queues BREAKING (see `retro`
step 2).

**The verification trio runs in BOTH modes; only its DEPTH is dial-gated.** The `intent-verifier` (a
*judgment* adversary) judges every floor-/shared-contract-touching write against its named oracle in
both modes — autonomy never disables it. The supervision dial may only let a **present** human trade a
check for speed (e.g. skip the adversary on a pin boxed into a brand-new file nothing depends on yet);
autonomous mode keeps it maximally paranoid (the machine is the net). **Never waivable in either mode**
is the **floor-touch trip-wire** (a write on floor-tracked state always runs the adversary) and the
**annotate-not-disarm backstop** (a verdict only *annotates* a floor diff; it never silences the
surfacing). The only mode difference for the adversary itself is **when it escalates**, never whether
it runs: gated escalates **early** (the present human is cheap); autonomous escalates **only the
genuinely unsettleable**. In both modes an `escalate-intent-fork` crosses to the human inbox.

## Tier behavior — full vs lite

Tier changes **only which per-slice pipeline stages run, and how deep** — never *which guards exist*.
It is the §17 "low floor" promoted to a user-selectable axis: *only machinery scales — same workflow,
same fence, fewer stages*. Reduce by **quantity**, never by **kind** (under-rigor is the disease).

- **`full`** — every stage at full depth on every slice.
- **`lite`** — thins the **one expensive check the design permits dropping**: the vertical-slice
  **audit** drops the iterative **mutation-sample**, keeping the real **suite** run, the
  **discriminator**, **bidirectional-mapping**, and (brownfield) the characterization
  **reverse-discriminator**. The discriminator already catches the primary failure mode — a test that
  passes on both the old and new implementation; mutation-sample is the expensive *second-order* check
  for vacuous-but-non-tautological tests. This is the §17 low-floor audit collapse made per-slice
  selectable — it saves roughly a quarter of the per-slice agent cost, concentrated on the single most
  expensive stage.

**lite thins NOTHING else — every other measure is load-bearing.** Three tempting cuts are *not*
available, confirmed against the runner: the **intent-verifier** on a shared-contract touch is off the
dial entirely (non-waivable in both modes); the blind-test lane **re-provision** is a structural role
transition the test-writer needs to write tests within the fence at all (dropping it stalls the
pipeline — it is not merely a blindness guard); and the **route-planner** computes the effort-wide
**trust-staleness** set, whose blast radius spans slices. Also never thinned, off the tier dial: the
**coherence-grill loop** and the **walking-skeleton scaffold** (once-per-effort, widest blast radius),
the categorical **fences** (`fence`/`sanity`/`budget`/`stop-commit`), the **blind-test-writer
blindness**, the **discriminator** and the real **suite** run, the **floor-touch trip-wire**,
**reconcile**, and the **commit iron rule**.

**Tier is two-level and never inferred-downward.** `config.tier` is the effort default; each `route.md`
slice may carry its own `tier`, and the effective tier for a slice is `slice.tier ?? config.tier`. A
**human** may set any slice to any tier; an **agent** may only ever *raise* a slice to `full` (the safe
direction), never silently lower it to `lite` — a one-way ratchet mirroring the mode rule. lite's audit
reduction is purely mechanical and route-level (like the §17 low floor), so it applies identically in
all four (mode × tier) cells.

## Committing is authorized — and mandatory (the iron rule)

Invoking `reasonable:develop` **is** the standing authorization to commit the effort's own work product
as it proceeds — it supersedes the harness default "commit only when the user asks" for that work
product (see `using-reasonable`, the commit iron rule). This holds in **both** modes and at **both**
tiers: committing is *durability*, not *ratification*. Gated mode still blocks for your nod on the
things that are decisions — ratifying gates, **merging to your branch, and pushing** — and reasonable
**never** auto-pushes or auto-merges to your branch (commits land on lane/effort branches only).
"Uncommitted == not done": the implementer's atomic commit is mandatory, and no gate / slice / conclude
passes over uncommitted work product (enforced by `lib/commit-gate.mjs`, the conclude guard, and the
Stop/SubagentStop backstop).

## How a run is shaped (the Workflows substrate)

The orchestration substrate is the **Dynamic Workflows engine** (architecture §7, §4). The
vertical-slice loop is a pure workflow script, **one Workflow run per vertical slice, ending *at* the
retro, never through it** (D4). A background workflow **cannot block on a human and silence must never
ratify**, so the run never waits — it **returns a typed `GATE_RESULT`** and the *main session* (this
skill) does the blocking (gated) or the self-ratify-and-log (autonomous). Every human gate therefore
lives here, in the main session, not inside a workflow.

Two engine limits govern what this skill launches directly (architecture §15, §16d):
- **One-level `workflow()` nesting.** `vertical-slice-runner` cannot call `workflow()` itself, so
  **spike / scaffold / characterization workflows are launched from the main session**, never inline.
- **The trap returns, it does not poll.** A machine-to-machine wall crosses via the `agent()` return
  value; only human / cross-session decisions cross via the on-disk inbox (architecture §8).

## Steps

**Rigid skill — one TodoWrite item per numbered step; do not skip or reorder.** At every gate below,
apply *Mode behavior*: **gated** → STOP and wait for explicit approval (silence never ratifies);
**autonomous** → decide, self-ratify, and LOG — except the five always-escalate classes, which queue
BREAKING even while autonomous.

0. **Resolve and record the two axes + the birth signature (Step 0 above).** Write `config.runMode`,
   `config.tier`, `config.effort` (the effort-name birth signature), and the supervision profile. Mode
   and tier are **never inferred** — only this explicit invocation sets them.
1. **Triage + methodology.** Read `using-reasonable` for the precedence rules, the triage table (is the
   methodology even applicable?), the Three Laws, and where things live. Triage may still route *out* (a
   first-class verdict) — but once you commit to a `reasonable` effort, the protocol is absolute. (A
   typo / tiny change is realized cheaply via a `lite` effort default and a minimal route — the *same*
   runner, fewer stages — not a second philosophy; see architecture §17.)
2. **Run the SessionStart reconcile (the unconditional prologue).** Before any run — including a cold
   restart — dispatch the `reconciler` agent (wrapping `lib/reconcile.mjs`). It re-derives truth from
   git + ledger + contracts; it is the **only** authoritative recovery path (architecture §11–12).
   Reconcile reads `config.runMode` (and `config.tier`) into the briefing; **if `runMode` is
   absent/null it HALTS** — defaulting to a "safer" mode is still an inference, which the framework
   forbids. Any AMBIGUOUS artifact configuration likewise sets `{halt:true}` → a **blocking** human
   decision, never a recovery-time guess.
3. **Present the briefing — BREAKING first (D17).** Surface the reconcile briefing. Present **BREAKING**
   inbox items first (intent-fork, vision amendment, second budget extension, reconcile HALT) and decide
   each before progress; merely **count** ADVISORY items. If BREAKING items for one vertical slice
   exceed the load tripwire, surface *that* as a meta-signal that the intention is under-specified —
   route back to enrich it, do not suppress.
4. **Run analysis (the intention oracle).** Invoke `reasonable:analysis`. It grills the vision,
   pre-drains the obvious intention forks in shared context, then launches `coherence-grill.workflow.js`
   (each batch of independent forks — approach tier before detail — returns to *you* to put to the
   human), ratifies the fence-protected `.reasonable/intention.md`, triages applicability, and emits the
   initial route. **The coherence-grill runs at full strength regardless of tier.** At the analysis
   sign-off: gated → **STOP and wait**; autonomous → self-ratify-and-log (a vision/intention amendment
   is the one thing that queues BREAKING).
5. **Launch the scaffold from the main session.** Invoke `reasonable:scaffolding`, which launches
   `scaffold.workflow.js` (walking skeleton + parked scenario suite → read-only invariant-verify).
   **This skill launches it — never the runner** (the one-level nesting limit). **The walking skeleton
   runs at full strength regardless of tier.** At the scaffold sign-off: gated → **STOP and wait**;
   autonomous → self-ratify-and-log. *(Brownfield: launch `characterization.workflow.js` here instead —
   the analysis-time frontier inventory pass.)*
6. **Launch one vertical-slice run per vertical slice, and route its `GATE_RESULT` (D4, §7).** For the
   best-first vertical slice on the route, launch `workflows/vertical-slice-runner.workflow.js` with
   fresh **args** — vertical-slice id, route snapshot, contract paths, per-vertical-slice budget,
   `mode` (from `config.runMode`), supervision profile, and the slice's **effective tier**
   (`slice.tier ?? config.tier`). Re-assert both `runMode` and `tier` from the reconcile briefing. The
   run drives the slice toward GREEN, persists gate evidence + a proposed route re-sort atomically, and
   **returns a typed `GATE_RESULT`** — branch on it:
   - **`green`** → run the **retro** (step 7). Do not open the next slice before it.
   - **`budget-exhausted`** → a human decision (extend budget / re-plan), **not** a gate. Present
     `progress` + `lastOutcome`; gated → **wait** (a second extension is BREAKING); autonomous → decide
     and log (a second extension queues BREAKING).
   - **`blocked`** → a trap needs a decision (`intent-fork` / `other` fail safe to the human; a
     `spike-needed` arm means **you** launch `spike.workflow.js` from the main session). Resolve, then
     re-launch the slice.
   - **`halt`** → a durability/reconcile halt → present the evidence and **block** in both modes. Never
     auto-resolve.
7. **Run the retro (the blocking heartbeat).** On a `green` result, invoke `reasonable:retro`. Re-check
   the gate evidence yourself, classify every divergence three ways, approve the amendment batch and
   route re-sort **item by item**, clear the inbox, tune budgets / the supervision dial / **per-slice
   tier overrides**, and record any `intent-check-failure` (D18). At the retro: gated → **STOP and wait**
   for explicit approval of each item (silence never ratifies); autonomous → self-ratify-and-log each,
   queuing the always-escalate classes BREAKING.
8. **Loop or finish.** Route has more vertical slices → return to step 6 and **re-launch** a freshly
   parameterized runner for the next best-first slice (inter-slice dynamism rides in the *args* —
   including any changed effective tier — never in model-authored JS). Route empty → invoke
   `finishing-a-development-branch` to integrate.
