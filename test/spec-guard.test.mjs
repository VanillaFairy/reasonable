// test/spec-guard.test.mjs — the spec-stage decidable fences + delta persistence (DESIGN-3.0 §4.1,
// §4.3, §6, §7.2; reasonable 3.0 A2). Pure-function cases (cohesionVerdict/checkpoint2/liveBlastRadii)
// mirror test/atom-cohesion.test.mjs's check(name,fn) harness and construct fixtures by hand — no
// filesystem needed except liveBlastRadii's ledger read. CLI cases spawn `node lib/spec.mjs` as a
// child process (footprint-disjoint.test.mjs's pattern) against a throwaway effort, exactly as
// test/atom-ledger.test.mjs's temp-effort factory sets one up for lib/atom.mjs's own I/O layer.

import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { charterAtom, transitionAtom, authorDelta, loadAtom } from '../lib/atom.mjs';
import { cohesionVerdict, checkpoint2, liveBlastRadii } from '../lib/spec.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const LIB = join(here, '..', 'lib', 'spec.mjs');

const tmps = [];
function newEffort() {
  const root = mkdtempSync(join(tmpdir(), 'spec-guard-test-'));
  tmps.push(root);
  mkdirSync(join(root, '.reasonable'), { recursive: true });
  return root;
}
const appendLedger = (root, obj) =>
  appendFileSync(join(root, '.reasonable', 'ledger.jsonl'), JSON.stringify(obj) + '\n');

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.stack || e.message}`); process.exitCode = 1; }
}

const CHARTER = { component: 'lexer', premises: ['ledger:1'], purpose: 'Tokenize source text.', locus: ['lib/lexer/'], order: 0 };
const ROOT = 'lib/lexer';

function clause(clauseId, { citations = [], demandedBy = null, locus = [] } = {}) {
  return { clauseId, citations, demandedBy, locus };
}

// ── cohesionVerdict (DESIGN-3.0 §4.3) ───────────────────────────────────────

check('cohesionVerdict: a cohesive delta (all clauses share a citation) is {kind:"ok"}', () => {
  const provider = { component: 'ast', clause: 'ast#c1' };
  const atom = { deltaClauses: [
    clause('lexer#c1', { citations: [provider] }),
    clause('lexer#c2', { citations: [provider] }),
  ] };
  assert.deepStrictEqual(cohesionVerdict(atom, ROOT), { kind: 'ok' });
});

check('cohesionVerdict: two disconnected clusters is {kind:"oversized", partition} with partition.length===2', () => {
  // The disconnected fixture from test/atom-cohesion.test.mjs's "R4 split payload" case.
  const provider1 = { component: 'ast', clause: 'ast#c1' };
  const provider2 = { component: 'eval', clause: 'eval#c1' };
  const atom = { deltaClauses: [
    clause('lexer#c1', { citations: [provider1] }),
    clause('lexer#c2', { citations: [provider1] }),
    clause('lexer#c3', { citations: [provider2] }),
    clause('lexer#c4', { citations: [provider2] }),
  ] };
  const v = cohesionVerdict(atom, ROOT);
  assert.strictEqual(v.kind, 'oversized');
  assert.strictEqual(v.partition.length, 2);
});

// ── checkpoint2 (DESIGN-3.0 §7.2 the spec-time guard) ───────────────────────

check('checkpoint2: closure disjoint from every live radius is {kind:"ok"}', () => {
  assert.deepStrictEqual(checkpoint2(['lexer', 'ast'], []), { kind: 'ok' });
});

check('checkpoint2: a closure hit against a live radius halts, naming the hit', () => {
  assert.deepStrictEqual(checkpoint2(['ast'], ['ast']), { kind: 'guard-halted', hit: ['ast'] });
});

check('checkpoint2: the same hit under lineageExempt proceeds with injection (§7.2 R2 remediation)', () => {
  assert.deepStrictEqual(
    checkpoint2(['ast'], ['ast'], { lineageExempt: true }),
    { kind: 'ok', injected: ['ast'] },
  );
});

// ── liveBlastRadii (§7.2 radius lifecycle — A2 returns the full stamped set) ─

check('liveBlastRadii returns [] for a fresh effort with no verdict events', () => {
  const root = newEffort();
  assert.deepStrictEqual(liveBlastRadii(root), []);
});

check('liveBlastRadii folds blastRadius out of atom-verdict effects (deduped, sorted)', () => {
  const root = newEffort();
  appendLedger(root, {
    seq: 1, type: 'atom-verdict', atomId: 'a-3', kind: 'checkpoint',
    effects: [{ nodeId: 'a-3', change: { blastRadius: ['ast'] } }],
  });
  // A second event repeats 'ast' and adds 'lexer' (out of alpha order) — proves both dedup and sort,
  // not just the single-radius case DESIGN-3.0 §7.2 names.
  appendLedger(root, {
    seq: 2, type: 'atom-verdict', atomId: 'a-3', kind: 'checkpoint',
    effects: [{ nodeId: 'a-3', change: { blastRadius: ['lexer', 'ast'] } }],
  });
  assert.deepStrictEqual(liveBlastRadii(root), ['ast', 'lexer']);
});

// ── CLI --author (child process) ────────────────────────────────────────────

check('CLI --author: authors a delta and loadAtom reports spec\'d with the clauses', () => {
  const root = newEffort();
  const { id } = charterAtom(root, CHARTER);
  transitionAtom(root, id, 'ready');

  const provider = { component: 'ast', clause: 'ast#c1' };
  const clauses = [
    clause('lexer#c1', { citations: [provider], demandedBy: 'goal:g1' }),
    clause('lexer#c2', { citations: [provider], demandedBy: 'goal:g1' }),
  ];
  const clausesFile = join(root, 'clauses.json');
  writeFileSync(clausesFile, JSON.stringify(clauses));

  execFileSync(process.execPath, [LIB, '--author', '--root', root, '--atom', id, '--clauses', clausesFile], {
    cwd: here, encoding: 'utf8',
  }); // execFileSync throws on non-zero exit — that IS the failure signal

  const atom = loadAtom(root, id);
  assert.strictEqual(atom.state, "spec'd");
  assert.deepStrictEqual(atom.deltaClauses.map((c) => c.clauseId).sort(), ['lexer#c1', 'lexer#c2']);
});

// ── CLI --guard --json (child process) ──────────────────────────────────────

check('CLI --guard --json: one cohesive, guard-clear spec\'d atom reports ok/ok', () => {
  const root = newEffort();
  const { id } = charterAtom(root, CHARTER);
  transitionAtom(root, id, 'ready');

  const provider = { component: 'ast', clause: 'ast#c1' };
  const clauses = [
    clause('lexer#c1', { citations: [provider], demandedBy: 'goal:g1' }),
    clause('lexer#c2', { citations: [provider], demandedBy: 'goal:g1' }),
  ];
  const r = authorDelta(root, id, clauses);
  assert.strictEqual(r.ok, true, r.error);

  const out = execFileSync(process.execPath, [LIB, '--guard', '--json', '--root', root], {
    cwd: here, encoding: 'utf8',
  });
  const parsed = JSON.parse(out);
  assert.strictEqual(parsed.atoms.length, 1);
  const entry = parsed.atoms[0];
  assert.strictEqual(entry.atomId, id);
  assert.deepStrictEqual(entry.cohesion, { kind: 'ok' });
  assert.deepStrictEqual(entry.checkpoint2, { kind: 'ok' });
});

// ── CLI-guard regression (mirrors test/footprint-disjoint.test.mjs) ─────────

check('importing lib/spec.mjs from a cwd with no .reasonable/ does NOT run the CLI', () => {
  const out = execFileSync(
    process.execPath,
    ['--input-type=module', '-e', "import('../lib/spec.mjs').then(()=>console.log('IMPORT_OK'))"],
    { cwd: here, encoding: 'utf8' }, // execFileSync throws on non-zero exit — that IS the failure signal
  );
  assert.ok(/IMPORT_OK/.test(out), `expected the import to complete and print IMPORT_OK, got: ${out}`);
  assert.ok(!/no effort/i.test(out), 'the unguarded CLI body must not run its "no effort" branch on import');
});

for (const d of tmps) {
  try { rmSync(d, { recursive: true, force: true }); }
  catch { /* best-effort cleanup */ }
}

if (process.exitCode) console.error(`\nspec-guard: FAILURES above (${passed} passed).`);
else console.log(`\nspec-guard: all ${passed} checks pass. ✓`);
