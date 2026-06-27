# Architecture

## What we're building

A **diagnostic** skill for the `reasonable` plugin — a new category alongside entry / phase /
procedure skills. It is user-invocable (`/reasonable:tdd-audit`), read-only, and does **not** enter
a reasonable effort (no `.reasonable/` writes, no `analysis → scaffolding → …` flow). It audits an
existing test suite and *reports*; it never fixes.

## Module boundaries

- `lib/discriminator.mjs` — the mechanical teeth engine. Already has a per-test **reverse mode**
  (mutate a locus, assert the test goes RED). We add an **effort-free flag path** so it runs with
  no `.reasonable/config.json`. One code path (`runReverse`) now serves two callers: the brownfield
  `characterizer` (config-driven) and this audit (flag-driven). Builtins only — no new deps.
- `skills/tdd-audit/references/test-honesty-rubric.md` — the **single** canonical honesty rubric in
  the plugin. Cited by the audit's honesty/confirm nodes AND by the effort's `intent-verifier` +
  `auditor`. (Cross-*plugin* sync to vf-superpowers stays a manual note; within `reasonable` there
  is exactly one copy.)
- `agents/test-auditor.md` — one read-only agent (`Read, Grep, Glob, Bash`; **no** `Edit`/`Write`)
  parameterized by a *lens* named in its dispatch prompt. The missing write capability is the
  capability-enforced guarantee that an audit can't edit what it audits.
- `workflows/tdd-audit.workflow.js` — deterministic fan-out. The script only orchestrates and
  composes prompts; every side effect (reading code, running tests, running the discriminator)
  happens inside an agent node. Pure per invariant #5.
- `skills/tdd-audit/SKILL.md` — the thin user entry: announce → launch the workflow by name → route
  the merged report.

## Data flow

```
/reasonable:tdd-audit
   └─ SKILL.md launches Workflow({ name:'reasonable-tdd-audit', args:{ targetRoot, reasonableRoot } })
        Survey  (1 test-auditor node)  → stack(s), test cmd, single-test cmd, src↔test pairs, partitions
        Judge   (parallel test-auditor nodes) → coverage[], integration, runner, stale, quality, honesty
        Confirm (pipeline over honesty flags) → per flag: node lib/discriminator.mjs --reverse … --json
                 + sanity.mjs scan; + citation-resolve.mjs ONLY if an effort is present
        Report  (pure merge) → verdict = coverage × honesty × teeth, with explicit skips
```

## Key design decisions

- **Survey enumerates the src↔test pairs**, so the Judge lenses run in parallel without a
  coverage-first barrier. (The original command waited for coverage to enumerate pairs; moving
  enumeration into Survey removes that wait.)
- **Confirm runs inside an agent, not the script.** Workflow scripts are pure and cannot shell out;
  the Confirm `test-auditor` node has Bash and runs the discriminator. `pipeline()` gives
  resumability — a long mutation pass that dies mid-flight replays completed flags from cache.
- **Teeth confirmation uses `--tree <targetRoot>`** (explicit working tree) and `--test-one-cmd`
  (no effort config). No `--root`/effort needed standalone.
- **Graceful degradation, never silent.** Mapping skipped when no contracts; teeth skipped when not
  a git repo or no single-test command. Every skip is reported as a skip, never rendered as a pass.

## Why this is NOT wired into the effort pipeline

The gated effort flow prevents test dishonesty *structurally at authoring time* (blind-test-writer
can't see code; discriminator proves red-at-base; mapping is contract-anchored). A retrospective
model-judgment audit is strictly weaker, so wiring it into the pipeline would swap a capability
guarantee for a discipline check. The reuse is the shared **core** (rubric + lib), not the skill.
