// branch.mjs — multi-slice branch hygiene: the dedicated EFFORT / INTEGRATION branch.
//
// THE PROBLEM (graph-editor incident). When a vertical slice depends on earlier slices,
// its lane must be cut from a base that already contains them. Cutting every lane from the
// main checkout's bare HEAD builds slice N+1 on stale code whenever slice N's green lane
// hasn't reached that HEAD — and "how do I integrate this?" then escalates to the human.
//
// THE FIX (deterministic, one default resolution, no escalation). reasonable maintains an
// `effort/<name>` branch off the base ref the effort started from:
//   - lanes are cut from the EFFORT BRANCH (explicit base), never bare HEAD;
//   - a green lane auto-merges INTO the effort branch at the slice gate (--no-ff), so the
//     next slice's lane is cut from a branch that already contains slices 1..N;
//   - the BASE branch (e.g. master) is written exactly once, at effort end (effort->base) —
//     the single human review gate; per-slice hygiene never escalates;
//   - reconcile reads both branches, accounts each lane's commits against the EFFORT branch
//     (not master), and SURFACES any lane cut from the wrong base (a build-on-stale).
//
// This module is the decidable core (naming, ensure/adopt, base resolution, descends-from,
// lane-base validation). The actual merges are git an agent runs (the membrane), recorded
// as merge SHAs in the journal/ledger. node builtins only (Law 1).

import { gitTry } from './effort.mjs';

/** The default base-ref candidates reconcile/laneCommits fall back to (legacy behaviour). */
const LEGACY_BASES = ['origin/HEAD', 'main', 'master'];

/** `effort/<slug>` — the dedicated integration branch name for an effort. */
export function effortBranchName(effortName) {
  const slug = String(effortName || 'effort')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'effort';
  return `effort/${slug}`;
}

/**
 * The base ref a lane worktree is cut from: the effort branch when configured, else null
 * (the caller falls back to a bare `worktree add` — backward-compatible with old efforts /
 * efforts that predate this field).
 */
export function laneBaseRef(config) {
  return (config && config.effortBranch) || null;
}

/**
 * The ordered base-ref candidates used to account a lane's commits (`<base>..<lane>`). The
 * effort branch goes FIRST when set: a lane is cut from the effort branch, so its "commits
 * ahead" must be measured against THAT, not master — otherwise the lane appears to own every
 * commit on the effort branch and SHA-accounting (trailer matching) breaks.
 */
export function baseCandidates(config) {
  const eb = config && config.effortBranch;
  return eb ? [eb, ...LEGACY_BASES] : [...LEGACY_BASES];
}

/** Does a ref resolve in this repo? */
export function branchExists(effortRoot, ref) {
  return !!ref && gitTry(['rev-parse', '--verify', '--quiet', ref], effortRoot).ok;
}

/**
 * Ensure the effort branch exists: ADOPT it if already present (never move it — it carries
 * the slices merged so far), else CREATE it at `baseRef`. Idempotent. Does NOT checkout (the
 * setup skill checks it out once so the whole effort runs on it and the base stays untouched).
 * Returns { ok, created, adopted, ref }.
 */
export function ensureEffortBranch(effortRoot, effortBranch, baseRef) {
  if (branchExists(effortRoot, effortBranch)) {
    return { ok: true, created: false, adopted: true, ref: effortBranch };
  }
  const r = gitTry(['branch', effortBranch, baseRef || 'HEAD'], effortRoot);
  return { ok: r.ok, created: r.ok, adopted: false, ref: effortBranch, error: r.ok ? null : r.out };
}

/**
 * Is `ancestorRef` an ancestor of `descendantRef` (i.e. does the descendant build ON the
 * ancestor)? `git merge-base --is-ancestor` exits 0 when true (and when the refs are equal).
 */
export function descendsFrom(effortRoot, ancestorRef, descendantRef) {
  return gitTry(['merge-base', '--is-ancestor', ancestorRef, descendantRef], effortRoot).ok;
}

/**
 * Validate that each live lane branch descends from the effort branch. A lane that does NOT
 * is a build-on-stale: it was cut from the wrong base and would integrate stale code. This is
 * a SURFACED inconsistency (reported in the briefing), NOT a halt — the lane's work is intact
 * in git; the orchestrator re-bases or re-cuts it.
 *
 * `lanes`: [{ workOrder, branch }]. A lane whose branch does not exist is skipped (it is
 * accounted elsewhere — gone-from-disk downgrade). With no effort branch configured this is a
 * no-op (there is no base to be off of — old efforts keep their behaviour).
 * Returns { checked, offBase: [{ workOrder, branch }] }.
 */
export function validateLaneBases(effortRoot, effortBranch, lanes) {
  if (!effortBranch || !branchExists(effortRoot, effortBranch)) return { checked: 0, offBase: [] };
  let checked = 0;
  const offBase = [];
  for (const lane of lanes || []) {
    if (!lane || !lane.branch || !branchExists(effortRoot, lane.branch)) continue;
    checked += 1;
    if (!descendsFrom(effortRoot, effortBranch, lane.branch)) {
      offBase.push({ workOrder: lane.workOrder || null, branch: lane.branch });
    }
  }
  return { checked, offBase };
}
