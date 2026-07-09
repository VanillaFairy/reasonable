# Task T02b: Contract grammar v3 impl (green)

**Role:** `green` — rewrite `lib/contract.mjs` against the locked tests, and migrate
`test/contract.test.mjs`'s pre-existing fixtures to the new heading/citation syntax. Do not modify
`test/contract-v3-grammar.test.mjs`.

## References
- Read: `../shared/architecture.md`
- Read: `../shared/interfaces.md` (the exact new grammar, return shape, and regexes)
- Read: `../shared/conventions.md` — **especially** the section "A deliberate, narrow exception to
  Part 1's 'green never touches the test file' rule". Read it before touching
  `test/contract.test.mjs`; it explains exactly why this task (uniquely in this plan) is allowed to
  edit a pre-existing test file, and the boundary of that permission.
- Read: `lib/contract.mjs` in full before editing it
- Read: `test/contract.test.mjs` in full before migrating it

## Dependencies
- Depends on: T02a (locked new-grammar tests), T01b (`lib/clause-id.mjs` must exist — you import
  from it)
- Depended on by: T02c (audits this), T03 (consumer regression, needs the rewritten parser), T04
  (docs describe this landed behavior)

## Scope

**Files:**
- Modify: `lib/contract.mjs`
- Modify: `test/contract.test.mjs`

**BOUNDARY — you MUST NOT modify any files outside this list.**

**Do NOT modify `test/contract-v3-grammar.test.mjs`** — authored by T02a and locked. If you believe
a test in it is wrong, stop and escalate; never edit it yourself.

**`test/contract.test.mjs` gets a NARROW, MECHANICAL edit only** — see `conventions.md`'s
exception. You may change: (a) each fixture's clause heading from `### §N <title>` to
`### <component>#c<N> <title>`, (b) each fixture's file-level `## Citations` section into an
inline `- Cites:` bullet inside the relevant clause body, (c) the one or two literal id-string
assertions (`'§5'` → `'choice-edge#c5'`, etc.). You must **not** change any other assertion, add or
remove a `check()`, or alter what any test proves.

## Positive Constraints (DO)
- Implement exactly the exports, regexes, and return shape named in `../shared/interfaces.md`.
- Import `CLAUSE_ID_PATTERN, parseClauseId` from `./clause-id.mjs` — do not duplicate the id-shape
  regex inline in `lib/contract.mjs`.
- Keep every other exported function (`parseFrontmatter`, `contractsDir`, `contractPath`,
  `loadContract`, `allComponents`, `citationGraph`, `citationClosure`, `danglingCitations`) and
  every non-clause-id parsing rule (`## Scenarios`, `## Observable Seams`, `## Input Seams`,
  `- Provenance:`, `- Supersession:`, `- Gate:`, `## Topology`/`- Seam:`) **byte-for-byte
  unchanged** — copy them forward verbatim.

## Negative Constraints (DO NOT)
- Do NOT modify `test/contract-v3-grammar.test.mjs`.
- Do NOT touch `citationGraph`, `citationClosure`, or `danglingCitations`'s internal logic — they
  operate on `parsed.citations`/`parsed.clauses[].id` as opaque strings already and need no
  changes (verified in T03; if you believe they DO need a change, stop and escalate rather than
  editing them here).
- Do NOT re-add any recognition of positional `§N` headings, even as a fallback — this is a hard
  cutover, no dual-format support (DESIGN-3.0 §12).
- Do NOT change any `test/contract.test.mjs` assertion beyond the mechanical id-shape/citation
  relocation described above.

## Implementation Steps

### Step 1: Read the locked tests

Read `test/contract-v3-grammar.test.mjs` in full (written by T02a) before writing any code.

### Step 2: Rewrite `lib/contract.mjs`

Replace the entire file with:

```js
// contract.mjs — parse contract files into clauses + citations, and compute the
// citation closure that footprints depend on. The grammar is pinned in
// docs/artifacts.md (§ contracts). If this parser and that grammar drift, the
// computed DAG (§5.11) silently loses edges — so both change together.
//
// v3 grammar (DESIGN-3.0 §4.2, reasonable 3.0 Part 2): clause ids are durable and allocated
// (see lib/clause-id.mjs), never positional — `### §N` heading recognition is fully retired,
// a hard cutover with no dual-format support (DESIGN-3.0 §12). Citations attach PER CLAUSE
// (a repeatable `- Cites:` bullet in the clause body) rather than in a file-level `## Citations`
// section. Every clause carries a `- Demanded-by:` line naming its provenance.

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { CLAUSE_ID_PATTERN, parseClauseId } from './clause-id.mjs';

