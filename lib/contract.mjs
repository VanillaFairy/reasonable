// contract.mjs — parse contract files into clauses + citations, and compute the
// citation closure that footprints depend on. The grammar is pinned in
// docs/artifacts.md (§ contracts). If this parser and that grammar drift, the
// computed DAG (§5.11) silently loses edges — so both change together.

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const CLAUSE_RE = /^###\s+§(\d+)\s+(.*)$/;
const CITE_RE = /^[-*]\s+([a-z0-9][a-z0-9-]*)\s+§(\d+)\b/;

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
  const citations = [];
  const gates = [];
  const seams = [];
  const inputSeams = [];
  let inCitations = false;
  let inTopology = false;
  let inSeams = false;
  let inInputSeams = false;
  let seam = null;
  let current = null;

  for (const line of lines) {
    const h2 = /^##\s+(.*)$/.exec(line);
    if (h2) {
      inCitations = /citations/i.test(h2[1]);
      inTopology = /topology/i.test(h2[1]);
      // "Observable Seams" / "Input Seams" only — never the bare "Seams"/"Topology"/
      // "Scenarios" headers. The two are disjoint: "Input Seams" never matches the
      // observable regex and vice versa, so each header switches exactly one flag on.
      inSeams = /observable\s+seams/i.test(h2[1]);
      inInputSeams = /input\s+seams/i.test(h2[1]);
    }

    const cm = CLAUSE_RE.exec(line);
    if (cm) {
      current = { id: `§${cm[1]}`, n: Number(cm[1]), title: cm[2].trim(), gates: [], provenance: 'grown' };
      clauses.push(current);
      inCitations = false;
      inTopology = false;
      inSeams = false;
      inInputSeams = false;
      continue;
    }

    if (inCitations) {
      const ci = CITE_RE.exec(line.trim());
      if (ci) citations.push({ component: ci[1], clause: `§${ci[2]}` });
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
