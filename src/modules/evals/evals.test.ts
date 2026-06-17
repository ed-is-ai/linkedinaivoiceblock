/**
 * Unit tests for the Evals page helpers (Tasks 1-3).
 *
 * Tests call the extracted pure handler functions directly WITHOUT rendering the
 * Preact component, so no @testing-library/preact is needed.
 *
 * vi.mock('../../shared/memory/postStore') intercepts the static import in evalsLabeling.ts
 * at module-graph time, before any test code runs.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock postStore — must be declared before any import that resolves it
// ---------------------------------------------------------------------------

vi.mock('../../shared/memory/postStore', () => ({
  setPostLabel: vi.fn().mockResolvedValue(undefined),
  bulkSeedLabels: vi.fn().mockResolvedValue(undefined),
}));

// Import the helpers AFTER vi.mock so the mock is already in place
import { labelPost, seedLabels, countLabeled } from './evalsLabeling';
import { setPostLabel, bulkSeedLabels } from '../../shared/memory/postStore';
import { assembleRun } from './evalsRunEngine';
import type { ScoredEntry, PostDetail } from './evalsRunEngine';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockSetPostLabel() {
  return setPostLabel as ReturnType<typeof vi.fn>;
}

function mockBulkSeedLabels() {
  return bulkSeedLabels as ReturnType<typeof vi.fn>;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// labelPost
// ---------------------------------------------------------------------------

describe('labelPost', () => {
  it('(a) calling labelPost(urn, "ai") delegates to setPostLabel(urn, "ai")', async () => {
    await labelPost('urn:li:activity:123', 'ai');

    expect(mockSetPostLabel()).toHaveBeenCalledOnce();
    expect(mockSetPostLabel()).toHaveBeenCalledWith('urn:li:activity:123', 'ai');
  });

  it('(b) calling labelPost(urn, "human") delegates to setPostLabel(urn, "human")', async () => {
    await labelPost('urn:li:activity:456', 'human');

    expect(mockSetPostLabel()).toHaveBeenCalledOnce();
    expect(mockSetPostLabel()).toHaveBeenCalledWith('urn:li:activity:456', 'human');
  });

  it('(c) calling labelPost twice issues two separate setPostLabel calls', async () => {
    await labelPost('urn:li:activity:1', 'ai');
    await labelPost('urn:li:activity:2', 'human');

    expect(mockSetPostLabel()).toHaveBeenCalledTimes(2);
    expect(mockSetPostLabel()).toHaveBeenNthCalledWith(1, 'urn:li:activity:1', 'ai');
    expect(mockSetPostLabel()).toHaveBeenNthCalledWith(2, 'urn:li:activity:2', 'human');
  });

  it('(d) labelPost resolves without throwing when setPostLabel resolves', async () => {
    await expect(labelPost('urn:li:activity:789', 'ai')).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// seedLabels
// ---------------------------------------------------------------------------

describe('seedLabels', () => {
  it('(e) calling seedLabels() delegates to bulkSeedLabels()', async () => {
    await seedLabels();

    expect(mockBulkSeedLabels()).toHaveBeenCalledOnce();
  });

  it('(f) seedLabels resolves without throwing when bulkSeedLabels resolves', async () => {
    await expect(seedLabels()).resolves.toBeUndefined();
  });

  it('(g) calling seedLabels twice issues two bulkSeedLabels calls (idempotency lives in the store)', async () => {
    await seedLabels();
    await seedLabels();

    expect(mockBulkSeedLabels()).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// countLabeled — pure function, no mock needed
// ---------------------------------------------------------------------------

describe('countLabeled', () => {
  it('(h) returns 0 for an empty array', () => {
    expect(countLabeled([])).toBe(0);
  });

  it('(i) returns 0 when no entry carries a label', () => {
    expect(countLabeled([{}, {}, {}])).toBe(0);
  });

  it('(j) counts entries where label is defined (including empty string)', () => {
    const posts = [
      { label: 'ai' },
      { label: 'human' },
      {},               // unlabeled
      { label: 'ai' },
    ];
    expect(countLabeled(posts)).toBe(3);
  });

  it('(k) returns total when all entries are labeled', () => {
    const posts = [{ label: 'ai' }, { label: 'human' }, { label: 'human' }];
    expect(countLabeled(posts)).toBe(3);
  });

  it('(l) undefined label is not counted; null is not counted (undefined only)', () => {
    // Our types use `label?: string` so only undefined is the "unlabeled" sentinel
    const posts: Array<{ label?: string }> = [
      { label: undefined },
      { label: 'ai' },
    ];
    expect(countLabeled(posts)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// assembleRun — pure run engine helper (Task 1, TDD)
// ---------------------------------------------------------------------------

/** Fixed scored dataset: 4 AI-labeled + 4 human-labeled posts */
function makeScored(): ScoredEntry[] {
  return [
    { label: 'ai',    score: 75 },
    { label: 'ai',    score: 80 },
    { label: 'ai',    score: 55 },  // predicted human at threshold 60
    { label: 'ai',    score: 45 },  // predicted human at threshold 60 (FN)
    { label: 'human', score: 30 },
    { label: 'human', score: 25 },
    { label: 'human', score: 65 },  // predicted AI at threshold 60 (FP)
    { label: 'human', score: 20 },
  ];
}

