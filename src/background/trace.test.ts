/**
 * Handler-level trace tests for Plan 24-02 (TRACE-01, TRACE-02, TRACE-03).
 *
 * Tests that both the SCORE_POST handler (detector) and REDERIVE_SELECTOR handler
 * (rederiver) append correctly shaped TraceEntry objects to llbTraces via appendTrace.
 * Also verifies the 500-entry FIFO cap end-to-end, error tracing (D-03), and
 * api-key absence (T-24-04).
 *
 * Harness: same messageListener-capture + makeChrome + fetchMock pattern as ratelimit.test.ts.
 * The onMessage listener is captured at import time; per-test, store is reset and
 * chrome/fetch are re-stubbed, then index.ts is re-imported via vi.resetModules().
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { TraceEntry } from '../shared/types';

type MsgListener = (
  msg: Record<string, unknown>,
  sender: unknown,
  sendResponse: (r: unknown) => void,
) => unknown;

let store: Record<string, unknown> = {};
let messageListener: MsgListener | null = null;
const fetchMock = vi.fn();

/** Successful Anthropic response with a detector-style content and a full usage object. */
function okDetectorResponse(
  usage = {
    input_tokens: 1000,
    output_tokens: 200,
    cache_creation_input_tokens: 500,
    cache_read_input_tokens: 50,
  },
) {
  const content = JSON.stringify({ score: 75, signals: { 'hook-story': 40, 'em-dash': 35 } });
  return {
    ok: true,
    json: async () => ({ content: [{ text: content }], usage }),
    text: async () => '',
  };
}

/** Successful Anthropic response for a rederiver call. */
function okRederiveResponse(
  usage = {
    input_tokens: 800,
    output_tokens: 100,
    cache_creation_input_tokens: 200,
    cache_read_input_tokens: 0,
  },
) {
  const content = JSON.stringify({
    candidates: [{ selector: 'div[data-urn]', rationale: 'post cards' }],
  });
  return {
    ok: true,
    json: async () => ({ content: [{ text: content }], usage }),
    text: async () => '',
  };
}

/** Failed Anthropic response (HTTP 401). */
function failResponse(status = 401, bodyText = 'Unauthorized') {
  return {
    ok: false,
    status,
    json: async () => ({}),
    text: async () => bodyText,
  };
}

function makeChrome() {
  return {
    runtime: {
      onInstalled: { addListener: vi.fn() },
      onStartup: { addListener: vi.fn() },
      onMessage: {
        addListener: vi.fn((fn: MsgListener) => {
          messageListener = fn;
        }),
      },
    },
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
      onChanged: { addListener: vi.fn() },
    },
    action: { setBadgeText: vi.fn(), setBadgeBackgroundColor: vi.fn() },
  };
}

/** Invoke SCORE_POST and return the sendResponse spy. */
function sendScorePost(postText = 'Test post text'): { sendResponse: ReturnType<typeof vi.fn>; ret: unknown } {
  const sendResponse = vi.fn();
  const ret = messageListener!(
    { type: 'SCORE_POST', postText },
    {},
    sendResponse,
  );
  return { sendResponse, ret };
}

/** Invoke REDERIVE_SELECTOR and return the sendResponse spy. */
function sendRederive(): { sendResponse: ReturnType<typeof vi.fn>; ret: unknown } {
  const sendResponse = vi.fn();
  const ret = messageListener!(
    { type: 'REDERIVE_SELECTOR', target: 'POST_CARD', domSkeleton: '<div data-urn></div>' },
    {},
    sendResponse,
  );
  return { sendResponse, ret };
}

beforeEach(async () => {
  store = {};
  messageListener = null;
  fetchMock.mockReset();
  vi.resetModules();
  vi.stubGlobal('chrome', makeChrome());
  vi.stubGlobal('fetch', fetchMock);
  await import('./index');
  expect(messageListener).toBeTypeOf('function');
});

// ── Test 1: successful SCORE_POST appends detector trace ─────────────────────

describe('SCORE_POST — success trace (TRACE-01)', () => {
  it('appends one llbTraces entry with source detector, non-zero tokens, and costUsd > 0', async () => {
    store.anthropicApiKey = 'sk-ant-test-key';
    const usage = {
      input_tokens: 1000,
      output_tokens: 200,
      cache_creation_input_tokens: 500,
      cache_read_input_tokens: 50,
    };
    fetchMock.mockResolvedValue(okDetectorResponse(usage));

    const { sendResponse } = sendScorePost('Hello world post');
    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
    // trace write is fire-and-forget (lands after sendResponse) — wait for it
    await vi.waitFor(() => expect((store.llbTraces as TraceEntry[] | undefined)?.length).toBe(1));

    // Check trace was appended
    const traces = store.llbTraces as TraceEntry[] | undefined;
    expect(traces).toBeDefined();
    expect(traces!.length).toBe(1);

    const entry = traces![0]!;
    expect(entry.source).toBe('detector');
    expect(entry.model).toBe('claude-sonnet-4-6');
    expect(entry.inputTokens).toBe(1000);
    expect(entry.outputTokens).toBe(200);
    expect(entry.cacheCreationTokens).toBe(500);
    expect(entry.cacheReadTokens).toBe(50);
    expect(entry.costUsd).toBeGreaterThan(0);
    expect(entry.error).toBeUndefined();
    expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    // userPrompt is truncated to 500 chars
    expect(entry.userPrompt).toBe('Hello world post');
    // systemPrompt is the full SYSTEM_PROMPT (non-empty)
    expect(entry.systemPrompt.length).toBeGreaterThan(0);
  });
});

