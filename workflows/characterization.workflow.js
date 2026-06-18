// characterization.workflow.js — the brownfield analysis-time corpus pass (BF7).
//
// This is the *brownfield* twin of scaffold.workflow.js, and it occupies the same
// phase slot. A brownfield effort has no walking skeleton to build — the system
// already walks — so the scaffolding slot's job becomes: characterize the existing,
// observable, top-level scenarios as a PARKED baseline corpus of born `characterized`
// clauses + parked characterization tests. It mirrors the scaffold pipeline shape:
//
//     read-only probe  ->  census / born-contract write  ->  parked characterization
//     tests  ->  invariant-verify  ->  scribe  ->  return a typed result to the human
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
    { title: 'Reconcile', detail: 'Unconditional recovery prologue: re-derive truth from git+ledger+contracts; read runMode; halt on AMBIGUOUS.' },
    { title: 'Probe', detail: 'Read-only: enumerate the existing observable top-level scenarios and their seams from the running system and the FLOOR.' },
    { title: 'Characterize', detail: 'Per scenario: census skeleton check -> characterizer pins a born `characterized` clause + a PARKED characterization test (contract -> ledger event -> test), each admitted by the reverse discriminator.' },
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
    evidence: { type: ['string', 'null'], description: 'Conflicting SHAs / ledger-line-without-commit / unaccounted floor test.' },
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

