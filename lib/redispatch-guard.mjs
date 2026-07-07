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
// T2.4 (§7.4): the blocking PREDICATE is extracted into the pure, exported `redispatchBlock`
// so the projection's output self-check reuses the SAME logic (never a duplicate — the guard
// is load-bearing, hash-gated). This CLI is now a THIN wrapper over it: read wo + ledger,
// compute the input hash, call `redispatchBlock`, map `{blocked}` → the same exit codes /
// messages. reconcile.mjs (lib/next-action.mjs `selfCheckDirectives`) calls the SAME predicate
// to refuse a DISPATCH/RUNNING that would resurrect a drop-authoritative / dead-ended WO (S12).
//
// Usage: node redispatch-guard.mjs <wo-id>   (exit 2 = blocked, 0 = clear)

import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { rootFromArgv, argvWithoutRoot, readJson, readJsonl } from './effort.mjs';
import { deadEndSet } from './dead-ends.mjs';

/**
 * Stable hash of the inputs that define the work: spec + contract texts + gate.
 * The ONLY I/O in the guard's logic — kept at the caller boundary (it needs the effort root
 * to resolve the spec/contract file paths) so `redispatchBlock` below stays pure. Behavior is
 * verbatim the former inline `hashWorkOrder`, so a dead-end verdict's stored `hash` still matches.
 * @param {string} effortRoot  absolute effort root (parent of `.reasonable/`)
 * @param {object} wo          the work-order SPEC object
 * @returns {string} `sha256:<hex>`
 */
export function hashWorkOrder(effortRoot, wo) {
  const h = createHash('sha256');
  const w = wo || {};
  const read = (rel) => { const p = join(effortRoot, '.reasonable', rel); return existsSync(p) ? readFileSync(p, 'utf8') : ''; };
  h.update(w.gate || '');
  if (w.inputs?.spec) h.update(read(w.inputs.spec));
  for (const c of w.inputs?.contracts || w.contracts || []) h.update(read(join('contracts', `${c}.md`)));
  return 'sha256:' + h.digest('hex');
}

/**
 * The redispatch-guard's blocking predicate — PURE (no fs / git / Date; all I/O is the injected
 * `computeHash`). Extracted so the projection's output self-check (T2.4, §7.4) reuses the SAME logic
 * as the CLI guard, never a divergent copy of the hash-gated dead-end binding + the amendment-drop fold.
 *
 * @param {object[]} ledger       parsed ledger events (any order)
 * @param {object}   wo           the work-order SPEC object; its id is taken from `wo.id` (callers
 *                                 attach it — a bare spec on disk carries no id) and it is passed to
 *                                 `computeHash`
 * @param {(wo:object)=>string} computeHash  computes the WO's current input hash (the one I/O; the CLI
 *                                 and reconcile both close it over the effort root via `hashWorkOrder`)
 * @returns {{blocked:boolean, kind?:'dead-end'|'amendment-drop', reason?:string, seq?:number}}
 *          blocked=false ⇒ clear (kind/reason/seq omitted).
 *
 * Deliberately does NOT bind on `node-failed` (Correction E, T0.5) nor `node-downgraded` (Correction F,
 * T2.4): a downgraded WO is the D19 legitimate reopen mechanism — refusing it would wedge crash recovery.
 */
