// characterization.workflow.js — the brownfield analysis-time corpus pass (BF7).
//
// This is the *brownfield* twin of scaffold.workflow.js, and it occupies the same
// phase slot. A brownfield effort has no walking skeleton to build — the system
// already walks — so the scaffolding slot's job becomes: characterize the existing,
// observable, top-level scenarios as a PARKED baseline corpus of born `characterized`
// clauses + parked characterization tests. It mirrors the scaffold pipeline shape:
//
//     provision a lane  ->  read-only probe  ->  census / born-contract write  ->
//     parked characterization tests  ->  intent-verifier adversary  ->
//     invariant-verify  ->  scribe  ->  return a typed result to the human
//
// THE LANE (architecture D7, the incident fix). The characterizer is a FENCED MUTATOR.
// Run in the main checkout it has no lane descriptor, so the floor-containment fence
// FAILS OPEN (fence.mjs: no reachable effort root -> allow) and there is no
// pre-integration diff to judge — exactly the lane-less defect that let parked pins land
// straight onto floor-tracked files unverified. So before any pin we PROVISION A LANE
// (reasonable:lane-provisioner): a real registered worktree + a `.reasonable-lane.json`
// descriptor + a journal record, in that order, so the fence is armed and a proposed
// diff exists ABOVE the floor before it is integrated. The corpus pass is the worker;
// it never runs lane-less.
//
// THE ADVERSARY (Law 3 corollary, the verification trio). Each pin is a semantic
// judgment — "is this in the baseline we promised to capture, at the right seam,
// legitimately touching floor-tracked files?" — that no script can compute (a byte hash
// cannot tell a harmless additive pin from a real regression). So a fresh-context,
// read-only-by-capability reasonable:intent-verifier ADVERSARY judges each pin's PROPOSED
// output against the BASELINE-INTENT reference (D9) that sits ABOVE the artifact, BEFORE
// it is integrated, and PROPOSES accept|reject|escalate — it never self-executes the act
// its verdict authorizes. The orchestrator routes: reject -> back to the characterizer;
// escalate -> the human inbox (in autonomous mode it JOINS the always-escalate classes);
// accept -> a narrow writer records a `verifier-verdict` ledger append (D5) that ANNOTATES
// the diff as explained-by-verdict (D6, annotate-not-disarm — advisory only; reconcile
// still surfaces it). The adversary is RISK-GATED (D7): ALWAYS run where a pin touches the
// floor or a shared contract; it may be skipped only for a pin boxed into a brand-new file
// nothing depends on yet. The reference is ABOVE the artifact, never the floor it pins —
// and the adversary does NOT judge "is the legacy behavior correct"; there is no reference
// for that, so the characterizer's suspectedBug flag + the human three-way classification
// keep that job.
//
// THE STATUS-QUO-GREEN DEFAULT (D12). The keep / fix-it-pins-a-bug / defer call on a born
// `characterized` pin is NOT a blanket escalate. The brownfield task supplies the missing
// legacy-correctness reference — "change what is stated, preserve the rest" — so an
// ORTHOGONAL pin (the adversary ACCEPTED it against the baseline-intent and it carries NO
// suspectedBug flag) DEFAULTS to keep: it is logged-and-kept, never escalated, in BOTH run
// modes (changing unstated behaviour would itself be the scope violation). The human is
// engaged ONLY on a POSITIVE conflict signal — the characterizer's `suspectedBug` flag, or
// the adversary's ESCALATE verdict (tension against the baseline-intent / the change's
// blast radius). So at result-assembly an accepted, unflagged pin self-ratifies, while a
// reject / ESCALATE / suspectedBug pin routes to the human (autonomous: BREAKING).
//
// THE ONE INVERSION (architecture §18 BF2, §19). Where scaffold's invariant-verify
// asks "is the suite GREEN, parked tests compiling, seams real?", a characterization
// corpus is born GREEN-by-observation. So invariant-verify here means **each parked
// characterization test PASSES on unmutated HEAD** — the exact inverse of the
// greenfield discriminator's "RED on HEAD~". A born `characterized` pin that is
// already red on HEAD pins nothing real; that is the corpus-level invariant.
//
// SCOPE (load-bearing, do not widen). This workflow is the **analysis-time corpus
// pass only** — launched from the MAIN SESSION (one-level workflow() nesting forbids
// a vertical-slice-runner from launching it). The in-run **first-touch genesis** —
// pinning a single seam just-in-time after the implementer declares its behaviorDelta —
// is NOT here: it lives inside vertical-slice-runner as an in-run agent sequence
// (the `characterization-needed` OUTCOME arm), exactly as DESIGN §5.10 keeps an
// extraction's birth inside the ripple. Here we pin the *observable top-level
// boundary* of the system as a standing baseline, before any vertical slice runs.
//
// PURITY (the engine's absolute limits — substrate ref). Plain JS, no TypeScript.
// No filesystem, no Date.now/Math.random/new Date() (they THROW in the script body).
// All side effects happen INSIDE agents (they edit files, run tests, write the ledger
// + the derived index). The script only orchestrates: it moves the program counter,
// it never writes it. `meta` is a pure literal. No imports — every schema and helper
// is inlined below. Hooks used: agent(), pipeline() (no barrier), parallel() (barrier),
// log(), phase(), args, budget.
//
// RETURN. The workflow returns a typed CHARACTERIZATION_RESULT. Like the
// vertical-slice-runner's GATE_RESULT, the engine cannot block on a human, so the
// run does not try — it RETURNS, and the main session's birth-ratification gate is
// where blocking (in gated mode) actually happens. Silence never ratifies a corpus.

