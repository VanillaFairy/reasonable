// reconcile.mjs — crash-only recovery (DESIGN §5.12, §5.13; architecture §12, D8b).
// The session is a cache; the artifacts are the truth. There is no graceful-
// shutdown path, so recovery is the ONLY path and is therefore tested every
// session. The journal is intent; ground truth is git + tests + ledger.
//
// reconcile() is a TOTAL HALTING FUNCTION (D8b). It partitions every artifact
// configuration into exactly one of three buckets and never guesses at recovery
// time:
//   - RESOLVED      — a transition we can verify and settle: downgrade a
//                     dispatched-with-no-work order to pending; re-claim an
//                     orphan-in-a-registered-lane whose SHA reconciles AND whose
//                     atomic commit carried its own ledger line; merge clean green.
//   - SAFE-DEFAULT  — a conservative downgrade that loses no truth (a registered
//                     lane gone from disk → its order back to pending; the work
//                     product still lives in git for the next dispatch).
//   - AMBIGUOUS     — a configuration recovery cannot settle without inference:
//                     an orphan commit whose trailer mismatches the journal SHA;
//                     a ledger entry with no commit (UNLESS a later `correction`
//                     supersedes its SHA with a resolvable one, D21); two lanes
//                     claiming one work order; an absent `config.runMode` on a
//                     cold restart (D10).
//                     Any AMBIGUOUS sets result.halt = true with a haltReason +
//                     evidence and is surfaced to the human as a BLOCKING
//                     decision — never a guess.
//
// The floor-integrity tripwire (BF8) is NOT in the AMBIGUOUS→HALT set: the
// byte-level fileHash cannot distinguish a harmless additive pin from a real
// regression, so it is DEMOTED to a BACKSTOP that still SURFACES every
// unaccounted floor change and, in autonomous mode, still queues it to the human
// inbox (D6). An `accept` verifier-verdict may annotate such a diff
// "explained-by-verdict", but advisory-only — it never silences the surfacing.
//
// D13 — the UNEXPLAINED-BREACH STOP completes D6. The D6 demotion moved the floor
// gate EARLIER (to the pre-integration intent-verifier) instead of removing it. So
// recovery must still STOP an unattended run on a surprise regression that bypassed
// that adversary. In AUTONOMOUS mode an UNEXPLAINED breaking floor-integrity-mismatch
// (a surfaced diff that NO `accept` verdict explains — i.e. nothing pre-integration
// judged it) is a FIFTH always-escalate class: it sets result.halt = true (queue
// BREAKING + stop the loop), it does not grind on. An EXPLAINED floor diff (the
// adversary accepted it pre-integration) is a NON-BLOCKING NOTICE: it surfaces and is
// logged, the run continues. In GATED mode neither halts — both just surface in the
// briefing for the present human. This keeps annotate-not-disarm intact (the human
// always sees the diff, explained or not) while guaranteeing an unexplained surprise
// regression STOPS an unattended run. result.floorIntegrity.unexplained is the
// derived count the orchestrator routes on.
//
// Trailers are hints, not anchors (DESIGN §5.14B): SHA accounting against the
// ledger is truth; a `Work-Order:` trailer is only a re-claim hint, and a trailer
// that contradicts the journal SHA is AMBIGUOUS, not authoritative.
//
// reconcile() has no interaction with the D19 action-event mechanism
// (action-started/action-finished/action-obsoleted in ledger.jsonl): those lines are
// permanent ledger history, replayed purely by lib/progress.mjs's replayActions, with no
// ephemeral state of their own to reset or reclaim. There is nothing here for reconcile()
// to do on a cold restart or a mid-run reconciler pass — the progress mirror just re-derives
// from whatever ledger lines already exist, same as every other ledger consumer.
//
// Usage: node reconcile.mjs [--json]   (also exports reconcile() for session-start)

import { existsSync } from 'node:fs';
import { join, basename, resolve } from 'node:path';
import { findEffortRoot, rootFromArgv, readJson, readJsonl, gitTry, norm, loadConfig } from './effort.mjs';
import { computeBurndown } from './burndown.mjs';
import { floorIntegrity } from './baseline.mjs';
import { baseCandidates, validateLaneBases } from './branch.mjs';

