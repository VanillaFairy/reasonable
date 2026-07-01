# The `--root` CLI convention every `lib/*.mjs` script follows

Every standalone CLI in `lib/` (`progress.mjs`, `progress-live.mjs` before it's retired, and now
`action-report.mjs`) resolves its effort root the same way, via two shared helpers already
exported from `lib/effort.mjs`:

```js
import { rootFromArgv, argvWithoutRoot, findEffortRoot } from './effort.mjs';

const root = rootFromArgv(process.argv, null) || findEffortRoot(process.cwd());
```

- `rootFromArgv(argv, start)` — looks for a literal `--root <path>` pair anywhere in `argv` and
  resolves it; falls back to walking up from `start` (or `process.cwd()`) looking for
  `.reasonable/`.
- `argvWithoutRoot(argv)` — returns `argv` with the `--root <path>` pair stripped out, so a
  script's own positional/flag parsing never has to special-case it.

**Always call `argvWithoutRoot` before parsing the script's own flags** — every existing CLI does
`argvWithoutRoot(process.argv).slice(2)` (the `.slice(2)` drops `node` and the script path) before
looking at its own arguments. Do not invent a new argument-parsing scheme per script; every CLI in
this repo uses exactly this pair.
