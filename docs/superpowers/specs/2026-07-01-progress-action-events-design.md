# Design: progress reporting becomes agent-reported action events (retire the D19 heartbeat)

**Date:** 2026-07-01
**Status:** approved (design ratified by the user)
**Motivating cost:** the D19 "live heartbeat" tier (`lib/progress-live.mjs`, `progress-live.jsonl`)
samples every subagent tool call and shows the latest one as a floating "now" line. In practice
this produced two kinds of noise a human pinning `progress.md` should never see: a detached
`> now · role · tool target` section for no-work-order roles (scribe, a lane reclaim), and a
raw, log-like fallback line inside a work order whenever the sampled heartbeat's stage no longer
matched the pipeline's current frontier (e.g. a lane-provisioner reclaim after a checkpoint). Both
are the same root problem — "liveness" was modeled as *sampled tool-call content* instead of
*agent-reported, addressable facts* — and the fix is a redesign, not a rendering patch.

## The principle

Every worker in this methodology already narrates its own plan (many use `TodoWrite`) and already
appends its own line to `ledger.jsonl` when it finishes a unit of work (`enrichment`,
`characterization`, …). The heartbeat tier existed only because that reporting was too coarse —
once per work order, not once per clause — to keep a long-running stage from looking frozen. The
fix is to make the *existing* reporting granular and addressable, not to keep sampling raw tool
calls on top of it. Once every worker reports **when it starts and finishes a specific, named unit
of work**, the "is this still moving" question the heartbeat existed to answer is answered for
free, by the same append that already tells you *what* is moving.

## New ledger event vocabulary

Three new `ledger.jsonl` event types, all following the append-only, single-serialized-append
pattern every ledger writer already uses (`lib/effort.mjs`'s `appendJsonl`). No parallel file, no
TTL, no reset-on-reconcile — these are permanent history, exactly like every other ledger line.

```jsonc
{"type":"action-started","workOrder":"WO-12","level":"section","label":"implementation"}
{"type":"action-started","workOrder":"WO-12","level":"item","kind":"clause","ref":"§4","label":"precedence handling"}
{"type":"action-finished","workOrder":"WO-12","level":"item","ref":"§4"}
{"type":"action-started","workOrder":"WO-12","level":"item","kind":"adhoc","ref":"extract-helper","label":"extract shared span helper"}
{"type":"action-finished","workOrder":"WO-12","level":"item","ref":"extract-helper"}
{"type":"action-finished","workOrder":"WO-12","level":"section","label":"implementation"}
{"type":"action-started","workOrder":"WO-12","level":"section","label":"audit"}
{"type":"action-started","workOrder":"WO-12","level":"item","kind":"step","ref":"discriminator-check"}
{"type":"action-finished","workOrder":"WO-12","level":"item","ref":"discriminator-check"}
...
{"type":"action-obsoleted","workOrder":"WO-12","level":"item","kind":"clause","ref":"§4","reason":"covered by §3's new helper"}
```

Fields:

- `workOrder` — required on every line, as today.
- `level` — `"section"` or `"item"`. A section is a named span of work within one work order
  (`"implementation"`, `"audit"`, `"post-audit fixes"`, a second `"audit"` — sections are never
  deduplicated by label; the *n*-th `action-started` at `level:"section"` for a work order is
  simply the *n*-th section, in order). An item nests inside whichever section is currently open
  for that work order.
- `kind` (items only) — `"clause"` (a contract clause the work order is enriching/citing —
  `ref` is the clause id, e.g. `"§4"`), `"step"` (one entry from a small, code-defined catalog of
  a role's own fixed checklist — e.g. the auditor's `discriminator-check` /
  `bidirectional-mapping` / `mutation-sampling` / `proportionality-review`), or `"adhoc"` (a
  self-declared slug for work that fits neither — the agent invents a short, stable slug).
- `ref` — the stable identity of the item within its section (clause id, catalog slug, or
  ad hoc slug). Sections have no `ref` — they're addressed purely by position (see replay
  semantics below).
