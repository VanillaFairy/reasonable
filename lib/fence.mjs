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
//
// Fails CLOSED inside an effort, OPEN outside one (D7b): no lane descriptor but a
// reachable effort root ⇒ ungoverned worktree inside a live effort ⇒ presumed
// hostile ⇒ deny. Only when no effort is reachable at all (a plain repo / the
// human's main checkout) is the edit allowed — the main checkout has no lane file
// and no .reasonable/ above it, so it is never fenced.

import { join } from 'node:path';
import {
  readStdinJson, targetPath, findLane, findEffortRoot, loadConfig, matchesAny, norm, deny,
  relative, resolve, readJsonl,
} from './effort.mjs';
import { readBaseline, intersectsFloor } from './baseline.mjs';

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

const input = await readStdinJson();
const tool = input.tool_name;
const tgt = targetPath(tool, input.tool_input);
if (!tgt) process.exit(0); // non-mutating tool — nothing to fence

const lane = findLane(tgt) || findLane(input.cwd || process.cwd());
if (!lane) {
  // D7b — fail CLOSED inside an effort. No lane descriptor but an effort root is
  // reachable means an ungoverned worktree inside a live effort: presume hostile
  // and deny. Only when NO effort is reachable at all (a plain repo / the human's
  // main checkout) do we fail open.
  const effortRoot = findEffortRoot(tgt) || findEffortRoot(input.cwd || process.cwd());
  if (effortRoot) {
    deny(`presumed hostile: effort worktree with no lane descriptor (DESIGN/D7b). ` +
      `An edit inside an active effort ("${effortRoot}") with no .reasonable-lane.json is ungoverned; ` +
      `the fence fails closed here. A lane is provisioned by the lane-provisioner before any fenced ` +
      `worker is dispatched — the descriptor-less window is presumed hostile, not allowed.`);
  }
  process.exit(0); // no effort reachable — main checkout / plain repo — allow
}

const laneRoot = lane.__root;
const rel = relTo(laneRoot, tgt);
const cfg = loadConfig(lane.effortRoot || laneRoot);

// 1. Enforcement layer — categorical, before anything else.
if (isEnforcement(rel, cfg)) {
  deny(`Enforcement layer is outside every work order's locus (DESIGN §5.14D). ` +
    `"${rel}" (config/hooks/ledger/journal/lane descriptor/settings) can change only ` +
    `via the human or a human-approved meta work order. Self-exempting enforcement isn't enforcement.`);
}

// 2. Spike-runner quarantine.
if (lane.quarantineOnly) {
  const q = lane.quarantineRoot ? resolve(lane.quarantineRoot) : null;
  if (!q || resolve(tgt).indexOf(q) !== 0) {
    deny(`spike-runner is path-fenced to its quarantine (${lane.quarantineRoot}). ` +
      `Spike code is law-free but extraterritorial — it re-enters mainline only as a knowledge ` +
      `artifact (rewrite-from-knowledge, never refactor-from-spike, DESIGN §5.7).`);
  }
  process.exit(0); // inside quarantine — spike is law-free
}

// 3 & 4. Contract files: only a contract-writer role, only its own contracts.
if (isContractPath(rel)) {
  const name = contractName(rel);
  if (!CONTRACT_WRITERS.has(lane.role)) {
    deny(`Only a contract-writer (implementer enriches, characterizer births) may edit ${rel}; ` +
      `role "${lane.role}" may not (DESIGN §5.10). Contracts are provider-owned; consumers cite.`);
  }
  // BF5 — the characterizer writes contracts only while its lane is in the birth
  // phase (gated on `contractBirth`); otherwise it is a read-only mutator.
  if (lane.role === 'characterizer' && !lane.contractBirth) {
    deny(`The characterizer may write a contract only during contract birth ` +
      `(lane.contractBirth, DESIGN §18/BF5): "${rel}" is outside a birth window. It otherwise reads ` +
      `production code and writes only parked characterization tests.`);
  }
  if (!(lane.contracts || []).includes(name)) {
    deny(`Contract-writers never touch foreign contracts (DESIGN §5.10 Ruling 2). ` +
      `"${name}" is not in this work order's contracts [${(lane.contracts || []).join(', ')}]. ` +
      `Escalate a ripple manifest to the orchestrator instead.`);
  }
  // A characterizer in its birth window may CREATE a brand-new contract file with
  // no prior ledger entry (the §18 atomic order is contract → ledger event → test,
  // so the file legitimately precedes its ledger line). Implementer enrichment of
  // an own contract is likewise allowed here.
  process.exit(0);
}

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
    deny(`Test edits track contracts 1:1 (DESIGN §5.6 ratchet): no enrichment/amendment for ` +
      `[${(lane.contracts || []).join(', ')}] is recorded in the ledger yet. A test change without a ` +
      `contract delta is a ratchet violation. The orchestrator must log the contract delta first.`);
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
