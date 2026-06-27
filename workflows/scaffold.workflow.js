// scaffold.workflow.js - the greenfield scaffolding phase: build the walking skeleton,
// verify its structural invariants, verify its BORN CONTRACTS against an oracle above them,
// scribe the index, and return a typed result for the (gated) sign-off.
//
// THE LANE (D7, the characterization model). The scaffolder is a FENCED MUTATOR: it births
// the thin contracts + skeleton + ledger lines. Run in the main checkout it has no lane
// descriptor, so the floor-containment fence FAILS OPEN and there is no pre-integration diff
// to judge. So before the scaffolder runs we PROVISION A LANE (reasonable:lane-provisioner):
// a real registered worktree + a `.reasonable-lane.json` descriptor + a journal record, in
// that order, so the fence is armed and the born contracts exist ABOVE the floor before they
// are integrated. The scaffolder is scoped INTO the lane (laneScoped); the read-only verifiers
// keep the un-narrowed args. Provision-then-scope is the standard lane-mutator shape.
//
// THE TWO VERIFICATIONS, DISTINCT. (1) The STRUCTURAL invariant-verify (existing, read-only
// auditor): is the suite green, parked tests compiling, the wiring real, no fake in the
// composition root? It is decidable - a script settles it. (2) The BORN-CONTRACT ADVERSARY
// (Law 3 corollary, the verification trio): do the born thin contracts' clauses OVER- or
// UNDER-claim what the skeleton actually wires? That is a semantic judgment no script can
// compute, so a fresh-context, read-only-by-capability reasonable:intent-verifier judges each
// born contract against the TOPOLOGY + VISION oracle that sits ABOVE the artifact (D9 - the
// contracts were derived subtractively from topology + vision, so judging them against that
// promise is non-circular; judging them against the skeleton they describe would be
// tautological). It PROPOSES accept|reject|escalate as DATA and self-executes nothing (Law 3
// corollary). The orchestrator routes: reject -> the main session re-specs the contract (a
// fixed control flow cannot grow an unbounded re-author loop, so a reject crosses to the human
// just like an infeasible build); escalate -> the human inbox (autonomous: joins the
// always-escalate classes, D8); accept -> a narrow writer records a `verifier-verdict` ledger
// append (D5) that ANNOTATES the contract as explained-by-verdict (D6, annotate-not-disarm -
// advisory only). RISK-GATED (D7): ALWAYS run where a born contract touches a shared contract
// (a Citations bullet to a neighbour) or floor-tracked state; it may be skipped only for a
// contract boxed into a brand-new component nothing depends on yet. The human sign-off then
// ratifies a PRE-VERIFIED artifact.
//
// PURITY. Plain JS, no imports, no fs / Date.now / random in the script body (they THROW). All
// side effects happen INSIDE agents. The script only orchestrates. `meta` is a pure literal.
export const meta = {
  name: 'reasonable-scaffold',
  description:
    'reasonable scaffolding phase: build the walking skeleton + parked top-level scenario suite (real wiring, thin behavior), verify the skeleton invariants read-only, scribe the derived index, and return a typed result. Ends AT the scaffold sign-off - the main session runs the blocking gate.',
  whenToUse:
    'Launched by the main-session scaffolding skill after analysis is ratified, to produce the walking skeleton greenfield. One run = one scaffold. The run never blocks on the human; it returns a typed result the main session uses for the (gated) sign-off.',
  phases: [
    { title: 'Provision', detail: 'reasonable:lane-provisioner births a real registered worktree + .reasonable-lane.json descriptor + journal record BEFORE the scaffolder mutates, so the fence is armed (never fails open in the main checkout) and the born contracts exist as a pre-integration diff the adversary can judge.' },
    { title: 'Build the skeleton', detail: 'scaffolder worker (in the lane): real wiring end-to-end, thin behavior, parked scenario suite (compiling), loud stubs off-path, thin contracts born at the ledger in its own atomic commit' },
    { title: 'Verify invariants', detail: 'read-only STRUCTURAL verifier: suite green at every commit, parked tests compile, real wiring / thin behavior, no canned data off-path, no fake reachable from the production composition root' },
    { title: 'Verify born contracts', detail: 'risk-gated born-contract adversary (reasonable:intent-verifier, fresh context, read-only): judges each born thin contract against the TOPOLOGY + VISION oracle ABOVE the artifact (do the clauses over/under-claim what the skeleton actually wires?), distinct from the structural invariant-verify; proposes accept|reject|escalate; reject -> the main session re-specs, escalate -> human inbox, accept -> verifier-verdict ledger append (annotate-not-disarm).' },
    { title: 'Scribe the index', detail: 'lone serialized journal-writer: advance journal.json to phase scaffolding -> ready for vertical-slice-execution and record the skeleton commit; null return is a HALT' },
  ],
}

