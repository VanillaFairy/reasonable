// seam.test.mjs — pin lib/seam.mjs, the deterministic RED-failure classifier that makes
// `seam-undeclared` a COMPUTED route instead of a blind redo (the render-clause incident:
// edge-path §5/§6/§7 spun `fix-test → intent-fork` forever). The three fixtures below are
// the three real deaths from that incident; the behaviour fixture is the AC-4 boundary —
// a genuine assertion mismatch must stay the adjudicator's to judge, never swallowed as a
// seam. Run: node test/seam.test.mjs

import assert from 'node:assert';
import { classifyFailure } from '../lib/seam.mjs';

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.message}`); process.exitCode = 1; }
}

// ── Incident death #1: module system — CJS require() in a Vite/ESM project. ──────
const MODULE_LOAD = `
 FAIL  src/edges/ChoiceEdge.test.tsx [ src/edges/ChoiceEdge.test.tsx ]
Error: Cannot find module './ChoiceEdge'
Require stack:
- /repo/src/edges/ChoiceEdge.test.tsx
    at Module._resolveFilename (node:internal/modules/cjs/loader:1145:15)
`;

check('CJS require in an ESM repo classifies as seam:module-load', () => {
  const v = classifyFailure(MODULE_LOAD);
  assert.strictEqual(v.kind, 'seam');
  assert.strictEqual(v.subkind, 'module-load');
  assert.ok(/test-conventions|module system|import/i.test(v.hint), 'hint points at test conventions / module system');
});

check('`require is not defined in ES module scope` classifies as seam:module-load', () => {
  const v = classifyFailure('ReferenceError: require is not defined in ES module scope, you can use import instead');
  assert.strictEqual(v.kind, 'seam');
  assert.strictEqual(v.subkind, 'module-load');
});

// ── Incident death #2: export shape — named import of a default export. ──────────
const EXPORT_SHAPE = `
 FAIL  src/edges/ChoiceEdge.test.tsx
Element type is invalid: expected a string (for built-in components) or a class/function
(for composite components) but got: undefined. You likely forgot to export your component
from the file it's defined in, or you might have mixed up default and named imports.
`;

check('named import of a default export classifies as seam:export-shape', () => {
  const v = classifyFailure(EXPORT_SHAPE);
  assert.strictEqual(v.kind, 'seam');
  assert.strictEqual(v.subkind, 'export-shape');
  assert.ok(/export/i.test(v.hint), 'hint points at the declared export shape');
});

// ── Incident death #3: DOM handle — a missing/undeclared observable-seam testid. ──
const ELEMENT_NOT_FOUND = `
 FAIL  src/edges/ChoiceEdge.test.tsx > renders a guard badge at the midpoint
TestingLibraryElementError: Unable to find an element by: [data-testid="guard-badge"]

Ignored nodes: comments, script, style
<body>
  <div />
</body>
`;

check('a missing DOM handle classifies as seam:element-not-found', () => {
  const v = classifyFailure(ELEMENT_NOT_FOUND);
  assert.strictEqual(v.kind, 'seam');
  assert.strictEqual(v.subkind, 'element-not-found');
  assert.ok(/data-testid|role|handle/i.test(v.hint), 'hint points at a declared stable handle');
});

// ── The AC-4 boundary: a real assertion mismatch is BEHAVIOUR, never a seam. ──────
const BEHAVIOR = `
 FAIL  src/eval/precedence.test.ts > evaluates 2 + 3 * 4
AssertionError: expected 14 to be 13 // Object.is equality

- Expected
+ Received

- 13
+ 14
`;

check('a genuine assertion mismatch classifies as behavior (NOT seam)', () => {
  const v = classifyFailure(BEHAVIOR);
  assert.strictEqual(v.kind, 'behavior', 'a real red must stay the adjudicator\'s to judge');
  assert.strictEqual(v.subkind, null);
});

// Precedence guard: a module-load death DOMINATES even if assertion-looking noise is
// present elsewhere in the suite output — no assertion could have run for a file that
// never loaded.
check('module-load dominates incidental assertion noise', () => {
  const v = classifyFailure(MODULE_LOAD + '\n' + BEHAVIOR);
  assert.strictEqual(v.kind, 'seam');
  assert.strictEqual(v.subkind, 'module-load');
});

// A real assertion outranks a bare element-not-found, so a behaviour bug is never
// misrouted to the deterministic seam path and silently skipped.
check('a real assertion outranks a co-occurring element-not-found', () => {
  const v = classifyFailure(ELEMENT_NOT_FOUND + '\n' + BEHAVIOR);
  assert.strictEqual(v.kind, 'behavior');
});

check('unrecognized output is unknown (judge as usual), never a false seam', () => {
  const v = classifyFailure('some unrelated build log line\nnpm warn deprecated foo@1.0.0');
  assert.strictEqual(v.kind, 'unknown');
});

if (process.exitCode) console.error(`\nseam: FAILURES above (${passed} passed).`);
else console.log(`\nseam: all ${passed} checks pass. ✓`);
