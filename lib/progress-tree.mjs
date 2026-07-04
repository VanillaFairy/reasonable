// progress-tree.mjs — the generic progress tree component (Plan 1 "organs" rework; spec:
// docs/superpowers/specs/2026-07-02-unified-execution-tree-design.md; contract:
// docs/superpowers/plans/2026-07-02-unified-execution-tree-p1/shared/interfaces.md §1).
//
// A generic five-status progress tree — pending → active → {done, failed}, plus a separate
// canceled terminal — with an append-only mutation API (inject/update/status/note). This file
// knows NOTHING about reasonable, ledgers, or work orders: it is the bottom of the Plan 1 import
// chain (ledger.mjs → progress-map.mjs → progress-tree.mjs) and imports nothing itself. Zero I/O,
// zero `Date`. Anyone could copy this single file into an unrelated project.
//
// NEVER REMOVE: there is no delete/remove op in this API. A node's life only ever advances
// forward or is retired by setting its status to `canceled` — the tree is an append-only
// structural log, never a mutable scene graph you prune.
//
// Totality: `apply` never throws for ORDERING reasons — a missing parent is silently
// auto-created as a pending stub, and re-injecting an existing path is an idempotent merge. It
// DOES throw (TypeError) on malformed ops — an unknown op, a bad status, or a bad path segment —
// because that is a caller bug that must surface loudly, not a reflection of run-time order.

export const STATUSES = ['pending', 'active', 'done', 'failed', 'canceled'];
export const TERMINAL = ['done', 'canceled'];
export const GLYPH = { pending: '·', active: '▶', done: '✓', failed: '✗', canceled: '⊘' };

// Non-empty, no whitespace, no '/', no ASCII control character (\x00-\x1f covers both; \s
// alone would miss non-whitespace control chars like \x07).
const SEG_RE = /^[^\s\x00-\x1f/]+$/;

function assertValidSegment(seg) {
  if (typeof seg !== 'string' || !SEG_RE.test(seg)) {
    throw new TypeError(`progress-tree: invalid path segment ${JSON.stringify(seg)}`);
  }
}

// '' → [] (the root). Leading/trailing '/' and empty interior segments are malformed.
function splitPath(path) {
  if (typeof path !== 'string') {
    throw new TypeError(`progress-tree: path must be a string, got ${JSON.stringify(path)}`);
  }
  if (path === '') return [];
  if (path.startsWith('/') || path.endsWith('/')) {
    throw new TypeError(`progress-tree: path must not start or end with '/': ${JSON.stringify(path)}`);
  }
  const segments = path.split('/');
  for (const seg of segments) assertValidSegment(seg);
  return segments;
}

function assertValidStatus(status) {
  if (!STATUSES.includes(status)) {
    throw new TypeError(`progress-tree: invalid status ${JSON.stringify(status)}`);
  }
}

function newNode(id, label) {
  return { id, label, status: 'pending', detail: null, statusTs: null, notes: [], children: [] };
}

// Walk from `tree` along `segments`. With autoCreate, missing nodes along the way (ancestors
// AND the target) are created as pending stubs, so this never fails for ordering reasons.
// Without autoCreate it's a plain lookup — null on a miss.
function walk(tree, segments, autoCreate) {
  let node = tree;
  for (const seg of segments) {
    let child = node.children.find((c) => c.id === seg);
    if (!child) {
      if (!autoCreate) return null;
      child = newNode(seg, seg);
      node.children.push(child);
    }
    node = child;
  }
  return node;
}

