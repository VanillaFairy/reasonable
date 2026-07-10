# T02b — Phase-degeneration predicate impl (green)

**role:** green
**Depends on:** T01b (the file + its append-marker must exist), T02a (the locked tests)
**Owns (stage only these):** `lib/ceremony.mjs`

> **Read first:** `../shared/interfaces.md` (§B), `../shared/conventions.md`. You are the `green` role:
> **make the locked tests pass; write no tests.** `test/ceremony-phase.test.mjs` is **READ-ONLY — do not
> modify it.** If a test looks wrong, STOP and escalate to the supervisor; do not edit it to fit your
> implementation.
>
> **You APPEND to `lib/ceremony.mjs` below the marker T01b left** — the exact append-don't-edit
> discipline `lib/rewrite.mjs` used across its triads. **Edit nothing above the marker** (T01b's
> `classify` half is locked and audited). The two halves share no helper, so nothing crosses the marker.

**Files:**
- Modify: `lib/ceremony.mjs` (append the phase-degeneration section below the marker; the classifier half
  and `test/ceremony-classify.test.mjs` are READ-ONLY)

- [ ] **Step 1: Read the locked tests and the file's marker**

Read `test/ceremony-phase.test.mjs` end to end, and open `lib/ceremony.mjs` to find its last line — the
marker `// ── B. phase-degeneration predicates appended by T02b — do not edit above this line ──`. Note:
each predicate returns `{ result: 'materialize' }` or `{ result: 'degenerate', degeneracy: { type:
'phase-degenerated', phase, reason, inputs } }`; the scaffold predicate materializes on a new goal id OR
a newly-chartered atom touching the outer shell (a scenario-cited component, or a not-yet-skeletonized
component); the degeneracy `inputs` are the *evaluated* inputs (empty in the degenerate case).

- [ ] **Step 2: Append this section to `lib/ceremony.mjs`, immediately below the marker line**

Append exactly this (the marker stays; this goes after it):

```js

// Three pure predicates over the genesis graph (§5.4 — the MANDATED PIN: the roadmap requires this
// pinned mechanically, not as prose). Each returns a RESULT tagged union:
//   { result: 'materialize' }                                          — run the phase (the guard has work)
//   { result: 'degenerate', degeneracy: <phase-degenerated record> }   — a PROVEN-EMPTY no-op
// A degeneration is NEVER a silent skip: the record carries the predicate's evaluated inputs, so a
// reviewer sees ran-and-found-nothing. P6c COMPUTES the record; it does NOT append it, and it does NOT
// register a `phase-degenerated` schema in lib/ledger.mjs — that live-writer wiring is P7's (Call #1,
// the same seam as ceremonyEscalation's effect vs. its append). The record is shaped as a
// forward-appendable ledger event ({ type, ... }, the lib/ledger.mjs convention) so P7 appends it
// verbatim once it registers the type. CONSERVATIVE: when in doubt, materialize — never degenerate.

const PHASE_DEGENERATED = 'phase-degenerated';
function degenerate(phase, reason, inputs) {
  return { result: 'degenerate', degeneracy: { type: PHASE_DEGENERATED, phase, reason, inputs } };
}

// The component of a `component#cN` clause ref: an explicit citation.component when present, else the
// prefix before '#'. A LOCAL pure string split — NOT an import of parseClauseId, which would drag
// ledger.mjs/effort.mjs I/O into this pure file (the same import goals.mjs / legibility.mjs refused).
function citationComponent(cite) {
  if (cite && typeof cite.component === 'string' && cite.component.length > 0) return cite.component;
  if (cite && typeof cite.clause === 'string') {
    const h = cite.clause.indexOf('#');
    return h > 0 ? cite.clause.slice(0, h) : cite.clause;
  }
  return null;
}

// The set of `.id`s in a snapshot's goals/atoms array (skips entries with no string id).
function idSet(arr) {
  const s = new Set();
  for (const x of arr || []) if (x && typeof x.id === 'string') s.add(x.id);
  return s;
}

