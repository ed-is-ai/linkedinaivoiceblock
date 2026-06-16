---
phase: 30-skill-registry-architecture
fixed_at: 2026-06-16T00:00:00Z
review_path: .planning/phases/30-skill-registry-architecture/30-REVIEW.md
iteration: 1
findings_in_scope: 6
fixed: 6
skipped: 0
status: all_fixed
---

# Phase 30: Code Review Fix Report

**Fixed at:** 2026-06-16
**Source review:** .planning/phases/30-skill-registry-architecture/30-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 6 (1 critical + 5 warnings; info findings out of scope under `critical_warning`)
- Fixed: 6
- Skipped: 0

All fixes were verified with the project's TypeScript compiler (`tsc --noEmit -p tsconfig.json`
exit 0, no type errors) and the full Vitest suite (28 files / 418 tests passing), run in the
isolated worktree against a junction to the main repo's `node_modules`. CR-01 additionally
ships a regression test.

## Fixed Issues

### CR-01: Declarative PatternSkills crash the detector — pattern-runner is never invoked

**Files modified:** `src/content/detector/heuristic.ts`, `src/content/detector/heuristic.test.ts`
**Commit:** 3dc6af2
**Applied fix:** `HeuristicDetector.detect()` now dispatches on the `flavor` discriminant
instead of blind-casting every skill to `CodeSkill`. In Pass 1, `flavor === 'code'` skills
call `run()`; `flavor === 'pattern'` skills are executed via `runPatternSkill()` (the eval-free
executor that previously had zero callers). Pass 2 (async, gated) now guards `flavor === 'code'`
before calling `run()`. Added the `runPatternSkill` import and a regression test
(`declarative PatternSkill dispatch`) that registers a `PatternSkill` through the registry
getter and asserts `detect()` returns its contributed score (15) rather than throwing — the
test that would have caught the dead wiring.

### WR-01: Live auto-hide threshold change does not affect newly scored posts

**Files modified:** `src/content/index.ts`
**Commit:** 48db870
**Applied fix:** The detect callback now reads the live `currentThreshold` module-scope mirror
(updated by the `settings` `onChanged` handler) when computing `effectiveHideThreshold`,
instead of the `init()`-time `autoHideThreshold` constant that is never reassigned. Moving the
auto-hide slider now affects freshly scored, not-yet-flagged posts without a page reload.
First-load behavior is unchanged because `currentThreshold` is initialized from
`autoHideThreshold` during `init()`.

### WR-02: Pattern-runner regex cache is never invalidated on same-id skill replacement

**Files modified:** `src/shared/skills/pattern-runner.ts`, `src/content/skill-registry.ts`
**Commits:** 3563401 (runner-side export), b7dc446 (registry wiring)
**Applied fix:** Exported `clearCompiledCache(id?)` from the pattern-runner — clears one
skill's compiled regexes when an `id` is given, or the whole cache otherwise.
`addDeclarativeSkill()` calls `clearCompiledCache(skill.id)` on every write, and the
cross-tab `onChanged` handler calls `clearCompiledCache()` (full clear) when another tab
replaces the registry, so a skill whose patterns changed under an existing id no longer
returns stale compiled regexes.

### WR-03: seedIfNeeded() destructively discards declarative skills on any version mismatch

**Files modified:** `src/content/skill-registry.ts`
**Commit:** b7dc446
**Applied fix:** Added an additive `migrate()` helper mirroring `SelectorRegistry.migrate()`.
`seedIfNeeded()` now calls `migrate(skillRegistry)` on a version mismatch, preserving existing
`declarativeSignalSkills` / `declarativeExclusionSkills` and only updating `version`, instead of
overwriting storage with an empty seed. Absent or structurally malformed storage still falls
back to a clean seed (`buildSeedRegistry()`).

### WR-04: addDeclarativeSkill() appends without dedup and mutates cache in place against onChanged

**Files modified:** `src/content/skill-registry.ts`
**Commit:** b7dc446
**Applied fix:** `addDeclarativeSkill()` now dedups by `id` (filters out any existing skill of
the same id before appending, so a re-authored/retried skill replaces rather than duplicates —
no more double-counted weight); builds a fresh `SkillRegistrySchema` and reassigns `_cache`
immutably instead of mutating the shared object in place (closing the lost-update race against
the `onChanged` refresh); and surfaces persist failures by rolling back the in-memory cache and
rethrowing, replacing the silent `.catch(() => {})`.

### WR-05: LLMDetector dereferences response without null guard

**Files modified:** `src/content/detector/llm.ts`
**Commit:** 5a76603
**Applied fix:** `scoreViaBackground()` now validates the response shape
(`!response || typeof response.result?.score !== 'number'`) before resolving and rejects with
a `malformed SCORE_POST response` error on failure. A terminated/undefined/malformed worker
reply now routes through the deliberate `LLMDetector` fallback in `detect()` instead of
resolving `undefined` into the scoring path.

## Notes on out-of-scope findings

The four Info findings (IN-01 dead daily-stats counters, IN-02 pattern-runner extractor
divergence, IN-03 silent detector-failure path, IN-04 duplicate test-file name) are out of
scope under `fix_scope: critical_warning` and were not addressed. IN-03 (silent `.catch` on
`detector.detect`) is partially mitigated in practice by CR-01 and WR-05 removing the two
known throw paths, but the underlying silent-failure handler is unchanged.

---

_Fixed: 2026-06-16_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
