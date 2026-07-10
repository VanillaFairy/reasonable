# T02 — Topologist constitution audit — THE LOAD-BEARING ALLOWLIST AUDIT

**role:** audit
**Depends on:** T01
**Owns:** nothing (read-only — report findings; do not edit `agents/topologist.md`, code, tests, or docs)

> **Read first:** `../shared/interfaces.md` (§A), `../shared/conventions.md` (the constitution authoring
> discipline), the plan's **Flag 1** + **Flag 6** + **The two-deliverable structural call**, DESIGN-3.0
> §5.1, and the shipped `agents/route-planner.md` (the reference template). You are the `audit` role: a
> **read-only adversary** on the constitution T01 authored. You have Read/Grep/Glob for verification. You
> **fix nothing** — you report findings, each of which becomes a follow-up edit the supervisor schedules
> (the P6a/P6b/P6c/P6d pattern: an audit finding is a fresh follow-up commit, never a blocking redo).
>
> **This is THE load-bearing audit of the constitution half.** The tool allowlist IS the enforcement
> (CLAUDE.md: "the context manifest is enforced by the tool allowlist, not by prose … weakening one
> silently breaks an adversarial separation"). A too-broad allowlist here would let the topologist size
> its own rigor down — a genuine methodology hole, not a wording nit. Attack it directly.

> **Why an audit and not a test (the justified structural call — plan Flag 6).** This repo has **no
> agent-`.md` linter**: agent constitutions are markdown-with-normative-force read by the *harness*, and
> their allowlist is enforced by the harness (`agent_type` × `tools:`), never by any `lib/*.mjs` — confirm
> this yourself (below). So the constitution is verified exactly the way the repo already treats every
> other `agents/*.md`: a dedicated read-only adversarial pass. Do **not** invent a YAML-frontmatter test
> file; that would be out-of-pattern machinery the repo deliberately does not have.

**The audit checklist — run each, report the result:**

- [ ] **The allowlist is EXACTLY `Read, Grep, Glob` (the load-bearing line).** Read the frontmatter of
  `agents/topologist.md`. Confirm `tools: Read, Grep, Glob` — **no `Write`, no `Edit`, no `Bash`**, no
  other tool. Diff it against `agents/route-planner.md`'s `tools:` line — they must be **identical**.
  Report ANY extra tool: a single `Write`/`Edit`/`Bash` would make "cannot write `goals.json`/`policy.json`"
  false, breaking the adversarial separation. (This is the one finding that blocks — everything else is a
  wording hardening.)

- [ ] **PROPOSE-not-write is stated AND capability-true.** Confirm the body says the topologist
  **proposes** `goals.json`/`policy.json` and **cannot write them**, and that the *reason* given is
  capability (no file-writing tool), not a promise. Cross-check: with the allowlist above, is the claim
  actually true (no tool can write a file)? A prose "I won't write policy" backed by a `Write` tool is the
  exact failure the repo warns against — report it.

- [ ] **No prose claims a capability the allowlist denies.** Grep the body for self-actions the allowlist
  can't back: a *self* "I write / I run / I append / I execute / I persist / `node lib/ledger.mjs`". Every
  such act must be attributed to the **orchestrator** or a **narrow writer**, never to the topologist
  itself. Report any first-person capability the allowlist denies. (The topologist *proposes* and the
  orchestrator *persists* — that split must be consistent throughout.)

- [ ] **Charters = structure only (§13).** Confirm the constitution states charters carry
  `component`/`premises`/`purpose`/`locus`/`order` and **never a delta, never a behavioral must**, and
  that it forbids chartering behavior. Report any language that would let a charter pin what a component
  *does* (the prediction disease §13 exists to prevent).

- [ ] **The five §5.1 outputs are all present.** Confirm the body enumerates all five: (1) component
  topology (subtractive from vision), (2) full initial chartering (structure only), (3) containment tree +
  ownership map, (4) priority-policy **proposal** (vision-class, human-gated), (5) complexity
  classification (t0-observable, §5.4). Report any missing output or any output described as *written*
  rather than *proposed*.

- [ ] **Post-genesis remit + legibility boundary.** Confirm the body covers the post-genesis remit
  (rewrite payloads on demand + re-chartering batches at gates, both riding `retopologize`) and states
  that **legibility is `lib/legibility.mjs`'s to compute** — the topologist consumes findings, it does not
  re-measure. Report a constitution that has the topologist re-deriving the fold/metrics in its own turn
  (the thin-planner violation).

- [ ] **Cite-the-oracle forks (D5b).** Confirm priority/scope forks route the route-planner way: a fork
  the intention settles → resolve + cite; a fork it cannot → raise an `intent-fork`, never guess.

- [ ] **`description` matches the body and is dispatch-legible.** Confirm the frontmatter `description`
  states the read-only-plus-propose constraint (so it is legible at dispatch) and does not over-promise a
  capability the body/allowlist lack. `model: opus` present (judgment role).

- [ ] **No agent-`.md` linter exists (confirm the structural call).** Grep the repo to confirm nothing
  mechanically parses agent frontmatter/allowlists, so an audit (not a new test) is the correct
  verification:
  ```bash
  grep -rEn "agents/|readdirSync.*agents|parseFrontmatter" lib/ test/ || echo "no agent-md parser"
  ```
  Expected: the only `parseFrontmatter` is `lib/contract.mjs`'s (for **contract** files, not agents); no
  `lib/*.mjs` reads `agents/*.md`; no `test/*.test.mjs` parses agent frontmatter. Report if you find one
  (then a test *would* be the right verification and this call should be revisited).

- [ ] **Additivity — no other file changed.** Confirm T01 created **only** `agents/topologist.md` and
  edited no existing `agents/*.md`, no `lib/`, no docs, no roadmap. `git show --stat` the T01 commit.

**Report format:** a short list of findings, each `CONFIRMED` (reproduced) or `PLAUSIBLE`, with the
concrete line → problem. The allowlist finding (if any) is **blocking** — flag it as such. If the
allowlist is exactly `Read, Grep, Glob`, propose-not-write is capability-true throughout, and the five
outputs are all present as proposals, say so plainly — a clean constitution is the correct result. Any
confirmed wording gap becomes a fresh follow-up edit the supervisor dispatches (a `feat(topologist):`
hardening commit) before T05.
