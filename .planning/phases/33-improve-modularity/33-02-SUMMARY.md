---
phase: 33-improve-modularity
plan: "02"
subsystem: modularity-refactor
tags: [refactor, modularity, shared-regroup, file-relocation, import-repoint]
dependency_graph:
  requires:
    - phase: 33-improve-modularity/33-01
      provides: [dom-selector-rederive tool folder with heal.ts already at new path]
  provides: [MOD-04]
  affects: [src/shared/memory, src/shared/llm, src/background, src/content, src/dashboard, src/tools/library/dom-selector-rederive, src/shared/eval, scripts]
tech_stack:
  added: []
  patterns: [concern-based-subfolder-grouping, sibling-relative-imports-preserved-on-co-move]
key_files:
  created:
    - src/shared/memory/storage.ts
    - src/shared/memory/postStore.ts
    - src/shared/memory/postStore.test.ts
    - src/shared/memory/queue.ts
    - src/shared/memory/traceStore.ts
    - src/shared/memory/traceStore.test.ts
    - src/shared/llm/pricing.ts
    - src/shared/llm/pricing.test.ts
    - src/shared/llm/signals.ts
  modified:
    - src/background/index.ts
    - src/content/index.ts
    - src/content/selector-registry.ts
    - src/content/skill-registry.ts
    - src/dashboard/index.tsx
    - src/dashboard/evalsLabeling.ts
    - src/dashboard/evals.test.ts
    - src/dashboard/evals.tsx
    - src/tools/library/dom-selector-rederive/heal.ts
    - src/tools/library/dom-selector-rederive/heal.test.ts
    - src/shared/eval/evalRunStore.ts
    - scripts/eval.ts
    - scripts/trace-summary.ts
  deleted:
    - src/shared/storage.ts (moved to memory/)
    - src/shared/postStore.ts (moved to memory/)
    - src/shared/postStore.test.ts (moved to memory/)
    - src/shared/queue.ts (moved to memory/)
    - src/shared/traceStore.ts (moved to memory/)
    - src/shared/traceStore.test.ts (moved to memory/)
    - src/shared/pricing.ts (moved to llm/)
    - src/shared/pricing.test.ts (moved to llm/)
    - src/shared/signals.ts (moved to llm/)
key-decisions:
  - "D-06: memory/ and llm/ folder names are locked by CONTEXT.md; types.ts, tool-registry.ts, generated-tool-registry.ts stay at src/shared/ root"
  - "evalRunStore.ts (src/shared/eval/) also imported from ../storage — updated to ../memory/storage (not in plan's importer list but caught by type-check)"
patterns-established:
  - "When multiple files move into the same new subfolder, sibling relative imports (e.g. from './storage') need no update"
  - "types.ts stays at src/shared/ root; memory/ and llm/ modules reach it via '../types'"
requirements-completed: [MOD-04]
duration: 18min
completed: "2026-06-17"
tasks: 2
files_changed: 22
---

# Phase 33 Plan 02: src/shared/ Regroup — memory/ + llm/ Clusters Summary

**Regrouped src/shared/ by concern: storage cluster (postStore, queue, storage, traceStore + tests) into memory/, LLM-cost/signal modules (pricing + test, signals) into llm/, with all 13 external importers repointed.**

## Performance

- **Duration:** ~18 min
- **Completed:** 2026-06-17
- **Tasks:** 2
- **Files modified:** 22 (9 moves, 13 import-repoint edits)

## Accomplishments

- Created `src/shared/memory/` with 6 files: storage.ts, postStore.ts, postStore.test.ts, queue.ts, traceStore.ts, traceStore.test.ts
- Created `src/shared/llm/` with 3 files: pricing.ts, pricing.test.ts, signals.ts
- Repointed all external importers across background, content, dashboard, tools, eval, and scripts
- Full zero-behavior-change gate passed: type-check, 36 test files / 433 tests, check-skill-registry, check-tool-registry all exit 0
- types.ts, tool-registry.ts, generated-tool-registry.ts remain at src/shared/ root (D-06 + codegen output path)

