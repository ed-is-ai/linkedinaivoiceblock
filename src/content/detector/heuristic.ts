/**
 * Thin re-export barrel — the HeuristicDetector class definition has moved to
 * src/skills/library/heuristic/heuristic.skill.ts (Phase 31 Plan 03, D-02).
 * This file exists only to preserve import sites in src/content/index.ts,
 * scripts/eval.ts, and src/content/detector/heuristic.test.ts.
 * DO NOT add class bodies or skill definitions here.
 */
export type { HeuristicDetectorOptions } from '../../skills/library/heuristic/heuristic.skill';
export { HeuristicDetector } from '../../skills/library/heuristic/heuristic.skill';
