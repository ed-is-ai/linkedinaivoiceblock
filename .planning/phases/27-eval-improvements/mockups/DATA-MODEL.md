# Evals Dashboard — Data Model

**Decision:** Ship **Option A** (single-page console) as the Phase 28 dashboard layout.
Build the **data structures for Option C** (run history + run-over-run comparison) now, so
Option C's master–detail view is a *pure UI addition later* — no data migration.

This file is the contract. The types below are drop-in ready for `src/shared/eval/runs.ts`
(the shared seam created in Phase 27). They are designed so the Phase 27 **CLI already emits a
conformant per-run record** — `eval/results-YYYY-MM-DD.json` *is* an `EvalRun`.

---

## Why this shape

The Phase 27 CLI `results` object already carries `runAt`, `model`, `counts`, `cost`,
`thresholds`, `bestF1Threshold`, `posts` (and adds `engine` + `errorAnalysis`). That is the
per-run record. Option C needs only three things on top:

1. a **stable id + source + dataset descriptor** so many runs can be stored and compared,
2. a **lightweight summary projection** for the history list (no `posts[]`),
3. a **comparison** type + function for the Δ column.

None of those require changing the *metrics*; they wrap the existing record. So both the CLI
(writes runs to disk) and the dashboard (stores runs in `chrome.storage.local`) share one model,
and Option A vs Option C differ only in *how much* of it they render.

---

## Types (drop-in for `src/shared/eval/runs.ts`)

```ts
import type { ThresholdRow, PostDetail } from './metrics';
// ThresholdRow + PostDetail are moved into src/shared/eval/metrics.ts in Phase 27 (27-01).

export type EvalEngine = 'heuristic' | 'llm';

/** Where the labeled posts came from — lets the UI label and compare runs meaningfully. */
export interface DatasetRef {
  source: 'storage' | 'file';   // chrome.storage.local (dashboard) vs an imported export file (CLI)
  label: string;                // e.g. "storage @ 2026-06-14" or the input filename
  total: number;                // posts in the dataset
  labeled: number;              // posts carrying a label
}

export interface EvalCost {
  totalUsd: number;
  avgUsdPerPost: number;
}

export interface ErrorAnalysis {
  threshold: number;            // == bestF1Threshold
  falsePositives: PostDetail[]; // true human, predicted AI
  falseNegatives: PostDetail[]; // true ai, predicted human
}

/**
 * The canonical eval run record.
 * The Phase 27 CLI writes EXACTLY this to eval/results-YYYY-MM-DD.json, so the dashboard
 * reads CLI files and storage-persisted runs through one type — no adapter, no migration.
 */
export interface EvalRun {
  id: string;                   // stable + unique, e.g. `${runAt}::${engine}` (survives same-day reruns)
  runAt: string;                // ISO timestamp (CLI already emits this)
  source: 'cli' | 'dashboard';  // who produced the run
  engine: EvalEngine;           // Phase 27 addition
  model: string;                // 'heuristic' for heuristic runs, else the Claude model id
  dataset: DatasetRef;          // CLI fills from inputFile + counts; dashboard from storage
  counts: { total: number; labeled: number; skipped: number; errored: number; scored: number };
  cost: EvalCost | null;        // null for heuristic runs (Phase 27)
  thresholds: ThresholdRow[];   // full sweep
  bestF1Threshold: number;
  errorAnalysis: ErrorAnalysis; // Phase 27 addition (FP/FN at bestF1Threshold)
  posts: PostDetail[];          // full per-post detail
}

/** Lightweight projection for the run-history list (Option C sidebar). Omits posts[]. */
export interface EvalRunSummary {
  id: string;
  runAt: string;
  engine: EvalEngine;
  model: string;
  datasetLabel: string;
  bestF1Threshold: number;
  f1: number | null;            // metric values AT bestF1Threshold
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

/** chrome.storage.local envelope. Capped FIFO history — mirrors the llbTraces store pattern. */
export interface EvalRunStore {
  version: 1;
  runs: EvalRun[];              // newest first; trimmed to MAX_EVAL_RUNS
}
export const EVAL_RUNS_KEY = 'evalRuns';
export const MAX_EVAL_RUNS = 50;

/** One metric's before/after for the compare view (Option C Δ column, Option A "vs previous"). */
export interface MetricDelta {
  current: number | null;
  baseline: number | null;
  delta: number | null;        // current - baseline; null if either side is null
}

export interface EvalRunComparison {
  current: EvalRunSummary;
  baseline: EvalRunSummary;
  f1: MetricDelta;
  precision: MetricDelta;
  recall: MetricDelta;
  cost: MetricDelta;
  perThreshold: { threshold: number; f1: MetricDelta }[]; // sweep-level diff
}

const delta = (current: number | null, baseline: number | null): MetricDelta => ({
  current,
  baseline,
  delta: current !== null && baseline !== null ? current - baseline : null,
});

/** Pure — used by BOTH the eval-compare CLI (Phase 27) and the dashboard (Phase 28). */
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
```

---

## Who fills what

| Field / type | Phase 27 CLI | Phase 28 dashboard |
|--------------|--------------|--------------------|
| `runAt`, `counts`, `thresholds`, `bestF1Threshold`, `posts`, `model` | ✅ already emitted (Phase 26) | reuses |
| `engine`, `cost: null` for heuristic, `errorAnalysis` | ✅ added in Phase 27 (27-01) | reuses |
| `id`, `source: 'cli'`, `dataset` | ➕ small 27-01 add (data already on hand: `inputFile`, counts) | sets `source: 'dashboard'`, `dataset.source: 'storage'` |
| `EvalRun`, `DatasetRef`, `ErrorAnalysis`, `EvalCost` types | ➕ defined in `src/shared/eval/runs.ts` (27-01) | imports |
| `summarize`, `EvalRunSummary`, `compareRuns`, `EvalRunComparison`, `MetricDelta` | ➕ defined in shared + used by `eval-compare` (27-03) | imports |
| `EvalRunStore`, `EVAL_RUNS_KEY`, `MAX_EVAL_RUNS` | not used (CLI writes files) | ➕ Phase 28 only — storage persistence |

**Net:** by the end of Phase 27, every structure Option C needs exists in `src/shared/eval/`
**except** the `chrome.storage.local` persistence envelope (`EvalRunStore`) — which is inherently a
dashboard concern. Option C becomes: add `EvalRunStore` persistence + a history sidebar + a Δ
column, all over types that already ship. Option A renders the same `EvalRun` / `compareRuns`
without the history list.

---

## Forward-compat guarantees

1. **The CLI results file is an `EvalRun`.** Phase 28 can ingest historical `results-*.json`
   files directly into the run store — no transform.
2. **One comparison implementation.** `compareRuns` lives in shared; the `eval-compare` CLI
   (27-03) and the dashboard call the same function, so terminal diffs and UI diffs can never drift.
3. **Capped history** (`MAX_EVAL_RUNS = 50`) mirrors the existing `llbTraces` FIFO cap, so the
   storage-budget pattern is already proven in this codebase.
