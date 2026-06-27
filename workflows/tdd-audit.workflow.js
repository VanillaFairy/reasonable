// tdd-audit.workflow.js — the reasonable:tdd-audit diagnostic. Audits an EXISTING test suite
// (any repo, no effort required) for coverage / quality / honesty, then MECHANICALLY confirms
// each sycophancy flag with the per-test reverse-discriminator. Read-only end to end.
//
// PURITY (invariant #5): plain JS, no imports, no fs / Date.now / random in the script body. All
// side effects happen INSIDE agents (the test-auditor nodes). The script only orchestrates and
// composes prompts. `meta` is a pure literal. Must LOAD under test/workflow-load.test.mjs.
export const meta = {
  name: 'reasonable-tdd-audit',
  description:
    'Audit an existing test suite for coverage, quality, and honesty, then mechanically confirm each sycophancy flag with the per-test reverse-discriminator. Read-only; reports a coverage x honesty x teeth verdict. Runs standalone (no .reasonable/ effort needed); lights up bidirectional mapping when contracts are present.',
  whenToUse:
    'Launched by the reasonable:tdd-audit skill to audit a brownfield (or any) repo. One run = one audit. Never mutates code or .reasonable/ state; returns a typed report the skill renders for the human.',
  phases: [
    { title: 'Survey', detail: 'detect stack(s), the full-suite + single-test commands, enumerate source<->test pairs and coverage partitions' },
    { title: 'Judge', detail: 'parallel read-only test-auditor lenses: coverage (partitioned), integration, runner, stale, quality, honesty' },
    { title: 'Confirm', detail: 'per honesty flag, run the reverse-discriminator to prove/disprove vacuity; plus sanity scan and (if contracts present) bidirectional mapping' },
    { title: 'Report', detail: 'pure merge into a coverage x honesty x teeth verdict, with explicit skips' },
  ],
}

// --- Inlined schemas (purity: every schema is a literal here) ----------------

const SURVEY = {
  type: 'object', additionalProperties: false,
  required: ['isGitRepo', 'hasContracts', 'subprojects', 'pairs'],
  properties: {
    isGitRepo: { type: 'boolean', description: 'true iff targetRoot is a git repo (teeth confirmation needs a HEAD worktree)' },
    hasContracts: { type: 'boolean', description: 'true iff a .reasonable/ with contracts is present (lights up bidirectional mapping)' },
    subprojects: {
      type: 'array', description: 'one per distinct runner/language; a single-tree repo has one',
      items: {
        type: 'object', additionalProperties: false, required: ['name', 'testCommand'],
        properties: {
          name: { type: 'string' },
          testCommand: { type: 'string', description: 'the full-suite command, or "unknown"' },
          testOneCommand: { type: ['string', 'null'], description: 'single-test command template with a {test} placeholder, or null if none detectable' },
          testGlobs: { type: 'array', items: { type: 'string' }, description: 'globs identifying test files' },
          sourceDirs: { type: 'array', items: { type: 'string' } },
          testDirs: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    pairs: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['source'], properties: { source: { type: 'string' }, test: { type: ['string', 'null'] } } } },
    coveragePartitions: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['name', 'files'], properties: { name: { type: 'string' }, files: { type: 'array', items: { type: 'string' } } } } },
    notes: { type: 'array', items: { type: 'string' } },
  },
}

const COVERAGE = {
  type: 'object', additionalProperties: false, required: ['scope', 'behaviors'],
  properties: {
    scope: { type: 'string' },
    behaviors: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['source', 'name', 'priority', 'status'], properties: {
      source: { type: 'string' }, name: { type: 'string' },
      priority: { type: 'string', enum: ['HIGH', 'MEDIUM', 'LOW'] },
      status: { type: 'string', enum: ['TESTED', 'PARTIAL', 'UNTESTED'] },
      note: { type: 'string' },
    } } },
    correctnessFlags: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['location', 'what'], properties: { location: { type: 'string' }, what: { type: 'string' } } } },
  },
}

