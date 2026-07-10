# T02c — policy.json loader audit

**role:** audit
**Depends on:** T02b
**Owns:** nothing (read-only — report findings; do not edit code, tests, or docs)

> **Read first:** `../shared/interfaces.md`, `../shared/conventions.md`, `lib/route.mjs` (the mirrored
> contract), and `lib/rewrite.mjs`'s `ceremonyEscalation` (the `dials.bandScale` consumer). You are the
> `audit` role: adversarially verify the T02a tests AND the T02b implementation. Read-only + Bash. You
> **fix nothing** — you report gap findings, each becoming a new `red` task.

**The audit checklist — run each, report the result:**

- [ ] **Discriminator (teeth): the tests must fail without the implementation.** `lib/policy.mjs` is
  new this triad. Definitive check: temporarily stub `readPolicy` to `return { policy: null, diagnostic:
  null }` and confirm **many checks FAIL** — every "valid" case (verbatim, pass-through, bandScale,
  shape-not-value, round-trip) and every "malformed -> diagnostic" case (which asserts a non-empty
  string diagnostic against the stub's `null`). Restore. Report the count (expect the large majority;
  only the absent-file cases survive).

- [ ] **Bidirectional contract mapping.** Walk both directions and report any unmapped item:
  - **Every assertion → a contract clause** (`shared/interfaces.md`). Each `check()` pins absent /
    malformed / valid, verbatim pass-through, open-grammar extras survive, shape-not-value, or one of
    the four sub-shape gates. Flag any test pinning something the contract leaves open (e.g. an exact
    diagnostic string — there should be none; or a per-band `phaseCutoffs`/`cadenceIndex` **value**
    shape, which the loader deliberately does NOT gate).
  - **Every contract clause → an assertion.** absent (both variants), invalid-JSON, root-not-object,
    and each of: weights missing / not-object / empty / non-numeric-value; legibility missing /
    missing-a-key / non-numeric; cadence missing / empty / band-non-object / band-missing-m; dials
    missing / bandScale-not-array / bandScale-empty / bandScale-non-string / phaseCutoffs-missing /
    cadenceIndex-not-object; verbatim pass-through; shape-not-value; bandScale-is-ordered-string-array.
    Flag any clause with **no** test.

- [ ] **Adversarial gap hunt — propose failing cases the suite misses.** Actively try to break it:
  - a `weights` value of `0` or a negative number — `Number.isFinite` accepts both; confirm they load
    clean (shape-not-value; a zero-weighted axis is legal).
  - a `weights` value of `NaN`/`Infinity` — not finite → must be rejected. Does the suite (or should a
    gap task) cover it? (`JSON` cannot encode `NaN`/`Infinity`, so this can only arise post-parse; note
    it as a known JSON boundary, not a required test.)
  - a `cadence.<band>` carrying **extra** keys beyond `n`/`m` — the gate checks `n` and `m` are finite
    but does not forbid extras; confirm that is intended (open per-band shape) and does not fail the load.
  - a `dials` carrying **extra** sub-keys beyond bandScale/phaseCutoffs/cadenceIndex — must survive
    (verbatim pass-through). Confirm.
  - order-of-checks: a policy that is malformed in **two** places (e.g. bad weights AND missing dials)
    — the diagnostic names the **first** failure (weights). Confirm the check order weights → legibility
    → cadence → dials is stable and tested-consistent.

- [ ] **Composition contract with `rewrite.mjs`.** Confirm `policy.dials.bandScale` is validated as an
  ordered array of non-empty strings — the exact shape `ceremonyEscalation` does `scale.indexOf(current)`
  into (`lib/rewrite.mjs`). A `bandScale` that loaded as a non-array or with a non-string element would
  break that consumer silently; the loader must reject it. Confirm the guard + a test cover this.

- [ ] **Purity + Law 1.** Confirm `lib/policy.mjs` imports only `node:fs` + `node:path`, reads exactly
  one file, never throws on a missing dir, and never repairs/defaults/partial-trusts. Confirm it returns
  the parsed object **verbatim** on success (no reshape) — the deliberate open-grammar divergence.

- [ ] **Regression + additivity.** Run the full suite:
  ```bash
  for t in test/*.test.mjs; do node "$t"; done
  ```
  Confirm no `FAIL` anywhere and that P6d added **new** files only — no existing `lib/*.mjs` changed
  behavior (Call #1: `route.mjs`/`reconcile.mjs`/`next-action.mjs` untouched).

**Report format:** a short list of findings, each `CONFIRMED` or `PLAUSIBLE`, with the concrete input →
wrong/missing output. An empty findings list is the correct result for a solid triad. Any confirmed gap
becomes a new `red` task (T02a-2, …) the supervisor dispatches before T03.
