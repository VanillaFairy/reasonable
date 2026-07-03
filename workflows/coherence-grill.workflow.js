export const meta = {
  name: 'coherence-grill',
  description:
    'Adversarial coherence grill for the draft intention (D15): loop a grill-adversary that returns the independent batch of forks at the draft\'s highest open altitude tier (approach before detail); return the batch to the human, or - when none is found - persist the ratified intention.md atomically via an intention-writer worker.',
  whenToUse:
    'Launched by reasonable:analysis (main session) to grill the draft intention into a coherent oracle before any vertical slice runs. Re-launched after each human resolution against the strengthened draft.',
  phases: [
    { title: 'Coherence grill', detail: 'A read-only grill-adversary attacks the draft intention, surfacing one batch of independent same-altitude forks per iteration (approach tier before detail tier); the loop terminates only on no-fork-found (adversarial stop, never heuristic).' },
    { title: 'Persist intention', detail: 'On no-fork-found, a fenced intention-writer transcribes the ratified policy into .reasonable/intention.md in one worker-owned atomic commit.' },
  ],
}

// ---------------------------------------------------------------------------
// Inline schema literals (self-contained - no imports). The grill-adversary is
// FORCED to call StructuredOutput against FORKS_OR_NONE; the intention-writer
// against WRITER_REPORT. Schemas mirror agents/grill-adversary.md and
// agents/intention-writer.md exactly.
// ---------------------------------------------------------------------------

// The grill-adversary returns exactly one of: a BATCH of mutually-independent
// forks at the draft's highest open altitude tier (approach before detail), or
// no-fork-found. Batching + altitude ordering cut the NUMBER of grill->answer->
// re-grill rounds; the adversarial stop is unchanged - the loop still ends ONLY
// on a from-scratch no-fork-found. The top-level type MUST stay the literal
// 'object' (the Messages API rejects a top-level array type); the batch rides a
// nested `forks` array.
const FORKS_OR_NONE = {
  type: 'object',
  additionalProperties: false,
  required: ['kind'],
  properties: {
    kind: { type: 'string', enum: ['forks', 'no-fork-found'] },
    // --- present when kind === 'forks' ---
    forks: {
      type: 'array',
      minItems: 1,
      description: 'The mutually-independent forks at the draft\'s highest open altitude tier (approach before detail). Independent = resolving any one does not change whether the others are forks or how they read; coupled or lower-tier forks are withheld for a later pass and summarized in `deferred`. One per iteration was the old shape; a single fork is just a length-1 batch.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['forkType', 'altitude', 'situation', 'whyDraftDoesNotSettle'],
        properties: {
          forkType: {
            type: 'string',
            enum: ['two-defensible-ways', 'internal-contradiction'],
            description: 'Which kind of fork: an underdetermined decision, or a self-contradiction in the draft.',
          },
          altitude: {
            type: 'string',
            enum: ['approach', 'detail'],
            description: 'approach = its resolution can restructure the design/topology/approach (and may dissolve detail forks); detail = a decision within a fixed approach. A batch is single-altitude: every approach fork is surfaced before any detail fork.',
          },
          situation: {
            type: 'string',
            description: 'The concrete situation, reachable from the stories/topology, where the draft fails to decide.',
          },
          readings: {
            type: 'array',
            minItems: 2,
            maxItems: 2,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['reading', 'defensibleBecause'],
              properties: {
                reading: { type: 'string', description: 'One defensible resolution of the fork.' },
                defensibleBecause: {
                  type: 'string',
                  description: 'Which story / clause / legacy behaviour makes this reading defensible under the current draft.',
                },
              },
            },
            description: 'For two-defensible-ways: the two readings each genuinely defensible under the draft. (Omit for internal-contradiction; use contradictingClauses instead.)',
          },
          contradictingClauses: {
            type: 'array',
            minItems: 2,
            items: { type: 'string' },
            description: 'For internal-contradiction: the two clauses (or clause vs. story/quality-attribute) that cannot both hold.',
          },
          whyDraftDoesNotSettle: {
            type: 'string',
            description: 'Why the current draft does not already resolve this - read the whole policy first.',
          },
        },
      },
    },
    deferred: {
      type: 'string',
      description: 'For kind:"forks" ONLY (optional): what was deliberately held back this pass - coupled forks, or lower-altitude forks an approach-tier resolution may dissolve - so the human knows the grill continues after this batch. Omit when this batch is believed exhaustive at the current tier and no lower tier is gated behind it.',
    },
    // --- present when kind === 'no-fork-found' ---
    exercised: {
      type: 'string',
      description: 'For no-fork-found ONLY: what was genuinely attacked (stories vs. policy, policy vs. itself, brownfield legacy behaviour) so the absence reads as checked, not unlooked-for.',
    },
  },
}

