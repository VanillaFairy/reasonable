// spike.workflow.js - the timeboxed spike runner (architecture S19, DESIGN S5.7).
//
// SHAPE (from the architecture's topology table): a single timeboxed spike-runner,
// quarantine-fenced -> knowledge-artifact persistence -> return. Launched by the
// MAIN SESSION, never inline from the vertical-slice-runner (one-level workflow()
// nesting, D16d). A spike buys information; its deliverable is a knowledge artifact,
// never code. The spike-runner's code is law-free, extraterritorial, and discarded;
// the only sanctioned membrane crossing is the evidence-formatted knowledge artifact
// (rewrite-from-knowledge, never refactor-from-spike, DESIGN S5.7).
//
// PERSISTENCE without inventing a role: the spike-runner writes the knowledge
// artifact INSIDE its quarantine (it can - that path is under quarantineRoot) and
// returns it structured. This workflow does NOT write the artifact to mainline:
// DESIGN S5.7 routes that harvest through the RETRO (conclusion-leak guard -
// findings enter the vision only via the retro, never a direct mainline write from
// a spike). There is no mainline knowledge-writer in the S20 role lattice, so this
// script does not conjure one.
//
// PURITY (substrate-ref): pure JS. No filesystem, no Date.now / Math.random /
// argless new Date() (they throw and would break deterministic replay). All side
// effects live INSIDE agents - the script orchestrates, agents do the I/O. To stamp
// time or vary by iteration we pass values in via `args`, never read a clock. This
// file is self-contained: every schema literal and the guard() helper are inlined,
// no imports.
//
// THE FENCE IS NOT THE SCRIPT (architecture S3, S13). The script holds zero
// enforcement authority. The spike-runner is path-fenced to its quarantine by the
// PreToolUse hook reading the `.reasonable-lane.json` the lane-provisioner writes
// (quarantineOnly:true + quarantineRoot, fence.mjs S2 / DESIGN S5.7). The script
// merely sequences the agents; the hook does the containing.

export const meta = {
  name: 'spike',
  description: 'Timeboxed, quarantine-fenced spike: answer one falsifiable question with evidence, persist a knowledge artifact, return a verdict. Launched by the main session.',
  whenToUse: 'A first-class route item whose deliverable is information: an analysis feasibility unknown blocking the vision, an un-orderable frontier, or a mid-vertical-slice escalation. Never to prove the chosen direction (that is the walking skeleton, which ships).',
  phases: [
    { title: 'Provision quarantine', detail: 'lane-provisioner creates the law-free quarantine worktree and writes its fence descriptor (quarantineOnly).' },
    { title: 'Run spike', detail: 'spike-runner answers the falsifiable question with evidence inside the quarantine, within the timebox, and writes the knowledge artifact there.' },
  ],
}

// ---------------------------------------------------------------------------
// Inline schemas (the structured agent contracts). Kept literal - meta stays a
// pure literal above; these may be ordinary consts.
// ---------------------------------------------------------------------------

// The lane-provisioner's hand-off: confirmation the quarantine exists and is
// fenced, plus the absolute quarantine path the spike-runner will be cwd'd into.
const PROVISION_RESULT = {
  type: 'object',
  additionalProperties: false,
  required: ['ok', 'quarantineRoot', 'worktreePath', 'branch', 'recordedInJournal', 'descriptorWritten', 'idempotentNoops'],
  properties: {
    ok: { type: 'boolean', description: 'true only if a fenced quarantine worktree + .reasonable-lane.json descriptor (quarantineOnly:true) + journal lane record all exist before any worker runs.' },
    quarantineRoot: { type: 'string', description: 'Absolute path of the law-free quarantine workspace the spike-runner is path-fenced to. The spike-runner is cwd\'d here; all its writes must land under it.' },
    worktreePath: { type: 'string', description: 'The registered git worktree path (a real lane worktree, NOT an engine isolation throwaway).' },
    branch: { type: 'string', description: 'The lane branch name.' },
    recordedInJournal: { type: 'boolean', description: 'The lane was recorded via the scribe at status:dispatched BEFORE the spike-runner runs (closes the descriptor-less window).' },
    descriptorWritten: { type: 'boolean', description: 'The single .reasonable-lane.json descriptor (quarantineOnly:true, quarantineRoot set, effortRoot back-pointer) is written into the worktree root.' },
    idempotentNoops: { type: 'array', items: { type: 'string' }, description: 'Which provisioning steps were skipped because the lane already existed (idempotent re-run after a crash).' },
    failureReason: { type: 'string', description: 'Present iff ok is false: why provisioning could not complete (e.g. worktree add failed, fence-protected descriptor write denied).' },
  },
}

