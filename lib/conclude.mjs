// conclude.mjs — effort teardown (the symmetric close of the lifecycle).
//
// The blast-radius fence (fence.mjs) fails CLOSED for any edit under a directory
// that has a `.reasonable/` above it and no lane descriptor. That is correct
// while an effort is live, but it keys purely on the *presence* of `.reasonable/`
// — it has no notion of "this effort already finished." So an effort that
// integrates its branch (retro step 10) but never tears down its bookkeeping
// leaves the whole repo fenced for ALL subsequent work: the next effort can't
// even scaffold. Conclusion closes that gap.
//
// Run from the retro's route-empty branch, AFTER finishing-a-development-branch
// has integrated the work. It records a final provenance event, then archives
// `.reasonable/` by renaming it aside so the fence resolves no effort root and
// fails OPEN again. Archival (not deletion) keeps the ledger/decisions/vision
// auditable, and is trivially reversible (rename back).
//
// Node builtins only, like the rest of lib/. Fails OPEN (exit 0) when there is
// no effort to conclude — running it in a plain repo must be a harmless no-op.

import { renameSync } from 'node:fs';
import {
  findEffortRoot, loadConfig, appendJsonl, existsSync, join,
} from './effort.mjs';

const start = process.argv[2] || process.cwd();
const effortRoot = findEffortRoot(start);
if (!effortRoot) {
  console.log('reasonable: no active effort here — nothing to conclude.');
  process.exit(0);
}

const dotDir = join(effortRoot, '.reasonable');
const effort = loadConfig(effortRoot).effort || 'effort';
const archive = join(effortRoot, `.reasonable.done-${effort}`);

if (existsSync(archive)) {
  console.error(
    `reasonable: ${archive} already exists. An earlier conclusion of "${effort}" ` +
    `was not cleaned up — resolve by hand before re-concluding.`,
  );
  process.exit(1);
}

// Final event lands in the ledger before it is archived with the rest of the state.
appendJsonl(join(dotDir, 'ledger.jsonl'), { type: 'concluded', effort });
renameSync(dotDir, archive);

console.log(`reasonable: effort "${effort}" concluded.`);
console.log(`  .reasonable/ archived to ${archive}`);
console.log('  The blast-radius fence is released — the next effort starts clean.');
console.log('  Tip: gitignore ".reasonable.done-*/" to keep archived efforts out of git.');
