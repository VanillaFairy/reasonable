// progress.mjs — thin CLI/hook surface over progress-map.mjs (Plan 1 "organs" rework).
//
// All the projection logic used to live here (replay ledger actions by hand into a tree,
// render markdown, write the mirror). That logic has moved to progress-map.mjs (folding
// ledger events through progress-tree.mjs's generic tree) — this file now does nothing but
// parse CLI flags, resolve the effort root, call through, and print/exit. No heuristics here.
//
// Usage:
//   node progress.mjs --root <effortRoot>            # print the composed progress.md
//   node progress.mjs --root <effortRoot> --json     # print the structured tree (buildTree)
//   node progress.mjs --root <effortRoot> --write     # write progress.{json,md}, print a summary
//   node progress.mjs --root <effortRoot> --regen     # like --write but silent + fail-open (the hook path)
//   node progress.mjs --hook                          # stdin PostToolUse payload; regen ONLY on a
//                                                       # canonical <effortRoot>/.reasonable/ledger.jsonl write

import { buildTree, writeMirror } from './progress-map.mjs';
import { countByStatus } from './progress-tree.mjs';
import {
  findEffortRoot, rootFromArgv, argvWithoutRoot, readStdinJson, targetPath,
  existsSync, readFileSync, basename, dirname, join,
} from './effort.mjs';

export { writeMirror };

// --hook: the PostToolUse trigger. Read the payload from stdin; regenerate the mirror ONLY
// when the just-written file is the canonical `<effortRoot>/.reasonable/ledger.jsonl` — the
// ledger is the sole source the fold reads, so journal.json/inbox.json writes no longer fire
// this (a deliberate narrowing from the pre-slim behavior). Must never disturb the calling
// session: every failure mode falls through to a plain exit(0).
async function runHook() {
  let input = null;
  try { input = await readStdinJson(); } catch { /* no / blocked stdin */ }
  if (input) {
    try {
      const tgt = targetPath(input.tool_name, input.tool_input);
      if (tgt && basename(tgt) === 'ledger.jsonl' && basename(dirname(tgt)) === '.reasonable') {
        // EFFORT-SCOPED: resolve from the WRITTEN artifact's path, never cwd — a repo may host
        // several efforts, each with its own `.reasonable/`, and only the artifact that changed
        // names which one's mirror to regenerate.
        const root = findEffortRoot(dirname(tgt));
        if (root) writeMirror(root);
      }
    } catch { /* fail open */ }
  }
  process.exit(0);
}

async function runCli() {
  const flags = argvWithoutRoot(process.argv).slice(2);

  if (flags.includes('--hook')) { await runHook(); return; }

  const regen = flags.includes('--regen');
  const root = rootFromArgv(process.argv, null) || findEffortRoot(process.cwd());
  if (!root || !existsSync(join(root, '.reasonable'))) {
    if (regen) process.exit(0); // fail OPEN outside an effort
    console.error('reasonable progress: no effort here (.reasonable/ not found).');
    process.exit(1);
  }

  if (regen || flags.includes('--write')) {
    try {
      const counts = countByStatus(writeMirror(root));
      if (!regen) {
        const total = counts.pending + counts.active + counts.done + counts.failed + counts.canceled;
        console.log(`reasonable progress: wrote .reasonable/progress.{json,md} (${total} node(s), ${counts.done} done).`);
      }
    } catch (e) { if (!regen) { console.error(`reasonable progress: ${e && e.message || e}`); process.exit(1); } }
  } else if (flags.includes('--json')) {
    console.log(JSON.stringify(buildTree(root), null, 2));
  } else {
    writeMirror(root);
    console.log(readFileSync(join(root, '.reasonable', 'progress.md'), 'utf8'));
  }
}

if (basename(process.argv[1] || '') === 'progress.mjs') {
  await runCli();
}
