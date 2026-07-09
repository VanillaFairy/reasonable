# Task T02c: Atom ledger integration audit (AUDIT)

**role: audit** — read-only adversarial review of T02a's tests AND T02b's implementation. You fix
nothing; findings become new tasks.

## References
- Read: `../shared/interfaces.md`, `../shared/architecture.md`
- Read: `docs/superpowers/specs/2026-07-09-reasonable-3.0-p3-atom-design.md` Decisions 2, 3, 4, and
  the "Ledger event grammar summary" / "read side" sections
- Read: `test/atom-ledger.test.mjs`, the full current `lib/atom.mjs`, the diff T02b made to
  `lib/ledger.mjs`
- Read: `docs/DESIGN-3.0.md` §4.1 ("in-flight enrichment — the success path, first-class"; the
  merge-condition-is-audited-not-green ruling), §4.2 (allocation concurrency reasoning, same class
  as clause ids)

## Dependencies
- Depends on: T02b. Depended on by: T03.

## Scope
No file modifications. Output = a findings report (your final message). You MAY run
`node test/atom-ledger.test.mjs`, `node test/atom-lifecycle.test.mjs`, `node
test/atom-cohesion.test.mjs`, and the full existing suite to verify claims — read-only execution,
not editing.

## Audit checklist

1. **Contract coverage:** does every I/O function in `interfaces.md` have a `check()` for both its
   success path and at least one rejection path? In particular: does a test prove `authorDelta`
   and `enrichDelta` each check the CORRECT precondition state (not just "some" precondition), and
   that a rejection writes NOTHING to the ledger (not just that it returns `ok:false`)?
2. **The one-event-not-two design decision, checked for real:** `T02b`'s task file specifies that
   `authorDelta` records the ready→spec'd transition via the SAME `atom-delta-authored` event, not
   a companion `atom-transitioned` event. Does `loadAtom`'s fold actually implement this (does
   `foldOneAtom`'s `atom-delta-authored` case set `state = "spec'd"` directly), or did the
   implementation drift into appending two events for one logical action? Either could pass the
   locked tests (which only assert the POST-STATE via `loadAtom`, not the raw event count) — read
   the actual code and count what `authorDelta` really appends.
3. **`enrichDelta` never mutates state:** confirm by reading the code (not just trusting the one
   test) that `enrichDelta` has no code path that calls `append()` with type `atom-transitioned` or
   otherwise changes what `loadAtom(...).state` returns.
4. **The `Object.hasOwn`-class guard, checked for a NEW surface:** `foldOneAtom` reads `e.type`,
   `e.atomId`, `e.flag` off arbitrary ledger lines via bracket/property access. Could a
   maliciously- or accidentally-shaped ledger line (e.g. an event whose `atomId` is literally the
   string `'__proto__'`) cause `record.flags.add(e.flag)`-style code to misbehave, or is `Set`/
   plain dot-access here safe from the prototype-pollution class `lib/ledger.mjs`'s own
   `validateEvent` had to guard against? Reason about this concretely, don't just assert safety.
5. **No per-atom counter, no persisted registry — confirmed, not just claimed:** does `charterAtom`
   do anything beyond calling `append()` once and formatting its returned seq? Does anything in
   this diff write to a new `.reasonable/` file, a contract `.md` file, or front matter? Either
   would be scope creep beyond what this task specified.
6. **Premise validation, checked against the real `DEMANDED_BY_TAGS`:** does `charterAtom` actually
   import `DEMANDED_BY_TAGS` from `lib/contract.mjs` (proving it can't silently drift from Part
   2's real vocabulary), or did the implementation hand-roll a duplicate tag list that could go
   stale if Part 2's vocabulary ever changes?
7. **`cohesionComponents` is NOT called from `authorDelta`/`enrichDelta`:** confirm neither
   function reaches into the pure section to auto-run cohesion — that's explicitly the caller's
   job per the design doc, and an accidental auto-run would be undocumented, surprising behavior
   for whichever later part calls these functions expecting no side effects beyond the ledger
   write.
8. **Sycophancy:** does any test assert something incidental (the literal numeric seq value beyond
   "distinct from the other one," `Set` iteration order, an internal field name never documented
   in `interfaces.md`) rather than the documented contract?
9. **Zero regression:** run `node test/ledger.test.mjs`, `node test/ledger-effects.test.mjs`, `node
   test/clause-id.test.mjs`, and the full suite. All must pass exactly as before this task. Any
   change beyond the six specified `EVENT_SCHEMAS` lines and the comment update is a **critical**
   finding.
10. **Scope discipline:** does `lib/atom.mjs`'s I/O section reach toward Part 4/5 concerns
    (folding into a dependency graph, deciding which R-code applies, applying a verdict, touching
    `lib/footprint.mjs`)? Flag any such over-reach even if it doesn't break a test.

## Output format
```
AUDIT atom-ledger: PASS | FINDINGS
- [gap|sycophant|defect|critical] <one-line> — <file:line> — proposed follow-up (new red test / impl fix)
```
Findings marked `gap` become new red tasks appended to this plan by the supervisor. A `critical`
finding (regression in any existing test file, or state-machine drift from the pinned design)
blocks T03/T04 until resolved.
