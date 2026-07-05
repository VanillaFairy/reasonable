# Problem: route planning pays an O(effort-history) opus turn for mostly-decidable work

**Status:** LANDED 2026-07-05 (branch `feat/thin-planner`) — the problem definition below stands; two
claims in it were corrected during implementation (see the banner). Implementation deferred *nothing*:
the thin planner, the dedicated footprint step, and the trust-staleness extraction all shipped.
**Origin:** surfaced on sofia-plays runs — the vertical-slice runner's Plan phase took **up to an
hour** on late slices, growing with effort history. Diagnosed 2026-07-05 against the workflow and
libs; the sofia-plays transcript numbers (output-token size, StructuredOutput retry count) are still
worth confirming to attribute the *measured* dominant cost, but the structural fix landed regardless.

> **What actually shipped (and two corrections to the definition below).**
> 1. **Trust-staleness already existed** as a private, untested function inside `reconcile.mjs` — the
>    definition's "no lib exists… derived by prose twice" overstated it. Reality: it was computed
>    mechanically but flattened to `staleTrusted` by the reconciler *agent* in prose. **Shipped:**
>    extracted to `lib/trust-staleness.mjs` (exported, 7 unit tests), reconcile emits a **derived**
>    `staleTrusted` list, and the reconciler now copies it verbatim (like `terminalWorkOrders`). The
>    planned per-work-order `distributeStaleness` was **dropped** — the old per-WO `staleTrusted` had
>    no consumer (the audit re-verifies at slice level), so it was YAGNI.
> 2. **"Zero new agent turns" was infeasible.** The footprint run could not "ride the work-order-writer
>    ACK": that writer is **Bash-less by charter**, and the citation closure needs the contract graph
>    on disk (the pure script can't read it). **Shipped:** a dedicated **`footprinter`** agent (haiku,
>    read-only + Bash) runs `footprint.mjs` over the persisted specs between persist and grouping —
>    one cheap new turn, membrane-clean, single-responsibility. The three-step Plan ordering
>    (persist → footprint → group) is pinned by
>    `test/vertical-slice-runner-persist-work-orders.test.mjs`, including a HALT-on-partial-set guard.
>
> Net effect on the planner turn: it now returns a slim **`DECOMPOSITION`** (cut + declared locus +
> contract *seeds* + fork citations — no closure, no staleness, no wave sizing), its constitution
> dropped the mandatory `glossary.md`/`artifacts.md`/`component-contract` re-reads, and its allowlist
> tightened to `Read, Grep, Glob` (no Bash, no Edit) — so it *cannot* narrate the fence's arithmetic.

> **Sibling problems.** [mechanical-step-executor.md](mechanical-step-executor.md) is the same
> disease in the *scribes* (deterministic file/git work paying an LLM cold-start; interim Haiku
> downgrade landed 2026-07-03). [forced-tool-call-shape.md](forced-tool-call-shape.md) is the retry
> class that multiplies whatever the planner turn costs. This file is the *planner-side* instance:
> decidable computation trapped inside the single most expensive judgment node.

## What is broken

The Plan phase is **one `opus` agent turn** (`routePrompt()` in
`workflows/vertical-slice-runner.workflow.js`) asked to do judgment *and* mechanics serially. The
mechanics dominate, and every one of them is decidable:

1. **Footprints are derived in prose because of a chicken-and-egg.** The prompt says "footprint via
   `lib/footprint.mjs`" — but `footprint.mjs` reads `.reasonable/work-orders/<id>.json` specs off
   disk, and those are written only *after* the planner returns (the propose/persist membrane). For
   every **new** work order the mechanical tool literally cannot run, so the planner hand-derives
   locus ∪ citation-closure ∪ resources in prose. The independence algebra then exists **three
   times** at runtime: the planner's prose (slow, discarded), `footprint.mjs` (unused for new WOs),
   and the script's `groupDisjoint()` (authoritative).
2. **Trust-staleness (D13) is derived by prose twice and by script never.** No lib computes it —
   `staleTrusted` appears in no `lib/*.mjs`. The reconciler is *told* to "compute the
   trust-staleness set" from the ledger, and the planner is then told to re-derive it per work
   order. Both walk an append-only ledger that `readJsonl` + `citationGraph()` settle in
   milliseconds — and the walk grows O(effort history) every slice.
3. **Wave sizing vs. the 1000-agent cap** is arithmetic assigned to the planner's prose; the script
   already tracks `agentsDispatched`.
4. **The doc preamble is a recurring full-price bill.** The constitution mandates reading
   `glossary.md`, `artifacts.md`, and the `component-contract` skill *every call*. Subagent
   dispatches are fresh conversations — nothing is cached across them — so tens of thousands of
   stable reference tokens are re-paid, per slice, forever.
5. **The output is fat.** `ROUTE_PLAN` carries full per-WO footprints (closure included) +
   per-WO staleness + rationale — a large structured object generated serially by the slowest
   model tier, and the unit of regeneration when a forced-tool call-shape retry fires.

All of this sits on the wrong side of the plugin's **own ruling**: D12 / DESIGN §5.11 classify
footprint/overlap as a *decidable fence* — "a conservative computed set intersection … scrutiny
would be wasted on it." The current wiring makes the most expensive stochastic node narrate the
fence's arithmetic.

## Why it matters

- **Wall-clock grows monotonically.** Ledger + contract graph grow per slice; the planner re-reads
  the whole world cold each time. An hour-long Plan phase on a late slice is the observed endpoint.
- **The critical path is unparallelizable as long as the fat turn owns it.** Reconcile → plan →
  persist → waves is a hard chain; the only fix for the chain's dominant node is making it thin,
  not fanning it out.
