// action-report.mjs — the CLI a dispatched agent calls to report ITS OWN progress: starting or
// finishing a named section of work, or an item within it, or marking an item obsolete (D19).
// Replaces the old passively-sampled progress-live heartbeat: this is a DELIBERATE call the
// agent makes, so — unlike the old hook, which had to fail open on every tool call — it fails
// LOUD on a malformed call, so the agent finds out immediately instead of the report vanishing.
//
// Usage:
//   node action-report.mjs --root <effortRoot> --workOrder <id> --level section --label <text> started
//   node action-report.mjs --root <effortRoot> --workOrder <id> --level section --label <text> finished
//   node action-report.mjs --root <effortRoot> --workOrder <id> --level item --kind <clause|step|adhoc> --ref <ref> [--label <text>] started
//   node action-report.mjs --root <effortRoot> --workOrder <id> --level item --kind <k> --ref <ref> finished
//   node action-report.mjs --root <effortRoot> --workOrder <id> --level item --kind <k> --ref <ref> --reason <text> obsoleted

import { appendJsonl, join, readJson, readJsonl, rootFromArgv, argvWithoutRoot, findEffortRoot, basename } from './effort.mjs';
import { validateActionEvent } from './action-events.mjs';
import { writeMirror, replayActions } from './progress.mjs';

const VERBS = { started: 'action-started', finished: 'action-finished', obsoleted: 'action-obsoleted' };

/** Parse `--flag value` pairs plus one trailing bare verb (started|finished|obsoleted). */
function parseArgs(argv) {
  const fields = {};
  let verb = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) { fields[a.slice(2)] = argv[i + 1]; i += 1; }
    else if (VERBS[a]) verb = a;
  }
  return { fields, verb };
}

/**
 * Validate + append one action-event, then regenerate the mirror. Returns { ok:true } (or
 * { ok:true, suppressed:true } for a deterministic no-op) or { ok:false, error } — never throws,
 * so both the CLI and a direct caller get the same shape. Pure of any argv parsing (that's
 * `parseArgs`'s job) — this is the one place the append+regen side effect happens, shared by the
 * CLI entrypoint and this module's own tests.
 *
 * The append is IDEMPOTENT in the durable artifacts, not in agent memory (D19): every event is
 * stamped with the work order's `dispatchEpoch` — the monotonic dispatch counter read FRESH from
 * the journal here, never supplied by the agent, so a resumed or context-compacted agent derives
 * the SAME value. A `started` whose section/item is ALREADY ACTIVE UNDER THAT SAME EPOCH is a
 * redundant re-announce (the transition already happened): it is suppressed — a scriptable no-op
 * that needs nothing the agent remembers. A `started` active under a DIFFERENT (higher) epoch is a
 * resumed run after a crash: it is NOT suppressed, so it lands and `replayActions` renders it as
 * the crash boundary (✗ dead attempt + live resume).
 */
export function reportAction(root, verb, fields) {
  const type = VERBS[verb];
  if (!type) return { ok: false, error: `unknown verb: ${verb} (expected one of ${Object.keys(VERBS).join(', ')})` };
  const check = validateActionEvent(type, fields);
  if (!check.ok) return check;

  const dir = join(root, '.reasonable');
  const ledgerPath = join(dir, 'ledger.jsonl');
  // WHO am I — the work order's dispatch epoch, read fresh from the journal every call. The agent
  // never passes it, so this is deterministic in durable state, not in what the agent recalls.
  const journal = readJson(join(dir, 'journal.json')) || {};
  const epoch = journal.workOrders?.[fields.workOrder]?.dispatchEpoch ?? 0;

  if (type === 'action-started') {
    const mine = (readJsonl(ledgerPath) || [])
      .filter((e) => e && e.workOrder === fields.workOrder)
      .sort((a, b) => (a.seq || 0) - (b.seq || 0));
    const sections = replayActions(mine).sections;
    const openSec = sections.length ? sections[sections.length - 1] : null;
    const openSameEpoch = !!openSec && openSec.status === 'active' && openSec.dispatch === epoch;
    const redundant = fields.level === 'section'
      ? openSameEpoch && openSec.label === fields.label
      : openSameEpoch && !!openSec.items.find((i) => i.ref === fields.ref && i.status === 'active');
    if (redundant) { writeMirror(root); return { ok: true, suppressed: true }; }
  }

  // Stamp WHO onto the line (the trailing `dispatch` wins over any stray field of the same name —
  // the epoch is script-authoritative, an agent cannot spoof it).
  appendJsonl(ledgerPath, { type, ...fields, dispatch: epoch });
  writeMirror(root);
  return { ok: true };
}

// ── CLI ────────────────────────────────────────────────────────────────────────────
function runCli() {
  const root = rootFromArgv(process.argv, null) || findEffortRoot(process.cwd());
  if (!root) { console.error('action-report: no effort here (.reasonable/ not found).'); process.exit(1); }
  const { fields, verb } = parseArgs(argvWithoutRoot(process.argv).slice(2));
  const result = reportAction(root, verb, fields);
  if (!result.ok) { console.error(`action-report: ${result.error}`); process.exit(1); }
  process.exit(0);
}

if (basename(process.argv[1] || '') === 'action-report.mjs') runCli();
