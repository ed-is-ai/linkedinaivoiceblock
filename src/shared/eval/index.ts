/**
 * LinkedIn Blocker — Shared Eval Module (barrel)
 *
 * Single import point for both the CLI (scripts/eval.ts) and the future
 * Phase 28 in-extension Evals dashboard.
 *
 * Re-exports:
 *   - Pure eval core from ./metrics   (buildPostData, computeMetrics, filterErrors,
 *                                      formatSignalBreakdown, safe, PostDetail,
 *                                      ScoredEntry, ThresholdRow)
 *   - Canonical run-record types from ./runs  (EvalRun, EvalEngine, DatasetRef,
 *                                              EvalCost, ErrorAnalysis, EvalRunSummary,
 *                                              EvalRunComparison, MetricDelta,
 *                                              summarize, compareRuns)
 */

// Pure eval core
export {
  THRESHOLDS,
  safe,
  computeMetrics,
  formatSignalBreakdown,
  buildPostData,
  filterErrors,
} from './metrics.js';

export type {
  ScoredEntry,
  ThresholdRow,
  PostDetail,
} from './metrics.js';

// EvalRunStore — FIFO persistence (Phase 28 dashboard-only)
export {
  appendEvalRun,
  getEvalRuns,
  EVAL_RUNS_KEY,
  MAX_EVAL_RUNS,
} from './evalRunStore.js';

// Canonical run-record types + comparison helpers
export {
  summarize,
  compareRuns,
} from './runs.js';

export type {
  EvalEngine,
  DatasetRef,
  EvalCost,
  ErrorAnalysis,
  EvalRun,
  EvalRunSummary,
  EvalRunComparison,
  MetricDelta,
} from './runs.js';
