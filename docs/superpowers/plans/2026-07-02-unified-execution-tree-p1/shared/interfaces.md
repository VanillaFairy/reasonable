# Shared Interfaces — Plan 1

**Version:** 1.0 — every signature here is a contract between tasks. A green task implements
these EXACTLY; a red task asserts against these EXACTLY. Drift = bug.

---

## 1. `lib/progress-tree.mjs` (produced by T01b; consumed by T02b, T03b, T04)

```js
export const STATUSES = ['pending', 'active', 'done', 'failed', 'canceled'];
export const TERMINAL = ['done', 'canceled'];           // skipped by recursive status
export const GLYPH = { pending: '·', active: '▶', done: '✓', failed: '✗', canceled: '⊘' };

// Node shape (also the progress.json shape — the tree serializes as-is):
// { id: string, label: string, status: string, detail: string|null,
//   statusTs: string|null, notes: [{ text, ts }], children: [Node] }
// Root node has id '' and is addressed by path ''.

export function createTree(label)        // → root Node (status 'pending', empty children)
export function apply(tree, op)          // mutates tree in place, returns tree; THROWS TypeError
                                         //   on unknown op.op, invalid status, malformed segment
export function findByPath(tree, path)   // → Node | null       (path 'a/b/c'; '' → root)
export function findById(tree, id)       // → { node, path } | null — depth-first pre-order,
                                         //   FIRST match wins; null if not found
export function countByStatus(tree)      // → { pending, active, done, failed, canceled }
                                         //   counts every node EXCEPT the root
export function renderMarkdown(tree)     // → markdown of the tree BODY only (no header):
                                         //   nested '- <glyph> <label>' bullets, 2-space indent
                                         //   per depth; detail rendered as '  _(detail)_' suffix;
                                         //   active/failed nodes with statusTs get a literal
                                         //   '   [YYYY-MM-DD HH:MM:SS UTC]' suffix; notes render
                                         //   as child bullets '- ✎ [ts?] text' under their node,
                                         //   the note ts in the SAME 'YYYY-MM-DD HH:MM:SS UTC'
                                         //   form (raw fallback if unparseable; no bracket if absent)
```

### Path & segment grammar

- A path is segment ids joined by `/`. `''` addresses the root. Leading/trailing `/` invalid.
- Segment grammar: non-empty, no whitespace, no slash, no ASCII control characters. In code: SEG_RE = /^[^\s/]+$/ plus a scan rejecting any char with charCodeAt(0) < 32.
  (`§4`, `attempt-2`, `WO-S2-wire`, `audit-2` are all valid.)
- Ids are unique among siblings only. Labels are free text; default label = the segment id.

### Operation semantics (the exact rules red tests pin)

```js
{ op: 'inject', path, label?, status?, detail? }
// Missing ancestors auto-created as pending stubs (label = their segment id).
// Path already exists → IDEMPOTENT MERGE: label/detail overwritten IF provided;
//   status is NOT touched on merge (only a brand-new node takes op.status, default 'pending').
{ op: 'update', path, label?, detail? }
// Sets provided fields. Missing node/ancestors auto-created (pending stubs) first.
{ op: 'status', path, status, detail?, recursive?, ts?, guardPending? }
// ALWAYS sets the target node's status (+ detail if provided, + statusTs = ts if provided).
// recursive: true → every DESCENDANT whose status is not in TERMINAL is also set to `status`
//   (their detail/statusTs untouched). The target itself is always set, terminal or not.
// recursive: 'active' → sweeps ONLY descendants whose status is 'active' (orphaned in-flight
//   nodes whose own finish event was lost), leaving pending ones untouched — used by the
//   terminal transitions (node-completed/report-finished/node-failed) so a completed parent
//   never leaves a stale ▶active leaf, yet never fake-completes a step that never ran.
// guardPending: true → the ENTIRE op (status/detail/ts) is skipped unless the node's CURRENT
//   status is 'pending'. Used by progress-map.mjs to nudge a container (attempt-N folder,
//   implementation/section folder, ...) to 'active' the moment work starts under it, without
//   ever demoting an already-active node or resurrecting a terminal one back to active.
// Missing node → auto-created then set.
{ op: 'note', path, text, ts? }
// Pushes { text, ts: ts ?? null } onto node.notes. Missing node → auto-created.
```

Totality: ordering problems NEVER throw (auto-create + idempotent merge). Malformed input
(unknown op, bad status, bad segment) ALWAYS throws — that's a mapper bug surfacing loudly.

---

## 2. Ledger event vocabulary (produced by T03b's schemas; consumed by T02b's EVENT_MAP, T10–T13)

