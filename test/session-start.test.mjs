// session-start.test.mjs — Part A of T1.5: the multi-effort SessionStart briefing (§6.6, F7).
// Subprocess the hook over JSON stdin (like fence.test.mjs) and inspect the emitted additionalContext.
// node builtins only. Run: node test/session-start.test.mjs
//
// The four routes of resolveActiveEffort(cwd):
//   • resolved → the CURRENT single-effort behavior: writeMirror + full reconcile + briefing (+ lifecycle).
//   • multiple → a CHEAP per-effort summary (counts + staleness + forward-compat nextAction), NO per-effort
//                reconcile, each effort in its OWN try/catch (one bad effort ⇒ "flagged", the rest briefed).
//   • none     → "no active effort"; strays/diagnostics surfaced as debris, never adopted.
// Concluded/abandoned (`.reasonable.(done|abandoned)-*`) are counted-hidden, never briefed. A born-but-bad
// config is flagged. The always-on <reasonable> methodology banner emits in EVERY case.

import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const HOOK = join(here, '..', 'lib', 'session-start.mjs');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
const tmps = [];
function write(root, rel, content) {
  const p = join(root, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, content);
}

/** Run the SessionStart hook with `cwd` on stdin (and as the process cwd); return the additionalContext. */
function runHook(cwd) {
  const out = execFileSync('node', [HOOK], {
    cwd, input: JSON.stringify({ cwd, hook_event_name: 'SessionStart' }), stdio: ['pipe', 'pipe', 'pipe'],
  }).toString().trim();
  const j = JSON.parse(out);
  return (j.hookSpecificOutput && j.hookSpecificOutput.additionalContext) || j.additional_context || '';
}

/** A git-inited repo root (rev-parse --show-toplevel works; needed for the down-scan repo root). */
function newRepo(prefix) {
  const root = mkdtempSync(join(tmpdir(), prefix)); tmps.push(root);
  git(root, 'init', '-q');
  return root;
}

const daysAgoISO = (d) => new Date(Date.now() - d * 86400000).toISOString();

/** Write a born effort under `dir`: config (effort+runMode) + journal + empty ledger. */
function bornEffort(dir, effort, { workOrder = { verticalSlice: 'slice-1', role: 'implementer' } } = {}) {
  write(dir, '.reasonable/config.json', JSON.stringify({ effort, runMode: 'gated' }) + '\n');
  write(dir, '.reasonable/journal.json', JSON.stringify({
    effort, currentVerticalSlice: 'slice-1', phase: 'vertical-slice-execution', supervision: 'standard',
    workOrders: workOrder ? { 'WO-1': workOrder } : {}, lanes: {}, inbox: [],
  }, null, 2) + '\n');
  write(dir, '.reasonable/ledger.jsonl', '');
}

/**
 * A nested born effort at `.reasonable-efforts/<name>/` whose ledger + journal WOULD make reconcile append
 * a `node-downgraded` (a live WO with a registered-but-missing lane) — the discriminator that the cheap
 * multi-effort path does NOT reconcile. Also writes a progress.json mirror (counts) so it briefs with counts.
 */
