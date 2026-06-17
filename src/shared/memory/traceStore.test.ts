/**
 * Unit tests for traceStore.ts — FIFO-capped appendTrace (cap 500).
 *
 * Requirements: TRACE-03 (FIFO cap 500), D-09 (newest-first, prepend + pop idiom).
 *
 * Uses an in-memory chrome.storage.local mock (same store + makeChrome() pattern
 * as src/background/ratelimit.test.ts).
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
// Helper to build a minimal valid TraceEntry
// ---------------------------------------------------------------------------

import type { TraceEntry } from '../types';

function makeEntry(overrides: Partial<TraceEntry> = {}): TraceEntry {
  return {
    model: 'claude-sonnet-4-6',
    systemPrompt: 'system',
    userPrompt: 'user',
    inputTokens: 100,
    outputTokens: 50,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    costUsd: 0.0015,
    timestamp: new Date().toISOString(),
    source: 'detector',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('appendTrace — basic behaviour', () => {
  it('(a) appending to an empty store yields a 1-element llbTraces', async () => {
    const { appendTrace } = await import('./traceStore');
    await appendTrace(makeEntry());

    const result = store['llbTraces'] as TraceEntry[];
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(1);
  });

  it('(b) the newest entry is at index 0 (prepend order)', async () => {
    const { appendTrace } = await import('./traceStore');
    const first = makeEntry({ timestamp: '2026-06-13T00:00:00.000Z', model: 'claude-sonnet-4-6' });
    const second = makeEntry({ timestamp: '2026-06-13T00:01:00.000Z', model: 'claude-haiku-4-5-20251001' });

    await appendTrace(first);
    await appendTrace(second);

    const result = store['llbTraces'] as TraceEntry[];
    expect(result).toHaveLength(2);
    // The most recently appended entry (second) should be at index 0
    expect(result[0]!.model).toBe('claude-haiku-4-5-20251001');
    expect(result[1]!.model).toBe('claude-sonnet-4-6');
  });
});

describe('appendTrace — FIFO cap at 500 (TRACE-03, D-09)', () => {
  it('(c) after 501 appends, length is exactly 500 and the first-appended entry is evicted', async () => {
    const { appendTrace, TRACE_STORE_CAP } = await import('./traceStore');

    expect(TRACE_STORE_CAP).toBe(500);

    // The very first entry we append — a unique timestamp marker we can detect later
    const firstEntry = makeEntry({ timestamp: '1970-01-01T00:00:00.000Z' });
    await appendTrace(firstEntry);

    // Append 500 more entries (501 total)
    for (let i = 1; i <= 500; i++) {
      await appendTrace(makeEntry({ timestamp: new Date(i * 1000).toISOString() }));
    }

    const result = store['llbTraces'] as TraceEntry[];
    expect(result).toHaveLength(500);

    // The first-appended entry (index 499 after 500 prepends, then evicted by the 501st)
    // should NOT be present anywhere in the array
    const foundFirst = result.some((e) => e.timestamp === '1970-01-01T00:00:00.000Z');
    expect(foundFirst).toBe(false);

    // The most recently appended entry should be at index 0
    expect(result[0]!.timestamp).toBe(new Date(500 * 1000).toISOString());
  });
});

describe('TRACE_STORE_CAP export', () => {
  it('exports TRACE_STORE_CAP === 500', async () => {
    const { TRACE_STORE_CAP } = await import('./traceStore');
    expect(TRACE_STORE_CAP).toBe(500);
  });
});
