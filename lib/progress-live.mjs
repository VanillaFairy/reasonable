// progress-live.mjs — the EPHEMERAL live channel for the D19 progress mirror.
//
// The D19 mirror (lib/progress.mjs) is a deterministic projection of CANONICAL truth
// (work-orders ∪ journal ∪ ledger ∪ inbox). That truth only advances when the lone
// serialized scribe (D3b) writes journal.json — once per wave — so a whole vertical-slice
// wave (provision → implement → blind-test → adjudicate → audit) runs with progress.md
// frozen. This module adds the SECOND, ephemeral tier the mirror MERGES on top:
//
//   .reasonable/progress-live.jsonl — a per-agent "what is happening right now" channel.
//
// It is PRESENTATION-ONLY and EPHEMERAL by construction:
//   • NOT canonical truth: tool-call heartbeats never enter journal.json or the
//     append-only ledger.jsonl (no tool-call noise in the program counter). This file is
//     read by NO enforcement logic and is never a gate input.
//   • Append-only, like the ledger — so the many subagents racing through a wave each
//     APPEND their heartbeat line (O_APPEND, no read-modify-write), never clobbering a
//     peer's entry. buildModel reduces to the latest line per agent.
//   • Reset freely: truncated at session-start (cold restart) and ignored-before
//     journal.lastReconciled by the projection, so recovery starts from a clean "now".
//
// The stage (provision|implement|blind-test|adjudicate|audit|…) is derived FOR FREE from
// the acting agent's role (agent_type → roleOf), the same cwd-independent identity the
// fence governs writes by. So one PreToolUse hook on every subagent write/run tool call
// delivers BOTH "which stage each work order is in" AND "which tool it is running".
//
// Fails OPEN, always: a thrown error here must never block or disturb a tool call. The
// hook exits 0 on any failure (a frozen heartbeat is a cosmetic loss, never a wall).
//
// Usage:
//   node progress-live.mjs --hook       # the PreToolUse trigger (reads the payload on stdin)
// Also exports upsertLive / readLive / resetLive / stageOf / resolveLiveContext for callers.

import { appendFileSync, writeFileSync, statSync } from 'node:fs';
import {
  readStdinJson, readJsonl, findLane, findEffortRoot, roleOf, targetPath,
  basename, dirname, join, norm, resolve,
} from './effort.mjs';

export const LIVE_FILE = 'progress-live.jsonl';

// How long a heartbeat stays "current" before the projection drops it as stale. A live
// entry refreshes on every tool call, so the only thing this bounds is how long a DEAD
// agent's last gasp lingers — or how old a single long-running tool call (a 6-minute test
// run fires one PreToolUse at the start, then nothing until it returns) may get before it
// vanishes. So it must comfortably exceed a long suite run: 10 minutes.
export const LIVE_TTL_MS = 10 * 60 * 1000;

// role → the vertical-slice stage label it runs. The stage IS the role here: every
// pipeline stage is a distinct agentType, so the acting agent's identity names its stage
// at zero extra cost (no per-stage scribe write). Unknown roles fall back to their name.
export const STAGE_BY_ROLE = {
  'lane-provisioner': 'provision',
  characterizer: 'characterize',
  implementer: 'implement',
  'intent-verifier': 'intent-verify',
  'blind-test-writer': 'blind-test',
  adjudicator: 'adjudicate',
  auditor: 'audit',
  'journal-writer': 'scribe',
  reconciler: 'reconcile',
  'route-planner': 'plan',
  'retro-synthesizer': 'retro',
  skeptic: 'skeptic',
  'spike-runner': 'spike',
  census: 'census',
  scaffolder: 'scaffold',
  'intention-writer': 'intention',
};
export function stageOf(role) {
  if (!role) return null;
  return STAGE_BY_ROLE[role] || role;
}

