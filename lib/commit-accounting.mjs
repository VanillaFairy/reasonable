// commit-accounting.mjs — provenance partitioning, default-deny (DESIGN §5.14B).
// The workflow never recognizes HUMAN edits; it recognizes its OWN and classifies
// the rest as external. Polarity matters: misclassifying agent work as human is
// harmless (extra scrutiny); misclassifying human work as agentic is silent rot
// (it assumes a contract sync that never happened). So nothing is ever presumed
// agentic — the journal must positively claim each commit.
//
// Partitions commits in <range> into:
//   accounted   = recorded in the journal (orchestrator merges + lane-reported SHAs)
//   unaccounted = external input (human / another tool) → must be drift-checked
//
// Usage: node commit-accounting.mjs [--since <ref>] [--json]

import { join } from 'node:path';
import { findEffortRoot, readJson, gitTry, norm } from './effort.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const since = opt('--since', null);
const asJson = args.includes('--json');

const effortRoot = findEffortRoot(process.cwd());
if (!effortRoot) { console.error('No effort found.'); process.exit(1); }

const journal = readJson(join(effortRoot, '.reasonable', 'journal.json')) || {};
const accounted = new Set();
for (const wo of Object.values(journal.workOrders || {}))
  for (const sha of wo.commits || []) accounted.add(sha.slice(0, 12));
for (const sha of journal.mergedCommits || []) accounted.add(sha.slice(0, 12));

const range = since ? `${since}..HEAD` : 'HEAD';
const log = gitTry(['log', '--no-merges', '--format=%h\t%an\t%s', range], effortRoot);
if (!log.ok) { console.error('git log failed: ' + log.out); process.exit(1); }

const unaccounted = [];
for (const line of log.out.split(/\r?\n/).filter(Boolean)) {
  const [sha, author, subject] = line.split('\t');
  if (!accounted.has(sha.slice(0, 12))) unaccounted.push({ sha, author, subject: norm(subject) });
}

if (asJson) { console.log(JSON.stringify({ accountedCount: accounted.size, unaccounted }, null, 2)); process.exit(0); }

if (!unaccounted.length) { console.log('All commits accounted for by the journal. ✓'); process.exit(0); }
console.log(`Unaccounted commits (${unaccounted.length}) — external input, drift-check against contracts:`);
for (const c of unaccounted) console.log(`  ${c.sha}  ${c.author}: ${c.subject}`);
console.log(`\nThe system never blocks the human; it refuses to let the artifact layer silently rot. ` +
  `For each: does the edit exceed a contract? If so, raise an inbox item — enrich the contract, or revert.`);
