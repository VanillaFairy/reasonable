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

import { appendJsonl, join, rootFromArgv, argvWithoutRoot, findEffortRoot, basename } from './effort.mjs';
import { validateActionEvent } from './action-events.mjs';
import { writeMirror } from './progress.mjs';

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
 * Validate + append one action-event, then regenerate the mirror. Returns { ok:true } or
 * { ok:false, error } — never throws, so both the CLI and a direct caller get the same shape.
 * Pure of any argv parsing (that's `parseArgs`'s job) — this is the one place the append+regen
 * side effect happens, shared by the CLI entrypoint and this module's own tests.
 */
export function reportAction(root, verb, fields) {
  const type = VERBS[verb];
  if (!type) return { ok: false, error: `unknown verb: ${verb} (expected one of ${Object.keys(VERBS).join(', ')})` };
  const check = validateActionEvent(type, fields);
  if (!check.ok) return check;

  appendJsonl(join(root, '.reasonable', 'ledger.jsonl'), { type, ...fields });
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