export function reconcile(effortRoot) {
  const R = join(effortRoot, '.reasonable');
  const journal = readJson(join(R, 'journal.json'));
  if (!journal) return { active: false };

  const notes = [];          // human-readable advisory lines (preserved behavior)
  const resolved = [];       // settled transitions (RESOLVED / SAFE-DEFAULT)
  const ambiguities = [];    // { haltReason, evidence } — any one of these halts
  const lanesOnDisk = listWorktrees(effortRoot);
  const journalLanes = journal.lanes || {};
  const workOrders = journal.workOrders || {};
  const ledger = readJsonl(join(R, 'ledger.jsonl'));

  // Config is read up front now: the effort branch is the base a lane's commits are
  // accounted against (a lane is cut from it, so `<effortBranch>..<lane>` is the lane's
  // own work — measuring against master would count the whole effort branch as the lane's).
  const cfg = loadConfig(effortRoot) || {};
  const bases = baseCandidates(cfg);

  // --- Two lanes claiming one work order (AMBIGUOUS). -----------------------
  // The journal's lane map must be a function from lane path → work order, but a
  // torn write or a forged descriptor can leave two lanes pointing at one order.
  const claimants = {};
  for (const [lanePath, woId] of Object.entries(journalLanes)) {
    (claimants[woId] ||= []).push(lanePath);
  }
  for (const [woId, lanes] of Object.entries(claimants)) {
    if (lanes.length > 1) {
      ambiguities.push({
        haltReason: `two lanes claim work order ${woId}`,
        evidence: { workOrder: woId, lanes },
      });
      notes.push(`WO ${woId}: claimed by ${lanes.length} lanes (${lanes.join(', ')}) → AMBIGUOUS, cannot pick one.`);
    }
  }

  // --- Per-work-order partition (downgrade / re-claim / harvest). -----------
  for (const [id, wo] of Object.entries(workOrders)) {
    if (wo.status !== 'dispatched' && wo.status !== 'checkpointed') continue;
    const branch = wo.branch;
    const hasBranch = branch && gitTry(['rev-parse', '--verify', '--quiet', branch], effortRoot).ok;
    const ahead = hasBranch ? commitsAhead(effortRoot, branch, bases) : 0;
    const wtExists = wo.worktree && existsSync(laneAbs(effortRoot, wo.worktree));
    // The checkpoint-anchor fix (D8b): a checkpoint-only lane persists at least
    // one *trailered* checkpoint commit, so `ahead > 0` holds. A registered lane
    // carrying a trailered checkpoint commit for this order is LIVE — it must not
    // silently downgrade and lose the checkpoint.
    const checkpointCommit = hasBranch ? trailedCheckpoint(effortRoot, branch, id, bases) : null;

    if (!wtExists && ahead === 0 && wo.status === 'checkpointed') {
      // A checkpointed order with no worktree and no commits is the lost-
      // checkpoint hole: there is no on-disk evidence the checkpoint ever
      // landed, yet the journal claims it did. Inferring either way loses truth.
      ambiguities.push({
        haltReason: `checkpointed WO ${id} has no worktree and no commits — checkpoint anchor missing`,
        evidence: { workOrder: id, branch: branch || null, worktree: wo.worktree || null, ahead },
      });
      notes.push(`WO ${id}: journal says "checkpointed" but worktree is gone and ${branch || 'branch'} has no commits → AMBIGUOUS (checkpoint anchor lost).`);
    } else if (!wtExists && ahead === 0) {
      // Dispatched with no work landed: safe to downgrade, loses no truth.
      wo.status = 'pending';
      resolved.push({ kind: 'downgrade', workOrder: id, to: 'pending', class: 'RESOLVED' });
      notes.push(`WO ${id}: journal says "dispatched" but worktree is gone and ${branch || 'branch'} has no commits → DOWNGRADE to pending.`);
    } else if (wtExists && ahead === 0 && checkpointCommit) {
      // Registered lane, live checkpoint commit present → treat as live, not pending.
      resolved.push({ kind: 'live-checkpoint', workOrder: id, sha: checkpointCommit, class: 'RESOLVED' });
      notes.push(`WO ${id}: registered lane with a trailered checkpoint commit ${short(checkpointCommit)} → live checkpoint, not downgraded.`);
    } else if (ahead > 0) {
      // Commits exist on the lane branch → harvest, but only after SHA accounting.
      const claim = reclaimOrphanCommits(effortRoot, id, branch, wo, ledger, bases);
      if (claim.class === 'AMBIGUOUS') {
        ambiguities.push({ haltReason: claim.haltReason, evidence: claim.evidence });
        notes.push(`WO ${id}: ${claim.note}`);
      } else {
        resolved.push({ kind: claim.kind, workOrder: id, class: claim.class, ...claim.detail });
        notes.push(`WO ${id}: ${claim.note}`);
      }
    } else {
      // worktree present, 0 commits, not a checkpoint → still effectively pending.
      resolved.push({ kind: 'no-work-yet', workOrder: id, class: 'SAFE-DEFAULT' });
      notes.push(`WO ${id}: worktree present, 0 commits → still effectively pending (no work landed yet).`);
    }
  }

  // --- Orphan worktrees: on disk but not in the journal registry. -----------
  for (const wt of lanesOnDisk) {
    const wtAbs = laneAbs(effortRoot, wt);
    const effAbs = norm(resolve(effortRoot));
    const rel = wtAbs && wtAbs.startsWith(effAbs + '/') ? wtAbs.slice(effAbs.length + 1) : (wtAbs || '');
    // Compare on the canonical ABSOLUTE path: a journal lane key / wo.worktree may be stored
    // relative OR absolute-with-native-separators, and join() mangles the absolute form (so a
    // present lane would read as an orphan / "no worktree"). laneAbs normalizes both shapes.
    const known = Object.keys(journalLanes).some((l) => laneAbs(effortRoot, l) === wtAbs) ||
      Object.values(workOrders).some((w) => laneAbs(effortRoot, w.worktree) === wtAbs);
    if (!known) {
      // An orphan worktree is not by itself a halt — its commits get SHA-
      // accounted. But an orphan *commit* whose trailer points at a journal
      // order with a different recorded SHA IS a halt (handled per-WO above /
      // below). Here we account the bare orphan-worktree case.
      const orphanBranch = gitTry(['-C', join(effortRoot, rel), 'rev-parse', '--abbrev-ref', 'HEAD'], effortRoot).out.trim();
      const claim = accountOrphanWorktree(effortRoot, rel, orphanBranch, workOrders, ledger, bases);
      if (claim.class === 'AMBIGUOUS') {
        ambiguities.push({ haltReason: claim.haltReason, evidence: claim.evidence });
        notes.push(`Orphan worktree "${rel}": ${claim.note}`);
      } else {
        resolved.push({ kind: 'orphan-worktree', lane: rel, class: claim.class });
        notes.push(`Orphan worktree "${rel}": ${claim.note}`);
      }
    }
  }

  // --- Journal lanes with no worktree on disk (SAFE-DEFAULT downgrade). -----
  for (const lanePath of Object.keys(journalLanes)) {
    if (!existsSync(laneAbs(effortRoot, lanePath))) {
      const woId = journalLanes[lanePath];
      const wo = workOrders[woId];
      // If the lane's branch carries a live checkpoint commit, the work product
      // survives in git — downgrading to pending loses no truth (SAFE-DEFAULT).
      // We never re-claim it here: re-claim requires a present registered lane.
      if (wo && (wo.status === 'dispatched' || wo.status === 'checkpointed')) {
        // already handled in the per-WO loop above; just record the orphan note.
        notes.push(`Journal lane "${lanePath}" has no worktree on disk → its work order is downgraded/accounted above.`);
      } else {
        resolved.push({ kind: 'stale-lane', lane: lanePath, workOrder: woId || null, class: 'SAFE-DEFAULT' });
        notes.push(`Journal lane "${lanePath}" has no worktree on disk → downgrade its work order to pending.`);
      }
    }
  }

  // --- Ledger entries with no commit (AMBIGUOUS). --------------------------
  // The worker's terminal effects collapse into ONE atomic commit that binds the
  // work product + its ledger line + trailer (D3a). A ledger line that claims a
  // committed transition but has no commit behind it is a torn window: git is
  // behind the ledger, which the atomic-commit discipline forbids → halt.
  for (const orphan of ledgerLinesWithoutCommit(effortRoot, ledger)) {
    ambiguities.push({
      haltReason: `ledger entry seq ${orphan.seq} (${orphan.type}) names a commit ${short(orphan.commit)} that does not exist`,
      evidence: { seq: orphan.seq, type: orphan.type, commit: orphan.commit, workOrder: orphan.workOrder || null },
    });
    notes.push(`Ledger seq ${orphan.seq} (${orphan.type}): names commit ${short(orphan.commit)} which is absent in git → AMBIGUOUS (torn window).`);
  }

  // --- Floor-integrity pass (BF8 / D-BF8) — a BACKSTOP TRIPWIRE, not a HALT. --
  // Floor integrity is a test-set property, distinct from the commit-only D8b
  // partition. The byte-level fileHash cannot tell a harmless additive pin from a
  // real regression, so it is no longer a first-line AMBIGUOUS→HALT (D6): it is
  // DEMOTED to a backstop tripwire that still SURFACES every unaccounted floor
  // change and, in AUTONOMOUS mode, still queues it to the human inbox. An
  // `accept` verifier-verdict may ANNOTATE such a diff "explained-by-verdict",
  // but that is ADVISORY only — it NEVER clears the surfacing or the queue
  // (annotate-not-disarm: a missing/half-written verdict causes MORE human
  // surfacing, never less). The runMode-absent / SHA-custody / ledger-without-
  // commit / two-lanes-one-WO HALT classes are unchanged and stay first-line.
  const floor = floorIntegrity(effortRoot);
  const floorSurfaced = floor.filter((t) => t.ambiguous);
  for (const t of floorSurfaced) {
    const changedFiles = t.files.filter((f) => f.changed).map((f) => f.path);
    const annotated = t.explainedByVerdict ? ' (annotated explained-by-verdict — advisory, still surfaced)' : '';
    notes.push(`Floor test "${t.id}": ${changedFiles.join(', ')} changed with no characterization-promotion / change-characterized / floorImpact event → BACKSTOP SURFACED (regression-floor tripwire)${annotated}.`);
  }

  // --- Run mode (D10): read it, carry it, halt if absent on cold restart. ---
  // (cfg loaded up front — the effort branch is also the lane-accounting base.)
  const runMode = cfg.runMode ?? null;
  if (runMode !== 'gated' && runMode !== 'autonomous') {
    // Defaulting to the "safer" mode is still an inference, and the framework
    // forbids inferring mode (the one-sentence difference between *autonomous*
    // and *unsupervised*). An absent/invalid runMode on a cold restart HALTS.
    ambiguities.push({
      haltReason: 'config.runMode is absent — run mode may never be inferred at recovery',
      evidence: { runMode, expected: ['gated', 'autonomous'] },
    });
    notes.push('config.runMode is absent or invalid → AMBIGUOUS (the entry skill must record gated|autonomous; reconcile may not guess).');
  }

  // --- Lane-base validation (branch hygiene) — a SURFACED inconsistency, not a HALT. ---
  // Every live lane must descend from the effort branch (it should have been cut from it).
  // A lane that does not is a build-on-stale: it was cut from the wrong base (e.g. master,
  // missing an earlier slice) and would integrate stale code. Its work is intact in git, so
  // this surfaces (briefing + note) for a re-base/re-cut — it never silently builds on stale.
  const liveLanes = Object.entries(workOrders)
    .filter(([, wo]) => wo.branch && (wo.status === 'dispatched' || wo.status === 'checkpointed'))
    .map(([id, wo]) => ({ workOrder: id, branch: wo.branch }));
  const laneBases = validateLaneBases(effortRoot, cfg.effortBranch, liveLanes);
  for (const off of laneBases.offBase) {
    notes.push(`Lane ${off.workOrder} (${off.branch}) does NOT descend from the effort branch ${cfg.effortBranch} → SURFACED build-on-stale (cut from the wrong base; re-base/re-cut it before merge — never integrate stale).`);
  }

  // --- Trust-staleness set (D13) — from the ledger event stream. ------------
  const staleness = trustStaleness(ledger);

  const { parked, stubs } = computeBurndown(effortRoot);
  const inbox = (readJson(join(R, 'inbox.json')) || journal).inbox || (readJson(join(R, 'inbox.json')) || {}).items || [];
  const onDiskInbox = (Array.isArray(inbox) ? inbox : []).filter((i) => i.status !== 'resolved');

  // The floor-integrity tripwire is one of the always-escalate classes (D6): in
  // AUTONOMOUS mode each surfaced floor change queues to the human inbox as a
  // BREAKING item (a fifth disposition, never auto-cleared by a verdict). In
  // GATED mode the present human is the net and already sees the briefing notes,
  // so we surface but do not synthesize an extra blocking item. Either way the
  // explaining verdict is ADVISORY: it annotates, it never silences the queue.
  //
  // D13: each item is tagged `unexplained` = surfaced AND no `accept` verdict
  // explains it. In AUTONOMOUS mode an UNEXPLAINED item is the fifth always-
  // escalate class — it both queues BREAKING and STOPS the loop (halt below). An
  // EXPLAINED one is a non-blocking NOTICE (queued for the human's eyes, advisory,
  // does not halt). The explaining verdict still never silences the surfacing.
  const floorBackstopItems = floorSurfaced.map((t) => ({
    id: `FLOOR-${t.id}`,
    kind: 'floor-integrity-mismatch',
    floorTest: t.id,
    locus: t.locus,
    changedFiles: t.files.filter((f) => f.changed).map((f) => f.path),
    explainedByVerdict: !!t.explainedByVerdict,
    unexplained: !t.explainedByVerdict,
    summary: `floor test "${t.id}" changed with no accounting event — backstop tripwire${t.explainedByVerdict ? ' (explained-by-verdict, advisory NOTICE)' : ' (UNEXPLAINED — no pre-integration verdict; always-escalate STOP)'}`,
    status: 'open',
    breaking: true,
  }));
  const openInbox = runMode === 'autonomous'
    ? [...onDiskInbox, ...floorBackstopItems]
    : onDiskInbox;

  // D13 derived signal: how many surfaced floor diffs are UNEXPLAINED (no accept
  // verdict). In AUTONOMOUS mode that is the fifth always-escalate class — an
  // unexplained breaking floor breach STOPS the loop. An EXPLAINED diff is a notice
  // and never halts. In GATED mode the present human is the net, so neither halts;
  // both already surface in the briefing. The four first-line AMBIGUOUS→HALT classes
  // (sha-custody / ledger-without-commit / runmode-absent / two-lanes) are untouched.
  const floorUnexplained = floorSurfaced.filter((t) => !t.explainedByVerdict).length;
  const floorBreachStop = runMode === 'autonomous' && floorUnexplained > 0;
  if (floorBreachStop) {
    notes.push(`UNEXPLAINED floor-integrity breach in AUTONOMOUS mode (${floorUnexplained} surfaced diff(s) with no accept verdict) → STOP (fifth always-escalate class, D13): something bypassed the pre-integration adversary; the autonomous loop halts and queues BREAKING.`);
  }

  const halt = ambiguities.length > 0 || floorBreachStop;
  const result = {
    active: true,
    effort: journal.effort,
    currentVerticalSlice: journal.currentVerticalSlice,
    phase: journal.phase,
    supervision: journal.supervision,
    runMode,
    // Branch hygiene: the dedicated integration branch lanes are cut from / merged into,
    // and the base ref written only at effort end. Null on an effort that predates this.
    effortBranch: cfg.effortBranch || null,
    baseBranch: cfg.baseBranch || null,
    laneBaseIssues: laneBases.offBase,
    workOrders,
    notes,
    resolved,
    burndown: { parked: parked.length, loudStubs: stubs.length },
    ledgerEvents: ledger.length,
    floorIntegrity: {
      checked: floor.length,
      surfaced: floorSurfaced.length,
      explainedByVerdict: floorSurfaced.filter((t) => t.explainedByVerdict).length,
      unexplained: floorUnexplained,
      backstop: floorBackstopItems,
    },
    staleness,
    openInbox,
    halt,
  };
  if (halt) {
    const reasons = ambiguities.map((a) => a.haltReason);
    const evidence = ambiguities.slice();
    if (floorBreachStop) {
      // D13: the unexplained-breach STOP is a halt class WITHOUT a first-line
      // AMBIGUOUS entry (the diff is a surfaced backstop, not an unsettleable
      // recovery). Carry its own reason + evidence so the briefing names it.
      const stopReason = `unexplained floor-integrity breach in autonomous mode (${floorUnexplained} surfaced diff(s) with no accept verdict) — STOP (D13)`;
      reasons.push(stopReason);
      evidence.push({
        haltReason: stopReason,
        haltClass: 'floor-integrity-unexplained',
        evidence: { unexplained: floorUnexplained, backstop: floorBackstopItems.filter((i) => i.unexplained) },
      });
    }
    result.haltReason = reasons.join('; ');
    result.evidence = evidence;
  }
  return result;
}

