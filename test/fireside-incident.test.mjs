// Discriminating regression test for the FIRESIDE FLOOR-BREACH INCIDENT — node
// builtins only. Run: node test/fireside-incident.test.mjs
//
// This models, at the lib level (reconcile + floorIntegrity — the engine
// workflows have no unit harness), the specific brownfield failure that motivated
// the verification trio (D6 demote + D13 unexplained-breach stop).
//
// THE INCIDENT (the real facts, c:/work/claude/vanillafairy/reasonable analysing
// the Fireside repo's FastNote "external-watch + format-by-extension" effort):
//   • The floor baseline held 234 FLOOR tests. Among them ~14 `fireside_app::
//     hot_zones::*` tests whose locus included crates/fireside-app/src/
//     orchestration.rs, and 2 `fireside_settings_ui::ipc::*` tests whose locus
//     included crates/fireside-settings-ui/tests/single_instance_ipc_test.rs.
//   • The characterizer ran WITHOUT a lane and appended parked #[ignore]
//     characterization tests INTO those FLOOR-TRACKED files (+162 lines into
//     orchestration.rs's inline #[cfg(test)] mod, +66 lines into
//     single_instance_ipc_test.rs). Their byte hashes changed.
//   • 9 of its 10 pins were OFF-TARGET (hot_zones / tray / panel / single_instance
//     — orthogonal to the watch/format change); 1 was on-target (the fastnote
//     store).
//   • reconcile's floor-integrity pass flagged the changed floor tests "changed
//     with no accounting event" → AMBIGUOUS → HALT. That HALT was a FALSE
//     POSITIVE: every added test was #[ignore]-parked, zero production logic
//     changed, the floor behaviour was intact. A byte-hash can't tell an additive
//     pin from a regression.
//
// THE HARDENED RESPONSE this test asserts FOR THE INCIDENT SHAPE:
//   (A) WITH `accept` verifier-verdicts explaining the floor diffs (the risk-gated
//       adversary ran on the floor-touching pins and DEFAULT-ACCEPTED the
//       orthogonal status-quo ones) → reconcile in AUTONOMOUS mode SURFACES the
//       diffs but does NOT halt (halt:false, explainedByVerdict, unexplained:0).
//       The old 15-test false-positive HALT is GONE; the autonomous run proceeds.
//   (B) WITHOUT any verdict (a floor-touching pin that BYPASSED the adversary) →
//       reconcile in AUTONOMOUS mode HALTS via the D13 unexplained-breach STOP
//       (halt:true, haltClass 'floor-integrity-unexplained'). The real surprise
//       regression is still caught — the gate moved earlier, it was not removed.
//   (C) the SAME unexplained diff in GATED mode → surfaces, does NOT halt (the
//       present human is the net).
//
// HONEST LIMITS this test does NOT claim (see asserts that name them):
//   • The off-target probe SCOPE (9/10 pins unrelated to the effort) is a QUALITY
//     matter, NOT closed here. The fix makes the broad pins HARMLESS (accepted +
//     annotated, no false HALT); it does not narrow the probe. We assert all the
//     orthogonal floor entries surface and are annotated — none silently vanish.
//   • The BUG-PIN axis (is the pinned legacy behaviour itself correct?) is NOT
//     closed by the adversary. default-KEEP handles the orthogonal pins; absolute
//     legacy-correctness stays the human's call. We do not assert any pin is
//     "right" — only that an accepted diff stops blocking while still surfacing.

import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { reconcile } from '../lib/reconcile.mjs';
import { floorIntegrity } from '../lib/baseline.mjs';

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

// ── The two incident-shaped floor files and their characterizer appends ────────
// These are the real loci from the incident. The "before" is the legacy file as
// the baseline census hashed it; the "after" is the same file with the
// characterizer's parked #[ignore] tests appended — production logic untouched,
// only the byte hash moves.
const ORCH_REL = 'crates/fireside-app/src/orchestration.rs';
const IPC_REL = 'crates/fireside-settings-ui/tests/single_instance_ipc_test.rs';

const ORCH_BEFORE = `// hot-zone orchestration — slide the panel on dwell.
pub fn on_dwell(zone: Zone) { show_panel(zone); }

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn hot_zone_left_edge_shows_panel() { /* ... */ }
    #[test] fn tray_click_toggles_panel() { /* ... */ }
}
`;
// +162-line characterizer append: parked #[ignore] pins, no production change.
const ORCH_AFTER = ORCH_BEFORE +
  '\n// ── appended by characterizer (lane-less): parked status-quo pins ──\n' +
  Array.from({ length: 162 }, (_, i) =>
    `    #[test] #[ignore] fn characterized_hot_zone_${i}() { /* parked pin */ }`).join('\n') + '\n';

const IPC_BEFORE = `// single-instance IPC: second launch focuses the running instance.
#[test] fn second_launch_focuses_existing() { /* ... */ }
#[test] fn ipc_socket_is_per_user() { /* ... */ }
`;
// +66-line characterizer append into this FLOOR-tracked test file.
const IPC_AFTER = IPC_BEFORE +
  '\n// ── appended by characterizer (lane-less): parked status-quo pins ──\n' +
  Array.from({ length: 66 }, (_, i) =>
    `#[test] #[ignore] fn characterized_single_instance_${i}() { /* parked pin */ }`).join('\n') + '\n';