// The intention-writer's hand-off after one atomic commit. Only `persisted` is required:
// a `schema` FORCES this object, so the writer CANNOT emit a bare JSON null to mean "I
// could not persist" (the forced tool call always yields a non-null object). An in-band
// failure rides `persisted:false` (+ failureReason); a bare-null return is reserved for
// agent death/skip. The consumer HALTs on (null || persisted !== true) - the methodology
// must not proceed believing intention.md landed when it did not. The top-level type MUST
// stay the literal 'object' (the Messages API rejects a top-level array type).
const WRITER_REPORT = {
  type: 'object',
  additionalProperties: false,
  required: ['persisted'],
  properties: {
    persisted: { type: 'boolean', description: 'The one atomic commit (intention.md + its ledger line + Work-Order trailer) durably landed.' },
    filePath: { type: 'string', description: 'The path written - must be .reasonable/intention.md (present on success).' },
    scope: { type: 'string', enum: ['full', 'micro'] },
    policyClauseCount: { type: 'integer', minimum: 0 },
    resolvedForkCount: { type: 'integer', minimum: 0 },
    commitSha: { type: 'string', description: 'SHA of the one atomic commit containing intention.md + its ledger line + Work-Order trailer (present on success).' },
    failureReason: { type: 'string', description: 'On persisted:false, the one-line reason the write could not land - never fabricate a commit to look durable.' },
    ambiguousClausesFlagged: {
      type: 'array',
      items: { type: 'string' },
      description: 'Any ratified clause that read ambiguously and was transcribed verbatim rather than resolved (routes back through ratification).',
    },
  },
}

// ---------------------------------------------------------------------------
// guard() - D16b. The engine THROWS once budget.spent >= budget.total. Wrap
// every agent() so a budget-ceiling throw becomes a typed {kind:'checkpoint'}
// OUTCOME instead of being misread as a correctness gap. A null return (user
// skip / terminal API error after retries) is a genuine verification gap and
// is left as null for the caller to handle - never laundered into a pass.
// ---------------------------------------------------------------------------
async function guard(thunk) {
  try {
    return await thunk()
  } catch (e) {
    return { kind: 'checkpoint', reason: (e && e.message) ? e.message : String(e) }
  }
}

// Guard the loop on budget.total (else remaining() is Infinity and the loop
// would run to the agent cap). Pure: no Date.now/random.
function withinBudget() {
  return budget.total === null || budget.remaining() > 0
}

// ---------------------------------------------------------------------------
// Workflow body.
// args (from reasonable:analysis), all JSON values - the script is pure and
// reads nothing from disk; the agents do the I/O:
//   args.draft        - the draft intention as it stands this launch (policy +
//                       already-resolved forks audit trail).
//   args.materials    - what the intention must cover: vision (grilled stories),
//                       topology sketch, quality attributes; brownfield: the
//                       existing legacy behaviour (the census topology sketch + the legacy code) to mine for incoherence.
//   args.scope        - 'full' | 'micro' (default 'full').
//   args.ratifiedPolicy / args.resolvedForks / args.name / args.lane /
//   args.ledgerLine   - the materials the intention-writer needs once the grill
//                       terminates and the human has ratified (D3a atomic commit).
// ---------------------------------------------------------------------------

const a = (args && typeof args === 'object') ? args : {}
const scope = a.scope === 'micro' ? 'micro' : 'full'

// callShapeReminder - appended to every schema-forced prompt below. The model
// intermittently mis-calls a forced StructuredOutput tool by JSON-stringifying its
// whole answer into one wrapper property ({"input":"{...}"}) instead of passing the
// schema's fields as the call's own top-level arguments; each such call fails schema
// validation and burns one of the 5 retries (five in a row exhaust the cap and throw -
// the graph-editor-ux-overhaul reconciler crash). Inlined per file: the pure-substrate
// no-import rule (invariant #5) forbids sharing it across workflows.
const callShapeReminder =
  'TOOL-CALL SHAPE: call the forced tool with the schema\'s fields as the CALL\'S OWN top-level arguments (e.g. {"kind": "forks", "forks": [...]}) - do NOT JSON-stringify the whole answer into a wrapper property (e.g. {"input": "{...}"}); that fails schema validation and burns a retry.'

phase('Coherence grill')

