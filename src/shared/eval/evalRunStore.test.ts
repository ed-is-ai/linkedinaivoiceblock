/**
 * Unit tests for evalRunStore.ts — FIFO-capped appendEvalRun (cap 50).
 *
 * Requirements: D-03 (FIFO cap 50, newest-first), D-06 (partial run marker).
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
// Helper to build a minimal valid EvalRun
// ---------------------------------------------------------------------------

import type { EvalRun } from './runs';

function makeRun(overrides: Partial<EvalRun> = {}): EvalRun {
  const runAt = overrides.runAt ?? new Date().toISOString();
  return {
    id: `${runAt}::heuristic`,
    runAt,
    source: 'dashboard',
    engine: 'heuristic',
    model: 'heuristic',
    dataset: { source: 'storage', label: 'storage @ test', total: 10, labeled: 8 },
    counts: { total: 8, labeled: 8, skipped: 0, errored: 0, scored: 8 },
    cost: null,
    thresholds: [],
    bestF1Threshold: 60,
    errorAnalysis: { threshold: 60, falsePositives: [], falseNegatives: [] },
    posts: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('appendEvalRun — basic behaviour', () => {
  it('(a) appending to an empty store yields a 1-element evalRuns array', async () => {
    const { appendEvalRun } = await import('./evalRunStore');
    await appendEvalRun(makeRun());

    const result = store['evalRuns'] as EvalRun[];
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(1);
  });

  it('(b) the newest entry is at index 0 (prepend order)', async () => {
    const { appendEvalRun } = await import('./evalRunStore');
    const first = makeRun({ runAt: '2026-06-13T00:00:00.000Z', model: 'heuristic' });
    const second = makeRun({ runAt: '2026-06-13T00:01:00.000Z', model: 'claude-sonnet-4-6' });
    first.id = `${first.runAt}::heuristic`;
    second.id = `${second.runAt}::llm`;

    await appendEvalRun(first);
    await appendEvalRun(second);

    const result = store['evalRuns'] as EvalRun[];
    expect(result).toHaveLength(2);
    // The most recently appended entry (second) should be at index 0
    expect(result[0]!.runAt).toBe('2026-06-13T00:01:00.000Z');
    expect(result[1]!.runAt).toBe('2026-06-13T00:00:00.000Z');
  });
});

describe('appendEvalRun — FIFO cap at 50 (D-03)', () => {
  it('(c) after 51 appends, length is exactly 50 and the first-appended entry is evicted (pop, not slice)', async () => {
    const { appendEvalRun, MAX_EVAL_RUNS } = await import('./evalRunStore');

    expect(MAX_EVAL_RUNS).toBe(50);

    // The very first entry — unique runAt we can detect later
    const firstRun = makeRun({ runAt: '1970-01-01T00:00:00.000Z' });
    firstRun.id = '1970-01-01T00:00:00.000Z::heuristic';
    await appendEvalRun(firstRun);

    // Append 50 more (51 total)
    for (let i = 1; i <= 50; i++) {
      const runAt = new Date(i * 1000).toISOString();
      const run = makeRun({ runAt });
      run.id = `${runAt}::heuristic`;
      await appendEvalRun(run);
    }

    const result = store['evalRuns'] as EvalRun[];
    expect(result).toHaveLength(50);

    // The first-appended entry should have been evicted
    const foundFirst = result.some((r) => r.runAt === '1970-01-01T00:00:00.000Z');
    expect(foundFirst).toBe(false);

    // The most recently appended entry should be at index 0
    expect(result[0]!.runAt).toBe(new Date(50 * 1000).toISOString());
  });
});

describe('appendEvalRun — non-rejecting on write error', () => {
  it('(d) does not reject when storageSet throws', async () => {
    // Override the mock to throw on set
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn(async () => ({})),
          set: vi.fn(async () => { throw new Error('storage quota exceeded'); }),
        },
      },
    });

    const { appendEvalRun } = await import('./evalRunStore');
    // Must not throw
    await expect(appendEvalRun(makeRun())).resolves.toBeUndefined();
  });
});

describe('getEvalRuns — read accessor', () => {
  it('(e) returns empty array when evalRuns key is absent', async () => {
    const { getEvalRuns } = await import('./evalRunStore');
    const result = await getEvalRuns();
    expect(result).toEqual([]);
  });

  it('(f) returns the stored array when evalRuns is present', async () => {
    const { appendEvalRun, getEvalRuns } = await import('./evalRunStore');
    const run = makeRun({ runAt: '2026-06-14T12:00:00.000Z' });
    run.id = '2026-06-14T12:00:00.000Z::heuristic';
    await appendEvalRun(run);

    const result = await getEvalRuns();
    expect(result).toHaveLength(1);
    expect(result[0]!.runAt).toBe('2026-06-14T12:00:00.000Z');
  });
});

describe('EVAL_RUNS_KEY and MAX_EVAL_RUNS exports', () => {
  it('(g) EVAL_RUNS_KEY === "evalRuns"', async () => {
    const { EVAL_RUNS_KEY } = await import('./evalRunStore');
    expect(EVAL_RUNS_KEY).toBe('evalRuns');
  });

  it('(h) MAX_EVAL_RUNS === 50', async () => {
    const { MAX_EVAL_RUNS } = await import('./evalRunStore');
    expect(MAX_EVAL_RUNS).toBe(50);
  });
});
