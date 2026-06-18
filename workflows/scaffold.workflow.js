export const meta = {
  name: 'reasonable-scaffold',
  description:
    'reasonable scaffolding phase: build the walking skeleton + parked top-level scenario suite (real wiring, thin behavior), verify the skeleton invariants read-only, scribe the derived index, and return a typed result. Ends AT the scaffold sign-off — the main session runs the blocking gate.',
  whenToUse:
    'Launched by the main-session scaffolding skill after analysis is ratified, to produce the walking skeleton greenfield. One run = one scaffold. The run never blocks on the human; it returns a typed result the main session uses for the (gated) sign-off.',
  phases: [
    { title: 'Build the skeleton', detail: 'scaffolder worker: real wiring end-to-end, thin behavior, parked scenario suite (compiling), loud stubs off-path, thin contracts born at the ledger in its own atomic commit' },
    { title: 'Verify invariants', detail: 'read-only verifier: suite green at every commit, parked tests compile, real wiring / thin behavior, no canned data off-path, no fake reachable from the production composition root' },
    { title: 'Scribe the index', detail: 'lone serialized journal-writer: advance journal.json to phase scaffolding -> ready for vertical-slice-execution and record the skeleton commit; null return is a HALT' },
  ],
}

// ---------------------------------------------------------------------------
// Inlined schemas (engine purity: no imports — every schema is a literal here).
// ---------------------------------------------------------------------------

// What the scaffolder (fenced mutator) returns. Its terminal side effects —
// skeleton code, parked suite, thin contracts, the contract-birth ledger lines —
// land in its OWN atomic commit (D3a authoritative state); this is the report of
// that commit, not the source of truth. `kind` is a small tagged union so the
// script can branch a build that could not complete the same way a trap is
// branched, without growing control flow.
const SCAFFOLD_BUILD = {
  type: 'object',
  additionalProperties: false,
  required: ['kind'],
  properties: {
    kind: {
      type: 'string',
      enum: ['built', 'infeasible', 'checkpoint', 'other'],
      description:
        'built = skeleton committed; infeasible = the chosen direction could not be wired thin-real (escalate, do NOT spike in-phase); checkpoint = budget ceiling hit mid-build; other = an unnamed wall, fail-safe to the human',
    },
    commit: { type: 'string', description: 'the skeleton commit SHA the worker landed (for the journal + sign-off); empty if not built' },
    promotedScenario: { type: 'string', description: 'the one top-level scenario the skeleton satisfies and that is GREEN, if any; empty otherwise' },
    parkedScenarios: { type: 'array', items: { type: 'string' }, description: 'the user-visible scenario tests written and parked (ignore-marked, compiling)' },
    thinContracts: { type: 'array', items: { type: 'string' }, description: 'component contracts born at thin depth (topology + the trivial behavior the skeleton wires)' },
    loudStubLoci: { type: 'array', items: { type: 'string' }, description: 'where the off-skeleton loud stubs live (the second burndown)' },
    ledgerBirths: { type: 'array', items: { type: 'string' }, description: 'the contract-birth ledger entries the worker appended in its own atomic commit (D3a)' },
    reason: { type: 'string', description: 'for infeasible / checkpoint / other: the binding constraint or wall, one line' },
  },
}

// What the read-only verifier returns. It re-checks the skeleton invariants with
// commands (test command, burndown, citation-resolve) — it never takes the
// scaffolder's word (External verification; "verify, don't trust"). It is
// read-only: it reports findings, fixes nothing.
const INVARIANT_REPORT = {
  type: 'object',
  additionalProperties: false,
  required: ['allGreen', 'checks', 'findings'],
  properties: {
    allGreen: { type: 'boolean', description: 'true ONLY if every invariant check passed and no finding stands' },
    parkedCount: { type: 'integer', description: 'parked-scenario count reported by burndown.mjs' },
    loudStubCount: { type: 'integer', description: 'loud-stub count reported by burndown.mjs (the off-path second burndown)' },
    checks: {
      type: 'array',
      description: 'one entry per invariant, each with the command run and its verbatim result — never an eyeball estimate',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['invariant', 'passed', 'evidence'],
        properties: {
          invariant: {
            type: 'string',
            enum: [
              'suite-green-at-every-commit',
              'parked-tests-compile',
              'real-wiring-thin-behavior',
              'no-canned-data-off-path',
              'no-fake-in-production-composition-root',
            ],
          },
          passed: { type: 'boolean' },
          command: { type: 'string', description: 'the command run for this invariant (e.g. the test command, burndown.mjs, citation-resolve.mjs); empty for a read-only spot-check' },
          evidence: { type: 'string', description: 'the command output or the spot-check observation that justifies passed' },
        },
      },
    },
    findings: {
      type: 'array',
      description: 'invariant violations that must be routed before sign-off (a red non-parked test, a non-compiling parked test, a stub calling a stub, canned data off-path, a fake in the composition root)',
      items: { type: 'string' },
    },
  },
}

