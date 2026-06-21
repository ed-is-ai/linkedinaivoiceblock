---
phase: 23-self-healing-selector-adapter
plan: 03
subsystem: service-worker
tags: [anthropic, claude-haiku, rate-limit, mv3-service-worker, fetch, single-flight]

requires:
  - phase: 23-01
    provides: four llbRederive* StorageSchema keys + buildDomSkeleton sanitizer (caller side)
provides:
  - "rederiveSelector() — Haiku 4.5 selector re-derivation with schema-validated response (ADAPT-03/06)"
  - "checkRateLimit/acquireRateLimitLatch/releaseRateLimitLatch — persisted single-flight + cool-off + daily cap (ADAPT-05)"
  - "REDERIVE_SELECTOR onMessage branch"
  - "LLMRederiver content-script sender (mirrors LLMDetector)"
affects: [23-04, heal-orchestrator]

tech-stack:
  added: []
  patterns:
    - "Rate-limit state read fresh from storage each SW invocation; latch written before fetch (survives restart)"
    - "Hand-written type guard (isRederiveModelOutput) instead of a runtime validation library"

key-files:
  created:
    - src/background/ratelimit.test.ts
    - src/content/detector/rederiver.ts
  modified:
    - src/background/index.ts

key-decisions:
  - "Used the correct storage-key spelling llbRederiveDateKey (matches StorageSchema from 23-01), NOT the misspelled llbRedeiveDateKey shown in RESEARCH snippets, per plan acceptance gate."
  - "Model id is the dated claude-haiku-4-5-20251001 (plan must_have) rather than the AI-SPEC's unversioned claude-haiku-4-5."
  - "Rate-limit functions are module-private; tested through the real REDERIVE_SELECTOR onMessage handler by capturing the listener at import and seeding storage state per scenario (no fake timers)."

patterns-established:
  - "checkRateLimit returns todayKey/callsToday so acquire needs no second storage read"
  - "handler: checkRateLimit -> acquire latch -> rederiveSelector -> respond -> finally release -> return true"

requirements-completed: [ADAPT-03, ADAPT-05, ADAPT-06]

duration: ~18min (inline)
completed: 2026-06-13
---

# Phase 23 Plan 03: Service-worker LLM fallback Summary

**rederiveSelector calls Claude Haiku 4.5 (max_tokens 256) only after a persisted single-flight/cool-off/daily-cap rate check passes, validates the response through a type guard, and returns selector strings as unevaluated data; LLMRederiver is the content-script message sender.**

## Performance

- **Duration:** ~18 min (executed inline)
- **Completed:** 2026-06-13T22:30Z
- **Tasks:** 2
- **Files modified:** 3 (2 created, 1 modified)

## Accomplishments
- `rederiveSelector(target, domSkeleton)` mirrors `scorePost`'s fetch shape — model `claude-haiku-4-5-20251001`, `max_tokens: 256`, `REDERIVE_SYSTEM_PROMPT` (with GOOD/BAD examples) in a cache-controlled system block, `stop_sequences: ['\n\n\n']` — strips markdown fences, validates with `isRederiveModelOutput`, retries parse/schema failures once (2 attempts), surfaces HTTP 401/429 immediately.
- Persisted rate-limit guard: `checkRateLimit` (single-flight latch / 5-min cool-off / daily cap 5 with UTC date rollover), `acquireRateLimitLatch` (writes latch + count + last-call time BEFORE fetch), `releaseRateLimitLatch` (in `finally`). All state in `chrome.storage.local` → survives SW restart.
- `REDERIVE_SELECTOR` onMessage branch: rate-check → acquire → rederive → `{ result }` / `.catch` `{ error }` / `.finally` release → `return true`.
- `LLMRederiver.rederive()` content-script sender mirroring `LLMDetector` — no fetch (CORS lives in SW).

## Task Commits

1. **Task 1: rederiveSelector + rate-limit + handler** - `6b9a096` (feat) — 9 D8 tests
2. **Task 2: LLMRederiver sender** - `8a98b58` (feat)

## Files Created/Modified
- `src/background/index.ts` - REDERIVE_SYSTEM_PROMPT, isRederiveModelOutput, checkRateLimit/acquire/release, rederiveSelector, REDERIVE_SELECTOR branch
- `src/background/ratelimit.test.ts` - in-memory chrome.storage + mocked fetch; latch/cool-off/cap/restart/no-key/retry/ADAPT-06 cases
- `src/content/detector/rederiver.ts` - LLMRederiver class + RederiveCandidate

## Decisions Made
- Correct key spelling `llbRederiveDateKey` everywhere (RESEARCH snippets had a typo); enforced by the plan's grep gate.
- Tested via the real onMessage handler (functions are SW-private) rather than exporting internals — drove scenarios by seeding storage, avoiding fake-timer/microtask fragility.

## Deviations from Plan
None — plan executed as written (model id and key spelling followed the plan's explicit must_haves over the looser RESEARCH/AI-SPEC text).

## Issues Encountered
- The assigned executor subagent could not acquire Bash in the background worktree; completed inline on master per user direction (same as 23-02). See phase-level note.

## Next Phase Readiness
- 23-04's heal orchestrator can call `new LLMRederiver().rederive(target, skeleton)` on a sanitized skeleton, then validate each returned candidate and `insertCandidate` the first that passes.
- Rate-bounding fully enforced server-side (SW); the content side only needs its own per-tab heal lock.

---
*Phase: 23-self-healing-selector-adapter*
*Completed: 2026-06-13*
