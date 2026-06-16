---
phase: 30-skill-registry-architecture
plan: "01"
subsystem: shared/types
tags: [types, skill-registry, contracts, refactor]
dependency_graph:
  requires: []
  provides: [src/shared/skills/types.ts, SkillRegistrySchema in StorageSchema]
  affects: [src/shared/types.ts, src/content/exclusions.ts]
tech_stack:
  added: []
  patterns: [discriminated-union, host-agnostic-module, re-export-for-compat]
key_files:
  created:
    - src/shared/skills/types.ts
  modified:
    - src/shared/types.ts
    - src/content/exclusions.ts
decisions:
  - "ExclusionResult moved to shared/types.ts so skills/types.ts can import it host-agnostically; exclusions.ts re-exports for backward compat"
  - "PatternSkill has no run() method — pattern-runner executes it; skill stores DATA only (D-02, MV3 CSP)"
  - "skillRegistry field added after evalRuns in StorageSchema as a NEW key (Landmine 7 avoided)"
metrics:
  duration: "8m"
  completed: "2026-06-16"
  tasks: 2
  files: 3
---

# Phase 30 Plan 01: Skill Type Contract Module Summary

**One-liner:** Host-agnostic skill type system (DetectorSkill/SignalSkill/ExclusionSkill/PatternRule discriminated union) declared in src/shared/skills/types.ts, ExclusionResult re-homed to shared/types.ts, and skillRegistry slot added to StorageSchema.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 2 | Re-home ExclusionResult + add skillRegistry to StorageSchema | 926ebb8 | src/shared/types.ts, src/content/exclusions.ts |
| 1 | Create host-agnostic skill contract module | 81fd3d0 | src/shared/skills/types.ts |

Note: Task 2 was committed before Task 1 because Task 1's `import type { ExclusionResult } from '../types'` requires the re-homing to be on disk first for type-check to pass. The plan acknowledged this dependency ("assuming it will live there").

## What Was Built

### `src/shared/skills/types.ts` (new)

Host-agnostic contract module declaring:
- `SKILL_REGISTRY_VERSION = '1.0.0'`
- `SignalInput` type (`'text' | 'profile' | 'comments'`)
- `SignalSkillBase` interface with `kind`, `id`, `inputs`, `sync`
- `SignalContext` interface for `CodeSkill.run()` context
- `CodeSkill` — imperative flavor with `run(ctx): number | Promise<number>`
- `PatternSkill` — declarative flavor with NO `run()` (D-02, MV3 CSP safety); stores `rule: PatternRule` as data
- `PatternRule` — discriminated union: `keyword-set`, `regex` (strings only, no eval), `numeric-threshold`
- `ExclusionSkill` — `check(postData, postNode): ExclusionResult`
- `DetectorSkill` — `kind: 'detector'` discriminant analog of existing `Detector` interface
- `SignalSkill` union, `AnySkill` union
- `SkillRegistrySchema` for chrome.storage.local shape

No `chrome.*` APIs, no runtime DOM calls — `Element` appears only as a type annotation.

### `src/shared/types.ts` (modified)

- Added `ExclusionResult` interface (moved from `content/exclusions.ts`) with JSDoc
- Added `import type { SkillRegistrySchema } from './skills/types'`
- Added `skillRegistry?: SkillRegistrySchema` field at end of `StorageSchema` (after `evalRuns`)

### `src/content/exclusions.ts` (modified)

- Removed local `ExclusionResult` interface declaration
- Added `export type { ExclusionResult } from '../shared/types'` for backward compat
- Added `import type { ..., ExclusionResult } from '../shared/types'` so function signature compiles
- `checkExclusions` function body unchanged — zero behavior change

## Verification

- `npm run type-check` — PASSED (0 errors)
- `npm test` — PASSED (27 test files, 411 tests, golden-score snapshot untouched)
- `grep`: `src/shared/skills/types.ts` contains no `chrome.` code and no runtime DOM calls
- `grep`: StorageSchema has exactly one `skillRegistry?:` field; `selectorRegistry?:` unchanged

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Task execution order swapped for correct dependency resolution**
- **Found during:** Task 1 verification
- **Issue:** Task 1 imports `ExclusionResult` from `'../types'` but that type only existed in `content/exclusions.ts`. Running Task 1 first produced `TS2305: Module '"../types"' has no exported member 'ExclusionResult'`. The plan text acknowledged this dependency ("assuming it will live there").
- **Fix:** Executed Task 2's ExclusionResult re-homing before committing Task 1 so type-check passed on each commit independently.
- **Files modified:** src/shared/types.ts, src/content/exclusions.ts (Task 2), then src/shared/skills/types.ts (Task 1)
- **Commits:** 926ebb8 (Task 2), 81fd3d0 (Task 1)

## Known Stubs

None — this plan contains pure type declarations only. No runtime behavior, no data wiring.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries beyond what the plan's `<threat_model>` already describes. The `skillRegistry` StorageSchema field is new surface but is empty (seeds zero declarative skills per D-06); T-30-02 accepts this and T-30-01 is mitigated by the type system (PatternRule stores strings only, not functions).

## Self-Check: PASSED

- `src/shared/skills/types.ts` exists and exports all required members
- `src/shared/types.ts` exports `ExclusionResult` and contains `skillRegistry?: SkillRegistrySchema`
- `src/content/exclusions.ts` re-exports `ExclusionResult` from `'../shared/types'`
- Commits 926ebb8 and 81fd3d0 exist in git log