const CLAUSE_RE = new RegExp(`^###\\s+(${CLAUSE_ID_PATTERN})\\s+(.*)$`);
const CITE_RE = new RegExp(`^[-*]\\s*Cites:\\s*(${CLAUSE_ID_PATTERN})\\b`, 'i');

// Demanded-by (DESIGN-3.0 §4.2/§12): every clause names its provenance as a tagged reference —
// a goal-scenario assertion (`goal:<id>`), a gate (`gate:<verbatim gate string>`), a consuming
// clause/atom citation (`cite:<component>#c<N>`), or a chartering rewrite event (`ledger:<seq>`).
// This is SYNTAX-only validation (does the tag+value shape hold) — resolving WHAT a reference
// points to (does the goal/atom/ledger-seq actually exist) is later parts' job (§4.3's cohesion
// graph, Part 3), exactly as Part 1's `effects` validated shape without checking node/edge
// existence.
export const DEMANDED_BY_TAGS = Object.freeze(['goal', 'gate', 'cite', 'ledger']);
const DEMANDED_BY_RE = new RegExp(`^[-*]\\s*Demanded-by:\\s*((?:${DEMANDED_BY_TAGS.join('|')}):\\S.*)$`, 'i');

// Provenance/Seam/Supersession twins to the `- Gate:` extractor (BF1). A clause
// carries a `provenance`: `grown` (greenfield default, born RED at a gate) or
// `characterized` (brownfield, born GREEN by observation, untrusted). The
// characterized line names the pinning test and the touched seam locus. A
// `- Supersession: pending` line marks a clause the touching change intends to
// move. The `## Topology` `- Seam:` line is a contract-level fence locus.
// Grammar: architecture.md §18 "Contract genesis" (BF1) + §21 row 13.
//
// NOTE — three unrelated uses of the word "seam", kept disjoint by context:
//   • the `- Seam:` LINE (here, within `## Topology` or a `characterized` clause) is a
//     code LOCUS/glob (Feathers' sensing seam) — where a characterization test attaches.
//   • the `## Observable Seams` SECTION (below) is the OUTPUT surface of a render-only
//     clause (the export to import + a stable test handle per element) — read by the
//     blind-test-writer to TARGET a declared handle instead of guessing one.
//   • the `## Input Seams` SECTION (below) is its sibling on the INPUT side: the EXTERNAL
//     STATE a clause reads (a store / hook / context) and how a test MOCKS it to construct
//     the scenario — read by the blind-test-writer to SET UP the scenario instead of
//     defaulting the mock to empty (which silently never exercises the behaviour).
//   Both seam SECTIONS are footprint-zero like `## Scenarios` (zero clauses, zero
//   citations); parsed into `seams` / `inputSeams` purely so the DAG stays unperturbed.
const PROVENANCE_RE = /^[-*]\s*Provenance:\s*characterized\s*\(\s*test:\s*(.+?)\s*,\s*seam:\s*(.+?)\s*\)\s*$/i;
const SUPERSESSION_RE = /^[-*]\s*Supersession:\s*pending\s*$/i;
const SEAM_RE = /^[-*]\s*Seam:\s*(.+)$/i;
const SEAM_BULLET_RE = /^[-*]\s+(.+)$/;

