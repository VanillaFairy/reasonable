# T02 — Docs: glossary + artifacts

**role:** — (docs)
**Depends on:** T01c (audit clean)
**Owns (stage only these):** `docs/glossary.md`, `docs/artifacts.md`

> Companion doc updates are a **ratification precondition** (DESIGN-3.0 §12) — they land with the code
> that introduces the term/shape, not batched at the end. P6a adds one concept (planned-fidelity
> `needs`) and **no new artifact**, so this is a small, precise update: record that planned `needs`
> is now built, and add the glossary term. Do **not** invent artifact grammar (P6a stores nothing new).

**Files:**
- Modify: `docs/artifacts.md` (the graph-engine section's planned-edge "deferred whole" note)
- Modify: `docs/glossary.md` (add the planned-fidelity term)

- [ ] **Step 1: Update the `docs/artifacts.md` planned-edge note**

In the "The graph engine …" section, find this sentence (currently under the four-edge-kinds bullet):

> Only **actual**-fidelity edges (post-spec, clause-level) are implemented; **planned**-fidelity edges
> (component-level, pre-delta) need the topologist's ratified ordering data (Part 6) and are deferred
> whole, not half-built.

Replace it with:

> **Actual**-fidelity edges (post-spec, clause-level) cover all four kinds. **Planned**-fidelity
> `needs` (component-level, pre-delta) is now built (`plannedNeedsEdges`, Part 6a): it derives
> genesis-time edges from charters alone — the cross-component quotient from each charter's `cite:`
> premises, and the intra-component ordering from each charter's `order` stratum (`docs/DESIGN-3.0.md`
> §2.2). It emits the same `{from,to,edge:'needs',op:'add'}` shape as `needsEdges` — planned vs actual
> is which function produced the array, never a per-edge tag. Planned `excludes`/`serves`/`informs`
> remain actual-only for now (a charter carries no resource claims or scenario citations yet — the
> same un-owned gaps noted below); the legibility law that consumes planned `needs` at genesis is
> Part 6b.

- [ ] **Step 2: Add the glossary term**

In `docs/glossary.md`, near the existing edge terms (**Needs**, **Excludes**, **Serves**,
**Informs**), add one bullet (match the one-line `- **Term** — definition.` style, cross-linking bold
terms):

```markdown
- **Planned fidelity / planned edge** — a dependency edge computed from **charters** before any
  **delta** exists (genesis time), as opposed to **actual** fidelity (computed from spec-time
  clause citations). Only **Needs** has a planned form today (`plannedNeedsEdges`, Part 6a): the
  cross-component quotient from a charter's `cite:` premises plus the intra-component `order`
  ordering (DESIGN-3.0 §2.2). Planned edges order the frontier and feed the legibility law (Part 6b);
  once a delta is authored, edges refine to **actual**, which alone govern packing, dispatch, and
  merges.
```

If a bullet already notes "planned edges need the topologist's ratified ordering data (Part 6)"
(a forward-reference written before P6a), update it to point at this term / `plannedNeedsEdges` rather
than describing planned edges as unbuilt.

- [ ] **Step 3: Commit**

```bash
git add docs/artifacts.md docs/glossary.md
git commit -m "docs(artifacts,glossary): record planned-fidelity needs (P6a)"
```
