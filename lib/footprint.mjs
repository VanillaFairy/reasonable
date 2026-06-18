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

import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { findEffortRoot, readJson, norm } from './effort.mjs';
import { citationClosure } from './contract.mjs';

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const ids = args.filter((a) => !a.startsWith('--'));

const effortRoot = findEffortRoot(process.cwd());
if (!effortRoot) { console.error('No effort (.reasonable/) found from cwd.'); process.exit(1); }

const woDir = join(effortRoot, '.reasonable', 'work-orders');
const allIds = existsSync(woDir)
  ? readdirSync(woDir).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''))
  : [];
const wanted = ids.length ? ids : allIds;

function footprint(id) {
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

const fps = wanted.map(footprint).filter(Boolean);

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
