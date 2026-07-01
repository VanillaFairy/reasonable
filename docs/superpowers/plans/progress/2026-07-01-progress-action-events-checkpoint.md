# Checkpoint: 2026-07-01-progress-action-events

**Status: COMPLETE.** All 10 tasks done and merged into `fix/scribe-sha-custody`. Full test suite
green (19 files).

## Tasks

| Task | Status | Commit(s) | Notes |
|------|--------|-----------|-------|
| 1 — appendJsonl concurrency hardening | ✅ merged | `a310b5f` | |
| 2 — action-events.mjs shared vocabulary | ✅ merged | `1fa0411` | |
| 4a — red: progress replay tests | ✅ merged | `ea477f7` | |
| 3 — action-report.mjs CLI | ✅ merged | `6a315c0` | first dispatch blocked on a stale worktree, retried manually |
| 4b — green: replayActions + rendering | ✅ merged | `60c93ba` | |
| 4c — audit | ✅ merged | `00974e1` | found + closed one real test gap (item event, no section ever opened) |
| 5 — retire heartbeat tier | ✅ merged | `23f8472` | found + fixed a real bug (dangling `resetLive` import in `session-start.mjs`) |
| 6a — clause-based constitutions | ✅ merged | `6994895` | |
| 6b — catalog-based constitutions | ✅ merged | `9445f23` | |
| 7 — docs | ✅ merged | `b334dd0` | |
| 8 — clean-code pass | ✅ merged | `c43c808` | fixed 2 stale comments (commit-record.mjs, reconcile.mjs) |

## Real bugs found and fixed along the way (not just spec compliance)

1. **`lib/session-start.mjs` dangling import** — imported `resetLive` from the deleted
   `progress-live.mjs`; would have thrown at runtime on every cold restart with an active effort.
   No test caught it (no `test/session-start.test.mjs` exists). Found and fixed by Task 5.
2. **Missing replay test case** — an `action-started`/`finished` item event with NO section ever
   opened (not just one that later closed) was silently handled correctly by `replayActions` but
   had no test proving it. Found and closed by Task 4c, verified via reverse-discriminator (removed
   the guard, confirmed the new test fails, restored it).

## Infrastructure gotcha discovered this run

The Agent tool's `isolation: "worktree"` option was observed branching from a stale ref (in one
case `master`, in another an old point on `fix/scribe-sha-custody` from before this session's
work landed) rather than the current branch tip at dispatch time. Workaround used for the rest of
the run: manually `git worktree add .worktrees/<name> -b <name> fix/scribe-sha-custody` from the
verified current tip, then dispatch the Agent WITHOUT the `isolation` parameter, giving it the
absolute worktree path and instructing it to work only there. This was reliable for the remainder
of the plan. Promoted to `docs/superpowers/plans/knowledge/`.

## Knowledge promoted

- `docs/superpowers/plans/knowledge/manual-worktree-dispatch.md` (new)
- `docs/superpowers/plans/knowledge/git-commit-stderr-noise.md` (new)
