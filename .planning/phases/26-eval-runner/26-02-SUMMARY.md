---
phase: 26-eval-runner
plan: "02"
subsystem: eval-cli
tags: [cli, metrics, eval, llm, tdd]
dependency_graph:
  requires: [src/shared/classifier.ts, src/shared/pricing.ts]
  provides: [scripts/eval.ts, scripts/eval.test.ts]
  affects: [package.json, vitest.config.ts]
tech_stack:
  added: []
  patterns: [post-hoc threshold sweep, pure-function exports for testability, sequential LLM scoring]
key_files:
  created:
    - scripts/eval.ts
    - scripts/eval.test.ts
  modified:
    - package.json
    - vitest.config.ts
decisions:
  - "collectLabeled and computeMetrics exported as pure functions enabling unit tests without CLI side-effects"
  - "isMain guard via process.argv[1] endsWith check prevents CLI execution on import"
  - "Threshold sweep is post-hoc over already-scored array — no extra API calls (D-06)"
  - "Precision/recall yield null (not NaN) on divide-by-zero; f1=null when either is null (T-26-09)"
  - "vitest.config.ts include extended to scripts/**/*.test.ts (Rule 3 — blocked test discovery)"
metrics:
  duration: "~15 minutes"
  completed: "2026-06-14"
  tasks_completed: 3
  files_changed: 4
---

# Phase 26 Plan 02: Eval CLI Summary

**One-liner:** Built `scripts/eval.ts` CLI that reads labeled Export JSON, re-scores each post through the shared LLM classifier, sweeps 12 thresholds (35–90 step 5) computing precision/recall/F1/accuracy, persists results to `eval/results-YYYY-MM-DD.json`, and prints a compact summary — wired as `npm run eval`.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Create scripts/eval.ts — input walk + sequential LLM scoring + cost | 4c0195c | scripts/eval.ts |
| 2 | Threshold sweep + metrics + results persistence + npm script | 2ea89f4 | scripts/eval.ts, package.json |
| 3 | scripts/eval.test.ts — walker, metric guards, exit codes | 5e8fa6d | scripts/eval.test.ts, vitest.config.ts |

## What Was Built

`scripts/eval.ts` (300 lines) provides a complete evaluation harness:

- **Input walk:** `collectLabeled(flaggedPosts, unflaggedPosts)` walks the two top-level arrays from the Export JSON (never `flaggedAccounts[].posts[]` — D-07/Phase 25.2 amendment). Skips null/non-object entries with a warning; counts unlabeled entries; exits non-zero if zero labeled posts found (EVAL-05).
- **Guards:** exits non-zero on missing argv, unreadable/unparseable file, unset `ANTHROPIC_API_KEY` (EVAL-05). API key never appears in stdout, console, or results file (T-26-04).
- **Sequential scoring:** calls `classifyPost(post.text, apiKey)` once per labeled post; uses `result.score` from fresh LLM call, never the stored export score (D-08). Accumulates cost via `computeCostUsd()` + `safe()` guard (WR-01).
- **Threshold sweep:** `computeMetrics(scored, threshold)` for each of 12 thresholds (35–90 step 5), post-hoc over already-scored array — no extra API calls (D-06). Divide-by-zero guards yield `null` for precision/recall/f1 (never NaN — T-26-09).
- **Results persistence:** `mkdirSync(EVAL_DIR, { recursive: true })` + `writeFileSync` to `eval/results-YYYY-MM-DD.json` with counts, cost, thresholds, bestF1Threshold (no apiKey field — T-26-04).
- **Stdout:** full per-threshold table with best-F1 marker + compact single-line summary (EVAL-04).

`scripts/eval.test.ts` (226 lines) covers 13 behaviors across 3 suites:

- **EVAL-01 walker:** mixed labeled/unlabeled/invalid entries across both arrays; null/primitive entries skipped; `flaggedAccounts` structurally excluded (not a parameter).
- **EVAL-03 metrics:** known fixture with expected TP/FP/TN/FN values; zero-positive case yields `precision === null`; zero-actual-positive case yields `recall === null`; empty array yields all null/0; `JSON.stringify` of any row contains no `NaN` string.
- **safe():** finite passthrough, NaN → 0, Infinity → 0.

## Verification

- `npm test -- scripts/eval.test.ts` — 13 tests, all green
- `npm test` — 287 tests across 21 files, all green
- `npx tsc --noEmit` — exits 0
- `grep -c flaggedAccounts scripts/eval.ts` — returns 0 (no double-count walk)
- `npm run eval` (no arg) — exits non-zero, prints usage (manual)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Extended vitest.config.ts include pattern for scripts/**/*.test.ts**
- **Found during:** Task 3 verification (`npm test -- scripts/eval.test.ts` → "No test files found")
- **Issue:** `vitest.config.ts` `include` only covered `src/**/*.test.ts`; `scripts/eval.test.ts` was outside the glob and not discoverable
- **Fix:** Added `'scripts/**/*.test.ts'` to the `include` array in `vitest.config.ts`
- **Files modified:** vitest.config.ts
- **Commit:** 5e8fa6d

**2. [Rule 1 - Bug] Fixed test fixture for "JSON.stringify contains no NaN" case**
- **Found during:** Task 3 first test run
- **Issue:** Fixture used `{ label: 'ai', score: 20 }` at threshold 50 → FN=1, so recall = 0/1 = 0 (not null). Test expected `recall === null` but got `recall === 0`.
- **Fix:** Changed fixture to `{ label: 'human', score: 20 }` → TP=FP=TN=FN=0 → both precision and recall are null
- **Files modified:** scripts/eval.test.ts
- **Commit:** 5e8fa6d

## Known Stubs

None — the CLI is fully wired: imports real `classifyPost` from `src/shared/classifier.ts`, real `computeCostUsd` from `src/shared/pricing.ts`, writes real results JSON. No placeholder values.

## Threat Surface Scan

No new network endpoints or auth paths. `scripts/eval.ts` reads `ANTHROPIC_API_KEY` from env and passes it to `classifyPost()` as a parameter — it is placed only in the `x-api-key` header inside `classifier.ts`. The results file schema has no key field by construction (T-26-04 mitigated). Input is validated before use; `safe()` wraps all numeric fields (T-26-05 mitigated). Output path is fixed `EVAL_DIR + date` — not user-controlled (T-26-08 mitigated).

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| scripts/eval.ts exists (300 lines, ≥ 120) | FOUND |
| scripts/eval.test.ts exists (226 lines, ≥ 50) | FOUND |
| package.json contains "eval": "tsx scripts/eval.ts" | FOUND |
| Commit 4c0195c (feat: eval.ts input walk) | FOUND |
| Commit 2ea89f4 (feat: threshold sweep + npm script) | FOUND |
| Commit 5e8fa6d (test: eval.test.ts) | FOUND |
| grep -c flaggedAccounts scripts/eval.ts = 0 | PASSED |
| npm test — 287/287 green | PASSED |
| npx tsc --noEmit — exits 0 | PASSED |
