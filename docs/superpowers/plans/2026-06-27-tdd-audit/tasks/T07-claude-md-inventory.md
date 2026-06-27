# Task T07: CLAUDE.md inventory + deprecation pointer

## References
- Read: `../shared/architecture.md` (the "diagnostic" category framing)
- The file edited: `CLAUDE.md` (the project instructions at the repo root)

## Dependencies
- Depends on: T05 (the skill must exist for the inventory to describe it accurately)
- Depended on by: — (none)

## Scope
**Files:**
- Modify: `CLAUDE.md`

**BOUNDARY — you MUST NOT modify any files outside this list.**

## Positive Constraints (DO)
- Add the `tdd-audit` diagnostic to the skills inventory as a new category, accurately.
- Note that it supersedes the external `tdd-audit` command (the user retires that copy separately).

## Negative Constraints (DO NOT)
- Do NOT restructure CLAUDE.md or rewrite other bullets — one surgical addition.
- Do NOT claim it enters an effort — it is explicitly standalone, like `/init`.

## Implementation Steps

### Step 1: Read CLAUDE.md and locate the `skills/` bullet

Open `CLAUDE.md` and find the `skills/` bullet under "## Architecture: nouns, verbs, laws". It ends
with this exact sentence (use it as the anchor):

```
`user-invocable: false` (not a slash command, never an entry point).
```

### Step 2: Append the diagnostic-category sentence

Immediately after that sentence (same bullet, before the next `- **` bullet), append:

```
 A new category — **diagnostic skills** (`tdd-audit`) — is user-invocable and standalone: it audits
  a target repo's existing test suite (coverage / quality / honesty, with per-test reverse-discriminator
  teeth confirmation) and, like `/init`, does **not** enter an effort or write `.reasonable/` state. It
  supersedes the external `tdd-audit` command (now retired in favor of this in-plugin copy).
```

(Match the surrounding indentation of the bullet's continuation lines.)

### Step 3: Verify

Re-read the edited bullet; confirm the addition reads cleanly and no other text changed.

### Step 4: Commit

```bash
git add CLAUDE.md
git commit -m "$(cat <<'EOF'
docs(reasonable): inventory tdd-audit as the diagnostic skill category

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

## Acceptance Criteria
- [ ] `CLAUDE.md` describes `tdd-audit` as a user-invocable, standalone diagnostic that does not
      enter an effort.
- [ ] The supersede-the-external-command note is present.
- [ ] No other part of CLAUDE.md was restructured.
