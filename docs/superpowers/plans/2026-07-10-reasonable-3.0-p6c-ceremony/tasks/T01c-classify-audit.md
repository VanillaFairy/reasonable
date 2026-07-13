# T01c — Complexity-classifier audit

**role:** audit
**Depends on:** T01b
**Owns:** nothing (read-only — report findings; do not edit code, tests, or docs)

> **Read first:** `../shared/interfaces.md` (§A), `../shared/conventions.md`, DESIGN-3.0 §5.4 (the
> classifier: t0 inputs, monotone, the minimal-driver clause), and the plan's **Flagged calls** section.
> You are the `audit` role: adversarially verify the T01a tests AND the T01b implementation. You have
> Bash for read-only verification. You **fix nothing** — you report gap findings, each of which becomes
> a new `red` task the supervisor schedules (the P6a/P6b/P6d pattern: an audit finding is a fresh
> follow-up commit, never a blocking redo).

**The audit checklist — run each, report the result:**

- [ ] **Discriminator (teeth).** A test is meaningless if it passes against a stub. Confirm the
  monotonicity, relief, autonomous-pressure, and round-trip checks genuinely fail against a broken
  `classify`. Concretely, in a scratch copy try each of: (a) return `bandScale[0]` always — the
  pressure/relief/monotone-rise checks MUST fail; (b) make the combiner a **sum** instead of `max` — the
  "axes combine by MAX, not sum" check MUST fail; (c) drop the `clamp` — the "saturates the top band …
  never past it" / "floored at 0" checks MUST fail; (d) invert the relief (add instead of subtract) —
  the relief + anti-gaming checks MUST fail. Restore. Report which checks fell for each mutation.

- [ ] **Monotonicity — the headline property, attacked directly.** Fuzz it: over a grid of inputs
  (several `blastRadius`/`horizon`/`criticality` values × both `supervision` values × both
  `trustedSuiteCovers` values), confirm that raising **any single axis** in the risk-up direction
  (blastRadius↑, horizon↑, criticality↑, supervision present-human→autonomous, trustedSuiteCovers
  true→false) never **lowers** the band index. Report any single-axis step that lowers it — that is a
  monotonicity break and a real bug.

- [ ] **The minimal-driver clause (§5.4).** Confirm `classify`'s signature takes `horizon` as a **bare
  ordinal** — there is no `{footprint}`/`{steps}` pair it divides, so there is no lever by which a larger
  declared footprint yields a *lower* band. Confirm a larger `horizon` only ever raises-or-holds the
  band. Report if any input shape lets an inflated footprint buy a lower band.

- [ ] **The band-vocabulary round-trip (Flag 1) — the one load-bearing composition.** Confirm a
  classified **non-top** band, fed as `state.bands[cone]` with `state.bandScale = dials.bandScale`,
  ratchets up **exactly one step** through the shipped `ceremonyEscalation` (with a triggering verdict),
  and that `validateEffects` accepts the resulting effect; and that a classified **top** band is **capped**
  (`ceremonyEscalation` returns `null`). This proves `classify` emits into the *exact* ordered array
  `ceremonyEscalation` does `indexOf` into — read `lib/rewrite.mjs`'s `ceremonyEscalation` to confirm it
  reads `state.bands[coneId]` as a band name and `scale.indexOf` over `state.bandScale`. Report any skew
  between `classify`'s output vocabulary and that scale.

- [ ] **Reads only bandScale + classifier (never phaseCutoffs / cadenceIndex).** Confirm `classify`
  reads `dials.bandScale` and `dials.classifier` **only** — it must NOT consume `dials.phaseCutoffs` or
  `dials.cadenceIndex` (those are the consumers' maps, P7's). Concretely: a `dials` with `phaseCutoffs`
  and `cadenceIndex` **deleted** but `bandScale`+`classifier` present must still classify identically.
  Report if either map influences the band.

- [ ] **Shape-not-value + never-fabricate.** Confirm: an absent `dials.classifier` → every axis pressure
  `0` → the lowest band (no throw, no fabricated threshold); an absent/empty `dials.bandScale` → `null`
  (never a guessed band); an **absurd-but-well-formed** cutoff (`[0]`, negatives) loads and fires per the
  numbers given. Confirm `classify(undefined, undefined)` and `classify({}, {})` never throw.

- [ ] **Bidirectional §5.4 (classifier) mapping.** Walk both directions, report any unmapped item:
  - **Every assertion → a §5.4 classifier clause.** Each `check()` pins the five t0 inputs, the monotone
    property, the minimal-driver clause, the band-vocabulary membership, or the round-trip. Flag any test
    pinning a value §5.4 does **not** fix (an over-fitted golden — especially a specific band the
    interfaces flag the combiner as contestable for).
  - **Every §5.4 classifier clause → an assertion.** All five inputs are exercised; monotone is pinned on
    each axis; the minimal-driver clause is pinned; the round-trip is pinned. Flag any §5.4 classifier
    requirement with **no** test. (Known, correct scope boundary — not a gap: which band → which
    phase-materialization/cadence is P7's *consumption* of `phaseCutoffs`/`cadenceIndex`, not the
    classifier's; do not flag its absence here.)

- [ ] **Purity + Law 1.** Confirm `lib/ceremony.mjs`'s classifier half reads no disk, calls no
  `append()`, and imports **nothing** — NOT `policy.mjs`, NOT `graph.mjs`, NOT `baseline.mjs`, NOT
  `rewrite.mjs`, NOT `node:fs`. Confirm `lib/` stays dependency-free (no third-party import).

- [ ] **Regression + additivity.** Run the full suite:
  ```bash
  for t in test/*.test.mjs; do node "$t"; done
  ```
  Confirm no `FAIL` in any **previously-green** file, and that **no existing shipped file changed** — P6c
  adds one new file with zero imports; it edits nothing landed. (`test/ceremony-phase.test.mjs`, if
  T02a already landed it, is expected to fail its import until T02b — do not flag that as a regression.)

**Report format:** a short list of findings, each `CONFIRMED` (reproduced) or `PLAUSIBLE`, with the
concrete input → wrong output. If the suite is clean and the mapping is total, say so plainly — an empty
findings list is the correct result for a solid triad. Any confirmed gap becomes a new `red` task
(`T01a-2`, …) the supervisor dispatches (a fresh follow-up commit).