export function redispatchBlock(ledger, wo, computeHash) {
  const events = Array.isArray(ledger) ? ledger : [];
  const id = wo && (wo.id ?? wo.workOrder);
  const currentHash = computeHash(wo);

  // (1) The dead-end / verdict binding — KEPT verbatim (Defect B, in lockstep with dead-ends.mjs).
  const deadEndBinding = events.filter((e) =>
    e && e.workOrder === id &&
    ((e.type === 'verdict' && e.kind === 'infeasible' && e.survivedSkeptic) || e.type === 'dead-end'));
  const deadEndBlocker = deadEndBinding.find((e) => e.hash === currentHash);

  // The resolvesSeq closure set: every seq closed by a later ratification/amendment. A drop at seq S is
  // restored ONLY by resolvesSeq === S (never by a coincidental id mention).
  const resolvedSeqs = new Set();
  for (const e of events) {
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
  for (const e of events) {
    if (e && e.type === 'amendment' && Array.isArray(e.drops) &&
        e.drops.some((d) => d && d.workOrder === id)) {
      const seq = Number(e.seq) || 0;
      if (!latestDrop || seq >= latestDrop.seq) latestDrop = { seq, event: e };
    }
  }
  const droppingAmendment = (latestDrop && !resolvedSeqs.has(latestDrop.seq)) ? latestDrop.event : null;

  if (deadEndBlocker) {
    const seq = Number(deadEndBlocker.seq) || 0;
    return {
      blocked: true,
      kind: 'dead-end',
      seq,
      reason: `a refutation-surviving infeasibility verdict (ledger seq ${seq}) with unchanged inputs (hash ${currentHash.slice(0, 16)}…) — re-dispatch repeats a confirmed dead end`,
    };
  }
  if (droppingAmendment) {
    const seq = Number(droppingAmendment.seq) || 0;
    const drop = droppingAmendment.drops.find((d) => d && d.workOrder === id);
    return {
      blocked: true,
      kind: 'amendment-drop',
      seq,
      reason: `dropped by an unresolved amendment (ledger seq ${seq}${drop && drop.supersededBy ? `, superseded by ${drop.supersededBy}` : ''}) — a dropped work order is retired`,
    };
  }
  return { blocked: false };
}

// CLI — exact basename so importing `redispatchBlock` / `hashWorkOrder` from reconcile.mjs
// does NOT trip this block (cross-platform; an endsWith match is over-broad).
if (basename(process.argv[1] || '') === 'redispatch-guard.mjs') {
  const id = argvWithoutRoot(process.argv)[2];
  if (!id) { console.error('usage: redispatch-guard.mjs <wo-id> [--root <effortRoot>]'); process.exit(2); }

  const effortRoot = rootFromArgv(process.argv, process.cwd());
  if (!effortRoot) { console.error('No effort found.'); process.exit(2); }
  const R = join(effortRoot, '.reasonable');

  const wo = readJson(join(R, 'work-orders', `${id}.json`));
  if (!wo) { console.error(`No work order ${id}.`); process.exit(2); }

  const ledger = readJsonl(join(R, 'ledger.jsonl'));
  const currentHash = hashWorkOrder(effortRoot, wo);
  // Compute the hash ONCE and hand `redispatchBlock` a closure returning it — one file read, shared by
  // the predicate and the messages below (behavior-identical to the former inline `currentHash`).
  const block = redispatchBlock(ledger, { ...wo, id }, () => currentHash);

  if (block.blocked && block.kind === 'dead-end') {
    console.error(`BLOCKED: work order ${id} has a refutation-surviving infeasibility verdict ` +
      `(ledger seq ${block.seq}) and its inputs are unchanged (hash ${currentHash.slice(0, 16)}…).`);
    console.error(`Re-dispatching an identical work order repeats a confirmed dead end. Change an input first: ` +
      `amend a contract, revise topology, or attach new spike knowledge — that un-binds the verdict (and ` +
      `changes the hash). Verdict expiry notes are what un-bind old verdicts when dependencies upgrade.`);
    process.exit(2);
  }

  if (block.blocked && block.kind === 'amendment-drop') {
    const am = ledger.find((e) => e && e.type === 'amendment' && (Number(e.seq) || 0) === block.seq);
    const drop = am && Array.isArray(am.drops) ? am.drops.find((d) => d && d.workOrder === id) : null;
    console.error(`BLOCKED: work order ${id} was dropped by an amendment (ledger seq ${block.seq}` +
      `${drop && drop.supersededBy ? `, superseded by ${drop.supersededBy}` : ''}) with no later restoring ratification.`);
    console.error(`A dropped work order is retired — its successor arrives under a NEW id via a replan that consumed ` +
      `the drop, never a re-dispatch of this id (a restoring ratification carrying resolvesSeq:${block.seq} un-drops it).`);
    process.exit(2);
  }

  // Clear. Distinguish "had a verdict but inputs changed" from "no binding event at all" using the
  // lockstep dead-end fold (dead-ends.mjs) — the SAME predicate `redispatchBlock` binds on, so the two
  // can never disagree about whether a (now-stale) dead-end binding exists for this WO.
  const hadDeadEnd = deadEndSet(ledger).some((d) => d.workOrder === id);
  if (hadDeadEnd) {
    console.log(`Clear: ${id} had an infeasibility verdict, but inputs changed (hash now ${currentHash.slice(0, 16)}…). ` +
      `Re-dispatch permitted.`);
  } else {
    console.log(`Clear: no binding infeasibility verdict or amendment drop for ${id}.`);
  }
  process.exit(0);
}
