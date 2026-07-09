# Shared Interfaces — Part 2: Contract Grammar v3

Every function signature, regex, and object shape below is the exact contract later tasks build
against. Do not drift from these names or shapes — later tasks reference them verbatim.

## `lib/clause-id.mjs` (new — produced by T01b, consumed by T02b)

```js
// lib/clause-id.mjs — the durable clause-id shape (`<component>#c<N>`, DESIGN-3.0 §4.2) and its
// ledger-backed allocator (reasonable 3.0 Part 2). Split from lib/contract.mjs: the shape half is
// pure and imported by the parser; the allocate half needs lib/ledger.mjs's append() and is
// imported by whichever future spec-time pipeline mints a new clause.

/** Regex source string (no anchors) for one clause id: a component slug + '#c' + digits. */
export const CLAUSE_ID_PATTERN; // = '[a-z0-9][a-z0-9-]*#c\\d+'

/** Anchored RegExp built from CLAUSE_ID_PATTERN — tests a WHOLE string, not a substring. */
export const CLAUSE_ID_RE; // = new RegExp(`^${CLAUSE_ID_PATTERN}$`)

/**
 * @param {unknown} id
 * @returns {{component: string, n: number} | null} — null for anything malformed
 *   (wrong shape, non-string, positional `§N`, uppercase component, etc.). Never throws.
 */
export function parseClauseId(id);

/**
 * @param {string} component
 * @param {number} n
 * @returns {string} — `${component}#c${n}`. The exact inverse of parseClauseId.
 */
export function formatClauseId(component, n);

/**
 * Allocate a new, durable clause id for `component` by appending a `clause-allocated` ledger
 * event under the ledger controller's existing append lock (lib/ledger.mjs's append()). The
 * numeric suffix is the seq that append assigns to THIS event — always unique, always
 * increasing across the WHOLE ledger (not scoped per component), never reused. No fold over
 * prior allocations is needed or performed.
 *
 * @param {string} effortRoot
 * @param {string} component - must match /^[a-z0-9][a-z0-9-]*$/ (the same component-slug shape
 *   citations already require)
 * @returns {{ok: true, clauseId: string, seq: number} | {ok: false, error: string}}
 *   - a malformed component is rejected BEFORE any ledger append happens (nothing is written)
 *   - any failure append() itself reports (e.g. no .reasonable/ at effortRoot) is passed through
 *     verbatim as {ok: false, error}
 */
export function allocateClauseId(effortRoot, component);

/**
 * Fold every `clause-allocated` event in this effort's ledger into a per-component list of the
 * ids ever allocated (in ledger order — the order they were minted, not sorted). This is the
 * "derived mirror" DESIGN-3.0 §4.2 names: computed fresh from the ledger, never cached to disk,
 * exactly like lib/contract.mjs's existing citationGraph(). An effort with no clause-allocated
 * events yet returns `{}`.
 *
 * @param {string} effortRoot
 * @returns {Object<string, string[]>} — e.g. `{lexer: ['lexer#c1', 'lexer#c5'], ast: ['ast#c3']}`
 */
export function allocatedClauseIds(effortRoot);
```

## `lib/ledger.mjs` (existing — modified by T01b)

No new function exports. **One new line** in the existing `EVENT_SCHEMAS` object, in the Family 3
block, immediately after the `'characterization'` entry:

```js
export const EVENT_SCHEMAS = {
  // ... Family 1 and Family 2 entries unchanged ...

  // Family 3 — domain events, loose validation. enrichment/characterization/clause-allocated
  // additionally require `component`; everything else here has no required fields of its own.
  'enrichment': { required: ['component'] },
  'amendment': { required: [], validate: validateDropsAndResolvesSeq },
  'characterization': { required: ['component'] },
  'clause-allocated': { required: ['component'] },
  'characterization-promotion': { required: [] },
  // ... rest of Family 3 unchanged ...
};
```

Note the one-word edit to the comment above the block (`enrichment/characterization` →
`enrichment/characterization/clause-allocated`) — keep the comment accurate, it is not just a code
change. `FAMILY_1_TYPES`, `FAMILY_2_TYPES`, `validateEvent()`, and `append()` are **not** touched —
`clause-allocated` needs no node/workOrder address resolution, so Family 3's existing generic
handling (the `else` branch in `append()`'s locked callback) already does the right thing: it
best-effort-resolves a `workOrder` field if present (this event never sends one, so that branch is
simply a no-op for it) and appends the stamped event.

## `lib/contract.mjs` (existing — breaking rewrite by T02b)

### New/changed clause shape

A parsed clause object gains three fields and changes what `id` means:

```js
{
  id: string,          // e.g. 'lexer#c12' — was '§12'. The FULL durable id, verbatim from the heading.
  component: string,   // NEW — e.g. 'lexer'. Parsed out of `id` via parseClauseId().
  n: number,           // NEW — e.g. 12. Parsed out of `id` via parseClauseId(). (Was already present,
                       //   but previously WAS the clause number; now it is just the numeric suffix.)
  title: string,       // unchanged meaning
  gates: string[],      // unchanged
  citations: Array<{component: string, clause: string}>, // NEW — this clause's own `- Cites:` lines
  demandedBy: string | null, // NEW — this clause's `- Demanded-by:` value, verbatim, or null
  provenance: 'grown' | 'characterized', // unchanged
  test?: string, seam?: string, supersession?: 'pending', // unchanged (characterized/supersession fields)
}
```

### New/changed `parseContract()` return shape

```js
{
  component, owner, status, seam, seams, inputSeams, // ALL unchanged
  clauses: Clause[],   // shape above
  citations: Array<{component: string, clause: string, citingClause: string}>,
    // CHANGED meaning: now the FLATTENED UNION of every clause's own `citations` array, each
    // entry additionally tagged with `citingClause` (which of THIS component's clauses did the
    // citing). `{component, clause}` keeps the EXACT shape lib/footprint.mjs's citationClosure()
    // and lib/citation-resolve.mjs's danglingCitations() already destructure — citingClause is
    // additive, neither existing consumer needs to read it.
  gates,               // unchanged
}
```

### New regexes (replace the old `CLAUSE_RE`/`CITE_RE`)

```js
import { CLAUSE_ID_PATTERN, parseClauseId } from './clause-id.mjs';

