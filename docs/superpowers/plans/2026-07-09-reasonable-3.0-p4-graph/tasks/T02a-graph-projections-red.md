# Task T02a: Graph projection tests (red)

**Role:** `red` — you write ONLY the failing test file below. Do not implement the I/O half of
`lib/graph.mjs` or modify `lib/atom.mjs`.

## References
- Read: `../shared/architecture.md`
- Read: `../shared/interfaces.md` (the exact I/O-section contract you're testing, including
  `lib/atom.mjs`'s two new exports)
- Read: `../shared/conventions.md` (especially the live-contract-fixture note)
- Read: `../knowledge/running-tests.md`
- Read: `lib/graph.mjs` in full (T01b's real, already-landed PURE section — `needsEdges`,
  `excludesEdges`, `ledgerCitationGraph`, etc. are real now)
- Read: `lib/atom.mjs` in full (the real, current `loadAtom`/`foldAtoms`/`charterAtom`/
  `transitionAtom`/`authorDelta`)
- Read: `lib/clause-id.mjs`'s `allocateClauseId` (you will use it to mint real clause ids)
- Read: `lib/contract.mjs`'s `parseContract`/`citationGraph` and `docs/artifacts.md`'s
  `## contracts/<component>.md *` section (the exact v3 grammar your live-contract fixture must
  match — clause id heading, `- Cites:`, `- Demanded-by:`)
- Read: `test/atom-ledger.test.mjs` (the fixture pattern — copy its `newEffort()`/
  `readLedgerLines()` helpers)

## Dependencies
- Depends on: T01b (the real pure exports this file's assertions build on)
- Depended on by: T02b (implements against these locked tests), T02c (audits them)

## Scope

**Files:**
- Create: `test/graph-projections.test.mjs`

**BOUNDARY — you MUST NOT modify any files outside this list. In particular, do NOT append the
I/O section to `lib/graph.mjs` or modify `lib/atom.mjs` — that is T02b's job.**

## Positive Constraints (DO)
- Write a complete, runnable test file following the exact harness convention in
  `../shared/conventions.md` (the `check()` pattern — no framework).
- Import `foldAsLived, deriveCurrent, graphDivergence` from `../lib/graph.mjs` — these do not exist
  yet (RED here is a real assertion failure or `TypeError: ... is not a function`, since
  `lib/graph.mjs` itself DOES already exist from T01b; state clearly in your final report which
  failure mode you observed).
- Also import `foldAtomFromEvents, foldAtomsFromEvents` from `../lib/atom.mjs` — these do not exist
  yet either (same failure mode).
- Build real ledger fixtures via `charterAtom`/`transitionAtom`/`authorDelta`/`allocateClauseId`,
  exactly like `test/atom-ledger.test.mjs` does.
- Build at least one **live, on-disk contract file** fixture (`.reasonable/contracts/<c>.md`,
  written directly with `writeFileSync`, following the v3 grammar) to prove `deriveCurrent` sees a
  citation `foldAsLived` cannot (a clause that landed before any atom tracked it).
- Cover: `foldAtomFromEvents`/`foldAtomsFromEvents` agreeing exactly with `loadAtom`/`foldAtoms`
  over the same events, and `foldAtomFromEvents` returning `null` for an uncharted id.
- Cover: `foldAsLived` computing a needs edge purely from ledger-embedded delta clauses with **no**
  contracts directory on disk at all; `foldAsLived` at an earlier `uptoSeq` excluding atoms
  chartered after that seq; same-component atoms excluding in the as-lived projection too.
- Cover: `deriveCurrent` seeing an excludes edge that exists ONLY because of a landed, on-disk
  contract citation invisible to the ledger-native graph; `deriveCurrent` returning no
  serves/informs edges when called with neither argument.
- Cover: `graphDivergence` being **empty** on an effort whose contracts were only ever touched
  through the ledger-governed atom pipeline (no disk-only citations anywhere), and **non-empty**
  (specifically `edgesOnlyCurrent`) in the disk-drift scenario above.
- Cover the empty-effort baseline: all three projection functions handle zero atoms without
  throwing.

## Negative Constraints (DO NOT)
- Do NOT implement the I/O half of `lib/graph.mjs` or modify `lib/atom.mjs`.
- Do NOT pin the exact wording of any error message — these functions never return an error
  envelope (see `conventions.md`'s error-handling section) — there is nothing to pin.
- Do NOT modify any file outside the Scope section.
- Do NOT modify `lib/graph.mjs`'s PURE section (everything above T01b's marker comment) — read it,
  don't touch it.

## Implementation Steps

### Step 1: Write the failing test file

```js
// test/graph-projections.test.mjs — the as-lived vs. current graph projections (DESIGN-3.0 §2.4,
// reasonable 3.0 Part 4): foldAsLived (ledger-only, self-sufficient), deriveCurrent (ledger + live
// contracts), graphDivergence (the diff between them), plus lib/atom.mjs's two new additive
// exports (foldAtomFromEvents/foldAtomsFromEvents) that make foldAsLived's seq-bounded fold
// possible. Fixture pattern copied from test/atom-ledger.test.mjs's newEffort()/readLedgerLines().

import assert from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  charterAtom, transitionAtom, authorDelta, loadAtom, foldAtoms,
  foldAtomFromEvents, foldAtomsFromEvents,
} from '../lib/atom.mjs';
import { allocateClauseId } from '../lib/clause-id.mjs';
import { foldAsLived, deriveCurrent, graphDivergence } from '../lib/graph.mjs';

const tmps = [];
function newEffort() {
  const root = mkdtempSync(join(tmpdir(), 'graph-projections-test-'));
  tmps.push(root);
  mkdirSync(join(root, '.reasonable'), { recursive: true });
  return root;
}
function writeContract(root, component, body) {
  const dir = join(root, '.reasonable', 'contracts');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${component}.md`), body, 'utf8');
}
function readLedgerLines(root) {
  const p = join(root, '.reasonable', 'ledger.jsonl');
  if (!existsSync(p)) return [];
  return readFileSync(p, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => JSON.parse(l));
}
function driveToSpecd(root, component, { citations = [] } = {}) {
  const { id } = charterAtom(root, { component, premises: ['ledger:1'], purpose: 'test atom', locus: [], order: 0 });
  transitionAtom(root, id, 'ready');
  const alloc = allocateClauseId(root, component);
  authorDelta(root, id, [{ clauseId: alloc.clauseId, citations, demandedBy: null, locus: [] }]);
  return id;
}
function landedContractCitingAst(component) {
  return [
    '---',
    `component: ${component}`,
    '---',
    '',
    '## Clauses',
    '',
    `### ${component}#c1 An already-landed clause`,
    '- Cites: ast#c1',
    '- Demanded-by: goal:g1',
    '',
  ].join('\n');
}

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.stack || e.message}`); process.exitCode = 1; }
}

// ── lib/atom.mjs's two new exports ──────────────────────────────────────────

check('foldAtomFromEvents/foldAtomsFromEvents agree EXACTLY with loadAtom/foldAtoms over the same events', () => {
  const root = newEffort();
  const idA = driveToSpecd(root, 'lexer');
  driveToSpecd(root, 'ast');
  const events = readLedgerLines(root);

  assert.deepStrictEqual(foldAtomFromEvents(events, idA), loadAtom(root, idA));
  assert.deepStrictEqual(foldAtomsFromEvents(events), foldAtoms(root));
});

check('foldAtomFromEvents returns null for an id that was never chartered, matching loadAtom', () => {
  const root = newEffort();
  const events = readLedgerLines(root);
  assert.strictEqual(foldAtomFromEvents(events, 'a-99999'), null);
  assert.strictEqual(loadAtom(root, 'a-99999'), null);
});

// ── foldAsLived: self-sufficient, ledger-only ───────────────────────────────

check('foldAsLived computes a needs edge purely from ledger-embedded delta clauses, no contracts dir on disk', () => {
  const root = newEffort();
  const idB = driveToSpecd(root, 'ast');
  const bClauseId = loadAtom(root, idB).deltaClauses[0].clauseId;
  const idA = driveToSpecd(root, 'lexer', { citations: [{ component: 'ast', clause: bClauseId }] });

  assert.strictEqual(existsSync(join(root, '.reasonable', 'contracts')), false, 'sanity: no contracts dir at all');
  const { edges } = foldAsLived(root);
  assert.ok(edges.some((e) => e.from === idA && e.to === idB && e.edge === 'needs'));
});

check('foldAsLived at an earlier uptoSeq excludes atoms chartered after that seq', () => {
  const root = newEffort();
  const idA = driveToSpecd(root, 'lexer');
  const cutoffSeq = Math.max(...readLedgerLines(root).map((e) => e.seq));
  driveToSpecd(root, 'ast'); // chartered AFTER the cutoff

  const bounded = foldAsLived(root, { uptoSeq: cutoffSeq });
  assert.deepStrictEqual(bounded.atoms.map((a) => a.id), [idA]);

  const unbounded = foldAsLived(root);
  assert.strictEqual(unbounded.atoms.length, 2);
});

check('two atoms of the same component always exclude in the as-lived projection too', () => {
  const root = newEffort();
  const idA = driveToSpecd(root, 'lexer');
  const idB = driveToSpecd(root, 'lexer');
  const { edges } = foldAsLived(root);
  assert.ok(edges.some((e) => e.edge === 'excludes' && [e.from, e.to].sort().join() === [idA, idB].sort().join()));
});

// ── deriveCurrent: sees the REAL, live contract graph too ──────────────────

check('deriveCurrent sees a citation that exists ONLY in a landed, on-disk contract, which foldAsLived cannot', () => {
  const root = newEffort();
  const idLexer = driveToSpecd(root, 'lexer'); // its OWN tracked delta clause cites nothing
  const idAst = driveToSpecd(root, 'ast');
  writeContract(root, 'lexer', landedContractCitingAst('lexer'));

  const asLived = foldAsLived(root);
  const current = deriveCurrent(root);
  const hasExcludes = (edges) => edges.some((e) => e.edge === 'excludes'
    && [e.from, e.to].sort().join() === [idLexer, idAst].sort().join());

  assert.strictEqual(hasExcludes(asLived.edges), false, 'as-lived never sees the disk-only citation');
  assert.strictEqual(hasExcludes(current.edges), true, 'current sees it via the live contract file');
});

check('deriveCurrent returns no serves/informs edges when called with neither argument', () => {
  const root = newEffort();
  driveToSpecd(root, 'lexer');
  const { edges } = deriveCurrent(root);
  assert.ok(!edges.some((e) => e.edge === 'serves' || e.edge === 'informs'));
});

// ── graphDivergence ──────────────────────────────────────────────────────────

check('graphDivergence is EMPTY on an effort whose contracts were only ever touched through this ledger', () => {
  const root = newEffort();
  const idB = driveToSpecd(root, 'ast');
  const bClauseId = loadAtom(root, idB).deltaClauses[0].clauseId;
  driveToSpecd(root, 'lexer', { citations: [{ component: 'ast', clause: bClauseId }] });

  assert.deepStrictEqual(graphDivergence(root), {
    nodesOnlyAsLived: [], nodesOnlyCurrent: [], edgesOnlyAsLived: [], edgesOnlyCurrent: [],
  });
});

check('graphDivergence surfaces an excludes edge that exists in current but not as-lived (disk-only citation)', () => {
  const root = newEffort();
  const idLexer = driveToSpecd(root, 'lexer');
  const idAst = driveToSpecd(root, 'ast');
  writeContract(root, 'lexer', landedContractCitingAst('lexer'));

  const diff = graphDivergence(root);
  assert.deepStrictEqual(diff.nodesOnlyAsLived, []);
  assert.deepStrictEqual(diff.nodesOnlyCurrent, []);
  assert.deepStrictEqual(diff.edgesOnlyAsLived, []);
  assert.ok(diff.edgesOnlyCurrent.some((e) => e.edge === 'excludes'
    && [e.from, e.to].sort().join() === [idLexer, idAst].sort().join()));
});

// ── empty-effort baseline ───────────────────────────────────────────────────

check('foldAsLived/deriveCurrent/graphDivergence all handle an effort with no atoms at all', () => {
  const root = newEffort();
  assert.deepStrictEqual(foldAsLived(root).atoms, []);
  assert.deepStrictEqual(deriveCurrent(root).atoms, []);
  assert.deepStrictEqual(graphDivergence(root), {
    nodesOnlyAsLived: [], nodesOnlyCurrent: [], edgesOnlyAsLived: [], edgesOnlyCurrent: [],
  });
});

for (const d of tmps) {
  try { rmSync(d, { recursive: true, force: true }); }
  catch { /* best-effort cleanup */ }
}

if (process.exitCode) console.error(`\ngraph-projections: FAILURES above (${passed} passed).`);
else console.log(`\ngraph-projections: all ${passed} checks pass. ✓`);
```

