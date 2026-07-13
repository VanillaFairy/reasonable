# Task T03b: Ceremony + unwind + R8 impl (green)

**Role:** `green` — append the T03 section to `lib/rewrite.mjs`, strictly below T02b's marker
(`// ── ceremony escalation + R8 appended by T03b … ──`). Do not modify any test file, and do not
edit anything above that marker.

## References
- Read: `../shared/interfaces.md` (in full), `../shared/conventions.md`, `../knowledge/running-tests.md`
- Read: `docs/superpowers/specs/2026-07-09-reasonable-3.0-p5-rewrite-design.md` Decision 7 (the
  unwind is the flagged open edge — get it exactly right)
- Read: `test/rewrite-ceremony.test.mjs` (T03a's locked tests)
- Read: `lib/rewrite.mjs` in full (you reuse its in-scope `atomById`, `citationClosureOver`, `RULES`)

## Dependencies
- Depends on: T03a (locked tests), T02c (held one wave so you append to an audited file)
- Depended on by: T03c (audits)

## Scope
**Files:**
- Modify: `lib/rewrite.mjs` (append only, strictly below T02b's marker)

**BOUNDARY — you MUST NOT modify any files outside this list.** Do NOT modify
`test/rewrite-ceremony.test.mjs` — locked. Do NOT edit anything above the marker.

## Positive Constraints (DO)
- Append `ceremonyEscalation`, `unwindCeremonyEscalation`, and the R8 rule (`ruleIllegible`,
  registered into `RULES`), plus the private `atomCone`/`escalationTrigger` helpers.
- The unwind MUST be the exact inverse: restore the band to `change.from`, disarm every `change.armed`
  entry — so apply-then-unwind is identity (the locked test proves it).

## Negative Constraints (DO NOT)
- Do NOT do any I/O. Do NOT re-declare `RULES`/`atomById` or re-import `citationClosureOver`. Do NOT
  invent band names or thresholds — read them from `state.bandScale`/`state.bands`/`state.bandBounds`
  (Part 6 supplies real ones later).

## Implementation Steps

### Step 1: Append the T03 section to `lib/rewrite.mjs`

Immediately after the `// ── ceremony escalation + R8 appended by T03b … ──` marker, append:

```js

// The cone an atom belongs to — flat-by-component today (matches lib/graph.mjs's containment
// fallback); Part 6's ownership map refines this without changing this call's shape.
function atomCone(atomId, state) {
  const atom = atomById(state, atomId);
  return atom ? atom.component : null;
}

// The four §7 triggers that may ratchet a cone's band UP. Returns {coneId} or null. Every threshold
// is caller-supplied (state.bandBounds) — this invents no magic number (design doc Decision 7).
function escalationTrigger(verdict, state) {
  const coneId = verdict.coneId || (verdict.atomId ? atomCone(verdict.atomId, state) : null);
  if (!coneId) return null;
  switch (verdict.kind) {
    case 'dead-end': {
      const radius = citationClosureOver(state.citationGraph || {}, [verdict.premise.component]);
      const bound = (state.bandBounds || {})[coneId];
      return typeof bound === 'number' && radius.length > bound ? { coneId } : null;
    }
    case 'ripple':
      return (verdict.manifest || []).length > 0 ? { coneId } : null;
    case 'stale-spec':
      return verdict.integrationExposed === true ? { coneId } : null;
    case 'checkpoint': {
      const prior = (state.priorVerdicts || []).filter((v) => v.atomId === verdict.atomId && v.kind === 'checkpoint').length;
      return prior >= 1 ? { coneId } : null;
    }
    default:
      return null;
  }
}

// A verdict may ratchet the affected cone's complexity band UP — monotone, capped at the top band,
// never down (§7 "ratchets up only"; the tier one-way ratchet). Records `from` so the unwind is
// exact. A sibling call Part 7 makes alongside computeVerdictEffects; the router does not call it.
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

// The exact inverse of a ceremony-escalation effect. Because the escalation only ARMED checks (it
// disarmed no guard), the unwind is pure subtraction: restore the band to `from`, disarm every armed
// check. INVARIANT (locked test): applying an escalation then its unwind is IDENTITY — no residual
// band raise, no residual armed check. This is DESIGN-3.0 open edge (c), built and tested — not
// asserted. A rejected permanent raise unwinds exactly as R7's provisional cone freeze does.
export function unwindCeremonyEscalation(escalationEffect) {
  if (!escalationEffect || !escalationEffect.change || escalationEffect.change.band === undefined) return [];
  const { nodeId, change } = escalationEffect;
  return [{ nodeId, change: { band: change.from, disarmed: change.armed || [] } }];
}

// ── R8 illegible ────────────────────────────────────────────────────────────
// genesis-R8 blocks the topology stage; live-R8 is batched retopology pressure. The density metric
// that TRIGGERS and VALIDATES a regrouping is lib/legibility.mjs (Part 6, not built) — this rule
// emits the proposal SHAPE; the "applied only if it reduces measured density" guard is Part 6's
// (design doc Decision 5 — a named, un-owned gap).
function ruleIllegible(verdict) {
  const { scope, proposal } = verdict;
  if (scope !== 'genesis' && scope !== 'live') {
    return { error: `illegible: scope must be 'genesis' or 'live' (got ${JSON.stringify(scope)})` };
  }
  if (scope === 'genesis') {
    return { provisional: [{ nodeId: 'topology', change: { blocked: true, reason: 'genesis-R8', proposal } }], permanent: [] };
  }
  return { provisional: [], permanent: [{ nodeId: 'topology', change: { retopologyPressure: true, proposal } }] };
}
RULES['illegible'] = ruleIllegible;
```

`atomById`, `citationClosureOver`, `RULES` are defined/imported in the T01 section — in scope as
ordinary same-module bindings; do not re-import or re-declare.

### Step 2: Run the locked tests

Run: `node test/rewrite-ceremony.test.mjs` → all pass, including the apply-then-unwind = identity
check. Re-run the T01/T02 test files → still pass (append-only, below the marker).

### Step 3: Confirm zero regression + full suite

Run the whole suite (`../knowledge/running-tests.md`). Everything green — this is the last code task.

### Step 4: Commit

```bash
git add lib/rewrite.mjs
git commit -m "feat(rewrite): the ceremony-escalation effect, its unwind, and R8"
```

## Acceptance Criteria
- [ ] `node test/rewrite-ceremony.test.mjs` passes, including the identity invariant
- [ ] All four earlier `test/rewrite-*.test.mjs` files still pass
- [ ] Only content BELOW T02b's marker changed
- [ ] The unwind restores the band to `change.from` and disarms `change.armed` — verified by the
      identity test, not just asserted
- [ ] Pure — no I/O; no re-import/re-declare; no invented band names or thresholds
- [ ] Whole suite green; no file outside Scope modified
