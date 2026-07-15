# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

`reasonable` is a **Claude Code plugin** (not an application) that enforces a development
methodology: *outside-in, contract-governed, adversarially verified* work for LLM-driven software.
There is **no build, no compile, no transpile step.** The "source" is three kinds of artifact:

- **Markdown with normative force** — agent constitutions (`agents/*.md`) and skill procedures
  (`skills/*/SKILL.md`). These are read by the model, but they encode rules, not prose.
- **A dependency-free Node ESM engine** (`lib/*.mjs`) — the actual enforcement logic.
- **A polyglot hook bridge** (`hooks/`) and **workflow scripts** (`workflows/*.workflow.js`).

The plugin acts on a **target repo, not on itself.** An "effort" lives in a `.reasonable/` — at the
target project root for a single effort, or nested at `.reasonable-efforts/<name>/.reasonable/`
(depth 1) when several efforts share one repo, discovered via `resolveActiveEffort`. This repo has
no `.reasonable/` of either shape, so every hook here no-ops (fails open). Don't be surprised that
enforcement is silent when working *on* the plugin — that's correct.

## Commands

There is no package.json and no test runner. Tests are standalone Node scripts using builtins only:

```bash
node test/commit-gate.test.mjs      # run one test file
node test/conclude.test.mjs
node test/stop-commit.test.mjs
for t in test/*.test.mjs; do node "$t"; done   # run all (no aggregate runner exists)
```

Each test builds throwaway git repos in the OS temp dir and exercises one `lib/*.mjs` module against
real git. Requirements to run anything here: **Node.js** and **Git** (the engine shells out to git;
on Windows, Git-for-Windows supplies the `bash.exe` the hook wrapper needs).

## Maintenance: every fix or adjustment gets committed and version-bumped

Once a change to this repo's own code, docs, or tests is verified (tests pass), it must be **committed**
in the same turn — don't leave fixed work sitting uncommitted. Alongside the commit, bump the version
in `.claude-plugin/plugin.json` **and every other place the version string appears** (currently: the
install snippet and the footer `Version:` line in `README.md`) per SemVer:

- **patch** — backward-compatible bug fix (the default case; pick this when a fix is fix-dominant even
  if it incidentally adds a small backward-compatible capability)
- **minor** — backward-compatible new feature
- **major** — breaking change — **confirm with the user first**, never bump this alone

Patch and minor bumps happen automatically, without asking. Only a major bump needs a human nod.

## Architecture: nouns, verbs, laws

> Agents are **nouns** (a role + a tool allowlist), skills are **verbs** (a procedure), hooks are
> **laws** (a mechanically-checkable rule).

The system is a **deterministic pipeline with stochastic nodes**: orchestration (which step runs,
with what inputs, in what order) is code; model judgment lives *inside* nodes, never between them.

- **`agents/`** — each `.md` is a role constitution. The context manifest is enforced by the **tool
  allowlist**, not by prose. Example: `blind-test-writer` has **no Bash**, so it literally cannot run
  or read the implementation — bias prevention by capability. *Preserve these allowlists when editing
  agent definitions; weakening one silently breaks an adversarial separation.*
- **`skills/`** — the entry skill `develop` is the single way to start an effort; it *asks* the two
  orthogonal axes up front (mode: gated|autonomous, tier: full|lite), both explicit
  (`develop-autonomously` is a thin alias that presets autonomous). Phase skills (`analysis`,
  `scaffolding`, `vertical-slice-execution`, `retro`)
  are orchestration checklists run in the main session; procedure skills (`component-contract`,
  `gate-mechanics`, `contract-amendment`, `adversarial-audit`, `shared-context-session`) are the
  shared type system cited by ≥2 roles. `using-reasonable` is the shared methodology reference,
  loaded on demand by the model and cited by both entries and several agents — it carries
  `user-invocable: false` (not a slash command, never an entry point). A new category —
  **diagnostic skills** (`tdd-audit`) — is user-invocable and standalone: it audits a target repo's
  existing test suite (coverage / quality / honesty, with per-test reverse-discriminator teeth
  confirmation) and, like `/init`, does **not** enter an effort or write `.reasonable/` state. It
  supersedes the external `tdd-audit` command (now retired in favor of this in-plugin copy).
- **`hooks/` + `lib/`** — the law. Dispatch chain (understand this before debugging a hook that
  "won't fire"): `hooks/hooks.json` → `hooks/run-hook.cmd` (polyglot Windows/Unix wrapper) →
  extensionless bash shim (e.g. `hooks/fence`) → `node lib/<name>.mjs`. PreToolUse hooks: `fence`,
  `sanity`, `budget`. Stop/SubagentStop: `stop-commit`. SessionStart: `session-start`.
- **`workflows/*.workflow.js`** — scripts for the Workflow tool that drive one vertical slice / spike /
  scaffold end-to-end via subagents.
