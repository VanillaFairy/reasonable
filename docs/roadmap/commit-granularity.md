# Problem: commit granularity — a whole bit's worth of work lands as one commit

**Status:** TODO — design direction worked out below (this file), implementation deferred to a
dedicated session.
**Origin:** surfaced auditing real `reasonable` runs on the Fireside repo (the "why so few, so
large commits?" probe). The methodology *produces* per-slice/per-bit history on the lane, then
**flattens it at the commit boundary** — so the reviewer never sees it.

## What is broken

The commit iron rule (§5.1) is satisfied — work product *is* committed — but at the wrong
**granularity**. Two concrete gaps, both in `lib/commit-gate.mjs` and the roles that lean on it:

1. **Whole-locus, single-message commits.** `commitGate()` stages *every* in-locus dirty path and
   commits it as **one** commit with **one** message. A vertical slice that touches several
   components, or an implementer step that produces several independent bits, collapses into a single
   commit. Observed on Fireside: `28931e8` lands six contract clauses (`FN-STRICT-1/2`,
   `FNW-STRICT-1..4`) at once; a single backstop commit `5b5cc3d` bundles four *different* component
   test suites (`strict_line_breaks_test.rs` + three `strictLineBreaks.*.test.ts`). If a commit
   message needs an **"AND"**, it is really two-or-more commits wearing one hat — the same defect as
   squashing, applied per-commit instead of per-effort.

2. **File-granular, not region-granular.** Staging is an explicit pathspec (good — never `git add
   -A`) but **whole-file**. Two committable bits that coexist in the *same* file cannot be separated,
   and a leftover edit, a manual change, or a parallel touch sitting in a file the bit also modified
   gets swept in with it. There is no way to say "commit *these hunks* of this file, leave the rest."

A third, related deviation showed up in the same audit and is **conformance, not new design**:

3. **Non-implementer roles have no commit step.** Only the implementer carries the D3a atomic-commit
   duty. The `blind-test-writer` (no Bash, by membrane design) and `characterizer` produce work
   product that nothing commits — so the `Stop`/`SubagentStop` backstop sweeps it under a generic
   `chore(reasonable): auto-commit work product …` message with **no `Work-Order:` trailer**. Across
   the entire reasonable era on Fireside's `master`, only **4** commits carry a trailer at all. And at
   least one effort was **squash-merged** to `master` (`85aeca3`: a whole three-slice effort, 30
   files, as one commit; granular history demoted to an `effort-history/*` tag) — directly against
   merge-by-topology (§5.14B, §5.10 Ruling 2) — while a sibling effort stayed granular. The design
   already says the right thing here; the runs drifted from it.

## Why it matters

A reviewer reading the canonical history sees one opaque blob per slice (or per role), not the
sequence of small, individually-defensible changes the lane actually contains. The per-bit history
the methodology works to produce — the thing that makes an LLM-authored change *auditable* — is
destroyed exactly at the boundary where a human would consume it. Work-Order accounting (§5.14),
which the backward paths depend on, is effectively absent from mainline. And "no AND in a commit
message," a cheap and strong reviewability rule, is silently violated on most commits.

## Failure modes a solution must prevent

1. **AND-commits.** A single commit carrying two or more independent concerns (≥2 components, ≥2
   unrelated clauses). The message test is the tell.
2. **Whole-file over-capture.** Committing a file's *entire* working-tree change when only some hunks
   belong to the current bit — sweeping in leftovers, manual edits, or a parallel lane's touch.
3. **Anonymous catch-all commits.** A role's output landing under a generic, untrailered message
   because that role had no commit step of its own. A backstop commit appearing in a *normal*
   (non-crash) run is itself the smell.
4. **Squash-at-conclude.** Flattening a lane's per-bit commits into one on the shared branch — it
   un-does the entire point of this change.
5. **Membrane regression.** Any solution that gives commit capability to a no-Bash role by *granting
   it Bash* (or a fenced-Bash shim it could be argued around). The `blind-test-writer` must stay
   Bash-free; the law commits *for* it.
6. **First-parent red.** The shared branch's first-parent line must stay all-green (§5.3's reason:
   never train agents to explain away red). Red is allowed only on the agent-private lane.

## Candidate resolution (the design direction, not yet committed)

**One engine, region-scoped, one commit per bit; two capability-appropriate triggers.**

- **`lib/atomic-commit.mjs`** — the engine, dependency-free node + git like its neighbour
  `commit-gate.mjs`. Input is a **list of bits**, each `{ paths, regions, message }`. It stages
  **only the declared hunks** (region-scoped: reconstruct a patch of just those hunks from the
  working-tree diff and `git apply --cached` it, leaving the rest of each file unstaged), commits one
  bit per commit, and stamps the `Work-Order:` trailer from `journal.json`. It **refuses** any
  path/region outside the work order's declared locus — this is what kills the leftover/parallel-edit
  over-capture, mechanically rather than by trust.

- **Two triggers, one engine:**
  - **Implementer** (has Bash, is *allowed* to see/run everything) calls the engine **inline, once
    per bit, as it works** — commit-as-you-go. Its bits often evolve in the *same* file and can't be
    cleanly separated after the fact, so it must snapshot each one live.
  - **No-Bash roles** (`blind-test-writer`, `characterizer`) **declare a manifest** — a list of bits
    they wrote (they have `Write`) — and the `SubagentStop` hook replays each entry through the same
    engine. Their suites land in distinct files/regions, so "separate at replay" is safe. This is
    several commits, one per component suite — never one bundled commit.

- **The old whole-locus backstop demotes to a loud last-resort.** With every role committing its own
  bits, the `Stop`/`SubagentStop` sweep should fire only when a code path genuinely forgot — so when
  it *does* fire it is an anomaly worth a warning, not the everyday committer it became.

- **"No AND" becomes the operational definition of a bit** in the worker constitutions (and, if cheap
  and low-false-positive, a soft lint in the engine).

- **Ledger and merge are unchanged in shape — this is conformance.** Per §5.1 the on-disk
  append-only ledger *content-references* commit SHAs and is not in the git tree, so splitting
  codebase work across N commits simply accrues N SHA-pinning lines; the work-order verdict pins the
  closing commit's SHA. There is no torn-tree window to reopen. Reaching the shared branch stays
  **merge-by-topology** (§5.14B, §5.10 Ruling 2) — **squash is prohibited** (it destroys exactly the
  granularity this change creates). The invariant restates from *green at every commit* to **green at
  every first-parent commit**: the lane may carry red checkpoints; the canonical first-parent history
  stays all-green, so §5.3's anti-rationalization rationale is preserved intact.

## How we'll know it's fixed

- A slice's lane shows **N small commits** — one per component / committable bit — each with an
  **AND-free** message and a **region-scoped** diff, rather than one whole-locus commit.
- **Every** codebase commit on a lane carries a `Work-Order:` trailer, checked against the journal
  (§5.14).
- **No** `auto-commit work product` backstop commit appears in a normal (non-crash) run.
- Efforts reach `master` by **merge**; the per-bit lane commits are visible as a merge's second-parent
  history, and `master --first-parent` is all-green.
- The `blind-test-writer` still has **no Bash** — the law commits its declared manifest for it.