const CLAUSE_RE = new RegExp(`^###\\s+(${CLAUSE_ID_PATTERN})\\s+(.*)$`);
// matches e.g. '### lexer#c12 Tokenizes an integer literal'
// does NOT match '### §12 ...' — positional addressing is retired, not recognized at all.

const CITE_RE = new RegExp(`^[-*]\\s*Cites:\\s*(${CLAUSE_ID_PATTERN})\\b`, 'i');
// matches e.g. '- Cites: ast#c1', repeatable per clause (same multiplicity as `- Gate:`).
// The OLD file-level `## Citations` section and its bullet shape (`- <component> §<N>`) is
// retired along with `§N` — a `## Citations` heading is no longer special-cased by the parser
// at all (no `inCitations` flag).

export const DEMANDED_BY_TAGS = Object.freeze(['goal', 'gate', 'cite', 'ledger']);
const DEMANDED_BY_RE = new RegExp(
  `^[-*]\\s*Demanded-by:\\s*((?:${DEMANDED_BY_TAGS.join('|')}):\\S.*)$`, 'i',
);
// matches e.g. '- Demanded-by: cite:evaluator#c1', '- Demanded-by: gate:vertical-slice:x / asserts `y`'
// captures the WHOLE tag:value string verbatim into demandedBy (group 1).
// An unrecognized tag, or no line at all, leaves demandedBy: null — never a throw.
// Multiple `- Demanded-by:` lines on one clause: LAST one wins (matches the existing
// `- Provenance:` overwrite-on-duplicate tolerance already in this file).
```

### New export: `missingDemandedBy`

```js
/**
 * Find clauses with no well-formed `- Demanded-by:` line — a v3 grammar-completeness violation
 * (DESIGN-3.0 §4.2/§4.3). Syntax-only, exactly like the existing danglingCitations: this does
 * NOT resolve whether the reference is real, only that one is present and well-formed.
 *
 * @param {string} effortRoot
 * @returns {Array<{component: string, clause: string}>} — empty when every clause has one
 */
export function missingDemandedBy(effortRoot);
```

### Everything else in `lib/contract.mjs` is unchanged, verbatim

`PROVENANCE_RE`, `SUPERSESSION_RE`, `SEAM_RE`, `SEAM_BULLET_RE`, `parseSeamBullet`,
`parseInputSeamBullet`, `parseFrontmatter`, `contractsDir`, `contractPath`, `loadContract`,
`allComponents`, `citationGraph`, `citationClosure`, `danglingCitations` — none of these change.
`citationGraph`/`citationClosure`/`danglingCitations` all operate on `parsed.citations`/
`parsed.clauses[].id` as opaque strings already, so they need no edits at all (verify this by
running them, in T03 — don't just assume it because this doc says so).

## Error/result-shape conventions (all new functions)

- `allocateClauseId`: `{ok: true, clauseId, seq}` / `{ok: false, error}` — matches `append()`'s
  own envelope exactly (it wraps `append()`, so this is not a new convention, just reuse).
- `parseClauseId`: `{component, n}` / `null` — matches this file's existing tolerant-parse style
  (no result envelope; a parser either extracts structure or it doesn't).
- `missingDemandedBy`, `allocatedClauseIds`: plain array / plain object, never throw — matches
  `danglingCitations`'s and `citationGraph`'s existing shapes exactly.
