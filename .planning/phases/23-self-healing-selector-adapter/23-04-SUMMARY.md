---
phase: 23-self-healing-selector-adapter
plan: 04
subsystem: selector-adaptation
tags: [observer, mutationobserver, self-healing, jsdom-fixtures, breakage-detection]

requires:
  - phase: 23-01
    provides: validateCandidate gate + buildDomSkeleton sanitizer
  - phase: 23-02
    provides: deriveHeuristicCandidates + insertCandidate
  - phase: 23-03
    provides: LLMRederiver content-script sender
provides:
  - "triggerHeal orchestrator (heuristic -> validate -> insert; LLM fallback -> validate -> insert)"
  - "Core-4 breakage detection wired into observer.ts MutationObserver + reinit reset (ADAPT-01)"
  - "isFeedUrl + hasFeedContainer stateless guards"
  - "10 jsdom DOM fixtures + heal.test.ts (ADAPT-09)"
affects: [dashboard-health-view, future-selector-targets]

tech-stack:
  added: []
  patterns:
    - "30s rolling zero-match window + session-activity guard + content-side single-flight/cool-off"
    - "Heal orchestrator isolated from observer state (heal.ts pure-ish; observer owns window/session state)"

key-files:
  created:
    - src/content/selector/heal.ts
    - src/content/selector/heal.test.ts
    - "src/content/selector/__fixtures__/*.html (10 fixtures)"
  modified:
    - src/content/observer.ts

key-decisions:
  - "Per the plan frontmatter artifacts, triggerHeal + isFeedUrl + hasFeedContainer live in heal.ts (exported) and observer.ts imports them — overriding RESEARCH Open-Question #2's suggestion to keep triggerHeal inside observer.ts."
  - "Added a 5s safety setInterval in addition to the MutationObserver-callback check so the 30s breakage window can elapse on a fully static (mutation-stopped) broken feed."
  - "Content-side HEAL_COOLOFF_MS=60s + _healInProgress single-flight; the service worker (23-03) remains the authoritative per-day/cool-off enforcer."

patterns-established:
  - "checkBreakage(): zero POST_BODY_TEXT in container -> onZeroPostsFound; any posts -> reset window"
  - "Heal tests mock leaf modules (heuristic/rederiver/registry/storage), keep real validator+sanitizer"

requirements-completed: [ADAPT-01, ADAPT-09]

duration: ~40min (inline, includes plan-truncation recovery)
completed: 2026-06-13
---

# Phase 23 Plan 04: Breakage detection + heal orchestrator Summary

**Guarded Core-4 breakage detection in the observer that, after a sustained 30s zero-match window on an active feed, runs the full self-healing loop (heuristics -> validate -> insert, then LLM fallback on a sanitized skeleton), with a 10-fixture jsdom harness.**

## Performance

- **Duration:** ~40 min (executed inline, including reconstruction of a truncated plan)
- **Completed:** 2026-06-13T23:05Z
- **Tasks:** 3 (fixtures, heal.ts, observer wiring + tests)
- **Files modified:** 13 (12 created, 1 modified)

## Accomplishments
- `heal.ts` `triggerHeal(container)` integrates every prior artifact: heuristic candidates (23-02) validated (23-01) and written via `insertCandidate` (23-02); on heuristic miss + configured API key, the LLM fallback (23-03) runs on `buildDomSkeleton` output (23-01) with each returned candidate re-validated. No write before `validateCandidate` passes; selectors never eval'd.
- `observer.ts` Core-4 detector (ADAPT-01): `isFeedUrl`, `hasFeedContainer`, `hasSessionActivity (>=3)`, and a 30s rolling zero-match window, evaluated after each mutation batch and on a 5s safety interval; content-side single-flight + 60s cool-off. State resets on SPA navigation in `reinit()`.
- 10 jsdom fixtures + `heal.test.ts` (8 cases): D3 write-gate, D5 heal-to-wrong rejection, D7 guard suppression, LLM-only-with-key, and a D4 cross-check proving only the PII-stripped skeleton is sent to the LLM.

## Task Commits

1. **Task 1: DOM fixtures** - `49a2932` (feat)
2. **Task 2: heal orchestrator** - `c0b5c01` (feat)
3. **Task 3: observer wiring + heal tests** - `45e13c7` (feat) — 8 tests; full suite 228 green

## Files Created/Modified
- `src/content/selector/heal.ts` - triggerHeal + isFeedUrl + hasFeedContainer
- `src/content/observer.ts` - breakage state, onPostFound/onZeroPostsFound/checkBreakage, MutationObserver + interval wiring, reinit reset
- `src/content/selector/heal.test.ts` - orchestration + guard tests
- `src/content/selector/__fixtures__/*.html` - 10 fixtures (healthy, class-rot, skeleton, logged-out, empty, job-cards, promoted, ab-variant-a/b, pii-rich)

## Decisions Made
- triggerHeal extracted to heal.ts (frontmatter artifact contract) rather than kept in observer.ts.
- Safety `setInterval` complements the mutation-callback check so a static broken feed still trips the 30s window.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Incomplete Plan] 23-04-PLAN.md was truncated mid-Task-1**
- **Found during:** Reading the plan before execution
- **Issue:** The plan file ends at line 88 inside Task 1's `<verify>` block — Tasks 2 (heal.ts) and 3 (observer wiring + heal.test.ts), the threat model, and success criteria were never written (planning-phase truncation defect).
- **Fix:** Reconstructed Tasks 2/3 from the *complete* frontmatter contract (`must_haves.truths`, `artifacts`, `key_links`), the `<objective>`, and 23-RESEARCH.md (Breakage Detection Wiring, Core-4 guards, heal orchestrator Pattern 3). All four `must_haves.truths` and both `key_links` are satisfied and verified by tests.
- **Verification:** type-check clean; 228/228 tests; key-link greps (`observer -> triggerHeal`, `heal -> validateCandidate/insertCandidate`) pass.
- **Committed in:** 49a2932 / c0b5c01 / 45e13c7

---

**Total deviations:** 1 (incomplete upstream plan, reconstructed from the authoritative frontmatter + research).
**Impact on plan:** No scope change — built exactly what the frontmatter contract specified. Recommend re-running the planner if a fully-written 23-04-PLAN.md prose is wanted for the record.

## Issues Encountered
- Plan truncation (above). Also: the assigned executor subagent could not acquire Bash in the background worktree (same environment limitation that affected 23-02/23-03); the entire wave was completed inline on master per user direction.
- heal.test.ts LLMRederiver mock initially used an arrow function (not constructable) — switched to a regular function so `new LLMRederiver()` returns the mocked instance.

## Next Phase Readiness
- The self-healing loop is fully wired end-to-end: observer detects breakage -> heuristics -> validate -> insertCandidate -> (LLM fallback) -> validate -> insertCandidate.
- Live LLM path with a real API key remains a manual verification item (ADAPT-09 notes the live-key path is manual).
- Note for verification: the truncated 23-04-PLAN.md should be regenerated or annotated.

---
*Phase: 23-self-healing-selector-adapter*
*Completed: 2026-06-13*
