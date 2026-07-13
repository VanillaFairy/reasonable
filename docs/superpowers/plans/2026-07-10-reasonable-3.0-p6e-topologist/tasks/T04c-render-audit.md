# T04c — Self-contained HTML renderer audit — THE SELF-CONTAINMENT AUDIT

**role:** audit
**Depends on:** T04b
**Owns:** nothing (read-only — report findings; do not edit code, tests, or docs)

> **Read first:** `../shared/interfaces.md` (§B2 — the `renderTopologyHtml` signature, the three views,
> the self-containment invariant, the diff tags, the optional legibility annotation),
> `../shared/conventions.md`, DESIGN-3.0 §5.3, and the plan's **"The self-containment discipline"**
> section (why T04a/T04c are unusually adversarial) + **Flag 2** (the `goalId`/`legibility` option
> augmentation). You are the `audit` role: adversarially verify the T04a tests AND the T04b
> implementation. You have Bash for read-only verification. You **fix nothing** — you report gap
> findings, each of which becomes a new `red` task the supervisor schedules (the P6a/P6b/P6c/P6d
> pattern: an audit finding is a fresh follow-up commit, never a blocking redo).
>
> **This is THE load-bearing audit of the render half.** §5.3 + Law 1 make `topology.html`
> **self-contained by construction** — "no CDN, no npm." A helpful external `<script src>` or
> Google-Fonts `<link>` renders fine locally and could slip past a naive shape check while breaking the
> invariant that a ratifier opens the file in an air-gapped terminal or a PR review. Attack this
> directly, with real teeth (a stubbed renderer that emits an external reference MUST break the check).
>
> **Audit the FULL file, both halves.** T04b appended below the marker; the layout half (T03b, already
> audited by T03c) must be untouched. Confirm the marker discipline held — this audit is also where a
> silent edit above the marker would first surface.

**The audit checklist — run each, report the result:**

- [ ] **Discriminator (teeth) — the no-external-reference attack.** In a scratch copy of
  `lib/topology-view.mjs`, mutate the renderer to leak an external reference and confirm the matching
  self-containment assertions MUST fail:
  - splice `<script src="https://d3js.org/d3.v7.min.js"></script>` into the returned HTML — the
    "no external http(s) URL" and "no external script" assertions MUST fail;
  - splice `<link href="https://fonts.googleapis.com/css2" rel="stylesheet">` in — the "no `<link>`"
    assertion MUST fail;
  - splice `@import url(foo.css);` into the `<style>` block — the "no `@import`" assertion MUST fail;
  - splice a bare protocol-relative reference (e.g. `src="//cdn.example.com/x.js"`) in — **both** the
    protocol-relative check and the `cdn` check MUST fail;
  - splice the literal substring `cdn` into an otherwise-inert attribute — the "no cdn reference"
    assertion MUST fail.
  Restore the scratch copy after each mutation. Report which checks fell for each mutation; any mutation
  the suite does not catch is a hole in the self-containment pin — the load-bearing finding of this
  audit.

- [ ] **Per-view discriminator.** In a scratch copy, neuter `project()` so it always returns the
  `component` projection regardless of `view` — confirm "the three views route to different renderings"
  and the cone-selection tests MUST fail. Separately, neuter `coneProjection` to ignore `goalId` and
  return every atom — confirm "cone view selects exactly the atoms serving the goal" and "cone view for
  an unknown goal renders an empty diagram" MUST fail. Restore. Report any view whose mutation leaves the
  suite green.

- [ ] **Diff correctness — the tagging attack.** In a scratch copy, neuter `diffProjection` so every
  node/edge is tagged `'unchanged'` regardless of prior state — confirm the added/retired/unchanged and
  the rewired-edge tests MUST fail. Hand-build one additional diff fixture beyond T04a's (e.g. an edge
  whose `edge` kind changes between two surviving components, with no endpoint change) and confirm it is
  tagged `rewired`, not `unchanged`. Report any diff case that mistags.

- [ ] **Cone correctness beyond the locked cases.** Hand-build a fixture with two goals and confirm the
  cone view for one goal never leaks an atom serving only the other goal. Confirm an atom serving the
  named goal transitively through no `needs` edge (only a direct `serves`) still appears. Report any
  cross-cone leak or dropped atom.

- [ ] **Purity + Law 1 (the render half).** Confirm the appended section (below the marker) imports
  **nothing new** — `liftEdges` is reused from the existing top-of-file import; no new `import` line
  appears anywhere in the diff. Confirm no `node:fs`, no `legibility.mjs`, no `policy.mjs`/`goals.mjs`,
  no `Math.random`/`Date`. Confirm `renderTopologyHtml` is pure — same input, same output — by calling it
  twice on an identical fixture and comparing.

- [ ] **Marker intact + layout half unchanged.** Run:
  ```bash
  git diff --unified=0 <the T03b commit>..HEAD -- lib/topology-view.mjs
  ```
  Confirm every changed line sits **below** the `// ── B2. renderTopologyHtml appended by T04b — do not
  edit above this line ──` marker, and the marker line itself is unchanged. Confirm `layoutTopology`'s
  body (above the marker) is byte-identical to what T03c audited. Re-run
  `node test/topology-layout.test.mjs` and confirm it is still green (a silent edit above the marker
  would be the one regression this repo's file-ownership discipline exists to prevent).

- [ ] **Bidirectional §5.3 mapping.** Walk both directions, report any unmapped item:
  - **Every T04a assertion → a §5.3 render clause** (self-containment / component quotient via
    `liftEdges` / per-goal cone / diff tagging / optional legibility annotation / graceful degeneration).
    Flag any assertion pinning a golden SVG string or exact coordinate the design leaves open — the tests
    must pin *properties and content markers* (`data-node-id`, `data-diff`, `data-finding`, the absence
    regexes), never an over-fitted golden.
  - **Every §5.3 render clause → an assertion** (self-containment, the three views, cone selection, diff
    tags, the optional findings annotation). Flag any §5.3 render clause with no test. (Known, correct
    scope boundary — not a gap: the layout algorithm's own properties — rank-consistency, crossing
    reduction, cycle-safety — are the *layout's* (T03), already audited by T03c; do not re-flag their
    absence here.)

- [ ] **Regression + additivity.** Run the full suite:
  ```bash
  for t in test/*.test.mjs; do node "$t"; done
  ```
  Confirm no `FAIL` anywhere (`topology-layout` + `topology-view` both green, zero regressions across
  P1–P6d) and that **no file other than `lib/topology-view.mjs`** changed since T04a's commit — T04b owns
  only that one file, appending only below the marker.

**Report format:** a short list of findings, each `CONFIRMED` (reproduced) or `PLAUSIBLE`, with the
concrete mutation → assertion that should have caught it but didn't. The self-containment discriminator
findings (if any) are **blocking** — flag them as such; a leaked external reference is a methodology hole
(`topology.html` is the human's ratification surface), not a cosmetic gap. If every mutation is caught,
the marker discipline held, and the mapping is total, say so plainly — an empty findings list is the
correct result for a solid triad. Any confirmed gap becomes a new `red` task (`T04a-2`, …) the supervisor
dispatches (a fresh follow-up commit) before T05.
