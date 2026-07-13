# Task T02a: Structural-verdict tests (red)

**Role:** `red` — you write ONLY the test file below. Do NOT implement the T02 section of
`lib/rewrite.mjs`.

## References
- Read: `../shared/interfaces.md` (the `scc`/`dependentCone` signatures; the R2/R3/R5/R6/R7 payloads)
- Read: `../shared/conventions.md`, `../knowledge/running-tests.md`
- Read: `docs/superpowers/specs/2026-07-09-reasonable-3.0-p5-rewrite-design.md` Decision 5 (R2/R3/
  R5/R6/R7) and Decision 8 (SCC, cone)
- Read: `lib/rewrite.mjs` (T01b's real T01 section — you import `computeVerdictEffects`, and `scc`/
  `dependentCone` which don't exist yet, so RED is a named-import failure) and `lib/effects.mjs`

## Dependencies
- Depends on: T01b (the module + router must exist to import and to build fixtures against)
- Depended on by: T02b (implements against these), T02c (audits)

## Scope
**Files:**
- Create: `test/rewrite-structural.test.mjs`

**BOUNDARY — do NOT modify `lib/rewrite.mjs` or any other file.**

## Positive Constraints (DO)
- Cover `scc` (a 2-cycle, a 3-cycle, a DAG with no multi-node SCC) and `dependentCone` (transitive
  reverse-reachability, self excluded, non-`needs` edges ignored).
- Cover R2 (retire-pending + sorted blast radius + freeze of intersecting atoms only + route +
  permanent retire & amendment intent), R3 (original barred; existing owner enriched not
  double-chartered; enrichment dispatchable; amendment barred; permanent bar-clear), R5 (spike +
  `informs` edges + dependents frozen), R6 (SCC → quarantined birth + barred members; no cycle →
  HALT), R7 (unmerged → ready + adversary escalation; merged → cone freeze only).
- Assert `validateEffects` on every rule's output.

## Negative Constraints (DO NOT)
- Do NOT implement anything in `lib/rewrite.mjs`. Do NOT test ceremony/unwind/R8 (T03a). No
  filesystem.

## Implementation Steps

### Step 1: Write `test/rewrite-structural.test.mjs`

```js
// test/rewrite-structural.test.mjs — the structural-rewrite verdicts R2/R3/R5/R6/R7 and the two new
// graph algorithms scc + dependentCone (DESIGN-3.0 §7, reasonable 3.0 Part 5). Pure, zero-I/O.

import assert from 'node:assert';
import { computeVerdictEffects, scc, dependentCone } from '../lib/rewrite.mjs';
import { validateEffects } from '../lib/effects.mjs';

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.stack || e.message}`); process.exitCode = 1; }
}
function valid(r) { return validateEffects([...r.provisional, ...r.permanent]).ok; }
const bigGroups = (edges) => scc(edges).filter((g) => g.length > 1).map((g) => g.slice().sort());

// ── scc ────────────────────────────────────────────────────────────────────────

check('scc finds a 2-cycle', () => {
  assert.deepStrictEqual(bigGroups([{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }]), [['a', 'b']]);
});
check('scc finds a 3-cycle', () => {
  assert.deepStrictEqual(bigGroups([{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }, { from: 'c', to: 'a' }]), [['a', 'b', 'c']]);
});
check('scc reports no multi-node component for a DAG', () => {
  assert.deepStrictEqual(bigGroups([{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }]), []);
});

// ── dependentCone ──────────────────────────────────────────────────────────────

check('dependentCone is transitive reverse-reachability over needs, excluding the atom itself', () => {
  const edges = [{ from: 'a-2', to: 'a-1', edge: 'needs' }, { from: 'a-3', to: 'a-2', edge: 'needs' }];
  assert.deepStrictEqual([...dependentCone('a-1', edges)].sort(), ['a-2', 'a-3']);
  assert.ok(!dependentCone('a-1', edges).has('a-1'));
});
check('dependentCone ignores non-needs edges', () => {
  const edges = [{ from: 'a-9', to: 'a-1', edge: 'excludes' }];
  assert.deepStrictEqual([...dependentCone('a-1', edges)], []);
});

// ── R2 dead-end ────────────────────────────────────────────────────────────────

