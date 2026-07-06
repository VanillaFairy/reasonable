// progress-map.mjs — the read-side fold (Plan 1 "organs" rework; spec:
// docs/superpowers/specs/2026-07-02-unified-execution-tree-design.md; contract:
// docs/superpowers/plans/2026-07-02-unified-execution-tree-p1/shared/interfaces.md §3).
//
// Ledger events are pure FACTS; EVENT_MAP is where INTERPRETATION lives. A ledger event
// type maps to zero or more progress-tree ops (inject/update/status/note), folded through
// progress-tree.mjs's `apply()`. Because interpretation is centralized here and the tree is
// always rebuilt by full replay (never accumulated by hand), fixing a mapping bug re-renders
// the ENTIRE history correctly on the next fold — no migration ever needed.
//
// This module reads the ledger; it never writes it (the ledger controller, a later task, is
// the only sanctioned write path). Import direction is one-way, controller -> this module ->
// the tree store — this file must never import the controller module.

import { createTree, apply, countByStatus, renderMarkdown } from './progress-tree.mjs';
import { readJson, readJsonl, basename, join } from './effort.mjs';
import { writeFileSync, renameSync, unlinkSync } from 'node:fs';

// ── Family 3 / legacy note formatting ───────────────────────────────────────────────
// Ported verbatim from the pre-slim lib/progress.mjs's clausesOf()/actionLine(). Supports
// BOTH e.clauses (array, preferred) and the singular e.clause fallback. Deliberately does
// NOT port the old regex paragraph-splitter that used to fragment an enrichment note into
// several child bullets — every domain event folds to exactly one note, full stop.
function clausesOf(e) {
  return Array.isArray(e.clauses) && e.clauses.length ? e.clauses : (e.clause ? [e.clause] : []);
}

function formatText(e) {
  const clauses = clausesOf(e);
  const cl = clauses.length ? ` ${clauses.join(',')}` : '';
  switch (e.type) {
    case 'enrichment': return `enriched ${e.component || '?'}${cl}`;
    case 'amendment': return `amended ${e.component || '?'}${cl} (${e.direction || 'weaken'})`;
    case 'characterization': return `characterized ${e.component || '?'}${cl}${e.test ? ` (${e.test})` : ''}`;
    case 'characterization-promotion': return `promoted ${e.component || '?'}${cl} FLOOR→TRUSTED`;
    case 'change-characterized':
    case 'change-characterized-planned': return `superseded ${e.component || '?'}${cl}`;
    case 'verdict': return `verdict: ${e.kind || '?'}${e.bindingConstraint ? ` (${e.bindingConstraint})` : ''}`;
    case 'verifier-verdict': return `adversary ${e.verdict || '?'} ${e.component || ''}`.trim();
    case 'scope-expansion': return `scope +[${(e.addedLocus || []).join(', ')}]`;
    case 'budget-extension': return `budget +1 (extension ${e.extension ?? '?'})`;
    case 'dead-end': return `dead-end${e.knowledge ? ` → ${e.knowledge}` : ''}`;
    case 'ratification': return `ratified ${e.gate || ''} gate`.replace('  ', ' ');
    case 'intent-check-failure': return `intent-check miss: ${e.correctedChoice || ''}`;
    default: return `${e.type}${e.component ? ` ${e.component}` : ''}`;
  }
}

// A single Family-3 entry factory — every domain event maps to EXACTLY one note op.
function domainNote(e) {
  return [{ op: 'note', path: e.node ?? '', text: formatText(e), ts: e.ts }];
}