- **`docs/`** — the full design corpus. `docs/DESIGN.md` is the design source of truth; `docs/principles.md`
  (the *why*) and `docs/architecture.md` (the *how* — the methodology on the Dynamic Workflows engine) are
  authoritative on intended behavior; `docs/glossary.md` is the normative vocabulary; `docs/artifacts.md`
  pins the on-disk format of every `.reasonable/` artifact; `docs/roadmap/` holds post-1.0 problem definitions.

## Invariants you must not break

These are the things that look like style but are load-bearing:

1. **`lib/` stays dependency-free** — node builtins (`node:fs`, `node:child_process`, …) and relative
   imports only. No package.json, no npm install; the plugin must run anywhere Node does.
2. **Hooks fail OPEN outside an effort, CLOSED inside one.** No `.reasonable/` reachable ⇒ allow
   everything (installing the plugin never breaks an ordinary session). Effort active but no lane
   descriptor ⇒ deny (an ungoverned worktree inside a live effort is presumed hostile). Every new hook
   path must honor this.
3. **Machine-parsed artifacts have load-bearing grammar.** In `docs/artifacts.md`, a `*` marks an
   artifact whose format `lib/*.mjs` parses (journal, ledger, contracts, lane descriptor, …). Changing
   the on-disk shape and the parser must happen together.
4. **`DESIGN.md` section numbers are cited from code.** Comments in `lib/` and `hooks/` reference
   `§5.9`, `§6.3`, etc. Renumbering DESIGN sections orphans those references — keep them stable, or
   update both sides.
5. **Workflow scripts are pure.** `workflows/*.workflow.js` may not use `fs`, `Date.now()`,
   `Math.random()`, `new Date()`, or imports — all side effects happen *inside* agents. This is a hard
   substrate requirement (it's what lets a workflow resume deterministically).
6. **Only glossary terms carry normative force.** Informal words ("prototype", "stub", "MVP", "rough")
   grant no exemption from any rule; don't let a hook or constitution key off them.
7. **A plan/spec document never claims to record a human's words.** `DESIGN-3.0.md` §9 pins this for
   real reasonable efforts: a gate's human confirmation is a **ledger fact** (a `ratification` event,
   append-only, immutable `seq`), never a prose fact — a plan may cite the seq, never quote or
   reconstruct what was said. This repo has no `.reasonable/` ledger to append to (invariant 2 — hooks
   no-op here), so when a plan under `docs/superpowers/plans/**` hits a human-confirmation checkpoint
   while developing the plugin itself, resolve it by acting on the live conversation directly. If a
   record is wanted, state plainly that it was confirmed in conversation — never label anything
   "verbatim" unless it is a literal, unedited copy-paste, and never delete a documented mistake once
   written; correct it in a new, forward commit instead. (Added after a live session hit exactly this
   gap: a plan file was edited to "document" a confirmation, a paraphrase got mislabeled verbatim, and
   the correction was later deleted rather than left visible.)

## The conceptual model (so changes stay coherent)

Two meta-principles drive every rule: **feedback beats prediction** (component shapes emerge from
development history, not upfront plans) and **capability beats discipline** (enforce by
allowlist/hook/fence what a prompt could be rationalized away). Every mechanism is one of **Three
Laws** — *parity* (claims match reality), *one-way membranes* (value crosses boundaries only in
sanctioned form), *external verification* (no actor grades its own work — generalized as the
**verification trio**: worker mutates → read-only adversary *proposes* a verdict against a reference
above the artifact → orchestrator routes accept/reject/escalate). A proposed rule that isn't one of
the three is probably wrong. (As with Law 1's commit iron rule, this surface names the laws and
leaves their corollaries to `DESIGN.md` §4.)

A user starts an effort by invoking the single entry skill `reasonable:develop`, which *asks* two
orthogonal axes up front, both explicit and never inferred: **mode** (gated — every ratification gate
blocks for a human; or autonomous — gates self-ratify and are logged, but no step or mechanical check is
ever skipped) and **tier** (full, the default; or lite — trims only the vertical-slice audit depth,
waiving no guard). `reasonable:develop-autonomously` remains as a thin alias that presets autonomous.
From there the flow is `analysis → scaffolding → vertical-slice-execution → retro`, looping the last two
per vertical slice. **`/init`, doc edits, and other ordinary tasks do not enter a reasonable effort** —
only that entry does.

## Where the canonical design lives

`reasonable` is at **v3.5.0**. The full design corpus lives in `docs/`: `DESIGN.md` (methodology source of
truth), `principles.md` (the foundation — the *why*), `architecture.md` (how the methodology sits on the
Dynamic Workflows engine — the *how*), `glossary.md` (normative vocabulary), `artifacts.md` (on-disk artifact
formats), and `roadmap/` (post-1.0 problem definitions). **Brownfield retrofit is first-class** — you'll see
`agents/census.md`, `agents/characterizer.md`, `lib/baseline.mjs`, and `BF*` citations in `lib/fence.mjs`.
When in doubt about intended behavior, `docs/DESIGN.md` + `docs/architecture.md` are authoritative over
`README.md`.
