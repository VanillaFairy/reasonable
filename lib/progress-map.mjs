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
// One entry per Family-1/2/3 ledger event type. By the time an event reaches this fold it
// is already stamped (node is an absolute path, attempt is a resolved integer) — this table
// does no stamping, no resolution, pure interpretation only.
export const EVENT_MAP = {
  // Family 1 — node lifecycle
  'node-planned': (e) => [{ op: 'inject', path: e.node, label: e.title, status: 'pending' }],
  'node-dispatched': (e) => {
    // attempt 1 (first dispatch) has no prior attempt to seal — skip straight to opening
    // attempt-1. attempt > 1 (a redispatch) seals the PRIOR attempt failed first, with
    // recursive:true so its own descendants (in-flight sections/items) don't linger active.
    if (e.attempt > 1) {
      return [
        { op: 'status', path: `${e.node}/attempt-${e.attempt - 1}`, status: 'failed', recursive: true },
        { op: 'inject', path: `${e.node}/attempt-${e.attempt}`, label: `attempt ${e.attempt}` },
        { op: 'status', path: e.node, status: 'active', detail: null, ts: e.ts },
      ];
    }
    return [
      { op: 'inject', path: `${e.node}/attempt-1`, label: 'attempt 1' },
      { op: 'status', path: e.node, status: 'active', detail: null, ts: e.ts },
    ];
  },
  'node-checkpointed': (e) => [{ op: 'status', path: e.node, status: 'pending', detail: 'checkpointed' }],
  'node-downgraded': (e) => [
    { op: 'status', path: `${e.node}/attempt-${e.attempt}`, status: 'failed', recursive: true, detail: 'lost-work crash' },
    { op: 'status', path: e.node, status: 'pending', detail: 'downgraded — awaiting redispatch' },
  ],
  // A terminal transition sweeps stray ACTIVE descendants (recursive:'active'): if a node
  // completes/fails, any child still showing active lost its own finish event (node-path drift
  // orphans it) and must not linger as a stale "active" leaf under a terminal parent. PENDING
  // descendants are spared — a completed node must not fake-complete a step that never ran.
  'node-completed': (e) => [{ op: 'status', path: e.node, status: 'done', detail: null, ts: e.ts, recursive: 'active' }],
  'node-failed': (e) => [{ op: 'status', path: e.node, status: 'failed', detail: e.reason ?? null, ts: e.ts, recursive: 'active' }],
  'node-canceled': (e) => [{ op: 'status', path: e.node, status: 'canceled', recursive: true, detail: e.reason }],
  'approval-resolved': (e) => [{ op: 'note', path: '', text: `approval resolved: ${e.id}` }],
  'concluded': () => [{ op: 'status', path: '', status: 'done' }],

  // Family 2 — worker reports (event.node is already absolute)
  'report-started': (e) => [
    { op: 'inject', path: e.node, label: e.label },
    { op: 'status', path: e.node, status: 'active', ts: e.ts },
  ],
  'report-finished': (e) => [
    { op: 'inject', path: e.node },
    // recursive:'active' — a finished node sweeps any orphaned in-flight child (its own
    // finish lost to node-path drift) closed, so no ▶active leaf survives under a ✓done node.
    { op: 'status', path: e.node, status: 'done', ts: e.ts, recursive: 'active' },
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
