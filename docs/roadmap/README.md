# reasonable — roadmap

Post-1.0 problem definitions. Each file defines *one problem* — what is broken and why it matters, the
failure modes a solution must prevent, and a candidate direction — without committing to a full design. Each
is readable cold; the actual design and implementation of a fix happens in a dedicated session working from
its problem file.

## Open problems

- [cross-vertical-slice-parallelism.md](cross-vertical-slice-parallelism.md) — **true cross-vertical-slice
  parallelism (multi-writer journal).** Running multiple *vertical slices* concurrently would put N scribes on
  one journal, breaking the single-writer invariant; the candidate fix is "the parent run owns the journal."
  An opt-in growth path, not a default — parallelism spends feedback. Tightens the
  [architecture.md](../architecture.md) §23 growth-path bullet.
- [commit-granularity.md](commit-granularity.md) — **a whole bit's worth of work lands as one commit.**
  Region-scoped, one-commit-per-bit work product via a `lib/atomic-commit.mjs` engine and two triggers
  (implementer inline / no-Bash roles via a Stop-replayed manifest), with merge-by-topology and
  green-on-first-parent.
- [mechanical-step-executor.md](mechanical-step-executor.md) — **mechanical steps pay an LLM cold-start.**
  The pure script cannot touch disk, so provisioning + the scribes (work-order-writer, verdict-writer,
  journal-writer) are cold-context agents doing deterministic file/git work — ~5 serial spawns per work
  order. The real fix is an engine-side no-LLM `exec` primitive; an interim Haiku downgrade for those
  roles landed 2026-07-03.
- [forced-tool-call-shape.md](forced-tool-call-shape.md) — **forced-tool call-shape mis-calls burn
  retries (and can crash a run).** The model sometimes wraps its whole answer in `{"input":"{…}"}`
  instead of passing schema fields as top-level args; each fails validation and burns a retry, five in a
  row crash the agent (the reconciler-crash class). Root fix is engine-side unwrap-before-validate; the
  `callShapeReminder` prompt mitigation now covers all six workflows (2026-07-03).
- [thin-planner.md](thin-planner.md) — **route planning pays an O(effort-history) opus turn for
  mostly-decidable work.** The Plan phase's single fat agent turn derives footprints in prose (the
  propose/persist chicken-and-egg blocks `footprint.mjs` for new WOs), derives trust-staleness by
  prose twice (no lib exists), and re-reads stable docs + full history uncached every slice — up to
  ~1 h observed on sofia-plays. Candidate fix: a thin judgment-only planner (slim `DECOMPOSITION`
  schema, delta briefing, `Read/Grep/Glob` only) + `lib/trust-staleness.mjs` in the reconcile
  briefing + the footprint run riding the work-order-writer's ACK — zero new agent turns.
- [intra-slice-provider-merge.md](intra-slice-provider-merge.md) — **a same-slice producer→consumer
  split has no merge boundary to cut the consumer from.** The effort-branch merge only lands a green
  lane between vertical-slice runs, not between waves inside one run — a same-slice consumer's lane can
  be cut before its provider's commit is reachable. Interim mitigation: the route-planner folds a
  same-slice hard dependency into one work order instead of splitting (2026-07-03); the real fix is
  wave-granularity merging gated on each work order's own green OUTCOME.

## Anticipated next (not yet defined)

- **Semantic fence** — the fence gates the *bytes* an agent writes, not the *meaning* it changes (in-locus
  edits to shared deps / generated files / shared state escape it).
- **Standalone bugs** — e.g. the redispatch guard that never fires, the unwired `mode` field, the unbuilt
  ratchet-weaken check.