// Pull the structured facets out of one `## Observable Seams` bullet, tolerantly. A
// bullet is `- <key>: <body>` where <body> names a stable test HANDLE (a backticked
// selector: `[data-testid=…]`, `[role=…]`, …) and/or an EXPORT to import (e.g.
// "default export `ChoiceEdge`"). Everything is best-effort; `raw` always carries the
// full prose so a model reading the parsed form loses nothing.
function parseSeamBullet(body) {
  const colon = body.indexOf(':');
  const key = colon === -1 ? null : body.slice(0, colon).trim();
  const rest = colon === -1 ? body.trim() : body.slice(colon + 1).trim();
  const handleM = /`([^`]*(?:data-testid|data-test|role\s*=|aria-|\[)[^`]*)`/i.exec(rest)
    || /(\[[^\]]*(?:data-testid|role|aria-)[^\]]*\])/i.exec(rest);
  const importM = /(?:default export|named export|export|import)[^`]*`([^`]+)`/i.exec(rest);
  return {
    key,
    handle: handleM ? handleM[1].trim() : null,
    importHint: importM ? importM[1].trim() : null,
    raw: rest,
  };
}

// Pull the structured facets out of one `## Input Seams` bullet, tolerantly. A bullet is
// `- <key>: <body>` where <body> names the EXTERNAL STATE the unit reads and HOW a test
// supplies it — the `mock` target is the first backticked identifier (the store hook /
// context to mock: `useStore`, `useContext`, `NodesContext`). The remaining prose (the
// state the selector consumes, how to trigger the scenario) is model-read, not parsed, so
// `raw` always carries the full first line. `mock` is the hint the optional auditor smell
// ("selector hook mocked to a constant — bypassing the selector — for a clause that IS the
// selector") keys off. Note a selector store reads STATE one level up: the seam declares the
// state the selector consumes, and the test drives the real selector against it, never mocks
// the selector's output to a constant (which bypasses the logic under test).
function parseInputSeamBullet(body) {
  const colon = body.indexOf(':');
  const key = colon === -1 ? null : body.slice(0, colon).trim();
  const rest = colon === -1 ? body.trim() : body.slice(colon + 1).trim();
  const mockM = /`([A-Za-z_$][\w$.]*)`/.exec(rest);
  return {
    key,
    mock: mockM ? mockM[1].trim() : null,
    raw: rest,
  };
}

/** Parse one contract file's text. Returns { component, owner, status, seam, seams, inputSeams, clauses, citations, gates }. */
export function parseContract(text, component) {
  const lines = text.split(/\r?\n/);
  const fm = parseFrontmatter(lines);
  const clauses = [];
  const gates = [];
  const seams = [];
  const inputSeams = [];
  let inTopology = false;
  let inSeams = false;
  let inInputSeams = false;
  let seam = null;
  let current = null;

  for (const line of lines) {
    const h2 = /^##\s+(.*)$/.exec(line);
    if (h2) {
      inTopology = /topology/i.test(h2[1]);
      // "Observable Seams" / "Input Seams" only — never the bare "Seams"/"Topology"/
      // "Scenarios" headers. The two are disjoint: "Input Seams" never matches the
      // observable regex and vice versa, so each header switches exactly one flag on.
      inSeams = /observable\s+seams/i.test(h2[1]);
      inInputSeams = /input\s+seams/i.test(h2[1]);
    }

    const cm = CLAUSE_RE.exec(line);
    if (cm) {
      const parsedId = parseClauseId(cm[1]);
      current = {
        id: cm[1], component: parsedId.component, n: parsedId.n, title: cm[2].trim(),
        gates: [], citations: [], demandedBy: null, provenance: 'grown',
      };
      clauses.push(current);
      inTopology = false;
      inSeams = false;
      inInputSeams = false;
      continue;
    }

    // The `## Observable Seams` section is footprint-zero (no clauses, no citations,
    // like `## Scenarios`): collect its bullets into `seams`, never into clauses/cites.
    if (inSeams) {
      const bm = SEAM_BULLET_RE.exec(line.trim());
      if (bm) seams.push(parseSeamBullet(bm[1]));
    }

    // The `## Input Seams` section is the input-side sibling — equally footprint-zero:
    // collect its bullets into `inputSeams`, never into clauses/cites.
    if (inInputSeams) {
      const bm = SEAM_BULLET_RE.exec(line.trim());
      if (bm) inputSeams.push(parseInputSeamBullet(bm[1]));
    }

    if (inTopology) {
      const sm = SEAM_RE.exec(line.trim());
      if (sm) seam = sm[1].trim();
    }

    const gm = /^[-*]\s*Gate:\s*(.+)$/i.exec(line.trim());
    if (gm && current) {
      const g = gm[1].trim();
      current.gates.push(g);
      gates.push({ clause: current.id, gate: g });
    }

    if (current) {
      const ci = CITE_RE.exec(line.trim());
      if (ci) {
        const parsedCite = parseClauseId(ci[1]);
        current.citations.push({ component: parsedCite.component, clause: ci[1] });
      }

      const dbm = DEMANDED_BY_RE.exec(line.trim());
      if (dbm) current.demandedBy = dbm[1].trim();

      const pm = PROVENANCE_RE.exec(line.trim());
      if (pm) {
        current.provenance = 'characterized';
        current.test = pm[1].trim();
        current.seam = pm[2].trim();
      }

      if (SUPERSESSION_RE.test(line.trim())) {
        current.supersession = 'pending';
      }
    }
  }

  // The flat, file-level citations array is the UNION of every clause's own `- Cites:`
  // lines, each tagged with which clause did the citing. lib/footprint.mjs's
  // citationClosure() and lib/citation-resolve.mjs's danglingCitations() both only ever
  // read `.component`/`.clause` off an entry, so this keeps their exact contract.
  const citations = clauses.flatMap((cl) =>
    cl.citations.map((ci) => ({ ...ci, citingClause: cl.id })));

  return {
    component: component || fm.component || null,
    owner: fm.owner || null,
    status: fm.status || 'active',
    seam,
    seams,
    inputSeams,
    clauses,
    citations,
    gates,
  };
}

function parseFrontmatter(lines) {
  const fm = {};
  if (lines[0] !== '---') return fm;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '---') break;
    const m = /^([a-zA-Z][\w-]*):\s*(.*)$/.exec(lines[i]);
    if (m) fm[m[1]] = m[2].trim();
  }
  return fm;
}