// ---------------------------------------------------------------------------
// SHA accounting — the truth layer (DESIGN §5.14B). Trailers are hints; the
// recorded journal/ledger SHAs are authority. A trailer that contradicts the
// recorded SHA is AMBIGUOUS, never an anchor.
// ---------------------------------------------------------------------------

/**
 * Re-claim (or refuse) the commits on a registered lane's branch.
 *
 * RESOLVED: every lane commit's trailer (a hint) agrees with the journal SHA
 *           accounting AND the atomic commit included this order's own ledger
 *           line. The work re-claims cleanly.
 * AMBIGUOUS: an orphan commit whose trailer names a work order whose recorded
 *            SHA differs (forged/copied trailer, cherry-pick, torn write), or a
 *            commit with no ledger line behind it.
 */
function reclaimOrphanCommits(effortRoot, woId, branch, wo, ledger, bases) {
  const recorded = new Set((wo.commits || []).map(normSha));
  const heads = laneCommits(effortRoot, branch, bases);
  for (const c of heads) {
    const trailerWO = workOrderTrailer(effortRoot, c);
    // Trailer is a hint: if it points at a DIFFERENT order than this lane's, and
    // that order's journal SHA accounting doesn't include this commit, it is an
    // orphan-commit-with-mismatched-trailer → AMBIGUOUS.
    if (trailerWO && trailerWO !== woId) {
      return {
        class: 'AMBIGUOUS',
        haltReason: `commit ${short(c)} on lane for ${woId} carries trailer Work-Order: ${trailerWO} (mismatch)`,
        evidence: { workOrder: woId, commit: c, trailerWorkOrder: trailerWO },
        note: `commit ${short(c)} trailer claims ${trailerWO} ≠ ${woId} → AMBIGUOUS (trailer is a hint, not an anchor).`,
      };
    }
    // The atomic commit must have carried its own ledger line (D3a). A commit
    // recorded by the journal is accounted; otherwise we require a ledger line
    // that names this commit. No ledger line → unaccounted custody → AMBIGUOUS.
    const accounted = recorded.has(normSha(c)) || ledgerNamesCommit(ledger, c);
    if (!accounted) {
      return {
        class: 'AMBIGUOUS',
        haltReason: `commit ${short(c)} on lane for ${woId} has no recorded SHA and no ledger line`,
        evidence: { workOrder: woId, commit: c },
        note: `commit ${short(c)} is unaccounted (no journal SHA, no ledger line) → AMBIGUOUS (unaccounted custody).`,
      };
    }
  }
  return {
    class: 'RESOLVED',
    kind: 'reclaim',
    detail: { commits: heads },
    note: `${heads.length} commit(s) SHA-reconcile and carried their ledger line(s) → re-claim and harvest (verify gate, then merge).`,
  };
}