// ---------------------------------------------------------------------------
// Inlined schemas (engine purity: no imports - every schema is a literal here).
// ---------------------------------------------------------------------------

// What the scaffolder (fenced mutator) returns. Its terminal side effects -
// skeleton code, parked suite, thin contracts, the contract-birth ledger lines -
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
    bornContracts: {
      type: 'array',
      description: 'one entry per born thin contract, carrying the D7 risk-gate signals the born-contract adversary keys off - distinct from the bare name list above',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['component', 'path'],
        properties: {
          component: { type: 'string', description: 'the component whose contract was born' },
          path: { type: 'string', description: 'the contract file the scaffolder wrote (e.g. .reasonable/contracts/<component>.md)' },
          clauses: { type: 'array', items: { type: 'string' }, description: 'the born clause ids stating only what the skeleton wires' },
          citationsAdded: { type: 'boolean', description: 'the born contract added a `## Citations` bullet - i.e. it enriched / depends on a SHARED contract. Drives the D7 risk-gate (shared-contract touch ALWAYS runs the adversary).' },
          touchesFloor: { type: 'boolean', description: 'the born contract lands on or pins floor-tracked state. Drives the D7 risk-gate (a floor touch ALWAYS runs the adversary).' },
        },
      },
    },
    loudStubLoci: { type: 'array', items: { type: 'string' }, description: 'where the off-skeleton loud stubs live (the second burndown)' },
    ledgerBirths: { type: 'array', items: { type: 'string' }, description: 'the contract-birth ledger entries the worker appended in its own atomic commit (D3a)' },
    reason: { type: 'string', description: 'for infeasible / checkpoint / other: the binding constraint or wall, one line' },
  },
}

// What the lane-provisioner hands back. The scaffolder is a FENCED MUTATOR, so it must run inside
// a real registered worktree carrying a `.reasonable-lane.json` descriptor - never the main checkout,
// where the floor-containment fence fails open (D7). A null/false ack is a HALT: no armed fence =>
// no legitimate place to build, and no pre-integration diff for the born-contract adversary to judge.
const PROVISION_ACK = {
  type: 'object',
  additionalProperties: false,
  required: ['provisioned'],
  properties: {
    provisioned: { type: 'boolean', description: 'worktree + .reasonable-lane.json descriptor + journal record all present, in that order (idempotent on re-run)' },
    worktree: { type: ['string', 'null'], description: 'the lane worktree path the scaffolder must cwd into - a real registered worktree, NEVER the main checkout' },
    branch: { type: ['string', 'null'], description: 'the lane branch' },
    descriptorWritten: { type: 'boolean', description: 'the .reasonable-lane.json descriptor exists at the worktree root so the fence is armed (no fail-open-in-main-checkout window)' },
    noOp: { type: 'boolean', description: 'true iff the lane already existed and provisioning was an idempotent no-op' },
    reason: { type: 'string', description: 'on a false/absent provision, the one-line reason (read as HALT)' },
  },
}

// What the read-only verifier returns. It re-checks the skeleton invariants with
// commands (test command, burndown, citation-resolve) - it never takes the
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
      description: 'one entry per invariant, each with the command run and its verbatim result - never an eyeball estimate',
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

// One born-contract adversary verdict on one PROPOSED born contract (the canonical
// verifier-verdict shape - matches docs/artifacts.md).
// The adversary is read-only by capability and PROPOSES the verdict as DATA (proposed:true);
// a narrow writer (the orchestrator) performs the ledger append - it never self-executes the
// act its verdict authorizes (Law 3 corollary). The reference (`oracle`) is TOPOLOGY + VISION,
// ABOVE the artifact (D9): it judges "do these born clauses over- or under-claim what the
// skeleton actually wires, given the topology sketch + the vision?" - NEVER against the
// skeleton the contract describes (that agreement is tautological).
const VERIFIER_VERDICT = {
  type: 'object',
  additionalProperties: false,
  required: ['component', 'verdict', 'oracle', 'proposed'],
  properties: {
    component: { type: 'string', description: 'the component whose born contract this verdict judges (joins back to bornContracts)' },
    diffRef: { type: ['string', 'null'], description: 'the born-contract diff / commit / content hash judged (content-references the artifact)' },
    verdict: { type: 'string', enum: ['accept', 'reject', 'escalate'], description: 'accept = the clauses claim exactly what the skeleton wires, faithful to topology + vision; reject = the clauses over- or under-claim against topology + vision -> back to the main session to re-spec; escalate = genuinely unsettleable (two defensible readings the oracle cannot settle) -> human inbox' },
    oracle: { type: 'string', description: 'the named reference judged against - TOPOLOGY + VISION, which sit ABOVE the born contract in the derivation order (the contract is derived subtractively from them)' },
    by: { type: 'string', description: 'the judging actor - "intent-verifier"' },
    proposed: { type: 'boolean', description: 'always true: the adversary PROPOSES; it never integrates. The orchestrator (a narrow writer) performs any resulting append.' },
    touchesSharedOrFloor: { type: 'boolean', description: 'why the adversary ran at all (D7 risk-gate): the born contract enriches a shared contract or touches floor-tracked state. False => the orchestrator could have skipped it (boxed into a brand-new component).' },
    reason: { type: ['string', 'null'], description: 'terse justification against the named oracle - for a reject, the specific over/under-claim and the topology/vision clause it violates; for an escalate, the two defensible readings the oracle cannot settle' },
  },
}

