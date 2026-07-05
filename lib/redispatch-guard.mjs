// redispatch-guard.mjs — the insanity guard (DESIGN §5.8; §5.6 / F12). "Doing the
// same thing and expecting a different result" is the failure mode; this hook
// blocks re-dispatch of a work order that is still walled. It binds on THREE ledger
// shapes:
//   (1) a refutation-surviving dead-end / verdict(infeasible, survivedSkeptic) whose
//       `hash` still matches the WO's current inputs — a changed input (contract
//       amended, topology revised, new spike knowledge) un-binds it, and that always
//       changes the work-order hash. KEPT verbatim; dead-ends.mjs holds the identical
//       isBindingDeadEnd predicate in lockstep — do not desync them (Defect B).
//   (2) an UNRESOLVED blocking-class node-failed for the WO — the ordinary wall this
//       pipeline actually emits. "Blocking-class" = the node-failed carries a NON-EMPTY
//       `reason` (a reason-less node-failed is the schema's recoverable / "under
//       investigation" transient case and never binds).
//   (3) an UNRESOLVED amendment drop for the WO (amendment.drops[].workOrder === id).
// Closure of (2)/(3) is by `resolvesSeq` — the SAME rule lib/wo-status.mjs's
// blocked/dropped fold uses: a later ratification/amendment whose resolvesSeq equals
// the blocking event's own seq closes it, NEVER a coincidental work-order-id mention.
//
// Usage: node redispatch-guard.mjs <wo-id>   (exit 2 = blocked, 0 = clear)

import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { findEffortRoot, rootFromArgv, argvWithoutRoot, readJson, readJsonl } from './effort.mjs';

const id = argvWithoutRoot(process.argv)[2];
if (!id) { console.error('usage: redispatch-guard.mjs <wo-id> [--root <effortRoot>]'); process.exit(2); }

const effortRoot = rootFromArgv(process.argv, process.cwd());
if (!effortRoot) { console.error('No effort found.'); process.exit(2); }
const R = join(effortRoot, '.reasonable');

const wo = readJson(join(R, 'work-orders', `${id}.json`));
if (!wo) { console.error(`No work order ${id}.`); process.exit(2); }

/** Stable hash of the inputs that define the work: spec + contract texts + gate. */
function hashWorkOrder(wo) {
  const h = createHash('sha256');
  const read = (rel) => { const p = join(effortRoot, '.reasonable', rel); return existsSync(p) ? readFileSync(p, 'utf8') : ''; };
  h.update(wo.gate || '');
  if (wo.inputs?.spec) h.update(read(wo.inputs.spec));
  for (const c of wo.inputs?.contracts || wo.contracts || []) h.update(read(join('contracts', `${c}.md`)));
  return 'sha256:' + h.digest('hex');
}

const currentHash = hashWorkOrder(wo);
const ledger = readJsonl(join(R, 'ledger.jsonl'));

// The bare work-order id an event addresses — bare `workOrder` wins, else the base node path's last
// segment ([k] attempt marker stripped). Mirrors lib/wo-status.mjs's woIdOf (unexported; the fold is
// frozen), so the guard keys the SAME id space the blocked/dropped fold does — a node-failed stamped
// only with `node: 'slice/WO-12'` still binds WO-12.
function woIdOf(e) {
  if (typeof e.workOrder === 'string' && e.workOrder) return e.workOrder;
  if (typeof e.node === 'string' && e.node) {
    const base = e.node.replace(/\[\d+\]$/, '');
    const i = base.lastIndexOf('/');
    return i < 0 ? base : base.slice(i + 1);
  }
  return null;
}

// (1) The dead-end / verdict binding — KEPT verbatim (Defect B, in lockstep with dead-ends.mjs).
const deadEndBinding = ledger.filter((e) =>
  e.workOrder === id &&
  ((e.type === 'verdict' && e.kind === 'infeasible' && e.survivedSkeptic) || e.type === 'dead-end'));
const deadEndBlocker = deadEndBinding.find((e) => e.hash === currentHash);

// The resolvesSeq closure set: every seq closed by a later ratification/amendment. A blocking event
// at seq S is closed ONLY by resolvesSeq === S (never by a coincidental id mention) — the same rule
// lib/wo-status.mjs's `blocked`/`dropped` fold applies.
const resolvedSeqs = new Set();
for (const e of ledger) {
  if (e && (e.type === 'ratification' || e.type === 'amendment') &&
      typeof e.resolvesSeq === 'number' && Number.isFinite(e.resolvesSeq)) {
    resolvedSeqs.add(e.resolvesSeq);
  }
}

// (2) An UNRESOLVED blocking-class node-failed for this WO (blocking-class = carries a non-empty reason).
const blockingFailure = ledger.find((e) =>
  e && e.type === 'node-failed' && woIdOf(e) === id &&
  typeof e.reason === 'string' && e.reason.length > 0 &&
  !resolvedSeqs.has(Number(e.seq)));

// (3) An UNRESOLVED amendment drop for this WO — the structured, machine-foldable drop record (§5.6).
const droppingAmendment = ledger.find((e) =>
  e && e.type === 'amendment' && Array.isArray(e.drops) &&
  e.drops.some((d) => d && d.workOrder === id) &&
  !resolvedSeqs.has(Number(e.seq)));

if (deadEndBlocker) {
  console.error(`BLOCKED: work order ${id} has a refutation-surviving infeasibility verdict ` +
    `(ledger seq ${deadEndBlocker.seq}) and its inputs are unchanged (hash ${currentHash.slice(0, 16)}…).`);
  console.error(`Re-dispatching an identical work order repeats a confirmed dead end. Change an input first: ` +
    `amend a contract, revise topology, or attach new spike knowledge — that un-binds the verdict (and ` +
    `changes the hash). Verdict expiry notes are what un-bind old verdicts when dependencies upgrade.`);
  process.exit(2);
}

if (blockingFailure) {
  console.error(`BLOCKED: work order ${id} has an unresolved blocking failure (ledger seq ${blockingFailure.seq}: ` +
    `"${blockingFailure.reason}") with no later ratification/amendment closing it.`);
  console.error(`Re-dispatching a work order still at a wall repeats it. Close the failure first — a ratified ` +
    `redispatch or an amendment carrying resolvesSeq:${blockingFailure.seq} un-blocks it (never a coincidental id mention).`);
  process.exit(2);
}

if (droppingAmendment) {
  const drop = droppingAmendment.drops.find((d) => d && d.workOrder === id);
  console.error(`BLOCKED: work order ${id} was dropped by an amendment (ledger seq ${droppingAmendment.seq}` +
    `${drop && drop.supersededBy ? `, superseded by ${drop.supersededBy}` : ''}) with no later restoring ratification.`);
  console.error(`A dropped work order is retired — its successor arrives under a NEW id via a replan that consumed ` +
    `the drop, never a re-dispatch of this id (a restoring ratification carrying resolvesSeq:${droppingAmendment.seq} un-drops it).`);
  process.exit(2);
}

if (deadEndBinding.length) {
  console.log(`Clear: ${id} had an infeasibility verdict, but inputs changed (hash now ${currentHash.slice(0, 16)}…). ` +
    `Re-dispatch permitted.`);
} else {
  console.log(`Clear: no binding verdict, blocking failure, or drop for ${id}.`);
}
process.exit(0);