export function contractsDir(effortRoot) {
  return join(effortRoot, '.reasonable', 'contracts');
}

export function contractPath(effortRoot, component) {
  return join(contractsDir(effortRoot), `${component}.md`);
}

export function loadContract(effortRoot, component) {
  const p = contractPath(effortRoot, component);
  if (!existsSync(p)) return null;
  return parseContract(readFileSync(p, 'utf8'), component);
}

export function allComponents(effortRoot) {
  const dir = contractsDir(effortRoot);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => f.replace(/\.md$/, ''));
}

/** Load the whole citation graph: { component -> [citedComponent, ...] }. */
export function citationGraph(effortRoot) {
  const graph = {};
  for (const c of allComponents(effortRoot)) {
    const parsed = loadContract(effortRoot, c);
    graph[c] = parsed ? [...new Set(parsed.citations.map((x) => x.component))] : [];
  }
  return graph;
}

/** Transitive citation closure of a set of components (the footprint's contract part). */
export function citationClosure(effortRoot, seeds) {
  const graph = citationGraph(effortRoot);
  const seen = new Set();
  const stack = [...seeds];
  while (stack.length) {
    const c = stack.pop();
    if (seen.has(c)) continue;
    seen.add(c);
    for (const dep of graph[c] || []) if (!seen.has(dep)) stack.push(dep);
  }
  return [...seen];
}

/** Find dangling citations: a cite to a component/clause that does not exist. */
export function danglingCitations(effortRoot) {
  const dangling = [];
  const components = new Set(allComponents(effortRoot));
  const clauseIndex = {};
  for (const c of components) {
    const parsed = loadContract(effortRoot, c);
    clauseIndex[c] = new Set((parsed?.clauses || []).map((cl) => cl.id));
  }
  for (const c of components) {
    const parsed = loadContract(effortRoot, c);
    for (const cite of parsed?.citations || []) {
      if (!components.has(cite.component)) {
        dangling.push({ from: c, ...cite, reason: 'unknown component' });
      } else if (!clauseIndex[cite.component].has(cite.clause)) {
        dangling.push({ from: c, ...cite, reason: 'unknown clause' });
      }
    }
  }
  return dangling;
}

/**
 * Find clauses with no well-formed `- Demanded-by:` line — a v3 grammar-completeness
 * violation (DESIGN-3.0 §4.2/§4.3: the cohesion graph and anti-padding audit are load-bearing
 * on every clause naming its demander). Syntax-only, like danglingCitations: this does not
 * resolve whether the reference is real, only that one is present and well-formed.
 */
