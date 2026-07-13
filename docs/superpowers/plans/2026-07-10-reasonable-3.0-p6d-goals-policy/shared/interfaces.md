# Shared Interfaces — P6d: `goals.json` + `policy.json` loaders

**Version:** 1.0

The exact public surface P6d adds: **two** new files, `lib/goals.mjs` and `lib/policy.mjs`, each
exporting **one** conservative loader modeled EXACTLY on `lib/route.mjs`'s `readRoute` contract. They
are two files because they load two artifacts with two shapes (one responsibility per file, exactly as
`route.mjs` loads one artifact). Grounded in the shipped `lib/route.mjs`, `lib/graph.mjs`
(`servesEdges`), and `lib/rewrite.mjs` (`ceremonyEscalation`) — read them; do not assume.

## The conservative-loader contract (both loaders share it — copied from `route.mjs`)

Every loader distinguishes **three** states, with `existsSync` + a guarded `JSON.parse` (a plain
`readJson()` that swallows both absent and corrupt into one `null` is WRONG here — the caller must tell
"no artifact yet" from "a broken artifact"):

1. **Absent file** → `{ <key>: null, diagnostic: null }`. A pre-ratification effort is a legitimate
   state, never an error. Never throws — an absent `.reasonable/` dir entirely also returns this.
2. **Present but malformed** → `{ <key>: null, diagnostic: '<reason>' }`. A non-empty string reason the
   caller surfaces. **Never a repair, never a default, never a partial trust** — one malformed part
   fails the WHOLE load. The loader never fabricates a value.
3. **Valid** → `{ <key>: <validated>, diagnostic: null }`.

Optional metadata (`ratifiedAt` / `ledgerSeq`) is **carried through when well-typed, else degraded to
`null` (never fabricated), without invalidating an otherwise-valid load** — exactly `route.mjs`'s rule.

**The loaders validate SHAPE, never VALUE** (design doc Decision 6, §16): a mistuned-but-well-formed
artifact (e.g. `maxWidth: -5`) loads clean and is the human's to tune. Numeric defaults ship
flagged-uncalibrated; the loader never rejects a well-formed number for being "wrong."

**Law 1 (dependency-free):** both files import only `node:fs` + `node:path`. In particular they do
**NOT** import `parseClauseId` from `lib/clause-id.mjs` — that module imports `ledger.mjs`/`effort.mjs`,
which would drag I/O into a loader `route.mjs` keeps lean. A citation `clause` is validated as a
**non-empty string**, mirroring `route.mjs`'s "non-empty strings" slice check; clause-id
well-formedness is the write path's job (P7), and `servesEdges`' own `Map.get(c.clause)` misses
harmlessly on a bad ref.

## `lib/goals.mjs` — `readGoals(effortRoot)`

```js
/**
 * Read and validate `.reasonable/goals.json` — the ratified top-level scenario set (DESIGN-3.0 §3,
 * §5.5): an ARRAY of goal entries. Conservative loader (see the shared contract above).
 *
 * @param {string} effortRoot
 * @returns {{ goals: Array<{
 *              id: string,
 *              scenario: string,
 *              scenarioCitations: Array<{clause: string, [k:string]: unknown}>,
 *              ratifiedAt: string|null,
 *              ledgerSeq: number|null
 *            }> | null,
 *            diagnostic: string|null }}
 */
export function readGoals(effortRoot);
```

**Grammar (`goals.json` is an ARRAY):**

```json
[
  { "id": "expr-eval", "scenario": "evaluate an arithmetic expression end to end",
    "scenarioCitations": [{ "component": "lexer", "clause": "lexer#c1" }],
    "ratifiedAt": "2026-07-10T10:00:00+02:00", "ledgerSeq": 42 }
]
```

