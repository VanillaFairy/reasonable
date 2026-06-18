// stop-commit.mjs — Stop / SubagentStop backstop for the commit iron rule.
//
// Capability beats discipline: the primary commit happens per work order (the
// implementer's mandatory atomic commit), but a backstop ensures NO turn ends —
// for the orchestrator (Stop) or a lane agent (SubagentStop) — with the effort's
// own work product left uncommitted. In the normal flow the tree is already clean
// and this no-ops; it only earns its keep when something would otherwise be left
// behind.
//
// It NEVER blocks the session (no decision:block / continue:false → no loop risk)
// and NEVER pushes or merges. It commits in-scope work product only (commit-gate
// owns the scope/safety rules) and surfaces a systemMessage so the commit is
// visible. Fails OPEN everywhere: no effort, no node, any error → silent no-op.

import { readStdinJson, findLane, findEffortRoot } from './effort.mjs';
import { commitGate } from './commit-gate.mjs';

const input = await readStdinJson();

// Defensive: if this stop is itself a hook-driven continuation, do nothing.
if (input.stop_hook_active) process.exit(0);

const cwd = input.cwd || process.cwd();
const event = input.hook_event_name || 'Stop';

// Only inside an active effort (a lane worktree or the main checkout under .reasonable/).
if (!findLane(cwd) && !findEffortRoot(cwd)) process.exit(0); // fail open — not a reasonable effort

try {
  const res = commitGate(cwd, {
    commit: true,
    message: `chore(reasonable): auto-commit work product at ${event} (iron-rule backstop)`,
  });
  if (!res || !res.active) process.exit(0);

  if (res.committed) {
    process.stdout.write(JSON.stringify({
      systemMessage:
        `reasonable: committed in-scope work product at ${event} ` +
        `(${res.inScope.length} path(s), ${String(res.sha || '').slice(0, 10)}) — "done" entails committed.`,
    }));
  } else if (!res.clean) {
    // Could not reach a clean tree (e.g. commit blocked). Never block the session;
    // surface it so the human knows work product is still uncommitted.
    process.stdout.write(JSON.stringify({
      systemMessage:
        `reasonable: ${res.inScope.length} in-scope work-product path(s) remain UNCOMMITTED at ${event} ` +
        `and could not be auto-committed${res.error ? ` (${res.error})` : ''}. ` +
        `"Done" entails committed — commit them before declaring done.`,
    }));
  }
} catch { /* never break the session — fail open */ }

process.exit(0);
