# Task T04: Docs — artifacts.md rewrite-engine subsection + glossary terms

**Role:** direct (no triad). Land the companion docs. Per DESIGN-3.0 §12, doc updates for new
normative vocabulary are a ratification precondition — this lands right after all three audits are
clean, not later.

## References
- Read: `../shared/conventions.md` (the docs sub-section)
- Read: `docs/superpowers/specs/2026-07-09-reasonable-3.0-p5-rewrite-design.md` (the source of every
  claim — especially the central scoping decision: P5 **computes** effect sets; P7 **applies** them)
- Read: `docs/artifacts.md` — the "Effects — the optional cross-cutting field (3.0)" section, the
  "Atom lifecycle events" section's Scope note, and the "The graph engine" subsection (you add after
  it, and precisely amend the two "Part 5" scope notes)
- Read: `docs/glossary.md` (the one-bullet-per-term format)

## Dependencies
- Depends on: T01c, T02c, T03c (all audits clean)
- Depended on by: T05

## Scope
**Files:**
- Modify: `docs/artifacts.md`
- Modify: `docs/glossary.md`

**BOUNDARY — you MUST NOT modify any files outside this list. Do NOT touch `lib/`, `test/`,
`plugin.json`, or the README.**

## Positive Constraints (DO)

### 1. Add a new subsection to `docs/artifacts.md`, immediately after "The graph engine …" subsection

