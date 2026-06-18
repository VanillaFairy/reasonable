---
name: shared-context-session
description: Use when a reasonable effort legitimately needs live shared context rather than fresh blind subagents — vision grilling, retro approval, or debugging-with-history. Defines which roles may share context, and how to conduct the session without leaking artifacts that downstream blind roles (blind-test-writer, adjudicator, skeptic) must never have seen.
---

# Shared-Context Sessions

## Overview

The default in a `reasonable` effort is **fresh blind subagents**: clean context means a *new*
subagent, never the same conversation wearing a different hat. Blindness is enforced by capability
(tool allowlists, fences) precisely so an agent can't lean on what it never saw.

But a few roles genuinely need to reason *across* artifacts in live dialogue. This skill says which,
and how to keep that shared context from poisoning the blind roles downstream.

**Announce at start:** "Using shared-context-session for <grilling/retro/debugging>."

## When live shared context is legitimate

| Session | Why it needs shared context |
|---|---|
| **Vision grilling** (analysis) | The human and the agent build shared understanding by walking the decision tree together — one question at a time. Reasoning *is* the artifact. |
| **Retro approval** | The human ratifies amendments, classifies divergences, tunes the dial — a judgment-across-artifacts act with the human in the loop. |
| **Debugging-with-history** | Diagnosing a post-merge defect needs the reproduction, the contract, and the git history held together. |

These are the **judgment-across-artifacts** roles. Everything else — implementing, test-writing,
adjudicating, auditing, skepticism — is a fresh blind subagent.

## The leak rule

A shared-context session accumulates knowledge that **blind roles must not have seen**. The blind
roles and what they must NOT learn from your session:

- **blind-test-writer** must never learn anything about the *implementation*. It formalizes contract
  text only. If your debugging session discussed how the code works, that must not reach it.
- **adjudicator** must judge a test against a contract with no thumb on the scale — it must not inherit
  your hunch about which side is wrong.
- **skeptic** must attack an infeasibility claim from a fresh context — it must not inherit the
  claimant's transcript (thrash lives in the transcript).

**The rule:** what crosses out of a shared-context session crosses as an **artifact**, never as
conversation. Distill the session into the appropriate durable artifact (a vision update, a ledger
entry, a bug-report artifact, a contract delta) and dispatch blind roles **fresh** against that
artifact — never by continuing the conversation.

## How to conduct one

1. **Name the session type** and confirm it is one of the three legitimate kinds. If you're tempted to
   "just keep talking to the same agent" for an implementing/judging task, stop — that's the disease.
2. **Hold the artifacts together** for the duration (read what you need; the human is present for
   grilling/retro).
3. **Produce the artifact**, not a decision-in-context. The next role reads the artifact.
4. **Dispatch downstream roles fresh.** Never hand a blind role your session transcript. "Separate
   agent" means fresh context, not the same conversation relabeled.

## Common mistakes

- **Continuing the conversation to "save context."** That is exactly the bias the architecture
  prevents. Distill to an artifact; dispatch fresh.
- **Letting a debugging session's implementation knowledge reach the blind-test-writer.** Hand it the
  bug-report artifact (reproduction evidence) and the contract — never the code or the discussion.
- **Carrying a failed implementer's transcript into the skeptic or the retry.** Fresh context only;
  the progress verdict is the sanctioned hand-off.
