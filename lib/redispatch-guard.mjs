// redispatch-guard.mjs — the insanity guard (DESIGN §5.8). The ledger records
// refutation-surviving infeasibility verdicts keyed by work order; this hook
// blocks re-dispatch of an IDENTICAL work order unless an input changed. "Doing
// the same thing and expecting a different result" is the failure mode; a
// changed input (contract amended, topology revised, new spike knowledge) is
// what un-binds an old verdict — and that always changes the work-order hash.
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

const binding = ledger.filter((e) =>
  e.workOrder === id &&
  ((e.type === 'verdict' && e.kind === 'infeasible' && e.survivedSkeptic) || e.type === 'dead-end'));

const blocker = binding.find((e) => e.hash === currentHash);

if (blocker) {
  console.error(`BLOCKED: work order ${id} has a refutation-surviving infeasibility verdict ` +
    `(ledger seq ${blocker.seq}) and its inputs are unchanged (hash ${currentHash.slice(0, 16)}…).`);
  console.error(`Re-dispatching an identical work order repeats a confirmed dead end. Change an input first: ` +
    `amend a contract, revise topology, or attach new spike knowledge — that un-binds the verdict (and ` +
    `changes the hash). Verdict expiry notes are what un-bind old verdicts when dependencies upgrade.`);
  process.exit(2);
}

if (binding.length) {
  console.log(`Clear: ${id} had an infeasibility verdict, but inputs changed (hash now ${currentHash.slice(0, 16)}…). ` +
    `Re-dispatch permitted.`);
} else {
  console.log(`Clear: no binding infeasibility verdict for ${id}.`);
}
process.exit(0);