/**
 * Account a bare orphan worktree (on disk, absent from the journal registry).
 * If its HEAD commits all map (by SHA accounting) to a known order, that order's
 * per-WO partition already covers them and this is a SAFE-DEFAULT sweep note. A
 * commit whose trailer points at a journal order whose recorded SHA differs is
 * AMBIGUOUS (orphan commit / mismatched trailer).
 */
function accountOrphanWorktree(effortRoot, rel, branch, workOrders, ledger, bases) {
  const heads = branch ? laneCommits(effortRoot, branch, bases) : [];
  for (const c of heads) {
    const trailerWO = workOrderTrailer(effortRoot, c);
    if (trailerWO) {
      const wo = workOrders[trailerWO];
      const recorded = new Set((wo?.commits || []).map(normSha));
      if (wo && !recorded.has(normSha(c)) && !ledgerNamesCommit(ledger, c)) {
        return {
          class: 'AMBIGUOUS',
          haltReason: `orphan commit ${short(c)} trailers Work-Order: ${trailerWO} but its journal SHA does not match`,
          evidence: { lane: rel, commit: c, trailerWorkOrder: trailerWO, recorded: [...recorded] },
          note: `commit ${short(c)} trailers ${trailerWO} but the journal SHA mismatches → AMBIGUOUS.`,
        };
      }
    }
  }
  return {
    class: 'SAFE-DEFAULT',
    note: heads.length
      ? `no journal lane → harvest its ${heads.length} commit(s) if they verify, else sweep and re-dispatch.`
      : 'no journal lane and no commits → sweep and re-dispatch.',
  };
}

