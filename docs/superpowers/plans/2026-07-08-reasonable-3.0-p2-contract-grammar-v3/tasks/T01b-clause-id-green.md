# Task T01b: Clause-id shape + allocator impl (green)

**Role:** `green` — implement `lib/clause-id.mjs` and the one-line `lib/ledger.mjs` schema
addition against the locked tests. Do not modify the test file.

## References
- Read: `../shared/architecture.md`
- Read: `../shared/interfaces.md`
- Read: `../shared/conventions.md`
- Read: `../knowledge/running-tests.md`
- Read: `lib/ledger.mjs` in full before editing it
- Read: `lib/effort.mjs`'s `readJsonl` (you will import it)

## Dependencies
- Depends on: T01a (locked tests)
- Depended on by: T01c (audits this), T02b (imports `lib/clause-id.mjs`'s real interface)

## Scope

**Files:**
- Create: `lib/clause-id.mjs`
- Modify: `lib/ledger.mjs`

**BOUNDARY — you MUST NOT modify any files outside this list.**

**Do NOT modify `test/clause-id.test.mjs` — authored by T01a and locked.** If you believe a test
in it is wrong, stop and escalate (say so in your final report); never edit it yourself.

## Positive Constraints (DO)
- Implement exactly the exports named in `../shared/interfaces.md`: `CLAUSE_ID_PATTERN`,
  `CLAUSE_ID_RE`, `parseClauseId`, `formatClauseId`, `allocateClauseId`, `allocatedClauseIds`.
- Add exactly the one new `EVENT_SCHEMAS` line to `lib/ledger.mjs` specified in
  `../shared/interfaces.md`, at the exact location (immediately after `'characterization'`), plus
  the one-word comment update. Nothing else in `lib/ledger.mjs` changes.
- `allocateClauseId` derives the id from the **seq `append()` actually returns** — do not
  independently compute or guess a seq.
- `allocatedClauseIds` reads the ledger via `readJsonl` from `./effort.mjs` (do not hand-roll JSONL
  parsing — this repo already has a shared helper for it).

## Negative Constraints (DO NOT)
- Do NOT modify `test/clause-id.test.mjs`.
- Do NOT touch `append()`'s internals, the attempt-arithmetic functions, the CLI, or any
  `EVENT_SCHEMAS` entry other than the one new `clause-allocated` line.
- Do NOT add a per-component counter or any fold over prior allocations to compute the numeric
  suffix — the seq `append()` returns IS the number, by design (see `architecture.md`).
- Do NOT add fields or behavior beyond what `interfaces.md` specifies (no speculative validation
  of `n`'s range, no persisted registry file).

## Implementation Steps

### Step 1: Read the locked tests

Read `test/clause-id.test.mjs` in full (written by T01a) before writing any code — it is the
complete specification for this task.

### Step 2: Write `lib/clause-id.mjs`

```js
// lib/clause-id.mjs — the durable clause-id shape (`<component>#c<N>`, DESIGN-3.0 §4.2) and its
// ledger-backed allocator (reasonable 3.0 Part 2). Split from lib/contract.mjs: the shape half
// (parseClauseId/formatClauseId/CLAUSE_ID_RE) is pure and imported by the parser; the allocate
// half needs lib/ledger.mjs's append() and is imported by whichever future spec-time pipeline
// mints a new clause. There is no per-component counter and no persisted registry — the id's
// numeric suffix is simply the seq the ledger's own append lock already assigns atomically, so
// two concurrent allocations can never collide without any extra fold logic.

import { append } from './ledger.mjs';
import { readJsonl } from './effort.mjs';
import { join } from 'node:path';

const COMPONENT_RE = /^[a-z0-9][a-z0-9-]*$/;

export const CLAUSE_ID_PATTERN = '[a-z0-9][a-z0-9-]*#c\\d+';
export const CLAUSE_ID_RE = new RegExp(`^${CLAUSE_ID_PATTERN}$`);

const PARSE_RE = /^([a-z0-9][a-z0-9-]*)#c(\d+)$/;

export function parseClauseId(id) {
  if (typeof id !== 'string') return null;
  const m = PARSE_RE.exec(id);
  if (!m) return null;
  return { component: m[1], n: Number(m[2]) };
}

export function formatClauseId(component, n) {
  return `${component}#c${n}`;
}

export function allocateClauseId(effortRoot, component) {
  if (typeof component !== 'string' || !COMPONENT_RE.test(component)) {
    return {
      ok: false,
      error: `allocateClauseId: component must match ${COMPONENT_RE} (got ${JSON.stringify(component)})`,
    };
  }
  const result = append(effortRoot, { type: 'clause-allocated', component });
  if (!result.ok) return { ok: false, error: result.error };
  const seq = result.event.seq;
  return { ok: true, clauseId: formatClauseId(component, seq), seq };
}

export function allocatedClauseIds(effortRoot) {
  const ledgerPath = join(effortRoot, '.reasonable', 'ledger.jsonl');
  const events = readJsonl(ledgerPath);
  const byComponent = {};
  for (const e of events) {
    if (e.type !== 'clause-allocated' || typeof e.component !== 'string') continue;
    (byComponent[e.component] ||= []).push(formatClauseId(e.component, e.seq));
  }
  return byComponent;
}
```

### Step 3: Add the one-line `lib/ledger.mjs` schema entry

Find this exact existing block in `lib/ledger.mjs`:

```js
  // Family 3 — domain events, loose validation. enrichment/characterization additionally
  // require `component`; everything else here has no required fields of its own.
  'enrichment': { required: ['component'] },
  'amendment': { required: [], validate: validateDropsAndResolvesSeq },
  'characterization': { required: ['component'] },
  'characterization-promotion': { required: [] },
```

Replace it with:

```js
  // Family 3 — domain events, loose validation. enrichment/characterization/clause-allocated
  // additionally require `component`; everything else here has no required fields of its own.
  'enrichment': { required: ['component'] },
  'amendment': { required: [], validate: validateDropsAndResolvesSeq },
  'characterization': { required: ['component'] },
  'clause-allocated': { required: ['component'] },
  'characterization-promotion': { required: [] },
```

That is the entire change to `lib/ledger.mjs` — one new line plus the comment word.

### Step 4: Run the locked tests to verify they pass

Run: `node test/clause-id.test.mjs`

Expected: `clause-id: all <N> checks pass. ✓` with no `FAIL` lines and exit code 0.

### Step 5: Run the existing ledger suite to confirm zero regression

Run: `node test/ledger.test.mjs` and `node test/ledger-effects.test.mjs`

Expected: both pass exactly as they did before this task — this task's entire `lib/ledger.mjs`
change is one additive schema line, nothing existing should be affected.

### Step 6: Commit

```bash
git add lib/clause-id.mjs lib/ledger.mjs
git commit -m "feat(clause-id): add the durable clause-id allocator and its ledger event"
```

## Acceptance Criteria
- [ ] `node test/clause-id.test.mjs` passes with zero failures
- [ ] `node test/ledger.test.mjs` and `node test/ledger-effects.test.mjs` still pass with zero
      failures (no regression)
- [ ] `test/clause-id.test.mjs` was not modified
- [ ] `lib/ledger.mjs`'s diff is exactly the one new `EVENT_SCHEMAS` line plus the one-word comment
      change — nothing else changed
- [ ] No file outside Scope was modified