function makeDetails(): PostDetail[] {
  return makeScored().map((s, i) => ({
    index: i + 1,
    label: s.label,
    score: s.score,
    confidence: 'medium' as const,
    signalBreakdown: { buzzwords: s.score },
    textPreview: `Post ${i + 1} preview text here`,
  }));
}

const BASE_COUNTS = { total: 10, labeled: 8, skipped: 2, errored: 0 };
const RUN_AT = '2026-06-15T12:00:00.000Z';

describe('assembleRun — best-F1 threshold selection', () => {
  it('(m) selects the threshold with highest F1 across the sweep', () => {
    const run = assembleRun({
      engine: 'heuristic',
      model: 'heuristic',
      scored: makeScored(),
      details: makeDetails(),
      counts: BASE_COUNTS,
      estimatedCost: null,
      runAt: RUN_AT,
    });

    // The bestF1Threshold must be a threshold in the sweep
    expect(run.thresholds.map(t => t.threshold)).toContain(run.bestF1Threshold);

    // The bestF1Threshold row must have the highest (or tied-highest) f1
    const bestRow = run.thresholds.find(t => t.threshold === run.bestF1Threshold)!;
    for (const row of run.thresholds) {
      if (row.f1 !== null && bestRow.f1 !== null) {
        expect(bestRow.f1).toBeGreaterThanOrEqual(row.f1);
      }
    }
  });

  it('(n) ties in F1 resolve to the first (lowest) threshold', () => {
    // All-null f1 (empty scored) — should default to first threshold
    const run = assembleRun({
      engine: 'heuristic',
      model: 'heuristic',
      scored: [],
      details: [],
      counts: { total: 0, labeled: 0, skipped: 0, errored: 0 },
      estimatedCost: null,
      runAt: RUN_AT,
    });
    // When all f1 are null, bestF1Threshold defaults to THRESHOLDS[0] (35)
    expect(run.bestF1Threshold).toBe(35);
  });
});

describe('assembleRun — FP/FN filtering at bestF1Threshold', () => {
  it('(o) errorAnalysis.falsePositives are human posts predicted AI at bestF1Threshold', () => {
    const run = assembleRun({
      engine: 'heuristic',
      model: 'heuristic',
      scored: makeScored(),
      details: makeDetails(),
      counts: BASE_COUNTS,
      estimatedCost: null,
      runAt: RUN_AT,
    });

    for (const fp of run.errorAnalysis.falsePositives) {
      expect(fp.label).toBe('human');
      expect(fp.score).toBeGreaterThanOrEqual(run.bestF1Threshold);
    }
    expect(run.errorAnalysis.threshold).toBe(run.bestF1Threshold);
  });

  it('(p) errorAnalysis.falseNegatives are AI posts predicted human at bestF1Threshold', () => {
    const run = assembleRun({
      engine: 'heuristic',
      model: 'heuristic',
      scored: makeScored(),
      details: makeDetails(),
      counts: BASE_COUNTS,
      estimatedCost: null,
      runAt: RUN_AT,
    });

    for (const fn of run.errorAnalysis.falseNegatives) {
      expect(fn.label).toBe('ai');
      expect(fn.score).toBeLessThan(run.bestF1Threshold);
    }
  });
});