- `label` — optional human-readable text; falls back to `ref` (or the section's own `label`,
  which is required for sections since it's their only display text).
- `note` — optional, allowed on all three event types (a short free-text remark).
- `reason` — required on `action-obsoleted` (why this item no longer applies).

## Addressing & replay semantics

`progress.mjs` already groups ledger entries by `workOrder` (`actionsByWO`, seq-sorted). The
projection for a work order becomes a **plain sequential replay** of that group's
`action-started`/`action-finished`/`action-obsoleted` lines, in `seq` order:

- A `level:"section"` `action-started` closes whatever section was previously open (if any) and
  opens a new one. **Item identity resets per section** — `ref:"§4"` in the `"implementation"`
  section and `ref:"§4"` reported again in a later `"post-audit fixes"` section are two distinct
  rows in two distinct sections, never merged into one. This is the one subtlety a naive
  "latest event per ref, globally" reduction would get wrong.
- A `level:"item"` `action-started` opens a row inside the currently-open section.
- A row's status is derived, never stored: no start event → **pending** (`·`); start with no
  matching finish yet → **active** (`▶`); start + finish → **done** (`✓`); an `action-obsoleted`
  for that `(section, ref)` → **obsolete** (`⊘`), regardless of start/finish state.
- **No implicit closing.** Starting a new item does *not* imply the previous one finished. An
  item that was started and never explicitly finished before its section closes stays rendered
  active — an honest gap, not a hidden one (matches this codebase's parity principle: a claim
  that isn't backed by an event is never manufactured by the renderer).
- Sections/items only render once an `action-started` for them exists. There is no advance
  preview of a not-yet-dispatched section, and no advance preview of an untouched contract clause
  (previewing the full clause list would require `progress.mjs` to parse contract files, which it
  does not do today — deferred as a possible fast-follow, not part of this design).
- Two corner cases the replay must handle without ever throwing: a repeated `action-started` for
  a `ref` that's already open (no matching finish yet) is a no-op re-affirmation, not a second
  row; a `finished`/`obsoleted` naming a `ref` with no open `action-started` in the current
  section (e.g. a section closed out from under a worker mid-report) renders best-effort as its
  own row rather than being dropped or crashing the projection — matches the "never lie, never
  fail closed on presentation" posture the rest of `progress.mjs` already has.

This **replaces `pipelineFor`'s "furthest stage reached" frontier math entirely.** The fixed
`PIPELINE` array, `STAGE_INDEX`, `STAGE_FOR_ACTION`, and the conditional-stage-evidencing logic in
`lib/progress.mjs` are deleted, not extended — a plain replay has no need for a monotonic
high-water mark, which is what made a rework cycle (audit rejects → fix → re-audit) impossible to
render without rewriting history.

## Rendering

Each work order renders as its ordered section list, each section as its ordered item list, each
row carrying its status glyph and, for the currently-active row only, its literal `[HH:MM:SS]`
start timestamp (the existing `tsp()`/`hhmmss()` helpers are reused as-is — timestamps are always
"started at," never a duration; the reader infers duration from the gap to the next entry, exactly
as raised earlier in this design). No floating "now" section, anywhere, for anyone — every
reported fact has a hierarchical home by construction, because every event names the work order
(and, for items, the section) it belongs to.

Example (the sofia-plays scenario from the top of this conversation, corrected):

```
- ▶ **2-edge-auto-router**  _(active)_
  - ✓ `WO-S2-auto-route-core` — contracts: edge-router  _(green)_
    - ✓ implementation
      - ✓ §1 exists and routes
      - ✓ §2 channel selection
      - …
    - ✓ audit
      - ✓ discriminator-check
      - ✓ bidirectional-mapping
      - ✓ mutation-sampling
      - ✓ proportionality-review
  - ⏸ `WO-S2-wire-autoroute-into-edge` — contracts: edge-router, edge-path  _(checkpointed)_
    - ✓ implementation
      - ✓ §8 autoRoute bypass
      - ✓ §9 ephemeral waypoints
    - ✓ audit
      - ✓ discriminator-check
      - ✗ mutation-sampling — 3 survivors
    - ▶ post-audit fixes   [10:04:31]
      - ▶ fix survivor: guard missing self-loop branch
```

## Retiring the heartbeat tier

Deleted outright: `lib/progress-live.mjs`, `hooks/progress-live`, `test/progress-live.test.mjs`,
and the `PreToolUse` hook registration in `hooks/hooks.json` (the `Edit|Write|MultiEdit|
NotebookEdit|Bash|TodoWrite` matcher block that runs `progress-live`, currently lines 43–52). No
replacement hook is registered — see below. The existing `PostToolUse(Edit|Write|MultiEdit)` →
`progress` hook is untouched; it keeps regenerating the mirror whenever the canonical `journal.json`
/ `inbox.json` / `ledger.jsonl` files are directly edited (unchanged use case).

## The reporting mechanism: `lib/action-report.mjs`

A new CLI, invoked directly by an agent over Bash (not triggered by a hook — this is a
*deliberate* report, not passively sampled telemetry):

```
node lib/action-report.mjs --root <effortRoot> --workOrder WO-12 \
  --level item --kind clause --ref '§4' --label 'precedence handling' started
node lib/action-report.mjs --root <effortRoot> --workOrder WO-12 --level item --ref '§4' finished
node lib/action-report.mjs --root <effortRoot> --workOrder WO-12 \
  --level item --kind clause --ref '§4' --reason 'covered by §3' obsoleted
```

Reuses the existing `--root`/`rootFromArgv`/`argvWithoutRoot` convention every other lib CLI in
this repo already follows (`lib/progress.mjs`, `lib/progress-live.mjs`) — no new argument-parsing
scheme invented. Behavior:

1. Parse and validate fields for the named event kind (`started|finished|obsoleted`). A `section`
   level requires `label`; an `item` level requires `kind` and `ref`, and `kind:"adhoc"` requires
   its `ref` to look like a slug (no bare numbers, no whitespace) so it can't collide with a
   `clause`/`step` ref by accident.
2. Append via the (now-hardened, see below) shared `appendJsonl` in `lib/effort.mjs` — the same
   function every other ledger writer uses. **No new append/validate logic is duplicated here**:
   the CLI is a thin argument-to-event mapper over the existing shared writer.
3. Call `writeMirror(root)` (imported from `lib/progress.mjs`) before exiting, so `progress.md`
   reflects the report immediately — this is what gives the "forced frequency of updates" the
   heartbeat used to provide, for free, as a side effect of the report being useful in its own
   right.
4. **Fail loud** on a validation error (non-zero exit, message to stderr) — unlike the old
   heartbeat hook (which had to fail open because it ran silently on every tool call), this is an
   intentional call the agent made, so a malformed call should tell the agent immediately rather
   than vanish.

## Concurrency hardening of `appendJsonl`

`lib/effort.mjs`'s `appendJsonl` (used by every ledger writer, including this new one) computes
`seq` as "read the whole file, take the last line's `seq`, add 1, append" — a read-then-write race
under concurrent callers. It is latent today because ledger writes are infrequent; this design
makes them frequent and parallel (many lanes reporting section/item events concurrently), which
makes the race meaningfully more likely to fire in practice. In scope for this design: harden
`appendJsonl` with a simple advisory lock (exclusive lockfile create, short spin-retry with
backoff, release after) around the read-`seq`-then-append critical section. Same function
signature, same on-disk schema — every existing caller (`commit-record.mjs`, the contract-amendment
ceremony, every worker's own enrichment line) is unaffected except that it's now actually safe
under concurrency.

## Agent constitution touchpoints

- **The orchestrator** (main session / `vertical-slice-runner` workflow) owns section
  `started`/`finished` — it already knows exactly when it dispatches a phase and when that
  dispatch returns control, for both a normal wave stage and a rework phase like
  `"post-audit fixes"`.
- **Each dispatched worker** owns its own item-level `started`/`finished`/`obsoleted` calls:
  `implementer`/`blind-test-writer`/`characterizer` report per contract clause (`kind:"clause"`);
  `auditor` reports per entry in its own fixed step catalog; `adjudicator` reports per red/verdict
  it rules on. Narrow single-purpose roles (`lane-provisioner`) may skip item-level reporting
  entirely — the section alone (owned by the orchestrator) is informative enough for them.
- A small, code-defined `STAGE_ITEM_CATALOG` (same shape/spirit as today's `STAGE_BY_ROLE` in
  `lib/progress-live.mjs`, relocated) names the fixed step vocabulary for catalog-driven roles
  (auditor's four checks, to start) — **one place, reused by both the agent's own instructions and
  any future validation**, not re-declared per agent constitution.

Each affected `agents/*.md` gains one short, uniform paragraph describing when/how to call
`action-report.mjs` — phrased once and adapted per role, not reinvented per file.

## Docs updates

- `docs/DESIGN.md` §5.12 (D19 paragraph) — rewritten to describe agent-reported action events
  replayed sequentially, replacing the "ephemeral live tier … per-tool-call heartbeats" text.
- `docs/artifacts.md` — the `ledger.jsonl` section gains the three new event types (documented
  the same way every existing type is); the `progress-live.jsonl` section is deleted; the
  `progress.json`/`progress.md` section is rewritten to describe section/item nesting instead of
  the fixed pipeline scaffold.
- `docs/glossary.md` — add "section" and "action" (started/finished/obsoleted) as normative terms
  if they don't already carry a conflicting generic meaning there.

## Testing

- `test/progress-live.test.mjs` — deleted (the module it tests is gone).
- `test/progress.test.mjs` — the pipeline-scaffold and live-merge checks (sections G–L in the
  current file) are replaced with section/item replay tests: multi-section rendering, the
  post-audit-fixes rework scenario (as a direct acceptance test of the example above), the
  obsoleted-item glyph, and the started-without-finished honest-gap case.
- New `test/action-report.test.mjs` — CLI field validation (including the adhoc-ref-looks-like-a-
  slug check), correct ledger append, mirror regen, and fail-loud behavior on a bad call.
- `test/effort.test.mjs` — a concurrency test for the hardened `appendJsonl` (spawn N concurrent
  appends, assert every line gets a unique, gapless `seq`, no corrupted/interleaved lines).

## Code-quality constraints for the implementation

Per standing instruction: the implementation follows `/clean-code` (SOLID/DRY/KISS, no
patchwork). Concretely for this design: the section/item replay algorithm is one small, pure,
independently-testable function (input: seq-ordered events for one work order; output: the
section/item tree) — not inlined into `renderMarkdown`. The event-validation logic in
`action-report.mjs` and any future caller share one validator rather than each re-implementing
field checks. The `STAGE_ITEM_CATALOG` is declared once and imported everywhere it's needed
(agent-facing documentation generation, if any, and the CLI's validation), never copy-pasted.

## Deferred, not in scope

- Advance preview of untouched contract clauses (requires contract-file parsing in `progress.mjs`).
- Advance preview of a not-yet-dispatched section.
- Any change to the contract-amendment ceremony itself — `action-obsoleted` is a work-order-scoped,
  binding fact about *this* work order's checklist; it is not a contract weakening and does not
  touch `docs/DESIGN.md`'s ratchet rules.