// ── work-order / effort-root resolution from a tool-call payload ───────────────────
// A lane worktree is `<effortRoot>/.worktrees/<wo-id>` (the lane-provisioner convention),
// and it carries a `.reasonable-lane.json` descriptor whose `workOrder` + `effortRoot`
// fields are authoritative. So:
//   • a CODE edit's target is under the worktree → findLane(target) gives both directly;
//   • a Bash command references the worktree by path (git -C … / --tree … / a literal
//     `.worktrees/<id>` token) → we recover the worktree path, then the descriptor.
// Falls back to the `.worktrees/<id>` path segment for the WO id, and to findEffortRoot /
// a `--root <path>` arg for the effort root. A non-WO stage (reconcile/plan/scribe writes
// only canonical .reasonable/ state) resolves wo:null and is keyed by role at effort level.

const WORKTREE_PATH_RE = /(\S*\.worktrees[/\\][^/\\\s'"]+)/;
const WORKTREE_ID_RE = /\.worktrees[/\\]([^/\\\s'"]+)/;

function worktreePathFromText(text) {
  const m = WORKTREE_PATH_RE.exec(text || '');
  return m ? m[1].replace(/^["']/, '') : null;
}
function woIdFromText(text) {
  const m = WORKTREE_ID_RE.exec(text || '');
  return m ? m[1] : null;
}
function rootArgFromCommand(cmd) {
  // The workflow prompts pass `--root <effortRoot>` to every reasonable lib; harvest it as
  // an effort-root hint when no descriptor is reachable.
  const m = /--root\s+("([^"]+)"|'([^']+)'|(\S+))/.exec(cmd || '');
  if (!m) return null;
  return m[2] || m[3] || m[4] || null;
}

/** A short, human one-liner for what the tool is touching ("Edit ChoiceEdge.tsx"). */
function describeTarget(tool, ti) {
  if (tool === 'Bash') {
    const cmd = String((ti && ti.command) || '').replace(/\s+/g, ' ').trim();
    return cmd.length > 64 ? cmd.slice(0, 61) + '…' : cmd;
  }
  const fp = (ti && (ti.file_path || ti.notebook_path)) || '';
  if (!fp) return '';
  const p = norm(fp);
  const parent = basename(dirname(p));
  const name = basename(p);
  return parent && parent !== '.' ? `${parent}/${name}` : name;
}

/**
 * Resolve { effortRoot, wo, target } for a hook payload, cwd-independently. Returns
 * effortRoot:null when no effort is reachable (the live hook then no-ops, fail-open).
 */
export function resolveLiveContext(input) {
  const tool = input.tool_name;
  const ti = input.tool_input || {};
  const tgt = targetPath(tool, ti);                       // file edits → the path
  const cmd = tool === 'Bash' ? ti.command : null;        // bash → the command string
  const probe = tgt || worktreePathFromText(cmd) || input.cwd || process.cwd();

  const lane = findLane(probe);                           // descriptor if probe is in a worktree
  const effortRoot =
    (lane && lane.effortRoot) ||
    findEffortRoot(probe) ||
    (cmd && rootArgFromCommand(cmd) && findEffortRoot(rootArgFromCommand(cmd))) ||
    findEffortRoot(input.cwd || process.cwd()) ||
    null;
  const wo = (lane && lane.workOrder) || woIdFromText(tgt) || woIdFromText(cmd) || null;
  return { effortRoot: effortRoot ? resolve(effortRoot) : null, wo, target: describeTarget(tool, ti) };
}

// ── the channel: append / read / reset ─────────────────────────────────────────────
function liverPath(effortRoot) {
  return join(effortRoot, '.reasonable', LIVE_FILE);
}

/** Append ONE heartbeat line (append-only → race-safe across concurrent agents). */
export function upsertLive(effortRoot, entry) {
  try {
    const line = JSON.stringify({ ...entry, ts: entry.ts || new Date().toISOString() });
    appendFileSync(liverPath(effortRoot), line + '\n');
    return true;
  } catch { return false; } // fail open — a missed heartbeat is cosmetic
}

/** Truncate the channel (cold-restart reset). Silent + fail-open. */
export function resetLive(effortRoot) {
  try { writeFileSync(liverPath(effortRoot), ''); return true; } catch { return false; }
}

/**
 * The CURRENT heartbeats: the latest line per agent key (wo, else `@role`), with stale
 * ones dropped. An entry is dropped when it is older than `ttlMs` (a dead agent / a long
 * gap) OR older than `sinceMs` (journal.lastReconciled — recovery resets the "now" view).
 * Returns { byWorkOrder: { woId: entry }, effort: [entry, …] } — effort holds the
 * no-work-order stages (reconcile / plan / scribe).
 */
export function readLive(effortRoot, opts = {}) {
  const now = typeof opts.now === 'number' ? opts.now : Date.now();
  const ttlMs = typeof opts.ttlMs === 'number' ? opts.ttlMs : LIVE_TTL_MS;
  const sinceMs = typeof opts.sinceMs === 'number' ? opts.sinceMs : null;
  const rows = readJsonl(liverPath(effortRoot)) || [];

  // Reduce to the latest line per key. The file is append-ordered, so a later line for a
  // key supersedes an earlier one (one "now" line per agent).
  const latest = new Map();
  for (const r of rows) {
    if (!r || !r.key) continue;
    const tsMs = Date.parse(r.ts || '');
    if (!Number.isFinite(tsMs)) continue;
    const prev = latest.get(r.key);
    if (!prev || tsMs >= prev.tsMs) latest.set(r.key, { ...r, tsMs });
  }

  const byWorkOrder = {};
  const effort = [];
  for (const e of latest.values()) {
    if (now - e.tsMs > ttlMs) continue;               // stale: dead agent / long gap
    if (sinceMs != null && e.tsMs < sinceMs) continue; // before the last reconcile: reset
    const view = { wo: e.wo || null, stage: e.stage || null, role: e.role || null, tool: e.tool || null, target: e.target || '', ts: e.ts, ageMs: now - e.tsMs };
    if (e.wo) byWorkOrder[e.wo] = view; else effort.push(view);
  }
  effort.sort((a, b) => a.tsMs - b.tsMs);
  return { byWorkOrder, effort };
}

// ── CLI: the PreToolUse heartbeat trigger ──────────────────────────────────────────
async function runHook() {
  let input = null;
  try { input = await readStdinJson(); } catch { /* no / blocked stdin */ }
  if (!input) process.exit(0);

  const role = roleOf(input);
  if (!role) process.exit(0); // MAIN SESSION (no agent_type) = orchestrator, not a heartbeat

  const { effortRoot, wo, target } = resolveLiveContext(input);
  if (!effortRoot) process.exit(0); // no effort reachable — fail open

  const stage = stageOf(role);
  const key = wo || `@${role}`;
  upsertLive(effortRoot, { key, wo, stage, role, tool: input.tool_name, target });

  // Regenerate the mirror so progress.md reflects this heartbeat immediately — UNLESS a
  // regen landed in the last instant (a burst of concurrent tool calls collapses to one
  // render; the append already happened, so nothing is lost). Lazy import avoids a static
  // import cycle with progress.mjs (which reads THIS module's readLive).
  try {
    const md = join(effortRoot, '.reasonable', 'progress.md');
    let fresh = false;
    try { fresh = (Date.now() - statSync(md).mtimeMs) < 300; } catch { fresh = false; }
    if (!fresh) {
      const { writeMirror } = await import('./progress.mjs');
      writeMirror(effortRoot);
    }
  } catch { /* fail open — the next heartbeat / journal write regenerates */ }

  process.exit(0);
}

if (basename(process.argv[1] || '') === 'progress-live.mjs') {
  // NOT a top-level await: runHook() lazily imports progress.mjs to regenerate the mirror,
  // and progress.mjs statically imports readLive from THIS module. Awaiting here would block
  // this module's evaluation on that back-edge import, which cannot complete until this module
  // finishes evaluating — a top-level-await import-cycle deadlock. Firing it un-awaited lets
  // this module finish evaluating; the pending stdin/import keeps the process alive until
  // runHook calls process.exit(0). Fail-open on any unexpected rejection.
  runHook().catch(() => { try { process.exit(0); } catch { /* noop */ } });
}
