# Task T13: Main-session skills emit lifecycle events

## References
- Read: `../shared/interfaces.md` §2 (Family 1) + §4 (CLI), `../shared/conventions.md`
- Read: `skills/analysis/SKILL.md`, `skills/scaffolding/SKILL.md`,
  `skills/vertical-slice-execution/SKILL.md`, `skills/retro/SKILL.md`, `skills/develop/SKILL.md`

## Dependencies
- Depends on: T03b. Depended on by: T14.

## Scope
**Files:**
- Modify: the five SKILL.md files above.

**BOUNDARY — nothing else. These are orchestration checklists executed by the MAIN SESSION
(which has Bash and is the trusted control plane); you are adding explicit checklist steps,
each with its exact CLI command.**

## Positive Constraints (DO)
Insert steps at these exact orchestration moments (every command uses
`node lib/ledger.mjs append --root <effortRoot> …`):

- **develop:** at effort start (after config is written):
  `--type node-planned --node analysis --kind phase --title 'analysis'` then
  `--type node-dispatched --node analysis --kind phase`.
- **analysis:** at its final human-ratification step (after ratification):
  `--type node-completed --node analysis`; then for the ratified route, one
  `--type node-planned --node <sliceId> --kind slice --title '<slice title>'` per route slice
  and one `--type node-planned --node <sliceId>/<woId> --kind work-order --title '<output>'`
  per known work order; spikes on the route: `--type node-planned --node <spikeId> --kind spike …`.
- **scaffolding:** before launching the scaffold workflow:
  `--type node-planned --node scaffolding --kind scaffold --title 'walking skeleton'` +
  `--type node-dispatched --node scaffolding --kind scaffold`; at sign-off:
  `--type node-completed --node scaffolding`.
- **vertical-slice-execution:** before launching the runner for slice S:
  `--type node-dispatched --node <S> --kind slice`; routing the typed GATE_RESULT:
  green → `--type node-completed --node <S>` (after the retro gate),
  blocked/halt → `--type node-failed --node <S> --reason '<the wall>'`;
  after a lane MERGE lands a work order: `--type node-completed --workOrder <woId> --kind work-order`.
- **retro:** clearing an inbox item → `--type approval-resolved --id <itemId>`; a ratified
  route re-sort that DROPS a planned node → `--type node-canceled --node <path> --reason
  'route re-sort <date>'`; newly added work orders → `node-planned` lines as in analysis.
- Every inserted step carries a one-line rationale in the skill's existing voice (these files
  are normative checklists — match their formatting, numbered steps, and tone).

## Negative Constraints (DO NOT)
- Do NOT reorder/remove existing steps or gates. Additive insertions only.
- Do NOT instruct any scribe/subagent to emit these — the main session runs the commands
  itself (the scribes' duties are unchanged in Plan 1).

## Implementation Steps
1. Insert the steps; keep each skill's numbering/format intact.
2. Review: every Family-1 type in interfaces §2 now has at least one named emitter across
   T11+T13 (dispatched→provisioner+skills; checkpointed→implementer; downgraded→reconcile;
   completed/failed/canceled/planned/approval-resolved→skills; concluded→conclude.mjs).
3. Commit:
```bash
git add skills/analysis/SKILL.md skills/scaffolding/SKILL.md skills/vertical-slice-execution/SKILL.md skills/retro/SKILL.md skills/develop/SKILL.md
git commit -m "docs(skills): main session emits node lifecycle events at every orchestration moment

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

## Acceptance Criteria
- [ ] Every orchestration moment above has its explicit CLI step
- [ ] Emitter coverage table (step 2) reported in your final message
- [ ] No existing step altered or removed
