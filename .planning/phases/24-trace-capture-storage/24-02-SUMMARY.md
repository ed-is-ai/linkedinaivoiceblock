---
phase: 24-trace-capture-storage
plan: "02"
subsystem: background
tags: [trace, pricing, service-worker, scoring, rederiver, tdd]
dependency_graph:
  requires: [TraceEntry, ModelPricing, MODEL_PRICING, computeCostUsd, appendTrace, storageSet]
  provides: [TRACE-01, TRACE-02, TRACE-03, D-06-pricing-seed]
  affects: [src/background/index.ts, src/background/trace.test.ts, src/background/ratelimit.test.ts]
tech_stack:
  added: []
  patterns: [widen-cast-usage, appendTrace-success-and-error, FIFO-cap-end-to-end, onStartup-pricing-seed]
key_files:
  created:
    - src/background/trace.test.ts
  modified:
    - src/background/index.ts
    - src/background/ratelimit.test.ts
decisions:
  - "Error trace for no-key rederiver placed at the early-return site (before latch acquisition), not in the handler catch, to match the plan's intent — the no-key path is a distinct flow from the rederiveSelector throw path"
  - "Rate-limit early returns (latch held, cool-off, daily cap) do NOT append traces — no Anthropic request was made in those cases (D-03 applies only to LLM call attempts)"
  - "ratelimit.test.ts okResponse updated to include usage field — the new trace recording code accesses data.usage on the success path; old mock returned only content"
metrics:
  duration: "~8 minutes"
  completed: "2026-06-14"
  tasks_completed: 3
  files_modified: 3
---

# Phase 24 Plan 02: Service-Worker Trace Recording Summary

**One-liner:** Service worker wired with appendTrace on both scorePost (TRACE-01) and rederiveSelector (TRACE-02) success+error paths, pricing re-seeded into storage on every load (D-06), and 5-test handler suite proving source, tokens, FIFO cap, error tracing, and API-key absence.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Refresh-on-load pricing seed in onInstalled + onStartup | a8c5ef4 | src/background/index.ts |
| 2 | Trace recording in scorePost — success + failure paths | 3f37c29 | src/background/index.ts |
| 3 | Trace recording in rederiveSelector + handler tests | 799093f | src/background/index.ts, src/background/trace.test.ts, src/background/ratelimit.test.ts |

## Artifacts

### src/background/index.ts (modified)

**Task 1 — Pricing seed (D-06):**
- Added imports: `MODEL_PRICING`, `computeCostUsd` from `../shared/pricing`; `appendTrace` from `../shared/traceStore`; `TraceEntry` from `../shared/types`; `storageSet` from `../shared/storage`
- `onInstalled`: added `storageSet({ llbModelPricing: MODEL_PRICING }).catch(() => {})` with D-06 comment (unconditional overwrite, not preserve)
- New `chrome.runtime.onStartup.addListener` doing the same overwrite write

**Task 2 — scorePost trace recording (TRACE-01 / D-02 / D-03):**
- Widened `data` cast to include `usage: { input_tokens, output_tokens, cache_creation_input_tokens?, cache_read_input_tokens? }`
- Success path: builds `TraceEntry` with `source: 'detector'`, full `SYSTEM_PROMPT`, `userPrompt: postText.slice(0, 500)`, real 4-bucket token counts, `computeCostUsd` result, ISO timestamp; `await appendTrace(entry)` before returning
- `SCORE_POST` handler catch: appends error trace (tokens 0, costUsd 0, `error` message); API key never placed in any TraceEntry field

**Task 3 — rederiveSelector trace recording (TRACE-02 / D-02 / D-03):**
- Same `usage` cast widening in `rederiveSelector`
- Success path (after schema validation): builds `TraceEntry` with `source: 'rederiver'`, `model: 'claude-haiku-4-5-20251001'`, full `REDERIVE_SYSTEM_PROMPT`, `userContent.slice(0, 500)`, real tokens, `computeCostUsd`, ISO timestamp; `await appendTrace(entry)`
- No-key early return in REDERIVE_SELECTOR handler: appends error trace (D-03)
- Handler `catch` (HTTP errors, schema-validation exhaustion): appends error trace
- Rate-limit early returns (latch held, cool-off, daily cap): no trace — no Anthropic request made

