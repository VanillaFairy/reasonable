# Task T02b: `ready` + `pack` impl (green) — guard `footprint.mjs`'s CLI first

**Role:** `green` — (1) wrap `lib/footprint.mjs`'s existing CLI body in a guard (a real defect fix, not
optional), (2) add the `footprintsDisjoint` export, (3) append `lib/frontier.mjs`'s `ready`/`pack`
section. Implement exactly what the locked tests require; do not modify any test file.

## References
- Read: `../shared/interfaces.md` §0 (correction 1, in full) and §1.2/§1.3, `../shared/conventions.md`,
  `../shared/architecture.md`
- Read: `test/frontier-ready-pack.test.mjs` and `test/footprint-disjoint.test.mjs` (T02a's locked
  tests)
- Read: `lib/footprint.mjs` **in full, end to end** — you are refactoring this whole file
- Read: `lib/ledger.mjs`'s final three lines (`if (basename(process.argv[1] || '') === 'ledger.mjs') {
  runCli(); }`) — the exact guard shape to mirror
- Read: `lib/frontier.mjs` (T01b's section + its `// ── ready/pack appended by T02b … ──` marker)

## Dependencies
- Depends on: T02a (locked tests)
- Depended on by: T02c (audits), T03a/T03b (append below your marker)

## Scope
**Files:**
- Modify: `lib/footprint.mjs`
- Modify: `lib/frontier.mjs` (append below the T01b marker)

**BOUNDARY — you MUST NOT modify any files outside this list.** Do NOT modify
`test/frontier-ready-pack.test.mjs` or `test/footprint-disjoint.test.mjs` — locked. Do NOT touch
`lib/graph.mjs`, `lib/effects.mjs`, or `lib/rewrite.mjs`.

## Positive Constraints (DO)
- Wrap `lib/footprint.mjs`'s existing top-level CLI body (argv parsing, effort-root resolution, the
  work-order loop, the `--json`/plain-text printing) in a `runCli()` function, called only behind
  `if (basename(process.argv[1] || '') === 'footprint.mjs')` — mirroring `ledger.mjs` exactly. Add
  `basename` to the existing `node:path` import.
