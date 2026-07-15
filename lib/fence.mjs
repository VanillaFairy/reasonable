// fence.mjs — PreToolUse blast-radius fence + capability boundaries.
//
// One hook, several laws, all from DESIGN §5.9/§5.10/§5.14/§6.5:
//   1. enforcement-layer is categorically off-limits to any lane (§5.14D)
//   2. spike-runner is path-fenced to its quarantine (§5.7)
//   3. per-role test-path rule: implementer never edits tests; blind-test-writer
//      only edits tests (§6.3)
//   4. a lane edits its own contract (enrichment) but never a foreign one (§5.10)
//   5. src edits must fall inside the declared locus, else block with a
//      scope-expansion hint (asking must be cheaper than sneaking) (§5.9)
//   6. test edits require a logged contract delta — tests track contracts 1:1 (§5.6)
//   7. Bash backstop: the structured-edit tools above are not the only way to
//      write a file (lib/shell-writes.mjs detects shell write targets).
//
// ── THE TWO-ROOT MODEL + IDENTITY GOVERNANCE (the lane-root fix) ───────────────
// A fenced worker has TWO roots, split by DOMAIN (never by read-vs-write):
//   • effortRoot — the CANONICAL main checkout that owns the single `.reasonable/`
//     (contracts, ledger, baseline, journal, intention, …). Read AND written there.
//     It is gitignored, durable on-disk; reconcile reads it straight from disk.
//   • laneRoot — the lane's git worktree. Holds CODE only (src, tests); the cwd for
//     `git -C`. The worktree NEVER carries its own `.reasonable/`.
//
// EMPIRICALLY VERIFIED runtime facts this design rests on (probed this session):
//   (a) A workflow/Task subagent's cwd is ALWAYS the main session's dir (the effort
//       root), permanently — `cd` does not persist and there is no API to set it.
//   (b) The PreToolUse payload carries `agent_type` for every subagent tool call
//       (the dispatched role, e.g. `reasonable:characterizer`); the MAIN SESSION has
//       no `agent_type`. PreToolUse fires for both Task and Workflow subagents.
//
// Consequence: for a CODE write (target under a worktree) the lane descriptor is an
// ancestor of the target, so `findLane(tgt)` resolves it cwd-independently — laws
// 1-7 above apply unchanged. But for a CANONICAL `.reasonable/` write the descriptor
// lives in a SIBLING worktree (never an ancestor of the target) and cwd is the effort
// root, so `findLane` cannot reach it. Such writes are therefore governed by the
// harness ROLE STAMP (`agent_type` → roleOf) against an explicit role×artifact matrix
// (governReasonable). This is the §5.14 control surface, enforced by identity rather
// than by an unreachable descriptor.
//
// Fails CLOSED inside an effort, OPEN outside one (D7b). The MAIN SESSION (no
// agent_type) is the trusted control plane and may write `.reasonable/` freely. A
// SUBAGENT (has agent_type) is governed: `.reasonable/` writes by the matrix; code
// writes by its lane; a subagent code edit OUTSIDE any provisioned lane is the
// descriptor-less hazard and is denied. Only when NO effort is reachable at all (a
// plain repo / an external checkout) is everything allowed.

import { join, isAbsolute } from 'node:path';
import {
  readStdinJson, targetPath, findLane, malformedLaneDescriptor, findEffortRoot, loadConfig, matchesAny, norm, deny,
  relative, resolve, readJsonl, roleOf, isUnder, assertNoAmbiguousBirth,
} from './effort.mjs';
import { readBaseline, intersectsFloor } from './baseline.mjs';
import { extractWriteTargets } from './shell-writes.mjs';

// Narrow, plugin-specific builtins only — a lane can never rewrite its own fence
// descriptor or a plugin manifest. Everything else enforcement-related (the
// .reasonable/* control files, .claude/settings*.json) comes from config
// `enforcementPaths`, which is specific by design so we don't false-positive on a
// project's own `src/hooks/` (React) or `.vscode/settings.json`.
const ENFORCEMENT_BUILTINS = [
  '**/.claude-plugin/**', '**/.reasonable-lane.json',
];

