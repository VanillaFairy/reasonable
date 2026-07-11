# Architecture — Part 7: The Frontier Loop + Gates

Read the design doc first:
`docs/superpowers/specs/2026-07-11-reasonable-3.0-p7-frontier-design.md`. This file is the one-page
orientation; the design doc carries the full reasoning and the flagged calls.

## The one-sentence shape

Part 7 stops building pure libraries *alongside* the live 2.x engine and starts **wiring them into
it**: a new pure loop calculus (`lib/frontier.mjs`), the P5-deferred append-path wiring
(`computeVerdictEffects`/`ceremonyEscalation` hosted inside `append()` behind a new `atom-verdict`
event type), the 2.x→3.0 migration (retire `route.mjs`, rebuild the `nextAction` projection over
goals+cones), a replacement workflow (`frontier-wave`), and a progress-fold extension — landed
additive-then-subtractive so the plugin's own suite is green after every task.

## P7 is the terminus (the inverse of P5/P6)

P5 and P6 were **additive** parts that deferred their wiring to "whoever first has a live consumer,"
named as P7. **P7 is where those deferrals come due — there is no further part to defer to** (P8 is the
standalone scout, independent of the in-effort engine). So P7's pivotal question is not *"what do we
defer?"* but its inverse: ***"in what ORDER do we edit the load-bearing 2.x engine so the suite is
green after every task?"*** — answered by the five-step migration (§4 of `interfaces.md`).

## The pivotal call (STOP-gated) — the append path owns effect computation

§2.4 says the effect set is *"computed by `lib/rewrite.mjs` inside the ledger controller's append
path."* Read literally, `append()` — not the frontier loop — code-computes the effect set for an
`atom-verdict` (the no-model position that stamps `seq`). **This design takes §2.4 literally.** A
reviewer could argue the loop should compute and `append()` only validate (DRY: the loop already
assembles graph state); that reopens the exact attack §2.4 closes (an effect set computed *outside* the
controller is one a future non-controller caller could author). **If this call is reversed, Phase B's
tasks move into `lib/frontier.mjs` and `append()` shrinks to a validator — a different shape for ~⅓ of
the plan. Confirm before Phase B.** (Phase A does not depend on it.)

## The six internal phases (each lands green)

- **A — `lib/frontier.mjs` (pure):** `gateDue`/`GATE_RESULT` (T01), `ready`/`pack` (T02, + guarding
  `footprint.mjs`'s CLI and extracting `footprintsDisjoint` — correction 1 below), `requiredRoles`
  (T03). The P5/P6 pure-lib shape.
- **B — append-path wiring (STOP-gated):** the `atom-verdict` + `phase-degenerated` schemas and the
  `append()` verdict branch (T04); the two-phase `ratification` fold + ceremony unwind (T05).
- **C — the migration (additive→subtractive):** the goals/cones deriver (T06, additive); reconcile
  selects it + replays effect sets (T07, additive); flip the default + **delete `route.mjs`** (T08,
  subtractive last).
- **D — the workflow:** `frontier-wave.workflow.js`, **deleting** `vertical-slice-runner` (T09).
- **E — the live view:** the `progress-map` `EVENT_MAP` 3.0 additions (T10).
- **F — docs + final:** glossary/artifacts/skill repoint (T11); full-suite + roadmap cell, **no bump**
  (T12).

## Two grounding corrections this part carries (also pinned in `interfaces.md` §0)

The design doc's self-review claims both are shipped reuse; **they are not, as read** — the plan
corrects them, and they are named here so a reviewer weighs them:

1. **`footprint.groupDisjoint` does not exist — and `footprint.mjs`'s CLI body is unguarded (a latent
   bug, never yet triggered).** `lib/footprint.mjs` exports nothing; the only `groupDisjoint` is inlined
   in the shipped workflow. Worse: unlike `ledger.mjs` (`if (basename(process.argv[1]||'')===
   'ledger.mjs') runCli()`), `footprint.mjs`'s top-level code — including a bare `process.exit(1)` when
   no `.reasonable/` is found — runs unconditionally at module load. Nothing imports it today, so this
   has never fired; **P7 is the first thing that would trigger it.** **The real fix, not a workaround:**
   T02 wraps the existing CLI body in the same guarded `runCli()` shape `ledger.mjs` already
   established, THEN adds `footprintsDisjoint` as a real export (the extracted `independent()` algebra,
   boolean-returning). Only then does `frontier.pack` safely `import` it — DRY between the two `lib/`
   files that *can* share, once the import is safe.
