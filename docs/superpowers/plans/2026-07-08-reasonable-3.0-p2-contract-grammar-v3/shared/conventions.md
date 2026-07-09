# Conventions — Part 2: Contract Grammar v3

These are this repo's existing conventions (confirmed by reading `lib/contract.mjs`,
`lib/ledger.mjs`, `lib/effort.mjs`, `test/contract.test.mjs`, `test/ledger.test.mjs`, `CLAUDE.md`,
and Part 1's own `shared/conventions.md`) — follow them exactly, do not introduce new ones.

## Module system

- Every file is `.mjs`, native ESM (`import`/`export`). No `package.json` exists in this repo and
  none should be added — the plugin's hard invariant is "runs anywhere Node does, no
  dependencies, no build step."
- Node builtins only: `node:assert`, `node:fs`, `node:os`, `node:path`, `node:child_process`,
  `node:url`. No third-party imports, ever.

## Naming

- Files: kebab-case (`lib/clause-id.mjs`, `test/contract-v3-grammar.test.mjs`).
- Functions: camelCase (`parseClauseId`, `allocateClauseId`, `missingDemandedBy`).
- Constants: SCREAMING_SNAKE_CASE for frozen vocabulary arrays (`DEMANDED_BY_TAGS`), matching the
  existing `KINDS` constant in `lib/ledger.mjs` and `EDGE_NAMES`/`EDGE_OPS` in `lib/effects.mjs`.
  A regex-source string constant (`CLAUSE_ID_PATTERN`) also uses this casing, matching the
  precedent of exporting a composable pattern rather than only a compiled `RegExp`.

## Error handling

- `lib/clause-id.mjs`'s `allocateClauseId` returns `{ok: true, clauseId, seq}` or `{ok: false,
  error: string}` — never throws. This matches `append()`'s existing contract exactly (this
  function's only job beyond validation is to call `append()` and reshape its result).
- `parseClauseId` returns `null` on anything malformed — never throws. This matches
  `lib/contract.mjs`'s existing `parseContract()` style: a parser never throws on a malformed
  input line, it just doesn't extract structure from it.
- `lib/contract.mjs`'s `missingDemandedBy` returns a plain array (empty when nothing is missing) —
  matching the existing `danglingCitations`'s exact contract (an array of violation objects, never
  a throw, never a wrapped `{ok, ...}` result — `danglingCitations` doesn't use that envelope
  either, so `missingDemandedBy` shouldn't invent one).

## Testing — the exact harness convention (no test framework exists)

Every `test/*.test.mjs` file is a **standalone Node script**, run directly (`node
test/foo.test.mjs`), never through a runner (there isn't one). The pattern, copied verbatim from
`test/ledger-effects.test.mjs` and `test/contract.test.mjs`:

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
- Run one file: `node test/clause-id.test.mjs`. Run everything — see `knowledge/running-tests.md`.

## A deliberate, narrow exception to Part 1's "green never touches the test file" rule

Part 1's convention (still the default here, for T01 and for T02a's own new file): a `green` task
must not modify the test file its matching `red` task authored — that rule protects a freshly,
adversarially-authored test file from a green task rationalizing its way past a real failure.

**T02b is a deliberate, narrow exception, and only for one specific file:** its Scope permits it to
edit `test/contract.test.mjs` — a **different, pre-existing** file that T02a did not author and
does not own. This is not new-behavior authorship needing adversarial separation; it is a
mechanical syntax migration (`### §N <title>` → `### <component>#c<N> <title>`, and the one or two
assertions checking a literal id string) of fixtures whose *behavior* (what they assert about
Scenarios/Seams/Provenance/Supersession/Gate) is already settled and does not change. Splitting
this migration into its own separate task would leave a genuinely broken intermediate commit
(T02b's parser rewrite would make the OLD-syntax fixtures in `test/contract.test.mjs` stop
parsing as clauses, turning that suite red) sitting on the branch between two commits — worse for
bisectability than doing both in one atomic change. T02b's task file states this exception
explicitly in its own Scope section; no other task in this plan gets this latitude.

**T02b still must not modify `test/contract-v3-grammar.test.mjs`** — that file is T02a's locked,
adversarially-authored red test, and the ordinary rule applies to it in full.

## Git / commits

- Every task stages **only its own listed files**. `git add -A` / `git add .` is forbidden.
- Commit messages follow this repo's existing style: `type(scope): summary` (see `git log` in this
  repo for real examples — `feat(ledger):`, `docs(artifacts):`, `chore(release):`).
- **This plan does not bump the version automatically.** Unlike Part 1 (a pure, backward-compatible
  addition — clearly minor per `CLAUDE.md`'s rule), this part is a hard-cutover breaking change to
  an on-disk, machine-parsed grammar. `CLAUDE.md` requires a human nod before a major bump — T05
  (the last task) stops and asks rather than picking a number. See T05 and
  `docs/superpowers/specs/2026-07-08-reasonable-3.0-p2-contract-grammar-v3-design.md` for the full
  reasoning on why this leans major.

## Docs

- `docs/artifacts.md` entries follow a fixed three-part shape: prose intro → fenced example →
  field-by-field prose. Match it exactly (see T04).
- `docs/glossary.md` entries are one bullet each: `- **Term** — definition.`, cross-referencing
  other bold terms. Match it exactly (see T04).
- Per DESIGN-3.0 §12, companion doc updates (`glossary.md`, `artifacts.md`) are a **ratification
  precondition** for new normative vocabulary — T04 lands in the same wave the parser change is
  audited in, not as an afterthought several tasks later.
