---
phase: 31-skill-library-alignment
plan: "02"
subsystem: skill-registry
tags: [skill-library, codegen, build-time, signal-skills, exclusion-skills, full-migration]
dependency_graph:
  requires: [31-01]
  provides: [full-skill-library, generated-skill-registry-complete, skill-registry-rewired]
  affects: [src/content/skill-registry.ts, src/content/generated-skill-registry.ts, scripts/generate-skill-registry.ts]
tech_stack:
  added: []
  patterns: [build-time-codegen, static-import-only, committed-generated-file, path-depth-3-from-src]
key_files:
  created:
    - src/skills/library/company-page/SKILL.md
    - src/skills/library/company-page/company-page.skill.ts
    - src/skills/library/non-english/SKILL.md
    - src/skills/library/non-english/non-english.skill.ts
    - src/skills/library/open-to-work/SKILL.md
    - src/skills/library/open-to-work/open-to-work.skill.ts
    - src/skills/library/listicle-cta/SKILL.md
    - src/skills/library/listicle-cta/listicle-cta.skill.ts
    - src/skills/library/buzzword/SKILL.md
    - src/skills/library/buzzword/buzzword.skill.ts
    - src/skills/library/em-dash/SKILL.md
    - src/skills/library/em-dash/em-dash.skill.ts
    - src/skills/library/ai-vocab/SKILL.md
    - src/skills/library/ai-vocab/ai-vocab.skill.ts
    - src/skills/library/hook-story/SKILL.md
    - src/skills/library/hook-story/hook-story.skill.ts
    - src/skills/library/motivational/SKILL.md
    - src/skills/library/motivational/motivational.skill.ts
    - src/skills/library/impersonal/SKILL.md
    - src/skills/library/impersonal/impersonal.skill.ts
    - src/skills/library/generic-comments/SKILL.md
    - src/skills/library/generic-comments/generic-comments.skill.ts
  modified:
    - src/content/generated-skill-registry.ts
    - src/content/skill-registry.ts
    - scripts/generate-skill-registry.ts
  deleted:
    - src/content/exclusions/company-page.skill.ts
    - src/content/exclusions/non-english.skill.ts
    - src/content/exclusions/open-to-work.skill.ts
    - src/content/detector/signals/listicle-cta.skill.ts
    - src/content/detector/signals/buzzword.skill.ts
    - src/content/detector/signals/em-dash.skill.ts
    - src/content/detector/signals/ai-vocab.skill.ts
    - src/content/detector/signals/hook-story.skill.ts
    - src/content/detector/signals/motivational.skill.ts
    - src/content/detector/signals/impersonal.skill.ts
    - src/content/detector/signals/generic-comments.skill.ts
decisions:
  - "Signal skill import depth is 3 levels (../../../) not 2 as stated in PATTERNS.md — PATTERNS.md had an off-by-one; Wave 1 SUMMARY already noted this same bug at ./sponsored"
  - "CRLF handling added to codegen frontmatter regex — Windows checkout adds CRLF to committed LF files; normalise before matching"
  - "Codegen skips heuristic/llm folders (not-yet-migrated) — detectors are out of scope for Wave 2"
metrics:
  duration: "17m"
  completed: "2026-06-16"
  tasks: 3
  files: 35
---

# Phase 31 Plan 02: Skill Library Alignment — Full Signal + Exclusion Migration Summary

Complete migration of all 3 remaining exclusion skills (company-page, non-english, open-to-work) and all 8 signal skills into self-contained `src/skills/library/<name>/` folders; regenerated module now carries the full ordered arrays; SkillRegistry sources both CODE_SIGNAL_SKILLS and CODE_EXCLUSION_SKILLS solely from the generated module with zero behavior change.

## What Was Built

**Task 1 — 3 remaining exclusion skills moved:**
- `src/skills/library/company-page/` — SKILL.md (`metadata.kind: exclusion`) + `company-page.skill.ts` (byte-identical body; import path: `'../selector-registry'` → `'../../../content/selector-registry'`)
- `src/skills/library/non-english/` — SKILL.md + `non-english.skill.ts` (import: `'../detector/language'` → `'../../../content/detector/language'`)
- `src/skills/library/open-to-work/` — SKILL.md + `open-to-work.skill.ts` (import: `'../selector-registry'` → `'../../../content/selector-registry'`)
- Three original `src/content/exclusions/*.skill.ts` files deleted (D-02)

