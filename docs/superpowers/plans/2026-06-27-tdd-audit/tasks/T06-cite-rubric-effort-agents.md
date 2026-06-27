# Task T06: Cite the canonical rubric in the effort's verification agents

## References
- Read: `../shared/architecture.md` (the reuse-the-core argument)
- Read: `../shared/interfaces.md` (§4 — the canonical rubric path)
- The rubric being cited: `skills/tdd-audit/references/test-honesty-rubric.md` (from T02)
- The files edited: `agents/auditor.md`, `agents/intent-verifier.md`

## Dependencies
- Depends on: T02 (the rubric must exist to cite)
- Depended on by: — (none)

## Note on intent (read this before editing)
This is **additive cross-referencing**, not a deletion. Neither agent currently contains a literal
copy of the honesty rubric, so there is nothing to "replace." The point is to make the canonical
rubric the plugin's **shared honesty vocabulary** — so the effort's verification adversaries and the
tdd-audit diagnostic reason about sycophancy from one source. Keep the edits minimal and surgical.

## Scope
**Files:**
- Modify: `agents/auditor.md`
- Modify: `agents/intent-verifier.md`

**BOUNDARY — you MUST NOT modify any files outside this list.** Do NOT change either agent's
`tools:` allowlist or its verdict logic — only add the citation sentences below.

## Implementation Steps

### Step 1: Cite the rubric in `agents/auditor.md`

Find this exact text (the "Read first" line):

```
**Read first:** the `adversarial-audit` skill (it drives this), `docs/glossary.md`,
`docs/artifacts.md`. (`${reasonable}` below = this plugin's root directory — `$CLAUDE_PLUGIN_ROOT`
in hooks; the orchestrator gives you the absolute path at dispatch.)
```

Replace it with:

```
**Read first:** the `adversarial-audit` skill (it drives this), `docs/glossary.md`,
`docs/artifacts.md`, and the canonical **test-honesty rubric**
(`${reasonable}/skills/tdd-audit/references/test-honesty-rubric.md`) — it names the sycophancy
signals your mechanical checks (vacuous tests, test-value-keyed branching, code-as-only-oracle)
exist to catch. (`${reasonable}` below = this plugin's root directory — `$CLAUDE_PLUGIN_ROOT`
in hooks; the orchestrator gives you the absolute path at dispatch.)
```

### Step 2: Cite the rubric in `agents/intent-verifier.md`

Find this exact text (the "Other placements" paragraph):

```
If your dispatch binds you to a different reference, name *that* one and confirm it sits above the
artifact the same way. (Other placements exist elsewhere in the framework — e.g. a
contract-enrichment adversary binds to the vision + slice spec, a born-contract adversary to topology
+ vision — but each obeys the same rule: reference above artifact, never the mutator's own output.)
```

Replace it with:

```
If your dispatch binds you to a different reference, name *that* one and confirm it sits above the
artifact the same way. (Other placements exist elsewhere in the framework — e.g. a
contract-enrichment adversary binds to the vision + slice spec, a born-contract adversary to topology
+ vision — but each obeys the same rule: reference above artifact, never the mutator's own output.)
When your axis is whether a proposed artifact merely *restates what the code does* rather than what
the reference demands, the canonical **test-honesty rubric**
(`${reasonable}/skills/tdd-audit/references/test-honesty-rubric.md`) names that sycophancy signal —
it is the plugin's shared vocabulary for the "anchored to intent, not implementation" judgment.
```

### Step 3: Sanity-check nothing else changed

Confirm the `tools:` lines are unchanged in both files (`auditor`: `Read, Grep, Glob, Bash`;
`intent-verifier`: `Read, Grep, Glob, Bash`) and that only the two paragraphs above were edited.

### Step 4: Commit

```bash
git add agents/auditor.md agents/intent-verifier.md
git commit -m "$(cat <<'EOF'
docs(reasonable): cite canonical test-honesty rubric in auditor + intent-verifier

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

## Acceptance Criteria
- [ ] Both agents cite `skills/tdd-audit/references/test-honesty-rubric.md`.
- [ ] Neither agent's `tools:` allowlist or verdict logic changed.
- [ ] The edits are additive (no rubric text was inlined or duplicated).
