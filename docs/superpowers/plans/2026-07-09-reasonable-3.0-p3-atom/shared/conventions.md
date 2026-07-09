# Conventions — Part 3: The Atom

These are this repo's existing conventions (confirmed by reading `lib/ledger.mjs`,
`lib/clause-id.mjs`, `lib/effects.mjs`, `lib/contract.mjs`, `lib/effort.mjs`,
`test/clause-id.test.mjs`, `test/ledger-effects.test.mjs`, `CLAUDE.md`, and Parts 1/2's own
`shared/conventions.md`) — follow them exactly, do not introduce new ones.

## Module system

- Every file is `.mjs`, native ESM (`import`/`export`). No `package.json` exists in this repo and
  none should be added — the plugin's hard invariant is "runs anywhere Node does, no
  dependencies, no build step."
- Node builtins only: `node:assert`, `node:fs`, `node:os`, `node:path`. No third-party imports,
  ever.

## Naming

- Files: kebab-case (`lib/atom.mjs`, `test/atom-lifecycle.test.mjs`).
- Functions: camelCase (`charterAtom`, `isValidTransition`, `cohesionComponents`).
- Constants: SCREAMING_SNAKE_CASE for frozen vocabulary arrays (`LIFECYCLE_STATES`,
  `TERMINAL_STATES`, `FLAG_NAMES`), matching `EDGE_NAMES`/`EDGE_OPS` in `lib/effects.mjs` and
  `DEMANDED_BY_TAGS` in `lib/contract.mjs`.
- Atom ids: `a-<seq>`, lowercase, matching the existing `<component>#c<N>` clause-id casing
  convention.

## Error handling

- Every `lib/atom.mjs` I/O function (`charterAtom`, `authorDelta`, `enrichDelta`,
  `transitionAtom`, `setFlag`, `clearFlag`) returns `{ok: true, ...}` or `{ok: false, error:
  string}` — never throws. Matches `allocateClauseId`'s existing contract exactly.
- `loadAtom` returns the folded record or `null` (an id that was never chartered) — never throws,
  never a wrapped `{ok, ...}` envelope, matching `loadContract`'s existing style (a reader either
  finds something or it doesn't).
- `foldAtoms` returns a plain object (`{}` on an effort with no charters yet) — never throws,
  matching `allocatedClauseIds`'s exact contract.
- `isValidTransition` returns a plain boolean — never throws, matching `CLAUSE_ID_RE.test()`'s
  style for a pure predicate.
- `cohesionComponents` returns a plain array of arrays — never throws. A malformed clause in the
  input array (missing `clauseId`, wrong types) is a **programmer error** in the caller (this
  function's contract assumes it receives already-validated delta clauses, e.g. from `loadAtom`),
  not a condition it needs a result envelope to report — matching `citationGraph()`'s existing
  "operates on already-parsed shapes" assumption.
- Every reject-before-write check (malformed component, unknown flag name, illegal transition)
  happens **before** `append()` is called — nothing partially-invalid ever reaches the ledger.
  Matches `allocateClauseId`'s "malformed component rejected, nothing written" discipline exactly.

## Testing — the exact harness convention (no test framework exists)

Every `test/*.test.mjs` file is a **standalone Node script**, run directly (`node
test/foo.test.mjs`), never through a runner (there isn't one). The pattern, copied verbatim from
`test/clause-id.test.mjs` and `test/ledger-effects.test.mjs`:

```js
import assert from 'node:assert';
// ... other imports ...

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.stack || e.message}`); process.exitCode = 1; }
}

check('a specific, named invariant', () => {
  assert.strictEqual(actual, expected);
});

// ... more check() calls, one per invariant, run top to bottom ...

if (process.exitCode) console.error(`\n<subject>: FAILURES above (${passed} passed).`);
else console.log(`\n<subject>: all ${passed} checks pass. ✓`);
```

Rules:
- No `describe`/`it`, no assertion library beyond `node:assert`, no mocking library.
- Each `check()` call is independent — order matters only for readability, not correctness.
- A test needing a filesystem effort root uses `mkdtempSync(join(tmpdir(), '<prefix>-'))`, pushes
  the path to a module-level `tmps` array, and cleans up with `rmSync(d, {recursive:true,
  force:true})` in a best-effort `try/catch` at the end of the file.
- Run one file: `node test/atom-lifecycle.test.mjs`. Run everything — see
  `knowledge/running-tests.md`.

## The deliberate, one-file exception: T01b and T02b both write `lib/atom.mjs`

Parts 1 and 2's default rule still holds everywhere else in this plan: a `green` task must not
modify the test file its matching `red` task authored, and no two tasks without a dependency edge
touch the same file.

**T01b and T02b are a named, narrow exception to the "one triad, one whole new file" *practice***
(not the underlying rule — a real dependency edge exists between them, so the rule itself is not
violated): both write to `lib/atom.mjs`, because the roadmap pins exactly one new file for this
whole part (see `architecture.md`'s "why one file" section) rather than the two files Parts 1 and
2 each got. T01b creates the file with its **pure** section only (lifecycle table, flag
vocabulary, cohesion algorithm) and a clear `// ── I/O functions appended by T02b ──` marker
comment at the bottom. T02b **appends** its I/O section below that marker — it must not edit,
reorder, or reformat anything T01b wrote above the marker; if T02b believes something in the pure
section needs to change to support the I/O half, that's a signal the pure section's interface was
under-specified, and the correct move is to stop and escalate (say so in the final report), not to
silently rewrite locked code.

**T02b still must not modify `test/atom-lifecycle.test.mjs` or `test/atom-cohesion.test.mjs`**
(T01a's locked tests) **or `test/atom-ledger.test.mjs`** (T02a's locked tests) — the ordinary
green-never-touches-red-tests rule applies to all three in full.

## Git / commits

- Every task stages **only its own listed files**. `git add -A` / `git add .` is forbidden.
- Commit messages follow this repo's existing style: `type(scope): summary` (see `git log` in this
  repo for real examples — `feat(atom):`, `docs(artifacts):`, `chore(release):`).
- **This plan bumps the version automatically, minor.** Unlike Part 2 (a hard-cutover breaking
  grammar change), this part is purely additive — one new file, six new optional `EVENT_SCHEMAS`
  entries, zero behavior change for any existing caller — the same shape as Part 1's automatic
  `2.7.2 → 2.8.0` bump. T04 does not stop to ask; see the design doc's "Version bump" section for
  the one-paragraph reasoning repeated there.

## Docs

- `docs/artifacts.md` entries follow a fixed three-part shape: prose intro → fenced example →
  field-by-field prose. Match it exactly (see T03).
- `docs/glossary.md` entries are one bullet each: `- **Term** — definition.`, cross-referencing
  other bold terms. Match it exactly (see T03).
- Per DESIGN-3.0 §12, companion doc updates (`glossary.md`, `artifacts.md`) are a **ratification
  precondition** for new normative vocabulary — T03 lands in the wave right after both audits are
  clean, not as an afterthought several tasks later.
- T03 adds glossary entries **only** for terms this part actually implements (`Atom`, `Charter`,
  `Delta`, `Delta-enrichment`, `Premise`, `Cohesion`, `Lineage`) — not the full §12 vocabulary list
  (`verdict`, `rewrite`, `frontier`, `cone`, `stratum`, `wave`, `legibility law`, `spec queue`,
  `starvation quorum`), which belongs to whichever later part actually builds that behavior. Adding
  them now would define vocabulary the codebase doesn't yet have behavior for — the same discipline
  Part 1's T03 already applied to `atom`/`charter`/`delta`/`verdict` before this part existed.
