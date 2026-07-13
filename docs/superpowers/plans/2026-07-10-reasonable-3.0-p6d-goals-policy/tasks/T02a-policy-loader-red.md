# T02a — policy.json loader tests (red)

**role:** red
**Depends on:** —
**Owns (stage only these):** `test/policy-loader.test.mjs`

> **Read first:** `../shared/interfaces.md` (the `readPolicy` contract, the four required sub-shapes,
> the pass-through-vs-project divergence, and the flagged P6d-coined keys), `../shared/conventions.md`
> (the `route.test.mjs`-style temp-dir harness; validate diagnostic SHAPE never text; validate SHAPE
> never VALUE), `../knowledge/running-tests.md`. You are the `red` role: **write the failing tests
> only. Do not implement `readPolicy`.**

**Files:**
- Create: `test/policy-loader.test.mjs`

- [ ] **Step 1: Write the failing test file**

Write `test/policy-loader.test.mjs` with exactly this content:

```js
// test/policy-loader.test.mjs — P6d: the conservative loader for `.reasonable/policy.json` (an OBJECT
// with an open field set { weights, legibility, cadence, dials, … }). Modeled on test/route.test.mjs.
// Validates SHAPE, never VALUE; returns the parsed object VERBATIM on success (open grammar).
import assert from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readPolicy } from '../lib/policy.mjs';

const tmps = [];
let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.stack || e.message}`); process.exitCode = 1; }
}

function newEffort(content) {
  const root = mkdtempSync(join(tmpdir(), 'policy-')); tmps.push(root);
  mkdirSync(join(root, '.reasonable'), { recursive: true });
  if (content !== undefined) writeFileSync(join(root, '.reasonable', 'policy.json'), content);
  return root;
}
const write = (obj) => newEffort(JSON.stringify(obj));

// A well-formed policy fixture. Deep-cloned per test via structuredClone so a mutation never leaks.
const validPolicy = () => structuredClone({
  weights: { integrationRisk: 5, infoGain: 3, unlocks: 2, goalProximity: 4, staleness: 1, cost: -2 },
  legibility: { maxWidth: 25, maxTangle: 0.5, maxChain: 8, r8Retries: 3 },
  cadence: { low: { n: 1, m: 3 }, high: { n: 1, m: 1 } },
  dials: {
    bandScale: ['low', 'mid', 'high'],
    phaseCutoffs: { low: 'skip-scaffold', mid: 'materialize', high: 'materialize' },
    cadenceIndex: { low: 0, mid: 1, high: 2 },
  },
});

// ── absent file — forward-compat, not an error ──────────────────────────────

check('absent policy.json -> { policy: null, diagnostic: null }', () => {
  assert.deepStrictEqual(readPolicy(newEffort()), { policy: null, diagnostic: null });
});

check('absent .reasonable/ dir entirely -> { policy: null, diagnostic: null } (never throws)', () => {
  const root = mkdtempSync(join(tmpdir(), 'policy-noeff-')); tmps.push(root);
  assert.deepStrictEqual(readPolicy(root), { policy: null, diagnostic: null });
});

// ── valid — returned VERBATIM (open grammar) ────────────────────────────────

check('a valid policy parses to the parsed object, unmodified', () => {
  const p = validPolicy();
  const { policy, diagnostic } = readPolicy(write(p));
  assert.strictEqual(diagnostic, null);
  assert.deepStrictEqual(policy, p);
});

check('unknown top-level keys ("…" extras + ratification metadata) survive pass-through', () => {
  const p = validPolicy();
  p.ratifiedAt = '2026-07-10T10:00:00+02:00';
  p.ledgerSeq = 42;
  p.notes = 'calibration pending (§16)';
  const { policy, diagnostic } = readPolicy(write(p));
  assert.strictEqual(diagnostic, null);
  assert.deepStrictEqual(policy, p); // nothing dropped — open grammar
});

check('dials.bandScale survives as the ordered band array rewrite.mjs indexOf-s into', () => {
  const { policy } = readPolicy(write(validPolicy()));
  assert.ok(Array.isArray(policy.dials.bandScale));
  assert.ok(policy.dials.bandScale.every((b) => typeof b === 'string' && b.length > 0));
  assert.deepStrictEqual(policy.dials.bandScale, ['low', 'mid', 'high']);
});

// ── SHAPE, never VALUE — a mistuned-but-well-formed policy loads clean ───────

check('absurd-but-well-formed numbers load clean (validate shape, never value)', () => {
  const p = validPolicy();
  p.legibility = { maxWidth: -5, maxTangle: 999, maxChain: 0, r8Retries: -1 };
  p.weights = { onlyAxis: 0 };
  const { policy, diagnostic } = readPolicy(write(p));
  assert.strictEqual(diagnostic, null);
  assert.deepStrictEqual(policy, p);
});

