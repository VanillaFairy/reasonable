# Task T05: Version bump (human decision required) + final check

**Role:** none — but this task has a hard, non-negotiable STOP built into it. Read it in full
before doing anything.

## References
- Read: `CLAUDE.md` (the versioning rule — **"major — breaking change — confirm with the user
  first, never bump this alone"**)
- Read: `docs/superpowers/specs/2026-07-08-reasonable-3.0-p2-contract-grammar-v3-design.md`'s
  "Version bump: leaning MAJOR, and a finding worth surfacing loudly" section — the full reasoning
  behind this task's STOP
- Read: `../knowledge/running-tests.md`

## Dependencies
- Depends on: T01c, T02c, T03, T04 (all prior work must be landed and clean)
- Depended on by: — (last task in this plan)

## Scope

**Files:**
- Modify: `.claude-plugin/plugin.json`
- Modify: `README.md`

**BOUNDARY — you MUST NOT modify any files outside this list.**

## Why this task does not just pick a number

Part 1 bumped `2.7.2 → 2.8.0` (minor) automatically, without asking, because it was a
purely-additive, backward-compatible change — `CLAUDE.md` explicitly authorizes automatic minor/
patch bumps. **This part is different in kind, not just degree**: it retires positional `§N`
clause addressing outright (a hard cutover, no dual-format support, per DESIGN-3.0 §12). Any
`.reasonable/contracts/*.md` file written in the old grammar stops parsing as having any clauses
at all the moment this code ships — and `lib/contract.mjs` is not 3.0-only, speculative
infrastructure: `lib/footprint.mjs` and `lib/citation-resolve.mjs` both import from it **today**,
and both are exercised by the currently-shipping, ratified 2.x methodology. That means this change,
if it reaches the plugin's released line, breaks contract parsing for **every existing 2.x
reasonable effort with live contracts**, immediately on upgrade — not just future 3.0 adopters who
opted in.

`CLAUDE.md` is explicit that a major bump needs a human nod **before** it's taken, never decided
unilaterally in the same turn as the fix. This task's job is to present the question, not answer
it.

## STOP — Step 1: present the decision to the human before touching any file

Before editing `.claude-plugin/plugin.json` or `README.md`, present this to the user (via
`AskUserQuestion` if available in your execution context, or by asking directly in your response
and waiting for a reply):

> Part 2 of the Reasonable 3.0 roadmap retires positional `§N` clause addressing in
> `lib/contract.mjs` — a hard, breaking cutover with no dual-format support. This breaks contract
> parsing for any existing `.reasonable/contracts/*.md` file written in the old grammar, including
> ones under the currently-shipping 2.x methodology (`lib/footprint.mjs` and
> `lib/citation-resolve.mjs` both depend on this parser today). `CLAUDE.md`'s SemVer rule requires
> a human nod before a major bump. Two options:
>
> 1. **Major** (e.g. `2.8.1 → 3.0.0`) — reflects that this is a genuine breaking change to an
>    on-disk, machine-parsed artifact format, consistent with how CLAUDE.md defines "breaking."
> 2. **Minor** (e.g. `2.8.1 → 2.9.0`) — if you'd rather treat this the way Part 1 was treated
>    (new, still-unratified 3.0-generation capability, not yet meant for general 2.x users to
>    encounter), accepting that this reasoning is weaker here than it was for Part 1's purely
>    additive change.
>
> Which do you want, and does Part 2 land on the plugin's normal released/main line at all right
> now, given DESIGN-3.0 is still an unratified draft — or would you rather this and future 3.0
> engine parts stage somewhere else until ratification?

**Do not proceed past this point until you have an explicit answer.** If you cannot reach the
human (fully unattended execution with no channel to ask), **halt this task and report the
blocker** — do not default to either number silently. Guessing which way the human would have
answered defeats the entire purpose of `CLAUDE.md`'s major-bump gate.

## Positive Constraints (DO), once you have the human's answer
- Bump `.claude-plugin/plugin.json`'s `version` field to whatever the human chose.
- Update **every** place the version string appears (per `CLAUDE.md`): the `version` field in
  `.claude-plugin/plugin.json`, the install-snippet version in `README.md`, and the footer
  `Version:` line in `README.md`.
- Run the entire test suite and confirm zero failures before committing.

## Negative Constraints (DO NOT)
- Do NOT bump any version number before the human has answered the Step 1 question.
- Do NOT bump if any audit task (T01c/T02c) reported an unresolved `critical` finding, or if T03
  reported an unexplained consumer-source change — resolve those first, then return to T05.
- Do NOT modify any file outside the Scope section.

## Implementation Steps

### Step 1: Get the human's decision (see STOP above) — do this first, unconditionally

### Step 2: Bump `.claude-plugin/plugin.json`

Change:
```json
  "version": "2.8.1",
```
to (substituting whichever version the human chose):
```json
  "version": "<chosen-version>",
```

### Step 3: Bump `README.md`'s install snippet

Change:
```
{ "name": "reasonable", "source": "./reasonable", "version": "2.8.1" }
```
to:
```
{ "name": "reasonable", "source": "./reasonable", "version": "<chosen-version>" }
```

### Step 4: Bump `README.md`'s footer

Change:
```
*Design source of truth: `docs/DESIGN.md`. Normative vocabulary: `docs/glossary.md`. Version: v2.8.1.*
```
to:
```
*Design source of truth: `docs/DESIGN.md`. Normative vocabulary: `docs/glossary.md`. Version: v<chosen-version>.*
```

### Step 5: Run the full test suite

Run (see `../knowledge/running-tests.md`):

```bash
for t in test/*.test.mjs; do node "$t"; done
```

Expected: every file prints `all <N> checks pass. ✓` — no `FAIL` line anywhere in the output. This
is the WHOLE suite, not just this plan's new files — confirming this plan introduced zero
regressions anywhere else in the engine, and that the `§N`-to-`v3` cutover is complete (no other
test file anywhere still depends on positional clause ids parsing).

### Step 6: Commit

```bash
git add .claude-plugin/plugin.json README.md
git commit -m "chore(release): <chosen-version> — contract grammar v3, durable clause ids (reasonable 3.0 part 2)"
```

## Acceptance Criteria
- [ ] The human was asked, and explicitly answered, the major-vs-minor question BEFORE any version
      string was edited
- [ ] `.claude-plugin/plugin.json`'s version matches the human's choice
- [ ] Both `README.md` version strings match the human's choice
- [ ] The full test suite (`for t in test/*.test.mjs; do node "$t"; done`) shows zero `FAIL` lines
- [ ] No file outside Scope was modified
