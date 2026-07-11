# Design — Reasonable 3.0 Part 7: The Frontier Loop + Gates (the migration that makes 3.0 live)

**Status:** brainstormed non-interactively, same discipline as Parts 1–6. `reasonable` is a Claude
Code plugin, not an interactive service, so this pass plays the role brainstorming normally reaches
through dialogue — every genuinely contestable call is flagged explicitly below instead of silently
resolved. The human reviewing this (and the resulting plan) is the approval gate that would normally
have happened turn-by-turn. **One call is pivotal enough that the plan should not be executed until
it is confirmed** — it is the first decision below (who computes the effect set: the append path or
the frontier loop), and it is the exact mirror-image of the pivotal call P5 and P6 each *deferred to
this part*.

## What this covers

Part 7 of the `reasonable` 3.0 roadmap
(`docs/superpowers/plans/2026-07-08-reasonable-3.0-roadmap.md`): the **frontier loop and its
gates** — the part that stops building pure libraries *alongside* the live 2.x engine and starts
**wiring them into it**. Per `docs/DESIGN-3.0.md` §6, §9, §12, §17 it delivers:

- **`lib/frontier.mjs`** (new, pure) — the ready-set / spec-queue / packing calculus, the exhaustive
  **`GATE_RESULT`** union and the total `gateDue` function that produces it, the **band-indexed gate
  cadence** (§9), and the **role-minimal provisioning** predicate (§6, draft-five);
- **`workflows/frontier-wave.workflow.js`** (new) — the frontier-wave workflow that **replaces**
  `vertical-slice-runner.workflow.js`: *spec → pack → dispatch → collect → merge → gate*, one run per
  gate interval (§6);
- **the append-path wiring P5 deferred** — a collision-free 3.0-verdict event type, and
  `computeVerdictEffects` / `ceremonyEscalation` (P5) hosted **inside the ledger controller's append
  path** so the effect sets are code-computed, never model-authored (§2.4);
- **the 2.x→3.0 migration** (§12) — retire `route.mjs` / `route.json` as the live planning object,
  **rebuild the `nextAction` / `selfCheckDirectives` projection over goals + cones**, and extend
  `reconcile.mjs` to **replay the recorded effect sets** (§2.4);
- **the live progress view** (§8) — the existing progress fold taught the 3.0 atom / verdict
  vocabulary, "no new machinery" (§8);
- **lazy, role-minimal provisioning** (§6, draft-five) — a wave stands up only the roles its atoms
  need, with lane infrastructure stood up on first need, the lane = atom accounting untouched.

Parts 1–6 shipped real, inspectable ground truth this doc reads directly rather than re-deriving from
prose (every signature below was read from the file, not assumed):

- `lib/rewrite.mjs` (P5) — the pure failure calculus. `computeVerdictEffects(verdict, state)` (the
  total router, HALT-on-unknown), `routeRefutedPremise(premise, state)` (the §7.1 ladder →
  `re-charter | amendment | topologist-recut | goal-respec | intent-fork`), `ceremonyEscalation(verdict,
  state) → effect|null`, `unwindCeremonyEscalation(escalationEffect) → effect[]`, and the pure graph
  helpers `scc` / `dependentCone`. **Its own header says the append-path wiring, the collision-free
  3.0-verdict event type, and the effects-overlay fold are "all Part 7's".** This is that part.