### src/background/trace.test.ts (new)

5-case handler test suite using same `messageListener`-capture + `makeChrome` + `fetchMock` harness as ratelimit.test.ts:

1. **SCORE_POST success trace (TRACE-01):** asserts source='detector', non-zero tokens matching mocked usage, costUsd > 0, no error field
2. **REDERIVE_SELECTOR success trace (TRACE-02):** seeds rate-limit state to allow the call; asserts source='rederiver', costUsd > 0
3. **SCORE_POST failure trace (D-03):** fetch returns 401; asserts trace with error, inputTokens=0, costUsd=0
4. **API-key absence (T-24-04):** seeded `anthropicApiKey` string does not appear in `JSON.stringify(store.llbTraces)`
5. **FIFO cap (TRACE-03):** 501 sequential SCORE_POST calls; asserts `store.llbTraces.length === 500`

### src/background/ratelimit.test.ts (modified)

Auto-fix updates required by new code:
- `makeChrome()`: added `onStartup: { addListener: vi.fn() }` (Task 1 added `chrome.runtime.onStartup`)
- `okResponse()`: added `usage: { input_tokens: 100, output_tokens: 50, ... }` to mock response body (Task 3's success-path code reads `data.usage`)

## Test Results

```
Test Files  2 passed (2)
     Tests  14 passed (14)
             - trace.test.ts:    5 tests (detector trace, rederiver trace, error trace, key-absence, FIFO cap)
             - ratelimit.test.ts: 9 tests (unchanged behavior — all pass after harness fix)

src/content/detector: 7 files / 81 tests passed (no regression)
npx tsc --noEmit: exits 0
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] ratelimit.test.ts harness missing onStartup and usage**
- **Found during:** Task 3 (running ratelimit.test.ts after committing Task 1 + Task 3 changes)
- **Issue:** Task 1 added `chrome.runtime.onStartup.addListener` — `makeChrome()` in ratelimit.test.ts had no `onStartup` property, causing `TypeError: Cannot read properties of undefined (reading 'addListener')`. Additionally, `okResponse()` returned `{ content: [...] }` without a `usage` field; Task 3's rederiver success path reads `data.usage`, causing parse failures on the 2nd retry path.
- **Fix:** Added `onStartup: { addListener: vi.fn() }` to `makeChrome()` and added minimal `usage` object to `okResponse()`
- **Files modified:** src/background/ratelimit.test.ts
- **Commit:** 799093f

## Threat Surface Scan

No new network endpoints, auth paths, or schema changes. The `appendTrace` calls in `index.ts` write to `llbTraces` in `chrome.storage.local` — same trust boundary as all other storage writes in this project. T-24-04 verified: grep for `anthropicApiKey` / `apiKey` / the key variable in TraceEntry field assignments returns no matches.

## Self-Check: PASSED

- src/background/index.ts modified: imports appendTrace, computeCostUsd, MODEL_PRICING, storageSet, TraceEntry
- Both onInstalled and onStartup write llbModelPricing unconditionally
- scorePost: usage cast widened; success trace appended; SCORE_POST catch appends error trace
- rederiveSelector: usage cast widened; success trace appended (after schema validation)
- REDERIVE_SELECTOR handler: no-key appends error trace; catch appends error trace; rate-limit returns do NOT append
- src/background/trace.test.ts exists with 5 tests — all pass
- Commits exist: a8c5ef4, 3f37c29, 799093f
- `npx vitest run src/background/trace.test.ts src/background/ratelimit.test.ts` — 14/14 pass
- `npx vitest run src/content/detector` — 81/81 pass
- `npx tsc --noEmit` exits 0