export function missingDemandedBy(effortRoot) {
  const missing = [];
  for (const c of allComponents(effortRoot)) {
    const parsed = loadContract(effortRoot, c);
    for (const clause of parsed?.clauses || []) {
      if (!clause.demandedBy) missing.push({ component: c, clause: clause.id });
    }
  }
  return missing;
}
```

### Step 3: Run the new locked tests to verify they pass

Run: `node test/contract-v3-grammar.test.mjs`

Expected: `contract-v3-grammar: all <N> checks pass. ✓` with no `FAIL` lines and exit code 0.

### Step 4: Migrate `test/contract.test.mjs`'s fixtures

Replace the entire file with (every assertion is IDENTICAL in meaning to the pre-existing file —
only clause headings and citation placement changed):

```js
// contract.test.mjs — pin the grammar invariants the frontier-inventory design leans on:
// a `## Scenarios` prose section is PARSER-INVISIBLE (zero clauses, zero citations) and does
// not perturb a real clause's provenance/gates — exactly like `## Topology`. Clause ids use the
// v3 durable shape (`<component>#c<N>`, reasonable 3.0 Part 2) and citations attach per clause —
// everything else in this file's assertions (Scenarios/Seams/Provenance/Supersession/Gate
// behavior) is unchanged from the pre-v3 grammar; only the fixture syntax was migrated.
// Run: node test/contract.test.mjs

import assert from 'node:assert';
import { parseContract } from '../lib/contract.mjs';

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.message}`); process.exitCode = 1; }
}

// A census skeleton contract carrying a `## Scenarios` frontier inventory: prose, zero teeth.
const SKELETON_WITH_SCENARIOS = `---
component: store
---

## Topology
- Lives at: \`src/store/\`
- Depends on: db
- Consumed by: api

## Clauses

## Scenarios
- delete-returns-immediately: \`delete(id)\` returns Ok synchronously today (seam: \`src/store/delete.rs\`; floor: delete_returns_ok)
- confirm-delete-prompts: deleting prompts for confirmation before removal (seam: \`src/ui/confirm.rs\`; floor: —)
`;

check('a `## Scenarios` section yields ZERO clauses', () => {
  const c = parseContract(SKELETON_WITH_SCENARIOS, 'store');
  assert.strictEqual(c.clauses.length, 0, 'frontier scenarios must not parse as clauses');
});

check('a `## Scenarios` section yields ZERO citations (footprint-zero)', () => {
  const c = parseContract(SKELETON_WITH_SCENARIOS, 'store');
  assert.strictEqual(c.citations.length, 0, 'frontier scenarios must add no citation-graph edges');
});

// Robustness: even when the component LATER grows a real clause, a trailing `## Scenarios`
// section must not be mis-attributed to it (no stray provenance/gate/citation bleed).
const GROWN_THEN_SCENARIOS = `---
component: store
---

## Clauses

### store#c1 Deletes a row
\`delete(id)\` removes the row.
- Gate: vertical-slice:del / asserts \`deletes_row\`

## Scenarios
- legacy-soft-delete: delete only marks a tombstone today (seam: \`src/store/delete.rs\`; floor: soft_delete_marks)
`;

check('a `## Scenarios` after a clause does not perturb that clause', () => {
  const c = parseContract(GROWN_THEN_SCENARIOS, 'store');
  assert.strictEqual(c.clauses.length, 1, 'exactly the one real clause');
  assert.strictEqual(c.clauses[0].provenance, 'grown', 'scenarios must not flip provenance to characterized');
  assert.strictEqual(c.clauses[0].gates.length, 1, 'the real gate is intact');
  assert.strictEqual(c.citations.length, 0, 'no citations leak from scenarios');
});

// ── `## Observable Seams` — the render-clause public test-observation surface. ────
// It is structured (the blind-test-writer TARGETS a declared handle instead of guessing)
// but, like `## Scenarios`, parser-INVISIBLE to clauses/citations (footprint-zero).
const CONTRACT_WITH_SEAMS = `---
component: choice-edge
---

## Clauses

### choice-edge#c5 Self-loop renders as a bezier arc
A self-referential edge renders as a curved bezier arc, not a straight line.
- Gate: vertical-slice:edge-paths / asserts \`self_loop_is_arc\`
- Cites: graph-store#c1

## Observable Seams
- component: default export \`ChoiceEdge\` (the edge component to import)
- guard-badge: the guard badge at the midpoint → \`[data-testid=guard-badge]\`
- waypoint: each waypoint affordance → \`[data-testid=edge-waypoint]\`
`;

