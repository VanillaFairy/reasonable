// lib/ownership.mjs — the pure loader for `.reasonable/ownership.json` (reasonable 3.0 A1).
//
// ownership.json is the ratified component -> subeffort-path map: the topologist's genesis output #3
// (DESIGN-3.0 §2.1, §5.1). Each key is a component name; each value is a slash-delimited subeffort path
// string. lib/graph.mjs's `containmentTree` consumes it as `ownershipMap` to nest each atom under its
// `component -> subeffort` containment path (the Gap-D id-duality collapse) instead of rendering flat.
// A component absent from the map falls back to its bare name — the flat degenerate placement.
//
// Law 1 (dependency-free): node builtins only — no imports beyond node:fs/node:path.
//
// CONSERVATIVE BY DESIGN, modeled EXACTLY on lib/goals.mjs's readGoals:
//   - absent ownership.json  -> { ownership: null, diagnostic: null }   (a pre-genesis effort state)
//   - present but malformed  -> { ownership: null, diagnostic: '<reason>' }  (never a repair, never a
//                              partial trust — ONE bad entry fails the WHOLE load)
//   - valid                  -> { ownership: { ...verbatim }, diagnostic: null }
// It is vision-class (the topologist proposes it; the human ratifies; the genesis-writer persists it) —
// A1 builds the LOADER; the writer is the genesis-writer agent.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * @param {string} effortRoot
 * @returns {{ ownership: { [component: string]: string } | null, diagnostic: string | null }}
 */
export function readOwnership(effortRoot) {
  const path = join(effortRoot, '.reasonable', 'ownership.json');
  if (!existsSync(path)) return { ownership: null, diagnostic: null };

  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    return { ownership: null, diagnostic: `ownership.json: invalid JSON — ${(e && e.message) || String(e)}` };
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ownership: null, diagnostic: 'ownership.json: expected a JSON object mapping component -> subeffort-path' };
  }

  for (const [component, path_] of Object.entries(parsed)) {
    if (typeof path_ !== 'string' || path_.length === 0) {
      return { ownership: null, diagnostic: `ownership.json: "${component}" must map to a non-empty string (a subeffort path)` };
    }
  }

  return { ownership: parsed, diagnostic: null };
}
