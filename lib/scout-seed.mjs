// lib/scout-seed.mjs — the genesis-seed grammar (reasonable 3.0 Part 8, DESIGN-3.0 §17, §13).
//
// The SCOUT (§17) is the zero-commit pre-effort exploration surface. On convergence it writes a
// `seed.json` — a draft charter set + goals sketch that seeds a later effort's genesis graph. The seed
// is STRUCTURE ONLY (§13): its draft charters carry exactly the charter fields (component / premises /
// purpose / locus / order) and NO Delta/clause/behavioral slot. This module is the mechanical answer to
// §15 open edge (d): validateSeedShape rejects any draft charter with a field outside the five, using
// lib/atom.mjs's exact charter grammar (validateCharterShape) so the seed is charter-shaped by
// construction. The one residual — a behavioral must smuggled into the free-prose `purpose` — is NOT
// caught here (it is identical to §13's own boundary for real charters) and is backstopped by the
// topologist's structure-only membrane + the human genesis gate. See the P8 design doc.
//
// NOT `.reasonable/` state: the scout writes no effort state. seed.json lives in the scout's disposable
// workspace and is a PRE-EFFORT input the human carries into `reasonable:develop`; it becomes ratified
// goals.json/policy.json only through the normal human-gated genesis gate.
//
// Law 1 (dependency-free): node builtins only + the relative atom.mjs import. Loader shape modeled on
// lib/policy.mjs: absent -> {null,null}; malformed -> {null,diagnostic}; valid -> {parsed VERBATIM,null}.

import { existsSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { validateCharterShape } from './atom.mjs';

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// The ONLY keys a draft charter may carry — the structure-only fence. Any extra key is a behavioral
// slot the seed must not carry (a charter has no room for a Delta or a clause, §13).
const ALLOWED_CHARTER_KEYS = new Set(['component', 'premises', 'purpose', 'locus', 'order']);

/**
 * Parse a seed.json off disk. Validates JSON well-formedness ONLY, never structure-only-ness — that is
 * validateSeedShape's job (separation of parse from fence). Returns the parsed value VERBATIM on
 * success (a well-formed-but-wrong seed loads clean and is caught by validateSeedShape).
 * @returns {{ seed: unknown | null, diagnostic: string | null }}
 */
export function readSeed(seedPath) {
  if (!existsSync(seedPath)) return { seed: null, diagnostic: null };
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(seedPath, 'utf8'));
  } catch (e) {
    return { seed: null, diagnostic: `seed.json: invalid JSON — ${(e && e.message) || String(e)}` };
  }
  return { seed: parsed, diagnostic: null };
}

/**
 * The structure-only fence (§13, the answer to open edge (d)). Accepts a seed shaped
 * { goalsSketch: [{id, scenario, notes?}], draftCharters: [{component,premises,purpose,locus,order}] }.
 * Rejects any draft charter carrying a key outside the five, and validates the five with the exact
 * charter grammar (lib/atom.mjs's validateCharterShape). draftCharters may be empty (a goals-only
 * sketch is a legitimate seed).
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateSeedShape(parsed) {
  const errors = [];
  if (!isPlainObject(parsed)) return { ok: false, errors: ['seed: expected a JSON object'] };

  const { goalsSketch, draftCharters } = parsed;

  if (!Array.isArray(goalsSketch)) {
    errors.push('seed: "goalsSketch" must be an array of { id, scenario, notes? }');
  } else {
    goalsSketch.forEach((g, i) => {
      if (!isPlainObject(g) || typeof g.id !== 'string' || g.id.length === 0 ||
          typeof g.scenario !== 'string' || g.scenario.length === 0) {
        errors.push(`seed: goalsSketch[${i}] must have a non-empty string id and scenario`);
      }
    });
  }

  if (!Array.isArray(draftCharters)) {
    errors.push('seed: "draftCharters" must be an array (possibly empty)');
  } else {
    draftCharters.forEach((c, i) => {
      if (!isPlainObject(c)) { errors.push(`seed: draftCharters[${i}] must be an object`); return; }
      // Structure-only fence: reject any key outside the five charter fields (no Delta/clause/behavior).
      const extra = Object.keys(c).filter((k) => !ALLOWED_CHARTER_KEYS.has(k));
      if (extra.length) {
        errors.push(`seed: draftCharters[${i}] carries non-charter key(s) [${extra.join(', ')}] — a charter is STRUCTURE ONLY (§13); behavior is born at a gate, never in a charter`);
        return;
      }
      const shape = validateCharterShape(c);
      if (!shape.ok) errors.push(`seed: draftCharters[${i}] — ${shape.error}`);
    });
  }

  return { ok: errors.length === 0, errors };
}

// Guarded CLI (mirrors lib/policy.mjs / lib/ledger.mjs — never the unguarded top-level exit() that was
// lib/footprint.mjs's latent bug). `node lib/scout-seed.mjs --validate <path>` -> exit 0 valid / 1 not.
// This is the command the scout skill runs at harvest (the trusted control plane validating the
// producer's output — not the producer grading itself).
if (basename(process.argv[1] || '') === 'scout-seed.mjs') {
  const args = process.argv.slice(2);
  const i = args.indexOf('--validate');
  if (i === -1 || !args[i + 1]) {
    console.error('usage: node lib/scout-seed.mjs --validate <seed.json>');
    process.exit(2);
  }
  const { seed, diagnostic } = readSeed(args[i + 1]);
  if (diagnostic) { console.error(diagnostic); process.exit(1); }
  if (seed === null) { console.error(`seed.json not found: ${args[i + 1]}`); process.exit(1); }
  const { ok, errors } = validateSeedShape(seed);
  if (ok) { console.log('seed.json: structure-only OK ✓'); process.exit(0); }
  console.error('seed.json: NOT structure-only:\n  ' + errors.join('\n  '));
  process.exit(1);
}