### Step 2: Run the test to verify it fails for the right reason

Run: `node test/graph-projections.test.mjs`

Expected: assertion failures / `TypeError`s from calling not-yet-existing exports (`foldAsLived`,
`deriveCurrent`, `graphDivergence` are `undefined` on the real `lib/graph.mjs` module — T01b's file
exists but doesn't export these yet; `foldAtomFromEvents`/`foldAtomsFromEvents` are similarly
`undefined` on the real `lib/atom.mjs`) — **not** a module-not-found error (that would mean
`lib/graph.mjs` or `lib/atom.mjs` itself is missing, which would mean this task is running out of
order; stop and investigate if you see that instead).

### Step 3: Commit

```bash
git add test/graph-projections.test.mjs
git commit -m "test(graph): lock the as-lived/current projection and divergence contract (red)"
```

## Acceptance Criteria
- [ ] `test/graph-projections.test.mjs` exists and matches the harness convention exactly
- [ ] Running it fails for the right reason (undefined exports, not module-not-found)
- [ ] Every function in `interfaces.md`'s I/O section (both `lib/graph.mjs`'s and `lib/atom.mjs`'s
      two new exports) has at least one `check()` covering it
- [ ] At least one test writes a real, on-disk `.reasonable/contracts/*.md` fixture and proves
      `deriveCurrent` sees something `foldAsLived` structurally cannot
- [ ] At least one test proves `graphDivergence` returns all-empty arrays on a clean effort
- [ ] No file outside Scope was modified
- [ ] The I/O half was NOT appended to `lib/graph.mjs`; `lib/atom.mjs` was NOT modified