check('`## Observable Seams` bullets parse into `seams`', () => {
  const c = parseContract(CONTRACT_WITH_SEAMS, 'choice-edge');
  assert.strictEqual(c.seams.length, 3, 'three declared seams');
  const byKey = Object.fromEntries(c.seams.map((s) => [s.key, s]));
  assert.strictEqual(byKey['component'].importHint, 'ChoiceEdge', 'the export to import is captured');
  assert.strictEqual(byKey['guard-badge'].handle, '[data-testid=guard-badge]', 'the stable handle is captured');
  assert.strictEqual(byKey['waypoint'].handle, '[data-testid=edge-waypoint]', 'per-element handle captured');
});

check('`## Observable Seams` is footprint-zero (no clauses, no citations leak)', () => {
  const c = parseContract(CONTRACT_WITH_SEAMS, 'choice-edge');
  assert.strictEqual(c.clauses.length, 1, 'exactly the one real clause — seams are not clauses');
  assert.strictEqual(c.clauses[0].id, 'choice-edge#c5', 'the real clause is intact');
  assert.strictEqual(c.citations.length, 1, 'only the real citation — seams add none');
  assert.strictEqual(c.citations[0].component, 'graph-store', 'the citation graph is unperturbed');
});

check('a clause after `## Observable Seams` is not attributed to the section', () => {
  const TRAILING_CLAUSE = CONTRACT_WITH_SEAMS + `
### choice-edge#c6 Guard badge shows the guard label
The badge text is the guard's label.
- Gate: vertical-slice:edge-paths / asserts \`badge_shows_label\`
`;
  const c = parseContract(TRAILING_CLAUSE, 'choice-edge');
  assert.strictEqual(c.clauses.length, 2, 'both real clauses parse');
  assert.strictEqual(c.clauses[1].gates.length, 1, 'the post-seams clause keeps its gate');
  assert.strictEqual(c.seams.length, 3, 'the seams section is closed by the clause, not extended');
});

// ── `## Input Seams` — the STATE-reading clause's mock-construction surface. ──────
// The sibling of `## Observable Seams`: a component test must both OBSERVE outputs
// (observable seams) AND construct the scenario by mocking the EXTERNAL STATE the unit
// reads (input seams — a store / hook / context). Like its sibling it is
// structured-but-footprint-zero: the blind-test-writer reads it to set the scenario up
// instead of defaulting the mock to its empty value (the false-green trap that left
// edge-path §8's auto-router branch never exercised — suite 370/370, proving nothing).
const CONTRACT_WITH_INPUT_SEAMS = `---
component: choice-edge
---

# Contract: choice-edge

## Clauses
### choice-edge#c8 Auto-route deflects around a crossed node
When the straight source→target segment passes through a node bbox, the path deflects into a channel.
- Gate: vertical-slice:edge-paths / asserts \`autoroute_deflects_around_node\`
- Cites: graph-store#c2

## Input Seams
- node bboxes: mock \`useStore\` to drive the real selector against \`{ nodeLookup }\` state — \`Map<id, { position, measured:{ width, height } }>\`; supply a node the segment crosses.
- excluded ids: mock \`useExcluded\` to drive its selector against the set of node ids autoRoute skips.
`;

check('`## Input Seams` bullets parse into `inputSeams`', () => {
  const c = parseContract(CONTRACT_WITH_INPUT_SEAMS, 'choice-edge');
  assert.strictEqual(c.inputSeams.length, 2, 'two declared input seams');
  const byKey = Object.fromEntries(c.inputSeams.map((s) => [s.key, s]));
  assert.strictEqual(byKey['node bboxes'].mock, 'useStore', 'the state source to mock is captured');
  assert.strictEqual(byKey['excluded ids'].mock, 'useExcluded', 'per-bullet mock target captured');
});

