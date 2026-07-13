# Conventions — P6d: `goals.json` + `policy.json` loaders

These are this repo's existing conventions (confirmed by reading `lib/route.mjs`, `test/route.test.mjs`,
`lib/graph.mjs` `servesEdges`, `lib/rewrite.mjs` `ceremonyEscalation`, P6a's `shared/conventions.md`,
and `CLAUDE.md`) — follow them exactly, do not introduce new ones.

## Module system

- Every file is `.mjs`, native ESM. No `package.json` exists and none should be added — the plugin's
  hard invariant is "runs anywhere Node does, no dependencies, no build step."
- **Node builtins only.** No third-party imports, ever. Both loaders import **only** `node:fs`
  (`existsSync`, `readFileSync`) and `node:path` (`join`) — the exact import set `route.mjs` uses.
- **Do NOT import `parseClauseId`** (or anything from `lib/clause-id.mjs`) — it transitively imports
  `ledger.mjs`/`effort.mjs`, dragging I/O into a loader `route.mjs` keeps lean. Validate a citation
  `clause` as a non-empty string instead (see `shared/interfaces.md`).

## Naming

- Files: kebab-case — `lib/goals.mjs`, `lib/policy.mjs`, `test/goals-loader.test.mjs`,
  `test/policy-loader.test.mjs`.
- Functions: camelCase — `readGoals`, `readPolicy` (mirror `readRoute`).
- Return keys mirror `route.mjs`: `{ goals, diagnostic }` and `{ policy, diagnostic }`.

## The conservative-loader contract (copy `route.mjs` exactly)

- `existsSync` + guarded `JSON.parse` — the three-state distinction (absent / malformed / valid) is the
  whole point; a plain `readJson()` that collapses absent-and-corrupt into one `null` is WRONG.
- Absent → `{ …: null, diagnostic: null }`. Malformed → `{ …: null, diagnostic: '<reason>' }`. Valid →
  `{ …: <validated>, diagnostic: null }`. **Never repair, never default, never partially trust** — one
  malformed part fails the WHOLE load. This is `route.mjs`'s iron rule; both loaders inherit it.
- Optional `ratifiedAt` / `ledgerSeq`: carried through when well-typed, else **degrade to `null`**
  (never fabricated) without invalidating an otherwise-valid load.
- **Validate SHAPE, never VALUE** (§16). A well-formed policy with absurd numbers loads clean —
  calibration is the human's, not the loader's.

## Error-message style

- Diagnostics are lowercase, prefixed with the artifact name and a colon, and name the offending field:
  `goals.json: entry 2: "id" must be a non-empty string`, `policy.json: "dials.bandScale" must be a
  non-empty array of band-name strings`. Mirror `route.mjs`'s `route.json: "slices" must be an array of
  non-empty strings`. The **content** of a diagnostic is not pinned by tests (a red test asserts
  `typeof diagnostic === 'string' && diagnostic.length > 0`, never an exact string) — so wording can be
  refined without breaking a test, exactly as `test/route.test.mjs` does it.

## Testing — the exact harness convention (no test framework exists)

Every `test/*.test.mjs` file is a **standalone Node script**, run directly (`node
test/goals-loader.test.mjs`), never through a runner (there isn't one). **Unlike P6a's pure fold, these
loaders read a real file** — so the tests build a throwaway effort dir on disk, exactly as
`test/route.test.mjs` does. Copy that harness verbatim:

```js
import assert from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readGoals } from '../lib/goals.mjs';

const tmps = [];
let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.stack || e.message}`); process.exitCode = 1; }
}

// A fresh effort root with `.reasonable/` present; `content` (a RAW string) is written verbatim so
// malformed-JSON fixtures are expressible. Omit `content` for the absent-file case.
function newEffort(content) {
  const root = mkdtempSync(join(tmpdir(), 'goals-')); tmps.push(root);
  mkdirSync(join(root, '.reasonable'), { recursive: true });
  if (content !== undefined) writeFileSync(join(root, '.reasonable', 'goals.json'), content);
  return root;
}

// ... check() calls ...

for (const d of tmps) { try { rmSync(d, { recursive: true, force: true }); } catch { /* best-effort */ } }
if (process.exitCode) console.error(`\ngoals: FAILURES above (${passed} passed).`);
else console.log(`\ngoals: all ${passed} checks passed. ✓`);
```

Rules:
- No `describe`/`it`, no assertion library beyond `node:assert`, no mocking library.
- Fixtures are written to disk as **JSON strings** (`JSON.stringify(obj)`), or raw strings for the
  malformed-JSON case. Always clean up temp dirs in the `for (const d of tmps)` loop at the end.
- Assert the **shape** of a diagnostic, never its exact text: `assert.ok(typeof diagnostic ===
  'string' && diagnostic.length > 0)`. Assert `diagnostic === null` on the valid + absent paths.
- Prove the **all-or-nothing** rule: a fixture with one malformed part among valid ones must return
  `{ …: null, diagnostic: <non-empty> }` — never a partial array/object.
- Prove **shape-not-value**: a well-formed artifact with absurd numbers loads clean (`diagnostic ===
  null`).
- The goals suite includes **one composition check**: a loaded `goals` array feeds
  `servesEdges(atoms, goals)` (imported from `../lib/graph.mjs`) and produces the expected `serves`
  edge — grounding the "`scenarioCitations` servesEdges already consumes" claim (design Decision 6).
- Run one file: `node test/goals-loader.test.mjs`. Run everything — see `../knowledge/running-tests.md`.

## Docs

- `docs/glossary.md` entries are one bullet each: `- **Term** — definition.`, cross-referencing other
  bold terms. T03 adds **goals.json**, **policy.json**, and **ceremony-sizing dial** only — **not**
  P6b/P6c's vocabulary (**cone**, **stratum**, **legibility law**, **complexity band** land with the
  sub-part that measures/consumes them, per the design's docs-precondition rule).
- `docs/artifacts.md`: T03 registers `goals.json *` and `policy.json *` as new **machine-parsed** (`*`)
  artifacts — add them to the `.reasonable/` index tree AND add a full `## goals.json *` / `##
  policy.json *` section each (model them on the existing `## route.json *` section). It also adds a
  "superseded by `goals.json` + `policy.json` (grammar + loaders built P6d; wired in P7's migration)"
  note to `route.json`'s entry — but **does NOT remove** `route.json` (Call #1: additive; the
  retirement is P7's).

## Git / commits, and versioning

- Every task stages **only its own listed files**. `git add -A` / `git add .` is forbidden.
- Commit messages follow this repo's style: `type(scope): summary` — `test(goals):`, `feat(goals):`,
  `test(policy):`, `feat(policy):`, `docs(artifacts,glossary):`, `docs(roadmap):`.
- **This plan does NOT bump the version.** Per the roadmap's 2026-07-09 versioning decision, P5–P8 land
  on the shared refactoring line at `3.2.0` and bump once at the end of the generation. There is **no
  `version-bump-final-check` task** and **no `chore(release)` commit**. Do not touch
  `.claude-plugin/plugin.json` or the README. T04's only roadmap edit is moving the **P6d** status cell
  to `Landed — merged (no bump, 3.2.0)` — and only when the code + tests have merged.
