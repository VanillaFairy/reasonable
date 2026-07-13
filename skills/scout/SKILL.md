---
name: scout
description: Use when the user invokes /reasonable:scout or asks to explore a shape / decomposition / API / feasibility BEFORE starting an effort — the zero-commit pre-effort front-end (DESIGN-3.0 §17). Runs a timeboxed shape-discovery scout in a disposable law-free workspace OUTSIDE any repo, writing NO .reasonable/ state; delivers a knowledge artifact + an optional structure-only genesis seed that warms a later effort's genesis. Scout code is discarded; re-entry is rewrite-from-knowledge. NOT an effort entry point.
---

# reasonable: scout — the zero-commit pre-effort exploration surface

**Announce at start:** "Using scout to explore <question> — a zero-commit, pre-effort spike in a
disposable workspace. No effort is started; no `.reasonable/` state is written."

A **capability, not an effort**. Shape-discovery — *what is the right decomposition / API / target?* —
is the one regime the committed spine serves badly (today the only exploration surface, the spike, is a
route item *inside* a committed effort, so you must pay analysis-entry before you can explore). The scout
is the spike-runner's quarantine machinery launched **standalone**, before any `.reasonable/` state
exists. It does **not** enter `analysis → scaffolding → …`, writes no `.reasonable/` state, and never
edits a real repo's tree. Like `/init` and `tdd-audit`, it is **not** an effort entry point.

**Law-free by construction, not by exemption (DESIGN-3.0 §17).** A scout runs where no `.reasonable/`
exists, so the hooks fail open (`CLAUDE.md` invariant #2) — there is no hook path-fence here, and that is
the design. The scout's "quarantine" is a **workspace convention**: a disposable directory outside any
repo, plus the scout-runner's discipline to confine writes to it.

**Rigid checklist — one TodoWrite item per numbered step.**

(`${reasonable}` = this plugin's root — the installed absolute path.)

## 1. Frame the question
- **question** — one falsifiable shape-discovery question with a clear convergence criterion (*"what is
  the right module decomposition for X?"*, *"is target/library Y viable for our shape?"*). Not "prove the
  direction I already chose" — that is the walking skeleton, which ships.
- **timebox** — turns / wall budget. A timeboxed "no" is a **success**.
- **context** (optional) — what is already ruled out; any existing repo to read for brownfield context
  (reads are always fine; only the write workspace is disposable).

## 2. Create the disposable workspace — OUTSIDE any repo
Create a fresh temp directory that is **not** inside any target repo and has **no** `.reasonable/` in its
ancestry (design Call 4 — a plain temp dir is unconditionally law-free; an in-repo subdir would couple
law-free-ness to directory placement). Use Bash:

```bash
workspaceRoot="$(mktemp -d "${TMPDIR:-/tmp}/reasonable-scout-XXXXXX")"
```

Never place the workspace under a `.reasonable/`- or `.reasonable-efforts/`-bearing tree.

## 3. Launch the workflow BY NAME
Launch `Workflow({ name: 'scout', args: { workspaceRoot, scout: { id, question, timebox, context }, budget } })`.
Launch **by name**, not by `scriptPath` (the name path passes `args` reliably). Pass **no** `effortRoot`
— there is no effort. The call returns a run id; the run executes in the background and notifies you on
completion. Do not re-implement the scout-runner — the workflow owns it (it reuses `reasonable:spike-runner`).

## 4. Harvest — and shape-validate the seed (the trusted control plane, not the producer)
On the `{ kind: 'result', verdict, report, seed }` return:
- Present the **scout report** (`verdict.reportPath`) — the knowledge artifact: question / method /
  evidence / verdict / confidence / **expiry**.
- If `verdict.verdict === 'converged'` and a `seed` path is present, run the **structure-only fence**
  yourself (you are the trusted control plane; the producer does not grade its own seed):

  ```bash
  node "${reasonable}/lib/scout-seed.mjs" --validate "<seed path>"
  ```

  - **exit 0** → present the seed as a valid, structure-only **genesis seed**.
  - **non-zero** → **WITHHOLD the seed** and report the structure-only violation loudly (a seed that
    smuggles a behavioral must past §13 must never reach a genesis). Present the report only.
- On `budget-exhausted` → offer to extend the timebox / re-scope. On `blocked` → report why (no question,
  no workspace, or the scout-runner died); nothing to harvest.

## 5. Hand off — the seed is a PRE-EFFORT input
The seed is **not** `.reasonable/` state and does **not** auto-start an effort. Hand it to the human:
- the **goals sketch** warms the vision grill when they later run `reasonable:develop`;
- the **draft charter set** warms the topologist's genesis proposal (the topologist consumes it as an
  *advisory proposal to critique*, under the structure-only law — see `agents/topologist.md`).
It becomes ratified `goals.json` / `policy.json` only through the normal human-gated genesis gate (§3).

## 6. Discard the workspace
The scout's code is disposable. Re-entry into a real build is **rewrite-from-knowledge, never
refactor-from-scout** (DESIGN-3.0 §17 / D2). Remove the temp workspace once the report + seed are
harvested.

## Forbidden moves
| Thought | Reality |
|---|---|
| "I'll add a scout branch to `lib/fence.mjs` so the workspace is fenced" | **No.** The scout is law-free BY CONSTRUCTION (no `.reasonable/` in ancestry ⇒ the fence fails open, `CLAUDE.md` invariant #2). A fence special-case violates invariant #2 and contradicts §17. The quarantine is a workspace convention, not a hook. |
| "I'll write the seed into a `.reasonable/` so genesis can read it" | No. The scout writes no `.reasonable/` state. The seed is a pre-effort input the human carries into `develop`. |
| "The scout converged, I'll refactor its code into the new effort" | No. Re-entry is rewrite-from-knowledge; scout code is discarded. |
| "I'll just start analysis from here since we found the shape" | No. The scout PRECEDES the effort and hands off; it is not an entry point. Start the effort with `reasonable:develop`, feeding it the seed. |
| "The seed's charter says what the component does — good, that's the spec" | No. A charter is STRUCTURE ONLY (§13). A behavioral must in a seed charter is invalid; `lib/scout-seed.mjs` rejects the structural form, and you withhold any seed that fails validation. |

## Note
Like `/init` and `tdd-audit`, the scout does **not** enter a reasonable effort. It is the sanctioned
home for the exploratory front-end that *precedes* one.
