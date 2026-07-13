// characterization.workflow.js - the brownfield analysis-time FRONTIER INVENTORY pass.
//
// REDESIGN (frontier-scoped + defer the teeth, 2026-06-26). The brownfield twin of the scaffolding
// slot is NO LONGER a tooth-bearing corpus pass over the whole observable surface. census.md already
// states the cost-asymmetry split - "the topology census is cheap and global, done up front;
// behavioural pins are expensive and demand-driven, done later at the seam by the characterizer."
// This workflow now OBEYS that split: it is a READ-ONLY, FRONTIER-SCOPED observation that records a
// thin prose `## Scenarios` inventory, and DEFERS every tooth (born `characterized` clause + parked
// test + BF2 reverse discriminator + intent-verifier) to first-touch genesis inside the
// frontier-wave, which already runs them in full and is now the SOLE birthplace of a
// `characterized` clause. (architecture S18; spec docs/superpowers/specs/2026-06-26-...)
//
// WHY THE OLD APPARATUS IS GONE. Lane provisioning, the two-root fenced-mutator dance, the
// per-scenario census-check, the characterizer, the intent-verifier trio + verdict-writer, and the
// GREEN-on-HEAD invariant ALL existed to safely land a parked TEST (code) onto floor-tracked files.
// This pass writes no test and no code - only a prose `## Scenarios` section into census's own
// skeleton contracts, exactly as census writes `## Topology` at analysis, read-only on production
// code. No code write => no floor touch => no fence to arm => no lane, no adversary, no invariant.
//
// THE FLOOR IS UNCHANGED. baseline.json (written by census) remains the regression-containment
// fence for every pre-existing test. Untouched seams stay floor-protected; deferral changes only the
// TIMING of behavioural pins (eager -> lazy at first touch), never the protection.
//
// PURITY (substrate, absolute). Plain JS, no TypeScript. No fs, no Date.now/Math.random/new Date()
// (they THROW in the body). All side effects happen INSIDE agents. `meta` is a pure literal. No
// imports. Hooks used: agent(), log(), phase(), args; guard() wraps each agent so a budget ceiling
// becomes a structured checkpoint.
//
// RETURN. A typed result for the human birth-ratification gate (the engine cannot block on a human).
// Kinds: ratify | no-op | halt | checkpoint. There is no `escalate`/`invariant-failed` here - with
// no pins there is no adversary verdict and no suspectedBug to surface; both live at first touch.
// Silence never ratifies.

export const meta = {
  name: 'characterization',
  description: 'Brownfield analysis-time FRONTIER pass: enumerate ONLY the frontier observable scenarios (route-intended / integration-risk) and record a thin prose `## Scenarios` inventory in census\'s skeleton contracts; defer every tooth-bearing pin to first-touch genesis. Read-only on code. Returns a typed result to the human birth-ratification gate.',
  whenToUse: 'Launched from the main session at the brownfield scaffolding slot (config.brownfield true), AFTER census has written baseline.json + skeleton contracts and analysis has drafted the route + change-intention. NOT the tooth-bearing pin path - that is first-touch genesis inside frontier-wave.',
  phases: [
    { title: 'Reconcile', detail: 'Unconditional recovery prologue: re-derive truth from git+ledger+contracts; read runMode; halt on AMBIGUOUS / runmode-absent. A floor-integrity diff is a non-blocking ADVISORY notice here (this pass mutates no floor state).' },
    { title: 'Inventory', detail: 'One read-only census agent: read the drafted route + change-intention + baseline.json; enumerate ONLY frontier scenarios; append a prose `## Scenarios` section (zero clauses, zero citations) to each frontier component\'s skeleton contract at the canonical root.' },
    { title: 'Scribe', detail: 'The lone serialized journal-writer records the frontier inventory + the transition into the derived index (journal.json + inbox.json) for the gate.' },
  ],
};

// -- Inlined schemas (JSON Schema literals; the engine forces + validates them) --

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
      description: 'Which class triggered the halt. floor-integrity is a NON-BLOCKING advisory notice in this read-only pass (it writes no floor state); the other four classes stay first-line HALTs.',
    },
    evidence: { type: ['string', 'null'] },
    runMode: { type: ['string', 'null'], enum: ['gated', 'autonomous', null], description: 'Read from config.json, never inferred. Absent -> halt.' },
    brownfield: { type: 'boolean', description: 'Must be true for this pass to do work; false -> no-op.' },
    floorNotice: { type: ['string', 'null'], description: 'A surfaced floor-integrity diff, carried as ADVISORY only - it never blocks this pass.' },
    note: { type: ['string', 'null'] },
  },
};