// BF5 — the roles that may write a contract. The implementer enriches a `grown`
// contract; the characterizer may BIRTH a `characterized` contract, but only when
// its lane carries `contractBirth` (the gate from §18's fixed atomic write order
// contract → ledger event → test). Any other role is a consumer: it cites, never
// writes (DESIGN §5.10, contracts are provider-owned).
const CONTRACT_WRITERS = new Set(['implementer', 'characterizer']);

// ── The identity-governance matrix for CANONICAL `.reasonable/` writes (§5.14). ──
// Keyed by the bare agent role (roleOf strips the `reasonable:` prefix). A subagent
// whose role is absent from an artifact's list is denied; the MAIN SESSION (role
// null) bypasses this entirely as the trusted control plane. Read-only roles
// (auditor, adjudicator, skeptic, route-planner, reconciler, intent-verifier, …)
// carry no edit tools by allowlist, so they never reach here — capability beats
// discipline; this matrix is the backstop for the WRITE-CAPABLE roles.
const REASONABLE_WRITE_PERMS = {
  CONTRACT: ['implementer', 'characterizer', 'scaffolder', 'census', 'spec-author'], // provider-owned clauses + skeletons; spec-author authors the canonical spec-time delta (A2, §4.1)
  // LEDGER is deliberately NOT in this identity matrix. A direct ledger write is a
  // CATEGORICAL denial for EVERY role — the trusted main session included (F1c) —
  // fired by ledgerWriteDenyReason ahead of the role===null exemptions, not decided by
  // identity. The ledger is owned by no role, only by the locked ledger.mjs controller.
  INDEX: ['journal-writer'],      // journal.json + inbox.json (the derived index — single serialized scribe, D3b)
  BASELINE: ['census'],           // the regression floor, written once at analysis
  INTENTION: ['intention-writer'],// the ratified oracle, one atomic write
  WORKEROUT: ['implementer'],     // progress-verdicts/ + ripple-manifests/ (checkpoint/escalation)
  LANEDESC: ['lane-provisioner'], // the .reasonable-lane.json a fresh worktree is seeded with
  WORKORDER: ['work-order-writer'], // work-orders/<id>.json — the route-planner PROPOSES the plan; a
                                  // dedicated narrow writer PERSISTS each immutable spec before the
                                  // lane-provisioner (which reads it as locus license) runs (D7).
  SEALED: [],                     // config/supervision/vision/route/verdicts/knowledge/… — orchestrator only
};

function relTo(root, abs) {
  return norm(relative(resolve(root), resolve(abs)));
}

function isTestPath(rel, cfg) {
  return matchesAny(rel, cfg.testGlobs);
}

function isContractPath(rel) {
  return /^\.reasonable\/contracts\/[a-z0-9][a-z0-9-]*\.md$/.test(norm(rel));
}

function contractName(rel) {
  const m = /\.reasonable\/contracts\/([a-z0-9][a-z0-9-]*)\.md$/.exec(norm(rel));
  return m ? m[1] : null;
}

function isEnforcement(rel, cfg) {
  const r = norm(rel);
  if (ENFORCEMENT_BUILTINS.some((g) => matchesAny(r, [g]) || r.endsWith(g.replace('**/', '')))) return true;
  return (cfg.enforcementPaths || []).some((p) => r === norm(p) || r.endsWith('/' + norm(p)) || r.endsWith(norm(p)));
}

/**
 * Classify a path (relative to an effort root) as a CANONICAL `.reasonable/`
 * artifact class, or return null when it is not effort state at all. The lane
 * descriptor lives at a worktree root (not under `.reasonable/`), so it is matched
 * by basename. `SEALED` is the conservative default for any other `.reasonable/`
 * path (config, supervision, vision, route, verdicts/, knowledge/, …) — those are
 * written only by the orchestrator (main session), never a subagent. `work-orders/`
 * is the one exception carved out of that default: the work-order-writer persists the
 * route-planner's proposed specs there (WORKORDER), still denied to every other role.
 */
