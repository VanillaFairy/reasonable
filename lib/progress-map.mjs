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
import { readJson, readJsonl, writeJson, basename, join } from './effort.mjs';
import { writeFileSync } from 'node:fs';

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

function composeProgressMd(tree, counts, cost, inboxItems) {
  const lines = [];
  const cost1 = costLine(cost);
  lines.push(`# reasonable · ${tree.label}${cost1 ? `   —   ${cost1}` : ''}`);
  const total = counts.pending + counts.active + counts.done + counts.failed + counts.canceled;
  lines.push(`_${counts.done}/${total} done · ${counts.active} active · ${counts.failed} failed_`);
  lines.push('');
  lines.push('> Pin this file to follow the run live — regenerated on every ledger append. Times are UTC.');
  lines.push('');
  lines.push(renderMarkdown(tree));
  if (inboxItems.length) {
    lines.push('');
    lines.push(`> ⚠ **inbox: ${inboxItems.length} awaiting you** — ${inboxItems.map((i) => i.kind || '?').join(', ')}`);
  }
  lines.push('');
  return lines.join('\n');
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

  // SPREAD: the tree object itself plus a `counts` key — never a {tree, counts} wrapper.
  writeJson(join(dir, 'progress.json'), { ...tree, counts });
  writeFileSync(join(dir, 'progress.md'), composeProgressMd(tree, counts, journal.cost, inboxItems));

  return tree;
}
