// scout.workflow.js — the ZERO-COMMIT SCOUT (reasonable 3.0 Part 8, DESIGN-3.0 §17).
//
// SHAPE: spike.workflow.js MINUS the effort. A single timeboxed spike-runner, dispatched into a
// disposable workspace that lives OUTSIDE any repo -> knowledge-artifact + optional genesis-seed
// persistence -> return. Launched by the SCOUT SKILL (skills/scout), never inside an effort.
//
// LAW-FREE BY CONSTRUCTION, NOT BY FENCE (design Call 1, §17). A scout runs where no `.reasonable/`
// exists, so lib/fence.mjs fails OPEN (CLAUDE.md invariant #2) — there is NO hook path-fence here,
// unlike the in-effort spike (whose fence reads a `.reasonable-lane.json` descriptor). This is the
// design, not a gap: the scout's containment is the disposable workspace + the spike-runner's
// constitutional/dispatch scoping to it. This script provisions NO quarantine, writes NO descriptor,
// records NO journal/ledger — there is no effort to nest under. DO NOT add fence logic anywhere for the
// scout; that would violate invariant #2 and contradict §17.
//
// REUSE THE SPIKE-RUNNER VERBATIM (design Call 2). The dispatch passes NO effortRoot and states plainly
// that this is a scout (no effort, no ledger), so the spike-runner constitution's "Report your progress
// as you go" ledger section is vacuous (zero ledger facts, no effortRoot) and progress rides the
// structured return instead.
//
// PURITY (substrate-ref): pure JS. No filesystem, no clock reads, no RNG calls. All side effects live
// INSIDE agents; the script sequences. Self-contained: every schema literal and the guard() helper
// inlined, no imports (invariant #5).

export const meta = {
  name: 'scout',
  description: 'Zero-commit pre-effort scout: shape-discovery in a disposable law-free workspace, deliver a knowledge artifact + an optional structure-only genesis seed, return a verdict. Writes no .reasonable/ state. Launched standalone by the scout skill.',
  whenToUse: 'Before an effort exists, to answer "what is the right decomposition / API / target?" — the exploratory front-end the committed spine serves badly. On convergence it seeds the genesis graph so analysis starts warm. Never inside an effort (that is the in-effort spike); never to prove the chosen direction (that is the walking skeleton, which ships).',
  phases: [
    { title: 'Run scout', detail: 'spike-runner answers the shape-discovery question with evidence inside the disposable workspace, within the timebox, and on convergence writes the scout report + seed.json there.' },
  ],
}

// ---------------------------------------------------------------------------
// Inline schema (the structured agent contract). Kept literal — meta stays a
// pure literal above; this may be an ordinary const.
// ---------------------------------------------------------------------------

// The scout-runner's verdict. The gate is "a shape-discovery question answered WITH EVIDENCE" — not
// code that runs. A timeboxed "no" (infeasible) is a success. This structured return IS the knowledge
// that crosses the membrane back to the skill; the scout CODE never crosses (it is discarded). The
// scout-runner ALSO persists the same knowledge as a report file, and (only on convergence) a seed.json,
// inside its workspace; the skill harvests them and shape-validates the seed (lib/scout-seed.mjs).
const SCOUT_RESULT = {
  type: 'object',
  additionalProperties: false,
  required: ['question', 'method', 'evidence', 'verdict', 'confidence', 'expiry', 'reportPath'],
  properties: {
    question: { type: 'string', description: 'The single shape-discovery question, restated (what decomposition / API / target? — with a clear convergence criterion).' },
    method: { type: 'string', description: 'The cheapest thing built to explore it: harness shape, scope, what was hardcoded/skipped. Disposable by design.' },
    evidence: { type: 'string', description: 'The CURATED evidence that crosses the membrane: what was tried, what the shape turned out to be, the exact incantations that worked. Curate evidence, not accident — whole-code quoting is refactor-from-scout by the back door.' },
    verdict: {
      type: 'string',
      enum: ['converged', 'infeasible', 'inconclusive'],
      description: 'converged (a stable shape found — carries a seed) / infeasible (the target/direction is learned-closed — a real, successful "no", no seed) / inconclusive (timebox expired with no stable shape).',
    },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'], description: 'Confidence in the verdict given the evidence and the timebox spent.' },
    expiry: { type: 'string', description: 'MANDATORY. The versions/conditions explored against, because shape-discovery conclusions rot — e.g. "explored against automerge 2.1.0, node 22; re-verify on a major dependency bump."' },
    reportPath: { type: 'string', description: 'The path (under the workspace) where the scout wrote the markdown knowledge artifact (question/method/evidence/verdict/confidence/expiry + candidate-shape narrative). NEVER read as code.' },
    seedPath: { type: 'string', description: 'Present ONLY on a converged verdict: the path (under the workspace) to seed.json — the draft charter set + goals sketch, STRUCTURE ONLY (charter fields component/premises/purpose/locus/order; no clauses, no behavioral musts). The skill shape-validates it (lib/scout-seed.mjs) before offering it to any genesis.' },
    timeboxExpired: { type: 'boolean', description: 'true if the scout hit the timebox before a decisive answer (verdict is then typically inconclusive — still a returnable result).' },
  },
}

