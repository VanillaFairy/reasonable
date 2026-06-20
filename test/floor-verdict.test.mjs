// Standalone test for the floor-integrity verdict backstop — node builtins only.
// Run: node test/floor-verdict.test.mjs
//
// Proves the D6 annotate-not-disarm property of the worker-adversary-orchestrator
// trio at the accounting layer:
//
//   • floorIntegrity() (lib/baseline.mjs): an `accept` verifier-verdict marks a
//     changed floor diff `explainedByVerdict`, YET the diff still reports as
//     `changed` AND `ambiguous` — the verdict ANNOTATES, it never silently
//     accounts-away the byte-level hash.
//   • a floor diff with NO verdict still surfaces (changed && ambiguous, not
//     explained).
//   • a real accounting event (characterization-promotion / change-characterized
//     / declared floorImpact) DOES clear `ambiguous` — the verdict path is the
//     only one that is advisory-only.
//   • reconcile() (lib/reconcile.mjs): the floor-integrity pass is DEMOTED from a
//     first-line AMBIGUOUS→HALT to a backstop that SURFACES (and, in autonomous
//     mode, queues to the human inbox) — never auto-cleared by a verdict.
//   • the OTHER reconcile HALT classes (ledger-without-commit, runmode-absent,
//     two-lanes-one-WO) are unchanged: an unaccounted floor change alone no
//     longer halts, but those still do.

import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { floorIntegrity } from '../lib/baseline.mjs';
import { reconcile } from '../lib/reconcile.mjs';

const here = dirname(fileURLToPath(import.meta.url));