// D15: the loop's stop condition is adversarial, not heuristic. while(true) -
// each iteration a FRESH-CONTEXT grill-adversary attacks the current draft and
// returns the independent batch of forks at the draft's highest open altitude
// tier (approach before detail), or no-fork-found. We return the BATCH to the
// main session (it settles them, enriches the draft, and re-launches this
// workflow against the strengthened draft); we break only when the adversary
// genuinely finds nothing. Batching + altitude ordering cut the NUMBER of rounds
// without weakening the stop: the final re-launch is still a from-scratch attack
// that must come back no-fork-found. A mis-judged "independent" is self-correcting
// - a resolution that dissolves a sibling just means the next pass won't resurface
// it (a possibly-moot human answer, never a corrupt oracle).
while (true) {
  if (!withinBudget()) {
    return {
      kind: 'checkpoint',
      reason: 'budget-ceiling: cannot run another grill-adversary iteration',
    }
  }

  log('Grilling the draft intention for open forks...')

  const attack = await guard(() =>
    agent(grillAdversaryPrompt(a, scope), {
      agentType: 'reasonable:grill-adversary',
      label: 'grill-adversary',
      phase: 'Coherence grill',
      schema: FORKS_OR_NONE,
    })
  )

  // Budget-ceiling throw re-tagged by guard() - surface it, do not misread as
  // "no fork" (which would silently end the grill and ship an unattacked oracle).
  if (attack && attack.kind === 'checkpoint') {
    return attack
  }

  // null = user skip or terminal API error after retries: a verification gap.
  // The grill did NOT complete an attack, so we cannot proceed to the writer.
  if (!attack) {
    return {
      kind: 'checkpoint',
      reason: 'grill-adversary returned null (user skip or terminal error) - grill did not complete an attack',
    }
  }

  // A batch of forks the human must settle. Return them to the main session; this
  // is the sanctioned place to spend human attention, up front, on real ambiguity.
  if (attack.kind === 'forks') {
    return { kind: 'fork-for-human', forks: attack.forks, deferred: attack.deferred }
  }

  // kind === 'no-fork-found': a genuine attack turned up nothing. Terminate.
  log('No ambiguous fork found - the draft survives a genuine attack.')
  break
}

// ---------------------------------------------------------------------------
// The grill terminated with no fork. The human has ratified the policy (the
// analysis skill blocks for this before re-launching with the writer args).
// Persist the ratified intention.md atomically via the fenced intention-writer.
// ---------------------------------------------------------------------------
phase('Persist intention')
log('Persisting the ratified intention.md (one atomic commit)...')

const report = await guard(() =>
  agent(intentionWriterPrompt(a, scope), {
    agentType: 'reasonable:intention-writer',
    label: 'intention-writer',
    phase: 'Persist intention',
    schema: WRITER_REPORT,
  })
)

if (report && report.kind === 'checkpoint') {
  return report
}

// The intention did NOT durably land - HALT rather than claim success (the methodology
// must not proceed believing intention.md exists when it does not). A `schema` FORCES a
// WRITER_REPORT object, so an in-band failure rides persisted:false; a bare-null return is
// reserved for agent death/skip. Both HALT - the grill is done but the oracle is not durable.
if (!report || report.persisted !== true) {
  return {
    kind: 'halt',
    reason: (report && report.failureReason)
      ? `intention-writer could not persist intention.md (${report.failureReason}) - oracle did not land`
      : 'intention-writer did not persist intention.md (null / persisted:false) - oracle did not land',
  }
}

return { kind: 'intention-persisted', report }

// ---------------------------------------------------------------------------
// Prompt builders (pure string assembly - no I/O, no Date.now/random). They
// hand the agent its context manifest as JSON; the agent reads the live files
// it cites (glossary, artifacts) itself.
// ---------------------------------------------------------------------------

