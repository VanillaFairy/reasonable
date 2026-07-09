# Task T02b: Graph projection impl + `lib/atom.mjs` export addition (green)

**Role:** `green` — append `lib/graph.mjs`'s I/O section below T01b's marker comment, and make a
small, additive change to `lib/atom.mjs`. Do not modify any test file, and do not edit anything
above `lib/graph.mjs`'s marker.

## References
- Read: `../shared/architecture.md`
- Read: `../shared/interfaces.md` in full
- Read: `../shared/conventions.md` (especially "the one shared-file touch: T02b modifies
  `lib/atom.mjs`")
- Read: `../knowledge/running-tests.md`
- Read: `lib/graph.mjs` in full before editing it — T01b's real PURE section, and the exact marker
  comment you're appending below
- Read: `lib/atom.mjs` in full before editing it — you are renaming its existing private
  `foldOneAtom` function, not writing a new one
- Read: `lib/contract.mjs`'s `citationGraph` export (you will import it, aliased, for
  `deriveCurrent`)
- Read: `lib/effort.mjs`'s `readJsonl` (you will import it)

## Dependencies
- Depends on: T02a (locked tests), T01b (the real PURE section this appends to)
- Depended on by: T02c (audits this)

## Scope

**Files:**
- Modify: `lib/graph.mjs` (append only, strictly below T01b's marker comment)
- Modify: `lib/atom.mjs` (rename one private function to two additive exports; refactor two
  existing exports to call them — no other change)

**BOUNDARY — you MUST NOT modify any files outside this list.**

**Do NOT modify `test/graph-containment.test.mjs`, `test/graph-edges.test.mjs`, or
`test/graph-projections.test.mjs` — locked.** If you believe a test is wrong, stop and escalate.

**Do NOT modify `test/atom-lifecycle.test.mjs`, `test/atom-cohesion.test.mjs`, or
`test/atom-ledger.test.mjs`** — none of Part 3's tests should need to change; if one of them breaks
because of your `lib/atom.mjs` edit, that is a signal you changed more than the additive rename this
task specifies. Stop and escalate rather than editing a Part 3 test to compensate.

**Do NOT edit anything in `lib/graph.mjs` above the
`// ── I/O functions appended by T02b ... ──` marker line.** If you believe the pure section's
interface is missing something you need, that's a signal to stop and escalate, not to silently
rewrite T01b's locked code.

## Positive Constraints (DO)
- Implement exactly the exports named in `../shared/interfaces.md`'s `lib/graph.mjs` I/O section:
  `foldAsLived`, `deriveCurrent`, `graphDivergence`.
- In `lib/atom.mjs`, rename the existing private `foldOneAtom(events, atomId)` function to an
  **exported** `foldAtomFromEvents(events, atomId)` — same body, no logic change — and add a new
  exported `foldAtomsFromEvents(events)` sibling. Refactor `loadAtom`/`foldAtoms` to call these two
  instead of the old private name.
- `foldAsLived` must compute its citation graph via `ledgerCitationGraph` (never touch
  `lib/contract.mjs`); `deriveCurrent` must compute its citation graph via the real, live
  `citationGraph(effortRoot)` imported from `lib/contract.mjs`.

## Negative Constraints (DO NOT)
- Do NOT modify any of the four test files listed above.
- Do NOT edit `lib/graph.mjs` above the marker comment.
- Do NOT change `lib/atom.mjs`'s `charterAtom`/`transitionAtom`/`authorDelta`/`enrichDelta`/
  `setFlag`/`clearFlag` — their bodies, signatures, and behavior are untouched.
- Do NOT have `foldAsLived`/`deriveCurrent` write anything — both are read-only; neither calls
  `append()`.
- Do NOT import `lib/footprint.mjs` or `lib/route.mjs` anywhere in this diff.

## Implementation Steps

### Step 1: Read the locked tests and the real pure sections

Read `test/graph-projections.test.mjs` (T02a), the current `lib/graph.mjs` (T01b's real pure
section, ending in the marker comment), and the current `lib/atom.mjs` in full before writing any
code.

### Step 2: Rename `foldOneAtom` to two additive exports in `lib/atom.mjs`

Find this exact existing text in `lib/atom.mjs`:

```js
/** Fold every atom-* event belonging to `atomId` out of an already-loaded event array. Internal —
 *  not exported; loadAtom/foldAtoms are the public read surface. */
function foldOneAtom(events, atomId) {
```

Replace it with:

```js
/** Fold every atom-* event belonging to `atomId` out of an ALREADY-LOADED events array — exposed so
 *  a caller holding its own pre-filtered event array (e.g. a seq-bounded slice) can fold without
 *  re-reading the ledger file itself (reasonable 3.0 Part 4 — lib/graph.mjs's as-lived projection
 *  is this function's first caller). loadAtom/foldAtoms below are still the ordinary,
 *  whole-ledger read surface for everyone else. */
export function foldAtomFromEvents(events, atomId) {
```

(Everything else inside the function body is unchanged — only the doc comment and the `function` →
`export function` keyword change.)

Then find this exact existing text (the tail of the file):

```js
export function loadAtom(effortRoot, atomId) {
  const events = readJsonl(ledgerPath(effortRoot));
  return foldOneAtom(events, atomId);
}

export function foldAtoms(effortRoot) {
  const events = readJsonl(ledgerPath(effortRoot));
  const ids = events.filter((e) => e.type === 'atom-chartered').map((e) => `a-${e.seq}`);
  const result = {};
  for (const id of ids) result[id] = foldOneAtom(events, id);
  return result;
}
```

Replace it with:

```js
/** Fold every chartered atom out of an ALREADY-LOADED events array — foldAtoms's own body, minus
 *  its own readJsonl call (reasonable 3.0 Part 4 — lib/graph.mjs's as-lived projection needs this
 *  composable with a pre-filtered event array). */
export function foldAtomsFromEvents(events) {
  const ids = events.filter((e) => e.type === 'atom-chartered').map((e) => `a-${e.seq}`);
  const result = {};
  for (const id of ids) result[id] = foldAtomFromEvents(events, id);
  return result;
}

export function loadAtom(effortRoot, atomId) {
  const events = readJsonl(ledgerPath(effortRoot));
  return foldAtomFromEvents(events, atomId);
}

export function foldAtoms(effortRoot) {
  const events = readJsonl(ledgerPath(effortRoot));
  return foldAtomsFromEvents(events);
}
```

That is the entire `lib/atom.mjs` diff — a rename, one new small function, and two callers updated
to use them. `charterAtom`, `transitionAtom`, `authorDelta`, `enrichDelta`, `setFlag`, `clearFlag`
are untouched.

### Step 3: Append `lib/graph.mjs`'s I/O section

At the very bottom of `lib/graph.mjs`, immediately after the
`// ── I/O functions appended by T02b (see shared/conventions.md — do not edit above this line) ──`
marker line, append:

```js

import { foldAtomsFromEvents } from './atom.mjs';
import { readJsonl } from './effort.mjs';
import { join } from 'node:path';
import { citationGraph as liveCitationGraph } from './contract.mjs';

function ledgerPath(effortRoot) {
  return join(effortRoot, '.reasonable', 'ledger.jsonl');
}

export function foldAsLived(effortRoot, { uptoSeq } = {}) {
  const events = readJsonl(ledgerPath(effortRoot))
    .filter((e) => uptoSeq === undefined || e.seq <= uptoSeq);
  const folded = foldAtomsFromEvents(events);
  const atoms = Object.values(folded);
  const containment = containmentTree(atoms);
  const graph = ledgerCitationGraph(atoms);
  const edges = [
    ...needsEdges(atoms),
    ...excludesEdges(atoms, { citationGraph: graph }),
  ];
  return { containment, atoms, edges };
}

export function deriveCurrent(effortRoot, { goals = [], spikeInforms = [] } = {}) {
  const events = readJsonl(ledgerPath(effortRoot));
  const folded = foldAtomsFromEvents(events);
  const atoms = Object.values(folded);
  const containment = containmentTree(atoms);
  const graph = liveCitationGraph(effortRoot);
  const edges = [
    ...needsEdges(atoms),
    ...excludesEdges(atoms, { citationGraph: graph }),
    ...servesEdges(atoms, goals),
    ...informsEdges(atoms, spikeInforms),
  ];
  return { containment, atoms, edges };
}

function edgeKey(e) { return `${e.from} ${e.to} ${e.edge}`; }

export function graphDivergence(effortRoot) {
  const asLived = foldAsLived(effortRoot);
  const current = deriveCurrent(effortRoot);
  const asLivedIds = new Set(asLived.atoms.map((a) => a.id));
  const currentIds = new Set(current.atoms.map((a) => a.id));
  const asLivedEdgeMap = new Map(asLived.edges.map((e) => [edgeKey(e), e]));
  const currentEdgeMap = new Map(current.edges.map((e) => [edgeKey(e), e]));

  return {
    nodesOnlyAsLived: [...asLivedIds].filter((id) => !currentIds.has(id)),
    nodesOnlyCurrent: [...currentIds].filter((id) => !asLivedIds.has(id)),
    edgesOnlyAsLived: [...asLivedEdgeMap.entries()].filter(([k]) => !currentEdgeMap.has(k)).map(([, e]) => e),
    edgesOnlyCurrent: [...currentEdgeMap.entries()].filter(([k]) => !asLivedEdgeMap.has(k)).map(([, e]) => e),
  };
}
```

`containmentTree`, `needsEdges`, `excludesEdges`, `ledgerCitationGraph`, `servesEdges`,
`informsEdges` referenced above are the real functions T01b already defined earlier in this same
file — no import needed, they're in scope as ordinary same-module bindings.

### Step 4: Run the locked tests to verify they pass

Run: `node test/graph-projections.test.mjs`

Expected: `graph-projections: all <N> checks pass. ✓`, zero `FAIL` lines.

Also re-run `node test/graph-containment.test.mjs` and `node test/graph-edges.test.mjs` — T01b's
tests must still pass unchanged (you only appended below the marker, nothing above should be
affected).

### Step 5: Run the existing atom/ledger suite to confirm zero regression

Run `node test/atom-lifecycle.test.mjs`, `node test/atom-cohesion.test.mjs`, `node
test/atom-ledger.test.mjs`, `node test/ledger.test.mjs`, `node test/contract.test.mjs`, and `node
test/contract-v3-grammar.test.mjs`.

Expected: all six pass exactly as before this task — the `lib/atom.mjs` change is a rename plus one
small additive function; every existing caller's behavior is unchanged.

### Step 6: Commit

```bash
git add lib/graph.mjs lib/atom.mjs
git commit -m "feat(graph): wire the as-lived/current projections and divergence check"
```

## Acceptance Criteria
- [ ] `node test/graph-projections.test.mjs` passes with zero failures
- [ ] `node test/graph-containment.test.mjs` and `node test/graph-edges.test.mjs` still pass (no
      regression from appending to the same file)
- [ ] `node test/atom-lifecycle.test.mjs`, `node test/atom-cohesion.test.mjs`, `node
      test/atom-ledger.test.mjs` still pass unchanged (no regression from the `lib/atom.mjs` rename)
- [ ] None of the four test files were modified
- [ ] Nothing above T01b's marker comment in `lib/graph.mjs` was changed
- [ ] `lib/atom.mjs`'s diff is exactly the rename + one new function + two refactored call sites —
      `charterAtom`/`transitionAtom`/`authorDelta`/`enrichDelta`/`setFlag`/`clearFlag` untouched
- [ ] No file outside Scope was modified
