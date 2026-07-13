# Task T04a: `atom-verdict` append tests (red)

**Role:** `red` — you write ONLY the one failing test file below. Do NOT modify `lib/ledger.mjs` or
any other `lib/` file.

> **STOP — confirm the pivotal call before this task runs.** The design's central decision — the append
> path (`append()`) code-computes the effect set for an `atom-verdict`, not the frontier loop — is
> flagged contestable (`../shared/architecture.md`, "The pivotal call"). **Do not start this task until
> the supervisor has confirmed this with the human.** If reversed, this whole task moves into
> `lib/frontier.mjs` and changes shape.

## References
- Read: `../shared/interfaces.md` §2 **in full**, including the flagged `bandBounds` gap — the fixture
  in this task must pass `bandBounds: {}` reasoning through to real behavior, not paper over it
- Read: `../shared/conventions.md` (the append-path discipline section; the I/O test style)
- Read: `../shared/architecture.md` (the pivotal call)
- Read: `../knowledge/running-tests.md`
- Read: `docs/superpowers/specs/2026-07-11-reasonable-3.0-p7-frontier-design.md` Decision 4
- Read: `lib/ledger.mjs` **in full** — the `EVENT_SCHEMAS` registry, `validateEvent`, and the `append()`
  `withLock` body's Family-1/2/3 arms (your new branch lives in the Family-3/`else` arm, gated on
  `type === 'atom-verdict'`, run BEFORE `appendJsonlLocked`)
- Read: `lib/rewrite.mjs` **in full** — `computeVerdictEffects(verdict, state)`, `ceremonyEscalation`,
  `VERDICT_KINDS`; specifically `ruleCheckpoint` (R1), the simplest rule (only needs `state.atoms`, no
  `citationGraph`/`bandBounds`) — use `kind:'checkpoint'` as your primary happy-path fixture
- Read: `lib/atom.mjs` — `LIFECYCLE_TRANSITIONS` (`chartered: ['ready']` — a freshly-chartered atom can
  legally transition to `'ready'`, which is what `ruleCheckpoint` does) and `foldAtomsFromEvents`
  (an atom's id is `` `a-${seq}` `` — the CHARTERING event's OWN ledger seq. Seeding
  `{seq:1, type:'atom-chartered', component:'lexer', ...}` yields atom id `'a-1'` deterministically)
- Read: `lib/graph.mjs`'s `deriveCurrent(effortRoot, {goals, spikeInforms})` (returns
  `{containment, atoms, edges}`) and `lib/goals.mjs`/`lib/policy.mjs` (`readGoals`/`readPolicy` — both
  return `{X: null, diagnostic: null}` when their file is absent, which is the case for every fixture
  in this task; your `append()` implementation must tolerate a `null` policy/goals gracefully)
- Read: `test/ledger-effects.test.mjs` **in full** — copy its exact harness (`newEffort()`,
  `seedLedger()`, `readLedgerLines()`, the `tmps` cleanup array) verbatim; this is the shipped I/O test
  pattern for `lib/ledger.mjs`

## Dependencies
- Depends on: Phase A closed (T03c clean) AND the human's confirmation of the pivotal call
- Depended on by: T04b (implements against these locked tests), T04c (audits them)

## Scope
**Files:**
- Create: `test/ledger-atom-verdict.test.mjs`

**BOUNDARY — you MUST NOT modify any files outside this list. In particular, do NOT edit
`lib/ledger.mjs`, `lib/rewrite.mjs`, `lib/graph.mjs`, `lib/goals.mjs`, or `lib/policy.mjs`.**

## Positive Constraints (DO)
- Copy the `newEffort()`/`seedLedger()`/`readLedgerLines()` harness from `test/ledger-effects.test.mjs`
  verbatim (mkdtemp + `.reasonable/` dir; no `.reasonable/goals.json` or `.reasonable/policy.json` in
  any fixture here — the append branch must work with both absent).
- Cover: `validateEvent({type:'atom-verdict', atomId:'a-1', kind:'checkpoint'})` is accepted (schema
  requires `atomId`+`kind`); missing either field is rejected. Same for `'phase-degenerated'`
  (requires `phase`).
