---
phase: 34-manual-self-healing-trigger-from-dashboard
plan: "01"
subsystem: selector-registry
tags: [dead-code-removal, selector-registry, types]
dependency_graph:
  requires: []
  provides: [trimmed-SelectorTarget-union, clean-SEED_MAP]
  affects: [selector-registry, dashboard-selector-health]
tech_stack:
  added: []
  patterns: [Record-SelectorTarget-exhaustiveness-gate]
key_files:
  created: []
  modified:
    - src/content/selectors.ts
    - src/content/selector-registry.ts
    - src/shared/types.ts
decisions:
  - "Bumped SELECTORS_VERSION 1.3.0 → 1.4.0 so the additive migration runs and removes the dead targets from chrome.storage.local on next load"
metrics:
  duration: "4m"
  completed: "2026-06-21"
---

# Phase 34 Plan 01: Remove Dead Selectors Summary

## One-liner

Removed two zero-consumer selectors (`POST_AUTHOR_NAME`, `POST_URN_ATTR_FALLBACK`) from all three sites — `selectors.ts`, `selector-registry.ts` (import + SEED_MAP), and `SelectorTarget` union — so they no longer appear as un-healable rows in the dashboard Selector Health tab.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Remove POST_AUTHOR_NAME and POST_URN_ATTR_FALLBACK from all three sites | c0c07ac | src/content/selectors.ts, src/content/selector-registry.ts, src/shared/types.ts |

## Verification

- `npm run type-check`: exit 0 (SEED_MAP stays exhaustive over trimmed SelectorTarget union)
- `npm test`: 36 test files / 433 tests all green
- `grep -rn "POST_AUTHOR_NAME\|POST_URN_ATTR_FALLBACK" src/`: zero matches
- All seven live blank-last-matched selectors (SPONSORED_MARKER, OPEN_TO_WORK_MARKER, AUTHOR_HEADLINE, CONNECTION_DEGREE, COMMENT_EXPAND_BUTTON, COMMENT_TEXT, RESHARE_INDICATOR) confirmed present in all three sites

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical step] Bumped SELECTORS_VERSION**
- **Found during:** Task 1
- **Issue:** The plan specified removing the selectors from the three source sites but did not mention bumping SELECTORS_VERSION. Without a version bump, the `seedIfNeeded()` migration would not run for existing installs, leaving the dead targets alive in `chrome.storage.local` and still visible in the Selector Health tab — defeating the stated purpose.
- **Fix:** Bumped `SELECTORS_VERSION` from `'1.3.0'` to `'1.4.0'`. The `migrate()` path in `selector-registry.ts` iterates only `SEED_MAP` keys, so any targets removed from SEED_MAP are simply not copied forward — the dead targets drop out of storage on next seedIfNeeded() call.
- **Files modified:** src/content/selectors.ts
- **Commit:** c0c07ac

## Known Stubs

None.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes introduced.

## Self-Check: PASSED

- src/content/selectors.ts: exists, POST_URN_ATTR_FALLBACK and POST_AUTHOR_NAME absent, POST_URN_ATTR and POST_AUTHOR_LINK present
- src/content/selector-registry.ts: exists, both dead names absent from import block and SEED_MAP
- src/shared/types.ts: exists, both dead members absent from SelectorTarget union
- Commit c0c07ac: verified present in git log