check('R2 retires the atom pending, records the sorted blast radius, and freezes ONLY intersecting atoms', () => {
  const state = {
    atoms: [
      { id: 'a-1', component: 'lexer', state: "spec'd", deltaClauses: [{ clauseId: 'lexer#c1', citations: [{ component: 'x', clause: 'x#c1' }] }] },
      { id: 'a-2', component: 'y', state: 'packed', deltaClauses: [{ clauseId: 'y#c1', citations: [{ component: 'x', clause: 'x#c1' }] }] },
      { id: 'a-3', component: 'z', state: 'packed', deltaClauses: [{ clauseId: 'z#c1', citations: [] }] },
    ],
    citationGraph: { lexer: ['x'], x: [], y: ['x'], z: [] },
  };
  const premise = { component: 'x', clause: 'x#c1', layer: 'contract' };
  const r = computeVerdictEffects({ kind: 'dead-end', atomId: 'a-1', premise }, state);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.route, 'amendment');
  assert.deepStrictEqual(r.provisional, [
    { nodeId: 'a-1', change: { state: 'retired-pending', premise, blastRadius: ['x'] } },
    { nodeId: 'a-2', change: { flag: 'frozen', op: 'set', reason: 'R2 blast radius' } },
  ]);
  assert.deepStrictEqual(r.permanent, [
    { nodeId: 'a-1', change: { state: 'retired', lineage: 'R2-gate' } },
    { nodeId: 'a-1/amend-0', change: { charter: { demandedBy: 'gate:R2', route: 'amendment' }, lineage: 'a-1' } },
  ]);
  assert.ok(valid(r));
});

// ── R3 ripple ────────────────────────────────────────────────────────────────

check('R3 bars the original, enriches an existing owner (no double-charter), and splits enrich/amend', () => {
  const state = {
    atoms: [
      { id: 'a-1', component: 'lexer', state: 'packed', deltaClauses: [] },
      { id: 'a-8', component: 'ast', state: 'merged', deltaClauses: [{ clauseId: 'ast#c5', citations: [] }] },
    ],
  };
  const manifest = [
    { component: 'ast', clause: 'ast#c5', type: 'enrich' }, // owner a-8 exists → enrich it
    { component: 'io', clause: 'io#c1', type: 'enrich' },   // no owner → dispatchable charter
    { component: 'db', clause: 'db#c1', type: 'amend' },    // no owner → barred charter
  ];
  const r = computeVerdictEffects({ kind: 'ripple', atomId: 'a-1', manifest }, state);
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.provisional, [
    { nodeId: 'a-1', change: { flag: 'dispatch-barred', op: 'set', reason: 'R3 ripple' } },
    { nodeId: 'a-8', change: { enrich: { component: 'ast', clause: 'ast#c5', type: 'enrich' }, lineage: 'a-1' } },
    { nodeId: 'a-1/foreign-io', change: { charter: { component: 'io', clause: 'io#c1' }, lineage: 'a-1', dispatchFree: true } },
    { nodeId: 'a-1/foreign-db', change: { charter: { component: 'db', clause: 'db#c1' }, flag: 'dispatch-barred', lineage: 'a-1' } },
  ]);
  assert.deepStrictEqual(r.permanent, [
    { nodeId: 'a-1', change: { flag: 'dispatch-barred', op: 'clear', reason: 'R3 amendment ratified' } },
  ]);
  assert.ok(valid(r));
});

// ── R5 unknown-blocking ──────────────────────────────────────────────────────

check('R5 inserts a spike node, wires informs edges to the atom and its dependents, and freezes them', () => {
  const state = { atoms: [{ id: 'a-1', component: 'lexer', state: 'packed', deltaClauses: [] }] };
  const r = computeVerdictEffects({ kind: 'unknown-blocking', atomId: 'a-1', question: 'is X feasible?', dependents: ['a-2'] }, state);
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.provisional, [
    { nodeId: 'spike/a-1', change: { charter: { kind: 'spike', question: 'is X feasible?' }, lineage: 'a-1' } },
    { from: 'spike/a-1', to: 'a-1', edge: 'informs', op: 'add' },
    { from: 'spike/a-1', to: 'a-2', edge: 'informs', op: 'add' },
    { nodeId: 'a-2', change: { flag: 'frozen', op: 'set', reason: 'R5 awaits spike' } },
  ]);
  assert.deepStrictEqual(r.permanent, [{ nodeId: 'spike/a-1', change: { consumedAtGate: true } }]);
  assert.ok(valid(r));
});

