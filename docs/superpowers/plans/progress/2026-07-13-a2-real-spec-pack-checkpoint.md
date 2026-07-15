# A2 Real Spec + Pack — execution checkpoint (COMPLETE)

Branch: `a2-real-spec-pack` (off `master` @ `0091571`, v3.3.0 → **v3.4.0**). Execution:
subagent-driven-development, 4 waves. **All 9 tasks landed; final adversarial review = SHIP.**

## Status — all complete

| Task | Commit(s) |
|---|---|
| T1 lib/spec.mjs (fences + CLI) | `cc6a5b0` |
| T2 footprint `--atoms` + export atomFootprint | `1d4efd1`, `febf489` |
| T5 reconciler `frontier` briefing | `b32b6fa` (+ `2409eb0` framing fix) |
| T4 footprinter runs spec fences | `c65a618` (+ `2409eb0` wrapper-key pin) |
| T7 acceptance test | `bc2acd4` |
| T3 spec-author agent | `b7f01d3` |
| **fence grant** (supervisor add — spec-author canonical contract-write) | `d9ef706` |
| T6 workflow Spec+Pack de-schematized | `fc40b0e` |
| T8 docs (artifacts + roadmap A2 LANDED) | `cfc399d` |
| T9 version bump v3.4.0 | `d57d55f` |
| final-review follow-up fixes | `2409eb0` |

Full suite: **88/88 green** throughout. Every task got a two-stage review (code tasks via subagent;
prose/doc tasks direct). Final whole-branch adversarial review: SHIP.

## Scope extensions beyond the written plan (deliberate, for A2 to actually function)

- **Fence grant (`d9ef706`)** — the plan flagged the spec-author's contract-write fence gap as a
  follow-up; it is load-bearing (the role can't run without it), so it was closed within A2 as the
  minimal correct grant (`spec-author` → `REASONABLE_WRITE_PERMS.CONTRACT` only; never the lane-scoped
  `CONTRACT_WRITERS`, since it writes pre-lane). Mirrors A1's genesis-writer grant. + a fence test.

## Gotchas (for future waves / project KB)

- **Harness `isolation: worktree` branches from a STALE base** (`7ebcd6c`, pre-A1), NOT current HEAD.
  Integrate such worktree commits with `git cherry-pick <sha>` (3-way merges the commit's own patch
  cleanly), NOT `git merge` (which reverts intervening work). Dependency-bearing waves ran without
  isolation in the integrated checkout (disjoint files, supervisor commits).
- **Direct-write ledger fixtures:** `lib/ledger.mjs` `append()` recomputes `effects` for `atom-verdict`
  events, discarding a hand-supplied `effects`. Seed synthetic radii with
  `appendFileSync(join(root,'.reasonable','ledger.jsonl'), JSON.stringify(obj)+'\n')`
  (see `test/floor-verdict.test.mjs`).

## Follow-ups for A3 (named, not lost)

From the A2/A3 boundary (roadmap + artifacts.md) and the reviews:
1. **Verdict→state fold** — persist the effects A2 only computes+routes: an R4 split (charter the
   sub-atoms) and a checkpoint-2 halt (`atom-flag-set: guard-halted`) via `lib/rewrite.mjs` → ledger.
2. **Blast-radius archival lifecycle** (§7.2) — `liveBlastRadii` reads the full ever-growing set; A3
   must retire a radius when its remediation amendment batch lands.
3. **`checkpoint2` lineage-exemption matching** — `lineageExempt` keys on `atom.lineage.startsWith('R2')`,
   but `lib/rewrite.mjs` stamps `'R2-gate'` on the *retired* atom and the *parent id* on the
   *remediation* atom (the node the exemption is for). Revisit the match convention when A3 folds
   `lineage` onto a live atom record. Inert today (no atom carries `lineage`).
4. **`frontier` mechanical producer** — the reconciler derives the ready SET from `ready()` over its
   folded graph; a dedicated CLI producer + the calibrated policy ORDERING (§16/A4) are follow-ups.
5. **Minor** — a `spec-author` `ok:false` is silently excluded from `specdIds` with no `log()` (unlike
   an R4/checkpoint-2 drop, which logs). Add an observability line.
6. **Minor** — add a fence test proving `spec-author` is *denied* an in-lane contract write (positively
   confirms the lane-scoped `CONTRACT_WRITERS` exclusion is load-bearing).
