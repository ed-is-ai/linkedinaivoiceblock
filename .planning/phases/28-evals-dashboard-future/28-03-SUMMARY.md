---
phase: 28-evals-dashboard-future
plan: "03"
subsystem: evals-dashboard
tags: [eval, run-engine, heuristic, llm, cost-modal, partial-run, metrics, threshold-sweep, fp-fn, compare-runs]
dependency_graph:
  requires:
    - "28-02 (evals.tsx shell, labeling, evalsLabeling.ts)"
    - "src/shared/eval barrel (THRESHOLDS, computeMetrics, filterErrors, buildPostData, assembleRun, appendEvalRun, getEvalRuns, compareRuns, summarize)"
    - "src/content/detector/heuristic.ts (HeuristicDetector)"
    - "src/shared/pricing.ts (MODEL_PRICING, computeCostUsd)"
    - "service worker SCORE_POST relay (src/background/index.ts:343-360)"
  provides:
    - "Full in-page eval run loop (heuristic + LLM) — src/dashboard/evals.tsx"
    - "assembleRun pure helper — src/dashboard/evalsRunEngine.ts"
    - "16 new unit tests in src/dashboard/evals.test.ts"
  affects:
    - "src/dashboard/evals.tsx (extended from 28-02 shell)"
    - "chrome.storage.local evalRuns key (via appendEvalRun)"
tech_stack:
  added: []
  patterns:
    - "Run-engine helper extracted to evalsRunEngine.ts (mirrors evalsLabeling.ts testable pattern)"
    - "Cost is always estimate-derived (SCORE_POST relay returns no token usage)"
    - "cancelRef for cancellation without stale-closure issues"
    - "Partial runs flagged via incomplete:true; metrics show 'partial' badge"
key_files:
  created:
    - "src/dashboard/evalsRunEngine.ts"
  modified:
    - "src/dashboard/evals.tsx"
    - "src/dashboard/evals.test.ts"
decisions:
  - "Extracted assembleRun (sweep + best-F1 + FP/FN + EvalRun assembly) into evalsRunEngine.ts for unit testability — mirrors evalsLabeling.ts pattern; no JSX in the helper"
  - "Cost estimate uses claude-sonnet-4-6 flat token estimate (200 in / 60 out per post) — relay returns no usage so this is the only cost signal available"
  - "Heuristic runs skip the confirm modal (free/fast — Claude's Discretion per CONTEXT.md)"
  - "cancelRef + flag-check per iteration (not AbortController) — simpler for sequential sendMessage loop"
  - "EvalRun.cost stores total pre-run estimate; running readout accumulates per-post estimate as posts complete — both coherent with the modal's stated estimate"
  - "compareBaseline: find most recent prior run of the SAME engine from getEvalRuns() storage"
metrics:
  duration: "~20 min"
  completed: "2026-06-15"
  tasks_completed: 3
  files_changed: 3
---

# Phase 28 Plan 03: Run Engine + Results Rendering Summary

**One-liner:** Full in-page eval run engine (heuristic + LLM via SCORE_POST relay), estimate-gated cost modal, live progress/cancel with partial-run persistence, and metrics/sweep/FP-FN/compare rendering — all wired from the shared eval core.

## Tasks Completed

| # | Task | Commit | Description |
|---|------|--------|-------------|
| 1 | Run loop + assembleRun helper | 9f5362d | evalsRunEngine.ts + 16 TDD tests |
| 1+2+3 | Full evals.tsx implementation | fdee466 | Run engine, cost modal, progress, results rendering |

## What Was Built

### Task 1 — Run Engine (heuristic + LLM) + assembleRun helper

`src/dashboard/evalsRunEngine.ts` — pure post-processing extracted for testability:
- `assembleRun(args): EvalRun` — threshold sweep via imported `THRESHOLDS` (no literal array), best-F1 pick (ties → first), `filterErrors` called post-sweep with `bestF1Threshold`, EvalRun assembly with `source:'dashboard'`, `dataset.source:'storage'`
- Cost semantics: `SCORE_POST` relay returns **no token usage** — cost is always the pre-run estimate (`estimatedCost` arg); heuristic cost = `null`
- 16 unit tests added to `evals.test.ts` covering: best-F1 selection, tie resolution, FP/FN correctness, shape conformance, incomplete flag, run id format, sweep row count, compareRuns Δ

