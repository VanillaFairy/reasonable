# Rust binding table

Concrete syntax for the `gate-mechanics` primitives in Rust. Adding a stack = adding one file like
this; no agent or skill changes.

## Primitives

| Primitive | Rust |
|---|---|
| **PARK** | `#[ignore = "pending: vertical slice 4, panel IPC"]` on a `#[test]` (still compiles) |
| **PROMOTE** | remove the `#[ignore = …]` attribute |
| **GATE** | a `#[test]` (or integration test under `tests/`) that is RED at open, GREEN at close |
| **LOUD-STUB** | `todo!("vertical slice 4: settings persistence")` / `unimplemented!(...)` / `unreachable!("reasonable: …")` |

- Parked tests **must compile** — `#[ignore]` keeps them in the build. `cargo test` lists them as
  `ignored`, so the parked count is queryable directly (`cargo test -- --list` or the burndown script).
- `todo!()`/`unimplemented!()` panic when reached, so a scenario gate physically cannot pass while a
  loud stub sits on its path. The panic *is* the lint.

## config.json template (Rust)

Written at scaffolding into `.reasonable/config.json`:

```json
{
  "stack": "rust",
  "buildCommand": "cargo build",
  "testCommand": "cargo test",
  "testOneCommand": "cargo test {test}",
  "setupCommand": "cargo fetch",
  "testGlobs": ["tests/**", "**/*_test.rs", "src/**/tests.rs", "src/**/tests/**"],
  "loudStubMarkers": ["todo!", "unimplemented!", "unreachable!(\"reasonable:"],
  "parkMarkerRegex": "#\\[ignore\\s*=\\s*\"pending:",
  "enforcementPaths": [
    ".reasonable/ledger.jsonl", ".reasonable/journal.json", ".reasonable/supervision.json",
    ".reasonable/sanity-invariants.md", ".reasonable/resource-lexicon.json",
    ".reasonable/config.json", ".reasonable/inbox.json",
    ".claude/settings.json", ".claude/settings.local.json"
  ],
  "lintableInvariants": [
    {"id": "no-sleep-sync", "pattern": "(std::)?thread::sleep", "message": "sleep as synchronization"},
    {"id": "no-unwrap-in-src", "pattern": "\\.unwrap\\(\\)", "message": "unwrap() in production path (use ? or expect with reason)"},
    {"id": "no-test-value-branch", "pattern": "==\\s*\"__TEST__\"", "message": "test-conditioned branching"}
  ],
  "mutationK": 8
}
```

> Note: `no-unwrap-in-src` is illustrative — calibrate it to the project's sanity invariants; some
> projects allow `unwrap()` in clearly-infallible spots. The lint subset should be ones you genuinely
> never want; the rest belong in the auditor checklist.

## Inline `#[cfg(test)]` caveat (the fence and unit tests)

Inline unit tests (`#[cfg(test)] mod tests { … }`) live *inside* source files, so the path fence sees
them as **source**, not test files. That's acceptable for v1: keep the **promoted scenario gates and
contract tests** that the blind-test-writer owns in dedicated test files (`tests/` or `*_test.rs`) so
the per-role test-path fence applies. Inline unit tests an implementer writes about its own internals
are not the contract-governed tests and are not fenced.

**Fakes and visibility:** a fake exported `pub` so a downstream test crate can use it is fine. Do
**not** `#[cfg(test)]`-gate such a fake — that breaks the dependent crate's non-test build. The rule is
about *wiring* (never in `main`'s object graph), not visibility.

## Measurement harness (quality gates)

For quality clauses ("decides within 5ms") and system invariants (startup time, memory ceiling):
- Use `criterion` for microbenchmarks; assert thresholds **with headroom** (e.g. budget 5ms, fail at
  8ms) to absorb benchmark flakiness.
- Run on a fixed-load environment; record the environment in the gate so results are comparable.
- Global budgets (startup, memory) are **system-invariant tests** owned by breadth passes, not
  per-component clauses.

## Shared build cache (worktree cost)

Per-worktree cold `cargo build` is multi-GB and slow. Mitigate:
- Set a shared `CARGO_TARGET_DIR` **only where safe** — concurrent `cargo` invocations against one
  target dir can contend; prefer `sccache` (`RUSTC_WRAPPER=sccache`) which is concurrency-safe and
  shares compiled artifacts across worktrees.
- Document the chosen strategy in `config.json` (e.g. a `buildEnv` note) so lanes inherit it.
- CI must mirror the hooks (run `lib/citation-resolve.mjs`, `lib/sanity.mjs scan`,
  `lib/discriminator.mjs`, `lib/burndown.mjs`) so enforcement isn't local-only.
