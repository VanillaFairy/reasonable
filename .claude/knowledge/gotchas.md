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
