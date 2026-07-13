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
- [thin-planner.md](thin-planner.md) — **LANDED 2026-07-05.** Route planning paid an
  O(effort-history) opus turn for mostly-decidable work — the fat Plan turn derived footprints and
  trust-staleness in prose and re-read stable docs + full history uncached every slice (~1 h on
  sofia-plays). **Shipped:** a thin judgment-only route-planner returning a slim `DECOMPOSITION`
  (`Read/Grep/Glob` only, no Bash/Edit, no doc preamble); `lib/trust-staleness.mjs` extracted +
  tested, its derived `staleTrusted` copied verbatim by the reconciler; and a dedicated
  `footprinter` agent computing closure + independence over the persisted specs (the "ride the
  writer / zero new turns" idea was infeasible — the writer is Bash-less). See the file's banner for
  the two corrections to the original definition.
- [intra-slice-provider-merge.md](intra-slice-provider-merge.md) — **a same-slice producer→consumer
  split has no merge boundary to cut the consumer from.** The effort-branch merge only lands a green
  lane between vertical-slice runs, not between waves inside one run — a same-slice consumer's lane can
  be cut before its provider's commit is reachable. Interim mitigation: the route-planner folds a
  same-slice hard dependency into one work order instead of splitting (2026-07-03); the real fix is
  wave-granularity merging gated on each work order's own green OUTCOME.
- [dead-end-blast-radius.md](dead-end-blast-radius.md) — **a dead end refutes a premise, but the
  system only records a work order.** Id-level retirement (landed v2.3.0: briefing surfacing +
  RETIRED drop + frontier-stuck escalation) cannot catch a rebranded dead idea. Candidate fix:
  reify the refuted premise in the dead-end event grammar, compute blast radius as a widen-only
  citation closure, self-route dead-end records into intersecting footprints, and supersede
  D§5.8's hash-unbind with permanent id retirement — a deliberate DESIGN.md + glossary amendment.
- [atom-graph-orchestrator.md](atom-graph-orchestrator.md) — **the dynamic atom graph has no live
  dispatcher.** The lifecycle/fold/packer/classifier are unit-tested in `lib/`, but nothing
  dispatches atoms — the live engine still runs 2.x work orders and `frontier-wave` is a schematic
  stub. Finishing the P5–P8 wiring + calibrating the ceremony dial is what makes "ceremony is a
  dial" and a proportionate simple-task lane real.
- [knowledge-brick.md](knowledge-brick.md) — **knowledge work is not a first-class brick.** The
  atom terminates in `merged` code, while a spike/investigation is a separate Node-kind plus an
  `informs` edge. Candidate: lift `Kind` onto the atom (`deliver | investigate`) so `informs`
  collapses into `needs` and a simple task and a complex investigation become one primitive at
  different sizes.

## Anticipated next (not yet defined)

- **Semantic fence** — the fence gates the *bytes* an agent writes, not the *meaning* it changes (in-locus
  edits to shared deps / generated files / shared state escape it).
- **Standalone bugs** — e.g. the unwired `mode` field, the unbuilt
  ratchet-weaken check.
