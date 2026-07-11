# Conventions — Part 7: The Frontier Loop + Gates

These are this repo's existing conventions (confirmed by reading `lib/ledger.mjs`, `lib/reconcile.mjs`,
`lib/next-action.mjs`, `lib/graph.mjs`, `lib/rewrite.mjs`, `lib/ceremony.mjs`, `lib/footprint.mjs`,
`workflows/vertical-slice-runner.workflow.js`, P5/P6's own `shared/conventions.md`, and `CLAUDE.md`) —
follow them exactly, do not introduce new ones. Part 7 is the first part that **edits load-bearing
2.x engine files** (`ledger.mjs`, `reconcile.mjs`, `next-action.mjs`, `progress-map.mjs`), so the
"suite green after every task" rule is the spine of the whole plan, not an afterthought.

## Module system
- Every `lib/` file is `.mjs`, native ESM. No `package.json`; none should be added (Law 1: "runs
  anywhere Node does, no dependencies, no build step").
- **Node builtins + relative `lib/` imports only.** `lib/frontier.mjs` imports exactly one thing
  (`footprintsDisjoint` from `./footprint.mjs`); the append-path additions import from `./rewrite.mjs`,
  `./graph.mjs`, `./goals.mjs`, `./policy.mjs` — all already-shipped exports. No third-party import,
  ever.

## Purity boundaries (three tiers — do not blur them)
- **`lib/frontier.mjs` is PURE** — verdict/graph/policy/footprint data in, plain values out, no disk,
  no `append()`, no `Date`, no `Math.random`. Unit-tested with hand-built fixtures (no `mkdtemp`), the
  P5 shape.
- **`lib/next-action.mjs`'s `deriveConeOrder` is PURE** — reconcile does the disk reads and hands it
  goals/atoms/weights, exactly as `projectDirectives` is already fed a pre-digested `state`.
- **The append-path additions (`ledger.mjs`) and reconcile/progress ARE I/O code** — they run inside
  `append()`'s `withLock` body / `reconcile()` / `writeMirror`. Their tests build a throwaway git repo
  + `.reasonable/` in the OS temp dir and exercise the real path (the `reconcile`/`ledger` test style),
  not hand fixtures.
- **`workflows/frontier-wave.workflow.js` is PURE and IMPORT-FREE** (substrate, `CLAUDE.md` invariant
  5): no `fs` / `Date.now()` / `Math.random()` / `new Date()` / `import`. All side effects happen
  inside agents. It **inlines** pure mirrors of `pack` / `gateDue` (each with a `// Mirrors
  lib/frontier.mjs <fn> EXACTLY` comment — the repo's `groupDisjoint` precedent), because the substrate
  forbids importing them.

## Naming
- Files: kebab-case (`lib/frontier.mjs`, `test/frontier-gate.test.mjs`,
  `workflows/frontier-wave.workflow.js`).
- Functions: camelCase (`gateDue`, `requiredRoles`, `deriveConeOrder`, `footprintsDisjoint`).
- The seven gate kinds + the non-firing `'none'` sentinel are pinned in `interfaces.md` §1.1 — match
  them exactly (`'blocked-human'` not `'blocked'`, `'goal-green'` not `'green'`).
- The two new event types are `'atom-verdict'` and `'phase-degenerated'` (verified free in
  `EVENT_SCHEMAS`). The nine verdict kinds live in `rewrite.mjs`'s `VERDICT_KINDS` — never restate
  them; import if needed.
- Edge kinds (`'needs'`/`'excludes'`/`'serves'`/`'informs'`) are string literals, exactly as
  `graph.mjs` emits them.

## The append-path discipline (the load-bearing §2.4 rule)
- The controller **overwrites** `effects` for an `atom-verdict`, exactly as it overwrites `seq` — no
  caller (and not the workflow) authors an effect set. The verdict branch lives **inside** the existing
  `withLock` body's Family-3 arm, gated on `type === 'atom-verdict'`, so **no existing event type pays
  for the snapshot build**.
- An `atom-verdict` whose `computeVerdictEffects` returns `{ ok:false }` makes `append()` return
  `{ ok:false, error }` and write nothing (fail-closed inside an effort, §7.2). Use the same
  early-return-inside-`withLock` shape the shipped `resolveFamily1Address` failures use.
- The snapshot is **read-only** and reads the effort's **canonical** state (`deriveCurrent`), never a
  lane's in-flight divergence (§2.4).
- `append()` never throws (its shipped contract) — every new failure path returns `{ ok:false, error }`.

## Migration safety (Phase C — the whole point of the five-step order)
- **Additive first, subtractive last.** Never delete `route.mjs` until `reconcile.mjs` no longer
  imports `readRoute` and no test exercises it. The suite is green after every green/audit task.
- A `green` task that edits `reconcile.mjs`/`next-action.mjs` must run the **whole** suite (not just its
  own new test) and confirm zero regressions — these are shared, live-engine files.
- Keep the honest transition window (route path as fallback when `goals.json` absent) through T07;
  close it at T08. Do not collapse T07→T08 into one non-green commit.

## Testing — the exact harness convention (no test framework exists)
Every `test/*.test.mjs` is a standalone Node script, run directly, never through a runner. Copy this
verbatim (from `test/atom-cohesion.test.mjs`):

```js
import assert from 'node:assert';
let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.stack || e.message}`); process.exitCode = 1; }
}
check('a specific, named invariant', () => { assert.deepStrictEqual(actual, expected); });
if (process.exitCode) console.error(`\n<subject>: FAILURES above (${passed} passed).`);
else console.log(`\n<subject>: all ${passed} checks pass. ✓`);
```

- No `describe`/`it`, no assertion library beyond `node:assert`, no mocking.
- **Pure-lib tests** (`frontier`, `next-action deriveConeOrder`) build fixtures by hand — **no
  filesystem**.
- **I/O tests** (`ledger` append branch, `reconcile` projection, `progress-map` fold) build a throwaway
  git repo + `.reasonable/` in the OS temp dir (`node:fs mkdtemp`, `node:child_process` git), exactly
  as the shipped `test/reconcile*.test.mjs` / `test/*ledger*` tests do. Read one of those before
  writing a new I/O test and copy its scaffolding (root creation, `append(...)`, cleanup).
- **Workflow tests** (`frontier-wave`) load the body via the `new Function(...GLOBALS)` harness the
  shipped `vertical-slice-runner-*` tests use, inject stub `agent`/`budget`/`phase`, and assert the
  seven-variant union + role-minimal dispatch. `test/workflow-load.test.mjs` auto-covers purity/load.
- Assert every emitted effect with `validateEffects` (import from `../lib/effects.mjs`) in addition to
  `deepStrictEqual`.
- **Avoid `undefined` properties inside asserted objects** — `assert.deepStrictEqual` treats
  `{a:1,b:undefined}` as ≠ `{a:1}`, and a `JSON.stringify` round-trip drops the key. Only include a
  property when it has a defined value.
- Sort edge/effect arrays before comparing when order is not contractually fixed; where it is
  deterministic (it is, for all P7 surfaces), assert it directly.
- Run one file: `node test/frontier-gate.test.mjs`. Run everything: see `../knowledge/running-tests.md`.

## Docs (T11 — a §12 ratification precondition)
- `docs/glossary.md` entries are one bullet each: `- **Term** — definition.`, cross-linking other bold
  terms. Add terms **only** for what P7 implements (**Frontier**, **Wave**, **Gate cadence /
  band-indexed floor**, **Starvation valve**, **GATE_RESULT**, **atom-verdict** event, **Lazy /
  role-minimal provisioning**) plus name the flagged gaps — not P8's scout vocabulary.
- `docs/artifacts.md`: register the two new machine-parsed event types (`atom-verdict`,
  `phase-degenerated`) and the `ratification` payload fields (`ratifiesSeqs`/`rejectsSeqs`/
  `pendingPermanent`) as `*` grammar (invariant 3 — machine-parsed grammar). Mark `route.json`
  **retired; superseded by goals.json/policy.json**. Do NOT re-define P6's already-landed terms.
- `skills/vertical-slice-execution/SKILL.md`: repoint from `vertical-slice-runner` to `frontier-wave`
  and from the four-variant union to the seven-variant `GATE_RESULT` routing.

## Git / commits, and versioning
- Every task stages **only its own listed files**. `git add -A` / `git add .` is forbidden.
- Commit messages: `type(scope): summary` (`feat(frontier):`, `test(frontier):`, `feat(ledger):`,
  `refactor(reconcile):`, `docs(glossary,artifacts):`). Tag `(P7)` where the P5/P6 commits tagged their
  part.
- **This plan does NOT bump the version.** Per the roadmap's 2026-07-09 versioning decision, P5–P8 land
  on the shared refactoring line at `3.2.0` and bump once (major) at the end of the generation. There
  is **no `version-bump-final-check` task** and **no `chore(release)` commit**. Do not touch
  `.claude-plugin/plugin.json` or `README.md`. T12's only roadmap edit is moving the P7 status cell to
  `Landed — merged (no bump, 3.2.0)` — and only when the code + tests have merged (that is the
  *executor's* T12; the *planning* commit that lands this plan moves the cell to `Planned`).
- End commit messages with the repo's `Co-Authored-By: Claude ...` trailer per `CLAUDE.md`/house style.
