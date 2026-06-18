// citation-resolve.mjs — every contract citation must resolve to an existing
// clause (DESIGN §5.10 Ruling 1, §6.5). A dumb structural check: no semantics.
// Exit 1 if any citation dangles, so it can gate a merge.
//
// Usage: node citation-resolve.mjs [--json]

import { findEffortRoot } from './effort.mjs';
import { danglingCitations } from './contract.mjs';

const asJson = process.argv.includes('--json');
const effortRoot = findEffortRoot(process.cwd());
if (!effortRoot) { console.error('No effort (.reasonable/) found from cwd.'); process.exit(1); }

const dangling = danglingCitations(effortRoot);

if (asJson) { console.log(JSON.stringify({ dangling }, null, 2)); process.exit(dangling.length ? 1 : 0); }

if (!dangling.length) { console.log('All contract citations resolve. ✓'); process.exit(0); }

console.error(`Dangling citations (${dangling.length}):`);
for (const d of dangling) console.error(`  ${d.from} cites ${d.component} ${d.clause} — ${d.reason}`);
console.error('\nProvider-owned clauses + consumer citations must stay in sync. ' +
  'Fix the cite, or the provider must (re)add the clause. A dangling cite is the disease at the doc layer.');
process.exit(1);
