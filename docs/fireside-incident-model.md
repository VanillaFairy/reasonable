# The Fireside incident, worked against the hardened methodology

This is a worked example, not a spec. It takes one real failure — a brownfield
characterization pass on the Fireside repo that halted on a false alarm — and walks it
through the hardened `reasonable` snapshot (branch `feat/verification-trio`) to show
exactly where each guard now catches, defers, or surfaces. Every claim below points at a
committed line you can open.

The point of the exercise: the original failure was a *false HALT*. A blunt byte-hash
check stopped an autonomous run over a change that was, in fact, completely safe. The
hardened methodology does not make the hash smarter — it puts the right judge in front of
it and demotes the hash to a backstop. That distinction is the whole story.

---

## 1. What happened

The setting: a brownfield, **autonomous**, analysis-time characterization corpus pass on
Fireside — the FastNote "external-watch + format-by-extension" effort. Brownfield means
the system already walks, so the characterization pass pins the observable behaviour of
the existing code as a parked baseline before any vertical slice runs (this is the corpus
pass described at `workflows/characterization.workflow.js:1`).

The floor baseline (`.reasonable/baseline.json`) held 234 FLOOR tests — pre-tested legacy
behaviour, held green as a regression containment fence (`lib/baseline.mjs:5`). Among
those 234 were two clusters that matter here:

- ~14 `fireside_app::hot_zones::*` tests whose locus reached into
  `crates/fireside-app/src/orchestration.rs`.
- 2 `fireside_settings_ui::ipc::*` tests whose locus reached into
  `crates/fireside-settings-ui/tests/single_instance_ipc_test.rs`.

The characterizer was dispatched **without a lane** — straight into the main checkout. It
appended parked `#[ignore]` characterization tests *into* `orchestration.rs`'s inline
`#[cfg(test)] mod tests` (+162 lines) and into the existing `single_instance_ipc_test.rs`
(+66 lines). Both are floor-tracked files, so their byte hashes changed.

It recorded 10 pins. Nine were **off-target** — hot_zones, tray, panel, single-instance:
behaviours orthogonal to the watch/format change. One was on-target (the FastNote store).

Then reconcile's floor-integrity pass ran. It re-hashed every pinned floor file, found 15
floor tests whose files no longer matched their captured hash, and — with no accounting
event to explain the change — classified them AMBIGUOUS and HALTed.

That HALT was a **false positive**. Every added test was `#[ignore]`-parked. Zero
production logic changed. The floor behaviour was completely intact. The byte-hash had
flagged a harmless additive pin as if it were a regression — because a byte-hash
*cannot tell the two apart*.

---

## 2. Why the old machinery let it through

Three failures stacked up, and each maps to a specific gap the hardened snapshot closes.

**A lane-less mutator.** The characterizer is a fenced mutator, but a fence only bites
when there is a lane descriptor to arm it. Run in the main checkout, the fence finds no
`.reasonable-lane.json` and no reachable effort root above it, so it **fails open and
allows the write** (`lib/fence.mjs:24` documents the fail-open boundary; `fence.mjs:182`
is the code path — `findLane` returns nothing, and with no effort root reachable the hook
exits 0). So the parked pins landed directly on floor-tracked files with nothing standing
between *proposed* and *integrated*.

**No adversary.** Nothing judged whether those 10 pins *belonged* before they were
written. There was no fresh-context check asking "is this in the baseline we promised to
capture? is it at the right seam? is this floor touch legitimate?" The pins were taken on
the characterizer's own say-so — a Third-Law violation (`DESIGN.md:73`: no actor grades
its own work).

**A byte-hash judging a non-decidable question.** The floor-integrity hash was wired as a
*first-line* AMBIGUOUS→HALT decision. But "did this floor file change in a way that
matters?" is not a question a byte-hash can answer — an appended `#[ignore]` pin and a
real regression produce the identical signal: *bytes differ*. Using a decidable tool to
settle a non-decidable question guarantees false positives. The methodology now names this
explicitly: such a check belongs in tier 3 (the backstop), never tier 1 (`DESIGN.md:183`).

---

## 3. How the hardened methodology responds

Five changes, walked in order. Each is a committed line a reader can open.

### Fix 1 — Provision a lane *before* any pin (close the fail-open window)

