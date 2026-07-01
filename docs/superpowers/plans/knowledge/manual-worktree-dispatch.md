# Manual worktree dispatch (when Agent's isolation:"worktree" is unreliable)

The Agent tool's `isolation: "worktree"` option was observed, more than once in one execution
run, branching its worktree from a stale ref (once from `master`, once from an old point on the
working branch predating that session's own commits) instead of the current branch tip at
dispatch time. Symptom: the dispatched agent reports files/exports missing that should already
exist from earlier, already-merged tasks.

**Workaround:** don't rely on `isolation: "worktree"` for a multi-wave plan. Instead:

```bash
git worktree add .worktrees/<task-name> -b <task-name> <current-branch> 
```

— run this yourself, right before dispatching, from the verified current tip (`git rev-parse
HEAD`). Then dispatch the Agent call **without** the `isolation` parameter, and tell it explicitly
in the prompt: work ONLY inside `<absolute-path-to-worktree>`, using absolute paths for every
Read/Edit/Write call and `cd`-ing there for Bash. After it reports done, verify its commit's base
(`git merge-base HEAD <task-branch>` should equal your pre-dispatch `HEAD`) before merging.

Clean up after merging:
```bash
git worktree remove .worktrees/<task-name> --force   # may fail with "Permission denied" on
                                                       # Windows if a handle is still open —
                                                       # harmless, `git worktree prune` clears
                                                       # the stale reference on its own
git branch -d <task-name>
```
