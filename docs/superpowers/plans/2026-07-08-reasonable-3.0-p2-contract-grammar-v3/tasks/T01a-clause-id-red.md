# Task T01a: Clause-id shape + allocator tests (red)

**Role:** `red` — you write ONLY the failing test file below. Do not implement `lib/clause-id.mjs`
or modify `lib/ledger.mjs`.

## References
- Read: `../shared/architecture.md`
- Read: `../shared/interfaces.md` (the exact `lib/clause-id.mjs` contract you're testing)
- Read: `../shared/conventions.md`
- Read: `../knowledge/running-tests.md`
- Read: `lib/ledger.mjs` in full (the real, current `validateEvent`/`append` — this task calls them
  directly for a couple of checks; do not guess at their behavior)
- Read: `test/ledger-effects.test.mjs` (Part 1's fixture pattern — copy its `newEffort()`/
  `readLedgerLines()` helpers)

## Dependencies
- Depends on: — (none)
- Depended on by: T01b (implements against these locked tests), T01c (audits them)

## Scope

**Files:**
- Create: `test/clause-id.test.mjs`

**BOUNDARY — you MUST NOT modify any files outside this list. In particular, do NOT create
`lib/clause-id.mjs` or modify `lib/ledger.mjs` — that is T01b's job.**

## Positive Constraints (DO)
- Write a complete, runnable test file following the exact harness convention in
  `../shared/conventions.md` (the `check()` pattern — no framework).
- Import `CLAUSE_ID_PATTERN, CLAUSE_ID_RE, parseClauseId, formatClauseId, allocateClauseId,
  allocatedClauseIds` from `../lib/clause-id.mjs` (a module that does not exist yet — RED here is
  a "Cannot find module" error, which is the correct RED reason for this task).
- Also import `validateEvent, append` from `../lib/ledger.mjs` (this module DOES already exist —
  these two direct checks pin the new `clause-allocated` schema entry itself, independent of the
  allocator function).
- Cover every rule in `../shared/interfaces.md`'s `lib/clause-id.mjs` contract: `parseClauseId`
  (valid id, hyphenated component, malformed shapes including the retired `§N` form, non-string
  input never throws), `formatClauseId` (exact inverse), `CLAUSE_ID_RE`/`CLAUSE_ID_PATTERN`
  (composability into a bigger regex), `allocateClauseId` (mints `<component>#c<seq>`, two
  allocations never collide, different components share the global seq space — sparse numbering
  is a tested, intentional property, not a bug — malformed component rejected and writes nothing,
  missing `.reasonable/` propagates `append()`'s own error), `allocatedClauseIds` (folds
  `clause-allocated` events per component, empty effort returns `{}`, ignores unrelated event
  types).

## Negative Constraints (DO NOT)
- Do NOT implement `lib/clause-id.mjs` or modify `lib/ledger.mjs`.
- Do NOT pin the exact wording of any error message beyond what `interfaces.md` documents — match
  with `assert.match`, not `assert.strictEqual` on a full string.
- Do NOT modify any file outside the Scope section.

## Implementation Steps

### Step 1: Write the failing test file

```js
// test/clause-id.test.mjs — the durable clause-id shape (`<component>#c<N>`, DESIGN-3.0 §4.2)
// and its ledger-backed allocator (reasonable 3.0 Part 2). Pure shape checks plus the
// clause-allocated ledger event this module mints under the ledger controller's existing
// append lock. Fixture pattern copied from test/ledger-effects.test.mjs (Part 1).

import assert from 'node:assert';
import { mkdtempSync, mkdirSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  CLAUSE_ID_PATTERN, CLAUSE_ID_RE, parseClauseId, formatClauseId,
  allocateClauseId, allocatedClauseIds,
} from '../lib/clause-id.mjs';
import { validateEvent, append } from '../lib/ledger.mjs';

const tmps = [];
function newEffort() {
  const root = mkdtempSync(join(tmpdir(), 'clause-id-test-'));
  tmps.push(root);
  mkdirSync(join(root, '.reasonable'), { recursive: true });
  return root;
}
function readLedgerLines(root) {
  const p = join(root, '.reasonable', 'ledger.jsonl');
  if (!existsSync(p)) return [];
  return readFileSync(p, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => JSON.parse(l));
}

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.stack || e.message}`); process.exitCode = 1; }
}

// ── parseClauseId / formatClauseId / CLAUSE_ID_RE ──────────────────────────────────

check('parseClauseId splits a well-formed id into {component, n}', () => {
  assert.deepStrictEqual(parseClauseId('lexer#c12'), { component: 'lexer', n: 12 });
});

check('parseClauseId accepts a hyphenated component name', () => {
  assert.deepStrictEqual(parseClauseId('graph-store#c7'), { component: 'graph-store', n: 7 });
});

check('parseClauseId returns null for a malformed id (no #c segment)', () => {
  assert.strictEqual(parseClauseId('lexer12'), null);
});

check('parseClauseId returns null for positional §N addressing (retired shape)', () => {
  assert.strictEqual(parseClauseId('§12'), null);
});

check('parseClauseId returns null for an uppercase component (not a valid slug)', () => {
  assert.strictEqual(parseClauseId('Lexer#c12'), null);
});

check('parseClauseId returns null for non-string input, never throws', () => {
  assert.strictEqual(parseClauseId(null), null);
  assert.strictEqual(parseClauseId(undefined), null);
  assert.strictEqual(parseClauseId(42), null);
});

check('formatClauseId builds the exact inverse of parseClauseId', () => {
  assert.strictEqual(formatClauseId('lexer', 12), 'lexer#c12');
  const id = formatClauseId('graph-store', 7);
  assert.deepStrictEqual(parseClauseId(id), { component: 'graph-store', n: 7 });
});

check('CLAUSE_ID_RE matches the exact shape and nothing looser', () => {
  assert.ok(CLAUSE_ID_RE.test('lexer#c12'));
  assert.ok(!CLAUSE_ID_RE.test('lexer#12'), 'missing the literal "c"');
  assert.ok(!CLAUSE_ID_RE.test('lexer #c12'), 'no space before #');
  assert.ok(!CLAUSE_ID_RE.test('§12'), 'positional shape must not match');
});

check('CLAUSE_ID_PATTERN is a usable source string for a composed regex', () => {
  const re = new RegExp(`^###\\s+(${CLAUSE_ID_PATTERN})\\s+(.*)$`);
  const m = re.exec('### lexer#c12 Tokenizes an integer literal');
  assert.ok(m, 'the pattern must compose into a heading regex');
  assert.strictEqual(m[1], 'lexer#c12');
  assert.strictEqual(m[2], 'Tokenizes an integer literal');
});

