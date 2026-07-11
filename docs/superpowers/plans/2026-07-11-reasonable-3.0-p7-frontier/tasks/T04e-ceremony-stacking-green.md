# Task T04e: ceremony-escalation stacking impl (green) — `lib/rewrite.mjs`

**Role:** `green` — namespace `ceremonyEscalation`/`unwindCeremonyEscalation` by a stable
`escalationId` in `lib/rewrite.mjs`. Implement exactly what the locked tests require; do not modify any
test file.

> **This edits P5's own already-shipped `lib/rewrite.mjs`.** It is a real, bounded shape change — new
> field, namespaced string values — not a rewrite of the calculus. Every OTHER export/rule in this file
> is untouched.

## References
- Read: `docs/superpowers/specs/2026-07-11-reasonable-3.0-p7-frontier-design.md` Decision 5 (the exact
  corrected text — this is the specification you implement)
- Read: `../shared/interfaces.md` §0 correction 3 and §2's extended flagged-gap note
- Read: `test/rewrite-ceremony.test.mjs` (the ONE rewritten check) and
  `test/rewrite-ceremony-stacking.test.mjs` (T04d's locked tests — the exact behavior you implement)
- Read: `lib/rewrite.mjs` **in full** — you are editing exactly two functions
  (`ceremonyEscalation`/`unwindCeremonyEscalation`); every rule, the router, `scc`/`dependentCone`, and
  R1–R9 stay untouched

## Dependencies
- Depends on: T04d (locked tests) and the human's confirmation of this fix
- Depended on by: T04f (audits), T05a (the two-phase fold tests build on the fixed unwind)

## Scope
**Files:**
- Modify: `lib/rewrite.mjs`

**BOUNDARY — you MUST NOT modify any files outside this list.** Do NOT modify
`test/rewrite-ceremony.test.mjs`, `test/rewrite-ceremony-stacking.test.mjs`, or
`test/rewrite-ceremony-hardening.test.mjs` — all locked. Do NOT touch any rule function, the router, or
any other export in `lib/rewrite.mjs`.

## Positive Constraints (DO)
- In `ceremonyEscalation`, after computing `nextIdx` (the escalation genuinely fires), compute
  `escalationId` from `state.escalations[coneId]`'s length (defaulting to `[]` when absent — the same
  tolerance `bands`/`bandBounds`/`priorVerdicts` already show for a thin `state`), and namespace every
  `armed` entry with it.
- In `unwindCeremonyEscalation`, carry `escalationId` through to the output **only when the input
  effect has one** — an old-shaped, hand-seeded escalation effect (no `escalationId` field, e.g. a test
  fixture built before this task) must still unwind correctly, producing an output with no
  `escalationId` key at all (never `escalationId: undefined` — this repo's own
  `deepStrictEqual`/`JSON.stringify` convention: never include a property with an `undefined` value).

## Negative Constraints (DO NOT)
- Do NOT touch `escalationTrigger`, any `rule<Kind>` function, the router, `scc`, or `dependentCone`.
- Do NOT change the four trigger conditions (wide R2 / foreign R3 / integration R9 / second R1) — only
  the SHAPE of the effect `ceremonyEscalation` returns once a trigger fires.
- Do NOT read from disk or import anything new — this stays a pure function.

## Implementation Steps

### Step 1: Edit `ceremonyEscalation`

Find (in the "ceremony escalation + R8 appended by T03b" section):

```js
export function ceremonyEscalation(verdict, state) {
  const trigger = escalationTrigger(verdict, state || {});
  if (!trigger) return null;
  const { coneId } = trigger;
  const scale = (state && state.bandScale) || [];
  const current = state && state.bands ? state.bands[coneId] : undefined;
  const idx = scale.indexOf(current);
  if (idx === -1) return null;              // unknown band — cannot place it; never guesses
  const nextIdx = Math.min(idx + 1, scale.length - 1);
  if (nextIdx === idx) return null;         // already at the top band — up only
  return {
    nodeId: coneId,
    change: { band: scale[nextIdx], from: current, armed: ['deep-audit', 'scaffold-recheck', 'tighter-cadence'] },
  };
}
```

Replace it with:

