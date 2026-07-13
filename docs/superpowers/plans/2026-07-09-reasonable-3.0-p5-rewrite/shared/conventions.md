# Conventions — Part 5: The Rewrite Engine

These are this repo's existing conventions (confirmed by reading `lib/effects.mjs`, `lib/atom.mjs`,
`lib/graph.mjs`, `lib/ledger.mjs`, `test/atom-cohesion.test.mjs`, P4's own `shared/conventions.md`,
and `CLAUDE.md`) — follow them exactly, do not introduce new ones.

## Module system

- Every file is `.mjs`, native ESM (`import`/`export`). No `package.json` exists and none should be
  added — the plugin's hard invariant is "runs anywhere Node does, no dependencies, no build step."
- Node builtins only (`node:assert` is all this part needs — it does no I/O). No third-party imports,
  ever. **`lib/rewrite.mjs` must stay dependency-free** — including the SCC and cone algorithms,
  which are hand-written, not pulled from a graph library.

## Naming

- Files: kebab-case (`lib/rewrite.mjs`, `test/rewrite-router.test.mjs`).
- Functions: camelCase (`computeVerdictEffects`, `routeRefutedPremise`, `ceremonyEscalation`).
- The nine verdict-kind strings and the five route strings are pinned in `shared/interfaces.md` —
  match them exactly (`'dead-end'` not `'deadEnd'`, `'topologist-recut'` not `'recut'`).
- Edge kinds (`'needs'`/`'excludes'`/`'serves'`/`'informs'`) and ops (`'add'`/`'remove'`) are emitted
  as **string literals**, exactly as the shipped `lib/graph.mjs` emits them — the library does NOT
  import `lib/effects.mjs`'s `EDGE_NAMES`/`EDGE_OPS`. `lib/effects.mjs` is the TESTS' validator only.
- Internal rule functions are named `rule<Kind>` (`ruleDeadEnd`, `ruleOversized`, …) and registered
  into `RULES` by their kind string. They are **not exported** — tests reach them through the public
  `computeVerdictEffects` router (which is also what exercises the router's dispatch + HALT).

## Purity and error handling

- **Every function in `lib/rewrite.mjs` is pure** — takes only in-memory `verdict`/`state`/effect
  arguments, returns a plain value, reads no disk, calls no `append()`. This is the whole point of
  the part (see `architecture.md`).
- **Two return conventions, mirroring `lib/atom.mjs`:**
  - The **router** `computeVerdictEffects` returns a `{ok, ...}` envelope, because HALT-on-unknown /
    HALT-on-illegal-move is a real control-flow outcome Part 7 branches on (§7.2 Totality) — the same
    reason `atom.mjs`'s I/O functions return `{ok,...}`.
  - The **helpers and classifiers** (`routeRefutedPremise`, `scc`, `dependentCone`,
    `ceremonyEscalation`, `unwindCeremonyEscalation`) return **bare values** (a string, an array, an
    effect-or-null) and never throw — matching `atom.mjs`'s pure predicates (`isValidTransition`) and
    `graph.mjs`'s pure functions.
  - The **internal `rule<Kind>` functions** return either `{ provisional, permanent, route? }` on
    success or `{ error: '<msg>' }` on a rule-level HALT (illegal transition, bad payload). The
    router turns the latter into `{ ok:false, error }`.
- A malformed `state` (missing `edges`, wrong types on an atom record) is a **programmer error in
  the caller** — treat absent optional fields as empty (`state.edges || []`) but do not defensively
  validate the shape of a well-formed record; these functions assume they receive `deriveCurrent`-shaped
  input, the same assumption `cohesionComponents` makes about its clause array.

## Effect construction

- Every effect a rule emits MUST be a valid `lib/effects.mjs` node or edge effect. The tests assert
  `validateEffects([...rule output]).ok === true` for each rule — a rule that emits a malformed
  effect is a bug the red tests catch.
- Before emitting a `{state}` change, call `isValidTransition(atom.state, targetState)`; if false,
  return `{ error }`. This is the one enum the library validates at emit time, because an illegal
  transition is a caller error that must HALT (§7.2). Flag names are emitted as literals from the
  pinned set (`'frozen'`/`'guard-halted'`/`'dispatch-barred'`) — the same trust `lib/graph.mjs`
  places in its literal edge kinds; a mistyped flag is a bug the tests catch, not a runtime branch.
- Born-node effects (charter-intents) address the new node by a **synthetic, deterministic anchor
  key** documented in the rule (e.g. `` `${atomId}/sub-${i}` ``, `` `spike/${atomId}` ``,
  `` `birth/${concept}` ``). Part 7 rewrites these to minted `a-<seq>` ids at apply. Keep them
  deterministic so tests can assert them with `deepStrictEqual`.
- **Avoid `undefined` properties inside a `change` object.** Node's `assert.deepStrictEqual` treats
  `{a:1, b:undefined}` as *not equal* to `{a:1}`, and a `JSON.stringify` round-trip drops the key —
  so only include a `change` property when it has a defined value. Where a test needs an optional
  field (evidence, reason), pass it in the fixture so both sides match exactly.

## Testing — the exact harness convention (no test framework exists)

Every `test/*.test.mjs` file is a **standalone Node script**, run directly (`node
test/rewrite-router.test.mjs`), never through a runner (there isn't one). Copy this pattern verbatim
from `test/atom-cohesion.test.mjs`:

```js
import assert from 'node:assert';
// ... other imports ...

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.stack || e.message}`); process.exitCode = 1; }
}

