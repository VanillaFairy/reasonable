# A2 Real Spec + Pack — execution checkpoint

Branch: `a2-real-spec-pack` (off `master` @ `0091571`, v3.3.0). Execution: subagent-driven-development.

## Status

| Task | State | Commit(s) |
|---|---|---|
| T1 lib/spec.mjs (fences + CLI) | ✅ done, reviewed (APPROVE) | `cc6a5b0` |
| T2 footprint `--atoms` + export atomFootprint | ✅ done, reviewed (APPROVE) + hardened | `1d4efd1`, `febf489` |
| T5 reconciler `frontier` briefing | ✅ done, reviewed (APPROVE) | `b32b6fa` |
| T3 spec-author agent | ⏳ Wave 2 | — |
| T4 footprinter runs spec fences | ⏳ Wave 2 | — |
| T7 acceptance test | ⏳ Wave 2 | — |
| T6 workflow Spec+Pack | ⏳ Wave 3 | — |
| T8 docs (artifacts + roadmap) | ⏳ Wave 3 | — |
| T9 bump v3.4.0 + finish | ⏳ Wave 4 | — |

Full suite after Wave 1: **87/87 green**.

## Discovered actions / gotchas (for later waves + project KB)

- **Harness `isolation: worktree` branches from a STALE base** (here `7ebcd6c`, v3.2.2 — pre-A1), NOT
  the current HEAD/dev branch. A naive `git merge` of such a worktree branch reverts intervening work
  (A1 files, plugin.json). **Integrate stale worktree commits with `git cherry-pick <sha>`** (applies
  only the commit's own patch; 3-way merges cleanly onto the dev branch). Verified: T2's `graph.mjs`
  export auto-merged onto A1's `graph.mjs`. → For the remaining (dependency-bearing) waves, run agents
  **without worktree isolation** in the integrated checkout (disjoint files per wave; supervisor commits).
- **Direct-write ledger fixtures in tests:** `lib/ledger.mjs`'s `append()` recomputes `effects` for
  `atom-verdict` events (via `computeVerdictEffects`) and would discard a hand-supplied `effects`
  payload. To seed a synthetic verdict/blastRadius, write the raw line:
  `appendFileSync(join(root,'.reasonable','ledger.jsonl'), JSON.stringify(obj)+'\n')` (see
  `test/floor-verdict.test.mjs`, `test/fireside-incident.test.mjs`). Used by `liveBlastRadii`'s tests.

## Forward-notes carried into A3 (from reviews)

- **checkpoint2 lineage-exemption matching (from T1 review).** `checkpoint2`'s `lineageExempt` keys on
  `atom.lineage.startsWith('R2')`, but `lib/rewrite.mjs` stamps `lineage: 'R2-gate'` on the *retired*
  atom and the *parent id* on the *remediation* atom. The atom fold (`foldAtomFromEvents`) does not
  populate `atom.lineage` today, so the exemption is inert in A2. When A3 wires `lineage` into the fold,
  the matching must be revisited so the remediation atoms (the crater's only exit) actually get the
  proceed-with-injection exemption.
- **`frontier` has no lib producer yet (from T5).** The reconciler *documents* returning `frontier`;
  its runtime computation is the reconciler agent's remit (it already emits `footprints`/`independent()`
  grouping). If a lib helper is wanted, it's a small follow-up. A2's workflow test stubs the briefing.