check('`## Input Seams` is footprint-zero (no clauses, no citations leak)', () => {
  const c = parseContract(CONTRACT_WITH_INPUT_SEAMS, 'choice-edge');
  assert.strictEqual(c.clauses.length, 1, 'exactly the one real clause — input seams are not clauses');
  assert.strictEqual(c.clauses[0].id, 'choice-edge#c8', 'the real clause is intact');
  assert.strictEqual(c.citations.length, 1, 'only the real citation — input seams add none');
  assert.strictEqual(c.citations[0].component, 'graph-store', 'the citation graph is unperturbed');
});

check('a clause after `## Input Seams` is not attributed to the section', () => {
  const TRAILING = CONTRACT_WITH_INPUT_SEAMS + `
### choice-edge#c9 Excluded nodes are skipped
A node in the excluded set is never deflected around.
- Gate: vertical-slice:edge-paths / asserts \`excluded_nodes_skipped\`
`;
  const c = parseContract(TRAILING, 'choice-edge');
  assert.strictEqual(c.clauses.length, 2, 'both real clauses parse');
  assert.strictEqual(c.clauses[1].gates.length, 1, 'the post-input-seams clause keeps its gate');
  assert.strictEqual(c.inputSeams.length, 2, 'the input-seams section is closed by the clause, not extended');
});

// Observable + Input seams coexist in one contract: disjoint, both footprint-zero.
const CONTRACT_WITH_BOTH_SEAMS = `---
component: choice-edge
---

# Contract: choice-edge

## Clauses
### choice-edge#c8 Auto-route deflects around a crossed node
The path deflects into a channel when it would cross a node.
- Gate: vertical-slice:edge-paths / asserts \`autoroute_deflects\`
- Cites: graph-store#c2

## Observable Seams
- component: default export \`ChoiceEdge\`
- path: the rendered edge path → \`[data-testid=edge-path]\`

## Input Seams
- node bboxes: mock \`useStore\` to drive the real selector against \`{ nodeLookup }\` store state.
`;

check('Observable and Input seams coexist, disjoint and both footprint-zero', () => {
  const c = parseContract(CONTRACT_WITH_BOTH_SEAMS, 'choice-edge');
  assert.strictEqual(c.seams.length, 2, 'both observable seams parse');
  assert.strictEqual(c.inputSeams.length, 1, 'the input seam parses, separately');
  assert.strictEqual(c.seams.find((s) => s.key === 'component').importHint, 'ChoiceEdge', 'observable export captured');
  assert.strictEqual(c.inputSeams[0].mock, 'useStore', 'input mock target captured');
  assert.strictEqual(c.clauses.length, 1, 'one real clause; neither seam section leaks a clause');
  assert.strictEqual(c.citations.length, 1, 'one real citation; neither seam section leaks an edge');
});

if (process.exitCode) console.error(`\ncontract: FAILURES above (${passed} passed).`);
else console.log(`\ncontract: all ${passed} checks pass. ✓`);
```

### Step 5: Run the migrated existing suite to confirm zero regression

Run: `node test/contract.test.mjs`

Expected: `contract: all <N> checks pass. ✓` with the SAME number of checks as before this task
(count them: 10) — proving the migration changed syntax, not behavior.

### Step 6: Run both contract test files together, plus the clause-id suite

```bash
node test/contract-v3-grammar.test.mjs
node test/contract.test.mjs
node test/clause-id.test.mjs
```

All three must pass with zero `FAIL` lines.

### Step 7: Commit

```bash
git add lib/contract.mjs test/contract.test.mjs
git commit -m "feat(contract): rewrite parseContract for v3 grammar — durable clause ids, per-clause citations, demanded-by"
```

## Acceptance Criteria
- [ ] `node test/contract-v3-grammar.test.mjs` passes with zero failures
- [ ] `node test/contract.test.mjs` passes with zero failures, same check count as before (10)
- [ ] `node test/clause-id.test.mjs` still passes (confirms `lib/clause-id.mjs` import wiring works)
- [ ] `test/contract-v3-grammar.test.mjs` was not modified
- [ ] `test/contract.test.mjs`'s edits are confined to heading syntax, citation relocation, and id-
      string assertions — no assertion's meaning changed
- [ ] No file outside Scope was modified
- [ ] No `§` literal remains anywhere in `lib/contract.mjs`