const RUNNER = {
  type: 'object', additionalProperties: false, required: ['buildOk'],
  properties: {
    totalTests: { type: 'integer' }, passed: { type: 'integer' }, failed: { type: 'integer' }, skipped: { type: 'integer' },
    buildOk: { type: 'boolean' }, errors: { type: 'string' },
  },
}

const INTEGRATION = {
  type: 'object', additionalProperties: false, required: ['categories'],
  properties: { categories: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['name', 'status'], properties: { name: { type: 'string' }, status: { type: 'string', enum: ['PRESENT', 'PARTIAL', 'MISSING'] }, note: { type: 'string' } } } } },
}

const STALE = {
  type: 'object', additionalProperties: false, required: ['brokenImports', 'deadReferences', 'disabledTests'],
  properties: {
    brokenImports: { type: 'array', items: { type: 'string' } },
    deadReferences: { type: 'array', items: { type: 'string' } },
    disabledTests: { type: 'array', items: { type: 'string' } },
  },
}

const QUALITY = {
  type: 'object', additionalProperties: false, required: ['files'],
  properties: { files: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['file', 'positive', 'negative', 'edge', 'error'], properties: { file: { type: 'string' }, positive: { type: 'boolean' }, negative: { type: 'boolean' }, edge: { type: 'boolean' }, error: { type: 'boolean' } } } } },
}

const HONESTY = {
  type: 'object', additionalProperties: false, required: ['behaviors'],
  properties: {
    behaviors: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['source', 'verdict', 'priority'], properties: {
      source: { type: 'string' }, testId: { type: ['string', 'null'], description: 'the single-test id the confirm lens will pass to --test' },
      locus: { type: ['string', 'null'], description: 'the source glob the test pins (for --locus); null if unknown' },
      behavior: { type: 'string' },
      priority: { type: 'string', enum: ['HIGH', 'MEDIUM', 'LOW'] },
      verdict: { type: 'string', enum: ['TRUSTWORTHY', 'SUSPECT', 'SYCOPHANTIC'] },
      signals: { type: 'array', items: { type: 'string' } },
      intentSource: { type: 'string' },
    } } },
    correctnessFlags: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['test', 'what'], properties: { test: { type: 'string' }, what: { type: 'string' } } } },
  },
}

const CONFIRM = {
  type: 'object', additionalProperties: false, required: ['testId', 'ran'],
  properties: {
    testId: { type: 'string' },
    ran: { type: 'boolean', description: 'false => skipped (not a git repo, no single-test cmd, missing locus)' },
    admissible: { type: ['boolean', 'null'], description: 'true = had teeth (downgrade); false = mechanically-confirmed vacuous; null = not run' },
    skippedReason: { type: 'string' },
    killingMutant: { type: 'string' },
  },
}

const SCAN = {
  type: 'object', additionalProperties: false, required: ['sanityRan', 'mappingRan'],
  properties: {
    sanityRan: { type: 'boolean' }, sanityFindings: { type: 'array', items: { type: 'string' } },
    mappingRan: { type: 'boolean' }, mappingFindings: { type: 'array', items: { type: 'string' } },
    skipped: { type: 'array', items: { type: 'string' } },
  },
}

// --- Helpers (inlined; no name collides with any const) ----------------------

async function guard(thunk) {
  try { return await thunk() }
  catch (e) { return { kind: 'checkpoint', reason: 'budget ceiling: ' + (e && e.message ? e.message : String(e)) } }
}
function ok(r) { return r && r.kind !== 'checkpoint' }

