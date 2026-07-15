# Agent tool `isolation: 'worktree'` vs. a supervisor-created worktree

**Discovered during:** A3a plan execution (subagent-driven-development), recurring across most
dispatched tasks (T1a, T2, T1c, T4, T5).

**The gotcha:** When the supervisor manually creates a task worktree (`git worktree add
.worktrees/<task> -b <branch> <base>`) and tells a dispatched agent to work there, passing
`isolation: 'worktree'` on the `Agent` tool call does **not** point that agent's Read/Write/Edit
tools at the supervisor's worktree. Instead the harness auto-provisions its **own** separate worktree
under `.claude/worktrees/agent-<id>` on an unrelated, often-stale branch, and confines Read/Write/Edit
to that path. `EnterWorktree` also refuses to switch to the supervisor's path (it only navigates
within `.claude/worktrees/`).

**The reliable workaround:** the agent's `Bash` tool has unrestricted filesystem access and can reach
the supervisor's worktree path directly (`cd`, `git -C <path>`, or absolute-path file operations via
`node -e` / shell redirection). Every agent in this run that hit this successfully completed its task
by routing file reads/edits/commits through Bash instead of Write/Edit, once it noticed the mismatch.

**Two ways to avoid the mismatch entirely next time:**
1. **Don't pass `isolation: 'worktree'`** when the task prompt already names an explicit,
   supervisor-created worktree path — let the agent operate directly via Read/Write/Edit against that
   path (no auto-provisioning conflict). This is simpler and was NOT tried in this run — worth trying
   first for A3b.
2. **If `isolation: 'worktree'` is used anyway**, tell the agent up front (in the prompt) that its
   sandbox may be a different, auto-provisioned worktree than the one named, and that Bash is the
   reliable fallback for reaching the real target path — this run's prompts added this note reactively
   after the first agent (T1a) reported it, and every later agent handled it smoothly once warned.

**Verification note:** in every case this run, the supervisor independently re-verified the commit
landed in the *correct* worktree/branch (`git log`, `git show --stat`) before merging — this is good
practice regardless of which fix is applied, since a misrouted commit is silent otherwise.
