# T01b — Complexity-classifier impl (green)

**role:** green
**Depends on:** T01a
**Owns (stage only these):** `lib/ceremony.mjs`

> **Read first:** `../shared/interfaces.md` (§A), `../shared/conventions.md`. You are the `green` role:
> **make the locked tests pass; write no tests.** `test/ceremony-classify.test.mjs` is **READ-ONLY — do
> not modify it.** If a test looks wrong, STOP and escalate to the supervisor; do not edit it to fit
> your implementation.
>
> **You create `lib/ceremony.mjs` and leave the phase-predicate append-marker as its last line.** The
> next triad (T02b) appends the phase-degeneration predicates below that marker — do NOT implement them
> here, and do NOT delete the marker.

**Files:**
- Create: `lib/ceremony.mjs`

- [ ] **Step 1: Read the locked tests**

Read `test/ceremony-classify.test.mjs` end to end. Note: `dials` fixtures carry `bandScale` +
`classifier`; `classify` combines the four risk-up axes by `max` of per-axis cutoff pressure, subtracts
a trusted-suite relief, and clamps into the scale; an absent `bandScale` → `null`; an absent `classifier`
→ every pressure `0` → the lowest band; the round-trip feeds a classified band into the shipped
`ceremonyEscalation`.

- [ ] **Step 2: Create `lib/ceremony.mjs` with exactly this content**

```js
// lib/ceremony.mjs — the ceremony dial (DESIGN-3.0 §3, §5.4, §9, §17, reasonable 3.0 Part 6c). A PURE
// calculus in two independent halves, sharing no helper:
//   A. the complexity classifier — classify(inputs, dials) -> band: a MONOTONE map from five
//      t0-observable risk inputs to a band drawn from the SAME ordered dials.bandScale array
//      lib/rewrite.mjs's ceremonyEscalation ratchets through (classifier and calculus share one
//      vocabulary). classify emits the band; its CONSUMERS read dials.phaseCutoffs / dials.cadenceIndex
//      (classify itself reads NEITHER).
//   B. the phase-degeneration predicates (§5.4 — the MANDATED PIN) — appended below the marker by a
//      separate triad (T02b).
//
// Law 1 (dependency-free): node builtins only, and in fact ZERO imports — it emits its own plain
// objects, exactly as lib/effects.mjs / lib/rewrite.mjs emit theirs. Nothing here reads disk, appends a
// ledger event, or dispatches a role (Call #1: P6c COMPUTES; P7's frontier loop WIRES). The classifier
// thresholds (dials.classifier.*) are P6c-coined and ship flagged-uncalibrated (§16) — a rename is a
// one-line change since classify gates shape, not value.

// ── A. the complexity classifier (Decision 4, §5.4) ─────────────────────────────────────────────

const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

// How many ascending cutoffs a value meets-or-exceeds. Monotone up in `value`; an absent/empty cutoff
// array (or a non-finite value) yields 0 — a missing threshold disables its lift, never fabricates one
// (the shape-not-value discipline lib/policy.mjs / lib/legibility.mjs hold). Because the axes combine by
// MAX, a 0 from one axis can never lower another's contribution.
function cutoffPressure(value, cutoffs) {
  if (!finite(value) || !Array.isArray(cutoffs)) return 0;
  let p = 0;
  for (const c of cutoffs) if (finite(c) && value >= c) p += 1;
  return p;
}

// classify(inputs, dials) -> a band name from dials.bandScale, or null when no band scale is available
// (never guesses — mirrors ceremonyEscalation's "unknown band -> null"). MONOTONE (§5.4): raising the
// risk on any axis never LOWERS the band. The four risk-UP axes (blastRadius, horizon, criticality,
// autonomous supervision) combine by MAX of per-axis band pressure; the one risk-DOWN axis (a trusted
// suite already covering the locus) subtracts a RELIEF; the result is clamped into the scale.
//
// The minimal-driver clause (§5.4), made mechanical: `horizon` enters as a BARE ordinal — there is no
// {footprint, steps} pair to divide — and the max combiner is monotone-up in it, so a caller can never
// buy a lower band by inflating its own footprint (which would only RAISE horizon, and thus ceremony).
// Monotonicity IS the anti-gaming guarantee, pinned by the red suite's monotonicity checks.
//
// inputs = { blastRadius:number, trustedSuiteCovers:boolean, criticality:number(ordinal),
//            supervision:'present-human'|'autonomous', horizon:number(ordinal) }
export function classify(inputs, dials) {
  const scale = dials && Array.isArray(dials.bandScale) ? dials.bandScale : null;
  if (!scale || scale.length === 0) return null;
  const i = inputs || {};
  const T = (dials && dials.classifier) || {};

  const riskUp = Math.max(
    cutoffPressure(i.blastRadius, T.blastRadiusCutoffs),
    cutoffPressure(i.horizon, T.horizonCutoffs),
    cutoffPressure(i.criticality, T.criticalityCutoffs),
    i.supervision === 'autonomous' && finite(T.autonomousPressure) ? T.autonomousPressure : 0,
  );
  const relief = i.trustedSuiteCovers === true && finite(T.trustedRelief) ? T.trustedRelief : 0;
  return scale[clamp(riskUp - relief, 0, scale.length - 1)];
}

// ── B. phase-degeneration predicates appended by T02b — do not edit above this line ──
```

**The append-marker (the last line above) MUST be the last line of the file you commit.** T02b appends
the phase-degeneration predicates below it (the exact append-don't-edit discipline `rewrite.mjs` used
across its triads).

- [ ] **Step 3: Run the tests to verify they pass**

Run: `node test/ceremony-classify.test.mjs`
Expected: `ceremony-classify: all N checks pass. ✓` (no `FAIL` line, exit 0).

- [ ] **Step 4: Run the full suite to confirm zero regressions**

Run: `for t in test/*.test.mjs; do node "$t"; done`
Expected: no `FAIL` line anywhere — this part is purely additive (one new file, zero imports into it),
so every pre-existing test still passes unchanged. Note `test/ceremony-phase.test.mjs` (authored by T02a
in the same wave) will **fail its import** until T02b lands — that is expected and not your concern;
confirm only that no *previously-green* file regressed and that `ceremony-classify` is green.

- [ ] **Step 5: Commit**

```bash
git add lib/ceremony.mjs
git commit -m "feat(ceremony): classify — the t0-risk complexity classifier (green, P6c)"
```

**Do not modify the test file, the append-marker, `docs/`, the roadmap, `plugin.json`, or the README.**
The phase predicates are T02b; docs are T03; the roadmap status cell is T04.
