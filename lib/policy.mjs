// lib/policy.mjs — the pure loader for `.reasonable/policy.json` (reasonable 3.0 Part 6d).
//
// policy.json is the machine-parsed twin of the ratified priority policy (DESIGN-3.0 §3, §9): the
// priority `weights`, the pinned `legibility` thresholds the legibility law (Part 6b) reads, the
// band-indexed `cadence` floor (Part 7's gate cadence), and the ceremony-sizing `dials` (Part 6c's
// classifier reads; P5's rewrite.mjs already indexOf-s into `dials.bandScale`). It is a VISION-CLASS
// enforcement path — human-gated, agent-unwritable; P6d builds the LOADER, never the writer (P7's).
//
// Law 1 (dependency-free): node builtins only — node:fs/node:path.
//
// CONSERVATIVE BY DESIGN, modeled on lib/route.mjs's readRoute:
//   - absent policy.json    -> { policy: null, diagnostic: null }
//   - present but malformed  -> { policy: null, diagnostic: '<reason>' }   (never a repair)
//   - valid                  -> { policy: <parsed object, UNMODIFIED>, diagnostic: null }
// The loader validates SHAPE, never VALUE (§16): a mistuned-but-well-formed policy loads clean and is
// the human's to tune. Unlike route.mjs (whose grammar is CLOSED, so it projects to a fixed subset),
// policy.json's grammar is OPEN ({ weights, legibility, cadence, dials, … }); the loader therefore
// returns the parsed object VERBATIM on success, so `…` extras + any ratification metadata survive.
// (Flagged, deliberate divergence — see the plan's "Flagged calls".) The concrete keys r8Retries /
// cadence.<band>.{n,m} / dials.{bandScale,phaseCutoffs,cadenceIndex} are P6d-coined (the design pinned
// the ROLE, not the key); a rename is a one-line change since the loader gates shape, not value.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const allFiniteNumbers = (obj) => Object.values(obj).every((v) => Number.isFinite(v));

/**
 * @param {string} effortRoot
 * @returns {{ policy: object | null, diagnostic: string | null }}
 */
export function readPolicy(effortRoot) {
  const path = join(effortRoot, '.reasonable', 'policy.json');
  if (!existsSync(path)) return { policy: null, diagnostic: null };

  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    return { policy: null, diagnostic: `policy.json: invalid JSON — ${(e && e.message) || String(e)}` };
  }

  if (!isPlainObject(parsed)) {
    return { policy: null, diagnostic: 'policy.json: expected a JSON object' };
  }

  const { weights, legibility, cadence, dials } = parsed;

  // weights — a non-empty object of finite-number priority weights (axis key set NOT pinned).
  if (!isPlainObject(weights) || Object.keys(weights).length === 0 || !allFiniteNumbers(weights)) {
    return { policy: null, diagnostic: 'policy.json: "weights" must be a non-empty object of finite-number priority weights' };
  }

  // legibility — the four pinned thresholds the legibility law (Part 6b) reads by name.
  if (!isPlainObject(legibility) ||
      !['maxWidth', 'maxTangle', 'maxChain', 'r8Retries'].every((k) => Number.isFinite(legibility[k]))) {
    return { policy: null, diagnostic: 'policy.json: "legibility" must carry finite numbers maxWidth, maxTangle, maxChain, r8Retries' };
  }

  // cadence — the band-indexed N/M gate-cadence floor: each band -> { n, m } finite numbers.
  if (!isPlainObject(cadence) || Object.keys(cadence).length === 0 ||
      !Object.values(cadence).every((v) => isPlainObject(v) && Number.isFinite(v.n) && Number.isFinite(v.m))) {
    return { policy: null, diagnostic: 'policy.json: "cadence" must map each band to a { n, m } pair of finite numbers' };
  }

  // dials — the ceremony-sizing dials. bandScale is load-bearing (P5's ceremonyEscalation indexOf-s
  // into it; P6c's classify emits from it): an ordered, non-empty array of band-name strings. The
  // band->cutoff maps are validated as objects only (their per-band value shapes are P6c/P7's to read).
  if (!isPlainObject(dials) ||
      !Array.isArray(dials.bandScale) || dials.bandScale.length === 0 ||
      !dials.bandScale.every((b) => typeof b === 'string' && b.length > 0)) {
    return { policy: null, diagnostic: 'policy.json: "dials.bandScale" must be a non-empty array of band-name strings' };
  }
  if (!isPlainObject(dials.phaseCutoffs) || !isPlainObject(dials.cadenceIndex)) {
    return { policy: null, diagnostic: 'policy.json: "dials.phaseCutoffs" and "dials.cadenceIndex" must be band-keyed objects' };
  }

  return { policy: parsed, diagnostic: null };
}
