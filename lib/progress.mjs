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
// Each work order also projects its agent-reported ACTION-EVENT tree (replayActions): an
// ordered list of sections, each holding an ordered list of items, derived purely from that
// work order's own `action-started`/`action-finished`/`action-obsoleted` ledger lines — no
// status is ever accumulated by hand. Atomic-action lines are ordered by `seq` (the monotonic
// append clock = causal order, never by ts) and carry literal `[YYYY-MM-DD HH:MM:SS UTC]`
// timestamps; a ts that contradicts seq order is provably wrong (agent-authored) and is suppressed.
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
  green: '✓', merged: '✓', done: '✓',
  active: '▶', dispatched: '▶',
  checkpointed: '⏸',
  blocked: '⚠', 'dead-end': '✗',
  pending: '·',
};
const glyph = (status) => GLYPH[status] || '·';
const isDone = (status) => status === 'merged' || status === 'green';

// ── action events: agent-reported progress (D19 replacement for the old heartbeat tier) ────
// Each work order's own `action-started`/`action-finished`/`action-obsoleted` ledger lines are
// replayed SEQUENTIALLY (seq order — the same causal clock every other ledger consumer trusts)
// into an ordered section list, each holding an ordered item list. No stored status: a row's
// glyph is always DERIVED from which events exist for it, never accumulated by hand.
const ACTION_GLYPH = { pending: '·', active: '▶', done: '✓', obsolete: '⊘', dead: '✗' };

/**
 * Replay one work order's seq-ordered ledger entries into { sections }. Pure — no I/O,
 * independently unit-testable. Only `action-started`/`action-finished`/`action-obsoleted`
 * entries participate; everything else (enrichment, commit, checkpoint, …) is ignored here — it
 * still renders in the atomic-action trail, unchanged, alongside this.
 */
export function replayActions(actions) {
  const sections = [];
  let curSection = null;
  let itemsByRef = new Map(); // ref -> item, scoped to the CURRENTLY open section only

  const closeSection = () => {
    if (curSection) curSection.status = curSection.finishedAt ? 'done' : 'active';
  };

  for (const a of (actions || [])) {
    if (a.type === 'action-started' && a.level === 'section') {
      const evDispatch = a.dispatch ?? null;
      const reopeningOpen = curSection && curSection.finishedAt == null && curSection.label === a.label;
      if (reopeningOpen && curSection.dispatch === evDispatch) {
        // Same dispatch epoch re-affirming its own still-open section → idempotent no-op.
        // (action-report already suppresses this at append time; this is the render-side
        // belt-and-suspenders, and it also collapses epoch-less legacy reopens where both
        // sides are null — absent provenance never fabricates a spurious ✗ crash boundary.)
        continue;
      }
      if (reopeningOpen) {
        // A DIFFERENT dispatch epoch re-opens a still-open section: the prior agent died
        // mid-section (crash + resume). Seal it `dead`, keeping ONLY the work it durably
        // finished/obsoleted; its unfinished items migrate forward — the resuming agent
        // re-reports them under the new section below. Renders the linear crash boundary:
        // …done · ✗dead · ▶active. (A finished same-label section, by contrast, is not
        // reopeningOpen — that is a legitimate second round, handled by closeSection.)
        curSection.status = 'dead';
        curSection.crashedAt = a.ts || null;
        curSection.items = curSection.items.filter((it) => it.status === 'done' || it.status === 'obsolete');
      } else {
        closeSection();
      }
      curSection = { label: a.label, dispatch: evDispatch, startedAt: a.ts || null, crashedAt: null, finishedAt: null, status: 'active', items: [] };
      sections.push(curSection);
      itemsByRef = new Map();
      continue;
    }
    if (!curSection) continue; // an item event with no open section is unaddressable — ignore, never throw
    if (a.type === 'action-finished' && a.level === 'section') { curSection.finishedAt = a.ts || null; continue; }
    if (a.level !== 'item') continue;

    let item = itemsByRef.get(a.ref);
    if (!item) {
      item = { kind: a.kind || null, ref: a.ref, label: a.label || a.ref, startedAt: null, finishedAt: null, obsoleted: false, reason: null, status: 'pending' };
      itemsByRef.set(a.ref, item);
      curSection.items.push(item);
    }
    if (item.obsoleted) continue; // obsolete is terminal — a later start/finish never revives it
    if (a.type === 'action-started') { item.startedAt = item.startedAt || a.ts || null; item.status = item.finishedAt ? 'done' : 'active'; }
    else if (a.type === 'action-finished') { item.finishedAt = item.finishedAt || a.ts || null; item.status = 'done'; }
    else if (a.type === 'action-obsoleted') { item.obsoleted = true; item.reason = a.reason || null; item.status = 'obsolete'; }
  }
  closeSection();
  return { sections };
}

// ── atomic actions: render one ledger entry as a single human line ───────────────
function clausesOf(e) {
  return Array.isArray(e.clauses) && e.clauses.length ? e.clauses : (e.clause ? [e.clause] : []);
}