The characterization workflow now provisions a real worktree lane via the
`lane-provisioner` **before** the characterizer runs. The Provision phase births a
registered worktree + a `.reasonable-lane.json` descriptor + a journal record, in that
order, so the fence is armed and a pre-integration diff exists above the floor
(`workflows/characterization.workflow.js:614` is the Provision step; `:87` is the phase
description).

If the lane does not come up, the workflow **HALTs rather than pin lane-less** (the
`lanePrompt`/`PROVISION_ACK` refusal in `characterization.workflow.js`, "Refusing to pin
lane-less (D7)").

**The two-root correction (the lane-root fix).** An earlier snapshot scoped the characterizer
into the worktree by *narrowing the effort root onto it* — `laneScoped` overwriting `effortRoot`.
That was itself a second bug: the worktree's `.reasonable/` is gitignored and empty, so the fenced
worker bootstrapped a divergent parallel `.reasonable/`. The corrected model is **two roots, by
domain**: `laneScoped` now only *adds* a `laneRoot` and **never** touches `effortRoot`. The
characterizer writes its born clause + ledger line to the **canonical effort root** by absolute path,
and its parked test (code) under the **worktree**, committed with `git -C <worktree>`. Because a
canonical `.reasonable/` write's target is not under the lane descriptor, the fence governs it by the
worker's harness role (`roleOf(agent_type)` → the `governReasonable` matrix), not by an unreachable
descriptor; a *worktree-local* `.reasonable/` write is denied at the source (the §3b guard in
`fence.mjs`). See `docs/artifacts.md` (the two-root / identity-governance section).

With the lane in place, the fence's floor-containment rule (BF8) is live: a src edit that intersects
the floor without the lane declaring `floorImpact` is denied as a presumed regression (the BF8
floor-containment check in `fence.mjs`). The fail-open window the incident drove through is shut.

### Fix 2 — The adversary is risk-gated, and a floor touch always trips it

Because the pins touch floor-tracked files, the risk-gate fires and the intent-verifier
**always** runs on them. The gate is a pure function of *what the pin touches*, never how
much the run is trusted: `pinTouchesProtectedState` returns true when the scenario lists
floor tests, the pin reports a floor touch, or the pin enriched a shared contract
(`workflows/characterization.workflow.js:317`). The Intent-verify loop calls it at `:743`
and runs the adversary whenever it returns true.

This is risk-gating, not profile-flattery: `DESIGN.md:193` rules that the adversary runs
"always … where the work touches the floor or a shared contract," and `DESIGN.md:194`
puts the floor-touch trip-wire "off the dial entirely, non-waivable in all modes." Both
run modes, both supervision profiles — a floor touch is judged.

The judge itself is read-only by capability and judges the *proposed* pin against a
reference that sits **above** the artifact — the baseline-intent, never the legacy code it
pins (`agents/intent-verifier.md:34`, the "reference binds you" section;
`agents/intent-verifier.md:39` names the baseline-intent oracle for this spine). That is
the §4 corollary in force: an adversary proposes a verdict and never self-executes the act
it authorizes (`DESIGN.md:74`).

### Fix 3 — Status-quo-green default: the nine off-target pins are *kept*, not queued

Here is the move that keeps the autonomous run alive. The nine off-target pins are
orthogonal status-quo pins: the watch/format change neither restates nor moves hot_zones,
tray, panel, or single-instance behaviour. There is no `suspectedBug` flag and no tension
with the stated change. So the adversary **default-accepts** them.

The reasoning is that brownfield supplies the missing reference: the task says *change
what is stated, preserve the rest*, so "should we pin this behaviour green?" has a default
answer — **yes, keep it** — because *changing* unstated behaviour would itself be the
scope violation (`DESIGN.md:147`, the status-quo-green ruling). The intent-verifier
encodes this directly: "Default-accept the orthogonal status-quo pin … Inability to judge
absolute legacy-correctness is **not** a reason to escalate"
(`agents/intent-verifier.md:70`).

At result-assembly the workflow keeps an accepted, unflagged pin and does **not** push it
to the human: the escalation list is built only from positive conflict signals, and the
comment at `workflows/characterization.workflow.js:862` spells out that "an accepted pin
with NO suspectedBug is orthogonal and is NOT pushed here." The corpus ratifies with the
nine pins logged-and-kept — no human queue, no halt
(`workflows/characterization.workflow.js:882`, the `clean` ratification condition).

### Fix 4 — Annotate-not-disarm + demote: the 15-test HALT becomes a surfaced notice

The floor-integrity hash is demoted from a first-line HALT to a tier-3 backstop tripwire.
It still *fires and surfaces* every floor change — it no longer *halts* on its own.

In `lib/baseline.mjs`, the accept verdict is collected into a **separate** advisory set
(`explainIds`/`explainGlobs`), deliberately kept off the `ids`/`globs` that drive
`accounted` (`lib/baseline.mjs:214`, the `accountedLoci` function; the comment at `:209`
states the verdict "must NEVER feed `ids`/`globs`"). So `floorIntegrity` computes
`changed`/`ambiguous` *without* the verdict and only sets `explainedByVerdict` as an
annotation (`lib/baseline.mjs:187`). The diff still surfaces; the verdict merely explains
it.

In `lib/reconcile.mjs`, the floor pass is explicitly **not** in the AMBIGUOUS→HALT set
(`lib/reconcile.mjs:24`, the header note; `:188`, the floor pass labelled "a BACKSTOP
TRIPWIRE, not a HALT"). An accept verdict annotates the surfaced diff
"explained-by-verdict," advisory only (`lib/reconcile.mjs:203`).

For the incident this is the load-bearing flip: the old 15-test first-line HALT becomes a
surfaced, explained, non-blocking notice, and the autonomous run proceeds. The annotation
is non-waivable in the safe direction — an accept can only ever cause *more* human
surfacing, never less (`DESIGN.md:328`, the annotate-not-disarm ruling). A missing or
half-written verdict degrades toward scrutiny, not away from it.

### Fix 5 — D13 unexplained-breach STOP: the real regression is still caught

Demotion moved the floor gate *earlier* (to the pre-integration adversary); it did not
remove it. So if a floor-touching pin had **bypassed** the adversary — no accept verdict
explaining it — reconcile must still stop an unattended run on that surprise.

That is D13. In autonomous mode an unexplained breaking floor-integrity mismatch (a
surfaced diff that no accept verdict explains) is a fifth always-escalate class: it sets
`result.halt = true` and stops the loop (`lib/reconcile.mjs:262`, the `floorUnexplained`
count; `:263`, `floorBreachStop`; `:303`, `haltClass: 'floor-integrity-unexplained'`). An
*explained* diff is a non-blocking notice; an *unexplained* one halts. The characterization
workflow routes on the same signal (`workflows/characterization.workflow.js:587`,
`floorBreachStops`).

So the gate is still there — it moved from "halt on every byte change" to "halt only on a
byte change nothing judged." In the incident, every floor touch *was* judged and accepted,
so the run proceeds; a genuinely surprising regression that slipped past the adversary
would still STOP.

---

## 4. Honest limits

Two things this fix does **not** do. Stating them plainly is part of the model.

**The off-target probe scope is a quality matter, not closed here.** Nine of the ten pins
were unrelated to the watch/format effort — wasted work, the symptom of a deliberately
broad standing baseline. The safety fix makes those broad pins **harmless**: they are
accepted, annotated, kept, and they no longer trigger a false HALT. It does **not** narrow
the probe — the characterizer still pins the whole observable boundary it was pointed at.
Whether the corpus pass *should* have pinned nine orthogonal behaviours in the first place
is a separate question about probe scope and baseline breadth, and this change leaves it
open.

**The bug-pin axis stays the human's call.** The adversary certifies seam, scope,
floor-touch legitimacy, and consistency with the characterizer's own `suspectedBug` flag —
but it **explicitly disclaims** whether the pinned legacy behaviour is itself *correct*
(`agents/intent-verifier.md:62`: "You do NOT judge whether the legacy behaviour is
correct. There is no reference above the artifact for that"). The default-keep handling is
right *for orthogonal pins* precisely because preserve-as-is is the correct answer there.
But absolute legacy-correctness — "is this behaviour a bug we just froze?" — has no
reference above the artifact, so it stays with the human three-way classification at the
ratification gate (`DESIGN.md:167`, the intent-verifier scope limit). `suspectedBug` and
genuine tension with the stated change escalate the *relevant* pins; everything else is
the human's to ratify.

The bet is safe in both directions: where the fix could be wrong, the behaviour is
*relevant* and the tension signal catches it; where the question is truly unjudgeable, the
behaviour is *orthogonal* and keep-as-is is the correct answer — and because every pin is
logged, a bad bet surfaces downstream rather than disappearing.