// ── allocateClauseId: the ledger-backed allocator ──────────────────────────────────

check('allocateClauseId mints an id shaped <component>#c<seq> on a fresh effort', () => {
  const root = newEffort();
  const r = allocateClauseId(root, 'lexer');
  assert.strictEqual(r.ok, true, r.error);
  assert.strictEqual(r.clauseId, `lexer#c${r.seq}`);
  assert.strictEqual(typeof r.seq, 'number');
});

check('two allocations for the SAME component never collide (each gets a distinct seq)', () => {
  const root = newEffort();
  const a = allocateClauseId(root, 'lexer');
  const b = allocateClauseId(root, 'lexer');
  assert.strictEqual(a.ok, true, a.error);
  assert.strictEqual(b.ok, true, b.error);
  assert.notStrictEqual(a.clauseId, b.clauseId);
  assert.ok(b.seq > a.seq, 'seq must be monotonically increasing');
});

check('allocations for DIFFERENT components draw from the same global seq space (sparse per component, by design)', () => {
  const root = newEffort();
  const a = allocateClauseId(root, 'lexer');
  const b = allocateClauseId(root, 'ast');
  assert.strictEqual(a.ok, true, a.error);
  assert.strictEqual(b.ok, true, b.error);
  assert.ok(b.seq > a.seq);
  assert.strictEqual(b.clauseId, `ast#c${b.seq}`, "the second component's id uses the NEXT global seq, not its own count");
});

check('allocateClauseId rejects a malformed component and writes NOTHING to the ledger', () => {
  const root = newEffort();
  const r = allocateClauseId(root, 'Lexer'); // uppercase — not a valid component slug
  assert.strictEqual(r.ok, false);
  assert.strictEqual(readLedgerLines(root).length, 0, 'a rejected allocation must not append a line');
});

