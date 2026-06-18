export const meta = {
  name: 'coherence-grill',
  description:
    'Adversarial coherence grill for the draft intention (D15): loop a grill-adversary hunting one fork the draft resolves two defensible ways; return the first fork to the human, or — when none is found — persist the ratified intention.md atomically via an intention-writer worker.',
  whenToUse:
    'Launched by reasonable:analysis (main session) to grill the draft intention into a coherent oracle before any vertical slice runs. Re-launched after each human resolution against the strengthened draft.',
  phases: [
    { title: 'Coherence grill', detail: 'A read-only grill-adversary attacks the draft intention, surfacing one fork per iteration; the loop terminates only on no-fork-found (adversarial stop, never heuristic).' },
    { title: 'Persist intention', detail: 'On no-fork-found, a fenced intention-writer transcribes the ratified policy into .reasonable/intention.md in one worker-owned atomic commit.' },
  ],
}

// ---------------------------------------------------------------------------
// Inline schema literals (self-contained — no imports). The grill-adversary is
// FORCED to call StructuredOutput against FORK_OR_NONE; the intention-writer
// against WRITER_REPORT. Schemas mirror agents/grill-adversary.md and
// agents/intention-writer.md exactly.
// ---------------------------------------------------------------------------

// The grill-adversary returns exactly one of: a fork it found, or no-fork-found.
const FORK_OR_NONE = {
  type: 'object',
  additionalProperties: false,
  required: ['kind'],
  properties: {
    kind: { type: 'string', enum: ['fork', 'no-fork-found'] },
    // --- present when kind === 'fork' ---
    forkType: {
      type: 'string',
      enum: ['two-defensible-ways', 'internal-contradiction'],
      description: 'Which kind of fork: an underdetermined decision, or a self-contradiction in the draft.',
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
      description: 'Why the current draft does not already resolve this — read the whole policy first.',
    },
    // --- present when kind === 'no-fork-found' ---
    exercised: {
      type: 'string',
      description: 'For no-fork-found ONLY: what was genuinely attacked (stories vs. policy, policy vs. itself, brownfield corpus) so the absence reads as checked, not unlooked-for.',
    },
  },
}

// The intention-writer's hand-off after one atomic commit.
const WRITER_REPORT = {
  type: 'object',
  additionalProperties: false,
  required: ['filePath', 'scope', 'policyClauseCount', 'resolvedForkCount', 'commitSha'],
  properties: {
    filePath: { type: 'string', description: 'The path written — must be .reasonable/intention.md.' },
    scope: { type: 'string', enum: ['full', 'micro'] },
    policyClauseCount: { type: 'integer', minimum: 0 },
    resolvedForkCount: { type: 'integer', minimum: 0 },
    commitSha: { type: 'string', description: 'SHA of the one atomic commit containing intention.md + its ledger line + Work-Order trailer.' },
    ambiguousClausesFlagged: {
      type: 'array',
      items: { type: 'string' },
      description: 'Any ratified clause that read ambiguously and was transcribed verbatim rather than resolved (routes back through ratification).',
    },
  },
}

// ---------------------------------------------------------------------------
// guard() — D16b. The engine THROWS once budget.spent >= budget.total. Wrap
// every agent() so a budget-ceiling throw becomes a typed {kind:'checkpoint'}
// OUTCOME instead of being misread as a correctness gap. A null return (user
// skip / terminal API error after retries) is a genuine verification gap and
// is left as null for the caller to handle — never laundered into a pass.
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
// args (from reasonable:analysis), all JSON values — the script is pure and
// reads nothing from disk; the agents do the I/O:
//   args.draft        — the draft intention as it stands this launch (policy +
//                       already-resolved forks audit trail).
//   args.materials    — what the intention must cover: vision (grilled stories),
//                       topology sketch, quality attributes; brownfield: the
//                       characterization corpus to mine for legacy incoherence.
//   args.scope        — 'full' | 'micro' (default 'full').
//   args.ratifiedPolicy / args.resolvedForks / args.name / args.lane /
//   args.ledgerLine   — the materials the intention-writer needs once the grill
//                       terminates and the human has ratified (D3a atomic commit).
// ---------------------------------------------------------------------------

const a = (args && typeof args === 'object') ? args : {}
const scope = a.scope === 'micro' ? 'micro' : 'full'

phase('Coherence grill')

// D15: the loop's stop condition is adversarial, not heuristic. while(true) —
// each iteration a FRESH-CONTEXT grill-adversary attacks the current draft and
// returns the first fork it can defend, or no-fork-found. We return the FIRST
// fork to the human (the main session settles it, enriches the draft, and
// re-launches this workflow against the strengthened draft); we break only when
// the adversary genuinely finds nothing.
while (true) {
  if (!withinBudget()) {
    return {
      kind: 'checkpoint',
      reason: 'budget-ceiling: cannot run another grill-adversary iteration',
    }
  }

  log('Grilling the draft intention for an open fork…')

  const fork = await guard(() =>
    agent(grillAdversaryPrompt(a, scope), {
      agentType: 'reasonable:grill-adversary',
      label: 'grill-adversary',
      phase: 'Coherence grill',
      schema: FORK_OR_NONE,
    })
  )

  // Budget-ceiling throw re-tagged by guard() — surface it, do not misread as
  // "no fork" (which would silently end the grill and ship an unattacked oracle).
  if (fork && fork.kind === 'checkpoint') {
    return fork
  }

  // null = user skip or terminal API error after retries: a verification gap.
  // The grill did NOT complete an attack, so we cannot proceed to the writer.
  if (!fork) {
    return {
      kind: 'checkpoint',
      reason: 'grill-adversary returned null (user skip or terminal error) — grill did not complete an attack',
    }
  }

  // A fork the human must settle. Return it to the main session; this is the
  // sanctioned place to spend human attention, up front, on real ambiguity.
  if (fork.kind === 'fork') {
    return { kind: 'fork-for-human', fork }
  }

  // kind === 'no-fork-found': a genuine attack turned up nothing. Terminate.
  log('No ambiguous fork found — the draft survives a genuine attack.')
  break
}

