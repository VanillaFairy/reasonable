# T01b — Planned-edge impl (green)

**role:** green
**Depends on:** T01a
**Owns (stage only these):** `lib/graph.mjs`

> **Read first:** `../shared/interfaces.md`, `../shared/conventions.md`. You are the `green` role:
> **make the locked tests pass; write no tests.** `test/graph-planned-edges.test.mjs` is
> **READ-ONLY — do not modify it.** If a test looks wrong, STOP and escalate to the supervisor; do
> not edit it to fit your implementation.

**Files:**
- Modify: `lib/graph.mjs` (add one import at the top; add `plannedNeedsEdges` in the **pure** section,
  immediately above the `// ── I/O functions appended by T02b …` marker)

- [ ] **Step 1: Read the locked tests**

Read `test/graph-planned-edges.test.mjs` end to end. Note the edge direction (consumer → provider;
later-order → earlier-order), the dedup + no-self-edge requirement, and that fixtures are plain
charter literals `{ id, component, premises, order }`.

- [ ] **Step 2: Add the import at the top of `lib/graph.mjs`**

Immediately after the header comment block (before `export function containmentTree`), add:

```js
import { parseClauseId } from './clause-id.mjs';
```

`parseClauseId` is the shipped, pure shape helper (`{component, n} | null`, never throws). Do **not**
re-implement the `<component>#c<N>` regex — reuse the public export (DRY). This import is safe: it is
pure, and `clause-id.mjs`'s transitive imports (`ledger.mjs`, `effort.mjs`) are already loaded when
`graph.mjs` is imported (its I/O section imports `atom.mjs` → `ledger.mjs`), so nothing new runs and
no import cycle is introduced (`clause-id.mjs` imports neither `graph.mjs` nor anything that does).

- [ ] **Step 3: Add `plannedNeedsEdges` in the pure section, above the I/O marker**

Insert this immediately **before** the line
`// ── I/O functions appended by T02b (see shared/conventions.md — do not edit above this line) ──`:

```js
// ── planned needs (DESIGN-3.0 §2.2 — the "planned" edge fidelity; reasonable 3.0 Part 6a) ──
//
// Genesis-time needs edges, derived from CHARTERS alone — before any delta exists. `needsEdges`
// (above) reads deltaClauses[].citations, spec-time data a charter has none of, so it returns [] at
// genesis; this is its planned sibling. Two sources, unioned (§2.2):
//   (a) cross-component quotient — a `cite:Y#cN` premise means this atom's component planned-needs
//       component Y, so the atom planned-needs EVERY atom of Y. A same-component cite is left to (b)
//       (intra-component order is the source of truth there); a non-cite premise, or a cite whose
//       ref does not parse as a clause id (e.g. a future intention address — P3's un-owned gap),
//       yields no edge.
//   (b) intra-component ordering — within one component, an atom planned-needs every atom in the
//       immediately-preceding `order` stratum (equal-order atoms are concurrent).
// Same {from,to,edge:'needs',op:'add'} shape as needsEdges: planned vs actual is which function
// produced the array (as foldAsLived vs deriveCurrent), never a per-edge tag.
export function plannedNeedsEdges(charters) {
  const idsByComponent = new Map();
  for (const c of charters) {
    if (!idsByComponent.has(c.component)) idsByComponent.set(c.component, []);
    idsByComponent.get(c.component).push(c.id);
  }

  const edges = [];
  const seen = new Set();
  const push = (from, to) => {
    if (from === to) return;
    const key = `${from} ${to}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({ from, to, edge: 'needs', op: 'add' });
  };

  // (a) cross-component, from `cite:` premises
  for (const c of charters) {
    for (const premise of c.premises || []) {
      if (typeof premise !== 'string' || !premise.startsWith('cite:')) continue;
      const parsed = parseClauseId(premise.slice(5)); // 'cite:'.length === 5
      if (!parsed || parsed.component === c.component) continue;
      for (const providerId of idsByComponent.get(parsed.component) || []) push(c.id, providerId);
    }
  }

  // (b) intra-component, from `order` strata
  const membersByComponent = new Map();
  for (const c of charters) {
    if (!membersByComponent.has(c.component)) membersByComponent.set(c.component, []);
    membersByComponent.get(c.component).push({ id: c.id, order: Number.isInteger(c.order) ? c.order : 0 });
  }
  for (const members of membersByComponent.values()) {
    const strata = new Map();
    for (const m of members) {
      if (!strata.has(m.order)) strata.set(m.order, []);
      strata.get(m.order).push(m.id);
    }
    const orders = [...strata.keys()].sort((a, b) => a - b);
    for (let i = 1; i < orders.length; i += 1) {
      for (const cur of strata.get(orders[i])) {
        for (const prev of strata.get(orders[i - 1])) push(cur, prev);
      }
    }
  }

  return edges;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node test/graph-planned-edges.test.mjs`
Expected: `graph-planned-edges: all N checks pass. ✓` (no `FAIL` line, exit 0).

- [ ] **Step 5: Run the full suite to confirm zero regressions**

Run: `for t in test/*.test.mjs; do node "$t"; done`
Expected: no `FAIL` line anywhere — this part is purely additive, so every pre-existing test
(including the P4 `graph-projections` tests) still passes unchanged.

- [ ] **Step 6: Commit**

```bash
git add lib/graph.mjs
git commit -m "feat(graph): plannedNeedsEdges — the planned-fidelity needs fold (green, P6a)"
```

**Do not modify the test file, `docs/`, the roadmap, `plugin.json`, or the README.** Docs are T02;
the roadmap status cell is T03.
