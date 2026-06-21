---
phase: 34-manual-self-healing-trigger-from-dashboard
plan: "03"
subsystem: content-script-heal-listener
tags: [heal, message-listener, single-flight, guard, onMessage]
dependency_graph:
  requires: [34-02]
  provides: [requestGuardedHeal, liveFeedContainer, TRIGGER_HEAL-listener]
  affects: [34-04]
tech_stack:
  added: []
  patterns: [single-flight-guard, exported-entry-point, onMessage-discriminated-listener]
key_files:
  created: []
  modified:
    - src/content/observer.ts
    - src/content/index.ts
decisions:
  - "requestGuardedHeal is the single guarded entry; both automatic (onZeroPostsFound) and manual (TRIGGER_HEAL listener) callers use it — no duplicate latches"
  - "liveFeedContainer() exported as-is (not a wrapper) since the existing function already satisfies D-09 (fresh DOM resolution, no captured ref)"
  - "onMessage listener cast with (message: unknown) to safely discriminate on message?.type without trusting runtime shape"
metrics:
  duration: "~5m"
  completed: "2026-06-21"
  tasks: 2
  files: 2
---

# Phase 34 Plan 03: Content-Script TRIGGER_HEAL Listener Summary

Unified the automatic and manual heal paths under a single exported guarded entry in observer.ts, and wired the first `chrome.runtime.onMessage` listener in the content script to handle `TRIGGER_HEAL` messages from the dashboard.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Extract requestGuardedHeal + export liveFeedContainer from observer.ts | 0a491f9 | src/content/observer.ts |
| 2 | Add TRIGGER_HEAL onMessage listener in content/index.ts | d01c9dd | src/content/index.ts |

## What Was Built

**Task 1 — `src/content/observer.ts`:** Refactored the inline single-flight + cool-off latch out of `onZeroPostsFound` into a single exported `requestGuardedHeal(container: Element): Promise<HealOutcome[] | null>`. The function checks `_healInProgress` and `_lastHealMs`/`HEAL_COOLOFF_MS`, sets the latch, awaits `triggerHeal(container)` in a `try/finally`, and clears `_healInProgress` on completion. Returns `null` when the guard declines entry so callers can map that to the `HEAL_BUSY` sentinel. Also exported `liveFeedContainer()` (the existing private function) so the content listener can re-resolve the live container fresh at receive time (D-09). `onZeroPostsFound` now calls `requestGuardedHeal(container).catch(() => {})` — the inline `triggerHeal(...).finally(...)` latch is gone.

**Task 2 — `src/content/index.ts`:** Registered a `chrome.runtime.onMessage.addListener` at module top level (mirroring the existing `chrome.storage.onChanged` listener placement). The handler discriminates strictly on `message?.type === TRIGGER_HEAL`; unrecognized types `return false` immediately with no side effects (T-34-06). For TRIGGER_HEAL: re-resolves the live container via `liveFeedContainer()` (null → `{ error: 'no live feed container' }`), then calls `requestGuardedHeal(container)`. Null result → `sendResponse({ error: HEAL_BUSY })` using the imported constant (not a string literal). Resolved outcomes → `sendResponse({ result: outcomes })`. Caught pipeline errors → `sendResponse({ error: err.message })`. Returns `true` for the async branch to keep the chrome messaging channel open. Never calls `insertCandidate`/`validateCandidate` directly (T-34-07); never captures the container before the message arrives (T-34-09); never starts a second heal while one is running (T-34-08).

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. No placeholder data or stub values introduced.

## Threat Flags

None. All four STRIDE mitigations from the plan's threat register are in place:
- T-34-06: strict `message?.type === TRIGGER_HEAL` discrimination; unknown types return false with no side effects.
- T-34-07: listener calls only `requestGuardedHeal` → `triggerHeal`; selector writes stay behind the validate-before-write gate inside the heal pipeline.
- T-34-08: single shared `_healInProgress`/cool-off latch in `requestGuardedHeal`; busy guard responds `{ error: HEAL_BUSY }` without starting a concurrent heal.
- T-34-09: `liveFeedContainer()` re-resolved fresh at receive time; null → `{ error }`, never a captured reference.

## Self-Check: PASSED

- src/content/observer.ts: FOUND — exports `requestGuardedHeal` and `liveFeedContainer`; `_healInProgress`/`_lastHealMs` declared exactly once (module-private); `onZeroPostsFound` no longer has inline `triggerHeal(...).finally(...)` latch
- src/content/index.ts: FOUND — registers exactly one `chrome.runtime.onMessage.addListener`; TRIGGER_HEAL branch responds with `{ error: HEAL_BUSY }` for busy case; calls `liveFeedContainer()` and `requestGuardedHeal()`; does not import `triggerHeal` directly
- Commit 0a491f9: extract guarded entry from observer.ts
- Commit d01c9dd: TRIGGER_HEAL listener in content/index.ts
- npm run type-check: 0 errors
- npm test: 440/440 passed
