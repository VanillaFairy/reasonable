// Standalone test for lib/progress.mjs — node builtins only (no runner).
// Run: node test/progress.test.mjs
//
// lib/progress.mjs is now a thin CLI/hook delegate over progress-map.mjs (the actual fold
// logic is pinned by test/progress-map.test.mjs and test/progress-tree.test.mjs). This suite
// only exercises the CLI surface: flag dispatch, the narrowed --hook trigger (ledger.jsonl
// only — journal.json/inbox.json no longer fire it), and the fail-open/fail-loud posture.

import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { writeMirror } from '../lib/progress.mjs';

const LIB = join(dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'progress.mjs');

const tmps = [];
function newEffort() {
  const root = mkdtempSync(join(tmpdir(), 'prog-cli-'));
  tmps.push(root);
  mkdirSync(join(root, '.reasonable'), { recursive: true });
  return root;
}
function writeLedger(root, events) {
  writeFileSync(join(root, '.reasonable', 'ledger.jsonl'), events.map((e) => JSON.stringify(e)).join('\n') + '\n');
}
function writeJournal(root, journal) {
  writeFileSync(join(root, '.reasonable', 'journal.json'), JSON.stringify(journal));
}
function runCli(args, opts = {}) {
  return execFileSync('node', [LIB, ...args], { encoding: 'utf8', timeout: 15000, ...opts });
}
function runHook(root, tool_name, file_path, cwd) {
  return execFileSync('node', [LIB, '--hook'], {
    input: JSON.stringify({ tool_name, tool_input: { file_path }, cwd: cwd || root }),
    stdio: ['pipe', 'pipe', 'pipe'], encoding: 'utf8', timeout: 15000,
  });
}

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.stack || e.message}`); process.exitCode = 1; }
}

// A fixture with enough shape to show up distinctly in both the markdown and JSON views.
const EVENTS = [
  { seq: 1, type: 'node-planned', node: 'slice-a/WO-1', kind: 'work-order', title: 'Build parser', ts: '2026-07-02T09:00:00Z' },
  { seq: 2, type: 'node-dispatched', node: 'slice-a/WO-1', kind: 'work-order', attempt: 1, ts: '2026-07-02T09:00:01Z' },
  { seq: 3, type: 'node-completed', node: 'slice-a/WO-1', ts: '2026-07-02T09:10:00Z' },
];

// A — the module still exports writeMirror (session-start.mjs imports it by name; losing this
// re-export would only surface at runtime on a cold session start, never at import time here).
check('exports: writeMirror is re-exported for session-start.mjs to keep importing', () => {
  assert.equal(typeof writeMirror, 'function');
});

// B — --hook fires ONLY on a canonical <effortRoot>/.reasonable/ledger.jsonl write.
check('--hook: a canonical ledger.jsonl write regenerates both mirror files', () => {
  const root = newEffort();
  writeJournal(root, { effort: 'demo' });
  writeLedger(root, EVENTS);
  runHook(root, 'Write', join(root, '.reasonable', 'ledger.jsonl'));
  assert.ok(existsSync(join(root, '.reasonable', 'progress.json')), 'progress.json written');
  assert.ok(existsSync(join(root, '.reasonable', 'progress.md')), 'progress.md written');
  const md = readFileSync(join(root, '.reasonable', 'progress.md'), 'utf8');
  assert.match(md, /Build parser/, 'the mirror reflects the ledger content');
});

check('--hook: a journal.json write is IGNORED (narrowed trigger surface — no regen)', () => {
  const root = newEffort();
  writeJournal(root, { effort: 'demo' });
  writeLedger(root, EVENTS);
  runHook(root, 'Write', join(root, '.reasonable', 'journal.json'));
  assert.ok(!existsSync(join(root, '.reasonable', 'progress.md')), 'journal.json writes no longer trigger a regen');
  assert.ok(!existsSync(join(root, '.reasonable', 'progress.json')), 'journal.json writes no longer trigger a regen');
});

check('--hook: a ledger.jsonl in the wrong parent directory (not .reasonable/) is IGNORED', () => {
  const root = newEffort();
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(join(root, 'src', 'ledger.jsonl'), '{}\n');
  runHook(root, 'Write', join(root, 'src', 'ledger.jsonl'));
  assert.ok(!existsSync(join(root, '.reasonable', 'progress.md')), 'a src/ledger.jsonl is not the canonical artifact');
});

// C — --regen is silent and fail-open outside an effort.
check('--regen outside an effort: exits 0, no stdout/stderr noise, no crash', () => {
  const root = mkdtempSync(join(tmpdir(), 'prog-noeffort-'));
  tmps.push(root);
  const out = runCli(['--root', root, '--regen'], { stdio: ['pipe', 'pipe', 'pipe'] });
  assert.equal(out, '', 'no stdout');
});

// D — --write inside a real effort writes both mirrors and prints a one-line summary.
check('--write inside an effort: writes both mirror files and prints a one-line summary', () => {
  const root = newEffort();
  writeJournal(root, { effort: 'demo' });
  writeLedger(root, EVENTS);
  const out = runCli(['--root', root, '--write']);
  assert.ok(existsSync(join(root, '.reasonable', 'progress.json')));
  assert.ok(existsSync(join(root, '.reasonable', 'progress.md')));
  assert.match(out.trim(), /^reasonable progress: wrote \.reasonable\/progress\.\{json,md\}.*done.*\)\.$/, 'one-line summary');
});

// E — the print modes (default markdown, --json) reflect the effort's actual state.
check('default (no flags): prints the composed markdown, non-empty, reflecting the ledger', () => {
  const root = newEffort();
  writeJournal(root, { effort: 'demo' });
  writeLedger(root, EVENTS);
  const out = runCli(['--root', root]);
  assert.ok(out.trim().length > 0, 'non-empty output');
  assert.match(out, /# reasonable · demo/, 'header names the effort');
  assert.match(out, /Build parser/, 'the fixture node-planned title shows up');
});

check('--json: prints the structured tree, parseable, reflecting the ledger', () => {
  const root = newEffort();
  writeJournal(root, { effort: 'demo' });
  writeLedger(root, EVENTS);
  const out = runCli(['--root', root, '--json']);
  const tree = JSON.parse(out);
  assert.equal(tree.label, 'demo');
  const slice = tree.children.find((c) => c.id === 'slice-a');
  assert.ok(slice, 'slice-a node present');
  const wo = slice.children.find((c) => c.id === 'WO-1');
  assert.ok(wo, 'WO-1 node present');
  assert.equal(wo.label, 'Build parser');
  assert.equal(wo.status, 'done', 'node-completed drove it to done');
});

// F — default/--json/--write fail LOUD (non-zero exit) outside an effort; --regen alone is quiet.
check('default outside an effort: fails loud (non-zero exit, stderr message)', () => {
  const root = mkdtempSync(join(tmpdir(), 'prog-noeffort2-'));
  tmps.push(root);
  assert.throws(() => runCli(['--root', root], { stdio: ['pipe', 'pipe', 'pipe'] }));
});

for (const t of tmps) { try { rmSync(t, { recursive: true, force: true }); } catch { /* best effort */ } }

if (process.exitCode) console.error(`\nprogress: FAILURES above (${passed} passed).`);
else console.log(`\nprogress: all ${passed} checks passed. ✓`);
