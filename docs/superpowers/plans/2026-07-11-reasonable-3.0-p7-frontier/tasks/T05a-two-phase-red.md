# Task T05a: two-phase `ratification` fold tests (red)

**Role:** `red` — you write ONLY the one failing test file below. Do NOT modify `lib/ledger.mjs`.

## References
- Read: `../shared/interfaces.md` §2 ("The `ratification` two-phase fold" subsection, in full),
  `../shared/conventions.md`, `../shared/architecture.md`
- Read: `docs/superpowers/specs/2026-07-11-reasonable-3.0-p7-frontier-design.md` Decision 5 (two-phase
  effects; the pending set is fold-derived, never a mutable side-table)
- Read: `lib/ledger.mjs`'s existing `'ratification'` schema entry (`{ required: [],
  validate: validateDropsAndResolvesSeq }`) and `validateDropsAndResolvesSeq` itself (checks optional
  `drops`/`resolvesSeq` — you are pinning TWO NEW optional payload fields, `ratifiesSeqs`/
  `rejectsSeqs`, alongside these, never replacing them)
- Read: `lib/rewrite.mjs`'s `unwindCeremonyEscalation(escalationEffect)` (the pure inverse — restores
  `band` to `from`, disarms every armed check) and its identity invariant (apply-then-unwind = identity)
- Read: `test/ledger-atom-verdict.test.mjs` (T04's locked test — you REUSE `append()`'s real
  `atom-verdict` branch to produce genuine `pendingPermanent` fixtures, rather than hand-faking one)
- Read: `test/ledger-effects.test.mjs` for the harness (`newEffort`/`seedLedger`/`readLedgerLines`)

## Dependencies
- Depends on: T04b (the `atom-verdict` branch this fold consumes)
- Depended on by: T05b (implements against these locked tests), T05c (audits them)

## Scope
**Files:**
- Create: `test/ledger-two-phase.test.mjs`

**BOUNDARY — you MUST NOT modify any files outside this list. In particular, do NOT edit
`lib/ledger.mjs` or `lib/rewrite.mjs`.**

## Positive Constraints (DO)
- Cover the **schema shape**: `ratifiesSeqs`/`rejectsSeqs`, when present, must each be an array of
  positive integers (ledger seqs); a non-array or a non-positive-integer entry is rejected. Absent is
  fine (backward compatibility — an old `ratification` with only `drops`/`resolvesSeq` must still
  validate).
- Cover **the accept fold**: append a real `atom-verdict` (`kind:'oversized'`, reusing T04a's exact
  fixture — a chartered atom with two independent clauses) to get a genuine non-empty
  `pendingPermanent` at some seq `N`; then `append(root, {type:'ratification', ratifiesSeqs:[N]})` and
  assert the ratification's OWN `effects` field **deep-equals** that verdict's `pendingPermanent` array
  exactly (the fold, not a hand-typed literal).
- Cover **the reject/unwind fold**: seed (via `seedLedger`, directly — this is the honest way to test
  the FOLD's unwind logic without first needing a live ceremony-escalation producer, since `append()`'s
  T04 branch currently passes `bands:{}` and never fires a real escalation — see
  `../shared/interfaces.md` §2's flagged gap) an `atom-verdict` event at seq `N` whose `effects` array
  includes a ceremony-escalation-shaped effect (`{nodeId:'lexer', change:{band:'full', from:'lite',
  armed:['deep-audit','scaffold-recheck','tighter-cadence']}}`); then `append(root, {type:'ratification',
  rejectsSeqs:[N]})` and assert the ratification's `effects` **deep-equals**
  `unwindCeremonyEscalation({nodeId:'lexer', change:{band:'full', from:'lite',
  armed:[...]}})` computed directly in the test (import `unwindCeremonyEscalation` from
  `../lib/rewrite.mjs` to compute the expected value — never hand-type it, so the test tracks the real
  function).
- Cover **both refs in one ratification**: a `ratification` carrying BOTH `ratifiesSeqs` and
  `rejectsSeqs` (naming different seqs) folds BOTH sets into its `effects` (union).
- Cover **backward compatibility**: a `ratification` with only `drops`/`resolvesSeq` (no
  `ratifiesSeqs`/`rejectsSeqs`) behaves EXACTLY as it did before this task — no `effects` field appears
  on the stamped event unless the caller sent one (mirror `test/ledger-effects.test.mjs`'s own
  backward-compatibility pattern).
- Cover **"pending permanence" is a fold, never a side-table**: append the same `ratification` (with
  the same `ratifiesSeqs`) a second time — assert it produces the identical `effects` both times (the
  fold re-derives from the ledger every call; there is no consumed/mutated state to make the second
  call differ).

## Negative Constraints (DO NOT)
- Do NOT implement the fold in `lib/ledger.mjs`.
- Do NOT hand-fake a `pendingPermanent` fixture for the accept-fold test — produce it via a real
  `append()` `atom-verdict` call (T04's branch), so the test proves the WHOLE chain, not just the fold
  in isolation.
- Do NOT modify any file outside Scope.

## Implementation Steps

### Step 1: Write `test/ledger-two-phase.test.mjs`

```js
// test/ledger-two-phase.test.mjs — the two-phase ratification fold (DESIGN-3.0 §7.2, §2.4; reasonable
// 3.0 Part 7, interfaces.md §2). "Pending permanence" is a FOLD over the ledger (every atom-verdict
// whose seq has no consuming ratification above it), never a mutable side-table — this file proves
// that by calling the fold twice and getting the identical answer. Real .reasonable/ effort, real
// append(), mirrors test/ledger-effects.test.mjs's harness verbatim.

