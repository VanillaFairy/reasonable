# Task T02c: progress-map audit (AUDIT)

**role: audit** — read-only adversarial review of T02a tests + T02b implementation.

## References
- Read: `../shared/interfaces.md` §2–§3, `test/progress-map.test.mjs`, `lib/progress-map.mjs`
- Read: spec §"The event vocabulary" + "reopen" in
  `docs/superpowers/specs/2026-07-02-unified-execution-tree-design.md`

## Dependencies
- Depends on: T02b. Depended on by: T14.

## Scope
No file modifications. Output = findings report (final message), same format as T01c.

## Audit checklist
1. **Table completeness:** every type in interfaces §2 has an EVENT_MAP entry AND a test that
   would fail if its mapping changed. List untested mappings.
2. **Reopen semantics:** does the dispatched-seals-prior mapping preserve a pre-existing crash
   detail (no-detail seal)? Is there a sequence where a `done` item inside a sealed attempt
   loses its ✓? (CRITICAL if yes.)
3. **Heuristic resurrection:** any label matching, epoch comparison, or prose parsing smuggled
   back in? (CRITICAL if yes — clean-break decision.)
4. **Status discipline:** can any Family-3/unknown event mutate a status via the impl's
   fallback paths?
5. **Fold totality:** feed (mentally) a ledger with a malformed historical event (bad path
   chars) — does the fold survive with a degraded note, and is that TESTED?
6. **Exception creep:** anything besides cost line + inbox banner reading off-ledger?

## Output format
Same as T01c (`AUDIT progress-map: PASS | FINDINGS` + typed one-liners).
