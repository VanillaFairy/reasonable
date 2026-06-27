# TypeScript binding table

Concrete syntax for the `gate-mechanics` primitives in TypeScript (Vitest/Jest). Adding a stack =
adding one file like this; no agent or skill changes.

## Primitives

| Primitive | TypeScript (Vitest / Jest) |
|---|---|
| **PARK** | `it.skip('evaluates precedence', …)` / `test.skip(…)` / `describe.skip(…)` — with a `// pending: vertical slice 4, panel IPC` comment |
| **PROMOTE** | change `.skip` to `it`/`test` |
| **GATE** | a `test`/`it` (or a Playwright scenario) RED at open, GREEN at close |
| **LOUD-STUB** | `throw new Error('NotImplemented — vertical slice 4: settings persistence')` (or a shared `function TODO_REASONABLE(msg): never { throw new Error('reasonable TODO: ' + msg) }`) |

- Parked tests **must still import/typecheck** — `.skip` keeps them compiled. `tsc --noEmit` + the test
  runner's skipped count make the parked count queryable.
- A loud stub **throws** when reached, so a scenario gate cannot pass while one sits on its path. Prefer
  a named `TODO_REASONABLE(...)` helper returning `never` so the type checker also flags fallthrough.

## config.json template (TypeScript)

```json
{
  "stack": "typescript",
  "buildCommand": "tsc --noEmit",
  "testCommand": "vitest run",
  "testOneCommand": "vitest run -t {test}",
  "setupCommand": "npm ci",
  "testGlobs": ["**/*.test.ts", "**/*.test.tsx", "**/*.spec.ts", "**/__tests__/**", "tests/**", "e2e/**"],
  "loudStubMarkers": ["NotImplemented", "TODO_REASONABLE", "throw new Error('reasonable"],
  "parkMarkerRegex": "(it|test|describe)\\.skip\\(|// pending:",
  "enforcementPaths": [
    ".reasonable/ledger.jsonl", ".reasonable/journal.json", ".reasonable/supervision.json",
    ".reasonable/sanity-invariants.md", ".reasonable/resource-lexicon.json",
    ".reasonable/config.json", ".reasonable/inbox.json",
    ".claude/settings.json", ".claude/settings.local.json"
  ],
  "lintableInvariants": [
    {"id": "no-sleep-sync", "pattern": "setTimeout\\([^,]*,\\s*\\d+\\s*\\).*await|await new Promise\\(r => setTimeout", "message": "sleep/setTimeout as synchronization (use condition-based waiting)"},
    {"id": "no-any-cast", "pattern": "as any", "message": "`as any` defeats the type contract"},
    {"id": "no-test-value-branch", "pattern": "===\\s*'__TEST__'", "message": "test-conditioned branching"}
  ],
  "mutationK": 8
}
```

> Calibrate the lint subset to the project's real taboos. `as any` is sometimes pragmatic; if so, move
> it to the auditor checklist rather than a hard hook.

## Sleep-as-synchronization (a common TS sanity violation)

`await new Promise(r => setTimeout(r, 200))` to "wait for" async work is the canonical flaky-test
smell. The sanity invariant forbids it; the cure is **condition-based waiting** (poll a predicate with
a timeout). See the superpowers `systematic-debugging` skill's condition-based-waiting reference — it
coexists with `reasonable`.

## Fakes and the composition root

A fake exported from a module for test use is fine; a fake imported into the production composition
root (the app's real DI/wiring) is a parity violation even if every test passes. Keep fakes behind an
interface seam; never let one reach `main`/the app entry's object graph.

## Measurement harness (quality gates)

- Microbenchmarks: `tinybench` / `vitest bench`; assert thresholds **with headroom** to absorb noise.
- Browser/E2E timing (Playwright): measure with `performance` marks; pin a fixed viewport/load profile
  and record it in the gate.
- Global budgets (bundle size, cold start, memory) are **system-invariant tests** owned by breadth
  passes, not per-component clauses. `size-limit` works well for bundle ceilings.

## Shared build cache (worktree cost)

- TypeScript builds are cheaper than Rust, but `node_modules` per worktree is heavy. Use a shared
  store (pnpm's content-addressable store, or `npm`/`yarn` with a shared cache dir) so lanes don't each
  re-download.
- For incremental typecheck across lanes, enable `tsc --incremental` with a per-worktree `tsBuildInfo`
  (do **not** share the buildinfo file across worktrees — it's not concurrency-safe).
- CI must mirror the hooks (`lib/citation-resolve.mjs`, `lib/sanity.mjs scan`, `lib/discriminator.mjs`,
  `lib/burndown.mjs`) so enforcement isn't local-only.