- `lib/ledger.mjs` — the one sanctioned write path. `append(root, event, opts)` (D19: validate →
  stamp `seq` → write under `effort.mjs`'s lock → regen mirrors). `EVENT_SCHEMAS` already carries a
  **2.x `verdict`** type (`required: []`) *and* a `verifier-verdict` type, both live for 2.x
  work-order judgments — the collision P5 named. `validateEvent` already calls
  `validateEffects(event.effects)` for any event carrying an `effects` field. The names `atom-verdict`
  and `phase-degenerated` are **free** (verified — no `EVENT_SCHEMAS` entry uses them).
- `lib/graph.mjs` (P4/P6a) — `foldAsLived(effortRoot, {uptoSeq})` (the as-lived graph = fold of
  recorded effects), `deriveCurrent(effortRoot, {goals, spikeInforms})` (the current graph = replay +
  fresh-derived edges), `graphDivergence(effortRoot)` (as-lived vs. current), `servesEdges(atoms,
  goals)` (the goal cones), `containmentTree`, `liftEdges`, `plannedNeedsEdges`, `citationClosureOver`.
- `lib/ceremony.mjs` (P6c) — `classify(inputs, dials) → band`, and the three phase-degeneration
  predicates `scaffoldMaterializes(genesis, lastRatified, skeletonComponents)`,
  `rechartingDegenerates(amendmentBatch)`, `retroClassificationDegenerates(landedConeCount)` — each
  returning `{result:'materialize'}` or `{result:'degenerate', degeneracy:<record>}`. Their headers
  say verbatim: *"P6c COMPUTES; P7's frontier loop WIRES … that live-writer wiring is P7's."* This is
  that part.
- `lib/goals.mjs` / `lib/policy.mjs` (P6d) — `readGoals(effortRoot) → {goals, diagnostic}` (goal
  entries `{id, scenario, scenarioCitations, ratifiedAt, ledgerSeq}`; `scenarioCitations` are what
  `servesEdges` reads to compute cones) and `readPolicy(effortRoot) → {policy, diagnostic}`
  (`{weights, legibility, cadence, dials}`; `cadence` maps each band → `{n,m}` — the band-indexed
  gate floor "Part 7's gate cadence"; `dials.bandScale` is the ordered array `ceremonyEscalation`
  indexes and `classify` emits). **Both have zero runtime importers today** — P7 is their first
  consumer.
- `lib/reconcile.mjs` / `lib/next-action.mjs` / `lib/route.mjs` — the live 2.x recovery prologue and
  its projection. `route.mjs` exports one symbol, `readRoute(effortRoot)`; its **only** runtime
  importer is `reconcile.mjs`. `next-action.mjs` exports `projectDirectives(state)` (→ directives
  `{kind, slice?, workOrders?, workOrder?, detail?}`, `kind ∈ HALT|AMBIGUOUS|DECIDE|RUNNING|DISPATCH|
  RETRO|OPEN|LAND|CONCLUDE|DONE`) and `selfCheckDirectives(directives, context)`. The projection is
  coupled to the route **only** through a derived `routeOrder: string[]|null` array plus a `slices[]`
  digest, both computed in `reconcile()`'s Layer-2 block (≈ lines 637–854). **Everything downstream —
  `progress-map.mjs`, `session-start.mjs`, `briefing()`, every workflow — consumes `result.nextAction`
  or the persisted `next-action` ledger event, never `route.json`.** That is the fact that makes the
  migration a *narrow* cut, not a 71 KB rewrite (Decision 6).
- `workflows/vertical-slice-runner.workflow.js` — the workflow P7 replaces. It is loaded as one async
  function body with the injected globals `['args','budget','phase','log','agent','parallel','pipeline',
  'workflow']`; `export const meta` is a pure object literal; **no `fs`/`Date.now()`/`Math.random()`/
  `new Date()`/`import`** (the hard substrate rule, `CLAUDE.md` invariant 5). It returns a **four-variant**
  typed union `green | budget-exhausted | blocked | halt`. §6 needs a **seven-variant** union — see
  Decision 3.

**Explicitly out of scope** (deferred, same discipline as Parts 1–6):

- **The scout (P8).** The zero-commit pre-effort exploration surface (§17) is its own part; it depends
  on P6, not P7, and nothing here touches it.
- **Numeric calibration (§16).** Budget denomination per atom class, the R1 reprice factor α, the
  ceremony-dial thresholds, and the band → cadence indices stay **uncalibrated `policy.json`
  defaults**. P7 wires the *mechanism* that reads them; it invents no numbers. (Same posture P5/P6
  held; see Flagged gaps.)
- **Multi-writer journal / cone-concurrency > 1 (§16).** The lane = atom bijection and the
  default-1 cone-concurrency term are **untouched** (§6: "the lane/journal/ledger accounting is
  unchanged"). P7 amortizes *provisioning*, never the accounting.
- **In-place migration of a live 2.x effort.** §12 is explicit: *"No in-place migration … a restart
  under 3.0 keeps contracts and ledger history (read through the compatibility fold), but re-runs
  analysis addenda and a full topology stage. This is a re-genesis, not a rename."* P7 does **not**
  write a converter that rewrites an on-disk 2.x `route.json` effort into a 3.0 one. It retires the
  route *code path* and builds the goals/cones path; an existing effort re-genesises through P6's
  topology stage (which P7 wires into the phase flow). This repo has **no** `.reasonable/` of either
  vintage, so no live effort is at risk here regardless.

## The central scoping fact this design turns on — READ FIRST

**P5 and P6 were both *additive* parts: each built a pure library or grammar *alongside* the live 2.x
engine and explicitly deferred the wiring to "whoever first has a live consumer" — which they both
named as P7.** P5 deferred "the append-path wiring, the collision-free 3.0-verdict event type, and the
effects-overlay fold." P6 deferred "the physical retirement of `route.mjs` and the rebuild of the
projection over goals/cones." **Part 7 is where those deferrals come due. There is no further part to
defer to** — P8 is the standalone scout, independent of the in-effort engine. So P7's pivotal question
is not P5/P6's *"what do we defer?"* but its inverse: ***"in what order do we land changes to the
load-bearing 2.x engine — `ledger.mjs`, `reconcile.mjs`, `next-action.mjs` — so the plugin's own test
suite is green after every single task?"*** (The roadmap's load-bearing invariant: *"the plugin keeps
working, and keeps passing its existing test suite, between parts."* Within P7 we hold it *between
tasks*, because P7 is the first part that edits live-engine files rather than adding new ones beside
them.)

That question has a concrete, decisive answer, because of one fact the reconcile wiring map makes
plain: **`goals.json`/`policy.json` have zero runtime importers, and every downstream consumer reads
the *directive grammar* (`result.nextAction` / the persisted `next-action` event), not `route.json`.**
So the migration is **additive-then-subtractive** and safe at every step (Decision 6 pins the exact
order). The append-path wiring is likewise additive: `atom-verdict` is a *new* event type that never
touches the live `verdict` type P5 warned about.

### The pivotal call — the append path computes the effect set (not the frontier loop)

§2.4 says the effect set is *"computed by `lib/rewrite.mjs` inside the ledger controller's append
path, the same no-model-in-the-loop position that stamps `seq` (D19)."* Read literally, that binds
**P7** to host `computeVerdictEffects` **inside `append()`**: when an `atom-verdict` event arrives
carrying an already-typed, already-audited verdict payload, `append()` assembles the graph snapshot
(from `deriveCurrent` + the policy dials), calls `computeVerdictEffects` + `ceremonyEscalation`,
stamps the resulting **provisional** effects onto the event, and writes — exactly as D19 stamps `seq`.
No agent, and not even the workflow, authors an effect set.

**Decision: take §2.4 literally — the append path owns effect computation.** `append()` grows a
verdict branch that code-computes effects for `atom-verdict` (and the ceremony escalation alongside
it), so the no-model boundary sits where §2.4 puts it. The frontier workflow's job is to *produce and
collect the audited verdict payload* (`for v in verdicts: ledger.append(v)`, §6) — it hands `append()`
a verdict, never an effect set.

**Flagged as contestable (this is the pivotal call):** a reviewer could argue the frontier loop
should compute the effect set (it already assembles the graph state to pack the wave) and pass it to
`append()`, with `append()` only *validating* it. That reading is defensible on DRY grounds (the state
is assembled once) but it **reopens exactly the attack §2.4 closes**: an effect set computed *outside*
the controller is one a future non-controller caller could author or mutate, and the "same position
that stamps `seq`" guarantee evaporates. So this design puts computation *in* `append()`, and pays the
cost of `append()` assembling the snapshot itself. **If this call is reversed, the append-path tasks
(Phase B) move into `lib/frontier.mjs` and `append()` shrinks to a validator** — a different task
shape for roughly a third of the plan. **Confirm this before execution begins.**

## Decision 1 — module layout: one new pure library, three *extensions* of live files, one new workflow

The roadmap's file column names two new files (`lib/frontier.mjs`, `workflows/frontier-wave.workflow.js`)
and "`route.mjs (retire)`". As with P4/P5/P6 that under-specifies the surface. The clean decomposition,
justified per file (SRP, the repo norm):

- **`lib/frontier.mjs` (new, pure)** — the loop *calculus*: the ready-set, the wave packing, the
  `GATE_RESULT` union + `gateDue`, the band-indexed cadence, and the `requiredRoles` provisioning
  predicate. Pure over `graph.mjs`/`footprint.mjs`/`ceremony.mjs`/`policy.mjs` outputs — no disk, no
  `append()` — so it is unit-testable by hand-built fixtures exactly like `rewrite.mjs`. This is the
  P5/P6 shape one more time, for the parts of P7 that *can* stay pure.
- **`lib/ledger.mjs` (extend)** — the append-path wiring (Decision 4). Register `atom-verdict` +
  `phase-degenerated` in `EVENT_SCHEMAS`; add the verdict branch that code-computes effects. This is a
  live-engine edit, done additively (a new event type never fires on old data).
- **`lib/next-action.mjs` (extend)** — the goals/cones projection (Decision 6). The migration keeps
  `projectDirectives`/`selfCheckDirectives`'s directive grammar and `state`/`context` *shapes*, and
  changes only what *feeds* them; the `routeOrder` input becomes a cone-derived order.
- **`lib/reconcile.mjs` (extend, then narrow)** — the Layer-2 block selects the goals/cones projection
  and replays effect sets (Decision 6). The `readRoute` import is removed in the final subtractive
  step, after nothing else reads it.
- **`lib/progress-map.mjs` (extend)** — the live view (Decision 7): the `EVENT_MAP` gains the 3.0 atom
  / verdict / degeneration interpretations. "No new machinery" (§8) means *extend the existing fold*,
  not write a second one.
- **`workflows/frontier-wave.workflow.js` (new)** — the frontier-wave workflow (Decision 8),
  replacing `vertical-slice-runner.workflow.js`.
- **`lib/route.mjs` + `test/route.test.mjs` (delete, last)** — removed only once `reconcile.mjs` no
  longer imports `readRoute` (Decision 6, step 5).

No new CLI. `lib/frontier.mjs`'s only caller is the workflow, in-process — the same restraint P5 held.

## Decision 2 — `lib/frontier.mjs`: the pure loop calculus

Every function is pure — verdict/graph/policy data in, plain values out, no disk, no `append()` —
so P7's riskiest logic (what gates, what packs, which roles) is unit-tested in isolation before any
of it is wired. The surface (`shared/interfaces.md` pins it exactly):

- **`ready(graph, {frozen, guardHalted, barred}) → atomId[]`** — the frontier set: atoms whose
  planned/actual `needs` providers are all satisfied (a DAG-ready set over the edges), **minus** the
  frozen / guard-halted / dispatch-barred sets (§6: "planned edges; minus frozen / guard-halted /
  barred"). Reuses `graph.mjs` edges; adds no new graph algorithm.
- **`pack(specdAtoms, footprints) → wave`** — the maximal subset of spec'd atoms that is **pairwise
  disjoint by *actual* footprint** (§6: "packing happens only on actual footprints"). Reuses
  `lib/footprint.mjs`'s existing `groupDisjoint` set-algebra over locus | citation-closure | resource;
  `frontier.mjs` wraps it, it does not reimplement it. A collision between packed lanes stays an **R9**
  (a footprint bug, §6), surfaced as a verdict, never a silent merge conflict.
- **`gateDue(events, state, policy) → GATE_RESULT`** — the total gate function (Decision 3). Reads
  the band-indexed cadence out of `policy.cadence` (Decision 5).
- **`requiredRoles(wave, context) → Set<roleName>`** — the role-minimal provisioning predicate
  (Decision 9). Reuses `ceremony.mjs`'s degeneration predicates + the brownfield-input tests. Pure;
  the *dispatch* on its result is the workflow's.

## Decision 3 — the exhaustive `GATE_RESULT` union

§6 pins the union as exhaustive: `goal-green | heartbeat | batch-full | starved | blocked-human | halt
| budget-exhausted`. The shipped `vertical-slice-runner` returns only `green | budget-exhausted |
blocked | halt`. P7 **replaces** the four-variant union with the seven-variant one, and pins each
variant's meaning and the orchestrator routing (mirroring the `vertical-slice-execution` skill's
existing "green→retro, budget-exhausted→extend, blocked→human, halt→human" contract):

| variant | fires when | main-session routing |
|---|---|---|
| `goal-green` | a goal's cone reaches green — the **deep umbrella audit** (mutation + proportionality) runs at this gate (§6) | close the goal; run the goal-gate retro roster (§9) |
| `heartbeat` | the band-indexed floor trips — N merged atoms or M events since the last gate (§9) | run the heartbeat retro roster |
| `batch-full` | a batched class (amendments, dead-end permanence, extractions, retopology diffs) grew past its pinned bound (§9) | drain the batch at a retro gate |
| `starved` | the frontier is empty / below quorum while gate-held material exists (§9, the liveness valve) | ratify the pending permanence, clear the freezes |
| `blocked-human` | an **always-human** class: a policy/goal change (§3) or an intent fork (§7.1) — in **both** modes | **block** for the human (never self-ratifies) |
| `halt` | a durability / reconcile / totality failure (unknown verdict kind §7.2, a scribe/persist failure) — fail-closed inside an effort | human durability halt |
| `budget-exhausted` | the wave budget is spent with no wall claimed (R1 territory) — first-class, **not** a failure | extend budget / re-plan |

`gateDue` is **total** (§7.2 Totality, generalized from the router to the loop): the immediate-fire
classes (`goal-green`, `blocked-human`, `starved`, and the inbox tripwire) are checked first and
short-circuit; then the batched/floor classes (`batch-full`, `heartbeat`); an unrecognized control
state is a `halt`, never a silent fall-through. `blocked-human` and `starved`/`goal-green` fire
**regardless of band** — the band only ever moves the *floor* (`heartbeat`), never disables a backstop
(§9). *Flagged, minor:* the 2.x `blocked{outcome:trap}` variant does **not** survive as a generic
"blocked" — in 3.0 a wall is a **verdict** (R1–R9), routed by the calculus; only the always-human
residue (intent fork, policy/goal change) surfaces as `blocked-human`. This is a genuine grammar
change (§12: "the OUTCOME union → the verdict grammar with rule bindings"), pinned here so the workflow
tests assert the new shape rather than the retired one.

## Decision 4 — the append-path wiring: the `atom-verdict` event type + code-computed effects

The P5-deferred wiring, now built. Three moves inside `lib/ledger.mjs`:

1. **A collision-free 3.0-verdict event type.** `EVENT_SCHEMAS` gains `'atom-verdict': { required:
   ['atomId','kind'] }` — keyed on `atomId` and the verdict `kind` (the nine `VERDICT_KINDS`), so it
   never collides with the live 2.x `verdict` (work-order-keyed) that P5 warned would misfire. The
   sibling `'phase-degenerated': { required: ['phase'] }` is registered too — the exact shape
   `ceremony.mjs` already emits (`{type:'phase-degenerated', phase, reason, inputs}`), so P7 appends
   the degeneration record `ceremony.mjs` computes, verbatim (its header asked for exactly this).
2. **`append()` code-computes the provisional effects for an `atom-verdict`.** When the event type is
   `atom-verdict`, `append()` — after validating the payload and *before* stamping `seq` — assembles
   the read-only graph snapshot (`state = { atoms, edges, citationGraph }` from `deriveCurrent`,
   plus `bands`/`bandScale`/`bandBounds` from the loaded `policy.dials`), calls
   `computeVerdictEffects(verdict, state)` and `ceremonyEscalation(verdict, state)`, and **overwrites**
   the event's `effects` with the union of the computed *provisional* effects (+ the ceremony raise if
   any). This is the D19 discipline extended from `seq` to `effects`: the controller, not the caller,
   is the authority. An `atom-verdict` whose kind HALTs (`computeVerdictEffects` returns `{ok:false}`)
   is an unknown/illegal verdict → `append()` returns `{ok:false}` and writes nothing (§7.2 Totality,
   fail-closed).
