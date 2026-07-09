# Task T02b: Atom ledger integration impl (green)

**Role:** `green` — append `lib/atom.mjs`'s I/O section below T01b's marker comment, and add six
lines to `lib/ledger.mjs`. Do not modify any test file, and do not edit anything above the marker.

## References
- Read: `../shared/architecture.md`
- Read: `../shared/interfaces.md` in full
- Read: `../shared/conventions.md` (especially the "deliberate, one-file exception" section)
- Read: `../knowledge/running-tests.md`
- Read: `lib/atom.mjs` in full before editing it — T01b's real PURE section, and the exact marker
  comment you're appending below
- Read: `lib/ledger.mjs` in full before editing it
- Read: `lib/contract.mjs`'s `DEMANDED_BY_TAGS` export (you will import it — do not re-derive the
  tag vocabulary by hand)
- Read: `lib/effort.mjs`'s `readJsonl` (you will import it)

## Dependencies
- Depends on: T02a (locked tests), T01b (the real PURE section this appends to)
- Depended on by: T02c (audits this)

## Scope

**Files:**
- Modify: `lib/atom.mjs` (append only, strictly below T01b's marker comment)
- Modify: `lib/ledger.mjs`

**BOUNDARY — you MUST NOT modify any files outside this list.**

**Do NOT modify `test/atom-lifecycle.test.mjs`, `test/atom-cohesion.test.mjs`, or
`test/atom-ledger.test.mjs` — locked.** If you believe a test is wrong, stop and escalate.

**Do NOT edit anything in `lib/atom.mjs` above the
`// ── I/O functions appended by T02b ... ──` marker line.** If you believe the pure section's
interface is missing something you need, that's a signal to stop and escalate (say so in your
final report), not to silently rewrite T01b's locked code.

## Positive Constraints (DO)
- Implement exactly the exports named in `../shared/interfaces.md`'s I/O section: `charterAtom`,
  `authorDelta`, `enrichDelta`, `transitionAtom`, `setFlag`, `clearFlag`, `loadAtom`, `foldAtoms`.
- Import `DEMANDED_BY_TAGS` from `./contract.mjs` and build the premise-validation regex from it —
  do not hand-write a duplicate tag list.
- Add exactly the six new `EVENT_SCHEMAS` lines specified in `../shared/interfaces.md`, at the
  exact location (immediately after `'clause-allocated'`), plus the comment update. Nothing else
  in `lib/ledger.mjs` changes.
- `authorDelta` records the initial delta and the ready→spec'd transition as **one** ledger event
  (`atom-delta-authored`) — DESIGN-3.0 §4.1 frames delta-authoring as what causes the atom to
  *enter* `spec'd`, not as a separate, second event; `loadAtom`'s fold treats seeing an
  `atom-delta-authored` event as the rule "state becomes `spec'd`," not as a proposal that needs a
  companion `atom-transitioned` event to confirm it.
- `enrichDelta` does **not** change lifecycle state — it only appends to `deltaClauses`.
- Every reject-before-write check happens before `append()` is called — nothing partially-invalid
  ever reaches the ledger (mirrors `allocateClauseId`'s discipline).

## Negative Constraints (DO NOT)
- Do NOT modify any of the three test files.
- Do NOT edit `lib/atom.mjs` above the marker comment.
- Do NOT touch `append()`'s internals, the attempt-arithmetic functions, the CLI, or any
  `EVENT_SCHEMAS` entry other than the six new lines.
- Do NOT add a per-atom counter or any fold beyond what `loadAtom`/`foldAtoms` need — the atom id's
  numeric suffix IS `append()`'s returned seq, exactly like Part 2's clause ids.
- Do NOT have `authorDelta`/`enrichDelta` call `cohesionComponents` internally — re-running
  cohesion after a change is the CALLER's responsibility (a later part's pipeline), not baked into
  these two functions (see `architecture.md`).
- Do NOT import from `lib/footprint.mjs`.

## Implementation Steps

### Step 1: Read the locked tests and the real pure section

Read `test/atom-ledger.test.mjs` (T02a) and the current `lib/atom.mjs` (T01b's real, landed pure
section, ending in the marker comment) in full before writing any code.

### Step 2: Append `lib/atom.mjs`'s I/O section

At the very bottom of `lib/atom.mjs`, immediately after the
`// ── I/O functions appended by T02b (see shared/conventions.md — do not edit above this line) ──`
marker line, append:

```js

import { append } from './ledger.mjs';
import { readJsonl } from './effort.mjs';
import { join } from 'node:path';
import { DEMANDED_BY_TAGS } from './contract.mjs';

const COMPONENT_RE = /^[a-z0-9][a-z0-9-]*$/;
const PREMISE_RE = new RegExp(`^(?:${DEMANDED_BY_TAGS.join('|')}):\\S.*$`, 'i');
const IN_FLIGHT_STATES = Object.freeze(['packed', 'tests-red', 'green', 'audited']);

function ledgerPath(effortRoot) {
  return join(effortRoot, '.reasonable', 'ledger.jsonl');
}

/** Fold every atom-* event belonging to `atomId` out of an already-loaded event array. Internal —
 *  not exported; loadAtom/foldAtoms are the public read surface. */
function foldOneAtom(events, atomId) {
  let record = null;
  for (const e of events) {
    if (e.type === 'atom-chartered') {
      if (`a-${e.seq}` !== atomId) continue;
      record = {
        id: atomId,
        component: e.component,
        premises: e.premises || [],
        purpose: e.purpose || '',
        locus: e.locus || [],
        order: e.order,
        state: 'chartered',
        flags: new Set(),
        deltaClauses: [],
      };
      continue;
    }
    if (!record || e.atomId !== atomId) continue;
    switch (e.type) {
      case 'atom-transitioned':
        record.state = e.to;
        break;
      case 'atom-delta-authored':
        record.deltaClauses = e.clauses || [];
        record.state = "spec'd";
        break;
      case 'delta-enrichment':
        record.deltaClauses = [...record.deltaClauses, e.clause];
        break;
      case 'atom-flag-set':
        record.flags.add(e.flag);
        break;
      case 'atom-flag-cleared':
        record.flags.delete(e.flag);
        break;
      default:
        break;
    }
  }
  return record;
}

export function charterAtom(effortRoot, charter) {
  const { component, premises, purpose, locus, order } = charter || {};
  if (typeof component !== 'string' || !COMPONENT_RE.test(component)) {
    return { ok: false, error: `charterAtom: component must match ${COMPONENT_RE} (got ${JSON.stringify(component)})` };
  }
  if (!Array.isArray(premises) || premises.some((p) => typeof p !== 'string' || !PREMISE_RE.test(p))) {
    return { ok: false, error: 'charterAtom: every premise must be a well-formed tagged reference (goal:|gate:|cite:|ledger:)' };
  }
  if (typeof purpose !== 'string' || purpose.length === 0) {
    return { ok: false, error: 'charterAtom: purpose must be a non-empty string' };
  }
  if (!Array.isArray(locus)) {
    return { ok: false, error: 'charterAtom: locus must be an array' };
  }
  if (!Number.isInteger(order) || order < 0) {
    return { ok: false, error: 'charterAtom: order must be a non-negative integer' };
  }
  const result = append(effortRoot, { type: 'atom-chartered', component, premises, purpose, locus, order });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, id: `a-${result.event.seq}`, seq: result.event.seq };
}

export function transitionAtom(effortRoot, atomId, to) {
  const atom = loadAtom(effortRoot, atomId);
  if (!atom) return { ok: false, error: `transitionAtom: unknown atomId ${JSON.stringify(atomId)}` };
  if (!isValidTransition(atom.state, to)) {
    return { ok: false, error: `transitionAtom: ${atom.state} -> ${to} is not a legal move` };
  }
  const result = append(effortRoot, { type: 'atom-transitioned', atomId, from: atom.state, to });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, from: atom.state, to };
}

export function authorDelta(effortRoot, atomId, clauses) {
  const atom = loadAtom(effortRoot, atomId);
  if (!atom) return { ok: false, error: `authorDelta: unknown atomId ${JSON.stringify(atomId)}` };
  if (atom.state !== 'ready') {
    return { ok: false, error: `authorDelta: atom must be in 'ready' state (currently '${atom.state}')` };
  }
  const result = append(effortRoot, { type: 'atom-delta-authored', atomId, clauses });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true };
}

export function enrichDelta(effortRoot, atomId, clause) {
  const atom = loadAtom(effortRoot, atomId);
  if (!atom) return { ok: false, error: `enrichDelta: unknown atomId ${JSON.stringify(atomId)}` };
  if (!IN_FLIGHT_STATES.includes(atom.state)) {
    return { ok: false, error: `enrichDelta: atom must be in an in-flight state (currently '${atom.state}')` };
  }
  const result = append(effortRoot, { type: 'delta-enrichment', atomId, clause });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true };
}

export function setFlag(effortRoot, atomId, flag, reason) {
  const atom = loadAtom(effortRoot, atomId);
  if (!atom) return { ok: false, error: `setFlag: unknown atomId ${JSON.stringify(atomId)}` };
  if (!isValidFlag(flag)) return { ok: false, error: `setFlag: flag must be one of ${FLAG_NAMES.join(', ')}` };
  const result = append(effortRoot, { type: 'atom-flag-set', atomId, flag, reason });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true };
}

export function clearFlag(effortRoot, atomId, flag) {
  const atom = loadAtom(effortRoot, atomId);
  if (!atom) return { ok: false, error: `clearFlag: unknown atomId ${JSON.stringify(atomId)}` };
  if (!isValidFlag(flag)) return { ok: false, error: `clearFlag: flag must be one of ${FLAG_NAMES.join(', ')}` };
  const result = append(effortRoot, { type: 'atom-flag-cleared', atomId, flag });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true };
}

export function loadAtom(effortRoot, atomId) {
  const events = readJsonl(ledgerPath(effortRoot));
  return foldOneAtom(events, atomId);
}

export function foldAtoms(effortRoot) {
  const events = readJsonl(ledgerPath(effortRoot));
  const ids = events.filter((e) => e.type === 'atom-chartered').map((e) => `a-${e.seq}`);
  const result = {};
  for (const id of ids) result[id] = foldOneAtom(events, id);
  return result;
}
```

