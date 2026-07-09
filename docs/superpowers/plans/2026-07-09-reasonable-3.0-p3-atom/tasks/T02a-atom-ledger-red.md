# Task T02a: Atom ledger integration tests (red)

**Role:** `red` — you write ONLY the failing test file below. Do not implement the I/O half of
`lib/atom.mjs` or modify `lib/ledger.mjs`.

## References
- Read: `../shared/architecture.md`
- Read: `../shared/interfaces.md` (the exact I/O-section contract you're testing, and the six
  `EVENT_SCHEMAS` lines)
- Read: `../shared/conventions.md`
- Read: `../knowledge/running-tests.md`
- Read: `lib/atom.mjs` in full (T01b's real, already-landed PURE section — `LIFECYCLE_STATES`,
  `isValidTransition`, etc. are real now; import them where useful for fixture construction)
- Read: `lib/ledger.mjs` in full (the real, current `validateEvent`/`append`)
- Read: `lib/clause-id.mjs`'s `allocateClauseId` (one test composes with it for real, to prove
  interoperability — see Step 1)
- Read: `test/clause-id.test.mjs` (Part 2's fixture pattern — copy its `newEffort()`/
  `readLedgerLines()` helpers)

## Dependencies
- Depends on: T01b (the real pure exports this file's fixtures and assertions build on)
- Depended on by: T02b (implements against these locked tests), T02c (audits them)

## Scope

**Files:**
- Create: `test/atom-ledger.test.mjs`

**BOUNDARY — you MUST NOT modify any files outside this list. In particular, do NOT append the
I/O section to `lib/atom.mjs` or modify `lib/ledger.mjs` — that is T02b's job.**

## Positive Constraints (DO)
- Write a complete, runnable test file following the exact harness convention in
  `../shared/conventions.md` (the `check()` pattern — no framework).
- Import `charterAtom, authorDelta, enrichDelta, transitionAtom, setFlag, clearFlag, loadAtom,
  foldAtoms` from `../lib/atom.mjs` — these do not exist yet (RED here is a real assertion
  failure or `TypeError: ... is not a function`, since `lib/atom.mjs` itself DOES already exist
  from T01b; state clearly in your final report which failure mode you observed).
- Also import `validateEvent, append` from `../lib/ledger.mjs` (pins the six new schema entries
  directly, independent of `lib/atom.mjs`'s wrapper functions).
- Test every function primarily **through round-trips**: write via the public API, read back via
  `loadAtom`/`foldAtoms`, assert the read matches what was written — you do not need to know or
  assert any internal ledger event field name beyond what `interfaces.md`'s `EVENT_SCHEMAS` table
  pins as `required`.
- Cover: `charterAtom` (mints `a-<seq>`, rejects malformed component/premise/purpose before
  writing anything), `transitionAtom` (valid move succeeds and updates `loadAtom`'s `state`,
  invalid move rejected and writes nothing), `authorDelta` (requires `ready` state, transitions to
  `spec'd`, rejected from the wrong state), `enrichDelta` (requires an in-flight state, appends to
  `deltaClauses`, rejected from `ready`), `setFlag`/`clearFlag` (valid flag round-trips through
  `loadAtom().flags`, invalid flag name rejected, clearing an already-clear flag is a no-op
  success), `loadAtom` (unknown id → `null`; a full charter→ready→spec'd→packed→enrich→flag
  sequence folds correctly, in order), `foldAtoms` (empty effort → `{}`; multiple atoms keyed by
  id, each matching a separate `loadAtom` call).

## Negative Constraints (DO NOT)
- Do NOT implement the I/O half of `lib/atom.mjs` or modify `lib/ledger.mjs`.
- Do NOT pin the exact wording of any error message beyond what `interfaces.md` documents — match
  with `assert.match`, not `assert.strictEqual` on a full string.
- Do NOT modify any file outside the Scope section.
- Do NOT modify `lib/atom.mjs`'s PURE section (everything above T01b's marker comment) — read it,
  don't touch it.

## Implementation Steps

### Step 1: Write the failing test file

```js
// test/atom-ledger.test.mjs — the atom's ledger-integration layer (DESIGN-3.0 §4.1, reasonable
// 3.0 Part 3): charterAtom/authorDelta/enrichDelta/transitionAtom/setFlag/clearFlag, and the
// loadAtom/foldAtoms derived-mirror fold. Fixture pattern copied from test/clause-id.test.mjs
// (Part 2). Tested primarily through round-trips against loadAtom/foldAtoms, not by hand-parsing
// raw ledger lines (this file doesn't need to know internal event field names beyond what
// interfaces.md's EVENT_SCHEMAS table pins as `required`).

import assert from 'node:assert';
import { mkdtempSync, mkdirSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  charterAtom, authorDelta, enrichDelta, transitionAtom, setFlag, clearFlag, loadAtom, foldAtoms,
} from '../lib/atom.mjs';
import { allocateClauseId } from '../lib/clause-id.mjs';
import { validateEvent, append } from '../lib/ledger.mjs';

const tmps = [];
function newEffort() {
  const root = mkdtempSync(join(tmpdir(), 'atom-ledger-test-'));
  tmps.push(root);
  mkdirSync(join(root, '.reasonable'), { recursive: true });
  return root;
}
function readLedgerLines(root) {
  const p = join(root, '.reasonable', 'ledger.jsonl');
  if (!existsSync(p)) return [];
  return readFileSync(p, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => JSON.parse(l));
}
const CHARTER = { component: 'lexer', premises: ['ledger:1'], purpose: 'Tokenize source text.', locus: ['lib/lexer/'], order: 0 };

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.stack || e.message}`); process.exitCode = 1; }
}

