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
import { findEffortRoot, rootFromArgv, readJson, readJsonl, gitTry, norm, loadConfig, samePath, underPath, effortBirthState, reconstructBirthSignature, assertNoAmbiguousBirth } from './effort.mjs';
import { computeBurndown } from './burndown.mjs';
import { floorIntegrity } from './baseline.mjs';
import { baseCandidates, validateLaneBases, descendsFrom } from './branch.mjs';
import { append } from './ledger.mjs';
import { buildTree, renderDirectives } from './progress-map.mjs';
import { findById } from './progress-tree.mjs';
import { trustStaleness } from './trust-staleness.mjs';
import { deadEndSet } from './dead-ends.mjs';
import { foldWorkOrderStatuses } from './wo-status.mjs';
import { readRoute } from './route.mjs';
import { projectDirectives, selfCheckDirectives } from './next-action.mjs';
import { redispatchBlock, hashWorkOrder } from './redispatch-guard.mjs';

// samePath / underPath (case-folding path comparison, win32-insensitive / POSIX-sensitive) are hoisted
// into effort.mjs (T1.2) and imported above — ONE definition shared with effort-discovery so the two can
// never disagree. Behavior is identical to the former module-local copies; every caller here still passes
// already-norm()'d (forward-slash) absolute paths.

// §5.1 (F8) cross-check: the ledger fold (lib/wo-status.mjs) is the AUTHORITATIVE WO status. T0.4
// RETIRED the journal's per-WO `status` field — a status-free journal is the norm now. A LEGACY journal
// that predates the retirement may still carry a `status`; reconcile only cross-checks it and warns on
// a mismatch, never trusting it. The two carry different vocabularies, so a disagreement is judged by
// mapping the well-known legacy journal statuses onto the fold's five values; an unrecognized status
// (e.g. legacy 'dead-end', handled by deadEndSet) maps to null and is simply not cross-checked —
// conservative, never a false-alarm note (and a status-free WO trivially yields null → no note).
const JOURNAL_TO_FOLD = {
  pending: 'pending', dispatched: 'running', running: 'running', checkpointed: 'running',
  blocked: 'blocked', dropped: 'dropped', done: 'done', green: 'done', merged: 'done',
};
const foldEquivalent = (journalStatus) =>
  (typeof journalStatus === 'string' && Object.hasOwn(JOURNAL_TO_FOLD, journalStatus))
    ? JOURNAL_TO_FOLD[journalStatus] : null;

// A WO is LIVE (crash recovery examines it) when the ledger fold says RUNNING, or the fold is
// absent/pending AND the LANE REGISTRY shows an in-flight lane (a provisioned worktree or branch). The
// registry is a lane fact kept by T0.4 — never the retired `status`. Shared by the per-WO crash-recovery
// loop, the stale-lane sweep, and lane-base validation so all three agree on "was this handled live".
//
// A MERGED WO is TERMINAL, never live. The `merged` flag can outlive a live-LOOKING lane registry (a
// lingering `branch`/`worktree`) in the legacy/migration resume state — and its fold may still read
// `running` if the merge's node-completed has not landed yet. This exemption keeps isLive in agreement
// with terminalWorkOrders (both treat `merged` as terminal), so a merged WO is never a recovery subject
// and never drifts to pending via a spurious node-downgraded. It excludes ONLY `merged===true` — a
// legitimately-live non-merged lane is unaffected.
function isLive(wo, foldStatus) {
  if (wo && wo.merged === true) return false;
  if (foldStatus === 'running') return true;
  const absentOrPending = foldStatus === null || foldStatus === undefined || foldStatus === 'pending';
  return absentOrPending && !!(wo && (wo.worktree || wo.branch));
}

// The WO id an event addresses — bare `workOrder`, else the base node path's last segment. Mirrors
// lib/wo-status.mjs's (unexported) woIdOf; wo-status.mjs is frozen for T0.4, so reconcile carries its
// own copy to read the one lifecycle fact the fold deliberately omits — the checkpoint.
function eventWoId(e) {
  if (typeof e.workOrder === 'string' && e.workOrder) return e.workOrder;
  if (typeof e.node === 'string' && e.node) {
    const base = e.node.replace(/\[\d+\]$/, '');
    const i = base.lastIndexOf('/');
    return i < 0 ? base : base.slice(i + 1);
  }
  return null;
}

// Lifecycle event types that move a WO's live state — the fold's inputs PLUS node-checkpointed.
const LIFECYCLE_TYPES = new Set([
  'node-dispatched', 'node-checkpointed', 'node-completed', 'node-failed', 'node-panicked',
  'node-canceled', 'node-downgraded',
]);

