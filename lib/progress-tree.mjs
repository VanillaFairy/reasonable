// progress-tree.mjs — the generic progress tree component (Plan 1 "organs" rework; spec:
// docs/superpowers/specs/2026-07-02-unified-execution-tree-design.md; contract:
// docs/superpowers/plans/2026-07-02-unified-execution-tree-p1/shared/interfaces.md §1).
//
// A generic six-status progress tree with an append-only mutation API (inject/update/status/note).
// This file knows NOTHING about reasonable, ledgers, or work orders: it is the bottom of the import
// chain (ledger.mjs → progress-map.mjs → progress-tree.mjs) and imports nothing itself. Zero I/O,
// zero `Date`. Anyone could copy this single file into an unrelated project.
//
// STATUS MODEL (design: docs/superpowers/specs/2026-07-04-progress-failure-recovery-model-design.md).
// A node's STORED status is what events set on it directly. Its DISPLAYED status (glyph + counts) is
// DERIVED — a leaf shows its own stored status; a container is a pure function of its children — so a
// container never holds a value that can rot, and the tree needs no downward cascade and no heal.
//   pending ·   active ▶   done ✓   failed ↻   panic 💥   canceled ⊘
// `failed` is NON-terminal: it is the "down, under investigation" state — a node that failed and is
// being worked on; it never completes on its own and never lets its parent read done. `panic` is the
// terminal, unrecoverable failure that escalates and compromises its parent. An attempt is a SIBLING
// `name[k]`, not a wrapper node; among a family's siblings only the highest [k] is LIVE (lower ones
// are shown but excluded from the parent's derivation).
//
// NEVER REMOVE: there is no delete/remove op in this API. A node's life only ever advances forward
// or is retired to a terminal status — the tree is an append-only structural log, never a mutable
// scene graph you prune.
//
// Totality: `apply` never throws for ORDERING reasons — a missing parent is silently
// auto-created as a pending stub, and re-injecting an existing path is an idempotent merge. It
// DOES throw (TypeError) on malformed ops — an unknown op, a bad status, or a bad path segment —
// because that is a caller bug that must surface loudly, not a reflection of run-time order.

export const STATUSES = ['pending', 'active', 'done', 'failed', 'panic', 'canceled'];
export const TERMINAL = ['done', 'panic', 'canceled']; // failed is NON-terminal (under investigation)
export const GLYPH = { pending: '·', active: '▶', done: '✓', failed: '↻', panic: '💥', canceled: '⊘' };

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
    // Sets ONLY the target node's own status (+ detail/statusTs when provided). No downward
    // cascade: a parent's status is DERIVED from its children (see displayStatus), so a stale
    // '▶active' orphan or a transient block never needs to be swept or healed out — it simply
    // stops counting the moment its live siblings/children speak for it.
    assertValidStatus(op.status);
    const node = walk(tree, splitPath(op.path), true);
    node.status = op.status;
    if (op.detail !== undefined) node.detail = op.detail;
    if (op.ts !== undefined) node.statusTs = op.ts;
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

// An attempt is a SIBLING, not a wrapper node. A re-run of `WO` is `WO[2]`, `WO[3]`, … — same base
// name, higher [k]. Only the highest [k] of a family is LIVE; a superseded lower attempt is still
// shown but excluded from the parent's derivation (its successor represents the family). The legacy
// `attempt-<n>` wrapper (pre-2026-07-04 efforts) is honored too, so old ledgers still read cleanly.
function parseFamily(id) {
  let m = /^(.*)\[(\d+)\]$/.exec(id);        // new model: name[k]
  if (m) return { family: m[1], attempt: Number(m[2]) };
  m = /^attempt-(\d+)$/.exec(id);            // legacy wrapper siblings all belong to one family
  if (m) return { family: ' attempt', attempt: Number(m[1]) };
  return { family: id, attempt: 1 };         // ordinary node: a singleton family, always live
}

function liveChildren(node) {
  const best = new Map(); // family → highest attempt seen
  for (const child of node.children) {
    const { family, attempt } = parseFamily(child.id);
    if (!best.has(family) || attempt > best.get(family)) best.set(family, attempt);
  }
  return node.children.filter((child) => {
    const { family, attempt } = parseFamily(child.id);
    return attempt === best.get(family);
  });
}

export function displayStatus(node) {
  if (node.children.length === 0) return node.status; // leaf: its own authored status
  // An AUTHORED terminal wins over derivation:
  //  • `done` — a container only reaches `done` via a node-completed event (nothing fabricates
  //    done), so it is an authoritative "this unit succeeded", trusted even over a crashed or
  //    superseded attempt beneath it;
  //  • `failed`/`panic`/`canceled` WITH a `detail` — set by a real event (node-failed,
  //    node-downgraded's "lost-work crash", node-panicked, node-canceled), not a detail-less
  //    cascade scar. A crash whose sub-steps finished still reads failed; a panicked or canceled
  //    unit reads that way regardless of its children.
  // A detail-LESS `failed` is a cascade scar (legacy fold) and we derive straight past it.
  if (node.status === 'done') return 'done';
  if ((node.status === 'failed' || node.status === 'panic' || node.status === 'canceled')
      && node.detail != null) return node.status;
  // Container: derive from LIVE children. `canceled` children are abandoned — shown, excluded.
  const live = liveChildren(node).map(displayStatus).filter((s) => s !== 'canceled');
  if (live.length === 0) return node.children.length ? 'canceled' : node.status;
  if (live.some((s) => s === 'panic')) return 'panic';           // a live terminal failure compromises the unit
  if (live.every((s) => s === 'done')) return 'done';
  if (live.some((s) => s === 'active' || s === 'failed')) return 'active'; // failed = under investigation = in motion
  if (live.some((s) => s === 'done')) return 'active';           // mix of done + pending = in progress
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