const tmps = [];
const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const write = (root, rel, content) => {
  const p = join(root, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
};
const appendLedger = (root, obj) =>
  appendFileSync(join(root, '.reasonable', 'ledger.jsonl'), JSON.stringify(obj) + '\n');

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.message}`); process.exitCode = 1; }
}

// A bare effort root with one floor test pinning one source file, captured at the
// ORIGINAL content. We then mutate the source so its current hash != captured.
const ORIGINAL = 'fn delete() { ok() }\n';
const MUTATED = 'fn delete() { ok() }\n// appended parked characterization test pin\n';
function newFloorEffort() {
  const root = mkdtempSync(join(tmpdir(), 'floor-vd-')); tmps.push(root);
  write(root, 'src/store/delete.rs', ORIGINAL);
  const baseline = {
    floor: [{
      id: 'store::delete_returns_ok',
      locus: ['src/store/**'],
      fileHash: { 'src/store/delete.rs': sha256(ORIGINAL) },
    }],
    trusted: [],
  };
  write(root, '.reasonable/baseline.json', JSON.stringify(baseline, null, 2) + '\n');
  write(root, '.reasonable/ledger.jsonl', '');
  // mutate the pinned source so floorIntegrity sees a real byte-level diff.
  write(root, 'src/store/delete.rs', MUTATED);
  return root;
}
const floorOf = (root) => floorIntegrity(root).find((t) => t.id === 'store::delete_returns_ok');

// ── floorIntegrity: the annotate-not-disarm core ───────────────────────────────

check('floor change with NO verdict → changed & ambiguous, not explained', () => {
  const root = newFloorEffort();
  const t = floorOf(root);
  assert.equal(t.changed, true, 'a real byte-level diff is changed');
  assert.equal(t.ambiguous, true, 'unaccounted change is ambiguous');
  assert.equal(t.explainedByVerdict, false, 'no verdict → not explained');
  assert.equal(t.accounted, false);
});

check('accept verifier-verdict → explainedByVerdict TRUE but STILL changed & ambiguous', () => {
  const root = newFloorEffort();
  appendLedger(root, {
    seq: 1, type: 'verifier-verdict', component: 'store',
    diffRef: 'src/store/delete.rs', verdict: 'accept', oracle: 'baseline-intent',
    by: 'intent-verifier', proposed: true, commit: 'sha256:deadbeef',
  });
  const t = floorOf(root);
  assert.equal(t.explainedByVerdict, true, 'accept verdict naming the locus annotates the diff');
  // the load-bearing property: the annotation does NOT disarm the tripwire.
  assert.equal(t.changed, true, 'verdict must NOT clear changed');
  assert.equal(t.ambiguous, true, 'verdict must NOT clear ambiguous (no silent accounting)');
  assert.equal(t.accounted, false, 'a verdict is not an accounting event');
});

check('reject / escalate verdict → annotates nothing', () => {
  for (const verdict of ['reject', 'escalate']) {
    const root = newFloorEffort();
    appendLedger(root, {
      seq: 1, type: 'verifier-verdict', component: 'store',
      diffRef: 'src/store/delete.rs', verdict, oracle: 'baseline-intent',
      by: 'intent-verifier', proposed: true, commit: 'sha256:deadbeef',
    });
    const t = floorOf(root);
    assert.equal(t.explainedByVerdict, false, `${verdict} verdict explains nothing`);
    assert.equal(t.ambiguous, true);
  }
});

check('a REAL accounting event (change-characterized) DOES clear ambiguous', () => {
  const root = newFloorEffort();
  appendLedger(root, {
    seq: 1, type: 'change-characterized', component: 'store', clause: '§3',
    floorTest: 'store::delete_returns_ok', grownTest: 'store::delete_defers',
    workOrder: 'WO-21',
  });
  const t = floorOf(root);
  assert.equal(t.accounted, true, 'a true accounting event accounts the change');
  assert.equal(t.ambiguous, false, 'accounted change is no longer ambiguous');
});

// ── reconcile: the floor backstop demotion + preserved HALT classes ────────────

const git = (cwd, ...args) =>
  execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString();

// A git effort with a floor test, a journal, and a valid runMode. We mutate the
// pinned source AFTER the init commit so floorIntegrity sees an unaccounted diff
// but git is otherwise clean (no ledger-without-commit / two-lane confusion).
function newGitEffort({ runMode = 'autonomous', extraLedger = [], journalLanes = {} } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'floor-rc-')); tmps.push(root);
  git(root, 'init', '-q');
  const hooks = join(root, '.nohooks'); mkdirSync(hooks, { recursive: true });
  git(root, 'config', 'core.hooksPath', hooks);
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'user.name', 'Floor Test');
  git(root, 'config', 'commit.gpgsign', 'false');
  write(root, 'src/store/delete.rs', ORIGINAL);
  write(root, '.reasonable/config.json', JSON.stringify({ effort: 'demo', runMode }) + '\n');
  write(root, '.reasonable/journal.json', JSON.stringify({
    effort: 'demo', currentVerticalSlice: 'confirm-delete', phase: 'vertical-slice-execution',
    workOrders: {}, lanes: journalLanes,
  }) + '\n');
  write(root, '.reasonable/baseline.json', JSON.stringify({
    floor: [{
      id: 'store::delete_returns_ok', locus: ['src/store/**'],
      fileHash: { 'src/store/delete.rs': sha256(ORIGINAL) },
    }],
    trusted: [],
  }, null, 2) + '\n');
  write(root, '.reasonable/ledger.jsonl', extraLedger.map((e) => JSON.stringify(e)).join('\n') + (extraLedger.length ? '\n' : ''));
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'init');
  // now mutate the pinned source: an unaccounted floor change on disk.
  write(root, 'src/store/delete.rs', MUTATED);
  return root;
}

check('reconcile gated: unaccounted floor change SURFACES but does NOT first-line halt (D6 demotion)', () => {
  // The D6 demotion: a floor change alone is no longer a first-line AMBIGUOUS→HALT.
  // GATED mode shows the pure demotion (the present human is the net), distinct from
  // the autonomous D13 stop tested below.
  const root = newGitEffort({ runMode: 'gated' });
  const r = reconcile(root);
  assert.equal(r.active, true);
  assert.equal(r.halt, false, 'a floor change alone must NOT first-line halt (D6 demotion)');
  assert.equal(r.floorIntegrity.surfaced, 1, 'the change is surfaced by the backstop');
  assert.ok(r.notes.some((n) => /BACKSTOP SURFACED/.test(n)), 'backstop note present');
});

check('reconcile autonomous: surfaced floor change QUEUES to the human inbox', () => {
  const root = newGitEffort({ runMode: 'autonomous' });
  const r = reconcile(root);
  const item = r.openInbox.find((i) => i.kind === 'floor-integrity-mismatch');
  assert.ok(item, 'a floor-integrity-mismatch inbox item is queued in autonomous mode');
  assert.equal(item.breaking, true, 'it is BREAKING (always-escalate class)');
  assert.equal(item.explainedByVerdict, false, 'no verdict yet → not annotated');
  assert.equal(item.unexplained, true, 'no verdict → the item is UNEXPLAINED (D13)');
});

// ── D13: the UNEXPLAINED-BREACH STOP (completes D6) ────────────────────────────

check('D13 autonomous UNEXPLAINED floor breach → STOPS (halt + fifth always-escalate class)', () => {
  // No accept verdict explains the diff → in autonomous mode something bypassed the
  // pre-integration adversary, so reconcile STOPS (halt true), the fifth always-escalate class.
  const root = newGitEffort({ runMode: 'autonomous' });
  const r = reconcile(root);
  assert.equal(r.floorIntegrity.surfaced, 1, 'the change is surfaced');
  assert.equal(r.floorIntegrity.unexplained, 1, 'no accept verdict → UNEXPLAINED count is 1 (D13 signal)');
  assert.equal(r.halt, true, 'an UNEXPLAINED autonomous floor breach STOPS the loop (D13)');
  assert.match(r.haltReason, /UNEXPLAINED floor-integrity breach|unexplained floor-integrity breach/i);
  const item = r.openInbox.find((i) => i.kind === 'floor-integrity-mismatch');
  assert.ok(item && item.breaking && item.unexplained, 'queued BREAKING + UNEXPLAINED');
  // D13 must not disturb the four first-line AMBIGUOUS classes: this halt carries no ambiguity.
  assert.ok((r.evidence || []).some((e) => e.haltClass === 'floor-integrity-unexplained'),
    'the D13 stop is its own halt class, not one of the four AMBIGUOUS classes');
});

check('D13 autonomous EXPLAINED floor diff → does NOT block (notice, no halt) yet still surfaces', () => {
  // An accept verdict (content-referencing the REAL judged commit) explains the diff: the
  // pre-integration adversary already judged it, so it is a NON-BLOCKING NOTICE — no halt — but
  // it STILL surfaces and STILL queues (annotate-not-disarm: the human always sees it).
  const root = newGitEffort({ runMode: 'autonomous' });
  const head = git(root, 'rev-parse', 'HEAD').trim();
  appendLedger(root, {
    seq: 1, type: 'verifier-verdict', component: 'store',
    diffRef: 'src/store/delete.rs', verdict: 'accept', oracle: 'baseline-intent',
    by: 'intent-verifier', proposed: true, commit: head,
  });
  const r = reconcile(root);
  assert.equal(r.halt, false, 'an EXPLAINED floor diff does NOT block the autonomous run (D13 notice)');
  assert.equal(r.floorIntegrity.surfaced, 1, 'STILL surfaced (verdict never silences the hash)');
  assert.equal(r.floorIntegrity.explainedByVerdict, 1, 'annotated explained-by-verdict');
  assert.equal(r.floorIntegrity.unexplained, 0, 'explained → unexplained count is 0 → no STOP (D13)');
  const item = r.openInbox.find((i) => i.kind === 'floor-integrity-mismatch');
  assert.ok(item, 'STILL queued for the human (annotate-not-disarm)');
  assert.equal(item.unexplained, false, 'the queued item is annotated explained → not unexplained');
});

check('D13 gated: surfaces both explained and unexplained without halting or synthesizing a blocking item', () => {
  // GATED: the present human is the net, so neither an explained nor an unexplained floor diff
  // halts here, and no extra blocking inbox item is synthesized — both just surface in the briefing.
  const root = newGitEffort({ runMode: 'gated' });
  const r = reconcile(root);
  assert.equal(r.halt, false, 'gated never STOPS on a floor diff (the human is present)');
  assert.equal(r.floorIntegrity.surfaced, 1, 'still surfaced in the briefing');
  assert.equal(r.floorIntegrity.unexplained, 1, 'unexplained count is computed even in gated');
  assert.equal(r.openInbox.some((i) => i.kind === 'floor-integrity-mismatch'), false,
    'gated synthesizes no extra blocking inbox item');
});

check('reconcile: an accept verdict ANNOTATES the surfaced change but never clears it', () => {
  // The verdict content-references the REAL judged commit (like baseline pins a
  // hash), so it does not trip the ledger-without-commit torn-window HALT.
  const root = newGitEffort({ runMode: 'autonomous' });
  const head = git(root, 'rev-parse', 'HEAD').trim();
  appendLedger(root, {
    seq: 1, type: 'verifier-verdict', component: 'store',
    diffRef: 'src/store/delete.rs', verdict: 'accept', oracle: 'baseline-intent',
    by: 'intent-verifier', proposed: true, commit: head,
  });
  const r = reconcile(root);
  assert.equal(r.halt, false, 'still no halt');
  assert.equal(r.floorIntegrity.surfaced, 1, 'STILL surfaced despite the accept verdict');
  assert.equal(r.floorIntegrity.explainedByVerdict, 1, 'annotated explained-by-verdict');
  const item = r.openInbox.find((i) => i.kind === 'floor-integrity-mismatch');
  assert.ok(item, 'STILL queued to the human inbox (verdict never silences the queue)');
  assert.equal(item.explainedByVerdict, true, 'the queued item carries the advisory annotation');
});

check('reconcile gated: surfaces in notes, no synthesized blocking inbox item', () => {
  const root = newGitEffort({ runMode: 'gated' });
  const r = reconcile(root);
  assert.equal(r.halt, false);
  assert.equal(r.floorIntegrity.surfaced, 1, 'still surfaced (present human reads the briefing)');
  assert.equal(r.openInbox.some((i) => i.kind === 'floor-integrity-mismatch'), false,
    'gated mode does not synthesize an extra blocking item (the human is the net)');
});

// ── preserved HALT classes: these must STILL halt, unchanged by the demotion ────

check('reconcile: runmode-absent STILL halts (unchanged)', () => {
  const root = newGitEffort({ runMode: null });
  const r = reconcile(root);
  assert.equal(r.halt, true, 'absent runMode is still a HALT');
  assert.match(r.haltReason, /runMode is absent/);
});

check('reconcile: ledger-without-commit STILL halts (unchanged)', () => {
  const root = newGitEffort({
    runMode: 'autonomous',
    extraLedger: [{ seq: 1, type: 'enrichment', component: 'store', commit: 'sha256:cafebabecafebabecafebabecafebabecafebabe' }],
  });
  const r = reconcile(root);
  assert.equal(r.halt, true, 'a ledger line naming an absent commit is still a HALT (torn window)');
  assert.match(r.haltReason, /does not exist/);
});

check('reconcile: two-lanes-one-WO STILL halts (unchanged)', () => {
  const root = newGitEffort({
    runMode: 'autonomous',
    journalLanes: { '.worktrees/A': 'WO-9', '.worktrees/B': 'WO-9' },
  });
  const r = reconcile(root);
  assert.equal(r.halt, true, 'two lanes claiming one work order is still a HALT');
  assert.match(r.haltReason, /two lanes claim work order WO-9/);
});

check('reconcile: SHA-custody mismatched-trailer STILL halts (preserved class — prior-wave gap)', () => {
  // The coverage gap the prior adversary wave flagged: a registered lane's branch carries a
  // commit whose `Work-Order:` trailer names a DIFFERENT order than the lane's own, with no
  // recorded SHA and no ledger line. The trailer is a hint, not an anchor — the mismatch is
  // unaccounted custody and STILL HALTs (AMBIGUOUS), untouched by the D6/D13 floor demotion.
  const root = newGitEffort({ runMode: 'autonomous' });
  // Restore the pinned floor file so ONLY the SHA-custody trailer mismatch is the halt class
  // under test (newGitEffort mutates it; we are isolating the preserved custody class here).
  write(root, 'src/store/delete.rs', ORIGINAL);
  const base = git(root, 'rev-parse', '--abbrev-ref', 'HEAD').trim();
  // A lane branch one commit ahead of base, the commit trailered for a DIFFERENT work order.
  git(root, 'checkout', '-q', '-b', 'lane/wo-1');
  write(root, 'src/store/extra.rs', 'fn extra() {}\n');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'lane work\n\nWork-Order: WO-OTHER');
  git(root, 'checkout', '-q', base);
  // The journal claims this branch is the lane for WO-1 (dispatched), with no recorded commits.
  write(root, '.reasonable/journal.json', JSON.stringify({
    effort: 'demo', currentVerticalSlice: 'confirm-delete', phase: 'vertical-slice-execution',
    workOrders: { 'WO-1': { status: 'dispatched', branch: 'lane/wo-1', commits: [] } }, lanes: {},
  }) + '\n');
  const r = reconcile(root);
  assert.equal(r.halt, true, 'a mismatched-trailer custody conflict is still a HALT');
  assert.match(r.haltReason, /trailer Work-Order: WO-OTHER \(mismatch\)/);
  // It is an AMBIGUOUS custody halt, NOT the D13 floor-unexplained class.
  assert.ok((r.evidence || []).every((e) => e.haltClass !== 'floor-integrity-unexplained'),
    'this is the SHA-custody AMBIGUOUS class, distinct from the D13 floor stop');
});

for (const t of tmps) { try { rmSync(t, { recursive: true, force: true }); } catch { /* best effort */ } }

if (process.exitCode) console.error(`\nfloor-verdict: FAILURES above (${passed} passed).`);
else console.log(`\nfloor-verdict: all ${passed} checks passed. ✓`);
