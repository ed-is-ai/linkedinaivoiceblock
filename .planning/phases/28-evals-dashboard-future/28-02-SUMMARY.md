---
phase: 28-evals-dashboard-future
plan: "02"
subsystem: dashboard/evals
tags: [evals, labeling, dashboard, preact, build-wiring, testing]
dependency_graph:
  requires: [28-01]
  provides: [evals-page-shell, evals-nav-links, evals-labeling-ui]
  affects: [src/dashboard/evals.tsx, src/manifest.json, vite.config.ts, src/popup/index.tsx, src/dashboard/index.tsx]
tech_stack:
  added: []
  patterns:
    - "Sibling module extraction (evalsLabeling.ts) for testable pure handlers — static imports defeat dynamic-import vi.mock gap"
    - "Re-export from component file for backward-compatible public surface"
    - "Inline style objects only (CLAUDE.md); no CSS class names in evals.tsx"
key_files:
  created:
    - src/dashboard/evals.html
    - src/dashboard/evals.tsx
    - src/dashboard/evalsLabeling.ts
    - src/dashboard/evals.test.ts
  modified:
    - src/manifest.json
    - vite.config.ts
    - src/popup/index.tsx
    - src/dashboard/index.tsx
decisions:
  - "Used vite-plugin-web-extension additionalInputs to emit evals.html (auto-discovery of web_accessible_resources HTML not supported by installed plugin version)"
  - "Extracted labelPost/seedLabels/countLabeled into evalsLabeling.ts (static imports) so vi.mock intercepts at module-graph time; evals.tsx re-exports them"
  - "Test file is evals.test.ts (.ts not .tsx) to match vitest.config.ts include pattern; no component rendering, no @testing-library/preact"
metrics:
  duration: "~45 min (Task 3 only; Tasks 1-2 were pre-completed)"
  completed: "2026-06-15"
  tasks_completed: 3
  files_changed: 8
---

# Phase 28 Plan 02: Evals Page Shell + Build Wiring + Labeling UI Summary

Standalone Evals console page wired into the build, reachable from popup and dashboard, with click-to-label (AI/Human) rows and an idempotent bulk-seed button backed by Phase 28-01 storage functions.

## Tasks Completed

### Task 1: Build entry — evals.html + manifest + vite registration
- Created `src/dashboard/evals.html` (title "LinkedIn Blocker — Evals", script `./evals.tsx`)
- Added `web_accessible_resources` array to `src/manifest.json` listing `dashboard/evals.html` restricted to `https://www.linkedin.com/*`
- Registered the page via `additionalInputs` in `vite.config.ts` (installed plugin version does not auto-discover web_accessible_resources HTML)
- `npm run build` emits `dist/dashboard/evals.html` (EVALS_HTML_EMITTED confirmed)
- Commit: `3b5d97c`

### Task 2: Page shell + storage read + nav links
- Fleshed out `src/dashboard/evals.tsx`: single `chrome.storage.local.get` on mount loading `storedPosts`, `unflaggedPosts`, `evalRuns`; friendly load-error fallback
- Renders all sections from the Option A mockup: run controls (engine toggle, disabled Run button), 4-metric grid, threshold sweep table, error analysis, labeling section
- All styling via inline `const s: Record<string, JSX.CSSProperties>` — no CSS class names (CLAUDE.md)
- Added `openEvals()` in `src/popup/index.tsx` with sibling button next to "View Dashboard"
- Added Evals link button in `src/dashboard/index.tsx` Data-management card
- Both use `chrome.runtime.getURL('dashboard/evals.html')` + `window.open(..., '_blank', 'noreferrer')`
- Commit: `f098f31`

### Task 3: Click-to-label rows + bulk-seed button wired to storage
- `LabelingSection` in `evals.tsx`: one row per post (merged `storedPosts` + `unflaggedPosts`), text preview, current-label indicator, AI/Human segmented buttons
- Bulk-seed button: "Bulk: flagged→AI, unflagged→Human" — calls `seedLabels()` then re-reads storage into state
- Dataset summary: "N labeled of M posts" via `countLabeled` over current state
- Extracted pure handlers into `src/dashboard/evalsLabeling.ts` (static imports from postStore, fully mockable):
  - `labelPost(urn, label)` → `setPostLabel(urn, label)`
  - `seedLabels()` → `bulkSeedLabels()`
  - `countLabeled(posts)` → pure count of labeled entries
- `evals.tsx` re-exports all three from `./evalsLabeling`
- `src/dashboard/evals.test.ts`: 12 tests, all passing; `vi.mock('../shared/postStore')` intercepts at module-graph time; no component rendering, no new dependencies
- Commit: `3646315`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Dynamic imports in labelPost/seedLabels defeated vi.mock**
- **Found during:** Task 3 test design
- **Issue:** The prior executor implemented `labelPost`/`seedLabels` with `await import('../shared/postStore')` inside the function body. `vi.mock` hoisting intercepts static imports at module-graph resolution time; dynamic imports inside function bodies are evaluated at call time and bypass the mock registry.
- **Fix:** Extracted the three handler functions into `src/dashboard/evalsLabeling.ts` with top-level static imports. `evals.tsx` re-exports them via `export { labelPost, seedLabels, countLabeled } from './evalsLabeling'`.
- **Files modified:** `src/dashboard/evals.tsx` (removed dynamic-import versions), `src/dashboard/evalsLabeling.ts` (new)
- **Commit:** `3646315`

## Known Stubs

None — all labeling handlers are wired to live storage. The "Run eval" button is intentionally disabled (Plan 03 delivers the run loop).

## Threat Flags

No new threat surface beyond what the plan's threat model covers:
- `web_accessible_resources` restricted to `https://www.linkedin.com/*` (T-28-05 mitigated)
- Bulk-seed idempotency enforced in `bulkSeedLabels` `label === undefined` guard (T-28-06 mitigated)
- Post text rendered as Preact children, never via `dangerouslySetInnerHTML` (T-28-07 mitigated)

## Self-Check: PASSED

- `src/dashboard/evalsLabeling.ts` — exists
- `src/dashboard/evals.test.ts` — exists
- `src/dashboard/evals.tsx` — exists, modified
- Commit `3646315` — present in git log
- `npm run build` — exits 0, `dist/dashboard/evals.html` emitted
- `npx vitest run` — 27 files, 393 tests passed (0 failures)
