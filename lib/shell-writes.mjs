// shell-writes.mjs — best-effort extraction of file WRITE targets from a shell
// command, for the fence's Bash backstop (DESIGN §5.9).
//
// This is a BACKSTOP, not a sandbox. It catches the common, un-obfuscated write
// forms an agent reaches for after a Write/Edit denial — redirections (`> f`,
// `>> f`, `2> f`), `tee`, `cp`/`mv` destinations, `sed -i`, and `dd of=`. It does
// NOT expand variables, resolve command substitution, decode base64, or parse
// heredoc bodies — a determined bypass beats any static scan, so the role
// allowlist + downstream footprint/audit remain the PRIMARY guards (the fence is
// the backstop, capability is primary). The job here is to stop rationalization
// ("I can't Edit the ledger, I'll just `echo >>` it"), not a hostile operator.
//
// Discipline — NEVER emit a READ path as a write target: `cp SRC DEST` emits only
// DEST; `dd if=SRC of=DEST` emits only DEST; `cat < SRC` emits nothing. A false
// write target would wrongly deny a legitimate read.

const WRITE_OP = /^[0-9]*&?>>?$/;        // > >> 2> &> 1>> ...  (write redirections)
const ANY_REDIR_OP = /^[0-9]*&?[<>]>?$/; // the above plus < << (used to skip operands)
const DEVNULL = /^\/dev\/(null|stdout|stderr|tty|fd\/\d+)$/;
const WRITE_HEADS = new Set(['tee', 'cp', 'mv', 'install', 'sed', 'dd']);

function stripQuotes(t) {
  if (t.length >= 2) {
    const a = t[0], b = t[t.length - 1];
    if ((a === '"' && b === '"') || (a === "'" && b === "'")) return t.slice(1, -1);
  }
  return t;
}

function baseName(p) {
  const s = String(p).replace(/\\/g, '/');
  const i = s.lastIndexOf('/');
  return i === -1 ? s : s.slice(i + 1);
}

// Split a command line into simple-command segments on shell separators. `&&` and
// `||` are matched before the single-char class so they split as one unit.
function segments(command) {
  return command.split(/(?:&&|\|\||[;|&\n])/).map((s) => s.trim()).filter(Boolean);
}

// Tokenize a segment honoring simple single/double quotes (no var/cmd-subst), and
// split redirection operators off into their own tokens so `x>f` → ['x','>','f'].
function tokenize(seg) {
  const toks = [];
  let cur = '', q = null, started = false;
  const flush = () => { if (started) { toks.push(cur); cur = ''; started = false; } };
  for (let i = 0; i < seg.length; i++) {
    const c = seg[i];
    if (q) { if (c === q) q = null; else cur += c; started = true; continue; }
    if (c === '"' || c === "'") { q = c; started = true; continue; }
    if (c === ' ' || c === '\t') { flush(); continue; }
    if (c === '>' || c === '<') {
      // A redirection operator may carry an fd prefix already accumulated in cur
      // (digits or `&`); otherwise the pending token is a separate arg — flush it.
      let op = '';
      if (started && /^[0-9]*&?$/.test(cur)) { op = cur; cur = ''; started = false; }
      else flush();
      op += c;
      if (seg[i + 1] === '>') { op += '>'; i += 1; }
      toks.push(op);
      continue;
    }
    cur += c; started = true;
  }
  flush();
  return toks;
}

/**
 * Best-effort list of file paths a shell command would WRITE. Conservative on the
 * read/write distinction (never returns a read path); generous within that on the
 * forms it recognizes. Returns a de-duplicated array (possibly empty).
 */
export function extractWriteTargets(command) {
  if (!command || typeof command !== 'string') return [];
  const targets = [];
  const add = (t) => {
    if (t == null) return;
    const u = stripQuotes(String(t));
    if (!u) return;
    if (u.startsWith('&')) return;     // fd duplication target (>&2, 2>&1)
    if (/^&?\d+$/.test(u)) return;     // a bare fd number, not a file
    if (DEVNULL.test(u)) return;
    targets.push(u);
  };

  for (const seg of segments(command)) {
    const toks = tokenize(seg);
    if (!toks.length) continue;

    // 1. Redirections, anywhere in the segment: a write operator's operand.
    for (let i = 0; i < toks.length; i++) {
      if (!WRITE_OP.test(toks[i])) continue;
      const next = toks[i + 1];
      if (next && !ANY_REDIR_OP.test(next)) add(next);
    }

    // 2. Command-specific destinations. `bare` = positional args, with redirection
    // operators (and their operands), flags, and key=value options removed.
    const head = baseName(toks[0]);
    if (!WRITE_HEADS.has(head)) continue;
    const rest = toks.slice(1);
    const bare = [];
    for (let i = 0; i < rest.length; i++) {
      const t = rest[i];
      if (ANY_REDIR_OP.test(t)) { i += 1; continue; } // skip operator AND its operand
      if (t.startsWith('-') || t.includes('=')) continue;
      bare.push(t);
    }

    if (head === 'tee') {
      for (const f of bare) add(f);                       // tee writes every file arg
    } else if (head === 'cp' || head === 'mv' || head === 'install') {
      if (bare.length >= 2) add(bare[bare.length - 1]);   // destination only (sources are reads)
    } else if (head === 'sed') {
      const inPlace = rest.some((t) => t === '-i' || t.startsWith('-i') || t.startsWith('--in-place'));
      if (inPlace) {
        const scriptByFlag = rest.some((t) => t === '-e' || t === '-f' || t.startsWith('--expression') || t.startsWith('--file'));
        const files = scriptByFlag ? bare : bare.slice(1); // first bare is the inline script
        for (const f of files) add(f);
      }
    } else if (head === 'dd') {
      for (const t of rest) { const m = /^of=(.+)$/.exec(t); if (m) add(m[1]); } // never if=
    }
  }
  return [...new Set(targets)];
}
