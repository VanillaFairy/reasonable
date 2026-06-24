# reasonable — foundational principles

**Status:** foundational. Grilled, stress-tested across 12 perspectives, and adversarially reviewed by
three independent lenses — **survived with the corrections below.** Consistent by *survival*, not by
assertion. One thing remains, by construction, unprovable on paper: whether the foundation actually
*works*. By its own first principle (feedback over prediction) that is settled only by **use** — see the
closing note.

This is the whole of the philosophy. Everything else — contracts, vertical slices, the adversarial pipeline, the
Workflows substrate — is *machinery* serving it.

## The posture: default-deny

The framework is **skeptical by design.** Burden of proof is always on the claim, never on the doubter —
nothing is trusted until it has positively earned trust against an adversary. Every other rule is this one
posture applied to a different object:

- no claim of *done / green / correct* → must survive external verification
- no *scope* beyond the ask → must trace to the intention
- no *capability* not granted → the fence denies by default
- no *prediction* as truth → must be earned by feedback *(the one temporal member: "defer commitment," not a gate)*
- no *consent* from silence → silence is frozen, never approved
- **no *intention* trusted because it was written** → it must survive an adversarial coherence-grill (below)

The skepticism is aimed at **the machine's own work and inferences** — including its inference of what a
human's silence means — **never at the human's stated will.** The framework distrusts itself maximally and
serves its principal completely. Skeptical of the machine, deferential to the human: the same coin.

## The invariant

> **Deliver the ask — no less, no more.**
> *No less* = correct and complete against what was asked. *No more* = introduce no new problem
> (no scope creep, no regression, no new risk).

Contract parity lifted from the component to the whole effort: within the ask = delivered real; beyond it =
absent. **The hard part is not delivering the ask but *fixing* it** — the ask is *constructed*, not
received. The intention (below) is our imperfect attempt to pin it down, and is the soft underbelly.

## The three means

An LLM cannot be trusted to hit the invariant unaided. Three means make it reliable — each is the posture
in action:

1. **External verification.** No actor grades its own work; a claim is denied until it survives an
   adversary. **Two strengths, not one:** for *harm/correctness* there is an external referent that pushes
   back (the pre-task commit, the mutant) — full teeth; for *intent/scope* the only referent is the
   intention itself, so the check verifies **coherence, not correctness** (it catches contradiction and
   drift, never "coherent but wrong"). Don't conflate them.
2. **Capability over discipline.** Enforce by mechanism — hooks, fences, allowlists — not by prose an agent
   can rationalize away. The fence denies by default.
3. **Feedback over prediction.** Prediction is worst at the moment of least knowledge; let shape emerge from
   development history and integrate early, rather than freezing it up front.

## The human contract

Assume a **competent human who owns the ask.** The system is their **disciplined helper — never their
adversary, never a drain on their attention.** The human is not policed; their reliability is their own
responsibility. Their attention is spent in exactly two places: stating the intention up front, and
resolving genuine (breaking) forks.

## The success test (the *why*) — with teeth

Beat the dilemma every enforced workflow falls into: *trust the pipeline* and get a thousand green tests
around a garbage solution, or *review every step* and exhaust the human. The win is the diagonal —
**trustworthy delivery while the human's attention goes only to the ask and breaking forks, never to
policing the agent's work.** Machine adversarialism *replaces* human review of work; it never adds to it.

Falsifiable, so it can be checked: **a human correcting a *non-breaking* agent choice after the fact is a
recorded failure of the intent-check.** That is the observable defeater — without it, "never policing" is
unfalsifiable, the exact shape this framework forbids in a test.

## How it operates (the validated mechanics)