// ---------------------------------------------------------------------------
// guard(): the budget-throw membrane. The engine THROWS when an agent() call would exceed the token
// ceiling. A raw throw would abort the scout and lose knowledge already gathered; guard() catches it and
// re-tags it as a structured ceiling signal so a budget wall is never misread as a scout failure. Any
// non-budget throw is re-raised. (Pure: no clock / random.)
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

// The single typed return to the scout skill. A tagged union (mirrors spike.workflow.js's discipline):
//   result            - the scout answered (converged | infeasible | inconclusive); the report (and, on
//                        convergence, the seed) sit in the disposable workspace for the skill to harvest.
//   budget-exhausted  - the token ceiling hit before a decisive answer.
//   blocked           - no question was given, or the scout-runner died (null return).
function done(result) { return result }

// callShapeReminder — appended to the schema-forced prompt below. The model intermittently mis-calls a
// forced StructuredOutput tool by JSON-stringifying its whole answer into one wrapper property
// ({"input":"{...}"}) instead of passing the schema's fields as the call's own top-level arguments; each
// such call fails schema validation and burns one of the retries. Inlined per file: the pure-substrate
// no-import rule (invariant #5) forbids sharing it across workflows.
const callShapeReminder =
  'TOOL-CALL SHAPE: call the forced tool with the schema\'s fields as the CALL\'S OWN top-level arguments (e.g. {"verdict": "converged", "reportPath": "...", ...}) — do NOT JSON-stringify the whole answer into a wrapper property (e.g. {"input": "{...}"}); that fails schema validation and burns a retry.';

