// Standalone test for lib/abandon.mjs — node builtins only (no runner).
// Run: node test/abandon.test.mjs
//
// abandon is the symmetric twin of conclude for a WALKED-AWAY effort: instead of
// lingering as a live effort forever (and keeping the blast-radius fence up for
// all later work), the same cheap teardown — a `abandoned` ledger event + a dir
// rename aside to `.reasonable.abandoned-<effort>/` — drops it out of discovery.
// The commit iron rule still applies: an effort may not be abandoned (fence
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
const ABANDON = join(here, '..', 'lib', 'abandon.mjs');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
const write = (root, rel, content) => {
  const p = join(root, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
};
function runAbandon(root) {
  try {
    const out = execFileSync('node', [ABANDON, root], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    return { code: 0, out: out.toString() };
  } catch (e) {
    return { code: e.status ?? 1, out: (e.stdout || '').toString() + (e.stderr || '').toString() };
  }
}

const tmps = [];
function newEffort({ blockCommits = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'aband-test-'));
  tmps.push(root);
  git(root, 'init', '-q');
  const hooks = join(root, '.nohooks'); mkdirSync(hooks, { recursive: true });
  git(root, 'config', 'core.hooksPath', hooks);
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'user.name', 'Aband Test');
  git(root, 'config', 'commit.gpgsign', 'false');
  write(root, 'README.md', 'base\n');
  write(root, '.gitignore', '.reasonable.abandoned-*/\n.worktrees/\n'); // abandon's documented tip
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

// 1 — clean tree → abandons (archives, releases the fence).
check('clean effort → archives, exit 0', () => {
  const root = newEffort();
  const r = runAbandon(root);
  assert.equal(r.code, 0, r.out);
  assert.ok(!existsSync(join(root, '.reasonable')), '.reasonable/ should be archived away');
  assert.ok(existsSync(join(root, '.reasonable.abandoned-demo')), 'archive dir should exist');

  // The "abandoned" event went through the ledger controller (lib/ledger.mjs), not a raw
  // appendJsonl — so it must carry script-authoritative stamps, not placeholders.
  const archivedDir = join(root, '.reasonable.abandoned-demo');
  const ledgerLines = readFileSync(join(archivedDir, 'ledger.jsonl'), 'utf8')
    .trim().split('\n').map((line) => JSON.parse(line));
  const abandonedEvent = ledgerLines[ledgerLines.length - 1];
  assert.equal(abandonedEvent.type, 'abandoned');
  assert.ok(Number.isInteger(abandonedEvent.seq) && abandonedEvent.seq > 0,
    `seq must be a stamped positive integer, got ${JSON.stringify(abandonedEvent.seq)}`);
  assert.ok(typeof abandonedEvent.ts === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(abandonedEvent.ts),
    `ts must be a stamped ISO timestamp, got ${JSON.stringify(abandonedEvent.ts)}`);

  // The controller's default-on mirror regen folds "abandoned" to root status "done"
  // immediately — verified via the archived progress.json (it moves with the rest of the
  // bookkeeping when abandon renames .reasonable/ aside).
  const progress = JSON.parse(readFileSync(join(archivedDir, 'progress.json'), 'utf8'));
  assert.equal(progress.status, 'done', 'progress.json root status must fold to done after abandon');
});

// 2 — dirty in-scope work → auto-commits it, THEN archives (zero friction).
check('dirty in-scope → auto-commit then abandon, work is committed', () => {
  const root = newEffort();
  write(root, 'src/feature.txt', 'work that would have been lost\n');
  const r = runAbandon(root);
  assert.equal(r.code, 0, r.out);
  assert.ok(existsSync(join(root, '.reasonable.abandoned-demo')), 'archived');
  // the work product reached git history
  const log = git(root, 'log', '--name-only', '--format=%H');
  assert.ok(log.includes('src/feature.txt'), 'residual work product must be committed before archiving');
  assert.equal(git(root, 'status', '--porcelain', '-uall').trim(), '', 'tree clean after abandon');
});

// 3 — commit blocked → REFUSE to abandon (HALT), nothing archived, work preserved.
check('commit blocked → HALT, does not archive, work survives', () => {
  const root = newEffort({ blockCommits: true });
  write(root, 'src/feature.txt', 'uncommittable here\n');
  const r = runAbandon(root);
  assert.equal(r.code, 1, 'must HALT with non-zero exit');
  assert.match(r.out, /REFUSING to abandon/);
  assert.ok(existsSync(join(root, '.reasonable')), '.reasonable/ must remain (fence stays up)');
  assert.ok(!existsSync(join(root, '.reasonable.abandoned-demo')), 'must NOT archive over uncommitted work');
  assert.ok(existsSync(join(root, 'src', 'feature.txt')), 'work product is preserved on disk');
});

// 4 — archive already exists → refuse (exit 1), leave the live effort untouched.
check('archive already exists → refuse, exit 1', () => {
  const root = newEffort();
  // A prior abandon of "demo" that was never cleaned up.
  write(root, '.reasonable.abandoned-demo/ledger.jsonl', '');
  const r = runAbandon(root);
  assert.equal(r.code, 1, 'must refuse with non-zero exit');
  assert.match(r.out, /already exists/);
  assert.ok(existsSync(join(root, '.reasonable')), '.reasonable/ must remain (live effort untouched)');
});

// 5 — no effort → fail-open no-op.
check('no effort → no-op exit 0', () => {
  const root = mkdtempSync(join(tmpdir(), 'aband-noeff-')); tmps.push(root);
  git(root, 'init', '-q');
  const r = runAbandon(root);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /nothing to abandon/);
});

for (const t of tmps) { try { rmSync(t, { recursive: true, force: true }); } catch { /* best effort */ } }

if (process.exitCode) console.error(`\nabandon: FAILURES above (${passed} passed).`);
else console.log(`\nabandon: all ${passed} checks passed. ✓`);