/** Ledger lines that claim a commit which does not resolve in git (torn window). */
function ledgerLinesWithoutCommit(effortRoot, ledger) {
  const out = [];
  // A `correction` (D21) supersedes an earlier event's fabricated SHA with the REAL one read
  // from git. reconcile HONORS it: the superseded seq is no longer a torn window. This is the
  // belt-and-suspenders to the scribe never originating a SHA — the primary fix removes the
  // opportunity; this lets an already-wedged run recover from a logged correction.
  const corrected = supersededSeqs(effortRoot, ledger);
  for (const e of ledger) {
    if (!e || typeof e !== 'object') continue;
    const sha = e.commit || e.sha || null;
    if (!sha) continue; // a line with no commit reference makes no commit claim
    if (corrected.has(Number(e.seq))) continue; // a later correction supersedes this entry's SHA
    if (!gitTry(['rev-parse', '--verify', '--quiet', `${normSha(sha)}^{commit}`], effortRoot).ok) {
      out.push({ seq: e.seq, type: e.type, commit: sha, workOrder: e.workOrder });
    }
  }
  return out;
}

/**
 * Seqs superseded by a later `correction` entry whose OWN commit RESOLVES in git (D21).
 *
 * A correction names the `supersedes` seq it replaces and carries the real SHA — so reconcile can
 * settle the torn window deterministically (it does not guess which later line "looks like" a fix;
 * the correction says so explicitly). A correction whose own commit is itself unresolvable corrects
 * nothing: it is excluded here, so the original phantom STILL halts (and the bad correction line is
 * itself flagged by the normal torn-window pass) — a phantom cannot be laundered into another phantom.
 */
