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

## Anticipated next (not yet defined)

- **Semantic fence** — the fence gates the *bytes* an agent writes, not the *meaning* it changes (in-locus
  edits to shared deps / generated files / shared state escape it).
- **Standalone bugs** — e.g. the redispatch guard that never fires, the unwired `mode` field, the unbuilt
  ratchet-weaken check.
