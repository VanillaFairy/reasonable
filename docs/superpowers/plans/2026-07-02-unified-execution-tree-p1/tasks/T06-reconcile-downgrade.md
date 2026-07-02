# Task T06: reconcile emits `node-downgraded`

## References
- Read: `../shared/interfaces.md` §2 (Family 1 + node resolution) + §4, `../shared/conventions.md`
- Read: `lib/reconcile.mjs` — locate the lost-work downgrade site (where a `dispatched` work
  order is downgraded to `pending` during recovery; search for the dispatched→pending transition
  / dispatchEpoch handling)
- Read: existing `test/reconcile-*.test.mjs` files for fixture style (they build real git repos)

## Dependencies
- Depends on: T03b. Depended on by: T14.

## Scope
**Files:**
- Modify: `lib/reconcile.mjs`
- Create: `test/reconcile-downgrade-event.test.mjs`

**BOUNDARY — you MUST NOT modify `lib/ledger.mjs` or any other file.**

## Positive Constraints (DO)
- At the exact code point where reconcile downgrades a work order `dispatched → pending`
  (lost-work crash), call the controller's JS API:
  ```js
  import { append } from './ledger.mjs';
  const r = append(root, { type: 'node-downgraded', workOrder: woId, kind: 'work-order' }, { regen: true });
  ```
- **Non-fatal posture (Plan 1):** if `r.ok === false` (e.g. the WO has no `node-planned` yet,
  so the id is unresolvable in the tree), reconcile logs/records the miss and CONTINUES —
  recovery must never die because the progress tree is thin. Match how reconcile reports other
  non-fatal notes.
- Test: build a minimal effort fixture where the journal has a `dispatched` work order and the
  ledger has its `node-planned` + `node-dispatched`; run the downgrade path; assert a
  `node-downgraded` line landed with stamped `attempt` and resolved `node`, and that
  progress.json shows the attempt subtree `failed` with detail `lost-work crash`.
  Second check: same but WITHOUT `node-planned`/`node-dispatched` in the ledger → downgrade
  still succeeds journal-side, NO ledger line, no throw.

## Negative Constraints (DO NOT)
- Do NOT make append failure fatal to reconcile.
- Do NOT emit from any other reconcile path (checkpoint reclaim is NOT a downgrade).
- Do NOT restructure reconcile — one surgical insertion + import.

## Implementation Steps
1. Locate the downgrade site; insert the call + non-fatal handling.
2. Write the test (repo shape, reconcile-fixture style); run → green.
3. Run all `test/reconcile-*.test.mjs` → no NEW failures.
4. Commit:
```bash
git add lib/reconcile.mjs test/reconcile-downgrade-event.test.mjs
git commit -m "feat(reconcile): record lost-work downgrades as node-downgraded ledger events

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

## Acceptance Criteria
- [ ] Event emitted exactly at the dispatched→pending lost-work site, nowhere else
- [ ] Unresolvable node tolerated (tested)
- [ ] No file outside Scope touched
