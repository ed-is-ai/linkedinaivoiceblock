---
phase: 31-skill-library-alignment
plan: "03"
subsystem: skill-registry
tags: [skill-library, detector-skills, selector-registry, re-export-barrel, codegen, D-02]
dependency_graph:
  requires: [31-02]
  provides: [detector-library-folders, selector-registry-library-folder, generated-detector-metadata]
  affects: [src/content/detector/heuristic.ts, src/content/detector/llm.ts, src/content/generated-skill-registry.ts, scripts/generate-skill-registry.ts]
tech_stack:
  added: []
  patterns: [thin-re-export-barrel, metadata-only-detector-export, library-folder-convention]
key_files:
  created:
    - src/skills/library/heuristic/SKILL.md
    - src/skills/library/heuristic/heuristic.skill.ts
    - src/skills/library/llm/SKILL.md
    - src/skills/library/llm/llm.skill.ts
    - src/skills/library/selector-registry/SKILL.md
    - src/skills/library/selector-registry/selector-registry.skill.ts
  modified:
    - src/content/detector/heuristic.ts
    - src/content/detector/llm.ts
    - scripts/generate-skill-registry.ts
    - src/content/generated-skill-registry.ts
decisions:
  - "Detector import depth is 3 levels (../../../) not 2 — same off-by-one as Wave 1 and Wave 2; PATTERNS.md stated '../../content/skill-registry' but correct path from src/skills/library/<name>/ is '../../../content/skill-registry'"
  - "GENERATED_DETECTOR_SKILLS emitted as metadata-only const object; detectors are NOT added to any array; runtime instantiation in index.ts/eval.ts unchanged (Open Question 2 resolution)"
  - "selector-registry library folder uses kind: exclusion (closest discriminant per RESEARCH A4); NOT wired into skill-order.json or any skill array"
metrics:
  duration: "8m"
  completed: "2026-06-16"
  tasks: 3
  files: 10
---

# Phase 31 Plan 03: Skill Library Alignment — Detector Skills + Selector Registry Migration Summary

HeuristicDetector and LLMDetector moved to self-contained `src/skills/library/` folders with thin re-export barrels at the old paths; selector-registry gets a library folder representation; codegen now emits `GENERATED_DETECTOR_SKILLS` metadata; D-02 satisfied — no skill definition remains outside `src/skills/library/`.

## What Was Built

**Task 1 — HeuristicDetector and LLMDetector moved to library folders:**
- `src/skills/library/heuristic/heuristic.skill.ts` — class body moved byte-identical; only path fixup: `'../skill-registry'` → `'../../../content/skill-registry'`; all `../../../shared/` paths correct at 3-level depth
- `src/skills/library/heuristic/SKILL.md` — `metadata.kind: detector`; no runtime fields (D-01)
- `src/skills/library/llm/llm.skill.ts` — class body moved byte-identical; `../../../shared/` paths unchanged; `chrome.runtime.sendMessage` is ambient global (unaffected by move)
- `src/skills/library/llm/SKILL.md` — `metadata.kind: detector`; no runtime fields
- `src/content/detector/heuristic.ts` — thin re-export barrel: `export { HeuristicDetector } from '../../skills/library/heuristic/heuristic.skill'` + `HeuristicDetectorOptions` type re-export
- `src/content/detector/llm.ts` — thin re-export barrel: `export { LLMDetector } from '../../skills/library/llm/llm.skill'`
- Callers (`src/content/index.ts`, `scripts/eval.ts`, `src/content/detector/heuristic.test.ts`) untouched — import the barrel path unchanged