async function guard(thunk, onCheckpoint) {
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

// ─────────────────────────────────────────────────────────────────────────────
// Prompt builders (pure string functions — the only way to vary an agent by content,
// since Date.now/random are forbidden). Each cites the effort root + plugin root from
// args, so agents can run the libs and read the shared .reasonable/ artifacts.
// ─────────────────────────────────────────────────────────────────────────────

function root(a) { return (a && a.effortRoot) || '.'; }
function plugin(a) { return (a && a.reasonableRoot) || '${reasonable}'; }

function reconcilePrompt(a) {
  return [
    'You are the reconcile prologue for the brownfield characterization corpus pass.',
    `Effort root: ${root(a)}. Plugin root: ${plugin(a)}.`,
    'Run UNCONDITIONALLY. Re-derive truth from git + the append-only ledger + the contract files;',
    'the resume cache has zero authority. Run `node ' + plugin(a) + '/lib/reconcile.mjs` and read its',
    'exact output. Partition every artifact configuration into RESOLVED / SAFE-DEFAULT / AMBIGUOUS.',
    'An AMBIGUOUS configuration is a blocking halt — set halt:true with haltReason + evidence; never guess.',
    'Read config.runMode (gated|autonomous); if absent/null on a cold restart, HALT (inferring mode is forbidden).',
    'Confirm config.brownfield: this pass only does work when it is true. If false, set brownfield:false (no-op).',
    'When brownfield is true, run the floor-integrity pass over baseline.json and report the FLOOR test ids.',
    'Return the BRIEFING. Evidence before assertions: name the command you ran and quote its output.',
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
  null,
);
if (isCheckpoint(state)) {
  return { kind: 'checkpoint', reason: 'reconcile: ' + state.reason };
}
if (state === null) {
  // null = user-skip / terminal API error after retries -> a verification gap, not a clean state.
  return { kind: 'halt', reason: 'reconcile returned null — recovery prologue did not complete; corpus not attempted.' };
}
if (state.halt) {
  return { kind: 'halt', reason: state.haltReason || 'reconcile: AMBIGUOUS configuration', evidence: state.evidence || null };
}
if (state.brownfield !== true) {
  // Brownfield is one provenance, not a second methodology; absent it, this pass is a no-op.
  return { kind: 'no-op', reason: 'config.brownfield is not set — the characterization corpus pass is a no-op (greenfield path untouched).' };
}

// 2. Read-only probe: enumerate the observable top-level scenarios to characterize.
phase('Probe');
log('Probe: enumerating the existing observable top-level scenarios (read-only).');
const catalogue = await guard(
  () => agent(probePrompt(args, state), { agentType: 'reasonable:census', label: 'probe', schema: SCENARIO_CATALOGUE }),
  null,
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
  return {
    kind: 'ratify',
    runMode: state.runMode,
    pinned: [],
    inadmissible: [],
    suspectedBugs: [],
    invariant: null,
    note: 'No observable top-level scenarios found to characterize. The FLOOR (baseline.json) still stands as the regression containment fence; the corpus is empty.',
  };
}
log('Probe found ' + scenarios.length + ' observable top-level scenario(s) to characterize.');

// 3. Characterize each scenario through the pin pipeline (NO BARRIER): census-skeleton
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
    (s) => guard(() => agent(censusCheckPrompt(args, s), { agentType: 'reasonable:census', label: 'census:' + s.key, phase: 'Characterize' }), null),
    (skeleton, s) => {
      if (isCheckpoint(skeleton)) return { key: s.key, component: s.component, status: 'error', atomicOrderHeld: false, note: 'census checkpoint: ' + skeleton.reason };
      return guard(() => agent(characterizePrompt(args, s), { agentType: 'reasonable:characterizer', label: 'pin:' + s.key, phase: 'Characterize', schema: PIN_RESULT }), null);
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

// 4. Invariant-verify (read-only): GREEN ON HEAD — the inverse of RED-on-HEAD~ —
//    plus parked-compile + floor-green. The auditor runs the commands itself.
phase('Invariant-verify');
log('Invariant-verify: confirming every parked characterization test is GREEN on HEAD (the inverse of RED-on-HEAD~), parked tests compile, the floor is green.');
const invariant = await guard(
  () => agent(invariantPrompt(args, pinned), { agentType: 'reasonable:auditor', label: 'invariant-verify', schema: INVARIANT_REPORT }),
  null,
);
if (isCheckpoint(invariant)) {
  return { kind: 'checkpoint', reason: 'invariant-verify: ' + invariant.reason, pinned, inadmissible, suspectedBugs };
}
if (invariant === null) {
  return { kind: 'halt', reason: 'invariant-verify returned null — the corpus invariant (GREEN-on-HEAD) was not confirmed; do not ratify an unverified corpus.' };
}

// 5. Scribe the derived index (serial, awaited). A null/false ack is a HALT — the
//    script must not proceed believing the index persisted (it loses no truth: the
//    derived index is rebuildable from git+ledger).
phase('Scribe');
log('Scribe: persisting the corpus births to the derived index (journal.json + inbox.json).');
const ack = await guard(
  () => agent(scribePrompt(args, pinned, invariant), { agentType: 'reasonable:journal-writer', label: 'scribe', schema: SCRIBE_ACK }),
  null,
);
if (ack === null || isCheckpoint(ack) || ack.persisted !== true) {
  return {
    kind: 'halt',
    reason: 'scribe did not persist the derived index (null / checkpoint / persisted:false) — index not written; reconcile rebuilds from git+ledger on the next run.',
  };
}

// 6. Return the typed CHARACTERIZATION_RESULT to the human birth-ratification gate.
//    The engine cannot block on a human; the main session is where blocking (gated
//    mode) happens. Silence never ratifies a corpus. An invariant failure or any
//    inadmissible / suspected-bug pin is surfaced for the three-way classification.
const invariantPassed = invariant.passed === true;
return {
  kind: invariantPassed ? 'ratify' : 'invariant-failed',
  runMode: state.runMode,
  pinned,
  inadmissible,
  suspectedBugs,
  invariant,
  note: invariantPassed
    ? 'Characterization corpus built and parked: ' + pinned.length + ' born `characterized` pin(s), each GREEN on HEAD and admitted by the reverse discriminator. ' +
      (inadmissible.length ? inadmissible.length + ' inadmissible pin(s) reported (not blessed into the suite). ' : '') +
      (suspectedBugs.length ? suspectedBugs.length + ' pin(s) flagged as possibly encoding a bug — for the human three-way classification. ' : '') +
      'Present to the human birth-ratification gate; silence never ratifies.'
    : 'Characterization corpus FAILED its GREEN-on-HEAD invariant: ' + (invariant.failures || []).join('; ') + '. Do not ratify; route to the human.',
};
