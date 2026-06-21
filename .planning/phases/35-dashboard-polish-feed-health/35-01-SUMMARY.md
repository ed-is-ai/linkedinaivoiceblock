---
phase: 35-dashboard-polish-feed-health
plan: "01"
subsystem: content-script / selector-health
tags: [telemetry, selector-registry, exclusion-skills, SHA-01]
dependency_graph:
  requires: []
  provides: [SHA-01-telemetry-call-sites]
  affects: [SelectorRegistry.lastMatchedAt, dashboard-selector-health]
tech_stack:
  added: []
  patterns: [fire-and-forget-updateCandidate, resolve-hoist-then-query]
key_files:
  created: []
  modified:
    - src/skills/library/exclude-sponsored/exclude-sponsored.skill.ts
    - src/skills/library/exclude-company-page/exclude-company-page.skill.ts
    - src/skills/library/exclude-open-to-work/exclude-open-to-work.skill.ts
    - src/content/detector/signals/profile.ts
    - src/content/detector/comment-expand.ts
    - src/content/exclusions/exclusions.test.ts
    - src/modules/dashboard/SelectorView.tsx
decisions:
  - "Fire on element/string match (D-03), not on score>0 — AUTHOR_HEADLINE/CONNECTION_DEGREE updateCandidate fires before checkHeadlineFormula/checkConnectionDegree"
  - "COMPANY_PAGE_MARKER passes resolved marker STRING as winnerValue (not DOM node/boolean) — matches candidate[0].value for the cheap lastMatchedAt bump path"
  - "OPEN_TO_WORK_MARKER: single querySelector result reused for both telemetry gate and openToWork; return shape {excluded:false,openToWork} unchanged"
  - "COMMENT_TEXT fires on commentEls.length>0 (before filter(Boolean)) per A3 — truthy match at DOM-query level"
metrics:
  duration: "8m"
  completed: "2026-06-21"
  tasks: 2
  files: 7
---

# Phase 35 Plan 01: SHA-01 Contextual Selector Telemetry Summary

## One-liner

Wire 7 contextual selectors (SPONSORED_MARKER, COMPANY_PAGE_MARKER, OPEN_TO_WORK_MARKER, AUTHOR_HEADLINE, CONNECTION_DEGREE, COMMENT_EXPAND_BUTTON, COMMENT_TEXT) into fire-and-forget `updateCandidate()` call sites across 5 content-script files so Selector Health "Last matched" records real timestamps instead of permanent "—".

## What Was Built

Instrumented 5 live content-script match sites with the existing `SelectorRegistry.updateCandidate(target, winnerValue).catch(() => {})` fire-and-forget pattern, mirroring `observer.ts` exactly. No detection logic, scoring, or exclusion outcomes were changed.

### Task 1: 3 Exclusion Skills

**exclude-sponsored.skill.ts** — hoisted `sponsoredSelector = resolve('SPONSORED_MARKER')`, branched on `querySelector`, called `updateCandidate('SPONSORED_MARKER', sponsoredSelector).catch(() => {})` before `return { excluded: true, reason: 'sponsored' }`. No-match branch unchanged.

**exclude-company-page.skill.ts** — hoisted `marker = resolve('COMPANY_PAGE_MARKER')`, branched on `includes(marker)`, called `updateCandidate('COMPANY_PAGE_MARKER', marker).catch(() => {})` — passes the resolved STRING as winnerValue (critical: not a boolean or DOM node, per Pitfall 3 / D-03).

**exclude-open-to-work.skill.ts** — hoisted `otwSelector`, computed `matched = !!querySelector(otwSelector)` (single DOM read reused for both telemetry and return value), called `updateCandidate` if matched. Return shape `{ excluded: false, openToWork: matched }` byte-identical.

### Task 2: Profile + Comment expand sites

**profile.ts** — hoisted `headlineSel`/`degreeSel`, fires `updateCandidate` on the truthy element match (`if (headlineEl)` / `if (degreeEl)`) BEFORE the existing scoring path. `checkHeadlineFormula` and `checkConnectionDegree` pure functions untouched.

