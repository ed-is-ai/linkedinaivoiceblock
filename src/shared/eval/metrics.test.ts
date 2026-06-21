/**
 * Unit tests for src/shared/eval/metrics.ts — pure eval core.
 *
 * Tests the pure, host-agnostic functions: buildPostData, filterErrors,
 * computeMetrics. All functions are pure (no I/O, no DOM, no chrome.*).
 *
 * Requirements: EVAL-06 (buildPostData, engine core), EVAL-07 (filterErrors).
 */

import { describe, it, expect } from 'vitest';
import {
  buildPostData,
  computeMetrics,
  filterErrors,
  safe,
  formatSignalBreakdown,
  type PostDetail,
} from './index.js';

// ---------------------------------------------------------------------------
// buildPostData
// ---------------------------------------------------------------------------

describe('buildPostData', () => {
  it('maps text → postText', () => {
    const entry = { urn: 'urn:li:activity:1', authorId: 'alice', authorName: 'Alice', text: 'Hello world' };
    const pd = buildPostData(entry);
    expect(pd.postText).toBe('Hello world');
  });

  it('copies urn, authorId, authorName through unchanged', () => {
    const entry = { urn: 'urn:li:activity:123', authorId: 'bob', authorName: 'Bob Smith', text: 'test' };
    const pd = buildPostData(entry);
    expect(pd.urn).toBe('urn:li:activity:123');
    expect(pd.authorId).toBe('bob');
    expect(pd.authorName).toBe('Bob Smith');
  });

  it('stubs authorProfileUrl containing the authorId', () => {
    const entry = { urn: 'urn:li:activity:1', authorId: 'alice', authorName: 'Alice', text: 'Hello' };
    const pd = buildPostData(entry);
    expect(pd.authorProfileUrl).toContain('alice');
    expect(pd.authorProfileUrl).toContain('linkedin.com');
  });

  it('defaults all fields to empty string / unknown for an empty object', () => {
    const pd = buildPostData({});
    expect(pd.postText).toBe('');
    expect(pd.authorId).toBe('');
    expect(pd.authorName).toBe('');
    expect(pd.urn).toBe('');
    expect(pd.authorProfileUrl).toContain('unknown');
  });

  it('defaults postText to empty string when text field is missing', () => {
    const pd = buildPostData({ authorId: 'charlie' });
    expect(pd.postText).toBe('');
  });

  it('ignores non-string values by defaulting to empty string', () => {
    const pd = buildPostData({ urn: 42, authorId: null, text: true });
    expect(pd.urn).toBe('');
    expect(pd.authorId).toBe('');
    expect(pd.postText).toBe('');
  });
});

// ---------------------------------------------------------------------------
// computeMetrics (moved from eval.ts — behavior must be unchanged)
// ---------------------------------------------------------------------------

describe('computeMetrics', () => {
  it('computes TP/FP/TN/FN and all four metrics correctly', () => {
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
    expect(row.precision).toBeCloseTo(2 / 3, 5);
    expect(row.recall).toBeCloseTo(2 / 3, 5);
    expect(row.f1).toBeCloseTo(2 / 3, 5);
    expect(row.accuracy).toBeCloseTo(0.6, 5);
  });

  it('yields precision === null when no posts are predicted positive (divide-by-zero guard)', () => {
    const scored = [
      { label: 'ai' as const, score: 20 },
      { label: 'human' as const, score: 10 },
    ];
    const row = computeMetrics(scored, 50);
    expect(row.precision).toBeNull();
    const json = JSON.stringify(row);
    expect(json).not.toContain('NaN');
  });

  it('yields recall === null when there are no actual positives (divide-by-zero guard)', () => {
    const scored = [
      { label: 'human' as const, score: 80 },
      { label: 'human' as const, score: 20 },
    ];
    const row = computeMetrics(scored, 50);
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
    expect(row.accuracy).toBe(0);
    const json = JSON.stringify(row);
    expect(json).not.toContain('NaN');
  });
});

// ---------------------------------------------------------------------------
// filterErrors (EVAL-07 / D-05)
// ---------------------------------------------------------------------------

describe('filterErrors', () => {
  const details: PostDetail[] = [
    { index: 1, label: 'human', score: 70, confidence: 'high', signalBreakdown: {}, textPreview: 'human high' },
    { index: 2, label: 'ai',    score: 30, confidence: 'low',  signalBreakdown: {}, textPreview: 'ai low' },
    { index: 3, label: 'ai',    score: 80, confidence: 'high', signalBreakdown: {}, textPreview: 'ai high' },
  ];

  it('returns false positives: label=human && score >= threshold', () => {
    const fp = filterErrors(details, 60, 'human');
    expect(fp).toHaveLength(1);
    expect(fp[0]!.index).toBe(1);
    expect(fp[0]!.label).toBe('human');
    expect(fp[0]!.score).toBe(70);
  });

  it('returns false negatives: label=ai && score < threshold', () => {
    const fn = filterErrors(details, 60, 'ai');
    expect(fn).toHaveLength(1);
    expect(fn[0]!.index).toBe(2);
    expect(fn[0]!.label).toBe('ai');
    expect(fn[0]!.score).toBe(30);
  });

  it('returns empty array when no FP at threshold', () => {
    // threshold above all scores — no human entry scores >= 100
    const fp = filterErrors(details, 100, 'human');
    expect(fp).toHaveLength(0);
  });

  it('returns empty array when no FN at threshold', () => {
    // threshold below all scores — all AI entries score >= 0
    const fn = filterErrors(details, 0, 'ai');
    expect(fn).toHaveLength(0);
  });

  it('includes boundary score at threshold for FP (score === threshold is predicted AI)', () => {
    const boundaryDetails: PostDetail[] = [
      { index: 1, label: 'human', score: 60, confidence: 'high', signalBreakdown: {}, textPreview: '' },
    ];
    const fp = filterErrors(boundaryDetails, 60, 'human');
    expect(fp).toHaveLength(1);
  });

  it('excludes boundary score from FN (score === threshold is predicted AI, not human)', () => {
    const boundaryDetails: PostDetail[] = [
      { index: 1, label: 'ai', score: 60, confidence: 'high', signalBreakdown: {}, textPreview: '' },
    ];
    const fn = filterErrors(boundaryDetails, 60, 'ai');
    // score >= threshold → predicted AI → not a FN
    expect(fn).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// safe() and formatSignalBreakdown (moved from eval.ts — quick smoke tests)
// ---------------------------------------------------------------------------

describe('safe()', () => {
  it('passes through finite numbers', () => {
    expect(safe(0)).toBe(0);
    expect(safe(1.5)).toBe(1.5);
  });
  it('converts NaN to 0', () => { expect(safe(NaN)).toBe(0); });
  it('converts Infinity to 0', () => { expect(safe(Infinity)).toBe(0); });
});

describe('formatSignalBreakdown', () => {
  it('renders (no signals) for an empty breakdown', () => {
    expect(formatSignalBreakdown({})).toContain('(no signals)');
  });
  it('lists signals highest-contribution first', () => {
    const out = formatSignalBreakdown({ 'em-dash': 12, buzzword: 18 });
    const lines = out.split('\n').map(l => l.trim().split(/\s+/)[0]);
    expect(lines).toEqual(['buzzword', 'em-dash']);
  });
  it('appends reasoning when provided', () => {
    expect(formatSignalBreakdown({ buzzword: 10 }, 'reason text')).toContain('reason text');
  });
});
