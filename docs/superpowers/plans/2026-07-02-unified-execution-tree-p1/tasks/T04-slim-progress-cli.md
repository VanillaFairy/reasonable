# Task T04: Slim `lib/progress.mjs` to a delegate + rewrite its tests

## References
- Read: `../shared/interfaces.md` §3 + §5, `../shared/conventions.md`
- Read: current `lib/progress.mjs` (you delete most of it) and `test/progress.test.mjs`
- Read: `docs/superpowers/plans/knowledge/running-tests.md`

## Dependencies
- Depends on: T05 (action-report gone — it imported progress.mjs), T02b. Depended on by: T14.

## Scope
**Files:**
- Modify: `lib/progress.mjs` (rewrite to the §5 thin surface)
- Modify: `test/progress.test.mjs` (rewrite — old heuristic tests die with the heuristics)

**BOUNDARY — you MUST NOT modify `lib/progress-map.mjs`, `lib/progress-tree.mjs`,
`hooks/hooks.json`, or anything else.**

Note: this task intentionally owns BOTH the code and its tests (no triad) — it is a deletion +
delegation task; the behavioral contracts live in T01/T02/T03's locked suites.

## Positive Constraints (DO)
- New `lib/progress.mjs` per interfaces §5: CLI flags `--json`, default print, `--write`,
  `--regen` (silent, fail-open), `--hook` (stdin payload; regen ONLY when the written target is
  a canonical `<effortRoot>/.reasonable/ledger.jsonl` — basename AND parent-dir check as today;
  journal.json / inbox.json NO LONGER trigger). Everything imported from `progress-map.mjs`.
  Keep the `--root` convention and the fail-open-outside-effort posture.
- Preserve the module-was-run-directly guard (`basename(process.argv[1]…)`) exactly as the
  current file does.
- New `test/progress.test.mjs` (repo test shape), covering: `--hook` regen fires on a ledger
  write payload and writes both mirrors; `--hook` ignores a `journal.json` payload and a
  `src/ledger.jsonl` (wrong parent) payload; `--regen` outside an effort exits 0 silently;
  `--write` inside an effort writes mirrors and prints a summary line; default/`--json` print
  modes emit parseable output.

## Negative Constraints (DO NOT)
- Do NOT keep ANY of: `replayActions`, `sectionsFromEnrichment`, `enrichmentChildren`,
  `actionLine` (now `formatText` in progress-map), the GLYPH/ACTION_GLYPH tables, ts-suppression,
  `buildModel`/`renderMarkdown` locals — the file shrinks to CLI plumbing (~80 lines).
- Do NOT change hook registration (hooks.json already routes to this file's `--hook`).

## Implementation Steps
1. Rewrite `lib/progress.mjs`; `node --check lib/progress.mjs`.
2. Rewrite `test/progress.test.mjs`; run it → green.
3. Full suite: `for t in test/*.test.mjs; do node "$t" || echo "FAILED: $t"; done` → no NEW failures.
4. Commit:
```bash
git add lib/progress.mjs test/progress.test.mjs
git commit -m "refactor(progress): slim to CLI/hook delegate over progress-map — heuristics deleted

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

## Acceptance Criteria
- [ ] `grep -nE "replayActions|sectionsFromEnrichment|enrichmentChildren|ACTION_GLYPH" lib/progress.mjs` → no output
- [ ] Hook fires only on canonical ledger writes (tested)
- [ ] No file outside Scope touched
