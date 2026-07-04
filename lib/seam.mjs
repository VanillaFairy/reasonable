// seam.mjs — deterministic classifier for a RED test-run failure: did the test fail
// because it could not OBSERVE the unit (a missing/undeclared OBSERVABLE SEAM — it
// died at module load, imported the wrong export shape, or could not find the DOM
// handle), or because a real behavioral assertion ran and disagreed? The methodology's
// own law applies — *never simulate what a script can compute* (glossary,
// three-condition selectivity): this classification is a decidable text match, so it
// is a fence/computed binary, NOT a model judgment. The adjudicator INVOKES it (it has
// Bash) to route `seam-undeclared` deterministically instead of looping blind redos
// (the render-clause incident: edge-path §5/§6/§7 spun `fix-test → intent-fork`).
//
// An OBSERVABLE SEAM is the PUBLIC test-observation surface a render-only clause is
// observed through — the export to import and a stable test handle (testid/role) per
// queried element (docs/glossary.md "observable seam"; the `## Observable Seams`
// contract section). It is API surface, not implementation behaviour, so declaring and
// targeting it does not break the blind-test-writer's blindness.
//
// Usage:
//   node lib/seam.mjs --classify --log <path> [--json]   # read a saved suite-output file
//   <suite> 2>&1 | node lib/seam.mjs --classify [--json]  # or pipe the output on stdin
//
// PURITY/DEPS: node builtins only (Law 1) — no third-party imports.

import { readFileSync } from 'node:fs';

// ── Signal sets ────────────────────────────────────────────────────────────────
// LOAD-TIME failures: the module never loaded / the imported symbol was undefined, so
// the unit never rendered and NO behavioural assertion could have run. These DOMINATE
// (a stray "expected" in surrounding noise cannot outrank "Cannot find module").

// (a) module-system / resolution mismatch — the CJS-in-ESM class (the incident's first
//     death: `require('./ChoiceEdge')` in a Vite/ESM project → "Cannot find module").
const MODULE_LOAD = [
  /Cannot find module/i,
  /Cannot use import statement outside a module/i,
  /\brequire is not defined\b/i,
  /\bERR_REQUIRE_ESM\b/,
  /\bERR_MODULE_NOT_FOUND\b/,
  /Must use import to load ES Module/i,
  /Unexpected token 'export'/i,
  /Directory import .* is not supported resolving ES modules/i,
  /Failed to resolve (import|module)/i,
  /Failed to load url/i, // Vite/Vitest resolution failure
];

// (b) export-shape mismatch — imported the wrong shape (named vs default), so the
//     symbol is undefined (the incident's second death: `{ ChoiceEdgeComponent }`
//     against `export default memo(...)` → React "Element type is invalid").
const EXPORT_SHAPE = [
  /Element type is invalid/i,
  /is not a constructor/i,
  /(default export|export named '.*') (is|was) not found/i,
  /does not provide an export named/i,
  /No "?default"? export/i,
];

// ELEMENT-NOT-FOUND: the unit rendered, but the test could not LOCATE the element it
// must observe — the DOM handle (testid/role) the clause needs is missing or undeclared
// (the incident's third death: queried `[data-waypoint]`/`[role=slider]` against a
// transform-positioned div / a portalled badge). The query IS the failing assertion, so
// there is no separate behavioural mismatch to defer to.
const ELEMENT_NOT_FOUND = [
  /Unable to find an? (element|label|role|test ?id|accessible element)/i,
  /TestingLibraryElementError/,
  /Unable to find an element by:/i,
  /\bgetBy\w+\b[\s\S]{0,40}\b(no|0)\b[\s\S]{0,20}element/i,
];

// BEHAVIOUR mismatch: a real assertion executed and disagreed with the contract. These
// must NOT be swallowed as seam failures — they are the adjudicator's to judge against
// the contract (impl-violates-contract vs test-mistranslates-a-clause). Protecting this
// boundary is acceptance criterion 4 ("the adjudicator still independently re-judges").
const BEHAVIOR = [
  /AssertionError/,
  /Expected:[\s\S]{0,120}?Received:/,
  /expect\(received\)\./i,
  /\bexpected\b[\s\S]{0,80}?\b(to (be|equal|deeply equal|match|contain|have|throw)|received)\b/i,
  /\bto (be|equal|deeply equal) but (got|received)\b/i,
];

// PREMISE / SETUP failure: the test raised a NON-ASSERTION exception while ESTABLISHING
// its scenario (an arrange/fixture step), because the premise is UNREALIZABLE in the real
// system — a persistence/DB constraint the product enforces BY DESIGN (a foreign-key /
// unique / not-null / check violation), or an equivalent setup error. No behavioural
// assertion ran; the test's PREMISE never held. This is neither impl-violates nor a render
// seam: the blind-test-writer built a scenario the system forbids, so the resolution is a
// bounded blind REDO with a REALIZABLE premise (and, if the cited clause NAMES the forbidden
// state, a contract clarification) — never a human intent-fork by default. A REAL assertion
// (BEHAVIOR) DOMINATES: a constraint error the test ASSERTED FOR (pytest.raises / expect
// throws) surfaces as a passing/behaviour case, not here — so this set is consulted only
// AFTER behaviour, and the adjudicator still confirms the exception ORIGINATED in the test's
// own arrange (premise defect) vs the implementation under test (an impl bug).
const PREMISE = [
  /\bIntegrityError\b/,
  /FOREIGN KEY constraint failed/i,
  /UNIQUE constraint failed/i,
  /NOT NULL constraint failed/i,
  /CHECK constraint failed/i,
  /violates (foreign key|unique|not-null|not null|check) constraint/i, // postgres phrasing
  /\bConstraintViolation\b/i,
  /duplicate key value violates/i,
];