// The Fireside-SHAPED baseline: a hot_zones floor entry pinning orchestration.rs,
// a settings-ui ipc floor entry pinning single_instance_ipc_test.rs. (The real
// baseline had ~14 + 2; two representative entries carry the incident shape.)
function firesideBaseline() {
  return {
    floor: [
      {
        id: 'fireside_app::hot_zones::left_edge_shows_panel',
        locus: ['crates/fireside-app/src/**'],
        fileHash: { [ORCH_REL]: sha256(ORCH_BEFORE) },
      },
      {
        id: 'fireside_settings_ui::ipc::second_launch_focuses_existing',
        locus: ['crates/fireside-settings-ui/tests/**'],
        fileHash: { [IPC_REL]: sha256(IPC_BEFORE) },
      },
    ],
    trusted: [],
  };
}

// ── floorIntegrity directly: the lib-level shape of the incident ───────────────

check('INCIDENT shape: characterizer append changes both floor files (the +162/+66 byte diff)', () => {
  const root = mkdtempSync(join(tmpdir(), 'fireside-fi-')); tmps.push(root);
  write(root, ORCH_REL, ORCH_BEFORE);
  write(root, IPC_REL, IPC_BEFORE);
  write(root, '.reasonable/baseline.json', JSON.stringify(firesideBaseline(), null, 2) + '\n');
  write(root, '.reasonable/ledger.jsonl', '');
  // the lane-less characterizer appends its parked pins into both FLOOR files.
  write(root, ORCH_REL, ORCH_AFTER);
  write(root, IPC_REL, IPC_AFTER);

  const fi = floorIntegrity(root);
  const orch = fi.find((t) => t.id === 'fireside_app::hot_zones::left_edge_shows_panel');
  const ipc = fi.find((t) => t.id === 'fireside_settings_ui::ipc::second_launch_focuses_existing');
  assert.equal(orch.changed, true, 'INCIDENT: orchestration.rs hash moved (the +162-line append)');
  assert.equal(ipc.changed, true, 'INCIDENT: single_instance_ipc_test.rs hash moved (the +66-line append)');
  // No verdict yet → both AMBIGUOUS, neither explained: this is the exact state in
  // which the OLD engine first-line-HALTed (the false positive being fixed).
  assert.equal(orch.ambiguous && ipc.ambiguous, true, 'INCIDENT: both surface AMBIGUOUS with no accounting event');
  assert.equal(orch.explainedByVerdict || ipc.explainedByVerdict, false, 'INCIDENT: no verdict yet → nothing explained');
});

// ── A git-backed Fireside effort: pin both floor files at the census commit, then
// have the characterizer append into them on disk (unaccounted floor diff).
const git = (cwd, ...args) =>
  execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString();

function firesideEffort({ runMode = 'autonomous' } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'fireside-rc-')); tmps.push(root);
  git(root, 'init', '-q');
  const hooks = join(root, '.nohooks'); mkdirSync(hooks, { recursive: true });
  git(root, 'config', 'core.hooksPath', hooks);
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'user.name', 'Fireside Incident Test');
  git(root, 'config', 'commit.gpgsign', 'false');
  write(root, ORCH_REL, ORCH_BEFORE);
  write(root, IPC_REL, IPC_BEFORE);
  write(root, '.reasonable/config.json', JSON.stringify({ effort: 'fastnote-watch-format', runMode }) + '\n');
  write(root, '.reasonable/journal.json', JSON.stringify({
    effort: 'fastnote-watch-format', currentVerticalSlice: 'external-watch',
    phase: 'characterization', workOrders: {}, lanes: {},
  }) + '\n');
  write(root, '.reasonable/baseline.json', JSON.stringify(firesideBaseline(), null, 2) + '\n');
  write(root, '.reasonable/ledger.jsonl', '');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'census: 234-test floor baseline');
  // The lane-less characterizer's append lands on disk AFTER the census commit:
  // an unaccounted byte-level floor diff on both files.
  write(root, ORCH_REL, ORCH_AFTER);
  write(root, IPC_REL, IPC_AFTER);
  return root;
}

// Append `accept` verifier-verdicts naming the two floor loci — the risk-gated
// adversary (pinTouchesProtectedState fired) ran on the floor-touching pins and
// DEFAULT-ACCEPTED the orthogonal status-quo ones (no suspectedBug, no tension).
// The verdict content-references the REAL judged commit (HEAD), like a baseline
// pins a hash, so it does not trip the ledger-without-commit torn-window halt.
function acceptBothFloorDiffs(root) {
  const head = git(root, 'rev-parse', 'HEAD').trim();
  appendLedger(root, {
    seq: 1, type: 'verifier-verdict', component: 'fireside-app',
    diffRef: ORCH_REL, verdict: 'accept', oracle: 'baseline-intent',
    by: 'intent-verifier', proposed: true, commit: head,
  });
  appendLedger(root, {
    seq: 2, type: 'verifier-verdict', component: 'fireside-settings-ui',
    diffRef: IPC_REL, verdict: 'accept', oracle: 'baseline-intent',
    by: 'intent-verifier', proposed: true, commit: head,
  });
}