// The spike-runner's verdict. The gate of a spike is "a falsifiable question
// answered WITH EVIDENCE" - not code that runs. A timeboxed "no" is a success.
// This structured return IS the knowledge that crosses the membrane back to the
// main session; the spike CODE never crosses (it stays quarantined and is
// discarded). The spike-runner ALSO persists the same knowledge as an artifact
// file inside its quarantine (it can - that path is under quarantineRoot); the
// main-session orchestrator harvests that artifact into mainline at the retro
// (DESIGN S5.7 - "the orchestrator harvests it through the retro"). This workflow
// does NOT write mainline itself: there is no mainline knowledge-writer role in
// the topology, and inventing one would breach a narrow agent's charter + the
// fence (knowledge laundering crosses ONLY through the retro).
const SPIKE_VERDICT = {
  type: 'object',
  additionalProperties: false,
  required: ['question', 'method', 'evidence', 'verdict', 'confidence', 'expiry', 'artifactPath'],
  properties: {
    question: { type: 'string', description: 'The single falsifiable question, restated (a yes/no or a which-of-these, with a clear success criterion).' },
    method: { type: 'string', description: 'The cheapest thing built to answer it: harness shape, scope, what was hardcoded/skipped. Disposable by design.' },
    evidence: { type: 'string', description: 'The CURATED evidence that crosses the membrane: exact incantation(s) that worked, exact output, what was measured. Curate evidence, not accident - whole-code quoting is refactor-from-spike by the back door.' },
    verdict: {
      type: 'string',
      enum: ['feasible', 'infeasible', 'inconclusive'],
      description: 'feasible / infeasible (both are real results), or inconclusive when the timebox expired with no decisive answer. "No" is a success: the direction is learned-closed.',
    },
    bindingConstraint: { type: 'string', description: 'For an infeasible verdict: the specific requirement that cannot be met and why (the evidence standard for a "can\'t be done" claim). Omit otherwise.' },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'], description: 'Confidence in the verdict given the evidence and the timebox spent.' },
    expiry: { type: 'string', description: 'MANDATORY. The versions/conditions tested against, because spike conclusions rot - e.g. "automerge 2.1.0, Rust 1.86; re-verify on a major automerge bump or document-model change."' },
    artifactPath: { type: 'string', description: 'The path (UNDER the quarantine root) where the spike-runner wrote the mandatory-format knowledge artifact. The main session harvests it into mainline at the retro; it is NEVER read as code.' },
    timeboxExpired: { type: 'boolean', description: 'true if the spike-runner hit the timebox before reaching a decisive answer (verdict is then typically inconclusive - still a returnable result).' },
  },
}

// ---------------------------------------------------------------------------
// guard(): the budget-throw membrane (D16b). The engine THROWS when an agent()
// call would exceed the token ceiling (spent >= total). A raw throw would abort
// the whole spike and lose the knowledge already gathered. guard() catches that
// throw and re-tags it as a structured ceiling signal, so a budget wall is never
// misread as a spike failure. Any non-budget throw is re-raised - we do not
// swallow real errors. (No clock / random here: pure.)
// ---------------------------------------------------------------------------
async function guard(thunk) {
  try {
    const value = await thunk()
    return { ok: true, value }
  } catch (e) {
    const msg = (e && e.message) ? String(e.message) : String(e)
    const isBudget = /budget|ceiling|token|exceed/i.test(msg)
    if (isBudget) return { ok: false, ceiling: true, reason: msg }
    throw e
  }
}

// The single typed return to the main session. A tagged union the main session
// branches on (mirrors the architecture's GATE_RESULT discipline: distinct
// outcomes are distinct human decisions, never collapsed):
//   verdict          - the spike answered (feasible | infeasible | inconclusive);
//                      the knowledge artifact sits in the quarantine and the retro
//                      harvests it into mainline.
//   budget-exhausted - the token ceiling hit before a decisive answer; the partial
//                      knowledge (if any) is returned so the main session can
//                      extend / re-scope, NOT a silent correctness gap.
//   blocked          - quarantine could not be provisioned, or the spike-runner
//                      died (null return) - the main session must decide.
function done(result) { return result }

// callShapeReminder - appended to every schema-forced prompt below. The model
// intermittently mis-calls a forced StructuredOutput tool by JSON-stringifying its
// whole answer into one wrapper property ({"input":"{...}"}) instead of passing the
// schema's fields as the call's own top-level arguments; each such call fails schema
// validation and burns one of the 5 retries (five in a row exhaust the cap and throw -
// the graph-editor-ux-overhaul reconciler crash). Inlined per file: the pure-substrate
// no-import rule (invariant #5) forbids sharing it across workflows.
const callShapeReminder =
  'TOOL-CALL SHAPE: call the forced tool with the schema\'s fields as the CALL\'S OWN top-level arguments (e.g. {"ok": true, "quarantineRoot": "...", ...}) - do NOT JSON-stringify the whole answer into a wrapper property (e.g. {"input": "{...}"}); that fails schema validation and burns a retry.';