// ── present but invalid — null + a surfaced diagnostic, never a repair ───────

const hasDiag = (root) => { const { policy, diagnostic } = readPolicy(root); assert.strictEqual(policy, null); assert.ok(typeof diagnostic === 'string' && diagnostic.length > 0, 'diagnostic is a non-empty string'); };
const withoutKey = (k) => { const p = validPolicy(); delete p[k]; return write(p); };
const withDials = (mut) => { const p = validPolicy(); mut(p.dials); return write(p); };

check('invalid JSON (unparseable) -> null + diagnostic', () => hasDiag(newEffort('{ not valid json')));
check('root JSON value is not an object (an array) -> null + diagnostic', () => hasDiag(write(['weights'])));
check('root JSON value is not an object (a string) -> null + diagnostic', () => hasDiag(write('policy')));

check('"weights" missing -> null + diagnostic', () => hasDiag(withoutKey('weights')));
check('"weights" not an object (an array) -> null + diagnostic', () => { const p = validPolicy(); p.weights = [1, 2]; hasDiag(write(p)); });
check('"weights" empty object -> null + diagnostic', () => { const p = validPolicy(); p.weights = {}; hasDiag(write(p)); });
check('"weights" with a non-numeric value -> null + diagnostic', () => { const p = validPolicy(); p.weights = { cost: 'high' }; hasDiag(write(p)); });

check('"legibility" missing -> null + diagnostic', () => hasDiag(withoutKey('legibility')));
check('"legibility" missing r8Retries -> null + diagnostic', () => { const p = validPolicy(); delete p.legibility.r8Retries; hasDiag(write(p)); });
check('"legibility" with a non-numeric maxWidth -> null + diagnostic', () => { const p = validPolicy(); p.legibility.maxWidth = 'wide'; hasDiag(write(p)); });

check('"cadence" missing -> null + diagnostic', () => hasDiag(withoutKey('cadence')));
check('"cadence" empty object -> null + diagnostic', () => { const p = validPolicy(); p.cadence = {}; hasDiag(write(p)); });
check('"cadence" band value non-object -> null + diagnostic', () => { const p = validPolicy(); p.cadence = { low: 3 }; hasDiag(write(p)); });
check('"cadence" band value missing m -> null + diagnostic', () => { const p = validPolicy(); p.cadence = { low: { n: 1 } }; hasDiag(write(p)); });

check('"dials" missing -> null + diagnostic', () => hasDiag(withoutKey('dials')));
check('"dials.bandScale" not an array -> null + diagnostic', () => hasDiag(withDials((d) => { d.bandScale = 'low'; })));
check('"dials.bandScale" empty -> null + diagnostic', () => hasDiag(withDials((d) => { d.bandScale = []; })));
check('"dials.bandScale" with a non-string element -> null + diagnostic', () => hasDiag(withDials((d) => { d.bandScale = ['low', 2]; })));
check('"dials.phaseCutoffs" missing -> null + diagnostic', () => hasDiag(withDials((d) => { delete d.phaseCutoffs; })));
check('"dials.cadenceIndex" not an object -> null + diagnostic', () => hasDiag(withDials((d) => { d.cadenceIndex = 'first'; })));

// ── round trip through a real .reasonable/policy.json on disk ────────────────

check('round trip: writeFileSync then readPolicy reproduces the ratified policy, pretty-printed', () => {
  const root = newEffort();
  const p = validPolicy();
  writeFileSync(join(root, '.reasonable', 'policy.json'), JSON.stringify(p, null, 2) + '\n');
  const { policy, diagnostic } = readPolicy(root);
  assert.strictEqual(diagnostic, null);
  assert.deepStrictEqual(policy, p);
});

for (const d of tmps) { try { rmSync(d, { recursive: true, force: true }); } catch { /* best-effort cleanup */ } }

if (process.exitCode) console.error(`\npolicy: FAILURES above (${passed} passed).`);
else console.log(`\npolicy: all ${passed} checks passed. ✓`);
```

- [ ] **Step 2: Run it to verify it fails for the right reason**

Run: `node test/policy-loader.test.mjs`
Expected: **the import fails** because `lib/policy.mjs` does not exist yet — a module-not-found error.
That is the correct red.

- [ ] **Step 3: Commit**

```bash
git add test/policy-loader.test.mjs
git commit -m "test(policy): conservative policy.json loader — shape-not-value + open-grammar pass-through (red, P6d)"
```

**Do not implement anything.** The `green` task (T02b) creates `lib/policy.mjs`.