`src/dashboard/evals.tsx` run loop:
- **Heuristic path:** `new HeuristicDetector()` (no `fetchComments` — DOM-free, generic-comments won't fire) → `buildPostData(post)` → `detector.detect(postData)`
- **LLM path:** `chrome.runtime.sendMessage({type:'SCORE_POST', postText})` per post; `resp.error` increments `errored` and `continue`s; relay returns no usage so cost is never read from response
- Both paths push `ScoredEntry` + `PostDetail` accumulating `scored`/`details`
- Post-loop: `assembleRun(...)` → `appendEvalRun(run)` → reload from `getEvalRuns()`

### Task 2 — Cost Modal + Progress + Cancel + Partial Persistence (D-05, D-06)

- **D-05 confirm modal:** LLM runs gated behind `phase:'confirm'` state showing post count and `postCount × AVG_USD_PER_POST` estimate; Cancel aborts before scoring; Approve transitions to `phase:'running'`
- **Heuristic:** no modal (free/fast — Claude's Discretion)
- **D-06 live progress:** `phase:'running'` state shows `scored/total` + running cost estimate (accumulates `AVG_USD_PER_POST` per completed post); progress bar fills incrementally; Cancel button sets `cancelRef.current = true`
- **Partial persistence:** on cancel OR `scored.length < total`, `assembleRun` called with `incomplete: true`; `appendEvalRun` called always (even on interrupt); partial badge shown on metrics

### Task 3 — Results Rendering (D-03)

- **4-metric grid:** Precision / Recall / F1 / Accuracy read from `bestF1Threshold` row of `currentRun.thresholds` (no local metric recomputation)
- **Threshold sweep table:** 12 rows (35–90 step 5) from `currentRun.thresholds`; best row highlighted `background:#eff6ff, fontWeight:600` with `◀ best` marker
- **FP/FN error cards:** `currentRun.errorAnalysis.falsePositives/falseNegatives` rendered as cards with signal pills sorted by score desc (mirrors `formatSignalBreakdown` ordering); text/signal names rendered as Preact children — never `dangerouslySetInnerHTML` (T-28-11)
- **Compare Δ table:** `compareRuns(currentRun, baseline)` where baseline = most recent prior run of same engine from `getEvalRuns()`; shows F1/Precision/Recall/Cost current + baseline + Δ coloured green/red
- **Partial marker:** `isPartial = run.incomplete === true || run.counts.scored < run.counts.labeled`; shown as amber badge next to Results heading

## Deviations from Plan

### Auto-fixed Issues

None.

### Structural Note

Tasks 1, 2, and 3 were implemented atomically in `evals.tsx` after the helper commit, since the run loop (Task 1), cancel/modal wrapper (Task 2), and rendering (Task 3) share a single React-like state machine (`RunStatus`) that cannot be cleanly separated into sequential partial commits without breaking TypeScript. The TDD tests were committed first (RED+GREEN in the helper), then the full implementation committed once all three tasks were complete and both gates passed.

## Acceptance Criteria Verification

- [x] `evals.tsx` imports `THRESHOLDS`, `computeMetrics`, `filterErrors`, `buildPostData`, `appendEvalRun`, `compareRuns`, `summarize` from `../shared/eval` — no redefinition
- [x] No literal threshold array in `evals.tsx` (sweep uses imported `THRESHOLDS` via `assembleRun`)
- [x] Heuristic: `new HeuristicDetector()` (no `fetchComments`) + `detect(buildPostData(post))`
- [x] LLM: `chrome.runtime.sendMessage({type:'SCORE_POST', postText})`; `resp.error` handled; cost NOT read from response
- [x] EvalRun: `source:'dashboard'`, `dataset.source:'storage'`; LLM cost = pre-run estimate; heuristic cost = `null`
- [x] `filterErrors` called with `bestF1Threshold` post-sweep (never inside scoring loop)
- [x] D-05 confirm modal guards LLM runs; Cancel aborts before scoring
- [x] No artificial post cap or sampling
- [x] D-06 progress readout + Cancel + partial persistence with `incomplete:true`
- [x] Metric grid + sweep table + FP/FN cards render from run's shipped fields (no inline math)
- [x] Best-row sweep highlight + `compareRuns` Δ table + partial badge
- [x] `npx vitest run` — 405 tests pass (27 files)
- [x] `npm run build` exits 0

## Known Stubs

None — all data flows from real `chrome.storage.local` reads and run results. The cost figure is labelled "estimate" throughout the UI (modal, progress readout, compare table column header) to set accurate user expectations.

## Threat Flags

None beyond those in the plan's threat register (T-28-08 through T-28-11). All mitigations applied:
- T-28-08: LLM path uses SCORE_POST relay only; no Anthropic fetch from the page
- T-28-09: D-05 modal + D-06 Cancel implemented
- T-28-10: `incomplete:true` flag + visible "partial" badge
- T-28-11: FP/FN text and signal names rendered as Preact children (no `dangerouslySetInnerHTML`)

## Self-Check: PASSED

Files verified:
- `src/dashboard/evalsRunEngine.ts` — exists (created)
- `src/dashboard/evals.tsx` — exists (modified)
- `src/dashboard/evals.test.ts` — exists (modified)

Commits verified:
- `9f5362d` — feat(28-03): add assembleRun helper + TDD tests
- `fdee466` — feat(28-03): implement run engine + cost modal + progress/cancel + results rendering