const OPS = {
  inject(tree, op) {
    const segments = splitPath(op.path);
    // Validation of op.status runs unconditionally (totality: a bad status is malformed input
    // regardless of whether the path happened to exist already) and BEFORE any mutation — a
    // thrown TypeError here must leave the tree untouched, no auto-created ancestors, no new
    // node, no label/detail merge (mirrors the `status` op, which validates before touching
    // the tree). Only the APPLY of op.status is conditional on `existed`.
    if (op.status !== undefined) assertValidStatus(op.status);
    const existed = walk(tree, segments, false) !== null;
    const node = walk(tree, segments, true);
    if (op.label !== undefined) node.label = op.label;
    if (op.detail !== undefined) node.detail = op.detail;
    // Idempotent merge: an existing node's status is never touched here, even if op.status
    // was given — only a brand-new node honors op.status (default 'pending' via newNode).
    if (op.status !== undefined && !existed) node.status = op.status;
  },
  update(tree, op) {
    const node = walk(tree, splitPath(op.path), true);
    if (op.label !== undefined) node.label = op.label;
    if (op.detail !== undefined) node.detail = op.detail;
  },
  status(tree, op) {
    assertValidStatus(op.status);
    const node = walk(tree, splitPath(op.path), true);
    // guardPending: apply only while the node is still sitting at 'pending' — a mapper uses
    // this to nudge a container (an attempt-N folder, an implementation/section folder, ...)
    // to 'active' the moment real work starts underneath it, without ever demoting a node
    // that's already active or resurrecting one that has already reached a terminal status.
    if (op.guardPending && node.status !== 'pending') return;
    node.status = op.status;
    if (op.detail !== undefined) node.detail = op.detail;
    if (op.ts !== undefined) node.statusTs = op.ts;
    if (op.recursive) {
      // recursive:true sweeps EVERY non-terminal descendant to op.status (a failed/canceled
      // attempt invalidates its pending sub-steps too). recursive:'active' sweeps ONLY the
      // still-ACTIVE descendants — orphaned in-flight nodes whose own finish event was lost —
      // and SPARES pending ones (a node reaching `done` must not fake-complete a sub-step that
      // never ran). Either way a terminal child's OWN status is spared, but we still recurse
      // into ITS children (a `done` work order can still hide a stray `active` grandchild).
      const activeOnly = op.recursive === 'active';
      const sweep = (n) => {
        for (const child of n.children) {
          const convert = activeOnly ? child.status === 'active' : !TERMINAL.includes(child.status);
          if (convert) child.status = op.status;
          sweep(child);
        }
      };
      sweep(node);
    }
  },
  note(tree, op) {
    const node = walk(tree, splitPath(op.path), true);
    node.notes.push({ text: op.text, ts: op.ts ?? null });
  },
};

export function createTree(label) {
  return newNode('', label);
}

export function apply(tree, op) {
  if (!op || typeof op.op !== 'string' || !Object.hasOwn(OPS, op.op)) {
    throw new TypeError(`progress-tree: unknown op ${JSON.stringify(op && op.op)}`);
  }
  OPS[op.op](tree, op);
  return tree;
}

export function findByPath(tree, path) {
  return walk(tree, splitPath(path), false);
}

// Depth-first pre-order, first match wins; children are visited in their existing array
// order (insertion order — never resorted), which is what makes "first match" meaningful.
export function findById(tree, id) {
  const visit = (node, path) => {
    for (const child of node.children) {
      const childPath = path === '' ? child.id : `${path}/${child.id}`;
      if (child.id === id) return { node: child, path: childPath };
      const found = visit(child, childPath);
      if (found) return found;
    }
    return null;
  };
  return visit(tree, '');
}

// ── derived (display) status ──────────────────────────────────────────────────────────
// A node's STORED status is what events set on it directly. Its DISPLAYED status — what the
// mirror renders and counts — is derived: a LEAF shows its own stored status; a CONTAINER is a
// pure function of its children, never its own stored value. This is why the tree needs no
// downward cascade and no heal: a container never holds a status that can rot. A slice that was
// transiently marked `failed` while its work orders were mid-flight, then saw them all finish,
// displays `done` — because its children are done — with the block surviving only as a note.
//
// The stored status is left untouched (the ledger's own attempt arithmetic reads it); derivation
// is a read-time overlay used solely by countByStatus/renderMarkdown.

// An attempt is a sibling, not a node. Among children named `attempt-<n>`, only the highest
// attempt is LIVE; a superseded lower attempt is still shown, but excluded from the parent's
// derivation (its successor represents the family). Every non-attempt child is always live.
function liveChildren(node) {
  let maxAttempt = null;
  for (const child of node.children) {
    const m = /^attempt-(\d+)$/.exec(child.id);
    if (m) { const n = Number(m[1]); if (maxAttempt === null || n > maxAttempt) maxAttempt = n; }
  }
  return node.children.filter((child) => {
    const m = /^attempt-(\d+)$/.exec(child.id);
    return !m || Number(m[1]) === maxAttempt;
  });
}