function supersededSeqs(effortRoot, ledger) {
  const out = new Set();
  for (const e of ledger) {
    if (!e || e.type !== 'correction') continue;
    const target = Number(e.supersedes);
    if (!Number.isFinite(target)) continue;
    const sha = e.commit || e.sha || null;
    if (!sha) continue;
    if (gitTry(['rev-parse', '--verify', '--quiet', `${normSha(sha)}^{commit}`], effortRoot).ok) out.add(target);
  }
  return out;
}

/**
 * Commits on `branch` not on its base, oldest→newest, as full SHAs. `bases` is the ordered
 * candidate list (the EFFORT BRANCH first when configured, then the legacy origin/HEAD,
 * main, master). Accounting a lane against the effort branch it was cut from is what keeps
 * a lane's commits its OWN — measuring against master would absorb the whole effort branch.
 */
function laneCommits(effortRoot, branch, bases = ['origin/HEAD', 'main', 'master']) {
  for (const base of bases) {
    if (base === branch) continue; // a branch is not ahead of itself
    const r = gitTry(['rev-list', '--reverse', `${base}..${branch}`], effortRoot);
    if (r.ok) return r.out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

/** The `Work-Order:` trailer of a commit (a hint), or null. */
function workOrderTrailer(effortRoot, sha) {
  const r = gitTry(['show', '--no-patch', '--format=%(trailers:key=Work-Order,valueonly)', normSha(sha)], effortRoot);
  if (!r.ok) return null;
  const v = r.out.split(/\r?\n/).map((l) => l.trim()).find(Boolean);
  return v || null;
}

/**
 * The newest trailered checkpoint commit for `woId` on `branch`, or null. A
 * checkpoint-only lane persists at least one such commit so `ahead > 0` holds
 * and reconcile can anchor on it (the checkpoint-anchor fix, D8b).
 */
function trailedCheckpoint(effortRoot, branch, woId, bases) {
  const heads = laneCommits(effortRoot, branch, bases);
  for (let i = heads.length - 1; i >= 0; i--) {
    const c = heads[i];
    if (workOrderTrailer(effortRoot, c) === woId && isCheckpointCommit(effortRoot, c)) return c;
  }
  return null;
}

/** Does a commit message mark itself a checkpoint (a Checkpoint trailer or subject tag)? */
function isCheckpointCommit(effortRoot, sha) {
  const r = gitTry(['show', '--no-patch', '--format=%(trailers:key=Checkpoint,valueonly)%n%s', normSha(sha)], effortRoot);
  if (!r.ok) return false;
  const text = r.out.toLowerCase();
  return /checkpoint/.test(text);
}

/** Does any ledger line name this commit (SHA accounting against the ledger)? */
function ledgerNamesCommit(ledger, sha) {
  const want = normSha(sha);
  return ledger.some((e) => e && (normSha(e.commit) === want || normSha(e.sha) === want));
}

function normSha(s) {
  return String(s == null ? '' : s).replace(/^sha256:/, '').trim().toLowerCase();
}

function short(sha) {
  return normSha(sha).slice(0, 10) || '(none)';
}

// ---------------------------------------------------------------------------
// Trust-staleness (D13). Trust is earned, persistent, EVENT-invalidated: a
// trusted-green test is re-verified only when its governing clause is amended or
// its behavior extended since that test's last verification — no re-checking
// churn. The ledger IS the event log; the mapping (test ↔ clause) is the
// contract's citation, mechanical not eyeballed.
// ---------------------------------------------------------------------------

/**
 * From the ledger event stream, compute the set of trusted-green tests whose
 * governing clause was amended or extended since their last verification.
 *
 * Returns { staleTests: [{ test, component, clause, verifiedAtSeq, invalidatedAtSeq, by }],
 *           staleClauses: ["component §n", ...] }.
 *
 * - A test becomes "verified-green at seq S" via a GREEN verdict / audit / a
 *   characterization-promotion that names it together with its clause.
 * - A clause is "amended/extended at seq S'" via an `amendment` or an
 *   `enrichment` that names the component+clause.
 * - The test is STALE iff S' > S (its last verification predates the change).
 */
function trustStaleness(ledger) {
  // Most-recent verification seq per (test) and the clause it was verified under.
  const verifiedAt = new Map(); // testId -> { seq, component, clause }
  // Most-recent amend/extend seq per clause key "component clause".
  const amendedAt = new Map();  // clauseKey -> { seq, kind }

  for (const e of ledger) {
    if (!e || typeof e !== 'object') continue;
    const seq = Number(e.seq) || 0;
    const comp = e.component || null;

    if (isGreenVerification(e)) {
      for (const t of namedTests(e)) {
        const prev = verifiedAt.get(t);
        if (!prev || seq >= prev.seq) {
          verifiedAt.set(t, { seq, component: comp, clause: firstClause(e) });
        }
      }
    }
    if ((e.type === 'amendment' || e.type === 'enrichment') && comp) {
      for (const cl of namedClauses(e)) {
        const key = clauseKey(comp, cl);
        const prev = amendedAt.get(key);
        if (!prev || seq >= prev.seq) amendedAt.set(key, { seq, kind: e.type });
      }
    }
  }

  const staleTests = [];
  const staleClauses = new Set();
  for (const [test, v] of verifiedAt) {
    if (!v.component || !v.clause) continue;
    const key = clauseKey(v.component, v.clause);
    const amend = amendedAt.get(key);
    if (amend && amend.seq > v.seq) {
      staleTests.push({
        test,
        component: v.component,
        clause: v.clause,
        verifiedAtSeq: v.seq,
        invalidatedAtSeq: amend.seq,
        by: amend.kind,
      });
      staleClauses.add(`${v.component} ${v.clause}`);
    }
  }
  return { staleTests, staleClauses: [...staleClauses] };
}

/** A GREEN verification event: an audit/verdict marked green, or a promotion. */
function isGreenVerification(e) {
  if (e.type === 'characterization-promotion') return true;
  if (e.type === 'verdict' || e.type === 'audit') {
    const k = String(e.kind || e.result || '').toLowerCase();
    return k === 'green' || e.green === true || e.passed === true;
  }
  return false;
}

/** The tests an event names (single or array, across the common field names). */
function namedTests(e) {
  const out = new Set();
  for (const k of ['test', 'asserting', 'assertingTest', 'floorTest']) {
    if (typeof e[k] === 'string' && e[k]) out.add(e[k]);
  }
  if (Array.isArray(e.tests)) for (const t of e.tests) if (typeof t === 'string' && t) out.add(t);
  return [...out];
}

/** The clauses an event names (single `clause` or array `clauses`). */
function namedClauses(e) {
  const out = new Set();
  if (typeof e.clause === 'string' && e.clause) out.add(e.clause);
  if (Array.isArray(e.clauses)) for (const c of e.clauses) if (typeof c === 'string' && c) out.add(c);
  return [...out];
}

/** The clause a verification was performed under (first named clause). */
function firstClause(e) {
  return namedClauses(e)[0] || null;
}

function clauseKey(component, clause) {
  return `${component} ${clause}`;
}

// ---------------------------------------------------------------------------

// A journal lane key / wo.worktree path may be stored RELATIVE (the canonical
// `.worktrees/<id>`) or ABSOLUTE with native separators (the graph-editor effort wrote
// absolute Windows paths). path.join() silently MANGLES an absolute second arg
// (`join("/eff", "/abs/x")` → "/eff/abs/x"), so a present worktree reads as MISSING — a live
// lane gets mis-reported "no worktree on disk" and can misroute. Resolve correctly, tolerating
// both shapes and both separators (cross-platform), and return a normalized absolute path.
function laneAbs(effortRoot, p) {
  if (!p) return null;
  const s = norm(String(p));
  const isAbs = /^([a-zA-Z]:\/|\/)/.test(s); // drive-letter (C:/…) or POSIX-absolute (/…)
  return norm(resolve(isAbs ? s : join(effortRoot, s)));
}

function listWorktrees(effortRoot) {
  const r = gitTry(['worktree', 'list', '--porcelain'], effortRoot);
  if (!r.ok) return [];
  // Scope to THIS effort's worktrees (nested under the effort root, e.g. <root>/.worktrees/<wo>).
  // `git worktree list` returns every worktree of the shared repo; with several efforts in one
  // repo, an effort must reconcile only its own lanes — never another effort's, nor the repo's
  // main checkout (an ancestor of, or equal to, the effort root, so never nested under it).
  const base = norm(resolve(effortRoot));
  return r.out.split(/\r?\n/)
    .filter((l) => l.startsWith('worktree '))
    .map((l) => l.slice('worktree '.length).trim())
    .filter((p) => { const np = norm(resolve(p)); return np !== base && np.startsWith(base + '/'); });
}

function commitsAhead(effortRoot, branch, bases = ['origin/HEAD', 'main', 'master']) {
  // commits on `branch` not on its base — the EFFORT BRANCH first when configured, so a
  // lane's "ahead" count is its own work, not the whole effort branch it was cut from.
  for (const base of bases) {
    if (base === branch) continue;
    const r = gitTry(['rev-list', '--count', `${base}..${branch}`], effortRoot);
    if (r.ok) return Number(r.out.trim()) || 0;
  }
  return 0;
}

/** Render a reconcile() result as a human briefing string. */
export function briefing(r) {
  if (!r.active) return '';
  const lines = [];
  lines.push(`**Reasonable briefing** — effort "${r.effort || '(unnamed)'}", vertical slice "${r.currentVerticalSlice || '?'}", phase ${r.phase || '?'}, run mode ${r.runMode || 'UNSET'}, supervision ${r.supervision || 'standard'}.`);
  if (r.effortBranch || r.baseBranch) {
    lines.push(`Branches: effort \`${r.effortBranch || '(none)'}\` (lanes cut from it; green lanes merge into it), base \`${r.baseBranch || '(none)'}\` (written once at effort end).`);
  }
  if (r.laneBaseIssues && r.laneBaseIssues.length) {
    lines.push(`⚠️ Build-on-stale — ${r.laneBaseIssues.length} lane(s) NOT descended from the effort branch (cut from the wrong base; re-base before merge):`);
    for (const o of r.laneBaseIssues) lines.push(`   • ${o.workOrder} (${o.branch})`);
  }

  if (r.halt) {
    lines.push('');
    lines.push(`🛑 **RECONCILE HALT** — recovery cannot proceed without a human decision (silence never consents):`);
    lines.push(`   ${r.haltReason}`);
    for (const a of r.evidence || []) {
      lines.push(`   • ${a.haltReason}`);
      if (a.evidence) lines.push(`     evidence: ${JSON.stringify(a.evidence)}`);
    }
    lines.push('');
  }

  const byStatus = {};
  for (const [id, wo] of Object.entries(r.workOrders)) (byStatus[wo.status] ||= []).push(id);
  lines.push(`Work orders: ${Object.entries(byStatus).map(([s, ids]) => `${ids.length} ${s}`).join(', ') || 'none'}.`);
  lines.push(`Burndown: ${r.burndown.parked} parked test(s), ${r.burndown.loudStubs} loud stub(s). Ledger: ${r.ledgerEvents} event(s).`);
  if (r.floorIntegrity) {
    const fi = r.floorIntegrity;
    const explained = fi.explainedByVerdict ? `, ${fi.explainedByVerdict} explained-by-verdict (advisory NOTICE)` : '';
    const unexplained = fi.unexplained ? `, ${fi.unexplained} UNEXPLAINED${r.runMode === 'autonomous' ? ' (always-escalate STOP, D13)' : ''}` : '';
    lines.push(`Floor integrity: ${fi.checked} floor test(s) checked, ${fi.surfaced} unaccounted change(s) SURFACED (backstop tripwire${explained}${unexplained}).`);
  }
  if (r.staleness && r.staleness.staleTests.length) {
    lines.push(`Trust-staleness (re-verify next slice): ${r.staleness.staleTests.length} test(s) whose clause changed since last verification:`);
    for (const s of r.staleness.staleTests) {
      lines.push(`   • ${s.test} — ${s.component} ${s.clause} (${s.by} at seq ${s.invalidatedAtSeq} > verified seq ${s.verifiedAtSeq}).`);
    }
  }
  if (r.openInbox.length) {
    lines.push(`⚠️ Approval inbox (${r.openInbox.length}) — silence never consents; act before proceeding:`);
    for (const i of r.openInbox) lines.push(`   • [${i.kind}] ${i.summary || i.id}`);
  }
  if (r.notes.length) { lines.push('Reconciliation downgrades / orphans:'); for (const n of r.notes) lines.push(`   • ${n}`); }
  return lines.join('\n');
}

// CLI — exact basename so importing reconcile() from e.g. test-reconcile.mjs
// does not trip the CLI block (cross-platform; an endsWith match is over-broad).
if (basename(process.argv[1] || '') === 'reconcile.mjs') {
  const asJson = process.argv.includes('--json');
  const effortRoot = rootFromArgv(process.argv, process.cwd());
  if (!effortRoot) { console.log(asJson ? '{"active":false}' : 'No effort active.'); process.exit(0); }
  const r = reconcile(effortRoot);
  console.log(asJson ? JSON.stringify(r, null, 2) : (briefing(r) || 'No effort active.'));
}
