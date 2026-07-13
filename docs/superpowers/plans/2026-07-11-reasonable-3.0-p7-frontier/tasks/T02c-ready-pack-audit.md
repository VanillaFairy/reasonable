# Task T02c: ready/pack + footprint-guard audit

**Role:** `audit` — adversarially audit the T02 tests and implementation. **Read-only** on `lib/` and
`test/`: you report findings; you do not fix. Any gap you find becomes a new `red` task.

## References
- Read: `../shared/interfaces.md` §0 (correction 1) and §1.2/§1.3, `../shared/conventions.md`
- Read: `lib/footprint.mjs` (the whole file, post-T02b), `lib/frontier.mjs` (T01+T02 sections),
  `test/frontier-ready-pack.test.mjs`, `test/footprint-disjoint.test.mjs`
- Read: `lib/ledger.mjs`'s guard (the shape T02b's guard must match)

## Dependencies
- Depends on: T02b
- Depended on by: T04 (Phase B builds on a sound Phase A)

## What to check (report each as PASS / FINDING)

1. **The CLI-guard fix is real and complete.** Confirm `lib/footprint.mjs`'s top-level scope, after the
   imports, contains **no code that runs unconditionally** except function/const declarations — the
   `runCli()` call must sit strictly behind `if (basename(process.argv[1] || '') === 'footprint.mjs')`.
   Actually run the guard-regression check in isolation (`node test/footprint-disjoint.test.mjs`) and
   separately confirm by hand: `cd` to a directory with no `.reasonable/` and run
   `node -e "import('<repo>/lib/footprint.mjs').then(()=>console.log('ok'))"` — it must print `ok` and
   exit 0, never "No effort" / exit 1.
2. **The CLI's own behavior is byte-identical.** Run `node lib/footprint.mjs` and
   `node lib/footprint.mjs --json` from inside a real (or throwaway) `.reasonable/`-bearing directory
   before and after, if a prior run's output is available; at minimum confirm by reading the code that
   `runCli()`'s body is a verbatim transcription of the pre-refactor top-level code (same variable
   names, same order, same strings) — no incidental behavior drift from the refactor.
2b. **`independent()` is untouched.** Confirm `independent(fa, fb)` still returns `{ok, why}` (not
   refactored into `footprintsDisjoint`) and the CLI's printed `why` diagnostic still reads from it —
   `footprintsDisjoint` is a thin wrapper, not a replacement.
3. **Discriminator (teeth) on `footprintsDisjoint`.** Confirm the test genuinely distinguishes a correct
   implementation from a stub always returning `true` (would pass the "disjoint" cases but fail every
   overlap case) and from a stub always returning `false` (fails every disjoint case) — walk each
   `check()` against both stubs mentally and confirm at least one fails for each.
4. **`ready`'s five conditions are each independently tested**, not just in combination: state
   eligibility (all three eligible states, all four ineligible states), needs-satisfaction (merged
   provider / absent provider / unmerged provider), and each of the three flags (frozen/guardHalted/
   barred) tested alone. A test suite that only ever tests them jointly is a finding (can't tell which
   condition is load-bearing).
5. **`pack`'s greedy first-fit is real, not an accidental single-wave return.** Confirm a test actually
   exercises the `deferred` array being non-empty (T02a's colliding-pair test) — a `pack` stub that
   always returns `{wave: everything, deferred: []}` must fail at least one test.
6. **Purity.** No test in either file touches the filesystem except the ONE sanctioned child-process
   spawn in the guard-regression check (which itself touches no file, only imports a module). Confirm
   `lib/frontier.mjs`'s T02 section imports only `footprintsDisjoint` from `./footprint.mjs` — no `fs`,
   no `readPolicy`, no other `lib/` import.
7. **No existing test broke.** Confirm the whole suite (`for t in test/*.test.mjs; do node "$t"; done`)
   is green, and specifically that nothing else in the repo shells out to `lib/footprint.mjs` in a way
   the refactor could have silently changed (grep for `footprint.mjs` across `agents/`, `workflows/`,
   `lib/` to confirm no other caller assumed the pre-refactor top-level-execution shape).

## Deliverable
A short report: each check PASS or a specific FINDING (file:line + the missing case). Gap findings
become new `red` tasks appended to this plan (`T02d-*-hardening-red.md`) before T04. If everything
passes, say so plainly and note the discriminator evidence you saw, including the manual guard
verification from check 1.

## Acceptance Criteria
- [ ] All seven checks (2 and 2b counted separately) reported PASS or FINDING with evidence
- [ ] No file was modified (read-only audit)
- [ ] Any FINDING is written as a concrete, actionable new `red` task
