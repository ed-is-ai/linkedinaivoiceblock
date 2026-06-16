---
phase: 30-skill-registry-architecture
plan: "02"
subsystem: skill-wrappers
tags: [skill-registry, codeskill, pattern-runner, heuristic, detection]
dependency_graph:
  requires: ["30-01"]
  provides: ["30-03", "30-04", "30-05"]
  affects: []
tech_stack:
  added: []
  patterns:
    - "CodeSkill wrapper pattern (thin delegation to existing signal functions)"
    - "PatternSkillRunner with compile-once RegExp cache (module-scope Map keyed by skill.id)"
    - "Dotted-path resolver over detectionConfig.weights (fail-closed: unknown key returns 0)"
key_files:
  created:
    - src/content/detector/signals/em-dash.skill.ts
    - src/content/detector/signals/buzzword.skill.ts
    - src/content/detector/signals/ai-vocab.skill.ts
    - src/content/detector/signals/hook-story.skill.ts
    - src/content/detector/signals/motivational.skill.ts
    - src/content/detector/signals/impersonal.skill.ts
    - src/content/detector/signals/listicle-cta.skill.ts
    - src/content/detector/signals/generic-comments.skill.ts
    - src/shared/skills/pattern-runner.ts
  modified: []
decisions:
  - "listicle-cta is a SINGLE composite CodeSkill (Landmine 1): calls checkListicle + checkCta internally and reads its tier weight from detectionConfig.weights.listicleCta"
  - "generic-comments is the only sync:false skill; its run() fetches+scores without any score>20 gate (gate stays in the runner — Landmine 3+5)"
  - "PatternSkillRunner caches compiled RegExp objects in a module-scope Map keyed by skill.id — mirrors buzzwords.ts compile-once pattern; never uses eval or new Function (T-30-01, MV3 CSP)"
  - "Dotted-path resolver over detectionConfig.weights uses fail-closed semantics: unknown weightKey returns 0, preventing score escalation from untrusted keys (T-30-03)"
metrics:
  duration: "10m"
  completed: "2026-06-16"
  tasks: 2
  files: 9
---

# Phase 30 Plan 02: CodeSkill Wrappers + PatternSkillRunner Summary

Eight existing heuristic signal functions wrapped as `CodeSkill` modules, plus a MV3-CSP-safe `PatternSkillRunner` for the declarative skill flavor (supported-but-unused this plan).

## What Was Built

**Task 1 — 7 CodeSkill wrappers:**

Six simple text wrappers (each delegates to its unchanged signal function, no weight literals in the wrapper body):
- `em-dash.skill.ts` → `emDashSkill` (id: 'em-dash', wraps `checkEmDash`)
- `buzzword.skill.ts` → `buzzwordSkill` (id: 'buzzword', wraps `checkBuzzwords`)
- `ai-vocab.skill.ts` → `aiVocabSkill` (id: 'ai-vocab', wraps `checkAiVocab`)
- `hook-story.skill.ts` → `hookStorySkill` (id: 'hook-story', wraps `checkHookStory`)
- `motivational.skill.ts` → `motivationalSkill` (id: 'motivational', wraps `checkMotivational`)
- `impersonal.skill.ts` → `impersonalSkill` (id: 'impersonal', wraps `checkImpersonalVoice`)

One composite (Landmine 1 — single skill with id 'listicle-cta'):
- `listicle-cta.skill.ts` → `listicleCtaSkill`: calls `checkListicle` + `checkCta` once each; returns `detectionConfig.weights.listicleCta.{both|listicleOnly|ctaOnly}` tier. No numeric literals.

**Task 2 — async skill + pattern-runner:**

- `generic-comments.skill.ts` → `genericCommentsSkill`: the only `sync: false` skill. `async run()` guards on `fetchComments` presence, awaits comments, delegates to `checkGenericComments`. No `score > 20` gate (gate stays in the runner — Landmine 3+5).
- `src/shared/skills/pattern-runner.ts` → `runPatternSkill()`: host-agnostic (no chrome.*, no DOM). Handles all three PatternRule kinds without eval or new Function. RegExp patterns are compiled via `new RegExp(str, 'gi')` and cached in a module-scope Map keyed by `skill.id`. Dotted-path weight resolver is fail-closed (unknown key returns 0 — T-30-03).

## Verification

- `npm run type-check` passes — all 9 new files satisfy their TypeScript contracts.
- `npm test` passes — 411/411 tests, golden-score snapshot byte-identical (wrappers not yet wired into runner; behavior unchanged this plan).
- `grep`: `listicle-cta.skill.ts` has exactly one `id: 'listicle-cta'`; `generic-comments.skill.ts` is the only `sync: false` skill; `pattern-runner.ts` contains no `eval`, `new Function`, or `chrome.` in executable code.

## Deviations from Plan

None — plan executed exactly as written. All landmines (1, 3, 5) confirmed avoided.

## Known Stubs

None. All wrappers delegate to fully-functional underlying signal functions. The `PatternSkillRunner` is complete but has no declarative skills to run yet (seeded in Plan 04).

## Threat Flags

None. No new network endpoints, auth paths, file access patterns, or schema changes introduced. The PatternSkillRunner trust boundary (T-30-01) and weightKey resolver (T-30-03) were both implemented as specified in the plan's threat model.

## Self-Check: PASSED

Files verified:
- src/content/detector/signals/em-dash.skill.ts — FOUND
- src/content/detector/signals/buzzword.skill.ts — FOUND
- src/content/detector/signals/ai-vocab.skill.ts — FOUND
- src/content/detector/signals/hook-story.skill.ts — FOUND
- src/content/detector/signals/motivational.skill.ts — FOUND
- src/content/detector/signals/impersonal.skill.ts — FOUND
- src/content/detector/signals/listicle-cta.skill.ts — FOUND
- src/content/detector/signals/generic-comments.skill.ts — FOUND
- src/shared/skills/pattern-runner.ts — FOUND

Commits verified:
- 968b89e: feat(30-02): add 7 CodeSkill wrappers (6 simple + listicle-cta composite)
- ba50985: feat(30-02): add generic-comments async CodeSkill and PatternSkillRunner
