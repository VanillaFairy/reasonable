# Task T10b: live-view fold impl (green)

**Role:** `green` — add the 3.0 atom/verdict/degeneration `EVENT_MAP` entries to `lib/progress-map.mjs`.
Implement exactly what the locked test requires; do not modify any test file.

## References
- Read: `../shared/interfaces.md` §6 (in full — the flat-path correction), `../shared/conventions.md`
- Read: `test/progress-map-atoms.test.mjs` (T10a's locked tests)
- Read: `lib/progress-map.mjs` **in full** — you are adding entries to the existing `EVENT_MAP` object;
  every existing entry (Family 1/2/3, `next-action`) must stay byte-identical
- Read: `lib/atom.mjs`'s `LIFECYCLE_TRANSITIONS` (the ten states you map to the six tree statuses)
- Read: `lib/progress-tree.mjs`'s `STATUSES`/`assertValidStatus` (only six legal values — mapping to
  anything else throws)

## Dependencies
- Depends on: T10a (locked tests), T04b (Phase B — the event types this fold interprets)
- Depended on by: T10c (audits), T11 (docs — names these new EVENT_MAP entries as part of the live
  view, no separate artifact registration needed since `progress.{json,md}` are already `*`-pinned)

## Scope
**Files:**
- Modify: `lib/progress-map.mjs`

**BOUNDARY — you MUST NOT modify any files outside this list.** Do NOT modify
`test/progress-map-atoms.test.mjs` — locked. Do NOT touch `lib/progress-tree.mjs` or any existing
`EVENT_MAP` entry.

## Positive Constraints (DO)
- Add a lifecycle→tree-status lookup table and six new `EVENT_MAP` entries (`atom-chartered`,
  `atom-delta-authored`, `delta-enrichment`, `atom-transitioned`, `atom-flag-set`, `atom-flag-cleared`,
  `atom-verdict`, `phase-degenerated` — eight entries total; `atom-delta-authored`/`delta-enrichment`
  share the same handler shape).
- Every atom-keyed entry uses `path: e.atomId` (flat, per the grounding correction) — never a
  containment-nested path.
- `phase-degenerated` uses `path: \`phase/${e.phase}\`` and an `inject` op whose label/note names the
  degeneracy reason, so a reviewer sees a phase that RAN and found nothing.

## Negative Constraints (DO NOT)
- Do NOT touch any existing `EVENT_MAP` entry, `foldEvents`, `buildTree`, or `writeMirror`.
- Do NOT invent a containment-nested path for any atom event (out of scope — see the grounding
  correction).
- Do NOT map any lifecycle state to a tree status outside the six legal `STATUSES` values.

## Implementation Steps

### Step 1: Add the lifecycle→status map and the new `EVENT_MAP` entries

Find the `next-action` entry (the last one in `EVENT_MAP` today):

```js
  'next-action': () => [],
};
```

Insert the new entries **immediately before** the closing `};`, and add the lookup table just above the
`EVENT_MAP` object declaration:

```js
// reasonable 3.0 Part 7 (DESIGN-3.0 §8; interfaces.md §6): the atom lifecycle state -> progress-tree
// display status. Only six tree statuses exist (progress-tree.mjs STATUSES); every one of the atom's
// ten lifecycle states maps onto one. 'failed'/'panic' are reserved for worker-report-style crash
// semantics (Family 1/2) — no atom lifecycle state maps to them; a frozen/guard-halted/dispatch-barred
// atom stays at its own status with a NOTE (below), never a separate tree status, since those are
// orthogonal FLAGS (lib/atom.mjs), not lifecycle states.
const ATOM_STATE_TO_TREE_STATUS = {
  chartered: 'pending',
  ready: 'pending',
  "spec'd": 'active',
  packed: 'active',
  'tests-red': 'active',
  green: 'active',
  audited: 'active',
  merged: 'done',
  'retired-pending': 'canceled',
  retired: 'canceled',
};
```

Then, immediately before the `'next-action': () => [],` line's closing brace:

```js
  // ── reasonable 3.0 Part 7 (DESIGN-3.0 §8) — atom / verdict / degeneration events ──────────
  // Every atom-keyed entry uses e.atomId as a FLAT top-level path (interfaces.md §6's grounding
  // correction): EVENT_MAP handlers are stateless, one-event-at-a-time functions (this file's own
  // invariant, see the header comment) — a bare atom-transitioned/atom-verdict/atom-flag-* event
  // carries only atomId, never component, so it cannot be injected at a containmentTree-nested path
  // without breaking that statelessness. The atom id IS the path; ids are never reused, so aggregation
  // by id (no double-count on a reshape) holds trivially.
  'atom-chartered': (e) => [
    { op: 'inject', path: e.atomId, label: e.purpose || e.component || e.atomId, status: 'pending' },
  ],
  'atom-delta-authored': (e) => [
    { op: 'note', path: e.atomId, text: `delta authored (${(e.clauses || []).length} clause(s))`, ts: e.ts },
  ],
  'delta-enrichment': (e) => [
    { op: 'note', path: e.atomId, text: `delta enriched (+${e.clause ? 1 : 0} clause)`, ts: e.ts },
  ],
  'atom-transitioned': (e) => {
    const status = Object.hasOwn(ATOM_STATE_TO_TREE_STATUS, e.to) ? ATOM_STATE_TO_TREE_STATUS[e.to] : 'pending';
    return [{ op: 'status', path: e.atomId, status, ts: e.ts }];
  },
  'atom-flag-set': (e) => [{ op: 'note', path: e.atomId, text: `flag set: ${e.flag}${e.reason ? ` (${e.reason})` : ''}`, ts: e.ts }],
  'atom-flag-cleared': (e) => [{ op: 'note', path: e.atomId, text: `flag cleared: ${e.flag}`, ts: e.ts }],
  'atom-verdict': (e) => [{ op: 'note', path: e.atomId, text: `verdict: ${e.kind}`, ts: e.ts }],
  // phase-degenerated: a PROVEN no-op (§5.4) — the record shows the phase RAN and found nothing,
  // never a silent skip. Injected at a synthetic phase/<name> path, distinct from any atom.
  'phase-degenerated': (e) => [
    { op: 'inject', path: `phase/${e.phase}`, label: `${e.phase}: degenerated`, status: 'done' },
    { op: 'note', path: `phase/${e.phase}`, text: e.reason || 'ran and found nothing', ts: e.ts },
  ],
```

### Step 2: Run the locked test to verify it passes

Run: `node test/progress-map-atoms.test.mjs`

Expected: `progress-map-atoms: all <N> checks passed. ✓`, zero `FAIL` lines.

### Step 3: Confirm zero regression to the whole suite

```bash
for t in test/*.test.mjs; do node "$t"; done
```

No `FAIL` line anywhere, in particular `test/progress-map.test.mjs` (the pre-existing Family-1/2/3
tests) unaffected.

### Step 4: Commit

```bash
git add lib/progress-map.mjs
git commit -m "feat(progress-map): fold the 3.0 atom/verdict/degeneration events — flat atomId paths (green, P7)" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

## Acceptance Criteria
- [ ] `node test/progress-map-atoms.test.mjs` passes with zero failures
- [ ] Every new `EVENT_MAP` entry uses a flat `atomId`/`phase/<name>` path — no nested containment path
- [ ] No existing `EVENT_MAP` entry, `foldEvents`, `buildTree`, or `writeMirror` was touched
- [ ] The whole existing suite still passes; no file outside Scope was modified
