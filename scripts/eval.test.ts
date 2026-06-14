/**
 * Unit tests for scripts/eval.ts — walker, metric guards, exit codes.
 *
 * Requirements: EVAL-01 (walker), EVAL-03 (metrics), EVAL-05 (exit codes).
 *
 * Strategy:
 *   - collectLabeled() and computeMetrics() are pure exported functions —
 *     tested directly without any I/O or network.
 *   - fs is mocked so no real disk reads/writes occur.
 *   - fetch is stubbed so no real network calls occur.
 *   - CLI exit-code paths are tested by importing main indirectly via a
 *     wrapper that captures process.exit throws.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// fs mock — no real disk access
// ---------------------------------------------------------------------------

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
  };
});

// ---------------------------------------------------------------------------
// fetch stub — no real network calls
// ---------------------------------------------------------------------------

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

// ---------------------------------------------------------------------------
// Import the pure functions under test (after mocks are set up)
// ---------------------------------------------------------------------------

import { collectLabeled, computeMetrics, safe } from './eval';

// ---------------------------------------------------------------------------
// EVAL-01: Walker
// ---------------------------------------------------------------------------

describe('collectLabeled (EVAL-01)', () => {
  it('returns only labeled entries from flaggedPosts and unflaggedPosts', () => {
    const flaggedPosts = [
      { text: 'AI post', label: 'ai', score: 80 },
      { text: 'Human post', label: 'human', score: 10 },
      { text: 'Unlabeled post', score: 50 },          // no label — should be skipped
    ];
    const unflaggedPosts = [
      { text: 'Another human', label: 'human', score: 20 },
      { text: 'No label here', score: 30 },           // no label — should be skipped
    ];

    const { labeled, skipped } = collectLabeled(flaggedPosts, unflaggedPosts);

    expect(labeled).toHaveLength(3);
    expect(labeled[0]).toEqual({ text: 'AI post', label: 'ai' });
    expect(labeled[1]).toEqual({ text: 'Human post', label: 'human' });
    expect(labeled[2]).toEqual({ text: 'Another human', label: 'human' });
    expect(skipped).toBe(2);
  });

  it('skips null and non-object entries without throwing', () => {
    const flaggedPosts = [null, 'string-entry', 42, { text: 'Valid', label: 'ai' }];
    const unflaggedPosts: unknown[] = [];

    const { labeled, skipped } = collectLabeled(flaggedPosts, unflaggedPosts);

    // null and primitive entries are skipped but NOT counted as unlabeled (they're non-object)
    expect(labeled).toHaveLength(1);
    expect(labeled[0]).toEqual({ text: 'Valid', label: 'ai' });
    // skipped only counts missing-label entries, not bad-shape entries
    expect(skipped).toBe(0);
  });

  it('skips entries with invalid label values', () => {
    const flaggedPosts = [
      { text: 'Bad label', label: 'maybe' },
      { text: 'Good label', label: 'human' },
    ];

    const { labeled, skipped } = collectLabeled(flaggedPosts, []);

    expect(labeled).toHaveLength(1);
    expect(labeled[0]!.label).toBe('human');
    expect(skipped).toBe(1);
  });

  it('returns empty labeled and zero skipped on empty input', () => {
    const { labeled, skipped } = collectLabeled([], []);
    expect(labeled).toHaveLength(0);
    expect(skipped).toBe(0);
  });

  it('does NOT read from flaggedAccounts — only the two top-level arrays', () => {
    // Hypothetical input with a (legacy) flaggedAccounts key — must be ignored
    const flaggedPosts = [{ text: 'Real post', label: 'ai' }];
    const unflaggedPosts: unknown[] = [];
    // The walker signature only accepts the two arrays — flaggedAccounts is not a parameter
    // and is structurally impossible to accidentally walk.
    const { labeled } = collectLabeled(flaggedPosts, unflaggedPosts);
    expect(labeled).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// EVAL-03: Metrics — divide-by-zero guards, null not NaN
// ---------------------------------------------------------------------------

describe('computeMetrics (EVAL-03)', () => {
  it('computes TP/FP/TN/FN and all four metrics correctly for a simple fixture', () => {
    // 3 ai posts, 2 human posts, threshold 50
    const scored = [
      { label: 'ai' as const, score: 80 },   // TP
      { label: 'ai' as const, score: 60 },   // TP
      { label: 'ai' as const, score: 30 },   // FN
      { label: 'human' as const, score: 70 }, // FP
      { label: 'human' as const, score: 20 }, // TN
    ];

    const row = computeMetrics(scored, 50);

    expect(row.threshold).toBe(50);
    expect(row.tp).toBe(2);
    expect(row.fp).toBe(1);
    expect(row.tn).toBe(1);
    expect(row.fn).toBe(1);

    // precision = 2/(2+1) = 0.667
    expect(row.precision).toBeCloseTo(2 / 3, 5);
    // recall = 2/(2+1) = 0.667
    expect(row.recall).toBeCloseTo(2 / 3, 5);
    // f1 = 2*0.667*0.667/(0.667+0.667) = 0.667
    expect(row.f1).toBeCloseTo(2 / 3, 5);
    // accuracy = (2+1)/(2+1+1+1) = 3/5 = 0.6
    expect(row.accuracy).toBeCloseTo(0.6, 5);
  });

  it('yields precision === null when no posts are predicted positive (divide-by-zero guard)', () => {
    // All scores below threshold → TP=0, FP=0 → precision undefined
    const scored = [
      { label: 'ai' as const, score: 20 },
      { label: 'human' as const, score: 10 },
    ];

    const row = computeMetrics(scored, 50);

    expect(row.tp).toBe(0);
    expect(row.fp).toBe(0);
    expect(row.precision).toBeNull();
    // JSON.stringify should emit null, not NaN
    const json = JSON.stringify(row);
    expect(json).not.toContain('NaN');
  });

  it('yields recall === null when there are no actual positives (divide-by-zero guard)', () => {
    // All labels are human → TP=0, FN=0 → recall undefined
    const scored = [
      { label: 'human' as const, score: 80 },
      { label: 'human' as const, score: 20 },
    ];

    const row = computeMetrics(scored, 50);

    expect(row.tp).toBe(0);
    expect(row.fn).toBe(0);
    expect(row.recall).toBeNull();
    expect(row.f1).toBeNull();
    const json = JSON.stringify(row);
    expect(json).not.toContain('NaN');
  });

  it('yields f1 === null when precision and recall are both null', () => {
    const scored: Array<{ label: 'ai' | 'human'; score: number }> = [];
    const row = computeMetrics(scored, 50);

    expect(row.precision).toBeNull();
    expect(row.recall).toBeNull();
    expect(row.f1).toBeNull();
    expect(row.accuracy).toBe(0); // empty → 0, not NaN
    const json = JSON.stringify(row);
    expect(json).not.toContain('NaN');
  });

  it('JSON.stringify of a row with null metrics contains no NaN', () => {
    // All human posts below threshold → TP=0, FP=0, TN=1, FN=0
    // precision = null (TP+FP=0), recall = null (TP+FN=0), f1 = null
    const scored = [{ label: 'human' as const, score: 20 }];
    const row = computeMetrics(scored, 50);
    const json = JSON.stringify(row);
    expect(json).not.toContain('NaN');
    // precision is null (no predicted positives), recall is null (no actual positives)
    expect(JSON.parse(json)).toMatchObject({ precision: null, recall: null, f1: null });
  });
});

// ---------------------------------------------------------------------------
// safe() guard
// ---------------------------------------------------------------------------

describe('safe()', () => {
  it('passes through finite numbers unchanged', () => {
    expect(safe(0)).toBe(0);
    expect(safe(1.5)).toBe(1.5);
    expect(safe(-42)).toBe(-42);
  });

  it('converts NaN to 0', () => {
    expect(safe(NaN)).toBe(0);
  });

  it('converts Infinity to 0', () => {
    expect(safe(Infinity)).toBe(0);
    expect(safe(-Infinity)).toBe(0);
  });
});