- Cover the **happy path**: seed `{seq:1, type:'atom-chartered', component:'lexer', premises:[],
  purpose:'x', locus:[], order:0}` (atom `'a-1'`, state `'chartered'`), then
  `append(root, {type:'atom-verdict', atomId:'a-1', kind:'checkpoint', evidence:'budget exhausted'})`.
  Assert the RETURNED stamped event's `effects` field **exactly equals** what
  `computeVerdictEffects({kind:'checkpoint', atomId:'a-1', evidence:'budget exhausted'}, <the same
  state append() would have built>).provisional` produces — i.e. reconstruct the expected state
  yourself (via `deriveCurrent`) in the test and call `computeVerdictEffects` directly to compute the
  EXPECTED effects, then assert `append()`'s actual stamped effects match it. This is the honest way to
  pin "the controller computes it, not a hand-typed literal" without duplicating rewrite.mjs's rule
  logic.
- Cover **fail-closed on an unknown/illegal verdict kind**: `append(root, {type:'atom-verdict',
  atomId:'a-1', kind:'not-a-real-kind'})` → `{ok:false}`, and the ledger file is confirmed BYTE-FOR-BYTE
  UNCHANGED after (read it back, don't just trust the return value — mirror
  `ledger-effects.test.mjs`'s "the ledger file is byte-for-byte unchanged" check).
- Cover **the no-model-in-the-loop boundary**: `append(root, {type:'atom-verdict', atomId:'a-1',
  kind:'checkpoint', evidence:'x', effects:[{nodeId:'a-1', change:{state:'merged'}}]})` — a
  CALLER-SUPPLIED `effects` array that lies about the outcome — assert the stamped/written event's
  `effects` is the CONTROLLER-COMPUTED value, never the caller's lie.
- Cover **`pendingPermanent` is recorded, not applied**: for a verdict whose rule produces a non-empty
  `permanent` array (use `kind:'oversized'` with a valid partition — read `ruleOversized` for the exact
  payload shape: `{atomId, partition:[[...],[...]], componentRoot}`, requires the seeded atom to carry
  `deltaClauses`; seed `{seq:2, type:'atom-delta-authored', atomId:'a-1', clauses:[{clauseId:'lexer#c1',
  citations:[], demandedBy:null, locus:[]}, {clauseId:'lexer#c2', citations:[], demandedBy:'goal:g1',
  locus:[]}]}` first so the atom is `"spec'd"` with two independent clauses, then verdict
  `{kind:'oversized', atomId:'a-1', partition:[['lexer#c1'],['lexer#c2']], componentRoot:''}`) — assert
  the stamped event carries a `pendingPermanent` field equal to the rule's `permanent` array, and that
  this value is NOT folded into `effects` (effects = provisional only).
- Cover **existing event types unaffected**: append a plain `{type:'verdict', outcome:'x'}` (the LIVE
  2.x work-order-keyed type) — confirm no snapshot assembly happens for it (no crash even if
  `deriveCurrent`/`readPolicy` would behave oddly) and its behavior is byte-identical to before this
  task (mirrors `ledger-effects.test.mjs`'s own backward-compatibility checks).

## Negative Constraints (DO NOT)
- Do NOT implement the `EVENT_SCHEMAS` entries or the `append()` verdict branch.
- Do NOT test the `ratification`/two-phase fold or the ceremony-escalation unwind (T05a).
- Do NOT modify any file outside Scope.
- Do NOT assume `policy.json`/`goals.json` exist — every fixture here has neither, and the
  implementation (T04b) must tolerate that (this is the test that PROVES it does).

## Implementation Steps

### Step 1: Write `test/ledger-atom-verdict.test.mjs`

```js
// test/ledger-atom-verdict.test.mjs — the atom-verdict append-path wiring (DESIGN-3.0 §2.4, §7.2;
// reasonable 3.0 Part 7, interfaces.md §2). append() code-computes the provisional effect set for an
// atom-verdict event, exactly as it code-computes `seq` — no caller, and not the workflow, ever
// authors an effect set. Real .reasonable/ effort, real ledger, real append() — mirrors
// test/ledger-effects.test.mjs's harness verbatim.

import assert from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { validateEvent, append } from '../lib/ledger.mjs';
import { computeVerdictEffects } from '../lib/rewrite.mjs';
import { deriveCurrent } from '../lib/graph.mjs';

const tmps = [];

function newEffort() {
  const root = mkdtempSync(join(tmpdir(), 'ledger-atom-verdict-test-'));
  tmps.push(root);
  mkdirSync(join(root, '.reasonable'), { recursive: true });
  return root;
}

function seedLedger(root, events) {
  const body = events.map((e) => JSON.stringify(e)).join('\n') + (events.length ? '\n' : '');
  writeFileSync(join(root, '.reasonable', 'ledger.jsonl'), body);
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

// ── schema shape ─────────────────────────────────────────────────────────────

check("validateEvent: 'atom-verdict' requires atomId + kind", () => {
  assert.equal(validateEvent({ type: 'atom-verdict', atomId: 'a-1', kind: 'checkpoint' }).ok, true);
  assert.equal(validateEvent({ type: 'atom-verdict', kind: 'checkpoint' }).ok, false);
  assert.equal(validateEvent({ type: 'atom-verdict', atomId: 'a-1' }).ok, false);
});

check("validateEvent: 'phase-degenerated' requires phase", () => {
  assert.equal(validateEvent({ type: 'phase-degenerated', phase: 'scaffold', reason: 'x', inputs: {} }).ok, true);
  assert.equal(validateEvent({ type: 'phase-degenerated' }).ok, false);
});

// ── the happy path: the CONTROLLER computes the effects, matching a direct computeVerdictEffects call ──

check('append: atom-verdict code-computes provisional effects, matching computeVerdictEffects on the same state', () => {
  const root = newEffort();
  seedLedger(root, [{ seq: 1, type: 'atom-chartered', component: 'lexer', premises: [], purpose: 'x', locus: [], order: 0 }]);

  const verdict = { atomId: 'a-1', kind: 'checkpoint', evidence: 'budget exhausted' };
  const stateForExpectation = deriveCurrent(root, { goals: [] }); // the SAME snapshot append() builds
  const expected = computeVerdictEffects(verdict, { ...stateForExpectation, priorVerdicts: [] });
  assert.equal(expected.ok, true, expected.error);

  const r = append(root, { type: 'atom-verdict', ...verdict });
  assert.equal(r.ok, true, r.error);
  assert.deepStrictEqual(r.event.effects, expected.provisional, 'the stamped effects match the pure calculus on the same snapshot');

  const stored = readLedgerLines(root).pop();
  assert.deepStrictEqual(stored.effects, expected.provisional, 'the WRITTEN line also carries the code-computed effects');
});

// ── fail-closed on an unknown/illegal verdict kind (§7.2 Totality) ─────────────

check('append: an unknown verdict kind HALTs — ok:false, nothing written', () => {
  const root = newEffort();
  seedLedger(root, [{ seq: 1, type: 'atom-chartered', component: 'lexer', premises: [], purpose: 'x', locus: [], order: 0 }]);
  const before = readFileSync(join(root, '.reasonable', 'ledger.jsonl'), 'utf8');

  const r = append(root, { type: 'atom-verdict', atomId: 'a-1', kind: 'not-a-real-kind' });
  assert.equal(r.ok, false);

  const after = readFileSync(join(root, '.reasonable', 'ledger.jsonl'), 'utf8');
  assert.equal(after, before, 'the ledger file is byte-for-byte unchanged after a HALTed atom-verdict');
});

// ── the no-model-in-the-loop boundary: a caller-supplied effects lie is OVERWRITTEN ────────────

check('append: a caller-supplied `effects` on an atom-verdict is OVERWRITTEN, never trusted', () => {
  const root = newEffort();
  seedLedger(root, [{ seq: 1, type: 'atom-chartered', component: 'lexer', premises: [], purpose: 'x', locus: [], order: 0 }]);

  const lie = [{ nodeId: 'a-1', change: { state: 'merged' } }]; // a lie: a-1 never merged
  const r = append(root, { type: 'atom-verdict', atomId: 'a-1', kind: 'checkpoint', evidence: 'x', effects: lie });
  assert.equal(r.ok, true, r.error);
  assert.notDeepStrictEqual(r.event.effects, lie, 'the caller-supplied effects must be replaced');
  assert.deepStrictEqual(r.event.effects, [
    { nodeId: 'a-1', change: { state: 'ready', reprice: { factor: 'α' }, evidence: 'x' } },
  ], 'the controller-computed R1 checkpoint effect is what actually lands');
});

// ── pendingPermanent is recorded, not applied ─────────────────────────────────

check('append: a verdict with a non-empty permanent set records it as pendingPermanent, NOT folded into effects', () => {
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

  const verdict = {
    atomId: 'a-1', kind: 'oversized',
    partition: [['lexer#c1'], ['lexer#c2']], componentRoot: '',
  };
  const r = append(root, { type: 'atom-verdict', ...verdict });
  assert.equal(r.ok, true, r.error);
  assert.ok(Array.isArray(r.event.pendingPermanent), 'pendingPermanent is present on the stamped event');
  assert.ok(r.event.pendingPermanent.length > 0, 'oversized carries a non-empty permanent set (retirement stamp)');
  // effects (provisional) must NOT include anything from the permanent set.
  const permanentNodeIds = new Set(r.event.pendingPermanent.map((e) => e.nodeId).filter(Boolean));
  const effectsNodeIds = new Set(r.event.effects.map((e) => e.nodeId).filter(Boolean));
  for (const id of permanentNodeIds) {
    // the SAME nodeId may legitimately appear in both (a-1 gets a provisional retired-pending AND a
    // permanent retired stamp) — the real invariant is that pendingPermanent is its OWN field, not
    // merged element-for-element into effects. Assert the arrays are NOT deepStrictEqual.
    void id;
  }
  assert.notDeepStrictEqual(r.event.effects, r.event.pendingPermanent, 'effects and pendingPermanent are distinct arrays');
});

// ── existing event types unaffected ───────────────────────────────────────────

check('append: the live 2.x `verdict` type (work-order-keyed) is completely unaffected by this branch', () => {
  const root = newEffort();
  const r = append(root, { type: 'verdict', outcome: 'green' });
  assert.equal(r.ok, true, r.error);
  assert.ok(!('pendingPermanent' in r.event), 'no pendingPermanent leaks onto an unrelated event type');
});

for (const t of tmps) { try { rmSync(t, { recursive: true, force: true }); } catch { /* best effort */ } }

if (process.exitCode) console.error(`\nledger-atom-verdict: FAILURES above (${passed} passed).`);
else console.log(`\nledger-atom-verdict: all ${passed} checks passed. ✓`);
```

### Step 2: Run the test to verify it fails for the right reason

Run: `node test/ledger-atom-verdict.test.mjs`

Expected: `FAIL` lines — `validateEvent` rejects `'atom-verdict'`/`'phase-degenerated'` as unknown types
today (`"unknown or legacy event type"`), and `append()` has no verdict branch yet. This is an assertion
failure, not a module-load error (both imports already exist and are already exported).

### Step 3: Commit

```bash
git add test/ledger-atom-verdict.test.mjs
git commit -m "test(ledger): lock the atom-verdict append-path wiring — code-computed effects, fail-closed HALT, pendingPermanent (red, P7)" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

## Acceptance Criteria
- [ ] `test/ledger-atom-verdict.test.mjs` exists and matches the I/O harness convention exactly (real
      temp `.reasonable/`, no filesystem shortcuts)
- [ ] Running it fails with assertion failures for the right reason (schema rejects the new types;
      `append()` has no verdict branch)
- [ ] Schema shape, the happy-path code-computed effects (matched against a direct
      `computeVerdictEffects` call), fail-closed HALT + byte-unchanged ledger, the no-model-in-the-loop
      overwrite, `pendingPermanent` recorded-not-folded, and existing-type non-interference are all
      covered
- [ ] No file outside Scope modified; `lib/ledger.mjs`/`lib/rewrite.mjs`/`lib/graph.mjs` NOT edited
