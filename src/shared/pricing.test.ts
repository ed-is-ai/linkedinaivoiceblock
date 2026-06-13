/**
 * Unit tests for pricing.ts — MODEL_PRICING constant + computeCostUsd cache-aware formula.
 *
 * Requirements: TRACE-02 (cost capture), D-05 (cache-aware formula), D-06 (pricing values),
 * D-08 (unknown model → costUsd 0 + unpriced flag).
 */

import { describe, it, expect } from 'vitest';
import { MODEL_PRICING, computeCostUsd } from './pricing';

// ---------------------------------------------------------------------------
// MODEL_PRICING constant shape
// ---------------------------------------------------------------------------

describe('MODEL_PRICING', () => {
  it('contains claude-sonnet-4-6 at $3/$15 per MTok', () => {
    expect(MODEL_PRICING['claude-sonnet-4-6']).toEqual({
      inputPerMTok: 3,
      outputPerMTok: 15,
    });
  });

  it('contains claude-haiku-4-5-20251001 at $1/$5 per MTok', () => {
    expect(MODEL_PRICING['claude-haiku-4-5-20251001']).toEqual({
      inputPerMTok: 1,
      outputPerMTok: 5,
    });
  });

  it('returns undefined for an unknown model', () => {
    expect(MODEL_PRICING['claude-foo']).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// computeCostUsd — flat (no cache)
// ---------------------------------------------------------------------------

describe('computeCostUsd — flat (no cache tokens)', () => {
  it('Sonnet detector call: 1000 input + 500 output → $0.0105', () => {
    // (1000×3 + 500×15) / 1e6 = (3000 + 7500) / 1e6 = 0.0105
    const result = computeCostUsd('claude-sonnet-4-6', {
      input_tokens: 1000,
      output_tokens: 500,
    });
    expect(result.costUsd).toBeCloseTo(0.0105, 8);
    expect(result.unpriced).toBe(false);
  });

  it('Haiku rederiver: 200 input + 100 output → $0.0007', () => {
    // (200×1 + 100×5) / 1e6 = (200 + 500) / 1e6 = 0.0007
    const result = computeCostUsd('claude-haiku-4-5-20251001', {
      input_tokens: 200,
      output_tokens: 100,
    });
    expect(result.costUsd).toBeCloseTo(0.0007, 8);
    expect(result.unpriced).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// computeCostUsd — cache-aware
// ---------------------------------------------------------------------------

describe('computeCostUsd — cache-aware formula (D-05)', () => {
  it('Sonnet with cache: input 100, cache_creation 1000, cache_read 2000, output 50 → $0.00540', () => {
    // costUsd = (100×3 + 1000×3×1.25 + 2000×3×0.10 + 50×15) / 1e6
    //         = (300 + 3750 + 600 + 750) / 1e6
    //         = 5400 / 1e6
    //         = 0.00540
    const result = computeCostUsd('claude-sonnet-4-6', {
      input_tokens: 100,
      output_tokens: 50,
      cache_creation_input_tokens: 1000,
      cache_read_input_tokens: 2000,
    });
    expect(result.costUsd).toBeCloseTo(0.0054, 6);
    expect(result.unpriced).toBe(false);
  });

  it('treats undefined cache fields as 0 (no crash, same as flat cost)', () => {
    const withCache = computeCostUsd('claude-sonnet-4-6', {
      input_tokens: 100,
      output_tokens: 50,
      cache_creation_input_tokens: undefined,
      cache_read_input_tokens: undefined,
    });
    const withoutCache = computeCostUsd('claude-sonnet-4-6', {
      input_tokens: 100,
      output_tokens: 50,
    });
    expect(withCache.costUsd).toBeCloseTo(withoutCache.costUsd, 8);
    expect(withCache.unpriced).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// computeCostUsd — unknown model (D-08)
// ---------------------------------------------------------------------------

describe('computeCostUsd — unknown model (D-08)', () => {
  it('returns costUsd 0 and unpriced true for an unknown model', () => {
    const result = computeCostUsd('claude-foo', {
      input_tokens: 1000,
      output_tokens: 500,
    });
    expect(result.costUsd).toBe(0);
    expect(result.unpriced).toBe(true);
  });

  it('returns costUsd 0 and unpriced true for an unknown model even with cache tokens', () => {
    const result = computeCostUsd('claude-opus-99', {
      input_tokens: 500,
      output_tokens: 200,
      cache_creation_input_tokens: 1000,
      cache_read_input_tokens: 500,
    });
    expect(result.costUsd).toBe(0);
    expect(result.unpriced).toBe(true);
  });
});
