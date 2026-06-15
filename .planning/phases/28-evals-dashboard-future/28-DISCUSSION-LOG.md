# Phase 28: Evals Dashboard (future) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-15
**Phase:** 28-evals-dashboard-future
**Areas discussed:** Page placement, Run persistence & CLI import, LLM run cost guardrail, Labeling write-back

---

## Page placement

| Option | Description | Selected |
|--------|-------------|----------|
| Tab within dashboard.html | View-switching nav in existing App; no new build entry | |
| Separate evals.html page | Dedicated extension page, own Vite entry + Preact root | ✓ |
| New scrolling section in dashboard | Append console below existing sections | |

**User's choice:** Separate evals.html page
**Notes:** Stronger isolation accepted over the leaner tab option. Eval console is large.

### Page access (follow-up)

| Option | Description | Selected |
|--------|-------------|----------|
| Link from dashboard | 'Evals' link in dashboard header opens evals.html | |
| Popup + dashboard links | Entry points in both popup and dashboard | ✓ |
| Direct URL only | Build entry reachable only by chrome-extension:// URL | |

**User's choice:** Popup + dashboard links

---

## Run persistence & CLI import

| Option | Description | Selected |
|--------|-------------|----------|
| Storage + download | Auto-persist to EvalRunStore AND per-run Download JSON | |
| Storage only | Persist to EvalRunStore (FIFO 50); no download | ✓ |
| Download only | Downloadable EvalRun JSON, nothing persisted | |

**User's choice:** Storage only

### CLI import (follow-up)

| Option | Description | Selected |
|--------|-------------|----------|
| Defer CLI import | Store only dashboard runs; CLI import is a later add | ✓ |
| Include CLI import | File picker to load CLI results-*.json into store now | |

**User's choice:** Defer CLI import

---

## LLM run cost guardrail

| Option | Description | Selected |
|--------|-------------|----------|
| Estimate + confirm modal | Pre-run cost estimate + confirm dialog; no cap | ✓ |
| Estimate + per-run cap | Estimate plus max-posts-per-run limit | |
| Sample subset | Default to random N-post sample | |
| Rely on rate limit | No new guardrail; show running cost | |

**User's choice:** Estimate + confirm modal
**Notes:** During discussion it was confirmed `SCORE_POST` is NOT rate-limited (only the
rederive path is), so estimate+confirm and cancel are the only spend guards.

### Run execution UX (follow-up)

| Option | Description | Selected |
|--------|-------------|----------|
| Progress + cancel | Live progress + cancel; cancelled/closed run discarded | |
| Progress, persist partial | Live progress + cancel; partial run saved as incomplete | ✓ |
| Progress only | Progress, no cancel; runs to completion | |

**User's choice:** Progress, persist partial
**Notes:** EvalRun type has no incomplete marker — planning must add an additive field or
derive from counts; partial metrics must be visibly flagged.

---

## Labeling write-back

| Option | Description | Selected |
|--------|-------------|----------|
| Fill blanks only | Bulk seed applies only to unlabeled posts; never overwrites manual labels | ✓ |
| Overwrite all | Bulk resets every post to the default seed | |
| Ask each run | Bulk prompts fill-vs-overwrite each click | |

**User's choice:** Fill blanks only
**Notes:** Confirmed the dashboard becomes the sanctioned label writer (shift from prior
"extension never writes label" design). Data-model wrinkle surfaced: `storedPosts`/`StoredPost`
has no `label` field (only `UnflaggedPost`/`FlaggedPost` do) — flagged-post labels need an
additive `label?` on `StoredPost`.

---

## Claude's Discretion

- Vite build wiring for evals.html; confirm-modal copy; progress presentation.
- Whether `incomplete` is stored or derived.
- Storage mechanism for flagged-post labels (recommendation: add `label?` to `StoredPost`).
- Heuristic-run UX (free/fast — likely no confirm modal).
- Empty/error/first-run page states.

## Deferred Ideas

- CLI `results-*.json` import into EvalRunStore.
- Option C — run-history sidebar + master/detail view.
- Per-run "Download JSON" export.
- Results charting UI.
- Aggregate signal report (which signals discriminate AI vs human).
