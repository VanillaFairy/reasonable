# T02 — Docs: glossary + artifacts

**role:** — (docs)
**Depends on:** T01c (audit clean)
**Owns (stage only these):** `docs/glossary.md`, `docs/artifacts.md`

> Companion doc updates are a **ratification precondition** (DESIGN-3.0 §12) — they land with the code
> that introduces the term/shape, not batched at the end. P6b adds a pure calculus and **no new
> artifact**, so this is a small, precise update: record that the legibility law is built, note the two
> P6b-coined `policy.json` keys, and add the glossary terms. Scope the glossary tightly (P6a/P6d
> precedent): add **Legibility law**, **Cone**, **Stratum**, **Legibility finding** only — **complexity
> band**, **complexity classifier**, **phase degeneration**, **topologist** land with P6c/P6e. Do NOT
> bold-cross-reference those not-yet-defined terms.

**Files:**
- Modify: `docs/artifacts.md` (two graph-engine/R8 forward-ref notes; the `policy.json` legibility bullet)
- Modify: `docs/glossary.md` (four new bullets)

- [ ] **Step 1: Update the graph-engine section's legibility forward-reference**

In `docs/artifacts.md`, in "The graph engine …" section, find this sentence (it currently ends the
planned-`needs` bullet — the forward-ref P6a left):

```
the legibility law that consumes planned `needs` at genesis is
  Part 6b.
```

Replace it with:

```
the legibility law that consumes planned `needs` at
  genesis is now built (`lib/legibility.mjs`, Part 6b): a pure calculus over this file's output that
  measures bounded width, bounded tangle, coupling smells (cross-cone density + god-component fan-in),
  and the longest `needs`-chain against `policy.json`'s `legibility` thresholds, emitting findings
  drop-in usable as an R8 `illegible` verdict's `proposal`; it also hosts `regroupingReducesTangle`,
  R8's density-reduction guard.
```

- [ ] **Step 2: Update the R8 / density-metric "un-owned gap" note**

In `docs/artifacts.md`, in the rewrite-engine (Part 5) section, find this passage:

```
**Scope note — the flagged, un-owned gaps:** the complexity-band **vocabulary, thresholds, and
storage** (`policy.json`'s ceremony-sizing dials) and the **legibility density metric** that triggers
and validates R8's regrouping are `lib/legibility.mjs` / `policy.json`, **Part 6** — Part 5 implements
only the *mechanism* against a caller-supplied ordered band scale and per-cone bound, inventing no
band names and no thresholds; R8's own "regroup only if density measurably drops" guard belongs to
Part 6 to enforce, and Part 5 does not fake it.
```

Replace it with (only the two `legibility` clauses change — the band clauses stay Part 6c's):

```
**Scope note — the flagged gaps, now partly closed:** the complexity-band **vocabulary, thresholds,
and storage** (`policy.json`'s ceremony-sizing dials) remain **Part 6c/6d**; the **legibility density
metric** that triggers and validates R8's regrouping is now built — `lib/legibility.mjs` (Part 6b):
`legibilityFindings` computes the triggers and `regroupingReducesTangle` is R8's "regroup only if
density measurably drops" guard (raw cross-group edge count must strictly fall, so empty grouping
strata are rejected). Part 5 implemented only the *mechanism* against a caller-supplied ordered band
scale and per-cone bound, inventing no band names and no thresholds, and did not fake R8's guard —
Part 6b now enforces it.
```

- [ ] **Step 3: Add the two P6b-coined keys to the `policy.json` legibility bullet**

In `docs/artifacts.md`, in the `## policy.json *` section, find this bullet:

```
- `legibility` — the pinned thresholds the legibility law (Part 6b) reads by name: `maxWidth`,
  `maxTangle`, `maxChain` (finite numbers), and `r8Retries` (the R8 retry bound N).
```

Replace it with:

```
- `legibility` — the pinned thresholds the legibility law (Part 6b) reads by name: `maxWidth`,
  `maxTangle`, `maxChain` (finite numbers), and `r8Retries` (the R8 retry bound N). Part 6b's coupling
  smells also read `maxCoupling` (cross-cone density) and `maxFanIn` (god-component fan-in) — two
  **P6b-coined** keys the design named by role, not by key. They ride `policy.json`'s **open** grammar:
  `readPolicy` returns the object verbatim and gates only the four required names, so these extras
  survive un-validated (`lib/legibility.mjs` reads them from a caller-supplied object and treats an
  absent/non-finite threshold as "disable that check," never a fabricated default). A reviewer may
  rename either or fold coupling into `maxTangle`; a one-line change, since the law gates shape not value.
```

- [ ] **Step 4: Add the four glossary terms**

In `docs/glossary.md`, add these four bullets near the existing graph/edge terms (match the one-line
`- **Term** — definition.` style; cross-link only terms that already exist — do NOT bold **complexity
band** / **topologist**, which P6c/P6e introduce). Place **Cone** near **Serves** (which already refers
to "a goal's cone"), **Stratum** near **Planned fidelity** (which refers to the "order stratum"), and
**Legibility law** / **Legibility finding** near **Edge lifting**:

```markdown
- **Legibility law** — the pure calculus (`lib/legibility.mjs`, Part 6b, DESIGN-3.0 §5.2) that measures
  the *shape* of the dependency graph against the thresholds in **policy.json**'s `legibility` block and
  emits **Legibility finding**s: bounded width (a containment node's child count), bounded tangle
  (cross-sibling **Edge lifting** density), coupling smells (cross-**Cone** density + god-component
  fan-in), and the longest **Needs**-chain. It runs over **Planned fidelity** edges at genesis and
  **actual** edges as deltas refine — edge-source-agnostic. It also hosts `regroupingReducesTangle`, the
  density-reduction guard that accepts a regrouping only if it strictly reduces cross-group edge count
  (so inserting empty grouping **Stratum**s to fake-restore width is rejected) — the guard R8 leaves open.
- **Legibility finding** — one violation the **Legibility law** emits: `{ kind, metric, threshold, ‹locator› }`,
  where `kind` is `over-wide` / `over-tangled` / `cross-cone-coupling` / `god-component` / `over-serialized`.
  A finding is drop-in usable as the `proposal` of an R8 `illegible` verdict (which threads it through
  opaquely), so the law and the rewrite calculus compose without either inventing a shape.
- **Cone** — the set of atoms that advance one goal: the **Serves** reverse-reachability from that goal's
  scenario-cited clauses over the **Needs** graph. Cones can overlap (a shared provider serves several
  goals). The **Legibility law**'s coupling smell flags two goals whose *exclusive* cones are densely
  interlinked (goals that should be independent but are not).
- **Stratum** — one rank of a total order: within a component, the atoms sharing an `order` value (a
  **Planned fidelity** intra-component **Needs** edge runs from each stratum to the immediately-preceding
  one); in a containment view, one grouping level. Inserting an *empty* stratum to cosmetically reduce a
  node's width is what the **Legibility law**'s density-reduction guard exists to reject.
```

- [ ] **Step 5: Commit**

```bash
git add docs/artifacts.md docs/glossary.md
git commit -m "docs(artifacts,glossary): record the legibility law + its density guard (P6b)"
```