// What the lone serialized scribe (journal-writer) returns. It writes ONLY
// journal.json + inbox.json (the derived, rebuildable index). A null `agent()`
// return — or an explicit ok:false — is a HALT upstream (D3b): the script must
// not proceed believing the transition persisted. The halt loses no truth;
// reconcile rebuilds the index from git + ledger.
const SCRIBE_ACK = {
  type: 'object',
  additionalProperties: false,
  required: ['ok'],
  properties: {
    ok: { type: 'boolean', description: 'true only if BOTH files were written and validate against their schemas; false is a HALT' },
    transition: { type: 'string', description: 'the exact transition persisted, e.g. "phase: analysis -> scaffolding; ready for vertical-slice-execution; skeleton commit recorded"' },
    reason: { type: 'string', description: 'on ok:false, the one-line reason the write could not complete (read as HALT)' },
  },
}

// ---------------------------------------------------------------------------
// Helpers (inlined — no imports).
// ---------------------------------------------------------------------------

// guard(): wrap an agent() call so a budget-ceiling THROW becomes a tagged
// checkpoint value instead of a crash (D16b). The engine throws once
// spent >= total; without this a real budget ceiling would be misread. A null
// agent() return (user-skip / terminal API error) is left as null for the caller
// to treat as a verification gap. Only the budget throw is re-tagged.
async function guard(thunk) {
  try {
    return await thunk()
  } catch (e) {
    return { kind: 'checkpoint', reason: 'budget ceiling reached: ' + (e && e.message ? e.message : String(e)) }
  }
}

// A pure helper: does the args object carry a usable runMode? Absent / null mode
// is never inferred here — it is surfaced (the architecture forbids inferring
// mode). The scaffold run does not block on it, but it threads it through so the
// main-session sign-off gate behaves by mode.
function modeOf(a) {
  const m = a && a.mode
  return m === 'gated' || m === 'autonomous' ? m : null
}

// Pure phrasing helpers so each agent's dispatch prompt is built from args
// rather than hard-coded paths. The agents do all I/O; the script only composes
// strings (no fs).
function scaffolderPrompt(a) {
  return [
    'Build the walking skeleton for this reasonable effort.',
    'Effort root: ' + (a.effortRoot || '(the target project root holding .reasonable/)') + '.',
    'reasonable plugin root: ' + (a.reasonableRoot || '$CLAUDE_PLUGIN_ROOT') + '.',
    'Read first: docs/glossary.md, the gate-mechanics skill (PARK / LOUD-STUB primitives + the stack binding table for stack "' + (a.stack || 'see config.json') + '"), and component-contract.',
    'Context manifest:',
    '- Topology sketch: ' + (a.topologyPath || '.reasonable/topology.md') + '.',
    '- Vision user stories (for the scenario suite): ' + (a.visionPath || '.reasonable/vision.md') + '.',
    '- Stack binding from ' + (a.configPath || '.reasonable/config.json') + ' (test command, park primitive, loud-stub primitive).',
    'Build, in your own ONE atomic commit (work product + your own contract-birth ledger lines + a trailer, together — git and the ledger never diverge):',
    '1. The walking skeleton — real wiring end-to-end (genuine function calls across real module boundaries, a real composition root), behavior trivial. This is the chosen direction and it SHIPS; it is NOT a spike.',
    '2. The parked top-level scenario suite — user-visible phrasing, ignore-marked "pending: vertical-slice N, <what>", and it MUST still compile / import-check (a parked test that does not compile pins nothing).',
    '3. Loud stubs everywhere off the skeleton path (panic/throw), NEVER canned data.',
    '4. Thin contracts — each component a contract file whose clauses state ONLY what the skeleton makes real (topology + the trivial behavior). Add NO behavioral musts beyond what the skeleton wires; behavior accrues later from gates.',
    'Append the contract births to the ledger inside the same atomic commit (authoritative state is your commit, not a downstream scribe).',
    'The suite is green at every commit: the one promoted scenario the skeleton satisfies (if any) is green; the rest are parked, never failing.',
    'If the chosen direction cannot be wired thin-real, return kind:"infeasible" with the binding constraint — do NOT explore or spike in-phase (escalate to the main session).',
  ].join('\n')
}