// Is a WO CHECKPOINTED per the ledger — its LATEST lifecycle event a node-checkpointed? The fold folds
// a checkpoint into `running` (node-checkpointed is ignored — a checkpoint reclaim continues the same
// attempt), so it cannot tell a checkpoint-only lane from a plain dispatched one. The durable
// node-checkpointed event is the source-of-truth signal the retired journal `status:'checkpointed'`
// used to mirror. reconcile reads it ONLY to keep the lost-checkpoint-anchor AMBIGUOUS distinct from a
// plain lost-work downgrade — never to set WO status (that stays the fold's job).
function ledgerCheckpointed(ledger, id) {
  let best = null;
  for (const e of ledger) {
    if (!e || typeof e !== 'object' || !LIFECYCLE_TYPES.has(e.type)) continue;
    if (eventWoId(e) !== id) continue;
    const seq = Number(e.seq) || 0;
    if (best === null || seq > best.seq) best = { seq, type: e.type };
  }
  return best !== null && best.type === 'node-checkpointed';
}

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

  // §5.1 (F2, F8): a WO's status is a FOLD OF THE LEDGER — the source of truth — not a field read
  // from journal.workOrders (T0.4 retired that field). A legacy journal is cross-checked below; a WO
  // living only in the ledger (the invisible-WO incident) is surfaced after the per-WO loop.
  const woFold = foldWorkOrderStatuses(ledger);

  // Derived per-WO status for the briefing — the fold is the source (T0.4: the journal no longer
  // stores it). The write-once `merged` terminal fact WINS: a merged WO reads `done` even if its fold
  // still reads `running` because the merge's node-completed has not landed yet (the legacy/migration
  // resume state) — this keeps the derived status coherent with isLive/terminalWorkOrders, never
  // drifting a merged WO to running/pending. Otherwise a registered WO with no ledger events reads
  // `pending`. Crash-recovery downgrades below overwrite the ids they settle. Never reads the retired
  // journal `status`.
  const workOrderStatuses = {};
  for (const id of Object.keys(workOrders)) {
    const st = woFold.get(id);
    workOrderStatuses[id] = (workOrders[id] && workOrders[id].merged === true) ? 'done'
      : (st ? st.status : 'pending');
  }

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

  // --- Repo-root stray shadowing nested efforts (AMBIGUOUS, §6.4 F5). --------
  // A slipped-through stray birth: a BORN `<repoRoot>/.reasonable/` co-existing with born nested efforts
  // under `<repoRoot>/.reasonable-efforts/`. The repo-root one would WIN the up-walk from the repo root
  // and SHADOW the nested efforts — a configuration recovery cannot settle by inference, so it HALTS and
  // surfaces for a human to resolve (remove/rename the stray, or fold it in). This is NARROW by
  // construction: it fires ONLY when the repo root ITSELF is a born effort AND nested efforts also exist.
  // The sanctioned N-parallel-nested layout (`.reasonable-efforts/{a,b,…}/` with NO repo-root
  // `.reasonable/`) has `effortBirthState(repoRoot) === 'absent'`, so it NEVER trips — each parallel
  // effort is reconciled on its own root, independently. (Reachability is judged by the repo toplevel,
  // not by which effort reconcile happens to be running on.)
  const topForBirth = gitTry(['rev-parse', '--show-toplevel'], effortRoot);
  const repoRootForBirth = norm(resolve(topForBirth.ok && topForBirth.out.trim() ? topForBirth.out.trim() : effortRoot));
  if (effortBirthState(repoRootForBirth).state !== 'absent') {
    const nested = assertNoAmbiguousBirth(repoRootForBirth);
    if (nested.ambiguous) {
      ambiguities.push({
        haltReason: `a repo-root .reasonable/ at "${repoRootForBirth}" co-exists with born nested effort(s) — the repo-root effort shadows the nested ones in the up-walk`,
        evidence: { repoRoot: repoRootForBirth, nestedEfforts: nested.existing },
      });
      notes.push(`Repo-root .reasonable/ at "${repoRootForBirth}" shadows born nested effort(s) [${nested.existing.join(', ')}] → AMBIGUOUS (a slipped-through stray birth; resolve which is canonical before proceeding).`);
    }
  }

  // --- Per-work-order partition (downgrade / re-claim / harvest). -----------
  for (const [id, wo] of Object.entries(workOrders)) {
    // The ledger fold is the AUTHORITATIVE status. T0.4 retired the journal's per-WO `status` field;
    // a LEGACY journal that predates the retirement may still carry one, so we cross-check it and warn
    // on a mismatch — but it never governs (a status-free journal simply skips this: wo.status is
    // undefined → foldEquivalent → null → no note).
    const foldState = woFold.get(id);
    const foldStatus = foldState ? foldState.status : null;
    if (foldStatus !== null) {
      const je = foldEquivalent(wo.status);
      if (je !== null && je !== foldStatus) {
        notes.push(`WO ${id}: legacy journal status '${wo.status}' disagrees with ledger fold '${foldStatus}' — using ledger.`);
      }
    }
    // Crash recovery examines a LIVE work order. The ledger fold WINS: a fold of `done`/`blocked`/
    // `dropped` is decisive — never re-open or downgrade a WO the ledger already settled. It runs when
    // the fold says RUNNING, or when the fold is absent/`pending` AND the LANE REGISTRY shows an
    // in-flight lane (a provisioned worktree or branch — a lane fact kept by T0.4, never the retired
    // `status`). That lane's claim is then verified against git + ledger below (an unbacked claim
    // downgrades, preserving the D8b partition and the registered-lane recovery path, incl. the
    // idempotent post-downgrade re-affirm).
    const live = isLive(wo, foldStatus);
    if (!live) continue;
    const branch = wo.branch;
    const hasBranch = branch && gitTry(['rev-parse', '--verify', '--quiet', branch], effortRoot).ok;
    const ahead = hasBranch ? commitsAhead(effortRoot, branch, bases) : 0;
    const wtExists = wo.worktree && existsSync(laneAbs(effortRoot, wo.worktree));
    // The checkpoint-anchor fix (D8b): a checkpoint-only lane persists at least
    // one *trailered* checkpoint commit, so `ahead > 0` holds. A registered lane
    // carrying a trailered checkpoint commit for this order is LIVE — it must not
    // silently downgrade and lose the checkpoint.
    const checkpointCommit = hasBranch ? trailedCheckpoint(effortRoot, branch, id, bases) : null;

    if (!wtExists && ahead === 0 && ledgerCheckpointed(ledger, id)) {
      // A checkpointed order with no worktree and no commits is the lost-
      // checkpoint hole: there is no on-disk evidence the checkpoint ever
      // landed, yet the ledger's node-checkpointed says it did. Inferring either
      // way loses truth. The checkpoint signal is the durable ledger event, not
      // the retired journal `status` (see ledgerCheckpointed).
      ambiguities.push({
        haltReason: `checkpointed WO ${id} has no worktree and no commits — checkpoint anchor missing`,
        evidence: { workOrder: id, branch: branch || null, worktree: wo.worktree || null, ahead },
      });
      notes.push(`WO ${id}: the ledger shows a checkpoint but the worktree is gone and ${branch || 'branch'} has no commits → AMBIGUOUS (checkpoint anchor lost).`);
    } else if (!wtExists && ahead === 0) {
      // Running per the ledger with no work landed: safe to downgrade, loses no truth. The AUTHORITATIVE
      // downgrade is the node-downgraded ledger event appended below (the fold then reads `pending`); we
      // reflect it in the DERIVED status map for the briefing. Every lane-registry field
      // (`dispatchEpoch`, worktree, branch, …) is left untouched, so the next write-ahead lane
      // registration bumps the epoch from the right base and the crash boundary renders (D19).
      workOrderStatuses[id] = 'pending';
      resolved.push({ kind: 'downgrade', workOrder: id, to: 'pending', class: 'RESOLVED' });
      notes.push(`WO ${id}: running per the ledger but the worktree is gone and ${branch || 'branch'} has no commits → DOWNGRADE to pending.`);
      // Mirror the same lost-work downgrade into the progress tree via the ledger controller
      // (Plan 1 "organs" rework). Non-fatal: a WO with no node-planned/node-dispatched of its
      // own yet is unresolvable in the tree, so append() returns {ok:false} rather than
      // throwing — recovery must never die because the progress tree is thin, so a miss here
      // is just another advisory note alongside every other fact recorded above, not a new
      // AMBIGUOUS/halt class.
      //
      // IDEMPOTENCY: reconcile() runs unconditionally on every SessionStart and has always
      // been safe to call repeatedly (it was pure reads before this addition). A WO stuck in
      // this same lost-work state re-enters this branch on every call until something actually
      // redispatches it, so the append must be guarded — otherwise a permanent duplicate
      // node-downgraded line lands on every session start. buildTree() is a pure read (it just
      // folds the existing ledger, no write), so checking the CURRENT tree state first adds no
      // new write surface: if the resolved node already shows the exact downgraded shape this
      // same event would produce (failed, detail "lost-work crash" — see progress-map.mjs's
      // node-downgraded mapping), the downgrade was already recorded and nothing has redispatched
      // it since, so appending again would just be a duplicate claim.
      const existing = findById(buildTree(effortRoot), id);
      const alreadyRecorded = existing
        && existing.node.status === 'failed'
        && existing.node.detail === 'lost-work crash';
      if (!alreadyRecorded) {
        const ledgerResult = append(effortRoot, { type: 'node-downgraded', workOrder: id, kind: 'work-order' }, { regen: true });
        if (!ledgerResult.ok) {
          notes.push(`WO ${id}: node-downgraded ledger event not recorded (${ledgerResult.error}) — no tree node for this order yet, non-fatal.`);
        }
      }
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

  // --- Ledger-fold work orders ABSENT from the journal (the invisible-WO incident, §5.1). ---
  // A WO that lives in ledger.jsonl (dispatched, maybe with a live worktree) but never made it into
  // journal.workOrders was INVISIBLE to the old journal-only derivation. The ledger is the source, so
  // surface every such WO with its fold status instead of dropping it. This never halts (the work is
  // safe in the ledger + git); it makes the omission loud so the human/route-planner can re-register it.
  for (const [id, st] of woFold) {
    if (Object.hasOwn(workOrders, id)) continue;
    resolved.push({ kind: 'ledger-only-wo', workOrder: id, status: st.status, class: 'SAFE-DEFAULT' });
    notes.push(`WO ${id}: present in the ledger fold as '${st.status}' but ABSENT from journal.workOrders → SURFACED (ledger is the source; the journal never recorded it).`);
  }

  // --- Orphan worktrees: on disk but not in the journal registry. -----------
  for (const wt of lanesOnDisk) {
    const wtAbs = laneAbs(effortRoot, wt);
    const effAbs = norm(resolve(effortRoot));
    // underPath tolerates a drive-letter case mismatch (Windows); the slice length is unaffected
    // by case, so it still trims the effort-root prefix correctly.
    const rel = wtAbs && underPath(effAbs, wtAbs) ? wtAbs.slice(effAbs.length + 1) : (wtAbs || '');
    // Compare on the canonical ABSOLUTE path: a journal lane key / wo.worktree may be stored
    // relative OR absolute-with-native-separators, and join() mangles the absolute form (so a
    // present lane would read as an orphan / "no worktree"). laneAbs normalizes both shapes;
    // samePath additionally tolerates a Windows drive-letter case mismatch.
    const known = Object.keys(journalLanes).some((l) => samePath(laneAbs(effortRoot, l), wtAbs)) ||
      Object.values(workOrders).some((w) => samePath(laneAbs(effortRoot, w.worktree), wtAbs));
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
      const woFoldState = woFold.get(woId);
      // If the WO was LIVE (per the same fold+registry predicate the per-WO loop uses), that loop above
      // already handled it (downgrade / reclaim); here we only record the orphan note. Otherwise its
      // lane is stale (SAFE-DEFAULT downgrade to pending). We never re-claim here — re-claim requires a
      // present registered lane.
      if (wo && isLive(wo, woFoldState ? woFoldState.status : null)) {
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
  // Tier (full|lite): the effort-default ceremony depth, carried into the briefing so the
  // main session resolves each slice's effective tier (slice.tier ?? config.tier). Unlike
  // runMode, an absent/invalid tier does NOT halt — it defaults to `full`, the safe direction
  // (more verification), backward-compatible with efforts that predate the field. Only the
  // audit depth flexes on tier; no guard is waivable by it.
  const tier = cfg.tier === 'lite' ? 'lite' : 'full';
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

  // --- Born-state: reconstruct-or-HALT (S7, §6.1). -------------------------------------------
  // The runMode-absent bucket above catches a CORRUPT config only INCIDENTALLY. A MISSING-SIGNATURE
  // config — parses, carries a runMode, but has no `config.effort` birth signature — sails PAST that
  // gate yet is not, on its face, a config recovery can identify. But a SINGLE unfinished effort is
  // still UNAMBIGUOUSLY identifiable: its real name lives in `journal.effort` (a pre-signature effort
  // simply predates the field). So RECONSTRUCT the pointer automatically from journal.effort and
  // proceed — never bother a human for a recovery a machine can do deterministically. HALT only when
  // the config is genuinely unidentifiable (missing-signature AND no recoverable name) or `corrupt`
  // (cannot be read to heal). `absent` cannot reach here; `ok` never trips it.
  const birth = effortBirthState(effortRoot);
  if (birth.state === 'missing-signature') {
    const recon = reconstructBirthSignature(effortRoot);
    if (recon.reconstructed) {
      notes.push(`config.json predated the birth signature — reconstructed "effort":"${recon.effort}" from journal.effort (one-time automatic migration). Proceeding.`);
    } else {
      const fix = `add the effort name — "effort": "<name>" — to .reasonable/config.json (no recoverable name in journal.effort either)`;
      ambiguities.push({
        haltReason: `.reasonable/config.json is missing its birth signature and no name is recoverable from journal.effort — recovery cannot identify this config. Fix: ${fix}.`,
        evidence: { effortBirthState: 'missing-signature', reason: null },
      });
      notes.push(`config.json birth-state 'missing-signature' (no recoverable name) → AMBIGUOUS. Fix: ${fix}.`);
    }
  } else if (birth.state === 'corrupt') {
    const fix = `repair the unparseable .reasonable/config.json (${birth.reason ?? 'JSON parse error'})`;
    ambiguities.push({
      haltReason: `.reasonable/config.json is unparseable — recovery cannot trust it. Fix: ${fix}.`,
      evidence: { effortBirthState: 'corrupt', reason: birth.reason ?? null },
    });
    notes.push(`config.json birth-state 'corrupt' → AMBIGUOUS. Fix: ${fix}.`);
  }

  // --- Lane-base validation (branch hygiene) — a SURFACED inconsistency, not a HALT. ---
  // Every live lane must descend from the effort branch (it should have been cut from it).
  // A lane that does not is a build-on-stale: it was cut from the wrong base (e.g. master,
  // missing an earlier slice) and would integrate stale code. Its work is intact in git, so
  // this surfaces (briefing + note) for a re-base/re-cut — it never silently builds on stale.
  const liveLanes = Object.entries(workOrders)
    .filter(([id, wo]) => wo.branch && isLive(wo, (woFold.get(id) || {}).status ?? null))
    .map(([id, wo]) => ({ workOrder: id, branch: wo.branch }));
  const laneBases = validateLaneBases(effortRoot, cfg.effortBranch, liveLanes);
  for (const off of laneBases.offBase) {
    notes.push(`Lane ${off.workOrder} (${off.branch}) does NOT descend from the effort branch ${cfg.effortBranch} → SURFACED build-on-stale (cut from the wrong base; re-base/re-cut it before merge — never integrate stale).`);
  }

  // --- Terminal work orders (already merged) — a mechanical fact, never an --
  // --- LLM's judgment call (the graph-editor-ux-overhaul incident). ---------
  // A merged work order is DONE, permanently: its code already landed on the
  // effort branch, so there is no scenario where re-running its whole
  // provision→implement→verify pipeline is correct. This is NOT the same as
  // `dead-end` (an infeasibility verdict), which CAN un-bind once an input
  // changes — that stays redispatch-guard.mjs's job.
  //
  // T0.4: the AUTHORITATIVE terminal signal is now the ledger fold's `done`. The
  // merge membrane act appends node-completed the instant a lane lands on the
  // effort branch (skills/vertical-slice-execution/SKILL.md §7), which folds to
  // `done`. The `merged` flag is kept as a write-once lane/terminal fact (like
  // `mergedCommits`; it never drifts as the churning `status` did) — it covers
  // the `merged:true` shape the orchestrator writes before its node-completed
  // lands. The retired `status:"merged"` is no longer read. Conservative by
  // construction: over-approximating the never-re-dispatch set is safe.
  const terminalWorkOrders = Object.entries(workOrders)
    .filter(([id, wo]) => wo && (((woFold.get(id) || {}).status === 'done') || wo.merged === true))
    .map(([id]) => id);

  // --- Dead-end set (retirement) — from the ledger event stream. -------------
  // Refutation-surviving infeasibility verdicts (lib/dead-ends.mjs), minus ids
  // already merged (a terminal WO's dead-end history is moot). The briefing
  // carries this so the Bash-less thin route-planner SEES every crater when it
  // replans: a dead-ended id is RETIRED — never re-proposed in-band; successor
  // work arrives under a NEW id via a replan that consumed the dead-end
  // (docs/roadmap/dead-end-blast-radius.md). Conservative: a later green verdict
  // never clears an entry here — only the merge subtraction above does.
  const deadEnds = deadEndSet(ledger).filter((d) => !terminalWorkOrders.includes(d.workOrder));

  // --- Blocked work orders (open node-failed) — the resolvesSeq closure fold (§5.6, F12). ----
  // A WO whose ledger fold reads `blocked` carries a node-failed with NO later ratification/amendment
  // whose `resolvesSeq` names that failure's own seq. reconcile consumes the fold's `blocked` verbatim
  // — the fold (lib/wo-status.mjs) is the SINGLE source of that closure rule; reconcile never re-scans
  // for a coincidental id mention. Such a WO is OPEN: it needs a human decision (a ratified redispatch
  // that reopens it, or an amendment that drops it) and must never be silently downgraded (isLive
  // already excludes `blocked` from crash recovery). Surface each so the briefing shows the open wall;
  // a later matching `resolvesSeq` folds it to pending and it drops out of this set (closed).
  //
  // EXCLUDE terminals AND dead-ends. A dead-end ceremony emits BOTH a WO-addressed node-failed (→ fold
  // `blocked`) and a `dead-end` event (→ deadEnds above). Such a WO is RETIRED, not "decide: ratify a
  // redispatch or drop" — the redispatch-guard's dead-end binding blocks it. Surfacing it here too
  // would print two contradictory briefing lines; the deadEnds line is the correct one, so a dead-ended
  // WO is dropped from this set (like the terminal exclusion).
  const deadEndIds = new Set(deadEnds.map((d) => d.workOrder));
  const blockedWorkOrders = [];
  for (const [id, st] of woFold) {
    if (st.status !== 'blocked' || terminalWorkOrders.includes(id) || deadEndIds.has(id)) continue;
    blockedWorkOrders.push({ workOrder: id, blockedBy: st.blockedBy ?? null });
    notes.push(`WO ${id}: node-failed at seq ${st.blockedBy} is unresolved (no ratification/amendment resolvesSeq closes it) → BLOCKED (needs a human decision; a later matching resolvesSeq closes it).`);
  }

  // --- Trust-staleness set (D13) — from the ledger event stream. ------------
  // The rich set (staleTests with clause provenance) drives the briefing render; the
  // DERIVED flat id list (staleTrusted) is what the BRIEFING schema carries and the
  // reconciler copies VERBATIM — like terminalWorkOrders, a mechanical fact, never an
  // agent's prose re-derivation. dedup preserves first-seen order.
  const staleness = trustStaleness(ledger);
  const staleTrusted = [...new Set(staleness.staleTests.map((t) => t.test))];

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

  // --- Lifecycle state (§6.5, F10) — the BORN-effort state this live `.reasonable/` is in. ----------
  // reconcile only ever runs on a LIVE `.reasonable/`, so it classifies the born states; the dir-name
  // states (concluded/abandoned/stray) are the multi-effort SCAN's job (T1.5). Deterministic predicates,
  // CHEAPEST SIGNAL FIRST. T2.2 consumes `lifecycle` to project nextAction — reconcile does NOT.
  //
  //   'active'         — the frontier still has open work: any known WO not `done`, OR nothing planned
  //                      yet (an early effort still building has nothing to land). No git needed.
  //   'at-land-gate'   — frontier empty AND the effort branch is NOT yet landed to base → NEXT = LAND.
  //   'half-concluded' — frontier empty AND the effort branch IS landed to base, still a live
  //                      `.reasonable/` (no `.done-*` archive) → NEXT = CONCLUDE.
  //
  // "landed" ⟺ base CONTAINS the effort branch's work ⟺ the effort branch is an ANCESTOR of base
  // (branch.mjs `descendsFrom(root, effortBranch, base)` = `git merge-base --is-ancestor <effortBranch>
  // <base>`) — which is exactly what a real `effortBranch → baseBranch` merge yields. This is the meaning
  // interfaces.md fixes with "work not yet landed to base" / "effortBranch descends base"; note its
  // parenthetical git example transposed the two args — the SEMANTIC (base contains the effort branch ⟺
  // landed ⟺ half-concluded) governs. The "open work" signal is the state reconcile ALREADY derives (the
  // per-WO status map + the ledger fold), never a new artifact.
  const journalWoStatuses = Object.values(workOrderStatuses);
  const ledgerOnlyStatuses = [];
  for (const [id, st] of woFold) if (!Object.hasOwn(workOrders, id)) ledgerOnlyStatuses.push(st.status);
  const allWoStatuses = [...journalWoStatuses, ...ledgerOnlyStatuses];
  const frontierOpen = allWoStatuses.length === 0 || allWoStatuses.some((s) => s !== 'done');
  let lifecycle;
  if (frontierOpen) {
    lifecycle = 'active';
  } else {
    // Frontier empty. LAND vs CONCLUDE turns on git ancestry. With no effort/base branch configured
    // (bare-HEAD back-compat effort) we cannot tell → default to the SAFE direction `at-land-gate`
    // (suggest LAND, never a premature CONCLUDE).
    const landed = cfg.effortBranch && cfg.baseBranch
      ? descendsFrom(effortRoot, cfg.effortBranch, cfg.baseBranch)
      : false;
    lifecycle = landed ? 'half-concluded' : 'at-land-gate';
  }

  const halt = ambiguities.length > 0 || floorBreachStop;
  // Hoisted so the nextAction projection and the halt-detail block below share ONE reason string
  // (behavior-identical to the former inline `reasons.join('; ')`). The floor STOP reason is a
  // single source so it can never drift between the projection detail and the surfaced evidence.
  const floorStopReason = floorBreachStop
    ? `unexplained floor-integrity breach in autonomous mode (${floorUnexplained} surfaced diff(s) with no accept verdict) — STOP (D13)`
    : null;
  const haltReasonStr = halt
    ? [...ambiguities.map((a) => a.haltReason), ...(floorStopReason ? [floorStopReason] : [])].join('; ')
    : null;

  // --- Layer 2: the deterministic decision projection (nextAction) — §7.3, §7.1. -----------------
  // Everything the pure projection needs is settled by now (workOrderStatuses / terminalWorkOrders /
  // blockedWorkOrders / lifecycle / halt / ambiguities / openInbox). reconcile does the messy READS
  // here (route.json, each WO spec, the progress tree for the canceled flag) and hands
  // projectDirectives a pre-digested `state` so that function stays pure and table-testable. This
  // task stops at the in-memory `result.nextAction`; persisting a `next-action` ledger event + the
  // mirror render is T2.3, and the adversarial self-check (redispatch-guard / drop / dead-end
  // exclusions) is T2.4 — NEITHER is done here.
  //
  // (1) route.json — the ratified vertical-slice ORDER (readRoute is conservative: absent → null, a
  //     broken file → a surfaced diagnostic, never a crash). A present diagnostic degrades the
  //     frontier (nextAction omits slice ordering / RETRO / OPEN); it never halts reconcile.
  const routeRes = readRoute(effortRoot);
  const routeOrder = routeRes.route ? routeRes.route.slices : null;
  if (routeRes.diagnostic) {
    notes.push(`route.json degraded (${routeRes.diagnostic}) → nextAction omits slice ordering (RETRO/OPEN suppressed); WO-level directives + LAND/CONCLUDE unaffected.`);
  }

  // (2) The canceled-terminal flag comes from the progress TREE, not the fold: node-canceled folds to
  //     the inert `pending` (wo-status.mjs) and cannot distinguish a deliberately-canceled WO from a
  //     fresh one, whereas buildTree maps node-canceled → a `canceled` node status. One fresh fold of
  //     the (possibly just-appended) ledger.
  const nextTree = buildTree(effortRoot);
  const blockedIds = new Set(blockedWorkOrders.map((b) => b.workOrder));
  const terminalIds = new Set(terminalWorkOrders);

  // (3) Enrich each KNOWN WO (journal registry ∪ ledger-only) with dependsOn + verticalSlice from its
  //     SPEC — the journal registry does NOT carry them. A missing/legacy spec degrades: dependsOn:[]
  //     and slice falls back to the journal's current vertical slice (forward-compat; a pre-route /
  //     pre-dependsOn effort must still reconcile).
  const woIdUniverse = new Set([...Object.keys(workOrders), ...[...woFold.keys()]]);
  const projWorkOrders = [];
  for (const id of woIdUniverse) {
    const spec = readJson(join(R, 'work-orders', `${id}.json`));
    const dependsOn = spec && Array.isArray(spec.dependsOn)
      ? spec.dependsOn.filter((d) => typeof d === 'string' && d) : [];
    const slice = spec && typeof spec.verticalSlice === 'string' && spec.verticalSlice
      ? spec.verticalSlice
      : (journal.currentVerticalSlice ?? null);
    if (!spec) {
      notes.push(`WO ${id}: no work-order spec on disk (.reasonable/work-orders/${id}.json) → dependsOn defaulted [], slice fell back to '${slice ?? 'null'}' (forward-compat).`);
    }
    const status = Object.hasOwn(workOrderStatuses, id)
      ? workOrderStatuses[id]
      : ((woFold.get(id) || {}).status || 'pending');
    const found = findById(nextTree, id);
    const canceled = !!(found && found.node.status === 'canceled');
    projWorkOrders.push({
      id,
      slice,
      status,
      dependsOn,
      terminal: terminalIds.has(id) || status === 'dropped' || canceled,
      blocked: blockedIds.has(id),
      canceled,
      running: status === 'running',
    });
  }

  // (4) Per-slice digest, ordered by routeOrder. retroDone is DERIVED FROM JOURNAL POSITION — there is
  //     no clean per-slice retro-done ledger event. PINNED RULE: a slice is retro-passed IFF it sits
  //     STRICTLY BEFORE `journal.currentVerticalSlice` in routeOrder (the orchestrator only advances
  //     the current slice PAST a slice once that slice's retro gate has passed; the current slice is
  //     never retro-done while it is current). When the current slice cannot be positioned in
  //     routeOrder (no route.json, or current absent from it) the retro semantics are UNDERIVABLE, so
  //     we emit `slices: []` and the projection OMITS RETRO/OPEN rather than guess — the high-value
  //     WO-level directives + LAND/CONCLUDE are unaffected.
  const statusById = new Map(projWorkOrders.map((w) => [w.id, w.status]));
  const bySlice = new Map();
  for (const w of projWorkOrders) {
    if (!w.slice) continue;
    if (!bySlice.has(w.slice)) bySlice.set(w.slice, []);
    bySlice.get(w.slice).push(w.id);
  }
  const sliceOrder = Array.isArray(routeOrder) ? routeOrder : [];
  const curIdx = sliceOrder.indexOf(journal.currentVerticalSlice ?? null);
  const projSlices = curIdx >= 0
    ? sliceOrder.map((sid, i) => {
      const woIds = bySlice.get(sid) || [];
      return {
        id: sid,
        woIds,
        allDone: woIds.length > 0 && woIds.every((x) => statusById.get(x) === 'done'),
        retroDone: i < curIdx,
      };
    })
    : [];

  // (5) Assemble the pure `state`, project, attach in memory. No ledger append, no render — T2.3.
  const nextAction = projectDirectives({
    halt,
    haltReason: haltReasonStr,
    ambiguities,
    openInbox,
    lifecycle,
    routeOrder,
    workOrders: projWorkOrders,
    slices: projSlices,
  });

  const result = {
    active: true,
    effort: journal.effort,
    currentVerticalSlice: journal.currentVerticalSlice,
    phase: journal.phase,
    supervision: journal.supervision,
    runMode,
    tier,
    // The BORN-effort lifecycle state (§6.5, F10): active | at-land-gate | half-concluded. Consumed by
    // the briefing (T1.5) and nextAction (T2.2); reconcile classifies, it does not project the action.
    lifecycle,
    // The deterministic decision projection (§7.3) — an ordered SET of directives projected from the
    // reconstructed state (in-memory only; T2.3 persists + renders it, T2.4 gates it through the self-check).
    nextAction,
    // Branch hygiene: the dedicated integration branch lanes are cut from / merged into,
    // and the base ref written only at effort end. Null on an effort that predates this.
    effortBranch: cfg.effortBranch || null,
    baseBranch: cfg.baseBranch || null,
    laneBaseIssues: laneBases.offBase,
    workOrders,
    // Derived per-WO status (fold-sourced; T0.4 retired the journal `status` field). The briefing
    // renders its by-status summary from this — never from a journal field that no longer exists.
    workOrderStatuses,
    terminalWorkOrders,
    deadEnds,
    // Open blocking failures (fold `blocked`, the resolvesSeq closure fold, §5.6) — each an OPEN wall
    // a human must decide (ratify a redispatch or drop it); a matching resolvesSeq closes it.
    blockedWorkOrders,
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
    // The BRIEFING carries the flat id list (schema: staleTrusted: string[]); the reconciler
    // copies it verbatim. The rich `staleness` object stays for the briefing() render below.
    staleTrusted,
    openInbox,
    halt,
  };
  if (halt) {
    const evidence = ambiguities.slice();
    if (floorBreachStop) {
      // D13: the unexplained-breach STOP is a halt class WITHOUT a first-line
      // AMBIGUOUS entry (the diff is a surfaced backstop, not an unsettleable
      // recovery). Carry its own reason + evidence so the briefing names it. The
      // reason string itself is the hoisted `floorStopReason` (one source of truth).
      evidence.push({
        haltReason: floorStopReason,
        haltClass: 'floor-integrity-unexplained',
        evidence: { unexplained: floorUnexplained, backstop: floorBackstopItems.filter((i) => i.unexplained) },
      });
    }
    result.haltReason = haltReasonStr;
    result.evidence = evidence;
  }

  // --- The output self-check (§7.4, T2.4): refute the projection BEFORE it is persisted. ----------
  // The projection PROPOSES; this mechanical adversary REFUTES a directive that would resurrect a
  // drop-authoritative / dead-ended WO (the redispatch-guard's domain), OPEN a retired slice, or LAND
  // over a non-empty frontier — replacing it with a DECIDE (which never auto-executes → escalates in
  // both run modes). `guardBlocked` is computed with the SAME predicate the guard CLI uses
  // (`redispatchBlock`), so the projection can never disagree with the guard. Only the WOs a
  // DISPATCH/RUNNING actually names are checked (cheap). (Correction F: node-downgraded is NOT refused —
  // a downgraded WO is the D19 legitimate reopen; the guard never binds it, so it is simply not blocked.)
  const guardBlocked = {};
  const checkIds = new Set();
  for (const d of result.nextAction) {
    if ((d.kind === 'DISPATCH' || d.kind === 'RUNNING') && Array.isArray(d.workOrders)) {
      for (const id of d.workOrders) checkIds.add(id);
    }
  }
  for (const id of checkIds) {
    // Evaluate the guard even when the spec FILE is absent: the amendment-drop binding is ledger+id only,
    // and the DROP is authoritative OVER file existence (§7.4 / S12) — a dropped WO re-dispatched into a
    // live fold state (wo-status folds a post-drop node-dispatched back to `running`) must still be
    // refused, spec deleted or not. A spec-less hash is sha256('') and cannot match a real dead-end
    // verdict's hash, so the dead-end path never false-positives on a missing spec.
    const spec = readJson(join(R, 'work-orders', `${id}.json`)) || {};
    const block = redispatchBlock(ledger, { ...spec, id }, (w) => hashWorkOrder(effortRoot, w));
    if (block.blocked) guardBlocked[id] = { reason: block.reason };
  }
  const selfChecked = selfCheckDirectives(result.nextAction, {
    guardBlocked,
    routeSlices: Array.isArray(routeOrder) ? routeOrder : [],
    frontierNonEmpty: frontierOpen,
  });
  result.nextAction = selfChecked.directives;
  for (const ref of selfChecked.refusals) {
    notes.push(`self-check refused ${ref.directive.kind} — ${ref.reason}`);
  }

  // --- Persist the projection as a `next-action` ledger event (§7.1, Layer 2). --------------------
  // reconcile now appends ONE next-action event PER CALL — a deliberate behavior change (it was
  // write-only-on-crash-recovery before). The projection is a RECORDED event, exactly like the
  // verdicts the ledger already carries: living in the truth log (never a field poked into
  // progress.json) is what lets it survive the wholesale mirror regen. `regen: true` is what triggers
  // the mirror render (progress-map re-derives the latest such event into progress.json.nextAction +
  // the ▶ NEXT block). Re-read the ledger's CURRENT latest seq FRESH — the in-scope `ledger` array is
  // stale after reconcile's own node-downgraded appends above. An empty ledger has no 1-based seq, so
  // computedFrom is OMITTED (the validator requires a positive integer when present; the render then
  // reads "computed at seq 0"). A mirror-only failure is advisory (fail-open) — never fatal to
  // recovery, so `!ok` is just another note alongside the facts already recorded.
  const ledgerPath = join(R, 'ledger.jsonl');
  const freshLedger = readJsonl(ledgerPath);
  const latestSeq = freshLedger.reduce((m, e) => Math.max(m, Number(e && e.seq) || 0), 0);
  const nextActionEvent = { type: 'next-action', directives: result.nextAction };
  if (latestSeq > 0) nextActionEvent.computedFrom = latestSeq;
  const naResult = append(effortRoot, nextActionEvent, { regen: true });
  if (!naResult.ok) {
    notes.push(`next-action projection not persisted (${naResult.error}) — the mirror render is skipped, advisory only (§7.1).`);
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

// Trust-staleness (D13) now lives in lib/trust-staleness.mjs — extracted so it has a
// home and a test (it was a private, untested function here). reconcile imports
// trustStaleness (top of file) and threads its result into the briefing; the derived
// flat staleTrusted id list (assembled in reconcile()) is what the reconciler copies
// verbatim, so no agent re-derives it in prose.

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
    .filter((p) => { const np = norm(resolve(p)); return !samePath(np, base) && underPath(base, np); });
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

// Human gloss for each BORN-effort lifecycle state (§6.5, F10). A factual restatement of the state's
// definition — NOT a computed nextAction (that is Layer 2 / T2.2, projected from `lifecycle`).
const LIFECYCLE_GLOSS = {
  active: 'the frontier still has open work',
  'at-land-gate': 'frontier empty; the effort branch is not yet landed to base',
  'half-concluded': 'landed to base; the .reasonable/ is still live (not yet concluded)',
};

/** Render a reconcile() result as a human briefing string. */
export function briefing(r) {
  if (!r.active) return '';
  const lines = [];
  lines.push(`**Reasonable briefing** — effort "${r.effort || '(unnamed)'}", vertical slice "${r.currentVerticalSlice || '?'}", phase ${r.phase || '?'}, run mode ${r.runMode || 'UNSET'}, tier ${r.tier || 'full'}, supervision ${r.supervision || 'standard'}.`);
  if (r.lifecycle) lines.push(`Lifecycle: **${r.lifecycle}** — ${LIFECYCLE_GLOSS[r.lifecycle] || 'born-effort state'}.`);
  // The persisted decision projection (§7.1, T2.2), rendered compactly beside the Lifecycle line. An
  // empty directive set → "NEXT: (idle)". The mechanical-staleness suffix lives in the mirror, not here.
  if (Array.isArray(r.nextAction)) lines.push(`NEXT: ${renderDirectives(r.nextAction)}`);
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
  // Fold-sourced statuses (T0.4: the journal no longer stores a per-WO `status`).
  for (const [id, status] of Object.entries(r.workOrderStatuses || {})) (byStatus[status] ||= []).push(id);
  lines.push(`Work orders: ${Object.entries(byStatus).map(([s, ids]) => `${ids.length} ${s}`).join(', ') || 'none'}.`);
  if (r.terminalWorkOrders && r.terminalWorkOrders.length) {
    lines.push(`Terminal (already merged, never re-dispatch): ${r.terminalWorkOrders.join(', ')}.`);
  }
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
  if (r.deadEnds && r.deadEnds.length) {
    lines.push(`Dead ends (RETIRED ids — replan around them, never re-propose): ${r.deadEnds.map((d) => `${d.workOrder} (seq ${d.ledgerSeq})`).join(', ')}.`);
  }
  if (r.blockedWorkOrders && r.blockedWorkOrders.length) {
    lines.push(`Blocked (open node-failed — decide: ratify a redispatch or drop): ${r.blockedWorkOrders.map((b) => `${b.workOrder} (seq ${b.blockedBy})`).join(', ')}.`);
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