`KINDS = ['work-order', 'spike', 'scaffold', 'grill-pass', 'slice', 'phase']`

Every appended line gets script-stamped: `seq` (monotonic int, from `appendJsonl`), `ts` (ISO
UTC, controller's clock — an agent-supplied ts is OVERWRITTEN). Additional per-type stamps below.

### Family 1 — node lifecycle

| type | required fields | controller stamps | EVENT_MAP ops |
|---|---|---|---|
| `node-planned` | `node`, `kind`, `title` | — | `inject {path:node, label:title, status:'pending'}` |
| `node-dispatched` | `node`, `kind` | `attempt` (see arithmetic) | if `attempt>1`: `status {path: node+'/attempt-'+(attempt-1), status:'failed', recursive:true}` (NO detail — preserves a crash detail already there); always: `inject {path: node+'/attempt-'+attempt, label:'attempt '+attempt, status:'active'}` (the fresh attempt folder itself opens active, not pending), a `status {..., status:'active', guardPending:true}` per proper ancestor of `node` (so a containing slice/phase shows active too), `status {path:node, status:'active', ts}` |
| `node-checkpointed` | `node` | — | `status {path:node, status:'pending', detail:'checkpointed'}` |
| `node-downgraded` | `node` | `attempt` (current) | `status {path: node+'/attempt-'+attempt, status:'failed', recursive:true, detail:'lost-work crash'}`, `status {path:node, status:'pending', detail:'downgraded — awaiting redispatch'}` |
| `node-completed` | `node` | — | `status {path:node, status:'done', detail:null, ts, recursive:'active'}` (sweeps orphaned in-flight descendants closed) |
| `node-failed` | `node` (`reason` optional) | — | `status {path:node, status:'failed', detail:reason, ts, recursive:'active'}` |
| `node-canceled` | `node`, `reason` | — | `status {path:node, status:'canceled', recursive:true, detail:reason}` |
| `approval-resolved` | `id` | — | `note {path:'', text:'approval resolved: '+id}` (banner fold arrives in Plan 2) |
| `concluded` (existing) | — | — | `status {path:'', status:'done'}` |

**Node resolution for Family 1:** any Family-1 event may supply `workOrder` (a node id) instead
of `node`; the controller resolves it via `findById` on `buildTree(root)`'s result and stamps the
absolute `node`. Unresolvable → `{ ok:false, error }` — agents treat that as fatal (fail loud);
`reconcile.mjs` tolerates it as non-fatal in Plan 1 (recovery must not die because the progress
tree is thin).

### Family 2 — worker reports

| type | agent supplies | controller stamps | EVENT_MAP ops |
|---|---|---|---|
| `report-started` | `under` (node id), `node` (RELATIVE path), `label?` | absolute `node` = path(under) + '/attempt-N/' + relative | a `status {..., status:'active', guardPending:true}` per proper ancestor of `node` (attempt-N, section folders, ...), `inject {path:node, label}`, `status {path:node, status:'active', ts}` |
| `report-finished` | `under`, `node` (relative) | same | same ancestor-activation ops, `inject {path:node}`, `status {path:node, status:'done', ts, recursive:'active'}` (sweeps orphaned in-flight descendants closed) |
| `report-canceled` | `under`, `node` (relative), `reason` | same | same ancestor-activation ops, `inject {path:node}`, `status {path:node, status:'canceled', detail:reason}` |

After stamping, the event on disk carries the ABSOLUTE `node`; `under` is kept as provenance.
The mapper never sees a relative path.

### Family 3 — domain events (existing types, unchanged fields)

`enrichment, amendment, characterization, characterization-promotion, change-characterized,
change-characterized-planned, verdict, verifier-verdict, scope-expansion, budget-extension,
dead-end, ratification, intent-check-failure, commit` — validated loosely (known type ⇒ ok;
`enrichment`/`characterization` additionally require `component`). If the event has `workOrder`
and no `node`, the controller stamps `node` = `findById(tree, workOrder).path` when resolvable
(else leaves it absent). EVENT_MAP maps every Family-3 type to ONE op:
`note {path: e.node ?? '', text: formatText(e), ts: e.ts}` — `formatText` ports the existing
`actionLine()` switch from `lib/progress.mjs` verbatim (the per-type one-liners), WITHOUT the
`enrichmentChildren` regex splitter (deleted, not ported).

### Unknown / legacy types (`action-started`, `action-finished`, `action-obsoleted`, anything else)

- The CONTROLLER rejects unknown types (fail loud) — new writes must use the vocabulary.
- The MAPPER (which reads history) folds unknown types to
  `note {path: valid(e.node) ? e.node : '', text: e.type + (e.workOrder ? ' · '+e.workOrder : ''), ts: e.ts}`
  — old ledgers render honestly, degraded, without reconstruction.

---

## 3. `lib/progress-map.mjs` (produced by T02b; consumed by T03b, T04)

```js
export const EVENT_MAP;                       // { [type]: (event) => op[] } per §2 above
export function foldEvents(events, rootLabel) // seq-sorts a COPY, folds via apply() → tree
export function buildTree(root)               // reads <root>/.reasonable/ledger.jsonl,
                                              // rootLabel = journal.effort || basename(root)
export function writeMirror(root)             // buildTree + compose header + body →
                                              // writes .reasonable/progress.json (the tree, plus
                                              // { counts } from countByStatus) and progress.md;
                                              // returns the tree. Fail-open on absent ledger
                                              // (empty tree, still writes).
```

`progress.md` layout (composed here, body from `renderMarkdown`):

```
# reasonable · <effort>   —   ~<agents> agents · <tok> tok     ← cost line ONLY if journal.cost
_<done>/<total> done · <active> active · <failed> failed_       ← from countByStatus
<blank>
> Pin this file to follow the run live — regenerated on every ledger append. Times are UTC.
<blank>
<renderMarkdown body>
<blank>
> ⚠ **inbox: N awaiting you** — <kinds>                        ← ONLY if inbox.json has items
```

The cost line and inbox banner are the two documented presentation exceptions (they read
`journal.json` / `inbox.json`); nothing else reads outside the ledger.

---

## 4. `lib/ledger.mjs` (produced by T03b; consumed by T06, T07, T08, agents via CLI)

```js
export const KINDS;                    // per §2
export const EVENT_SCHEMAS;           // { [type]: { required: [...], validate?(e) } } registry
export function validateEvent(event)  // → { ok:true } | { ok:false, error } — pure, no I/O
export function append(root, event, opts = {})
// 1. validateEvent — { ok:false } out on failure (never throws).
// 2. Stamp: ts (always overwrite, new Date().toISOString()), attempt / absolute node
//    (via progress-map buildTree + progress-tree findById, per §2 rules).
// 3. appendJsonl(<root>/.reasonable/ledger.jsonl, stamped) — existing lock supplies seq.
// 4. Regen: writeMirror(root) unless opts.regen === false.
// → { ok:true, event: <stamped> } | { ok:false, error }
```

### Attempt arithmetic (exact, deterministic in durable state)

For the target node in `buildTree(root)`'s result, let `latest` = max N over children matching
`/^attempt-(\d+)$/` (0 if none):
- `node-dispatched`: no attempts → stamp 1. `latest` attempt's status `failed` OR the node's own
  status `failed` → stamp `latest + 1` (a reopen). Otherwise → stamp `latest` (continuation —
  checkpoint reclaim; if `latest` is 0 for an undispatched node, stamp 1).
- `node-downgraded`: stamp `max(latest, 1)`.
- `report-*` absolute path: `path(under) + '/attempt-' + max(latest, 1) + '/' + relative`.
- `under` id not found in the tree → `{ ok:false, error }` (fail loud, no guessing).

### CLI

```
node lib/ledger.mjs append --root <R> --type <T> [flags...]
node lib/ledger.mjs append --root <R> --json '<one JSON object>'
```

- Flag form: each `--name value` pair becomes an event field (`--type`, `--node`, `--kind`,
  `--title`, `--label`, `--under`, `--reason`, `--detail`, `--id`, `--component`, `--text`,
  `--workOrder`). Uses `argvWithoutRoot(process.argv).slice(2)` per the repo CLI convention.
- `--json` form: the object IS the event (for Family-3 domain payloads with arrays/nesting);
  other field flags may not be combined with it.
- Exit 0 on `{ ok:true }`; on `{ ok:false }` print `ledger: <error>` to stderr, exit 1.
- No `.reasonable/` at root → error (this CLI is only meaningful inside an effort).

---

## 5. `lib/progress.mjs` after T04 (consumed by hooks)

Retains ONLY the CLI surface: `--json` (print buildTree), default (print composed markdown),
`--write` / `--regen` (writeMirror; `--regen` silent fail-open), `--hook` (stdin PostToolUse
payload; regen when the written file is a canonical `<effortRoot>/.reasonable/ledger.jsonl` —
journal/inbox no longer trigger). All heavy lifting imported from `progress-map.mjs`.
Deleted: `replayActions`, `sectionsFromEnrichment`, `enrichmentChildren`, `actionLine` (moved
into progress-map as `formatText`), ts-suppression, all three old glyph tables.