// What the lone serialized scribe (journal-writer) returns. It writes ONLY
// journal.json + inbox.json (the derived, rebuildable index). A null `agent()`
// return - or an explicit ok:false - is a HALT upstream (D3b): the script must
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
// Helpers (inlined - no imports).
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
// is never inferred here - it is surfaced (the architecture forbids inferring
// mode). The scaffold run does not block on it, but it threads it through so the
// main-session sign-off gate behaves by mode.
function modeOf(a) {
  const m = a && a.mode
  return m === 'gated' || m === 'autonomous' ? m : null
}

// THE TWO-ROOT MODEL (the lane-root fix). effortRoot (canonical, STAYS PUT) owns ALL
// `.reasonable/` state - the thin contracts, the contract-birth ledger lines - read AND written
// there (gitignored, durable on disk). laneRoot (the provisioned worktree) holds CODE (the
// skeleton + the parked suite) and is the cwd for `git -C`. laneScoped ADDS laneRoot; it must
// NEVER overwrite effortRoot - overwriting it pointed the scaffolder at the gitignored, EMPTY
// worktree `.reasonable/` (the incident). EMPIRICALLY VERIFIED: a workflow subagent's cwd is
// always the effort root (never the worktree), so the scaffolder writes code by absolute path
// under laneDir(a) and commits with `git -C laneDir(a)`; it writes `.reasonable/` at the absolute
// effortRoot. Read-only roles read the canonical `.reasonable/` (effortRoot is unchanged for them).
function laneDir(a) { return (a && a.laneRoot) || (a && a.effortRoot) || '(the lane worktree)' }
function laneScoped(a, worktree) {
  return worktree ? { ...a, laneRoot: worktree } : a
}

// The born-contract adversary risk-gate (pure - D7). The supervision dial may ONLY let a PRESENT
// human trade a check for speed; it can NEVER let an autonomous run disable a guard. So gate by
// RISK = WHAT THE CONTRACT TOUCHES, never by trust: a born contract touches PROTECTED state when
// it enriches a SHARED contract (a `## Citations` bullet to a neighbour) or lands on floor-tracked
// state. ALWAYS verify those. A born contract may be skipped ONLY when it is boxed into a brand-new
// component nothing depends on yet (no shared-contract citation, no floor touch). In AUTONOMOUS mode
// the gate stays maximally paranoid; in GATED mode the present human is the net, so a boxed-in
// contract may be skipped - but a shared/floor touch is OFF the dial entirely (non-waivable).
function contractTouchesProtectedState(c) {
  if (!c || typeof c.component !== 'string') return false
  return c.citationsAdded === true || c.touchesFloor === true
}

// Pure phrasing helpers so each agent's dispatch prompt is built from args
// rather than hard-coded paths. The agents do all I/O; the script only composes
// strings (no fs).
function lanePrompt(a) {
  return [
    'You are the lane-provisioner. Provision the lane for the greenfield scaffolding phase, idempotently,',
    'BEFORE the scaffolder (a fenced mutator) writes any CODE. The lane gives the scaffolder a real registered',
    'worktree on a lane branch (so the skeleton lands as a pre-integration diff the born-contract adversary can',
    'judge) plus a `.reasonable-lane.json` descriptor (so the fence governs its code edits).',
    'Effort root (canonical .reasonable/ - the descriptor back-pointer target): ' + (a.effortRoot || '(the target project root holding .reasonable/)') + '. reasonable plugin root: ' + (a.reasonableRoot || '$CLAUDE_PLUGIN_ROOT') + '.',
    'Do exactly three things in order (the ordering is the safety property): (1) `git -C ' + (a.effortRoot || '.') + ' worktree',
    'add ' + (a.effortRoot || '.') + '/.worktrees/<wo-id> -b <lane-branch>` - a real registered worktree NESTED UNDER the',
    'effort root (so findEffortRoot resolves the canonical .reasonable/ from inside it), NOT an engine throwaway;',
    '(2) write the one `.reasonable-lane.json` descriptor at the new worktree root, narrowed for the scaffolder',
    'role (contractBirth:true, the scaffold locus), with the `effortRoot` back-pointer = ' + (a.effortRoot || '.') + ';',
    '(3) record the lane in the journal via the scribe - all before the scaffolder is dispatched. Idempotent: an',
    'existing registered worktree + present correct descriptor + recorded journal lane is a no-op success.',
    'TWO-ROOT SPLIT: the worktree holds CODE only; do NOT seed `.reasonable/` into it - effort state stays',
    'canonical at the effort root (gitignored), reached from the worktree via the descriptor back-pointer.',
    'Return the PROVISION_ACK: the worktree path (the scaffolder writes code there via `git -C` + absolute paths),',
    'and confirmation the descriptor is written. A false/absent descriptor is a HALT - never build lane-less.',
  ].join('\n')
}