// ── charterAtom ──────────────────────────────────────────────────────────────

check('charterAtom mints an id shaped a-<seq> and loadAtom reflects the charter', () => {
  const root = newEffort();
  const r = charterAtom(root, CHARTER);
  assert.strictEqual(r.ok, true, r.error);
  assert.strictEqual(r.id, `a-${r.seq}`);
  const atom = loadAtom(root, r.id);
  assert.strictEqual(atom.component, 'lexer');
  assert.deepStrictEqual(atom.premises, ['ledger:1']);
  assert.strictEqual(atom.purpose, 'Tokenize source text.');
  assert.deepStrictEqual(atom.locus, ['lib/lexer/']);
  assert.strictEqual(atom.order, 0);
  assert.strictEqual(atom.state, 'chartered');
});

check('charterAtom rejects a malformed component and writes NOTHING', () => {
  const root = newEffort();
  const r = charterAtom(root, { ...CHARTER, component: 'Lexer' });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(readLedgerLines(root).length, 0);
});

check('charterAtom rejects a premise that is not a well-formed tagged reference', () => {
  const root = newEffort();
  const r = charterAtom(root, { ...CHARTER, premises: ['not-a-tagged-reference'] });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(readLedgerLines(root).length, 0);
});

check('charterAtom rejects an empty purpose', () => {
  const root = newEffort();
  const r = charterAtom(root, { ...CHARTER, purpose: '' });
  assert.strictEqual(r.ok, false);
});

check("two charters for the SAME component never collide (each gets a distinct global id)", () => {
  const root = newEffort();
  const a = charterAtom(root, CHARTER);
  const b = charterAtom(root, CHARTER);
  assert.notStrictEqual(a.id, b.id);
});

// ── transitionAtom ────────────────────────────────────────────────────────────

check('transitionAtom moves chartered -> ready and loadAtom reflects the new state', () => {
  const root = newEffort();
  const { id } = charterAtom(root, CHARTER);
  const r = transitionAtom(root, id, 'ready');
  assert.strictEqual(r.ok, true, r.error);
  assert.strictEqual(r.from, 'chartered');
  assert.strictEqual(r.to, 'ready');
  assert.strictEqual(loadAtom(root, id).state, 'ready');
});

check('transitionAtom rejects an illegal move and writes NOTHING beyond the charter', () => {
  const root = newEffort();
  const { id } = charterAtom(root, CHARTER);
  const before = readLedgerLines(root).length;
  const r = transitionAtom(root, id, "spec'd"); // chartered -> spec'd skips a hop, illegal
  assert.strictEqual(r.ok, false);
  assert.strictEqual(readLedgerLines(root).length, before);
  assert.strictEqual(loadAtom(root, id).state, 'chartered');
});

check('transitionAtom rejects an unknown atomId', () => {
  const root = newEffort();
  const r = transitionAtom(root, 'a-99999', 'ready');
  assert.strictEqual(r.ok, false);
});

// ── authorDelta ────────────────────────────────────────────────────────────