// ── EVENT_MAP ────────────────────────────────────────────────────────────────────────
// One entry per Family-1/2/3 ledger event type. By the time an event reaches this fold it is
// already stamped (node is an absolute path — a retry is the sibling `name[k]` the controller
// minted, never a wrapper) — this table does no stamping, no resolution, pure interpretation.
//
// No cascade, no ancestor activation: a container's status is DERIVED from its children by
// progress-tree.mjs's displayStatus (a parent shows active while a child is active, done when its
// children are done, panic when a live child panics), so a status op only ever touches its own
// node. That is what retires the old recursive sweeps, guardPending ancestor-nudging, and heal.
export const EVENT_MAP = {
  // Family 1 — node lifecycle. `node` is absolute; a retry's node is already `…/base[k]`.
  'node-planned': (e) => [{ op: 'inject', path: e.node, label: e.title, status: 'pending' }],
  // A dispatch opens the node (a fresh WO, or the `name[k]` retry sibling the controller minted)
  // as active. No prior-attempt seal — the prior attempt was already sealed by whatever failed it
  // (node-failed / node-downgraded / node-panicked); the retry is just a new live sibling.
  'node-dispatched': (e) => [
    { op: 'inject', path: e.node, status: 'active' },
    { op: 'status', path: e.node, status: 'active', detail: null, ts: e.ts },
  ],
  'node-checkpointed': (e) => [{ op: 'status', path: e.node, status: 'pending', detail: 'checkpointed' }],
  // A lost-work crash seals the node (its live attempt) failed; the next dispatch mints the retry.
  'node-downgraded': (e) => [{ op: 'status', path: e.node, status: 'failed', detail: 'lost-work crash', ts: e.ts }],
  'node-completed': (e) => [{ op: 'status', path: e.node, status: 'done', detail: null, ts: e.ts }],
  // `failed` is NON-terminal: the node is down and under investigation. It does not complete on its
  // own and (via derivation) blocks its parent's done, but does not by itself compromise the parent.
  'node-failed': (e) => [{ op: 'status', path: e.node, status: 'failed', detail: e.reason ?? null, ts: e.ts }],
  // `panic` is terminal + unrecoverable: it escalates and (via derivation) compromises the parent.
  'node-panicked': (e) => [{ op: 'status', path: e.node, status: 'panic', detail: e.reason ?? null, ts: e.ts }],
  'node-canceled': (e) => [{ op: 'status', path: e.node, status: 'canceled', detail: e.reason }],
  'approval-resolved': (e) => [{ op: 'note', path: '', text: `approval resolved: ${e.id}` }],
  'concluded': () => [{ op: 'status', path: '', status: 'done' }],
  // A walked-away effort is torn down the same cheap way a concluded one is: the root goes done.
  'abandoned': () => [{ op: 'status', path: '', status: 'done' }],

  // Family 2 — worker reports (event.node is already absolute). Just open/close the leaf; the
  // container statuses above it fall out of derivation.
  'report-started': (e) => [
    { op: 'inject', path: e.node, label: e.label },
    { op: 'status', path: e.node, status: 'active', ts: e.ts },
  ],
  'report-finished': (e) => [
    { op: 'inject', path: e.node },
    { op: 'status', path: e.node, status: 'done', ts: e.ts },
  ],
  'report-canceled': (e) => [
    { op: 'inject', path: e.node },
    { op: 'status', path: e.node, status: 'canceled', detail: e.reason },
  ],

  // Family 3 — domain events: exactly one note, never structure
  'enrichment': domainNote,
  'amendment': domainNote,
  'characterization': domainNote,
  'characterization-promotion': domainNote,
  'change-characterized': domainNote,
  'change-characterized-planned': domainNote,
  'verdict': domainNote,
  'verifier-verdict': domainNote,
  'scope-expansion': domainNote,
  'budget-extension': domainNote,
  'dead-end': domainNote,
  'ratification': domainNote,
  'intent-check-failure': domainNote,
  'commit': domainNote,

  // Layer 2 (§7.1) — a next-action projection is a HEADER projection, not a lifecycle node. It
  // produces NO tree op: the read-side re-derives the LATEST such event into progress.json.nextAction
  // + the ▶ NEXT block separately (see composeNextAction / writeMirror). The explicit []-entry keeps
  // it from falling to legacyFallback, which would otherwise stamp a spurious note on the root.
  'next-action': () => [],
};

// Unknown/legacy types (action-started, action-finished, action-obsoleted, or anything not
// in EVENT_MAP) degrade to a plain note — never reconstructed structure. This is the fold's
// own fallback, deliberately NOT an EVENT_MAP table entry (see interfaces.md §3).
function legacyFallback(e) {
  const path = (typeof e.node === 'string' && e.node) ? e.node : '';
  const text = e.type + (e.workOrder ? ` · ${e.workOrder}` : '');
  return [{ op: 'note', path, text, ts: e.ts }];
}