## Task Commits

1. **Task 1: Move storage cluster into src/shared/memory/** - `e81800f` (refactor)
2. **Task 2: Move pricing + signals into src/shared/llm/; zero-behavior gate** - `2c32953` (refactor)

## Files Created/Modified

- `src/shared/memory/storage.ts` — Chrome storage wrapper, types import updated to ../types
- `src/shared/memory/postStore.ts` — Post persistence, sibling import ./storage unchanged
- `src/shared/memory/postStore.test.ts` — Tests, types import updated to ../types
- `src/shared/memory/queue.ts` — Flagged account queue, sibling import ./storage unchanged
- `src/shared/memory/traceStore.ts` — Trace FIFO store, sibling import ./storage unchanged
- `src/shared/memory/traceStore.test.ts` — Tests, types import updated to ../types
- `src/shared/llm/pricing.ts` — LLM cost/pricing, types import updated to ../types
- `src/shared/llm/pricing.test.ts` — Pricing tests, sibling import ./pricing unchanged
- `src/shared/llm/signals.ts` — AI_LANGUAGE_SIGNALS set (no imports)
- `src/background/index.ts` — Updated traceStore and storage to memory/, pricing to llm/
- `src/content/index.ts` — Updated storage/queue/postStore to memory/, signals to llm/
- `src/content/selector-registry.ts` — Updated storage import only (CLAUDE.md #1 — no other change)
- `src/content/skill-registry.ts` — Updated storage import
- `src/dashboard/index.tsx` — Updated storage import
- `src/dashboard/evalsLabeling.ts` — Updated postStore import
- `src/dashboard/evals.test.ts` — Updated postStore mock and import paths
- `src/dashboard/evals.tsx` — Updated pricing import
- `src/tools/library/dom-selector-rederive/heal.ts` — Updated storage from ../../../shared/storage to ../../../shared/memory/storage
- `src/tools/library/dom-selector-rederive/heal.test.ts` — Updated mock and import for storage
- `src/shared/eval/evalRunStore.ts` — Updated storage import (not in plan's original importer list; caught by type-check)
- `scripts/eval.ts` — Updated pricing.js path
- `scripts/trace-summary.ts` — Updated pricing.js path

## Decisions Made

- D-06 folder naming honored exactly: memory/ for storage cluster, llm/ for cost/signals
- types.ts, tool-registry.ts, generated-tool-registry.ts deliberately left at src/shared/ root (codegen hardcodes output path)
- Sibling imports within moved clusters (e.g. `from './storage'`) left unchanged — both files move into the same subfolder so relative path remains valid

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Importer] evalRunStore.ts (src/shared/eval/) also imported from ../storage**
- **Found during:** Task 1 (type-check run after storage cluster move)
- **Issue:** src/shared/eval/evalRunStore.ts imported from `'../storage'` which was not listed in the plan's importer table. Type-check flagged it immediately.
- **Fix:** Updated import to `'../memory/storage'`
- **Files modified:** src/shared/eval/evalRunStore.ts
- **Verification:** npm run type-check exits 0 after fix
- **Committed in:** e81800f (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 missed importer caught by tsc)
**Impact on plan:** Single missed importer, caught immediately by type-check. No scope creep.

## Issues Encountered

None beyond the missed importer above.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced. This was a pure file-relocation refactor. `src/content/selector-registry.ts` (CLAUDE.md #1 single-writer) was only modified to update its storage import path — no other change.

## Known Stubs

None.

## Self-Check

Files created (verified):
- `src/shared/memory/storage.ts` — FOUND
- `src/shared/memory/postStore.ts` — FOUND
- `src/shared/memory/queue.ts` — FOUND
- `src/shared/memory/traceStore.ts` — FOUND
- `src/shared/llm/pricing.ts` — FOUND
- `src/shared/llm/signals.ts` — FOUND

Commits verified:
- e81800f — Task 1 (storage cluster)
- 2c32953 — Task 2 (llm cluster + full gate)

## Self-Check: PASSED
