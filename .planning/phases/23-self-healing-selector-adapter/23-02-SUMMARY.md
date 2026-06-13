---
phase: 23-self-healing-selector-adapter
plan: 02
subsystem: selector-adaptation
tags: [heuristic, selector-registry, dom-walking, confidence-ordering, jsdom]

requires:
  - phase: 23-01
    provides: validateCandidate gate (heal proof) + SelectorCandidate/CandidateSource types
provides:
  - "deriveHeuristicCandidates(target, container) — local no-API selector re-deriver (ADAPT-02)"
  - "SelectorRegistry.insertCandidate(target, value, source) — prepend-winner + retain-prior write surface (ADAPT-07)"
  - "candidateConfidence(c) — match×recency×source ordering helper (ADAPT-08)"
affects: [23-04, heal-orchestrator]

tech-stack:
  added: []
  patterns:
    - "Heuristic DOM-walk grouping by tagName[attrName] for data-*/componentkey analogs"
    - "insertCandidate is the sole new selector write surface (CLAUDE.md #1), single storageSet"

key-files:
  created:
    - src/content/selector/heuristic.ts
    - src/content/selector/heuristic.test.ts
  modified:
    - src/content/selector-registry.ts
    - src/content/selector-registry.test.ts

key-decisions:
  - "Salvaged the heuristic.ts/test produced by the stalled subagent; fixed a JSDoc `*/` premature-comment-close (data-*/role) that broke the oxc parser, then verified against the suite."
  - "Built an in-memory chrome.storage.local mock in selector-registry.test.ts (no prior chrome mock existed); assertions read the persisted store written by insertCandidate."

patterns-established:
  - "Confidence = (matchCount+1)×recency×sourceWeight, recency 0.3 when never matched, seed<heuristic<llm<user"
  - "insertCandidate unshift prepends new + retains prior active at index 1; 10-cap never evicts seed"

requirements-completed: [ADAPT-02, ADAPT-07, ADAPT-08]

duration: ~12min (inline, post-subagent-recovery)
completed: 2026-06-13
---

# Phase 23 Plan 02: Heuristic re-deriver + registry insert/ordering Summary

**Local DOM-walking heuristic re-deriver that heals class-rot to data-* selectors, plus SelectorRegistry.insertCandidate (prepend-winner/retain-prior/10-cap) and candidateConfidence match×recency×source ordering.**

## Performance

- **Duration:** ~12 min (executed inline after the assigned subagent stalled without Bash access)
- **Completed:** 2026-06-13T21:10Z
- **Tasks:** 2
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments
- `deriveHeuristicCandidates('POST_CARD'|'POST_BODY_TEXT', container)` walks the feed container, groups children by `tagName[data-*]`/`[componentkey]`, ranks by `confidence=(matchCount/20)*0.8`, adds a `[role="article"]` fallback (0.7), reads the broken selector via `resolve()` (no inline literals), writes no storage, emits no class/id tokens. Top class-rot candidate proven to pass `validateCandidate` (cross-module heal).
- `SelectorRegistry.insertCandidate(target, value, source)` — sole new selector write surface; prepends a brand-new validated candidate at index 0, retains the prior active at index 1, dedups by delegating to `updateCandidate`, enforces the 10-cap without evicting seed, single `storageSet`.
- `candidateConfidence(c)` — `(matchCount+1)×recency×sourceWeight`, recency decays to a 0.1 floor over 30 days (0.3 when never matched), source weights seed 0.6 < heuristic 0.8 < llm 0.9 < user 1.0.

## Task Commits

1. **Task 1: Heuristic re-deriver** - `7e9527f` (feat) — 22 tests
2. **Task 2: insertCandidate + candidateConfidence** - `6a87c59` (feat) — 12 tests

## Files Created/Modified
- `src/content/selector/heuristic.ts` - `deriveHeuristicCandidates` + `HeuristicCandidate`
- `src/content/selector/heuristic.test.ts` - 22 cases incl. class-rot heal proof, D6, filter bounds, edge cases
- `src/content/selector-registry.ts` - added `insertCandidate` + exported `candidateConfidence` + `SOURCE_WEIGHTS`
- `src/content/selector-registry.test.ts` - in-memory chrome.storage mock + 12 cases

## Decisions Made
- Salvaged the stalled subagent's Task-1 output rather than rewrite it; the only defect was a `*/` inside a JSDoc line (`data-*/role`) that closed the block comment early and broke vitest's oxc transform — rephrased to `data-attribute / role`.
- selector-registry.test.ts had only a placeholder; built a reusable in-memory `chrome.storage.local` mock and assert on the persisted store (since `_cache` is module-private).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] JSDoc premature comment close in heuristic.ts**
- **Found during:** Task 1 (running the heuristic suite)
- **Issue:** `data-*/role` inside the file-header JSDoc contained `*/`, closing the comment early; oxc failed to parse the file and 0 tests ran.
- **Fix:** Rephrased to `data-attribute / role` (mirrors the 23-01 em-dash-in-JSDoc fix).
- **Files modified:** src/content/selector/heuristic.ts
- **Verification:** `npx vitest run src/content/selector/heuristic.test.ts` → 22 passed.
- **Committed in:** 7e9527f (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Fix required to run any test; no scope change.

## Issues Encountered
- The assigned executor subagent could not acquire Bash permission in the background worktree and stalled. Recovered by stopping it, removing its worktree, and completing the plan inline on master (per user direction). See phase-level note.

## Next Phase Readiness
- 23-04's heal orchestrator can now call `deriveHeuristicCandidates` → `validateCandidate` → `insertCandidate`.
- Confidence ordering available for any future re-sort of candidate lists.

---
*Phase: 23-self-healing-selector-adapter*
*Completed: 2026-06-13*
