# Design: `tdd-audit` — a mechanically-confirmed test-honesty diagnostic for `reasonable`

**Date:** 2026-06-27
**Status:** Approved design, pending implementation plan
**Scope:** one new user-invocable skill in the `reasonable` plugin, its workflow, one new
read-only agent, one canonical rubric, and a small additive `lib/` change — plus a targeted
consolidation that makes the rubric and the reverse-discriminator a single source of truth
across the plugin.

---

## Why this exists

The user keeps a strict, mechanically-enforced flavour of TDD. Today that policy is real but
*operationally distributed* across the methodology — `blind-test-writer` (capability-enforced
blind authoring), `discriminator.mjs` (red-first proof), the `adjudicator` (don't iterate to
green), `mutation-sample.mjs` (teeth), `citation-resolve.mjs` (bidirectional mapping), and the
brownfield `census` / `characterizer` pair. Nothing *names* the policy as a reusable artifact,
and none of it can be pointed at an arbitrary brownfield repo to ask "is this suite honest, and
does it have teeth?"

Separately, the user has a standalone `tdd-audit` command (currently at
`~/.claude/commands/tdd-audit.md`) that does a thorough *model-judgment* audit — coverage,
integration, runner health, stale tests, quality, and a honesty rubric — but stops at "the model
*thinks* this test is sycophantic." It has no mechanical confirmation, and it duplicates the
honesty rubric that also lives in vf-superpowers' `adversarial-tdd`.

This work folds that command **into** the `reasonable` plugin at full capability and upgrades it
with the plugin's mechanical teeth: the honesty verdict stops being a model opinion and becomes a
*proof* ("this flagged test still passes when its own code is broken → confirmed vacuous"). The
old command is then deprecated by the user.

## Resolved decisions

| Fork | Decision |
|---|---|
| **Run context** | One skill, homed in `reasonable`. Standalone-first (runs on any repo, no `.reasonable/` required), effort-aware (extra checks light up when an effort is present). Fail-open outside an effort, like the plugin's hooks. |
| **Orchestration** | A `workflows/tdd-audit.workflow.js` script — deterministic fan-out, resumable, model judgment confined to agent nodes. Matches the plugin's "orchestration is code, judgment lives inside nodes" design. |
| **Scope** | Full re-home of the existing audit (coverage / integration / runner / stale / quality / honesty / correctness flags / monorepo) **plus** an always-on mechanical confirm pass. No capability regression when the old command retires. |
| **Teeth engine** | Per-test **reverse-discriminator** — mutate the flagged test's locus, check whether *that* test goes red. Precise per-flag confirmation, cost bounded by the number of flags. Reuses the reverse logic the characterizer already relies on. |
| **Consolidation** | Make the honesty rubric the one canonical copy inside `reasonable`, cited by tdd-audit **and** the effort's `intent-verifier` + `auditor`; make the reverse-discriminator entrypoint effort-optional so the `characterizer` and tdd-audit share one code path. |

## Identity & placement

A new **diagnostic** skill — a category the plugin doesn't have yet, distinct from the existing
entry / phase / procedure skills:

- **User-invocable** as `/reasonable:tdd-audit`. Registration is by convention: skills are
  auto-discovered from `skills/`, and user-invocability is simply the *absence* of
  `user-invocable: false` in frontmatter (confirmed against `develop` vs `using-reasonable`).
  **No `plugin.json` change is required.**
- **Does not enter an effort.** No `analysis → scaffolding → …` flow, no `.reasonable/` writes.
  Like `/init` and doc edits, it's an ordinary task that happens to live in the plugin.
- **Read-only; reports, never fixes.** Findings route to follow-up work (the TDD skills for
  gaps, bugfix-under-TDD for correctness flags), exactly as the current command's handoff section
  says. "A report you also edited from is no longer an independent audit."
- **Fail-open.** No `.reasonable/` present ⇒ full standalone power. An effort present ⇒ the
  contract-anchored checks (bidirectional mapping) additionally light up. This mirrors the
  plugin's hook law rather than fighting it.

## Artifacts

### New