function baseCtx(a) {
  return 'targetRoot=' + (a.targetRoot || '(cwd)') + '; reasonable plugin root=' + (a.reasonableRoot || '$CLAUDE_PLUGIN_ROOT') + (a.scope ? ('; scope=' + a.scope) : '') + '.'
}
function surveyPrompt(a) {
  return [
    'You are the test-auditor, lens = SURVEY. ' + baseCtx(a),
    'Detect the stack(s), the full-suite test command, and the SINGLE-TEST command template (must contain a {test} placeholder — the confirm lens needs it). Enumerate source<->test pairs and, if large, propose coverage partitions of ~15-20 source files. One subproject per distinct runner/language (a monorepo is the common case; do not collapse it).',
    'Set isGitRepo (is targetRoot a git repo?) and hasContracts (is there a .reasonable/ with contracts?). Return the SURVEY schema. Read-only.',
  ].join('\n')
}
function coveragePrompt(a, survey, p) {
  return [
    'You are the test-auditor, lens = COVERAGE. ' + baseCtx(a),
    'SCOPE (your partition): ' + JSON.stringify((p && p.files) || []) + '.',
    'For each source file in scope, list the public surface and mark each behavior TESTED / PARTIAL / UNTESTED by READING the test assertions (not just file existence). Assign priority by blast radius. Note correctness flags you spot in passing (report, never fix). Return the COVERAGE schema.',
  ].join('\n')
}
function lensPrompt(a, survey, lens, schemaName) {
  return [
    'You are the test-auditor, lens = ' + lens.toUpperCase() + '. ' + baseCtx(a),
    'Survey context: testCommands=' + JSON.stringify((survey.subprojects || []).map((s) => s.testCommand)) + ', pairs=' + JSON.stringify(survey.pairs || []) + '.',
    'Follow your constitution\'s ' + lens + ' lens exactly and return the ' + schemaName + ' schema. Read-only.',
  ].join('\n')
}
function honestyPrompt(a, survey) {
  return [
    'You are the test-auditor, lens = HONESTY. ' + baseCtx(a),
    'Judge each source<->test pair against the canonical rubric at ' + (a.reasonableRoot || '$CLAUDE_PLUGIN_ROOT') + '/skills/tdd-audit/references/test-honesty-rubric.md. Find each behavior\'s INTENT SOURCE and judge against THAT, not the implementation.',
    'For every SYCOPHANTIC or SUSPECT row, populate testId (the id the single-test command runs) and locus (the source glob it pins) so the confirm phase can mechanically check it. Pairs: ' + JSON.stringify(survey.pairs || []) + '. Return the HONESTY schema.',
  ].join('\n')
}
function confirmPrompt(a, survey, flag) {
  const sp = (survey.subprojects || [])[0] || {}
  const oneCmd = sp.testOneCommand || '(no single-test command detected)'
  const globs = (sp.testGlobs || []).join(',')
  return [
    'You are the test-auditor, lens = CONFIRM. ' + baseCtx(a),
    'Mechanically settle ONE honesty flag: testId=' + JSON.stringify(flag.testId || null) + ', locus=' + JSON.stringify(flag.locus || null) + ', source=' + JSON.stringify(flag.source || null) + '.',
    'If targetRoot is a git repo AND a single-test command exists AND locus is known, run the reverse-discriminator:',
    "  node " + (a.reasonableRoot || '$CLAUDE_PLUGIN_ROOT') + "/lib/discriminator.mjs --reverse --test '" + (flag.testId || '<id>') + "' --locus '" + (flag.locus || '<glob>') + "' --test-one-cmd '" + oneCmd + "' " + (globs ? ("--test-glob '" + globs + "' ") : '') + "--tree '" + (a.targetRoot || '.') + "' --json",
    'admissible:false => mechanically-confirmed vacuous (ran:true, admissible:false). admissible:true => had teeth, downgrade (ran:true, admissible:true). If you cannot run it, set ran:false with skippedReason. Return the CONFIRM schema. Do NOT edit anything.',
  ].join('\n')
}
function scanPrompt(a, survey) {
  return [
    'You are the test-auditor, lens = CONFIRM (scan). ' + baseCtx(a),
    'Run `node ' + (a.reasonableRoot || '$CLAUDE_PLUGIN_ROOT') + '/lib/sanity.mjs scan` and report sanityFindings. ' + (survey.hasContracts ? 'Contracts ARE present: also run `node ' + (a.reasonableRoot || '$CLAUDE_PLUGIN_ROOT') + '/lib/citation-resolve.mjs` and report mappingFindings.' : 'No contracts present: set mappingRan:false and add "mapping — no contracts present" to skipped.'),
    'Return the SCAN schema. Read-only.',
  ].join('\n')
}

