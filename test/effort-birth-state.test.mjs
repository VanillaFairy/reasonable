// effort-birth-state.test.mjs — the birth-signature predicate (node builtins only).
// effortBirthState(effortRoot) is the ONE shared "is this a born effort?" test both
// discovery and reconcile call, so they cannot disagree. It must be pure + sync + git-free
// and — the load-bearing part — tell 'corrupt' apart from 'absent' (which loadConfig can't,
// since it swallows a parse failure into defaults). Fixtures cover all four states.
// Run: node test/effort-birth-state.test.mjs

import assert from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { effortBirthState } from '../lib/effort.mjs';

const tmps = [];
let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.message}`); process.exitCode = 1; }
}

/** A bare temp dir (no `.reasonable/`). */
function bareDir() { const d = mkdtempSync(join(tmpdir(), 'birth-')); tmps.push(d); return d; }
/** A temp effort root with `.reasonable/config.json` = `contents`. */
function withConfig(contents) {
  const d = bareDir();
  mkdirSync(join(d, '.reasonable'), { recursive: true });
  writeFileSync(join(d, '.reasonable', 'config.json'), contents);
  return d;
}

// ── absent — NOT a born effort (stray / pre-birth), never a HALT ─────────────────
check("no .reasonable/ at all → 'absent'", () => {
  assert.deepEqual(effortBirthState(bareDir()), { state: 'absent' });
});
check("`.reasonable/` present but no config.json → 'absent'", () => {
  const d = bareDir();
  mkdirSync(join(d, '.reasonable'), { recursive: true }); // dir, but no config.json inside
  assert.deepEqual(effortBirthState(d), { state: 'absent' });
});

// ── corrupt — born but the config won't parse: HALT-worthy, and it MUST be ────────
//    distinguishable from absent (this is why we don't route through loadConfig).
check("config.json that does not JSON-parse → 'corrupt' (with a reason)", () => {
  const r = effortBirthState(withConfig('not json{'));
  assert.equal(r.state, 'corrupt');
  assert.equal(typeof r.reason, 'string');
  assert.ok(r.reason.length > 0, 'corrupt carries a non-empty parse-failure reason');
});

// ── missing-signature — parses, but no non-empty string cfg.effort: HALT-worthy ──
check("parses but no effort field → 'missing-signature'", () => {
  assert.deepEqual(effortBirthState(withConfig('{"runMode":"gated"}')), { state: 'missing-signature' });
});
check("whitespace-only effort → 'missing-signature'", () => {
  assert.deepEqual(effortBirthState(withConfig('{"effort":"   "}')), { state: 'missing-signature' });
});
check("empty-string effort → 'missing-signature'", () => {
  assert.deepEqual(effortBirthState(withConfig('{"effort":""}')), { state: 'missing-signature' });
});
check("non-string effort (number) → 'missing-signature'", () => {
  assert.deepEqual(effortBirthState(withConfig('{"effort":123}')), { state: 'missing-signature' });
});

// ── ok — parses, carries a non-empty cfg.effort: a healthy born effort ───────────
check("effort + runMode → 'ok'", () => {
  assert.deepEqual(effortBirthState(withConfig('{"effort":"demo","runMode":"gated"}')), { state: 'ok' });
});
check("effort alone is enough → 'ok'", () => {
  assert.deepEqual(effortBirthState(withConfig('{"effort":"x"}')), { state: 'ok' });
});
check("effort with surrounding whitespace (has content) → 'ok'", () => {
  assert.deepEqual(effortBirthState(withConfig('{"effort":"  demo  "}')), { state: 'ok' });
});

for (const t of tmps) { try { rmSync(t, { recursive: true, force: true }); } catch { /* best effort */ } }

if (process.exitCode) console.error(`\neffort-birth-state: FAILURES above (${passed} passed).`);
else console.log(`\neffort-birth-state: all ${passed} checks passed. ✓`);
