/**
 * LinkedIn Blocker — Canonical Eval-Run Record Types
 *
 * Defines the data structures for eval run records shared between:
 *   - scripts/eval.ts              (CLI fills: id, source, dataset, engine, errorAnalysis)
 *   - src/dashboard/evals.tsx      (Phase 28 dashboard — reads CLI files + storage runs)
 *   - scripts/eval-compare.ts      (Phase 27-03 — compares two EvalRun records)
 *
 * HOST-AGNOSTIC CONTRACT: This file MUST NOT import `fs`, `process`, `chrome.*`,
 * or any DOM API. Only type-only imports from `./metrics` are permitted.
 *
 * NOTE: EvalRunStore / EVAL_RUNS_KEY / MAX_EVAL_RUNS are Phase 28 dashboard-only —
 * the CLI writes files, not chrome.storage.local. Do NOT add them here.
 *
 * Contract: DATA-MODEL.md (Phase 27 mockups) — types are drop-in as specified.
 * The Phase 27 CLI writes EXACTLY an EvalRun to eval/results-YYYY-MM-DD.json,
 * so the dashboard reads CLI files through one type — no adapter, no migration.
 */

import type { ThresholdRow, PostDetail } from './metrics.js';

// Re-export consumed types so downstream consumers don't need to import from metrics
export type { ThresholdRow, PostDetail };

// ---------------------------------------------------------------------------
// Engine discriminator
// ---------------------------------------------------------------------------

export type EvalEngine = 'heuristic' | 'llm';

// ---------------------------------------------------------------------------
// Dataset reference — lets the UI label and compare runs meaningfully
// ---------------------------------------------------------------------------

/** Where the labeled posts came from. */
export interface DatasetRef {
  /** 'file' for CLI (import from export JSON); 'storage' for dashboard (chrome.storage.local) */
  source: 'storage' | 'file';
  /** Human-readable label, e.g. "storage @ 2026-06-14" or the input filename */
  label: string;
  /** Total posts in the dataset (all entries in flaggedPosts + unflaggedPosts) */
  total: number;
  /** Posts carrying a valid label ('ai' | 'human') */
  labeled: number;
}

// ---------------------------------------------------------------------------
// Cost — null for heuristic runs (free)
// ---------------------------------------------------------------------------

export interface EvalCost {
  totalUsd: number;
  avgUsdPerPost: number;
}

// ---------------------------------------------------------------------------
// Error analysis — FP/FN at bestF1Threshold
// ---------------------------------------------------------------------------

export interface ErrorAnalysis {
  /** == bestF1Threshold of the run */
  threshold: number;
  /** True human, predicted AI — filtered at threshold */
  falsePositives: PostDetail[];
  /** True AI, predicted human — filtered at threshold */
  falseNegatives: PostDetail[];
}

// ---------------------------------------------------------------------------
// Canonical eval run record
// ---------------------------------------------------------------------------

/**
 * The canonical eval run record.
 * The Phase 27 CLI writes EXACTLY this to eval/results-YYYY-MM-DD.json,
 * so the dashboard reads CLI files and storage-persisted runs through one type —
 * no adapter, no migration. (DATA-MODEL.md forward-compat guarantee #1)
 */