// ── R6 cycle-detected ────────────────────────────────────────────────────────

check('R6 quarantines a birth for the named concept and bars every SCC member', () => {
  const state = { edges: [{ from: 'a-1', to: 'a-2', edge: 'needs' }, { from: 'a-2', to: 'a-1', edge: 'needs' }] };
  const r = computeVerdictEffects({ kind: 'cycle-detected', concept: 'shared-buffer' }, state);
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.provisional, [
    { nodeId: 'birth/shared-buffer', change: { charter: { concept: 'shared-buffer', quarantined: true }, dispatchesNothing: true } },
    { nodeId: 'a-1', change: { flag: 'dispatch-barred', op: 'set', reason: 'R6 SCC' } },
    { nodeId: 'a-2', change: { flag: 'dispatch-barred', op: 'set', reason: 'R6 SCC' } },
  ]);
  assert.deepStrictEqual(r.permanent, [{ nodeId: 'birth/shared-buffer', change: { birthRatified: true, retargetCitations: 'provider-first' } }]);
  assert.ok(valid(r));
});

check('R6 HALTs when the needs graph has no cycle', () => {
  const state = { edges: [{ from: 'a-1', to: 'a-2', edge: 'needs' }] };
  assert.strictEqual(computeVerdictEffects({ kind: 'cycle-detected', concept: 'x' }, state).ok, false);
});

// ── R7 parity-breach ─────────────────────────────────────────────────────────

check('R7 on an UNMERGED atom re-enters as R1-shaped with an adversary escalation', () => {
  const state = { atoms: [{ id: 'a-1', component: 'lexer', state: 'audited', deltaClauses: [] }] };
  const r = computeVerdictEffects({ kind: 'parity-breach', atomId: 'a-1', breachEvidence: 'mutation survived' }, state);
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.provisional, [
    { nodeId: 'a-1', change: { state: 'ready', revertToGreen: true, adversaryEscalation: true, reprice: { factor: 'α' } } },
  ]);
  assert.deepStrictEqual(r.permanent, []);
  assert.ok(valid(r));
});

check('R7 on a MERGED atom freezes the dependent cone only', () => {
  const state = {
    atoms: [{ id: 'a-1', component: 'lexer', state: 'merged', deltaClauses: [] }],
    edges: [{ from: 'a-2', to: 'a-1', edge: 'needs' }, { from: 'a-3', to: 'a-2', edge: 'needs' }],
  };
  const r = computeVerdictEffects({ kind: 'parity-breach', atomId: 'a-1', breachEvidence: 'regression' }, state);
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.provisional, [
    { nodeId: 'a-2', change: { flag: 'frozen', op: 'set', reason: 'R7 dependent cone' } },
    { nodeId: 'a-3', change: { flag: 'frozen', op: 'set', reason: 'R7 dependent cone' } },
  ]);
  assert.deepStrictEqual(r.permanent, [{ nodeId: 'a-1', change: { remediation: 'revert-or-forward-fix', gateRatified: true } }]);
  assert.ok(valid(r));
});

if (process.exitCode) console.error(`\nrewrite-structural: FAILURES above (${passed} passed).`);
else console.log(`\nrewrite-structural: all ${passed} checks pass. ✓`);
```

### Step 2: Run to verify RED

Run: `node test/rewrite-structural.test.mjs`. Expected: a **named-import** error (`scc`/
`dependentCone` are not exported yet) or assertion failures on the unregistered structural kinds
(they HALT until T02b registers them) — a genuine RED, not a pass.

### Step 3: Commit

```bash
git add test/rewrite-structural.test.mjs
git commit -m "test(rewrite): lock the R2/R3/R5/R6/R7 + scc/cone contract (red)"
```

## Acceptance Criteria
- [ ] File exists, matches the harness convention, and fails RED for the right reason
- [ ] `scc`, `dependentCone`, and all five structural verdicts (happy path + R6's no-cycle HALT +
      R7's merged/unmerged split) are covered, each asserted `validateEffects`-valid
- [ ] No filesystem; no file outside Scope modified