// ---------------------------------------------------------------------------
// The run.
//
// args (passed by the main-session orchestrator at launch - the script reads no
// disk and no clock; everything dynamic rides in args):
//   {
//     effortRoot,        // absolute path to the main checkout (where .reasonable/ lives)
//     spike: {
//       id,              // knowledge artifact id, e.g. "k7"
//       question,        // the single falsifiable question + success criterion
//       timebox,         // the timebox the spike-runner must honor (turns / wall budget, prose ok)
//       spawnPoint,      // "analysis" | "route" | "mid-vertical-slice" (provenance, for the artifact)
//       context,         // optional: the unknown's context, prior knowledge, what is already ruled out
//     },
//     quarantine: {
//       worktreePath,    // intended quarantine worktree path
//       quarantineRoot,  // absolute path the spike-runner is fenced to (== worktreePath root, typically)
//       branch,          // lane branch name
//     },
//     budget,            // optional per-spike token target; guards the loop alongside engine budget
//   }
// ---------------------------------------------------------------------------
export default async function run() {
  const a = { ...(args || {}) } // mutable copy - never mutate the frozen `args` global
  const spike = a.spike || {}
  const quarantine = a.quarantine || {}

  if (!spike.question) {
    return done({ kind: 'blocked', outcome: 'no-question: a spike must carry exactly one falsifiable question (args.spike.question is empty).' })
  }

  // ---- Phase 1: provision the law-free quarantine (lane-provisioner) ----
  // The provisioner creates a REAL registered worktree (never isolation:'worktree',
  // which auto-removes and would sweep the spike), writes the one quarantineOnly
  // descriptor, and records the lane via the scribe BEFORE the spike-runner runs.
  // This is what makes the fence bind on the spike-runner's very first write.
  phase('Provision quarantine')
  log(`Provisioning quarantine for spike ${spike.id || '(unnamed)'}: ${spike.question}`)

  const provisionPrompt = [
    `Provision a QUARANTINE lane for a spike (DESIGN S5.7, architecture S13/D7).`,
    `Effort root (canonical .reasonable/ - the descriptor back-pointer target): ${a.effortRoot}`,
    `Worktree path (must be NESTED under the effort root, e.g. ${a.effortRoot}/.worktrees/${spike.id || '<spike-id>'}): ${quarantine.worktreePath}`,
    `Branch: ${quarantine.branch}`,
    `Quarantine root the spike-runner is path-fenced to: ${quarantine.quarantineRoot}`,
    `This is a LAW-FREE quarantine, so the descriptor you write MUST set`,
    `quarantineOnly:true and quarantineRoot to the path above (fence.mjs S2). role: "spike-runner".`,
    `No locus/contracts apply - the quarantine is extraterritorial; the fence allows any write UNDER`,
    `quarantineRoot and denies every write outside it.`,
    `Order is the safety property: \`git -C ${a.effortRoot} worktree add <worktree-path> -b ${quarantine.branch}\``,
    `(the worktree NESTED under the effort root, so findEffortRoot resolves the canonical .reasonable/ from`,
    `inside it and reconcile's effort-scoped scan re-claims it) -> write the single .reasonable-lane.json (with`,
    `the effortRoot back-pointer) -> record the lane via the scribe at status:'dispatched'. All BEFORE any`,
    `spike-runner runs. Idempotent on re-run after a crash: a present matching descriptor is a no-op.`,
    callShapeReminder,
  ].join('\n')

  const provGuard = await guard(() =>
    agent(provisionPrompt, { agentType: 'reasonable:lane-provisioner', label: `provision:${spike.id || 'spike'}`, phase: 'Provision quarantine', schema: PROVISION_RESULT }))

  if (!provGuard.ok && provGuard.ceiling) {
    return done({ kind: 'budget-exhausted', progress: 'token ceiling hit during quarantine provisioning; no spike was run.', lastOutcome: provGuard.reason })
  }
  const provision = provGuard.value
  if (provision === null) {
    // null = user-skip or terminal API error: a provisioning gap, not a verdict.
    return done({ kind: 'blocked', outcome: 'lane-provisioner returned null (skipped or died); quarantine not provisioned, spike not run.' })
  }
  if (!provision.ok) {
    return done({ kind: 'blocked', outcome: `quarantine provisioning failed: ${provision.failureReason || 'unknown'}. Spike not run (a spike-runner with no fenced quarantine is exactly the descriptor-less window the design forbids).` })
  }

  // ---- Phase 2: run the timeboxed spike inside the quarantine (spike-runner) ----
  // Cwd'd into the quarantine; fenced there by the hook (NOT by this script).
  // Forced to emit SPIKE_VERDICT so a timeboxed "no" is a structured, returnable
  // result rather than an unstructured wall.
  phase('Run spike')
  log(`Running spike inside quarantine ${provision.quarantineRoot} (timebox: ${spike.timebox || 'as briefed'})`)

  const spikePrompt = [
    `You are running ONE timeboxed spike. Answer exactly one FALSIFIABLE question WITH EVIDENCE.`,
    `Your deliverable is a knowledge artifact (which you return as structured output), never code.`,
    ``,
    `Question (the gate - a question answered with evidence, NOT code that runs):`,
    `  ${spike.question}`,
    spike.context ? `Context / what is already ruled out:\n  ${spike.context}` : ``,
    `Timebox: ${spike.timebox || 'as briefed by the orchestrator'}. A timeboxed "no" (or inconclusive)`,
    `is a SUCCESS - you learned the direction is closed. Do not run past the timebox chasing certainty.`,
    ``,
    `Your workspace is the LAW-FREE quarantine at: ${provision.quarantineRoot}`,
    `Everything you write goes UNDER that path. You are path-fenced there by hook; any write outside it`,
    `is hard-blocked, and you must not try. Your code is DISCARDED - hack freely, hardcode, skip error`,
    `handling; optimize for a fast, decisive answer.`,
    ``,
    `Curate evidence vs. accident: the implementer who later builds the real thing reads your artifact and`,
    `NEVER your code. Quote only the curated incantations that are genuinely evidence; leave scaffolding`,
    `accidents behind. The expiry note is MANDATORY - name the versions/conditions you tested against,`,
    `because spike conclusions rot.`,
    ``,
    `Write the knowledge artifact as a file UNDER the quarantine (the mandatory format -`,
    `docs/artifacts.md: question / method / evidence / verdict / confidence / EXPIRY) and ALSO return it`,
    `as your structured output, with artifactPath set to where you wrote it. The orchestrator harvests`,
    `that artifact into mainline at the retro - you do NOT write to mainline (you are fenced out of it).`,
    `For an infeasible verdict, include the binding constraint with its evidence. Set timeboxExpired honestly.`,
    `Section id for progress reporting: "spike".`,
    callShapeReminder,
  ].filter(Boolean).join('\n')

  const spikeGuard = await guard(() =>
    agent(spikePrompt, { agentType: 'reasonable:spike-runner', label: `spike:${spike.id || 'spike'}`, phase: 'Run spike', schema: SPIKE_VERDICT }))

  if (!spikeGuard.ok && spikeGuard.ceiling) {
    return done({ kind: 'budget-exhausted', progress: 'token ceiling hit while running the spike; quarantine provisioned but no verdict reached.', lastOutcome: spikeGuard.reason })
  }
  const verdict = spikeGuard.value
  if (verdict === null) {
    return done({ kind: 'blocked', outcome: 'spike-runner returned null (skipped or died); no verdict, nothing to persist.' })
  }

  // ---- Return: the spike answered; its knowledge is captured. ----
  // The knowledge crosses back to the main session TWO sanctioned ways: as this
  // structured verdict, and as the artifact file the spike-runner wrote in the
  // quarantine (path in verdict.artifactPath). The main-session orchestrator
  // harvests that artifact into mainline AT THE RETRO (DESIGN S5.7 - conclusion
  // leak / knowledge laundering is blocked: findings enter the vision only through
  // the retro, never via a direct mainline write from here). The spike CODE is
  // discarded; re-entry is rewrite-from-knowledge, never refactor-from-spike.
  log(`Spike ${spike.id || '(unnamed)'} complete: ${verdict.verdict} (confidence ${verdict.confidence}). Quarantined artifact at ${verdict.artifactPath || '(unspecified)'}.`)
  return done({
    kind: 'verdict',
    spikeId: spike.id || null,
    verdict,                              // feasible | infeasible | inconclusive, with evidence + expiry
    knowledgeArtifact: verdict.artifactPath || null, // lives UNDER the quarantine; harvested into mainline at the retro
    quarantine: provision.quarantineRoot, // discarded by the main session; never harvested as code
    note: 'Spike code is discarded; only the knowledge artifact crosses, and only through the retro. Re-entry is rewrite-from-knowledge, never refactor-from-spike.',
  })
}
