// budget.mjs — PreToolUse effort-budget counter (DESIGN §5.9 Ruling 2.1).
//
// The agent thrashes toward GREEN because each local step feels like progress;
// self-detection is structurally unreliable, so the tripwire lives OUTSIDE the
// agent. A hook counts the "doing" tool calls per lane; on exhaustion it forces
// a checkpoint by denying further work and instructing the agent to stop and
// return its progress verdict. The agent does not get a vote.
//
// Counting is denominated in tool calls here (the build-phase-tunable cap); the
// orchestrator can also enforce turns/attempts out of band. Fails OPEN with no
// lane.

import { writeFileSync } from 'node:fs';
import { readStdinJson, findLane, deny } from './effort.mjs';

const input = await readStdinJson();
const probe = (input.tool_input && (input.tool_input.file_path || input.tool_input.notebook_path)) || input.cwd || process.cwd();

const lane = findLane(probe) || findLane(input.cwd || process.cwd());
if (!lane) process.exit(0);

const cap = lane.budget && Number(lane.budget.toolCalls);
if (!cap || cap <= 0) process.exit(0); // no cap configured

lane.counter = lane.counter || { toolCalls: 0, checkpointed: false };

if (lane.counter.checkpointed) {
  deny(`Budget already exhausted for ${lane.workOrder}; this lane is checkpointed. ` +
    `STOP making tool calls. Return your progress verdict as your final message ` +
    `(what was tried, what binds, current hypothesis — DESIGN §5.9) so the orchestrator ` +
    `can triage: extend once, re-spec, spawn a spike, or open a dead-end ceremony.`);
}

const omitInternal = (k, v) => (k === '__file' || k === '__root' ? undefined : v);
function persist() {
  try { writeFileSync(lane.__file, JSON.stringify(lane, omitInternal, 2) + '\n'); } catch {}
}

lane.counter.toolCalls += 1;

if (lane.counter.toolCalls > cap) {
  lane.counter.checkpointed = true;
  persist();
  deny(`Effort budget exhausted for ${lane.workOrder} (${lane.counter.toolCalls - 1}/${cap} tool calls). ` +
    `Forced checkpoint (DESIGN §5.9): halt now, make NO further edits, and return a progress verdict ` +
    `as your final message — what you tried, what binds, your current hypothesis. Desperation fills the ` +
    `vacuum when a process offers no honorable retreat; this is the retreat. Two independent budget ` +
    `exhaustions auto-promote to the dead-end ceremony.`);
}

persist();
process.exit(0);
