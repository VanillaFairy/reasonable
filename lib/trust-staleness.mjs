// trust-staleness.mjs — the D13 trust-staleness computation, extracted from
// reconcile.mjs so it has a home, a test, and a second consumer (per-work-order
// distribution). Trust is earned, persistent, EVENT-invalidated: a trusted-green
// test is re-verified only when its governing clause is amended or its behavior
// extended SINCE that test's last verification — no re-checking churn. The ledger
// IS the event log; the mapping (test ↔ clause) is the contract's citation,
// mechanical not eyeballed (DESIGN §5 D13; architecture S16).
//
// Law 1 (dependency-free): node builtins only — and in fact NO I/O at all. The
// caller reads the ledger; these functions are pure over that array. reconcile.mjs
// calls trustStaleness(ledger) and threads the result into the briefing; the
// vertical-slice runner distributes it per work order with distributeStaleness().

/**
 * From the ledger event stream, compute the set of trusted-green tests whose
 * governing clause was amended or extended since their last verification.
 *
 * Returns { staleTests: [{ test, component, clause, verifiedAtSeq, invalidatedAtSeq, by }],
 *           staleClauses: ["component §n", ...] }.
 *
 * - A test becomes "verified-green at seq S" via a GREEN verdict / audit / a
 *   characterization-promotion that names it together with its clause.
 * - A clause is "amended/extended at seq S'" via an `amendment` or an
 *   `enrichment` that names the component+clause.
 * - The test is STALE iff S' > S (its last verification predates the change).
 */
export function trustStaleness(ledger) {
  // Most-recent verification seq per (test) and the clause it was verified under.
  const verifiedAt = new Map(); // testId -> { seq, component, clause }
  // Most-recent amend/extend seq per clause key "component clause".
  const amendedAt = new Map();  // clauseKey -> { seq, kind }

  for (const e of ledger) {
    if (!e || typeof e !== 'object') continue;
    const seq = Number(e.seq) || 0;
    const comp = e.component || null;

    if (isGreenVerification(e)) {
      for (const t of namedTests(e)) {
        const prev = verifiedAt.get(t);
        if (!prev || seq >= prev.seq) {
          verifiedAt.set(t, { seq, component: comp, clause: firstClause(e) });
        }
      }
    }
    if ((e.type === 'amendment' || e.type === 'enrichment') && comp) {
      for (const cl of namedClauses(e)) {
        const key = clauseKey(comp, cl);
        const prev = amendedAt.get(key);
        if (!prev || seq >= prev.seq) amendedAt.set(key, { seq, kind: e.type });
      }
    }
  }

  const staleTests = [];
  const staleClauses = new Set();
  for (const [test, v] of verifiedAt) {
    if (!v.component || !v.clause) continue;
    const key = clauseKey(v.component, v.clause);
    const amend = amendedAt.get(key);
    if (amend && amend.seq > v.seq) {
      staleTests.push({
        test,
        component: v.component,
        clause: v.clause,
        verifiedAtSeq: v.seq,
        invalidatedAtSeq: amend.seq,
        by: amend.kind,
      });
      staleClauses.add(`${v.component} ${v.clause}`);
    }
  }
  return { staleTests, staleClauses: [...staleClauses] };
}

/**
 * Distribute a computed staleness set across work-order footprints — the per-work-order
 * re-verify flag (D13). Pure set-algebra: a stale test is routed to a work order when the
 * test's governing component is inside that work order's citation closure (footprint.contracts).
 * This is the distribution the route-planner used to do in PROSE; it is decidable, so it
 * belongs in code (footprint/overlap is a decidable fence, D12).
 *
 * @param staleTests  the `staleTests` array from trustStaleness()
 * @param footprints  [{ id, contracts: [component, ...], ... }] — contracts is the closure
 * @returns { [workOrderId]: [staleTestId, ...] }
 */
export function distributeStaleness(staleTests, footprints) {
  const out = {};
  for (const fp of footprints || []) {
    const comps = new Set(fp.contracts || []);
    out[fp.id] = (staleTests || [])
      .filter((s) => s && comps.has(s.component))
      .map((s) => s.test);
  }
  return out;
}

/** A GREEN verification event: an audit/verdict marked green, or a promotion. */
function isGreenVerification(e) {
  if (e.type === 'characterization-promotion') return true;
  if (e.type === 'verdict' || e.type === 'audit') {
    const k = String(e.kind || e.result || '').toLowerCase();
    return k === 'green' || e.green === true || e.passed === true;
  }
  return false;
}

/** The tests an event names (single or array, across the common field names). */
function namedTests(e) {
  const out = new Set();
  for (const k of ['test', 'asserting', 'assertingTest', 'floorTest']) {
    if (typeof e[k] === 'string' && e[k]) out.add(e[k]);
  }
  if (Array.isArray(e.tests)) for (const t of e.tests) if (typeof t === 'string' && t) out.add(t);
  return [...out];
}

/** The clauses an event names (single `clause` or array `clauses`). */
function namedClauses(e) {
  const out = new Set();
  if (typeof e.clause === 'string' && e.clause) out.add(e.clause);
  if (Array.isArray(e.clauses)) for (const c of e.clauses) if (typeof c === 'string' && c) out.add(c);
  return [...out];
}

/** The clause a verification was performed under (first named clause). */
function firstClause(e) {
  return namedClauses(e)[0] || null;
}

function clauseKey(component, clause) {
  return `${component} ${clause}`;
}