export function displayStatus(node) {
  if (node.children.length === 0) return node.status; // leaf: its own authored status
  // An AUTHORED terminal wins over derivation:
  //  • `done` — a container only reaches `done` via a node-completed event (there is no cascade
  //    that fabricates done), so it is an authoritative "this unit succeeded" and is trusted even
  //    over a superseded or crashed earlier attempt underneath it;
  //  • `failed`/`canceled` WITH a `detail` — set by a real event (node-failed, node-downgraded's
  //    "lost-work crash", node-canceled), not by a detail-less cascade sweep; a crash whose
  //    sub-steps happened to finish still reads failed, a deliberately canceled unit reads canceled.
  // A detail-LESS `failed` is a cascade scar and we derive straight past it (the slice-4 fix).
  if (node.status === 'done') return 'done';
  if ((node.status === 'failed' || node.status === 'canceled') && node.detail != null) return node.status;
  // Container: derive from LIVE children. `canceled` children are abandoned — shown, but they
  // don't count toward the parent's outcome.
  const live = liveChildren(node).map(displayStatus).filter((s) => s !== 'canceled');
  if (live.length === 0) return node.children.length ? 'canceled' : node.status;
  if (live.every((s) => s === 'done')) return 'done';
  if (live.some((s) => s === 'active')) return 'active';
  if (live.some((s) => s === 'failed')) return 'failed';
  // No active/failed left, but not all done → a mix of done + pending is work in progress.
  if (live.some((s) => s === 'done')) return 'active';
  return 'pending';
}

export function countByStatus(tree) {
  const counts = { pending: 0, active: 0, done: 0, failed: 0, canceled: 0 };
  const visit = (node) => {
    for (const child of node.children) {
      counts[displayStatus(child)] += 1;
      visit(child);
    }
  };
  visit(tree);
  return counts;
}

// Slices a literal 'YYYY-MM-DD HH:MM:SS UTC' straight out of an ISO ts string — no Date, no
// timezone math, deterministic. Returns null if the ts doesn't look like one.
function humanTs(ts) {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})/.exec(typeof ts === 'string' ? ts : '');
  return m ? `${m[1]} ${m[2]} UTC` : null;
}

function renderNode(node, depth, lines) {
  const indent = '  '.repeat(depth);
  // Glyph reflects the DISPLAYED (derived) status — a container shows its children's aggregate,
  // not a stale stored value.
  const shown = displayStatus(node);
  let line = `${indent}- ${GLYPH[shown]} ${node.label}`;
  if (node.detail) line += `  _(${node.detail})_`;
  // The statusTs bracket is gated to active/failed only — those are the two statuses still
  // "in motion" (when did it start / when did it break), so only they earn a clock. detail
  // comes first because it's the more permanent annotation; the timestamp trails as the most
  // transient one.
  if (shown === 'active' || shown === 'failed') {
    const human = humanTs(node.statusTs);
    if (human) line += `   [${human}]`;
  }
  lines.push(line);
  const noteIndent = '  '.repeat(depth + 1);
  for (const note of node.notes) {
    // A note's ts renders in the SAME human 'YYYY-MM-DD HH:MM:SS UTC' form as a node's own
    // statusTs (both via humanTs), so the whole file reads in one timestamp format. A ts that
    // isn't a recognizable ISO instant falls back to its raw text; a note with no ts renders
    // no bracket at all.
    const human = note.ts ? (humanTs(note.ts) || note.ts) : '';
    const bracket = human ? `[${human}] ` : '';
    lines.push(`${noteIndent}- ✎ ${bracket}${note.text}`);
  }
  for (const child of node.children) renderNode(child, depth + 1, lines);
}

// Renders the tree BODY only — the root itself never gets a bullet line; rendering starts
// from the root's children.
export function renderMarkdown(tree) {
  const lines = [];
  for (const child of tree.children) renderNode(child, 0, lines);
  return lines.join('\n');
}
