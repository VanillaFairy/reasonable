---
name: contract-amendment
description: Use when a contract clause must be weakened or removed in a reasonable effort, when logging an enrichment/amendment/verdict to the ledger, or when running the amendment ceremony at a retro — defines the ratchet (strengthen free, weaken ceremonial), the append-only ledger entry format, and the test/contract 1:1 derivation rule.
---

# Contract Amendment & the Ledger

## Overview

The **ratchet** governs how contracts change: *strengthen freely, weaken ceremonially.* Make the rare
thing (weakening) ceremonial and the common thing (strengthening) impossible to get wrong. This skill
defines the ratchet, the ledger format, and the amendment ceremony.

**Announce at start:** "Using contract-amendment to <enrich / amend / log a verdict>."

**Normative terms:** `docs/glossary.md`. **Ledger grammar:** `docs/artifacts.md` (§ ledger.jsonl).

## The ratchet

| Direction | What | Authority | Cost |
|---|---|---|---|
| **Strengthen** (add a clause) | enrichment | the implementer, in its own contract | free — additive, the paradigm working |
| **Weaken / remove** (drop or loosen a clause) | amendment | agent *proposes* at retro; **human approves** | ceremonial, ledger-logged, rare |

- **Enrichments** flow constantly and need no ceremony — but are still **logged** (the implementer
  reports the diff; the orchestrator appends an `enrichment` event for retro review).
- **Amendments** are the only way a contract gets weaker. An amendment that isn't human-approved and
  ledger-logged is a ratchet violation. The engine flags any `amendment` with `direction:"weaken"`
  lacking `approvedBy`.

## Tests track contracts 1:1

- Any **test diff must reference a contract diff** in the same change — enforceable by a dumb
  structural hook plus ledger lookup, no semantics needed. The fence blocks a test edit when no
  enrichment/amendment for the touched contract is recorded in the ledger.
- **Retros govern contracts and never touch tests.** Tests are derived artifacts; if contracts change
  correctly, the blind-test-writer re-derives the tests.
- **Derivation direction is the deep rule:** you cannot audit an artifact against the thing it was
  derived from — derivation makes agreement tautological. Every artifact derives from the layer
  *above* and is checked against the layer *below*.

## Ledger entry format (append-only, one JSON object per line)

Never rewrite; only append. `seq` is monotonic; `ts` is ISO-8601. (`lib/effort.mjs appendJsonl` does
both for you when invoked from the orchestrator.)

```jsonl
{"seq":1,"ts":"…","type":"enrichment","component":"parser","clauses":["§3"],"workOrder":"WO-12","verticalSlice":"expr-eval","note":"learned precedence needs a clause"}
{"seq":2,"ts":"…","type":"amendment","component":"parser","clause":"§2","direction":"weaken","retro":"R3","approvedBy":"human","reason":"clause over-specified the error type"}
{"seq":3,"ts":"…","type":"verdict","kind":"infeasible","workOrder":"WO-9","hash":"sha256:…","survivedSkeptic":true,"bindingConstraint":"vision:offline-only","knowledge":"knowledge/k7.md"}
{"seq":4,"ts":"…","type":"scope-expansion","workOrder":"WO-12","addedLocus":["src/ast/span.rs"],"approvedBy":"orchestrator"}
{"seq":5,"ts":"…","type":"budget-extension","workOrder":"WO-12","extension":1,"approvedBy":"orchestrator"}
{"seq":6,"ts":"…","type":"dead-end","workOrder":"WO-9","hash":"sha256:…","knowledge":"knowledge/k7.md","reprice":["WO-10"]}
```

Event types: `enrichment` · `amendment` · `verdict` · `scope-expansion` · `budget-extension` ·
`dead-end`. The `hash` on infeasibility verdicts/dead-ends is the work-order hash the redispatch guard
keys on — record it so an identical work order stays blocked until an input changes.

## The amendment ceremony (at the retro)

1. The retro-synthesizer reviews contract diffs against vertical-slice spec and vision (intent-level — catches
   a sycophantic contract bent to match what got built).
2. Proposed weakenings are **batched** and presented to the human with a reason each.
3. The human approves or rejects each individually. **Silence never approves** — an unapproved
   amendment does not happen.
4. Each approved amendment is appended to the ledger with `approvedBy:"human"` and its reason.
5. The blind-test-writer re-derives affected tests from the new contract text (a normal pipeline run);
   the test diff now references the logged amendment, satisfying the 1:1 hook.

## Escalation ladder (which level the amendment lives at)

A weakening's *binding constraint* determines how far you backtrack — each level already has its
mechanism:

| Binding constraint lives in… | Resolution |
|---|---|
| the work order (mis-specified) | orchestrator reissues — no ceremony |
| one contract clause | ratchet weakening: ledger amendment at retro |
| two contracts jointly / a seam | topology issue → route planner, possibly a breadth pass |
| the vertical-slice gate | vertical-slice respec; gate amended via ledger |
| the vision | vision amendment — human-gated, always |

## Common mistakes

- **Weakening without a ledger entry.** Invisible rot. Every weakening is logged and human-approved.
- **Editing a test to resolve a red instead of fixing code.** That is the ratchet violation the
  adjudicator exists to prevent. Reds are usually impl-bugs.
- **Rewriting ledger history.** Append-only. To correct, append a new event referencing the old.
- **Auditing the contract against the tests.** Tests derive from contracts; the agreement is
  tautological. Audit contracts against the vertical-slice spec and vision instead.
