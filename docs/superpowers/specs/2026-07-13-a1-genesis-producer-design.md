# A1 — Genesis producer: design spec

**Date:** 2026-07-13
**Effort branch:** `a1-genesis-producer`
**Source problem:** `docs/roadmap/atom-graph-orchestrator.md` (phase A1)
**Scope decision:** design + build A1 only (A2–A4 are separate, later efforts).

---

## 1. What we're building and why

The reasonable 3.0 atom graph is a fully unit-tested *pure calculus* — the lifecycle
(`lib/atom.mjs`), the edge fold (`lib/graph.mjs`), the frontier (`lib/frontier.mjs`), the complexity
classifier (`lib/ceremony.mjs`) — but on a live effort it has **no producer feeding it**. Analysis
hand-drafts a `route.md`/`route.json` plan; the `topologist` agent, whose whole job is to produce the
genesis graph, is never dispatched. So `reconcile` reads no `goals.json`, the graph edges fold over an
empty atom set, and `classify()` never runs. The calculus is dark.

A1 lights it up for the first time. It dispatches the topologist at analysis, persists its ratified
output through a narrow capability-fenced writer, and wires the genesis-fidelity edges into the graph
projection so a real effort produces a **non-empty genesis graph**: a nested containment tree, planned
dependency edges, and an initial complexity band.

A1 is the head of the four-phase chain (A1–A4) precisely because you can't pack, spec, or dispatch real
atoms until real atoms exist. It is self-contained and its acceptance is cleanly testable.

---

## 2. The key finding that shapes the design

A naive reading of the roadmap ("A1 makes needs/serves edges compute, cones appear") would ship a graph
that is *still empty*, because of how the edge functions are keyed.

Both `needsEdges` and `servesEdges` in `lib/graph.mjs` (lines 53–70 and 160–177) read
`atom.deltaClauses` — **spec-time data that a genesis charter does not have** (a charter is structure
only; clauses are born at gates, §13). So at pure genesis:

- `needsEdges(atoms)` → `[]` (no `deltaClauses` to resolve citations against).
- `servesEdges(atoms, goals)` → `[]` (line 161 returns empty the moment no atom provides a goal's cited
  clause — and none do, pre-spec).

The edge fidelity that **is** non-empty at genesis is `plannedNeedsEdges(charters)`
(`lib/graph.mjs:243`), derived from charter `premises` (`cite:` cross-component quotient + `order`
intra-component strata). But **no projection wires it in**: `deriveCurrent` and `foldAsLived`
(`lib/graph.mjs:304`, `318`) both call the actual `needsEdges`, never the planned one, and both call
`containmentTree(atoms)` with **no ownership map**, so atoms render flat.

**Therefore, at genesis, the graph that lights up is:**
- a **nested containment tree** (atoms under their `component → subeffort` path) — this is "Gap D," the
  Node/Atom id-duality collapse;
- **non-empty planned-needs edges** (from charter premises);
- **excludes edges** from charter loci overlap;
- an **initial `classify()` band** from the policy dials.

**Serves-cones remain empty until the first deltas land — that is an A2 payoff, not A1** (see §7). The
roadmap's "serves edges compute at A1" line is corrected as part of this work.

---

## 3. Design

### 3.1 New analysis flow — dispatch the topologist

Today `skills/analysis/SKILL.md` grills the vision and intention, then the orchestrator hand-writes
`route.md` and (step 10a) persists `route.json`. A1 inserts a producer step and replaces the persistence:

```
grill vision → grill intention → [NEW] dispatch topologist → human ratifies
  → [NEW] genesis-writer persists goals.json + policy.json + ownership.json
  → [NEW] orchestrator appends charters via the ledger
  → scaffold
```

The topologist (`agents/topologist.md`, already written, read-only `Read/Grep/Glob`) consumes the
grilled goals + intention and **proposes** its five §5.1 outputs: component topology, the full
structure-only chartering, the containment tree + `component → subeffort` ownership map, the `policy.json`
proposal, and the t0 complexity classification (it supplies the inputs to `classify()`). It persists
nothing — it has no write capability by allowlist. This is the agent's designed role; A1 is the first
caller.

