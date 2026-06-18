// effort.mjs — shared helpers for the reasonable hook engine.
//
// No third-party dependencies: node builtins only, so the plugin runs anywhere
// node does (Windows Git-Bash, macOS, Linux). Every consumer fails OPEN when no
// effort context is present — installing the plugin must never break an
// ordinary session. The law binds only inside an active effort, inside a lane.

import { existsSync, readFileSync, writeFileSync, appendFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve, relative, sep, basename, join } from 'node:path';
import { execFileSync } from 'node:child_process';

/**
 * Run git with an argument ARRAY (no shell) — shell metacharacters in refs/paths
 * are never interpreted, so untrusted refs can't inject commands. Throws on
 * non-zero exit. Returns stdout as a string.
 */
export function git(args, cwd) {
  return execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
}

/** Like git() but returns {ok, out} instead of throwing. */
export function gitTry(args, cwd) {
  try { return { ok: true, out: git(args, cwd) }; }
  catch (e) { return { ok: false, out: (e.stdout || '').toString() + (e.stderr || '').toString() }; }
}

/** Normalize any path to forward slashes for matching. */
export function norm(p) {
  return String(p == null ? '' : p).replace(/\\/g, '/');
}

/** Read all of stdin and JSON.parse it. Returns {} on any failure. */
export async function readStdinJson() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

export function readJson(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}

export function writeJson(path, obj) {
  writeFileSync(path, JSON.stringify(obj, null, 2) + '\n');
}

/** Read a .jsonl file into an array of objects (skips blank/unparseable lines). */
export function readJsonl(path) {
  try {
    return readFileSync(path, 'utf8')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);
  } catch { return []; }
}

export function appendJsonl(path, obj) {
  const existing = readJsonl(path);
  const next = existing.length ? (existing[existing.length - 1].seq || existing.length) + 1 : 1;
  const line = JSON.stringify({ seq: next, ts: new Date().toISOString(), ...obj });
  appendFileSync(path, line + '\n');
  return next;
}

/** Walk up from `start` (a dir or file) looking for a directory containing `marker`. */
export function findUp(start, marker) {
  let dir = start;
  try { if (statSync(dir).isFile()) dir = dirname(dir); } catch { dir = dirname(dir); }
  dir = resolve(dir);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const candidate = join(dir, marker);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** Locate the effort root (the dir containing `.reasonable/`) from a start path. */
export function findEffortRoot(start) {
  const marker = findUp(start, '.reasonable');
  return marker ? dirname(marker) : null;
}

/** Locate and load the lane descriptor by walking up from the edited path. */
export function findLane(start) {
  const file = findUp(start, '.reasonable-lane.json');
  if (!file) return null;
  const lane = readJson(file);
  if (!lane) return null;
  lane.__file = file;
  lane.__root = dirname(file); // the lane worktree root
  return lane;
}

/** Load config.json from an effort root (or lane root), with safe defaults. */
export function loadConfig(effortRoot) {
  const def = {
    stack: 'unknown',
    runMode: null,
    testCommand: null,
    testGlobs: ['**/tests/**', '**/*.test.*', '**/*.spec.*', '**/*_test.*'],
    loudStubMarkers: ['todo!', 'unimplemented!', 'NotImplementedError', 'TODO_REASONABLE'],
    parkMarkerRegex: '#\\[ignore\\s*=\\s*"pending:|\\.skip\\(|@pytest\\.mark\\.skip',
    enforcementPaths: [
      '.reasonable/ledger.jsonl', '.reasonable/journal.json',
      '.reasonable/supervision.json', '.reasonable/sanity-invariants.md',
      '.reasonable/resource-lexicon.json', '.reasonable/config.json',
      '.reasonable/inbox.json',
      '.reasonable/baseline.json', '.reasonable/intention.md',
      '.claude/settings.json', '.claude/settings.local.json',
    ],
    lintableInvariants: [],
  };
  if (!effortRoot) return def;
  const cfg = readJson(join(effortRoot, '.reasonable', 'config.json'));
  return cfg ? { ...def, ...cfg } : def;
}

/** Convert a glob (supports **, *, ?) to a RegExp anchored to the whole string. */
export function globToRegExp(glob) {
  const g = norm(glob);
  let re = '^';
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '*') {
      if (g[i + 1] === '*') {
        // ** matches across path separators (and an optional trailing slash)
        re += '.*';
        i++;
        if (g[i + 1] === '/') i++;
      } else {
        re += '[^/]*';
      }
    } else if (c === '?') {
      re += '[^/]';
    } else if ('.+^${}()|[]\\'.includes(c)) {
      re += '\\' + c;
    } else {
      re += c;
    }
  }
  re += '$';
  return new RegExp(re);
}

/** Does a (normalized, relative) path match any of the globs? */
export function matchesAny(relPath, globs) {
  const p = norm(relPath).replace(/^\.\//, '');
  return (globs || []).some((g) => globToRegExp(g).test(p));
}

/** Is `child` inside `parent` (both absolute)? */
export function isUnder(child, parent) {
  const rel = relative(resolve(parent), resolve(child));
  return rel === '' || (!rel.startsWith('..') && !require_isAbsolute(rel));
}
function require_isAbsolute(p) {
  return /^([a-zA-Z]:)?[/\\]/.test(p);
}

/** Path of the target a tool would write, or null for non-mutating tools. */
export function targetPath(tool_name, tool_input) {
  if (!tool_input) return null;
  switch (tool_name) {
    case 'Edit':
    case 'Write':
    case 'MultiEdit':
      return tool_input.file_path || null;
    case 'NotebookEdit':
      return tool_input.notebook_path || null;
    default:
      return null;
  }
}

/** Emit a PreToolUse deny decision and exit 0 (allow = no output). */
export function deny(reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  }));
  process.exit(0);
}

/** Emit SessionStart additionalContext (both shapes for cross-host compat). */
export function emitSessionContext(text) {
  process.stdout.write(JSON.stringify({
    additional_context: text,
    hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: text },
  }));
}

export { existsSync, readFileSync, readdirSync, statSync, dirname, resolve, relative, basename, join };