check('a specific, named invariant', () => {
  assert.deepStrictEqual(actual, expected);
});

// ... more check() calls, one per invariant ...

if (process.exitCode) console.error(`\n<subject>: FAILURES above (${passed} passed).`);
else console.log(`\n<subject>: all ${passed} checks pass. ✓`);
```

Rules:
- No `describe`/`it`, no assertion library beyond `node:assert`, no mocking library.
- **All `state` and `verdict` fixtures are built BY HAND** (plain object literals) — this part is
  pure, so **no filesystem is ever needed** (unlike P4's projection tests). Do not `mkdtemp`, do not
  write a `.reasonable/` — there is nothing on disk to fold.
- Assert every rule's output with `validateEffects` as well as `deepStrictEqual` on the exact
  effects — shape-validity and content are both pinned.
- Sort edge/effect arrays before comparing when order isn't contractually fixed (copy P4's
  `sortEdges` helper) — but where a rule's output order IS deterministic (it is, for all of these),
  assert it directly.
- Run one file: `node test/rewrite-router.test.mjs`. Run everything — see
  `../knowledge/running-tests.md`.

## Docs

- `docs/artifacts.md` entries follow a fixed three-part shape: prose intro → fenced example →
  field-by-field prose. Match it exactly (see T04). T04 **supersedes** (does not duplicate) the two
  existing "future work / Part 5" scope notes — one in the "Effects" section, one in the
  "Atom lifecycle events" section — with a single new "rewrite engine" subsection.
- `docs/glossary.md` entries are one bullet each: `- **Term** — definition.`, cross-referencing
  other bold terms. T04 adds terms **only** for what this part actually implements (Failure calculus,
  Verdict R1–R9, Provisional/permanent effect, Ceremony-escalation effect, Blast radius, Routing
  ladder) plus names the flagged gaps (band calibration, legibility metric, α) — not Part 6/7's
  vocabulary.

## Git / commits, and versioning

- Every task stages **only its own listed files**. `git add -A` / `git add .` is forbidden.
- Commit messages follow this repo's style: `type(scope): summary` (`feat(rewrite):`,
  `test(rewrite):`, `docs(artifacts):`).
- **This plan does NOT bump the version.** Per the roadmap's 2026-07-09 versioning decision, P5–P8
  land on the shared refactoring line at `3.2.0` and bump once at the end of the generation. There is
  **no `version-bump-final-check` task** and **no `chore(release)` commit**. Do not touch
  `.claude-plugin/plugin.json` or the README. T05's only roadmap edit is moving the P5 status cell to
  `Landed — merged (no bump, 3.2.0)` — and only when the code + tests have merged.
