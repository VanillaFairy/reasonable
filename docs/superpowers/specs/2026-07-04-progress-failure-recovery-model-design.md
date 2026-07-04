# Design: progress failure/recovery model — derived containers, the investigator lifecycle, attempts as siblings

**Date:** 2026-07-04
**Status:** approved in discussion (this document is the written record; user reviews it before planning)
**Version impact:** refines the 2026-07-02 unified-execution-tree design. Grows the status enum
(Decision 3 there) and replaces the cascade/sweep derivation with a local, derived one. Touches the
ledger vocabulary and the write-side attempt stamping — treat as part of the 2.x line, sequenced
after the unified-execution-tree landing.

## Why

The trigger was a real run (slice 4 of the `graph-editor-ux-overhaul` effort). A slice was
transiently blocked ("needs adjudication"), its work orders finished, and the slice completed — yet
the rendered tree showed a permanent `✗ attempt 1` wedged between a `✓` work order and its `✓`
leaves, and the header's failed count read 13 when the true number was ~2.

The first fix attempt added a `heal` op that walked cascade-`failed` containers back to `done` under
a pile of conditions. That was patching a symptom. The real diagnosis:

- The fold **stores a status on container nodes** and then tries to keep it correct with **downward
  cascades** (`recursive` sweeps). Once a stored container status is wrong, it needs a `heal` to
  walk it back. Both the cascade and the heal are machinery that exists only because containers hold
  a value that can rot.
- The always-present **`attempt-1` wrapper node** is the specific node that never receives its own
  terminal event, so it's the one thing left scarred after everything real self-corrects.
- **`Failed` was a single, flat thing.** A failure that will be retried and a failure that is final
  are different facts, and only one of them should reach the parent — but nothing in the ledger said
  which, so the fold had no honest way to tell them apart.

The cure is to stop storing container status entirely (derive it, locally, from direct children),
drop the attempt wrapper (an attempt is a *sibling*, not a node), and split `Failed` into a
recoverable state and a terminal one, with the distinction **authored into the ledger** rather than
guessed by the fold.

## The model

### Node identity — an attempt is not a node

A tree node is one unit of work. Its first run **is** the node. A re-run is a **sibling** with the
same base name and an attempt suffix — `name`, `name[2]`, `name[3]`. The base name groups the
*attempt family*; the **live representative** of a family is its highest `[k]`. There is no
`attempt-*` wrapper node — in the common single-attempt case there is nothing extra at all.

`[k]` is applied **at the level that is restarted — not above it, not below it.** Restarting a work
order mints `WO[2]`; its children start fresh, unsuffixed.

### Leaves are authored; containers are derived

A node with **no children** takes its status from the events that target it directly. A node **with
children** carries no status of its own — it is a pure function of its direct children (below).
Nothing is ever swept or healed, because a parent never holds a value that can go stale. This
deletes `recursive` sweeps, `guardPending` ancestor-activation, the orphan sweep, and `heal`.

### Status vocabulary

| status | glyph | terminal? | meaning |
|---|---|---|---|
| `pending` | · | no | not started |
| `active` | ▶ | no | working |
| `done` | ✓ | yes | succeeded |
| `failed` | ↻ | no | **down, under investigation** — recoverable; may gain a restart sibling |
| `panic` | 💥 | yes | unrecoverable here — escalates, and compromises the parent |
| `canceled` | ⊘ | yes | deliberately abandoned (killed subtree of a restarted unit / scope cut) |

`failed` and `panic` are the two distinct failure icons. Crucially, **`failed` is *not* a completing
status** — see the lifecycle below.

### The failure lifecycle

```
 active
   │  hits a wall
   ▼
 failed ──investigator finds a workaround──▶ restart sibling  N[k]  is created
   │                                          (N stays `failed` = superseded history,
   │                                           excluded from the parent; N[k] carries on)
   │  investigator finds nothing
   ▼
 panic ──▶ escalates to the user  +  N's parent is compromised
                                     → the parent enters `failed` → its own investigator → …
```

When a node hits a wall it enters **`failed`** and a separate **investigator agent** launches. It
either finds a workaround — in which case a restart sibling `N[k]` is created and the old `N` stays
`failed` as superseded history — or it finds nothing, and `N` flips to **`panic`**, which escalates
to the user *and* compromises `N`'s parent. The parent then enters `failed`, runs its own
investigator, and the same loop climbs the tree until some level recovers or it reaches the root and
lands on the user.

`failed` and its `[k]` restart can happen at **any level** — a leaf that finds its own workaround
becomes `leaf[2]`; a leaf that can't escalates via `panic` and its container enters `failed`.

### Container derivation

A container's status is derived from its **live** direct children (superseded `failed` attempts and
`canceled` children are shown but excluded):

