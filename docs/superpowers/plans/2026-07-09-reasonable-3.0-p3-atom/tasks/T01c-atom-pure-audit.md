# Task T01c: Atom lifecycle + cohesion audit (AUDIT)

**role: audit** — read-only adversarial review of T01a's tests AND T01b's implementation. You fix
nothing; findings become new tasks.

## References
- Read: `../shared/interfaces.md`, `../shared/architecture.md`
- Read: `docs/superpowers/specs/2026-07-09-reasonable-3.0-p3-atom-design.md` Decisions 5 and 6 in
  full — the audit's job is partly to check the implementation against THIS reasoning, not just
  against the tests
- Read: `test/atom-lifecycle.test.mjs`, `test/atom-cohesion.test.mjs`, `lib/atom.mjs`
- Read: `docs/DESIGN-3.0.md` §4.1 (lifecycle chain, flags), §4.3 (cohesion, anti-padding), §15
  (draft one's vacuous wave-packing-footprint cohesion mistake — the exact defect criterion (c)'s
  root-stripping must avoid repeating)

## Dependencies
- Depends on: T01b. Depended on by: T03.

## Scope
No file modifications. Output = a findings report (your final message). You MAY run
`node test/atom-lifecycle.test.mjs`, `node test/atom-cohesion.test.mjs`, and the full existing
suite to verify claims — read-only execution, not editing.

## Audit checklist

1. **Contract coverage — the lifecycle table:** does a `check()` exist proving EVERY edge in
   `interfaces.md`'s `LIFECYCLE_TRANSITIONS` valid, AND proving every plausible near-miss
   (skip-a-hop, reverse-of-forward, terminal-has-no-outgoing) invalid? Is the flagged omission
   (`chartered -> retired-pending` is NOT an edge) actually tested as false, not just absent from
   the "valid" list?
2. **Contract coverage — cohesion:** does each of the three criteria have both a positive (coheres)
   and a negative (does not cohere via that criterion alone) test? Is transitivity tested across
   TWO DIFFERENT criteria (not the same criterion twice)? Is the disconnected/multi-component case
   tested with a real assertion on the partition shape, not just a length check?
3. **The `Object.hasOwn` guard, checked for real:** construct `isValidTransition('__proto__',
   'ready')` and `isValidTransition('constructor', 'ready')` mentally (or by running a throwaway
   script) — does `lib/atom.mjs`'s actual code guard against these resolving to an inherited
   `Object.prototype` member, or does it use a bare `LIFECYCLE_TRANSITIONS[from]` lookup that
   would return `Object.prototype`'s own methods instead of `undefined`? This is the exact defect
   class `lib/ledger.mjs`'s `validateEvent` already had to fix once (commit `39459d1`) — read the
   actual code, don't take the task file's word for it.
4. **Criterion (c), checked for real, not assumed:** pick a locus glob that does NOT start with
   the test's `componentRoot` constant at all (e.g. `'unrelated/path.mjs'`) and trace through
   `stripRoot`/`anyOverlap` by hand — does the implementation actually compare it unstripped (the
   documented conservative fallback), or does it silently drop it (a real coverage gap: does ANY
   `check()` in `test/atom-cohesion.test.mjs` exercise this fallback path, or was it only
   documented, never tested)?
5. **No component-slug search:** confirm `cohesionComponents`'s implementation never tries to find
   a component slug as a path segment inside a locus glob (only literal `componentRoot` string
   prefix stripping) — any such search would be scope creep beyond what `interfaces.md` specifies,
   and a source of silent mismatches this design deliberately avoided.
6. **Sycophancy:** does any test assert something incidental (object identity of a frozen array,
   `Map`/`Set` iteration order beyond what `sortedComponents` already normalizes, the internal
   union-find parent array) rather than the documented contract (`isValidTransition`'s boolean
   result, `cohesionComponents`'s partition-as-a-set-of-sets)?
7. **Zero regression:** run the full existing suite (see `../knowledge/running-tests.md`). Every
   file must pass exactly as before this task — `lib/atom.mjs` is a brand-new, zero-import file
   that nothing else in the repo yet references, so any regression here would indicate this task
   touched something outside its Scope.
8. **Scope discipline:** does `lib/atom.mjs` reach toward T02's I/O concerns (an `import` of
   `lib/ledger.mjs`/`lib/effort.mjs`, an `atomId`-keyed function, anything writing to disk)? Any
   such reach is a **critical** finding — the pure/I/O split is load-bearing for this plan's
   two-task-one-file exception to hold together.

## Output format
```
AUDIT atom-pure: PASS | FINDINGS
- [gap|sycophant|defect|critical] <one-line> — <file:line> — proposed follow-up (new red test / impl fix)
```
Findings marked `gap` become new red tasks appended to this plan by the supervisor. A `critical`
finding (regression in the existing suite, or I/O leaking into the pure section) blocks T02a/T02b
until resolved.