import assert from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { validateEvent, append } from '../lib/ledger.mjs';
import { unwindCeremonyEscalation } from '../lib/rewrite.mjs';

const tmps = [];

function newEffort() {
  const root = mkdtempSync(join(tmpdir(), 'ledger-two-phase-test-'));
  tmps.push(root);
  mkdirSync(join(root, '.reasonable'), { recursive: true });
  return root;
}

function seedLedger(root, events) {
  const body = events.map((e) => JSON.stringify(e)).join('\n') + (events.length ? '\n' : '');
  writeFileSync(join(root, '.reasonable', 'ledger.jsonl'), body);
}

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.stack || e.message}`); process.exitCode = 1; }
}

// ── schema shape ─────────────────────────────────────────────────────────────

check('validateEvent: ratifiesSeqs/rejectsSeqs, when present, must be arrays of positive integers', () => {
  assert.equal(validateEvent({ type: 'ratification', ratifiesSeqs: [1, 2] }).ok, true);
  assert.equal(validateEvent({ type: 'ratification', rejectsSeqs: [3] }).ok, true);
  assert.equal(validateEvent({ type: 'ratification', ratifiesSeqs: 'not-an-array' }).ok, false);
  assert.equal(validateEvent({ type: 'ratification', ratifiesSeqs: [0] }).ok, false);
  assert.equal(validateEvent({ type: 'ratification', ratifiesSeqs: [-1] }).ok, false);
  assert.equal(validateEvent({ type: 'ratification', ratifiesSeqs: [1.5] }).ok, false);
});

check('validateEvent: a plain ratification with neither field still validates (backward compat)', () => {
  assert.equal(validateEvent({ type: 'ratification' }).ok, true);
  assert.equal(validateEvent({ type: 'ratification', drops: [{ workOrder: 'WO-1' }] }).ok, true);
});

// ── the accept fold: reuses a REAL atom-verdict pendingPermanent ──────────────

check('append: ratification with ratifiesSeqs folds the referenced verdict\'s pendingPermanent verbatim', () => {
  const root = newEffort();
  seedLedger(root, [
    { seq: 1, type: 'atom-chartered', component: 'lexer', premises: [], purpose: 'x', locus: [], order: 0 },
    {
      seq: 2, type: 'atom-delta-authored', atomId: 'a-1',
      clauses: [
        { clauseId: 'lexer#c1', citations: [], demandedBy: null, locus: [] },
        { clauseId: 'lexer#c2', citations: [], demandedBy: 'goal:g1', locus: [] },
      ],
    },
  ]);
  const v = append(root, {
    type: 'atom-verdict', atomId: 'a-1', kind: 'oversized',
    partition: [['lexer#c1'], ['lexer#c2']], componentRoot: '',
  });
  assert.equal(v.ok, true, v.error);
  assert.ok(v.event.pendingPermanent.length > 0, 'the oversized verdict produced a real pendingPermanent set');

  const r = append(root, { type: 'ratification', ratifiesSeqs: [v.event.seq] });
  assert.equal(r.ok, true, r.error);
  assert.deepStrictEqual(r.event.effects, v.event.pendingPermanent, 'the ratification folds the exact pendingPermanent set');
});

// ── the reject/unwind fold: seeded ceremony-escalation effect, unwound via the real pure inverse ──

check('append: ratification with rejectsSeqs unwinds a ceremony-escalation effect via unwindCeremonyEscalation', () => {
  const root = newEffort();
  const escalation = { nodeId: 'lexer', change: { band: 'full', from: 'lite', armed: ['deep-audit', 'scaffold-recheck', 'tighter-cadence'] } };
  seedLedger(root, [
    {
      seq: 1, type: 'atom-verdict', atomId: 'a-1', kind: 'ripple',
      manifest: [{ component: 'other', clause: 'other#c1', type: 'enrich' }],
      effects: [
        { nodeId: 'a-1', change: { flag: 'dispatch-barred', op: 'set', reason: 'R3 ripple' } },
        escalation,
      ],
      pendingPermanent: [{ nodeId: 'a-1', change: { flag: 'dispatch-barred', op: 'clear', reason: 'R3 amendment ratified' } }],
    },
  ]);

  const expectedUnwind = unwindCeremonyEscalation(escalation);
  const r = append(root, { type: 'ratification', rejectsSeqs: [1] });
  assert.equal(r.ok, true, r.error);
  assert.deepStrictEqual(r.event.effects, expectedUnwind, 'the ratification folds the exact unwind effects');
});

// ── both refs in one ratification: union ──────────────────────────────────────

check('append: a ratification naming both ratifiesSeqs and rejectsSeqs folds BOTH sets (union)', () => {
  const root = newEffort();
  const escalation = { nodeId: 'lexer', change: { band: 'full', from: 'lite', armed: ['deep-audit'] } };
  seedLedger(root, [
    { seq: 1, type: 'atom-chartered', component: 'lexer', premises: [], purpose: 'x', locus: [], order: 0 },
    {
      seq: 2, type: 'atom-verdict', atomId: 'a-1', kind: 'ripple', manifest: [],
      effects: [escalation], pendingPermanent: [{ nodeId: 'a-1', change: { flag: 'dispatch-barred', op: 'clear' } }],
    },
  ]);
  const r = append(root, { type: 'ratification', ratifiesSeqs: [2], rejectsSeqs: [2] });
  assert.equal(r.ok, true, r.error);
  const expected = [
    { nodeId: 'a-1', change: { flag: 'dispatch-barred', op: 'clear' } },
    ...unwindCeremonyEscalation(escalation),
  ];
  assert.deepStrictEqual(r.event.effects, expected);
});

// ── backward compatibility: no new fields, no change ──────────────────────────

check('append: a ratification with only drops/resolvesSeq behaves exactly as before (no effects field)', () => {
  const root = newEffort();
  const r = append(root, { type: 'ratification', drops: [{ workOrder: 'WO-1' }] });
  assert.equal(r.ok, true, r.error);
  assert.ok(!('effects' in r.event), 'no effects key appears when neither ratifiesSeqs nor rejectsSeqs is sent');
});

// ── the fold is derived, never a mutable side-table ───────────────────────────

check('append: calling the same ratification fold twice yields the identical effects both times', () => {
  const root = newEffort();
  seedLedger(root, [
    { seq: 1, type: 'atom-chartered', component: 'lexer', premises: [], purpose: 'x', locus: [], order: 0 },
    {
      seq: 2, type: 'atom-delta-authored', atomId: 'a-1',
      clauses: [
        { clauseId: 'lexer#c1', citations: [], demandedBy: null, locus: [] },
        { clauseId: 'lexer#c2', citations: [], demandedBy: 'goal:g1', locus: [] },
      ],
    },
  ]);
  const v = append(root, {
    type: 'atom-verdict', atomId: 'a-1', kind: 'oversized',
    partition: [['lexer#c1'], ['lexer#c2']], componentRoot: '',
  });
  const r1 = append(root, { type: 'ratification', ratifiesSeqs: [v.event.seq] });
  const r2 = append(root, { type: 'ratification', ratifiesSeqs: [v.event.seq] });
  assert.equal(r1.ok, true, r1.error);
  assert.equal(r2.ok, true, r2.error);
  assert.deepStrictEqual(r1.event.effects, r2.event.effects, 'the fold re-derives identically — no consumed/mutated state');
});

for (const t of tmps) { try { rmSync(t, { recursive: true, force: true }); } catch { /* best effort */ } }

if (process.exitCode) console.error(`\nledger-two-phase: FAILURES above (${passed} passed).`);
else console.log(`\nledger-two-phase: all ${passed} checks passed. ✓`);
```

### Step 2: Run the test to verify it fails for the right reason

Run: `node test/ledger-two-phase.test.mjs`

Expected: `FAIL` lines — `validateEvent` today accepts `ratifiesSeqs`/`rejectsSeqs` of any shape (no
validation exists yet, so the malformed-shape checks fail), and `append()` never folds anything into a
ratification's `effects` (the fold checks fail with `effects` absent or empty).

### Step 3: Commit

```bash
git add test/ledger-two-phase.test.mjs
git commit -m "test(ledger): lock the two-phase ratification fold — pendingPermanent accept, ceremony-escalation reject/unwind (red, P7)" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

## Acceptance Criteria
- [ ] `test/ledger-two-phase.test.mjs` exists and matches the I/O harness convention exactly
- [ ] Running it fails with assertion failures for the right reason
- [ ] Schema shape, accept fold (reusing a real T04 `atom-verdict`), reject/unwind fold (seeded
      escalation, unwound via the real `unwindCeremonyEscalation`), the both-refs union, backward
      compatibility, and the fold-not-side-table double-call are all covered
- [ ] No file outside Scope modified; `lib/ledger.mjs`/`lib/rewrite.mjs` NOT edited
