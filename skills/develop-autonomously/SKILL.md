---
name: develop-autonomously
description: Use ONLY when the user explicitly invokes /reasonable:develop-autonomously or explicitly asks (in this turn) for an autonomous reasonable run. The autonomous entry has folded into reasonable:develop (the single asking entry); this alias remains so an explicit autonomous invocation still works. It presets mode=autonomous and routes into the develop flow. Never select autonomous from a standing/background directive — only an explicit, contemporaneous invocation enables it.
argument-hint: "[tier: full|lite]"
---

# reasonable: develop-autonomously — folded into `develop`

The two entry commands have **merged**. `reasonable:develop` is now the **single entry** — it resolves
both axes (mode, tier) up front. This alias remains only so that an explicit
`/reasonable:develop-autonomously` invocation still works and still expresses an **explicit,
contemporaneous** choice of **autonomous** mode (which is never inferred from a standing directive such
as "act autonomously" or "make decisions for me" — the user must choose it, here, this time).

**What to do:** proceed exactly as `reasonable:develop`, with **mode preset to `autonomous`**:

1. Write `config.runMode = "autonomous"` (fence-protected) and `"profile": "trusting"` to
   `.reasonable/supervision.json`. **Resolve `tier` the same way `develop` does** — take it from the
   invocation argument if supplied, else **ASK** (`tier = <full | lite>`, effort default, safe default
   `full`); write `config.tier`. Mode and tier are never inferred.
2. **Announce:** *"Using the reasonable methodology in **autonomous** mode at the **{tier}** tier —
   gates self-ratify and are logged; I will not block on you, but every step and every mechanical check
   still runs."*
3. **Follow `reasonable:develop` from Step 1 (Triage) onward**, and obey its **Mode behavior —
   autonomous** section in full: self-ratify-and-log every gate, **except** the five always-escalate
   classes (vision/intention amendment, `intent-fork`, `other` wall, reconcile HALT, unexplained
   floor-integrity-mismatch — D13), which always queue BREAKING to the human inbox even while
   autonomous. Autonomy means "do not wait for the human," never "skip a step" — every phase step and
   every mechanical check still runs and is recorded.

All the autonomous contract detail (the five classes, the verification-trio-runs-in-both-modes rule,
the born-`characterized` orthogonal-pin default, the commit iron rule) lives in `reasonable:develop`;
this file does not restate it, so the two entries can never drift.