| File | Role |
|---|---|
| `skills/tdd-audit/SKILL.md` | Thin orchestrator checklist: announce → launch the workflow → route the merged report. The user-facing entry. |
| `skills/tdd-audit/references/test-honesty-rubric.md` | **The one canonical honesty rubric inside `reasonable`.** Cited by this skill's honesty/confirm nodes *and* by the effort's `intent-verifier` + `auditor`. (Cross-*plugin* sync to vf-superpowers stays a manual note — different plugins can't reference each other at runtime — but within `reasonable` there is exactly one copy.) |
| `workflows/tdd-audit.workflow.js` | The deterministic fan-out (phases below). Pure per invariant #5 — no `fs`/Bash/`Date`/`random` in the script body; all side effects happen inside agent nodes. |
| `agents/test-auditor.md` | **One** read-only agent — allowlist `Read, Grep, Glob, Bash`, **no `Edit`/`Write`** — lens-parameterized via its dispatch prompt (`coverage` / `integration` / `runner` / `stale` / `quality` / `honesty` / `confirm`). The missing write capability is the capability-enforced guarantee of audit independence. |
| `test/discriminator-reverse-standalone.test.mjs` | Covers the new effort-free reverse path against a throwaway git repo (builtins only, like the other `test/*.test.mjs`). |

### Modified

| File | Change |
|---|---|
| `lib/discriminator.mjs` | **Additive only.** Today `runReverse()` requires `.reasonable/config.json` for `testOneCommand` and `testGlobs` (lines ~55–58, ~131, ~204). Add an effort-free path: when no effort root is found, accept `--test-one-cmd '<cmd with {test}>'` and `--test-glob <glob>` (repeatable) from the CLI and build an ad-hoc config, skipping `loadConfig`. The existing config-driven path is untouched, so the characterizer's behaviour does not change. Both callers reach the same `runReverse()`. |
| `agents/intent-verifier.md`, `agents/auditor.md` | Replace their inline honesty/sycophancy reasoning with a citation to `skills/tdd-audit/references/test-honesty-rubric.md` (the new canonical copy). No behavioural change — same rubric, one source. |
| `agents/characterizer.md` | Note that its admission check and tdd-audit share the now-effort-optional reverse-discriminator entrypoint (one code path, two callers). |
| `CLAUDE.md` | Add `tdd-audit` to the skill inventory as the new **diagnostic** category. Leave a one-line pointer noting it supersedes the external `tdd-audit` command (the user retires that copy). |

One new agent, not seven: the workflow passes `agentType: 'test-auditor'` with the lens named
in each prompt. Keeps the maintenance surface small (the user's stated priority).

## Orchestration (`tdd-audit.workflow.js`)

Four phases. The script only sequences; every model judgment and every shell-out lives inside an
agent node (the script itself is pure).

```
phase('Survey')   — INSIDE a survey agent: detect stack(s), the full-suite test command,
                    the single-test command template ({test} placeholder, needed by Confirm),
                    source/test dirs, naming convention; enumerate src↔test pairs; compose one
                    CONTEXT BLOCK per subproject (monorepo ⇒ N blocks, as today). Returns
                    structured pairs + context.

phase('Judge')    — parallel test-auditor nodes (read-only judgment), agentType:'test-auditor':
                    coverage (PARTITIONED ~15–20 src files/agent) · integration · runner ·
                    stale · quality · honesty. Coverage and honesty scale agent count with repo
                    size, never by cramming pairs (the existing sizing rules carry over verbatim).

phase('Confirm')  — pipeline over the honesty-flagged tests. A test-auditor 'confirm' node runs,
                    per flag:
                      node lib/discriminator.mjs --reverse --test <id> --locus <glob>
                        --test-one-cmd '<from Survey>' --test-glob '<from Survey>' --json
                    → admissible:false (still green under a locus mutant) = CONFIRMED VACUOUS;
                      admissible:true  (went red) = had teeth, model was wrong → downgrade.
                    Also: sanity.mjs scan (always); citation-resolve.mjs bidirectional mapping
                    (ONLY when an effort + contracts are present).

phase('Report')   — merge all nodes → verdict over coverage × honesty × TEETH (below).
```

Why the mechanical work sits in agents, not the script: workflow scripts are pure (invariant #5),
so they cannot shell out. The `Confirm` agent has Bash and runs the lib scripts; the script just
pipelines the flags through it. This also gives resumability — a long mutation pass that dies
mid-flight replays the completed flags from cache.

## The mechanical upgrade & verdict

This is what makes it "full power," not the soft version. The current honesty pass ends at *"the
model thinks test X is sycophantic."* The Confirm phase **promotes judgment to proof**:

- Flagged test still **passes** under a locus mutant → **mechanically-confirmed vacuous**; the
  verdict hardens.
- Flagged test goes **red** → the model's suspicion was wrong; downgrade to SUSPECT and say so.

The verdict becomes a three-axis gate — **coverage × honesty × teeth**:

- A HIGH-priority behaviour that is honesty-SYCOPHANTIC **and** mechanically confirmed vacuous →
  **FAILING** (was merely "NEEDS WORK" on model judgment alone).
- The report keeps the existing rich format and adds a **Teeth** column:
  `model verdict → mechanical result` per flagged test.

**No silent caps** carries over verbatim: the report states which flags were confirmed vs. not
reached, and which checks were *skipped* and why — e.g. "mapping — skipped, no contracts
present", "teeth — skipped, not a git repo". A skipped check is never rendered as a pass.

## Graceful degradation (standalone vs. effort)

| Condition | Behaviour |
|---|---|
| No `.reasonable/` | Full model-judgment audit + sanity scan + per-test teeth confirmation (reverse-discriminator via CLI flags). Bidirectional mapping skipped (no contracts) with an explicit note. |
| Effort present (contracts) | All of the above **plus** `citation-resolve.mjs` bidirectional mapping against the live contracts. |
| Not a git repo | Teeth confirmation skipped (reverse mode needs a HEAD worktree) with an explicit note; everything else runs. |
| No single-test command detectable for the stack | Teeth confirmation skipped with an explicit note; suite-level findings still produced. |

## Relationship to the effort pipeline — deliberately *not* wired in

The gated effort flow does **not** call tdd-audit as a step, by design. The two solve the same
problem from opposite ends:

| | Effort pipeline | tdd-audit |
|---|---|---|
| When | At authoring time, per-enrichment | Retrospectively, whole-suite |
| Oracle | A contract clause that *exists* | Synthesized intent (spec / docstring / types) |
| Honesty | *Prevented structurally* (blind writer can't see code; discriminator proves red-at-base; mapping is contract-anchored) | *Detected* (model judgment, then mutation-confirmed) |

The effort prevents dishonesty structurally at the source, which is strictly stronger than a
retrospective check. Wiring tdd-audit into the pipeline would swap a capability guarantee for a
discipline check — the exact inversion the plugin exists to prevent — and would be redundant and
slower. So the reuse is **the shared core, not the skill**:

1. **The canonical honesty rubric** — one file, cited by tdd-audit and the effort's
   `intent-verifier` + `auditor`.
2. **The mechanical `lib/` scripts** — already the single source; the effort-optional
   reverse-discriminator entrypoint lets the `characterizer` and tdd-audit share one code path.

An optional **pre-retrofit diagnostic seam** (the brownfield entry suggesting a tdd-audit run
before committing to a retrofit) is recognised as natural but is **deferred** — out of scope for
this work.

## Invariants honored

1. `lib/` stays dependency-free — the new reverse path uses node builtins only.
2. Fail-open outside an effort, and the contract-anchored checks only engage inside one.
3. Machine-parsed artifact grammar untouched (no `baseline.json` / ledger / contract format
   change).
4. No `DESIGN.md` renumbering.
5. The workflow script is pure — no `fs`/Bash/`Date`/`random`; all side effects inside agents.
6. No glossary-term abuse — the audit keys off mechanical facts and the rubric, never informal
   words like "prototype" or "MVP".

## Out of scope / deferred

- The pre-retrofit diagnostic seam in the brownfield entry path (optional human diagnostic).
- Any change to how the effort pipeline gates — tdd-audit stays outside the gated loop.
- Cross-plugin rubric sync with vf-superpowers (remains a manual note; not solvable at runtime).
- Auto-fixing findings — the skill reports; fixing is downstream TDD work.

## Open items to settle during planning

- The exact CLI flag names for the effort-free reverse path (`--test-one-cmd`, `--test-glob`),
  and whether a tiny shared helper in `effort.mjs` should build the ad-hoc config so the flag
  parsing has one home.
- The single-test command templates the Survey phase detects per stack (vitest/jest/pytest/go
  test/cargo test/ctest/Qt) — kept as a detection table in the survey agent, mirroring the
  current Phase 0.
- Whether `test-auditor` should be split into a no-Bash judgment agent + a Bash mechanical agent
  for a tighter capability boundary, or stay one read-only agent with Bash (current plan: one,
  for the smaller maintenance surface — revisit if the independence argument wins).
```
