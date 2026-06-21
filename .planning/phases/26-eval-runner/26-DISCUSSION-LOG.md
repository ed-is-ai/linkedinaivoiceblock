# Phase 26: Eval Runner - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-14
**Phase:** 26-eval-runner
**Areas discussed:** Classifier reuse, Score→verdict threshold, Input & label shape, Scope (unflagged-post capture)

---

## Classifier reuse

| Option | Description | Selected |
|--------|-------------|----------|
| Extract to shared module | Move SYSTEM_PROMPT + request/parse into a shared module both the SW and eval CLI import; single source of truth | ✓ |
| Duplicate prompt in eval script | Copy prompt + call into the script; no SW change but two copies drift | |
| Import prompt only, re-call in script | Export the prompt constant; script re-implements request/parse | |

**User's choice:** Extract to shared module.
**Notes:** Eval is only meaningful if it tests the real classifier; extraction prevents prompt drift. Discretion: shared module takes API key as a param (SW from chrome.storage, CLI from ANTHROPIC_API_KEY env); preserve prompt caching.

---

## Score→verdict threshold

| Option | Description | Selected |
|--------|-------------|----------|
| Fixed default 60 + --threshold override | score>=60=ai by default, flag to override; reproducible | |
| Threshold sweep + curve | Evaluate at every threshold, report precision/recall/F1 per cut-off + best-F1 | ✓ |
| Read stored block threshold | Use the saved blockThreshold from settings | |

**User's choice:** Threshold sweep + curve.
**Notes:** Sweep 35–90 step 5. Each post scored once → thresholds applied post-hoc → sweep costs no extra API calls; cost is threshold-independent.

---

## Input & label shape

| Option | Description | Selected |
|--------|-------------|----------|
| Flat posts array w/ label | A flat array of {text,label,...} | |
| Nested JSON export + per-post label | The buildJsonExport shape with label per nested post | ✓ (via "Export JSON") |
| Accept both shapes | Detect either | |

**User's choice (free text):** "Accept what we export from 'Export JSON'." → the exact `buildJsonExport` shape; `label` added per nested post; re-score text fresh via the LLM (stored score ignored).
**Notes:** Then raised that the export should also include accounts/posts that were NOT flagged, so the eval has `human` negatives — see Scope below.

---

## Scope — capturing unflagged posts for negatives

| Option | Description | Selected |
|--------|-------------|----------|
| New phase before 26 | Insert a phase for content-script capture + storage + Export JSON additions; Phase 26 stays an atomic eval runner | ✓ |
| Expand Phase 26 to include capture | One big phase spanning capture + measurement | |
| Eval on hand-curated data for now | Ship eval consuming hand-labeled JSON; capture deferred | |

**User's choice:** New phase before 26.
**Notes:** Capturing seen-but-not-hidden posts is a distinct capability (content script + storage + export). Kept out of Phase 26; to be inserted via /gsd-phase. Phase 26 consumes whatever labeled Export JSON it's given, so it can be built independently.

## Claude's Discretion

- Batch run controls: sequential calls + prompt caching; running cost output; errored/unparseable posts excluded from metrics and reported as a separate "errored" count.
- Cost via `computeCostUsd`/`MODEL_PRICING` reuse; model `claude-sonnet-4-6`.
- Results JSON schema (per-threshold rows, best-F1, counts, cost) + compact summary line; `eval/` dir auto-created.
- Divide-by-zero / non-finite guards in metrics.

## Deferred Ideas

- NEW PHASE (insert before 26): "Capture & export unflagged posts" — content-script sampling of seen-but-not-hidden posts + storage + Export JSON additions, to supply `human` negatives for a complete eval.
