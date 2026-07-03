// ledger.mjs — the ledger controller: the ONE sanctioned write path to
// `.reasonable/ledger.jsonl` (Plan 1 "organs" rework; spec:
// docs/superpowers/specs/2026-07-02-unified-execution-tree-design.md; contract:
// docs/superpowers/plans/2026-07-02-unified-execution-tree-p1/shared/interfaces.md §2+§4).
//
// Capability beats discipline, applied to progress reporting: today any agent can hand-append
// a JSON line and simply LIE about its own seq/ts/attempt/node. This module removes that
// capability rather than asking nicely — `append()` is the only door, and every value an agent
// could spoof (seq, ts, attempt, the legacy `dispatch` field, the resolved absolute node) is
// computed here from durable ledger state and an agent-supplied value for any of them is always
// discarded, never trusted. `validateEvent` is pure/synchronous (no I/O); `append` does the I/O:
// validate, stamp, write under `effort.mjs`'s existing append lock, then trigger a mirror regen.
//
// D3a (one atomic commit binds a worker's work product + its own ledger line) is UNCHANGED by
// this refactor — this module only replaces the shape of the write, not who writes or when.

import { appendJsonl, rootFromArgv, argvWithoutRoot, findEffortRoot, existsSync, join, basename } from './effort.mjs';
import { buildTree, writeMirror } from './progress-map.mjs';
import { findById } from './progress-tree.mjs';

export const KINDS = ['work-order', 'spike', 'scaffold', 'grill-pass', 'slice', 'phase'];

// ── schema registry (data, not a per-type if-forest) ────────────────────────────────────
// Every entry: { required: [field, ...], validate?(event) → {ok:false,error}|undefined }.
// A required field named 'node' is special-cased by the walker below: Family-1 events may
// satisfy it with EITHER `node` or `workOrder` (§2 — resolution is append's job, not
// validateEvent's). A required field named 'kind' is additionally checked against KINDS.

function relativeNodeMustNotLeadWithSlash(event) {
  if (typeof event.node === 'string' && event.node.startsWith('/')) {
    return { ok: false, error: `${event.type}: node must be a relative path (no leading '/')` };
  }
  return undefined;
}

export const EVENT_SCHEMAS = {
  // Family 1 — node lifecycle
  'node-planned': { required: ['node', 'kind', 'title'] },
  'node-dispatched': { required: ['node', 'kind'] },
  'node-checkpointed': { required: ['node'] },
  'node-downgraded': { required: ['node'] },
  'node-completed': { required: ['node'] },
  'node-failed': { required: ['node'] }, // reason optional
  'node-canceled': { required: ['node', 'reason'] },
  'approval-resolved': { required: ['id'] },
  'concluded': { required: [] },

  // Family 2 — worker reports (node is the agent-supplied RELATIVE path here; append() turns
  // it into the absolute, stamped path — see resolveFamily2 below).
  'report-started': { required: ['under', 'node'], validate: relativeNodeMustNotLeadWithSlash },
  'report-finished': { required: ['under', 'node'], validate: relativeNodeMustNotLeadWithSlash },
  'report-canceled': { required: ['under', 'node', 'reason'], validate: relativeNodeMustNotLeadWithSlash },

  // Family 3 — domain events, loose validation. enrichment/characterization additionally
  // require `component`; everything else here has no required fields of its own.
  'enrichment': { required: ['component'] },
  'amendment': { required: [] },
  'characterization': { required: ['component'] },
  'characterization-promotion': { required: [] },
  'change-characterized': { required: [] },
  'change-characterized-planned': { required: [] },
  'verdict': { required: [] },
  'verifier-verdict': { required: [] },
  'scope-expansion': { required: [] },
  'budget-extension': { required: [] },
  'dead-end': { required: [] },
  'ratification': { required: [] },
  'intent-check-failure': { required: [] },
  'commit': { required: [] },
};

const FAMILY_1_TYPES = new Set([
  'node-planned', 'node-dispatched', 'node-checkpointed', 'node-downgraded',
  'node-completed', 'node-failed', 'node-canceled', 'approval-resolved', 'concluded',
]);
const FAMILY_2_TYPES = new Set(['report-started', 'report-finished', 'report-canceled']);

function isNonEmptyString(v) {
  return typeof v === 'string' && v.length > 0;
}

