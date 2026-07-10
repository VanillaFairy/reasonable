# T03 — Docs: artifacts + glossary

**role:** — (docs)
**Depends on:** T01c, T02c (both audits clean)
**Owns (stage only these):** `docs/artifacts.md`, `docs/glossary.md`

> Companion doc updates are a **ratification precondition** (DESIGN-3.0 §12) — they land with the code
> that introduces the term/shape, not batched at the end. P6c adds a pure calculus and **no new
> artifact**, so this is a precise update: record that the complexity classifier + phase-degeneration
> predicate are built, note the P6c-coined `dials.classifier` key on the `policy.json` dials bullet, and
> close the two Part-5/6c forward-references. Scope the glossary tightly (P6a/P6b/P6d precedent): add
> **Complexity band**, **Complexity classifier**, **Phase degeneration** only — **topologist** /
> **topology.html** land with P6e. Do NOT bold-cross-reference those not-yet-defined terms.

**Files:**
- Modify: `docs/artifacts.md` (the `policy.json` dials bullet; the Part-5 scope note)
- Modify: `docs/glossary.md` (three new bullets; one forward-ref closure)

- [ ] **Step 1: Note the P6c-coined `dials.classifier` key on the `policy.json` dials bullet**

In `docs/artifacts.md`, in the `## policy.json *` section, find this bullet (it currently ends the
`dials` description):

```
- `dials` — the ceremony-sizing dials: `bandScale` (the ordered band vocabulary `lib/rewrite.mjs`'s
  `ceremonyEscalation` indexes into and P6c's classifier emits from), plus the band-keyed `phaseCutoffs`
  and `cadenceIndex` maps.
```

Replace it with:

```
- `dials` — the ceremony-sizing dials: `bandScale` (the ordered band vocabulary `lib/rewrite.mjs`'s
  `ceremonyEscalation` indexes into and the complexity classifier `lib/ceremony.mjs` (Part 6c) emits
  from), plus the band-keyed `phaseCutoffs` and `cadenceIndex` maps (read by the classifier's *consumers*
  — P7 — never by `classify` itself). The classifier also reads `dials.classifier` — its per-axis risk
  cutoffs (`blastRadiusCutoffs` / `horizonCutoffs` / `criticalityCutoffs` finite-number arrays, plus
  `autonomousPressure` / `trustedRelief` finite numbers) — a **P6c-coined** key that rides `policy.json`'s
  **open** dials grammar: `readPolicy` validates only `bandScale`/`phaseCutoffs`/`cadenceIndex` and
  returns the object verbatim, so `dials.classifier` survives un-validated (`lib/ceremony.mjs` reads it
  from a caller-supplied object and treats an absent cutoff as "disable that lift," never a fabricated
  default). Ships flagged-uncalibrated (§16); a reviewer may rename it or choose a different monotone
  combiner — a local change, since `classify` gates shape not value.
```

- [ ] **Step 2: Close the Part-5 scope note's complexity-band forward-reference**

In `docs/artifacts.md`, in the rewrite-engine (Part 5) section, find this passage (its opening clause):

```
**Scope note — the flagged gaps, now partly closed:** the complexity-band **vocabulary, thresholds,
and storage** (`policy.json`'s ceremony-sizing dials) remain **Part 6c/6d**; the **legibility density
```

Replace **only that opening clause** (through `remain **Part 6c/6d**;`) with (leave the rest of the
passage — the `legibility density metric …` sentence onward — exactly as it is):

```
**Scope note — the flagged gaps, now closed:** the complexity-band **vocabulary and storage**
(`policy.json`'s `dials.bandScale`, Part 6d) and the **classifier + thresholds** that emit and size it
(`lib/ceremony.mjs`'s `classify`, its P6c-coined `dials.classifier` cutoffs, and the phase-degeneration
predicate — Part 6c) are now built; the **legibility density
```

- [ ] **Step 3: Add the three glossary terms**

In `docs/glossary.md`, near the **Ceremony-escalation effect** and **Ceremony-sizing dial** entries, add
these three bullets (match the one-line `- **Term** — definition.` style; cross-link only terms that
already exist — do NOT bold **topologist**, which P6e introduces):

```markdown
- **Complexity band** — a node's risk tier, drawn from `policy.json`'s ordered `dials.bandScale`. The
  **Complexity classifier** emits it; the **Ceremony-escalation effect** ratchets it up on evidence; the
  **Ceremony-sizing dial**'s band→cutoff and band→cadence maps translate it into how much ceremony the
  node earns. Classifier and escalation share one ordered scale, so a classified band is a valid input to
  escalation (Part 6c, DESIGN-3.0 §5.4).
- **Complexity classifier** — the pure `classify(inputs, dials)` (`lib/ceremony.mjs`, Part 6c,
  DESIGN-3.0 §5.4): a **monotone** map from five t0-observable risk inputs — **Blast radius** width,
  whether a trusted suite already covers the locus, domain criticality, the run's supervision, and the
  horizon *under a minimal driver* — to a **Complexity band**. Monotone means higher risk on any axis
  never lowers the band, which is also the anti-gaming guarantee: an inflated footprint can only *raise*
  ceremony, never buy it down. It *reads* the **Ceremony-sizing dial**; it never writes it.
- **Phase degeneration** — a phase proven, mechanically, to have nothing to do — recorded as a
  `phase-degenerated` result (never a silent skip), so a reviewer sees *ran-and-found-nothing*. Pinned as
  three pure predicates (`lib/ceremony.mjs`, Part 6c, DESIGN-3.0 §5.4): the **Walking skeleton** scaffold
  degenerates only when no new goal **Cone** appears and no newly-chartered atom touches the outer shell
  (a depth-0 **Serves** provider, or a not-yet-skeletonized component); re-chartering degenerates on an
  empty amendment batch; retro cross-cone classification degenerates when the fired goal gate spans ≤ 1
  landed cone. Conservative — when in doubt it materializes. Who dispatches or skips a role on the result
  is Part 7's.
```

- [ ] **Step 4: Close the Ceremony-escalation effect's band-vocabulary forward-reference**

In `docs/glossary.md`, in the **Ceremony-escalation effect** bullet, find this sentence:

```
The band
  vocabulary and thresholds are Part 6.
```

Replace it with:

```
The band
  vocabulary (`policy.json`'s `dials.bandScale`) is Part 6d; the **Complexity classifier** that emits it
  and its thresholds are Part 6c.
```

- [ ] **Step 5: Commit**

```bash
git add docs/artifacts.md docs/glossary.md
git commit -m "docs(artifacts,glossary): record the complexity classifier + phase-degeneration pin (P6c)"
```
