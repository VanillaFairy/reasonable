# Problem: forced-tool call-shape mis-calls burn retries (and can crash a run)

**Status:** TODO — problem defined here; the robust fix is engine-side (forced-tool validation). An
in-plugin mitigation (the `callShapeReminder` prompt line) is now on every schema-forced prompt across
all six workflows as of 2026-07-03.
**Origin:** the graph-editor-ux-overhaul reconciler crash (2026-07-01), confirmed again while profiling
a run on 2026-07-03.

## What is broken

Most reasonable workflow stages **force** a StructuredOutput tool call against an inline JSON Schema.
The model intermittently mis-calls that tool by JSON-stringifying its *entire* answer into a single
wrapper property — `{"input": "{\"halt\": false, ...}"}` — instead of passing the schema's own fields
as the tool call's top-level arguments (`{"halt": false, ...}`). Every such call fails schema
validation ("must have required property …") and **burns one of the 5 retries**. Five wrapped attempts
in a row exhaust the cap and throw — which is what crashed the reconciler outright on its very first
step. It was observed on two different agent types in the same run (reconciler, lane-provisioner), so
it is a call-shape **habit**, not an agent-specific defect: any schema-forced prompt is exposed.

Even when it does not crash, each burned retry is a wasted full model round-trip — invisible minutes
scattered across the many schema-forced stages (which is most of them).

## Why it matters

- **Reliability.** A run can die on a recovery prologue that never actually got to run — the worst
  possible place to lose a step.
- **Latency / cost.** Silent retry-burn inflates wall-clock and tokens on nearly every stage, with no
  signal in the output that it happened.
- **Leverage.** It is a substrate-level footgun the methodology can currently only paper over from the
  prompt side, imperfectly.

## Failure modes a solution must prevent

1. **Masking real errors.** Unwrapping must not swallow a genuinely malformed or wrong-schema call as
   if it were fine — a wrong ACCEPT of a bad payload is worse than a retry.
2. **Ambiguity.** Only the exact single-wrapper shape should be unwrapped: one property whose string
   value parses to an object that matches the schema. Anything else stays a validation failure.
3. **Non-determinism.** The unwrap must be deterministic — no heuristic that varies run to run and
   breaks replay.

## Candidate resolution (direction, not committed)

- **Engine (outside this repo).** Before validating a forced-tool call, detect the
  `{ "<one-prop>": "<json-string>" }` wrapper, parse the inner JSON, and validate *that* against the
  schema; fall back to a validation error only if the unwrapped object still does not fit. This kills
  the retry-burn and the crash class at the source, and lets the prompt-side reminder be retired.

- **In-plugin interim (done 2026-07-03).** The `callShapeReminder` line — *"call the forced tool with
  the schema's fields as the call's own top-level arguments; do NOT JSON-stringify the whole answer
  into a wrapper property"* — is now appended to every schema-forced prompt in all six workflows
  (previously only `vertical-slice-runner`; the other five had zero coverage). This lowers the mis-call
  rate but does not eliminate it — it is a model habit, not a prompt bug.

## How we'll know it's fixed

- A wrapper-shaped forced-tool call validates on the **first** attempt instead of burning retries.
- No run dies from five consecutive wrapped-call retries.
- The `callShapeReminder` boilerplate can be removed from the workflow prompts with no regression in
  mis-call handling.