```js
export function ceremonyEscalation(verdict, state) {
  const trigger = escalationTrigger(verdict, state || {});
  if (!trigger) return null;
  const { coneId } = trigger;
  const scale = (state && state.bandScale) || [];
  const current = state && state.bands ? state.bands[coneId] : undefined;
  const idx = scale.indexOf(current);
  if (idx === -1) return null;              // unknown band — cannot place it; never guesses
  const nextIdx = Math.min(idx + 1, scale.length - 1);
  if (nextIdx === idx) return null;         // already at the top band — up only
  // reasonable 3.0 Part 7 (interfaces.md §0 correction 3): namespace this escalation by a STABLE id
  // derived from the cone's own prior-escalation count (state.escalations[coneId] — the same pure
  // counting pattern state.priorVerdicts already uses for R1's "second independent exhaustion"
  // trigger), so two escalations stacked on the same cone before either is ratified can each be
  // independently unwound without cross-contaminating the other's armed markers. Closes the
  // demonstrated defect docs/artifacts.md's P5 retrospective recorded (mutation-tested, not
  // hypothetical): the unwind was exact only for a single, isolated escalation per cone.
  const priorOnThisCone = (state && state.escalations && state.escalations[coneId]) || [];
  const escalationId = `${coneId}#esc${priorOnThisCone.length}`;
  return {
    nodeId: coneId,
    change: {
      escalationId,
      band: scale[nextIdx],
      from: current,
      armed: ['deep-audit', 'scaffold-recheck', 'tighter-cadence'].map((check) => `${check}@${escalationId}`),
    },
  };
}
```

### Step 2: Edit `unwindCeremonyEscalation`

Find:

```js
export function unwindCeremonyEscalation(escalationEffect) {
  if (!escalationEffect || !escalationEffect.change || escalationEffect.change.band === undefined || escalationEffect.change.from === undefined) return [];
  const { nodeId, change } = escalationEffect;
  return [{ nodeId, change: { band: change.from, disarmed: change.armed || [] } }];
}
```

Replace it with:

```js
export function unwindCeremonyEscalation(escalationEffect) {
  if (!escalationEffect || !escalationEffect.change || escalationEffect.change.band === undefined || escalationEffect.change.from === undefined) return [];
  const { nodeId, change } = escalationEffect;
  // Carry escalationId through ONLY when present — an old-shaped, hand-seeded escalation (no
  // escalationId field) must still unwind correctly, producing no escalationId key at all (never
  // `escalationId: undefined`, per this repo's own deepStrictEqual/JSON.stringify convention).
  const out = { band: change.from, disarmed: change.armed || [] };
  if (change.escalationId !== undefined) out.escalationId = change.escalationId;
  return [{ nodeId, change: out }];
}
```

### Step 3: Run the locked tests to verify they pass

```bash
node test/rewrite-ceremony.test.mjs
node test/rewrite-ceremony-stacking.test.mjs
node test/rewrite-ceremony-hardening.test.mjs
```

Expected: all three files report `all <N> checks pass. ✓`, zero `FAIL` lines (the hardening file was
never touched and never hard-codes the escalation's own marker names, so it stays green unmodified).

### Step 4: Confirm zero regression to the whole suite

```bash
for t in test/*.test.mjs; do node "$t"; done
```

No `FAIL` line anywhere — every existing `test/rewrite-*.test.mjs` file, and every already-authored
Part 7 test (`test/ledger-atom-verdict.test.mjs`, `test/ledger-two-phase.test.mjs`, etc. — those compute
their expectations by calling the real functions, never hard-coding the old bare shape, so they track
this change automatically).

### Step 5: Commit

```bash
git add lib/rewrite.mjs
git commit -m "fix(rewrite): namespace ceremony-escalation markers by escalationId — closes P5's demonstrated stacking gap (green, P7)" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

## Acceptance Criteria
- [ ] `node test/rewrite-ceremony.test.mjs`, `node test/rewrite-ceremony-stacking.test.mjs`, and
      `node test/rewrite-ceremony-hardening.test.mjs` all pass with zero failures
- [ ] Only `ceremonyEscalation`/`unwindCeremonyEscalation` were touched in `lib/rewrite.mjs` — every
      rule, the router, `scc`/`dependentCone` are byte-for-byte unchanged
- [ ] `unwindCeremonyEscalation` never emits `escalationId: undefined` on an old-shaped input
- [ ] The whole existing suite still passes; no file outside Scope was modified