function opsFor(e) {
  const mapper = e && typeof e.type === 'string' && Object.hasOwn(EVENT_MAP, e.type)
    ? EVENT_MAP[e.type]
    : undefined;
  return mapper ? mapper(e) : legacyFallback(e);
}

// ── the fold ─────────────────────────────────────────────────────────────────────────
// Sorts a COPY (never mutates the caller's array) by seq (0 default), then folds each
// event's ops through progress-tree's apply(). Total: the try block wraps BOTH the
// EVENT_MAP lookup/handler invocation (opsFor) AND the apply() calls, so it catches two
// different kinds of failure — a malformed op that makes apply() throw, and a bug inside
// an EVENT_MAP handler itself (e.g. a typo dereferencing an undefined field). Either way,
// the offending event degrades to a "[fold error]" note on the root instead of killing the
// whole fold — but note a handler bug will recur on every occurrence of that event type,
// not just once, since the table entry itself is what's broken.
export function foldEvents(events, rootLabel) {
  let tree = createTree(rootLabel);
  const sorted = [...(events || [])].sort((a, b) => (a?.seq || 0) - (b?.seq || 0));
  for (const e of sorted) {
    try {
      // Apply this event's ops to a scratch copy first: either ALL of them succeed and the
      // scratch copy becomes the new real tree, or one throws partway through and the scratch
      // copy — along with whatever it partially mutated — is simply discarded, leaving the
      // real tree exactly as it was before this event. Prevents a phantom subtree from a
      // corrupted historical event that throws on its 2nd/3rd op after its 1st already "took".
      const scratch = structuredClone(tree);
      for (const op of opsFor(e)) apply(scratch, op);
      tree = scratch;
    } catch (err) {
      try {
        apply(tree, {
          op: 'note',
          path: '',
          text: `[fold error] ${(e && e.type) || '?'} (seq ${e && e.seq}): ${(err && err.message) || err}`,
        });
      } catch { /* the degrade note itself is malformed — give up on this event silently */ }
    }
  }
  return tree;
}

// ── buildTree: read the ledger, fold it ─────────────────────────────────────────────
export function buildTree(root) {
  const dir = join(root, '.reasonable');
  const events = readJsonl(join(dir, 'ledger.jsonl')); // fail-open: [] when absent/unparseable
  const journal = readJson(join(dir, 'journal.json'));
  const rootLabel = (journal && journal.effort) || basename(root);
  return foldEvents(events, rootLabel);
}

// ── writeMirror: compose + persist progress.json + progress.md ─────────────────────
// Small token-count formatter, ported from the pre-slim lib/progress.mjs's fmtTokens/costLine.
function fmtTokens(n) {
  if (n == null) return '?';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return Math.round(n / 1e3) + 'k';
  return String(n);
}
function costLine(cost) {
  if (!cost) return '';
  const a = cost.agentsDispatched ?? '?';
  const t = fmtTokens(cost.tokensSpent);
  return `~${a} agents · ${t} tok`;
}

// ── next-action projection render (§7.1, Layer 2) ───────────────────────────────────
// One directive → a compact string. Shared by the mirror's ▶ NEXT block and reconcile's briefing
// NEXT line (reconcile imports renderDirectives), so the on-screen grammar has ONE source. The
// directive shape is next-action.mjs's { kind, slice?, workOrders?, workOrder?, detail? }.
export function renderDirective(d) {
  if (!d || typeof d !== 'object') return '?';
  const wos = Array.isArray(d.workOrders) ? d.workOrders.join(', ') : '';
  switch (d.kind) {
    case 'DISPATCH': return `DISPATCH slice ${d.slice ?? '?'} → ${wos}`;
    case 'RUNNING': return `RUNNING ${wos}`;
    case 'RETRO': return `RETRO slice ${d.slice ?? '?'}`;
    case 'OPEN': return `OPEN slice ${d.slice ?? '?'}`;
    case 'DECIDE': return d.workOrder ? `DECIDE ${d.workOrder}` : (d.detail ? `DECIDE (${d.detail})` : 'DECIDE');
    case 'HALT': return d.detail ? `HALT: ${d.detail}` : 'HALT';
    case 'AMBIGUOUS': return d.detail ? `AMBIGUOUS: ${d.detail}` : 'AMBIGUOUS';
    case 'LAND': return 'LAND';
    case 'CONCLUDE': return 'CONCLUDE';
    case 'DONE': return 'DONE';
    default: return String(d.kind ?? '?');
  }
}

