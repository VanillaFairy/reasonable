// route.mjs — the pure loader for `.reasonable/route.json` (the machine twin of `route.md`).
//
// route.json carries ONLY the ratified vertical-slice ORDER — the forward frontier the deterministic
// `nextAction` projection (Layer 2, `lib/next-action.mjs`, T2.2+) will read next. WO->slice membership
// stays on each work-order spec's own `verticalSlice` field; route.json never restates it. `route.md`
// is unaffected by this artifact — it stays human narration, never parsed.
// (docs/superpowers/plans/effort-discovery/shared/interfaces.md §T2.1 pins this grammar; the
// docs/artifacts.md `*` entry is T2.doc's to add.)
//
// Law 1 (dependency-free): node builtins only — no imports beyond node:fs/node:path.
//
// CONSERVATIVE BY DESIGN: an absent route.json is a legitimate pre-Layer-2 (or pre-ratification)
// effort state, never an error — `{ route: null, diagnostic: null }`. A PRESENT-but-malformed file is a
// real diagnostic the caller should surface, but readRoute never repairs, defaults, or partially trusts
// a broken shape — `{ route: null, diagnostic: '<reason>' }`. It never fabricates a slice order.
//
// Modeled on lib/effort.mjs's effortBirthState: existsSync + a guarded JSON.parse distinguishes
// "absent" from "present but corrupt" — a plain readJson() swallows both into the same null and would
// lose that distinction here, where the caller needs to tell "no route yet" from "a broken route".

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Read and validate `.reasonable/route.json` at `effortRoot`.
 *
 * @param {string} effortRoot
 * @returns {{ route: {slices:string[], ratifiedAt:string|null, ledgerSeq:number|null} | null,
 *             diagnostic: string | null }}
 *
 * - Absent file -> `{ route: null, diagnostic: null }` (forward-compat: a pre-route.json effort briefs
 *   without a frontier, never crashes).
 * - Present but invalid — not a JSON object, or `slices` missing / not an array of non-empty strings —
 *   -> `{ route: null, diagnostic: '<reason>' }`. Never a partial repair.
 * - Valid -> `{ route: {slices, ratifiedAt, ledgerSeq}, diagnostic: null }`, `slices` in on-disk order,
 *   unmodified. `ratifiedAt`/`ledgerSeq` are carried through when well-typed, else degrade to `null`
 *   (never fabricated) without invalidating an otherwise-valid `slices` order.
 */
export function readRoute(effortRoot) {
  const path = join(effortRoot, '.reasonable', 'route.json');
  if (!existsSync(path)) return { route: null, diagnostic: null };

  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    return { route: null, diagnostic: `route.json: invalid JSON — ${(e && e.message) || String(e)}` };
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { route: null, diagnostic: 'route.json: expected a JSON object' };
  }

  const { slices, ratifiedAt, ledgerSeq } = parsed;
  if (!Array.isArray(slices) || !slices.every((s) => typeof s === 'string' && s.length > 0)) {
    return { route: null, diagnostic: 'route.json: "slices" must be an array of non-empty strings' };
  }

  return {
    route: {
      slices,
      ratifiedAt: typeof ratifiedAt === 'string' ? ratifiedAt : null,
      ledgerSeq: Number.isFinite(ledgerSeq) ? ledgerSeq : null,
    },
    diagnostic: null,
  };
}
