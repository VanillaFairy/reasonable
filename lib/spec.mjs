// lib/spec.mjs — the spec-stage decidable fences + delta persistence (DESIGN-3.0 §4.1, §4.3, §6, §7.2).
//
// Two decidable fences, both PURE (no I/O beyond the ledger read liveBlastRadii needs):
//   • cohesionVerdict — DESIGN-3.0 §4.3's minimality/cohesion law: does a delta's clause set form
//     ONE connected component of the cohesion graph (lib/atom.mjs's cohesionComponents), or does it
//     split into an oversized, multi-cluster delta (the R4 split payload)?
//   • checkpoint2 — DESIGN-3.0 §7.2's spec-time guard: does the delta's citation closure land inside
//     a LIVE blast radius (a component a prior R2 dead-end retired atoms out from under)? A hit HALTs
//     unless the atom's own lineage traces back to the R2 gate that opened the radius, in which case
//     it proceeds WITH the hit injected (advisory, never silently dropped).
//
// reasonable 3.0 A2/A3 boundary: liveBlastRadii here returns the full LIVE (still-open) radius set —
// empty at greenfield genesis, since no atom-verdict events exist yet. The §7.2 radius ARCHIVAL
// lifecycle (a radius closing when its remediation amendment batch lands) rides A3's verdict->state
// fold, not this file.
//
// CLI (GUARDED — mirrors lib/footprint.mjs's `if (basename(process.argv[1]||'')==='…') runCli()`
// shape, so importing this file never runs the CLI body or exits the host process):
//   node spec.mjs --author --root <effortRoot> --atom <id> --clauses <file.json>
//   node spec.mjs --guard  --root <effortRoot> [--json] [atomId ...]   # default: every chartered atom

import { readFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { cohesionComponents, authorDelta, foldAtoms } from './atom.mjs';
import { citationClosure } from './contract.mjs';
import { readJsonl, rootFromArgv, argvWithoutRoot } from './effort.mjs';

// Thin fallback until component ownership (docs/artifacts.md's ownership.json) is wired into this
// path — every component's contract root is assumed to live at lib/<component>.
const COMPONENT_ROOT = (component) => `lib/${component}`;

export function cohesionVerdict(atom, componentRoot) {
  const partition = cohesionComponents(atom.deltaClauses || [], componentRoot);
  if (partition.length <= 1) return { kind: 'ok' };
  return { kind: 'oversized', partition };
}

export function checkpoint2(closure, radii, { lineageExempt = false } = {}) {
  const radiiSet = new Set(radii || []);
  const hit = [...new Set((closure || []).filter((c) => radiiSet.has(c)))].sort();
  if (hit.length === 0) return { kind: 'ok' };
  if (lineageExempt) return { kind: 'ok', injected: hit };
  return { kind: 'guard-halted', hit };
}

export function liveBlastRadii(effortRoot) {
  const events = readJsonl(join(effortRoot, '.reasonable', 'ledger.jsonl'));
  const radii = new Set();
  for (const e of events) {
    for (const eff of (e && e.effects) || []) {
      const r = eff && eff.change && eff.change.blastRadius;
      if (Array.isArray(r)) for (const c of r) radii.add(c);
    }
  }
  return [...radii].sort();
}

// Returns `closure` alongside the two verdicts so a later footprinter (A3+) can reuse the already-
// computed citation closure instead of recomputing it.
function guardOne(effortRoot, atom, radii) {
  const root = COMPONENT_ROOT(atom.component);
  const cohesion = cohesionVerdict(atom, root);
  const seeds = [atom.component, ...(atom.deltaClauses || []).flatMap(
    (cl) => (cl.citations || []).map((ci) => ci.component))];
  const closure = citationClosure(effortRoot, [...new Set(seeds)]);
  // A3 territory: lib/atom.mjs's atom record does not carry a `lineage` field yet (it is written by
  // lib/rewrite.mjs's R2 remediation effects onto sub-atom charters). Reading it here is forward-
  // compatible and harmless today — every atom folds lineageExempt:false until that wiring lands.
  const lineageExempt = typeof atom.lineage === 'string' && atom.lineage.startsWith('R2');
  const cp2 = checkpoint2(closure, radii, { lineageExempt });
  return { atomId: atom.id, cohesion, closure, checkpoint2: cp2 };
}

// ── the CLI (GUARDED — see the file header) ─────────────────────────────────────────────────

function runCli() {
  const argv = argvWithoutRoot(process.argv).slice(2);
  const effortRoot = rootFromArgv(process.argv, process.cwd());
  if (!effortRoot) {
    console.error('spec: no effort (.reasonable/) found (pass --root <effortRoot> or run from inside the effort).');
    process.exit(1);
  }

  if (argv.includes('--author')) {
    const atomId = argv[argv.indexOf('--atom') + 1];
    const clausesFile = argv[argv.indexOf('--clauses') + 1];
    const clauses = JSON.parse(readFileSync(clausesFile, 'utf8'));
    const r = authorDelta(effortRoot, atomId, clauses);
    if (!r.ok) { console.error(r.error); process.exit(1); }
    console.log(JSON.stringify({ ok: true, atomId }));
    process.exit(0);
  }

  if (argv.includes('--guard')) {
    const asJson = argv.includes('--json');
    const ids = argv.filter((a) => !a.startsWith('--')); // bare args are the atom ids
    const atoms = Object.values(foldAtoms(effortRoot)).filter((a) => ids.length === 0 || ids.includes(a.id));
    const radii = liveBlastRadii(effortRoot);
    const out = atoms.map((a) => guardOne(effortRoot, a, radii));
    if (asJson) {
      console.log(JSON.stringify({ atoms: out }, null, 2));
    } else {
      for (const a of out) {
        console.log(`\n${a.atomId}`);
        console.log(`  cohesion:    ${a.cohesion.kind}`);
        console.log(`  checkpoint2: ${a.checkpoint2.kind}`);
      }
    }
    process.exit(0);
  }

  console.error('spec: expected --author or --guard');
  process.exit(1);
}

if (basename(process.argv[1] || '') === 'spec.mjs') {
  runCli();
}