/** Pure, synchronous, no I/O: does this event satisfy its schema's shape? */
export function validateEvent(event) {
  if (!event || typeof event !== 'object') return { ok: false, error: 'event must be an object' };
  const type = event.type;
  if (typeof type !== 'string' || !type) return { ok: false, error: 'event.type is required' };

  // Object.hasOwn guards against a `type` that shadows an inherited Object.prototype member
  // name ('__proto__', 'toString', 'hasOwnProperty', 'constructor', ...) — a plain bracket
  // lookup would resolve those to the INHERITED value instead of undefined, skipping every
  // required-field/kind check below (same defect class already fixed in progress-map.mjs's
  // EVENT_MAP lookup, commit 39459d1).
  const schema = Object.hasOwn(EVENT_SCHEMAS, type) ? EVENT_SCHEMAS[type] : undefined;
  if (!schema) return { ok: false, error: `${type}: unknown or legacy event type (write-side clean break)` };

  for (const field of schema.required || []) {
    if (field === 'node') {
      // A present-but-wrong-type node/workOrder (array, object, number, empty string) is not a
      // "missing field" — it's a malformed one, and must be rejected here rather than silently
      // surviving to be written raw (append() only overwrites `node` when resolution actually
      // runs, so an unresolved garbage value would otherwise reach the ledger verbatim).
      const hasNode = event.node !== undefined;
      const hasWorkOrder = event.workOrder !== undefined;
      if (!hasNode && !hasWorkOrder) {
        return { ok: false, error: `${type}: requires 'node' or 'workOrder'` };
      }
      if (hasNode && !isNonEmptyString(event.node)) {
        return { ok: false, error: `${type}: 'node' must be a non-empty string` };
      }
      if (hasWorkOrder && !isNonEmptyString(event.workOrder)) {
        return { ok: false, error: `${type}: 'workOrder' must be a non-empty string` };
      }
      continue;
    }
    if (event[field] === undefined) {
      return { ok: false, error: `${type}: missing required field '${field}'` };
    }
    // Every other required field (title, reason, id, under, component, ...) is documented free
    // text or an identifier — the same non-empty-string shape 'node'/'workOrder' already get
    // above. 'kind' is excluded: its own enum check below already rejects any non-string value
    // with a clearer, more specific message. A present-but-wrong-type value (empty string, null,
    // array, object) is malformed, not "missing", and must be rejected here rather than landing
    // raw in the ledger.
    if (field !== 'kind' && !isNonEmptyString(event[field])) {
      return { ok: false, error: `${type}: '${field}' must be a non-empty string` };
    }
  }

  if ((schema.required || []).includes('kind') && !KINDS.includes(event.kind)) {
    return { ok: false, error: `${type}: kind must be one of ${KINDS.join(', ')} (got ${JSON.stringify(event.kind)})` };
  }

  if (schema.validate) {
    const result = schema.validate(event);
    if (result && result.ok === false) return result;
  }

  return { ok: true };
}

// ── attempt arithmetic ───────────────────────────────────────────────────────────────────
// latest = max N over treeNode's children matching /^attempt-(\d+)$/ (0 if none); also reports
// whether that latest attempt's OWN status is 'failed', and whether treeNode's own status is
// 'failed' — both feed the node-dispatched reopen rule.
function attemptState(treeNode) {
  let latest = 0;
  let latestAttemptFailed = false;
  for (const child of treeNode.children) {
    const m = /^attempt-(\d+)$/.exec(child.id);
    if (!m) continue;
    const n = Number(m[1]);
    if (n > latest) { latest = n; latestAttemptFailed = child.status === 'failed'; }
  }
  return { latest, latestAttemptFailed, nodeFailed: treeNode.status === 'failed' };
}

// The node-dispatched attempt decision, named explicitly so the three branches are visible at
// the call site (not just in prose elsewhere): FRESH — no prior attempt at all, start at 1.
// REOPEN — the latest attempt sealed failed, OR the node's own status is itself 'failed' (a
// dead-end being redispatched) — advance past it, latest + 1. CONTINUATION — anything else
// (e.g. a checkpoint reclaim): same attempt number, never hand out a fresh one.
function nextDispatchAttempt(latest, latestAttemptFailed, nodeFailed) {
  if (latest === 0) return 1; // fresh
  if (latestAttemptFailed || nodeFailed) return latest + 1; // reopen
  return latest; // continuation
}

