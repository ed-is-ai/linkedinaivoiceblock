---
phase: 22
plan: 01
status: complete
date_completed: 2026-06-13
executor_model: claude-haiku-4-5-20251001
---

# Phase 22 Plan 01: Selector Registry Schema Types — Summary

**Objective:** Define the storage-backed selector registry type contracts in `src/shared/types.ts`. This is the foundation all other Phase 22 plans build against: the registry module, the consumer migrations, and the dashboard health view all import these types.

**Output:** `SelectorTarget`, `CandidateSource`, `SelectorCandidate`, `TargetEntry`, `SelectorRegistrySchema` types plus two new optional `StorageSchema` keys.

## Task Execution

### Task 1: Add selector-registry type definitions and extend StorageSchema

**Status:** ✓ COMPLETE

**Changes made:**

1. **Added 5 new type definitions to `src/shared/types.ts` (lines 181–265):**
   - `SelectorTarget` — string-literal union covering all 16 selector targets from `selectors.ts`:
     - FEED_CONTAINER, FEED_CONTAINER_FALLBACK, POST_CARD
     - POST_URN_ATTR, POST_URN_ATTR_FALLBACK
     - POST_BODY_TEXT, POST_AUTHOR_NAME, POST_AUTHOR_LINK
     - SPONSORED_MARKER, COMPANY_PAGE_MARKER, RESHARE_INDICATOR
     - COMMENT_EXPAND_BUTTON, OPEN_TO_WORK_MARKER, COMMENT_TEXT
     - AUTHOR_HEADLINE, CONNECTION_DEGREE

   - `CandidateSource` — enum covering selector origins: `'seed' | 'heuristic' | 'llm' | 'user'`

   - `SelectorCandidate` interface with fields:
     - `value: string` — selector string, attribute name, or URL pattern
     - `source: CandidateSource` — origin tracking
     - `lastMatchedAt: string | null` — ISO 8601 timestamp or null
     - `lastVerifiedAt: string | null` — ISO 8601 timestamp (SELECTOR-01 metadata)
     - `addedAt: string` — ISO 8601 timestamp when added
     - `failCount: number` — consecutive failed query attempts
     - `matchCount: number` — cumulative successful DOM matches

   - `TargetEntry` interface:
     - `candidates: SelectorCandidate[]` — rank-ordered list; index 0 = active

   - `SelectorRegistrySchema` interface with:
     - `version: string` — mirrors SELECTORS_VERSION
     - `targets: Record<SelectorTarget, TargetEntry>` — all targets mapped to candidate lists
     - `lastAdaptedAt: string | null` — timestamp of last adaptation event

2. **Extended `StorageSchema` interface (lines 295–298):**
   - `selectorRegistry?: SelectorRegistrySchema` — the registry itself
   - `selectorSessionMisses?: SelectorTarget[]` — session-miss tracking for dashboard

**Verification:**

- ✓ `npm run type-check` passes cleanly (tsc --noEmit exits 0)
- ✓ All 16 SelectorTarget members present and match selectors.ts constants
- ✓ SelectorRegistrySchema exports correctly with correct field structure
- ✓ SelectorCandidate has all required fields: value, source, lastMatchedAt, lastVerifiedAt, addedAt, failCount, matchCount
- ✓ StorageSchema preserved all 6 existing optional fields (flaggedAccounts, dismissedAccounts, anthropicApiKey, settings, dailyStats, storedPosts)
- ✓ Two new optional fields added correctly (selectorRegistry, selectorSessionMisses)

**Commit hash:** c2a1292

## Acceptance Criteria Met

- ✓ `npm run type-check` passes (tsc --noEmit exits 0)
- ✓ src/shared/types.ts contains `export type SelectorTarget =` with all 16 members listed
- ✓ src/shared/types.ts contains `export interface SelectorRegistrySchema` with `targets: Record<SelectorTarget, TargetEntry>`
- ✓ src/shared/types.ts contains `export interface SelectorCandidate` with all required fields (value, source, lastMatchedAt, lastVerifiedAt, addedAt, failCount, matchCount)
- ✓ StorageSchema contains `selectorRegistry?: SelectorRegistrySchema` and `selectorSessionMisses?: SelectorTarget[]`
- ✓ No existing StorageSchema fields were removed or reordered (all 6 original optional fields still present)

## Deviations from Plan

None — plan executed exactly as written. All types follow the established JSDoc + interface pattern from existing code (e.g., FlaggedAccount interface around lines 79–112).

## Key Decisions

1. **16 targets in SelectorTarget union** — All 15 selector constants from selectors.ts (excluding SELECTORS_VERSION which is metadata, not a DOM selector) plus POST_URN_ATTR_FALLBACK included for completeness per plan requirement.

2. **Attribute-name and URL-pattern targets in registry** — POST_URN_ATTR ('componentkey'), POST_URN_ATTR_FALLBACK ('componentkey'), and COMPANY_PAGE_MARKER ('/company/') are included as SelectorTarget members. The JSDoc notes that resolve() returns these as-is (not CSS selectors). This allows Phase 23 to adapt them if needed while maintaining type correctness.

3. **Full metadata on SelectorCandidate** — Added lastVerifiedAt and matchCount per SELECTOR-01 requirement text, even though Phase 22 itself does not write these fields. This ensures the schema accommodates the full metadata surface described in requirements.

## Files Modified

| File | Changes | Lines |
|------|---------|-------|
| `src/shared/types.ts` | Added 5 new type exports + extended StorageSchema | 181–299 |

## Tech Stack

- **TypeScript 5.0+** — strict type checking; no new runtime dependencies
- **chrome.storage.local** — storage API; no new package requirements

## Duration

- Task execution: ~5 minutes
- Type checking: ~30 seconds
- Total: ~6 minutes

## What This Enables

This plan is **Wave 1 of Phase 22** — the foundational types layer. All downstream plans depend on these exports:

- **Plan 02** — `SelectorRegistry` module implementation imports `SelectorRegistrySchema`, `SelectorTarget`, `SelectorCandidate`
- **Plan 03** — Content script consumer migrations (`observer.ts`, `exclusions.ts`, etc.) call `resolve(target: SelectorTarget)`
- **Plan 04** — Dashboard `SelectorView.tsx` reads `SelectorRegistrySchema` and `SelectorTarget[]` from storage
- **Plan 05** — Reset and health view logic depend on complete type definitions

The types are now ready for import across the extension codebase. No breaking changes to existing code.

## Self-Check: PASSED

- ✓ File exists: `src/shared/types.ts`
- ✓ Commit exists: c2a1292 (feat(22-01): add selector registry schema types to StorageSchema)
- ✓ npm run type-check: PASSED
- ✓ All acceptance criteria met