function classifyReasonable(rel) {
  const r = norm(rel);
  // The ledger match is case-INSENSITIVE: the primary platform FS (Windows/NTFS) is
  // case-insensitive, so `.reasonable/Ledger.jsonl` opens the SAME real ledger file — a
  // guard a single capital letter defeats is no guard (F1c). Checked ahead of the
  // `.reasonable/` prefix guard so a case variant can never slip past to SEALED. Broader
  // classifier case-folding (the other enforcement paths + the prefix itself) is a
  // separate concern, deferred to T1.2 (§6.3 path-normalization).
  if (r.toLowerCase() === '.reasonable/ledger.jsonl') return 'LEDGER';
  if (r.split('/').pop() === '.reasonable-lane.json') return 'LANEDESC';
  if (!r.startsWith('.reasonable/')) return null;
  if (isContractPath(r)) return 'CONTRACT';
  if (r === '.reasonable/journal.json' || r === '.reasonable/inbox.json') return 'INDEX';
  if (r === '.reasonable/baseline.json') return 'BASELINE';
  if (r === '.reasonable/intention.md') return 'INTENTION';
  if (r.startsWith('.reasonable/progress-verdicts/') || r.startsWith('.reasonable/ripple-manifests/')) return 'WORKEROUT';
  if (r.startsWith('.reasonable/work-orders/')) return 'WORKORDER';
  return 'SEALED';
}

/**
 * Govern a SUBAGENT's write to a canonical `.reasonable/` artifact by its role
 * (§5.14). Returns 'continue' when the path is not effort state (caller proceeds),
 * 'allow' when the role owns the artifact class, or 'deny' otherwise. The main
 * session is handled by the caller (it never reaches here).
 */
function governReasonable(role, rel) {
  const cls = classifyReasonable(rel);
  if (!cls) return { decision: 'continue' };
  const allowed = REASONABLE_WRITE_PERMS[cls] || [];
  if (allowed.includes(role)) return { decision: 'allow' };
  // Note: a LEDGER path never reaches here — it is denied categorically for every role
  // (incl. main) by ledgerWriteDenyReason before governReasonable is consulted (F1c).
  return {
    decision: 'deny',
    reason:
      `Identity-governed .reasonable/ write denied: role "${role}" may not write ${cls} artifact "${rel}" ` +
      `(DESIGN §5.14 control surface). Canonical effort state is governed by the harness agent-role stamp, ` +
      `because a workflow subagent's cwd is the effort root and the lane descriptor is unreachable for a ` +
      `canonical write. Allowed: [${allowed.length ? allowed.join(', ') : 'orchestrator / main session only'}]. ` +
      `Workers propose state changes as data; the owning role (or the scribe) persists them.`,
  };
}

/**
 * F1c (DESIGN §5.5) — the categorical ledger-write law. A DIRECT write to the
 * append-only `.reasonable/ledger.jsonl` is forbidden for EVERY role, the trusted main
 * session INCLUDED: the file is mutated only through `lib/ledger.mjs` append() under its
 * lock, and two parallel sessions writing it directly race that lock and silently lose an
 * update with no detector. This is a categorical (like the enforcement layer), not an
 * identity-matrix decision — the ledger is owned by no role, only by the locked
 * controller. Callers `deny(ledgerWriteDenyReason(...))` ahead of every `role===null`
 * exemption, on both the structured-edit (viaShell=false) and Bash (viaShell=true) channels.
 */