function scaffolderPrompt(a) {
  return [
    'Build the walking skeleton for this reasonable effort.',
    'Effort root (canonical .reasonable/ - read AND write here, by absolute path): ' + (a.effortRoot || '(the target project root holding .reasonable/)') + '.',
    'Lane worktree (CODE lives here; cwd for git): ' + laneDir(a) + '.',
    'TWO ROOTS, by DOMAIN. The skeleton + parked suite are CODE: write them under the worktree and commit with',
    '`git -C ' + laneDir(a) + '`. The thin contracts + the contract-birth ledger lines are `.reasonable/` state:',
    'write them to the CANONICAL effort root by ABSOLUTE path - NOT into the worktree (its `.reasonable/` is',
    'gitignored, lost at teardown, and fence-denied). Your process cwd is the effort root; use absolute paths',
    'for both and `git -C` for every git command.',
    'reasonable plugin root: ' + (a.reasonableRoot || '$CLAUDE_PLUGIN_ROOT') + '.',
    'Read first: docs/glossary.md, the gate-mechanics skill (PARK / LOUD-STUB primitives + the stack binding table for stack "' + (a.stack || 'see config.json') + '"), and component-contract.',
    'Context manifest (all canonical, under the effort root):',
    '- Topology sketch: ' + (a.topologyPath || (a.effortRoot || '.') + '/.reasonable/topology.md') + '.',
    '- Vision user stories (for the scenario suite): ' + (a.visionPath || (a.effortRoot || '.') + '/.reasonable/vision.md') + '.',
    '- Stack binding from ' + (a.configPath || (a.effortRoot || '.') + '/.reasonable/config.json') + ' (test command, park primitive, loud-stub primitive).',
    'Land your work as ONE logical step (D3a/D5): the CODE in a single `git -C ' + laneDir(a) + '` commit carrying a',
    '`Work-Order:` trailer; the contract-birth ledger lines as on-disk appends to the CANONICAL ledger that',
    'content-reference that commit SHA - the ledger is gitignored, NEVER part of the git commit:',
    '1. The walking skeleton - real wiring end-to-end (genuine function calls across real module boundaries, a real composition root), behavior trivial. This is the chosen direction and it SHIPS; it is NOT a spike.',
    '2. The parked top-level scenario suite - user-visible phrasing, ignore-marked "pending: vertical-slice N, <what>", and it MUST still compile / import-check (a parked test that does not compile pins nothing).',
    '3. Loud stubs everywhere off the skeleton path (panic/throw), NEVER canned data.',
    '4. Thin contracts - each component a CANONICAL `' + (a.effortRoot || '.') + '/.reasonable/contracts/<component>.md` whose clauses state ONLY what the skeleton makes real (topology + the trivial behavior). Add NO behavioral musts beyond what the skeleton wires; behavior accrues later from gates.',
    'Append the contract births to the CANONICAL `' + (a.effortRoot || '.') + '/.reasonable/ledger.jsonl` on disk, each content-referencing the skeleton commit SHA (D5) - NOT inside the git commit (the ledger is gitignored).',
    'The suite is green at every commit: the one promoted scenario the skeleton satisfies (if any) is green; the rest are parked, never failing.',
    'Report each born contract in `bornContracts` (component, path, clause ids) AND its two D7 risk-gate',
    'signals - `citationsAdded` (the contract added a `## Citations` bullet, i.e. it enriches/depends on a',
    'SHARED neighbour contract) and `touchesFloor` (it lands on or pins floor-tracked state). These drive the',
    'born-contract adversary that judges your clauses against topology + vision BEFORE sign-off; report them',
    'honestly (a missed shared/floor touch would skip a non-waivable check).',
    'If the chosen direction cannot be wired thin-real, return kind:"infeasible" with the binding constraint - do NOT explore or spike in-phase (escalate to the main session).',
  ].join('\n')
}