function verifyPrompt(a, build) {
  return [
    'Verify the walking skeleton\'s invariants for this reasonable effort. You are READ-ONLY: report findings, fix nothing. Do NOT take the scaffolder\'s word — re-check with commands.',
    'Effort root: ' + (a.effortRoot || '(the target project root)') + '. reasonable plugin root: ' + (a.reasonableRoot || '$CLAUDE_PLUGIN_ROOT') + '.',
    'The scaffolder reports skeleton commit ' + (build.commit || '(unknown)') + ', promoted scenario "' + (build.promotedScenario || 'none') + '", and parked scenarios: ' + JSON.stringify(build.parkedScenarios || []) + '.',
    'Run and report, one check each with the exact command + its verbatim output:',
    '- suite-green-at-every-commit: run the test command from config.json; the promoted scenario(s) are GREEN, the rest PARKED (not failing). Run `node <reasonableRoot>/lib/burndown.mjs` for the parked count + loud-stub count.',
    '- parked-tests-compile: confirm the suite BUILDS with the parked tests present (a parked test that does not compile pins nothing).',
    '- real-wiring-thin-behavior: spot-check that seams are genuine cross-module function calls through a real composition root, not stubs calling stubs.',
    '- no-canned-data-off-path: off-skeleton paths are loud stubs (panic/throw), never plausible fakes. Run `node <reasonableRoot>/lib/citation-resolve.mjs` to confirm the thin contracts\' citations resolve.',
    '- no-fake-in-production-composition-root: no fake is reachable from main\'s object graph (a wiring check, not a visibility check) — a parity violation even if tests pass.',
    'Set allGreen true ONLY if every check passed and no finding stands. Any red non-parked test, non-compiling parked test, stub-calling-stub, off-path canned data, or fake in the composition root is a finding that must be routed before sign-off.',
  ].join('\n')
}

function scribePrompt(a, build) {
  return [
    'Persist the scaffold transition into the derived index. You write ONLY journal.json and inbox.json — nothing else (authoritative state is the worker\'s atomic commit, never you).',
    'Effort root: ' + (a.effortRoot || '(the target project root)') + '. Read the current journal.json and inbox.json before editing — always. Match the schemas in docs/artifacts.md field-for-field; invent no fields.',
    'The transition the script decided: advance `phase` to "scaffolding" and mark the effort ready for "vertical-slice-execution"; record the skeleton commit ' + (build.commit || '(unknown)') + ' in the orchestrator\'s `commits` accounting; carry runMode = ' + (modeOf(a) || '(unset)') + ' forward unchanged in any field you already track.',
    'Do NOT touch the ledger, contracts, or code. Do NOT auto-resolve any inbox item (silence never consents).',
    'If you cannot complete a clean, faithful write, return ok:false with a one-line reason — the script reads that as a HALT and loses no truth (reconcile rebuilds the index from git + ledger). Never report a partial write as success.',
  ].join('\n')
}

// ---------------------------------------------------------------------------
// The run. scaffolder worker -> invariant-verify (read-only) -> scribe -> return.
// Three serial stages: each depends on the previous, so this is a plain
// sequence, not parallel()/pipeline(). The run never blocks on the human; it
// returns a typed result and the main session runs the (gated) sign-off gate.
// ---------------------------------------------------------------------------

const a = args || {}
const mode = modeOf(a)

phase('Build the skeleton')
log('Scaffolding: dispatching the scaffolder to build the walking skeleton (real wiring, thin behavior, parked suite, loud stubs).')

