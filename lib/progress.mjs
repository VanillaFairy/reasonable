// progress.mjs — the deterministic progress projection (D19).
//
// Progress in a reasonable effort is ALREADY fully recorded: the LEDGER is an
// append-only log of every atomic action, the JOURNAL is the program counter, and the
// work-order files are the planned tree. So "progress" is a PURE PROJECTION of
// (work-orders ∪ journal ∪ ledger ∪ inbox) — never accumulated by hand. This module
// renders that projection into a nested tree (effort → vertical slice → work order →
// atomic action) and writes the derived MIRROR: `.reasonable/progress.json` (structured,
// for graphical rendering later) + `.reasonable/progress.md` (a pinnable view).
//
// No model is in the loop — the render is mechanical, so it is FREE, RACE-FREE, and
// always exactly consistent with the ledger+journal it reads. The mirror is a
// presentation artifact only: read by no enforcement logic, rebuildable from canonical
// truth at any instant. The canonical index (journal.json / inbox.json) stays the lone
// serialized scribe's (D3b); this writes ONLY the mirror, which no other actor owns.
//
// Usage:
//   node progress.mjs --root <effortRoot>            # print the markdown tree
//   node progress.mjs --root <effortRoot> --json     # print the structured model
//   node progress.mjs --root <effortRoot> --write     # write progress.{json,md}
//   node progress.mjs --root <effortRoot> --regen     # like --write but silent + fail-open (the hook)
//
// Also exports buildModel() / renderMarkdown() / writeMirror() for tests and callers.

import { writeFileSync } from 'node:fs';
import {
  readJson, writeJson, readJsonl, findEffortRoot, rootFromArgv, argvWithoutRoot,
  readStdinJson, targetPath, existsSync, readdirSync, basename, dirname, join,
} from './effort.mjs';

// ── status vocabulary ───────────────────────────────────────────────────────────
// Journal program-counter statuses (pending|dispatched|checkpointed|merged|dead-end)
// plus the derived slice statuses (active|green|blocked|pending).
const GLYPH = {
  green: '✓', merged: '✓',
  active: '▶', dispatched: '▶',
  checkpointed: '⏸',
  blocked: '⚠', 'dead-end': '✗',
  pending: '·',
};
const glyph = (status) => GLYPH[status] || '·';
const isDone = (status) => status === 'merged' || status === 'green';

