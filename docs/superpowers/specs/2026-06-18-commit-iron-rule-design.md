# Design: The Commit Iron Rule

**Date:** 2026-06-18
**Status:** approved (autonomous finalization authorized by the user)
**Motivating failure:** a real effort (`configurable-hot-zones`, Fireside) reported "done" with
all work product sitting uncommitted in the working tree. A local decision **D11** had suspended
the per-work-order atomic commit (D3a) and deferred to the Claude Code harness default,
*"commit only when the user asks."* The user had to ask, by hand, to make any commit — and an
effort that reports done over an uncommitted tree is one stray `git checkout` from losing the work.

## The principle

Add a corollary to **Law 1 — Parity** (*claims match reality exactly*):

> **"Done" entails committed.** A gate that passes, a vertical slice that closes, or an effort that
> concludes while its own work product is uncommitted is a parity violation: the claim ("done")
> contradicts reality (an ephemeral working tree). Uncommitted == not done.

And the principle that makes "always commit, both modes" coherent:

> **Commit is durability, not ratification.** Saving work to git is not a decision that needs human
> sign-off — it is the act that makes work survivable. So committing is *orthogonal* to the
> gated/autonomous split: reasonable commits its own work product in **both** modes, always. The
> gated control plane still owns the things that *are* decisions — ratifying a gate, **merging to the
> human's main branch, and pushing**. Committing to a lane/effort branch is never one of those.

This retires D11's stance (*defer to the harness commit-only-when-asked*) **for an effort's own work
product**: invoking a reasonable effort *is* the standing ask.

## What gets committed — and the hard boundaries (scope = safety)

- **Commits:** the effort's own work product — source, tests, docs — within its declared loci
  (a lane's `locus`, or the union of the work-orders' loci), plus the tracked `.reasonable/`
  artifacts (see ledger durability below).
- **Never auto-push.** Push stays human-only (harness rule + gated philosophy). The iron rule is
  *local* durability.
- **Never auto-merge to the human's main branch.** Integration stays at finishing / human control.
  Agent commits live on lane/effort branches and reach shared branches only through orchestrator
  merges — unchanged from the existing model (DESIGN §5.14B).
- **Never sweep unrelated changes.** commit-gate stages only files inside the effort's loci (and the
  tracked `.reasonable/` artifacts). It never runs `git add -A` over the human's unrelated WIP. When
  loci cannot be determined (a degenerate/legacy effort), it stages only **already-tracked modified
  files** and **loudly warns** about untracked files it left alone, rather than guessing. The human
  checkout stays sacrosanct.
- **Walls are not "done".** A `checkpoint` / `infeasible` / `dead-end` retreat is explicitly not a
  completion claim, so the iron rule does not force a done-commit there. Partial work is preserved by
  the existing lane-worktree + progress-verdict path (reconcile harvests or sweeps it; re-entry is
  rewrite-from-knowledge). Nothing is lost, and "done == committed" stays exact.

## Ledger durability (load-bearing, not optional)

D3a binds the work product **and the ledger line** into one atomic commit ("git and the ledger are
one truth"). A fully-gitignored `.reasonable/` — as the Fireside effort used — breaks that: the
authoritative log is then as losable as the code was. So the default flips:

- **Track** `.reasonable/` (ledger, journal, contracts, vision, intention, decisions, route, config,
  supervision, sanity-invariants, resource-lexicon, baseline). These are committed *with* the work.
- **Gitignore only ephemera:** the lane worktrees (`.worktrees/`) and concluded archives
  (`.reasonable.done-*/`). conclude.mjs's existing gitignore tip is narrowed to those.

## The mechanism (capability, not a prompt)

### 1. `lib/commit-gate.mjs` (new — the single source of truth)
Builds on `effort.mjs` git helpers; fails OPEN when no effort is active (like every lib hook).

- `--check` → exit 0 if the effort's tree carries no uncommitted in-scope work product; non-zero +
  a report otherwise.
- `--commit "<message>"` → append a `commit` provenance line to the ledger, stage the in-scope work
  product (incl. the ledger), commit, print the SHA. One atomic commit that carries its own ledger
  line — the same shape as D3a.
- Exposes `commitGate(effortRoot, opts)` for the hook and conclude to import.

Scope determination, in order: a lane descriptor's `locus` (in a lane) → union of
`.reasonable/work-orders/*.json` loci + tracked `.reasonable/` → fallback (tracked-modified only,
with a loud warning listing untracked files left for the human).

### 2. D3a made mandatory (no D11 suspension)
The implementer's and scaffolder's atomic commit is no longer suspendable. A `green` outcome (or a
ratified skeleton) with **no landed commit** is invalid — the runner/scaffolding rejects it. This is
the mirror of reconcile's existing AMBIGUOUS rule "*a ledger line naming a commit that does not
exist*": forward enforcement of the same git+ledger parity.

### 3. conclude.mjs — the keystone fix
Before archiving `.reasonable/` and releasing the blast-radius fence, conclude runs the commit-gate.
A dirty in-scope tree is auto-committed (per the chosen zero-friction policy). If it cannot reach a
clean tree (e.g. an interrupted merge / conflict state), it **HALTS instead of archiving** — an
effort is never declared done over uncommitted work, and the fence is never released over it.

### 4. Stop / SubagentStop backstop (new hook)
`lib/stop-commit.mjs`, wired on `Stop` and `SubagentStop`. When an effort is active and the current
tree has uncommitted in-scope work product, it auto-commits (the "capability beats discipline" net,
so no skill path can forget). Normal flow commits per work order, so the tree is already clean and
the hook no-ops. Fails open with no effort; never blocks the session.

## Files

- **New:** `lib/commit-gate.mjs`, `lib/stop-commit.mjs`, `hooks/stop-commit` (shim),
  `test/commit-gate.test.mjs` (standalone node, temp git repo).
- **Edited:** `lib/conclude.mjs`, `hooks/hooks.json`, `skills/run/SKILL.md`,
  `skills/run-autonomously/SKILL.md`, `skills/using-reasonable/SKILL.md`, `skills/retro/SKILL.md`,
  `skills/scaffolding/SKILL.md`, `skills/vertical-slice-execution/SKILL.md`,
  `agents/implementer.md`, `agents/scaffolder.md`, `DESIGN.md` (decision record retiring D11),
  `docs/artifacts.md` (gitignore/ledger-durability note).

## Testing

- `commit-gate.mjs`: temp git repo — clean tree → `--check` passes; dirty in-scope → `--check`
  reports + `--commit` lands a SHA and leaves the tree clean; out-of-scope/untracked files are left
  untouched.
- `conclude.mjs`: a dirty in-scope tree → refuses to archive (HALT) when it cannot reach clean;
  a clean tree → archives as before.
- Both fail open in a non-effort repo.
