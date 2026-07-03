# Problem: mechanical steps pay an LLM cold-start — a deterministic step executor

**Status:** TODO — problem defined here; the real fix needs a Workflow-engine capability outside this
repo. An in-plugin interim mitigation (Haiku for the mechanical roles) landed 2026-07-03.
**Origin:** surfaced profiling a real reasonable run (sofia-plays, graph-editor-ux-overhaul,
2026-07-03). One foundational-module work order took ~63 min wall-clock; roughly 20–25 of those
minutes were mechanical file/git work paying full LLM round-trip latency.

## What is broken

Workflow scripts are **pure** (invariant #5: no `fs` / `Date.now` / random / imports — the substrate
requirement that lets a run resume deterministically). A pure script can *decide* the next transition
but cannot *perform* one: it has no filesystem and no shell. So **every** side effect — including
trivially deterministic ones — must be delegated to a subagent that has Bash/Write.

The result is that several stages per work order are LLM cold-context agents doing near-zero
reasoning:

- **`lane-provisioner`** — `git worktree add` + symlink the effort's dep dirs + write one
  `.reasonable-lane.json` descriptor + record the lane in the journal. It also runs a **second** time
  per work order, purely to re-narrow the descriptor's role from `implementer` to `blind-test-writer`.
- **`work-order-writer`** — serialize the route-planner's proposed work orders to their on-disk specs.
- **`verdict-writer`** — append one `verifier-verdict` line via `lib/ledger.mjs`.
- **`journal-writer`** — write `journal.json` + `inbox.json` (twice per wave: the write-ahead, then
  the authoritative write).

Each pays a full model spawn (read context → do a two-second action → emit schema-forced output,
sometimes with a retry). On the profiled run that was roughly **five mechanical spawns on the serial
critical path per work order** — the ~19-min "work-order-writer + provision" gap and the ~5-min
re-provision window were almost entirely this, not real work.

Everything these agents *do* already exists as deterministic `lib/*.mjs` CLIs (`ledger.mjs`,
`reconcile.mjs`, `footprint.mjs`, plus plain git). The agent is just an LLM shell around invoking them.

## Why it matters

Latency and cost dominated by plumbing. It bites hardest exactly where the methodology should feel
lightest: a small, foundational, brownfield slice whose producer/consumer work orders **serialize**
(they can't parallelize), so the fixed per-work-order mechanical tax is paid on every one of them and
is the *largest* fraction of a short slice. The user-visible effect is "reasonable is slow" on the
slices where it is doing the least actual thinking.

## Failure modes a solution must prevent

1. **Purity / resumability regression.** An exec primitive that reads a clock or mutates
   nondeterministically breaks deterministic replay — the whole reason the script plane is pure.
2. **Fence bypass.** The executor must not become an un-governed write path. Today the fence governs a
   subagent's writes by its role stamp; a raw `git`/`fs` from the script sidesteps that control surface
   entirely. The sanctioned crossing is the `lib` CLIs (e.g. ledger appends go through `ledger.mjs`,
   never a direct file write) — a mechanical executor must route through those, not around them.
3. **Separation-of-powers erosion.** The re-provision step is **load-bearing**: it re-narrows the
   fence from `implementer` (may edit source, not tests) to `blind-test-writer` (may edit tests, not
   source). Collapsing it into one dual-role descriptor would let the implementer write its own tests —
   destroying the blind-test guarantee. A cheaper executor must still *perform* that re-narrowing.
4. **Silent determinism loss in provisioning.** A step that used to be a schema-validated agent return
   must stay checked at the executor — and provisioning specifically should become deterministic
   (same inputs → same descriptor + same dep-link), removing today's "did the agent symlink deps or
   decide to re-install them?" latitude.

## Candidate resolution (direction, not committed)

Two layers, one of which is already done:

- **Engine (outside this repo).** A deterministic, no-LLM step primitive for Dynamic Workflows — an
  `exec(cmd)` the pure script can call, or a "mechanical node" that runs a fixed command and returns
  its stdout/JSON without spawning a reasoning agent. The pure script then drives the existing
  `lib/*.mjs` CLIs directly; provisioning and all three scribes collapse from minutes to sub-second
  **and** become deterministic. This is the real fix; it cannot live in the plugin because the plugin
  cannot grant the substrate a capability it doesn't have.

- **In-plugin interim (done 2026-07-03).** The five mechanical roles — `work-order-writer`,
  `lane-provisioner`, `verdict-writer`, `journal-writer`, `intention-writer` — were re-pinned to
  `model: haiku`. They do no open-ended reasoning and their output stays schema-forced, so a
  faster/cheaper model is safe and recovers most of the tax without an engine change. This is a
  mitigation, not the fix: the spawn still happens; only its per-spawn cost drops.

## How we'll know it's fixed

- A work order's provisioning + scribe stages complete in **seconds, not minutes**.
- The pure script invokes the deterministic `lib` CLIs directly for mechanical steps; no cold-context
  agent is spawned solely to run a fixed command.
- Provisioning is deterministic and replay-stable (same inputs → identical descriptor + dep-link).
- The role-fence and the `implementer` → `blind-test-writer` re-narrowing are unchanged; separation of
  powers still holds.
