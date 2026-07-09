# Task T01b: Atom lifecycle + cohesion impl (green)

**Role:** `green` — implement `lib/atom.mjs`'s PURE section against the locked tests. Do not
modify the test files.

## References
- Read: `../shared/architecture.md`
- Read: `../shared/interfaces.md` (the exact contract, including the corrected two-argument
  `cohesionComponents(clauses, componentRoot)` signature)
- Read: `../shared/conventions.md`
- Read: `../knowledge/running-tests.md`
- Read: `lib/effects.mjs` in full (this file's nearest sibling in style — a pure, zero-I/O shape/
  algorithm module with no imports)
- Read: `lib/ledger.mjs`'s `validateEvent` comment on `Object.hasOwn` guarding against a `type`
  that shadows an inherited `Object.prototype` member name (commit `39459d1`) — the same defect
  class applies to `isValidTransition`'s lookup into `LIFECYCLE_TRANSITIONS` and must be guarded
  the same way

## Dependencies
- Depends on: T01a (locked tests)
- Depended on by: T01c (audits this), T02b (appends the I/O section to this same file, imports
  its real exports)

## Scope

**Files:**
- Create: `lib/atom.mjs` (PURE section only — leave the marker comment at the bottom for T02b)

**BOUNDARY — you MUST NOT modify any files outside this list.**

**Do NOT modify `test/atom-lifecycle.test.mjs` or `test/atom-cohesion.test.mjs` — authored by
T01a and locked.** If you believe a test in either is wrong, stop and escalate (say so in your
final report); never edit them yourself.

## Positive Constraints (DO)
- Implement exactly the exports named in `../shared/interfaces.md`'s PURE section:
  `LIFECYCLE_STATES`, `TERMINAL_STATES`, `FLAG_NAMES`, `LIFECYCLE_TRANSITIONS`,
  `isValidTransition`, `isValidFlag`, `cohesionComponents`.
- `isValidTransition` must use `Object.hasOwn(LIFECYCLE_TRANSITIONS, from)` before indexing, not a
  bare `LIFECYCLE_TRANSITIONS[from]` — a `from` value like `'__proto__'` or `'constructor'` must
  not silently resolve to an inherited `Object.prototype` member.
- `cohesionComponents(clauses, componentRoot)` takes the root as its second parameter (see
  `interfaces.md`) — do not derive or search for a component slug inside the loci yourself.
- End the file with exactly this marker comment, verbatim, as the last line:
  `// ── I/O functions appended by T02b (see shared/conventions.md — do not edit above this line) ──`

## Negative Constraints (DO NOT)
- Do NOT modify `test/atom-lifecycle.test.mjs` or `test/atom-cohesion.test.mjs`.
- Do NOT add any I/O — no `import` of `lib/ledger.mjs` or `lib/effort.mjs`, no `fs`/`path` usage,
  no `atomId`-keyed anything. That is entirely T02b's job, appended later.
- Do NOT add fields or behavior beyond what `interfaces.md` specifies (no speculative validation,
  no extra exports).
- Do NOT import from `lib/footprint.mjs` — its `lociOverlap`/`prefix` helpers are private and the
  semantics genuinely differ; reimplement the small piece this file needs locally.

## Implementation Steps

### Step 1: Read the locked tests

Read `test/atom-lifecycle.test.mjs` and `test/atom-cohesion.test.mjs` in full (written by T01a)
before writing any code — together they are the complete specification for this task.

### Step 2: Write `lib/atom.mjs`'s pure section

