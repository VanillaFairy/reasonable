// session-start.mjs — SessionStart hook. Two jobs, both token-light:
//   1. Make the methodology discoverable + declare supersession (DESIGN §6.8) so
//      the skill-priority coin flip at session start lands deterministically.
//   2. If an effort is active, run reconciliation and inject the briefing — the
//      crash-only recovery path runs every session, by construction (§5.12).
//
// The full methodology loads on demand via the `using-reasonable` skill; we do
// NOT dump it here every session (every token counts).

import { readStdinJson, findEffortRoot, loadConfig, emitSessionContext } from './effort.mjs';
import { reconcile, briefing } from './reconcile.mjs';
import { writeMirror } from './progress.mjs';

const input = await readStdinJson();
const cwd = input.cwd || process.cwd();
const effortRoot = findEffortRoot(cwd);

let context =
  '<reasonable>\n' +
  'The `reasonable` plugin is ACTIVE — you are seeing this because its SessionStart hook ran. If this ' +
  'block is ever ABSENT at session start, the plugin hooks are NOT loaded and enforcement is OFF. ' +
  'Methodology: outside-in, contract-governed, adversarially verified development. Motto: *every claim ' +
  'reasoned, every reason checked.*\n' +
  'To START an effort, the user invokes `reasonable:develop` — the single entry — which ASKS two ' +
  'orthogonal axes up front, both explicit, never inferred or guessed:\n' +
  '  • mode — GATED (default): every ratification gate blocks for explicit human approval; or AUTONOMOUS: ' +
  'gates self-ratify and are logged, never blocks — but every step and every mechanical check still runs ' +
  '(autonomy = do not wait for the human, never skip a step). `reasonable:develop-autonomously` is a thin ' +
  'alias that presets autonomous.\n' +
  '  • tier — FULL (default) or LITE: LITE only trims the vertical-slice audit depth (drops the iterative ' +
  'mutation-sample); it waives no guard and is per-slice overridable.\n' +
  '`reasonable` SUPERSEDES per-brick TDD planning (superpowers `test-driven-development` RED-per-brick, ' +
  '`writing-plans`, `executing-plans`) and coexists with `systematic-debugging`/`verification-before-completion`. ' +
  'User instructions govern WHAT to build and WHETHER to use reasonable (triage may route out); once an effort ' +
  'is entered the PROTOCOL IS ABSOLUTE — a standing preference ("KISS"/"act autonomously") never silently skips ' +
  'a step, selects autonomous mode, or lowers the tier. See `using-reasonable` for the full methodology.\n';

if (effortRoot) {
  let mode = null; let tier = null;
  try { const c = loadConfig(effortRoot) || {}; mode = c.runMode || null; tier = c.tier || null; } catch { /* config may not exist yet */ }
  context += `\nAn effort is ACTIVE in this project (mode: ${mode || 'unset — treat as gated until develop records it'}, tier: ${tier || 'full'}).`;
  // Cold restart regenerates the mirror from canonical truth (journal+ledger+inbox) — it's a
  // pure projection (D19), so there is no live/heartbeat state to reset. Fail-open —
  // the mirror is presentation-only.
  try { writeMirror(effortRoot); } catch { /* fail open */ }
  try {
    const r = reconcile(effortRoot);
    const b = briefing(r);
    if (b) context += ' Reconciliation ran at session start (the journal is intent; git+tests+ledger are ' +
      'truth). Brief the user with this before continuing:\n\n' + b + '\n';
  } catch (e) {
    context += `\nReconciliation failed: ${e.message}. Inspect .reasonable/ before dispatching work.\n`;
  }
}

context += '</reasonable>';
emitSessionContext(context);
process.exit(0);