// Resolve a Family-1 event's node address against the tree, WITHOUT requiring it to already
// exist unless the caller used `workOrder` (a bare id, meaningless unless it resolves) or the
// event is one that needs the actual tree node object (node-dispatched/node-downgraded, to
// read its children for attempt arithmetic). A directly-supplied `node` is otherwise used
// verbatim — that's how node-planned addresses a node that, by definition, doesn't exist yet.
function resolveFamily1Address(event, tree) {
  if (event.workOrder !== undefined) {
    const found = findById(tree, event.workOrder);
    if (!found) return { ok: false, error: `${event.type}: unresolvable workOrder '${event.workOrder}'` };
    return { ok: true, path: found.path, treeNode: found.node };
  }
  if (typeof event.node === 'string') {
    // findById addresses by a node's LAST PATH SEGMENT as its id (see progress-tree.mjs) — so
    // for a full path like 's1/WO-1' the lookup id is 'WO-1'; a miss just means "not yet in the
    // tree" (fine unless the caller needed attempt arithmetic, checked by the caller below).
    const segments = event.node.split('/');
    const found = findById(tree, segments[segments.length - 1]);
    return { ok: true, path: event.node, treeNode: found ? found.node : null };
  }
  // Neither given — valid for node/workOrder-less Family-1 types (approval-resolved, concluded).
  return { ok: true, path: undefined, treeNode: null };
}

// Family 2: `under` is a mandatory, fail-loud lookup (never best-effort — a worker report with
// no home is a bug, not a degraded render). Absolute node = path(under) + '/attempt-N/' + relative.
function resolveFamily2(event, tree) {
  const found = findById(tree, event.under);
  if (!found) return { ok: false, error: `${event.type}: unresolvable under '${event.under}'` };
  const { latest } = attemptState(found.node);
  if (latest === 0) {
    // The work order exists (it was planned) but has zero attempts ever — a worker report has
    // nowhere real to land. Symmetric with Family 1's "cannot dispatch/downgrade an unplanned
    // node" guard: a report against an undispatched work order is a bug upstream (the
    // lane-provisioner always emits node-dispatched before a worker starts), not a case to
    // paper over with a fabricated attempt-1.
    return { ok: false, error: `${event.type}: cannot report under '${event.under}' — it has never been dispatched` };
  }
  const attempt = latest;
  return { ok: true, attempt, node: `${found.path}/attempt-${attempt}/${event.node}` };
}

/**
 * Validate, stamp (ts always; attempt + absolute node per family), append under effort.mjs's
 * existing lock, then regen the progress mirror (unless opts.regen === false). Never throws —
 * every failure path returns { ok:false, error } instead.
 */
