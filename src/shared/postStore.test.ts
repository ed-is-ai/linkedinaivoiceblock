/**
 * Unit tests for postStore.ts — persistUnflaggedPost FIFO helper.
 *
 * Requirements: D-01 (capture below FLAG_THRESHOLD), D-02 (cap 200),
 * D-03 (dedup by urn), D-04 (record engine + score), D-05 (truncate at 1000 chars),
 * D-06 (store UNLABELED — never write label).
 *
 * Uses the same in-memory chrome.storage.local mock pattern as traceStore.test.ts.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// In-memory chrome.storage.local mock
// ---------------------------------------------------------------------------

let store: Record<string, unknown> = {};

function makeChrome() {
  return {
    storage: {
      local: {
        get: vi.fn(async (keys: string[]) => {
          const arr = Array.isArray(keys) ? keys : [keys];
          const out: Record<string, unknown> = {};
          for (const k of arr) if (k in store) out[k] = store[k];
          return out;
        }),
        set: vi.fn(async (values: Record<string, unknown>) => {
          Object.assign(store, values);
        }),
      },
    },
  };
}

beforeEach(() => {
  store = {};
  vi.resetModules();
  vi.stubGlobal('chrome', makeChrome());
});

// ---------------------------------------------------------------------------
// Tests for persistUnflaggedPost
// ---------------------------------------------------------------------------

import type { UnflaggedPost, StoredPost } from './types';

describe('persistUnflaggedPost — basic behaviour', () => {
  it('(a) appending to an empty store writes a 1-entry unflaggedPosts array, newest-first', async () => {
    const { persistUnflaggedPost } = await import('./postStore');

    await persistUnflaggedPost({
      urn: 'urn:li:activity:1',
      authorId: 'author-1',
      authorName: 'Alice',
      score: 10,
      text: 'Hello world',
      engineUsed: 'heuristic',
    });

    const result = store['unflaggedPosts'] as UnflaggedPost[];
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(1);
    expect(result[0]!.urn).toBe('urn:li:activity:1');
  });

  it('(b) calling again with the same urn is a no-op (dedup by urn)', async () => {
    const { persistUnflaggedPost } = await import('./postStore');

    await persistUnflaggedPost({
      urn: 'urn:li:activity:1',
      authorId: 'author-1',
      authorName: 'Alice',
      score: 10,
      text: 'First call',
      engineUsed: 'heuristic',
    });
    await persistUnflaggedPost({
      urn: 'urn:li:activity:1',
      authorId: 'author-1',
      authorName: 'Alice',
      score: 10,
      text: 'Second call — should not be stored',
      engineUsed: 'heuristic',
    });

    const result = store['unflaggedPosts'] as UnflaggedPost[];
    expect(result).toHaveLength(1);
    expect(result[0]!.text).toBe('First call');
  });

  it('(c) text longer than 1000 chars is trimmed and sliced to exactly 1000 chars', async () => {
    const { persistUnflaggedPost } = await import('./postStore');

    const longText = 'A'.repeat(1500);
    await persistUnflaggedPost({
      urn: 'urn:li:activity:2',
      authorId: 'author-2',
      authorName: 'Bob',
      score: 5,
      text: longText,
      engineUsed: 'heuristic',
    });

    const result = store['unflaggedPosts'] as UnflaggedPost[];
    expect(result[0]!.text).toHaveLength(1000);
  });

  it('(d) adding a new unique urn to a 200-entry store keeps length at 200 (oldest evicted)', async () => {
    const { persistUnflaggedPost } = await import('./postStore');

    // Pre-populate store with 200 entries directly
    const existing: UnflaggedPost[] = Array.from({ length: 200 }, (_, i) => ({
      urn: `urn:li:activity:existing-${i}`,
      authorId: `author-${i}`,
      authorName: `Author ${i}`,
      score: 10,
      text: `Post ${i}`,
      seenAt: Date.now() - (200 - i) * 1000,
      engineUsed: 'heuristic' as const,
    }));
    store['unflaggedPosts'] = existing;

    await persistUnflaggedPost({
      urn: 'urn:li:activity:new-unique',
      authorId: 'author-new',
      authorName: 'New Author',
      score: 8,
      text: 'New post',
      engineUsed: 'heuristic',
    });

    const result = store['unflaggedPosts'] as UnflaggedPost[];
    expect(result).toHaveLength(200);
    // Newest entry at index 0
    expect(result[0]!.urn).toBe('urn:li:activity:new-unique');
    // Oldest (index 0 of the original 200) should have been evicted
    expect(result.some((p) => p.urn === 'urn:li:activity:existing-0')).toBe(false);
  });

  it('(e) written entry carries score, engineUsed, seenAt (timestamp) and NO label property', async () => {
    const { persistUnflaggedPost } = await import('./postStore');
    const before = Date.now();

    await persistUnflaggedPost({
      urn: 'urn:li:activity:3',
      authorId: 'author-3',
      authorName: 'Carol',
      score: 20,
      text: 'Some post',
      engineUsed: 'llm',
    });

    const after = Date.now();
    const result = store['unflaggedPosts'] as UnflaggedPost[];
    const entry = result[0]!;

    expect(entry.score).toBe(20);
    expect(entry.engineUsed).toBe('llm');
    expect(typeof entry.seenAt).toBe('number');
    expect(entry.seenAt).toBeGreaterThanOrEqual(before);
    expect(entry.seenAt).toBeLessThanOrEqual(after);

    // D-06: no label property should exist on the written entry
    expect('label' in entry).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tests for setPostLabel (D-08)
// ---------------------------------------------------------------------------

function makeStoredPost(urn: string, label?: string): StoredPost {
  const post: StoredPost = {
    urn,
    authorId: 'author-1',
    authorName: 'Alice',
    score: 70,
    text: 'Some AI post',
    hiddenAt: Date.now(),
  };
  if (label !== undefined) post.label = label;
  return post;
}

function makeUnflaggedPost(urn: string, label?: string): UnflaggedPost {
  const post: UnflaggedPost = {
    urn,
    authorId: 'author-2',
    authorName: 'Bob',
    score: 10,
    text: 'Some human post',
    seenAt: Date.now(),
    engineUsed: 'heuristic',
  };
  if (label !== undefined) post.label = label;
  return post;
}

describe('setPostLabel — routes storedPosts first', () => {
  it('(a) labels a storedPost entry and writes only storedPosts', async () => {
    const originalUnflagged = [makeUnflaggedPost('urn:3')];
    store['storedPosts'] = [makeStoredPost('urn:1'), makeStoredPost('urn:2')];
    store['unflaggedPosts'] = originalUnflagged;

    const { setPostLabel } = await import('./postStore');
    await setPostLabel('urn:1', 'ai');

    const stored = store['storedPosts'] as StoredPost[];
    expect(stored.find(p => p.urn === 'urn:1')?.label).toBe('ai');
    // unflaggedPosts must NOT be rewritten — same reference as what we put in
    expect(store['unflaggedPosts']).toBe(originalUnflagged);
  });

  it('(b) overwrites an existing label on storedPost (explicit user action)', async () => {
    store['storedPosts'] = [makeStoredPost('urn:1', 'human')];

    const { setPostLabel } = await import('./postStore');
    await setPostLabel('urn:1', 'ai');

    const stored = store['storedPosts'] as StoredPost[];
    expect(stored[0]!.label).toBe('ai');
  });

  it('(c) falls through to unflaggedPosts when urn not in storedPosts', async () => {
    store['storedPosts'] = [makeStoredPost('urn:1')];
    store['unflaggedPosts'] = [makeUnflaggedPost('urn:2')];

    const { setPostLabel } = await import('./postStore');
    await setPostLabel('urn:2', 'human');

    const unflagged = store['unflaggedPosts'] as UnflaggedPost[];
    expect(unflagged.find(p => p.urn === 'urn:2')?.label).toBe('human');
    // storedPosts must NOT be rewritten
    const stored = store['storedPosts'] as StoredPost[];
    expect(stored[0]!.label).toBeUndefined();
  });

  it('(d) issues exactly one storageSet call per invocation', async () => {
    const mockSet = vi.fn(async (values: Record<string, unknown>) => {
      Object.assign(store, values);
    });
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn(async (keys: string[]) => {
            const out: Record<string, unknown> = {};
            for (const k of keys) if (k in store) out[k] = store[k];
            return out;
          }),
          set: mockSet,
        },
      },
    });
    store['storedPosts'] = [makeStoredPost('urn:1')];

    const { setPostLabel } = await import('./postStore');
    await setPostLabel('urn:1', 'ai');

    expect(mockSet).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Tests for bulkSeedLabels (D-09)
// ---------------------------------------------------------------------------

describe('bulkSeedLabels — idempotent bulk seed', () => {
  it('(e) seeds all unlabeled storedPosts with "ai" and unlabeled unflaggedPosts with "human"', async () => {
    store['storedPosts'] = [makeStoredPost('urn:s1'), makeStoredPost('urn:s2')];
    store['unflaggedPosts'] = [makeUnflaggedPost('urn:u1'), makeUnflaggedPost('urn:u2')];

    const { bulkSeedLabels } = await import('./postStore');
    await bulkSeedLabels();

    const stored = store['storedPosts'] as StoredPost[];
    const unflagged = store['unflaggedPosts'] as UnflaggedPost[];
    expect(stored.every(p => p.label === 'ai')).toBe(true);
    expect(unflagged.every(p => p.label === 'human')).toBe(true);
  });

  it('(f) never overwrites a manually-set label (idempotency — D-09)', async () => {
    store['storedPosts'] = [makeStoredPost('urn:s1', 'human'), makeStoredPost('urn:s2')];
    store['unflaggedPosts'] = [makeUnflaggedPost('urn:u1', 'ai'), makeUnflaggedPost('urn:u2')];

    const { bulkSeedLabels } = await import('./postStore');
    await bulkSeedLabels();

    const stored = store['storedPosts'] as StoredPost[];
    const unflagged = store['unflaggedPosts'] as UnflaggedPost[];
    // manual labels preserved
    expect(stored.find(p => p.urn === 'urn:s1')?.label).toBe('human');
    expect(unflagged.find(p => p.urn === 'urn:u1')?.label).toBe('ai');
    // unlabeled entries seeded
    expect(stored.find(p => p.urn === 'urn:s2')?.label).toBe('ai');
    expect(unflagged.find(p => p.urn === 'urn:u2')?.label).toBe('human');
  });

  it('(g) calling bulkSeedLabels twice produces the same storage state as calling it once', async () => {
    store['storedPosts'] = [makeStoredPost('urn:s1')];
    store['unflaggedPosts'] = [makeUnflaggedPost('urn:u1')];

    const { bulkSeedLabels } = await import('./postStore');
    await bulkSeedLabels();
    const afterFirst = JSON.stringify(store);
    await bulkSeedLabels();
    const afterSecond = JSON.stringify(store);

    expect(afterFirst).toBe(afterSecond);
  });

  it('(h) a manual setPostLabel before bulkSeedLabels is preserved (D-09)', async () => {
    store['storedPosts'] = [makeStoredPost('urn:s1'), makeStoredPost('urn:s2')];
    store['unflaggedPosts'] = [];

    const { setPostLabel, bulkSeedLabels } = await import('./postStore');
    await setPostLabel('urn:s1', 'human'); // manual correction
    await bulkSeedLabels();

    const stored = store['storedPosts'] as StoredPost[];
    expect(stored.find(p => p.urn === 'urn:s1')?.label).toBe('human'); // preserved
    expect(stored.find(p => p.urn === 'urn:s2')?.label).toBe('ai');    // seeded
  });
});