3. **The permanent effects are recorded but not applied at verdict time (Decision 5).**

*Flagged, deliberate:* `append()` becoming graph-state-aware is a real widening of its responsibility
(today it validates + stamps + regens mirrors; it does not fold the graph). This is inherent to §2.4's
"inside the append path" ruling and is the load-bearing consequence of the pivotal call above. The
snapshot build is *read-only* (it reads the effort's canonical state via `deriveCurrent`, never a
lane's in-flight divergence, exactly as §2.4 requires) and is gated behind the `atom-verdict` branch,
so no existing event type pays for it.

## Decision 5 — two-phase effects: provisional at verdict, permanent at gate; the pending set is fold-derived

§7.2 pins two phases: **provisional** effects (reversible graph-state changes) land at verdict time;
**permanent** effects (retirement permanence, ratified births, tree reshapes, *any* shared-branch
mutation) land only at gate ratification. P7 wires this without any stored mutable state, keeping the
ledger self-sufficient (§2.4):

- At verdict time, `append()` stamps the **provisional** effects onto the `atom-verdict` event (Decision
  4) and records the **permanent** effects as a payload field `pendingPermanent` on the same event —
  *recorded, not applied*. Nothing folds `pendingPermanent` into the current graph yet.
- At a gate, the main session appends a **`ratification`** event (the type already exists in
  `EVENT_SCHEMAS`, with `validateDropsAndResolvesSeq`) whose payload references the ratified verdict
  seqs. `append()`, for a `ratification`, folds the referenced verdicts' `pendingPermanent` sets into
  the event's own `effects` (again code-computed). So "pending permanence" is **a fold over the ledger**
  — every `atom-verdict` whose seq has no consuming `ratification` above it — never a mutable
  side-table. `reconcile.mjs` computes it the same way (Decision 6), which is what lets the `starved`
  gate know what it must ratify.
- **The ceremony-escalation unwind (P5's flagged open edge, now wired).** A gate that **rejects** a
  permanent band raise appends a ratification whose effects are `unwindCeremonyEscalation(escEffect)`
  — the pure inverse P5 built and tested (clear the band back to `from`, disarm the armed checks).
  Because the provisional escalation only ever *armed* deeper checks (it disarmed nothing), the unwind
  restores the cone exactly (the apply-then-unwind = identity invariant P5 pinned). P7's job is only to
  *call* it on the reject path; the correctness was proven in P5.

*Flagged, contestable (minor):* recording `pendingPermanent` on the verdict event, rather than
re-deriving the permanent set fresh from `(verdict, state)` at ratification time, is a small
redundancy (the verdict payload is already on the event; the permanent effects are a pure function of
it). It is chosen because the graph `state` *at ratification* differs from the state *at verdict* (other
waves may have merged between), and the permanent set must reflect the state the verdict was judged
against — recording it at verdict time freezes that. A reviewer who prefers re-derivation must also
pin "against which state," and this design judges freezing-at-verdict the honest reading of "reversible
provisional / durable permanent."

## Decision 6 — the migration: retire the route, rebuild the projection over goals + cones — additive then subtractive

§12's named deliverable: *"`route.json` → `goals.json` + `policy.json`; `route.md` retires. The
`nextAction` / `selfCheckDirectives` projection rebuilds over goals and cones."* The reconcile wiring
map makes the whole live coupling **two imports in `reconcile.mjs` and one ≈200-line block**, because
downstream consumers read the directive grammar, not the route. So P7 does the migration in **five
safe steps, green after each** — the answer to the central scoping question:

1. **Build the goals/cones order deriver (additive).** A new pure helper (in `next-action.mjs`, beside
   the projection it feeds) computes the frontier order from `readGoals` + `servesEdges` cones +
   `readPolicy().weights` — the risk-first policy ordering §3 describes — producing the same
   `routeOrder: string[]` / `slices[]` **shape** `projectDirectives` already consumes. No live caller
   yet; `route.mjs` untouched. Suite green.
2. **Teach `reconcile.mjs` to select it (additive).** The Layer-2 block calls the new deriver **when
   `goals.json` is present**, and keeps the `readRoute` path as the fallback when it is not. Both paths
   feed the identical `state`/`context`. Every existing route test still passes (route path intact);
   new tests seed `goals.json` and assert the cone-derived order. Suite green.
3. **Extend `reconcile.mjs` to replay the effect sets (additive).** §12: *"`reconcile.mjs` extends to
   replay rewrite effect sets."* The block calls `foldAsLived` / `deriveCurrent` / `graphDivergence`
   (all already exported, P4) and surfaces the divergence as **retopology pressure** in the briefing
   notes (§2.4: "computed and surfaced … never silently absorbed"). Pure addition to the briefing;
   nothing removed. Suite green.
4. **Flip the default + migrate the tests.** Make goals/cones the primary path (route only when
   `goals.json` is absent *and* `route.json` present — the honest transition window), and rewrite the
   three route-coupled tests (`reconcile-next-action.test.mjs`, `next-action.test.mjs` fixtures) to
   seed `goals.json`/`policy.json`. Suite green.
5. **Delete `route.mjs` + `route.test.mjs` (subtractive, last).** Only now — when `reconcile.mjs` no
   longer imports `readRoute` and no test exercises it — remove the loader and its test. Update
   `route.json`'s `artifacts.md` entry to "retired; superseded by goals.json/policy.json." Suite green.

*Flagged, contestable:* step 4's "route only when goals absent" transition window could be dropped
entirely (§12's "re-genesis, not a rename" arguably licenses deleting the route path outright, since
no 2.x effort auto-migrates). This design keeps the window through steps 2–4 purely so the suite is
green *between tasks* — the plugin's own regression floor — and closes it at step 5. A reviewer who
wants a harder cut can collapse steps 4–5 into one; the cost is a single non-green intermediate commit,
which this design declines to pay.

## Decision 7 — the live progress view: extend the existing fold, no new machinery

§8 is explicit: *"The live visualizer needs no new machinery: it tails the ledger and applies
incrementally the fold recovery applies in batch."* The shipped progress fold
(`ledger.mjs → progress-map.mjs → progress-tree.mjs`, regenerated on `append` via the `--hook` path)
already renders `progress.{json,md}` from the ledger. P7's deliverable is to **teach that fold the 3.0
vocabulary**, not to build a second renderer:

- `progress-map.mjs`'s `EVENT_MAP` gains interpretations for the 3.0 atom-lifecycle events
  (`atom-chartered`, `atom-transitioned`, `atom-flag-set/cleared`), the `atom-verdict` rewrite, and
  the `phase-degenerated` record — each mapped to the existing inject/update/status/note tree ops, so
  a reviewer sees a phase that *ran-and-found-nothing* (§5.4) as a real node, and an atom's lifecycle
  state as its status.
- Progress is a **fold up the containment tree** (§8): the containment comes from `graph.mjs`'s
  `containmentTree` (event-sourced, per §8 "a node's path is a fold-derived property"), aggregated by
  id so a reshape renders as a rename, never a double-count.

*Flagged, deliberate (the vaguest §8 residue):* §8 also says progress is *"cost-weighted per
subeffort."* Cost weighting depends on the **budget denomination per atom class**, which §16 lists as
uncalibrated. So P7 pins the *lifecycle-state* fold (which is fully mechanical from the atom events)
and leaves the *cost weight* as an uncalibrated multiplier defaulting to 1 per atom — the honest
minimum, flagged, not invented. This mirrors P5's α: name the knob, ship it neutral.

## Decision 8 — `workflows/frontier-wave.workflow.js`: the replacement workflow

The new workflow follows the shipped substrate exactly (`CLAUDE.md` invariant 5, verified against the
five sibling workflows): a top-level async body with the injected globals, `export const meta` a pure
literal, inlined JSON-Schema `const`s per agent contract, a `guard()` budget membrane, prompt-builders
that pass artifact paths (agents do all I/O), and **no `fs`/`Date`/`Math.random`/`import`**. Its stage
sequence is §6's loop:

```
phase('Reconcile')  → reasonable:reconciler            → BRIEFING (goals/cones-based, Decision 6)
phase('Spec')       → deltas authored / re-spec'd; R4 + checkpoint-2 run HERE (§6)
phase('Pack')       → wave = pack(spec'd atoms by ACTUAL footprint)   (frontier.pack, Decision 2)
phase('Dispatch')   → per atom: blind tests, impl (+enrichment), adjudication, audit — role-minimal
phase('Collect')    → verdicts = collect(); for v: ledger.append(atom-verdict v)  (Decision 4)
phase('Merge')      → one --no-ff merge per atom, topological by actual needs among audited atoms
phase('Gate')       → return gateDue(events, state, policy)           (the 7-variant GATE_RESULT)
```

- It **produces and collects audited verdict payloads and appends them as `atom-verdict` events**; it
  never computes an effect set (Decision 4 — the append path does). This is the workflow's half of the
  pivotal call.
- It dispatches **role-minimally** (Decision 9): before each wave it calls
  `frontier.requiredRoles(wave, context)` and stands up only those roles.
- It **returns the typed `GATE_RESULT` and never blocks** — the main session fires the gate (§6, §9),
  exactly as the 2.x runner returned its union to the `vertical-slice-execution` skill. `blocked-human`
  is the variant the main session must block on in both modes.
- **Lane = atom, untouched.** The lane/journal/ledger accounting (`lane-provisioner`,
  `journal-writer`, `validateLaneBases`, the custody bijection) is reused verbatim; what changes is
  *which* roles get dispatched and that a warm worktree may be *reused* across same-component atoms
  (§6 "amortization is provisioning-level only") — never two atoms on one lane branch.

The old `vertical-slice-runner.workflow.js` is **deleted** in the same task that lands the replacement
(the `vertical-slice-execution` skill is repointed at the new workflow in Phase F docs). `test/
workflow-load.test.mjs` covers the new file automatically (it runs over all `workflows/*.workflow.js`);
new behavioral tests assert the seven-variant union via the same `new Function(...GLOBALS)` harness the
`vertical-slice-runner-*` tests use.

## Decision 9 — lazy, role-minimal provisioning (the micro-effort fast path)

§6's draft-five bullet, made mechanical. `frontier.requiredRoles(wave, context)` is a **pure** function
returning the set of roles a wave actually needs, computed from the same phase-degeneration predicates
P6c built (`ceremony.mjs`) applied to *role dispatch*:

- **Always present when their input is non-empty:** `implementer`, `blind-test-writer`, the per-atom
  `auditor`, and the fences — the categorical core a single-atom effort runs.
- **Brownfield-only:** `census` / `characterizer` are in the set **only** when `context.brownfield` and
  the input is non-empty (a real dep graph / legacy locus to scan).
- **`topologist` re-chartering:** in the set **only** when `rechartingDegenerates(context.amendmentBatch)`
  says `materialize` (an accumulated amendment batch exists).
- **`retro-synthesizer` cross-cone classification:** in the set **only** when
  `retroClassificationDegenerates(context.landedConeCount)` says `materialize` (the gate spans > 1
  landed cone).
- **`scaffolder`:** governed by `scaffoldMaterializes(...)` at the topology→scaffold boundary (§5.4) —
  the workflow degenerates it to a recorded `phase-degenerated` event when the predicate says so.

The **lane infrastructure is stood up on first need**, not at entry: a single-lane wave needs no
cross-lane custody machinery until a second lane exists (§6). The lane = atom accounting is **not**
touched — only its *infrastructure timing* defers. `requiredRoles` is pure and unit-tested; the
*dispatch* on its result (and the `phase-degenerated` append for a degenerated role) is the workflow's.

## Decision 10 — reuse Parts 1–6's surfaces; the genuinely new code is small

Every calculus P7 needs already exists as a pure export: `computeVerdictEffects` / `ceremonyEscalation`
/ `unwindCeremonyEscalation` / `routeRefutedPremise` (rewrite.mjs); `foldAsLived` / `deriveCurrent` /
`graphDivergence` / `servesEdges` / `containmentTree` (graph.mjs); `classify` + the three degeneration
predicates (ceremony.mjs); `readGoals` / `readPolicy` (goals/policy.mjs); `groupDisjoint` (footprint.mjs);
`redispatchBlock` (redispatch-guard.mjs, the checkpoint-2 guard §7.2). P7 **imports and wires** them.
The genuinely new code is: `frontier.mjs`'s `ready`/`pack`/`gateDue`/`requiredRoles` (thin over the
above), the `append()` verdict branch, the goals/cones order deriver, the `progress-map` EVENT_MAP
additions, and the new workflow body. No new graph algorithm; no third-party dependency (Law 1).

## Flagged gaps — real, named, un-owned (P7 does not invent a fix)

Following the P3/P4/P5 precedent of naming un-owned edges rather than papering over them:

- **The intention-citation grammar is still un-owned (inherited from P3, relied on by P5).**
  `routeRefutedPremise` routes an `intention`-layer premise to `intent-fork` → `blocked-human`, and P7
  *honors* that routing at the gate. But **nothing yet gives a premise a real `layer:'intention'`
  citation** — P3 flagged that citing `intention.md` from a premise "has no grammar yet," and P7 does
  not invent one. So the `blocked-human`/intent-fork path is *wired and testable with a synthetic
  intention-layer premise*, but has no live producer until the intention-citation grammar lands. This
  is the same honest half-state P4's `serves`/`informs` sat in — pinned, not fabricated.
- **Budget denomination + the R1 factor α (§16).** `frontier.mjs`'s budget handling and the R1
  repricing read symbolic / policy-supplied values; P7 computes no number.
- **Ceremony-dial calibration (§16, P6-flagged).** The classifier thresholds and band → cadence
  indices stay uncalibrated `policy.json` defaults. `gateDue` reads them; it does not tune them.
- **Progress cost-weighting (§8/§16).** Uncalibrated; the fold defaults to weight 1 per atom
  (Decision 7).
- **Brownfield chartering of *unknown* legacy behavior (§16).** P7 wires *when* census/characterizer
  run (Decision 9), but §16's open edge — how the census skeleton charters genuinely unknown legacy
  behavior — is **not** owned here; the lazy-dispatch predicate gates a capability whose *content* is
  still §16's.
- **Live-view event transport (§16).** File-tail is the dependency-free default (§8); P7 uses it and
  leaves richer transport optional.

## Version bump: NONE — P7 lands on the shared refactoring line

Per the roadmap's **2026-07-09 versioning decision** (roadmap §"Versioning — the remaining parts do
not bump"), P5–P8 are one continuous refactoring toward the live 3.0 methodology with no consumable
intermediate builds; **the plugin version stays `3.2.0`** and bumps exactly once, at the very end of
the generation (a **major** bump — the methodology going live is a breaking behavior change). P7 lands
its code + tests **without a `chore(release)` bump** — `.claude-plugin/plugin.json` and the two README
version strings stay `3.2.0`. This overrides, for P7 as for P5/P6, this repo's standing "every change
gets a version bump" rule; the plan therefore carries **no `version-bump-final-check` task**. The
roadmap status cell moves to **`Landed — merged (no bump, 3.2.0)`** when the code + tests merge — not
to a versioned "Landed — vX.Y.Z".

## Scope note — P7 is P6-split-sized; it is written as one plan by human instruction

**Honest assessment, stated loudly because the writing-plans scope check demands it:** P7 spans the
same *five-subsystem* breadth that led P6 to split into P6a–P6e (a new pure library, live-engine append
wiring, a migration touching three live files, a full workflow replacement, and a progress-view
extension), and it is the **highest-risk** part of the whole generation — the first that edits the
load-bearing 2.x engine rather than adding files beside it. By the mechanical rule P6 applied, this
*would* split. **The human has instructed that P7 run as one plan executed by one subsequent pass**, so
this design pins the whole part coherently and the plan sequences it into six internal phases (A–F),
each landing green, with the migration ordered additive-then-subtractive so the suite never breaks
between tasks. The single genuine human decision before execution is the pivotal call above (who
computes the effect set) — and, secondarily, whether to *execute* this one plan in staged waves
(strongly advised, given the size) or truly one pass. Both are called out to the human, not resolved
unilaterally.

## Self-review

- **No placeholders/TBDs.** Every decision has a concrete shape, including the flagged residues (α,
  ceremony calibration, progress cost-weight, the un-owned intention grammar, brownfield unknown-behavior
  chartering) and the one **pivotal** contestable call (append-path owns effect computation),
  foregrounded because the plan's whole shape hinges on it.
- **Grounding checked against shipped code, not prose:** the live `verdict`/`verifier-verdict`
  collision and the free `atom-verdict`/`phase-degenerated` names (read in `EVENT_SCHEMAS`); the narrow
  reconcile coupling (`readRoute`'s single importer, the directive-grammar downstream contract); the
  `graph.mjs` fold exports (`foldAsLived`/`deriveCurrent`/`graphDivergence`/`servesEdges`); the
  `ceremony.mjs` degeneration predicates' own "P7 wires" headers; the workflow substrate globals and
  purity rules — all read from the files.
- **Scope check:** P7 stays inside "wire the P1–P6 calculus into the live engine and replace the
  vertical-slice execution surface." No scout (P8); no numeric calibration (§16); no multi-writer
  journal / cone-concurrency change; no in-place 2.x converter (re-genesis, not rename).
- **Totality check:** the router (P5) and now the loop's `gateDue` both HALT on an unrecognized state
  (§7.2, generalized); the seven-variant `GATE_RESULT` is exhaustive and each variant's routing is
  pinned.
- **Migration-safety check:** the five-step additive-then-subtractive order keeps the plugin's own
  test suite green after every task; `route.mjs` is deleted only after nothing imports it; the
  directive grammar downstream consumers read is preserved throughout.
- **Open-edge check:** P5's flagged ceremony-escalation *unwind* is *called* on the gate-reject path
  here (Decision 5) — the open edge P5 proved is now wired, not re-opened.