function grillAdversaryPrompt(a, scope) {
  return [
    'You are the grill-adversary in a reasonable effort (D15). You are the coherence-grill loop\'s',
    'ADVERSARIAL stop condition. Attack the draft intention below and return the batch of forks you can',
    'defend, or no-fork-found ONLY after a genuine attack turns up nothing. Read your agent definition,',
    'docs/glossary.md, and docs/artifacts.md (the intention.md shape + its Resolved-forks audit trail).',
    '',
    'You are a FRESH CONTEXT this iteration: you carry the current draft and the materials it must cover,',
    'never any prior grilling transcript. Already-resolved forks live in the draft\'s audit trail - do NOT',
    're-litigate them. Hunt for (1) a two-defensible-ways fork, or (2) an internal contradiction. The bar',
    'is defensibility under the current text, not your taste. Reachable forks only. You are READ-ONLY:',
    'you never draft clauses, pick the right reading, or edit the draft.',
    '',
    'ALTITUDE FIRST, THEN BATCH (this cuts the number of grill->answer->re-grill rounds without weakening',
    'the stop condition). Tag every fork: "approach" (its resolution can restructure the design/topology/',
    'approach and may dissolve detail forks) or "detail" (a decision within a fixed approach). Surface only',
    'the HIGHEST open tier: if any approach fork survives, return the approach batch and WITHHOLD detail',
    'forks (an approach pivot may delete them - grilling the detail of an approach that may not survive is',
    'the exact waste this ordering prevents). Within that tier, return ALL forks that are MUTUALLY',
    'INDEPENDENT - resolving any one does not change whether the others are forks or how they read.',
    'Withhold coupled forks for a later pass and say what you held back in `deferred`. A wrong independence',
    'call is self-correcting: the next pass simply won\'t resurface a now-settled fork.',
    '',
    'Termination is adversarial, NEVER heuristic: no-fork-found means you tried to break the draft and',
    'could not (every story exercised against the policy, the policy checked against itself, the brownfield',
    'corpus mined). It does NOT mean "the next question seems low-value." If you return no-fork-found,',
    'state what you exercised so the absence reads as checked.',
    '',
    'Oracle scope: ' + scope + '.',
    '',
    // Stable reference FIRST (cache-friendly prefix), volatile draft LAST: the draft
    // grows each round as resolved forks accrue; the materials do not. (The realistic
    // token win is modest - one adversary call per launch, cross-launch cache usually
    // cold - the real round-count saving comes from batching + altitude above.)
    'MATERIALS THE INTENTION MUST COVER (grilled user stories / topology sketch / quality attributes;',
    'brownfield: the existing legacy behaviour, read via the census topology sketch, to mine for incoherence):',
    asBlock(a.materials),
    '',
    'DRAFT INTENTION (decision policy + already-resolved forks):',
    asBlock(a.draft),
    '',
    'Return exactly one StructuredOutput object: {kind:"forks", forks:[{forkType, altitude, situation,',
    'readings|contradictingClauses, whyDraftDoesNotSettle}, ...], deferred?} OR {kind:"no-fork-found", exercised}.',
    callShapeReminder,
  ].join('\n')
}

function intentionWriterPrompt(a, scope) {
  return [
    'You are the intention-writer in a reasonable effort. The coherence-grill has terminated',
    '(no ambiguous fork found) and the human has RATIFIED the decision-policy. Persist it: write',
    '.reasonable/intention.md and collapse the write into ONE worker-owned atomic commit (file + your',
    'own ledger line + a Work-Order trailer, together - D3a). Read your agent definition,',
    'docs/glossary.md, and docs/artifacts.md (the intention.md shape + the verdict/commit envelope).',
    '',
    'You do NOT grill, decide, or resolve forks. Transcription fidelity is the discipline: persist what',
    'was ratified, VERBATIM in the human\'s wording (the wording is cited by fork-resolving agents).',
    'Carry EVERY resolved fork into the "Resolved forks (the grill\'s audit trail)" section. Do not add,',
    'tidy, sharpen, or invent clauses or forks. If a ratified clause reads ambiguously, transcribe it',
    'verbatim and FLAG it - do not resolve it. Write intention.md ONLY (plus your one ledger line);',
    'intention.md is itself fence-protected and you are the sanctioned genesis writer.',
    '',
    'Oracle scope: ' + scope + (scope === 'micro'
      ? '. For micro: the body is just the change sentence, its behaviorDelta, and the touched seam\'s pinned behaviour - no full policy.'
      : '. For full: the effort-wide decision policy plus the resolved-forks audit trail.'),
    '',
    'EFFORT / COMPONENT NAME (for the title): ' + asInline(a.name),
    'LANE (reasonable-owned worktree): ' + asInline(a.lane),
    '',
    'RATIFIED DECISION POLICY (the human\'s exact wording):',
    asBlock(a.ratifiedPolicy != null ? a.ratifiedPolicy : a.draft),
    '',
    'RESOLVED FORKS (the grill\'s audit trail - each fork the human settled, with its round tag):',
    asBlock(a.resolvedForks),
    '',
    'LEDGER LINE to commit alongside intention.md in the SAME atomic commit:',
    asBlock(a.ledgerLine),
    '',
    'Section id for progress reporting: "persist-intention".',
    '',
    'Return the WRITER_REPORT. On a clean atomic commit set persisted:true with {filePath, scope,',
    'policyClauseCount, resolvedForkCount, commitSha, ambiguousClausesFlagged?}; if you CANNOT land the',
    'commit faithfully set persisted:false with a one-line failureReason (the script HALTs - never fabricate',
    'a SHA, and do not emit a bare null on purpose: bare-null is reserved for death). Show git evidence',
    '(e.g. git show --stat) that the one commit contains intention.md AND the ledger line, and nothing else.',
    callShapeReminder,
  ].join('\n')
}

// Render an args value as a fenced text block; objects/arrays as pretty JSON.
function asBlock(v) {
  if (v == null) return '(none provided)'
  const s = (typeof v === 'string') ? v : JSON.stringify(v, null, 2)
  return '```\n' + s + '\n```'
}

// Render a scalar args value inline.
function asInline(v) {
  if (v == null) return '(unspecified)'
  return (typeof v === 'string') ? v : JSON.stringify(v)
}
