// abandon.mjs — effort teardown for a WALKED-AWAY effort (the twin of conclude.mjs).
//
// The blast-radius fence (fence.mjs) fails CLOSED for any edit under a directory
// that has a `.reasonable/` above it and no lane descriptor. That is correct
// while an effort is live, but it keys purely on the *presence* of `.reasonable/`
// — it has no notion of "the operator walked away from this effort." So an effort
// that is never going to be finished, but whose bookkeeping is never torn down,
// leaves the whole repo fenced for ALL subsequent work and lingers as a live
// effort in the discovery scan forever. Abandonment closes that gap.
//
// It is the symmetric twin of conclude: same teardown, different intent.
// `conclude` closes an effort that FINISHED (retro's route-empty branch);
// `abandon` closes one the operator is WALKING AWAY from. It records a final
// provenance event, then archives `.reasonable/` by renaming it aside so the
// fence resolves no effort root and fails OPEN again, and the effort drops out of
// discovery the same cheap way a concluded one does. Archival (not deletion)
// keeps the ledger/decisions/vision auditable, and is trivially reversible
// (rename back).
//
// Node builtins only, like the rest of lib/. Fails OPEN (exit 0) when there is
// no effort to abandon — running it in a plain repo must be a harmless no-op.

import { renameSync } from 'node:fs';
import {
  findEffortRoot, rootFromArgv, argvWithoutRoot, loadConfig, existsSync, join, gitTry,
} from './effort.mjs';
import { commitGate } from './commit-gate.mjs';
import { append } from './ledger.mjs';

const start = argvWithoutRoot(process.argv)[2] || process.cwd();
const effortRoot = rootFromArgv(process.argv, start);
if (!effortRoot) {
  console.log('reasonable: no active effort here — nothing to abandon.');
  process.exit(0);
}

const dotDir = join(effortRoot, '.reasonable');
const effort = loadConfig(effortRoot).effort || 'effort';
const archive = join(effortRoot, `.reasonable.abandoned-${effort}`);

if (existsSync(archive)) {
  console.error(
    `reasonable: ${archive} already exists. An earlier abandonment of "${effort}" ` +
    `was not cleaned up — resolve by hand before re-abandoning.`,
  );
  process.exit(1);
}

// Final event lands in the ledger before it is committed + archived with the rest of the state.
// Goes through the ledger controller (the sole sanctioned write path) so seq/ts are
// script-stamped and the progress mirror folds the "abandoned" event to root status "done"
// immediately (regen defaults ON) — this IS the whole point of the command, so a failure here
// is fatal: nothing gets archived over a ledger that doesn't actually say "abandoned".
const ledgered = append(effortRoot, { type: 'abandoned', effort });
if (!ledgered.ok) {
  console.error(`reasonable: FAILED to record "abandoned" in the ledger for "${effort}": ${ledgered.error}`);
  console.error('The effort is NOT abandoned — nothing was committed or archived.');
  process.exit(1);
}

// --- The commit iron rule (Law 1, Parity corollary): "done" entails committed. -
// Abandoning releases the blast-radius fence and archives the bookkeeping — the
// strongest "done with this effort" claim it makes. It must NEVER happen over
// uncommitted work product, or the work is one `git checkout` from gone. So: commit
// any residual in-scope work product (durability, not ratification — mode-agnostic),
// then verify the tree is clean of in-scope work. If it cannot be made clean,
// HALT instead of archiving — the fence stays up and the work stays recoverable.
const committed = commitGate(effortRoot, {
  commit: true,
  message: `chore(reasonable): commit residual work product before abandoning "${effort}"`,
});
if (committed.committed) console.log(`reasonable: committed residual work product before abandoning (${committed.sha}).`);
for (const w of committed.warnings || []) console.error(`reasonable: WARNING — ${w}`);

const after = commitGate(effortRoot, { commit: false });
if (after.active && !after.clean) {
  console.error(
    `reasonable: REFUSING to abandon "${effort}" — in-scope work product is still uncommitted ` +
    `(${after.inScope.length} path(s)):`,
  );
  for (const p of after.inScope) console.error(`  ${p}`);
  console.error(
    '\n"Done" entails committed (Law 1, Parity). Abandoning would release the blast-radius fence ' +
    'and archive the bookkeeping over uncommitted work — one `git checkout` from losing it. ' +
    'Resolve the work product, then re-run abandon. The effort is NOT abandoned.',
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
  gitTry(['commit', '-m', `chore(reasonable): abandon "${effort}" — bookkeeping archived aside`], effortRoot);
}

console.log(`reasonable: effort "${effort}" abandoned.`);
console.log(`  .reasonable/ archived to ${archive}`);
console.log('  The blast-radius fence is released — the next effort starts clean.');
console.log('  Tip: gitignore ".reasonable.abandoned-*/" to keep archived efforts out of git.');
