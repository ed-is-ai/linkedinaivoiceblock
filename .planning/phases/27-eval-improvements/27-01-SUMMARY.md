---
phase: 27-eval-improvements
plan: 01
subsystem: testing
tags: [eval, typescript, vitest, heuristic-detector, eval-run]

requires:
  - phase: 26-eval-harness
    provides: scripts/eval.ts CLI, src/shared/classifier.ts extraction precedent
provides:
  - Pure host-agnostic eval core in src/shared/eval/ (buildPostData, computeMetrics, filterErrors, formatSignalBreakdown, safe)
  - Canonical EvalRun record types (EvalEngine, DatasetRef, EvalCost, ErrorAnalysis, EvalRun) in src/shared/eval/runs.ts
  - Selectable detector engine (--engine heuristic|llm, default llm) in scripts/eval.ts
  - Best-F1-threshold error analysis (FP/FN) in terminal output and persisted results JSON
  - eval/results-*.json is now a conformant EvalRun record
affects: [27-03, phase-28-dashboard]

tech-stack:
  added: []
  patterns:
    - "Pure shared core under src/shared/eval (mirrors Phase 26 classifier extraction) consumable by CLI and future dashboard"
    - "EvalRun record contract from mockups/DATA-MODEL.md authored before the dashboard exists (forward-compat seam)"

key-files:
  created:
    - src/shared/eval/metrics.ts
    - src/shared/eval/runs.ts
    - src/shared/eval/index.ts
    - src/shared/eval/metrics.test.ts
  modified:
    - scripts/eval.ts
    - scripts/eval.test.ts
    - eval-instructions.md

key-decisions:
  - "Default engine is llm (preserves Phase 26 backward-compat); heuristic is the documented free opt-in"
  - "API-key guard conditioned on engine === 'llm' so heuristic runs without ANTHROPIC_API_KEY"
  - "Moved pure-function test blocks' imports in eval.test.ts to the shared module rather than deleting them; metrics.test.ts is the primary home for the pure-core tests"
  - "FP/FN computed post-sweep from bestF1Threshold via shared filterErrors (never inside the scoring loop)"

patterns-established:
  - "src/shared/eval barrel is the single import point for both the CLI now and the Phase 28 dashboard later"
  - "Persisted results-*.json conforms to EvalRun so the dashboard ingests it with no transformation"

requirements-completed: [EVAL-06, EVAL-07]

duration: ~20min
completed: 2026-06-15
---

# Phase 27 Plan 01: Eval Core Extraction + Selectable Engine + Error Analysis

**The eval now scores through a selectable detector engine (free heuristic or LLM), surfaces best-F1 false positives/negatives, and writes a forward-compatible `EvalRun` record from a pure, host-agnostic `src/shared/eval/` core.**

## Performance

- **Duration:** ~20 min (incl. orchestrator recovery of a cut-off executor)
- **Completed:** 2026-06-15
- **Tasks:** 3
- **Files modified:** 7 (4 created, 3 modified)

## Accomplishments
- Extracted the pure eval core (`buildPostData`, `computeMetrics`, `filterErrors`, `formatSignalBreakdown`, `safe` + `PostDetail`/`ScoredEntry`/`ThresholdRow` types) into `src/shared/eval/metrics.ts` — no `fs`/`process`/`chrome`/DOM.
- Defined the canonical `EvalRun` record types in `src/shared/eval/runs.ts` (reusing metrics types) and a barrel `index.ts`; `scripts/eval.ts` now writes an `EvalRun` to `eval/results-*.json`.
- Added `--engine heuristic|llm` selection (default `llm`); heuristic path scores through `HeuristicDetector` with no API key and accrues no cost.
- Added best-F1 FP/FN error analysis to both the terminal (capped at top-5) and `results.errorAnalysis`.
- Updated `eval-instructions.md` for engine selection, heuristic signal vocabulary (incl. `generic-comments` never firing), error analysis, conditional API key, and an `eval-label` pointer.

## Task Commits

1. **Tasks 1 & 2: pure core + engine selection + error analysis + EvalRun types** — `0efa5f8` (feat)
2. **Task 3: eval-instructions.md update** — `7136c45` (docs)

## Deviations / Recovery Notes

The parallel executor agent for this plan was **cut off before committing** (it had completed Tasks 1–2 source files but left the work uncommitted and Task 3 undone). The orchestrator recovered the worktree rather than discarding ~70% complete work:

- **Fixed an arg-parsing bug** in `scripts/eval.ts`: the file-path finder excluded `args[engineFlagIdx + 1]`, which resolved to `args[0]` when `--engine` was absent — dropping the file path on every no-flag invocation (14 failing tests). Now excludes the engine value only when the flag is present.
- **Reconciled `scripts/eval.test.ts`**: the moved pure functions were re-imported from `src/shared/eval` (their duplicate describe blocks now also covered authoritatively in `metrics.test.ts`).
- **Completed Task 3** (`eval-instructions.md`) which the cut-off agent never reached.

## Verification

- `npx vitest run` — **324/324 pass** (incl. `metrics.test.ts` and `eval.test.ts`).
- `npm run type-check` — **exits 0** (the `const results: EvalRun` annotation enforces conformance).
- Task 3 grep verify — `--engine` and `error analysis` both present → `OK`.

## Self-Check: PASSED