// Pure: pull the rows the confirm phase should mechanically check (SYCOPHANTIC first, then SUSPECT).
function collectFlags(honesty) {
  const rows = (honesty && honesty.behaviors) || []
  return rows.filter((b) => b.verdict === 'SYCOPHANTIC' || b.verdict === 'SUSPECT').filter((b) => b.testId)
}

// Pure: the three-axis verdict (coverage x honesty x teeth). Thresholds mirror the original
// tdd-audit command's rules, hardened by mechanical confirmation.
function computeVerdict(coverage, runner, honesty, confirmed) {
  const vacuousIds = {}
  for (const c of (confirmed || [])) if (c && c.ran && c.admissible === false) vacuousIds[c.testId] = true
  const behaviors = []
  for (const c of (coverage || [])) for (const b of (c.behaviors || [])) behaviors.push(b)
  const highUntested = behaviors.some((b) => b.priority === 'HIGH' && b.status === 'UNTESTED')
  const hRows = (honesty && honesty.behaviors) || []
  const highSycoConfirmed = hRows.some((b) => b.priority === 'HIGH' && b.verdict === 'SYCOPHANTIC' && vacuousIds[b.testId])
  const suiteBroken = !!runner && (runner.buildOk === false || (runner.failed || 0) > 0)
  if (suiteBroken || highUntested || highSycoConfirmed) return 'FAILING'
  const anySyco = hRows.some((b) => b.verdict === 'SYCOPHANTIC')
  const highPartial = behaviors.some((b) => b.priority === 'HIGH' && b.status === 'PARTIAL')
  const anyConfirmedVacuous = Object.keys(vacuousIds).length > 0
  if (anySyco || highPartial || anyConfirmedVacuous) return 'NEEDS WORK'
  return 'PASS'
}

// --- The run -----------------------------------------------------------------

const a = { ...(args || {}) } // never mutate the frozen args global

phase('Survey')
log('Survey: detecting stack(s), test commands, and source<->test pairs.')
const survey = await guard(() => agent(surveyPrompt(a), { label: 'survey', phase: 'Survey', agentType: 'reasonable:test-auditor', schema: SURVEY }))
if (!ok(survey)) {
  return { kind: 'report', verdict: 'FAILING', error: 'survey did not complete: ' + ((survey && survey.reason) || 'null return'), skipped: ['everything — survey failed'] }
}

phase('Judge')
const partitions = (Array.isArray(survey.coveragePartitions) && survey.coveragePartitions.length)
  ? survey.coveragePartitions
  : [{ name: 'all', files: (survey.pairs || []).map((p) => p.source) }]
log('Judge: ' + partitions.length + ' coverage partition(s) + integration/runner/stale/quality/honesty.')