// A directive SET → one compact ` · `-joined line; an empty set → "(idle)".
export function renderDirectives(directives) {
  const arr = Array.isArray(directives) ? directives : [];
  return arr.length ? arr.map(renderDirective).join(' · ') : '(idle)';
}

// The LATEST `next-action` event in `events` → the rendered mirror string (the directive set plus
// the mechanical-staleness suffix), or null when the ledger carries no next-action event at all
// (a Layer-1 / pre-first-reconcile effort — the caller then omits progress.json.nextAction and the
// ▶ NEXT block, and session-start falls back). "Latest" is highest seq (ties: later in file wins).
//
// Mechanical staleness (§7.1): the suffix is `— computed at seq <computedFrom>, <staleness>` where
// <staleness> is `fresh` when K === 0 else `<K> event(s) since`, and K = the count of ledger events
// with seq > computedFrom whose type !== 'next-action'. A next-action is a projection, not a state
// change, so it NEVER counts toward its own (or a sibling projection's) staleness — right after
// reconcile appends one, K === 0 → "fresh". K grows as real events land, so "a directive with K>0 is
// a hint, not an order" (§7.1) is mechanically checkable off the mirror. `computedFrom` is 1-based; an
// empty-ledger projection omits it (see ledger.mjs), which renders as "computed at seq 0".
function composeNextAction(events) {
  const arr = Array.isArray(events) ? events : [];
  let latest = null;
  for (const e of arr) {
    if (!e || e.type !== 'next-action') continue;
    if (latest === null || (Number(e.seq) || 0) >= (Number(latest.seq) || 0)) latest = e;
  }
  if (latest === null) return null;
  const computedFrom = Number.isInteger(latest.computedFrom) && latest.computedFrom > 0 ? latest.computedFrom : 0;
  let k = 0;
  for (const e of arr) {
    if (!e || typeof e !== 'object' || e.type === 'next-action') continue;
    if ((Number(e.seq) || 0) > computedFrom) k += 1;
  }
  const staleness = k === 0 ? 'fresh' : `${k} event(s) since`;
  return `${renderDirectives(latest.directives)} — computed at seq ${computedFrom}, ${staleness}`;
}

function composeProgressMd(tree, counts, cost, inboxItems, nextActionStr) {
  const lines = [];
  const cost1 = costLine(cost);
  lines.push(`# reasonable · ${tree.label}${cost1 ? `   —   ${cost1}` : ''}`);
  const total = counts.pending + counts.active + counts.done + counts.failed + counts.canceled;
  lines.push(`_${counts.done}/${total} done · ${counts.active} active · ${counts.failed} failed_`);
  // The ▶ NEXT block sits right under the header/counts line (beside the ⚠ inbox blockquote's style),
  // so the persisted directive is the first thing a reader sees. Omitted when there is no projection.
  if (nextActionStr) {
    lines.push('');
    lines.push(`> ▶ **NEXT** — ${nextActionStr}`);
  }
  lines.push('');
  lines.push('> Pin this file to follow the run live — regenerated on every ledger append. Times are local, with a UTC offset.');
  lines.push('');
  lines.push(renderMarkdown(tree));
  if (inboxItems.length) {
    lines.push('');
    lines.push(`> ⚠ **inbox: ${inboxItems.length} awaiting you** — ${inboxItems.map((i) => i.kind || '?').join(', ')}`);
  }
  lines.push('');
  return lines.join('\n');
}

