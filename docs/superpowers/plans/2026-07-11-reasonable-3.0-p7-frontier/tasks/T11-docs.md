# Task T11 — Docs: glossary + artifacts + skill repoint

**Role:** — (docs, no triad). A §12 ratification precondition — new normative terms and machine-parsed
shapes enter the vocabulary before the generation is considered complete.

> **Read first:** `../shared/conventions.md` → "Docs", `../shared/interfaces.md` (the exact new event
> types/fields you register). Land this **after every audit (T05c, T07c, T08c, T09c, T10c) is clean.**

**Files:**
- Modify: `docs/glossary.md`
- Modify: `docs/artifacts.md`
- Modify: `skills/vertical-slice-execution/SKILL.md`

## Dependencies
- Depends on: T05c, T07c, T08c, T09c, T10c (every audit clean)
- Depended on by: T12 (final check)

- [ ] **Step 1: Add the new glossary terms**

In `docs/glossary.md`, find the **Topologist** entry (it ends with *"The stage that dispatches it into
the phase flow is Part 7's."*). Insert these new bullets **immediately after** it:

```markdown
- **Frontier** — the ready-set of atoms whose planned/actual `needs` are all satisfied, minus **frozen**
  / **guard-halted** / **dispatch-barred** atoms (`lib/frontier.mjs`'s `ready`, Part 7, DESIGN-3.0 §6).
  Reuses **Graph** edges; adds no new algorithm.
- **Wave** — the maximal subset of spec'd atoms **pairwise disjoint by actual footprint**
  (`lib/frontier.mjs`'s `pack`, Part 7, DESIGN-3.0 §6) — packing happens only on actual footprints, never
  charter-coarse loci. A collision between two packed atoms is an **R9** verdict, never a silent merge
  conflict.
- **GATE_RESULT** — the exhaustive seven-variant typed union a frontier-wave run returns
  (`goal-green | heartbeat | batch-full | starved | blocked-human | halt | budget-exhausted`,
  `lib/frontier.mjs`'s `gateDue`, Part 7, DESIGN-3.0 §6/§9). Total: an unrecognized control state HALTs,
  never a silent fall-through. `blocked-human` fires in **both** run modes for a policy/goal change or an
  intent fork.
- **Band-indexed gate cadence** — the heartbeat floor's N (merged atoms) / M (ledger events) thresholds
  are indexed by a cone's **Complexity band** (`policy.json`'s `cadence` map, read by `gateDue`, Part 7,
  DESIGN-3.0 §9) — a high-band cone gates more often, a low-band micro-effort rarely. The **Starvation
  valve** and the always-human classes fire regardless of band; only the floor itself scales.
- **Starvation valve** — the liveness backstop: the frontier is empty or below quorum while gate-held
  material (frozen atoms, pending permanence, barred births) exists — fires a `starved` gate rather than
  letting a wide provisional freeze silently stall progress (DESIGN-3.0 §9).
- **`atom-verdict`** — the collision-free 3.0 ledger event type (`lib/ledger.mjs`, Part 7, DESIGN-3.0
  §2.4/§7.2), keyed on `atomId`+`kind`, distinct from the live 2.x work-order-keyed `verdict`. `append()`
  — never an agent, never the frontier workflow — code-computes its provisional **Effects** and records
  its permanent set as `pendingPermanent`, folded in only at a **`ratification`** gate (`ratifiesSeqs`/
  `rejectsSeqs`), exactly as `seq` is code-computed (D19).
- **Lazy, role-minimal provisioning** — a wave stands up only the roles its atoms actually need
  (`lib/frontier.mjs`'s `requiredRoles`, Part 7, DESIGN-3.0 §6 draft-five): the categorical core
  (implementer, blind-test-writer, auditor, the fences) always; census/characterizer/topologist/
  retro-synthesizer only on non-empty brownfield input / amendment batch / multi-cone gate — the same
  **Phase degeneration** discipline applied to role dispatch, not just phase materialization. The
  lane=atom accounting is unchanged; only its infrastructure timing defers to first need.
```

- [ ] **Step 2: Mark `route.json` retired in `docs/artifacts.md`**

Find the `## route.json *` section's superseded-but-not-retired note:

```markdown
> **Superseded (3.0) but not yet retired.** `route.json` is superseded by `goals.json` + `policy.json`
> (their grammar + conservative loaders landed in **P6d**), but stays **live** until **P7's migration**
> rebuilds the `nextAction` projection over goals + cones and retires the route path. P6 is purely
> additive — `route.json`, `lib/route.mjs`, and `lib/reconcile.mjs` are untouched (design doc Call #1).
```

Replace it with:

```markdown
> **Retired (Part 7).** `route.json` is superseded by `goals.json` + `policy.json`; `lib/route.mjs` is
> **deleted** and `lib/reconcile.mjs` no longer reads this file at all — the `nextAction` projection is
> rebuilt over goals + cones (`lib/next-action.mjs`'s `deriveConeOrder`, Part 7). This section is kept
> for historical/migration context only; an effort's `route.json`, if one still exists on disk from a
> pre-3.0 state, is simply never read.
```

- [ ] **Step 3: Register the new event types + ratification payload fields in `docs/artifacts.md`**

Find the Family-3 domain-events paragraph:

```markdown
The rest of the vocabulary is unchanged by this refactor — same types, same fields, same
meaning: `enrichment`, `amendment`, `characterization`, `characterization-promotion`,
`change-characterized`, `change-characterized-planned`, `verdict`, `verifier-verdict`,
`scope-expansion`, `budget-extension`, `dead-end`, `ratification`, `intent-check-failure`,
`commit` (plus the pre-existing `correction`, D21, orthogonal to this vocabulary), and — new
in Layer 2 — `next-action` (below). They are
```

Replace it with (adding the two new 3.0 types and the `ratification` payload note, keeping every
existing word intact):

```markdown
The rest of the vocabulary is unchanged by this refactor — same types, same fields, same
meaning: `enrichment`, `amendment`, `characterization`, `characterization-promotion`,
`change-characterized`, `change-characterized-planned`, `verdict`, `verifier-verdict`,
`scope-expansion`, `budget-extension`, `dead-end`, `ratification`, `intent-check-failure`,
`commit` (plus the pre-existing `correction`, D21, orthogonal to this vocabulary), and — new
in Layer 2 — `next-action` (below). **Two new 3.0 types (Part 7, DESIGN-3.0 §2.4/§7.2):**
`atom-verdict` (`{atomId, kind, ...}` — a collision-free type keyed distinctly from the live
2.x `verdict`; `append()` code-computes its `effects` and records its permanent set as
`pendingPermanent`, never applied until a ratification consumes it) and `phase-degenerated`
(`{phase, reason, inputs}` — the exact shape `lib/ceremony.mjs`'s degeneration predicates emit,
appended verbatim). **`ratification`'s payload gains two optional fields**: `ratifiesSeqs` /
`rejectsSeqs` (arrays of positive integers — ledger seqs of `atom-verdict` events this
ratification accepts/rejects) — when present, `append()` folds the referenced verdict's
`pendingPermanent` (accept) or `unwindCeremonyEscalation`'s inverse (reject, for a ceremony
band raise) into this event's own `effects`. Absent, `ratification` behaves exactly as before
(backward compatible). They are
```

- [ ] **Step 4: Repoint `skills/vertical-slice-execution/SKILL.md`**

Read the file's current references to `vertical-slice-runner` and the four-variant
`green | budget-exhausted | blocked | halt` union. Replace every reference to the
`vertical-slice-runner` workflow with `frontier-wave`, and the four-variant union with the exhaustive
seven-variant one, preserving the routing table's existing shape:

| variant | routing |
|---|---|
| `goal-green` | close the goal; run the goal-gate retro roster |
| `heartbeat` | run the heartbeat retro roster |
| `batch-full` | drain the batch at a retro gate |
| `starved` | ratify pending permanence, clear the freezes |
| `blocked-human` | block for the human, in BOTH modes |
| `halt` | human durability halt |
| `budget-exhausted` | extend budget / re-plan |

Keep every other instruction in the skill file (the phase orchestration checklist shape) unchanged —
this is a repoint, not a rewrite.

- [ ] **Step 5: Sanity-check + commit**

Confirm the docs still read cleanly (no broken cross-reference, every new glossary bullet cross-links
only terms that already exist as bold entries — `Graph`, `Effects`, `Complexity band`, `Phase
degeneration` all already exist from earlier parts). No code, no test, no version bump.

```bash
git add docs/glossary.md docs/artifacts.md skills/vertical-slice-execution/SKILL.md
git commit -m "docs(glossary,artifacts): frontier/wave/GATE_RESULT/atom-verdict vocabulary; route.json retired; repoint vertical-slice-execution at frontier-wave (P7)" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

## Acceptance Criteria
- [ ] `docs/glossary.md` gains exactly the six new terms, cross-linking only pre-existing bold terms
- [ ] `docs/artifacts.md`'s `route.json` section reads "Retired," not "superseded but not yet retired"
- [ ] `docs/artifacts.md`'s Family-3 paragraph names `atom-verdict`/`phase-degenerated` and the
      `ratification` payload fields, without altering any pre-existing word in that paragraph
- [ ] `skills/vertical-slice-execution/SKILL.md` references `frontier-wave` and the seven-variant union,
      not the retired workflow/union
- [ ] No code, test, or version file touched