function matched(text, set) {
  const hits = [];
  for (const re of set) { const m = re.exec(text); if (m) hits.push(m[0].slice(0, 120)); }
  return hits;
}

/**
 * Classify a suite-failure text. Returns:
 *   { kind: 'seam' | 'behavior' | 'unknown',
 *     subkind: 'module-load' | 'export-shape' | 'element-not-found' | null,
 *     signals: [matched snippet, ...],
 *     hint: <one-line remediation> }
 *
 * `kind:'seam'` => the OUTCOME the adjudicator emits is `seam-undeclared` (a deterministic
 * route to enrich `## Observable Seams` + have the implementer expose the handle), NOT a
 * blind test redo. `kind:'behavior'` => an ordinary red the adjudicator judges against the
 * contract. The precedence (load-time dominates; a real assertion outranks a bare
 * missing-handle; missing-handle alone is a seam) is the AC-4 safety property.
 */
export function classifyFailure(text) {
  const t = String(text || '');
  const ml = matched(t, MODULE_LOAD);
  const es = matched(t, EXPORT_SHAPE);
  const bh = matched(t, BEHAVIOR);
  const pr = matched(t, PREMISE);
  const en = matched(t, ELEMENT_NOT_FOUND);

  // 1. Load-time death dominates — no assertion could have run.
  if (ml.length) {
    return { kind: 'seam', subkind: 'module-load', signals: ml,
      hint: 'Module did not load. Follow the repo TEST CONVENTIONS (.reasonable/test-conventions.md): use the declared module system (e.g. ESM `import`, never CJS `require`) and runner — do not guess.' };
  }
  if (es.length) {
    return { kind: 'seam', subkind: 'export-shape', signals: es,
      hint: 'Imported symbol is undefined (wrong export shape). Import via the EXPORT declared in the contract `## Observable Seams` (e.g. the default export), and the implementer must expose that shape.' };
  }
  // 2. A real assertion disagreed — the adjudicator judges it against the contract. This
  //    DOMINATES a premise signal: a constraint error the test asserted for is behaviour.
  if (bh.length) {
    return { kind: 'behavior', subkind: null, signals: bh,
      hint: 'A behavioural assertion ran and disagreed with the contract. Judge it as usual (impl violates contract vs test mistranslates a clause) — this is NOT a seam problem.' };
  }
  // 3. A NON-assertion setup exception from a system constraint — the test could not even
  //    ESTABLISH its scenario because the premise is unrealizable (a FK/unique/not-null/check
  //    the product enforces by design). Route a bounded blind REDO with a realizable premise,
  //    not a human intent-fork — but the adjudicator must confirm the exception originated in
  //    the test's own ARRANGE (premise defect) rather than the implementation under test.
  if (pr.length) {
    return { kind: 'premise', subkind: 'constraint-violation', signals: pr,
      hint: 'A system-constraint exception fired while establishing the test scenario, with no behavioural assertion — the test premise is likely UNREALIZABLE (the product forbids that persisted state by design). Confirm the exception originated in the test ARRANGE (not the implementation under test); if so, route a bounded blind REDO with a realizable premise for the SAME clause (e.g. use a persistable brokenness the schema allows), and if the clause NAMES the forbidden state flag a contract clarification. If it originated in the implementation, it is an impl bug.' };
  }
  // 4. The unit rendered but the observation handle was missing/undeclared.
  if (en.length) {
    return { kind: 'seam', subkind: 'element-not-found', signals: en,
      hint: 'Element not found. Query a STABLE handle declared in the contract `## Observable Seams` (a `data-testid`/`role`), and the implementer must expose it in the DOM — do not query an incidental attribute.' };
  }
  return { kind: 'unknown', subkind: null, signals: [],
    hint: 'No seam or assertion signature recognized; judge the red against the contract as usual.' };
}

// ── CLI ──────────────────────────────────────────────────────────────────────────
// Run only when invoked directly (not when imported by a test). A classifier is not a
// gate, so it always exits 0; the verdict is the JSON `kind`, read by the adjudicator.
const invokedDirectly = (() => {
  try { return import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('seam.mjs'); }
  catch { return false; }
})();

if (invokedDirectly && process.argv.includes('--classify')) {
  const argv = process.argv;
  const logFlag = argv.indexOf('--log');
  const asJson = argv.includes('--json');
  let text = '';
  if (logFlag !== -1 && argv[logFlag + 1]) {
    text = readFileSync(argv[logFlag + 1], 'utf8');
  } else {
    try { text = readFileSync(0, 'utf8'); } catch { text = ''; } // stdin (fd 0)
  }
  const verdict = classifyFailure(text);
  if (asJson) { console.log(JSON.stringify(verdict, null, 2)); }
  else {
    console.log(`kind: ${verdict.kind}${verdict.subkind ? ` (${verdict.subkind})` : ''}`);
    console.log(`hint: ${verdict.hint}`);
    if (verdict.signals.length) console.log(`signals:\n  - ${verdict.signals.join('\n  - ')}`);
  }
  process.exit(0);
}