const judgeThunks = []
const judgeKinds = []
for (let i = 0; i < partitions.length; i++) {
  const p = partitions[i]
  judgeThunks.push(() => guard(() => agent(coveragePrompt(a, survey, p), { label: 'coverage:' + (p.name || i), phase: 'Judge', agentType: 'reasonable:test-auditor', schema: COVERAGE })))
  judgeKinds.push('coverage')
}
judgeThunks.push(() => guard(() => agent(lensPrompt(a, survey, 'integration', 'INTEGRATION'), { label: 'integration', phase: 'Judge', agentType: 'reasonable:test-auditor', schema: INTEGRATION }))); judgeKinds.push('integration')
judgeThunks.push(() => guard(() => agent(lensPrompt(a, survey, 'runner', 'RUNNER'), { label: 'runner', phase: 'Judge', agentType: 'reasonable:test-auditor', schema: RUNNER }))); judgeKinds.push('runner')
judgeThunks.push(() => guard(() => agent(lensPrompt(a, survey, 'stale', 'STALE'), { label: 'stale', phase: 'Judge', agentType: 'reasonable:test-auditor', schema: STALE }))); judgeKinds.push('stale')
judgeThunks.push(() => guard(() => agent(lensPrompt(a, survey, 'quality', 'QUALITY'), { label: 'quality', phase: 'Judge', agentType: 'reasonable:test-auditor', schema: QUALITY }))); judgeKinds.push('quality')
judgeThunks.push(() => guard(() => agent(honestyPrompt(a, survey), { label: 'honesty', phase: 'Judge', agentType: 'reasonable:test-auditor', schema: HONESTY }))); judgeKinds.push('honesty')

const judgedRaw = await parallel(judgeThunks)
const coverage = []
let integration = null, runner = null, stale = null, quality = null, honesty = null
const skipped = []
for (let i = 0; i < judgedRaw.length; i++) {
  const r = judgedRaw[i]
  const kind = judgeKinds[i]
  if (!ok(r)) { skipped.push(kind + ' — lens did not complete'); continue }
  if (kind === 'coverage') coverage.push(r)
  else if (kind === 'integration') integration = r
  else if (kind === 'runner') runner = r
  else if (kind === 'stale') stale = r
  else if (kind === 'quality') quality = r
  else if (kind === 'honesty') honesty = r
}

phase('Confirm')
if (survey.isGitRepo === false) skipped.push('teeth — targetRoot is not a git repo')
const flags = collectFlags(honesty)
log('Confirm: mechanically checking ' + flags.length + ' honesty flag(s) + sanity' + (survey.hasContracts ? ' + mapping' : ''))
const confirmedRaw = await pipeline(flags, (flag, _orig, i) =>
  guard(() => agent(confirmPrompt(a, survey, flag), { label: 'confirm:' + (flag.testId || i), phase: 'Confirm', agentType: 'reasonable:test-auditor', schema: CONFIRM }))
)
const confirmed = (confirmedRaw || []).filter(ok)
const scan = await guard(() => agent(scanPrompt(a, survey), { label: 'confirm:scan', phase: 'Confirm', agentType: 'reasonable:test-auditor', schema: SCAN }))
if (ok(scan) && Array.isArray(scan.skipped)) for (const s of scan.skipped) skipped.push(s)

phase('Report')
const verdict = computeVerdict(coverage, runner, honesty, confirmed)
const confirmedVacuous = confirmed.filter((c) => c.ran && c.admissible === false).map((c) => ({ testId: c.testId, killingMutant: c.killingMutant || null }))
const hadTeeth = confirmed.filter((c) => c.ran && c.admissible === true).map((c) => ({ testId: c.testId }))
log('Report: verdict ' + verdict + '; ' + confirmedVacuous.length + ' confirmed-vacuous, ' + hadTeeth.length + ' had teeth (downgraded), ' + skipped.length + ' skip(s).')
return {
  kind: 'report',
  verdict,
  confirmedVacuous,
  hadTeeth,
  findings: { coverage, integration, runner, stale, quality, honesty, scan: ok(scan) ? scan : null },
  correctnessFlags: []
    .concat(...coverage.map((c) => (c.correctnessFlags || []).map((f) => ({ kind: 'source-bug', location: f.location, what: f.what }))))
    .concat(((honesty && honesty.correctnessFlags) || []).map((f) => ({ kind: 'defective-test', location: f.test, what: f.what }))),
  skipped,
}
