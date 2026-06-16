---
phase: 30-skill-registry-architecture
plan: "03"
subsystem: content/exclusions
tags: [skill-registry, exclusion-skills, phase-30]
dependency_graph:
  requires: ["30-01"]
  provides: ["30-04", "30-05"]
  affects: ["src/content/exclusions.ts"]
tech_stack:
  added: []
  patterns:
    - ExclusionSkill interface (src/shared/skills/types.ts) — four concrete implementations
    - SelectorRegistry resolve() pattern extended to skill subdirectory (../selector-registry path)
key_files:
  created:
    - src/content/exclusions/sponsored.skill.ts
    - src/content/exclusions/company-page.skill.ts
    - src/content/exclusions/non-english.skill.ts
    - src/content/exclusions/open-to-work.skill.ts
  modified: []
decisions:
  - "Extraction is byte-for-byte behavioral copy of each checkExclusions() branch; no logic changes"
  - "open-to-work skill carries JSDoc invariant: must never return excluded:true (parity-critical)"
  - "Registration order documented in each file's JSDoc for Plan 04/05 enforcement"
metrics:
  duration: "~2.5 minutes"
  completed: "2026-06-16"
  tasks_completed: 2
  tasks_total: 2
---

# Phase 30 Plan 03: ExclusionSkill Modules Summary

**One-liner:** Four ExclusionSkill modules extracted byte-for-byte from checkExclusions() branches into src/content/exclusions/, preserving strict priority order and SelectorRegistry resolver pattern.

## What Was Built

Created `src/content/exclusions/` directory with four `ExclusionSkill` implementations, each extracting one branch of `checkExclusions()` in `src/content/exclusions.ts` unchanged:

| File | Skill ID | Branch | Return |
|------|----------|--------|--------|
| `sponsored.skill.ts` | `'sponsored'` | Priority 1 — SPONSORED_MARKER querySelector | `{ excluded: true, reason: 'sponsored' }` |
| `company-page.skill.ts` | `'company-page'` | Priority 2 — COMPANY_PAGE_MARKER in authorProfileUrl | `{ excluded: true, reason: 'company-page' }` |
| `non-english.skill.ts` | `'non-english'` | Priority 3 — isNonEnglish(postNode, postText) | `{ excluded: true, reason: 'non-english' }` |
| `open-to-work.skill.ts` | `'open-to-work'` | Priority 4 — OPEN_TO_WORK_MARKER metadata passthrough | `{ excluded: false, openToWork: boolean }` |

## Task Results

### Task 1: Extract sponsored, company-page, non-english ExclusionSkills
- **Commit:** ef1d36f
- **Files:** 3 new files under `src/content/exclusions/`
- **Verification:** `npm run type-check` passed

### Task 2: Extract open-to-work metadata-passthrough ExclusionSkill
- **Commit:** 9a7dee4
- **Files:** 1 new file
- **Verification:** `npm run type-check` passed; grep confirms no `excluded: true` in the file

## Key Invariants Preserved

1. **Exclusion parity (D-09 / SKILL-03):** Each skill is a byte-for-byte behavioral copy of its source branch. Same selector keys, same `isNonEnglish` call, same return shapes.

2. **Priority order documented:** JSDoc on each skill file specifies its registration position (1st through 4th) in `CODE_EXCLUSION_SKILLS` for Plan 04. This ensures the short-circuit order in Plan 05 matches `checkExclusions()`.

3. **No inline selector strings (CLAUDE.md #1):** All three selector-dependent skills (`sponsored`, `company-page`, `open-to-work`) call `resolve()` from `../selector-registry`. `non-english.skill.ts` has no selector lookup — it delegates entirely to `isNonEnglish()`.

4. **open-to-work never excludes (T-30-05 accept):** `open-to-work.skill.ts` always returns `excluded: false`. The parity-critical invariant is documented in JSDoc. A spoofed open-to-work marker can only raise the auto-hide threshold by +20 (fail-safe toward showing content).

5. **checkExclusions() untouched:** `src/content/exclusions.ts` is not modified in this plan. Rewiring the content script to use the skill runner is Plan 05.

## Verification Results

- `npm run type-check`: PASSED — all four ExclusionSkills satisfy the `ExclusionSkill` contract from `src/shared/skills/types.ts`
- `npm test`: PASSED — 411 tests, 27 test files. `checkExclusions()` remains intact; no behavior change.
- grep: No inline selector string literals in any of the four files; no `excluded: true` in `open-to-work.skill.ts`

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all four skills are complete implementations, not stubs.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes introduced. All DOM access is via `resolve()`-mediated `querySelector` calls on trusted selector strings (T-30-04 mitigated as planned).

## Self-Check: PASSED

- [x] `src/content/exclusions/sponsored.skill.ts` — EXISTS
- [x] `src/content/exclusions/company-page.skill.ts` — EXISTS
- [x] `src/content/exclusions/non-english.skill.ts` — EXISTS
- [x] `src/content/exclusions/open-to-work.skill.ts` — EXISTS
- [x] Commit ef1d36f — EXISTS (feat(30-03): extract sponsored, company-page, non-english ExclusionSkills)
- [x] Commit 9a7dee4 — EXISTS (feat(30-03): extract open-to-work metadata-passthrough ExclusionSkill)
