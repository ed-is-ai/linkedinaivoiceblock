---
phase: 30-skill-registry-architecture
plan: "05"
subsystem: detection-pipeline
tags:
  - registry-runner
  - heuristic-detector
  - exclusion-runner
  - zero-behavior-change
  - skill-registry
dependency_graph:
  requires:
    - "30-04"  # SkillRegistry singleton with getSignalSkills/getExclusionSkills
    - "30-03"  # ExclusionSkill modules (sponsored, company-page, non-english, open-to-work)
    - "30-02"  # CodeSkill wrappers for all 10 signal functions
  provides:
    - "HeuristicDetector registry runner (SKILL-01)"
    - "LLMDetector DetectorSkill discriminant (D-01)"
    - "Exclusion runner in content/index.ts (SKILL-03)"
    - "Skill registry init alongside selector registry (SKILL-02)"
    - "Exclusion parity test over runner path (SKILL-04 / D-09)"
  affects:
    - "src/content/detector/heuristic.ts"
    - "src/content/detector/llm.ts"
    - "src/content/index.ts"
    - "src/content/exclusions/exclusions.test.ts (new)"
tech_stack:
  added: []
  patterns:
    - "Registry runner pattern (two-pass: sync then async-gated)"
    - "DetectorSkill discriminant on both HeuristicDetector and LLMDetector"
    - "Aliased imports (skillRegistrySeedIfNeeded/Load) to avoid name collision"
    - "Exclusion short-circuit loop (break on first excluded:true, accumulate openToWork)"
key_files:
  created:
    - src/content/exclusions/exclusions.test.ts
  modified:
    - src/content/detector/heuristic.ts
    - src/content/detector/llm.ts
    - src/content/index.ts
decisions:
  - "Runner two-pass design: sync skills first (preserves breakdown insertion order = Landmine 2), async-gated second (generic-comments gate in runner = Landmine 3)"
  - "DetectorSkill discriminant added to both HeuristicDetector and LLMDetector (kind = 'detector' as const)"
  - "Aliased skill-registry imports (skillRegistrySeedIfNeeded/skillRegistryLoad) avoid collision with selector-registry exports of same names"
  - "checkExclusions() import removed from content/index.ts; replaced entirely by getExclusionSkills() loop"
  - "ExclusionResult imported from shared/types directly (already exported there from Phase 30 Plan 01)"
metrics:
  duration: "~8 minutes"
  completed: "2026-06-16"
  tasks_completed: 3
  files_modified: 3
  files_created: 1
---

# Phase 30 Plan 05: Registry Wiring + Zero-Behavior-Change Proof Summary

**One-liner:** Registry runner wires HeuristicDetector into getSignalSkills() + content/index.ts into getExclusionSkills(), proved zero behavior change via byte-identical golden-score snapshot and new exclusion parity test.

## What Was Built

### Task 1: HeuristicDetector registry runner (commit 2123161)

`src/content/detector/heuristic.ts` refactored from a hand-wired 8-import pipeline to a registry runner:

- Removed 8 individual signal function imports (checkListicle, checkBuzzwords, checkEmDash, checkCta, checkAiVocab, checkHookStory, checkMotivational, checkImpersonalVoice)
- Added `import { getSignalSkills } from '../skill-registry'` and `CodeSkill`/`DetectorSkill` types
- Two-pass runner: sync pass (all `skill.sync === true` skills in CODE_SIGNAL_SKILLS order), then async-gated pass (generic-comments only, guarded by `score > detectionConfig.weights.genericComments.gate`)
- Added `DetectorSkill` to class `implements` clause with `readonly kind = 'detector' as const`
- Phase 29 golden-score snapshot passes BYTE-IDENTICAL: AI-voice fixture = 63, breakdown = {listicle-cta:8, hook-story:20, motivational:20, impersonal:15} in that key order

### Task 2: LLMDetector discriminant + content/index.ts wiring (commit 260218f)

`src/content/detector/llm.ts`:
- Added `import type { DetectorSkill } from '../../shared/skills/types'`
- Changed `implements Detector` to `implements Detector, DetectorSkill`
- Added `readonly kind = 'detector' as const` — all other lines byte-identical