function verifyPrompt(a, build) {
  return [
    'Verify the walking skeleton\'s invariants for this reasonable effort. You are READ-ONLY: report findings, fix nothing. Do NOT take the scaffolder\'s word - re-check with commands.',
    'Effort root (canonical .reasonable/): ' + (a.effortRoot || '(the target project root)') + '. Lane worktree (where the skeleton code lives): ' + laneDir(a) + '. reasonable plugin root: ' + (a.reasonableRoot || '$CLAUDE_PLUGIN_ROOT') + '.',
    'The scaffolder reports skeleton commit ' + (build.commit || '(unknown)') + ', promoted scenario "' + (build.promotedScenario || 'none') + '", and parked scenarios: ' + JSON.stringify(build.parkedScenarios || []) + '.',
    'The skeleton CODE is on the lane branch in the worktree - run all code/test commands there (cwd `' + laneDir(a) + '`), NOT the main checkout. Run and report, one check each with the exact command + its verbatim output:',
    '- suite-green-at-every-commit: run the test command from config.json IN THE WORKTREE; the promoted scenario(s) are GREEN, the rest PARKED (not failing). Run `node ' + (a.reasonableRoot || '$CLAUDE_PLUGIN_ROOT') + '/lib/burndown.mjs --root ' + (a.effortRoot || '.') + '` for the parked count + loud-stub count.',
    '- parked-tests-compile: confirm the suite BUILDS in the worktree with the parked tests present (a parked test that does not compile pins nothing).',
    '- real-wiring-thin-behavior: spot-check that seams are genuine cross-module function calls through a real composition root, not stubs calling stubs.',
    '- no-canned-data-off-path: off-skeleton paths are loud stubs (panic/throw), never plausible fakes. Run `node ' + (a.reasonableRoot || '$CLAUDE_PLUGIN_ROOT') + '/lib/citation-resolve.mjs --root ' + (a.effortRoot || '.') + '` to confirm the thin contracts\' citations resolve.',
    '- no-fake-in-production-composition-root: no fake is reachable from main\'s object graph (a wiring check, not a visibility check) - a parity violation even if tests pass.',
    'Set allGreen true ONLY if every check passed and no finding stands. Any red non-parked test, non-compiling parked test, stub-calling-stub, off-path canned data, or fake in the composition root is a finding that must be routed before sign-off.',
  ].join('\n')
}

function bornContractPrompt(a, contract, build) {
  return [
    'You are the born-contract ADVERSARY (an intent-verifier instance) for ONE proposed born thin contract.',
    'Fresh context, read-only BY CAPABILITY (Read/Grep/Glob; Bash ONLY if your judgment requires running a',
    'command). You PROPOSE a verdict; you NEVER integrate it and you fix NOTHING - the orchestrator (a narrow',
    'writer) performs any resulting ledger append (Law 3 corollary). This is DISTINCT from the structural',
    'invariant-verify (compile / green / real-wiring / no-fake-in-composition-root): that is decidable and',
    'already ran. You judge SEMANTICS no script can compute.',
    'Effort root: ' + (a.effortRoot || '(the target project root)') + '. reasonable plugin root: ' + (a.reasonableRoot || '$CLAUDE_PLUGIN_ROOT') + '.',
    'Proposed born contract: component ' + JSON.stringify(contract.component) + ', file ' + JSON.stringify(contract.path || null) + ', born clauses ' + JSON.stringify(contract.clauses || []) + '.',
    'It was born in skeleton commit ' + (build.commit || '(unknown)') + '.',
    'YOUR REFERENCE (the oracle, ABOVE the artifact): the TOPOLOGY sketch + the VISION user stories',
    '(' + (a.topologyPath || '.reasonable/topology.md') + ' + ' + (a.visionPath || '.reasonable/vision.md') + ').',
    'The born contract was derived SUBTRACTIVELY from topology + vision, so they sit above it - judge against',
    'THEM, never against the skeleton the contract describes (that agreement would be tautological).',
    'Judge ONLY the over/under-claim axis:',
    '  - UNDER-CLAIM: do the clauses omit a wiring the skeleton actually makes real (a seam the topology',
    '    declares and the skeleton wires, but the contract is silent on)?',
    '  - OVER-CLAIM: do the clauses assert behaviour the skeleton does NOT yet wire (a behavioral must beyond',
    '    the trivial behavior - that is vertical-slice work that leaked into a thin contract), or cite a',
    '    neighbour the topology does not sanction?',
    '  - SEAM/SCOPE: is each clause at the right component, in topology-consistent terms, not reaching past',
    '    its declared locus?',
    'SCOPE LIMIT - be honest: you do NOT judge whether the chosen DIRECTION is right (that was analysis',
    'ratification) and you do NOT re-run the structural invariants (decidable, already verified). You certify',
    'that the born clauses claim EXACTLY what the skeleton wires, faithful to topology + vision.',
    'Return the VERIFIER_VERDICT: verdict accept|reject|escalate, oracle = "topology + vision" (named, above',
    'the artifact), by:"intent-verifier", proposed:true. accept = the clauses match what the skeleton wires.',
    'reject = a cited over- or under-claim against topology/vision (routes back to the main session to',
    're-spec the contract - cite the specific clause and the topology/vision it violates). escalate = two',
    'defensible readings the oracle cannot settle (routes to the human inbox; in autonomous mode it joins the',
    'always-escalate classes). A wrong ACCEPT corrupts effort truth - say only what the reference supports.',
  ].join('\n')
}