function actionLine(e) {
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

// An `enrichment` note is agent-authored prose and frequently mashes together several
// distinct facts (per-clause behavior, a declared seam, a verification summary) into one
// run-on paragraph. Split it into one child bullet per fragment — regex-only, no LLM in the
// loop (D19): a fragment naming a clause marker (§N), an Input/Observable Seam, or a
// verification pattern (test count / tsc / lint) becomes its own line; an unstructured note
// degrades to a "clauses: …" summary child plus the note itself, never one flat paragraph.
const SEAM_RE = /\b(input|observable) seam\b/i;
const VERIFY_RE = /(\d+\s+tests?\b|\btsc\b|\blint(ing)?\b|\btype-?check(ing)?\b)/i;
const CLAUSE_RE = /§\d+/;

function enrichmentChildren(e) {
  const clauses = clausesOf(e);
  const note = typeof e.note === 'string' ? e.note.trim() : '';
  if (!note) return clauses.length ? [`clauses: ${clauses.join(', ')}`] : [];

  const fragments = note.split(/(?<=[.;])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
  const clauseFrags = [], seamFrags = [], verifyFrags = [], otherFrags = [];
  for (const f of fragments) {
    if (SEAM_RE.test(f)) seamFrags.push(f);
    else if (VERIFY_RE.test(f)) verifyFrags.push(f);
    else if (CLAUSE_RE.test(f)) clauseFrags.push(f);
    else otherFrags.push(f);
  }
  const children = clauseFrags.length ? [...clauseFrags] : (clauses.length ? [`clauses: ${clauses.join(', ')}`] : []);
  children.push(...seamFrags, ...verifyFrags, ...otherFrags);
  return children;
}

// ── enrichment-derived checklist (fallback for pre-D19 runs) ─────────────────────────
// A work order that predates live action-event reporting (or whose agent never reported) has
// no `action-*` events, so replayActions yields NO sections — yet its terminal `enrichment`
// ledger events still record exactly which contract clauses it delivered. Derive one done-
// section per enriched component from those events: a legitimate PROJECTION of a real done-
// signal (the enrichment landed = the clause shipped), not fabricated status. Called ONLY when
// replayActions produced nothing, so a live-reported run is never overridden. One section per
// component (first-seen order); its clauses unioned across events, deduped, order-preserving.
function sectionsFromEnrichment(actions) {
  const byComponent = new Map(); // component -> ordered unique clause refs
  for (const e of (actions || [])) {
    if (e.type !== 'enrichment') continue;
    const clauses = clausesOf(e);
    if (!clauses.length) continue;
    const comp = e.component || '?';
    if (!byComponent.has(comp)) byComponent.set(comp, []);
    const refs = byComponent.get(comp);
    for (const c of clauses) if (!refs.includes(c)) refs.push(c);
  }
  return [...byComponent].map(([label, refs]) => ({
    label, dispatch: null, startedAt: null, crashedAt: null, finishedAt: null, status: 'done', derived: true,
    items: refs.map((ref) => ({ kind: 'clause', ref, label: ref, startedAt: null, finishedAt: null, obsoleted: false, reason: null, status: 'done' })),
  }));
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

// `active` means work has actually STARTED — at least one work order dispatched or
// checkpointed (an in-flight lane, exactly what reconcile.mjs treats as live). Being the
// current cursor (journal.currentVerticalSlice) does NOT by itself make a slice active: the
// cursor advances to the next slice at retro, BEFORE any work order or lane exists, and that
// slice stays `pending` until real work lands. The cursor is shown by the header's
// `slice **…**` line — never by a slice-row glyph.
function sliceStatus(woNodes) {
  if (woNodes.length === 0) return 'pending';
  if (woNodes.every((w) => isDone(w.status))) return 'green';
  if (woNodes.some((w) => w.status === 'dispatched' || w.status === 'checkpointed')) return 'active';
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
      // Ordered by `seq` — the monotonic append counter, i.e. causal order — NEVER by ts
      // (ts can be agent-authored and unreliable; seq is mechanically assigned).
      const rawActions = (actionsByWO[id] || []).slice().sort((a, b) => (a.seq || 0) - (b.seq || 0));
      // The flat historical trail excludes the new action-* events — those render as the
      // section/item tree below (replayActions) instead; showing both would be redundant.
      const actions = rawActions
        .filter((e) => !e.type || !e.type.startsWith('action-'))
        .map((e) => ({
          kind: 'action', type: e.type, title: actionLine(e), ts: e.ts || null, seq: e.seq ?? null,
          // Leaf detail strings, not further nodes — only `enrichment` currently populates this.
          children: e.type === 'enrichment' ? enrichmentChildren(e) : [],
        }));
      const { sections } = replayActions(rawActions);
      // No live-reported sections (a pre-D19 or non-reporting run) → fall back to a done-checklist
      // derived from the WO's enrichment clauses, so every green implementer shows its items.
      const finalSections = sections.length ? sections : sectionsFromEnrichment(rawActions);
      return { kind: 'work-order', id, status, title: woTitle(id, def, st), role: st.role || def.role || null, children: actions, sections: finalSections };
    });

    return { kind: 'slice', id: sid, status: sliceStatus(workOrders), children: workOrders };
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
// LITERAL timestamps, never a relative age. A pinned file is read long after it was
// rendered, so "3s ago" silently rots into a lie; an absolute clock time stays true.
// Sliced straight from the stored ISO ts (no Date, no timezone math) → deterministic and
// stable across re-renders. Times are UTC (the ledger/heartbeat ts is `…Z`), rendered as
// `YYYY-MM-DD HH:MM:SS UTC` — full date, human punctuation, never the raw `T…Z` ISO form.
// Returns the bracketed `[…] ` prefix (trailing space), or '' when the ts is absent/unparseable.
function humanTs(ts) {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})/.exec(typeof ts === 'string' ? ts : '');
  return m ? `${m[1]} ${m[2]} UTC` : '';
}
function tsp(ts) {
  const t = humanTs(ts);
  return t ? `[${t}] ` : '';
}
// The currently-active row shows its start time; a `dead` section (a crash boundary) shows the
// moment it was sealed (when the resuming dispatch reopened it). Done/pending/obsolete rows show
// none — duration is inferred from the gap to whatever started next, never stored explicitly.
function actionRowSuffix(row) {
  if (row.status === 'active') return `   ${tsp(row.startedAt)}`.trimEnd();
  if (row.status === 'dead') return `   ${tsp(row.crashedAt)}`.trimEnd();
  return '';
}
// A clause item is identified by its § ref — surface it so a finished clause reads as
// `✓ §8 — <what it covers>`, consistent with the derived checklist's bare `✓ §8` and mapping
// the § numbers in an `✎ enriched …` line to visible ticks above. The descriptive label is
// appended only when it says more than the ref itself: a clause reported with no description
// (label defaults to the ref) and every derived item show just the ref — never `§8 — §8`.
// Non-clause items (adhoc steps, slugs) keep their plain label.
function itemText(it) {
  if (it.kind === 'clause' && it.ref) {
    return (it.label && it.label !== it.ref) ? `${it.ref} — ${it.label}` : it.ref;
  }
  return it.label || it.ref || '';
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
  L.push('> Pin this file to follow the run live — it is regenerated every time a work order reports its own progress, no model in the loop. Times are UTC.');
  L.push('');
  for (const s of m.slices) {
    L.push(`- ${glyph(s.status)} **${s.id}**  _(${s.status})_`);
    for (const w of s.children) {
      L.push(`  - ${glyph(w.status)} \`${w.id}\` — ${w.title}  _(${w.status})_`);
      for (const sec of (w.sections || [])) {
        L.push(`    - ${ACTION_GLYPH[sec.status] || '·'} ${sec.label}${actionRowSuffix(sec)}`);
        for (const it of sec.items) {
          const reasonSuffix = it.status === 'obsolete' && it.reason ? ` — ${it.reason}` : '';
          L.push(`      - ${ACTION_GLYPH[it.status] || '·'} ${itemText(it)}${reasonSuffix}${actionRowSuffix(it)}`);
        }
      }
      // The action trail (already seq-ordered). A ts later than some higher-seq sibling's is
      // provably wrong — the seq counter is the real monotonic clock — so we suppress it
      // rather than print a misleading time. (Walk backwards tracking the min successor ts.)
      const acts = w.children;
      const reliable = new Array(acts.length);
      let minLaterMs = Infinity;
      for (let i = acts.length - 1; i >= 0; i--) {
        const ms = Date.parse(acts[i].ts || '');
        reliable[i] = Number.isFinite(ms) && ms <= minLaterMs;
        if (Number.isFinite(ms)) minLaterMs = Math.min(minLaterMs, ms);
      }
      for (let i = 0; i < acts.length; i++) {
        L.push(`    - ${tsp(reliable[i] ? acts[i].ts : null)}✎ ${acts[i].title}`);
        for (const child of acts[i].children) L.push(`      - ${child}`);
      }
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
    // Only a CANONICAL effort artifact (`<effortRoot>/.reasonable/{journal,inbox}.json |
    // ledger.jsonl`) triggers a regen — basename AND parent must match, so a coincidental
    // journal.json in src never fires.
    if (!tgt || !['journal.json', 'inbox.json', 'ledger.jsonl'].includes(basename(tgt)) || basename(dirname(tgt)) !== '.reasonable') process.exit(0);
    // EFFORT-SCOPED: resolve the effort from the WRITTEN artifact's path, NEVER cwd. One
    // repo may host several efforts, each with its own `.reasonable/`; the artifact that
    // changed names exactly which effort's mirror to regenerate, while the scribe's cwd may
    // belong to a different effort. No cwd fallback — an unresolvable target is a no-op.
    const root = findEffortRoot(dirname(tgt));
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
