// session-start.mjs — SessionStart hook. Two jobs, both token-light:
//   1. Make the methodology discoverable + declare supersession (DESIGN §6.8) so
//      the skill-priority coin flip at session start lands deterministically.
//   2. Resolve which effort(s) exist and brief the user (§6.6, F7). A SINGLE resolved
//      effort runs the full crash-only recovery (reconcile) + briefing, exactly as
//      before; N PARALLEL efforts get a CHEAP per-effort summary (file reads only —
//      NO per-effort reconcile); no effort surfaces strays/parked debris. Discovery is
//      sourced via resolveActiveEffort(cwd) (up-walk first, then a repo-root down-scan),
//      not the raw findEffortRoot up-walk (which could not see a nested effort).
//
// The full methodology loads on demand via the `using-reasonable` skill; we do
// NOT dump it here every session (every token counts).

import {
  readStdinJson, resolveActiveEffort, effortBirthState, loadConfig,
  readJson, readJsonl, gitTry, emitSessionContext,
  existsSync, readFileSync, readdirSync, basename, join,
} from './effort.mjs';
import { reconcile, briefing } from './reconcile.mjs';
import { writeMirror } from './progress.mjs';

const input = await readStdinJson();
const cwd = input.cwd || process.cwd();

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

// ── the resolved single effort: behavior-identical to before (writeMirror + reconcile + briefing) ──
// The ONLY addition is a loud FLAG when this born effort's config is torn/foreign — reconcile HALTs on it
// (S7, §6.1), and we surface that up front rather than letting the down-scan adopt it silently. For a
// healthy `ok` effort the flag is empty, so the path is exactly what it was.
function renderResolved(root) {
  let out = birthFlag(root);
  let mode = null; let tier = null;
  try { const cfg = loadConfig(root) || {}; mode = cfg.runMode || null; tier = cfg.tier || null; } catch { /* config may not exist yet */ }
  out += `\nAn effort is ACTIVE in this project (mode: ${mode || 'unset — treat as gated until develop records it'}, tier: ${tier || 'full'}).`;
  // Cold restart regenerates the mirror from canonical truth (journal+ledger+inbox) — a pure projection
  // (D19), so there is no live/heartbeat state to reset. Fail-open — the mirror is presentation-only.
  try { writeMirror(root); } catch { /* fail open */ }
  try {
    const r = reconcile(root);
    const b = briefing(r);
    if (b) out += ' Reconciliation ran at session start (the journal is intent; git+tests+ledger are ' +
      'truth). Brief the user with this before continuing:\n\n' + b + '\n';
  } catch (e) {
    out += `\nReconciliation failed: ${e.message}. Inspect .reasonable/ before dispatching work.\n`;
  }
  return out;
}

// ── N parallel efforts: the CHEAP briefing (§6.6). Reconcile NOTHING here — one line per effort from a
//    couple of file reads. Each effort in its OWN try/catch, so one bad effort degrades to "1 flagged"
//    while the rest still brief (fail-open). The effort you act on is reconciled on demand, not here. ──
function renderMultiple(disc, fromCwd) {
  const lines = [`\n${disc.roots.length} active efforts in this project (parallel efforts are NORMAL). ` +
    `Cheap per-effort summary — NOT reconciled (reconcile only the one you act on):`];
  for (const root of disc.roots) {
    try { lines.push(cheapSummary(root)); }
    catch (e) { lines.push(`• ${basename(root)}: ⚠️ FLAGGED — could not summarize (${e.message}); reconcile it directly.`); }
  }
  const debris = surfaceDebris(disc, fromCwd);
  if (debris) lines.push(debris);
  return lines.join('\n');
}

// ── no born effort: name it, and surface any strays/misplaced/parked as debris + a cleanup note. ──
function renderNone(disc, fromCwd) {
  const lines = ['\nNo active reasonable effort in this project.'];
  const debris = surfaceDebris(disc, fromCwd);
  if (debris) lines.push(debris);
  return lines.join('\n');
}

