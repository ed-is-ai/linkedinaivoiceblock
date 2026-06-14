# Phase 26: Eval Runner - Context

**Gathered:** 2026-06-14
**Status:** Ready for planning

<domain>
## Phase Boundary

A Node CLI eval harness (`npm run eval <labeled-posts.json>`, run via `tsx` like the Phase 25 trace-summary script) that:
1. Reads a labeled dataset (the "Export JSON" shape with a `label` added per post),
2. Re-scores each post's text through the **real** LLM classifier,
3. Computes and prints classification metrics (precision / recall / F1 / accuracy) across a threshold sweep, plus total + average LLM cost,
4. Persists results to `eval/results-YYYY-MM-DD.json` and prints a compact paste-able summary line.

Requirements: EVAL-01, EVAL-02, EVAL-03, EVAL-04 (+ the ROADMAP SC#5 error-exit behavior, tracked here as EVAL-05).

**In scope:** the eval CLI, the shared classifier extraction it depends on, metrics computation, results persistence.
**Out of scope (moved to a new pre-phase):** capturing/exporting *unflagged* posts to supply `human` negatives — see Deferred Ideas.
</domain>

<decisions>
## Implementation Decisions

### Classifier reuse (Area 1)
- **D-01:** Extract the classifier into a **shared module** (e.g. `src/shared/classifier.ts`) holding `SYSTEM_PROMPT` + the Anthropic request build + response/verdict parsing. BOTH the service worker (`background/index.ts` `scorePost`) and the eval CLI import it — single source of truth so the eval can never test a stale/divergent prompt. This refactors the SW; the existing 250-test suite + Phase 24 trace tests guard against regressions.
- **D-02:** The shared classifier takes the **API key as a parameter** (it must not depend on `chrome.storage`). The service worker passes the key it reads from `chrome.storage.local`; the eval CLI reads it from the `ANTHROPIC_API_KEY` environment variable.
- **D-03:** Preserve prompt caching (the `anthropic-beta` / cache_control system-prompt behavior) in the shared module so batch eval runs stay cheap.

### Score→verdict threshold (Area 2)
- **D-04:** The classifier emits a 0–100 score; the eval converts score→predicted class via a **threshold sweep**, not a single cut-off. Sweep **35–90 in steps of 5** (the extension's configurable threshold band).
- **D-05:** Report precision / recall / F1 / accuracy **at each threshold**, and highlight the **best-F1 threshold**. Still print total LLM cost (USD), average cost per post, and total posts evaluated (EVAL-03).
- **D-06:** Key property — each post is scored **once**; thresholds are applied **post-hoc** to the stored score, so the sweep costs **no extra API calls**. Cost (total + avg/post) is therefore threshold-independent and computed once.

### Input & label shape (Area 3)
- **D-07:** Input is the **exact "Export JSON" shape** produced by `buildJsonExport` — `{ exportedAt, flaggedAccounts: [ { ...account, posts: [ { urn, score, text, hiddenAt } ] } ] }`. The user annotates by adding `"label": "ai" | "human"` to each nested **post**.
- **D-08:** The runner walks `flaggedAccounts[].posts[]`, reads each post's `text` + added `label`, and **re-scores the text fresh through the LLM** (EVAL-02). The stored `score` in the export is **ignored** — the point is to test the *current* classifier, not replay capture-time scores.
- **D-09:** Posts **missing a `label`** are skipped and reported (count surfaced). If **no** post carries a label, the run **exits non-zero** with a clear message (EVAL-05). Positive class for metrics = **`ai`**.

### Claude's Discretion
- **Batch run controls:** sequential LLM calls (not concurrent) with prompt caching; print a running/last cost as it progresses; posts where the API errors or returns an unparseable verdict are **excluded from the metrics** and reported as a **separate "errored" count** (mirrors the trace-summary `failed` column). A pre-run cost estimate / confirmation prompt is optional — planner's discretion.
- **Cost computation:** reuse `src/shared/pricing.ts` `computeCostUsd` + `MODEL_PRICING` (same pattern as Phase 25); recompute from real token usage, never a hard-coded rate.
- **Model:** `claude-sonnet-4-6` (the detector model).
- **Results file:** `eval/results-YYYY-MM-DD.json` (directory auto-created if absent, like trace-summary's README handling); include the per-threshold sweep rows, best-F1 threshold, cost totals, counts (total / labeled / skipped / errored), and the chosen model. Print a compact one-line summary suitable for a README/PR (EVAL-04).
- **Metrics edge cases:** guard divide-by-zero (e.g. no positives at a given threshold → render `0` or `n/a`, never `NaN` — carry forward the Phase 25 WR-01 lesson).
- **Runtime:** TypeScript executed via `tsx`, `npm run eval` script in `package.json` (same toolchain decision as Phase 25 D-04).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` — EVAL-01..EVAL-04 (lines ~138–141); EVAL-05 (exit non-zero on missing file / no labels / no API key) is the ROADMAP SC#5 written as a requirement.
- `.planning/ROADMAP.md` §"Phase 26: Eval Runner" — goal + 5 success criteria.

### Classifier (the thing being evaluated)
- `src/background/index.ts` §`scorePost` (~L167–210) + `SYSTEM_PROMPT` — the current inline classifier to extract into a shared module (D-01).
- `src/shared/types.ts` §`DetectionResult` (L37+, `score: number`) and §block-threshold note (L139, default 60, band 35–90) — score shape + threshold band for the sweep (D-04).

### Reusable infrastructure
- `src/shared/pricing.ts` — `computeCostUsd` + `MODEL_PRICING` for cost (reuse, do not duplicate rates).
- `src/dashboard/dataManagement.ts` §`buildJsonExport` (L14–36) — the exact export shape the eval consumes (D-07).
- `scripts/trace-summary.ts` — the Phase 25 `tsx` CLI to mirror for structure: argv validation, `eval/` dir auto-create, JSON output, non-zero exit on bad input, untrusted-input hardening (null/NaN guards).

### Prior context
- `.planning/phases/25-dashboard-export-readme-script/25-CONTEXT.md` — tsx/CLI + computeCostUsd recompute decisions carried forward.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `scripts/trace-summary.ts`: closest analog — `tsx` CLI, argv parsing, JSON read/validate, directory-creating file write, non-zero exit on malformed input, hardened against null/NaN. Mirror its structure for `scripts/eval.ts`.
- `src/shared/pricing.ts` (`computeCostUsd`, `MODEL_PRICING`): cost recompute from token usage.
- `src/background/index.ts` (`scorePost`, `SYSTEM_PROMPT`): the classifier logic to extract into `src/shared/classifier.ts`.
- `src/dashboard/dataManagement.ts` (`buildJsonExport`): defines the input JSON contract.

### Established Patterns
- v7.0 decision (STATE.md): the Anthropic fetch lives in the service worker because CORS blocks browser-origin calls. **This constraint does not apply to the Node CLI** — `tsx`/Node can call `api.anthropic.com` directly. The shared classifier module must therefore be transport-agnostic (build request + parse response; caller performs the fetch OR the module fetches with an injected key — planner decides), so it works in both the SW and Node.
- Hardened-CLI pattern from Phase 25 (D-07/WR-01/WR-02): treat input JSON as untrusted; guard divide-by-zero and non-finite numbers; exit non-zero with clear stderr on bad input.

### Integration Points
- New `npm run eval` script in `package.json` → `tsx scripts/eval.ts`.
- `scripts/eval.ts` imports `src/shared/classifier.*` (new) + `src/shared/pricing.*`.
- Refactor touches `src/background/index.ts` to import the extracted classifier instead of inlining it (behavior-preserving; covered by `src/background/trace.test.ts` + the full suite).
</code_context>

<specifics>
## Specific Ideas

- Eval is only meaningful with a balanced `ai`+`human` set; the user explicitly wants the dataset to eventually include **unflagged** posts as negatives (driving the new pre-phase below).
- Threshold sweep (not a single number) was a deliberate choice — the user wants to see the precision/recall curve, not just one operating point.
</specifics>

<deferred>
## Deferred Ideas

- **NEW PHASE (insert before 26): "Capture & export unflagged posts."** To supply real `human` negatives for the eval, the extension needs to (a) sample posts it *saw but did not hide* in the content script, (b) store them under a new "seen/unflagged" key in `chrome.storage.local`, and (c) include them in the Export JSON. This is a distinct capability spanning the content script + storage schema + export — it does not belong inside the Eval Runner. **Action:** run `/gsd-phase` to insert this phase ahead of 26. Phase 26 consumes whatever labeled Export JSON it's given, so it can be built independently, but a *complete* eval depends on this pre-phase landing first.

</deferred>

---

*Phase: 26-eval-runner*
*Context gathered: 2026-06-14*
