// test/goals-loader.test.mjs — P6d: the conservative loader for `.reasonable/goals.json` (an ARRAY of
// goal entries). Modeled on test/route.test.mjs. Node builtins only; a throwaway effort dir on disk.
import assert from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readGoals } from '../lib/goals.mjs';
import { servesEdges } from '../lib/graph.mjs';

const tmps = [];
let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.stack || e.message}`); process.exitCode = 1; }
}

// A fresh effort root with `.reasonable/` present; `content` (a RAW string) is written verbatim so
// malformed-JSON fixtures are expressible. Omit `content` for the absent-file case.
function newEffort(content) {
  const root = mkdtempSync(join(tmpdir(), 'goals-')); tmps.push(root);
  mkdirSync(join(root, '.reasonable'), { recursive: true });
  if (content !== undefined) writeFileSync(join(root, '.reasonable', 'goals.json'), content);
  return root;
}
const write = (obj) => newEffort(JSON.stringify(obj));

const validGoal = {
  id: 'expr-eval',
  scenario: 'evaluate an arithmetic expression end to end',
  scenarioCitations: [{ component: 'lexer', clause: 'lexer#c1' }],
  ratifiedAt: '2026-07-10T10:00:00+02:00',
  ledgerSeq: 42,
};

// ── absent file — forward-compat, not an error ──────────────────────────────

check('absent goals.json -> { goals: null, diagnostic: null }', () => {
  assert.deepStrictEqual(readGoals(newEffort()), { goals: null, diagnostic: null });
});

check('absent .reasonable/ dir entirely -> { goals: null, diagnostic: null } (never throws)', () => {
  const root = mkdtempSync(join(tmpdir(), 'goals-noeff-')); tmps.push(root);
  assert.deepStrictEqual(readGoals(root), { goals: null, diagnostic: null });
});

// ── valid — normalized, order preserved, citations verbatim ─────────────────

check('a valid single goal parses to the normalized five-key entry', () => {
  const { goals, diagnostic } = readGoals(write([validGoal]));
  assert.strictEqual(diagnostic, null);
  assert.deepStrictEqual(goals, [{
    id: 'expr-eval',
    scenario: 'evaluate an arithmetic expression end to end',
    scenarioCitations: [{ component: 'lexer', clause: 'lexer#c1' }],
    ratifiedAt: '2026-07-10T10:00:00+02:00',
    ledgerSeq: 42,
  }]);
});

check('scenarioCitations objects are preserved verbatim (component + clause both survive)', () => {
  const { goals } = readGoals(write([validGoal]));
  assert.deepStrictEqual(goals[0].scenarioCitations, [{ component: 'lexer', clause: 'lexer#c1' }]);
});

check('goal order is preserved exactly (never re-sorted)', () => {
  const { goals } = readGoals(write([
    { id: 'z-goal', scenario: 's', scenarioCitations: [] },
    { id: 'a-goal', scenario: 's', scenarioCitations: [] },
  ]));
  assert.deepStrictEqual(goals.map((g) => g.id), ['z-goal', 'a-goal']);
});

check('an empty goals array is valid -> { goals: [], diagnostic: null }', () => {
  assert.deepStrictEqual(readGoals(write([])), { goals: [], diagnostic: null });
});

check('a goal with an empty scenarioCitations array is shape-valid (a cone-less goal)', () => {
  const { goals, diagnostic } = readGoals(write([{ id: 'g', scenario: 's', scenarioCitations: [] }]));
  assert.strictEqual(diagnostic, null);
  assert.deepStrictEqual(goals, [{ id: 'g', scenario: 's', scenarioCitations: [], ratifiedAt: null, ledgerSeq: null }]);
});

// ── optional metadata — carried through, degraded to null, never fabricated ──

check('missing ratifiedAt / ledgerSeq degrade to null (optional)', () => {
  const { goals } = readGoals(write([{ id: 'g', scenario: 's', scenarioCitations: [] }]));
  assert.strictEqual(goals[0].ratifiedAt, null);
  assert.strictEqual(goals[0].ledgerSeq, null);
});

check('a non-string ratifiedAt / non-numeric ledgerSeq degrade to null without killing the load', () => {
  const { goals, diagnostic } = readGoals(write([
    { id: 'g', scenario: 's', scenarioCitations: [], ratifiedAt: 12345, ledgerSeq: 'not-a-number' },
  ]));
  assert.strictEqual(diagnostic, null);
  assert.deepStrictEqual(goals, [{ id: 'g', scenario: 's', scenarioCitations: [], ratifiedAt: null, ledgerSeq: null }]);
});

check('extra top-level entry fields are dropped (closed per-entry grammar)', () => {
  const { goals } = readGoals(write([{ id: 'g', scenario: 's', scenarioCitations: [], surprise: 'x' }]));
  assert.deepStrictEqual(Object.keys(goals[0]).sort(), ['id', 'ledgerSeq', 'ratifiedAt', 'scenario', 'scenarioCitations']);
});

check('ledgerSeq of 0 is carried through, not coerced to null (off-by-0 trap: an empty ledger has seq 0)', () => {
  const { goals, diagnostic } = readGoals(write([{ id: 'g', scenario: 's', scenarioCitations: [], ledgerSeq: 0 }]));
  assert.strictEqual(diagnostic, null);
  assert.strictEqual(goals[0].ledgerSeq, 0);
});

check('a non-integer finite ledgerSeq (e.g. 3.5) is carried through as-is, never coerced or rejected', () => {
  const { goals, diagnostic } = readGoals(write([{ id: 'g', scenario: 's', scenarioCitations: [], ledgerSeq: 3.5 }]));
  assert.strictEqual(diagnostic, null);
  assert.strictEqual(goals[0].ledgerSeq, 3.5);
});

// ── present but invalid — null + a surfaced diagnostic, never a repair ───────

const hasDiag = (root) => { const { goals, diagnostic } = readGoals(root); assert.strictEqual(goals, null); assert.ok(typeof diagnostic === 'string' && diagnostic.length > 0, 'diagnostic is a non-empty string'); };

check('invalid JSON (unparseable) -> null + diagnostic', () => hasDiag(newEffort('[ not valid json')));
check('root JSON value is not an array (an object) -> null + diagnostic', () => hasDiag(write({ id: 'g' })));
check('root JSON value is not an array (a string) -> null + diagnostic', () => hasDiag(write('expr-eval')));
check('an entry that is not an object (a string) -> null + diagnostic', () => hasDiag(write(['expr-eval'])));
check('an entry that is null -> null + diagnostic', () => hasDiag(write([null])));
check('an entry missing id -> null + diagnostic', () => hasDiag(write([{ scenario: 's', scenarioCitations: [] }])));
check('an entry with an empty-string id -> null + diagnostic', () => hasDiag(write([{ id: '', scenario: 's', scenarioCitations: [] }])));
check('an entry missing scenario -> null + diagnostic', () => hasDiag(write([{ id: 'g', scenarioCitations: [] }])));
check('an entry with a non-string scenario -> null + diagnostic', () => hasDiag(write([{ id: 'g', scenario: 42, scenarioCitations: [] }])));
check('an entry whose scenarioCitations is not an array -> null + diagnostic', () => hasDiag(write([{ id: 'g', scenario: 's', scenarioCitations: 'lexer#c1' }])));
check('an entry missing scenarioCitations entirely -> null + diagnostic', () => hasDiag(write([{ id: 'g', scenario: 's' }])));
check('a citation that is a bare string (not an object) -> null + diagnostic', () => hasDiag(write([{ id: 'g', scenario: 's', scenarioCitations: ['lexer#c1'] }])));
check('a citation object missing clause -> null + diagnostic', () => hasDiag(write([{ id: 'g', scenario: 's', scenarioCitations: [{ component: 'lexer' }] }])));
check('a citation with an empty-string clause -> null + diagnostic', () => hasDiag(write([{ id: 'g', scenario: 's', scenarioCitations: [{ clause: '' }] }])));

check('a citation that is null (not an object) -> null + diagnostic, never throws', () => hasDiag(write([{ id: 'g', scenario: 's', scenarioCitations: [null] }])));

check('a valid citation followed by a malformed citation within one entry -> null + diagnostic (validates every index, not just 0)', () => hasDiag(write([{ id: 'g', scenario: 's', scenarioCitations: [{ clause: 'lexer#c1' }, { clause: '' }] }])));

check('ONE malformed entry among valid ones fails the WHOLE load (all-or-nothing, never partial)', () => {
  hasDiag(write([validGoal, { id: 'bad', scenario: 's' /* no scenarioCitations */ }, validGoal]));
});

// ── grounding: a loaded goal composes with servesEdges (design Decision 6) ───

check('a loaded goal feeds servesEdges directly and yields the serves edge', () => {
  const { goals } = readGoals(write([{ id: 'g-1', scenario: 's', scenarioCitations: [{ clause: 'lexer#c1' }] }]));
  const atoms = [{ id: 'a-1', deltaClauses: [{ clauseId: 'lexer#c1' }] }];
  assert.deepStrictEqual(servesEdges(atoms, goals), [{ from: 'a-1', to: 'g-1', edge: 'serves', op: 'add' }]);
});

// ── round trip through a real .reasonable/goals.json on disk ─────────────────

check('round trip: writeFileSync then readGoals reproduces the ratified goals, pretty-printed', () => {
  const root = newEffort();
  writeFileSync(join(root, '.reasonable', 'goals.json'), JSON.stringify([validGoal], null, 2) + '\n');
  const { goals, diagnostic } = readGoals(root);
  assert.strictEqual(diagnostic, null);
  assert.deepStrictEqual(goals, [validGoal]);
});

for (const d of tmps) { try { rmSync(d, { recursive: true, force: true }); } catch { /* best-effort cleanup */ } }

if (process.exitCode) console.error(`\ngoals: FAILURES above (${passed} passed).`);
else console.log(`\ngoals: all ${passed} checks passed. ✓`);