function makeClause(root, component, { citations = [], demandedBy = null, locus = [] } = {}) {
  const alloc = allocateClauseId(root, component);
  return { clauseId: alloc.clauseId, citations, demandedBy, locus };
}

check("authorDelta requires 'ready': from chartered it is rejected and writes nothing new", () => {
  const root = newEffort();
  const { id } = charterAtom(root, CHARTER);
  const before = readLedgerLines(root).length;
  const r = authorDelta(root, id, [makeClause(root, 'lexer')]);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(readLedgerLines(root).length, before);
});

check("authorDelta from 'ready' succeeds, moves the atom to spec'd, and loadAtom exposes the clauses", () => {
  const root = newEffort();
  const { id } = charterAtom(root, CHARTER);
  transitionAtom(root, id, 'ready');
  const clause = makeClause(root, 'lexer', { demandedBy: 'goal:g1' });
  const r = authorDelta(root, id, [clause]);
  assert.strictEqual(r.ok, true, r.error);
  const atom = loadAtom(root, id);
  assert.strictEqual(atom.state, "spec'd");
  assert.strictEqual(atom.deltaClauses.length, 1);
  assert.strictEqual(atom.deltaClauses[0].clauseId, clause.clauseId);
  assert.strictEqual(atom.deltaClauses[0].demandedBy, 'goal:g1');
});

// ── enrichDelta ────────────────────────────────────────────────────────────

function driveToPacked(root) {
  const { id } = charterAtom(root, CHARTER);
  transitionAtom(root, id, 'ready');
  authorDelta(root, id, [makeClause(root, 'lexer')]);
  transitionAtom(root, id, 'packed');
  return id;
}

check("enrichDelta requires an in-flight state: from 'ready' it is rejected", () => {
  const root = newEffort();
  const { id } = charterAtom(root, CHARTER);
  transitionAtom(root, id, 'ready');
  const r = enrichDelta(root, id, makeClause(root, 'lexer'));
  assert.strictEqual(r.ok, false);
});

check("enrichDelta from 'packed' succeeds and appends to deltaClauses (original clauses kept)", () => {
  const root = newEffort();
  const id = driveToPacked(root);
  const before = loadAtom(root, id).deltaClauses.length;
  const extra = makeClause(root, 'lexer', { demandedBy: 'goal:learned-in-flight' });
  const r = enrichDelta(root, id, extra);
  assert.strictEqual(r.ok, true, r.error);
  const atom = loadAtom(root, id);
  assert.strictEqual(atom.deltaClauses.length, before + 1);
  assert.ok(atom.deltaClauses.some((c) => c.clauseId === extra.clauseId));
  assert.strictEqual(atom.state, 'packed', 'enrichDelta does not itself change lifecycle state');
});

// ── setFlag / clearFlag ────────────────────────────────────────────────────

check('setFlag rejects an unknown flag name and writes nothing', () => {
  const root = newEffort();
  const { id } = charterAtom(root, CHARTER);
  const before = readLedgerLines(root).length;
  const r = setFlag(root, id, 'bogus-flag', 'because');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(readLedgerLines(root).length, before);
});

check('setFlag then loadAtom shows the flag set; clearFlag then loadAtom shows it cleared', () => {
  const root = newEffort();
  const { id } = charterAtom(root, CHARTER);
  assert.strictEqual(setFlag(root, id, 'frozen', 'R2 dead-end').ok, true);
  assert.ok(loadAtom(root, id).flags.has('frozen'));
  assert.strictEqual(clearFlag(root, id, 'frozen').ok, true);
  assert.ok(!loadAtom(root, id).flags.has('frozen'));
});

check('clearFlag on an already-clear flag is an idempotent success, not an error', () => {
  const root = newEffort();
  const { id } = charterAtom(root, CHARTER);
  const r = clearFlag(root, id, 'guard-halted');
  assert.strictEqual(r.ok, true, r.error);
});

check('setting two different flags on the same atom keeps both, independently', () => {
  const root = newEffort();
  const { id } = charterAtom(root, CHARTER);
  setFlag(root, id, 'frozen', 'x');
  setFlag(root, id, 'dispatch-barred', 'y');
  const flags = loadAtom(root, id).flags;
  assert.ok(flags.has('frozen') && flags.has('dispatch-barred'));
  clearFlag(root, id, 'frozen');
  const after = loadAtom(root, id).flags;
  assert.ok(!after.has('frozen') && after.has('dispatch-barred'));
});

