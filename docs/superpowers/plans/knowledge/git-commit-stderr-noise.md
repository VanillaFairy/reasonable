# "ERROR: Failed to parse repository information" on git commit — harmless

In this environment, `git commit` (and sometimes `git merge`) prints:

```
ERROR: Failed to parse repository information
```

to stderr, once or twice, before completing successfully. Every subagent that hit this in the
progress-action-events plan run confirmed via `git log`/`git status` afterward that the commit
landed correctly with the right diff. Looks like a benign warning from some local hook/tool probing
repo metadata — not a git failure. Don't treat this line as a blocking error; check the actual
exit code / `git log` instead.
