---
phase: 24-trace-capture-storage
plan: "01"
subsystem: shared
tags: [trace, pricing, storage, types, tdd]
dependency_graph:
  requires: []
  provides: [TraceEntry, ModelPricing, MODEL_PRICING, computeCostUsd, appendTrace, TRACE_STORE_CAP, llbTraces, llbModelPricing]
  affects: [src/shared/types.ts, src/background/index.ts]
tech_stack:
  added: []
  patterns: [FIFO-cap prepend+pop, cache-aware cost formula, TDD red/green]
key_files:
  created:
    - src/shared/pricing.ts
    - src/shared/pricing.test.ts
    - src/shared/traceStore.ts
    - src/shared/traceStore.test.ts
  modified:
    - src/shared/types.ts
decisions:
  - "TraceEntry is flat (no nested objects) following StoredPost analog"
  - "ModelPricing uses index signature with | undefined so unknown models return undefined without a type cast"
  - "traceStore uses pop() not slice() per established codebase idiom (postStore.ts)"
  - "TDD: tests written before implementation for pricing.ts and traceStore.ts"
metrics:
  duration: "~15 minutes"
  completed: "2026-06-14"
  tasks_completed: 3
  files_modified: 5
---

# Phase 24 Plan 01: Trace Schema, Pricing, and FIFO Writer Summary

**One-liner:** TraceEntry schema + cache-aware cost model (Sonnet $3/$15, Haiku $1/$5) + FIFO-capped appendTrace (cap 500, prepend+pop idiom) — the pure testable foundation for phase 24 trace capture.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add TraceEntry + ModelPricing types and storage keys | 4723f7b | src/shared/types.ts |
| 2 (RED) | Failing tests for pricing.ts | d881134 | src/shared/pricing.test.ts |
| 2 (GREEN) | pricing.ts — MODEL_PRICING + computeCostUsd | 5eee58c | src/shared/pricing.ts |
| 3 (RED) | Failing tests for traceStore.ts | 6d9a220 | src/shared/traceStore.test.ts |
| 3 (GREEN) | traceStore.ts — FIFO-capped appendTrace | 7546e5d | src/shared/traceStore.ts |

## Artifacts

### src/shared/types.ts (modified)
- Added `export interface TraceEntry` with all D-04 fields: `model`, `systemPrompt`, `userPrompt`, `inputTokens`, `outputTokens`, `cacheCreationTokens`, `cacheReadTokens`, `costUsd`, `timestamp`, `source: 'detector' | 'rederiver'`, `error?`, `unpriced?`
- Added `export type ModelPricing` (index signature with `| undefined`)
- Added `llbTraces?: TraceEntry[]` and `llbModelPricing?: ModelPricing` to `StorageSchema`
- No `apiKey` / `anthropicApiKey` / `x-api-key` field in TraceEntry (T-24-01 compliance)

### src/shared/pricing.ts (new)
- Exports `MODEL_PRICING: ModelPricing` with Sonnet 4.6 ($3.00/$15.00) and Haiku 4.5-20251001 ($1.00/$5.00) — priced 2026-06 (D-06)
- Exports `computeCostUsd(model, usage)` applying D-05 cache-aware formula: `(input×inputRate + cacheCreate×inputRate×1.25 + cacheRead×inputRate×0.10 + output×outputRate) / 1_000_000`
- Unknown models return `{ costUsd: 0, unpriced: true }` (D-08); undefined cache fields treated as 0

### src/shared/traceStore.ts (new)
- Exports `TRACE_STORE_CAP = 500` (TRACE-03)
- Exports `appendTrace(entry: TraceEntry): Promise<void>` using prepend+pop FIFO idiom from postStore.ts (D-09)
- Imports `storageGet`/`storageSet` from `./storage` — no direct `chrome.storage.local` calls
- No deduplication (every attempt produces a trace, D-03)
- No text truncation (userPrompt truncated by Plan 02 caller, D-04)

## Test Results

```
Test Files  2 passed (2)
     Tests  13 passed (13)
            - pricing.test.ts: 9 tests (MODEL_PRICING shape, flat cost, cache-aware cost, unknown model)
            - traceStore.test.ts: 4 tests (empty store, prepend order, 501→500 FIFO cap, TRACE_STORE_CAP export)
```

`npx tsc --noEmit` exits 0 (whole project compiles cleanly under strict mode).

## TDD Gate Compliance

| Gate | Task | Commit | Status |
|------|------|--------|--------|
| RED | pricing.ts | d881134 | PASS — tests failed (module not found) |
| GREEN | pricing.ts | 5eee58c | PASS — 9/9 tests pass |
| RED | traceStore.ts | 6d9a220 | PASS — tests failed (module not found) |
| GREEN | traceStore.ts | 7546e5d | PASS — 4/4 tests pass |

## Deviations from Plan

None - plan executed exactly as written. The initial types.ts edit had a merge error (accidentally split StoredPost body) which was caught and corrected in the same task before committing.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries beyond what the plan documented. The `TraceEntry` interface contains no `apiKey`/`anthropicApiKey`/`x-api-key` field (T-24-01 verified via grep).

## Self-Check: PASSED

- src/shared/types.ts exists and contains `export interface TraceEntry` and `export type ModelPricing`
- src/shared/pricing.ts exists and exports `MODEL_PRICING` and `computeCostUsd`
- src/shared/pricing.test.ts exists with 9 passing tests
- src/shared/traceStore.ts exists and exports `appendTrace` and `TRACE_STORE_CAP`
- src/shared/traceStore.test.ts exists with 4 passing tests
- All 5 task commits exist: 4723f7b, d881134, 5eee58c, 6d9a220, 7546e5d
- `npx tsc --noEmit` exits 0
- `npx vitest run src/shared/pricing.test.ts src/shared/traceStore.test.ts` — 13/13 pass