`isValidTransition`, `isValidFlag`, and `FLAG_NAMES` referenced above are the real functions/
constant T01b already defined earlier in this same file — no import needed, they're in scope as
ordinary same-module bindings.

### Step 3: Add the six-line `lib/ledger.mjs` schema entries

Find this exact existing block in `lib/ledger.mjs`:

```js
  // Family 3 — domain events, loose validation. enrichment/characterization/clause-allocated
  // additionally require `component`; everything else here has no required fields of its own.
  'enrichment': { required: ['component'] },
  'amendment': { required: [], validate: validateDropsAndResolvesSeq },
  'characterization': { required: ['component'] },
  'clause-allocated': { required: ['component'] },
  'characterization-promotion': { required: [] },
```

Replace it with:

```js
  // Family 3 — domain events, loose validation. enrichment/characterization/clause-allocated/
  // atom-chartered additionally require `component`; the rest of the atom-lifecycle events
  // (reasonable 3.0 Part 3) key on `atomId` instead. Everything else here has no required fields
  // of its own.
  'enrichment': { required: ['component'] },
  'amendment': { required: [], validate: validateDropsAndResolvesSeq },
  'characterization': { required: ['component'] },
  'clause-allocated': { required: ['component'] },
  'atom-chartered': { required: ['component'] },
  'atom-delta-authored': { required: ['atomId'] },
  'delta-enrichment': { required: ['atomId'] },
  'atom-transitioned': { required: ['atomId', 'from', 'to'] },
  'atom-flag-set': { required: ['atomId', 'flag'] },
  'atom-flag-cleared': { required: ['atomId', 'flag'] },
  'characterization-promotion': { required: [] },
```

That is the entire change to `lib/ledger.mjs` — six new lines plus the comment update.

### Step 4: Run the locked tests to verify they pass

Run: `node test/atom-ledger.test.mjs`

Expected: `atom-ledger: all <N> checks pass. ✓`, zero `FAIL` lines.

Also re-run `node test/atom-lifecycle.test.mjs` and `node test/atom-cohesion.test.mjs` — T01b's
tests must still pass unchanged (you only appended below the marker, nothing above should be
affected).

### Step 5: Run the existing ledger suite to confirm zero regression

Run `node test/ledger.test.mjs`, `node test/ledger-effects.test.mjs`, and `node
test/clause-id.test.mjs`.

Expected: all three pass exactly as before this task — this task's `lib/ledger.mjs` change is six
additive schema lines, nothing existing should be affected.

### Step 6: Commit

```bash
git add lib/atom.mjs lib/ledger.mjs
git commit -m "feat(atom): wire the atom's charter/delta/enrichment/transition/flag ledger events"
```

## Acceptance Criteria
- [ ] `node test/atom-ledger.test.mjs` passes with zero failures
- [ ] `node test/atom-lifecycle.test.mjs` and `node test/atom-cohesion.test.mjs` still pass (no
      regression from appending to the same file)
- [ ] `node test/ledger.test.mjs`, `node test/ledger-effects.test.mjs`, `node
      test/clause-id.test.mjs` still pass (no regression)
- [ ] None of the three test files were modified
- [ ] Nothing above T01b's marker comment in `lib/atom.mjs` was changed
- [ ] `lib/ledger.mjs`'s diff is exactly the six new `EVENT_SCHEMAS` lines plus the comment update
- [ ] No file outside Scope was modified
