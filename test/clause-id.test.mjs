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

check('allocatedClauseIds does not fold in a same-component event of a DIFFERENT type (mutation-guard: T01c audit)', () => {
  const root = newEffort();
  append(root, { type: 'enrichment', component: 'lexer' }); // carries `component` but wrong `type`
  allocateClauseId(root, 'ast');
  const mirror = allocatedClauseIds(root);
  assert.ok(!('lexer' in mirror), 'an enrichment event must never be folded in as a clause-allocated id, even though it shares the component field');
  assert.strictEqual(Object.keys(mirror).length, 1);
});

for (const d of tmps) {
  try { rmSync(d, { recursive: true, force: true }); }
  catch { /* best-effort cleanup */ }
}

if (process.exitCode) console.error(`\nclause-id: FAILURES above (${passed} passed).`);
else console.log(`\nclause-id: all ${passed} checks pass. ✓`);
