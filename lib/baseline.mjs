// baseline.mjs — the regression-floor record for a brownfield effort (BF3/BF8).
//
// `.reasonable/baseline.json` is the on-disk partition of an existing test suite
// into the three trust statuses of §18:
//   - FLOOR   — pre-tested legacy behaviour. Earns zero correctness credit, but
//               breaking it is a forbidden regression, so it is held green as a
//               containment fence. Each floor test carries a captured locus
//               (a conservative file-glob over-approximation) and a fileHash.
//   - TRUSTED — adversarially-checked, earned, persistent. (A floor test is
//               promoted into here ONE AT A TIME via a characterization-promotion.)
//
// This module is the single reader/writer of that record, plus the two derived
// computations the rest of the engine needs:
//   - floorLociUnion()  — the union of floor loci, which the fence treats like a
//                         declared locus (BF8: an undeclared src edit intersecting
//                         it is denied unless the lane declares `floorImpact`).
//   - floorIntegrity()  — the reconcile pass (BF8): per-floor-test fileHash vs.
//                         the file's current hash. A changed floor file that no
//                         accounted event explains is AMBIGUOUS → the caller HALTs.
//
// Pure node (fs/crypto), no third-party deps — matches the rest of lib/*.mjs and
// keeps the engine runnable wherever node runs. Fails OPEN: a missing or
// unparseable baseline is an empty floor (so a greenfield effort is a no-op, and
// the §1–17 path is untouched, per "one foundation, both ends").

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { readJson, readJsonl, norm, matchesAny, globToRegExp } from './effort.mjs';

/** Path to the baseline record under an effort root. */
function baselinePath(effortRoot) {
  return join(effortRoot, '.reasonable', 'baseline.json');
}

/**
 * Read the baseline record for an effort.
 *
 * Returns `{ floor: [{id, locus, fileHash}], trusted: [...] }` — always both
 * arrays, even when the file is absent or malformed (fail-open empty floor). The
 * shape is normalized so every consumer (census, fence, reconcile) sees the same
 * thing regardless of how the file was written.
 *
 *   - `floor`   : the FLOOR partition. Each entry is `{id, locus, fileHash}`,
 *                 where `locus` is an array of file globs (over-approximation),
 *                 and `fileHash` maps each glob-expanded source file the test
 *                 pins to its sha256 at the time of capture. See writeBaseline
 *                 for the canonical entry shape.
 *   - `trusted` : test ids promoted out of the floor into the trusted set
 *                 (initially empty; grown one-at-a-time by characterization-
 *                 promotion). Passed through verbatim.
 */
export function readBaseline(effortRoot) {
  const raw = effortRoot ? readJson(baselinePath(effortRoot)) : null;
  if (!raw || typeof raw !== 'object') return { floor: [], trusted: [] };
  return {
    floor: normalizeFloor(raw.floor),
    trusted: Array.isArray(raw.trusted) ? raw.trusted : [],
  };
}

/** Coerce a stored floor array into the canonical `{id, locus, fileHash}` shape. */
function normalizeFloor(floor) {
  if (!Array.isArray(floor)) return [];
  return floor
    .filter((t) => t && typeof t === 'object')
    .map((t) => ({
      id: String(t.id ?? ''),
      // locus is always an array of globs; tolerate a single-string locus.
      locus: Array.isArray(t.locus) ? t.locus.map(norm) : (t.locus ? [norm(t.locus)] : []),
      // fileHash maps each pinned source file (normalized rel path) -> sha256 hex.
      fileHash: t.fileHash && typeof t.fileHash === 'object' ? { ...t.fileHash } : {},
    }))
    .filter((t) => t.id);
}

/**
 * Atomically write the baseline record (temp file + rename — never a partial
 * file even on crash mid-write). The record is normalized before writing so the
 * file on disk is always canonical.
 *
 * `record` may be a full `{floor, trusted}` or a bare floor array (convenience
 * for the census, which produces the floor partition).
 */
export function writeBaseline(effortRoot, record) {
  const rec = Array.isArray(record) ? { floor: record, trusted: [] } : (record || {});
  const out = {
    floor: normalizeFloor(rec.floor),
    trusted: Array.isArray(rec.trusted) ? rec.trusted : [],
  };
  const final = baselinePath(effortRoot);
  const tmp = join(dirname(final), `.baseline.json.tmp-${process.pid}`);
  writeFileSync(tmp, JSON.stringify(out, null, 2) + '\n');
  renameSync(tmp, final); // atomic on a single filesystem
  return out;
}

/**
 * sha256 (hex) of a file's contents. Returns null if the file is missing or
 * unreadable — a deleted floor source surfaces as a hash MISMATCH in
 * floorIntegrity (null !== captured), which is exactly the AMBIGUOUS signal we
 * want, not a silent pass.
 */
export function fileHashOf(path) {
  try {
    return createHash('sha256').update(readFileSync(path)).digest('hex');
  } catch {
    return null;
  }
}

/**
 * The union of all floor loci, as a flat, de-duplicated array of globs.
 *
 * The fence treats this like one declared locus (BF8): an undeclared src edit
 * that intersects any of these is denied unless the lane declares `floorImpact`.
 * Conservative over-approximation is fine and intended — a wider union only ever
 * asks for one extra declaration; it never lets a regression through.
 */
export function floorLociUnion(baseline) {
  const b = baseline && baseline.floor ? baseline : { floor: normalizeFloor(baseline) };
  const seen = new Set();
  for (const t of b.floor || []) for (const g of t.locus || []) if (g) seen.add(g);
  return [...seen];
}