function nestedLiveEffort(repoRoot, name, { idleDays = 3 } = {}) {
  const dir = join(repoRoot, '.reasonable-efforts', name);
  write(dir, '.reasonable/config.json', JSON.stringify({ effort: name, runMode: 'gated' }) + '\n');
  write(dir, '.reasonable/journal.json', JSON.stringify({
    effort: name, currentVerticalSlice: 'slice-1', phase: 'vertical-slice-execution', supervision: 'standard',
    workOrders: { 'WO-1': { branch: 'lane/x', worktree: '.worktrees/wo1' } }, lanes: {}, inbox: [],
  }, null, 2) + '\n');
  write(dir, '.reasonable/ledger.jsonl',
    JSON.stringify({ seq: 1, type: 'node-dispatched', node: 'WO-1', workOrder: 'WO-1', ts: daysAgoISO(idleDays) }) + '\n');
  write(dir, '.reasonable/progress.json',
    JSON.stringify({ label: name, counts: { pending: 1, active: 0, done: 0, failed: 0, canceled: 0 } }, null, 2) + '\n');
  return dir;
}
const nestedLedger = (repoRoot, name) => readFileSync(join(repoRoot, '.reasonable-efforts', name, '.reasonable', 'ledger.jsonl'), 'utf8');

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.stack || e.message}`); process.exitCode = 1; }
}

const BANNER = /plugin is ACTIVE/; // the always-on methodology banner marker

// ── resolved: a single repo-root effort → full briefing (reconcile ran, lifecycle present) ──
check('single repo-root effort → full briefing (reconcile ran, lifecycle present) + banner', () => {
  const root = newRepo('ss-single-');
  bornEffort(root, 'demo');
  const ctx = runHook(root);
  assert.match(ctx, BANNER, 'the always-on banner must emit');
  assert.match(ctx, /An effort is ACTIVE in this project/);
  assert.match(ctx, /Reconciliation ran at session start/, 'the single effort is fully reconciled');
  assert.match(ctx, /Reasonable briefing/, 'the reconcile briefing is injected');
  assert.match(ctx, /Lifecycle: \*\*active\*\*/, 'the briefing surfaces the lifecycle state');
});

// ── resolved via up-walk from a subdir → the enclosing effort ──
check('cwd inside an effort → resolved to that one (up-walk)', () => {
  const root = newRepo('ss-inside-');
  bornEffort(root, 'demo');
  const deep = join(root, 'src', 'a'); mkdirSync(deep, { recursive: true });
  const ctx = runHook(deep);
  assert.match(ctx, /An effort is ACTIVE in this project/);
  assert.match(ctx, /Reasonable briefing/);
});

// ── multiple: N parallel nested efforts, cwd at repo root → CHEAP briefing, NONE reconciled ──
check('N parallel nested efforts → cheap multi-effort briefing; none reconciled (no node-downgraded)', () => {
  const root = newRepo('ss-multi-');
  nestedLiveEffort(root, 'eff-a');
  nestedLiveEffort(root, 'eff-b');
  const beforeA = nestedLedger(root, 'eff-a');
  const beforeB = nestedLedger(root, 'eff-b');
  const ctx = runHook(root);
  assert.match(ctx, BANNER, 'banner still emits under multiple');
  assert.match(ctx, /2 active efforts/, 'the count of parallel efforts is surfaced');
  assert.match(ctx, /eff-a:[^\n]*done/, 'eff-a listed with counts');
  assert.match(ctx, /eff-b:[^\n]*done/, 'eff-b listed with counts');
  assert.match(ctx, /idle 3d/, 'staleness (days-since last ledger event) surfaced');
  assert.doesNotMatch(ctx, /Reconciliation ran at session start/, 'multi-effort path must NOT reconcile');
  // The load-bearing discriminator: neither un-acted effort was reconciled, so no node-downgraded landed.
  assert.equal(nestedLedger(root, 'eff-a'), beforeA, 'eff-a ledger unchanged (not reconciled)');
  assert.equal(nestedLedger(root, 'eff-b'), beforeB, 'eff-b ledger unchanged (not reconciled)');
  assert.doesNotMatch(nestedLedger(root, 'eff-a'), /node-downgraded/, 'no node-downgraded appended to eff-a');
  assert.doesNotMatch(nestedLedger(root, 'eff-b'), /node-downgraded/, 'no node-downgraded appended to eff-b');
});

// ── concluded/abandoned archives are COUNTED-hidden, never briefed ──
check('.reasonable.done-* present → counted-not-briefed', () => {
  const root = newRepo('ss-parked-');
  nestedLiveEffort(root, 'eff-a');
  nestedLiveEffort(root, 'eff-b');
  mkdirSync(join(root, '.reasonable.done-old'), { recursive: true });
  writeFileSync(join(root, '.reasonable.done-old', 'config.json'), JSON.stringify({ effort: 'old' }) + '\n');
  const ctx = runHook(root);
  assert.match(ctx, /2 active efforts/, 'the concluded archive does not inflate the active count');
  assert.match(ctx, /1 parked\/stale/, 'the concluded archive is surfaced as a hidden count');
  assert.doesNotMatch(ctx, /\.reasonable\.done-old/, 'the concluded archive dir is never briefed/scanned');
});

// ── none: a stray config-less .reasonable/ → debris, never adopted ──
check('stray config-less .reasonable/ → none + debris (not adopted)', () => {
  const root = newRepo('ss-stray-');
  mkdirSync(join(root, '.reasonable'), { recursive: true }); // config-less: NOT an effort
  const ctx = runHook(root);
  assert.match(ctx, BANNER, 'banner still emits with no effort');
  assert.match(ctx, /No active reasonable effort/);
  assert.match(ctx, /Debris/, 'the config-less .reasonable/ is surfaced as debris');
  assert.doesNotMatch(ctx, /An effort is ACTIVE/, 'a stray is never adopted as an active effort');
});

// ── per-effort isolation: a corrupt progress.json flags THAT one; the rest still brief ──
check('corrupt progress.json among several → that one flagged, the rest still briefed', () => {
  const root = newRepo('ss-corrupt-');
  nestedLiveEffort(root, 'eff-a');                        // healthy mirror
  nestedLiveEffort(root, 'eff-b');
  writeFileSync(join(root, '.reasonable-efforts', 'eff-b', '.reasonable', 'progress.json'), 'not json{');
  const ctx = runHook(root);
  assert.match(ctx, /2 active efforts/);
  assert.match(ctx, /eff-a:[^\n]*done/, 'the healthy effort is still briefed with counts');
  assert.match(ctx, /eff-b:[^\n]*FLAGGED/, 'the corrupt-mirror effort degrades to flagged (per-effort try/catch)');
});

// ── born-but-bad config among several → flagged (HALT-worthy), the rest briefed ──
check('missing-signature config among several → flagged, not silently adopted', () => {
  const root = newRepo('ss-badcfg-');
  nestedLiveEffort(root, 'eff-a');
  // a born-but-bad config: parses, has runMode, but no `effort` birth signature
  const b = join(root, '.reasonable-efforts', 'eff-b');
  write(b, '.reasonable/config.json', JSON.stringify({ runMode: 'gated' }) + '\n');
  write(b, '.reasonable/journal.json', JSON.stringify({ effort: 'eff-b', workOrders: {}, lanes: {}, inbox: [] }) + '\n');
  const ctx = runHook(root);
  // eff-b is missing-signature (born, no signature) → resolveActiveEffort lists it; the briefing flags it.
  assert.match(ctx, /eff-a:[^\n]*done/, 'the healthy effort is still briefed');
  assert.match(ctx, /FLAGGED[^\n]*missing-signature|missing-signature/, 'the born-but-bad config is flagged');
});

// ── plain repo, no effort → banner + "no active effort", nothing adopted ──
check('plain repo (no effort) → banner + no active effort', () => {
  const root = newRepo('ss-plain-');
  const ctx = runHook(root);
  assert.match(ctx, BANNER);
  assert.match(ctx, /No active reasonable effort/);
  assert.match(ctx, /<\/reasonable>/, 'the block is always closed');
});

for (const t of tmps) { try { rmSync(t, { recursive: true, force: true }); } catch { /* best effort */ } }

if (process.exitCode) console.error(`\nsession-start: FAILURES above (${passed} passed).`);
else console.log(`\nsession-start: all ${passed} checks passed. ✓`);
