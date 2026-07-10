# T01b — goals.json loader impl (green)

**role:** green
**Depends on:** T01a
**Owns (stage only these):** `lib/goals.mjs`

> **Read first:** `../shared/interfaces.md`, `../shared/conventions.md`. You are the `green` role:
> **make the locked tests pass; write no tests.** `test/goals-loader.test.mjs` is **READ-ONLY — do not
> modify it.** If a test looks wrong, STOP and escalate to the supervisor; do not edit it to fit your
> implementation.

**Files:**
- Create: `lib/goals.mjs`

- [ ] **Step 1: Read the locked tests**

Read `test/goals-loader.test.mjs` end to end. Note: `goals.json` is an **array**; the return is
`{ goals, diagnostic }`; one malformed entry fails the whole load; optional `ratifiedAt`/`ledgerSeq`
degrade to `null`; `scenarioCitations` objects are preserved verbatim (only `clause` is validated);
extra top-level entry fields are dropped (closed per-entry grammar).

- [ ] **Step 2: Create `lib/goals.mjs`**

Write `lib/goals.mjs` with exactly this content:

```js
// lib/goals.mjs — the pure loader for `.reasonable/goals.json` (reasonable 3.0 Part 6d).
//
// goals.json is the machine-parsed twin of the ratified top-level scenario set (DESIGN-3.0 §3, §5.5):
// an ARRAY of goal entries, each { id, scenario, scenarioCitations, ratifiedAt?, ledgerSeq? }. Its
// `scenarioCitations` are the per-clause references lib/graph.mjs's `servesEdges` consumes to compute
// each goal's cone — servesEdges reads `citation.clause` (a `component#cN` ref), so this loader
// validates each citation carries a non-empty-string `clause` and preserves the citation objects
// verbatim, so the loaded goals compose with servesEdges without a translation layer.
//
// Law 1 (dependency-free): node builtins only — no imports beyond node:fs/node:path. In particular it
// does NOT import parseClauseId from clause-id.mjs — that would drag in ledger.mjs/effort.mjs; the
// loader validates `clause` is a non-empty string, leaving clause-id well-formedness to the write path.
//
// CONSERVATIVE BY DESIGN, modeled EXACTLY on lib/route.mjs's readRoute:
//   - absent goals.json     -> { goals: null, diagnostic: null }   (a pre-ratification effort state)
//   - present but malformed  -> { goals: null, diagnostic: '<reason>' }  (never a repair, never a
//                              partial trust — ONE bad entry fails the WHOLE load)
//   - valid                  -> { goals: [ ...normalized entries ], diagnostic: null }
// Nothing reads goals.json until P7 wires the frontier loop; P6d builds the loader only.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * @param {string} effortRoot
 * @returns {{ goals: Array<object> | null, diagnostic: string | null }}
 */
export function readGoals(effortRoot) {
  const path = join(effortRoot, '.reasonable', 'goals.json');
  if (!existsSync(path)) return { goals: null, diagnostic: null };

  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    return { goals: null, diagnostic: `goals.json: invalid JSON — ${(e && e.message) || String(e)}` };
  }

  if (!Array.isArray(parsed)) {
    return { goals: null, diagnostic: 'goals.json: expected a JSON array of goal entries' };
  }

  const goals = [];
  for (let i = 0; i < parsed.length; i += 1) {
    const entry = parsed[i];
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      return { goals: null, diagnostic: `goals.json: entry ${i}: expected an object` };
    }
    const { id, scenario, scenarioCitations, ratifiedAt, ledgerSeq } = entry;
    if (typeof id !== 'string' || id.length === 0) {
      return { goals: null, diagnostic: `goals.json: entry ${i}: "id" must be a non-empty string` };
    }
    if (typeof scenario !== 'string' || scenario.length === 0) {
      return { goals: null, diagnostic: `goals.json: entry ${i}: "scenario" must be a non-empty string` };
    }
    if (!Array.isArray(scenarioCitations)) {
      return { goals: null, diagnostic: `goals.json: entry ${i}: "scenarioCitations" must be an array` };
    }
    for (let j = 0; j < scenarioCitations.length; j += 1) {
      const cite = scenarioCitations[j];
      if (cite === null || typeof cite !== 'object' || Array.isArray(cite) ||
          typeof cite.clause !== 'string' || cite.clause.length === 0) {
        return {
          goals: null,
          diagnostic: `goals.json: entry ${i}: scenarioCitations[${j}] must be an object with a non-empty string "clause"`,
        };
      }
    }
    goals.push({
      id,
      scenario,
      scenarioCitations,
      ratifiedAt: typeof ratifiedAt === 'string' ? ratifiedAt : null,
      ledgerSeq: Number.isFinite(ledgerSeq) ? ledgerSeq : null,
    });
  }

  return { goals, diagnostic: null };
}
```

- [ ] **Step 3: Run the tests to verify they pass**

Run: `node test/goals-loader.test.mjs`
Expected: `goals: all N checks passed. ✓` (no `FAIL` line, exit 0).

- [ ] **Step 4: Run the full suite to confirm zero regressions**

Run: `for t in test/*.test.mjs; do node "$t"; done`
Expected: no `FAIL` line anywhere — this part is purely additive (a brand-new file), so every
pre-existing test still passes unchanged.

- [ ] **Step 5: Commit**

```bash
git add lib/goals.mjs
git commit -m "feat(goals): readGoals — conservative goals.json loader (green, P6d)"
```

**Do not modify the test file, create `lib/policy.mjs` (that's T02b), touch `docs/`, the roadmap,
`plugin.json`, or the README.** Docs are T03; the roadmap status cell is T04.