**The ask → an intention, which must earn trust.** An upfront grill-me-style session produces an
**intention**: a decision-*policy* (priorities, tradeoffs, non-goals, taste), **not a spec**. It captures
what lets the model resolve later, unforeseen forks the way the human would. The intention is **not trusted
because it was written** — it earns trust by surviving an **adversarial coherence-grill**: a second agent
hunts for a fork the intention resolves two defensible ways, or an internal contradiction. Surviving that
*is* both the consistency check and the stop condition (grill until the adversary can no longer find an
ambiguous fork — not "until the next question seems low-value"). The intention is then the **oracle** for
fork resolution: an ambiguity neither code nor intention can settle is a **fork → ping, halt, or
defer-as-spike — never a silent guess** (including the case where the human can't decide either). Each
breaking ping's answer **enriches the intention**, so the system gets quieter *within a stable scope*.

**"No more" = scope + harm.** *Scope* is the mirror of the ask: an unrequested change is a fork — resolved
against the intention or escalated, never self-approved. *Harm* is caught by external verification. A change
is allowed iff it (a) traces to the ask/intention, (b) stays inside the locus **declared in its work order
and fence-enforced** (not self-declared), (c) keeps all *trusted* green green, and (d) is reversible in-repo
(pre-merge) or escalated. This permits legitimate incidental work — work that passes (a)–(d) is in-scope by
the intention — and blocks only the unjustified, uncontained, harmful, or irreversible.

**Trust is earned, persistent, event-invalidated.** Green is evidence only in proportion to its **teeth** (a
test that rejects no world-state proves nothing). Adversarially-checked green — discriminator + clause-
mapping + mutation — is **trusted, and stays trusted**, with no re-checking churn. Trust is invalidated by a
specific event: the tested behavior is **extended, or its governing clause is amended**; then that test is
re-verified. Legacy / un-governed green is **untrusted by default.** (Requires the assertion↔clause mapping
to be mechanical, not eyeballed.)

**Adversarial inside, helper outside.** The verification machinery is adversarial and costly by nature, but
its cost never reaches the human. The **intention is the oracle** that lets a *machine* intent-check replace
human review of every change. Attention cost → **bounded** (the upfront intention + breaking forks only — no
per-change review, but not zero); latency stays off the human's critical path (parallel fan-out, bounded
re-verification, proportional rigor); pings present **decisions, not challenges.**

**One foundation, both ends.** The posture, invariant, and means are *stances* — scale-free, always on. Only
the **machinery** scales: a typo gets a fence + one discriminating check (a low floor, not zero); a
greenfield system gets grilling, a skeleton, vertical slices, and the full pipeline. **No ceremony floor and no
second philosophy** — a typo is still default-deny, just realized cheaply. Machinery is **default-deny-
provisioned** (unsure how much a task needs → provision more; under-rigor is the disease) and **escalatable
mid-flight** (a "small" task that reveals a seam or a breaking fork scales up via the trap).

## Not principles: the failure catalog

A 12-perspective stress-test (regulated, security, brownfield, ML, embedded, frontend, SRE, distributed,
enterprise, legal, meta-AI, velocity) found many ways the invariant gets violated, clustering into families:
*the gate isn't a trustworthy oracle · safety without liveness · adversarial integrity · the open world
beyond the repo · time beyond one effort · the methodology's own cost.* These are **not** foundational
principles — they are the **ways the invariant breaks** and a **per-domain tuning guide** for where to point
the means. They stay out of the core by design: battling all of them would make the system rigid and narrow.
Point the means at the families that matter for a given target; ignore the rest.

## Honest boundaries

- **Assumed, not enforced:** a competent human principal. The system serves them; it does not police them.
- **The irreducible residual — a coherent-but-wrong intention.** An intention that is internally consistent
  yet doesn't serve the human's true goal has *no internal tell and no external referent but the human.* The
  coherence-grill cannot catch it; no analysis can. It is caught **only by practice** — a downstream breaking
  discovery that exposes the mismatch and routes back to enrich the intention. That feedback loop *is* the
  long-run intent-correctness mechanism; there is no static substitute.
- **Mitigated, never removed:** vague intention language passes vagueness through; verification is sampling.
  The posture raises the floor hard; it does not claim zero.
- **Out of scope (named, not solved):** the open-world families — the running system (deploy/config/prod),
  the law (licenses/regulation), the unseen external consumer, life beyond one effort. Deferred *scope*,
  sequenced later, not pretended-away.

## Closing note: the foundation is proven in use

This document is the product of *prediction* — grilling, stress-testing, adversarial review. By the
framework's own first principle, prediction is weakest exactly where knowledge is least, and no amount of it
settles whether the foundation works in practice. That proof comes only from **using the methodology** — the
dogfood efforts that exercise the loop (intention → vertical slices → adversarial verification → breaking
discovery → enrich). A philosophy is validated the one way it can be: by use, which is where it now lives.