/**
 * The set of source files a floor entry pins, for integrity checking. We use the
 * fileHash map's keys (the exact files captured at baseline time) as the
 * authoritative file list — the locus globs are an over-approximation for the
 * fence, but integrity must be checked against the concrete files that were
 * hashed, so a glob widening later doesn't spuriously flag every match.
 */
function pinnedFiles(entry) {
  return Object.keys(entry.fileHash || {});
}

/**
 * Per-floor-test integrity check (BF8 reconcile pass).
 *
 * For each floor test, re-hash every pinned source file and compare to the
 * captured hash. Returns one result per floor test:
 *
 *   { id, locus, files: [{ path, currentHash, expectedHash, changed }],
 *     changed, accounted, ambiguous }
 *
 *   - `changed`   : true if ANY pinned file's current hash differs from capture
 *                   (a missing file hashes to null, which counts as changed).
 *   - `accounted` : true if an accounted ledger event explains a change to this
 *                   test's locus — a `characterization-promotion` or
 *                   `change-characterized[-planned]` naming this test/locus, or a
 *                   declared `floorImpact` (scope-expansion) touching the locus.
 *   - `ambiguous` : `changed && !accounted` — an UNACCOUNTED floor change. The
 *                   reconcile caller treats any ambiguous result as HALT (floor
 *                   integrity is a test-set property, distinct from the
 *                   commit-only D8b partition).
 *
 * This is a *stable* invariant: it compares captured state to current state on
 * disk, so it is correct every session with no reliance on the in-session cache.
 */
export function floorIntegrity(effortRoot) {
  const baseline = readBaseline(effortRoot);
  const accounted = accountedLoci(effortRoot);
  return baseline.floor.map((entry) => {
    const files = pinnedFiles(entry).map((rel) => {
      const expectedHash = entry.fileHash[rel] ?? null;
      const currentHash = fileHashOf(join(effortRoot, rel));
      return { path: rel, currentHash, expectedHash, changed: currentHash !== expectedHash };
    });
    const changed = files.some((f) => f.changed);
    const isAccounted = changed && locusIsAccounted(entry, accounted);
    return {
      id: entry.id,
      locus: entry.locus,
      files,
      changed,
      accounted: isAccounted,
      ambiguous: changed && !isAccounted,
    };
  });
}

/**
 * Gather, from the ledger, every locus glob whose change has been ACCOUNTED for —
 * i.e. some event explains why a floor file under it may legitimately differ from
 * its captured hash. We over-approximate by collecting glob/path hints from the
 * three accounted event kinds; an unrecognized event contributes nothing, so the
 * default is "unaccounted" (the safe direction — a stray change stays AMBIGUOUS).
 */
function accountedLoci(effortRoot) {
  const ledger = readJsonl(join(effortRoot, '.reasonable', 'ledger.jsonl'));
  const ids = new Set();   // floor test ids whose change is accounted (promotion/supersession)
  const globs = new Set(); // loci/paths an event declared as legitimately touched
  for (const e of ledger) {
    if (!e || typeof e !== 'object') continue;
    const isAccountedKind =
      e.type === 'characterization-promotion' ||
      e.type === 'change-characterized' ||
      e.type === 'change-characterized-planned';
    const isFloorImpact = e.type === 'scope-expansion' && e.floorImpact;
    if (!isAccountedKind && !isFloorImpact) continue;
    // Test ids this event accounts for (a promotion/supersession of a named test).
    for (const k of ['test', 'floorTest', 'supersedes']) addAll(ids, e[k]);
    if (Array.isArray(e.tests)) for (const t of e.tests) ids.add(String(t));
    // Loci/paths this event declares as legitimately touched.
    for (const k of ['locus', 'seam', 'addedLocus', 'floorImpact', 'paths']) addAll(globs, e[k]);
  }
  return { ids, globs };
}

/** Add a string, or each string of an array, into a Set (skips falsy/non-strings). */
function addAll(set, v) {
  if (v == null) return;
  if (Array.isArray(v)) { for (const x of v) if (typeof x === 'string' && x) set.add(norm(x)); return; }
  if (typeof v === 'string' && v) set.add(norm(v));
}

/**
 * Is this floor entry's change accounted for? Either the test is named directly
 * in an accounting event, or one of its pinned files / loci is covered by an
 * accounted locus glob. Glob-vs-path matching is bidirectional: an accounted
 * glob may match a pinned file, or an accounted concrete path may fall under a
 * floor locus glob.
 */
function locusIsAccounted(entry, accounted) {
  if (accounted.ids.has(entry.id)) return true;
  const files = pinnedFiles(entry);
  const declared = [...accounted.globs];
  // An accounted glob/path covers one of this entry's pinned files.
  if (files.some((f) => matchesAny(f, declared))) return true;
  // An accounted concrete path falls under one of this entry's locus globs.
  if (declared.some((d) => matchesAny(d, entry.locus))) return true;
  // A declared glob and a floor locus glob name the same thing literally.
  if (declared.some((d) => entry.locus.some((g) => sameGlob(d, g)))) return true;
  return false;
}

/** Literal-equality of two normalized globs (cheap exact-match fast path). */
function sameGlob(a, b) {
  return norm(a) === norm(b);
}

/**
 * Does a path intersect the floor (used by the fence to decide whether an
 * undeclared src edit needs a `floorImpact` declaration)? Exposed for the fence
 * so floor-containment lives with the rest of the baseline logic.
 */
export function intersectsFloor(relPath, baseline) {
  return matchesAny(relPath, floorLociUnion(baseline));
}

export { baselinePath, globToRegExp, existsSync };
