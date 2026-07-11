# Task T05b: two-phase `ratification` fold impl (green)

**Role:** `green` — extend `lib/ledger.mjs`'s `'ratification'` schema validation and `append()` with
the two-phase fold. Implement exactly what the locked tests require; do not modify any test file.

## References
- Read: `../shared/interfaces.md` §2, `../shared/conventions.md`
- Read: `test/ledger-two-phase.test.mjs` (T05a's locked tests)
- Read: `lib/ledger.mjs`'s current `validateDropsAndResolvesSeq` function and the `'ratification'`
  schema entry (you extend, not replace, the drops/resolvesSeq checks)
- Read: `lib/rewrite.mjs`'s `unwindCeremonyEscalation` (already imported by T04b)

## Dependencies
- Depends on: T05a (locked tests), T04b (the `atom-verdict` branch + `pendingPermanent` field this
  fold reads)
- Depended on by: T05c (audits), T09 (the frontier-wave workflow appends `ratification` events at gates)

## Scope
**Files:**
- Modify: `lib/ledger.mjs`

**BOUNDARY — you MUST NOT modify any files outside this list.** Do NOT modify
`test/ledger-two-phase.test.mjs` — locked. Do NOT edit `lib/rewrite.mjs`.

## Positive Constraints (DO)
- Add a new `validateRatificationPayload(event)` function that calls the existing
  `validateDropsAndResolvesSeq(event)` FIRST (reuse, don't duplicate its drops/resolvesSeq checks),
  then additionally validates `ratifiesSeqs`/`rejectsSeqs` when present (each must be an array of
  positive integers). Point `'ratification'`'s `EVENT_SCHEMAS` entry at this new function; leave
  `'amendment'`'s entry pointing at the original `validateDropsAndResolvesSeq`, untouched.
- Add `readJsonl` to the existing `./effort.mjs` import (it is already exported there; not currently
  imported by `lib/ledger.mjs`).
- Add the fold logic inside the Family-3 `else` arm, as a sibling condition to the T04 `atom-verdict`
  branch: when `type === 'ratification'` and at least one of `ratifiesSeqs`/`rejectsSeqs` is a
  non-empty array, read the whole ledger (`readJsonl(ledgerPath)`), build a `seq -> event` map, and set
  `stamped.effects` to the union of: each `ratifiesSeqs` entry's referenced event's `pendingPermanent`
  (if present), and each `rejectsSeqs` entry's referenced event's ceremony-escalation effect (found by
  shape: an entry in that event's `effects` array whose `change.band !== undefined && change.from !==
  undefined`), unwound via `unwindCeremonyEscalation`.
- When NEITHER field is present (or both are empty), do nothing — leave `stamped.effects` exactly as
  the caller's own `event.effects` set it (or absent), preserving backward compatibility.

## Negative Constraints (DO NOT)
- Do NOT change `validateDropsAndResolvesSeq` itself (used by `'amendment'` too — leave it exactly as
  shipped).
- Do NOT touch the T04 `atom-verdict` branch.
- Do NOT mutate any prior ledger line — this is a pure fold over already-written events, read-only.

## Implementation Steps

### Step 1: Add `readJsonl` to the import

Change:

```js
import { withLock, appendJsonlLocked, rootFromArgv, argvWithoutRoot, findEffortRoot, existsSync, join, basename, localISOString } from './effort.mjs';
```

to:

```js
import { withLock, appendJsonlLocked, rootFromArgv, argvWithoutRoot, findEffortRoot, existsSync, join, basename, localISOString, readJsonl } from './effort.mjs';
```

Also add `unwindCeremonyEscalation` to the existing `./rewrite.mjs` import (T04b already imports
`computeVerdictEffects, ceremonyEscalation` from there):

```js
import { computeVerdictEffects, ceremonyEscalation, unwindCeremonyEscalation } from './rewrite.mjs';
```

### Step 2: Extend the `'ratification'` validation

Find `validateDropsAndResolvesSeq` (it currently validates `drops`/`resolvesSeq`). Immediately after
its closing brace, add:

```js
// reasonable 3.0 Part 7 (§7.2 Decision 5): the two NEW optional ratification-only payload fields —
// ratifiesSeqs (accept: fold the referenced atom-verdicts' pendingPermanent) and rejectsSeqs (reject:
// unwind the referenced ceremony-escalation). Each, when present, is an array of positive integers (a
// 1-based ledger seq). Wraps validateDropsAndResolvesSeq — 'amendment' events keep using THAT function
// directly, untouched; only 'ratification' gains these two fields.
function validateRatificationPayload(event) {
  const base = validateDropsAndResolvesSeq(event);
  if (base) return base;
  for (const field of ['ratifiesSeqs', 'rejectsSeqs']) {
    if (event[field] !== undefined) {
      if (!Array.isArray(event[field]) || !event[field].every((n) => Number.isInteger(n) && n > 0)) {
        return { ok: false, error: `${event.type}: '${field}', when present, must be an array of positive integers (ledger seqs)` };
      }
    }
  }
  return undefined;
}
```

Find the `EVENT_SCHEMAS` entry:

```js
  'ratification': { required: [], validate: validateDropsAndResolvesSeq },
```

Change it to:

```js
  'ratification': { required: [], validate: validateRatificationPayload },
```

### Step 3: Add the fold to `append()`

In the Family-3 `else` arm (where T04b added the `atom-verdict` branch), add a sibling branch
immediately after it:

```js
        // reasonable 3.0 Part 7 (§7.2 Decision 5): the two-phase fold. "Pending permanence" is
        // computed HERE, from the ledger, every call — never a mutable side-table. Accept
        // (ratifiesSeqs) folds the referenced atom-verdicts' pendingPermanent verbatim; reject
        // (rejectsSeqs) unwinds any ceremony-escalation effect on the referenced verdict via the pure
        // inverse P5 proved (apply-then-unwind = identity).
        if (type === 'ratification') {
          const ratifies = Array.isArray(event.ratifiesSeqs) ? event.ratifiesSeqs : [];
          const rejects = Array.isArray(event.rejectsSeqs) ? event.rejectsSeqs : [];
          if (ratifies.length > 0 || rejects.length > 0) {
            const bySeq = new Map(readJsonl(ledgerPath).map((e) => [e.seq, e]));
            const folded = [];
            for (const seq of ratifies) {
              const v = bySeq.get(seq);
              if (v && Array.isArray(v.pendingPermanent)) folded.push(...v.pendingPermanent);
            }
            for (const seq of rejects) {
              const v = bySeq.get(seq);
              const esc = v && Array.isArray(v.effects)
                ? v.effects.find((e) => e.change && e.change.band !== undefined && e.change.from !== undefined)
                : undefined;
              if (esc) folded.push(...unwindCeremonyEscalation(esc));
            }
            stamped.effects = folded;
          }
        }
```

Note: `ledgerPath` is already in scope (a `const` defined earlier in `append()`, used by
`appendJsonlLocked` below).

### Step 4: Run the locked test to verify it passes

Run: `node test/ledger-two-phase.test.mjs`

Expected: `ledger-two-phase: all <N> checks passed. ✓`, zero `FAIL` lines.

### Step 5: Confirm zero regression to the whole suite

```bash
for t in test/*.test.mjs; do node "$t"; done
```

No `FAIL` line anywhere — in particular `test/ledger-atom-verdict.test.mjs` (T04, untouched logic) and
every existing `amendment`/`ratification`-touching test (search for them) still pass, since
`validateDropsAndResolvesSeq` itself was not changed.

### Step 6: Commit

```bash
git add lib/ledger.mjs
git commit -m "feat(ledger): the two-phase ratification fold — pendingPermanent accept, ceremony-escalation reject/unwind (green, P7)" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

## Acceptance Criteria
- [ ] `node test/ledger-two-phase.test.mjs` passes with zero failures
- [ ] `validateRatificationPayload` wraps (does not duplicate) `validateDropsAndResolvesSeq`;
      `'amendment'`'s schema entry is untouched
- [ ] The fold reads the ledger fresh every call (no cached/mutable state) and only activates when at
      least one of `ratifiesSeqs`/`rejectsSeqs` is a non-empty array
- [ ] The whole existing suite still passes; no file outside Scope was modified
