---
phase: 23-self-healing-selector-adapter
plan: "01"
subsystem: selector
tags: [sanitizer, validator, pii, security, tdd, test-harness]
dependency_graph:
  requires: [22-05]
  provides: [buildDomSkeleton, validateCandidate, StorageSchema-rate-limit-keys]
  affects: [src/content/selector/sanitizer.ts, src/content/selector/validator.ts, src/shared/types.ts, package.json]
tech_stack:
  added: []
  patterns: [tdd-red-green, sequential-gate-pattern, clone-before-strip, fail-fast-early-return]
key_files:
  created:
    - src/content/selector/sanitizer.ts
    - src/content/selector/sanitizer.test.ts
    - src/content/selector/validator.ts
    - src/content/selector/validator.test.ts
  modified:
    - package.json
    - src/shared/types.ts
decisions:
  - "Stripped aria-label per ADAPT-04 + AI-SPEC override (CONTEXT.md said to keep it; ADAPT-04/ROADMAP/AI-SPEC all say strip)"
  - "em-dash characters in JSDoc break oxc parser used by vitest — replaced with ASCII hyphens"
  - "Sibling cap of MAX_SIBLINGS=3 enforced via explicit element removal from clone, not slice+rebuild"
metrics:
  duration: ~18 minutes
  completed: "2026-06-13T18:47:00Z"
  tasks_completed: 3
  files_created: 4
  files_modified: 2
  tests_added: 53
---

# Phase 23 Plan 01: Test Harness + PII Sanitizer + Validation Gate Summary

**One-liner:** Vitest test harness established; PII sanitizer strips href/src/aria-label/text from a DOM clone; 3-gate validation gate rejects injection/class/bad-count/no-author/no-text selectors before any storage write.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Add test scripts and rate-limit StorageSchema keys | `7f56183` | package.json, src/shared/types.ts |
| 2 | PII sanitizer (buildDomSkeleton) with D4 tests — RED | `2cb6433` | src/content/selector/sanitizer.test.ts |
| 2 | PII sanitizer (buildDomSkeleton) with D4 tests — GREEN | `677137f` | src/content/selector/sanitizer.ts, sanitizer.test.ts |
| 3 | Validation gate (validateCandidate) with D1/D2/D5/D6 tests — RED | `833285d` | src/content/selector/validator.test.ts |
| 3 | Validation gate (validateCandidate) with D1/D2/D5/D6 tests — GREEN | `2a237f4` | src/content/selector/validator.ts |

## Verification

- `npm test` (vitest run): 178 tests pass across 12 test files
- `npm run type-check`: clean (0 errors)
- `buildDomSkeleton` strips href/src/aria-label/title/alt/action/data-src and all text nodes; never mutates live DOM
- `validateCandidate` enforces: blocklist exact + dangerous-token + class/id guard -> querySelectorAll -> 2-50 count -> author-link ratio >50% -> post-text presence; sponsored contamination is advisory-only
- Source assertions:
  - sanitizer.ts contains `cloneNode(true)` and `PII_ATTRS_TO_REMOVE` with 'href', 'src', 'aria-label', 'title', 'alt'
  - sanitizer.ts contains no `.innerHTML =` write
  - validator.ts contains exactly one `querySelectorAll` call (at the DOM-query step)
  - validator.ts contains no `eval(`, `new Function(`, or `.innerHTML`
  - validator.ts contains `count < 2` and `count > 50` as match bounds
  - StorageSchema has `llbRederiveInFlight` and `llbRederiveDateKey` (correct spelling, not the RESEARCH.md typo)
  - StorageSchema still has `selectorRegistry?` and `selectorSessionMisses?` (no keys removed)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] em-dash characters in JSDoc broke vitest's oxc parser**
- **Found during:** Task 3 GREEN (first run of validator.test.ts after creating validator.ts)
- **Issue:** Unicode em-dash characters (`—`) in JSDoc block comments in validator.ts caused `[PARSE_ERROR] Unexpected token` from the oxc parser used by vitest internally
- **Fix:** Replaced all em-dashes in the JSDoc gate-order comment block with ASCII hyphens (`-`)
- **Files modified:** src/content/selector/validator.ts
- **Commit:** `2a237f4`

**2. [Rule 1 - Bug] Truncation test fixture insufficient to exceed 4000-char cap**
- **Found during:** Task 2 GREEN (first test run)
- **Issue:** The initial test fixture for the truncation case used `data-long` values that, after the MAX_SIBLINGS=3 cap, produced only ~1380 chars — well under the 4000-char threshold
- **Fix:** Changed the fixture to use 3-level structure with 600-char `data-uid` attribute values, producing ~5580 chars before truncation
- **Files modified:** src/content/selector/sanitizer.test.ts (test updated before GREEN commit — both changes in same feat commit)
- **Commit:** `677137f`

### Pre-existing Issues (Out of Scope)

**ESLint configuration does not support TypeScript:** The project's `eslint.config.js` uses only `@eslint/js` (base JS rules) without `@typescript-eslint` parser. Running `npm run lint` produces 43 parse errors across ALL TypeScript files in the project. The new files (`sanitizer.ts`, `validator.ts`) are affected identically to existing files like `exclusions.ts` and `types.ts`. This is a pre-existing project-wide issue, not introduced by this plan. Logged to deferred-items.

## Known Stubs

None. Both modules are complete implementations with full test coverage. No placeholder text, no hardcoded empty values used in production paths.

## Threat Flags

No new threat surface beyond what the plan's threat model already covers. Both files are pure utilities with no network endpoints, no storage writes, no auth paths. The threat model's T-23-01 (PII boundary) and T-23-02 (injection safety) are fully mitigated by the implementations.

## Self-Check: PASSED

All created files exist on disk. All commits verified in git history.

| Check | Result |
|-------|--------|
| src/content/selector/sanitizer.ts | FOUND |
| src/content/selector/sanitizer.test.ts | FOUND |
| src/content/selector/validator.ts | FOUND |
| src/content/selector/validator.test.ts | FOUND |
| Commit 7f56183 (test scripts + StorageSchema keys) | FOUND |
| Commit 2cb6433 (sanitizer RED) | FOUND |
| Commit 677137f (sanitizer GREEN) | FOUND |
| Commit 833285d (validator RED) | FOUND |
| Commit 2a237f4 (validator GREEN) | FOUND |