function ledgerWriteDenyReason(target, viaShell) {
  return (
    `Direct writes to .reasonable/ledger.jsonl are forbidden for EVERY role, including the trusted ` +
    `main session — append only via lib/ledger.mjs append() under its lock (DESIGN §5.5 F1c). ` +
    (viaShell ? `Detected a shell write to "${target}". ` : '') +
    `Two sessions writing the file directly race the ledger lock and silently lose an update. Emit the ` +
    `event as data through 'node <plugin>/lib/ledger.mjs append --root <effort> --type <t> --node <id> ...' — ` +
    `the controller validates it, assigns the seq, and persists it under the lock. (INVOKING ledger.mjs is ` +
    `allowed; only a raw write to the file — Edit/Write, >>, tee, cp — is denied.)`
  );
}

/**
 * §6.4 (F5) — the STRAY-BIRTH guard, shared by the structured-edit and Bash first-birth paths. A write
 * that would CREATE a repo-root `.reasonable/` (reached only when NO effort is up-walkable from the
 * target — the first-birth branch) is a possible stray birth when `.reasonable-efforts/` already holds
 * a born effort: a develop run that lost its `--root` re-births a repo-root effort that would SHADOW the
 * nested ones in the up-walk. Only that co-existence denies; a truly plain repo (no born nested efforts,
 * assertNoAmbiguousBirth → false) STILL fails OPEN (invariant #2), and a non-`.reasonable/` target
 * (ordinary code/build write) is never policed here. `tgtAbs` MUST be an absolute, norm()'d path.
 *
 * Returns a deny reason string, or null to fail open.
 */
function strayBirthDenyReason(tgtAbs) {
  const marker = tgtAbs.indexOf('/.reasonable/');
  if (marker < 0) return null;                    // not a write into a `.reasonable/` dir — fail open
  const repoRoot = tgtAbs.slice(0, marker);       // the dir that would OWN this `.reasonable/`
  const amb = assertNoAmbiguousBirth(repoRoot);
  if (!amb.ambiguous) return null;                // no born nested efforts — a plain first birth, fail open
  return (
    `Possible stray birth: "${tgtAbs}" would create a repo-root .reasonable/ at "${repoRoot}", but ` +
    `.reasonable-efforts/ already holds born effort(s) [${amb.existing.join(', ')}]. A run that lost its ` +
    `--root re-births a repo-root effort that SHADOWS the nested ones in the up-walk (DESIGN §6.4/F5). ` +
    `Pass an explicit nested --root .reasonable-efforts/<name>/ (or write into an existing nested effort) ` +
    `— never a bare birth at the repo root while nested efforts exist.`
  );
}

/** Has a contract delta for one of the lane's contracts been logged to the ledger? */
function hasLoggedContractDelta(lane) {
  const ledgerPath = join(lane.effortRoot || lane.__root, '.reasonable', 'ledger.jsonl');
  const events = readJsonl(ledgerPath);
  const contracts = new Set(lane.contracts || []);
  // The blind-test-writer's lane may name the exact delta it is formalizing.
  if (lane.contractDelta && lane.contractDelta.component) contracts.add(lane.contractDelta.component);
  // BF1 — a born `characterized` clause is logged as a `characterization` event;
  // it is a contract delta too, so a characterization test diff tracks it 1:1.
  return events.some((e) =>
    (e.type === 'enrichment' || e.type === 'amendment' || e.type === 'characterization') &&
    contracts.has(e.component));
}