// ── (A) WITH accept verdicts, AUTONOMOUS → surfaces, does NOT halt ─────────────

check('INCIDENT (A) autonomous + accept verdicts: the old 15-test false-positive HALT is GONE', () => {
  const root = firesideEffort({ runMode: 'autonomous' });
  acceptBothFloorDiffs(root);
  const r = reconcile(root);
  assert.equal(r.halt, false,
    'INCIDENT (A): the characterizer append, explained by accept verdicts, must NOT halt the autonomous run (the false-positive HALT is gone)');
  assert.equal(r.floorIntegrity.surfaced, 2,
    'INCIDENT (A): both floor diffs STILL surface (annotate-not-disarm — the verdict never silences the hash)');
  assert.equal(r.floorIntegrity.explainedByVerdict, 2,
    'INCIDENT (A): both diffs annotated explained-by-verdict (the adversary default-accepted the orthogonal pins)');
  assert.equal(r.floorIntegrity.unexplained, 0,
    'INCIDENT (A): zero UNEXPLAINED → no D13 stop → the autonomous run proceeds');
});

check('INCIDENT (A) honest-limit: every orthogonal off-target pin STILL surfaces (scope not narrowed, just made harmless)', () => {
  const root = firesideEffort({ runMode: 'autonomous' });
  acceptBothFloorDiffs(root);
  const r = reconcile(root);
  // The fix does NOT narrow the broad probe; it makes the broad pins harmless. So
  // BOTH off-target floor entries must still be surfaced + queued — none silently
  // vanish. (The human still sees the wasted breadth; it just no longer blocks.)
  const orch = r.openInbox.find((i) => i.floorTest === 'fireside_app::hot_zones::left_edge_shows_panel');
  const ipc = r.openInbox.find((i) => i.floorTest === 'fireside_settings_ui::ipc::second_launch_focuses_existing');
  assert.ok(orch && ipc, 'INCIDENT (A): both orthogonal floor diffs are STILL queued to the human (scope unchanged)');
  assert.equal(orch.explainedByVerdict && ipc.explainedByVerdict, true,
    'INCIDENT (A): both carry the advisory annotation — explained, kept, not disarmed');
  assert.equal(orch.unexplained || ipc.unexplained, false,
    'INCIDENT (A): an explained orthogonal pin is annotated, not flagged unexplained');
});

// ── (B) WITHOUT any verdict, AUTONOMOUS → D13 unexplained-breach STOP ──────────

check('INCIDENT (B) autonomous + NO verdict: a floor-touching pin that BYPASSED the adversary STOPS via D13', () => {
  const root = firesideEffort({ runMode: 'autonomous' });
  // No verifier-verdict at all: the floor diff bypassed the pre-integration
  // adversary. This is the real surprise-regression case — the gate moved earlier
  // (to the intent-verifier), it was NOT removed.
  const r = reconcile(root);
  assert.equal(r.floorIntegrity.surfaced, 2, 'INCIDENT (B): both diffs surface');
  assert.equal(r.floorIntegrity.unexplained, 2,
    'INCIDENT (B): no accept verdict → both UNEXPLAINED (D13 signal)');
  assert.equal(r.halt, true,
    'INCIDENT (B): an UNEXPLAINED autonomous floor breach STOPS the loop (D13 — the surprise regression is still caught)');
  assert.match(r.haltReason, /unexplained floor-integrity breach/i,
    'INCIDENT (B): the halt names the unexplained floor-integrity breach');
  assert.ok((r.evidence || []).some((e) => e.haltClass === 'floor-integrity-unexplained'),
    'INCIDENT (B): the D13 stop is its own halt class, NOT one of the four first-line AMBIGUOUS classes');
});

// ── (C) the SAME unexplained diff, GATED → surfaces, does NOT halt ────────────

check('INCIDENT (C) gated + NO verdict: the same unexplained breach SURFACES but does NOT halt (human is the net)', () => {
  const root = firesideEffort({ runMode: 'gated' });
  const r = reconcile(root);
  assert.equal(r.halt, false,
    'INCIDENT (C): GATED never STOPS on a floor diff — the present human is the net');
  assert.equal(r.floorIntegrity.surfaced, 2,
    'INCIDENT (C): both diffs still surface in the briefing');
  assert.equal(r.floorIntegrity.unexplained, 2,
    'INCIDENT (C): the unexplained count is computed even in gated mode');
  assert.equal(r.openInbox.some((i) => i.kind === 'floor-integrity-mismatch'), false,
    'INCIDENT (C): gated synthesizes no extra blocking inbox item (the human reads the briefing)');
});

try {
  for (const t of tmps) { try { rmSync(t, { recursive: true, force: true }); } catch { /* best effort */ } }
} finally {
  if (process.exitCode) console.error(`\nfireside-incident: FAILURES above (${passed} passed).`);
  else console.log(`\nfireside-incident: all ${passed} checks passed. ✓`);
}
