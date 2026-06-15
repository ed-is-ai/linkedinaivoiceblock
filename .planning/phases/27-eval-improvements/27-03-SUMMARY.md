---
phase: 27-eval-improvements
plan: "03"
subsystem: eval
tags: [eval, cli, comparison, shared-logic, tdd]
dependency_graph:
  requires: [27-01, 27-02]
  provides: [eval-compare-cli, shared-comparison-tests]
  affects: [scripts/eval-compare.ts, src/shared/eval/runs.test.ts]
tech_stack:
  added: []
  patterns: [pure-shared-logic, thin-cli-wrapper, tdd-green-on-existing-impl]
key_files:
  created:
    - src/shared/eval/runs.test.ts
    - scripts/eval-compare.ts
    - scripts/eval-compare.test.ts
  modified: []
decisions:
  - "renderTerminal/renderMarkdown exported as pure functions so tests call them directly without spawning a subprocess"
  - "buildRowsFromSummaries fallback for render calls without full EvalRun (enables render tests without disk I/O)"
  - "main() kept synchronous (no LLM/network calls); tests use expect(() => main()).toThrow() not .rejects"
metrics:
  duration: "~25 min"
  completed: "2026-06-15"
  tasks_completed: 2
  files_changed: 3
---

# Phase 27 Plan 03: Eval Compare CLI and Shared Comparison Tests Summary

Thin `eval-compare` CLI wrapping shared `compareRuns()` from `src/shared/eval/runs.ts`, plus pure-function unit tests for the already-implemented `summarize` and `compareRuns` shared functions.

## What Was Built

### Task 1: Unit tests for existing shared comparison layer

`src/shared/eval/runs.test.ts` — 15 pure-function tests covering:

- `summarize()`: best-threshold row lookup, null metrics when no matching row, null cost for heuristic runs, `cost.totalUsd` for LLM runs, fp/fn counts from `errorAnalysis`, NaN-free JSON serialization
- `compareRuns()`: correct f1/precision/recall deltas, populated summaries, null-cost `MetricDelta` without throwing, numeric delta when both have cost, `perThreshold` alignment by threshold value, null delta when threshold absent in baseline, NaN-free serialization with all-null costs

### Task 2: eval-compare CLI + CLI tests

`scripts/eval-compare.ts` — thin wrapper:
- Parses two positional file paths + `--format markdown` flag from `process.argv`
- Loads each file via `loadRun()` try/catch (`readFileSync` + `JSON.parse`)
- Calls `compareRuns(runA, runB)` from `src/shared/eval/index.js` — no duplicate diff logic
- Renders via `renderTerminal()` (padded two-column table) or `renderMarkdown()` (GFM table)
- `costUsd === null` renders as `'free'`; exits 1 on fewer-than-two args or unreadable/bad JSON
- Exports `renderTerminal`, `renderMarkdown`, `main` for testability

`scripts/eval-compare.test.ts` — 14 tests:
- Render: engine labels, bestF1Threshold, metric values, `free` for null cost, `$0.0148` for non-null cost, GFM markdown format, NaN-free with all-null metrics
- Main guards: exit 1 on zero args (Usage message), exit 1 on missing file, exit 1 on bad JSON, exit 0 on valid files, exit 0 with markdown output containing `|` separator rows

## Deviations from Plan

### Shared implementation already existed (Plan 27-01 deviation)

**Found at execution start:** `summarize`, `compareRuns`, `EvalRunSummary`, `MetricDelta`, `EvalRunComparison`, and the `delta` helper were already fully implemented and exported in `src/shared/eval/runs.ts` and `src/shared/eval/index.ts` — added as a deviation during Plan 27-01 execution.

**Action:** Skipped re-implementation entirely. Task 1 pivoted to writing tests for the existing implementation (TDD GREEN on pre-existing code). `src/shared/eval/index.ts` was not modified — the barrel already exports all required symbols.

**Files not modified:** `src/shared/eval/runs.ts`, `src/shared/eval/index.ts` (both complete from 27-01).

### renderTerminal/renderMarkdown export pattern (Rule 2 — testability)

**Found during Task 2:** The plan specified only `export function main`. To enable the render tests to call `renderTerminal`/`renderMarkdown` directly (without spawning a subprocess or mocking fs), these two functions were also exported.

**Impact:** Zero interface change — callers of `main()` are unaffected. Adds a narrow, stable public surface that the Phase 28 dashboard could reuse if needed.

### buildRowsFromSummaries fallback (Rule 2 — correctness)

**Found during Task 2:** `renderTerminal`/`renderMarkdown` accept optional `runA`/`runB` parameters for accuracy and avg-cost-per-post rows (which come from the full `EvalRun`, not `EvalRunSummary`). When called without full runs (e.g. in render-only tests or future dashboard use), a summary-only row builder is used as fallback, omitting the full-EvalRun rows. This prevents a crash and keeps the render functions host-agnostic.

### main() synchronous — test pattern adjustment

**Found during Task 2:** `main()` contains no async operations (no LLM/network calls). Tests used `expect(() => main()).toThrow(...)` rather than `await expect(main()).rejects.toThrow(...)` to match the synchronous contract.

## Known Stubs

None. All metric values rendered by the CLI come from live `EvalRun` data parsed from disk — no hardcoded placeholders.

## Threat Flags

None. `eval-compare.ts` reads two local JSON files (read-only) and writes to stdout only. The `loadRun` try/catch mitigates T-27-07 (malformed JSON). No new network endpoints, auth paths, or trust boundaries introduced.

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| `src/shared/eval/runs.test.ts` exists | FOUND |
| `scripts/eval-compare.ts` exists | FOUND |
| `scripts/eval-compare.test.ts` exists | FOUND |
| Commit 41c3966 (test: runs.test.ts) | FOUND |
| Commit 999746b (feat: eval-compare CLI) | FOUND |
| `npx vitest run` (29 tests) | PASSED |
| `npm run type-check` | PASSED |
