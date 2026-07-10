# Conventions — P6c: The Ceremony Dial

These are this repo's existing conventions (confirmed by reading `lib/rewrite.mjs`, `lib/policy.mjs`,
`lib/graph.mjs`, `lib/goals.mjs`, `lib/atom.mjs`, `lib/effects.mjs`, `lib/ledger.mjs`,
`test/rewrite-ceremony.test.mjs`, `test/policy-loader.test.mjs`, P6a's/P6b's/P6d's
`shared/conventions.md`, and `CLAUDE.md`) — follow them exactly, do not introduce new ones.

## Module system

- Every file is `.mjs`, native ESM. No `package.json` exists and none should be added — the plugin's
  hard invariant is "runs anywhere Node does, no dependencies, no build step."
- **Node builtins only.** No third-party imports, ever. `lib/ceremony.mjs` imports **nothing at all**
  (see `shared/interfaces.md` → "Imports"): it emits its own plain objects, exactly as
  `lib/effects.mjs`/`lib/rewrite.mjs` emit theirs. It does **not** import `policy.mjs`, `graph.mjs`,
  `clause-id.mjs`, `baseline.mjs`, `rewrite.mjs`, `node:fs`, or anything I/O-bearing — the whole file is
  runtime-pure.

## Naming

- Files: kebab-case — `lib/ceremony.mjs`, `test/ceremony-classify.test.mjs`,
  `test/ceremony-phase.test.mjs`.
- Functions: camelCase — `classify`, `scaffoldMaterializes`, `rechartingDegenerates`,
  `retroClassificationDegenerates`.
- The result discriminant (`result: 'materialize' | 'degenerate'`), the degeneracy record's
  `type: 'phase-degenerated'`, and the `phase` values (`'scaffold' | 'recharter' | 'retro-classification'`)
  are emitted as **string literals**, exactly as `graph.mjs`/`rewrite.mjs` emit their edge kinds and
  verdict kinds. Do NOT import any constant module for them.

## Purity and error handling

- **All four exports are pure** — they take in-memory arguments, return a plain value, read no disk,
  call no `append()`. `lib/ceremony.mjs` has no I/O section and no marker for one; it is pure end to end.
  (It *does* carry a single append-marker between its two halves — see "One file, two triads" below —
  but both halves are pure.)
- **A missing/non-finite threshold disables its lift** — never throw, never fabricate a default. If
  `dials.classifier` is absent, every axis contributes `0` pressure (→ the lowest band); if
  `dials.bandScale` is absent/empty, `classify` returns `null`. Same shape-not-value / never-fabricate
  discipline `lib/policy.mjs` / `lib/route.mjs` / `lib/legibility.mjs` hold.
- **Never throw on thin/degenerate input:** `classify(undefined, undefined)` → `null`;
  `scaffoldMaterializes(undefined, undefined, undefined)` → a `degenerate` result (an empty snapshot has
  nothing to author); `rechartingDegenerates(undefined)` / `retroClassificationDegenerates(undefined)` →
  `degenerate`. The **conservative** direction for the scaffold predicate is *materialize when in doubt*
  — but a genuinely empty snapshot is not "in doubt," it is unambiguously nothing, so it degenerates.
- Treat absent optional fields defensively only where the shipped folds already do (`atom.component`,
  `goal.scenarioCitations`, `citation.clause`); do not add validation for well-formed records — the
  functions assume `readGoals`/charter-fold-shaped input, the same assumption `servesEdges` makes.

## Result / record construction

- Every predicate result is exactly `{ result: 'materialize' }` **or**
  `{ result: 'degenerate', degeneracy: { type: 'phase-degenerated', phase, reason, inputs } }` — no
  `undefined` properties (Node's `assert.deepStrictEqual` treats `{a:1, b:undefined}` as unequal to
  `{a:1}`; emit only the fixed keys).
- The degeneracy record must be **JSON-serializable** (P7 appends it to the ledger) — a red test pins
  `JSON.parse(JSON.stringify(result))` deep-equals the result.
- Determinism: sort array-valued locators in the record (`newGoalIds`, `shellAtomIds`) so the output is
  stable, exactly as the graph tests `sortEdges` before comparing.
- `classify` returns a **band-name string** from `dials.bandScale`, or `null`. Never a band it invented.

## Testing — the exact harness convention (no test framework exists)

Both test files are **standalone Node scripts**, run directly (`node test/ceremony-classify.test.mjs`),
never through a runner (there isn't one). **Both are PURE — no filesystem is ever needed** (unlike P6d's
loaders, like P6a's/P6b's pure folds). Copy this pattern verbatim from `test/rewrite-ceremony.test.mjs`
/ `test/legibility.test.mjs`:

