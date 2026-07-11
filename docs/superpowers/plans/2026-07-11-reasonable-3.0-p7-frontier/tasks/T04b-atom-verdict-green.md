# Task T04b: `atom-verdict` append impl (green)

**Role:** `green` — extend `lib/ledger.mjs` with the two new event schemas and the `append()` verdict
branch. Implement exactly what the locked tests require; do not modify any test file.

> **STOP — confirm the pivotal call before this task runs** (same note as T04a — do not start until the
> supervisor has confirmed with the human that the append path owns effect computation).

## References
- Read: `../shared/interfaces.md` §2 **in full** (including the two flagged gaps: `bandBounds:{}` and
  `citationGraph` from `contract.mjs`, not `deriveCurrent`'s return), `../shared/conventions.md`,
  `../shared/architecture.md`
- Read: `test/ledger-atom-verdict.test.mjs` (T04a's locked test — the exact behavior you implement)
- Read: `lib/ledger.mjs` **in full** — you are editing this file; know its exact current shape before
  touching it (the `EVENT_SCHEMAS` object, the imports block, the `append()` function's `withLock` body)
- Read: `lib/rewrite.mjs`'s `computeVerdictEffects`/`ceremonyEscalation` signatures (already read for
  T04a), `lib/graph.mjs`'s `deriveCurrent`, `lib/contract.mjs`'s `citationGraph(effortRoot)`,
  `lib/goals.mjs`'s `readGoals`, `lib/policy.mjs`'s `readPolicy` — every one returns gracefully
  (`null`/`{}`/`[]`) when its backing file/data is absent; your branch must tolerate ALL of them absent
  at once (T04a's fixtures have no `goals.json`, no `policy.json`, no `.reasonable/contracts/`)

## Dependencies
- Depends on: T04a (locked test)
- Depended on by: T04c (audits), T05a/T05b (the ratification fold builds on this branch)

## Scope
**Files:**
- Modify: `lib/ledger.mjs`

**BOUNDARY — you MUST NOT modify any files outside this list.** Do NOT modify
`test/ledger-atom-verdict.test.mjs` — locked. Do NOT edit `lib/rewrite.mjs`, `lib/graph.mjs`,
`lib/contract.mjs`, `lib/goals.mjs`, or `lib/policy.mjs` — import from them only.

## Positive Constraints (DO)
- Add the two new imports at the top of `lib/ledger.mjs`, alongside the existing import block.
- Add `'atom-verdict': { required: ['atomId', 'kind'] }` and `'phase-degenerated': { required:
  ['phase'] }` to `EVENT_SCHEMAS` (Family 3 section, beside the other atom-lifecycle entries).
- Add the verdict branch inside the existing Family-3 (`else`) arm of `append()`'s `withLock` body,
  gated on `type === 'atom-verdict'`, running BEFORE `appendJsonlLocked` — an early `return {ok:false,
  error}` from inside the `withLock` callback on a HALT, exactly like the existing
  `resolveFamily1Address`/`resolveFamily2` failure paths already do.
- Build the snapshot exactly as `../shared/interfaces.md` §2 pins it: `deriveCurrent(root, {goals})`
  for `{atoms, edges}`; `citationGraph(root)` (imported from `./contract.mjs`) for `citationGraph`;
  `readPolicy(root).policy` (may be `null`) for `bandScale`; `bands: {}` and `bandBounds: {}` (the two
  flagged, honest-empty defaults); `priorVerdicts: []` (no live per-atom verdict history store yet —
  name this as a THIRD small honest default in your commit message, not a silent omission — it means
  the R1 "second independent exhaustion" auto-promotion never fires until a real store exists; the
  happy-path test only exercises a FIRST checkpoint, so this default does not break T04a).
- Overwrite `stamped.effects` with `eff.provisional` (+ the ceremony-escalation effect, if any,
  appended) and set `stamped.pendingPermanent = eff.permanent`.

## Negative Constraints (DO NOT)
- Do NOT implement the `ratification` two-phase fold or the ceremony-escalation unwind (T05b).
- Do NOT change any existing `EVENT_SCHEMAS` entry, any Family-1/Family-2 code path, or the CLI section.
- Do NOT let a `null` `policy` (readPolicy returns `{policy: null}` when `policy.json` is absent) throw
  — guard every access (`(policy && policy.dials && policy.dials.bandScale) || []`).

## Implementation Steps

### Step 1: Add the imports

Near the top of `lib/ledger.mjs`, immediately after the existing import block (`import { validateEffects
} from './effects.mjs';`), add:

```js
import { computeVerdictEffects, ceremonyEscalation } from './rewrite.mjs';
import { deriveCurrent } from './graph.mjs';
import { citationGraph } from './contract.mjs';
import { readGoals } from './goals.mjs';
import { readPolicy } from './policy.mjs';
```

### Step 2: Add the two `EVENT_SCHEMAS` entries

Find this block (Family 3):

```js
  'atom-flag-set': { required: ['atomId', 'flag'] },
  'atom-flag-cleared': { required: ['atomId', 'flag'] },
```

Add immediately after it:

```js
  // reasonable 3.0 Part 7 (§2.4, §7.2): a COLLISION-FREE 3.0-verdict event type, keyed on
  // atomId+kind, distinct from the live 2.x work-order-keyed 'verdict' above. append() code-computes
  // its provisional effect set (see the withLock body below) — no agent, and not the frontier
  // workflow, ever authors one. 'phase-degenerated' is the exact shape lib/ceremony.mjs already emits
  // ({type:'phase-degenerated', phase, reason, inputs}) — P7 appends it verbatim.
  'atom-verdict': { required: ['atomId', 'kind'] },
  'phase-degenerated': { required: ['phase'] },
```

### Step 3: Add the `append()` verdict branch

Find the Family-3 `else` arm inside the `withLock` callback:

```js
      } else {
        // Family 3 — loose. workOrder resolution is BEST-EFFORT here: a miss leaves node absent
        // rather than failing the whole append (unlike Family 1/2, which fail loud).
        if (event.workOrder !== undefined) {
          const tree = buildTree(root);
          const found = findById(tree, event.workOrder);
          if (found) stamped.node = found.path;
        }
      }
```

Replace it with:

```js
      } else {
        // Family 3 — loose. workOrder resolution is BEST-EFFORT here: a miss leaves node absent
        // rather than failing the whole append (unlike Family 1/2, which fail loud).
        if (event.workOrder !== undefined) {
          const tree = buildTree(root);
          const found = findById(tree, event.workOrder);
          if (found) stamped.node = found.path;
        }

        // reasonable 3.0 Part 7 (§2.4): append() — not the frontier loop, not any agent — code-computes
        // the effect set for an atom-verdict, exactly as it code-computes `seq` above (D19). The
        // snapshot is READ-ONLY canonical state (deriveCurrent — never a lane's in-flight divergence).
        // An unknown/illegal verdict kind HALTs (§7.2 Totality, fail-closed) — nothing is written.
        if (type === 'atom-verdict') {
          const { goals } = readGoals(root);
          const { policy } = readPolicy(root);
          const graph = deriveCurrent(root, { goals: goals || [] });
          const state = {
            atoms: graph.atoms,
            edges: graph.edges,
            citationGraph: citationGraph(root),
            bandScale: (policy && policy.dials && policy.dials.bandScale) || [],
            // Flagged, honest defaults (shared/interfaces.md §2) — no live per-cone band store and no
            // policy.dials.bandBounds field exist yet; these under-fire (never over-fire) the ceremony
            // triggers that depend on them, rather than inventing a shape no loader produces.
            bands: {},
            bandBounds: {},
            // No live per-atom verdict-history store yet either — the R1 "second independent
            // exhaustion" auto-promotion cannot fire until one exists (flagged, same discipline).
            priorVerdicts: [],
          };
          const eff = computeVerdictEffects(stamped, state);
          if (!eff.ok) return { ok: false, error: eff.error };
          const esc = ceremonyEscalation(stamped, state);
          stamped.effects = esc ? [...eff.provisional, esc] : eff.provisional;
          stamped.pendingPermanent = eff.permanent;
        }
      }
```

### Step 4: Run the locked test to verify it passes

Run: `node test/ledger-atom-verdict.test.mjs`

Expected: `ledger-atom-verdict: all <N> checks passed. ✓`, zero `FAIL` lines.

### Step 5: Confirm zero regression to the whole suite

```bash
for t in test/*.test.mjs; do node "$t"; done
```

No `FAIL` line anywhere — `test/ledger.test.mjs`, `test/ledger-effects.test.mjs`,
`test/atom-ledger.test.mjs`, every `reconcile-*` test, and every Phase A frontier test all still pass.
This is the first task in the plan that edits a genuinely live-engine file — treat any regression as a
stop-the-line signal, not a thing to patch around.

### Step 6: Commit

```bash
git add lib/ledger.mjs
git commit -m "feat(ledger): host computeVerdictEffects/ceremonyEscalation inside append() behind a new atom-verdict event type (green, P7)" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

## Acceptance Criteria
- [ ] `node test/ledger-atom-verdict.test.mjs` passes with zero failures
- [ ] The two new `EVENT_SCHEMAS` entries exist and do not alter any existing entry
- [ ] `append()`'s verdict branch fires only on `type === 'atom-verdict'`, computes the snapshot from
      `deriveCurrent`/`citationGraph`/`readGoals`/`readPolicy` (all tolerant of absence), and HALTs
      (writes nothing) on an unknown/illegal kind
- [ ] `stamped.effects` is always the controller-computed value; `stamped.pendingPermanent` carries the
      permanent set separately
- [ ] The whole existing suite still passes; no file outside Scope was modified
