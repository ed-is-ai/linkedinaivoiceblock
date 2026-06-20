---
phase: 34-manual-self-healing-trigger-from-dashboard
plan: "02"
subsystem: heal-pipeline
tags: [heal, message-contract, multi-target, tdd]
dependency_graph:
  requires: [34-01]
  provides: [heal-messages-contract, generalized-triggerHeal]
  affects: [34-03, 34-04]
tech_stack:
  added: []
  patterns: [live-staleness-probe, shape-based-routing, per-target-try-catch]
key_files:
  created:
    - src/shared/heal-messages.ts
  modified:
    - src/tools/library/dom-selector-rederive/heal.ts
    - src/tools/library/dom-selector-rederive/heal.test.ts
decisions:
  - "Staleness computed live via resolve(target) + container.querySelector/matches; no dependency on dead selectorSessionMisses/recordMiss signal"
  - "HEAL_BUSY sentinel uses { error: HEAL_BUSY } response shape (not { result: [] }) so busy is distinguishable from nothing-stale"
  - "storageGet for API key called once per triggerHeal invocation, shared across all sub-element targets"
  - "Per-target try/catch for LLM path: one target failure records 'failed' and continues rather than aborting the loop"
metrics:
  duration: "~8m"
  completed: "2026-06-21"
  tasks: 2
  files: 3
---

# Phase 34 Plan 02: Generalize Heal Pipeline + Pin Message Contract Summary

Generalized `triggerHeal` from POST_CARD-only to all live-stale DOM-healable targets, and pinned the `TRIGGER_HEAL` dashboard↔content message contract with a dedicated busy sentinel in one shared module.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Pin TRIGGER_HEAL message contract + HealOutcome type + busy sentinel | 8ada7b0 | src/shared/heal-messages.ts |
| 2 (RED) | Add failing tests for generalized multi-target triggerHeal | 96a6f61 | src/tools/library/dom-selector-rederive/heal.test.ts |
| 2 (GREEN) | Generalize triggerHeal to heal all live-stale targets | a1b0eec | src/tools/library/dom-selector-rederive/heal.ts, heal.test.ts |

## What Was Built

**Task 1 — `src/shared/heal-messages.ts`:** Pure constants-and-types module importable from any extension context. Exports `TRIGGER_HEAL` (message type discriminator), `HEAL_BUSY` (busy/cool-off sentinel), `HealResult` ('healed' | 'unchanged' | 'failed'), `HealOutcome` ({ target: SelectorTarget; result: HealResult }), `TriggerHealMessage`, and `TriggerHealResponse`. The module's doc comment explicitly pins the busy/cool-off convention: `{ error: HEAL_BUSY }` (not `{ result: [] }`) so Plan 03 (responder) and Plan 04 (sender) agree without divergence.

**Task 2 — generalized `triggerHeal`:** Changed return type from `Promise<void>` to `Promise<HealOutcome[]>`. Builds the heal set live at heal time via `resolve(target)` + `container.querySelector` / `container.matches` staleness probes — no dependency on the dead `selectorSessionMisses` signal (`recordMiss` has zero runtime call sites). Card-shaped targets (`POST_CARD`, `POST_BODY_TEXT`) route to `deriveHeuristicCandidates`; sub-element targets route to `LLMRederiver.rederive` (degrades to `'unchanged'` when no API key). `COMPANY_PAGE_MARKER` and `POST_URN_ATTR` excluded from the DOM-healable set (D-05). Per-target try/catch ensures one LLM target failure records `'failed'` and continues. Validate-before-write gate preserved: every `insertCandidate` call is guarded by a `validateCandidate(.pass)` check.

## TDD Gate Compliance

- RED commit `96a6f61`: 7 new failing tests (old 8 still passing)
- GREEN commit `a1b0eec`: all 15 heal tests pass; full suite 440/440 green

## Deviations from Plan

**1. [Rule 1 - Bug] Updated legacy test expectations to match new multi-target behavior**
- Found during: Task 2 GREEN phase
- Issue: Existing tests assumed `rederiveMock.toHaveBeenCalledTimes(1)` (single-target) and `storageGet` not called when heuristics succeed (now always called for sub-element targets)
- Fix: Updated assertions to reflect multi-target behavior — `toHaveBeenCalled()` instead of `toHaveBeenCalledTimes(1)`, removed stale `storageGet` not-called assertion
- Files modified: src/tools/library/dom-selector-rederive/heal.test.ts (included in GREEN commit a1b0eec)

## Known Stubs

None. No placeholder data or stub values introduced.

## Threat Flags

None. The validate-before-write gate (T-34-03) is preserved: every `insertCandidate` call is preceded by a `validateCandidate(.pass)` check. Per-target try/catch satisfies T-34-05 (one target failure does not abort others). No new trust boundary surfaces introduced.

## Self-Check: PASSED

- src/shared/heal-messages.ts: FOUND
- src/tools/library/dom-selector-rederive/heal.ts: FOUND (generalized)
- src/tools/library/dom-selector-rederive/heal.test.ts: FOUND (15 tests)
- Commit 8ada7b0: pinned contract
- Commit 96a6f61: RED tests
- Commit a1b0eec: GREEN implementation
- npm run type-check: 0 errors
- npm test: 440/440 passed