// ── loadAtom / foldAtoms ─────────────────────────────────────────────────────

check('loadAtom returns null for an id that was never chartered', () => {
  const root = newEffort();
  assert.strictEqual(loadAtom(root, 'a-99999'), null);
});

check('foldAtoms returns {} on an effort with no charters yet', () => {
  const root = newEffort();
  assert.deepStrictEqual(foldAtoms(root), {});
});

check('foldAtoms keys every chartered atom by id, each matching a separate loadAtom call', () => {
  const root = newEffort();
  const a = charterAtom(root, CHARTER);
  const b = charterAtom(root, { ...CHARTER, component: 'ast' });
  const folded = foldAtoms(root);
  assert.deepStrictEqual(Object.keys(folded).sort(), [a.id, b.id].sort());
  assert.deepStrictEqual(folded[a.id], loadAtom(root, a.id));
  assert.deepStrictEqual(folded[b.id], loadAtom(root, b.id));
});

// ── the six ledger schema entries directly (validateEvent/append) ──────────

const SCHEMA_CASES = [
  ['atom-chartered', { component: 'lexer' }, 'component'],
  ['atom-delta-authored', { atomId: 'a-1' }, 'atomId'],
  ['delta-enrichment', { atomId: 'a-1' }, 'atomId'],
  ['atom-flag-set', { atomId: 'a-1', flag: 'frozen' }, 'atomId'],
  ['atom-flag-cleared', { atomId: 'a-1', flag: 'frozen' }, 'atomId'],
];

for (const [type, wellFormed, requiredField] of SCHEMA_CASES) {
  check(`validateEvent accepts a well-formed ${type} event`, () => {
    const r = validateEvent({ type, ...wellFormed });
    assert.strictEqual(r.ok, true, r.error);
  });
  check(`validateEvent rejects a ${type} event missing ${requiredField}`, () => {
    const bad = { type, ...wellFormed };
    delete bad[requiredField];
    const r = validateEvent(bad);
    assert.strictEqual(r.ok, false);
  });
}

check('validateEvent accepts a well-formed atom-transitioned event', () => {
  const r = validateEvent({ type: 'atom-transitioned', atomId: 'a-1', from: 'chartered', to: 'ready' });
  assert.strictEqual(r.ok, true, r.error);
});
check('validateEvent rejects atom-transitioned missing to', () => {
  const r = validateEvent({ type: 'atom-transitioned', atomId: 'a-1', from: 'chartered' });
  assert.strictEqual(r.ok, false);
});

check('append() end-to-end also accepts atom-chartered directly (not only through charterAtom)', () => {
  const root = newEffort();
  const r = append(root, { type: 'atom-chartered', component: 'evaluator' });
  assert.strictEqual(r.ok, true, r.error);
  assert.strictEqual(typeof r.event.seq, 'number');
});

for (const d of tmps) {
  try { rmSync(d, { recursive: true, force: true }); }
  catch { /* best-effort cleanup */ }
}

if (process.exitCode) console.error(`\natom-ledger: FAILURES above (${passed} passed).`);
else console.log(`\natom-ledger: all ${passed} checks pass. ✓`);
```

### Step 2: Run the test to verify it fails for the right reason

Run: `node test/atom-ledger.test.mjs`

Expected: assertion failures / `TypeError`s from calling not-yet-existing exports (`charterAtom`,
`authorDelta`, etc. are `undefined` on the real `lib/atom.mjs` module — T01b's file exists but
doesn't export these yet) — **not** a module-not-found error (that would mean `lib/atom.mjs`
itself is missing, which would mean this task is running out of order; stop and investigate if you
see that instead).

### Step 3: Commit

```bash
git add test/atom-ledger.test.mjs
git commit -m "test(atom): lock the atom ledger-integration contract (red)"
```

## Acceptance Criteria
- [ ] `test/atom-ledger.test.mjs` exists and matches the harness convention exactly
- [ ] Running it fails for the right reason (undefined exports, not module-not-found)
- [ ] Every function in `interfaces.md`'s I/O section, and all six new `EVENT_SCHEMAS` entries plus
      `atom-transitioned`, has at least one `check()` covering it
- [ ] No file outside Scope was modified
- [ ] The I/O half was NOT appended to `lib/atom.mjs`; `lib/ledger.mjs` was NOT modified
