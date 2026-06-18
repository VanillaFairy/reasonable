# reasonable 2.0 — staging

This folder collects **problem definitions** for the next major stage of the `reasonable`
plugin. Each improvement gets its own file, and each file defines *one problem* — what is
broken and why it matters — without committing to a solution. The actual design and
implementation of each fix happens in a dedicated session, working from its problem file.

The split is deliberate: define the problem cleanly here, solve it separately. A problem file
should be readable cold — a fresh session should understand exactly what to fix, what failure
modes to prevent, and how we'll know it's fixed, without having seen the conversation that
produced it.

## Foundation

Read first. The frame every other 2.0 decision hangs off:

- [principles.md](principles.md) — **the validated concise foundation** (the *why*). One posture
  (default-deny / skeptical by design) → one invariant (deliver the ask, no less/no more) → three means
  (external verification · capability > discipline · feedback > prediction) → the human contract (a
  competent owner, served not policed). Validated through four stress-test probes; a 12-perspective
  failure catalog is demoted to a per-domain tuning guide, deliberately out of the core.
- [architecture.md](architecture.md) — **the implementation-ready architecture** (the *how*), freshly
  re-derived from the refined principles under default-deny. Commits fully to Dynamic Workflows as the
  *orchestration* substrate (the v0.1 orchestrator is retired); reasonable keeps the governance, the
  capability law (hooks), and the domain state. **Four planes** (the human keeps the name "control plane"):
  human decision plane / orchestration substrate (Workflows) / capability law (hooks) / program+state.
  Carries a build punch-list (§20) of the concrete new code — including the corrections the re-derivation
  forced: the fence actually fails *open* today, reconcile never *halts* today, and the whole intent half
  (the coherence-grill, the intention-as-oracle) had no mechanism. The earlier, superseded sketch is
  preserved as [architecture.sketch.md](architecture.sketch.md).

## Improvements

- [cross-vertical-slice-parallelism.md](cross-vertical-slice-parallelism.md) — **true cross-vertical-slice parallelism (multi-writer
  journal).** Deferred past v1. Running multiple *vertical slices* concurrently would put N scribes on one
  journal, breaking the single-writer invariant; the candidate fix is "the parent run owns the journal."
  Surfaced stress-testing the architecture; tightens the over-optimistic §22 growth-path bullet.

The first candidate — durable crash-safe trap/resume — was **folded
into the foundation**, but the re-derivation corrected *why*: the bespoke WAL is still dropped, yet **not**
because `resumeFromRunId` "inherits durability" (it is same-session-only and non-authoritative — demoted to
a pure speed optimization). The real reason is that **git + the append-only ledger already are the
write-ahead log**. The residual durability obligation is named as new code in [architecture.md](architecture.md)
§12 — the worker's one atomic commit + a *total, halting* reconcile pass — not a protocol to invent.

Anticipated next (not yet defined):
- **Semantic fence** — the fence gates the *bytes* an agent writes, not the *meaning* it changes
  (in-locus edits to shared deps / generated files / shared state escape it).
- **Standalone v0.1 bugs** — e.g. the redispatch guard that never fires, the unwired `mode` field, the
  unbuilt ratchet-weaken check.

## Where these came from

Two reviews of the v0.1 build:
- An **implementation-fidelity audit** (does the build embody DESIGN.md?) — surfaced that the
  verification *scripts* have real teeth, but the *orchestrator's state and coordination* are
  largely prose the main-session model is trusted to maintain.
- A **stress-test** of the proposed dynamic "trap-to-orchestrator" coordination model — five
  adversarial lenses (concurrency, adversarial agent, scaling, crash-recovery, re-plan
  correctness) that converged on the same root weakness.

The WAL trap-protocol is the first fix to come out of that. Others (e.g. the semantic fence,
and the standalone v0.1 bugs like the inert redispatch guard) will get their own files here.