// ── atomic actions: render one ledger entry as a single human line ───────────────
function actionLine(e) {
  const cl = Array.isArray(e.clauses) && e.clauses.length ? ` ${e.clauses.join(',')}` : (e.clause ? ` ${e.clause}` : '');
  switch (e.type) {
    case 'enrichment': return `enriched ${e.component || '?'}${cl}${e.note ? ` — ${e.note}` : ''}`;
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

// ── readers ──────────────────────────────────────────────────────────────────────
function readWorkOrders(reasonableDir) {
  const out = {};
  const wd = join(reasonableDir, 'work-orders');
  if (!existsSync(wd)) return out;
  for (const f of readdirSync(wd)) {
    if (!f.endsWith('.json')) continue;
    const def = readJson(join(wd, f));
    if (def && def.id) out[def.id] = def;
  }
  return out;
}

function listSliceIds(reasonableDir, journal, woState, woDefs) {
  const ids = new Set();
  const vs = join(reasonableDir, 'vertical-slices');
  if (existsSync(vs)) for (const f of readdirSync(vs)) if (f.endsWith('.md')) ids.add(basename(f, '.md'));
  for (const id of Object.keys(woState)) { const s = woState[id] && woState[id].verticalSlice; if (s) ids.add(s); }
  for (const id of Object.keys(woDefs)) { const s = woDefs[id] && woDefs[id].verticalSlice; if (s) ids.add(s); }
  if (journal.currentVerticalSlice) ids.add(journal.currentVerticalSlice);
  return [...ids];
}

function woTitle(id, def, st) {
  const t = (def && def.output)
    || (def && def.inputs && Array.isArray(def.inputs.contracts) && def.inputs.contracts.length && `contracts: ${def.inputs.contracts.join(', ')}`)
    || (st && st.role) || (def && def.role) || id;
  const s = String(t);
  return s.length > 64 ? s.slice(0, 61) + '…' : s;
}

function sliceStatus(sid, current, woNodes) {
  if (sid === current) return 'active';
  if (woNodes.length === 0) return 'pending';
  if (woNodes.every((w) => isDone(w.status))) return 'green';
  if (woNodes.some((w) => w.status === 'dispatched')) return 'active';
  if (woNodes.some((w) => w.status === 'dead-end')) return 'blocked';
  return 'pending';
}

// ── the projection ────────────────────────────────────────────────────────────────
export function buildModel(root) {
  const dir = join(root, '.reasonable');
  const journal = readJson(join(dir, 'journal.json')) || {};
  const ledger = readJsonl(join(dir, 'ledger.jsonl')) || [];
  const inboxJson = readJson(join(dir, 'inbox.json'));
  const inbox = (inboxJson && inboxJson.items) || journal.inbox || [];

  const woState = journal.workOrders || {};
  const woDefs = readWorkOrders(dir);

  const actionsByWO = {};
  for (const e of ledger) {
    if (!e || !e.workOrder) continue;
    (actionsByWO[e.workOrder] = actionsByWO[e.workOrder] || []).push(e);
  }

  const current = journal.currentVerticalSlice || null;
  const sliceIds = listSliceIds(dir, journal, woState, woDefs);

  const slices = sliceIds.map((sid) => {
    const woIds = new Set();
    for (const id of Object.keys(woState)) if (woState[id] && woState[id].verticalSlice === sid) woIds.add(id);
    for (const id of Object.keys(woDefs)) if (woDefs[id] && woDefs[id].verticalSlice === sid) woIds.add(id);

    const workOrders = [...woIds].sort().map((id) => {
      const st = woState[id] || {};
      const def = woDefs[id] || {};
      const status = st.status || 'pending';
      const actions = (actionsByWO[id] || []).map((e) => ({ kind: 'action', type: e.type, title: actionLine(e), ts: e.ts || null }));
      return { kind: 'work-order', id, status, title: woTitle(id, def, st), role: st.role || def.role || null, children: actions };
    });

    return { kind: 'slice', id: sid, status: sliceStatus(sid, current, workOrders), children: workOrders };
  });

  // Effort-level tallies (the user-facing "atomic actions done" + cost).
  const atomicActions = ledger.filter((e) => e && e.workOrder).length;
  return {
    effort: journal.effort || basename(root),
    phase: journal.phase || null,
    currentVerticalSlice: current,
    cost: journal.cost || null, // { agentsDispatched, tokensSpent, updatedAt } — written by the scribe (D19)
    counts: {
      slices: slices.length,
      slicesGreen: slices.filter((s) => s.status === 'green').length,
      workOrders: slices.reduce((n, s) => n + s.children.length, 0),
      workOrdersGreen: slices.reduce((n, s) => n + s.children.filter((w) => isDone(w.status)).length, 0),
      atomicActions,
    },
    slices,
    inbox: (Array.isArray(inbox) ? inbox : []).map((i) => ({ id: i.id || null, kind: i.kind || null, class: i.class || i.cls || null })),
    lastReconciled: journal.lastReconciled || null,
  };
}

// ── renderers ──────────────────────────────────────────────────────────────────────
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

export function renderMarkdown(m) {
  const L = [];
  const cost = costLine(m.cost);
  L.push(`# reasonable · ${m.effort}${cost ? `   —   ${cost}` : ''}`);
  const c = m.counts;
  const sub = [
    m.phase ? `phase ${m.phase}` : null,
    m.currentVerticalSlice ? `slice **${m.currentVerticalSlice}**` : null,
    `${c.workOrdersGreen}/${c.workOrders} work orders · ${c.atomicActions} actions`,
  ].filter(Boolean).join(' · ');
  L.push(`_${sub}_`);
  L.push('');
  L.push('> Pin this file to follow the run live — it is regenerated from the ledger on every journal update (no model in the loop).');
  L.push('');
  for (const s of m.slices) {
    L.push(`- ${glyph(s.status)} **${s.id}**  _(${s.status})_`);
    for (const w of s.children) {
      L.push(`  - ${glyph(w.status)} \`${w.id}\` — ${w.title}  _(${w.status})_`);
      for (const a of w.children) L.push(`    - ✎ ${a.title}`);
    }
  }
  if (m.inbox && m.inbox.length) {
    L.push('');
    L.push(`> ⚠ **inbox: ${m.inbox.length} awaiting you** — ${m.inbox.map((i) => i.kind || '?').join(', ')}`);
  }
  L.push('');
  return L.join('\n');
}

export function writeMirror(root, model) {
  const dir = join(root, '.reasonable');
  const m = model || buildModel(root);
  writeJson(join(dir, 'progress.json'), m);
  writeFileSync(join(dir, 'progress.md'), renderMarkdown(m));
  return m;
}

// ── CLI ────────────────────────────────────────────────────────────────────────────
async function runCli() {
  const flags = argvWithoutRoot(process.argv).slice(2);

  // --hook: the PostToolUse trigger. Read the payload from stdin; regenerate the mirror
  // ONLY when a progress-relevant artifact (journal / inbox / ledger) was just written.
  // Purely mechanical, fail-OPEN — it must never disturb the session.
  if (flags.includes('--hook')) {
    let input = null;
    try { input = await readStdinJson(); } catch { /* no / blocked stdin */ }
    if (!input) process.exit(0);
    const tgt = targetPath(input.tool_name, input.tool_input);
    if (!tgt || !['journal.json', 'inbox.json', 'ledger.jsonl'].includes(basename(tgt))) process.exit(0);
    const root = findEffortRoot(dirname(tgt)) || findEffortRoot(input.cwd || process.cwd());
    if (root) { try { writeMirror(root); } catch { /* fail open */ } }
    process.exit(0);
  }

  const regen = flags.includes('--regen');
  const root = rootFromArgv(process.argv, null) || findEffortRoot(process.cwd());
  if (!root || !existsSync(join(root, '.reasonable'))) {
    if (regen) process.exit(0); // fail OPEN outside an effort
    console.error('reasonable progress: no effort here (.reasonable/ not found).');
    process.exit(1);
  }

  if (regen || flags.includes('--write')) {
    try {
      const m = writeMirror(root);
      if (!regen) console.log(`reasonable progress: wrote .reasonable/progress.{json,md} (${m.counts.slices} slice(s), ${m.counts.workOrders} work order(s)).`);
    } catch (e) { if (!regen) { console.error(`reasonable progress: ${e && e.message || e}`); process.exit(1); } }
  } else if (flags.includes('--json')) {
    console.log(JSON.stringify(buildModel(root), null, 2));
  } else {
    console.log(renderMarkdown(buildModel(root)));
  }
}

if (basename(process.argv[1] || '') === 'progress.mjs') {
  await runCli();
}