export const meta = {
  name: 'characterization',
  description: 'Brownfield analysis-time corpus pass: pin the observable top-level scenarios as a parked baseline of born `characterized` clauses + parked characterization tests, verify GREEN-on-HEAD, return a CHARACTERIZATION_RESULT to the human birth-ratification gate.',
  whenToUse: 'Launched from the main session at the brownfield scaffolding slot (config.brownfield true), after census has written baseline.json. Mirrors scaffold.workflow.js. NOT for in-run first-touch genesis (that lives in vertical-slice-runner).',
  phases: [
    { title: 'Reconcile', detail: 'Unconditional recovery prologue: re-derive truth from git+ledger+contracts; read runMode; halt on AMBIGUOUS. The floor-integrity mismatch is a BACKSTOP tripwire here, not a first-line HALT — it surfaces, annotated by any explaining verdict (D6).' },
    { title: 'Provision', detail: 'reasonable:lane-provisioner births a real registered worktree + .reasonable-lane.json descriptor + journal record BEFORE any pin, so the fence is armed (never fails open in the main checkout) and a pre-integration diff exists.' },
    { title: 'Probe', detail: 'Read-only: enumerate the existing observable top-level scenarios and their seams from the running system and the FLOOR.' },
    { title: 'Characterize', detail: 'Per scenario: census skeleton check -> characterizer pins a born `characterized` clause + a PARKED characterization test (contract -> ledger event -> test), each admitted by the reverse discriminator.' },
    { title: 'Intent-verify', detail: 'Risk-gated adversary (reasonable:intent-verifier, fresh context, read-only): judges each floor-/contract-touching pin against the baseline-intent reference ABOVE the artifact, proposes accept|reject|escalate; reject -> back to characterizer, escalate -> human inbox, accept -> verifier-verdict ledger append (annotate-not-disarm).' },
    { title: 'Invariant-verify', detail: 'Read-only auditor: each parked characterization test PASSES on unmutated HEAD (the inverse of RED-on-HEAD~), parked tests compile, the FLOOR is green.' },
    { title: 'Scribe', detail: 'The lone serialized journal-writer records the corpus births to the derived index (journal.json + inbox.json).' },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Inlined schemas (JSON Schema literals — agents with `schema` are forced to emit
// these via a StructuredOutput tool; the engine validates and retries on mismatch).
// ─────────────────────────────────────────────────────────────────────────────

// The reconcile prologue's briefing (reused shape from the reconciler agent). It is
// authoritative for halt/runMode; a halt ends the run before any pin is written.
const BRIEFING = {
  type: 'object',
  additionalProperties: false,
  required: ['halt', 'runMode', 'brownfield'],
  properties: {
    halt: { type: 'boolean', description: 'true when any artifact configuration was AMBIGUOUS (or runMode absent).' },
    haltReason: { type: ['string', 'null'] },
    haltClass: {
      type: ['string', 'null'],
      enum: ['sha-custody', 'ledger-without-commit', 'runmode-absent', 'two-lanes-one-wo', 'floor-integrity', 'other', null],
      description: 'Which class triggered the halt. floor-integrity DEMOTES to a BACKSTOP tripwire here (D6, annotate-not-disarm): it surfaces but does not first-line HALT the corpus pass. The other four classes stay first-line HALTs.',
    },
    evidence: { type: ['string', 'null'], description: 'Conflicting SHAs / ledger-line-without-commit / unaccounted floor test.' },
    floorUnexplained: {
      type: ['integer', 'null'],
      description: 'D13: of the surfaced floor-integrity diffs, how many are UNEXPLAINED (no `accept` verifier-verdict explains them) — reconcile.mjs `floorIntegrity.unexplained`. In AUTONOMOUS mode >0 is the FIFTH always-escalate class: the corpus pass STOPS (escalate, do not ratify). An EXPLAINED diff (unexplained:0 but surfaced>0) is a non-blocking NOTICE. Null/0 when no floor diff surfaced.',
    },
    runMode: { type: ['string', 'null'], enum: ['gated', 'autonomous', null], description: 'Read from config.json, never inferred. Absent -> halt.' },
    brownfield: { type: 'boolean', description: 'Must be true for this pass to do work; false -> no-op.' },
    currentVerticalSlice: { type: ['string', 'null'] },
    floorTestIds: { type: 'array', items: { type: 'string' }, description: 'Ids of the FLOOR tests captured in baseline.json.' },
    note: { type: ['string', 'null'] },
  },
};

// The read-only probe's catalogue of observable top-level scenarios to characterize.
const SCENARIO_CATALOGUE = {
  type: 'object',
  additionalProperties: false,
  required: ['scenarios'],
  properties: {
    scenarios: {
      type: 'array',
      maxItems: 256,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['key', 'component', 'observable', 'seam'],
        properties: {
          key: { type: 'string', description: 'Stable slug for this top-level scenario (used as label + dedup key).' },
          component: { type: 'string', description: 'The owning component (its skeleton contract was born by census).' },
          observable: { type: 'string', description: 'The user-visible behaviour to pin, in observable terms (not internals).' },
          seam: { type: 'string', description: 'The Feathers seam / declared locus the characterization test will capture (a file glob).' },
          floorTests: { type: 'array', items: { type: 'string' }, description: 'FLOOR test ids that already touch this seam, if any.' },
        },
      },
    },
    note: { type: ['string', 'null'] },
  },
};

// One characterizer pin: a born `characterized` clause + its parked characterization
// test, in the fixed atomic write order (contract -> ledger event -> test), admitted
// by the BF2 reverse discriminator.
const PIN_RESULT = {
  type: 'object',
  additionalProperties: false,
  required: ['key', 'status', 'component'],
  properties: {
    key: { type: 'string' },
    component: { type: 'string' },
    status: { type: 'string', enum: ['pinned', 'inadmissible', 'no-op', 'error'], description: 'pinned = born + admitted; inadmissible = failed reverse discriminator; no-op = nothing observable to pin; error = a wall.' },
    clause: { type: ['string', 'null'], description: 'The born clause id, e.g. "store §3".' },
    provenance: { type: ['string', 'null'], enum: ['characterized', null] },
    test: { type: ['string', 'null'], description: 'The parked characterization test name.' },
    seam: { type: ['string', 'null'] },
    supersessionPending: { type: 'boolean', description: 'True iff a behaviorDelta named this behaviour (analysis-time: normally false — no change is in flight yet).' },
    touchesFloor: { type: 'boolean', description: 'The pin lands on a floor-tracked file (the parked test touches a FLOOR seam). Drives the D7 risk-gate: a floor touch ALWAYS runs the adversary.' },
    citationsAdded: { type: 'boolean', description: 'The born clause added a `## Citations` bullet — i.e. the pin enriched a SHARED contract. Drives the D7 risk-gate (shared-contract touch always runs the adversary).' },
    atomicOrderHeld: { type: 'boolean', description: 'contract -> ledger event -> test held.' },
    reverseDiscriminator: {
      type: 'object',
      additionalProperties: false,
      required: ['command', 'passesOnHead', 'redUnderMutant', 'admissible'],
      properties: {
        command: { type: 'string', description: 'The exact discriminator.mjs --reverse invocation run.' },
        passesOnHead: { type: 'boolean' },
        redUnderMutant: { type: 'boolean' },
        admissible: { type: 'boolean' },
        killingMutant: { type: ['string', 'null'] },
      },
    },
    suspectedBug: { type: 'boolean', description: 'The pin may faithfully encode a bug — flag for the human three-way classification.' },
    note: { type: ['string', 'null'] },
  },
};

// The lane-provisioner's hand-off. The corpus pass is a FENCED MUTATOR, so it must run
// inside a real registered worktree carrying a `.reasonable-lane.json` descriptor — never
// the main checkout, where the floor-containment fence fails open (D7). A null/false ack
// is a HALT: no armed fence => no legitimate place to pin.
const PROVISION_ACK = {
  type: 'object',
  additionalProperties: false,
  required: ['provisioned'],
  properties: {
    provisioned: { type: 'boolean', description: 'worktree + .reasonable-lane.json descriptor + journal record all present, in that order (idempotent on re-run).' },
    worktree: { type: ['string', 'null'], description: 'The lane worktree path the characterizer must cwd into — a real registered worktree, NEVER the main checkout.' },
    branch: { type: ['string', 'null'], description: 'The lane branch.' },
    descriptorWritten: { type: 'boolean', description: 'The .reasonable-lane.json descriptor exists at the worktree root so the fence is armed (no fail-open-in-main-checkout window).' },
    noOp: { type: 'boolean', description: 'True iff the lane already existed and provisioning was an idempotent no-op.' },
    note: { type: ['string', 'null'] },
  },
};

// One intent-verifier verdict on one PROPOSED pin (D5 shape). The adversary is read-only
// by capability and PROPOSES the verdict as DATA (proposed:true); a narrow writer (the
// orchestrator) performs the ledger append — it never self-executes the act it authorizes
// (Law 3 corollary). The reference (`oracle`) is the BASELINE-INTENT, ABOVE the artifact
// (D9): it judges "is this in the baseline we promised, at the right seam, legitimately
// touching floor-tracked files, consistent with suspectedBug?" — NEVER "is the legacy
// behavior correct" (no reference for that; that stays the human three-way classification).
const VERIFIER_VERDICT = {
  type: 'object',
  additionalProperties: false,
  required: ['key', 'component', 'verdict', 'oracle', 'proposed'],
  properties: {
    key: { type: 'string', description: 'The scenario key this verdict judges (joins back to its PIN_RESULT).' },
    component: { type: 'string' },
    diffRef: { type: ['string', 'null'], description: 'The proposed pin diff / commit / content hash judged (content-references the artifact, like baseline.json pins file hashes).' },
    verdict: { type: 'string', enum: ['accept', 'reject', 'escalate'], description: 'accept = in the promised baseline, right seam, legitimate floor touch; reject = wrong seam / outside the baseline-intent / illegitimate floor touch -> back to characterizer; escalate = genuinely unsettleable -> human inbox.' },
    oracle: { type: 'string', description: 'The named reference judged against — the baseline-intent / standing baseline, which sits ABOVE the artifact.' },
    by: { type: 'string', description: 'The judging actor — "intent-verifier".' },
    proposed: { type: 'boolean', description: 'Always true: the adversary PROPOSES; it never integrates. The orchestrator (a narrow writer) performs any resulting append.' },
    touchesFloorOrContract: { type: 'boolean', description: 'Why the adversary ran at all (D7 risk-gate): the pin touches the floor or a shared contract. False => the orchestrator could have skipped it (boxed into a brand-new file).' },
    reason: { type: ['string', 'null'], description: 'Terse justification against the named oracle (a wrong accept corrupts effort truth, so say only what the reference supports).' },
  },
};

// The read-only invariant-verify report. GREEN-on-HEAD is the corpus invariant —
// the inverse of the discriminator's RED-on-HEAD~.
const INVARIANT_REPORT = {
  type: 'object',
  additionalProperties: false,
  required: ['greenOnHead', 'parkedCompile', 'floorGreen', 'passed'],
  properties: {
    greenOnHead: { type: 'boolean', description: 'Every parked characterization test PASSES on unmutated HEAD (the inverse of RED-on-HEAD~).' },
    parkedCompile: { type: 'boolean', description: 'The parked characterization tests compile / import (a parked test that does not compile pins nothing).' },
    floorGreen: { type: 'boolean', description: 'The FLOOR (baseline.json) is green — the containment fence holds.' },
    passed: { type: 'boolean', description: 'greenOnHead && parkedCompile && floorGreen.' },
    failures: { type: 'array', items: { type: 'string' }, description: 'Named failures (a red-on-HEAD pin, a non-compiling parked test, a broken floor test).' },
    burndown: { type: ['string', 'null'], description: 'The parked-count / loud-stub-count from burndown.mjs.' },
    note: { type: ['string', 'null'] },
  },
};

// The scribe's acknowledgement. A null return (the agent dies / is skipped) is a HALT
// upstream — the script must not proceed believing the derived index persisted.
const SCRIBE_ACK = {
  type: 'object',
  additionalProperties: false,
  required: ['persisted'],
  properties: {
    persisted: { type: 'boolean', description: 'journal.json + inbox.json written faithfully against their schemas.' },
    transition: { type: ['string', 'null'], description: 'The transition persisted (phase -> characterization-corpus, births recorded).' },
    note: { type: ['string', 'null'] },
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Inlined helpers (pure — no fs, no Date.now/random). guard() is the mandatory
// budget-throw wrapper: the engine THROWS when spent >= total, and a budget ceiling
// must never be misread as a verification gap. guard() catches the throw and re-tags
// it as a structured checkpoint so the script branches deterministically.
// ─────────────────────────────────────────────────────────────────────────────

async function guard(thunk) {
  try {
    return await thunk();
  } catch (e) {
    // A budget ceiling (or any agent throw) becomes a structured checkpoint, never a
    // silent pass/fail. The caller decides what an exhausted corpus pass returns.
    return { __checkpoint: true, reason: (e && e.message) || 'agent threw (budget ceiling or terminal error)' };
  }
}

function isCheckpoint(x) {
  return x !== null && typeof x === 'object' && x.__checkpoint === true;
}

// Per-vertical-slice (here: per-corpus-pass) budget vs the engine's shared turn pool.
// budget.spent() spans the whole turn; the per-pass cap rides in args. We are within
// budget only if BOTH the engine pool and the per-pass cap have headroom. Guard on
// budget.total (else remaining() is Infinity and the loop runs to the agent cap).
function withinBudget(a, b) {
  const passCap = a && typeof a.budgetTokens === 'number' ? a.budgetTokens : null;
  const poolOk = b.total == null ? true : b.remaining() > 0;
  const passOk = passCap == null ? true : b.spent() < passCap;
  return poolOk && passOk;
}

// Dedup scenarios by key (pure) — the catalogue may double-list a scenario that two
// floor tests touch; we pin each observable boundary once.
function dedupByKey(items) {
  const seen = new Set();
  const out = [];
  for (const it of items) {
    if (!it || typeof it.key !== 'string') continue;
    if (seen.has(it.key)) continue;
    seen.add(it.key);
    out.push(it);
  }
  return out;
}

// The adversary risk-gate (pure — D7). The supervision dial may ONLY let a PRESENT human
// trade a check for speed; it can NEVER let an autonomous run disable a guard. So gate by
// RISK = WHAT THE PIN TOUCHES, never by trust: a pin touches PROTECTED state when it lands
// on a floor-tracked file (the scenario lists floorTests, or the characterizer reported a
// floor touch) or enriches a shared contract (a Citations bullet to a neighbour). ALWAYS
// verify those. A pin may be skipped ONLY when it is boxed into a brand-new file nothing
// depends on yet (no floor tests, no shared-contract citation). In AUTONOMOUS mode the
// gate stays maximally paranoid; in GATED mode the present human is the net, so a boxed-in
// pin may be skipped — but a floor/contract touch is OFF the dial entirely (non-waivable).
function pinTouchesProtectedState(pin, scenario) {
  if (!pin || pin.status !== 'pinned') return false;
  const floorFromScenario = !!(scenario && Array.isArray(scenario.floorTests) && scenario.floorTests.length > 0);
  const floorFromPin = pin.touchesFloor === true;
  const sharedContract = pin.citationsAdded === true;
  return floorFromScenario || floorFromPin || sharedContract;
}

// ─────────────────────────────────────────────────────────────────────────────
// Prompt builders (pure string functions — the only way to vary an agent by content,
// since Date.now/random are forbidden). Each cites the effort root + plugin root from
// args, so agents can run the libs and read the shared .reasonable/ artifacts.
// ─────────────────────────────────────────────────────────────────────────────

function root(a) { return (a && a.effortRoot) || '.'; }
function plugin(a) { return (a && a.reasonableRoot) || '${reasonable}'; }

// After provisioning, the FENCED MUTATOR (characterizer + the census-skeleton emit) must
// operate INSIDE the lane worktree, where `.reasonable-lane.json` arms the floor-containment
// fence and a pre-integration diff exists — NEVER in the main checkout (args.effortRoot),
// where the fence fails open (D7, the lane-less hazard this pass exists to close). Narrow a
// copy of args so root(a) resolves to the worktree for every in-lane write path
// (contract -> ledger -> parked test, in that atomic order). Read-only roles (probe,
// invariant, scribe, reconcile) keep the un-narrowed args. plugin root is unchanged.
function laneScoped(a, worktree) {
  return worktree ? { ...a, effortRoot: worktree } : a;
}

function reconcilePrompt(a) {
  return [
    'You are the reconcile prologue for the brownfield characterization corpus pass.',
    `Effort root: ${root(a)}. Plugin root: ${plugin(a)}.`,
    'Run UNCONDITIONALLY. Re-derive truth from git + the append-only ledger + the contract files;',
    'the resume cache has zero authority. Run `node ' + plugin(a) + '/lib/reconcile.mjs` and read its',
    'exact output. Partition every artifact configuration into RESOLVED / SAFE-DEFAULT / AMBIGUOUS.',
    'An AMBIGUOUS configuration is a blocking halt — set halt:true with haltReason + evidence; never guess.',
    'CLASSIFY every halt via haltClass. The four FIRST-LINE halt classes stay HALTs: sha-custody (custody',
    'reclaim), ledger-without-commit (torn window), runmode-absent, two-lanes-one-wo. But a floor-integrity',
    'mismatch DEMOTES to a BACKSTOP tripwire here (haltClass:"floor-integrity"): it still SURFACES (report it',
    'in evidence + note) but it does NOT first-line HALT the corpus pass — the byte-level floor hash cannot',
    'tell a harmless additive characterization pin from a real regression, so an explaining verifier-verdict',
    'may annotate it downstream (annotate-not-disarm, D6). NEVER let an accept silence the hash.',
    'Report floorUnexplained = reconcile.mjs `floorIntegrity.unexplained` (surfaced floor diffs with NO accept',
    'verdict). D13: in AUTONOMOUS mode floorUnexplained>0 is the FIFTH always-escalate class — something bypassed',
    'the pre-integration adversary, so the corpus pass STOPS (escalate, never ratify). An EXPLAINED diff',
    '(surfaced but floorUnexplained:0) is a non-blocking NOTICE the run logs and continues past.',
    'Read config.runMode (gated|autonomous); if absent/null on a cold restart, HALT (inferring mode is forbidden).',
    'Confirm config.brownfield: this pass only does work when it is true. If false, set brownfield:false (no-op).',
    'When brownfield is true, run the floor-integrity pass over baseline.json and report the FLOOR test ids.',
    'Return the BRIEFING. Evidence before assertions: name the command you ran and quote its output.',
  ].join('\n');
}

function lanePrompt(a) {
  return [
    'You are the lane-provisioner. Provision the lane for the brownfield characterization corpus pass,',
    'idempotently, BEFORE any fenced worker (the characterizer) edits code. The corpus pass is a FENCED',
    'MUTATOR: run in the main checkout it has NO lane descriptor, so the floor-containment fence FAILS',
    'OPEN — there would be no armed fence and no pre-integration diff to judge. So this lane MUST be a',
    'real registered worktree, NEVER the main checkout.',
    `Effort root: ${root(a)}. Plugin root: ${plugin(a)}.`,
    'Do exactly three things in order (the ordering is the safety property): (1) git worktree add a real',
    'registered worktree on a lane branch (NOT an engine-isolated throwaway); (2) write the one',
    '.reasonable-lane.json descriptor at the new worktree root, narrowed for the characterizer role',
    '(contractBirth:true, floorImpact, the corpus locus), with the effortRoot back-pointer; (3) record the',
    'lane in the journal via the scribe — all before the worker is dispatched. Idempotent: an existing',
    'registered worktree + present correct descriptor + recorded journal lane is a no-op success.',
    'Return the PROVISION_ACK: the worktree path the characterizer must cwd into, and confirmation the',
    'descriptor is written (the fence is armed). A false/absent descriptor is a HALT — never pin lane-less.',
  ].join('\n');
}

function probePrompt(a, state) {
  return [
    'You are a READ-ONLY probe for the brownfield characterization corpus pass (the analysis-time pass).',
    `Effort root: ${root(a)}.`,
    'The system already walks. Your job: enumerate the EXISTING observable TOP-LEVEL scenarios — the',
    'user-visible behaviours of the running system at its outer boundary — that the corpus should pin as a',
    'standing baseline. For each, name: a stable `key`, the owning `component` (its skeleton contract was',
    'born by census, with empty clauses), the `observable` behaviour in user-visible terms (NOT internals),',
    'and the `seam` (the Feathers seam / declared locus, a file glob, the characterization test will capture).',
    'Cross-reference the FLOOR tests from baseline.json (ids: ' + JSON.stringify((state && state.floorTestIds) || []) + ')',
    'so each scenario lists the floor tests already touching its seam.',
    'Pin the OBSERVABLE TOP-LEVEL BOUNDARY only — not the call graph, not internal seams (those are pinned',
    'just-in-time, in-run, at first touch by the vertical-slice-runner, after a behaviorDelta). Read only;',
    'write nothing. Return the SCENARIO_CATALOGUE.',
  ].join('\n');
}

function censusCheckPrompt(a, s) {
  return [
    'You are the census (brownfield read-only) confirming the skeleton topology contract exists for one',
    'component before its behaviour is pinned at the seam.',
    `Effort root: ${root(a)}. Plugin root: ${plugin(a)}.`,
    `Component: ${s.component}. Seam: ${s.seam}.`,
    'Confirm `.reasonable/contracts/' + s.component + '.md` exists with a `## Topology` section (prose',
    '`- Depends on:` lines), an EMPTY `## Clauses` section, and ZERO `## Citations` bullets — exactly the',
    'skeleton census writes at analysis. If it is missing, emit the skeleton now (prose deps, empty clauses,',
    'zero citations) so the characterizer has a contract file to add a born clause to. Write NO clause and',
    'NO citation yourself — behaviour is born by the characterizer, demand-driven, at the seam. Confirm the',
    'baseline.json floor partition (via `node ' + plugin(a) + '/lib/baseline.mjs`) round-trips.',
    'Return a one-line confirmation that the skeleton is present (or was emitted) for ' + s.component + '.',
  ].join('\n');
}

function characterizePrompt(a, s) {
  return [
    'You are the characterizer (brownfield fenced mutator, contractBirth:true) pinning ONE observable',
    'top-level behaviour as a born `characterized` clause + a PARKED characterization test.',
    `Effort root: ${root(a)}. Plugin root: ${plugin(a)}.`,
    'You operate INSIDE the provisioned lane worktree (the effort root above): cwd there, where the',
    '`.reasonable-lane.json` descriptor arms the floor-containment fence. Every write below (contract,',
    'ledger, parked test) lands under THIS root — never the main checkout, where the fence fails open.',
    `Scenario key: ${s.key}. Component: ${s.component}. Seam (read-only src): ${s.seam}.`,
    `Observable behaviour to pin (pin what IS, never what should be): ${s.observable}`,
    'This is the ANALYSIS-TIME corpus pass: no behaviorDelta / no change is in flight yet, so pins are born',
    'PLAIN (do not stamp `Supersession: pending` — there is no declared change to supersede). Write in the',
    'FIXED ATOMIC ORDER, never reordered: (1) born `### §N` clause in',
    '`.reasonable/contracts/' + s.component + '.md` with `- Provenance: characterized (test: <name>, seam: ' + s.seam + ')`',
    'and a `- Seam:` line, adding a `## Citations` bullet ONLY for a neighbour this scenario actually consumes;',
    '(2) one `{"type":"characterization", ...}` line appended to `.reasonable/ledger.jsonl`;',
    '(3) the PARKED characterization test (ignore-marked with a reason; it MUST compile/import; cite the clause).',
    'Admit the pin with the BF2 REVERSE discriminator (the inverse of greenfield RED-on-HEAD~):',
    '`node ' + plugin(a) + '/lib/discriminator.mjs --reverse --test <name> --locus ' + JSON.stringify(s.seam) + ' --json`.',
    'A pin is admissible ONLY IF it (a) PASSES on unmutated HEAD and (b) goes RED under a locus-scoped mutant.',
    'Do NOT use mutation-sample.mjs (whole-suite — passes vacuously per characterization test).',
    'You never edit production src; you pin, you never fix. If the behaviour looks like a bug, pin it AS-IS and',
    'set suspectedBug:true for the human three-way classification — never bless it silent, never fix it.',
    'Return a PIN_RESULT with the exact reverse-discriminator command + output. Evidence before assertions.',
  ].join('\n');
}

function intentVerifierPrompt(a, pin, scenario) {
  return [
    'You are the intent-verifier ADVERSARY for ONE proposed characterization pin. Fresh context,',
    'read-only BY CAPABILITY (Read/Grep/Glob; Bash ONLY to re-run the pinned test if your judgment',
    'requires it). You PROPOSE a verdict; you NEVER integrate it and you fix NOTHING — the orchestrator',
    '(a narrow writer) performs any resulting ledger append (Law 3 corollary).',
    `Effort root: ${root(a)}. Plugin root: ${plugin(a)}.`,
    `Proposed pin: key ${pin.key}, component ${pin.component}, clause ${JSON.stringify(pin.clause || null)},`,
    `parked test ${JSON.stringify(pin.test || null)}, seam ${JSON.stringify(pin.seam || (scenario && scenario.seam) || null)}.`,
    `The characterizer's own suspectedBug flag: ${pin.suspectedBug === true}.`,
    'YOUR REFERENCE (the oracle, ABOVE the artifact): the BASELINE-INTENT / standing baseline this corpus',
    'pass PROMISED to capture (read .reasonable/baseline.json and the change-intention). Judge ONLY:',
    '  - Is this observable behaviour IN the baseline we promised to capture (a real top-level scenario,',
    '    not an internal seam, not out of corpus scope)?',
    '  - Is it pinned at the RIGHT seam (the declared locus the parked test actually captures)?',
    '  - Does it LEGITIMATELY touch floor-tracked files (a floor touch that the baseline partition expects),',
    '    or is it landing on protected floor state it has no business pinning?',
    '  - Is it consistent with the characterizer\'s own suspectedBug flag (a suspected bug pinned as-is is',
    '    fine; a suspected bug silently blessed or fixed is NOT)?',
    'SCOPE LIMIT — be honest about it: you do NOT judge "is the legacy behavior CORRECT". There is no',
    'reference for that (the characterizer has no internal tell for a bug); that stays the human three-way',
    'classification. You judge the pin against the baseline-intent, never the world.',
    'You CANNOT check the pin against what it was derived from (the legacy code) — that agreement would be',
    'tautological; judge against the reference ABOVE it.',
    'Return the VERIFIER_VERDICT: verdict accept|reject|escalate, oracle = the named baseline-intent',
    'reference, by:"intent-verifier", proposed:true. accept = in the promised baseline, right seam,',
    'legitimate floor touch. reject = wrong seam / outside the baseline-intent / illegitimate floor touch',
    '(routes back to the characterizer). escalate = genuinely unsettleable (routes to the human inbox; in',
    'autonomous mode it joins the always-escalate classes). A wrong ACCEPT corrupts effort truth — say only',
    'what the reference supports.',
  ].join('\n');
}

function verdictWriterPrompt(a, verdict, pin) {
  return [
    'You are a NARROW WRITER. The intent-verifier ADVERSARY proposed a verdict as data; it is read-only and',
    'never integrates its own verdict (Law 3 corollary). You perform the one resulting act: append ONE',
    'verifier-verdict event to the append-only ledger, content-referencing the pin it judged. Nothing else.',
    `Effort root: ${root(a)}. Plugin root: ${plugin(a)}.`,
    'Append exactly this event to `.reasonable/ledger.jsonl` (one JSON line; on-disk append, NOT a git commit',
    'of orchestration state — verdict durability is the atomic on-disk append, D5):',
    '  ' + JSON.stringify({
      type: 'verifier-verdict',
      component: pin.component,
      diffRef: verdict.diffRef || null,
      verdict: verdict.verdict,
      oracle: verdict.oracle,
      by: 'intent-verifier',
      proposed: true,
    }),
    'Add the ledger seq and the code commit/hash the pin landed (`commit`) from the live ledger/git — do not',
    'invent them. This verdict ANNOTATES the pin diff as explained-by-verdict: ADVISORY ONLY (D6). It does',
    'NOT silence the floor-integrity backstop and does NOT remove the diff from reconcile\'s floor pass —',
    'a missing or half-written verdict can only cause MORE human surfacing, never less. Write nothing but',
    'this one ledger line. Return the SCRIBE_ACK (persisted true once the line is durably appended).',
  ].join('\n');
}

function invariantPrompt(a, pins) {
  const tests = pins.filter((p) => p && p.test).map((p) => p.test);
  return [
    'You are a READ-ONLY auditor verifying the characterization-corpus INVARIANT.',
    `Effort root: ${root(a)}. Plugin root: ${plugin(a)}.`,
    'THE INVERSION: a characterization corpus is born GREEN-by-observation, so its invariant is the INVERSE',
    'of the greenfield discriminator. Greenfield asks "RED on HEAD~"; here you confirm GREEN ON HEAD:',
    '  1. greenOnHead — EVERY parked characterization test PASSES on unmutated HEAD (run each alone). A pin',
    '     already red on HEAD pins nothing real and is a corpus failure.',
    '  2. parkedCompile — the parked characterization tests compile / import (a parked test that does not',
    '     compile pins nothing).',
    '  3. floorGreen — the FLOOR (baseline.json) is green; the containment fence holds.',
    'The corpus passes iff greenOnHead && parkedCompile && floorGreen.',
    'Parked characterization tests to verify: ' + JSON.stringify(tests) + '.',
    'Report the burndown: `node ' + plugin(a) + '/lib/burndown.mjs` (parked count + loud-stub count).',
    'Do NOT take the characterizer\'s word — run the commands yourself. List any failure by name.',
    'Return the INVARIANT_REPORT with the commands you ran and their output.',
  ].join('\n');
}

function scribePrompt(a, pins, invariant) {
  const births = pins.filter((p) => p && p.status === 'pinned').map((p) => ({ clause: p.clause, test: p.test, component: p.component }));
  return [
    'You are the journal-writer (the lone serialized scribe). Persist the derived index for the',
    'characterization corpus pass. Write ONLY journal.json + inbox.json — never the ledger, contracts, or code',
    '(those landed in the characterizer\'s own writes). Read both files before editing; match docs/artifacts.md',
    'field-for-field; invent no fields.',
    `Effort root: ${root(a)}.`,
    'Record the transition: phase -> the characterization corpus is built and parked; record the corpus births',
    '(clause + parked test + component) in the journal so the retro/ratification gate can see the baseline',
    'arrived as expected: ' + JSON.stringify(births) + '.',
    'Invariant-verify result (for the journal note): ' + JSON.stringify({ passed: invariant.passed, greenOnHead: invariant.greenOnHead, floorGreen: invariant.floorGreen }) + '.',
    'If you cannot complete a clean, faithful write, return persisted:false (the script reads that as HALT —',
    'never a swallow; the derived index is rebuildable from git+ledger so halting loses no truth).',
    'Return the SCRIBE_ACK.',
  ].join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// The run. Fixed control-flow shape (a fixed run cannot grow control flow);
// dynamism is the per-scenario fan-out count + the budget-guarded early exits.
// ─────────────────────────────────────────────────────────────────────────────

// 1. Reconcile prologue (unconditional recovery; halt is authoritative).
phase('Reconcile');
log('Reconcile: re-deriving truth from git + ledger + contracts (resume cache has zero authority).');
const state = await guard(
  () => agent(reconcilePrompt(args), { agentType: 'reasonable:reconciler', label: 'reconcile', schema: BRIEFING }),
);
if (isCheckpoint(state)) {
  return { kind: 'checkpoint', reason: 'reconcile: ' + state.reason };
}
if (state === null) {
  // null = user-skip / terminal API error after retries -> a verification gap, not a clean state.
  return { kind: 'halt', reason: 'reconcile returned null — recovery prologue did not complete; corpus not attempted.' };
}
if (state.halt && state.haltClass !== 'floor-integrity') {
  // The four FIRST-LINE halt classes still HALT unchanged: sha-custody, ledger-without-commit,
  // runmode-absent, two-lanes-one-wo (and any 'other' AMBIGUOUS the reconciler could not settle).
  return { kind: 'halt', reason: state.haltReason || 'reconcile: AMBIGUOUS configuration', evidence: state.evidence || null };
}
// floor-integrity is DEMOTED here from first-line HALT to a BACKSTOP tripwire (D6): the
// byte-level floor hash cannot tell a harmless additive characterization pin from a real
// regression, so it must not block this corpus pass at the door. It still SURFACES (carried
// to the human inbox in the result below), and the intent-verifier's verifier-verdict can
// later ANNOTATE the diff as explained-by-verdict — advisory only; it NEVER silences the hash.
//
// D13 completes D6. The backstop is now split by whether a pre-integration verdict explains it:
//   - UNEXPLAINED (floorUnexplained>0) in AUTONOMOUS mode is the FIFTH always-escalate class:
//     something bypassed the pre-integration adversary, so we STOP — escalate, never ratify.
//   - EXPLAINED (surfaced but floorUnexplained:0) is a non-blocking NOTICE: it is logged and
//     surfaced, but it does NOT block ratification (the adversary already judged it).
//   - In GATED mode the present human is the net: both just surface in the briefing; neither
//     synthesizes a blocking escalation here.
const floorUnexplained = (state.halt && state.haltClass === 'floor-integrity')
  ? (typeof state.floorUnexplained === 'number' ? state.floorUnexplained : 1) // a surfaced floor halt with no count defaults to UNEXPLAINED (more surfacing, never less — D6)
  : (typeof state.floorUnexplained === 'number' ? state.floorUnexplained : 0);
const floorSurfaced = (state.halt && state.haltClass === 'floor-integrity') || floorUnexplained > 0;
// An UNEXPLAINED breach in AUTONOMOUS mode escalates-and-stops; everything else (explained,
// or gated) is a logged notice that does not block ratification.
const floorBreachStops = state.runMode === 'autonomous' && floorUnexplained > 0;
const floorBackstop = floorSurfaced
  ? {
      class: 'floor-integrity',
      unexplained: floorUnexplained,
      stops: floorBreachStops,
      reason: floorBreachStops
        ? (state.haltReason || `${floorUnexplained} UNEXPLAINED floor-integrity breach(es) with no accept verdict — STOP (fifth always-escalate class, D13)`)
        : (state.haltReason || 'floor-integrity diff surfaced (explained-by-verdict NOTICE — advisory, does not block ratification)'),
      evidence: state.evidence || null,
    }
  : null;
if (floorBackstop) {
  log(floorBreachStops
    ? 'Reconcile: UNEXPLAINED floor-integrity breach in AUTONOMOUS mode (' + floorUnexplained + ') — fifth always-escalate class (D13): the corpus pass STOPS (escalate, never ratify).'
    : 'Reconcile: floor-integrity diff surfaced as a backstop NOTICE (D6/D13) — explained-by-verdict or gated; logged, does not block ratification.');
}
if (state.brownfield !== true) {
  // Brownfield is one provenance, not a second methodology; absent it, this pass is a no-op.
  return { kind: 'no-op', reason: 'config.brownfield is not set — the characterization corpus pass is a no-op (greenfield path untouched).' };
}

// 2. Provision the lane BEFORE any pin (D7, the incident fix). The corpus pass is a fenced
//    MUTATOR; in the main checkout its fence fails OPEN, so we never let it pin there. The
//    lane-provisioner births a real registered worktree + descriptor + journal record, in
//    that order, so the fence is armed and a pre-integration diff exists. A null/false ack
//    is a HALT — no armed fence is no legitimate place to pin.
phase('Provision');
log('Provision: birthing the corpus-pass lane (worktree + descriptor + journal) so the fence is armed and a pre-integration diff exists.');
const lane = await guard(
  () => agent(lanePrompt(args), { agentType: 'reasonable:lane-provisioner', label: 'provision', schema: PROVISION_ACK }),
);
if (isCheckpoint(lane)) {
  return { kind: 'checkpoint', reason: 'provision: ' + lane.reason };
}
if (lane === null || lane.provisioned !== true || lane.descriptorWritten !== true) {
  return {
    kind: 'halt',
    reason: 'lane not provisioned (null / provisioned:false / descriptor absent) — the characterizer would pin in the main checkout where the floor-containment fence fails open. Refusing to pin lane-less (D7).',
  };
}
if (!lane.worktree) {
  // Provisioned + descriptorWritten but no worktree path returned: we have nowhere armed to
  // direct the mutator, so falling back to args.effortRoot would pin in the main checkout —
  // the exact lane-less hazard. Refuse rather than silently mutate the fail-open checkout.
  return {
    kind: 'halt',
    reason: 'lane provisioned but PROVISION_ACK.worktree is empty — no armed worktree path to direct the characterizer into; refusing to fall back to the main checkout (D7).',
  };
}
// The corpus-pass mutator (characterizer + census-skeleton emit + re-pin) is governed by the
// lane it just provisioned: narrow its effort root to the worktree where the fence is armed.
const laneArgs = laneScoped(args, lane.worktree);
log('Provision: lane ready at ' + lane.worktree + '; the fence is armed. Characterizer scoped to the worktree.');

// 3. Read-only probe: enumerate the observable top-level scenarios to characterize.
phase('Probe');
log('Probe: enumerating the existing observable top-level scenarios (read-only).');
const catalogue = await guard(
  () => agent(probePrompt(args, state), { agentType: 'reasonable:census', label: 'probe', schema: SCENARIO_CATALOGUE }),
);
if (isCheckpoint(catalogue)) {
  return { kind: 'checkpoint', reason: 'probe: ' + catalogue.reason };
}
if (catalogue === null) {
  return { kind: 'halt', reason: 'probe returned null — no scenario catalogue; corpus not attempted.' };
}
const scenarios = dedupByKey(catalogue.scenarios || []);
if (scenarios.length === 0) {
  // Nothing observable to pin: an honest empty corpus (the floor still contains regressions).
  // Only an UNEXPLAINED autonomous floor breach STOPS here (escalate, never ratify); an
  // explained/gated floor diff is a logged NOTICE that does not block the empty-corpus ratify (D13).
  const floorStops = !!(floorBackstop && floorBackstop.stops);
  return {
    kind: floorStops ? 'escalate' : 'ratify',
    runMode: state.runMode,
    pinned: [],
    inadmissible: [],
    suspectedBugs: [],
    invariant: null,
    verdicts: [],
    escalations: floorStops ? [{ key: '(floor-integrity)', verdict: 'escalate', oracle: 'floor backstop', reason: floorBackstop.reason }] : [],
    floorBackstop,
    note: 'No observable top-level scenarios found to characterize. The FLOOR (baseline.json) still stands as the regression containment fence; the corpus is empty.' +
      (floorStops
        ? ' An UNEXPLAINED floor-integrity breach was surfaced (D13) — something bypassed the pre-integration adversary; route to the human and do not ratify until resolved.'
        : (floorBackstop ? ' A floor-integrity diff was surfaced as a backstop NOTICE (D6/D13, explained-by-verdict or gated) — logged for the human; it does not block this empty-corpus ratification.' : '')),
  };
}
log('Probe found ' + scenarios.length + ' observable top-level scenario(s) to characterize.');

// 4. Characterize each scenario through the pin pipeline (NO BARRIER): census-skeleton
//    check -> characterizer pins (contract -> ledger event -> test) + reverse-discriminator
//    admission. pipeline() so a fast scenario is verified the instant ITS chain returns,
//    not after the slowest. Each stage guard()-wrapped so a budget ceiling becomes a
//    structured checkpoint rather than a misread gap. The pipeline cannot grow if budget
//    is already exhausted — guard the entry.
phase('Characterize');
let pins = [];
let budgetExhausted = false;
if (!withinBudget(args, budget)) {
  budgetExhausted = true;
} else {
  const raw = await pipeline(
    scenarios,
    (s) => guard(() => agent(censusCheckPrompt(laneArgs, s), { agentType: 'reasonable:census', label: 'census:' + s.key, phase: 'Characterize' })),
    (skeleton, s) => {
      if (isCheckpoint(skeleton)) return { key: s.key, component: s.component, status: 'error', atomicOrderHeld: false, note: 'census checkpoint: ' + skeleton.reason };
      return guard(() => agent(characterizePrompt(laneArgs, s), { agentType: 'reasonable:characterizer', label: 'pin:' + s.key, phase: 'Characterize', schema: PIN_RESULT }));
    },
  );
  // pipeline() drops a thrown item to null; a guard()-wrapped throw surfaces as a
  // checkpoint object instead. Normalize both into typed pin records.
  pins = raw.map((p, i) => {
    if (p === null) return { key: scenarios[i].key, component: scenarios[i].component, status: 'error', atomicOrderHeld: false, note: 'pin dropped (null: user-skip or terminal error)' };
    if (isCheckpoint(p)) { budgetExhausted = true; return { key: scenarios[i].key, component: scenarios[i].component, status: 'error', atomicOrderHeld: false, note: 'pin checkpoint: ' + p.reason }; }
    return p;
  });
}

const pinned = pins.filter((p) => p && p.status === 'pinned');
const inadmissible = pins.filter((p) => p && p.status === 'inadmissible');
const errored = pins.filter((p) => p && p.status === 'error');
const suspectedBugs = pinned.filter((p) => p && p.suspectedBug === true);
log('Characterized ' + pinned.length + ' pin(s); ' + inadmissible.length + ' inadmissible; ' + errored.length + ' errored.');

if (budgetExhausted) {
  // The common hard exit: ran out before the whole corpus was pinned. First-class, not a gate.
  return {
    kind: 'budget-exhausted',
    runMode: state.runMode,
    pinned,
    inadmissible,
    erroredKeys: errored.map((p) => p.key),
    suspectedBugs,
    progress: pinned.length + '/' + scenarios.length + ' scenarios characterized before the budget ceiling.',
  };
}

// 5. Intent-verify (the verification trio, Law 3 corollary). A fresh-context, read-only-
//    by-capability intent-verifier ADVERSARY judges each PROPOSED pin against the baseline-
//    intent reference ABOVE the artifact (D9), BEFORE it is integrated, and PROPOSES
//    accept|reject|escalate as DATA — it never self-executes. RISK-GATED (D7): we ALWAYS run
//    it where a pin touches the floor or a shared contract; we may SKIP only a pin boxed into
//    a brand-new file (no floor test, no shared-contract citation). The orchestrator routes:
//    reject -> one bounded re-pin by the characterizer (fixed control flow cannot grow an
//    unbounded loop); a still-rejected pin ESCALATES. escalate -> the human inbox (in
//    autonomous mode it JOINS the always-escalate classes). accept -> a NARROW WRITER appends
//    the verifier-verdict (D5), which ANNOTATES the diff as explained-by-verdict (D6, advisory
//    only). guard()-wrapped so a budget ceiling is a checkpoint, never a misread gap.
phase('Intent-verify');
const verdicts = [];
const verifierEscalations = [];
for (let i = 0; i < pinned.length; i++) {
  const pin = pinned[i];
  const scenario = scenarios.find((s) => s && s.key === pin.key) || null;
  if (!pinTouchesProtectedState(pin, scenario)) {
    // Boxed into a brand-new file nothing depends on yet — risk-gate lets this pin past
    // unverified. The floor-touch trip-wire and the annotate-not-disarm backstop are OFF the
    // dial entirely; this skip only applies to a pin that touches NEITHER floor nor a shared
    // contract, in EITHER run mode (the gate trades a check for speed, never disables a guard).
    log('Intent-verify: pin ' + pin.key + ' is boxed into a brand-new file (no floor/contract touch) — adversary skipped per the risk-gate (D7).');
    continue;
  }
  let verdict = await guard(
    () => agent(intentVerifierPrompt(laneArgs, pin, scenario), { agentType: 'reasonable:intent-verifier', label: 'intent-verify:' + pin.key, phase: 'Intent-verify', schema: VERIFIER_VERDICT }),
  );
  if (isCheckpoint(verdict)) {
    return { kind: 'checkpoint', reason: 'intent-verify: ' + verdict.reason, pinned, inadmissible, suspectedBugs };
  }
  if (verdict === null) {
    // A missing verdict can only cause MORE human surfacing, never less (D6): escalate it.
    verifierEscalations.push({ key: pin.key, component: pin.component, verdict: 'escalate', reason: 'intent-verifier returned null — verdict not obtained; surfacing for the human (annotate-not-disarm: never fewer eyes).' });
    continue;
  }
  if (verdict.verdict === 'reject') {
    // Route reject back to the characterizer for ONE bounded re-pin against the same scenario,
    // then re-judge. A fixed control flow cannot grow an unbounded loop, so a still-rejected pin
    // escalates rather than thrashing toward acceptance.
    log('Intent-verify: pin ' + pin.key + ' REJECTED by the adversary (' + (verdict.reason || 'no reason') + ') — routing back to the characterizer for one re-pin.');
    const repin = await guard(
      () => agent(characterizePrompt(laneArgs, scenario || { key: pin.key, component: pin.component, seam: pin.seam, observable: '(re-pin against the adversary verdict)' }), { agentType: 'reasonable:characterizer', label: 'repin:' + pin.key, phase: 'Intent-verify', schema: PIN_RESULT }),
    );
    if (!isCheckpoint(repin) && repin && repin.status === 'pinned') {
      pinned[i] = repin;
      verdict = await guard(
        () => agent(intentVerifierPrompt(laneArgs, repin, scenario), { agentType: 'reasonable:intent-verifier', label: 'intent-verify:' + pin.key + ':retry', phase: 'Intent-verify', schema: VERIFIER_VERDICT }),
      );
    }
    if (isCheckpoint(verdict) || verdict === null || verdict.verdict !== 'accept') {
      verifierEscalations.push({ key: pin.key, component: pin.component, verdict: 'escalate', reason: 'pin still not accepted after one re-pin (' + ((verdict && verdict.reason) || 'no verdict') + ') — escalating to the human.' });
      continue;
    }
  }
  if (verdict.verdict === 'escalate') {
    verifierEscalations.push({ key: pin.key, component: pin.component, verdict: 'escalate', oracle: verdict.oracle, reason: verdict.reason || 'adversary escalated: genuinely unsettleable against the baseline-intent.' });
    continue;
  }
  // accept: a NARROW WRITER (separated from the read-only adversary, Law 3 corollary) appends
  //  the verifier-verdict to the on-disk append-only ledger (D5). This ANNOTATES the diff as
  //  explained-by-verdict — advisory only; it does NOT silence the floor-integrity backstop (D6).
  const verdictAck = await guard(
    () => agent(verdictWriterPrompt(laneArgs, verdict, pin), { agentType: 'reasonable:journal-writer', label: 'verdict-write:' + pin.key, phase: 'Intent-verify', schema: SCRIBE_ACK }),
  );
  if (verdictAck === null || isCheckpoint(verdictAck) || verdictAck.persisted !== true) {
    // A half-written verdict surfaces MORE, never less (D6): treat a failed append as an
    // escalation rather than swallowing the accept.
    verifierEscalations.push({ key: pin.key, component: pin.component, verdict: 'escalate', reason: 'accept verdict could not be durably appended to the ledger — surfacing (annotate-not-disarm).' });
    continue;
  }
  verdicts.push({ key: pin.key, component: pin.component, verdict: 'accept', oracle: verdict.oracle });
}
log('Intent-verify: ' + verdicts.length + ' pin(s) accepted (verdict recorded); ' + verifierEscalations.length + ' escalated to the human inbox.');

// 6. Invariant-verify (read-only): GREEN ON HEAD — the inverse of RED-on-HEAD~ —
//    plus parked-compile + floor-green. The auditor runs the commands itself.
phase('Invariant-verify');
log('Invariant-verify: confirming every parked characterization test is GREEN on HEAD (the inverse of RED-on-HEAD~), parked tests compile, the floor is green.');
const invariant = await guard(
  () => agent(invariantPrompt(args, pinned), { agentType: 'reasonable:auditor', label: 'invariant-verify', schema: INVARIANT_REPORT }),
);
if (isCheckpoint(invariant)) {
  return { kind: 'checkpoint', reason: 'invariant-verify: ' + invariant.reason, pinned, inadmissible, suspectedBugs };
}
if (invariant === null) {
  return { kind: 'halt', reason: 'invariant-verify returned null — the corpus invariant (GREEN-on-HEAD) was not confirmed; do not ratify an unverified corpus.' };
}

// 7. Scribe the derived index (serial, awaited). A null/false ack is a HALT — the
//    script must not proceed believing the index persisted (it loses no truth: the
//    derived index is rebuildable from git+ledger).
phase('Scribe');
log('Scribe: persisting the corpus births to the derived index (journal.json + inbox.json).');
const ack = await guard(
  () => agent(scribePrompt(args, pinned, invariant), { agentType: 'reasonable:journal-writer', label: 'scribe', schema: SCRIBE_ACK }),
);
if (ack === null || isCheckpoint(ack) || ack.persisted !== true) {
  return {
    kind: 'halt',
    reason: 'scribe did not persist the derived index (null / checkpoint / persisted:false) — index not written; reconcile rebuilds from git+ledger on the next run.',
  };
}

// 8. Return the typed CHARACTERIZATION_RESULT to the human birth-ratification gate.
//    The engine cannot block on a human; the main session is where blocking (gated
//    mode) happens. Silence never ratifies a corpus. An invariant failure, an
//    adversary ESCALATE (tension against the baseline-intent), or a `suspectedBug`
//    pin is surfaced for the human (autonomous: each joins the always-escalate
//    classes, queued BREAKING — D8).
//
//    THE STATUS-QUO-GREEN DEFAULT (D12). The keep / fix-it-pins-a-bug / defer call on
//    a born `characterized` pin has a DEFAULT answer supplied by the task itself
//    ("change what is stated, preserve the rest"): an ORTHOGONAL pin — one the
//    adversary ACCEPTED against the baseline-intent and that carries NO suspectedBug
//    flag — DEFAULTS to keep. It is logged-and-kept (the recorded verifier-verdict +
//    the corpus births), never escalated, in BOTH run modes. The human is engaged
//    ONLY on a POSITIVE conflict signal: (a) the characterizer's own `suspectedBug`
//    flag, or (b) the intent-verifier's ESCALATE verdict (tension against the
//    baseline-intent / the change's blast radius). Both are judgeable against
//    references that EXIST, so they earn the gate; an accepted, unflagged pin is
//    orthogonal and self-ratifies. (At analysis time no behaviorDelta is in flight,
//    so the adversary's ESCALATE is the only "tension" channel; an in-run change's
//    tension surfaces through the vertical-slice-runner.)
//
//    The floor backstop is routed by D13: an UNEXPLAINED autonomous breach
//    (floorBackstop.stops) ESCALATES-and-stops — it joins allEscalations and blocks
//    ratification exactly like an adversary ESCALATE. An EXPLAINED diff (the
//    pre-integration adversary accepted it) or a GATED floor diff is a non-blocking
//    NOTICE: it is still surfaced (logged + carried on floorBackstop for the human's
//    eyes — annotate-not-disarm), but it does NOT block ratification.
const invariantPassed = invariant.passed === true;
const allEscalations = verifierEscalations.slice();
// A `suspectedBug` pin is a POSITIVE conflict signal (a disclosed suspicion judged
// against a reference that EXISTS), so it escalates to the human three-way
// classification rather than riding the orthogonal logged-and-kept default. An
// accepted pin with NO suspectedBug is orthogonal and is NOT pushed here. An
// ACCEPTED pin that ALSO carries suspectedBug is still pushed — the verifier
// accepted only its suspectedBug-CONSISTENCY (the axis it owns); the correctness
// call stays the human three-way gate, so the two signals are not redundant.
for (const p of suspectedBugs) {
  allEscalations.push({ key: p.key, component: p.component, verdict: 'escalate', oracle: 'human three-way classification', reason: 'characterizer flagged suspectedBug — positive conflict signal; route to the human keep / fix-it-pins-a-bug / defer call (does not self-ratify).' });
}
const floorStops = !!(floorBackstop && floorBackstop.stops);
if (floorStops) {
  allEscalations.push({ key: '(floor-integrity)', verdict: 'escalate', oracle: 'floor backstop', reason: floorBackstop.reason });
}
if (floorBackstop && !floorStops) {
  log('Result: floor-integrity diff surfaced as a NON-BLOCKING NOTICE (D13: explained-by-verdict or gated) — logged on floorBackstop for the human; it does not block ratification.');
}
// The corpus ratifies (orthogonal pins logged-and-kept by the status-quo-green default)
// only when the invariant passes AND nothing escalated. A POSITIVE conflict signal — an
// adversary ESCALATE (tension), a `suspectedBug` pin, or an UNEXPLAINED autonomous floor
// breach — routes to the human just like an invariant failure; it never silently ratifies
// (the failure direction is always toward MORE scrutiny — D6). An accepted, unflagged
// (orthogonal) pin and an EXPLAINED/gated floor NOTICE do not count as escalations.
const clean = invariantPassed && allEscalations.length === 0;
return {
  kind: clean ? 'ratify' : (invariantPassed ? 'escalate' : 'invariant-failed'),
  runMode: state.runMode,
  pinned,
  inadmissible,
  suspectedBugs,
  invariant,
  verdicts,
  escalations: allEscalations,
  floorBackstop,
  note: clean
    ? 'Characterization corpus built and parked: ' + pinned.length + ' born `characterized` pin(s), each GREEN on HEAD, admitted by the reverse discriminator, and (where it touches the floor or a shared contract) accepted by the intent-verifier adversary against the baseline-intent. Every pin is orthogonal (adversary-accepted, no suspectedBug), so each is KEPT by the status-quo-green default — logged-and-kept, not escalated, in both modes (D12). ' +
      (verdicts.length ? verdicts.length + ' verifier-verdict(s) recorded (annotate-not-disarm — advisory). ' : '') +
      (inadmissible.length ? inadmissible.length + ' inadmissible pin(s) reported (not blessed into the suite). ' : '') +
      (floorBackstop ? 'A floor-integrity diff was surfaced as an explained-by-verdict/gated NOTICE (D13, advisory — does not block). ' : '') +
      'Present to the human birth-ratification gate; silence never ratifies.'
    : invariantPassed
      ? 'Characterization corpus is GREEN-on-HEAD, but ' + allEscalations.length + ' item(s) ESCALATED to the human on a POSITIVE conflict signal (an adversary ESCALATE / tension, a `suspectedBug` pin for the keep / fix-it-pins-a-bug / defer call, and/or an UNEXPLAINED autonomous floor-integrity breach — D12/D13): ' + allEscalations.map((e) => e.key).join(', ') + '. The orthogonal pins are kept by default; do not ratify until the human resolves the flagged item(s) — annotate-not-disarm means more eyes, never fewer.'
      : 'Characterization corpus FAILED its GREEN-on-HEAD invariant: ' + (invariant.failures || []).join('; ') + '. Do not ratify; route to the human.',
};
