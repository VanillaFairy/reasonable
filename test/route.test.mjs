// Standalone test for lib/route.mjs `readRoute` — node builtins only, no git.
// Run: node test/route.test.mjs
//
// Pins the Layer-2 T2.1 interface (docs/superpowers/plans/effort-discovery/shared/interfaces.md
// §T2.1): `.reasonable/route.json` is the machine twin of the human-narration `route.md` — it carries
// ONLY the ratified vertical-slice order (+ its ratification back-pointers), never WO->slice
// membership (that stays on each work-order spec's own `verticalSlice` field).
//
// readRoute is CONSERVATIVE: an absent file is a legitimate pre-Layer-2 (or pre-ratification) effort
// state -> `{ route: null, diagnostic: null }`, never an error. A PRESENT-but-malformed file never gets
// repaired, defaulted, or partially trusted -> `{ route: null, diagnostic: '<reason>' }`. It never
// fabricates an order.

import assert from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readRoute } from '../lib/route.mjs';

const tmps = [];
let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.stack || e.message}`); process.exitCode = 1; }
}

// A fresh effort root with `.reasonable/` present but no route.json yet, unless `content` is given
// (raw file content — a string is written verbatim so malformed-JSON fixtures are expressible).
function newEffort(content) {
  const root = mkdtempSync(join(tmpdir(), 'route-')); tmps.push(root);
  mkdirSync(join(root, '.reasonable'), { recursive: true });
  if (content !== undefined) {
    writeFileSync(join(root, '.reasonable', 'route.json'), content);
  }
  return root;
}

// ── absent file — forward-compat, not an error ──────────────────────────────────────────

check('absent route.json -> { route: null, diagnostic: null }', () => {
  const root = newEffort();
  assert.deepEqual(readRoute(root), { route: null, diagnostic: null });
});

check('absent .reasonable/ dir entirely -> { route: null, diagnostic: null } (never throws)', () => {
  const root = mkdtempSync(join(tmpdir(), 'route-noeff-')); tmps.push(root);
  assert.deepEqual(readRoute(root), { route: null, diagnostic: null });
});

// ── valid route — order preserved, shape pinned ─────────────────────────────────────────

check('valid route.json parses to { slices, ratifiedAt, ledgerSeq } with order preserved', () => {
  const root = newEffort(JSON.stringify({
    slices: ['walking-skeleton', 'expr-eval', 'render'],
    ratifiedAt: '2026-07-06T12:00:00+02:00',
    ledgerSeq: 42,
  }));
  const { route, diagnostic } = readRoute(root);
  assert.equal(diagnostic, null);
  assert.deepEqual(route, {
    slices: ['walking-skeleton', 'expr-eval', 'render'],
    ratifiedAt: '2026-07-06T12:00:00+02:00',
    ledgerSeq: 42,
  });
});

check('slice order is preserved exactly (never re-sorted)', () => {
  const root = newEffort(JSON.stringify({ slices: ['z-last', 'a-first'], ratifiedAt: 'x', ledgerSeq: 1 }));
  const { route } = readRoute(root);
  assert.deepEqual(route.slices, ['z-last', 'a-first']);
});

// ── present but invalid — null + a surfaced diagnostic, never a repair ──────────────────

check('invalid JSON (unparseable) -> null + diagnostic', () => {
  const root = newEffort('{ not valid json');
  const { route, diagnostic } = readRoute(root);
  assert.equal(route, null);
  assert.ok(typeof diagnostic === 'string' && diagnostic.length > 0, 'diagnostic is a non-empty string');
});

check('root JSON value is not an object (an array) -> null + diagnostic', () => {
  const root = newEffort(JSON.stringify(['walking-skeleton', 'expr-eval']));
  const { route, diagnostic } = readRoute(root);
  assert.equal(route, null);
  assert.ok(diagnostic);
});

check('root JSON value is not an object (a string) -> null + diagnostic', () => {
  const root = newEffort(JSON.stringify('walking-skeleton'));
  const { route, diagnostic } = readRoute(root);
  assert.equal(route, null);
  assert.ok(diagnostic);
});

check('"slices" missing entirely -> null + diagnostic (never defaults to [])', () => {
  const root = newEffort(JSON.stringify({ ratifiedAt: 'x', ledgerSeq: 1 }));
  const { route, diagnostic } = readRoute(root);
  assert.equal(route, null);
  assert.ok(diagnostic);
});

check('"slices" not an array (a string) -> null + diagnostic', () => {
  const root = newEffort(JSON.stringify({ slices: 'walking-skeleton', ratifiedAt: 'x', ledgerSeq: 1 }));
  const { route, diagnostic } = readRoute(root);
  assert.equal(route, null);
  assert.ok(diagnostic);
});

check('"slices" contains a non-string element -> null + diagnostic', () => {
  const root = newEffort(JSON.stringify({ slices: ['walking-skeleton', 42], ratifiedAt: 'x', ledgerSeq: 1 }));
  const { route, diagnostic } = readRoute(root);
  assert.equal(route, null);
  assert.ok(diagnostic);
});

check('"slices" contains an empty string -> null + diagnostic (never a fabricated id)', () => {
  const root = newEffort(JSON.stringify({ slices: ['walking-skeleton', ''], ratifiedAt: 'x', ledgerSeq: 1 }));
  const { route, diagnostic } = readRoute(root);
  assert.equal(route, null);
  assert.ok(diagnostic);
});

// ── ratifiedAt / ledgerSeq are carried through, never fabricated when malformed ─────────

check('a non-string ratifiedAt / non-numeric ledgerSeq degrade to null, never fabricated, without killing the route', () => {
  const root = newEffort(JSON.stringify({ slices: ['walking-skeleton'], ratifiedAt: 12345, ledgerSeq: 'not-a-number' }));
  const { route, diagnostic } = readRoute(root);
  assert.equal(diagnostic, null);
  assert.deepEqual(route, { slices: ['walking-skeleton'], ratifiedAt: null, ledgerSeq: null });
});

// ── round trip through a real .reasonable/route.json on disk ───────────────────────────

check('round trip: writeFileSync then readRoute reproduces the exact ratified shape', () => {
  const root = newEffort();
  const written = { slices: ['walking-skeleton', 'expr-eval'], ratifiedAt: '2026-07-06T09:30:00Z', ledgerSeq: 17 };
  writeFileSync(join(root, '.reasonable', 'route.json'), JSON.stringify(written, null, 2) + '\n');
  const { route, diagnostic } = readRoute(root);
  assert.equal(diagnostic, null);
  assert.deepEqual(route, written);
});

for (const d of tmps) { try { rmSync(d, { recursive: true, force: true }); } catch { /* best-effort cleanup */ } }

if (process.exitCode) console.error(`\nroute: FAILURES above (${passed} passed).`);
else console.log(`\nroute: all ${passed} checks passed. ✓`);
