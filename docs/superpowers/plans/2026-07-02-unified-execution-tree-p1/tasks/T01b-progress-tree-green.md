# Task T01b: progress-tree implementation (GREEN)

**role: green** — you implement against locked tests. You write NO tests.

## References
- Read: `../shared/architecture.md`, `../shared/interfaces.md` §1, `../shared/conventions.md`
- Read: `test/progress-tree.test.mjs` (the locked contract — READ-ONLY)

## Dependencies
- Depends on: T01a. Depended on by: T02b, T03b, T04, T01c.

## Scope
**Files:**
- Create: `lib/progress-tree.mjs`

**BOUNDARY — you MUST NOT modify any other file.**

## Positive Constraints (DO)
- Implement EXACTLY the exports and semantics of `shared/interfaces.md` §1 — node shape, op
  semantics (idempotent inject, auto-create everywhere, recursive-status terminal skip,
  target-always-set), path/segment grammar, render rules.
- Node builtins only; this module imports NOTHING (not even `effort.mjs`) — it is the one file
  someone could copy into another project. Zero I/O, zero `Date`.
- Top-of-file comment block in the repo's voice: what this is (the generic progress component,
  reasonable-agnostic), the never-remove property, cite the spec path.
- `apply` dispatches through one op table; segment validation in one place; keep the file small
  and boring.

## Negative Constraints (DO NOT)
- Do NOT modify `test/progress-tree.test.mjs`. If a test contradicts `shared/interfaces.md` §1,
  STOP and escalate to the supervisor with the exact discrepancy — never edit the test.
- Do NOT add exports beyond the interface (no remove/delete op, no extra helpers).
- Do NOT read/write files or import anything.

## Implementation Steps

### Step 1: Read the locked tests
`test/progress-tree.test.mjs` end to end. List (for yourself) every asserted behavior.

### Step 2: Implement `lib/progress-tree.mjs`
Per `shared/interfaces.md` §1. Suggested internal structure (not exported): `splitPath(path)`
(validates each segment), `ensure(tree, segments)` (walk + auto-create pending stubs, return
node), then the four op handlers over `ensure`.

### Step 3: Run the locked tests
Run: `node test/progress-tree.test.mjs`
Expected: `progress-tree: all N checks passed. ✓` (exit 0). Iterate until green.

### Step 4: Sanity — full suite untouched
Run: `for t in test/*.test.mjs; do node "$t" || echo "FAILED: $t"; done`
Expected: no NEW failures vs. the pre-existing baseline (this module is additive; nothing else
imports it yet).

### Step 5: Commit
```bash
git add lib/progress-tree.mjs
git commit -m "feat(progress-tree): generic five-status progress tree — inject/update/status/note, never remove

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

## Acceptance Criteria
- [ ] Locked test file green, unmodified (verify: `git diff --stat test/progress-tree.test.mjs` is empty)
- [ ] Module imports nothing; `grep -n "^import" lib/progress-tree.mjs` → no output
- [ ] No file outside Scope touched