const FRONTIER_INVENTORY = {
  type: 'object',
  additionalProperties: false,
  required: ['scenarios', 'inventoryWritten'],
  properties: {
    scenarios: {
      type: 'array',
      maxItems: 256,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['key', 'component', 'observable', 'seam'],
        properties: {
          key: { type: 'string', description: 'Stable slug for the frontier scenario (dedup key + bullet label).' },
          component: { type: 'string', description: 'The owning component (its skeleton contract was born by census).' },
          observable: { type: 'string', description: 'The user-visible behaviour, in observable terms (pin what IS).' },
          seam: { type: 'string', description: 'The seam / declared locus (a file glob) the eventual first-touch pin will capture.' },
          floorTests: { type: 'array', items: { type: 'string' }, description: 'FLOOR test ids already touching this seam, if any.' },
          reason: { type: ['string', 'null'], description: 'Why it is ON the frontier - a drafted-route node, or named integration risk.' },
        },
      },
    },
    inventoryWritten: { type: 'boolean', description: 'The prose `## Scenarios` section was appended (zero clauses, zero citations) to each frontier component\'s skeleton contract at the CANONICAL effort root.' },
    componentsTouched: { type: 'array', items: { type: 'string' }, description: 'The components whose skeleton contracts gained a `## Scenarios` section.' },
    note: { type: ['string', 'null'] },
  },
};

const SCRIBE_ACK = {
  type: 'object',
  additionalProperties: false,
  required: ['persisted'],
  properties: {
    persisted: { type: 'boolean', description: 'journal.json + inbox.json written faithfully against their schemas.' },
    transition: { type: ['string', 'null'] },
    note: { type: ['string', 'null'] },
  },
};

// -- Inlined helpers (pure - no fs, no Date.now/random) -------------------------

async function guard(thunk) {
  try {
    return await thunk();
  } catch (e) {
    // A budget ceiling (or any agent throw) becomes a structured checkpoint, never a silent pass.
    return { __checkpoint: true, reason: (e && e.message) || 'agent threw (budget ceiling or terminal error)' };
  }
}

function isCheckpoint(x) {
  return x !== null && typeof x === 'object' && x.__checkpoint === true;
}

function root(a) { return (a && a.effortRoot) || '.'; }
function plugin(a) { return (a && a.reasonableRoot) || '${reasonable}'; }

// callShapeReminder - appended to every schema-forced prompt below. The model
// intermittently mis-calls a forced StructuredOutput tool by JSON-stringifying its
// whole answer into one wrapper property ({"input":"{...}"}) instead of passing the
// schema's fields as the call's own top-level arguments; each such call fails schema
// validation and burns one of the 5 retries (five in a row exhaust the cap and throw -
// the graph-editor-ux-overhaul reconciler crash). Inlined per file: the pure-substrate
// no-import rule (invariant #5) forbids sharing it across workflows.
const callShapeReminder =
  'TOOL-CALL SHAPE: call the forced tool with the schema\'s fields as the CALL\'S OWN top-level arguments (e.g. {"halt": false, "runMode": "autonomous", ...}) - do NOT JSON-stringify the whole answer into a wrapper property (e.g. {"input": "{...}"}); that fails schema validation and burns a retry.';

// -- Prompt builders (pure string functions) ------------------------------------

function reconcilePrompt(a) {
  return [
    'You are the reconcile prologue for the brownfield FRONTIER characterization pass.',
    `Effort root: ${root(a)}. Plugin root: ${plugin(a)}.`,
    'Run UNCONDITIONALLY. Re-derive truth from git + the append-only ledger + the contract files;',
    'the resume cache has zero authority. Run `node ' + plugin(a) + '/lib/reconcile.mjs --root ' + root(a) + '` and read',
    'its exact output. Partition every artifact configuration into RESOLVED / SAFE-DEFAULT / AMBIGUOUS.',
    'An AMBIGUOUS configuration is a blocking halt - set halt:true with haltReason + evidence + haltClass; never guess.',
    'The first-line HALT classes stay HALTs: sha-custody, ledger-without-commit, runmode-absent, two-lanes-one-wo.',
    'A floor-integrity mismatch is DIFFERENT here: this pass writes NO code and NO test and mutates NO floor state,',
    'so a floor-integrity diff is a NON-BLOCKING ADVISORY notice - set floorNotice with the evidence, do NOT halt on it.',
    'Read config.runMode (gated|autonomous); if absent/null on a cold restart, HALT (inferring mode is forbidden).',
    'Confirm config.brownfield: this pass only does work when it is true. If false, set brownfield:false (no-op).',
    'Return the BRIEFING. Evidence before assertions: name the command you ran and quote its output.',
    callShapeReminder,
  ].join('\n');
}