**Task 2 — Selector-registry library folder (thin re-export, single-writer preserved):**
- `src/skills/library/selector-registry/selector-registry.skill.ts` — re-exports all 8 public names from `'../../../content/selector-registry'`: `buildSeedRegistry`, `seedIfNeeded`, `load`, `resolve`, `updateCandidate`, `candidateConfidence`, `insertCandidate`, `recordMiss`; zero `storageSet` calls; zero selector string literals
- `src/skills/library/selector-registry/SKILL.md` — `metadata.kind: exclusion`; description references CLAUDE.md constraint #1 single-writer invariant
- Canonical singleton stays at `src/content/selector-registry.ts` — NOT moved
- NOT in `scripts/skill-order.json`; NOT imported anywhere at runtime

**Task 3 — Codegen extended to emit detector metadata:**
- `scripts/generate-skill-registry.ts`: detector section now emits `GENERATED_DETECTOR_SKILLS` metadata-only export; removed "not yet migrated" commented-out import placeholder
- `src/content/generated-skill-registry.ts` (regenerated): adds `GENERATED_DETECTOR_SKILLS` with `heuristic` and `llm` entries (`kind: 'detector'`); `GENERATED_SKILL_METADATA` extended with both detector entries; `GENERATED_SIGNAL_SKILLS` (8 entries) and `GENERATED_EXCLUSION_SKILLS` (4 entries) unchanged
- Codegen idempotent: second `npm run generate-skill-registry` produces zero git diff

## Verification Results

| Check | Result |
|-------|--------|
| `heuristic.test.ts` | 19/19 pass — golden-score snapshot byte-identical |
| `exclusions.test.ts` | 6/6 pass — exclusion parity byte-identical |
| Full test suite | 28/28 files, 418/418 tests pass |
| `npx tsc --noEmit` | Clean (0 errors) |
| Codegen idempotency | Second run after commit produces no git diff |
| `GENERATED_SIGNAL_SKILLS` count | 8 (unchanged) |
| `GENERATED_EXCLUSION_SKILLS` count | 4 (unchanged) |
| No dynamic import/eval in generated module | Confirmed |
| selector-registry wrapper: no storageSet | Confirmed (grep on executable lines only) |
| selector-registry: not in skill-order.json | Confirmed |
| Callers of HeuristicDetector / LLMDetector | Untouched (index.ts, eval.ts, heuristic.test.ts import barrel path unchanged) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Detector import paths needed 3 levels (../../../) not 2 (../../)**

- **Found during:** Task 1 — `npx tsc --noEmit` reported 7 errors (Cannot find module)
- **Issue:** PATTERNS.md listed the path fixup as `'../../content/skill-registry'` and `'../../shared/types'`. From `src/skills/library/<name>/`, two levels up resolves to `src/skills/` (non-existent). The correct depth to `src/` is THREE levels (`../../../`). This is the same off-by-one as Wave 1 (sponsored) and Wave 2 (signal skills) — now applying to detector skills.
- **Fix:** Changed all imports in `heuristic.skill.ts` and `llm.skill.ts` to `../../../content/` and `../../../shared/`. The class bodies remained byte-identical.
- **Files modified:** `src/skills/library/heuristic/heuristic.skill.ts`, `src/skills/library/llm/llm.skill.ts`
- **Commit:** 6fa132e

## Known Stubs

None. All three library folders are fully wired or correctly excluded from runtime wiring per design:
- `heuristic` and `llm` — class bodies byte-identical; runtime wiring unchanged (instantiated in index.ts/eval.ts via barrel)
- `selector-registry` — intentionally not wired (convention-completeness only per RESEARCH A4)

## Threat Flags

No new threat surface. Plan threat register mitigated:
- T-31-03-01: selector-registry wrapper verified — zero `storageSet` executable lines; no selector string literals
- T-31-03-02: heuristic.test.ts 19/19 pass through barrel path — golden snapshot byte-identical, spoofing risk zero
- T-31-03-03: generated module verified — no `import(`, `import.meta.glob`, or `eval(`
- T-31-03-04: SKILL.md files read by codegen via `fs.readFileSync` only; never imported into the bundle

## Self-Check: PASSED