**Task 2 — 8 signal skills moved:**
- `src/skills/library/{listicle-cta,buzzword,em-dash,ai-vocab,hook-story,motivational,impersonal,generic-comments}/` — each with SKILL.md (`metadata.kind: signal`; no runtime fields) and `<name>.skill.ts`
- Path fixups: `'./fn'` → `'../../../content/detector/signals/fn'`; `'../../../shared/skills/types'` → `'../../../shared/skills/types'` (unchanged depth); `'../../../shared/detectionConfig'` → `'../../../shared/detectionConfig'` (unchanged)
- All 8 original `src/content/detector/signals/*.skill.ts` files deleted (D-02)
- Underlying function files (`buzzwords.ts`, `listicle.ts`, etc.) and `__tests__/` stay in place untouched

**Task 3 — Generated module and SkillRegistry rewired:**
- `npm run generate-skill-registry` now emits `GENERATED_SIGNAL_SKILLS` with 8 entries in CODE_SIGNAL_SKILLS order and `GENERATED_EXCLUSION_SKILLS` with 4 entries in CODE_EXCLUSION_SKILLS order
- `skill-registry.ts` import block replaced: removed all 8 `./detector/signals/*.skill` imports + 3 `./exclusions/*.skill` imports; now a single `import { GENERATED_SIGNAL_SKILLS, GENERATED_EXCLUSION_SKILLS } from './generated-skill-registry'`; arrays spread from generated module
- TypeScript clean, 28 test files / 418 tests pass, codegen idempotent

## Verification Results

| Check | Result |
|-------|--------|
| `exclusions.test.ts` | 6/6 pass — exclusion parity byte-identical |
| `heuristic.test.ts` | 19/19 pass — golden-score snapshot byte-identical |
| Full test suite | 28/28 files, 418/418 tests pass |
| `npx tsc --noEmit` | Clean (0 errors) |
| Codegen idempotency | Second run after commit produces no git diff |
| No direct skill imports in skill-registry.ts | Confirmed (grep returns nothing) |
| No signal .skill.ts under detector/signals/ | Confirmed |
| No exclusion .skill.ts under exclusions/ | Confirmed |
| No weight literals in moved skill files | Confirmed — weights stay in underlying functions / detectionConfig |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Signal skill import paths needed 3 levels (../../../) not 2 (../../)**

- **Found during:** Task 3 — `npx tsc --noEmit` type errors
- **Issue:** The PATTERNS.md signal path-fixup rule stated `'../../content/detector/signals/<fn>'` and `'../../shared/skills/types'`. From `src/skills/library/<name>/`, the correct depth to reach `src/content/` and `src/shared/` is THREE levels up (`../../../`), not two. Using two levels would resolve to `src/skills/content/` (non-existent). This is the same bug as Wave 1 deviation 1 (documented in 31-01-SUMMARY.md) but applied to signal skills this time.
- **Fix:** Changed all signal skill imports to `../../../content/detector/signals/<fn>` and `../../../shared/skills/types`; listicle-cta's `../../../shared/detectionConfig` similarly corrected.
- **Files modified:** All 8 `src/skills/library/<name>/<name>.skill.ts` signal files
- **Commit:** 5ad59b7

**2. [Rule 1 - Bug] CRLF handling added to codegen frontmatter regex**

- **Found during:** Task 3 — `npm run generate-skill-registry` failed with "SKILL.md has no valid YAML frontmatter block" for the `sponsored` skill
- **Issue:** The codegen regex `/^---\n([\s\S]*?)\n---/` expects LF line endings. The `sponsored/SKILL.md` file committed in Wave 1 has CRLF line endings (Windows git checkout behaviour). The newly created SKILL.md files from this wave have LF (written directly by the Write tool), but the pre-existing sponsored file was CRLF.
- **Fix:** Added `const normalised = raw.replace(/\r\n/g, '\n');` before the regex match in `scripts/generate-skill-registry.ts` to normalise line endings.
- **Files modified:** `scripts/generate-skill-registry.ts`
- **Commit:** 5ad59b7

## Known Stubs

None. All 12 skills (8 signals + 4 exclusions) are fully wired through the generated module with live implementations. The golden-score snapshot and exclusion parity tests confirm byte-identical behavior.

## Threat Flags

No new threat surface introduced. All items in the plan's threat register were mitigated:
- T-31-02-01: heuristic.test.ts 19/19 pass — signalBreakdown key order unchanged
- T-31-02-02: Generated module verified to contain only static top-level `import` statements — no `import(`, `import.meta.glob`, `eval(`
- T-31-02-03: No `.md` imports exist in src/ — SKILL.md files read via fs only by codegen
- T-31-02-04: No weight literals in any moved signal skill — verified by inspection (weights remain in underlying functions and detectionConfig)

## Self-Check: PASSED
