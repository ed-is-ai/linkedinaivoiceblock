---
phase: 33-improve-modularity
plan: "01"
subsystem: modularity-refactor
tags: [refactor, modularity, tool-migration, barrel-deletion, file-relocation]
dependency_graph:
  requires: []
  provides: [MOD-01, MOD-02]
  affects: [src/content/detector, src/content/selector, src/tools/library/dom-selector-rederive, src/tools/library/dom-selector-registry]
tech_stack:
  added: []
  patterns: [skill-owned-logic, tool-co-location, no-barrel-re-exports, tool-convention-TOOL.md]
key_files:
  created:
    - src/tools/library/dom-selector-rederive/rederiver.ts
    - src/tools/library/dom-selector-rederive/heal.ts
    - src/tools/library/dom-selector-rederive/heuristic.ts
    - src/tools/library/dom-selector-rederive/sanitizer.ts
    - src/tools/library/dom-selector-rederive/validator.ts
    - src/tools/library/dom-selector-rederive/heal.test.ts
    - src/tools/library/dom-selector-rederive/heuristic.test.ts
    - src/tools/library/dom-selector-rederive/sanitizer.test.ts
    - src/tools/library/dom-selector-rederive/validator.test.ts
    - src/tools/library/dom-selector-rederive/__fixtures__/ (10 feed-*.html files)
    - src/tools/library/dom-selector-registry/TOOL.md
    - src/tools/library/dom-selector-registry/dom-selector-registry.tool.ts
  modified:
    - src/content/index.ts
    - src/content/observer.ts
    - src/content/detector/heuristic.test.ts
    - scripts/eval.ts
    - src/dashboard/evals.tsx
  deleted:
    - src/content/detector/heuristic.ts (barrel)
    - src/content/detector/llm.ts (barrel)
    - src/content/detector/rederiver.ts (moved)
    - src/content/selector/ (entire directory — moved to tool folder)
    - src/tools/library/dom-selector-registry/SKILL.md (renamed)
    - src/tools/library/dom-selector-registry/dom-selector-registry.skill.ts (renamed)
decisions:
  - D-02: thin re-export barrels (heuristic.ts, llm.ts) deleted; importers repointed directly to skill folders
  - D-04: all selector internals co-located in dom-selector-rederive tool folder (not registry)
  - D-03: dom-selector-registry uses TOOL.md + .tool.ts (no SKILL.md / .skill.ts)
  - heuristic.test.ts kept at src/content/detector/ path (not moved to skill folder) per RESEARCH Open Question 1
metrics:
  duration: 531s
  completed: "2026-06-17"
  tasks: 3
  files_changed: 30
requirements_satisfied: [MOD-01, MOD-02]
---

# Phase 33 Plan 01: Detector Migration + Selector Co-location + Registry Rename Summary

**One-liner:** Delete HeuristicDetector/LLMDetector re-export barrels and repoint importers to skill folders; move LLMRederiver + four selector internals (+ tests + fixtures) into dom-selector-rederive tool folder; rename dom-selector-registry SKILL.md → TOOL.md and .skill.ts → .tool.ts.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Delete heuristic.ts/llm.ts barrels; repoint importers to skill folders | b3ddfb0 | src/content/detector/{heuristic.ts,llm.ts} deleted; index.ts, eval.ts, evals.tsx, heuristic.test.ts repointed |
| 2 | Move rederiver + selector internals into dom-selector-rederive tool folder | c750717 | 5 impl files + 4 test files + 10 fixtures moved; observer.ts repointed |
| 3 | Rename dom-selector-registry SKILL.md → TOOL.md and .skill.ts → .tool.ts | 37887ee | TOOL.md + dom-selector-registry.tool.ts; stale-checks clean |

## Verification

- `npm run type-check` — exit 0 after each task
- `npm test` — 36 test files / 433 tests pass (detection golden-score snapshot + exclusion parity byte-identical)
- `npm run check-skill-registry && npm run check-tool-registry` — exit 0 (Task 3)

## Deviations from Plan

None — plan executed exactly as written. All import paths match the exact target strings from 33-PATTERNS.md.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced. This was a pure file-relocation refactor. `src/content/selector-registry.ts` (CLAUDE.md #1 single-writer) untouched and byte-identical.

## Self-Check

Files created/moved (checked):
- `src/tools/library/dom-selector-rederive/rederiver.ts` — FOUND
- `src/tools/library/dom-selector-rederive/heal.ts` — FOUND
- `src/tools/library/dom-selector-rederive/heuristic.ts` — FOUND
- `src/tools/library/dom-selector-rederive/sanitizer.ts` — FOUND
- `src/tools/library/dom-selector-rederive/validator.ts` — FOUND
- `src/tools/library/dom-selector-registry/TOOL.md` — FOUND
- `src/tools/library/dom-selector-registry/dom-selector-registry.tool.ts` — FOUND

Commits verified:
- b3ddfb0 — FOUND
- c750717 — FOUND
- 37887ee — FOUND

## Self-Check: PASSED