function inventoryPrompt(a) {
  return [
    'You are the census (brownfield, READ-ONLY on production code) building the FRONTIER scenario inventory.',
    `Effort root (canonical .reasonable/ - read AND write here, by absolute path): ${root(a)}. Plugin root: ${plugin(a)}.`,
    'This is the analysis-time FRONTIER pass. You do NOT pin behaviour with teeth: no born `characterized`',
    'clause, no parked test, no reverse discriminator. Those are first-touch genesis (frontier-wave),',
    'demand-driven, after an implementer declares a behaviorDelta. Here you record a THIN, observational map.',
    '',
    'STEP 1 - scope to the FRONTIER. Read the drafted route and the change-intention from `' + root(a) + '/.reasonable/`',
    '(find them via Read/Grep/Glob - the route backlog + the change-intention the analysis phase emitted) and',
    '`' + root(a) + '/.reasonable/baseline.json` (the FLOOR). Enumerate ONLY the observable top-level scenarios that',
    'are ON THE FRONTIER: a scenario the drafted route intends to touch, OR one named as integration risk. Do NOT',
    'enumerate the whole observable surface - a scenario orthogonal to the route is left to the FLOOR and to lazy',
    'first-touch genesis if a later slice ever reaches it. For each frontier scenario name: a stable `key`, the',
    'owning `component` (its skeleton contract was born by census), the `observable` behaviour in user-visible terms',
    '(pin what IS, not what should be), the `seam` (file glob the eventual pin will capture), any FLOOR test ids',
    'touching that seam, and the `reason` it is on the frontier.',
    '',
    'STEP 2 - write the THIN inventory (prose, zero teeth). For each frontier component, APPEND a `## Scenarios`',
    'section to its EXISTING skeleton contract `' + root(a) + '/.reasonable/contracts/<component>.md` via Bash (your',
    'role has no Edit/Write; emit via a heredoc append, exactly as you emit `## Topology`). One bullet per frontier',
    'scenario, in this prose shape (NEVER begin a bullet with the reserved keywords Gate:/Provenance:/Supersession:/Seam:):',
    '    - <key>: <observable> (seam: `<glob>`; floor: <comma-separated test ids, or ->)',
    'The `## Scenarios` section MUST contain ZERO `### SN` clauses and ZERO `## Citations` bullets - it is an',
    'advisory map, parser-invisible and footprint-zero, exactly like `## Topology`. Do NOT add a Citations bullet,',
    'do NOT birth a clause, do NOT confer trust. NEVER write into a worktree `.reasonable/` (there is no lane here).',
    '',
    'Read only production code; write only the `## Scenarios` prose into the canonical skeleton contracts.',
    'Return the FRONTIER_INVENTORY: the scenarios enumerated, inventoryWritten true once the sections are appended,',
    'and componentsTouched. Evidence before assertions: name the route/intention you read and the files you appended to.',
    callShapeReminder,
  ].join('\n');
}

function scribePrompt(a, inv) {
  const recorded = (inv.scenarios || []).map((s) => ({ key: s.key, component: s.component, seam: s.seam }));
  return [
    'You are the journal-writer (the lone serialized scribe). Persist the derived index for the brownfield',
    'FRONTIER characterization pass. Write ONLY journal.json + inbox.json - never the ledger, contracts, or code.',
    'Read both files before editing; match docs/artifacts.md field-for-field; invent no fields.',
    `Effort root: ${root(a)}.`,
    'Record the transition: phase -> the frontier scenario inventory is built and recorded; record the frontier',
    'scenarios (key + component + seam) so the retro / birth-ratification gate can see the frontier arrived as',
    'expected: ' + JSON.stringify(recorded) + '.',
    'inventoryWritten: ' + JSON.stringify(inv.inventoryWritten === true) + '; componentsTouched: ' + JSON.stringify(inv.componentsTouched || []) + '.',
    'If you cannot complete a clean, faithful write, return persisted:false (the script reads that as HALT - never a',
    'swallow; the derived index is rebuildable from git+ledger so halting loses no truth). Return the SCRIBE_ACK.',
    callShapeReminder,
  ].join('\n');
}

// -- The run (fixed control-flow shape; three agents, no fan-out) ---------------

