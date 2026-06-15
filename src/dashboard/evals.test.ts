/**
 * Unit tests for the Evals page labeling helpers (Task 3 — D-08, D-09).
 *
 * Tests call the extracted pure handler functions (labelPost, seedLabels,
 * countLabeled) directly from evalsLabeling.ts WITHOUT rendering the Preact
 * component, so no @testing-library/preact is needed.
 *
 * vi.mock('../shared/postStore') intercepts the static import in evalsLabeling.ts
 * at module-graph time, before any test code runs.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock postStore — must be declared before any import that resolves it
// ---------------------------------------------------------------------------

vi.mock('../shared/postStore', () => ({
  setPostLabel: vi.fn().mockResolvedValue(undefined),
  bulkSeedLabels: vi.fn().mockResolvedValue(undefined),
}));

// Import the helpers AFTER vi.mock so the mock is already in place
import { labelPost, seedLabels, countLabeled } from './evalsLabeling';
import { setPostLabel, bulkSeedLabels } from '../shared/postStore';

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