// Atomically publish `content` to `target`: write a private per-process temp
// (`<target>.tmp-<pid>`), then `renameSync` over the target — an atomic same-volume swap on NTFS
// and POSIX. So a concurrent reader never observes a half-written progress.* file, and the
// unsynchronized caller of writeMirror (session-start / the PostToolUse mirror refresh, which holds
// no ledger lock) still can't tear it. The distinct `<pid>` suffix keeps two processes regenerating
// the mirror at once from clobbering each other's temp. On any failure the temp is cleaned up, so a
// crashed write never leaves a stray `progress.*.tmp-*` behind.
function atomicWrite(target, content) {
  const tmp = `${target}.tmp-${process.pid}`;
  try {
    writeFileSync(tmp, content);
    renameWithRetry(tmp, target);
  } catch (e) {
    try { unlinkSync(tmp); } catch { /* never created, or already gone */ }
    throw e;
  }
}

// Dependency-free synchronous sleep (lib/ stays node-builtins only): block the thread for `ms` via
// Atomics.wait on a throwaway shared buffer — no busy-spin, no timer, no import.
function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// Windows rename hardening (layer0-checkpoint flag #4): a concurrent reader (an editor, a pinned
// progress.md preview, an AV scanner) can transiently hold the target with a share mode that blocks
// the atomic swap, surfacing as EPERM/EBUSY. Left unhandled it throws → append() swallows it as an
// advisory `mirrorError` and the mirror lags one append behind. A few attempts with a tiny escalating
// synchronous backoff clears the vast majority of these transient locks. ONLY EPERM/EBUSY is retried;
// every other error rethrows immediately (a real problem — a bad path, a full disk — must surface at
// once). After the last attempt it rethrows exactly as before (still advisory upstream, never fatal).
function renameWithRetry(tmp, target) {
  const MAX_ATTEMPTS = 5;
  for (let attempt = 1; ; attempt += 1) {
    try {
      renameSync(tmp, target);
      return;
    } catch (e) {
      if ((e.code === 'EPERM' || e.code === 'EBUSY') && attempt < MAX_ATTEMPTS) {
        sleepSync(attempt * 10); // 10, 20, 30, 40 ms — bounded (~100 ms worst case) and rare
        continue;
      }
      throw e;
    }
  }
}

// Fail-open with respect to bad ledger DATA: an absent, empty, or malformed ledger/journal/
// inbox yields an empty tree (via buildTree/foldEvents) and a plain header, and both mirror
// files still get written. That guarantee doesn't extend to the OS/filesystem layer — a
// missing `.reasonable` directory, or a disk/permissions failure on the write calls below,
// still throws.
export function writeMirror(root) {
  const dir = join(root, '.reasonable');
  const tree = buildTree(root);
  const counts = countByStatus(tree);
  const journal = readJson(join(dir, 'journal.json')) || {};
  const inboxJson = readJson(join(dir, 'inbox.json'));
  const inboxItems = (inboxJson && Array.isArray(inboxJson.items)) ? inboxJson.items : [];

  // §7.1: re-derive the LATEST next-action projection from the ledger on EVERY regen. This is what
  // makes the directive survive the wholesale mirror rebuild BY CONSTRUCTION — it lives in the truth
  // log and is re-read here, never a field poked into progress.json that a regen would clobber. Null
  // when the ledger carries no next-action event → the key + the ▶ NEXT block are both omitted.
  const events = readJsonl(join(dir, 'ledger.jsonl')); // fail-open: [] when absent/unparseable
  const nextActionStr = composeNextAction(events);

  // SPREAD: the tree object itself plus a `counts` key (+ `nextAction` when a projection exists) —
  // never a {tree, counts} wrapper. Each file is published atomically (tmp + rename), same on-disk
  // shape writeJson produced (2-space JSON + trailing newline). session-start.mjs reads
  // progress.json.nextAction as a trimmed STRING — that string IS the contract this render emits.
  const progressObj = { ...tree, counts };
  if (nextActionStr !== null) progressObj.nextAction = nextActionStr;
  atomicWrite(join(dir, 'progress.json'), JSON.stringify(progressObj, null, 2) + '\n');
  atomicWrite(join(dir, 'progress.md'), composeProgressMd(tree, counts, journal.cost, inboxItems, nextActionStr));

  return tree;
}
