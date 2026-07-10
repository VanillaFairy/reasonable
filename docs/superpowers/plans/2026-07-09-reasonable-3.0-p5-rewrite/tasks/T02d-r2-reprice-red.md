# Task T02d: R2 sibling-reprice tests + impl (audit follow-up)

**Roles:** `red` then `green` — two separate fresh subagents, same triad discipline as every other
pair in this plan. This is a small, single-behavior addition, so there is no separate `audit` leg;
the supervisor closes the loop directly once the separation gate passes (same pattern T01d used).

## Origin

T02c's adversarial audit (read-only, on `lib/rewrite.mjs`'s T02 section + `test/rewrite-structural.test.mjs`)
returned FAIL on one finding: `shared/interfaces.md`'s `change` sub-vocabulary table pins
`{ reprice: { factor } }` as "emitted by: R1, R2, R7" — but the shipped `ruleDeadEnd` (R2) never
constructs one. `DESIGN-3.0.md` §7's own R2 row confirms the omission is real, not a misreading of
the interface doc:

> atom → `retired-pending`, out of frontier; blast radius = **widen-only** citation closure of the
> refuted premise, recorded in the event (radius born **live**); **intersecting atoms freeze;
> siblings sharing citations reprice**

**Supervisor's resolution of the ambiguity the audit flagged** (the design prose doesn't spell out
the mechanics, so this is a judgment call, made and documented here rather than silently guessed
inside a locked test): "intersecting atoms" (the existing freeze population) is the wide,
closure-based safety net — any atom whose own citation-closure footprint touches the widened blast
radius. "Siblings sharing citations" is read as a **narrower, more literal** population: other atoms
(excluding the dying one) that hold a **direct citation to the exact refuted clause** —
`{component: premise.component, clause: premise.clause}` — in their own `deltaClauses[].citations`.
A direct citer of the exact refuted clause is, by construction, also inside the wider frozen
population (its component is trivially in its own closure), so in practice this population is a
**subset** of the frozen one: those atoms get BOTH the existing `{flag:'frozen'}` effect AND an
additional `{reprice:{factor:'α'}}` effect (the same symbolic, uncalibrated α token R1 already uses
— Part 5 invents no number here either, per §16). An atom that's merely closure-adjacent but does
NOT cite the exact clause gets frozen only, no reprice.

This interpretation is **flagged, not settled** — a future review (Part 7, or a DESIGN-3.0
ratification pass) may read "siblings" differently. Recorded here, in the T04 docs task, and in the
supervisor's final report so it's easy to find and revisit.

## Scope
**Files:**
- Create: `test/rewrite-r2-reprice.test.mjs` (red)
- Modify: `lib/rewrite.mjs` (green — inside the existing T02 section's `ruleDeadEnd`, between the
  T02b and T03b markers; NOT a new section, no new marker)

**BOUNDARY — the red task creates only its one new test file. The green task touches only
`ruleDeadEnd`'s body inside `lib/rewrite.mjs` — it must not touch anything above the T02b marker or
below the T03b marker, and must not modify any test file, including the new locked one.**

## Positive Constraints (DO)
- **Red:** a fixture with three atoms: the dying atom (`a-1`, citing the premise's exact clause,
  refuted), a sibling that ALSO cites the exact same clause (`{component: premise.component, clause:
  premise.clause}`) → must receive BOTH `{flag:'frozen',...}` and `{reprice:{factor:'α'}}` as two
  separate provisional effects on that node, and an atom that's closure-adjacent (shares the wider
  component-level radius per the existing R2 test in `rewrite-structural.test.mjs`) but does NOT cite
  the exact clause → frozen only, no reprice. Assert `validateEffects` on the full output.
- **Green:** extend `ruleDeadEnd`'s existing freeze loop (or add a second pass) to also emit
  `{nodeId: other.id, change: {reprice:{factor:'α'}}}` for any OTHER atom whose `deltaClauses[].citations`
  contains an exact `{component: premise.component, clause: premise.clause}` match. Do not change the
  existing freeze logic, the route logic, or the permanent effects — this is a strict addition.

## Negative Constraints (DO NOT)
- Do NOT touch `test/rewrite-structural.test.mjs` (the existing R2 locked test) — its fixture doesn't
  exercise this path and must keep passing unchanged.
- Do NOT invent a numeric reprice factor — `'α'` stays symbolic (matches R1).
- Do NOT collapse frozen+reprice into one effect object — they are two separate node effects on the
  same `nodeId` (mirrors how a node can carry more than one effect entry elsewhere in this file).

## Implementation Steps (red task)
1. Write `test/rewrite-r2-reprice.test.mjs` per the "Positive Constraints" above, following the exact
   harness convention in `../shared/conventions.md` (standalone script, `check()` helper, no filesystem).
2. Run it — expect a genuine failure against the CURRENT implementation (the reprice effect is
   missing today), not a tautology. Confirm the failure is specifically "expected reprice effect not
   found in provisional array," not an unrelated crash.
3. Commit only the new test file: `git add test/rewrite-r2-reprice.test.mjs` then
   `git commit -m "test(rewrite): lock R2's sibling-reprice annotation (audit follow-up, red)"`.

## Implementation Steps (green task, dispatched after red is committed)
1. Modify `ruleDeadEnd` inside `lib/rewrite.mjs` (between the T02b/T03b markers only) to add the
   reprice effects per "Positive Constraints" above.
2. Run the new locked test (must pass), the existing `test/rewrite-structural.test.mjs` (must still
   pass unchanged), and the full suite.
3. Commit only `lib/rewrite.mjs`: `git commit -m "feat(rewrite): R2 emits a reprice annotation for siblings sharing the exact refuted citation"`.

## Acceptance Criteria
- [ ] New test file covers: sibling-with-exact-citation → frozen + reprice; closure-adjacent-only
      atom → frozen, no reprice; `validateEffects` asserted
- [ ] `ruleDeadEnd`'s existing freeze/route/permanent logic is unchanged; only an addition
- [ ] `test/rewrite-structural.test.mjs` (the original R2 fixture) still passes byte-for-byte unmodified
- [ ] Full suite green (except `rewrite-ceremony.test.mjs`, still pending T03b)
- [ ] The interpretation is documented in a code comment above the new logic, citing this task file