// The categorical control-surface laws (1/2/4), shared by the structured-edit
// path and the Bash backstop so both honor exactly one boundary. Returns:
//   { decision: 'deny', reason }  — a categorical violation
//   { decision: 'allow' }         — explicitly sanctioned (own contract / in-quarantine)
//   { decision: 'continue' }      — not a control-surface path; the caller applies
//                                   any remaining (test / locus / floor) rules.
function categorical(rel, tgtAbs, lane, cfg) {
  // 1. Enforcement layer — categorical, beats even the spike's law-free quarantine.
  if (isEnforcement(rel, cfg)) {
    return { decision: 'deny', reason:
      `Enforcement layer is outside every work order's locus (DESIGN §5.14D). ` +
      `"${rel}" (config/hooks/ledger/journal/lane descriptor/settings) can change only ` +
      `via the human or a human-approved meta work order. Self-exempting enforcement isn't enforcement.` };
  }
  // 2. Spike-runner quarantine.
  if (lane.quarantineOnly) {
    const q = lane.quarantineRoot ? resolve(lane.quarantineRoot) : null;
    if (!q || resolve(tgtAbs).indexOf(q) !== 0) {
      return { decision: 'deny', reason:
        `spike-runner is path-fenced to its quarantine (${lane.quarantineRoot}). ` +
        `Spike code is law-free but extraterritorial — it re-enters mainline only as a knowledge ` +
        `artifact (rewrite-from-knowledge, never refactor-from-spike, DESIGN §5.7).` };
    }
    return { decision: 'allow' }; // inside quarantine — spike is law-free
  }
  // 3 & 4. Contract files: only a contract-writer role, only its own contracts.
  if (isContractPath(rel)) {
    const name = contractName(rel);
    if (!CONTRACT_WRITERS.has(lane.role)) {
      return { decision: 'deny', reason:
        `Only a contract-writer (implementer enriches, characterizer births) may edit ${rel}; ` +
        `role "${lane.role}" may not (DESIGN §5.10). Contracts are provider-owned; consumers cite.` };
    }
    // BF5 — the characterizer writes contracts only while its lane is in the birth
    // phase (gated on `contractBirth`); otherwise it is a read-only mutator.
    if (lane.role === 'characterizer' && !lane.contractBirth) {
      return { decision: 'deny', reason:
        `The characterizer may write a contract only during contract birth ` +
        `(lane.contractBirth, DESIGN §18/BF5): "${rel}" is outside a birth window. It otherwise reads ` +
        `production code and writes only parked characterization tests.` };
    }
    if (!(lane.contracts || []).includes(name)) {
      return { decision: 'deny', reason:
        `Contract-writers never touch foreign contracts (DESIGN §5.10 Ruling 2). ` +
        `"${name}" is not in this work order's contracts [${(lane.contracts || []).join(', ')}]. ` +
        `Escalate a ripple manifest to the orchestrator instead.` };
    }
    // A characterizer in its birth window may CREATE a brand-new contract file with
    // no prior ledger entry (the §18 atomic order is contract → ledger event → test,
    // so the file legitimately precedes its ledger line). Implementer enrichment of
    // an own contract is likewise allowed here.
    return { decision: 'allow' };
  }
  return { decision: 'continue' };
}

const input = await readStdinJson();
const tool = input.tool_name;
const role = roleOf(input); // null = main session / orchestrator (trusted control plane)