- **`panic`** if any live child is `panic` — the compromise bubbles up… *unless* the container
  itself has a successor sibling, in which case it is `failed` (recoverable). Supersession overrides
  its own derivation and halts the bubble at the restart boundary.
- else **`active`** if any live child is `active`, **or** any live child is `failed`
  (still investigating — see below);
- else **`done`** if all live children are `done`;
- else **`pending`**.

**Parent is `done` iff every live child is `done`.** A `failed`-still-investigating child, a `panic`
child, or any `active`/`pending` child all keep it out of `done`.

### Why `failed` blocks `done` (and why the old ordering invariant is gone)

An earlier proposal was to enforce write ordering — "seal a node `failed` only after its restart
sibling exists" — so a parent never briefly reads `done` in the gap before the retry spawns. The
investigator flow makes that impossible (a node is `failed` *during* investigation, before any
sibling) and, better, unnecessary: **`failed` is simply a non-completing status.** A `failed` child
blocks its parent's `done` on its own, so there is no premature-`done` window to close with ordering
rules. The fold stays a dumb pure function of ledger state and needs no timing logic.

### Authored vs derived — the division of labor

- The **runner** (via the investigator) *authors* the failure/recovery transitions: `failed`,
  `restart N[k]`, `panic`, and the `cancel` of a restarted unit's killed subtree. Escalation logic
  lives here, where it belongs.
- The **fold** only *reflects* those authored facts and *derives* the happy-path aggregation
  (`pending`/`active`/`done`) plus supersession/cancel exclusion. It never invents a `panic` by
  itself.

## Axioms (the closed set)

1. **Node ≠ attempt.** First run is the node; a re-run is a sibling `name[k]` at the restarted level
   only. Base name groups the family; live rep = highest `[k]`.
2. **Leaves authored, containers derived.** A childless node takes its own events' status; a node
   with children is a pure function of its live direct children. Nothing is swept or healed.
3. **Derivation** (over live children): `panic` if any live child panics (unless self is superseded
   → `failed`); else `active` if any live child is `active` or `failed`; else `done` if all live are
   `done`; else `pending`.
4. **`failed` is non-terminal and non-completing.** It is the "under investigation" state; it blocks
   the parent's `done` and resolves to either a superseded-with-successor `failed`, or `panic`.
5. **`panic` is terminal and compromises the unit.** It escalates to the user and drives the parent
   into `failed` (its own investigator). Recovery is always a restart of some enclosing-or-self unit,
   never an edit of the dead node.
6. **Failure/recovery is authored; happy-path is derived.** The runner emits the failure lifecycle
   events and the cancel of killed subtrees; the fold reflects and aggregates, never inventing
   failure.

## What this changes in the code (for the follow-on plan, not this note)

- **`progress-tree.mjs`:** grow `STATUSES`/`GLYPH` with `panic`; `TERMINAL` becomes `{done, panic,
  canceled}` (note `failed` is now non-terminal). Delete the `recursive` sweep modes and
  `guardPending`. Add derivation: a container's rendered/counted status is computed from children,
  not stored. `countByStatus` and `renderMarkdown` read the derived status.
- **`progress-map.mjs`:** the `EVENT_MAP` loses the attempt-wrapper injection, `ancestorActivationOps`,
  and all `recursive`/sweep ops. New/changed events for the investigator lifecycle
  (`node-failed` → `failed` non-terminal, a restart/redispatch that mints `name[k]` as a sibling,
  `node-panicked`, and a `cancel-subtree` for the killed actives).
- **`ledger.mjs` (write side):** the attempt number stops being stamped *into the path* as
  `/attempt-N/`; instead a restart mints a sibling id `name[k]` at the restarted level. `attemptState`
  / `nextDispatchAttempt` / `resolveFamily2` are reworked accordingly.
- **`interfaces.md`:** the §1 op table and §3 EVENT_MAP table are rewritten to match; the derivation
  rule is added as the container-status contract.
- **Tests:** the sweep, ancestor-activation, and orphan-sweep cases in `progress-tree.test.mjs` /
  `progress-map.test.mjs` encode the old model and are replaced by derivation cases and the failure
  lifecycle (investigate → restart-sibling, investigate → panic → parent-failed, premature-`done`
  prevention, canceled-killed-subtree).

## Acceptance sketch (real slice-4 shape, under the new model)

A slice blocks, its work orders finish, the slice completes:

- Each work order's sections reach `done` → the work order derives `done` (no wrapper to scar).
- The slice's live children are all `done` → the slice derives `done`.
- The transient block survives as a **note/detail**, not a status — no `✗` anywhere, and the failed
  count is 0.

A work order that genuinely dies and can't be worked around:

- The failing section → `panic`; its work order enters `failed`; the investigator finds no
  workaround → the work order → `panic` → the slice enters `failed` → escalates to the user. Every
  step is authored, and the fold shows exactly the compromised path.