Add this exact subsection (matching the file's prose intro → example → field-by-field shape):

```markdown
### The rewrite engine — the failure calculus (3.0, Part 5)

`lib/rewrite.mjs` (`docs/DESIGN-3.0.md` §7, §7.1, §7.2) is a **pure** library: given an
already-typed, already-audited R1–R9 verdict and a read-only graph snapshot, `computeVerdictEffects`
returns a two-phase `{provisional, permanent}` set of effects in the shapes above. It **computes**
effect sets; it does not append a ledger event, apply an effect, read disk, or mint a born node's id
— the append-path wiring, the collision-free 3.0-verdict event type, and the effects-overlay fold
are all the frontier loop's job (Part 7). So today nothing calls it on a live effort; it is tested
against hand-built fixtures, exactly as Part 4's `servesEdges`/`informsEdges` are.

- **Totality (§7.2).** The router binds all nine verdict kinds (`checkpoint`, `dead-end`, `ripple`,
  `oversized`, `unknown-blocking`, `cycle-detected`, `parity-breach`, `illegible`, `stale-spec`) and
  **HALTs on any other** — `{ok:false, error}`, fail-closed. An illegal atom transition inside a rule
  HALTs the same way (validated with `lib/atom.mjs`'s `isValidTransition` before any `{state}` effect
  is emitted).
- **Two-phase effects (§7.2).** Provisional effects (reversible graph-state changes) are computed for
  verdict time; permanent effects (retirement permanence, ratified births, any shared-branch
  mutation) for gate ratification. Rules whose §7 "permanent" cell is "—" (R1, R4, R9) return
  `permanent: []`.
- **Born nodes are charter-intents.** R4 sub-atoms, R5's spike, and R6's placeholder are new nodes
  whose real `a-<seq>` id is minted only at apply (Part 7), so a birth is a node effect carrying a
  `change.charter` addressed by a synthetic anchor (`a-1/sub-0`, `spike/a-1`, `birth/<concept>`).
- **The routing ladder (§7.1)** is `routeRefutedPremise` — a pure classifier from where a refuted
  premise lives (`delta`/`contract`/`goal`/`intention`) to one of five routes; the `intention` layer
  routes to the always-human `intent-fork`.
- **The ceremony-escalation effect (§7, §5.4, §9)** is `ceremonyEscalation` — a sibling call
  (Part 7 makes it alongside `computeVerdictEffects`) that may ratchet a cone's complexity band **up
  one step, monotone, capped, never down**, on a wide R2 / foreign R3 / integration-exposing R9 /
  second R1. Its **unwind**, `unwindCeremonyEscalation`, is the exact inverse (restore the band, disarm
  the armed checks) — DESIGN-3.0's own untested open edge, now built with an apply-then-unwind =
  identity invariant.

**Scope note — the two flagged, un-owned gaps:** the complexity-band **vocabulary, thresholds, and
storage** (`policy.json`'s ceremony-sizing dials) and the **legibility density metric** that triggers
and validates R8's regrouping are `lib/legibility.mjs` / `policy.json`, **Part 6** — Part 5 implements
only the *mechanism* against a caller-supplied ordered band scale and per-cone bound, inventing no
band names and no thresholds. The R1 reprice **factor α is uncalibrated** (§16) — the effect carries
it symbolically, it computes no number.
```

### 2. Precisely amend the two existing "Part 5" scope notes in `docs/artifacts.md`

**In the "Effects — the optional cross-cutting field (3.0)" section**, replace the final sentence of
its Scope note:

- FIND: `Populating \`effects\` for real, and folding it with real precedence rules, is the rewrite
  engine's job (Part 5) — until then, an \`effects\` array stays durable, replayable data on the
  ledger line and nothing more.`
- REPLACE WITH: `Computing these effect sets is now the rewrite engine's job (Part 5,
  \`lib/rewrite.mjs\`, below) — a pure function from a verdict to a two-phase effect set. But nothing
  yet *appends* a verdict carrying them, and nothing *folds* them with precedence: that is the
  frontier loop's job (Part 7). So today an \`effects\` array is still never present on a real event,
  and the graph engine's edges stay 100% derived.`

**In the "Atom lifecycle events" section's Scope note**, replace:

- FIND: `Deciding which verdict (R1–R9) applies to a failed attempt, or applying one, remains future
  work (rewrite engine, Part 5) — this part's atoms now DO fold into the dependency graph, see below.`
- REPLACE WITH: `Which verdict (R1–R9) *applies* to a failed attempt is audited model judgment, and
  *applying* an effect set is the frontier loop's job (Part 7); *computing* the effect set for a given
  verdict is now the rewrite engine's job (Part 5, \`lib/rewrite.mjs\`). This part's atoms fold into
  the dependency graph (Part 4) and are transitioned by those computed effects once Part 7 applies
  them.`

### 3. Add glossary terms to `docs/glossary.md`

Add these bullets (alphabetically, matching the existing `- **Term** — definition.` format,
cross-referencing other bold terms):

```markdown
- **Failure calculus** — the total function (`lib/rewrite.mjs`, DESIGN-3.0 §7) mapping an
  already-typed, already-audited **Verdict** to a two-phase effect set. Pure: it computes effects, it
  does not apply them (the frontier loop does, Part 7).
- **Verdict (R1–R9)** — a typed outcome of an attempt (`checkpoint`, `dead-end`, `ripple`,
  `oversized`, `unknown-blocking`, `cycle-detected`, `parity-breach`, `illegible`, `stale-spec`).
  Its type and payload are audited model judgment; its effect set is code-computed by the **Failure
  calculus**.
- **Provisional / permanent effect** — the two phases of a verdict's effect set: provisional
  (reversible graph-state changes) lands at verdict time; permanent (retirement permanence, ratified
  births, any shared-branch mutation) lands only at a **gate**.
- **Ceremony-escalation effect** — an effect a verdict may carry that ratchets a cone's complexity
  band **up** (monotone, capped, never down; DESIGN-3.0 §7), deepening its audit and tightening its
  gate cadence. Its **unwind** is the exact inverse (apply-then-unwind = identity). The band
  vocabulary and thresholds are Part 6.
- **Blast radius** — the widen-only citation closure of a refuted premise recorded by an R2
  **Verdict**; every atom whose footprint intersects it freezes.
- **Routing ladder** — the §7.1 classifier (`routeRefutedPremise`) mapping where a refuted premise
  lives to its escalation route; an intention-layer premise always routes to the human-only intent
  fork.
```

## Negative Constraints (DO NOT)
- Do NOT add glossary terms for Part 6/7 vocabulary (legibility law, cone-sizing dials, spec queue,
  starvation quorum, frontier wave) — those belong to whichever part builds them.
- Do NOT claim P5 appends effects, applies effects, or wires the append path — it computes only.
- Do NOT touch `plugin.json` or the README (no version bump this generation).

## Implementation Steps
- [ ] Add the rewrite-engine subsection to `docs/artifacts.md` after "The graph engine …"
- [ ] Make the two precise scope-note replacements
- [ ] Add the six glossary bullets
- [ ] Re-read both files to confirm no duplicated/contradictory "Part 5 future work" text remains
- [ ] Commit:

```bash
git add docs/artifacts.md docs/glossary.md
git commit -m "docs(artifacts): the rewrite engine (Part 5) — computes effect sets, P7 applies"
```

## Acceptance Criteria
- [ ] `docs/artifacts.md` has the new rewrite-engine subsection and both scope notes are amended (no
      stale "future work, Part 5" wording remains that contradicts the new subsection)
- [ ] `docs/glossary.md` has the six new terms, correctly formatted and cross-referenced
- [ ] The docs say P5 **computes**; P7 **applies/wires** — nowhere overclaiming
- [ ] No file outside Scope modified; `plugin.json`/README untouched