// ── Bash backstop (law 7) ──────────────────────────────────────────────────────
// Two regimes, both keyed off whether cwd sits inside a provisioned lane worktree:
//   • cwd IS in a worktree (the descriptor is reachable) → the existing categorical
//     control-surface backstop against BOTH roots (laneRoot + effortRoot).
//   • cwd is NOT in a lane (production: a subagent's cwd is the effort root, or the
//     orchestrator's main checkout) → identity governance: a `.reasonable/` (or lane-
//     descriptor) shell write is checked against the role matrix; the MAIN SESSION
//     (role null) is the trusted control plane and is allowed. This closes the hole
//     where a subagent could `echo forged >> .reasonable/ledger.jsonl` from the effort
//     root and route around the structured fence. The locus/test/floor rules are NOT
//     applied to Bash (build & test tooling legitimately writes far outside the locus).
if (tool === 'Bash') {
  const command = input.tool_input && input.tool_input.command;
  if (!command) process.exit(0);
  const laneByCwd = findLane(input.cwd || process.cwd());
  for (const target of extractWriteTargets(command)) {
    const base = (laneByCwd && laneByCwd.__root) || input.cwd || process.cwd();
    const abs = isAbsolute(target) ? target : resolve(base, target);
    if (laneByCwd) {
      // cwd is in a worktree — apply the categorical control surface against both roots.
      const laneRoot = laneByCwd.__root;
      const cfg = loadConfig(laneByCwd.effortRoot || laneRoot);
      const roots = [laneRoot, laneByCwd.effortRoot].filter(Boolean);
      let sanctioned = false;
      for (const r of roots) {
        const c = categorical(relTo(r, abs), abs, laneByCwd, cfg);
        if (c.decision === 'deny') {
          deny(`Detected shell write to a fenced path ("${target}"). ` + c.reason +
            ` (The Bash fence is a backstop on the control surface; use the role's edit tools so the ` +
            `structured fence can govern the write — asking must be cheaper than sneaking.)`);
        }
        if (c.decision === 'allow') { sanctioned = true; break; }
      }
      if (sanctioned) continue;
      continue; // not a control-surface path under either root — locus not policed for Bash
    }
    // No lane at cwd — identity-govern any canonical `.reasonable/` (or descriptor) shell write.
    const er = findEffortRoot(abs);
    if (!er) {
      // First-birth branch (mirror the structured path): a bare repo-root `.reasonable/` shell write
      // beside born nested efforts is a possible stray birth (§6.4/F5); a plain repo still fails open.
      const reason = strayBirthDenyReason(norm(resolve(abs)));
      if (reason) deny(`Detected shell write "${target}". ` + reason);
      continue; // outside any effort — not policed
    }
    const rel = relTo(er, abs);
    const cls = classifyReasonable(rel);
    if (!cls) continue; // code/build target outside `.reasonable/` — not policed
    // F1c (§5.5) — a DIRECT shell write to the append-only ledger is denied for EVERY role,
    // main session INCLUDED, ahead of the trusted-main exemption. `node ledger.mjs append`
    // is NOT a write target (extractWriteTargets returns [] for it), so the locked controller
    // path stays open; only a raw >>/tee/cp onto the file reaches here.
    if (cls === 'LEDGER') deny(ledgerWriteDenyReason(target, true));
    if (role === null) continue; // main session / orchestrator = trusted control plane
    const g = governReasonable(role, rel);
    if (g.decision === 'deny') {
      deny(`Detected shell write to a governed path ("${target}"). ` + g.reason +
        ` (Bash control-surface backstop; use your role's edit tools so the structured fence governs the write.)`);
    }
  }
  process.exit(0); // no control-surface violation — Bash allowed (locus not policed here)
}

const tgt = targetPath(tool, input.tool_input);
if (!tgt) process.exit(0); // non-mutating tool — nothing to fence

