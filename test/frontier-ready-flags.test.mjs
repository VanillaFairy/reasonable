// test/frontier-ready-flags.test.mjs — readyFlagLists, the name-map from a folded atom's `.flags`
// Set (lib/atom.mjs's FLAG_NAMES: 'frozen' | 'guard-halted' | 'dispatch-barred') to ready(graph,
// flags)'s camelCase param shape ({frozen, guardHalted, barred}) (DESIGN-3.0 §4.1/§6: "ready =
// planned edges minus frozen / guard-halted / barred"; A3a T2).
//
// Task 1 (already merged) taught foldAtomFromEvents to apply a computed atom-verdict/ratification
// `.effects` entry onto a folded atom's `.flags` Set. Until THIS function exists, nothing ever reads
// those folded flags back into ready()'s frontier filter — every caller/test hand-builds the
// {frozen,guardHalted,barred} lists instead. readyFlagLists is the one bridge; the integration/
// discriminator pair below proves it is wired to the REAL fold, not a hand-built substitute.

import assert from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ready, readyFlagLists } from '../lib/frontier.mjs';
import { charterAtom, transitionAtom } from '../lib/atom.mjs';
import { deriveCurrent } from '../lib/graph.mjs';

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.stack || e.message}`); process.exitCode = 1; }
}

// ── unit: the name-map + partition ──────────────────────────────────────────

check('readyFlagLists maps hyphenated fold literals to ready()\'s camelCase keys and partitions by id', () => {
  const atoms = [
    { id: 'a-1', flags: new Set(['frozen']) },
    { id: 'a-2', flags: new Set(['guard-halted']) },
    { id: 'a-3', flags: new Set(['dispatch-barred']) },
    { id: 'a-4', flags: new Set() },
  ];
  assert.deepStrictEqual(readyFlagLists(atoms), {
    frozen: ['a-1'],
    guardHalted: ['a-2'],
    barred: ['a-3'],
  });
});

check('an atom carrying two flags lands in BOTH corresponding lists', () => {
  const atoms = [{ id: 'a-1', flags: new Set(['frozen', 'dispatch-barred']) }];
  const { frozen, guardHalted, barred } = readyFlagLists(atoms);
  assert.deepStrictEqual(frozen, ['a-1']);
  assert.deepStrictEqual(guardHalted, []);
  assert.deepStrictEqual(barred, ['a-1']);
});

check('an atom with missing/undefined .flags is skipped without throwing', () => {
  const atoms = [{ id: 'a-1' }, { id: 'a-2', flags: new Set(['frozen']) }];
  assert.doesNotThrow(() => readyFlagLists(atoms));
  assert.deepStrictEqual(readyFlagLists(atoms), { frozen: ['a-2'], guardHalted: [], barred: [] });
});

check('readyFlagLists(undefined) / readyFlagLists([]) return empty lists, never throw', () => {
  assert.deepStrictEqual(readyFlagLists(undefined), { frozen: [], guardHalted: [], barred: [] });
  assert.deepStrictEqual(readyFlagLists([]), { frozen: [], guardHalted: [], barred: [] });
});

// ── integration: readyFlagLists wired to the REAL fold, exercised through a real .reasonable/ ─────
// effort (charterAtom + transitionAtom, the real I/O surface lib/atom.mjs exposes) — mirrors
// test/atom-verdict-fold.test.mjs's temp-effort + seeded-ledger-event harness.

const tmps = [];
function newEffort() {
  const root = mkdtempSync(join(tmpdir(), 'frontier-ready-flags-test-'));
  tmps.push(root);
  mkdirSync(join(root, '.reasonable'), { recursive: true });
  return root;
}
function appendRawLedgerLine(root, event) {
  writeFileSync(join(root, '.reasonable', 'ledger.jsonl'), `${JSON.stringify(event)}\n`, { flag: 'a' });
}

// Charters two atoms, transitions both to 'ready' via the REAL transitionAtom I/O path, and returns
// their ids. `freeze`, when true, additionally seeds a synthetic atom-verdict ledger event whose
// `.effects` sets the SAME shape Task 1's fold overlay already handles ({nodeId, change:{flag:
// 'frozen', op:'set'}}) — reusing the R2-dead-end blast-radius effect shape pinned in
// test/atom-verdict-fold.test.mjs — targeting the FIRST atom only.
function twoReadyAtoms(root, { freeze }) {
  const c1 = charterAtom(root, { component: 'lexer', premises: [], purpose: 'tokenize', locus: ['lib/lexer/'], order: 0 });
  const c2 = charterAtom(root, { component: 'parser', premises: [], purpose: 'parse', locus: ['lib/parser/'], order: 0 });
  assert.ok(c1.ok, c1.error);
  assert.ok(c2.ok, c2.error);
  const t1 = transitionAtom(root, c1.id, 'ready');
  const t2 = transitionAtom(root, c2.id, 'ready');
  assert.ok(t1.ok, t1.error);
  assert.ok(t2.ok, t2.error);

  if (freeze) {
    appendRawLedgerLine(root, {
      seq: 5, type: 'atom-verdict', atomId: c1.id, kind: 'test-fixture',
      effects: [{ nodeId: c1.id, change: { flag: 'frozen', op: 'set', reason: 'A3a T2 fixture freeze' } }],
    });
  }

  return { frozenId: c1.id, plainId: c2.id };
}

check('integration: ready(graph, readyFlagLists(graph.atoms)) excludes the atom the REAL fold froze, includes the other', () => {
  const root = newEffort();
  const { frozenId, plainId } = twoReadyAtoms(root, { freeze: true });

  const graph = deriveCurrent(root, { goals: [] });
  const frozenAtom = graph.atoms.find((a) => a.id === frozenId);
  assert.ok(frozenAtom.flags.has('frozen'), 'sanity: the folded atom must actually carry the frozen flag before ready() is asked to honor it');

  const readySet = ready(graph, readyFlagLists(graph.atoms));
  assert.ok(!readySet.includes(frozenId), 'the frozen atom must be excluded from the frontier');
  assert.ok(readySet.includes(plainId), 'the untouched atom must still be on the frontier');
});

check('discriminator: the SAME setup with NO flags ever set includes BOTH atoms — proves the filter is real, not a no-op that always excludes', () => {
  const root = newEffort();
  const { frozenId, plainId } = twoReadyAtoms(root, { freeze: false });

  const graph = deriveCurrent(root, { goals: [] });
  assert.equal(graph.atoms.find((a) => a.id === frozenId).flags.size, 0, 'sanity: no flag was ever set this time');

  const readySet = ready(graph, readyFlagLists(graph.atoms));
  assert.ok(readySet.includes(frozenId), 'without any fold-side flag, this id must be on the frontier too');
  assert.ok(readySet.includes(plainId));
});

for (const t of tmps) { try { rmSync(t, { recursive: true, force: true }); } catch { /* best effort */ } }

if (process.exitCode) console.error(`\nfrontier-ready-flags: FAILURES above (${passed} passed).`);
else console.log(`\nfrontier-ready-flags: all ${passed} checks pass. ✓`);
