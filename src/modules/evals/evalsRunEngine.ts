/**
 * LinkedIn Blocker — Evals Run Engine Helpers
 *
 * Pure post-processing functions extracted from evals.tsx so they are unit-testable
 * without any component-rendering tooling — mirrors the evalsLabeling.ts pattern.
 *
 * Static imports let vi.mock intercept modules at test time; dynamic import() inside
 * a function body defeats vi.mock hoisting.
 *
 * These functions own: threshold sweep, best-F1 selection, error analysis, EvalRun assembly.
 * They are the ONLY place these computations live in the Evals page surface.
 */

import {
  THRESHOLDS,
  computeMetrics,
  filterErrors,
  safe,
} from '../../shared/eval/index';

import type {
  ScoredEntry,
  PostDetail,
  ThresholdRow,
  EvalRun,
  EvalCost,
} from '../../shared/eval/index';

export type { ScoredEntry, PostDetail, ThresholdRow };

// ---------------------------------------------------------------------------
// assembleRun — pure post-processing (sweep → best-F1 → error analysis → EvalRun)
// ---------------------------------------------------------------------------

export interface AssembleRunArgs {
  engine: 'heuristic' | 'llm';
  model: string;
  scored: ScoredEntry[];
  details: PostDetail[];
  counts: { total: number; labeled: number; skipped: number; errored: number };
  /**
   * Pre-run estimated cost for LLM runs (postCount × avgUsdPerPost via pricing.ts).
   * The SCORE_POST relay response exposes NO token usage, so cost is always
   * estimate-derived — do NOT attempt to read it from the relay response.
   * For heuristic runs pass null (heuristic is free).
   */
  estimatedCost: EvalCost | null;
  runAt: string;
  /** When true, the run was cancelled/interrupted and scored < labeled posts. */
  incomplete?: boolean;
}

/**
 * Assemble a conformant EvalRun from the post-scoring state.
 *
 * Run sequence (mirrors scripts/eval.ts:259-319):
 *  1. Threshold sweep — computeMetrics(scored, t) for each THRESHOLDS entry.
 *  2. Best-F1 pick — highest non-null f1; ties → first.
 *  3. Error analysis — filterErrors AFTER sweep using bestF1Threshold.
 *  4. EvalRun literal assembly — source:'dashboard', dataset.source:'storage'.
 *
 * IMPORTANT: filterErrors is always called with bestF1Threshold derived POST-sweep,
 * never with a hard-coded threshold (eval pitfall 4).
 *
 * THRESHOLDS is imported from ../../shared/eval — this function never hard-codes the
 * threshold array; CLI and dashboard sweeps cannot drift (D-03).
 */
export function assembleRun(args: AssembleRunArgs): EvalRun {
  const { engine, model, scored, details, counts, estimatedCost, runAt, incomplete } = args;

  const scoredCount = scored.length;

  // 1. Threshold sweep (D-03 — uses THRESHOLDS from shared barrel, never redefines them)
  const thresholdRows: ThresholdRow[] = THRESHOLDS.map(t => computeMetrics(scored, t));

  // 2. Best-F1 pick: highest non-null f1; ties → first (matches eval.ts:262-269)
  let bestF1Threshold = THRESHOLDS[0] ?? 35;
  let bestF1Value: number | null = null;
  for (const row of thresholdRows) {
    if (row.f1 !== null && (bestF1Value === null || row.f1 > bestF1Value)) {
      bestF1Value = row.f1;
      bestF1Threshold = row.threshold;
    }
  }

  // 3. Error analysis — ALWAYS after sweep, ALWAYS with bestF1Threshold (eval pitfall 4)
  const falsePositives = filterErrors(details, bestF1Threshold, 'human');
  const falseNegatives = filterErrors(details, bestF1Threshold, 'ai');

  // avgUsdPerPost for the stored cost record (LLM only; heuristic = null)
  const avgUsdPerPost = estimatedCost !== null && scoredCount > 0
    ? safe(estimatedCost.totalUsd) / scoredCount
    : 0;

  const cost: EvalCost | null = estimatedCost !== null
    ? { totalUsd: safe(estimatedCost.totalUsd), avgUsdPerPost }
    : null;

  // 4. EvalRun literal — source:'dashboard', dataset.source:'storage' (D-03)
  const today = runAt.slice(0, 10);
  const run: EvalRun = {
    id: `${runAt}::${engine}`,
    runAt,
    source: 'dashboard',
    engine,
    model,
    dataset: {
      source: 'storage',
      label: `storage @ ${today}`,
      total: counts.total,
      labeled: counts.labeled,
    },
    counts: {
      total: counts.total,
      labeled: counts.labeled,
      skipped: counts.skipped,
      errored: counts.errored,
      scored: scoredCount,
    },
    // Cost semantics: the SCORE_POST relay response exposes NO token usage; cost
    // is always the pre-run estimate (postCount × avgUsdPerPost). Heuristic = null (free).
    cost,
    thresholds: thresholdRows,
    bestF1Threshold,
    errorAnalysis: {
      threshold: bestF1Threshold,
      falsePositives,
      falseNegatives,
    },
    posts: details,
    ...(incomplete ? { incomplete: true } : {}),
  };

  return run;
}