function verdictWriterPrompt(a, verdict, contract, build) {
  return [
    'You are a NARROW WRITER. The born-contract ADVERSARY proposed a verdict as data; it is read-only and',
    'never integrates its own verdict (Law 3 corollary). You perform the one resulting act: append ONE',
    'verifier-verdict event to the append-only ledger, content-referencing the born contract it judged.',
    'Effort root: ' + (a.effortRoot || '(the target project root)') + '. reasonable plugin root: ' + (a.reasonableRoot || '$CLAUDE_PLUGIN_ROOT') + '.',
    'Append exactly this event to the CANONICAL `' + (a.effortRoot || '.') + '/.reasonable/ledger.jsonl` (one JSON line;',
    'on-disk append, NOT a git commit of orchestration state - verdict durability is the atomic on-disk append, D5):',
    '  ' + JSON.stringify({
      type: 'verifier-verdict',
      component: contract.component,
      diffRef: verdict.diffRef || build.commit || null,
      verdict: verdict.verdict,
      oracle: verdict.oracle,
      by: 'intent-verifier',
      proposed: true,
    }),
    'Add the ledger seq and the code commit/hash the contract landed (`commit` = ' + (build.commit || 'the live skeleton commit') + ') from the live ledger/git - do not invent them.',
    'This verdict ANNOTATES the born contract as explained-by-verdict: ADVISORY ONLY (D6). It does NOT silence',
    'any backstop and does NOT remove the diff from reconcile - a missing or half-written verdict can only',
    'cause MORE human surfacing, never less. Write nothing but this one ledger line. Return the SCRIBE_ACK',
    '(ok:true once the line is durably appended).',
  ].join('\n')
}

function scribePrompt(a, build) {
  return [
    'Persist the scaffold transition into the derived index. You write ONLY journal.json and inbox.json - nothing else (authoritative state is the worker\'s atomic commit, never you).',
    'Effort root: ' + (a.effortRoot || '(the target project root)') + '. Read the current journal.json and inbox.json before editing - always. Match the schemas in docs/artifacts.md field-for-field; invent no fields.',
    'The transition the script decided: advance `phase` to "scaffolding" and mark the effort ready for "vertical-slice-execution"; record the skeleton commit ' + (build.commit || '(unknown)') + ' in the orchestrator\'s `commits` accounting; carry runMode = ' + (modeOf(a) || '(unset)') + ' forward unchanged in any field you already track.',
    'Do NOT touch the ledger, contracts, or code. Do NOT auto-resolve any inbox item (silence never consents).',
    'If you cannot complete a clean, faithful write, return ok:false with a one-line reason - the script reads that as a HALT and loses no truth (reconcile rebuilds the index from git + ledger). Never report a partial write as success.',
  ].join('\n')
}

// ---------------------------------------------------------------------------
// The run. scaffolder worker -> invariant-verify (read-only) -> scribe -> return.
// Three serial stages: each depends on the previous, so this is a plain
// sequence, not parallel()/pipeline(). The run never blocks on the human; it
// returns a typed result and the main session runs the (gated) sign-off gate.
// ---------------------------------------------------------------------------

const a = { ...(args || {}) } // mutable copy - never mutate the frozen `args` global
const mode = modeOf(a)

// 1. Provision the lane BEFORE the scaffolder mutates (D7, the characterization model). The
//    scaffolder is a fenced MUTATOR; in the main checkout its fence fails OPEN, so we never let
//    it build there. The lane-provisioner births a real registered worktree + descriptor + journal
//    record, in that order, so the fence is armed and the born contracts exist as a pre-integration
//    diff. A null/false ack is a HALT - no armed fence is no legitimate place to build.
phase('Provision')
log('Provision: birthing the scaffold lane (worktree + descriptor + journal) so the fence is armed and the born contracts exist as a pre-integration diff.')
const lane = await guard(() =>
  agent(lanePrompt(a), {
    label: 'lane-provisioner',
    phase: 'Provision',
    agentType: 'reasonable:lane-provisioner',
    schema: PROVISION_ACK,
  })
)
if (lane === null) {
  return { kind: 'halt', reason: 'lane-provisioner returned null (user-skip or terminal error): no armed lane; refusing to build in the main checkout where the floor-containment fence fails open (D7)' }
}
if (lane.kind === 'checkpoint') {
  return { kind: 'budget-exhausted', stage: 'provision', reason: lane.reason }
}
if (lane.provisioned !== true || lane.descriptorWritten !== true || !lane.worktree) {
  // No armed worktree path to direct the scaffolder into; falling back to a.effortRoot would build
  // in the main checkout - the exact lane-less hazard. Refuse rather than silently mutate it.
  return { kind: 'halt', reason: 'lane not provisioned (provisioned:false / descriptor absent / no worktree path): ' + (lane.reason || 'refusing to fall back to the main checkout where the fence fails open (D7)') }
}
// The scaffolder (fenced mutator) is governed by the lane it just provisioned: narrow its effort
// root to the worktree where the fence is armed. Read-only roles keep the un-narrowed args.
const laneArgs = laneScoped(a, lane.worktree)
log('Provision: lane ready at ' + lane.worktree + '; the fence is armed. Scaffolder scoped to the worktree.')

