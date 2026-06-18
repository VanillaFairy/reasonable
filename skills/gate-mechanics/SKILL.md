---
name: gate-mechanics
description: Use when parking or promoting tests, writing a stage gate, or placing a loud stub in a reasonable effort — defines the PARK / PROMOTE / GATE / LOUD-STUB primitives and points to per-stack binding tables (Rust, TypeScript) for the concrete syntax, burndown queries, measurement harness, and shared-build-cache strategy.
---

# Gate Mechanics

## Overview

The methodology's test-lifecycle primitives are abstract; each language binds them to concrete
syntax. This skill defines the four primitives; the **binding tables** (`references/<stack>.md`)
give the syntax. Adding a stack = adding one reference file — no agent or skill changes.

**Announce at start:** "Using gate-mechanics to <park/promote/gate/stub> for <stack>."

**Normative terms:** `docs/glossary.md`. **Stack syntax:** `references/rust.md`,
`references/typescript.md`.

## The four primitives

### PARK
Mark a future gate as ignored **with a reason string**, while keeping it compiling/importing.
Parked tests pin the outermost contracts, so topology drift surfaces immediately rather than at
promotion. A parked test that doesn't compile pins nothing.

- Reason strings name the vertical slice that will promote it: `pending: vertical slice 4, panel IPC`.
- **The suite is green at every commit.** Parked ≠ failing. "Expected red" does not exist as a
  runtime state — a suite where red is sometimes expected trains agents to explain away failures,
  the exact reflex you never want. With parking, "everything unparked is green" holds always, so any
  red is *always* a regression.

### PROMOTE
Remove the ignore marker. **Promotion is the formal act of opening a stage.** Promote a gate
just-in-time, when its stage opens — never pre-write deep-stage tests (that pins internal seams at
the moment of least knowledge, re-importing the disease). Top-level scenario tests are the exception:
they are written at scaffold time and parked, because they are phrased in user-visible terms and
pin the outermost contracts for the vertical slice.

### GATE
A stage's acceptance test: **RED at open, GREEN at close.** GREEN is the formal act of closing the
stage and is the **merge condition** for the vertical-slice branch. Two kinds:
- **automated** (default): names the promoted scenario test(s) that must pass.
- **manual** (justified exception only): a stage that genuinely cannot have an automated gate (e.g.
  "the animation feels smooth") must name its **manual verification procedure** in the vertical-slice spec.
  "We may or may not have a test" is the hole through which agents ship vapor — never default to it.

### LOUD-STUB
An off-path code path that **fails unmissably when touched** (panics/throws). Never returns plausible
data. Self-documenting, greppable (a second burndown), unfakeable. In compiled languages the panic
*is* the lint. A scenario gate physically cannot pass while a loud stub remains on its path — the
material enforces the process.

## The two burndowns (mechanical)

Both are queryable counts via `node ${reasonable}/lib/burndown.mjs` (`${reasonable}` = this plugin's
root directory — `$CLAUDE_PLUGIN_ROOT` in hooks; the orchestrator substitutes the absolute path):
- **Parked count** = the vision's debt (how many future gates remain).
- **Loud-stub count** = the off-path debt (how much remains unbuilt off the active path).

The park-marker regex and loud-stub markers come from `.reasonable/config.json` (set per stack at
scaffolding from the binding table).

## Quick reference

| Primitive | Means | When |
|---|---|---|
| PARK | ignore-mark + reason, still compiles | scaffold time (top-level scenarios) |
| PROMOTE | remove ignore marker | just-in-time, when a stage opens |
| GATE | RED→GREEN acceptance test = merge condition | every stage in a vertical slice |
| LOUD-STUB | panic/throw off-path, never canned data | everywhere off the active path |

## Per-stack bindings

The concrete syntax, burndown queries, measurement harness (for quality gates), and shared-build-cache
strategy live in:

- **Rust:** `references/rust.md`
- **TypeScript:** `references/typescript.md`

Host conventions get **adapters, not mandates** — adding a stack is one reference file.

## Common mistakes

- **A parked test that doesn't compile.** It pins nothing; topology drift won't surface. Keep parked
  tests compiling.
- **Pre-writing deep-stage gates.** Pins internal seams at the moment of least knowledge. Write gates
  just-in-time; only top-level scenarios are written-and-parked early.
- **Canned data instead of a loud stub.** A plausible fake value is a landmine someone will trust.
- **Defaulting to a manual gate.** Manual verification is a justified exception named in the spec,
  never the default.
