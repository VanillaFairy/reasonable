# Task T03a: ledger controller tests (RED)

**role: red** — you author the tests. You do NOT implement anything.

## References
- Read: `../shared/architecture.md`, `../shared/interfaces.md` §2 + §4, `../shared/conventions.md`
- Read: `docs/superpowers/plans/knowledge/running-tests.md`,
  `docs/superpowers/plans/knowledge/cli-root-convention.md`
- Read: `lib/effort.mjs` `appendJsonl` (the lock + seq assignment you build fixtures around)
- Read: `test/action-report.test.mjs` for fixture style (temp effort dirs) — it is the retiring
  predecessor of this suite

## Dependencies
- Depends on: — . Depended on by: T03b, T03c.

## Scope
**Files:**
- Create: `test/ledger.test.mjs`

**BOUNDARY — you MUST NOT create or modify any other file. NOT `lib/ledger.mjs`.**

## Positive Constraints (DO)
- Fixtures: temp effort dirs (`mkdtempSync`) with `.reasonable/` containing a seeded
  `ledger.jsonl` (hand-written stamped events) and optionally `journal.json`. Track in `tmps`.
- Case matrix (one `check` each, at minimum):
  **validateEvent (pure):**
  1. Unknown type → `{ ok:false }` (including `action-started` — legacy types are rejected at
     the WRITE side).
  2. `node-planned` without `title` → false; with `node`+`kind`+`title` → true; bad `kind` →
     false.
  3. `node-canceled` without `reason` → false. `report-canceled` without `reason` → false.
  4. `report-started` without `under` → false; with absolute-looking `node` (leading `/`) →
     false (workers supply RELATIVE paths).
  5. Family-3 loose: bare `{type:'verdict', kind:'green'}` → true; `{type:'enrichment'}`
     without `component` → false.
  6. Family-1 with `workOrder` instead of `node` → true (resolution is append's job).
  **append (I/O):**
  7. Stamps: append `report-started` → stored line has `seq` (last+1), controller `ts`
     (agent-supplied `ts:'1999-…'` is OVERWRITTEN), absolute `node` =
     `<path(under)>/attempt-1/<relative>` when the WO node has no attempts yet.
  8. Attempt arithmetic — fresh: seeded `node-planned` only; append `node-dispatched
     {workOrder:'WO-1', kind:'work-order'}` → stamped `attempt: 1` and resolved `node`.
  9. Attempt arithmetic — reopen: seed planned + dispatched(attempt:1) + downgraded(attempt:1);
     append `node-dispatched` → stamped `attempt: 2`.
  10. Attempt arithmetic — continuation: seed planned + dispatched(attempt:1) + checkpointed;
      append `node-dispatched` → stamped `attempt: 1` (same attempt, reclaim).
  11. `under` unresolvable → `{ ok:false }`, NOTHING appended (ledger line count unchanged).
  12. Regen: after a successful append, `.reasonable/progress.json` exists and reflects the
      event; with `opts.regen === false` it is NOT written.
  **CLI (spawn `node lib/ledger.mjs …` via child_process):**
  13. Flag form appends and exits 0; stored event has the flag fields.
  14. `--json` form with an `enrichment` payload (array `clauses`) appends verbatim + stamps.
  15. Malformed call (unknown type) → exit 1, stderr contains `ledger:`; nothing appended.
  16. No `.reasonable/` at `--root` → exit 1.
  **Concurrency:**
  17. Spawn 12 parallel CLI appends (report-started with distinct refs) → afterwards the ledger
      has 12 new lines, `seq` values unique and gapless, every line parseable JSON.
- Assert `EVENT_SCHEMAS` and `KINDS` are exported; `KINDS` exactly per interfaces §2.

## Negative Constraints (DO NOT)
- Do NOT test fold/render behavior (T02a owns that). You may READ progress.json existence for
  the regen check only.
- Do NOT implement. Do NOT modify effort.mjs.

## Implementation Steps

### Step 1: Write `test/ledger.test.mjs`
Repo test shape. For CLI checks use `spawnSync(process.execPath, ['lib/ledger.mjs', 'append', '--root', root, …])`;
for the concurrency check use `spawn` and await all exits.

### Step 2: Verify RED for the right reason
`node --check test/ledger.test.mjs` passes; `node test/ledger.test.mjs` fails with
`Cannot find module '.../lib/ledger.mjs'`.

### Step 3: Commit
```bash
git add test/ledger.test.mjs
git commit -m "test(ledger): lock controller contract — validation, stamping, attempt arithmetic, CLI, concurrency (RED)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

## Acceptance Criteria
- [ ] All 17+ matrix cases distinct checks; fails only on missing module
- [ ] No file outside Scope touched
