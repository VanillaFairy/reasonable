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
    const existed = walk(tree, segments, false) !== null;
    const node = walk(tree, segments, true);
    if (op.label !== undefined) node.label = op.label;
    if (op.detail !== undefined) node.detail = op.detail;
    // Idempotent merge: an existing node's status is never touched here, even if op.status
    // was given — only a brand-new node honors op.status (default 'pending' via newNode).
    // Validation of op.status runs unconditionally (totality: a bad status is malformed input
    // regardless of whether the path happened to exist already) — only the APPLY is conditional.
    if (op.status !== undefined) {
      assertValidStatus(op.status);
      if (!existed) node.status = op.status;
    }
  },
  update(tree, op) {
    const node = walk(tree, splitPath(op.path), true);
    if (op.label !== undefined) node.label = op.label;
    if (op.detail !== undefined) node.detail = op.detail;
  },
  status(tree, op) {
    assertValidStatus(op.status);
    const node = walk(tree, splitPath(op.path), true);
    node.status = op.status;
    if (op.detail !== undefined) node.detail = op.detail;
    if (op.ts !== undefined) node.statusTs = op.ts;
    if (op.recursive) {
      // A terminal child's OWN status is spared, but we still recurse into ITS children
      // unconditionally: terminal-ness of a node says nothing about its descendants (e.g. a
      // `done` work order can still have a stray `active` grandchild that needs sweeping).
      const sweep = (n) => {
        for (const child of n.children) {
          if (!TERMINAL.includes(child.status)) child.status = op.status;
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

export function countByStatus(tree) {
  const counts = { pending: 0, active: 0, done: 0, failed: 0, canceled: 0 };
  const visit = (node) => {
    for (const child of node.children) {
      counts[child.status] += 1;
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
  let line = `${indent}- ${GLYPH[node.status]} ${node.label}`;
  if (node.detail) line += `  _(${node.detail})_`;
  // The statusTs bracket is gated to active/failed only — those are the two statuses still
  // "in motion" (when did it start / when did it break), so only they earn a clock. detail
  // comes first because it's the more permanent annotation; the timestamp trails as the most
  // transient one.
  if (node.status === 'active' || node.status === 'failed') {
    const human = humanTs(node.statusTs);
    if (human) line += `   [${human}]`;
  }
  lines.push(line);
  const noteIndent = '  '.repeat(depth + 1);
  for (const note of node.notes) {
    // Deliberate asymmetry: a note's ts renders RAW/verbatim (it's a caller-authored log
    // entry, quoted as given), while a node's own statusTs is reformatted via humanTs() above
    // (it's a first-class field this module owns the presentation of). Don't "fix" these to
    // match — the spec pins them differently on purpose.
    const bracket = note.ts ? `[${note.ts}] ` : '';
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