// ── one CHEAP per-effort summary line — file reads only (NO reconcile, NO git). ──
// Format (terse + scannable): `• <name>: <done>/<total> done, <active> active, <failed> failed · <staleness>
// · NEXT: <persisted-nextAction | "reconcile on demand">`. A corrupt progress.json THROWS here so the
// caller's per-effort try/catch degrades that one effort to flagged (per-effort isolation, §6.6).
function cheapSummary(root) {
  const bs = effortBirthState(root);
  if (bs.state === 'corrupt' || bs.state === 'missing-signature') {
    return `• ${basename(root)}: ⚠️ FLAGGED — born-but-bad config (${bs.state}${bs.reason ? `: ${bs.reason}` : ''}); ` +
      `reconcile HALTs until .reasonable/config.json is repaired.`;
  }
  const pPath = join(root, '.reasonable', 'progress.json');
  const p = existsSync(pPath) ? JSON.parse(readFileSync(pPath, 'utf8')) : null; // corrupt → throw → caller flags
  const name = (p && p.label) || basename(root);
  const c = (p && p.counts) || {};
  const total = (c.pending || 0) + (c.active || 0) + (c.done || 0) + (c.failed || 0) + (c.canceled || 0);
  const counts = `${c.done || 0}/${total} done, ${c.active || 0} active, ${c.failed || 0} failed`;
  // Forward-compat (Layer 2 / §7.1): reconcile renders the latest `next-action` event into
  // progress.json.nextAction. Absent in Layer 1 → fall back to counts + a reconcile-on-demand note.
  const nextAction = (p && typeof p.nextAction === 'string' && p.nextAction.trim()) ? p.nextAction.trim() : null;
  const next = nextAction ? `NEXT: ${nextAction}` : 'NEXT: reconcile on demand';
  const mirror = p ? '' : ' (no progress mirror yet)';
  return `• ${name}: ${counts} · ${stalenessLabel(root)} · ${next}${mirror}`;
}

// A born-but-bad config (torn/foreign) is HALT-worthy (S7, §6.1). The T1.2 down-scan adopts corrupt/
// missing-signature into `born` without surfacing — so we flag it here in the briefing. Empty string for
// a healthy `ok` (or `absent`) config, so the resolved path stays byte-identical for real efforts.
function birthFlag(root) {
  const bs = effortBirthState(root);
  if (bs.state === 'corrupt' || bs.state === 'missing-signature') {
    return `\n⚠️ BORN-BUT-BAD CONFIG (${bs.state}${bs.reason ? `: ${bs.reason}` : ''}) — this effort's ` +
      `.reasonable/config.json is torn/foreign (HALT-worthy); reconcile will HALT until a human repairs it.`;
  }
  return '';
}

// Staleness = days since the last ledger event's ts (Date is fine in a hook script — unlike a workflow).
function stalenessLabel(root) {
  const events = readJsonl(join(root, '.reasonable', 'ledger.jsonl'));
  if (!events.length) return 'no activity yet';
  const ts = events[events.length - 1].ts;
  const then = ts ? new Date(ts).getTime() : NaN;
  if (!Number.isFinite(then)) return 'activity (no timestamp)';
  const days = Math.floor((Date.now() - then) / 86400000);
  return days <= 0 ? 'active today' : `idle ${days}d`;
}

// Config-less `.reasonable/` strays + misplaced (depth≠1) dirs + a COUNT of concluded/abandoned archives
// (`.reasonable.(done|abandoned)-*`) — surfaced as debris + a cleanup note, NEVER adopted or briefed.
function surfaceDebris(disc, fromCwd) {
  const parts = [];
  const strays = disc.strays || [];
  const diags = disc.diagnostics || [];
  if (strays.length) parts.push(`Debris (NOT adopted): ${strays.length} config-less .reasonable/ dir(s) — ` +
    `${strays.join(', ')}. These are not efforts; remove them, or (re)birth via reasonable:develop.`);
  if (diags.length) parts.push(`Misplaced: ${diags.length} .reasonable/ dir(s) at a non-canonical depth — ` +
    `${diags.map((d) => d.path).join(', ')}. Move to .reasonable-efforts/<name>/.reasonable/ or remove.`);
  const top = gitTry(['rev-parse', '--show-toplevel'], fromCwd);
  const repoRoot = top.ok && top.out.trim() ? top.out.trim() : fromCwd;
  const parked = countParked(repoRoot);
  if (parked) parts.push(`(${parked} parked/stale effort(s) hidden — concluded/abandoned archives, not briefed.)`);
  return parts.join('\n');
}

// Count `.reasonable.(done|abandoned)-*` archive dirs at the repo root and inside each
// `.reasonable-efforts/<name>/` — filtered by NAME, cheaply, so they never brief or scan.
const PARKED_RE = /^\.reasonable\.(done|abandoned)-/;
function countParked(repoRoot) {
  let n = 0;
  const countIn = (dir) => {
    let entries; try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) if (e.isDirectory() && PARKED_RE.test(e.name)) n += 1;
  };
  countIn(repoRoot);
  let names; try { names = readdirSync(join(repoRoot, '.reasonable-efforts'), { withFileTypes: true }); } catch { names = []; }
  for (const e of names) if (e.isDirectory()) countIn(join(repoRoot, '.reasonable-efforts', e.name));
  return n;
}

// --- main: discovery (§6.2/§6.6) — three routes off resolveActiveEffort(cwd) — then emit. ------
// Runs LAST so every helper + module const above is initialized before dispatch (no TDZ).
const disc = resolveActiveEffort(cwd);
if (disc.kind === 'resolved') context += renderResolved(disc.root);
else if (disc.kind === 'multiple') context += renderMultiple(disc, cwd);
else context += renderNone(disc, cwd);

context += '</reasonable>';
emitSessionContext(context);
process.exit(0);