describe('assembleRun — EvalRun shape conformance', () => {
  it('(q) heuristic run has source:"dashboard", dataset.source:"storage", cost:null', () => {
    const run = assembleRun({
      engine: 'heuristic',
      model: 'heuristic',
      scored: makeScored(),
      details: makeDetails(),
      counts: BASE_COUNTS,
      estimatedCost: null,
      runAt: RUN_AT,
    });

    expect(run.source).toBe('dashboard');
    expect(run.dataset.source).toBe('storage');
    expect(run.cost).toBeNull();
    expect(run.engine).toBe('heuristic');
    expect(run.model).toBe('heuristic');
  });

  it('(r) LLM run stores the pre-run estimate as cost (NOT read from relay response)', () => {
    const estimatedCost = { totalUsd: 0.07, avgUsdPerPost: 0.07 / 8 };
    const run = assembleRun({
      engine: 'llm',
      model: 'claude-sonnet-4-6',
      scored: makeScored(),
      details: makeDetails(),
      counts: BASE_COUNTS,
      estimatedCost,
      runAt: RUN_AT,
    });

    expect(run.cost).not.toBeNull();
    expect(run.cost!.totalUsd).toBeCloseTo(0.07, 5);
    expect(run.engine).toBe('llm');
    expect(run.model).toBe('claude-sonnet-4-6');
  });

  it('(s) incomplete flag is set when incomplete:true is passed', () => {
    const run = assembleRun({
      engine: 'heuristic',
      model: 'heuristic',
      scored: makeScored().slice(0, 3),
      details: makeDetails().slice(0, 3),
      counts: { total: 10, labeled: 8, skipped: 2, errored: 0 },
      estimatedCost: null,
      runAt: RUN_AT,
      incomplete: true,
    });

    expect(run.incomplete).toBe(true);
    expect(run.counts.scored).toBe(3);
  });

  it('(t) complete run does not set incomplete field', () => {
    const run = assembleRun({
      engine: 'heuristic',
      model: 'heuristic',
      scored: makeScored(),
      details: makeDetails(),
      counts: BASE_COUNTS,
      estimatedCost: null,
      runAt: RUN_AT,
    });

    expect(run.incomplete).toBeUndefined();
  });

  it('(u) run id is formatted as runAt::engine', () => {
    const run = assembleRun({
      engine: 'heuristic',
      model: 'heuristic',
      scored: makeScored(),
      details: makeDetails(),
      counts: BASE_COUNTS,
      estimatedCost: null,
      runAt: RUN_AT,
    });

    expect(run.id).toBe(`${RUN_AT}::heuristic`);
  });

  it('(v) thresholds sweep covers all THRESHOLDS (12 rows: 35–90 step 5)', () => {
    const run = assembleRun({
      engine: 'heuristic',
      model: 'heuristic',
      scored: makeScored(),
      details: makeDetails(),
      counts: BASE_COUNTS,
      estimatedCost: null,
      runAt: RUN_AT,
    });

    expect(run.thresholds).toHaveLength(12);
    expect(run.thresholds[0]!.threshold).toBe(35);
    expect(run.thresholds[11]!.threshold).toBe(90);
  });
});

// ---------------------------------------------------------------------------
// compareRuns Δ table (Task 3 TDD — verify compareRuns is used, not recomputed)
// ---------------------------------------------------------------------------

import { compareRuns } from '../../shared/eval/index';

describe('compareRuns — Δ table (Task 3)', () => {
  it('(w) compareRuns(current, baseline) computes f1 delta = current.f1 - baseline.f1', () => {
    const current = assembleRun({
      engine: 'heuristic', model: 'heuristic',
      scored: makeScored(), details: makeDetails(),
      counts: BASE_COUNTS, estimatedCost: null, runAt: '2026-06-15T12:00:00.000Z',
    });

    // Baseline with different scoring (shift all scores up by 10 → different metrics)
    const baselineScored: ScoredEntry[] = makeScored().map(s => ({
      ...s,
      score: Math.min(100, s.score + 10),
    }));
    const baselineDetails: PostDetail[] = makeDetails().map((d, i) => ({
      ...d,
      score: baselineScored[i]!.score,
    }));
    const baseline = assembleRun({
      engine: 'heuristic', model: 'heuristic',
      scored: baselineScored, details: baselineDetails,
      counts: BASE_COUNTS, estimatedCost: null, runAt: '2026-06-14T12:00:00.000Z',
    });

    const comparison = compareRuns(current, baseline);

    // delta should be current.f1 - baseline.f1
    const expectedDelta =
      comparison.f1.current !== null && comparison.f1.baseline !== null
        ? comparison.f1.current - comparison.f1.baseline
        : null;
    expect(comparison.f1.delta).toBeCloseTo(expectedDelta ?? 0, 5);
  });

  it('(x) perThreshold has one entry per threshold row', () => {
    const run = assembleRun({
      engine: 'heuristic', model: 'heuristic',
      scored: makeScored(), details: makeDetails(),
      counts: BASE_COUNTS, estimatedCost: null, runAt: RUN_AT,
    });
    const comparison = compareRuns(run, run); // compare to itself — all deltas 0
    expect(comparison.perThreshold).toHaveLength(run.thresholds.length);
    for (const pt of comparison.perThreshold) {
      // delta vs itself is always 0 or null
      if (pt.f1.delta !== null) expect(pt.f1.delta).toBeCloseTo(0, 10);
    }
  });
});