// ── Test 2: successful REDERIVE_SELECTOR appends rederiver trace (TRACE-02) ──

describe('REDERIVE_SELECTOR — success trace (TRACE-02)', () => {
  it('appends one llbTraces entry with source rederiver after rate-limit allows', async () => {
    store.anthropicApiKey = 'sk-ant-test-key';
    // Seed storage so rate-limit check allows it (no cooloff, no daily cap)
    store.llbRederiveLastCallMs = 0;
    store.llbRederiveDateKey = '2000-01-01';
    store.llbRederiveCallsToday = 0;

    const usage = {
      input_tokens: 800,
      output_tokens: 100,
      cache_creation_input_tokens: 200,
      cache_read_input_tokens: 0,
    };
    fetchMock.mockResolvedValue(okRederiveResponse(usage));

    const { sendResponse } = sendRederive();
    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
    // trace write is fire-and-forget (lands after sendResponse) — wait for it
    await vi.waitFor(() => expect((store.llbTraces as TraceEntry[] | undefined)?.length).toBe(1));

    const traces = store.llbTraces as TraceEntry[] | undefined;
    expect(traces).toBeDefined();
    expect(traces!.length).toBe(1);

    const entry = traces![0]!;
    expect(entry.source).toBe('rederiver');
    expect(entry.model).toBe('claude-haiku-4-5-20251001');
    expect(entry.inputTokens).toBe(800);
    expect(entry.outputTokens).toBe(100);
    expect(entry.costUsd).toBeGreaterThan(0);
    expect(entry.error).toBeUndefined();
  });
});

// ── Test 3: failed SCORE_POST (401) appends error trace with tokens 0 ────────

describe('SCORE_POST — failure trace (D-03)', () => {
  it('appends error trace with tokens 0 and costUsd 0 when fetch returns 401', async () => {
    store.anthropicApiKey = 'sk-ant-test-key';
    fetchMock.mockResolvedValue(failResponse(401, 'Unauthorized'));

    const { sendResponse } = sendScorePost('Some post text');
    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
    // error trace write is fire-and-forget (lands after sendResponse) — wait for it
    await vi.waitFor(() => expect((store.llbTraces as TraceEntry[] | undefined)?.length).toBe(1));

    // sendResponse should carry the error
    expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));

    // Trace should exist with error and zero tokens/cost
    const traces = store.llbTraces as TraceEntry[] | undefined;
    expect(traces).toBeDefined();
    expect(traces!.length).toBe(1);

    const entry = traces![0]!;
    expect(entry.source).toBe('detector');
    expect(entry.inputTokens).toBe(0);
    expect(entry.outputTokens).toBe(0);
    expect(entry.cacheCreationTokens).toBe(0);
    expect(entry.cacheReadTokens).toBe(0);
    expect(entry.costUsd).toBe(0);
    expect(entry.error).toBeTruthy();
    expect(entry.error).toMatch(/API 401/);
  });
});

// ── Test 4: api key must never appear in any serialized TraceEntry (T-24-04) ─

describe('T-24-04 — api key absence', () => {
  it('the seeded anthropicApiKey string does not appear in any serialized TraceEntry', async () => {
    const SECRET_KEY = 'sk-ant-secret-must-not-leak';
    store.anthropicApiKey = SECRET_KEY;
    fetchMock.mockResolvedValue(okDetectorResponse());

    const { sendResponse } = sendScorePost('Test post');
    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
    // trace write is fire-and-forget (lands after sendResponse) — wait for it
    await vi.waitFor(() => expect((store.llbTraces as TraceEntry[] | undefined)?.length ?? 0).toBeGreaterThan(0));

    const traces = store.llbTraces as TraceEntry[] | undefined;
    expect(traces).toBeDefined();
    expect(traces!.length).toBeGreaterThan(0);

    // The api key must NOT appear anywhere in the serialized trace store
    const serialized = JSON.stringify(traces);
    expect(serialized).not.toContain(SECRET_KEY);
  });
});

// ── Test 5: FIFO cap — 501 calls → exactly 500 entries (TRACE-03) ────────────

describe('TRACE-03 — FIFO cap after 501 successful SCORE_POST calls', () => {
  it('stores exactly 500 entries after 501 calls (oldest evicted)', async () => {
    store.anthropicApiKey = 'sk-ant-test-key';
    fetchMock.mockResolvedValue(okDetectorResponse());

    // Drive 501 successful SCORE_POST calls sequentially
    for (let i = 0; i < 501; i++) {
      const sendResponse = vi.fn();
      messageListener!(
        { type: 'SCORE_POST', postText: `Post number ${i}` },
        {},
        sendResponse,
      );
      // Wait for each call to complete before the next
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
    }

    // trace writes are fire-and-forget + serialized — wait for the chain to drain to the cap
    await vi.waitFor(
      () => expect((store.llbTraces as TraceEntry[] | undefined)?.length).toBe(500),
      { timeout: 10_000 },
    );

    const traces = store.llbTraces as TraceEntry[] | undefined;
    expect(traces).toBeDefined();
    expect(traces!.length).toBe(500);
  }, 60_000); // allow up to 60s for 501 sequential calls
});
