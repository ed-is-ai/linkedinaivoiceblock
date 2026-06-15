---
phase: 28-evals-dashboard-future
plan: "01"
subsystem: shared/eval
tags: [storage, types, eval, tdd]
dependency_graph:
  requires: []
  provides:
    - src/shared/eval/evalRunStore.ts
    - src/shared/eval/metrics.ts#THRESHOLDS
    - src/shared/postStore.ts#setPostLabel
    - src/shared/postStore.ts#bulkSeedLabels
  affects:
    - src/shared/types.ts
    - src/shared/eval/runs.ts
    - src/shared/eval/index.ts
    - scripts/eval.ts
tech_stack:
  added: []
  patterns:
    - Serialized writeChain idiom (mirrors traceStore.ts) for race-safe FIFO persistence
    - TDD RED/GREEN for all new storage modules
    - label===undefined guard for idempotent bulk seed (D-09)
key_files:
  created:
    - src/shared/eval/evalRunStore.ts
    - src/shared/eval/evalRunStore.test.ts
  modified:
    - src/shared/types.ts
    - src/shared/eval/runs.ts
    - src/shared/eval/metrics.ts
    - src/shared/eval/index.ts
    - scripts/eval.ts
    - src/shared/postStore.ts
    - src/shared/postStore.test.ts
decisions:
  - "THRESHOLDS promoted to metrics.ts (host-agnostic) so CLI and dashboard share one constant (D-03)"
  - "bulkSeedLabels skips storageSet when nothing was mutated, avoiding unnecessary writes"
  - "setPostLabel always overwrites (explicit user action), while bulkSeedLabels never overwrites (idempotency)"
  - "evalRunStore mirrors traceStore.ts exactly — same serialized writeChain + pop() idiom"
metrics:
  duration: "~15 minutes"
  completed: "2026-06-15"
  tasks: 3
  files_modified: 9
---

# Phase 28 Plan 01: Evals Data Model and Storage Foundation Summary

Additive data-model and storage foundation for the Evals dashboard: `label?` on `StoredPost`, `evalRuns` in `StorageSchema`, `incomplete?` on `EvalRun`, shared `THRESHOLDS` constant, FIFO `EvalRunStore`, and idempotent label write-back via `setPostLabel` + `bulkSeedLabels` — all with zero UI, zero regressions across 381 tests.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Additive types + shared THRESHOLDS | af22027 | types.ts, runs.ts, metrics.ts, index.ts, eval.ts |
| 2 (RED) | EvalRunStore failing test | 1d7a54a | evalRunStore.test.ts |
| 2 (GREEN) | EvalRunStore implementation | 82e372e | evalRunStore.ts, index.ts |
| 3 (RED) | Label write-back failing tests | 1b86629 | postStore.test.ts |
| 3 (GREEN) | setPostLabel + bulkSeedLabels | 16ecbfa | postStore.ts, postStore.test.ts |

## Verification

- `npx tsc --noEmit` — exits 0
- `npx vitest run src/shared/eval/evalRunStore.test.ts` — 8/8 pass
- `npx vitest run src/shared/postStore.test.ts` — 13/13 pass (5 existing + 8 new)
- `npx vitest run` — 381/381 pass (zero regressions)

## Acceptance Criteria Status

- [x] StoredPost.label? field added with doc comment (content script NEVER writes it, D-08)
- [x] StorageSchema.evalRuns? typed key added (EvalRun[] type-only import from ./eval/runs, D-03)
- [x] EvalRun.incomplete? optional field added (D-06)
- [x] THRESHOLDS exported from metrics.ts (35,40,...,90 — 12 values)
- [x] THRESHOLDS re-exported from eval barrel index.ts
- [x] scripts/eval.ts imports THRESHOLDS from barrel; no local `const THRESHOLDS` (grep count: 0)
- [x] evalRunStore.ts exports appendEvalRun, getEvalRuns, EVAL_RUNS_KEY='evalRuns', MAX_EVAL_RUNS=50
- [x] Overflow eviction uses pop() (confirmed in source: `.pop()` present, no `.slice(` for eviction)
- [x] eval barrel re-exports the four evalRunStore symbols
- [x] postStore.ts exports setPostLabel and bulkSeedLabels
- [x] setPostLabel routes storedPosts-first, single storageSet per call
- [x] bulkSeedLabels seeds only label===undefined entries (flagged→ai, unflagged→human)
- [x] runs.ts does NOT export EVAL_RUNS_KEY or MAX_EVAL_RUNS

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test assertion used fresh object with different timestamp**
- **Found during:** Task 3 GREEN
- **Issue:** Test (a) compared `store['unflaggedPosts']` to a freshly-constructed `makeUnflaggedPost()` with a different `seenAt` timestamp — one ms difference caused spurious failure
- **Fix:** Changed assertion to use `toBe(originalUnflagged)` (reference equality) to verify the array was not rewritten rather than deep-equal comparison
- **Files modified:** src/shared/postStore.test.ts
- **Commit:** 16ecbfa (included in GREEN commit)

**2. [Rule 1 - Style] Unnecessary type assertions in new functions**
- **Found during:** Task 3 GREEN (IDE diagnostic warnings)
- **Issue:** `(arr as StoredPost[])` casts were redundant because `storageGet` return type already resolves to the typed arrays
- **Fix:** Removed all redundant `as StoredPost[]` / `as UnflaggedPost[]` casts from `setPostLabel` and `bulkSeedLabels`; `bulkSeedLabels` storageSet simplified to `{ storedPosts, unflaggedPosts }`
- **Files modified:** src/shared/postStore.ts
- **Commit:** 16ecbfa

## Threat Model Mitigations Applied

| Threat | Mitigation | Status |
|--------|-----------|--------|
| T-28-01: bulkSeedLabels overwriting manual labels | `label === undefined` guard — tested idempotency in tests (f)(g)(h) | Applied |
| T-28-02: evalRuns unbounded growth | MAX_EVAL_RUNS=50 FIFO cap with pop() eviction — tested in test (c) | Applied |
| T-28-04: lost-update race on concurrent appends | Serialized writeChain idiom copied from traceStore.ts | Applied |

## Known Stubs

None — this plan is pure storage primitives with no UI or rendering paths.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or external trust boundaries introduced. All writes are local chrome.storage.local via existing wrappers.

## Self-Check: PASSED

- src/shared/eval/evalRunStore.ts — FOUND
- src/shared/eval/evalRunStore.test.ts — FOUND
- src/shared/postStore.ts (setPostLabel, bulkSeedLabels exports) — FOUND
- Commit af22027 — FOUND
- Commit 1d7a54a — FOUND
- Commit 82e372e — FOUND
- Commit 1b86629 — FOUND
- Commit 16ecbfa — FOUND
