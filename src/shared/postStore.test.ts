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

import type { UnflaggedPost } from './types';

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
