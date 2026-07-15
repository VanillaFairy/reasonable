// footprint.mjs — compute work-order footprints and pairwise independence.
//
// DESIGN §5.11 Ruling 1: the DAG is computed, not declared. footprint =
// declared locus ∪ citation-closure of touched contracts (+ resource claims).
// Two work orders are independent IFF their footprints are disjoint — a set
// intersection recomputed fresh at dispatch, conservative by construction
// (over-approximation forfeits parallelism, never correctness).
//
// Usage:
//   node footprint.mjs                 # footprint of every work order
//   node footprint.mjs WO-1 WO-2 ...   # footprints + pairwise independence
//   node footprint.mjs --json ...
//   node footprint.mjs --atoms --json  # footprints of every spec'd LEDGER atom, not work orders
//
// reasonable 3.0 Part 7: the CLI body below is now GUARDED (mirrors lib/ledger.mjs's
// `if (basename(process.argv[1]||'')==='ledger.mjs') runCli()` shape) — previously it ran
// UNCONDITIONALLY at module load, including a bare process.exit(1) when no .reasonable/ was
// discoverable, which would have killed any process that merely IMPORTED this file. Nothing imported
// it before P7; `footprintsDisjoint` below is the first export, and it is now side-effect-free to
// import. `node lib/footprint.mjs ...` run directly is UNCHANGED — the guard fires exactly when this
// file is the entry script.
//
// reasonable A2: `--atoms` is a SECOND footprint SOURCE, not a second algebra — it folds the real
// ledger atoms (lib/atom.mjs's foldAtoms) instead of reading .reasonable/work-orders/*.json, and
// feeds each spec'd atom through lib/graph.mjs's atomFootprint (locus ∪ citation closure) against
// the LIVE contract graph. Everything below independent()/footprintsDisjoint is untouched.

import { readdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { findEffortRoot, rootFromArgv, argvWithoutRoot, readJson, norm } from './effort.mjs';
import { citationClosure, citationGraph as liveCitationGraph } from './contract.mjs';
import { atomFootprint } from './graph.mjs';
import { foldAtoms } from './atom.mjs';

/** Literal directory prefix of a glob (up to the first wildcard). */
function prefix(glob) {
  const g = norm(glob);
  const star = g.search(/[*?]/);
  const head = star === -1 ? g : g.slice(0, star);
  return head.replace(/\/[^/]*$/, (m) => (star === -1 ? m : '')); // keep dir part when wildcarded
}

/** Conservative: two loci overlap if their prefixes are in an ancestor relation. */
function lociOverlap(a, b) {
  for (const ga of a) for (const gb of b) {
    const pa = prefix(ga), pb = prefix(gb);
    if (pa === '' || pb === '') return true;          // unbounded glob — assume overlap
    if (pa === pb) return true;
    if ((pa + '/').startsWith(pb + '/') || (pb + '/').startsWith(pa + '/')) return true;
    if (ga === gb) return true;
  }
  return false;
}

function intersect(a, b) { return a.filter((x) => b.includes(x)); }

function independent(fa, fb) {
  if (lociOverlap(fa.locus, fb.locus)) return { ok: false, why: 'locus overlap' };
  const cc = intersect(fa.contracts, fb.contracts);
  if (cc.length) return { ok: false, why: `shared contracts: ${cc.join(', ')}` };
  const rr = intersect(fa.resources, fb.resources);
  if (rr.length) return { ok: false, why: `shared resources: ${rr.join(', ')}` };
  return { ok: true };
}

// ── EXPORTED (reasonable 3.0 Part 7): the pure disjointness algebra, boolean form, for
// lib/frontier.mjs's `pack`. independent() above is UNCHANGED — the CLI's printed `why` diagnostic
// still uses it; this is a thin wrapper, not a re-derivation.
/**
 * Two footprints are disjoint iff their loci do not overlap (ancestor-prefix over glob prefixes) AND
 * they share no contract (citation closure already folded in) AND they share no resource.
 * @param {{locus:string[],contracts:string[],resources:string[]}} a
 * @param {{locus:string[],contracts:string[],resources:string[]}} b
 * @returns {boolean}
 */
export function footprintsDisjoint(a, b) {
  return independent(a, b).ok === true;
}

function footprint(effortRoot, woDir, id) {
  const wo = readJson(join(woDir, `${id}.json`));
  if (!wo) return null;
  const contracts = (wo.inputs && wo.inputs.contracts) || wo.contracts || [];
  const closure = citationClosure(effortRoot, contracts);
  return {
    id,
    locus: (wo.locus || []).map(norm),
    contracts: closure,
    resources: wo.resourceClaims || [],
  };
}

// ── the CLI (GUARDED — see the file header) ─────────────────────────────────────────────────

/** --atoms footprint source: fold the ledger, keep only spec'd atoms (non-empty deltaClauses —
 *  a chartered-but-not-yet-authored atom has none), and run each through atomFootprint against
 *  the LIVE contract graph — the same closure the work-order branch computes via citationClosure,
 *  just sourced from real atoms instead of a declared work-order's `contracts` field. */
function atomFootprints(effortRoot) {
  const atoms = Object.values(foldAtoms(effortRoot)).filter((a) => (a.deltaClauses || []).length > 0);
  const graph = liveCitationGraph(effortRoot);
  return atoms.map((atom) => ({ id: atom.id, ...atomFootprint(atom, graph) }));
}

function runCli() {
  const args = argvWithoutRoot(process.argv).slice(2); // drop --root <path> so it is not read as a work-order id
  const asJson = args.includes('--json');
  const atomsMode = args.includes('--atoms');
  const ids = args.filter((a) => !a.startsWith('--'));

  const effortRoot = rootFromArgv(process.argv, process.cwd());
  if (!effortRoot) { console.error('No effort (.reasonable/) found (pass --root <effortRoot> or run from inside the effort).'); process.exit(1); }

  let fps;
  if (atomsMode) {
    fps = atomFootprints(effortRoot);
  } else {
    const woDir = join(effortRoot, '.reasonable', 'work-orders');
    const allIds = existsSync(woDir)
      ? readdirSync(woDir).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''))
      : [];
    const wanted = ids.length ? ids : allIds;
    fps = wanted.map((id) => footprint(effortRoot, woDir, id)).filter(Boolean);
  }

  if (asJson) {
    const pairs = [];
    for (let i = 0; i < fps.length; i++)
      for (let j = i + 1; j < fps.length; j++)
        pairs.push({ a: fps[i].id, b: fps[j].id, ...independent(fps[i], fps[j]) });
    console.log(JSON.stringify({ footprints: fps, independence: pairs }, null, 2));
    process.exit(0);
  }

  for (const f of fps) {
    console.log(`\n${f.id}`);
    console.log(`  locus:     ${f.locus.join(', ') || '(none)'}`);
    console.log(`  contracts: ${f.contracts.join(', ') || '(none)'}  (incl. citation closure)`);
    console.log(`  resources: ${f.resources.join(', ') || '(none)'}`);
  }
  if (fps.length > 1) {
    console.log('\nPairwise independence (disjoint footprints ⇒ parallelizable):');
    for (let i = 0; i < fps.length; i++)
      for (let j = i + 1; j < fps.length; j++) {
        const r = independent(fps[i], fps[j]);
        console.log(`  ${fps[i].id} ∥ ${fps[j].id}: ${r.ok ? 'INDEPENDENT' : 'SERIALIZE — ' + r.why}`);
      }
  }
}

if (basename(process.argv[1] || '') === 'footprint.mjs') {
  runCli();
}