// ---------------------------------------------------------------------------
// The run.
//
// args (passed by the scout SKILL at launch — the script reads no disk and no clock):
//   {
//     workspaceRoot,   // absolute path to the DISPOSABLE workspace OUTSIDE any repo (the skill created
//                      // it, e.g. via `mktemp -d`); the scout-runner is cwd'd here; all writes go under it.
//     scout: { id, question, timebox, context? },   // NO effortRoot anywhere — there is no effort.
//     budget,          // optional per-scout token target; guards the loop alongside engine budget.
//   }
// ---------------------------------------------------------------------------
export default async function run() {
  const a = { ...(args || {}) } // mutable copy — never mutate the frozen `args` global
  const scout = a.scout || {}
  const workspaceRoot = a.workspaceRoot

  if (!scout.question) {
    return done({ kind: 'blocked', outcome: 'no-question: a scout must carry exactly one shape-discovery question (args.scout.question is empty).' })
  }
  if (!workspaceRoot) {
    return done({ kind: 'blocked', outcome: 'no-workspace: the scout skill must create a disposable workspace OUTSIDE any repo and pass it as args.workspaceRoot (design Call 4).' })
  }

  // ---- Run the timeboxed scout inside the disposable workspace (spike-runner, reused verbatim) ----
  // There is no effort, so there is no quarantine to provision and no descriptor to write (design
  // Call 1) — the fence never fires here (CLAUDE.md invariant #2), and containment is the workspace
  // convention + the dispatch prompt's scoping, not a hook.
  phase('Run scout')
  log(`Running scout ${scout.id || '(unnamed)'} in disposable workspace ${workspaceRoot} (timebox: ${scout.timebox || 'as briefed'})`)

  const scoutPrompt = [
    `You are running ONE timeboxed SCOUT — the zero-commit, PRE-EFFORT exploration surface (DESIGN-3.0 §17).`,
    `This is NOT an effort. There is NO .reasonable/ state, NO ledger, and NO effortRoot. You do not`,
    `report to any ledger — the "Report your progress as you go" section of your constitution does not`,
    `apply here (there are zero ledger facts and no effortRoot); narrate progress ONLY in your returned`,
    `structured output.`,
    ``,
    `Shape-discovery question (the gate — a question answered WITH EVIDENCE, not code that runs):`,
    `  ${scout.question}`,
    scout.context ? `Context / what is already ruled out:\n  ${scout.context}` : ``,
    `Timebox: ${scout.timebox || 'as briefed'}. A timeboxed "no" (infeasible) or inconclusive is a`,
    `SUCCESS — you learned the direction is closed. Do not run past the timebox chasing certainty.`,
    ``,
    `Your workspace is the DISPOSABLE, LAW-FREE directory at: ${workspaceRoot}`,
    `Everything you write goes UNDER that path. Your code is DISCARDED — hack freely, hardcode, skip`,
    `error handling; optimize for a fast, decisive answer about the SHAPE. (There is no hook fence here —`,
    `you are trusted to confine writes to the workspace; do so.)`,
    ``,
    `Curate evidence vs. accident: whoever later builds the real thing reads your artifact and NEVER your`,
    `code. Quote only the curated incantations that are genuinely evidence. The expiry note is MANDATORY.`,
    ``,
    `Write, UNDER the workspace: (1) a markdown scout report (the knowledge-artifact format —`,
    `question / method / evidence / verdict / confidence / EXPIRY — plus a human-readable narrative of the`,
    `candidate shape); set reportPath to it. (2) ONLY IF you CONVERGED on a candidate decomposition:`,
    `seed.json — a genesis seed of the form`,
    `  { "goalsSketch": [ { "id": "gs-1", "scenario": "..." } ],`,
    `    "draftCharters": [ { "component": "<kebab>", "premises": ["goal:gs-1"], "purpose": "<one-line, NON-normative>", "locus": ["<glob>"], "order": 0 } ] }`,
    `The draft charters are STRUCTURE ONLY (§13): the exact charter fields component/premises/purpose/`,
    `locus/order and NOTHING else — NO clauses, NO "must"/behavior fields. A charter never says what a`,
    `component DOES; behavior is born later, at a gate. Set seedPath to it. If you did NOT converge, omit`,
    `the seed entirely (verdict infeasible or inconclusive). Set timeboxExpired honestly.`,
    callShapeReminder,
  ].filter(Boolean).join('\n')

  const scoutGuard = await guard(() =>
    agent(scoutPrompt, { agentType: 'reasonable:spike-runner', label: 'scout', phase: 'Run scout', schema: SCOUT_RESULT }))

  if (!scoutGuard.ok && scoutGuard.ceiling) {
    return done({ kind: 'budget-exhausted', progress: 'token ceiling hit while running the scout; workspace exists but no decisive verdict was reached.', lastOutcome: scoutGuard.reason })
  }
  const verdict = scoutGuard.value
  if (verdict === null) {
    return done({ kind: 'blocked', outcome: 'scout-runner returned null (skipped or died); no verdict, nothing to harvest.' })
  }

  // ---- Return: the scout answered; its knowledge is captured. ----
  // The knowledge crosses back to the scout skill TWO sanctioned ways: as this structured verdict, and
  // as the report file (and, on convergence, seed.json) the scout-runner wrote in the workspace. The
  // scout CODE is discarded; re-entry is rewrite-from-knowledge, never refactor-from-scout.
  log(`Scout ${scout.id || '(unnamed)'} complete: ${verdict.verdict} (confidence ${verdict.confidence}). Report at ${verdict.reportPath || '(unspecified)'}${verdict.seedPath ? `, seed at ${verdict.seedPath}` : ' (no seed — did not converge)'}.`)
  return done({
    kind: 'result',
    scoutId: scout.id || null,
    verdict,                                   // converged | infeasible | inconclusive, with evidence + expiry
    report: verdict.reportPath || null,        // the markdown knowledge artifact (in the workspace)
    seed: verdict.seedPath || null,            // seed.json (workspace) on convergence; the skill shape-validates it
    workspace: workspaceRoot,                  // disposable; discarded by the skill; never harvested as code
    note: 'Scout code is discarded; only the knowledge artifact + the structure-only seed cross. Re-entry is rewrite-from-knowledge, never refactor-from-scout. The seed is a PRE-EFFORT input, never .reasonable/ state.',
  })
}