`src/content/index.ts` (three coordinated changes):
1. **Imports**: Added aliased skill-registry imports (`skillRegistrySeedIfNeeded`, `skillRegistryLoad`, `getExclusionSkills`); removed `checkExclusions` import; added `ExclusionResult` type import from shared/types
2. **Registry init**: Added `await skillRegistrySeedIfNeeded()` and `await skillRegistryLoad()` alongside the selector-registry inits at L208-209
3. **Exclusion runner**: Replaced `checkExclusions(postData, postNode)` call with `getExclusionSkills()` short-circuit loop; updated `exclusion.openToWork` reference to `exclusionResult.openToWork`

Profile merge (L307-311) and detector selection (L233-235) are UNCHANGED.

### Task 3: Exclusion parity test (commit e6711b5)

`src/content/exclusions/exclusions.test.ts` (new):
- Imports `getExclusionSkills` from `'../skill-registry'` — exercises the NEW runner path
- Mocks `resolve()` from `selector-registry` via `vi.mock` to return deterministic JSDOM-queryable attribute selectors
- Reproduces the exact short-circuit loop from content/index.ts as `runExclusionRunner()`
- 5 fixture cases + 1 priority case (6 tests total):
  1. postNode with `[data-test-sponsored]` → `{ excluded: true, reason: 'sponsored' }`
  2. authorProfileUrl with '/company/' → `{ excluded: true, reason: 'company-page' }`
  3. CJK-heavy postText → `{ excluded: true, reason: 'non-english' }`
  4. postNode with `[data-test-open-to-work]` → `{ excluded: false, openToWork: true }`
  5. Normal English, no markers → `{ excluded: false }`
  6. Priority: sponsored + open-to-work on same node → `{ excluded: true, reason: 'sponsored' }` (openToWork: undefined — break fires before open-to-work skill runs)

## Verification Evidence

| Check | Result |
|-------|--------|
| `npm test` (28 test files, 417 tests) | ALL PASS |
| `npm run type-check` | PASS (no errors) |
| Phase 29 golden-score snapshot byte-identical | PASS (AI-voice = 63, key order preserved) |
| New exclusion parity test (6 cases) | PASS |
| `getSignalSkills()` present in heuristic.ts | CONFIRMED |
| No old signal imports in heuristic.ts | CONFIRMED |
| `genericComments.gate` gate in runner (not skill) | CONFIRMED |
| `getExclusionSkills()` loop with break in content/index.ts | CONFIRMED |
| skillRegistrySeedIfNeeded/Load called in init() | CONFIRMED |
| Profile merge unchanged at L307-311 | CONFIRMED |
| Detector selection unchanged at L233-235 | CONFIRMED |

## Landmine Compliance

| Landmine | Status |
|----------|--------|
| 1 — listicle-cta composite (no split) | PRESERVED — single CodeSkill, single breakdown key |
| 2 — breakdown insertion order | PRESERVED — CODE_SIGNAL_SKILLS array order = sync-pass iteration order = Object.keys(breakdown) |
| 3 — gate uses pre-gate score | PRESERVED — sync pass runs first, gate evaluates post-sync score |
| 4 — profile signals not absorbed | PRESERVED — extractProfileSignals stays in content/index.ts after detect() |
| 5 — only generic-comments is sync:false | PRESERVED — runner only awaits skills where skill.sync === false |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. All wiring produces real behavior; no placeholder values or TODO paths.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes. The two threat flags from the plan's threat register are addressed:
- T-30-07 (exclusion short-circuit ordering): mitigated by the parity test's sponsored-over-open-to-work priority case
- T-30-08 (LLMDetector unchanged behavior): accepted — DetectorSkill discriminant is additive only

## Self-Check: PASSED

- `src/content/detector/heuristic.ts` — exists, uses getSignalSkills(), no old signal imports
- `src/content/detector/llm.ts` — exists, implements DetectorSkill
- `src/content/index.ts` — exists, getExclusionSkills() loop present, skillRegistry inits present
- `src/content/exclusions/exclusions.test.ts` — exists, 6 tests pass
- Commits 2123161, 260218f, e6711b5 — all present in git log