// ---------------------------------------------------------------------------
// The grill terminated with no fork. The human has ratified the policy (the
// analysis skill blocks for this before re-launching with the writer args).
// Persist the ratified intention.md atomically via the fenced intention-writer.
// ---------------------------------------------------------------------------
phase('Persist intention')
log('Persisting the ratified intention.md (one atomic commit)…')

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

// null scribe write = the intention did NOT durably land. The grill is done but
// the oracle is not persisted — HALT rather than claim success (the methodology
// must not proceed believing intention.md exists when it does not).
if (!report) {
  return {
    kind: 'halt',
    reason: 'intention-writer returned null — intention.md not persisted; oracle did not land',
  }
}

return { kind: 'intention-persisted', report }

// ---------------------------------------------------------------------------
// Prompt builders (pure string assembly — no I/O, no Date.now/random). They
// hand the agent its context manifest as JSON; the agent reads the live files
// it cites (glossary, artifacts) itself.
// ---------------------------------------------------------------------------

function grillAdversaryPrompt(a, scope) {
  return [
    'You are the grill-adversary in a reasonable effort (D15). You are the coherence-grill loop\'s',
    'ADVERSARIAL stop condition. Attack the draft intention below and return the FIRST fork you can',
    'defend, or no-fork-found ONLY after a genuine attack turns up nothing. Read your agent definition,',
    'docs/glossary.md, and docs/artifacts.md (the intention.md shape + its Resolved-forks audit trail).',
    '',
    'You are a FRESH CONTEXT this iteration: you carry the current draft and the materials it must cover,',
    'never any prior grilling transcript. Already-resolved forks live in the draft\'s audit trail — do NOT',
    're-litigate them. Hunt for (1) a two-defensible-ways fork, or (2) an internal contradiction. The bar',
    'is defensibility under the current text, not your taste. Reachable forks only. You are READ-ONLY:',
    'you never draft clauses, pick the right reading, or edit the draft.',
    '',
    'Termination is adversarial, NEVER heuristic: no-fork-found means you tried to break the draft and',
    'could not (every story exercised against the policy, the policy checked against itself, the brownfield',
    'corpus mined). It does NOT mean "the next question seems low-value." If you return no-fork-found,',
    'state what you exercised so the absence reads as checked.',
    '',
    'Oracle scope: ' + scope + '.',
    '',
    'DRAFT INTENTION (decision policy + already-resolved forks):',
    asBlock(a.draft),
    '',
    'MATERIALS THE INTENTION MUST COVER (grilled user stories / topology sketch / quality attributes;',
    'brownfield: the characterization corpus to mine for legacy incoherence):',
    asBlock(a.materials),
    '',
    'Return exactly one StructuredOutput object: {kind:"fork", forkType, situation, readings|contradictingClauses,',
    'whyDraftDoesNotSettle} OR {kind:"no-fork-found", exercised}.',
  ].join('\n')
}

function intentionWriterPrompt(a, scope) {
  return [
    'You are the intention-writer in a reasonable effort. The coherence-grill has terminated',
    '(no ambiguous fork found) and the human has RATIFIED the decision-policy. Persist it: write',
    '.reasonable/intention.md and collapse the write into ONE worker-owned atomic commit (file + your',
    'own ledger line + a Work-Order trailer, together — D3a). Read your agent definition,',
    'docs/glossary.md, and docs/artifacts.md (the intention.md shape + the verdict/commit envelope).',
    '',
    'You do NOT grill, decide, or resolve forks. Transcription fidelity is the discipline: persist what',
    'was ratified, VERBATIM in the human\'s wording (the wording is cited by fork-resolving agents).',
    'Carry EVERY resolved fork into the "Resolved forks (the grill\'s audit trail)" section. Do not add,',
    'tidy, sharpen, or invent clauses or forks. If a ratified clause reads ambiguously, transcribe it',
    'verbatim and FLAG it — do not resolve it. Write intention.md ONLY (plus your one ledger line);',
    'intention.md is itself fence-protected and you are the sanctioned genesis writer.',
    '',
    'Oracle scope: ' + scope + (scope === 'micro'
      ? '. For micro: the body is just the change sentence, its behaviorDelta, and the touched seam\'s pinned behaviour — no full policy.'
      : '. For full: the effort-wide decision policy plus the resolved-forks audit trail.'),
    '',
    'EFFORT / COMPONENT NAME (for the title): ' + asInline(a.name),
    'LANE (reasonable-owned worktree): ' + asInline(a.lane),
    '',
    'RATIFIED DECISION POLICY (the human\'s exact wording):',
    asBlock(a.ratifiedPolicy != null ? a.ratifiedPolicy : a.draft),
    '',
    'RESOLVED FORKS (the grill\'s audit trail — each fork the human settled, with its round tag):',
    asBlock(a.resolvedForks),
    '',
    'LEDGER LINE to commit alongside intention.md in the SAME atomic commit:',
    asBlock(a.ledgerLine),
    '',
    'Return a StructuredOutput report: {filePath, scope, policyClauseCount, resolvedForkCount, commitSha,',
    'ambiguousClausesFlagged?}. Show git evidence (e.g. git show --stat) that the one commit contains',
    'intention.md AND the ledger line, and nothing else.',
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
