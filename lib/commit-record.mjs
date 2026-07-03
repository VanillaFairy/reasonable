// commit-record.mjs — PostToolUse(Bash) WRITER: record a lane commit into the ledger
// the instant it lands, closing the commit→ledger custody window (DESIGN §5.12, D20).
//
// THE INCIDENT (sofia-plays graph-editor, 2026-06-27). An implementer committed its work
// product (autoRoute.ts + tests) on its lane at 20:30, then the session hit its limit
// before the agent appended the accounting ledger line. The commit is durable in git, but
// reconcile's SHA-accounting found a lane commit with NO recorded SHA and NO ledger line →
// AMBIGUOUS → HALT. ~20 min of committed work stranded behind a recovery halt, and the
// natural recovery (re-dispatch the slice) would re-run the whole pipeline.
//
// THE FIX (capability beats discipline). D3a's "one atomic commit binds code + ledger line"
// is a FICTION at the worst moment: the ledger is gitignored, so it cannot be inside the
// commit — it is two operations, and a stop between them strands the commit. This hook fires
// right AFTER a lane Bash call, reads the lane's HEAD, and — if HEAD is a Work-Order-trailered
// commit for THIS lane that no ledger line accounts yet — appends ONE `{type:"commit"}` custody
// line. From the agent's view the commit becomes self-accounting: the window shrinks from
// minutes (until the agent remembers to log / the next wave's journal write) to the hook's own
// few-ms execution, and no longer depends on the agent at all.
//
// TRUST ANCHOR: the lane DESCRIPTOR (`.reasonable-lane.json`, written by the provisioner before
// the worker runs), NOT the forgeable trailer — only a commit on a registered lane whose trailer
// matches the descriptor's work order is recorded (trailers are hints, not anchors — §5.14B). A
// human cherry-pick into the main checkout has no lane descriptor, so it is never auto-accounted.
//
// Idempotent (one custody line per SHA — re-firing on a later non-commit Bash no-ops once the SHA
// is accounted). Fail-OPEN always: any error exits 0; a missed record leaves recovery exactly
// where it is today, and the hook never blocks or disturbs a tool call.
//
// NOT commit-accounting.mjs (the read-only provenance PARTITIONER) and NOT commit-gate.mjs (commit
// scope/safety). This is the write-on-landing recorder — the durable sibling of the ephemeral
// D19 action-event report: the report is a presentation POINTER, this is a recovery ANCHOR.
//
// Usage: node commit-record.mjs --hook   (PostToolUse on Bash; reads the payload on stdin)

import { readStdinJson, findLane, readJsonl, gitTry, roleOf, join, basename } from './effort.mjs';
import { append } from './ledger.mjs';

// A worktree path token from a `git -C <worktree> …` / `--tree <worktree>` / bare `.worktrees/<id>`
// command — the lane-provisioner convention is `<effortRoot>/.worktrees/<wo-id>`.
const WORKTREE_PATH_RE = /(\S*\.worktrees[/\\][^/\\\s'"]+)/;

function normSha(s) {
  return String(s == null ? '' : s).replace(/^sha256:/, '').trim().toLowerCase();
}

/** Does any ledger line already name this commit (the same accounting test reconcile uses)? */
function ledgerNamesCommit(ledger, sha) {
  const want = normSha(sha);
  return ledger.some((e) => e && (normSha(e.commit) === want || normSha(e.sha) === want));
}

/**
 * Record the lane HEAD commit implied by a Bash tool-call payload, if it is an unaccounted
 * Work-Order-trailered commit on a registered lane. Pure of process side effects beyond the
 * single ledger append; returns a small result object describing what it did (for tests + callers).
 */
export function recordCommit(input) {
  if (!input || input.tool_name !== 'Bash') return { acted: false, reason: 'not-bash' };
  const cmd = (input.tool_input && input.tool_input.command) || '';

  // Only a command that targets a lane worktree can have produced a lane commit. Resolve the
  // worktree from the command's `.worktrees/<id>` token; fall back to cwd (a non-workflow caller
  // whose cwd IS the worktree — a workflow subagent's cwd is the effort root, so the token path
  // is the reliable one).
  const m = WORKTREE_PATH_RE.exec(cmd);
  const probe = m ? m[1].replace(/^["']/, '') : (input.cwd || process.cwd());
  const lane = findLane(probe);
  if (!lane || !lane.__root || !lane.effortRoot || !lane.workOrder) return { acted: false, reason: 'no-lane' };

  const worktree = lane.__root;
  const head = gitTry(['rev-parse', 'HEAD'], worktree);
  const sha = head.ok ? head.out.trim() : '';
  if (!sha) return { acted: false, reason: 'no-head' };

  // The descriptor is the trust anchor: the commit must be trailered for THIS lane's work order.
  const tr = gitTry(['show', '--no-patch', '--format=%(trailers:key=Work-Order,valueonly)', sha], worktree);
  const trailer = tr.ok ? tr.out.split(/\r?\n/).map((l) => l.trim()).find(Boolean) : null;
  if (!trailer || trailer !== lane.workOrder) return { acted: false, reason: 'trailer-mismatch', sha };

  const ledgerPath = join(lane.effortRoot, '.reasonable', 'ledger.jsonl');
  const ledger = readJsonl(ledgerPath);
  if (ledgerNamesCommit(ledger, sha)) return { acted: false, reason: 'already-accounted', sha, workOrder: lane.workOrder };

  // The ledger controller is the sole append path (Plan 1 "organs" rework); an { ok:false }
  // result is swallowed exactly like every other error in this hook — the custody line is
  // best-effort healing, not a gate, so a controller-side rejection just means the line stays
  // unaccounted for the next opportunity, same as it was before this hook existed.
  const result = append(lane.effortRoot, { type: 'commit', workOrder: lane.workOrder, commit: sha, role: roleOf(input) || null, by: 'commit-record' }, { regen: true });
  if (!result.ok) return { acted: false, reason: 'append-failed', sha, workOrder: lane.workOrder, error: result.error };
  return { acted: true, sha, workOrder: lane.workOrder, effortRoot: lane.effortRoot };
}

// ── CLI: the PostToolUse trigger ────────────────────────────────────────────────────
async function runHook() {
  let input = null;
  try { input = await readStdinJson(); } catch { /* no / blocked stdin */ }
  if (!input) process.exit(0);
  try { recordCommit(input); } catch { /* fail open — a missed record is no worse than today */ }
  process.exit(0);
}

if (basename(process.argv[1] || '') === 'commit-record.mjs') {
  runHook().catch(() => { try { process.exit(0); } catch { /* noop */ } });
}