2. **The workflow cannot import `lib/frontier.mjs`** (substrate forbids `import`). `frontier.mjs` is the
   tested source of truth; its `lib/` consumers import it; the **workflow inlines mirrors** of
   `pack`/`gateDue` (the repo's own `groupDisjoint` precedent). The design's "in-process caller"
   phrasing is the loose part.

Neither changes scope; both make P7 buildable exactly as sequenced.

**A third, smaller grounding gap (§2 of `interfaces.md`):** `policy.dials` (as landed by P6d) has no
`bandBounds` field, while `ceremonyEscalation`'s R2 trigger reads `state.bandBounds[coneId]`. T04 passes
`bandBounds: {}` — the honest empty default, under-firing (never over-firing) that one trigger until a
real per-cone bound lands. Named, not invented — the same discipline P4/P5/P6 used for their own flagged
un-owned edges.

## Design decisions (short list — see the design doc for each in full)

- **Effects are computed by the controller, recorded on the event.** Provisional effects are stamped on
  the `atom-verdict`; permanent effects ride as `pendingPermanent` (recorded, not applied) and fold in
  at a `ratification` gate. "Pending permanence" is a **fold over the ledger**, never a mutable
  side-table — same self-sufficiency as `seq`.
- **`gateDue` is total** (§7.2 Totality generalized): immediate-fire → batched/floor → `halt` on an
  unrecognized control state; a non-firing check returns the in-band `'none'` sentinel (keep looping),
  never a silent empty. `budget-exhausted` is the workflow's budget-guard outcome, not a `gateDue`
  return.
- **Reuse over reimplement.** Every calculus already exists as a pure export: `computeVerdictEffects` /
  `ceremonyEscalation` / `unwindCeremonyEscalation` (rewrite.mjs), `deriveCurrent` / `graphDivergence`
  / `servesEdges` / `containmentTree` (graph.mjs), `classify` + the three degeneration predicates
  (ceremony.mjs), `readGoals` / `readPolicy` (goals/policy.mjs). P7's genuinely new code is thin:
  `ready`/`pack`/`gateDue`/`requiredRoles`, the `append()` verdict branch, `deriveConeOrder`, the
  `EVENT_MAP` additions, and the workflow body.
- **Lane = atom, untouched** (§6). The lane/journal/ledger accounting is reused verbatim; only *which*
  roles dispatch and warm-worktree reuse across same-component atoms defer to first need.

## What this part is NOT (all deferred, all named in the design doc)

The scout (P8); numeric calibration (§16 — budget denomination, α, ceremony thresholds, band→cadence
indices — P7 reads the dials, invents no number); the multi-writer journal / cone-concurrency > 1; an
in-place 2.x→3.0 converter (§12: "re-genesis, not a rename" — P7 retires the route *code path* and
builds the goals/cones path; an existing effort re-genesises through the topology stage). The
un-owned **intention-citation grammar** (inherited from P3): `routeRefutedPremise` routes an
`intention`-layer premise to `intent-fork` → `blocked-human`, and P7 *honors* it, but there is still no
live producer of a `layer:'intention'` premise — the path is wired and testable with a synthetic
premise, not fabricated. Each is a flagged boundary, not a bug.

## Scope honesty — P7 is P6-split-sized, run as one plan by human instruction

P7 spans the same five-subsystem breadth that led P6 to split (a new pure library, live-engine append
wiring, a migration touching three live files, a full workflow replacement, a progress-view extension),
and it is the **highest-risk** part of the generation (the first that edits the load-bearing 2.x
engine). By the mechanical rule P6 applied, it *would* split. The human instructed **one plan executed
by one subsequent pass**; this plan sequences it into six phases, each green, with the migration
ordered additive-then-subtractive. **Strong advice: execute in phase-waves, reviewing at each phase
boundary — a phase boundary is a safe stopping point (suite green).** The single genuine human decision
before execution is the pivotal call above.
