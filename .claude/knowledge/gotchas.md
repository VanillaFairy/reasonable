# Gotchas

## Agent tool `isolation: 'worktree'` vs. a supervisor-created worktree

When the supervisor manually creates a task worktree (`git worktree add .worktrees/<task> -b <branch>
<base>`) and tells a dispatched agent to work there, passing `isolation: 'worktree'` on the `Agent` tool
call does **not** point that agent's Read/Write/Edit tools at the supervisor's worktree. The harness
instead auto-provisions its own separate worktree under `.claude/worktrees/agent-<id>` on an unrelated,
often-stale branch, and confines Read/Write/Edit to that path. `EnterWorktree` also refuses to switch to
the supervisor's path (it only navigates within `.claude/worktrees/`).

**Workaround:** the agent's `Bash` tool has unrestricted filesystem access and can reach the
supervisor's worktree path directly (`cd`, `git -C <path>`, or absolute-path file operations). Warn the
agent up front in its dispatch prompt that its sandbox may differ from the path named, and that Bash is
the reliable fallback.

**Better fix to try first:** don't pass `isolation: 'worktree'` at all when the task prompt already
names an explicit, supervisor-created worktree path — let the agent operate directly via Read/Write/Edit
against that path, avoiding the auto-provisioning conflict entirely.

**Always verify:** after any dispatch that might have hit this, the supervisor should independently
confirm the commit landed in the *intended* worktree/branch (`git log`, `git show --stat`) before
merging — a misrouted commit is otherwise silent.

(Discovered during: A3a plan execution, `reasonable` plugin, 2026-07-15 — recurring across most
dispatched tasks in that run.)

## `git worktree remove` can transiently fail with "Permission denied" right after a subagent exits

Immediately after a dispatched subagent's process ends, `git worktree remove .worktrees/<task>` (even
with `--force`) can fail with `error: failed to delete '...': Permission denied` — a leftover file
handle in the worktree directory hasn't released yet on Windows.

**Workaround:** retry after a short pause (`sleep 1` then re-run `git worktree remove --force
<path>`). By the retry, git has usually already deregistered the worktree from `git worktree list`
even though the physical directory deletion failed — so the retry command reports "not a working
tree" (harmless; it's already gone) and only an **empty** leftover directory remains, safe to remove
with a plain `rmdir`. Always `ls` the directory first to confirm it's empty (not orphaned work)
before removing.

(Discovered during: A3b-i plan execution, `reasonable` plugin, 2026-07-15.)

## Every `git commit`/`git merge` in this repo prints `ERROR: Failed to parse repository information`

This stderr line appears on essentially every `git commit`, `git merge`, and similar write operation
in this repo's local environment, immediately before the operation's own normal output (e.g. "Merge
made by the 'ort' strategy."). The operation still succeeds (exit 0, working tree clean, commit/merge
lands correctly) — this is local tooling/hook chatter unrelated to the actual git action, not a sign
of failure. Multiple independent agents hit this across many separate commits in the same session and
each independently confirmed it's cosmetic noise (via `git log`/`git show --stat` after the fact).

**Don't** treat this line as a failure signal or spend time investigating it per-commit — just check
the actual exit status / resulting repo state, as you would anyway.

**Update:** traced further at end-of-session. `.git/hooks/` has no active (non-`.sample`) hooks, so
this isn't a git hook — some other local tool (outside git itself) is watching the repo. Its effect is
more than cosmetic: `git reflog` showed a `fast-import` entry immediately after at least one merge
commit, silently re-writing that commit with a **new SHA and a different author identity** (content
and message byte-identical, hash different) before HEAD settled. Confirmed harmless for content (diff
and full test suite matched before/after), but **do not capture a commit SHA from a `git merge`/`git
commit` command's own stdout and assume it's final** — re-read the SHA with `git log -1`/`git
rev-parse HEAD` *after* the operation, especially before recording a SHA anywhere that matters (a
separation-gate check, a ledger event, a report to the user).

(Discovered during: A3b-i plan execution, `reasonable` plugin, 2026-07-15 — recurring across nearly
every git write operation in the session.)