export function append(root, event, opts = {}) {
  if (!root || !existsSync(join(root, '.reasonable'))) {
    return { ok: false, error: `no .reasonable/ found at root '${root}'` };
  }

  const validation = validateEvent(event);
  if (!validation.ok) return validation;

  const type = event.type;
  const stamped = { ...event };
  // Script-authoritative stamps: never trust what the caller sent, regardless of which door
  // (JS API, CLI flags, CLI --json) it came through.
  delete stamped.seq;
  delete stamped.attempt;
  // `dispatch` is a legacy field, not part of EVENT_SCHEMAS above: the pre-refactor ledger
  // (lib/action-report.mjs / lib/action-events.mjs) stamped every worker-report line with the
  // work order's monotonic `dispatchEpoch` under this key. It has no meaning in this vocabulary
  // — stripped defensively so an old-format or forged `dispatch` value can never leak into a
  // new-format line.
  delete stamped.dispatch;
  stamped.ts = new Date().toISOString();

  if (FAMILY_1_TYPES.has(type)) {
    const tree = buildTree(root);
    const resolved = resolveFamily1Address(event, tree);
    if (!resolved.ok) return resolved;
    if (resolved.path !== undefined) stamped.node = resolved.path;

    if (type === 'node-dispatched' || type === 'node-downgraded') {
      if (!resolved.treeNode) {
        const verb = type === 'node-dispatched' ? 'dispatch' : 'downgrade';
        return { ok: false, error: `${type}: cannot ${verb} an unplanned node '${resolved.path}'` };
      }
      const { latest, latestAttemptFailed, nodeFailed } = attemptState(resolved.treeNode);
      if (type === 'node-downgraded' && latest === 0) {
        // The node exists (it was planned) but has zero attempts ever — nothing to downgrade.
        // Stamping attempt:1 here would fabricate a phantom "attempt-1, failed" subtree for an
        // attempt that never existed. Symmetric with the unplanned-node guard just above.
        return { ok: false, error: `${type}: cannot downgrade '${resolved.path}' — it has never been dispatched` };
      }
      stamped.attempt = type === 'node-dispatched'
        ? nextDispatchAttempt(latest, latestAttemptFailed, nodeFailed)
        : Math.max(latest, 1); // node-downgraded: always at least attempt 1, never a fresh 0
    }
  } else if (FAMILY_2_TYPES.has(type)) {
    const tree = buildTree(root);
    const resolved = resolveFamily2(event, tree);
    if (!resolved.ok) return resolved;
    stamped.attempt = resolved.attempt;
    stamped.node = resolved.node;
  } else {
    // Family 3 — loose. workOrder resolution is BEST-EFFORT here: a miss leaves node absent
    // rather than failing the whole append (unlike Family 1/2, which fail loud).
    if (event.workOrder !== undefined) {
      const tree = buildTree(root);
      const found = findById(tree, event.workOrder);
      if (found) stamped.node = found.path;
    }
  }

  const seq = appendJsonl(join(root, '.reasonable', 'ledger.jsonl'), stamped);
  stamped.seq = seq;

  // The ledger line above is already durably written — that's the fact that matters. A
  // best-effort mirror regen failing (disk/permission error on progress.json/progress.md) must
  // never propagate out of append() and must never be reported as a failed append: the caller
  // has no way to know a retry wouldn't duplicate the write it already made. Surface it as a
  // sibling `mirrorError` on an otherwise-successful result instead.
  let mirrorError;
  if (opts.regen !== false) {
    try { writeMirror(root); }
    catch (e) { mirrorError = e.message; }
  }

  const result = { ok: true, event: stamped };
  if (mirrorError !== undefined) result.mirrorError = mirrorError;
  return result;
}

// ── CLI ──────────────────────────────────────────────────────────────────────────────────

function parseCliEvent(rest) {
  const jsonIdx = rest.indexOf('--json');
  if (jsonIdx >= 0) {
    // --json is exclusive: the object IS the event. Any other flag alongside it (either order)
    // is an ambiguous call, not a silent "--json wins" — reject rather than guess which side
    // the caller meant.
    const flagCount = rest.filter((a) => a.startsWith('--')).length;
    if (flagCount > 1 || rest.length !== 2) {
      return { ok: false, error: '--json cannot be combined with other flags' };
    }
    try { return { ok: true, event: JSON.parse(rest[jsonIdx + 1]) }; }
    catch (e) { return { ok: false, error: `invalid --json payload: ${e.message}` }; }
  }
  const event = {};
  for (let i = 0; i < rest.length; i++) {
    const flag = rest[i];
    if (!flag.startsWith('--')) return { ok: false, error: `unexpected argument '${flag}'` };
    event[flag.slice(2)] = rest[i + 1];
    i += 1;
  }
  return { ok: true, event };
}

function fail(message) {
  process.stderr.write(`ledger: ${message}\n`);
  process.exit(1);
}

function runCli() {
  const root = rootFromArgv(process.argv, null) || findEffortRoot(process.cwd());
  const args = argvWithoutRoot(process.argv).slice(2);
  const [cmd, ...rest] = args;

  if (cmd !== 'append') { fail(`unknown command '${cmd}' (expected 'append')`); return; }

  const parsed = parseCliEvent(rest);
  if (!parsed.ok) { fail(parsed.error); return; }

  // append() itself owns the ".reasonable/ must exist at root" check (single source of truth —
  // the JS API and the CLI hit the exact same guard, never two copies of the same rule).
  const result = append(root, parsed.event);
  if (!result.ok) { fail(result.error); return; }
  // The ledger write already succeeded — a stale-mirror warning is advisory, not a failure exit.
  if (result.mirrorError) {
    process.stderr.write(`ledger: warning: mirror regen failed (progress.json/progress.md may be stale): ${result.mirrorError}\n`);
  }
  process.exit(0);
}

if (basename(process.argv[1] || '') === 'ledger.mjs') {
  runCli();
}
