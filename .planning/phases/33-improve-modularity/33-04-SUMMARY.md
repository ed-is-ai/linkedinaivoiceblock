---
phase: 33-improve-modularity
plan: "04"
subsystem: modularity-refactor
tags: [refactor, modularity, ux-modules, file-relocation, build-config, import-repoint]
dependency_graph:
  requires:
    - phase: 33-improve-modularity/33-01
      provides: [skill paths already repointed in evals.tsx]
    - phase: 33-improve-modularity/33-02
      provides: [shared/memory + shared/llm paths already repointed in dashboard/evals files]
  provides: [MOD-05]
  affects: [src/modules/dashboard, src/modules/evals, src/modules/popup, src/manifest.json, vite.config.ts]
tech_stack:
  added: []
  patterns: [peer-module-self-containment, depth-increase-on-relocation, atomic-manifest-vite-repoint]
key_files:
  created:
    - src/modules/dashboard/index.html
    - src/modules/dashboard/index.tsx
    - src/modules/dashboard/SelectorView.tsx
    - src/modules/dashboard/dataManagement.ts
    - src/modules/dashboard/dataManagement.test.ts
    - src/modules/evals/evals.html
    - src/modules/evals/evals.tsx
    - src/modules/evals/evalsLabeling.ts
    - src/modules/evals/evalsRunEngine.ts
    - src/modules/evals/evals.test.ts
    - src/modules/popup/index.html
    - src/modules/popup/index.tsx
    - src/modules/popup/AccountRow.tsx
    - src/modules/popup/BatchBlockBar.tsx
  modified:
    - src/manifest.json
    - vite.config.ts
  deleted:
    - src/dashboard/ (entire directory — split into modules/dashboard/ and modules/evals/)
    - src/popup/ (entire directory — moved to modules/popup/)
decisions:
  - "D-07: three peer modules under src/modules/ — dashboard, evals, popup"
  - "D-08: no modules/common/ created; each module is fully self-contained"
  - "D-09: manifest.json + vite.config.ts repointed atomically; build verified before checkpoint"
  - "evals.tsx combines Track 1 (skill path) + Track 4 (memory/llm subpaths) + Track 5 (depth increase) in single move"
  - "Popup openDashboard/openEvals URLs updated to modules/ paths (runtime URL correctness)"
  - "Dashboard 'Open Evals console' button URL updated to modules/evals/evals.html"
metrics:
  duration: ~70min
  completed: "2026-06-17"
  tasks: 2 (of 3 — Task 3 is human-verify checkpoint)
  files_changed: 16
requirements_satisfied: [MOD-05]
---

# Phase 33 Plan 04: UX Modules Split — dashboard, evals, popup Summary

**One-liner:** Split src/dashboard/ (dashboard + evals) and src/popup/ into three self-contained peer modules under src/modules/, repointing all internal imports one depth level deeper plus all manifest.json and vite.config.ts HTML entry points; build emits dist/modules/{popup,dashboard,evals}/ with no legacy structure.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Move dashboard/evals/popup into src/modules/ + repoint imports | 7d45840 | 14 files relocated; src/dashboard/ + src/popup/ removed |
| 2 | Repoint manifest.json + vite.config.ts; build verified | 0b3ad47 | src/manifest.json, vite.config.ts |

## Task 3 Status: Awaiting Human Verification

Task 3 is a blocking `checkpoint:human-verify`. Automated steps (build, file-existence checks, manifest content) all pass. Human must load the unpacked `dist/` in Chrome and verify all three pages render.

## Verification (Automated — Task 2 gate)

- `npm run type-check` — exit 0 (Task 1)
- `npm test` — 36 test files / 433 tests pass (Task 1)
- `npm run build` — exit 0 (Task 2)
- `dist/modules/popup/index.html` — EXISTS
- `dist/modules/dashboard/index.html` — EXISTS
- `dist/modules/evals/evals.html` — EXISTS
- `dist/manifest.json` references `modules/popup/index.html`, `modules/dashboard/index.html`, `modules/evals/evals.html` — VERIFIED
- No legacy `dist/dashboard/` or `dist/popup/` structure — VERIFIED

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing URL Update] popup/index.tsx openDashboard/openEvals chrome.runtime.getURL paths**
- **Found during:** Task 1
- **Issue:** The popup's `openDashboard()` used `chrome.runtime.getURL('dashboard/index.html')` and `openEvals()` used `chrome.runtime.getURL('dashboard/evals.html')`. After the move these would 404 at runtime even though the extension loads. Not in the plan's import-repoint table.
- **Fix:** Updated to `modules/dashboard/index.html` and `modules/evals/evals.html` respectively
- **Files modified:** src/modules/popup/index.tsx
- **Committed in:** 7d45840

**2. [Rule 2 - Missing URL Update] dashboard/index.tsx "Open Evals console" button URL**
- **Found during:** Task 1
- **Issue:** The dashboard's "Open Evals console" button used `chrome.runtime.getURL('dashboard/evals.html')` — same problem as popup
- **Fix:** Updated to `modules/evals/evals.html`
- **Files modified:** src/modules/dashboard/index.tsx
- **Committed in:** 7d45840

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced. Pure file relocation + build-config repointing. chrome.storage.local access pattern unchanged. CLAUDE.md #1 (selector-registry.ts single-writer) untouched.

## Known Stubs

None.

## Self-Check

Files created (verified):
- `src/modules/dashboard/index.html` — FOUND
- `src/modules/dashboard/index.tsx` — FOUND
- `src/modules/evals/evals.html` — FOUND
- `src/modules/evals/evals.tsx` — FOUND
- `src/modules/popup/index.html` — FOUND
- `src/modules/popup/index.tsx` — FOUND

Commits verified:
- 7d45840 — FOUND
- 0b3ad47 — FOUND

## Self-Check: PASSED
