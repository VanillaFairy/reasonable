# Task T03b: `requiredRoles` impl (green)

**Role:** `green` — append `lib/frontier.mjs`'s final section (`requiredRoles`), closing out
Phase A. Implement exactly what the locked test requires; do not modify any test file.

## References
- Read: `../shared/interfaces.md` §1.4, `../shared/conventions.md`, `../shared/architecture.md`
- Read: `test/frontier-roles.test.mjs` (T03a's locked test)
- Read: `lib/ceremony.mjs`'s `rechartingDegenerates`/`retroClassificationDegenerates` exports (import
  these; do not re-derive their logic)
- Read: `lib/frontier.mjs` (the T01+T02 sections + the `// ── requiredRoles appended by T03b … ──`
  marker from T02b)

## Dependencies
- Depends on: T03a (locked test), T02b (the marker to append below)
- Depended on by: T03c (audits), Phase B (T04+ — the whole Phase A must be settled first)

## Scope
**Files:**
- Modify: `lib/frontier.mjs` (append below the T02b marker)

**BOUNDARY — you MUST NOT modify any files outside this list.** Do NOT modify
`test/frontier-roles.test.mjs` — locked. Do NOT edit `lib/ceremony.mjs`, `lib/footprint.mjs`, or any
earlier section of `lib/frontier.mjs`.

## Positive Constraints (DO)
- Implement `requiredRoles(wave, context)` exactly per `../shared/interfaces.md` §1.4: the always-
  present core (`'auditor'`, `'blind-test-writer'`, `'implementer'`), plus the four conditional roles,
  each gated on its own predicate, returning a **sorted** array.
- Import `rechartingDegenerates`/`retroClassificationDegenerates` from `./ceremony.mjs` — reuse, never
  re-derive (Decision 10: "reuse over reimplement").
- This is the FINAL section of `lib/frontier.mjs` — it does not need to end with another marker.

## Negative Constraints (DO NOT)
- Do NOT re-implement the phase-degeneration logic inline — call the imported `ceremony.mjs`
  functions.
- Do NOT edit the T01 (`gateDue`) or T02 (`ready`/`pack`) sections above your marker.
- Do NOT do any I/O.

## Implementation Steps

### Step 1: Append `lib/frontier.mjs`'s `requiredRoles` section

Open `lib/frontier.mjs`. Replace the marker line
`// ── requiredRoles appended by T03b (do not edit above this line) ──` with:

```js
// ── requiredRoles — lazy, role-minimal provisioning (§6 draft-five) ──────────
import { rechartingDegenerates, retroClassificationDegenerates } from './ceremony.mjs';

const CORE_ROLES = Object.freeze(['auditor', 'blind-test-writer', 'implementer']);

/**
 * The set of roles a wave actually needs (§6). Pure; the DISPATCH on the result is the workflow's.
 * Reuses ceremony.mjs's degeneration predicates applied to role dispatch — the same phase-degeneration
 * discipline §5.4 applies to phase materialization, generalized to per-role dispatch.
 * @param {{atomIds: string[]}} wave
 * @param {{brownfield?:boolean, brownfieldInput?:any[], amendmentBatch?:any[], landedConeCount?:number}} context
 * @returns {string[]}  role names, SORTED
 */
export function requiredRoles(wave, context = {}) {
  const roles = new Set(CORE_ROLES);

  if (context.brownfield === true && Array.isArray(context.brownfieldInput) && context.brownfieldInput.length > 0) {
    roles.add('census');
    roles.add('characterizer');
  }

  if (rechartingDegenerates(context.amendmentBatch).result === 'materialize') {
    roles.add('topologist');
  }

  if (retroClassificationDegenerates(context.landedConeCount).result === 'materialize') {
    roles.add('retro-synthesizer');
  }

  return [...roles].sort();
}
```

### Step 2: Run the locked test to verify it passes

Run: `node test/frontier-roles.test.mjs`

Expected: `frontier-roles: all <N> checks pass. ✓`, zero `FAIL` lines.

### Step 3: Confirm zero regression to the whole suite

```bash
for t in test/*.test.mjs; do node "$t"; done
```

No `FAIL` line anywhere — `test/frontier-gate.test.mjs`, `test/frontier-ready-pack.test.mjs`,
`test/footprint-disjoint.test.mjs`, and every pre-existing test still pass.

### Step 4: Commit

```bash
git add lib/frontier.mjs
git commit -m "feat(frontier): append requiredRoles — lazy role-minimal provisioning (green, P7)" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

## Acceptance Criteria
- [ ] `node test/frontier-roles.test.mjs` passes with zero failures
- [ ] `lib/frontier.mjs`'s three sections (T01/T02/T03) are each intact and disjoint; no earlier
      section was edited
- [ ] `requiredRoles` imports only `rechartingDegenerates`/`retroClassificationDegenerates` from
      `./ceremony.mjs` — no other import, no I/O
- [ ] The whole existing suite still passes; no file outside Scope was modified