- Add `export function footprintsDisjoint(a, b)` as a thin boolean wrapper over the **existing,
  unmodified** `independent(fa, fb)` helper (`return independent(a, b).ok === true;`) — `independent()`
  itself keeps its `{ok, why}` shape verbatim (the CLI's printed diagnostic still uses `why`).
- Refactor the private `footprint(id)` helper to take `effortRoot`/`woDir` as parameters (it no longer
  has a module-level closure over them once they move inside `runCli()`) — a same-behavior signature
  change, not a logic change.
- Append the `ready`/`pack` section to `lib/frontier.mjs` below its T01b marker, importing
  `footprintsDisjoint` from `./footprint.mjs`.
- End the appended section with the exact marker comment shown in Step 3 so T03b can append below it.

## Negative Constraints (DO NOT)
- Do NOT change `node lib/footprint.mjs ...`'s observable behavior in any way — same stdout, same exit
  codes, same `--json` shape. The guard is the ONLY behavior-relevant change (it makes the file
  side-effect-free on `import`, which it already should have been).
- Do NOT implement `requiredRoles` (T03b).
- Do NOT do any I/O inside `ready`/`pack` — both are pure over their arguments.
- Do NOT import `lib/ledger.mjs`, `lib/route.mjs`, or anything not already named in
  `../shared/interfaces.md`.

## Implementation Steps

### Step 1: Rewrite `lib/footprint.mjs` — guard the CLI, add `footprintsDisjoint`

Replace the entire file with:

```js
// footprint.mjs — compute work-order footprints and pairwise independence.
//
// DESIGN §5.11 Ruling 1: the DAG is computed, not declared. footprint =
// declared locus ∪ citation-closure of touched contracts (+ resource claims).
// Two work orders are independent IFF their footprints are disjoint — a set
// intersection recomputed fresh at dispatch, conservative by construction
// (over-approximation forfeits parallelism, never correctness).
//
// Usage:
//   node footprint.mjs                 # footprint of every work order
//   node footprint.mjs WO-1 WO-2 ...   # footprints + pairwise independence
//   node footprint.mjs --json ...
//
// reasonable 3.0 Part 7: the CLI body below is now GUARDED (mirrors lib/ledger.mjs's
// `if (basename(process.argv[1]||'')==='ledger.mjs') runCli()` shape) — previously it ran
// UNCONDITIONALLY at module load, including a bare process.exit(1) when no .reasonable/ was
// discoverable, which would have killed any process that merely IMPORTED this file. Nothing imported
// it before P7; `footprintsDisjoint` below is the first export, and it is now side-effect-free to
// import. `node lib/footprint.mjs ...` run directly is UNCHANGED — the guard fires exactly when this
// file is the entry script.

import { readdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { findEffortRoot, rootFromArgv, argvWithoutRoot, readJson, norm } from './effort.mjs';
import { citationClosure } from './contract.mjs';

/** Literal directory prefix of a glob (up to the first wildcard). */
function prefix(glob) {
  const g = norm(glob);
  const star = g.search(/[*?]/);
  const head = star === -1 ? g : g.slice(0, star);
  return head.replace(/\/[^/]*$/, (m) => (star === -1 ? m : '')); // keep dir part when wildcarded
}

/** Conservative: two loci overlap if their prefixes are in an ancestor relation. */
function lociOverlap(a, b) {
  for (const ga of a) for (const gb of b) {
    const pa = prefix(ga), pb = prefix(gb);
    if (pa === '' || pb === '') return true;          // unbounded glob — assume overlap
    if (pa === pb) return true;
    if ((pa + '/').startsWith(pb + '/') || (pb + '/').startsWith(pa + '/')) return true;
    if (ga === gb) return true;
  }
  return false;
}

function intersect(a, b) { return a.filter((x) => b.includes(x)); }

function independent(fa, fb) {
  if (lociOverlap(fa.locus, fb.locus)) return { ok: false, why: 'locus overlap' };
  const cc = intersect(fa.contracts, fb.contracts);
  if (cc.length) return { ok: false, why: `shared contracts: ${cc.join(', ')}` };
  const rr = intersect(fa.resources, fb.resources);
  if (rr.length) return { ok: false, why: `shared resources: ${rr.join(', ')}` };
  return { ok: true };
}

// ── EXPORTED (reasonable 3.0 Part 7): the pure disjointness algebra, boolean form, for
// lib/frontier.mjs's `pack`. independent() above is UNCHANGED — the CLI's printed `why` diagnostic
// still uses it; this is a thin wrapper, not a re-derivation.
/**
 * Two footprints are disjoint iff their loci do not overlap (ancestor-prefix over glob prefixes) AND
 * they share no contract (citation closure already folded in) AND they share no resource.
 * @param {{locus:string[],contracts:string[],resources:string[]}} a
 * @param {{locus:string[],contracts:string[],resources:string[]}} b
 * @returns {boolean}
 */
export function footprintsDisjoint(a, b) {
  return independent(a, b).ok === true;
}

function footprint(effortRoot, woDir, id) {
  const wo = readJson(join(woDir, `${id}.json`));
  if (!wo) return null;
  const contracts = (wo.inputs && wo.inputs.contracts) || wo.contracts || [];
  const closure = citationClosure(effortRoot, contracts);
  return {
    id,
    locus: (wo.locus || []).map(norm),
    contracts: closure,
    resources: wo.resourceClaims || [],
  };
}

// ── the CLI (GUARDED — see the file header) ─────────────────────────────────────────────────

function runCli() {
  const args = argvWithoutRoot(process.argv).slice(2); // drop --root <path> so it is not read as a work-order id
  const asJson = args.includes('--json');
  const ids = args.filter((a) => !a.startsWith('--'));

  const effortRoot = rootFromArgv(process.argv, process.cwd());
  if (!effortRoot) { console.error('No effort (.reasonable/) found (pass --root <effortRoot> or run from inside the effort).'); process.exit(1); }

  const woDir = join(effortRoot, '.reasonable', 'work-orders');
  const allIds = existsSync(woDir)
    ? readdirSync(woDir).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''))
    : [];
  const wanted = ids.length ? ids : allIds;

  const fps = wanted.map((id) => footprint(effortRoot, woDir, id)).filter(Boolean);

  if (asJson) {
    const pairs = [];
    for (let i = 0; i < fps.length; i++)
      for (let j = i + 1; j < fps.length; j++)
        pairs.push({ a: fps[i].id, b: fps[j].id, ...independent(fps[i], fps[j]) });
    console.log(JSON.stringify({ footprints: fps, independence: pairs }, null, 2));
    process.exit(0);
  }

  for (const f of fps) {
    console.log(`\n${f.id}`);
    console.log(`  locus:     ${f.locus.join(', ') || '(none)'}`);
    console.log(`  contracts: ${f.contracts.join(', ') || '(none)'}  (incl. citation closure)`);
    console.log(`  resources: ${f.resources.join(', ') || '(none)'}`);
  }
  if (fps.length > 1) {
    console.log('\nPairwise independence (disjoint footprints ⇒ parallelizable):');
    for (let i = 0; i < fps.length; i++)
      for (let j = i + 1; j < fps.length; j++) {
        const r = independent(fps[i], fps[j]);
        console.log(`  ${fps[i].id} ∥ ${fps[j].id}: ${r.ok ? 'INDEPENDENT' : 'SERIALIZE — ' + r.why}`);
      }
  }
}

if (basename(process.argv[1] || '') === 'footprint.mjs') {
  runCli();
}
```

`findEffortRoot` remains imported but (as in the pre-refactor file) unused directly — it was already
unused in the original file (only `rootFromArgv` is called); leave the import exactly as it was, do not
remove it speculatively (out of scope for this task; a separate lint pass is not part of P7).

### Step 2: Run the footprint-disjoint test to verify it passes

Run: `node test/footprint-disjoint.test.mjs`

Expected: `footprint-disjoint: all <N> checks pass. ✓`, zero `FAIL` lines. In particular the
guard-regression check (`IMPORT_OK`, no `"No effort"`) must pass now — before this task it would have
failed differently (link-time SyntaxError, not even reaching this check).

### Step 3: Append `lib/frontier.mjs`'s `ready`/`pack` section

Open `lib/frontier.mjs`. Replace the marker line
`// ── ready/pack appended by T02b (do not edit above this line) ──` with:

```js
// ── ready + pack (§6, §2.2) ──────────────────────────────────────────────────
import { footprintsDisjoint } from './footprint.mjs';

const FRONTIER_ELIGIBLE = new Set(['chartered', 'ready', "spec'd"]);

/**
 * The frontier ready-set (§6: "ready(graph) = planned edges; minus frozen / guard-halted / barred").
 * @param {{atoms:AtomRecord[], edges:Edge[]}} graph
 * @param {{frozen?:string[], guardHalted?:string[], barred?:string[]}} flags
 * @returns {string[]}  ready atom ids, in graph.atoms order
 */
export function ready(graph, flags = {}) {
  const frozen = new Set(flags.frozen || []);
  const guardHalted = new Set(flags.guardHalted || []);
  const barred = new Set(flags.barred || []);
  const atoms = (graph && graph.atoms) || [];
  const byId = new Map(atoms.map((a) => [a.id, a]));
  const needsEdges = ((graph && graph.edges) || []).filter((e) => e.edge === 'needs');

  return atoms
    .filter((a) => FRONTIER_ELIGIBLE.has(a.state))
    .filter((a) => !frozen.has(a.id) && !guardHalted.has(a.id) && !barred.has(a.id))
    .filter((a) => needsEdges
      .filter((e) => e.from === a.id)
      .every((e) => {
        const provider = byId.get(e.to);
        return !provider || provider.state === 'merged'; // absent = already landed/external
      }))
    .map((a) => a.id);
}

/**
 * The maximal (greedy first-fit) subset of spec'd atoms that is PAIRWISE disjoint by ACTUAL footprint
 * (§6: "packing happens only on actual footprints"). A collision between two packed atoms is an R9
 * verdict (§6), never asserted here — pack only proves disjointness.
 * @param {Array<{id:string, locus:string[], contracts:string[], resources:string[]}>} footprints
 * @returns {{ wave: string[], deferred: string[] }}
 */
export function pack(footprints) {
  const list = footprints || [];
  const wave = [];
  const deferred = [];
  for (const fp of list) {
    if (wave.every((w) => footprintsDisjoint(w, fp))) wave.push(fp);
    else deferred.push(fp);
  }
  return { wave: wave.map((f) => f.id), deferred: deferred.map((f) => f.id) };
}

// ── requiredRoles appended by T03b (do not edit above this line) ──
```

### Step 4: Run the locked tests to verify they pass

Run: `node test/frontier-ready-pack.test.mjs`

Expected: `frontier-ready-pack: all <N> checks pass. ✓`, zero `FAIL` lines.

### Step 5: Confirm zero regression to the whole suite

```bash
for t in test/*.test.mjs; do node "$t"; done
```

No `FAIL` line anywhere, including `test/frontier-gate.test.mjs` (T01, untouched) and any existing test
that shells out to `node lib/footprint.mjs` as a subprocess (its CLI behavior is unchanged).

### Step 6: Commit

```bash
git add lib/footprint.mjs lib/frontier.mjs
git commit -m "fix(footprint): guard the CLI body (mirrors ledger.mjs) and export footprintsDisjoint" -m "feat(frontier): append ready + pack (green, P7)" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

## Acceptance Criteria
- [ ] `node test/footprint-disjoint.test.mjs` and `node test/frontier-ready-pack.test.mjs` pass with
      zero failures
- [ ] `node lib/footprint.mjs` (and `node lib/footprint.mjs --json`) run directly still print exactly
      what they did before this task — the guard is behavior-neutral for direct invocation
- [ ] `import { footprintsDisjoint } from '../lib/footprint.mjs'` from a cwd with no `.reasonable/` no
      longer exits the process
- [ ] `lib/frontier.mjs` ends with the exact `// ── requiredRoles appended by T03b … ──` marker line
- [ ] The whole existing suite still passes; no file outside Scope was modified