// scaffoldMaterializes(genesis, lastRatified, skeletonComponents) — introduces-a-new-goal-cone OR
// touches-the-outer-shell (§5.4). Each snapshot is { goals:[readGoals-shaped], atoms:[charter-shaped] };
// skeletonComponents is the set of components the walking skeleton already wires end-to-end (recorded at
// the last scaffold sign-off). The FIRST genesis passes lastRatified = { goals: [], atoms: [] }.
export function scaffoldMaterializes(genesis, lastRatified, skeletonComponents) {
  const g = genesis || {};
  const last = lastRatified || {};
  const skeleton = new Set(skeletonComponents || []);

  // (i) introduces-a-new-goal-cone := goalIds(genesis) \ goalIds(lastRatified) != empty.
  const lastGoalIds = idSet(last.goals);
  const newGoalIds = [...idSet(g.goals)].filter((id) => !lastGoalIds.has(id)).sort();

  // (ii) touches-the-outer-shell := EXISTS a newly-chartered atom (in genesis.atoms, not in
  // lastRatified.atoms) that is a depth-0 provider of a goal scenario — its component is named by some
  // goal's scenarioCitations (genesis fidelity: a charter has no clauses yet, so the boundary is drawn
  // at COMPONENT quotient, the planned-fidelity proxy P6a used) — OR whose component is not yet in the
  // skeleton. Either means the outermost end-to-end wiring changed. Over-approximates on purpose: it
  // never under-fires on a genuinely new goal cone (design doc Decision 5's flagged residue).
  const lastAtomIds = idSet(last.atoms);
  const shellComponents = new Set();
  for (const goal of g.goals || []) {
    for (const cite of goal.scenarioCitations || []) {
      const comp = citationComponent(cite);
      if (comp) shellComponents.add(comp);
    }
  }
  const shellAtomIds = [];
  for (const a of g.atoms || []) {
    if (!a || typeof a.id !== 'string' || lastAtomIds.has(a.id)) continue; // newly-chartered only
    if (shellComponents.has(a.component) || !skeleton.has(a.component)) shellAtomIds.push(a.id);
  }
  shellAtomIds.sort();

  if (newGoalIds.length > 0 || shellAtomIds.length > 0) return { result: 'materialize' };
  return degenerate('scaffold',
    'no new goal cone and no newly-chartered atom touches the outer shell',
    { newGoalIds, shellAtomIds }); // both empty — the evaluated inputs a reviewer inspects
}

// rechartingDegenerates(amendmentBatch) — degenerates iff the accumulated amendment batch is empty (no
// amendment ⇒ nothing to retopologize). §5.4/§6.
export function rechartingDegenerates(amendmentBatch) {
  const batch = Array.isArray(amendmentBatch) ? amendmentBatch : [];
  if (batch.length > 0) return { result: 'materialize' };
  return degenerate('recharter', 'the accumulated amendment batch is empty', { amendmentCount: 0 });
}

// retroClassificationDegenerates(landedConeCount) — degenerates iff the fired goal gate spans <= 1
// landed cone (the three-way divergence classification has one cone's worth of nothing to compare). §5.4.
export function retroClassificationDegenerates(landedConeCount) {
  const n = Number.isFinite(landedConeCount) ? landedConeCount : 0;
  if (n >= 2) return { result: 'materialize' };
  return degenerate('retro-classification', 'the fired goal gate spans <= 1 landed cone', { landedConeCount: n });
}
```

- [ ] **Step 3: Run the tests to verify they pass**

Run: `node test/ceremony-phase.test.mjs`
Expected: `ceremony-phase: all N checks pass. ✓` (no `FAIL` line, exit 0).

- [ ] **Step 4: Run the full suite to confirm zero regressions**

Run: `for t in test/*.test.mjs; do node "$t"; done`
Expected: no `FAIL` line anywhere — both `ceremony-classify` and `ceremony-phase` green, and every
pre-existing test still passes (P6c is purely additive; `lib/ceremony.mjs` imports nothing).

- [ ] **Step 5: Commit**

```bash
git add lib/ceremony.mjs
git commit -m "feat(ceremony): scaffold/recharter/retro phase-degeneration predicates — the mandated pin (green, P6c)"
```

**Do not modify the test files, the classifier half above the marker, `docs/`, the roadmap,
`plugin.json`, or the README.** Docs are T03; the roadmap status cell is T04.