```js
// lib/atom.mjs — the atom's charter/delta split, lifecycle state machine, and minimality/cohesion
// law (DESIGN-3.0 §4, §4.1, §4.3, reasonable 3.0 Part 3). This file has two sections: PURE (this
// one — zero I/O, takes only in-memory data) and I/O (appended by T02b, below the marker comment
// — routes through lib/ledger.mjs's append()). The pure section decides only whether a proposed
// move is mechanically legal; which move a failed attempt SHOULD take (which R-code applies) is
// Part 5's judgment, not this file's.

export const LIFECYCLE_STATES = Object.freeze([
  'chartered', 'ready', "spec'd", 'packed', 'tests-red', 'green', 'audited',
  'merged', 'retired-pending', 'retired',
]);

export const TERMINAL_STATES = Object.freeze(['merged', 'retired']);

export const FLAG_NAMES = Object.freeze(['frozen', 'guard-halted', 'dispatch-barred']);

export const LIFECYCLE_TRANSITIONS = Object.freeze({
  chartered:         Object.freeze(['ready']),
  ready:             Object.freeze(["spec'd"]),
  "spec'd":          Object.freeze(['packed', 'ready', 'retired-pending']),
  packed:            Object.freeze(['tests-red', 'ready', 'retired-pending']),
  'tests-red':       Object.freeze(['green', 'ready', 'retired-pending']),
  green:             Object.freeze(['audited', 'ready', 'retired-pending']),
  audited:           Object.freeze(['merged', 'ready', 'retired-pending']),
  merged:            Object.freeze([]),
  'retired-pending': Object.freeze(['retired']),
  retired:           Object.freeze([]),
});

export function isValidTransition(from, to) {
  if (typeof from !== 'string' || typeof to !== 'string') return false;
  if (!Object.hasOwn(LIFECYCLE_TRANSITIONS, from)) return false;
  return LIFECYCLE_TRANSITIONS[from].includes(to);
}

export function isValidFlag(flag) {
  return typeof flag === 'string' && FLAG_NAMES.includes(flag);
}

// ── cohesion (DESIGN-3.0 §4.3) ──────────────────────────────────────────────

function citationKey(cite) {
  return `${cite.component}::${cite.clause}`;
}

/** Literal directory prefix of a glob (up to the first wildcard) — same algorithm as
 *  lib/footprint.mjs's private `prefix`, reimplemented here since that one isn't exported. */
function globPrefix(glob) {
  const star = glob.search(/[*?]/);
  const head = star === -1 ? glob : glob.slice(0, star);
  return head.replace(/\/[^/]*$/, (m) => (star === -1 ? m : ''));
}

/** Strip `componentRoot` off the front of `glob` if present; if what remains is empty, this
 *  locus entry IS the bare root and is dropped (returns null). A glob that never started with
 *  `componentRoot` is returned unstripped (conservative — never silently dropped). */
function stripRoot(glob, componentRoot) {
  if (typeof glob !== 'string') return null;
  const stripped = glob.startsWith(componentRoot) ? glob.slice(componentRoot.length) : glob;
  return stripped === '' ? null : stripped;
}

/** True iff any glob in `a` overlaps (ancestor-or-equal prefix) any glob in `b` — same
 *  conservative ancestor-overlap rule as lib/footprint.mjs's private `lociOverlap`, applied to
 *  already-root-stripped glob lists. */
function anyOverlap(a, b) {
  for (const ga of a) for (const gb of b) {
    const pa = globPrefix(ga), pb = globPrefix(gb);
    if (pa === '' || pb === '') return true;
    if (pa === pb) return true;
    if ((pa + '/').startsWith(pb + '/') || (pb + '/').startsWith(pa + '/')) return true;
    if (ga === gb) return true;
  }
  return false;
}

function cohere(a, b, componentRoot) {
  // (a) a common provider clause
  const aCites = new Set(a.citations.map(citationKey));
  if (b.citations.some((c) => aCites.has(citationKey(c)))) return true;
  // (b) shared, non-null demanded-by
  if (a.demandedBy !== null && a.demandedBy === b.demandedBy) return true;
  // (c) loci overlap below the component root
  const strippedA = (a.locus || []).map((g) => stripRoot(g, componentRoot)).filter((g) => g !== null);
  const strippedB = (b.locus || []).map((g) => stripRoot(g, componentRoot)).filter((g) => g !== null);
  if (strippedA.length && strippedB.length && anyOverlap(strippedA, strippedB)) return true;
  return false;
}

export function cohesionComponents(clauses, componentRoot) {
  const n = clauses.length;
  const parent = clauses.map((_, i) => i);
  function find(i) { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; }
  function union(i, j) { const ri = find(i), rj = find(j); if (ri !== rj) parent[ri] = rj; }

  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      if (cohere(clauses[i], clauses[j], componentRoot)) union(i, j);
    }
  }

  const groups = new Map();
  for (let i = 0; i < n; i += 1) {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(clauses[i].clauseId);
  }
  return [...groups.values()];
}

// ── I/O functions appended by T02b (see shared/conventions.md — do not edit above this line) ──
```

### Step 3: Run the locked tests to verify they pass

Run: `node test/atom-lifecycle.test.mjs` and `node test/atom-cohesion.test.mjs`

Expected: `atom-lifecycle: all <N> checks pass. ✓` and `atom-cohesion: all <N> checks pass. ✓`,
zero `FAIL` lines, exit code 0 for both.

### Step 4: Run the existing suite to confirm zero regression

Run every existing test file (see `../knowledge/running-tests.md`'s "run everything" command).
`lib/atom.mjs` is a brand-new file importing nothing — this task should not be able to affect any
existing test, but confirm rather than assume.

### Step 5: Commit

```bash
git add lib/atom.mjs
git commit -m "feat(atom): implement the atom lifecycle state machine and cohesion graph"
```

## Acceptance Criteria
- [ ] `node test/atom-lifecycle.test.mjs` passes with zero failures
- [ ] `node test/atom-cohesion.test.mjs` passes with zero failures
- [ ] The full existing suite still passes with zero failures (no regression)
- [ ] Neither test file was modified
- [ ] `lib/atom.mjs` ends with the exact marker comment T02b will append below
- [ ] No file outside Scope was modified
