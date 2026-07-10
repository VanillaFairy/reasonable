# T01c — Legibility-law audit

**role:** audit
**Depends on:** T01b
**Owns:** nothing (read-only — report findings; do not edit code, tests, or docs)

> **Read first:** `../shared/interfaces.md`, `../shared/conventions.md`, DESIGN-3.0 §5.2 (the four
> legibility invariants + the density-reduction guard), and the plan's **Flagged calls** section. You
> are the `audit` role: adversarially verify the T01a tests AND the T01b implementation. You have Bash
> for read-only verification. You **fix nothing** — you report gap findings, each of which becomes a
> new `red` task the supervisor schedules (the P6a/P6d pattern: an audit finding is a fresh follow-up
> commit, never a blocking redo).
>
> **This is the load-bearing audit.** P6b is one dense triad instead of a per-invariant split (see the
> plan's one-triad rationale), so the adversarial teeth a split would give each invariant are
> delivered HERE: run every check below, invariant by invariant.

**The audit checklist — run each, report the result:**

- [ ] **Discriminator (teeth), per invariant.** A test is meaningless if it passes against a stub.
  Confirm each invariant's positive tests genuinely fail without the code that computes it. Concretely,
  for each of `widthFindings` / `tangleFindings` / `crossConeCouplingFindings` / `godComponentFindings`
  / `chainFindings`, temporarily neuter that one function to `return []` in a scratch copy and confirm
  its positive check(s) FAIL, while the others still pass. A suite where an invariant survives its own
  detector being stubbed has no teeth there. Restore. Report per-invariant which checks fell.

- [ ] **The density-reduction guard — the empty-strata gaming attack (THE load-bearing property).**
  This guard closes the boundary R8 left open; it is the highest-risk piece. Actively try to smuggle a
  cosmetic regrouping past it:
  - a proposal that adds **empty group labels** but assigns every real child to its own distinct group
    (models "insert empty strata to restore bounded width") — MUST return `false`;
  - a proposal that buckets children arbitrarily but **co-locates no coupled pair** — MUST return
    `false`;
  - a genuine cluster that co-locates a coupled pair — MUST return `true`;
  - confirm the metric is a **strict** reduction (`proposedCross < currentCross`), so a regrouping that
    leaves cross-group count unchanged is rejected.
  Report any proposal shape that passes the guard without reducing measured cross-group density.

- [ ] **Chain cycle-safety.** Feed `chainFindings` a `needs` cycle (`a→b→a`) plus a tail (`b→c`) and a
  self-loop (`x→x`); confirm it **terminates** (does not hang), returns a **finite** chain length, and
  never emits a chain that revisits a node. Confirm the acyclic case is exact (a pure DAG chain reports
  its true node count). Report if any cyclic input hangs or double-counts a node.

- [ ] **Overlapping-cone coupling.** `servesEdges` is transitive, so a shared provider serves multiple
  goals (cones overlap). Feed two goals whose cones **share** an atom plus have interlinked exclusive
  atoms; confirm the shared atom is excluded from the exclusive sets and the metric still fires on the
  exclusive interlink. Confirm two goals with **only** a shared atom (no exclusive cross-edge) produce
  no finding. Report if cone overlap corrupts the density (e.g. divide-by-zero when a cone is a subset
  of the other — `exA` or `exB` empty must skip the pair, not throw).

- [ ] **Threshold shape-not-value + never-fabricate.** Confirm a `policy.legibility` with a threshold
  **absent** disables exactly that check (no findings, no throw); a threshold set to an **absurd but
  finite** value (`maxWidth: -1`, `maxTangle: 0`) loads and fires per the number given (P6b validates
  shape, never value — mirrors `policy.mjs`/`route.mjs`). Confirm `policy` entirely absent, `{}`, and
  `{legibility:{}}` all yield `[]` and never throw.

- [ ] **Bidirectional §5.2 mapping.** Walk both directions, report any unmapped item:
  - **Every assertion → a §5.2 clause.** Each `check()` pins bounded width, bounded tangle, a coupling
    smell (cross-cone or god-component), a chain smell, the density-reduction guard, the R8 composition,
    or a documented degeneracy. Flag any test pinning something §5.2 does **not** say (an over-fitted
    golden — especially a hard-coded cross-cone density the interfaces flag as contestable).
  - **Every §5.2 legibility clause → an assertion.** Bounded width, bounded tangle + its guard, both
    coupling sub-smells, and the chain smell are each covered. Flag any §5.2 legibility requirement with
    **no** test. (Known, correct scope boundary — not a gap: the *dispatch* distinction between
    genesis-R8-blocks and live-R8-batches is P7's routing, not P6b's; do not flag its absence here.)

- [ ] **The R8 composition boundary (Flag 1).** Confirm a finding fed as an `illegible` verdict's
  `proposal` round-trips through `computeVerdictEffects` for BOTH `scope: 'genesis'` and `scope: 'live'`
  and that `validateEffects` accepts the resulting topology effect. This is the one boundary that must
  compose; confirm the test exercises both scopes.

- [ ] **Purity + Law 1.** Confirm `legibility.mjs` reads no disk, calls no `append()`, and imports
  **only** `liftEdges` from `./graph.mjs` — NOT `effects.mjs`, NOT `rewrite.mjs` (an import cycle
  risk), NOT `policy.mjs`, NOT `node:fs`. Confirm `lib/` stays dependency-free (no third-party import).

- [ ] **Regression + additivity.** Run the full suite:
  ```bash
  for t in test/*.test.mjs; do node "$t"; done
  ```
  Confirm no `FAIL` anywhere and that **no existing function in `graph.mjs` (or any shipped file)
  changed** — P6b adds one new file and imports one existing export; it edits nothing landed.

**Report format:** a short list of findings, each `CONFIRMED` (reproduced) or `PLAUSIBLE`, with the
concrete input → wrong/missing output. If the suite is clean and the mapping is total, say so plainly —
an empty findings list is the correct result for a solid triad. Any confirmed gap becomes a new `red`
task (T01a-2, …) the supervisor dispatches (a fresh follow-up commit) before T02.