phase('Build the skeleton')
log('Scaffolding: dispatching the scaffolder to build the walking skeleton (real wiring, thin behavior, parked suite, loud stubs).')

const build = await guard(() =>
  agent(scaffolderPrompt(laneArgs), {
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
  // (re-spec the skeleton / re-plan the route) - it is NOT something the run
  // resolves by spiking in-phase (one-level nesting forbids it anyway).
  return { kind: 'blocked', stage: 'build', outcome: 'infeasible', reason: build.reason }
}
if (build.kind === 'other') {
  // An unnamed wall the schema could not tag - fail safe to the human.
  return { kind: 'blocked', stage: 'build', outcome: 'other', reason: build.reason }
}
// build.kind === 'built' from here.
log('Skeleton built at ' + (build.commit || '(commit unknown)') + '. Verifying invariants read-only (verify, do not trust).')

phase('Verify invariants')
const report = await guard(() =>
  // laneArgs (not a): the skeleton code is on the lane branch in the worktree, so the
  // structural verifier must run the suite there (laneDir(a)); it reads the floor canonically.
  agent(verifyPrompt(laneArgs, build), {
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
  // session fixes before re-running. Loses no truth - nothing was scribed.
  return { kind: 'invariants-failed', findings: report.findings, report, build }
}
log('Invariants green: parked=' + (report.parkedCount ?? '?') + ', loud-stubs=' + (report.loudStubCount ?? '?') + '. Verifying the born contracts against topology + vision.')

// Verify born contracts (the verification trio, Law 3 corollary). The structural invariant-verify
// settled the DECIDABLE questions (compile / green / real-wiring / no-fake-in-composition-root).
// This step settles the SEMANTIC one a script cannot compute: do the born thin contracts' clauses
// OVER- or UNDER-claim what the skeleton actually wires? A fresh-context, read-only-by-capability
// born-contract adversary (an intent-verifier instance) judges each born contract against the
// TOPOLOGY + VISION oracle ABOVE the artifact (D9) and PROPOSES accept|reject|escalate as DATA - it
// never self-executes. RISK-GATED (D7): ALWAYS run it where a born contract enriches a shared
// contract (a Citations bullet) or touches floor-tracked state; SKIP only a contract boxed into a
// brand-new component nothing depends on yet. The orchestrator routes: reject -> the main session
// re-specs (a fixed control flow cannot grow an unbounded re-author loop; a reject crosses to the
// human like an infeasible build). escalate -> the human inbox (autonomous: joins the always-
// escalate classes, D8). accept -> a NARROW WRITER appends the verifier-verdict (D5), which
// ANNOTATES the contract explained-by-verdict (D6, advisory only). The human sign-off then ratifies
// a PRE-VERIFIED artifact. guard()-wrapped so a budget ceiling is a checkpoint, never a misread gap.
phase('Verify born contracts')
const bornContracts = Array.isArray(build.bornContracts) ? build.bornContracts : []
const contractVerdicts = []
const contractEscalations = []
const contractRejections = []
for (let i = 0; i < bornContracts.length; i++) {
  const contract = bornContracts[i]
  if (!contractTouchesProtectedState(contract)) {
    // Boxed into a brand-new component nothing depends on yet - the risk-gate lets it past
    // unverified, in EITHER run mode (the dial trades a check for speed, never disables a guard;
    // a shared/floor touch is off the dial entirely).
    log('Verify born contracts: ' + contract.component + ' is boxed into a brand-new component (no shared/floor touch) - adversary skipped per the risk-gate (D7).')
    continue
  }
  const verdict = await guard(() =>
    agent(bornContractPrompt(laneArgs, contract, build), {
      label: 'born-contract-verify:' + contract.component,
      phase: 'Verify born contracts',
      agentType: 'reasonable:intent-verifier',
      schema: VERIFIER_VERDICT,
    })
  )
  if (verdict === null) {
    // A missing verdict can only cause MORE human surfacing, never less (D6): escalate it.
    contractEscalations.push({ component: contract.component, verdict: 'escalate', reason: 'born-contract adversary returned null - verdict not obtained; surfacing for the human (annotate-not-disarm: never fewer eyes).' })
    continue
  }
  if (verdict.kind === 'checkpoint') {
    return { kind: 'budget-exhausted', stage: 'verify-born-contracts', reason: verdict.reason, build, report }
  }
  if (verdict.verdict === 'reject') {
    // A cited over/under-claim against topology + vision. The contract must be re-spec'd; a fixed
    // control flow cannot grow an unbounded re-author loop, so this crosses to the human just like
    // an infeasible build - the main session re-specs and re-runs.
    contractRejections.push({ component: contract.component, verdict: 'reject', oracle: verdict.oracle, reason: verdict.reason || 'born contract over/under-claims against topology + vision (no reason cited).' })
    continue
  }
  if (verdict.verdict === 'escalate') {
    contractEscalations.push({ component: contract.component, verdict: 'escalate', oracle: verdict.oracle, reason: verdict.reason || 'adversary escalated: two defensible readings topology + vision cannot settle.' })
    continue
  }
  // accept: a NARROW WRITER (separated from the read-only adversary, Law 3 corollary) appends the
  // verifier-verdict to the on-disk append-only ledger (D5). This ANNOTATES the contract as
  // explained-by-verdict - advisory only; it disarms nothing (D6).
  const verdictAck = await guard(() =>
    agent(verdictWriterPrompt(laneArgs, verdict, contract, build), {
      label: 'verdict-write:' + contract.component,
      phase: 'Verify born contracts',
      agentType: 'reasonable:journal-writer',
      schema: SCRIBE_ACK,
    })
  )
  if (verdictAck === null || verdictAck.kind === 'checkpoint' || verdictAck.ok !== true) {
    // A half-written verdict surfaces MORE, never less (D6): treat a failed append as an escalation
    // rather than swallowing the accept.
    contractEscalations.push({ component: contract.component, verdict: 'escalate', reason: 'accept verdict could not be durably appended to the ledger - surfacing (annotate-not-disarm).' })
    continue
  }
  contractVerdicts.push({ component: contract.component, verdict: 'accept', oracle: verdict.oracle })
}

// A born-contract REJECT is a hard route to the human: the founding clauses misdescribe the
// skeleton against topology + vision, and a fixed control flow cannot re-author them in-phase.
// Surface it the same way an infeasible build is surfaced - sign-off cannot proceed over it.
if (contractRejections.length > 0) {
  return { kind: 'born-contracts-rejected', rejections: contractRejections, verdicts: contractVerdicts, escalations: contractEscalations, build, report }
}
log('Born contracts verified: ' + contractVerdicts.length + ' accepted (verdict recorded); ' + contractEscalations.length + ' escalated to the human inbox. Scribing the derived index.')

phase('Scribe the index')
const ack = await agent(scribePrompt(a, build), {
  label: 'journal-writer',
  phase: 'Scribe the index',
  agentType: 'reasonable:journal-writer',
  schema: SCRIBE_ACK,
})

// The scribe is the one place a null / ok:false is a hard HALT (D3b): the script
// must not return "scaffold ready" while believing a transition persisted that
// did not. The halt is safe - the index is derived; reconcile rebuilds it.
if (ack === null) {
  return { kind: 'halt', reason: 'scribe-null: derived index (journal/inbox) not persisted' }
}
if (!ack.ok) {
  return { kind: 'halt', reason: 'scribe-halt: ' + (ack.reason || 'index not persisted faithfully') }
}

// Ends AT the scaffold sign-off - the LAST one-time ratification before the
// vertical-slice loop. The run does NOT block on the human (the engine cannot,
// and silence must never ratify). It returns the evidence; the main session runs
// the blocking gate in gated mode, or self-ratifies-and-logs in autonomous mode.
// A born-contract ESCALATE routes to the human just like an invariant failure - it
// never silently ratifies (the failure direction is always toward MORE scrutiny, D6;
// autonomous: the escalation joins the always-escalate classes, D8).
log('Scaffold ready. Returning to the main session for the sign-off gate.')
const evidence = {
  skeletonCommit: build.commit,
  promotedScenario: build.promotedScenario || null,
  parkedCount: report.parkedCount ?? null,
  parkedScenarios: build.parkedScenarios || [],
  loudStubCount: report.loudStubCount ?? null,
  loudStubLoci: build.loudStubLoci || [],
  thinContracts: build.thinContracts || [],
  ledgerBirths: build.ledgerBirths || [],
  invariantChecks: report.checks,
  bornContractVerdicts: contractVerdicts,
  bornContractEscalations: contractEscalations,
}
if (contractEscalations.length > 0) {
  // Pre-verified, but the adversary could not settle every born contract against topology + vision.
  // Sign-off cannot ratify over an open fork; route the escalations to the human (annotate-not-disarm
  // means more eyes, never fewer). The skeleton + index still stand; nothing is rolled back.
  return { kind: 'born-contracts-escalated', mode, escalations: contractEscalations, evidence }
}
return {
  kind: 'scaffold-ready',
  mode,
  signOff: mode === 'gated' ? 'blocking-in-main-session' : 'self-ratify-and-log',
  evidence,
}