**Mode behavior is unchanged and honored:** in gated mode the topology gate blocks for human ratification;
in autonomous mode it self-ratifies-and-logs (`type:"ratification"`, `approvedBy:"autonomous"`) and never
blocks — but the topology proposal, `goals.json`, and `policy.json` are vision-class, so an autonomous
run's self-ratification of them is logged and (for anything that sizes ceremony) surfaced, exactly as the
existing analysis intention gate already does.

### 3.2 The `genesis-writer` agent (new)

A new fenced writer, cloned from the `intention-writer` pattern (`agents/intention-writer.md`):

- **Model:** haiku. **Tools:** `Read, Edit, Write, Bash, Grep, Glob`.
- **Writes exactly three files:** `.reasonable/goals.json`, `.reasonable/policy.json`,
  `.reasonable/ownership.json` — the ratified vision-class genesis artifacts — verbatim from the ratified
  proposal, in **one atomic commit** plus a `ratification` ledger line (through the ledger controller CLI,
  never a direct ledger write).
- **Transcription fidelity, not authoring:** it persists what the human ratified; it does not resolve
  forks, add clauses, or size anything. HALT-with-`persisted:false` honesty on any failed write (never a
  fabricated commit SHA) — the same discipline `intention-writer` enforces.
- **Capability fence is the point:** `goals.json`/`policy.json` can size ceremony down, so they must be
  agent-unwritable except by this narrow, human-gated hand. The broad-capability main session does not
  write them; a struggling autonomous worker *cannot* (no such tool in its allowlist).
- Add all three files to `enforcementPaths` so no other agent can rewrite them.

**Rationale for a dedicated agent (vs. orchestrator-inline):** consistency with every existing narrow
writer (`intention-writer`, `journal-writer`, `verdict-writer`, `lane-committer`, `work-order-writer`) and
with the topologist's own constitution, which says a "narrow writer" persists goals/policy after
ratification. Capability-fencing vision-class writes is the methodology's core ("capability beats
discipline"), not extra abstraction.

### 3.3 Charters via the ledger (orchestrator-inline)

