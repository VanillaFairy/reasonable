# T03 — Docs: artifacts + glossary

**role:** — (docs)
**Depends on:** T01c, T02c (both audits clean)
**Owns (stage only these):** `docs/artifacts.md`, `docs/glossary.md`

> Companion doc updates are a **ratification precondition** (DESIGN-3.0 §12) — they land with the code
> that introduces the term/shape, not batched at the end. P6d introduces **two new machine-parsed
> (`*`) artifacts** (`goals.json`, `policy.json`) and their loaders. Register both, and note that
> `route.json` is now superseded-but-not-retired. Scope the glossary tightly (like P6a did): add
> **goals.json**, **policy.json**, **ceremony-sizing dial** only — **cone**, **stratum**, **complexity
> band**, and **legibility law** land with P6b/P6c, the sub-parts that measure/consume them. Do NOT
> bold-cross-reference those not-yet-defined terms here.

**Files:**
- Modify: `docs/artifacts.md` (the `.reasonable/` index tree; two new `## <artifact> *` sections; the
  `route.json` superseded note)
- Modify: `docs/glossary.md` (three new bullets)

- [ ] **Step 1: Register both artifacts in the `.reasonable/` index tree**

In `docs/artifacts.md`, in the `.reasonable/` tree (the block that lists `route.json *` etc.), add two
lines immediately **after** the `route.json *` line:

```
  goals.json *             # ratified top-level scenario set (array of goal entries) — read by lib/goals.mjs (P6d)
  policy.json *            # ratified priority policy (weights/legibility/cadence/dials) — read by lib/policy.mjs (P6d)
```

- [ ] **Step 2: Add a full `## goals.json *` section**

Add a new section (place it immediately after the existing `## route.json *` section, before the next
`---`/`##`). Model it on the `## route.json *` section:

````markdown
## goals.json *

The **ratified top-level scenario set** (`docs/DESIGN-3.0.md` §3, §5.5) — the machine-parsed twin of the
parked top-level scenario suite. An **array** of goal entries; each goal's `scenarioCitations` are the
per-clause references `lib/graph.mjs`'s `servesEdges` consumes to compute which atoms serve that goal.

```json
[
  { "id": "expr-eval", "scenario": "evaluate an arithmetic expression end to end",
    "scenarioCitations": [{ "component": "lexer", "clause": "lexer#c1" }],
    "ratifiedAt": "2026-07-10T10:00:00+02:00", "ledgerSeq": 42 }
]
```

- `id` — required non-empty string; `servesEdges` emits `{ to: goal.id }`.
- `scenario` — required non-empty string; the top-level scenario the parked suite pins.
- `scenarioCitations` — required array of **objects**, each carrying a non-empty string `clause` (a
  `component#cN` ref). Preserved **verbatim** by the loader (a `component` field or any other survives),
  so the loaded goals feed `servesEdges(atoms, goals)` with no translation layer. An empty array is a
  shape-valid, cone-less goal.
- `ratifiedAt` / `ledgerSeq` — optional ratification back-pointers (local-ISO string / ledger seq),
  degraded to `null` when malformed, never fabricated.

**Read by `lib/goals.mjs`'s `readGoals(effortRoot)`** → `{ goals: [...] | null, diagnostic }` — the same
conservative three-state contract as `readRoute` (absent → `null`, no diagnostic; present-but-malformed
→ `null` + a surfaced diagnostic, one bad entry failing the whole load; never a repair). **Vision-class
enforcement path** (§3): human-gated in both run modes, agent-unwritable (the topologist *proposes* it;
a narrow writer persists it after human ratification). **P6d builds the loader + grammar; nothing reads
`goals.json` and no writer exists until P7's frontier loop + migration.**
````

- [ ] **Step 3: Add a full `## policy.json *` section**

Add a new section immediately after `## goals.json *`:

````markdown
## policy.json *

The **ratified priority policy** (`docs/DESIGN-3.0.md` §3, §9) — the machine-parsed planning policy
that, with `goals.json`, takes over `route.json`'s role at 3.0. An **object** with an **open** field set.

```json
{
  "weights":   { "integrationRisk": 5, "infoGain": 3, "unlocks": 2, "goalProximity": 4, "staleness": 1, "cost": -2 },
  "legibility":{ "maxWidth": 25, "maxTangle": 0.5, "maxChain": 8, "r8Retries": 3 },
  "cadence":   { "low": { "n": 1, "m": 3 }, "high": { "n": 1, "m": 1 } },
  "dials": {
    "bandScale":   ["low", "mid", "high"],
    "phaseCutoffs":{ "low": "skip-scaffold", "mid": "materialize", "high": "materialize" },
    "cadenceIndex":{ "low": 0, "mid": 1, "high": 2 }
  }
}
```

