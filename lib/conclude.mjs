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
  findEffortRoot, rootFromArgv, argvWithoutRoot, loadConfig, appendJsonl, existsSync, join, gitTry,
} from './effort.mjs';
import { commitGate } from './commit-gate.mjs';

const start = argvWithoutRoot(process.argv)[2] || process.cwd();
const effortRoot = rootFromArgv(process.argv, start);
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

// Final event lands in the ledger before it is committed + archived with the rest of the state.
appendJsonl(join(dotDir, 'ledger.jsonl'), { type: 'concluded', effort });

// --- The commit iron rule (Law 1, Parity corollary): "done" entails committed. -
// Concluding releases the blast-radius fence and archives the bookkeeping — the
// strongest "done" claim an effort makes. It must NEVER happen over uncommitted
// work product, or the work is one `git checkout` from gone. So: commit any
// residual in-scope work product (durability, not ratification — mode-agnostic),
// then verify the tree is clean of in-scope work. If it cannot be made clean,
// HALT instead of archiving — the fence stays up and the work stays recoverable.
const committed = commitGate(effortRoot, {
  commit: true,
  message: `chore(reasonable): commit residual work product before concluding "${effort}"`,
});
if (committed.committed) console.log(`reasonable: committed residual work product before concluding (${committed.sha}).`);
for (const w of committed.warnings || []) console.error(`reasonable: WARNING — ${w}`);

const after = commitGate(effortRoot, { commit: false });
if (after.active && !after.clean) {
  console.error(
    `reasonable: REFUSING to conclude "${effort}" — in-scope work product is still uncommitted ` +
    `(${after.inScope.length} path(s)):`,
  );
  for (const p of after.inScope) console.error(`  ${p}`);
  console.error(
    '\n"Done" entails committed (Law 1, Parity). Concluding would release the blast-radius fence ' +
    'and archive the bookkeeping over uncommitted work — one `git checkout` from losing it. ' +
    'Resolve the work product, then re-run conclude. The effort is NOT concluded.',
  );
  process.exit(1);
}

renameSync(dotDir, archive);

// The bookkeeping was renamed aside. If `.reasonable/` was tracked (the recommended
// default, so the ledger is durable), that rename is a tracked deletion — commit it
// so the tree stays clean (the iron rule applies to our own teardown too). If it was
// gitignored, nothing is staged and this is a no-op.
gitTry(['add', '-A', '--', '.reasonable'], effortRoot);
if (!gitTry(['diff', '--cached', '--quiet'], effortRoot).ok) {
  gitTry(['commit', '-m', `chore(reasonable): conclude "${effort}" — bookkeeping archived aside`], effortRoot);
}

console.log(`reasonable: effort "${effort}" concluded.`);
console.log(`  .reasonable/ archived to ${archive}`);
console.log('  The blast-radius fence is released — the next effort starts clean.');
console.log('  Tip: gitignore ".reasonable.done-*/" to keep archived efforts out of git.');
