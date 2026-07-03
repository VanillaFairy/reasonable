// Standalone test for lib/conclude.mjs — node builtins only (no runner).
// Run: node test/conclude.test.mjs
//
// The keystone of the commit iron rule: an effort may not be concluded (fence
// released, bookkeeping archived) over uncommitted work product. Verifies the
// happy path, the zero-friction auto-commit path, the HALT path (commit blocked
// → refuse to archive), and the fail-open no-op.

import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const CONCLUDE = join(here, '..', 'lib', 'conclude.mjs');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
const write = (root, rel, content) => {
  const p = join(root, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
};
function runConclude(root) {
  try {
    const out = execFileSync('node', [CONCLUDE, root], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    return { code: 0, out: out.toString() };
  } catch (e) {
    return { code: e.status ?? 1, out: (e.stdout || '').toString() + (e.stderr || '').toString() };
  }
}

const tmps = [];
function newEffort({ blockCommits = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'concl-test-'));
  tmps.push(root);
  git(root, 'init', '-q');
  const hooks = join(root, '.nohooks'); mkdirSync(hooks, { recursive: true });
  git(root, 'config', 'core.hooksPath', hooks);
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'user.name', 'Concl Test');
  git(root, 'config', 'commit.gpgsign', 'false');
  write(root, 'README.md', 'base\n');
  write(root, '.gitignore', '.reasonable.done-*/\n.worktrees/\n'); // conclude's documented tip
  write(root, '.reasonable/config.json', JSON.stringify({ effort: 'demo', runMode: 'gated' }) + '\n');
  write(root, '.reasonable/work-orders/WO-1.json', JSON.stringify({ id: 'WO-1', locus: ['src/**'] }) + '\n');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'init');
  if (blockCommits) { // force a deterministic commit failure (bogus gpg signer)
    git(root, 'config', 'commit.gpgsign', 'true');
    git(root, 'config', 'gpg.program', 'false');
  }
  return root;
}

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.message}`); process.exitCode = 1; }
}

// 1 — clean tree → concludes (archives, releases the fence).
check('clean effort → archives, exit 0', () => {
  const root = newEffort();
  const r = runConclude(root);
  assert.equal(r.code, 0, r.out);
  assert.ok(!existsSync(join(root, '.reasonable')), '.reasonable/ should be archived away');
  assert.ok(existsSync(join(root, '.reasonable.done-demo')), 'archive dir should exist');

  // The "concluded" event went through the ledger controller (lib/ledger.mjs), not a raw
  // appendJsonl — so it must carry script-authoritative stamps, not placeholders.
  const archivedDir = join(root, '.reasonable.done-demo');
  const ledgerLines = readFileSync(join(archivedDir, 'ledger.jsonl'), 'utf8')
    .trim().split('\n').map((line) => JSON.parse(line));
  const concludedEvent = ledgerLines[ledgerLines.length - 1];
  assert.equal(concludedEvent.type, 'concluded');
  assert.ok(Number.isInteger(concludedEvent.seq) && concludedEvent.seq > 0,
    `seq must be a stamped positive integer, got ${JSON.stringify(concludedEvent.seq)}`);
  assert.ok(typeof concludedEvent.ts === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(concludedEvent.ts),
    `ts must be a stamped ISO timestamp, got ${JSON.stringify(concludedEvent.ts)}`);

  // The controller's default-on mirror regen folds "concluded" to root status "done"
  // immediately — verified via the archived progress.json (it moves with the rest of the
  // bookkeeping when conclude renames .reasonable/ aside).
  const progress = JSON.parse(readFileSync(join(archivedDir, 'progress.json'), 'utf8'));
  assert.equal(progress.status, 'done', 'progress.json root status must fold to done after conclude');
});

// 2 — dirty in-scope work → auto-commits it, THEN archives (zero friction).
check('dirty in-scope → auto-commit then conclude, work is committed', () => {
  const root = newEffort();
  write(root, 'src/feature.txt', 'work that would have been lost\n');
  const r = runConclude(root);
  assert.equal(r.code, 0, r.out);
  assert.ok(existsSync(join(root, '.reasonable.done-demo')), 'archived');
  // the work product reached git history
  const log = git(root, 'log', '--name-only', '--format=%H');
  assert.ok(log.includes('src/feature.txt'), 'residual work product must be committed before archiving');
  assert.equal(git(root, 'status', '--porcelain', '-uall').trim(), '', 'tree clean after conclude');
});

// 3 — commit blocked → REFUSE to conclude (HALT), nothing archived, work preserved.
check('commit blocked → HALT, does not archive, work survives', () => {
  const root = newEffort({ blockCommits: true });
  write(root, 'src/feature.txt', 'uncommittable here\n');
  const r = runConclude(root);
  assert.equal(r.code, 1, 'must HALT with non-zero exit');
  assert.match(r.out, /REFUSING to conclude/);
  assert.ok(existsSync(join(root, '.reasonable')), '.reasonable/ must remain (fence stays up)');
  assert.ok(!existsSync(join(root, '.reasonable.done-demo')), 'must NOT archive over uncommitted work');
  assert.ok(existsSync(join(root, 'src', 'feature.txt')), 'work product is preserved on disk');
});

// 4 — no effort → fail-open no-op.
check('no effort → no-op exit 0', () => {
  const root = mkdtempSync(join(tmpdir(), 'concl-noeff-')); tmps.push(root);
  git(root, 'init', '-q');
  const r = runConclude(root);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /nothing to conclude/);
});

for (const t of tmps) { try { rmSync(t, { recursive: true, force: true }); } catch { /* best effort */ } }

if (process.exitCode) console.error(`\nconclude: FAILURES above (${passed} passed).`);
else console.log(`\nconclude: all ${passed} checks passed. ✓`);