- **`id`** — required, non-empty string (the goal's stable id; `servesEdges` emits `{to: goal.id}`).
- **`scenario`** — required, non-empty string (the top-level scenario prose the parked suite pins).
- **`scenarioCitations`** — required **array**; each element an **object** carrying a non-empty string
  **`clause`** (a `component#cN` ref). **GROUNDING (load-bearing):** `lib/graph.mjs`'s `servesEdges`
  reads `citation.clause` (`providerOf.get(c.clause)`) — its own test fixtures are
  `{ component, clause }` objects, **not** bare strings. So the loader validates the `clause` field and
  **preserves each citation object verbatim** (any `component` or other field survives), so the loaded
  goals feed `servesEdges(atoms, goals)` with no translation layer. An empty `scenarioCitations` array
  is shape-valid (a goal with no cone yet — the human's to fill), just as `route.mjs` accepts an empty
  `slices` array.
- **`ratifiedAt?` / `ledgerSeq?`** — optional ratification back-pointers; degrade-to-`null` rule above.

**Normalization:** each returned entry is projected to exactly the five keys above (extra top-level
fields dropped — `goals.json`'s per-entry grammar is **closed**, unlike `policy.json`). `ratifiedAt`
`null` if absent/non-string; `ledgerSeq` `null` if absent/non-finite. `scenarioCitations` preserved
as-is. **One malformed entry fails the whole load** (`{ goals: null, diagnostic: 'goals.json: entry
<i>: <reason>' }`).

## `lib/policy.mjs` — `readPolicy(effortRoot)`

```js
/**
 * Read and validate `.reasonable/policy.json` — the ratified priority policy (DESIGN-3.0 §3, §9).
 * Conservative loader (see the shared contract above). Validates SHAPE, never VALUE.
 *
 * @param {string} effortRoot
 * @returns {{ policy: object | null, diagnostic: string|null }}
 *   On success `policy` is the parsed object returned VERBATIM (open grammar — see below).
 */
export function readPolicy(effortRoot);
```

**Grammar (`policy.json` is an OBJECT with an open field set `{ weights, legibility, cadence, dials, … }`):**

```json
{
  "weights":   { "integrationRisk": 5, "infoGain": 3, "unlocks": 2, "goalProximity": 4, "staleness": 1, "cost": -2 },
  "legibility":{ "maxWidth": 25, "maxTangle": 0.5, "maxChain": 8, "r8Retries": 3 },
  "cadence":   { "low": { "n": 1, "m": 3 }, "high": { "n": 1, "m": 1 } },
  "dials": {
    "bandScale":   ["low", "mid", "high"],
    "phaseCutoffs":{ "low": "skip-scaffold", "mid": "materialize", "high": "materialize" },
    "cadenceIndex":{ "low": 0, "mid": 1, "high": 2 }
  }
}
```

Required sub-shapes (checked in this order; the first failure is the diagnostic):

- **`weights`** — a non-empty object whose every value is a **finite number** (the six priority axes:
  integration-risk retirement, info gain, unlocks, goal proximity, staleness, cost). The loader gates
  "object of finite numbers," **not** the specific axis key set — shape not value.
- **`legibility`** — an object carrying **finite numbers** `maxWidth`, `maxTangle`, `maxChain`, and the
  R8 retry bound `r8Retries`. These four names are the grammar the legibility law (P6b) reads by name.
- **`cadence`** — a non-empty object mapping each band name to a **`{ n, m }`** pair of finite numbers
  (the band-indexed N/M gate-cadence floor, §9).
- **`dials`** — an object with:
  - **`bandScale`** — a non-empty array of non-empty band-name strings. **GROUNDING (load-bearing):**
    this is the ordered array `lib/rewrite.mjs`'s `ceremonyEscalation` does `scale.indexOf(current)`
    into and P6c's `classify` emits from — one shared band vocabulary.
  - **`phaseCutoffs`** and **`cadenceIndex`** — band-keyed maps, validated as **objects** only (their
    per-band value shapes are P6c's classifier / P7's cadence to consume; the loader gates structure,
    not the cutoff values).

**On success the parsed object is returned UNMODIFIED** (open grammar — the `…` extras and any
ratification metadata survive). This is a **deliberate, flagged divergence** from `route.mjs`, which
projects to a fixed subset because `route.json`'s grammar is closed; reshaping an open ratified
artifact would silently drop human-meant fields. See `plan.md` → "Flagged calls (contestable)."

## Flagged calls surfaced here (design pinned the ROLE, P6d coins the KEY)

The design doc (Decision 6) pins `policy.json`'s fields **by role** (weights / legibility / cadence /
dials) but leaves the concrete JSON **key names + nesting** unstated for three of them. P6d coins the
concrete keys below; each is contestable and the loader gates shape-not-value, so a rename is a
one-line change. All three are flagged in `plan.md`:

- `legibility.r8Retries` — the "R8 retry bound N," unnamed in the design.
- `cadence.<band> = { n, m }` — the N/M pair as an object (vs a `[n, m]` tuple).
- `dials.bandScale` / `dials.phaseCutoffs` / `dials.cadenceIndex` — the dials' sub-keys (Decision 4
  named them by role: the ordered band vocabulary, the band→phase-materialization cutoffs, the
  band→gate-cadence index).

## Return-key naming (mirror `route.mjs`)

`route.mjs` returns `{ route, diagnostic }`. Mirror per loader: `readGoals` → `{ goals, diagnostic }`;
`readPolicy` → `{ policy, diagnostic }`. Same three-state contract, same `diagnostic` string channel.
