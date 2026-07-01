// action-events.mjs — shared vocabulary for agent-reported progress action events (D19).
//
// The three ledger.jsonl event types a dispatched agent appends to report its own progress:
// action-started / action-finished / action-obsoleted. One shared validator here means
// lib/action-report.mjs (the CLI agents call) and any future caller enforce the exact same
// rules — never re-implemented per caller.

export const LEVELS = ['section', 'item'];
export const KINDS = ['clause', 'step', 'adhoc'];
export const EVENT_TYPES = ['action-started', 'action-finished', 'action-obsoleted'];

// A role's own fixed step catalog — the addressable `ref`s a kind:"step" item may name. Only
// roles whose work doesn't map to contract clauses AND doesn't vary in count per run need one
// (the auditor's own escalating checks, to start — adjudicator's per-red items vary in count,
// so they report kind:"adhoc" instead). Declared once, imported everywhere it's needed (agent
// constitutions cite these exact slugs; this module validates them) — never copy-pasted.
export const STAGE_ITEM_CATALOG = {
  audit: ['discriminator-check', 'bidirectional-mapping', 'mutation-sampling', 'proportionality-review'],
};

// A lowercase kebab-slug: starts with a letter, then letters/digits/hyphen-separated groups —
// rejects a bare number (no leading digit) and rejects whitespace (no space-separated words).
const ADHOC_REF_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

/**
 * Validate one action-event's fields for the given event `type`. Returns { ok:true } or
 * { ok:false, error }. Pure — no I/O — so the CLI and its own tests exercise the exact same
 * function with no drift between "what's allowed" and "what's tested."
 */
export function validateActionEvent(type, fields) {
  const f = fields || {};
  if (!EVENT_TYPES.includes(type)) return { ok: false, error: `unknown event type: ${type}` };
  if (!f.workOrder) return { ok: false, error: 'workOrder is required' };
  if (!LEVELS.includes(f.level)) return { ok: false, error: `level must be one of: ${LEVELS.join(', ')}` };

  if (f.level === 'section') {
    if (!f.label) return { ok: false, error: 'a section requires a label' };
    return { ok: true };
  }

  // level === 'item'
  if (!KINDS.includes(f.kind)) return { ok: false, error: `kind must be one of: ${KINDS.join(', ')}` };
  if (!f.ref) return { ok: false, error: 'an item requires a ref' };
  if (f.kind === 'adhoc' && !ADHOC_REF_RE.test(f.ref)) {
    return { ok: false, error: `adhoc ref must be a lowercase kebab-slug (got "${f.ref}")` };
  }
  if (type === 'action-obsoleted' && !f.reason) return { ok: false, error: 'action-obsoleted requires a reason' };
  return { ok: true };
}
