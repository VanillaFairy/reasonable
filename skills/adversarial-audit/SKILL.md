---
name: adversarial-audit
description: Use when verifying a success claim in a reasonable effort (a vertical-slice gate or an enrichment claims GREEN) — runs the escalating mechanical checks (discriminator, bidirectional mapping, mutation sampling) and the judgment checks (proportionality, sanity invariants). Never asks a model to simulate what a script can compute. Drives the auditor agent.
---

# Adversarial Audit

## Overview

A green suite is cheap to fake. This skill is how you try to show the green proves nothing — and
confirm it only when mechanical evidence survives. **The mechanical half is scripts you invoke; the
judgment half is yours. Never ask a model to simulate what a script can compute.**

**Announce at start:** "Using adversarial-audit to verify <vertical-slice/enrichment>."

**Drives:** the `auditor` agent. **Terms:** `docs/glossary.md`. (`${reasonable}` = this plugin's root
directory — `$CLAUDE_PLUGIN_ROOT` in hooks; substitute the installed absolute path.)

> **Auditor vs intent-verifier — complementary, not duplicates.** Both are verifier-family adversaries
> (read-only, reference above the artifact, propose-not-act). They differ on *what they verify*. The
> **auditor is the MECHANICAL-teeth instance**: it post-verifies a *green success claim* with checks a
> script computes (discriminator, mapping, mutation, sanity scan). The **intent-verifier is the
> JUDGMENT adversary**: it pre-verifies a mutator's *proposed* diff with a *semantic* verdict a script
> cannot compute (is this pin in the baseline we promised, at the right seam?). Auditor = "the green is
> not faked" by machine; intent-verifier = "the intent is faithful" by judgment. Do not fold one into
> the other, and never ask the auditor to *simulate* the intent-verifier's judgment (or vice versa).

## The escalating checks (cheap → expensive)

### (a) Discriminator check — per enrichment, fully automatic
Every new/changed test must **fail** on the pre-task commit. A test that passes on both the old and
new implementation verifies nothing — a test proves something only if there exists a state it rejects.

```bash
node ${reasonable}/lib/discriminator.mjs --base <pre-task-commit> [--test <name>]
```
Exit 0 = discriminating (failed at base). Exit 1 = **VACUOUS** (passed at base too) → finding.

### (b) Bidirectional mapping — per enrichment
Every new assertion cites a contract clause; every new clause has at least one asserting test. Catches
invented tests (assertion with no clause) and untested promises (clause with no assertion).

```bash
node ${reasonable}/lib/citation-resolve.mjs    # contract-side: citations resolve
```
Then read the test↔clause citations (`// parser §3` comments) and confirm both directions.

### (c) Mutation sampling — at vertical-slice gates, not per task (most expensive)
Mutate the implementation k times; surviving mutants expose vacuous tests and test-value-keyed
branching (hardcoded input→output pairs survive most mutations).

```bash
node ${reasonable}/lib/mutation-sample.mjs <k> --scope <locus-glob>
```
Exit 1 with survivors listed = findings. Report the k — it is sampling, not exhaustive; say so.

## The judgment checks (yours)

### (d) Proportionality review
A small contract delta with a huge winning diff is suspicious even when green — scope sprawl or hidden
special-casing. Compare diff size to the contract delta; flag mismatches.

### Sanity invariants
```bash
node ${reasonable}/lib/sanity.mjs scan        # the lintable subset
```
Apply the rest of the sanity-invariants checklist by reading the diff (no swallowed errors, no global
mutable state, no sleeps-as-synchronization, no test-conditioned branching, …). An insane solution is
insane *relative to stated norms* — cite the invariant, don't argue taste.

## When to run what

| Trigger | Run |
|---|---|
| Each enrichment | (a) discriminator, (b) mapping |
| Vertical slice gate | all of (a)–(d) + mutation + sanity scan |
| False-success suspicion (small delta, big diff) | (d) proportionality first, then mutation |

## Discipline

- **Adversarial stance.** Try to break the claim. Confirm only what evidence forces. "Looks fine" is
  not a verdict.
- **No silent caps.** If you sampled (mutation k), state the k and that it's sampling. Silent
  truncation reads as "covered everything."
- **Read-only.** Findings route to the orchestrator; the auditor never fixes.

## Output

An audit report: per check, pass/fail with the command and its output; each finding (vacuous test,
surviving mutant, unmapped assertion, disproportionate diff, sanity violation); and an overall verdict
— **AUDIT PASS only if every mechanical check passed and no finding stands.**