// 1. Reconcile prologue (unconditional; halt is authoritative; floor-integrity is advisory here).
phase('Reconcile');
log('Reconcile: re-deriving truth from git + ledger + contracts (resume cache has zero authority).');
const state = await guard(
  () => agent(reconcilePrompt(args), { agentType: 'reasonable:reconciler', label: 'reconcile', schema: BRIEFING }),
);
if (isCheckpoint(state)) {
  return { kind: 'checkpoint', reason: 'reconcile: ' + state.reason };
}
if (state === null) {
  return { kind: 'halt', reason: 'reconcile returned null - recovery prologue did not complete; frontier inventory not attempted.' };
}
if (state.halt && state.haltClass !== 'floor-integrity') {
  // The four first-line halt classes still HALT: sha-custody, ledger-without-commit, runmode-absent, two-lanes-one-wo.
  return { kind: 'halt', reason: state.haltReason || 'reconcile: AMBIGUOUS configuration', evidence: state.evidence || null };
}
// floor-integrity is a NON-BLOCKING advisory notice in this read-only pass (it mutates no floor state).
const floorNotice = state.floorNotice
  || (state.halt && state.haltClass === 'floor-integrity'
    ? (state.haltReason || 'floor-integrity diff surfaced (advisory; this pass mutates no floor state).')
    : null);
if (floorNotice) {
  log('Reconcile: floor-integrity diff surfaced as an ADVISORY notice - logged for the human; it does not block this read-only pass.');
}
if (state.brownfield !== true) {
  // Brownfield is one provenance, not a second methodology; absent it, this pass is a no-op.
  return { kind: 'no-op', reason: 'config.brownfield is not set - the frontier characterization pass is a no-op (greenfield path untouched).' };
}

// 2. Build + write the frontier inventory (one read-only census agent; no fan-out, no lane).
phase('Inventory');
log('Inventory: enumerating the FRONTIER observable scenarios (route-intended / integration-risk) and writing the thin `## Scenarios` map.');
const inv = await guard(
  () => agent(inventoryPrompt(args), { agentType: 'reasonable:census', label: 'frontier-inventory', schema: FRONTIER_INVENTORY }),
);
if (isCheckpoint(inv)) {
  return { kind: 'checkpoint', reason: 'inventory: ' + inv.reason, floorNotice };
}
if (inv === null) {
  return { kind: 'halt', reason: 'frontier inventory returned null - no scenario map produced; pass not completed.', floorNotice };
}
const scenarios = inv.scenarios || [];
log('Inventory: ' + scenarios.length + ' frontier scenario(s) recorded across ' + ((inv.componentsTouched || []).length) + ' component(s).');

// An empty frontier is honest (nothing route-intended yet to inventory). The FLOOR still stands.
if (scenarios.length === 0) {
  return {
    kind: 'ratify',
    runMode: state.runMode,
    frontierScenarios: [],
    inventoryWritten: inv.inventoryWritten === true,
    componentsTouched: inv.componentsTouched || [],
    floorNotice,
    note: 'No frontier scenarios to inventory (none route-intended / integration-risk). The FLOOR (baseline.json) still stands as the regression containment fence; tooth-bearing pins are born lazily at first touch.',
  };
}

// 3. Scribe the derived index (serial, awaited). A null/false ack is a HALT.
phase('Scribe');
log('Scribe: persisting the frontier inventory to the derived index (journal.json + inbox.json).');
const ack = await guard(
  () => agent(scribePrompt(args, inv), { agentType: 'reasonable:journal-writer', label: 'scribe', schema: SCRIBE_ACK }),
);
if (ack === null || isCheckpoint(ack) || ack.persisted !== true) {
  return {
    kind: 'halt',
    reason: 'scribe did not persist the derived index (null / checkpoint / persisted:false) - index not written; reconcile rebuilds from git+ledger on the next run.',
    floorNotice,
  };
}

// 4. Return the typed result to the human birth-ratification gate. Silence never ratifies.
return {
  kind: 'ratify',
  runMode: state.runMode,
  frontierScenarios: scenarios.map((s) => ({ key: s.key, component: s.component, seam: s.seam, observable: s.observable, floorTests: s.floorTests || [], reason: s.reason || null })),
  inventoryWritten: inv.inventoryWritten === true,
  componentsTouched: inv.componentsTouched || [],
  floorNotice,
  note: 'Frontier scenario inventory built and recorded: ' + scenarios.length + ' route-intended / integration-risk scenario(s) mapped as a thin prose `## Scenarios` baseline (zero clauses, zero citations - parser-invisible, footprint-zero). NO tooth-bearing pins were created; every born `characterized` clause + parked test + reverse discriminator + intent-verifier is deferred to first-touch genesis (frontier-wave), with the FLOOR (baseline.json) unchanged as the regression containment fence. Present to the human birth-ratification gate; silence never ratifies.'
    + (floorNotice ? ' A floor-integrity diff was surfaced as an advisory notice (does not block).' : ''),
};
