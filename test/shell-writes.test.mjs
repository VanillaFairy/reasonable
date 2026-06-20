// Standalone test for lib/shell-writes.mjs — node builtins only (no runner).
// Run: node test/shell-writes.test.mjs
//
// The extractor is a BACKSTOP, not a sandbox. These cases pin the two properties
// that matter for the fence: (1) it surfaces the common write forms an agent
// reaches for after a Write/Edit denial, and (2) it NEVER surfaces a READ path as
// a write target (a false write target would wrongly deny a legitimate read).

import assert from 'node:assert';
import { extractWriteTargets } from '../lib/shell-writes.mjs';

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.message}`); process.exitCode = 1; }
}
const eq = (cmd, expected) =>
  assert.deepEqual(extractWriteTargets(cmd).sort(), [...expected].sort(),
    `extractWriteTargets(${JSON.stringify(cmd)})`);

// --- redirections: the dominant rationalized-bypass form ---
check('append redirection', () => eq('echo hi >> .reasonable/ledger.jsonl', ['.reasonable/ledger.jsonl']));
check('overwrite redirection', () => eq('echo hi > file.txt', ['file.txt']));
check('cat heredoc-style overwrite', () => eq('cat > a.md', ['a.md']));
check('no-space redirection', () => eq('echo x>file', ['file']));
check('multiple commands', () => eq('echo a > one; echo b >> two', ['one', 'two']));
check('chained with &&', () => eq('npm run build && echo done > out', ['out']));
check('fd-prefixed redirection', () => eq('cmd 2> errors.log', ['errors.log']));

// --- /dev/null and fd duplication are not files ---
check('devnull skipped', () => eq('cmd 2>/dev/null', []));
check('fd-dup skipped', () => eq('cmd > /dev/null 2>&1', []));
check('redirect-to-fd skipped', () => eq('cmd >&2', []));

// --- quoting: a > inside quotes is data, not an operator ---
check('quoted gt is not a redirection', () => eq('echo "a > b"', []));
check('single-quoted gt is not a redirection', () => eq("echo 'x > y'", []));

// --- tee writes all its file args ---
check('tee after pipe', () => eq('foo | tee out.log', ['out.log']));
check('tee -a append', () => eq('echo x | tee -a .reasonable/ledger.jsonl', ['.reasonable/ledger.jsonl']));

// --- cp/mv emit ONLY the destination, never the (read) source ---
check('cp emits dest only', () => eq('cp src.txt .reasonable/contracts/x.md', ['.reasonable/contracts/x.md']));
check('mv emits dest only', () => eq('mv a b', ['b']));

// --- dd emits of=, never if= ---
check('dd of only', () => eq('dd if=/dev/zero of=disk.img', ['disk.img']));

// --- sed -i is an in-place write of its file args (not the script) ---
check('sed -i in-place', () => eq("sed -i 's/a/b/' notes.md", ['notes.md']));
check('sed without -i writes nothing', () => eq("sed 's/a/b/' notes.md", []));

// --- innocuous commands surface nothing ---
check('git commit', () => eq('git commit -m "msg with > inside"', []));
check('cargo test', () => eq('cargo test', []));
check('plain read with input redirect', () => eq('cat < input.txt', []));

if (process.exitCode) console.error(`\nshell-writes: FAILURES above (${passed} passed).`);
else console.log(`\nshell-writes: all ${passed} checks passed. ✓`);
