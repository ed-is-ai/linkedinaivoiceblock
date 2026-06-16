---
phase: 30-skill-registry-architecture
plan: "04"
subsystem: skill-registry
tags: [skill-registry, storage, singleton, code-seeds, cross-tab-refresh]
dependency_graph:
  requires: ["30-02", "30-03"]
  provides: ["skill-registry-singleton"]
  affects: ["src/content/skill-registry.ts"]
tech_stack:
  added: []
  patterns:
    - "Module-scope cache + code-seed fallback (mirrors SelectorRegistry)"
    - "Static explicit imports only — no dynamic import(), no import.meta.glob (D-07)"
    - "Single-writer storage pattern (CLAUDE.md constraint #1)"
    - "chrome.storage.onChanged idempotent listener for cross-tab cache refresh"
key_files:
  created:
    - src/content/skill-registry.ts
  modified: []
decisions:
  - "Zero declarative skills seeded at launch → getSignalSkills()/getExclusionSkills() return exactly code seeds (D-06)"
  - "CODE_SIGNAL_SKILLS order locked: listicle-cta → buzzword → em-dash → ai-vocab → hook-story → motivational → impersonal → generic-comments (Landmine 2)"
  - "buildSeedRegistry() is private (not exported) — only SkillRegistry controls the seed shape"
metrics:
  duration: "4m"
  completed_date: "2026-06-16"
  tasks_completed: 1
  files_created: 1
  files_modified: 0
---

# Phase 30 Plan 04: SkillRegistry Singleton Summary

**One-liner:** SkillRegistry singleton mirroring SelectorRegistry — static code-seed arrays, zero declarative skills at launch, cross-tab chrome.storage refresh, single-writer invariant.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Create src/content/skill-registry.ts mirroring SelectorRegistry | 1448750 | src/content/skill-registry.ts |

## What Was Built

`src/content/skill-registry.ts` — the SkillRegistry singleton that provides ordered skill lists to the runner (Plan 05).

**Structure mirrors SelectorRegistry exactly:**
- Module-scope `let _cache: SkillRegistrySchema | null = null`
- `CODE_SIGNAL_SKILLS: SignalSkill[]` in exact pipeline step-order (8 skills, Landmine 2)
- `CODE_EXCLUSION_SKILLS: ExclusionSkill[]` in priority order (4 skills)
- `buildSeedRegistry()` → zero declarative skills (D-06 zero-behavior-change crux)
- `seedIfNeeded()` → version-gated first-write to storage
- `load()` → warms cache from storage (no TTL eviction — skills have no TTL)
- `getSignalSkills()` → code-seed fallback when cache null; merged list when warm
- `getExclusionSkills()` → same fallback pattern
- `addDeclarativeSkill()` → single-writer push + storageSet (CLAUDE.md constraint #1)
- `registerOnChangedListener()` → idempotent, area==='local' guard, try/catch, refreshes `_cache`

**All 12 built-in skills statically imported (D-07):**
- 8 signal CodeSkills: listicleCtaSkill, buzzwordSkill, emDashSkill, aiVocabSkill, hookStorySkill, motivationalSkill, impersonalSkill, genericCommentsSkill
- 4 exclusion skills: sponsoredExclusionSkill, companyPageExclusionSkill, nonEnglishExclusionSkill, openToWorkExclusionSkill

## Verification

- `npm run type-check` — passes (0 errors)
- `npm test` — passes (411 tests, 27 test files; registry not yet wired into runner, golden-score snapshot untouched)
- No dynamic `import(` or `import.meta.glob` in skill-registry.ts (D-07 confirmed by grep)
- Only skill-registry.ts writes `storageSet({ skillRegistry })` (single-writer confirmed by grep across all src/)
- `CODE_SIGNAL_SKILLS` array declared in exact step-order: listicle-cta → buzzword → em-dash → ai-vocab → hook-story → motivational → impersonal → generic-comments (Landmine 2 confirmed)

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. SkillRegistry is fully functional with zero declarative skills at launch. The empty `declarativeSignalSkills: []` and `declarativeExclusionSkills: []` in the seed are intentional (D-06) — Plan 05 wires the registry into the runner, and a future LLM-authoring phase fills the declarative arrays.

## Threat Flags

No new security-relevant surface beyond what the plan's threat model documents. The single-writer invariant (T-30-06) is enforced: grep confirms only `skill-registry.ts` calls `storageSet({ skillRegistry })`.

## Self-Check: PASSED

- [x] src/content/skill-registry.ts exists and is non-empty
- [x] Commit 1448750 exists in git log
- [x] `npm run type-check` passes
- [x] `npm test` passes (411/411)
- [x] No dynamic import() in the file
- [x] Single-writer confirmed by grep
