---
phase: 29-config-foundation
plan: "01"
subsystem: detector/test
tags: [snapshot, golden-score, tdd, heuristic, zero-behavior-change]
dependency_graph:
  requires: []
  provides: [D-06-golden-score-baseline]
  affects: [src/content/detector/heuristic.test.ts]
tech_stack:
  added: []
  patterns: [vitest-toStrictEqual-inline-snapshot]
key_files:
  created: []
  modified:
    - src/content/detector/heuristic.test.ts
decisions:
  - "Used toStrictEqual (explicit inline pins) instead of toMatchSnapshot to avoid a separate snapshot file and make drift visually obvious in PR diffs"
  - "AI-voice fixture also triggers listicle-cta (CTA-only = 8) — pinned exactly so Plan 02 detects any weight-table change"
  - "Worktree absolute-path guard violated by Edit tool (wrote to main repo); corrected by cp to worktree then revert of main repo before commit"
metrics:
  duration: "~15 minutes"
  completed: "2026-06-15"
  tasks_completed: 1
  tasks_total: 1
  files_modified: 1
---

# Phase 29 Plan 01: Golden-Score Snapshot (D-06) Summary

**One-liner:** Inline `toStrictEqual` snapshot pinning exact `score + signalBreakdown` for 6 representative fixtures across all 8 heuristic signals before any config refactor.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add golden-score snapshot covering all signals whose literals move in Plan 02 | d4cc08a | src/content/detector/heuristic.test.ts |

## What Was Built

Added a new `describe` block named `HeuristicDetector — golden-score snapshot (D-06 zero-behavior-change)` to `src/content/detector/heuristic.test.ts`. The block contains 6 `it` tests, each pinning `{ score, breakdown }` using `toStrictEqual` for a representative fixture post:

| Fixture | URN | Pinned Score | Pinned Breakdown |
|---------|-----|-------------|-----------------|
| Clean prose | urn:li:activity:1 | 0 | {} |
| Listicle + CTA | urn:li:activity:2 | 25 | {listicle-cta: 25} |
| Heavy buzzwords | urn:li:activity:3 | 15 | {buzzword: 15} |
| Em-dash | urn:li:activity:4 | 10 | {em-dash: 10} |
| AI voice | urn:li:activity:voice001 | 63 | {listicle-cta: 8, hook-story: 20, motivational: 20, impersonal: 15} |
| Genuine human | urn:li:activity:human001 | 0 | {} |

The snapshot captures all signals whose weight literals move in Plan 02: `listicle-cta` (both/listicleOnly/ctaOnly tiers), `buzzword`, `em-dash`, `hook-story`, `motivational`, and `impersonal`. The `generic-comments` signal is not triggered (no `fetchComments` injected — intentional runtime-without-comments baseline).

No production source file was modified.

## Acceptance Criteria Verification

- `npm test` exits 0: 411/411 tests pass
- Describe block name contains "golden-score snapshot": confirmed (1 occurrence)
- `toStrictEqual` count: 6 (>= 4 required)
- `toMatchSnapshot` count: 0 (none allowed)
- No production source modified: confirmed (only heuristic.test.ts in commit d4cc08a)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Edit tool wrote to main repo instead of worktree**
- **Found during:** Task 1 (post-edit, during git status check)
- **Issue:** The Edit tool received an absolute path rooted at `C:\Git\linkedin.blocker\` (main repo) instead of the worktree root `C:\Git\linkedin.blocker\.claude\worktrees\agent-aa4e4b26ea6a11d7f\`. The modified file was written to the main repo's working tree, leaving the worktree file unchanged.
- **Fix:** `cp` of the modified file from main repo to worktree path, then `git checkout` to revert the main repo file. All subsequent git operations used `cd "$WT_ROOT"` explicitly.
- **Files modified:** src/content/detector/heuristic.test.ts (worktree)
- **Commit:** d4cc08a

## Known Stubs

None. The golden-score values are real outputs from `HeuristicDetector.detect()` run against the canonical fixtures, not hand-guessed or hardcoded placeholders.

## Threat Flags

None. This plan modifies a test file only. No new network endpoints, auth paths, file access patterns, or schema changes are introduced.

## Self-Check: PASSED

- File exists: `src/content/detector/heuristic.test.ts` — FOUND (390 lines, up from 243)
- Commit d4cc08a exists: FOUND
- `npm test` green: 411/411 passed
