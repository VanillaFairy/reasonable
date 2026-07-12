# Design — Reasonable 3.0 Part 8: The Zero-Commit Scout (the pre-effort front-end)

**Status:** brainstormed non-interactively, same discipline as Parts 1–7. `reasonable` is a Claude
Code plugin, not an interactive service, so this pass plays the role brainstorming normally reaches
through dialogue — every genuinely contestable call is flagged explicitly below instead of silently
resolved. The human reviewing this (and the resulting plan) is the approval gate that would normally
have happened turn-by-turn.

**Unlike P7, no call here needs a human STOP before execution.** DESIGN-3.0 §17 already settled the
one call that could have been pivotal — *is the scout law-free by exemption or by construction?* — in
favor of **by construction** ("outside an effort the hooks already fail open (D2), so a scout is
law-free by construction, not by exemption"). This design's job is to translate that ruling into
concrete file-level mechanics, name the calls it made, and justify them — the same posture P4/P5's
design docs took for their own pivotal calls. The four calls below are named and justified, not
deferred to a check-in; a reviewer may still overturn any of them, but none blocks the plan the way
P7's append-path call blocked its Phase B.

## What this covers

Part 8 of the `reasonable` 3.0 roadmap
(`docs/superpowers/plans/2026-07-08-reasonable-3.0-roadmap.md`): the **zero-commit scout** — the
spike-runner's quarantine machinery made **launchable standalone, before any `.reasonable/` state
exists**, as the sanctioned pre-effort exploration surface the methodology currently lacks (today the
only exploration surface, the spike, is a route item *inside* a committed effort, so a run must pay
analysis-entry before it can explore at all). Per `docs/DESIGN-3.0.md` §17 it delivers:

- **`skills/scout/SKILL.md`** (new) — a standalone, user-invocable skill that runs a scout and does
  **not** enter an effort or write any `.reasonable/` state (the closest existing precedent is
  `skills/tdd-audit/SKILL.md`, a diagnostic that is likewise standalone and effort-free);
- **`workflows/scout.workflow.js`** (new) — the scout workflow, modeled on `spike.workflow.js`
  **minus the lane-provisioner / ledger / journal steps** that only make sense inside an effort;
- **`lib/scout-seed.mjs`** (new, pure) — the **genesis-seed grammar**: a shape validator that
  mechanically enforces the seed's draft charters are **structure only** (the direct answer to §15's
  open edge (d) — see [The seed and open edge (d)](#the-seed-and-open-edge-d));
- **the seed → genesis wiring** — a small, additive clause in `agents/topologist.md` naming the seed
  as an **advisory genesis input** the topologist consumes (like the brownfield frontier inventory),
  under the structure-only law (§13);
- **normative vocabulary** — `docs/glossary.md` gains **Scout** and **Genesis seed**; `docs/artifacts.md`
  pins the on-disk shape of the scout report (prose) and the machine-parsed `seed.json` (`*`).

The scout **precedes** the sizing classifier (§5.4) rather than being sized by it, and hands off to
the spine the moment shape stabilizes. Its deliverable is a knowledge artifact — a shape sketch, a
feasibility verdict, a candidate decomposition — and on convergence it **seeds the genesis graph** so
analysis starts warm instead of cold. The quarantine membrane is unchanged: scout code never reaches
mainline; re-entry is always **rewrite-from-knowledge, never refactor-from-scout** (D2).

Parts 1–7 shipped real, inspectable ground truth this doc reads directly rather than re-deriving from
prose (every reference below was read from the file, not assumed):

- **`agents/spike-runner.md`** — the existing spike-runner constitution (`tools: Read, Edit, Write,
  Bash, Grep, Glob`). Its core competency is *exactly* a scout's: answer one falsifiable question with
  evidence inside a **law-free, disposable** workspace, deliver a **knowledge artifact**, curate
  evidence vs. accident, re-enter only as rewrite-from-knowledge. Its **one** effort-coupled section is
  *"Report your progress as you go,"* which hard-codes `node lib/ledger.mjs append --root <effortRoot> …`
  — meaningless for a scout (there is no ledger, no `effortRoot`). See [Call 2](#call-2--reuse-the-spike-runner-verbatim-scoped-by-the-dispatch-prompt).
- **`workflows/spike.workflow.js`** — the in-effort spike orchestration. It runs **two** phases:
  `lane-provisioner` (which does `git worktree add` nested under the effort root and writes the
  `.reasonable-lane.json` descriptor with `quarantineOnly:true` + `quarantineRoot`), then `spike-runner`.
  The scout workflow is this file **minus phase 1 entirely** — no worktree, no descriptor, no journal
  record, because there is no effort to nest under.
- **`lib/fence.mjs`** — the PreToolUse fence. Its `categorical()` function (branch 2, the
  `lane.quarantineOnly` block, ~lines 247–257) is what path-fences the *in-effort* spike to its
  `quarantineRoot`. That branch only ever runs when a `.reasonable-lane.json` descriptor is found on the
  ancestry (`lib/effort.mjs`'s `findLane` walks **up** the tree). See [Call 1](#call-1--the-scouts-quarantine-is-a-workspace-convention-not-a-hook-fence).
- **`lib/effort.mjs`** — `findEffortRoot(start)` / `findLane(start)` both walk **up** from the target
  path looking for a `.reasonable/` / `.reasonable-lane.json` marker on disk. A scout in a temp
  directory with neither in its ancestry resolves both to `null`.
- **`lib/atom.mjs`** (P3) — `charterAtom(effortRoot, charter)` validates a charter's five fields:
  `component` (matches `COMPONENT_RE`), `premises` (each a well-formed `goal:|gate:|cite:|ledger:`
  reference), `purpose` (non-empty string), `locus` (array), `order` (non-negative integer). This is
  the **exact** field grammar the seed's draft charters reuse (Call 3 extracts it as a shared export).
- **`agents/topologist.md`** (P6e) — the genesis planner. It reads the grilled goals, the intention,
  and (brownfield) the census skeleton, and **proposes** the five §5.1 outputs (never persisting them —
  `Read, Grep, Glob` only). *"A charter is STRUCTURE ONLY — never a Delta, never a behavioral must
  (§13)."* The seed becomes one more advisory input it critiques (Call 3).
- **`lib/policy.mjs` / `lib/goals.mjs`** (P6d) — the pure loader shape `lib/scout-seed.mjs` mirrors:
  absent → `{null, null}`; malformed → `{null, diagnostic}`; valid → `{parsed, null}`. Validate
  **shape**, never **value**. Both gate their CLI body; `scout-seed.mjs` copies that (avoiding
  `footprint.mjs`'s unguarded-CLI latent bug P7 had to fix).

**Explicitly out of scope** (deferred, same discipline as Parts 1–7):

- **Any change to `lib/fence.mjs`.** The scout is law-free *by construction*, not by a fence branch —
  see Call 1. Adding a "scout mode" to the fence is a **forbidden move**, not a deferral: it would
  violate `CLAUDE.md` invariant #2 and contradict §17's own framing.
- **Auto-promoting the seed into `.reasonable/` state.** The scout writes **no** `.reasonable/`. The
  seed is a *pre-effort input* the human carries into `reasonable:develop`; it becomes ratified
  `goals.json`/`policy.json` only through the normal human-gated genesis gate (§3), never automatically.
- **A converged/multi-scout session manager, resumable scout state, or a scout ledger.** A scout is a
  single timeboxed exploration returning a structured verdict — the spike's shape, standalone. Anything
  richer is a later capability, not P8.
- **Numeric calibration (§16).** The scout's timebox/budget are caller-supplied symbolic values;
  P8 invents no number, the same posture P5/P6/P7 held.

## The central fact this design turns on — READ FIRST

**A scout runs where no `.reasonable/` exists, so every hook fails open (`CLAUDE.md` invariant #2),
which means there is no hook-level path-fence protecting anything — and that is the design, not a
gap.** The in-effort spike's containment is *not* in the spike-runner's constitution; it is in the
`.reasonable-lane.json` descriptor (`quarantineOnly:true` + `quarantineRoot`) that `lib/fence.mjs`'s
`categorical()` reads. A scout has no such descriptor and no `.reasonable/` in its ancestry, so
`lib/effort.mjs`'s `findLane` / `findEffortRoot` both return `null`, and the fence allows every write.

§17 concedes this in as many words — *"outside an effort the hooks already fail open (D2), so a scout
is law-free by construction, not by exemption."* So the load-bearing consequence for P8 is a
**prohibition**, not a feature to build: **P8 must NOT invent any `lib/fence.mjs` enforcement for the
scout.** The scout's "quarantine" degrades from a *capability* fence (in-effort) to a *workspace
convention* (standalone) — the same category of protection as a read-only proposer that carries write
tools at the harness level but is constitutionally scoped ("you propose, you never persist"). This is
the honest reading of §17, and Call 1 names it as a forbidden move so no later maintainer "fixes" it
back into a contradiction.

## Call 1 — the scout's quarantine is a workspace convention, not a hook fence

**Decision: P8 adds no `lib/fence.mjs` logic. The scout's containment is (a) a disposable workspace
outside any `.reasonable/` ancestry + (b) the spike-runner's constitutional + dispatch-prompt scoping
to that workspace.** Nothing hook-enforced.

- **Why not a fence branch.** A scout mode in `fence.mjs` would need the fence to *fire* outside an
  effort — the exact thing invariant #2 forbids ("no `.reasonable/` reachable ⇒ allow everything;
  installing the plugin never breaks an ordinary session"). It would also contradict §17's "by
  construction, not by exemption": an *exemption* is a fence branch that says "allow this"; §17 says the
  scout needs none because the fence never fires there at all. Building the branch would re-introduce the
  very coupling §17 removed.
- **What the containment actually is.** The scout-runner (the spike-runner, Call 2) is *told* — by its
  constitution ("You write only inside the quarantine") and by the dispatch prompt (which names the
  workspace path and says "everything you write goes under it") — to confine writes to the disposable
  workspace. It *could* technically write elsewhere (it has Bash/Edit/Write and no fence stops it); it is
  scoped by discipline, exactly as the topologist is scoped to "propose, never persist" despite the main
  session being able to persist on its behalf. This is `capability beats discipline`'s honest limit: where
  no capability fence is *available* (invariant #2 forecloses it), the design says so plainly rather than
  pretending a prompt is a fence.
- **The forbidden move, named** (the plan and the scout skill both carry it): *"add a scout branch to
  `lib/fence.mjs`"* → **No.** The scout is law-free by construction; a fence special-case violates
  invariant #2 and contradicts §17.

## Call 2 — reuse the spike-runner verbatim, scoped by the dispatch prompt

**Decision: reuse `agents/spike-runner.md` UNMODIFIED. The scout workflow dispatches it with a prompt
that passes no `effortRoot`, names the disposable workspace, and states explicitly that this is a scout
dispatch — no effort, no ledger — so the constitution's "Report your progress as you go" section does
not apply; progress is reported only in the returned structured output.**

Three reasons, in priority order:

1. **Preserving the audited allowlist byte-for-byte is the strongest reason not to touch the file.**
   `CLAUDE.md` warns explicitly: *"Preserve these allowlists when editing agent definitions; weakening
   one silently breaks an adversarial separation."* The spike-runner is a fenced mutator whose in-effort
   containment depends on its exact `Read, Edit, Write, Bash, Grep, Glob` allowlist. Not editing the file
   is the capability-safe choice — it makes it *impossible* for P8 to regress the spike caller.
2. **The ledger section is vacuous for a scout, not false.** It says *"every ledger fact you record goes
   through the controller … `--root <effortRoot>`."* A scout records **zero** ledger facts and has **no**
   `effortRoot`, so the rule is satisfied vacuously (there is nothing to route). The dispatch prompt makes
   that explicit rather than leaving the model to infer it. Verbatim reuse therefore asserts nothing false
   for the scout — it inherits a section whose precondition (ledger facts + effortRoot) is simply absent.
3. **Dispatch-prompt scoping of this exact constitution is already the established pattern.**
   `spike.workflow.js`'s own prompt re-states and constrains large parts of the spike-runner constitution
   inline (the quarantine, curate-evidence-not-accident, the mandatory expiry). The scout prompt does the
   same, minus the effort-coupled parts.

**Flagged as contestable (minor, non-blocking).** A reviewer who dislikes a constitution carrying a
section that is dead text for one of its two callers can make the alternative clean move: a **one-section
conditional edit** to `spike-runner.md` — *"if you were dispatched inside an effort with an `effortRoot`,
report via the ledger controller; a scout dispatch has none, so skip all ledger-report calls."* That is
also correct and slightly more honest; it is **deferred, not chosen now**, precisely to keep the audited
allowlist frozen (reason 1). If the human prefers it, it is a two-line change with no downstream effect.
This is named the way P4/P5 named their own contestable proportionality calls — a real fork, resolved
with a reason, reversible.

## Call 3 — the seed is a strict subset of the charter schema, shape-validated structure-only

**Decision: the genesis seed's draft charters carry EXACTLY the charter fields
`{component, premises, purpose, locus, order}` and nothing else, validated by the *same* field grammar
real charters use (a `validateCharterShape` export extracted additively from `lib/atom.mjs`).
`lib/scout-seed.mjs` additionally rejects any draft charter carrying a Delta/clause/behavioral field —
the mechanical structure-only fence. This is the direct answer to open edge (d) (next section).**

The on-disk deliverable is **two files**, mirroring the repo's own prose+machine-twin pattern
(`route.md`+`route.json`, `vision.md`+`goals.json`):

- **the scout report** — a markdown **knowledge artifact** (`question / method / evidence / verdict /
  confidence / expiry`, the spike's mandatory format, plus a human-readable candidate-shape narrative).
  Prose; read by the human and the vision grill; **never machine-parsed → not `*`.**
- **`seed.json`** — the machine-parsed **genesis seed**, present **only on convergence**:
  ```json
  {
    "goalsSketch":  [ { "id": "gs-1", "scenario": "a user can …", "notes": "optional prose" } ],
    "draftCharters": [
      { "component": "auth", "premises": ["goal:gs-1"], "purpose": "issues + checks session tokens",
        "locus": ["src/auth/**"], "order": 0 }
    ]
  }
  ```
  Parsed and shape-validated by `lib/scout-seed.mjs` → **`*` (load-bearing grammar).**

`goalsSketch` is deliberately weaker than `goals.json`: candidate scenarios with no `scenarioCitations`
(there are no clauses yet to cite pre-effort). It is **raw material for the vision grill**, not a
ratified goal set — the human and the grill sharpen it into `goals.json` at genesis.

`lib/scout-seed.mjs` (pure, dependency-free, mirroring `lib/policy.mjs`):
- `readSeed(seedPath) → { seed, diagnostic }` — absent → `{null, null}`; malformed JSON → `{null,
  diagnostic}`; valid → `{parsed, null}` (verbatim; never a repair).
- `validateSeedShape(parsed) → { ok, errors }` — the structure-only fence: `goalsSketch` an array of
  `{id, scenario, notes?}`; `draftCharters` an array where **each entry has ONLY the five allowed keys**
  (any extra key — `clauses`, `delta`, `musts`, `behavior`, `assert`, … — is a hard reject) and each of
  the five passes `validateCharterShape` (the shared atom.mjs rules).
- A guarded CLI (`node lib/scout-seed.mjs --validate <path>`, gated behind
  `basename(process.argv[1]) === 'scout-seed.mjs'`) → exit 0 valid / 1 invalid, printing the diagnostic.
  This is the command the scout skill runs at harvest.

Why extract `validateCharterShape` from `atom.mjs` rather than re-declare the regexes in
`scout-seed.mjs`: the design claim is *"the seed IS charter-shaped."* Sharing the one validator makes
that claim true **by construction** — the seed can never drift from the real charter grammar. The
extraction is additive (P4's precedent: *"one small, backward-compatible export addition to the
already-shipped `lib/atom.mjs`"*); `charterAtom` keeps its signature and delegates its field-validation
half to the new export, so every existing atom test stays green.

## The seed and open edge (d)

§15's draft-five open edge (d): *"whether the scout's seed into the genesis graph can smuggle
behavioral prediction past the 'structure only' law (§13) — the seed must be charter-shaped, and nothing
yet mechanically enforces that."*

**P8 answers (d) at three layers — mechanically where the question is decidable, by the existing
membrane where it is not — and names the one residual precisely, rather than deferring the whole edge:**

1. **Mechanical shape fence (decidable, `lib/scout-seed.mjs`).** A draft charter has **no slot** for a
   behavioral must — the schema is `{component, premises, purpose, locus, order}`, none of which is a
   Delta or a clause. `validateSeedShape` rejects any draft charter that carries a field outside those
   five, and validates the five with the exact charter grammar. This is a real capability fence (a shape
   check, decidable — a *fence*, not a judgment, by the glossary's three-condition selectivity), and it is
   run by the **scout skill** (the trusted control plane) at harvest — **not** by the scout-runner grading
   its own output. A seed that fails is **withheld** from any genesis; the report is still presented.
2. **The residual, named honestly.** The one thing the shape fence *cannot* catch is a behavioral must
   smuggled into the free-prose `purpose` string (e.g. `"purpose": "MUST reject expired tokens"`). But
   this is **identical** to the residual §13 already carries for *real* charters — `purpose` is
   "non-normative prose (a one-liner)" for real charters too, and no mechanical predicate reads a prose
   string and decides "this is a behavioral must." **P8 opens no new hole; it inherits §13's exact
   boundary.** The seed is no weaker than the charter grammar it mirrors.
3. **The membrane + gate that already catch the residual.** Even the prose residual is caught by the
   same two backstops §13 relies on for real charters:
   - **The topologist consumes the seed as ADVISORY input — a proposal to critique, never a spec to
     transcribe.** Call 3's `agents/topologist.md` clause states that the structure-only law applies to
     the seed exactly as to the topologist's own charters; a seed draft-charter carrying a behavioral must
     is invalid, and the topologist drops it and re-derives structure. This is the same discipline the
     topologist already applies to the brownfield frontier inventory (advisory, confers no trust).
   - **The seed can never auto-become policy.** `goals.json` / `policy.json` are vision-class, human-gated
     in both run modes (§3). The human ratifies at the genesis gate regardless of the seed. A behavioral
     must that survived layers 1–2 still cannot enter a ratified charter without the human, who is the
     control plane §13 ultimately rests on.

So P8 converts (d) from *"nothing yet mechanically enforces that"* to *"the seed's draft-charter shape is
mechanically shape-validated structure-only against the real charter grammar, with the same
non-normative-`purpose` residual §13 already carries, backstopped by the topologist's structure-only
membrane and the human genesis gate."* This is a genuine answer plus a named residual — the P3/P4/P5
discipline of naming un-owned edges rather than papering over them, applied to the edge §17 flagged at us.

## Call 4 — the workspace lives outside any target repo (a fresh temp directory)

**Decision: the scout's disposable workspace is a fresh temporary directory created OUTSIDE any target
repo (the OS temp dir by default; a caller may supply an explicit scratch path), NOT a gitignored
subdirectory inside a target repo.** The scout skill resolves/creates it (via Bash `mktemp -d`) and
passes it to the workflow as `workspaceRoot`; the scout-runner is told all writes go under it.

Three reasons:

1. **The scout is greenfield shape-discovery — there may be no target repo yet.** §17's regime is *"what
   is the right decomposition / API / target?"* — often asked before a repo exists. Tying the workspace to
   a target repo is wrong for the common case.
2. **A plain temp dir is UNCONDITIONALLY law-free; an in-repo subdir is only accidentally so.** If the
   workspace were a subdir of a target repo that happens to sit under a `.reasonable-efforts/` tree, or
   that has a `.reasonable/` anywhere up its ancestry, then `findEffortRoot`/`findLane` would resolve
   non-null and the fence would suddenly **bind** — coupling the scout's law-free-ness to an accident of
   directory placement. A temp dir with no `.reasonable/` ancestor is law-free every time, which is exactly
   the "by construction" §17 promised.
3. **It keeps disposable scout code from ever polluting a real repo's working tree or git state.** The
   scout hacks freely and is discarded; a temp dir is thrown away with no trace on any real repo.

**Reads are unaffected.** If a scout wants to read an existing repo for brownfield context (§17: "reasonable
can adopt code the scout — or any external front-end — produced"), reads are always fine (fail-open); only
the disposable **write** workspace is the temp dir. This mirrors the brownfield census handoff from the
other direction, exactly as §17 describes.

## Module layout

Small, per the roadmap's own "genuinely new capability, its own part" framing — P8 is the smallest part
in the generation:

- **`lib/scout-seed.mjs` (new, pure)** — `readSeed`, `validateSeedShape`, a guarded CLI. Dependency-free
  (Law 1); imports `validateCharterShape` from `atom.mjs`.
- **`lib/atom.mjs` (extend, additive)** — extract `validateCharterShape(charter) → {ok, error}`;
  `charterAtom` delegates to it. Backward-compatible; existing tests stay green.
- **`workflows/scout.workflow.js` (new)** — the scout workflow (one `Run scout` phase). Pure substrate
  (no `fs`/`Date`/`Math.random`/`import`); `export const meta` a pure literal; inlined schema `const`s;
  a `guard()` budget membrane — the shipped `spike.workflow.js` shape, minus phase 1.
- **`skills/scout/SKILL.md` (new)** — the standalone skill (the `tdd-audit` precedent).
- **`agents/topologist.md` (extend, additive)** — the advisory-seed inputs clause. No allowlist change.
- **`agents/spike-runner.md`** — **unchanged** (Call 2).
- **`docs/glossary.md` / `docs/artifacts.md` (extend)** — new terms + the `seed.json` `*` entry.

No new CLI beyond `scout-seed.mjs`'s `--validate`. No change to any live-engine file
(`ledger.mjs`/`reconcile.mjs`/`next-action.mjs`/`fence.mjs`) — unlike P7, P8 touches **nothing**
load-bearing in the in-effort engine, which is why it can follow P6 independently of P7.

## The scout workflow — spike.workflow.js minus the effort

```
phase('Run scout') → reasonable:spike-runner (cwd = workspaceRoot; NO effortRoot, NO ledger)
                   → SCOUT_RESULT { question, method, evidence, verdict, confidence, expiry,
                                    reportPath, seedPath?, timeboxExpired }
```

- **No `Provision quarantine` phase.** The spike workflow's phase 1 (`lane-provisioner` → worktree +
  `.reasonable-lane.json`) is **deleted**: there is no effort to nest a worktree under and no descriptor
  to write. The skill creates the plain temp workspace before launch (Call 4).
- **`verdict ∈ converged | infeasible | inconclusive.`** `converged` carries a `seedPath`;
  `infeasible` (a successful "no" — the direction/target is learned-closed) and `inconclusive` (timebox
  expired) carry none. "No" is a successful scout outcome, exactly as for a spike.
- **Typed return union (mirrors `spike.workflow.js`):** `result` (the verdict + report + optional seed) |
  `budget-exhausted` (the `guard()` ceiling) | `blocked` (the scout-runner returned null). The skill
  branches on `verdict.verdict` and `verdict.seedPath`.
- **The dispatch prompt** re-states the law-free-workspace rule, names `workspaceRoot`, states "no effort,
  no ledger, no `effortRoot` — narrate progress in your return only," and instructs: on convergence write
  the scout report **and** `seed.json` (structure only — the five charter fields, no clauses, no
  behavioral musts) under the workspace; otherwise omit the seed.

## Flagged gaps — real, named, un-owned (P8 does not invent a fix)

Following the P3–P7 precedent of naming un-owned edges rather than papering over them:

- **The non-normative-`purpose` residual of open edge (d)** (above) — inherited from §13, not opened by
  P8; backstopped by the topologist membrane + the human genesis gate, not by a mechanical predicate.
- **The seed → vision-grill wiring is a documented handoff, not a mechanized pipeline.** P8 shape-validates
  the seed and names it as an advisory topologist input; it does **not** auto-feed `goalsSketch` into the
  analysis grill or auto-draft `goals.json`. That crossing is a human act at genesis (the seed is a
  pre-effort input the human carries into `reasonable:develop`), which is the correct membrane — the seed
  is a sketch, and a sketch that auto-promoted would be exactly the behavioral-prediction smuggling (d)
  warns against. Named as deliberate, not a shortfall.
- **The intention-citation grammar is still un-owned (inherited from P3).** A draft charter's premises use
  the `goal:|gate:|cite:|ledger:` grammar; citing `intention.md` by id has no tag yet (there is no
  intention pre-effort anyway). P8 neither needs nor invents it.
- **Numeric calibration (§16).** The scout's timebox/budget are caller-supplied symbolic values; P8
  computes no number.

## Version bump: NONE — P8 lands on the shared refactoring line

Per the roadmap's **2026-07-09 versioning decision** (roadmap §"Versioning — the remaining parts do not
bump"), P5–P8 are one continuous refactoring toward the live 3.0 methodology with no consumable
intermediate builds; **the plugin version stays `3.2.0`** and bumps exactly once, at the very end of the
generation (a **major** bump). P8 lands its code + tests **without a `chore(release)` bump** —
`.claude-plugin/plugin.json` and the two README version strings stay `3.2.0`. This overrides, for P8 as
for P5/P6/P7, this repo's standing "every change gets a version bump" rule; the plan therefore carries
**no `version-bump-final-check` task**. The roadmap status cell moves to **`Landed — merged (no bump,
3.2.0)`** when the code + tests merge — not to a versioned "Landed — vX.Y.Z".

## Scope check — P8 is genuinely small and single-subsystem

Unlike P7 (five subsystems, highest risk), P8 is the smallest part in the generation: one new pure lib
(`scout-seed.mjs`), one new workflow, one new skill, two small additive doc/agent clauses, and glossary
+ artifacts entries. It touches **no** live-engine file. It reuses the spike-runner and the (absent-here)
quarantine machinery per §17. There is no case for a sub-split. It follows P6 independently of P7 (the
seed shape depends on P6's charter grammar; nothing here touches P7's frontier loop).

## Self-review

- **No placeholders/TBDs.** Every call has a concrete shape (the `seed.json` schema, the
  `validateSeedShape` rules, the workflow phase list, the skill's forbidden-move table), including the
  named residual (non-normative `purpose`) and the four flagged calls.
- **Grounding checked against shipped code, not prose:** the spike-runner allowlist + its one
  effort-coupled section (read in `agents/spike-runner.md`); the spike workflow's two phases (read in
  `spike.workflow.js`); the fence's `quarantineOnly` branch + that it only fires on a found descriptor
  (`fence.mjs` `categorical()`); `findLane`/`findEffortRoot`'s up-walk (`effort.mjs`); the charter's five
  fields + their validation (`charterAtom` in `atom.mjs`); the loader shape + guarded CLI (`policy.mjs`);
  the standalone-effort-free skill precedent (`tdd-audit/SKILL.md`).
- **Scope check:** P8 stays inside "the standalone scout that writes no `.reasonable/` and seeds the
  genesis graph." No fence change; no auto-promotion of the seed; no live-engine edit; no scout session
  manager.
- **Open-edge check:** (d) is **answered**, not merely wired — a mechanical shape fence for the decidable
  part, the topologist membrane + human gate for the residual, and the one thing left open
  (non-normative `purpose`) is named as inherited-from-§13, no wider than the charter grammar itself.
- **Invariant check:** `lib/` stays dependency-free (Law 1); no `fence.mjs` change (invariant #2 — the
  scout is law-free by construction, and Call 1 forbids a fence branch); the audited spike-runner allowlist
  is preserved byte-for-byte (Call 2); the `seed.json` machine grammar gets its `*` and its parser together
  (invariant #3); no version bump (roadmap decision).