// ── Structured edits (Edit/Write/MultiEdit/NotebookEdit). ──────────────────────
// Resolve the governing lane, but treat this as a CODE write only when the TARGET is actually
// under that lane's worktree. The cwd fallback covers the rare case where cwd resolves a lane;
// a CANONICAL `.reasonable/` target (under the effort root, not the worktree) must NOT enter the
// code branch via that fallback — there it would be mis-judged as out-of-locus/enforcement and
// wrongly denied. Such a target belongs to the identity-governed canonical branch below.
const lane = findLane(tgt) || findLane(input.cwd || process.cwd());
if (lane && isUnder(tgt, lane.__root)) {
  // A target whose ancestor carries a lane descriptor = a CODE write inside that
  // worktree. The descriptor is reachable, so laws 1-7 apply with the descriptor as
  // authority (locus/floor/test/own-contract). cwd-independent: the descriptor is an
  // ancestor of the target, not a function of where the agent stands.
  const laneRoot = lane.__root;
  const rel = relTo(laneRoot, tgt);
  const cfg = loadConfig(lane.effortRoot || laneRoot);

  // §3b — orchestration state belongs to the EFFORT ROOT, never the worktree. A
  // write to a worktree-local `.reasonable/` is the parallel-bootstrap hazard (the
  // lane-root incident): it lands in the gitignored, ephemeral worktree `.reasonable/`
  // and is lost at teardown, divergent from canonical truth. Deny it — BEFORE the
  // own-contract allow, so a worktree-local contract write cannot slip through.
  // Gated on effortRoot != laneRoot so a degenerate single-root effort still allows
  // its in-place `.reasonable/`.
  if (lane.effortRoot && resolve(lane.effortRoot) !== resolve(laneRoot) && /^\.reasonable\//.test(norm(rel))) {
    deny(`Orchestration state (.reasonable/) is owned by the effort root "${lane.effortRoot}", not the lane ` +
      `worktree (lane-root two-root split). "${rel}" would write into the gitignored, ephemeral worktree ` +
      `.reasonable/ and be lost at teardown. The worktree holds CODE only; write contracts/ledger/etc. under ` +
      `"${lane.effortRoot}/.reasonable/" (absolute) — they are governed there by your agent role.`);
  }

  // The lane descriptor itself is provisioner-owned even on an (idempotent) rewrite.
  if (norm(rel) === '.reasonable-lane.json') {
    if (role === 'lane-provisioner') process.exit(0);
    deny(`The .reasonable-lane.json descriptor is written only by the lane-provisioner before a worker is ` +
      `dispatched (DESIGN §5.14D); role "${role || 'main session'}" may not rewrite it.`);
  }

  // Laws 1/2/4 — the categorical control surface (shared with the Bash backstop).
  const cat = categorical(rel, tgt, lane, cfg);
  if (cat.decision === 'deny') deny(cat.reason);
  if (cat.decision === 'allow') process.exit(0);

  // 5. Test-path rule, per role.
  const test = isTestPath(rel, cfg);
  if (test) {
    if (!lane.testEditsAllowed) {
      deny(`The implementer may not edit test files (DESIGN §6.3): "${rel}". ` +
        `Tests are derived from contracts by the blind-test-writer, not written alongside code — ` +
        `tests written while looking at the implementation assert what the code does, not what the ` +
        `contract says.`);
    }
    // 6. test/contract parity: a test diff requires a logged contract delta.
    if (!hasLoggedContractDelta(lane)) {
      const want = (lane.contracts || []).slice();
      if (lane.contractDelta && lane.contractDelta.component) want.push(lane.contractDelta.component);
      deny(`Test edits track contracts 1:1 (DESIGN §5.6 ratchet): the ledger has no delta of ` +
        `type "enrichment", "amendment", or "characterization" whose component is one of ` +
        `[${want.join(', ')}]. A ledger line of type "verdict" does NOT count — it is a progress ` +
        `note, not a contract delta. Most often this means the implementer logged its enrichment ` +
        `with the wrong type or a mismatched component name: the orchestrator must log the contract ` +
        `delta as type:"enrichment" with component exactly one of [${want.join(', ')}] first.`);
    }
    process.exit(0); // legitimate blind-test-writer edit
  }

  // A blind-test-writer must NOT edit non-test source.
  if (lane.testEditsAllowed && lane.role === 'blind-test-writer') {
    deny(`The blind-test-writer edits test paths only (DESIGN §6.3): "${rel}" is not a test path. ` +
      `It formalizes contract deltas into tests, blind to the implementation.`);
  }

  // 5 (cont). Locus fence for ordinary source edits.
  if (!matchesAny(rel, lane.locus)) {
    deny(`Out-of-locus edit blocked (blast-radius fence, DESIGN §5.9 Ruling 2): "${rel}" is outside ` +
      `this work order's declared locus [${(lane.locus || []).join(', ')}]. Request a scope expansion ` +
      `from the orchestrator (a cheap, logged message) — asking must be cheaper than sneaking.`);
  }

  // BF8. Floor-containment fence: the union of floor-test loci is treated like a
  // declared locus. A src edit that intersects it without the lane declaring
  // `floorImpact` is a presumed regression and is denied (DESIGN §18, punch-list 16).
  const baseline = readBaseline(lane.effortRoot || laneRoot);
  if (!lane.floorImpact && intersectsFloor(rel, baseline)) {
    deny(`Floor-containment fence blocked (regression floor, DESIGN §18/BF8): "${rel}" intersects the ` +
      `union of floor-test loci, which is held green as a containment fence. This work order has not ` +
      `declared \`floorImpact\`, so the edit is a presumed regression. Declare floorImpact via a logged ` +
      `scope-expansion (the change-characterized-planned path) — asking must be cheaper than sneaking.`);
  }

  process.exit(0); // in-locus source edit — allowed
}