- `weights` — priority weights: a non-empty object of finite numbers (the six axes — integration-risk
  retirement, info gain, unlocks, goal proximity, staleness, cost).
- `legibility` — the pinned thresholds the legibility law (Part 6b) reads by name: `maxWidth`,
  `maxTangle`, `maxChain` (finite numbers), and `r8Retries` (the R8 retry bound N).
- `cadence` — the band-indexed gate-cadence floor: each band → `{ n, m }` finite numbers (§9).
- `dials` — the ceremony-sizing dials: `bandScale` (the ordered band vocabulary `lib/rewrite.mjs`'s
  `ceremonyEscalation` indexes into and P6c's classifier emits from), plus the band-keyed `phaseCutoffs`
  and `cadenceIndex` maps.

Numeric defaults ship **flagged-uncalibrated** (§16) — the loader validates *shape*, never *value*, so a
mistuned-but-well-formed policy loads clean. The `r8Retries` / `cadence.<band>.{n,m}` / `dials.*` keys
are **P6d-coined** (the design pinned each field's role, not its key), contestable and cheap to rename.

**Read by `lib/policy.mjs`'s `readPolicy(effortRoot)`** → `{ policy: object | null, diagnostic }` — the
conservative three-state contract (absent → `null`, no diagnostic; malformed → `null` + a surfaced
diagnostic; never a repair). On success the parsed object is returned **verbatim** (open grammar —
unknown keys and any ratification metadata survive), a deliberate divergence from `route.mjs`'s
closed-grammar projection. **Vision-class enforcement path** (§3): human-gated in both modes,
agent-unwritable by capability, so a struggling autonomous run can never size its own rigor down. **P6d
builds the loader + grammar; the write path is P7's.**
````

- [ ] **Step 4: Note that `route.json` is superseded-but-not-retired**

In the existing `## route.json *` section, add this note (immediately after its opening
"machine twin of `route.md`…" paragraph):

```markdown
> **Superseded (3.0) but not yet retired.** `route.json` is superseded by `goals.json` + `policy.json`
> (their grammar + conservative loaders landed in **P6d**), but stays **live** until **P7's migration**
> rebuilds the `nextAction` projection over goals + cones and retires the route path. P6 is purely
> additive — `route.json`, `lib/route.mjs`, and `lib/reconcile.mjs` are untouched (design doc Call #1).
```

- [ ] **Step 5: Add the three glossary terms**

In `docs/glossary.md`, near the **Route** entry, add these three bullets (match the one-line
`- **Term** — definition.` style; cross-link only terms that already exist in the glossary — do NOT
bold **cone** / **complexity band** / **legibility law**, which P6b/P6c introduce):

```markdown
- **goals.json** — the machine-parsed twin of the ratified top-level scenario set: an array of goal
  entries `{ id, scenario, scenarioCitations, ratifiedAt?, ledgerSeq? }`, each goal's
  `scenarioCitations` the per-clause refs **Serves** consumes to compute which atoms serve it. Read by
  `lib/goals.mjs` (Part 6d); with **policy.json** it supersedes **Route**'s `route.json` at 3.0 (wired
  in Part 7). Vision-class, human-gated in both run modes.
- **policy.json** — the machine-parsed twin of the ratified priority policy: `{ weights, legibility,
  cadence, dials }` — the priority weights, the legibility thresholds, the band-indexed gate-cadence
  floor, and the **ceremony-sizing dial** set. Read by `lib/policy.mjs` (Part 6d), which validates its
  *shape*, never its *value* (defaults ship uncalibrated). Vision-class, human-gated, agent-unwritable.
- **Ceremony-sizing dial** — a tunable in **policy.json**'s `dials` mapping a node's risk band to how
  much ceremony it earns: the ordered `bandScale`, the band→phase-materialization cutoffs, and the
  band→gate-cadence index. Because it can size ceremony *down*, it is vision-class — human-gated in both
  modes, agent-unwritable by capability. The classifier (Part 6c) *reads* dials; it never writes them.
```

- [ ] **Step 6: Commit**

```bash
git add docs/artifacts.md docs/glossary.md
git commit -m "docs(artifacts,glossary): goals.json + policy.json grammar + loaders (P6d)"
```