- **Retry blast radius.** A call-shape retry regenerates the *entire* plan. Five wrapped attempts
  crash the run (the reconciler-crash class); even sub-cap retries can multiply a 20-minute turn
  into an hour.
- **Cost.** Opus tokens spent transcribing what `node` computes for free, plus the uncached doc
  preamble on every dispatch.

## Failure modes a solution must prevent

1. **Judgment leaking into scripts.** Decomposition ("no AND in the commit message"), best-first
   ordering, D5b fork resolution with oracle citations, and the `characterization-needed` call are
   genuine judgment — they must stay in an agent that cites `intention.md`, never become heuristics
   in code.
2. **Membrane regression.** The planner must still only PROPOSE; the work-order-writer must still
   invent and re-order nothing. Moving the footprint run into the writer must not hand it any
   discretion — it runs a script on the specs it just persisted and transcribes the output.
3. **Staleness under-approximation.** D13 is conservative on the citation: a script that misses a
   governing-clause event and silently shrinks the re-verify set corrupts trust. The lib must be
   conservative by construction, like `footprint.mjs` (over-approximation costs re-verification,
   never correctness).
4. **Losing the terminal-WO backstop.** The script-side filter on `terminalWorkOrders` stays,
   regardless of who computes what.
5. **Schema churn.** Constrained decoding caches compiled grammars and invalidates on schema
   *structure* change — the slimmed output schema must be stable across dispatches, not rebuilt
   per call.
6. **Context creep-back.** Nothing re-adds mandatory cold reads of stable reference docs to the
   planner's dispatch; the distilled charter lives in the constitution (which *is* the system
   prompt) and is maintained there.

## Candidate resolution (the design direction, not yet committed)

**The thin planner: judgment shrinks to one small turn; every decidable byte rides existing steps
as script calls. Zero new agent turns.**

- **The planner keeps exactly its judgment residue** — decomposition, ordering, D5b fork
  resolution, `characterizationNeeded` — and returns a slim `DECOMPOSITION` schema: per WO
  `{id, role, locus[], contractSeeds[], resources[], behaviorDelta[], characterizationNeeded,
  forkCitations[]}` + one rationale. No closure, no staleness, no wave sizing, no footprint echo
  (~2–4k output tokens instead of ~10–20k). The doc preamble dies: the ~15 rules the planner
  actually applies are distilled into `agents/route-planner.md` itself. Tool allowlist tightens to
  `Read, Grep, Glob` — with the footprint runs gone, `Bash` goes, and `Edit` was always suspect
  (route.md is orchestrator-only per its own constitution). Dispatch at the judgment tier
  (opus, effort `xhigh`); its input is a **delta briefing** (events since the last slice gate,
  emitted by `reconcile.mjs`), never the full history — this is what makes the step flat across
  slices instead of O(history).
- **New `lib/trust-staleness.mjs`** — ledger events × clause→test citations → the per-test
  staleness set, built on the existing `readJsonl` / `citationGraph()` / `parseContract()`
  exports, conservative on the citation. `reconcile.mjs` calls it and emits `staleTrusted` as a
  **computed field the reconciler copies verbatim** — exactly the `terminalWorkOrders` pattern
  already in place. Both prose derivations (reconciler's and planner's) die at once. Per-WO
  distribution becomes pure script set-algebra: staleness tests whose governing contract ∈ the
  WO's footprint contracts.
- **The footprint run rides the work-order-writer.** The writer already runs *after* specs hit
  disk; it gains one instruction — run `footprint.mjs --json <ids>` post-persist and return the
  machine output (footprints + pairwise independence) in its ACK. The chicken-and-egg dissolves,
  and the fence now computes from the **artifact of record** (the persisted dispatch license)
  rather than a prose transcription of a proposal — more doctrinally correct than today, not
  less. `groupDisjoint()` stays in the script as the pure backstop, consuming machine JSON.
  The writer stays at the mechanical tier (haiku, effort `low` — the interim downgrade from
  [mechanical-step-executor.md](mechanical-step-executor.md) already points this way).
- **Wave sizing vs. the agent cap moves to the script**, next to `withinAgentCap()`.
- **Brownfield characterization pre-checks parallelize beside the persist step** — per flagged
  seam, read-only haiku checks against `baseline.json`, in the same `parallel()` as the writer
  instead of serialized inside the planner's turn.
- **Schemas tighten.** With grammar-constrained decoding, `additionalProperties: true` stops being
  retry insurance; `DECOMPOSITION` is specified strictly and kept structurally stable.
- **Explicit non-goals:** judge-panel decomposition (a quality knob, not a latency win — opt-in
  per "spend feedback carefully") and pre-planning slice N+1 during slice N (banned outright:
  the gate reprices the route first — feedback beats prediction).

## How we'll know it's fixed

- The Plan phase runs in **minutes, flat across slices** — its wall-clock no longer correlates
  with ledger length or contract count.
- The planner's structured output is a slim `DECOMPOSITION` (~2–4k tokens); its dispatch context
  contains no cold reads of `glossary.md` / `artifacts.md` / the `component-contract` skill.
- `staleTrusted` is computed by **one script** (`lib/trust-staleness.mjs`, with its own test file),
  copied verbatim by the reconciler, distributed per-WO by set-algebra — zero prose derivations
  remain in any prompt.
- Pairwise independence is computed **once**, from the persisted specs, and `groupDisjoint()`
  consumes machine JSON.
- The route-planner's allowlist is `Read, Grep, Glob` — it *cannot* shell out or edit, so the
  fence's arithmetic cannot drift back into its prose (capability, not discipline).
- A resumed or re-passed run skips the planner via the workflow's unchanged-call cache instead of
  re-paying the turn.