```js
import assert from 'node:assert';
import { classify /* or the phase predicates */ } from '../lib/ceremony.mjs';
// the classify test ALSO imports the shipped ceremonyEscalation for the round-trip check:
import { ceremonyEscalation } from '../lib/rewrite.mjs';
import { validateEffects } from '../lib/effects.mjs';   // validator only, never a lib dep

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.stack || e.message}`); process.exitCode = 1; }
}

// ... check() calls ...

if (process.exitCode) console.error(`\nceremony-…: FAILURES above (${passed} passed).`);
else console.log(`\nceremony-…: all ${passed} checks pass. ✓`);
```

Rules:

- No `describe`/`it`, no assertion library beyond `node:assert`, no mocking library.
- **All fixtures are built BY HAND** (plain object literals) — the classifier's `inputs`/`dials`, and the
  phase predicates' `genesis`/`lastRatified` snapshots. `classify`/the predicates are pure, so **no
  filesystem** is ever needed. Do not `mkdtemp`, do not write a `.reasonable/`, do not import
  `lib/policy.mjs`/`lib/goals.mjs`. The `dials` fixture is a synthetic literal carrying `bandScale` +
  `classifier` (never `readPolicy`'s output — the object-shape coupling only).
- **Assert INTENT and PROPERTIES, not over-fitted goldens.** Pin the *monotonicity property* (raising any
  axis never lowers the band index) directly, over several input variations — not one golden band per
  input. Pin the *conservative property* for the scaffold predicate (a genuinely new goal cone MUST
  materialize; an amendment-only change MUST degenerate) as **decisions**, under fixtures you choose to
  make the case unambiguous. Where `shared/interfaces.md` flags a mechanism as contestable (the combiner,
  the outer-shell boundary), assert the decision, never the incidental number. Escalate to the supervisor
  rather than pinning a value the interfaces flag as open.
- **The `ceremonyEscalation` round-trip is mandatory** in the classify test (the one load-bearing
  composition): a classified non-top band ratchets up exactly one step; a classified top band is capped
  (`null`). Use the wide-R2 fixture shape from `test/rewrite-ceremony.test.mjs`.
- **The adversarial phase-predicate cases are mandatory** (the mandated pin): new-goal-cone materializes,
  amendment-only degenerates, both outer-shell edges (new component; skeletonized depth-0 provider) each
  materialize, and a skeletonized non-shell interior atom degenerates.
- Run one file: `node test/ceremony-classify.test.mjs`. Run everything — see
  `../knowledge/running-tests.md`.

## One file, two triads (the append-marker)

`lib/ceremony.mjs` is **one file** (Cross-cutting Decision 1 — the ceremony dial is one responsibility)
but is built by **two triads**: T01 (the classifier) creates it and leaves the marker

```
// ── B. phase-degeneration predicates appended by T02b — do not edit above this line ──
```

as the file's last line; T02 (the phase predicates) **appends its section below the marker and edits
nothing above it** — the exact append-don't-edit discipline `lib/rewrite.mjs` used to grow across its
three triads and `lib/graph.mjs` used for P6a. The two halves share no helper, so nothing crosses the
marker.

## Docs

- `docs/glossary.md` entries are one bullet each: `- **Term** — definition.`, cross-referencing other
  bold terms. T03 adds **Complexity band**, **Complexity classifier**, and **Phase degeneration** only —
  not P6e's vocabulary (**topologist**, **topology.html**), which lands with that sub-part. Cross-link
  only terms that already exist (**Ceremony-escalation effect**, **Ceremony-sizing dial**, **Cone**,
  **Serves**, **Walking skeleton**, **Blast radius**); do NOT bold **topologist**.
- `docs/artifacts.md`: P6c adds **no new artifact** (`ceremony.mjs` is a pure calculus, nothing on
  disk). T03 records that the classifier + phase-degeneration predicate are built, coins the
  `dials.classifier` note on the `policy.json` `dials` bullet, and closes the two remaining Part-5/6c
  forward-references. It does **not** invent artifact grammar or edit `lib/policy.mjs`/`lib/ledger.mjs`.

## Git / commits, and versioning

- Every task stages **only its own listed files**. `git add -A` / `git add .` is forbidden.
- Commit messages follow this repo's style: `type(scope): summary`
  (`test(ceremony):`, `feat(ceremony):`, `docs(artifacts,glossary):`, `docs(roadmap):`).
- **This plan does NOT bump the version.** Per the roadmap's 2026-07-09 versioning decision, P5–P8
  (P6a–P6e included) land on the shared refactoring line at `3.2.0` and bump once at the end of the
  generation. There is **no `version-bump-final-check` task** and **no `chore(release)` commit.** Do not
  touch `.claude-plugin/plugin.json` or the README. T04's only roadmap edit is moving the **P6c** status
  cell to `Landed — merged (no bump, 3.2.0)` — and only when the code + tests have merged.