Charters are **not files** — each becomes an `atom-chartered` ledger event via `charterAtom(effortRoot,
charter)` (`lib/atom.mjs:201`), which assigns the atom its id (`a-<seq>`, the ledger seq of its own
charter event — the id-duality collapse). The **orchestrator persists them inline** through the ledger
controller, exactly as `analysis` already plants `node-planned` events inline (step 10a today), and
exactly as `agents/topologist.md` specifies ("the orchestrator persists each charter through the ledger
controller"). This keeps the genesis-writer single-responsibility (flat vision-class files) and does not
invent a new mechanism for charters.

### 3.4 `ownership.json` + `lib/ownership.mjs` (new)

The `component → subeffort` ownership map is the topologist's output #3 and is read independently by the
graph fold (`containmentTree` takes `{ ownershipMap }` as a first-class input). It gets its own artifact
and loader, mirroring `lib/goals.mjs` / `lib/policy.mjs`:

- **On disk** (`.reasonable/ownership.json`): a JSON object mapping component name → slash-delimited
  subeffort path string, e.g.
  ```json
  { "lexer": "frontend/parsing", "parser": "frontend/parsing", "emitter": "backend/codegen" }
  ```
  A component absent from the map falls back to its bare name (the flat degenerate placement
  `containmentTree` already does).
- **`lib/ownership.mjs`** exports `readOwnership(effortRoot) → { ownership: object | null, diagnostic:
  string | null }` — the same conservative three-state contract as the other loaders (absent →
  `null`/no diagnostic; malformed → `null` + diagnostic; valid → parsed object). Dependency-free, node
  builtins only (invariant 1). Values must be non-empty strings; one bad entry fails the load.
- **Grammar** documented in `docs/artifacts.md` (invariant 3: machine-parsed format + parser land
  together).

*(Alternative considered and rejected: embedding the map as `policy.ownership`. Rejected because it
conflates topology output #3 with the priority-policy output #4, and every other machine-parsed genesis
output already has its own artifact+loader. Open to reversal at spec review.)*

### 3.5 The graph projection change (`lib/graph.mjs`)

The production-code change lives almost entirely in the two I/O projections `deriveCurrent` and
`foldAsLived` (plus, conditionally, a field-preservation fix in the `lib/atom.mjs` fold — see the note
below):

1. **Load and pass the ownership map** to `containmentTree(atoms, { ownershipMap })` so atoms nest (Gap
   D). `deriveCurrent`/`foldAsLived` call `readOwnership(effortRoot)` and pass the result.
2. **Per-atom needs fidelity.** For each atom: if it has `deltaClauses`, its outgoing needs come from the
   actual `needsEdges`; if it is chartered-but-unspec'd, from `plannedNeedsEdges`. This yields a correct
   graph at *every* stage — pure genesis, the mixed A2 state, and full-spec — with no mode flag. At
   genesis (all atoms unspec'd) this reduces to `plannedNeedsEdges` over the whole set; post-spec it
   reduces to `needsEdges`.

**Implementation note to verify during build:** `plannedNeedsEdges` consumes charter records with
`id`/`component`/`premises`/`order`. The build must confirm `foldAtomFromEvents` (`lib/atom.mjs`)
preserves `premises`/`order` on the folded chartered atom record; if it drops them, the fold gains those
fields (small, and the test catches it either way).

---

## 4. Retiring `route.json`

`lib/route.mjs` is already deleted and `reconcile` already reads `goals.json` only (`lib/reconcile.mjs:648–661`)
— an absent/degraded `goals.json` degrades the frontier, never halts. So **no live code reads
`route.json`**; only two orchestrator write-sites remain, and A1 retires both:

- `skills/analysis/SKILL.md:160–174` (step 10a "Persist `route.json`") → replaced by the genesis-writer
  dispatch + inline charter appends.
- `skills/retro/SKILL.md:107` (the re-sort rewrite of `route.json`) → removed; the frontier re-sort is
  now expressed through goals/cones, which reconcile already reads.

Retiring these is safe cleanup, not a behavior change (reconcile ignores the file today). The build greps
the whole tree to confirm no *live read* remains before deleting the writes (escalation trigger if one is
found).

---

## 5. Artifacts touched (complete list)

**New:**
- `agents/genesis-writer.md` — the fenced writer.
- `lib/ownership.mjs` — the ownership loader.
- `test/genesis-graph.test.mjs` — the acceptance test (§6).

**Modified:**
- `lib/graph.mjs` — the two projection edits (§3.5).
- `lib/atom.mjs` — only if the fold must preserve `premises`/`order` (§3.5 note).
- `skills/analysis/SKILL.md` — dispatch topologist; replace step 10a.
- `skills/retro/SKILL.md` — remove the route.json re-sort write.
- `docs/artifacts.md` — `ownership.json` grammar; `genesis-writer`; mark `route.json` writes retired.
- `docs/roadmap/atom-graph-orchestrator.md` — the §7 serves-cone correction.
- `.claude-plugin/plugin.json` + `README.md` (install snippet + footer) — **minor** version bump
  (new backward-compatible capability).

---

## 6. Verification — the definition of done

This repo has no `.reasonable/` and cannot host a live effort (hooks no-op here), so A1's acceptance
— *"does a real effort produce a non-empty genesis graph?"* — is expressed as a Node test in the repo's
existing style (throwaway git repo, builtins only, exercises `lib/*.mjs` against real git).

`test/genesis-graph.test.mjs`:

1. Build a throwaway repo with a `.reasonable/`; `charterAtom` 2–3 atoms across ≥2 components with
   `cite:`/`order` premises; write a small `goals.json`, `policy.json`, and `ownership.json`.
2. Assert the genesis projection (`deriveCurrent`) produces:
   - a **nested** containment tree (atoms under their subeffort paths, not flat) — Gap D;
   - **non-empty planned-needs edges** matching the charter premises;
   - (via `classify()`) a **band** drawn from the policy dials.
3. Assert `reconcile` takes the **goals-present branch** — it no longer emits the "goals.json degraded"
   diagnostic (the real A1 win: it stops taking the no-goals degraded path). The *ordering content* at
   pure genesis depends on whether `deriveConeOrder` falls back to a planned-needs topological order when
   serves is empty; that fallback behavior is pinned during the build (test-first) and asserted at
   whatever it actually is — not asserted non-empty a priori, since serves-cones are an A2 payoff (§7).
4. **Negative:** with `route.json` absent, all of the above still holds (proves the retirement is safe).

The markdown deliverables (the `genesis-writer` agent, the analysis/retro skill rewiring) are reviewed
against this spec, not unit-tested — that is the honest boundary. The mechanical proof is the projection
test. The code core (`lib/ownership.mjs`, the `lib/graph.mjs` edits) is built test-first (RED before
GREEN).

---

## 7. Scope boundaries

- **Serves-cones are A2, not A1.** `servesEdges` structurally needs spec-time clauses; feeding
  `goals.json` alone cannot make it non-empty at genesis. A1 delivers the nested tree + planned-needs +
  band; serves-cones light up when the first deltas land (A2). The roadmap line is corrected accordingly.
- **Greenfield genesis only.** The roadmap defers brownfield genesis (how the census skeleton +
  characterized clauses seed charters). A1 leaves the brownfield analysis branch's genesis untouched;
  brownfield efforts keep today's degraded-to-empty ordering (status quo, not a regression, since
  reconcile already ignores route.json there too).
- **Not in A1:** real spec/pack on actual footprints (A2), real dispatch/merge and the verdict→state
  fold (A3), the ceremony dial routed live through `requiredRoles`/`gateDue` and the phase-degeneration
  predicate (A4), and calibration (dogfooding).

---

## 8. Invariants this design must preserve

1. **`lib/` stays dependency-free** — `lib/ownership.mjs` uses node builtins + relative imports only.
2. **Hooks fail open outside an effort, closed inside** — unchanged; A1 adds no hook path.
3. **Machine-parsed grammar + parser land together** — `ownership.json` format in `docs/artifacts.md`
   ships with `lib/ownership.mjs`.
4. **`DESIGN` §-references stay stable** — cite, don't renumber.
5. **Workflow scripts stay pure** — A1 does not touch `frontier-wave.workflow.js` (that is A2/A3).
6. **Only glossary terms carry normative force** — no keying off informal words.
7. **A plan never claims to record a human's words** — the genesis-writer transcribes ratified content;
   any human confirmation is a ledger `ratification` fact, never reconstructed prose. (In *this* plugin
   repo there is no `.reasonable/` ledger, so a human confirmation during the build is acted on in the
   live conversation and stated plainly as conversation-confirmed.)
8. **Capability fence on vision-class files** — only `genesis-writer` writes `goals.json`/`policy.json`/
   `ownership.json`; the topologist proposes and cannot write; the main session does not write them.

---

## 9. Execution model (post-approval)

After this spec is approved, the build runs **autonomously and dynamically to done**: writing-plans →
test-first implementation of the code core → the markdown rewiring → full test run → commit + minor
version bump on the `a1-genesis-producer` branch → a completion report. No per-task human checkpoints.

**Escalate to the human only on a breaking issue** (original intent endangered):
- the atom calculus turns out not to support a non-empty genesis graph as A1 assumes;
- retiring `route.json` would break a live read not found in the survey;
- making it work would require weakening a load-bearing invariant (§8) — a capability fence, a hook rule,
  or a machine-parsed grammar with ripple;
- a **major** (breaking) version bump would be required.

Everything else — test cases, naming, file layout, `ownership.json` schema details, doc wording,
patch/minor bumps, committing, mechanical test updates — proceeds without asking, reported as it happens.
