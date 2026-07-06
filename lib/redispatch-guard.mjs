// redispatch-guard.mjs — the insanity guard (DESIGN §5.8; §5.6 / F12). "Doing the
// same thing and expecting a different result" is the failure mode; this hook
// blocks re-dispatch of a work order that is still walled. It binds on TWO ledger
// shapes:
//   (1) a refutation-surviving dead-end / verdict(infeasible, survivedSkeptic) whose
//       `hash` still matches the WO's current inputs — a changed input (contract
//       amended, topology revised, new spike knowledge) un-binds it, and that always
//       changes the work-order hash. KEPT verbatim; dead-ends.mjs holds the identical
//       isBindingDeadEnd predicate in lockstep — do not desync them (Defect B).
//   (2) an UNRESOLVED amendment drop for the WO (amendment.drops[].workOrder === id) —
//       a deliberate supersession. A dropped WO STAYS dropped (the safe direction) until
//       a restoring ratification whose `resolvesSeq` equals the drop's own seq closes it,
//       NEVER a coincidental work-order-id mention.
//
// A node-failed does NOT bind. It is an UNDER-INVESTIGATION lifecycle event (D19: `failed
// ↻` is non-terminal — down, being investigated, retried as a new `name[k]` sibling), not
// an infeasibility verdict, so the WO must stay redispatchable. The only WO-addressed
// reason-bearing node-failed the pipeline emits is the dead-end ceremony's, and that is
// ALREADY covered by binding (1) with the correct input-changed escape — binding on it
// here would be both conceptually wrong AND redundant, and (since `resolvesSeq` has no
// real emitter) would WEDGE the WO forever, breaking the "blocked unless an input changed"
// contract the moment (1)'s hash cleared. See test/redispatch-guard.test.mjs ANTI-WEDGE.
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

// (1) The dead-end / verdict binding — KEPT verbatim (Defect B, in lockstep with dead-ends.mjs).
const deadEndBinding = ledger.filter((e) =>
  e.workOrder === id &&
  ((e.type === 'verdict' && e.kind === 'infeasible' && e.survivedSkeptic) || e.type === 'dead-end'));
const deadEndBlocker = deadEndBinding.find((e) => e.hash === currentHash);

// The resolvesSeq closure set: every seq closed by a later ratification/amendment. A drop at seq S is
// restored ONLY by resolvesSeq === S (never by a coincidental id mention).
const resolvedSeqs = new Set();
for (const e of ledger) {
  if (e && (e.type === 'ratification' || e.type === 'amendment') &&
      typeof e.resolvesSeq === 'number' && Number.isFinite(e.resolvesSeq)) {
    resolvedSeqs.add(e.resolvesSeq);
  }
}

// (2) An UNRESOLVED amendment drop for this WO — the structured, machine-foldable drop record (§5.6).
// LAST-WRITE-WINS, exactly like lib/wo-status.mjs's `dropped` fold: only the HIGHEST-seq drop of this
// WO governs, so `drop@2, drop@5, ratify resolvesSeq:5` is CLEAR (the latest drop is restored) even
// though the earlier drop@2 was never resolved. Scanning every drop (block if ANY is unresolved) would
// disagree with the fold; the guard conforms to the fold, not the other way round (it is frozen).
let latestDrop = null;
for (const e of ledger) {
  if (e && e.type === 'amendment' && Array.isArray(e.drops) &&
      e.drops.some((d) => d && d.workOrder === id)) {
    const seq = Number(e.seq) || 0;
    if (!latestDrop || seq >= latestDrop.seq) latestDrop = { seq, event: e };
  }
}
const droppingAmendment = (latestDrop && !resolvedSeqs.has(latestDrop.seq)) ? latestDrop.event : null;

if (deadEndBlocker) {
  console.error(`BLOCKED: work order ${id} has a refutation-surviving infeasibility verdict ` +
    `(ledger seq ${deadEndBlocker.seq}) and its inputs are unchanged (hash ${currentHash.slice(0, 16)}…).`);
  console.error(`Re-dispatching an identical work order repeats a confirmed dead end. Change an input first: ` +
    `amend a contract, revise topology, or attach new spike knowledge — that un-binds the verdict (and ` +
    `changes the hash). Verdict expiry notes are what un-bind old verdicts when dependencies upgrade.`);
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
  console.log(`Clear: no binding infeasibility verdict or amendment drop for ${id}.`);
}
process.exit(0);