const build = await guard(() =>
  agent(scaffolderPrompt(a), {
    label: 'scaffolder',
    phase: 'Build the skeleton',
    agentType: 'reasonable:scaffolder',
    schema: SCAFFOLD_BUILD,
  })
)

// null = user-skip or terminal API error after retries -> the skeleton did not
// build -> HALT (no green to verify, no commit to scribe). A checkpoint value
// from guard() is the budget ceiling, also a clean stop.
if (build === null) {
  return { kind: 'halt', reason: 'scaffolder returned null (user-skip or terminal error): no skeleton built' }
}
if (build.kind === 'checkpoint') {
  return { kind: 'budget-exhausted', stage: 'build', reason: build.reason }
}
if (build.kind === 'infeasible') {
  // The chosen direction could not be wired thin-real. This is a human decision
  // (re-spec the skeleton / re-plan the route) — it is NOT something the run
  // resolves by spiking in-phase (one-level nesting forbids it anyway).
  return { kind: 'blocked', stage: 'build', outcome: 'infeasible', reason: build.reason }
}
if (build.kind === 'other') {
  // An unnamed wall the schema could not tag — fail safe to the human.
  return { kind: 'blocked', stage: 'build', outcome: 'other', reason: build.reason }
}
// build.kind === 'built' from here.
log('Skeleton built at ' + (build.commit || '(commit unknown)') + '. Verifying invariants read-only (verify, do not trust).')

phase('Verify invariants')
const report = await guard(() =>
  agent(verifyPrompt(a, build), {
    label: 'invariant-verify',
    phase: 'Verify invariants',
    agentType: 'reasonable:auditor',
    schema: INVARIANT_REPORT,
  })
)

if (report === null) {
  return { kind: 'halt', reason: 'invariant verifier returned null: skeleton invariants unverified, cannot sign off' }
}
if (report.kind === 'checkpoint') {
  return { kind: 'budget-exhausted', stage: 'verify', reason: report.reason, build }
}
if (!report.allGreen) {
  // A skeleton invariant failed (a regression, a non-compiling parked test, a
  // fake in the composition root, ...). Sign-off cannot proceed; the main
  // session fixes before re-running. Loses no truth — nothing was scribed.
  return { kind: 'invariants-failed', findings: report.findings, report, build }
}
log('Invariants green: parked=' + (report.parkedCount ?? '?') + ', loud-stubs=' + (report.loudStubCount ?? '?') + '. Scribing the derived index.')

phase('Scribe the index')
const ack = await agent(scribePrompt(a, build), {
  label: 'journal-writer',
  phase: 'Scribe the index',
  agentType: 'reasonable:journal-writer',
  schema: SCRIBE_ACK,
})

// The scribe is the one place a null / ok:false is a hard HALT (D3b): the script
// must not return "scaffold ready" while believing a transition persisted that
// did not. The halt is safe — the index is derived; reconcile rebuilds it.
if (ack === null) {
  return { kind: 'halt', reason: 'scribe-null: derived index (journal/inbox) not persisted' }
}
if (!ack.ok) {
  return { kind: 'halt', reason: 'scribe-halt: ' + (ack.reason || 'index not persisted faithfully') }
}

// Ends AT the scaffold sign-off — the LAST one-time ratification before the
// vertical-slice loop. The run does NOT block on the human (the engine cannot,
// and silence must never ratify). It returns the evidence; the main session runs
// the blocking gate in gated mode, or self-ratifies-and-logs in autonomous mode.
log('Scaffold ready. Returning to the main session for the sign-off gate.')
return {
  kind: 'scaffold-ready',
  mode,
  signOff: mode === 'gated' ? 'blocking-in-main-session' : 'self-ratify-and-log',
  evidence: {
    skeletonCommit: build.commit,
    promotedScenario: build.promotedScenario || null,
    parkedCount: report.parkedCount ?? null,
    parkedScenarios: build.parkedScenarios || [],
    loudStubCount: report.loudStubCount ?? null,
    loudStubLoci: build.loudStubLoci || [],
    thinContracts: build.thinContracts || [],
    ledgerBirths: build.ledgerBirths || [],
    invariantChecks: report.checks,
  },
}
