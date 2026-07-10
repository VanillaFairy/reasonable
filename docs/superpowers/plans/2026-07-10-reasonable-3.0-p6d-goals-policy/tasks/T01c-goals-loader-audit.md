# T01c — goals.json loader audit

**role:** audit
**Depends on:** T01b
**Owns:** nothing (read-only — report findings; do not edit code, tests, or docs)

> **Read first:** `../shared/interfaces.md`, `../shared/conventions.md`, and `lib/route.mjs` (the
> conservative-loader contract this mirrors). You are the `audit` role: adversarially verify the T01a
> tests AND the T01b implementation. You have Bash for read-only verification. You **fix nothing** —
> you report gap findings, each of which becomes a new `red` task the supervisor schedules.

**The audit checklist — run each, report the result:**

- [ ] **Discriminator (teeth): the tests must fail without the implementation.** Confirm the red state
  was real. `git show HEAD~1:lib/goals.mjs` should not exist before T01b (the file is new this triad).
  Definitive check: temporarily stub `readGoals` to `return { goals: null, diagnostic: null }` in a
  scratch copy and confirm **many checks FAIL** — every "valid" case (normalized entry, order,
  round-trip, servesEdges compose) and every "malformed -> diagnostic" case must fail against that stub
  (the stub returns `diagnostic: null`, but the malformed cases assert a non-empty string). Restore.
  Report how many fail (expect the large majority; only the absent-file cases survive the stub).

- [ ] **Bidirectional contract mapping.** Walk both directions and report any unmapped item:
  - **Every assertion → a contract clause** (`shared/interfaces.md` / `route.mjs`'s three-state
    contract). Each `check()` pins absent / malformed / valid, all-or-nothing, degrade-to-null,
    citations-verbatim, order-preserved, or the servesEdges composition. Flag any test that pins
    something the contract leaves open (e.g. an exact diagnostic string — there should be none).
  - **Every contract clause → an assertion.** absent-file (both variants), invalid-JSON,
    root-not-array, entry-not-object, missing/empty id, missing/non-string scenario,
    scenarioCitations-not-array, citation-not-object / missing-clause / empty-clause,
    all-or-nothing, ratifiedAt/ledgerSeq degrade, empty-array-valid, order-preserved,
    citations-verbatim, servesEdges compose. Flag any clause with **no** test.

- [ ] **Adversarial gap hunt — propose failing cases the suite misses.** Actively try to break it.
  Candidates (add a finding for any the suite misses or the impl gets wrong):
  - a goal whose `scenarioCitations` contains a **valid** citation followed by a malformed one — does
    the per-`j` loop catch the second (all-or-nothing within one entry)?
  - a `ledgerSeq` of `0` — `Number.isFinite(0)` is `true`, so `0` must be **carried through, not
    coerced to null** (a real off-by-`0` trap; the seq of an empty ledger is `0`, per `route.json`'s
    own note). Confirm the impl keeps `0`.
  - a `ledgerSeq` that is a float or `NaN`/`Infinity` — `NaN`/`Infinity` are not finite → null; a plain
    float is finite → kept. Confirm.
  - a citation object carrying **extra** fields beyond `component`/`clause` — are they preserved
    (verbatim), matching the "objects survive" contract?
  - a top-level entry that is an **array** (`[]`) — `typeof [] === 'object'` but `Array.isArray` is
    true, so it must be rejected as "expected an object." Confirm the `Array.isArray(entry)` guard.

- [ ] **Purity + Law 1.** Confirm `lib/goals.mjs` imports only `node:fs` + `node:path` (no
  `clause-id.mjs`, no `ledger.mjs`, no third-party), reads exactly one file, calls no `append()`, and
  never throws on a missing dir. Confirm it never repairs/defaults/partial-trusts (one bad part → whole
  load null), matching `route.mjs`.

- [ ] **Regression + additivity.** Run the full suite:
  ```bash
  for t in test/*.test.mjs; do node "$t"; done
  ```
  Confirm no `FAIL` anywhere and that P6d added a **new** file only — no existing `lib/*.mjs` changed
  behavior (`route.mjs`, `graph.mjs`, `reconcile.mjs`, `next-action.mjs` untouched — Call #1).

**Report format:** a short list of findings, each `CONFIRMED` (reproduced) or `PLAUSIBLE`, with the
concrete input → wrong/missing output. If the suite is clean and the mapping is total, say so plainly —
an empty findings list is the correct result for a solid triad. Any confirmed gap becomes a new `red`
task (T01a-2, …) the supervisor dispatches before T03.
