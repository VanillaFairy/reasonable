# T03c — Layered-DAG layout audit

**role:** audit
**Depends on:** T03b
**Owns:** nothing (read-only — report findings; do not edit code, tests, or docs)

> **Read first:** `../shared/interfaces.md` (§B1), `../shared/conventions.md`, DESIGN-3.0 §5.3 (the
> layered layout), and the plan's **Flag 4** (properties not goldens) + **Flag 5** (cycle-safety). You
> are the `audit` role: adversarially verify the T03a tests AND the T03b implementation. You have Bash for
> read-only verification. You **fix nothing** — you report gap findings, each of which becomes a new `red`
> task the supervisor schedules (the P6a/P6b/P6c/P6d pattern: an audit finding is a fresh follow-up
> commit, never a blocking redo).
>
> **Audit the QUIESCENT layout half only.** T04b has not yet appended `renderTopologyHtml`; the file ends
> at the append marker. Audit `layoutTopology` and its tests; do not comment on the (absent) renderer.

**The audit checklist — run each, report the result:**

- [ ] **Discriminator (teeth), per property.** In a scratch copy of `lib/topology-view.mjs`, neuter the
  algorithm and confirm the matching checks fall:
  - make `layoutTopology` **skip the barycenter passes** (delete the `for … sweep` loop) — the "X
    resolved to zero crossings" and "strictly fewer than naive" checks MUST fail (a suite where crossing
    reduction survives a no-op barycenter has no teeth);
  - make ranking **rank every node 0** (return `best = 0`) — the rank-consistency and longest-path checks
    MUST fail;
  - make coordinates **constant** (`x: 0, y: 0`) — the coordinate-monotonicity check MUST fail.
  Restore. Report which checks fell for each mutation; a property whose mutation leaves the suite green is
  a hole.

- [ ] **The crossing-reduction property (the genuinely-new algorithm — attack it).** Beyond the "X"
  fixture, hand-build a second reducible crossing (e.g. three nodes on each rank with a resolvable
  permutation) and confirm `layoutTopology` reaches a crossing count **≤** the naive input order. Confirm
  the "already-optimal stays 0" case does not *introduce* a crossing. Report any fixture where the layout
  worsens or fails to reduce a resolvable crossing.

- [ ] **Longest-path exactness.** Confirm a node reachable by paths of different lengths takes the
  **longest** (not the shortest, not the first found), and that a source (no incoming edge) is rank 0.
  Build a 4-rank chain-plus-shortcut fixture and confirm the ranks. Report any short-circuit.

- [ ] **Determinism.** Confirm two calls on the same subgraph return **deep-equal** layouts, and that the
  sort is **stable** (equal barycenters keep original order — no `Math.random`, no `Date`, no
  `Object`-key-iteration dependence). Report any nondeterminism.

- [ ] **Cycle-safety (Flag 5) — never hangs, never throws.** Run `layoutTopology` on a 2-cycle, a 3-cycle,
  and a self-loop (`A→A`); confirm each returns with **all nodes present** and **no throw** within a
  fraction of a second (no infinite loop). Confirm it does **not** emit a cycle verdict/finding (that is
  R6's job). Report a hang, a throw, or a dropped node.

- [ ] **Totality + passthrough.** Confirm every input node appears exactly once in the output, per-rank
  `order` values are `0..k-1` distinct, non-id node fields (`label`/`kind`/`diff`) survive, and a dangling
  edge (naming an absent node) is dropped, never fabricating a node. Report any node loss/duplication or
  fabricated node.

- [ ] **Purity + Law 1.** Confirm `lib/topology-view.mjs` (the layout half, above the marker) reads no
  disk, calls no `append()`, and imports **only** `{ liftEdges } from './graph.mjs'` — NOT
  `legibility.mjs`, NOT `policy.mjs`/`goals.mjs`, NOT `node:fs`, NOT `rewrite.mjs`. Confirm the append
  marker is present and is the file's last line (nothing appended yet). Confirm no `Math.random`/`Date`.

- [ ] **Bidirectional §5.3 mapping.** Walk both directions, report any unmapped item:
  - **Every assertion → a §5.3 layout clause** (longest-path ranks / barycenter ordering / coordinates /
    graceful degeneration). Flag any test pinning a coordinate golden the design leaves open (Flag 4) —
    the tests must pin *properties*, not gaps.
  - **Every §5.3 layout clause → an assertion** (rank-consistency, crossing reduction, determinism). Flag
    any §5.3 layout property with no test. (Known, correct scope boundary — not a gap: the SVG rendering,
    the three views, and self-containment are the *renderer's* (T04), not the layout's; do not flag their
    absence here.)

- [ ] **Regression + additivity.** Run the full suite:
  ```bash
  for t in test/*.test.mjs; do node "$t"; done
  ```
  Confirm no `FAIL` anywhere (`topology-layout` green + zero regressions across P1–P6d) and that **no
  existing shipped file changed** — P6e adds one new file with one import; it edits nothing landed.

**Report format:** a short list of findings, each `CONFIRMED` (reproduced) or `PLAUSIBLE`, with the
concrete input → wrong output. If the suite is clean and the mapping is total, say so plainly — an empty
findings list is the correct result for a solid triad. Any confirmed gap becomes a new `red` task
(`T03a-2`, …) the supervisor dispatches (a fresh follow-up commit) before T04b.