export interface EvalRun {
  /** Stable + unique identifier, e.g. `${runAt}::${engine}` (survives same-day reruns) */
  id: string;
  /** ISO timestamp of the run */
  runAt: string;
  /** Who produced the run: 'cli' for scripts/eval.ts, 'dashboard' for Phase 28 */
  source: 'cli' | 'dashboard';
  /** Which engine was used */
  engine: EvalEngine;
  /** Model identifier: 'heuristic' for heuristic runs, else the Claude model id */
  model: string;
  /** Dataset descriptor — CLI fills from inputFile + counts; dashboard from storage */
  dataset: DatasetRef;
  /** Post counts */
  counts: {
    total: number;
    labeled: number;
    skipped: number;
    errored: number;
    scored: number;
  };
  /** null for heuristic runs (free); EvalCost for LLM runs */
  cost: EvalCost | null;
  /** Full threshold sweep (thresholds 35→90, step 5) */
  thresholds: ThresholdRow[];
  /** Threshold with the highest F1 in the sweep */
  bestF1Threshold: number;
  /** FP/FN at bestF1Threshold — computed post-sweep, never inside scoring loop */
  errorAnalysis: ErrorAnalysis;
  /** Full per-post detail (one entry per scored post) */
  posts: PostDetail[];
  /**
   * True when a run was cancelled/interrupted; metrics computed on partial data (Phase 28, D-06).
   * Optional so the CLI/storage drop-in compatibility guarantee in DATA-MODEL.md holds —
   * the CLI never sets this field; absence is equivalent to false (complete run).
   */
  incomplete?: boolean;
}

// ---------------------------------------------------------------------------
// Lightweight summary projection (for run-history list — Option C sidebar)
// Added here per DATA-MODEL.md; used by eval-compare (Phase 27-03) and
// the Phase 28 dashboard. Not used by the CLI results write directly.
// ---------------------------------------------------------------------------

/** Lightweight projection for the run-history list (Option C sidebar). Omits posts[]. */
export interface EvalRunSummary {
  id: string;
  runAt: string;
  engine: EvalEngine;
  model: string;
  datasetLabel: string;
  bestF1Threshold: number;
  f1: number | null;
  precision: number | null;
  recall: number | null;
  costUsd: number | null;
  fpCount: number;
  fnCount: number;
}

/** Pure projection — pull the best-threshold row out of the sweep. */
export function summarize(run: EvalRun): EvalRunSummary {
  const best = run.thresholds.find(t => t.threshold === run.bestF1Threshold) ?? null;
  return {
    id: run.id,
    runAt: run.runAt,
    engine: run.engine,
    model: run.model,
    datasetLabel: run.dataset.label,
    bestF1Threshold: run.bestF1Threshold,
    f1: best?.f1 ?? null,
    precision: best?.precision ?? null,
    recall: best?.recall ?? null,
    costUsd: run.cost?.totalUsd ?? null,
    fpCount: run.errorAnalysis.falsePositives.length,
    fnCount: run.errorAnalysis.falseNegatives.length,
  };
}

// ---------------------------------------------------------------------------
// Run comparison types + function (used by eval-compare CLI and Phase 28 dashboard)
// DATA-MODEL.md specifies these here so one implementation is shared.
// ---------------------------------------------------------------------------

/** One metric's before/after for the compare view (Option C Δ column). */
export interface MetricDelta {
  current: number | null;
  baseline: number | null;
  /** current - baseline; null if either side is null */
  delta: number | null;
}

export interface EvalRunComparison {
  current: EvalRunSummary;
  baseline: EvalRunSummary;
  f1: MetricDelta;
  precision: MetricDelta;
  recall: MetricDelta;
  cost: MetricDelta;
  /** Sweep-level diff */
  perThreshold: { threshold: number; f1: MetricDelta }[];
}

const delta = (current: number | null, baseline: number | null): MetricDelta => ({
  current,
  baseline,
  delta: current !== null && baseline !== null ? current - baseline : null,
});

/** Pure — used by BOTH the eval-compare CLI (Phase 27-03) and the dashboard (Phase 28). */
export function compareRuns(current: EvalRun, baseline: EvalRun): EvalRunComparison {
  const c = summarize(current);
  const b = summarize(baseline);
  const baseByT = new Map(baseline.thresholds.map(t => [t.threshold, t.f1]));
  return {
    current: c,
    baseline: b,
    f1: delta(c.f1, b.f1),
    precision: delta(c.precision, b.precision),
    recall: delta(c.recall, b.recall),
    cost: delta(c.costUsd, b.costUsd),
    perThreshold: current.thresholds.map(t => ({
      threshold: t.threshold,
      f1: delta(t.f1, baseByT.get(t.threshold) ?? null),
    })),
  };
}
