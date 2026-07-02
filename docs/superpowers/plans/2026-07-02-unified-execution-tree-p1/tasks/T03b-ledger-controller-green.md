# Task T03b: ledger controller implementation (GREEN)

**role: green** — implement against locked tests. You write NO tests.

## References
- Read: `../shared/architecture.md`, `../shared/interfaces.md` §2 + §4, `../shared/conventions.md`
- Read: `test/ledger.test.mjs` (locked — READ-ONLY)
- Read: `lib/effort.mjs` (`appendJsonl`, `readJson`, `rootFromArgv`, `argvWithoutRoot`,
  `findEffortRoot`, `join`, `basename`, `existsSync`)
- Read: `lib/action-report.mjs` + `lib/action-events.mjs` — the predecessors whose posture
  (fail loud, script-authoritative stamps) this module inherits; do NOT copy their level/label
  vocabulary

## Dependencies
- Depends on: T03a, T02b. Depended on by: T05–T13, T03c.

## Scope
**Files:**
- Create: `lib/ledger.mjs`

**BOUNDARY — you MUST NOT modify any other file. `test/ledger.test.mjs` is READ-ONLY — escalate
a wrong test, never edit it.**

## Positive Constraints (DO)
- Exports and behavior exactly per interfaces §4: `KINDS`, `EVENT_SCHEMAS`, `validateEvent`,
  `append(root, event, opts)`, plus the CLI (`append` subcommand, flag form + `--json` form,
  `--root` convention).
- Stamping order inside `append`: validate → resolve/stamp (`ts` overwrite; `attempt` and
  absolute `node` via `buildTree(root)` + `findById` per the §4 arithmetic) → `appendJsonl`
  (existing lock provides `seq`) → `writeMirror(root)` unless `opts.regen === false`.
- Imports allowed: `./effort.mjs`, `./progress-map.mjs`, `./progress-tree.mjs` (findById),
  node builtins. Import direction holds: map never imports this module back.
- Schema registry as DATA (`EVENT_SCHEMAS`), one generic validator walking it — not a per-type
  if-forest. Family-3 loose entries share one `{ required: [] }`-style shape.
- Fail-loud CLI per conventions (`ledger: <error>` on stderr, exit 1).
- Top-of-file comment: the sole sanctioned write path, capability-beats-discipline applied to
  the ledger, cite spec + D3a unchanged.

## Negative Constraints (DO NOT)
- Do NOT modify `test/ledger.test.mjs`, `lib/effort.mjs`, or `lib/progress-map.mjs`.
- Do NOT accept agent-supplied `seq`/`ts`/`attempt`/`dispatch` — strip/overwrite.
- Do NOT implement any fold/render logic here.

## Implementation Steps

### Step 1: Read the locked tests end to end.
### Step 2: Implement `lib/ledger.mjs` per interfaces §4.
### Step 3: `node test/ledger.test.mjs` → all green.
### Step 4: Full suite: `for t in test/*.test.mjs; do node "$t" || echo "FAILED: $t"; done` — no NEW failures.
### Step 5: Commit
```bash
git add lib/ledger.mjs
git commit -m "feat(ledger): controller — sole validated write path with script-authoritative stamping

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

## Acceptance Criteria
- [ ] Locked tests green, unmodified
- [ ] `EVENT_SCHEMAS` is data + one validator (no per-type if-cascade)
- [ ] No file outside Scope touched