**comment-expand.ts** — hoisted `buttonSel`/`commentSel`, fires `COMMENT_EXPAND_BUTTON` immediately after the non-null check (before `button.click()`), fires `COMMENT_TEXT` when `commentEls.length > 0` (before `.filter(Boolean).slice(20)`). Both calls remain inside the existing `try/catch` so stale nodes still degrade silently.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Pre-existing TS2322 in SelectorView.tsx healBadge() ternary**
- **Found during:** Task 1 (type-check gate)
- **Issue:** `const style = ... : s.unchangedBadge` — TypeScript inferred `s[key]` as `CSSProperties | undefined` (Record<string, JSX.CSSProperties> lookup), causing TS2322 on `return { style, label }` where `style: JSX.CSSProperties` was expected. This was pre-existing; confirmed by stashing Task 1 changes and re-running type-check.
- **Fix:** Wrapped the ternary in parentheses and added `as JSX.CSSProperties` cast — all branches are statically-known keys in `s`, so the cast is safe.
- **Files modified:** `src/modules/dashboard/SelectorView.tsx`
- **Commit:** 6e8e2bd

**2. [Rule 1 - Bug] exclusions.test.ts mock missing updateCandidate**
- **Found during:** Task 1 (npm test gate)
- **Issue:** `vi.mock('../selector-registry', () => ({ resolve: vi.fn(...) }))` did not include `updateCandidate`, so Vitest threw "No updateCandidate export is defined on the mock" when the newly-instrumented skills called it.
- **Fix:** Added `updateCandidate: vi.fn(() => Promise.resolve())` to the mock factory — consistent with the fire-and-forget contract (returns a resolved Promise so `.catch()` chains safely).
- **Files modified:** `src/content/exclusions/exclusions.test.ts`
- **Commit:** 6e8e2bd

## Verification Results

| Check | Result |
|-------|--------|
| `npm run type-check` | PASS |
| `npm test` (450 tests, 36 files) | PASS |
| `npm run check-skill-registry` | PASS (generated-skill-registry.ts unchanged) |
| `git diff --exit-code -- src/content/exclusions.ts` | PASS (untouched) |
| grep `storageSet({ selectorRegistry })` in modified files | PASS (not found) |

## Commits

| Hash | Message |
|------|---------|
| 6e8e2bd | feat(35-01): instrument 3 exclusion skills with updateCandidate telemetry (SHA-01) |
| 452d088 | feat(35-01): instrument profile + comment-expand with updateCandidate telemetry (SHA-01) |

## Threat Flags

None. All new surface is within the existing `updateCandidate` single-writer path (T-35-02 mitigated — skills only CALL `updateCandidate`, never `storageSet({ selectorRegistry })`). winnerValue is always `resolve(target)` (a seeded registry string), never raw DOM input.

## Self-Check: PASSED

- `src/skills/library/exclude-sponsored/exclude-sponsored.skill.ts` — FOUND, contains `updateCandidate('SPONSORED_MARKER', sponsoredSelector).catch(() => {})`
- `src/skills/library/exclude-company-page/exclude-company-page.skill.ts` — FOUND, contains `updateCandidate('COMPANY_PAGE_MARKER', marker).catch(() => {})`
- `src/skills/library/exclude-open-to-work/exclude-open-to-work.skill.ts` — FOUND, contains `updateCandidate('OPEN_TO_WORK_MARKER', otwSelector).catch(() => {})`
- `src/content/detector/signals/profile.ts` — FOUND, contains `updateCandidate('AUTHOR_HEADLINE', headlineSel)` and `updateCandidate('CONNECTION_DEGREE', degreeSel)`
- `src/content/detector/comment-expand.ts` — FOUND, contains `updateCandidate('COMMENT_EXPAND_BUTTON', buttonSel)` and `updateCandidate('COMMENT_TEXT', commentSel)`
- Commits 6e8e2bd and 452d088 — FOUND in git log
