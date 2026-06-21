/**
 * Pure-function unit tests for summarize() and compareRuns() in src/shared/eval/runs.ts
 *
 * Requirements: EVAL-09 (shared comparison layer — DATA-MODEL.md guarantee #2)
 *
 * Strategy:
 *   - All tests use small in-memory EvalRun fixtures — no file I/O, no network.
 *   - Tests are split into describe('summarize') and describe('compareRuns') blocks.
 *   - The null-cost case (heuristic run with cost: null) is covered explicitly in both.
 */

import { describe, it, expect } from 'vitest';
import { summarize, compareRuns } from './runs.js';
import type { EvalRun } from './runs.js';

// ---------------------------------------------------------------------------
// Fixture builders (inline — plain data, no factories)
// ---------------------------------------------------------------------------

/**
 * Minimal valid ThresholdRow for fixture use.
 * Mirrors ThresholdRow from ./metrics — only fields used by summarize/compareRuns.
 */
function threshRow(threshold: number, f1: number | null, precision?: number | null, recall?: number | null, accuracy = 0) {
  return {
    threshold,
    tp: 0,
    fp: 0,
    tn: 0,
    fn: 0,
    precision: precision ?? f1,
    recall: recall ?? f1,
    f1,
    accuracy,
  };
}

/** Build a minimal EvalRun for testing. Fields not relevant to a test can be omitted via overrides. */
function makeRun(overrides: Partial<EvalRun> & { bestF1Threshold: number; thresholds: EvalRun['thresholds'] }): EvalRun {
  return {
    id: 'test-run::heuristic',
    runAt: '2026-06-15T00:00:00.000Z',
    source: 'cli',
    engine: 'heuristic',
    model: 'heuristic',
    dataset: {
      source: 'file',
      label: 'test-dataset',
      total: 10,
      labeled: 10,
    },
    counts: {
      total: 10,
      labeled: 10,
      skipped: 0,
      errored: 0,
      scored: 10,
    },
    cost: null,
    errorAnalysis: {
      threshold: overrides.bestF1Threshold,
      falsePositives: [],
      falseNegatives: [],
    },
    posts: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Shared fixtures used in multiple tests
// ---------------------------------------------------------------------------

const RUN_A = makeRun({
  id: 'run-a::heuristic',
  engine: 'heuristic',
  model: 'heuristic',
  bestF1Threshold: 50,
  cost: null,
  thresholds: [
    threshRow(45, 0.6, 0.55, 0.65),
    threshRow(50, 0.72, 0.75, 0.69, 0.8),
    threshRow(55, 0.65, 0.7, 0.61),
  ],
  errorAnalysis: {
    threshold: 50,
    falsePositives: [
      { index: 0, label: 'human', score: 55, confidence: 'high', signalBreakdown: {}, textPreview: 'fp text' },
      { index: 1, label: 'human', score: 60, confidence: 'medium', signalBreakdown: {}, textPreview: 'fp2 text' },
    ],
    falseNegatives: [
      { index: 2, label: 'ai', score: 40, confidence: 'low', signalBreakdown: {}, textPreview: 'fn text' },
    ],
  },
});

const RUN_B = makeRun({
  id: 'run-b::llm',
  engine: 'llm',
  model: 'claude-sonnet-4-6',
  bestF1Threshold: 50,
  cost: { totalUsd: 0.0148, avgUsdPerPost: 0.00148 },
  dataset: {
    source: 'file',
    label: 'dataset-B',
    total: 20,
    labeled: 20,
  },
  thresholds: [
    threshRow(45, 0.68),
    threshRow(50, 0.8, 0.82, 0.78, 0.85),
    threshRow(55, 0.76),
  ],
  errorAnalysis: {
    threshold: 50,
    falsePositives: [],
    falseNegatives: [],
  },
});

// ---------------------------------------------------------------------------
// describe('summarize')
// ---------------------------------------------------------------------------

describe('summarize', () => {
  it('returns the f1/precision/recall from the best-threshold row', () => {
    const summary = summarize(RUN_A);
    expect(summary.bestF1Threshold).toBe(50);
    expect(summary.f1).toBeCloseTo(0.72, 5);
    expect(summary.precision).toBeCloseTo(0.75, 5);
    expect(summary.recall).toBeCloseTo(0.69, 5);
  });

  it('returns engine, model, runAt, id, datasetLabel from the run', () => {
    const summary = summarize(RUN_A);
    expect(summary.id).toBe('run-a::heuristic');
    expect(summary.engine).toBe('heuristic');
    expect(summary.model).toBe('heuristic');
    expect(summary.runAt).toBe('2026-06-15T00:00:00.000Z');
    expect(summary.datasetLabel).toBe('test-dataset');
  });

  it('returns null metrics when no threshold row matches bestF1Threshold', () => {
    const run = makeRun({
      bestF1Threshold: 99, // not in thresholds
      thresholds: [threshRow(50, 0.5)],
    });
    const summary = summarize(run);
    expect(summary.f1).toBeNull();
    expect(summary.precision).toBeNull();
    expect(summary.recall).toBeNull();
  });

  it('returns costUsd null for a heuristic run with cost: null', () => {
    const summary = summarize(RUN_A);
    expect(summary.costUsd).toBeNull();
  });

  it('returns costUsd from cost.totalUsd for an LLM run', () => {
    const summary = summarize(RUN_B);
    expect(summary.costUsd).toBeCloseTo(0.0148, 6);
  });

  it('returns fpCount and fnCount from errorAnalysis arrays', () => {
    const summary = summarize(RUN_A);
    expect(summary.fpCount).toBe(2);
    expect(summary.fnCount).toBe(1);
  });

  it('returns fpCount=0 and fnCount=0 when errorAnalysis arrays are empty', () => {
    const summary = summarize(RUN_B);
    expect(summary.fpCount).toBe(0);
    expect(summary.fnCount).toBe(0);
  });

  it('JSON.stringify of summary with null metrics contains no NaN', () => {
    const run = makeRun({ bestF1Threshold: 99, thresholds: [] });
    const summary = summarize(run);
    const json = JSON.stringify(summary);
    expect(json).not.toContain('NaN');
  });
});

// ---------------------------------------------------------------------------
// describe('compareRuns')
// ---------------------------------------------------------------------------

describe('compareRuns', () => {
  it('returns correct f1/precision/recall deltas between two runs', () => {
    const cmp = compareRuns(RUN_B, RUN_A); // B = current, A = baseline
    // f1: 0.80 - 0.72 = 0.08
    expect(cmp.f1.current).toBeCloseTo(0.8, 5);
    expect(cmp.f1.baseline).toBeCloseTo(0.72, 5);
    expect(cmp.f1.delta).toBeCloseTo(0.08, 5);
    // precision: 0.82 - 0.75 = 0.07
    expect(cmp.precision.delta).toBeCloseTo(0.07, 5);
    // recall: 0.78 - 0.69 = 0.09
    expect(cmp.recall.delta).toBeCloseTo(0.09, 5);
  });

  it('populates current and baseline EvalRunSummaries correctly', () => {
    const cmp = compareRuns(RUN_B, RUN_A);
    expect(cmp.current.id).toBe('run-b::llm');
    expect(cmp.baseline.id).toBe('run-a::heuristic');
    expect(cmp.current.engine).toBe('llm');
    expect(cmp.baseline.engine).toBe('heuristic');
  });

  it('null-cost run yields cost MetricDelta with delta === null without throwing', () => {
    // RUN_A has cost: null (heuristic), RUN_B has cost.totalUsd
    const cmp = compareRuns(RUN_B, RUN_A);
    // baseline.costUsd is null → delta cannot be computed
    expect(cmp.cost.baseline).toBeNull();
    expect(cmp.cost.current).toBeCloseTo(0.0148, 6);
    expect(cmp.cost.delta).toBeNull();
  });

  it('cost MetricDelta delta is a number when both runs have cost', () => {
    const runWithCostA = makeRun({
      bestF1Threshold: 50,
      cost: { totalUsd: 0.01, avgUsdPerPost: 0.001 },
      thresholds: [threshRow(50, 0.7)],
    });
    const runWithCostB = makeRun({
      bestF1Threshold: 50,
      cost: { totalUsd: 0.02, avgUsdPerPost: 0.002 },
      thresholds: [threshRow(50, 0.8)],
    });
    const cmp = compareRuns(runWithCostB, runWithCostA);
    expect(cmp.cost.delta).toBeCloseTo(0.01, 6);
  });

  it('perThreshold aligns f1 deltas by matching threshold values', () => {
    const cmp = compareRuns(RUN_B, RUN_A);
    // Both runs have thresholds 45, 50, 55
    expect(cmp.perThreshold).toHaveLength(3);
    const t50 = cmp.perThreshold.find(p => p.threshold === 50);
    expect(t50).toBeDefined();
    if (!t50) return; // narrow type for TS
    // f1 at t=50: current=0.80, baseline=0.72, delta=0.08
    expect(t50.f1.current).toBeCloseTo(0.8, 5);
    expect(t50.f1.baseline).toBeCloseTo(0.72, 5);
    expect(t50.f1.delta).toBeCloseTo(0.08, 5);
  });

  it('perThreshold yields delta null when threshold absent in baseline', () => {
    const currentWithExtraT = makeRun({
      bestF1Threshold: 50,
      thresholds: [
        threshRow(50, 0.8),
        threshRow(60, 0.75), // not in baseline
      ],
    });
    const baselineNoT60 = makeRun({
      bestF1Threshold: 50,
      thresholds: [threshRow(50, 0.7)],
    });
    const cmp = compareRuns(currentWithExtraT, baselineNoT60);
    const t60 = cmp.perThreshold.find(p => p.threshold === 60);
    expect(t60).toBeDefined();
    if (!t60) return; // narrow type for TS
    expect(t60.f1.baseline).toBeNull();
    expect(t60.f1.delta).toBeNull();
  });

  it('compareRuns with both null-cost runs yields cost delta null (not NaN)', () => {
    const runA = makeRun({ bestF1Threshold: 50, cost: null, thresholds: [threshRow(50, 0.7)] });
    const runB = makeRun({ bestF1Threshold: 50, cost: null, thresholds: [threshRow(50, 0.75)] });
    const cmp = compareRuns(runA, runB);
    expect(cmp.cost.delta).toBeNull();
    const json = JSON.stringify(cmp);
    expect(json).not.toContain('NaN');
  });
});
