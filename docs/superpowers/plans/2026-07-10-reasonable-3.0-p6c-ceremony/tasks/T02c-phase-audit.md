# T02c — Phase-degeneration predicate audit — THE LOAD-BEARING AUDIT

**role:** audit
**Depends on:** T02b
**Owns:** nothing (read-only — report findings; do not edit code, tests, or docs)

> **Read first:** `../shared/interfaces.md` (§B), `../shared/conventions.md`, DESIGN-3.0 §5.4 (the
> phase-degeneration predicate + its two siblings), and the plan's **Flagged calls** +
> **The mandated-pin discipline** sections. You are the `audit` role: adversarially verify the T02a
> tests AND the T02b implementation. You have Bash for read-only verification. You **fix nothing** — you
> report gap findings, each of which becomes a new `red` task the supervisor schedules (the P6a/P6b/P6d
> pattern: an audit finding is a fresh follow-up commit, never a blocking redo).
>
> **This is THE load-bearing audit of the whole sub-part.** Decision 5 is the roadmap's explicitly
> mandated mechanical pin — the one place a struggling autonomous run could talk itself out of a
> scaffold. Attack the *conservative, never-under-fires* property with real teeth; a false degenerate
> here is a genuine methodology hole, not a coverage gap.

**The audit checklist — run each, report the result:**

- [ ] **Discriminator (teeth), per predicate.** In a scratch copy, neuter each predicate and confirm its
  positive checks fall:
  - make `scaffoldMaterializes` **always** return `{ result: 'degenerate', … }` — the new-goal-cone,
    first-genesis, and both outer-shell checks MUST fail (a suite where a "materialize" survives a
    forced-degenerate stub has no teeth — this is the exact hole the mandate exists to close);
  - make `scaffoldMaterializes` **always** return `{ result: 'materialize' }` — the amendment-only and
    interior-atom degenerate checks MUST fail;
  - make `rechartingDegenerates` / `retroClassificationDegenerates` ignore their input — their checks
    MUST fail. Restore. Report per-predicate which checks fell.

- [ ] **The conservative property — a new goal cone MUST NEVER under-fire (the highest-risk case).**
  Actively try to construct a genuinely-new-goal-cone genesis that the predicate wrongly **degenerates**:
  - a new goal id with **no** new atoms → MUST materialize;
  - a new goal id whose scenario cites an already-skeletonized component → MUST materialize;
  - a new goal id alongside only interior (skeletonized, non-cited) new atoms → MUST **still** materialize
    (the new goal alone forces it). Report any new-goal-cone input that degenerates — that is a real bug.

- [ ] **The outer-shell boundary (Decision 5's flagged residue) — both edges.** Confirm:
  - a newly-chartered atom in a **not-yet-skeletonized** component → materialize (never let a new
    top-level component through as "interior");
  - a newly-chartered atom in an **already-skeletonized** component that **is** named by a goal's
    `scenarioCitations` (depth-0 provider) → materialize;
  - a newly-chartered atom in an **already-skeletonized, non-cited** component, with no new goal → the
    **only** degenerate-with-a-new-atom case;
  - the depth-0 component is read from `citation.component` when present **and** from a bare
    `citation.clause` (`lexer#c1`) via the local `#` split (no `parseClauseId` import). Confirm the split
    matches `parseClauseId`'s component on a well-formed id. Report any shell input that degenerates.

- [ ] **The degeneracy record — never a silent skip; forward-appendable.** Confirm every degenerate
  branch returns `{ result: 'degenerate', degeneracy: { type: 'phase-degenerated', phase, reason,
  inputs } }`, that `inputs` carries the **evaluated** inputs (empty/zero in the degenerate case, so a
  reviewer sees ran-and-found-nothing), and that the whole result is **JSON-serializable**
  (`JSON.parse(JSON.stringify(r))` deep-equals `r`) — because P7 appends it. Confirm `phase` ∈
  `{ 'scaffold', 'recharter', 'retro-classification' }`. Report a bare/silent skip (a `degenerate` with
  no record, or `undefined`/`null` returned) — that violates the mandate.

- [ ] **No live ledger writer (Call #1 / additivity).** Confirm `lib/ceremony.mjs` does **NOT** call
  `append()`, does **NOT** import `lib/ledger.mjs`, and that `lib/ledger.mjs`'s `EVENT_SCHEMAS` is
  **unchanged** — `phase-degenerated` is **not** registered as an event type here (P6c computes the
  record; P7 registers + appends). Confirm no shipped file changed. Report any edit to `ledger.mjs` or a
  live `append()` — either would break the additive scoping.

- [ ] **Sibling predicates — exact thresholds.** Confirm `rechartingDegenerates` degenerates on `[]` and
  a non-array, materializes on any non-empty array; `retroClassificationDegenerates` materializes on
  `>= 2`, degenerates on `1`, `0`, and non-finite (treated as `0`). Confirm the boundary is exact (`2`
  materializes, `1` degenerates — an off-by-one here mis-fires the retro classification). Report any
  off-by-one.

- [ ] **Bidirectional §5.4 mapping.** Walk both directions, report any unmapped item:
  - **Every assertion → a §5.4 clause.** Each `check()` pins new-goal-cone, an outer-shell edge, the
    conservative degenerate case, a sibling predicate's threshold, or the record shape. Flag any test
    pinning something §5.4 does **not** say.
  - **Every §5.4 phase-degeneration clause → an assertion.** `introduces-a-new-goal-cone`,
    `touches-the-outer-shell` (both sub-conditions), the scaffold degenerate case, `rechartingDegenerates`,
    and `retroClassificationDegenerates` are each covered. Flag any §5.4 phase clause with **no** test.
    (Known, correct scope boundary — not a gap: *who dispatches or skips a role on the result* is P7's
    frontier loop, not P6c; do not flag its absence here.)

- [ ] **Purity + Law 1.** Confirm the phase half reads no disk, calls no `append()`, and imports
  **nothing** — NOT `graph.mjs`/`clause-id.mjs` (the component split is local), NOT `goals.mjs`, NOT
  `node:fs`. Confirm the append-marker is intact and the classifier half above it is **unchanged**
  (`git diff` the file across T01b→T02b touches only the appended section).

- [ ] **Regression + additivity.** Run the full suite:
  ```bash
  for t in test/*.test.mjs; do node "$t"; done
  ```
  Confirm no `FAIL` anywhere (both ceremony files green + zero regressions across P1–P6b/P6d) and that
  **no existing shipped file changed** — P6c adds one new file with zero imports; it edits nothing landed.

**Report format:** a short list of findings, each `CONFIRMED` (reproduced) or `PLAUSIBLE`, with the
concrete input → wrong output. If the suite is clean and the mapping is total, say so plainly — an empty
findings list is the correct result for a solid triad. Any confirmed gap becomes a new `red` task
(`T02a-2`, …) the supervisor dispatches (a fresh follow-up commit) before T03.