check('allocateClauseId rejects an empty-string component', () => {
  const root = newEffort();
  assert.strictEqual(allocateClauseId(root, '').ok, false);
});

check("allocateClauseId propagates append()'s own guard when .reasonable/ does not exist", () => {
  const root = mkdtempSync(join(tmpdir(), 'clause-id-no-effort-'));
  tmps.push(root);
  const r = allocateClauseId(root, 'lexer');
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /\.reasonable/);
});

check('a successful allocation lands a real clause-allocated line in ledger.jsonl', () => {
  const root = newEffort();
  const r = allocateClauseId(root, 'lexer');
  const lines = readLedgerLines(root);
  assert.strictEqual(lines.length, 1);
  assert.strictEqual(lines[0].type, 'clause-allocated');
  assert.strictEqual(lines[0].component, 'lexer');
  assert.strictEqual(lines[0].seq, r.seq);
});

// ── the ledger schema entry directly (validateEvent/append) ───────────────────────

check('validateEvent accepts a well-formed clause-allocated event', () => {
  const r = validateEvent({ type: 'clause-allocated', component: 'lexer' });
  assert.strictEqual(r.ok, true, r.error);
});

check('validateEvent rejects a clause-allocated event missing component', () => {
  const r = validateEvent({ type: 'clause-allocated' });
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /component/);
});

check('append() end-to-end also accepts clause-allocated directly (not only through allocateClauseId)', () => {
  const root = newEffort();
  const r = append(root, { type: 'clause-allocated', component: 'evaluator' });
  assert.strictEqual(r.ok, true, r.error);
  assert.strictEqual(r.event.type, 'clause-allocated');
  assert.strictEqual(typeof r.event.seq, 'number');
});

// ── allocatedClauseIds: the on-demand derived-mirror fold ──────────────────────────

check('allocatedClauseIds folds every clause-allocated event into {component -> [ids]}', () => {
  const root = newEffort();
  const a = allocateClauseId(root, 'lexer');
  const b = allocateClauseId(root, 'ast');
  const c = allocateClauseId(root, 'lexer');
  const mirror = allocatedClauseIds(root);
  assert.deepStrictEqual(mirror.lexer, [a.clauseId, c.clauseId]);
  assert.deepStrictEqual(mirror.ast, [b.clauseId]);
});

check('allocatedClauseIds returns an empty object on an effort with no allocations', () => {
  const root = newEffort();
  assert.deepStrictEqual(allocatedClauseIds(root), {});
});

check('allocatedClauseIds ignores non-clause-allocated ledger events', () => {
  const root = newEffort();
  append(root, { type: 'verdict' });
  allocateClauseId(root, 'lexer');
  const mirror = allocatedClauseIds(root);
  assert.strictEqual(Object.keys(mirror).length, 1);
  assert.ok(mirror.lexer);
});

for (const d of tmps) {
  try { rmSync(d, { recursive: true, force: true }); }
  catch { /* best-effort cleanup */ }
}

if (process.exitCode) console.error(`\nclause-id: FAILURES above (${passed} passed).`);
else console.log(`\nclause-id: all ${passed} checks pass. ✓`);
```

### Step 2: Run test to verify it fails for the right reason

Run: `node test/clause-id.test.mjs`

Expected: a top-level throw / module-load error, something like
`Cannot find module '.../lib/clause-id.mjs'` — **not** an assertion failure inside a `check()`. If
you see individual `FAIL` lines instead of a load error, the file path is wrong or
`lib/clause-id.mjs` already exists (stop and investigate — that would mean this task is running
out of order).

### Step 3: Commit

```bash
git add test/clause-id.test.mjs
git commit -m "test(clause-id): lock the clause-id shape + allocator contract (red)"
```

## Acceptance Criteria
- [ ] `test/clause-id.test.mjs` exists and matches the harness convention exactly
- [ ] Running it fails with a module-not-found error (RED for the right reason)
- [ ] Every rule in `interfaces.md`'s `lib/clause-id.mjs` contract has at least one `check()`
      covering it
- [ ] No file outside Scope was modified
- [ ] `lib/clause-id.mjs` was NOT created by this task; `lib/ledger.mjs` was NOT modified