// ── No lane reachable from the target. ─────────────────────────────────────────
// Either a canonical `.reasonable/` write (the descriptor is in a sibling worktree,
// unreachable from this target), or a code edit outside any provisioned lane.
const effortRoot = findEffortRoot(tgt) || findEffortRoot(input.cwd || process.cwd());
if (!effortRoot) {
  // First-birth branch: no effort reachable by up-walk. Either a truly plain repo (fail OPEN, invariant
  // #2) or a first-birth write. Guard ONLY the narrow stray-birth hazard (§6.4/F5) — a bare repo-root
  // `.reasonable/` birth beside real nested efforts; a plain repo (no born nested efforts) still allows.
  const reason = strayBirthDenyReason(norm(resolve(tgt)));
  if (reason) deny(reason);
  process.exit(0); // no effort reachable — plain repo / external checkout — allow
}

const rel = relTo(effortRoot, tgt);

// A canonical `.reasonable/` (or lane-descriptor) write — identity-governed (§5.14).
const cls = classifyReasonable(rel);
if (cls) {
  // F1c (§5.5) — a DIRECT ledger write is a CATEGORICAL denial for EVERY role, the main
  // session included; it dominates the trusted-main exemption below. Every writer appends
  // through lib/ledger.mjs's locked append(), never Edit/Write on the file itself.
  if (cls === 'LEDGER') deny(ledgerWriteDenyReason(rel, false));
  if (role === null) process.exit(0); // main session / orchestrator = trusted control plane
  const g = governReasonable(role, rel);
  if (g.decision === 'deny') deny(g.reason);
  process.exit(0); // role owns this artifact class — allowed
}

// Not effort state, no lane, inside an effort.
if (role === null) process.exit(0); // the main session edits its own checkout freely — trusted
// Before blaming the worker: a lane descriptor that EXISTS but does not PARSE is
// read as null by findLane, so a genuinely-provisioned lane looks like "no lane".
// Fail LOUDLY with the real cause instead of the misleading "presumed hostile"
// message — a corrupt descriptor is a provisioner bug (e.g. an unescaped Windows
// backslash path), not a rogue worker. Check the target's ancestry, then the cwd.
const corrupt = malformedLaneDescriptor(tgt) || malformedLaneDescriptor(input.cwd || process.cwd());
if (corrupt) {
  deny(`Corrupt lane descriptor: "${corrupt.file}" exists but is not valid JSON (${corrupt.error}). ` +
    `The fence reads an unparseable descriptor as "no lane", so it denied "${rel}" as if unprovisioned. ` +
    `This is a lane-provisioner bug, NOT a rogue worker — almost always an unescaped path (a Windows ` +
    `backslash \\ opens an invalid JSON string escape). Rewrite the descriptor with forward-slash paths ` +
    `(the lane-provisioner must write valid JSON) and re-dispatch. The worker did nothing wrong.`);
}
// A SUBAGENT editing code outside any provisioned lane is the descriptor-less hazard
// (D7b, presumed hostile): a fenced worker edits CODE only inside its lane worktree
// (absolute paths) and `.reasonable/` state only under the effort root.
deny(`presumed hostile: subagent "${role}" editing "${rel}" inside an active effort ("${effortRoot}") with ` +
  `no provisioned lane (DESIGN/D7b). A fenced worker edits code only inside its lane worktree (by absolute ` +
  `path) and effort state only under the effort root's .reasonable/. This write is in neither — refusing.`);
