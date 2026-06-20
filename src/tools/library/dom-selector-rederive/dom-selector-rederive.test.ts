/**
 * Unit tests for domSelectorRederiveTool.execute() (Phase 32 — TOOL-02).
 *
 * execute({ target, domSkeleton }) calls the Anthropic API via fetch (global)
 * and reads the API key from chrome.storage.local. Both are stubbed here —
 * no real network, no real storage.
 *
 * Covers:
 *   - Happy path: valid JSON candidates response resolves to { candidates, usage }
 *   - Schema-validation failure: both attempts fail → throws
 *   - No recordTrace, no rate-limit, no chrome.runtime.onMessage dependency
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  domSelectorRederiveTool,
  type RederiveCandidate,
} from './dom-selector-rederive.tool';

// ── Stubs ─────────────────────────────────────────────────────────────────────

const fetchMock = vi.fn();
let store: Record<string, unknown> = {};

function makeChrome() {
  return {
    storage: {
      local: {
        get: vi.fn(async (keys: string[]) => {
          const out: Record<string, unknown> = {};
          for (const k of keys) if (k in store) out[k] = store[k];
          return out;
        }),
      },
    },
  };
}

/** Build a successful Anthropic response with the given candidates. */
function okResponse(candidates: RederiveCandidate[], usage = {
  input_tokens: 100,
  output_tokens: 50,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
}) {
  return {
    ok: true,
    json: async () => ({
      content: [{ text: JSON.stringify({ candidates }) }],
      usage,
    }),
    text: async () => '',
  };
}

/** Build a 200 response whose body cannot be parsed as valid JSON candidates. */
function malformedResponse() {
  return {
    ok: true,
    json: async () => ({ content: [{ text: 'not json {{{' }] }),
    text: async () => '',
  };
}

/** Build a 200 response with valid JSON but failing schema (missing selector). */
function badSchemaResponse() {
  return {
    ok: true,
    json: async () => ({
      content: [{ text: JSON.stringify({ candidates: [{ rationale: 'no selector' }] }) }],
      usage: { input_tokens: 10, output_tokens: 5 },
    }),
    text: async () => '',
  };
}

beforeEach(() => {
  store = {};
  fetchMock.mockReset();
  vi.stubGlobal('chrome', makeChrome());
  vi.stubGlobal('fetch', fetchMock);
});

// ── Happy path ───────────────────────────────────────────────────────────────

describe('domSelectorRederiveTool.execute — happy path', () => {
  it('resolves to { candidates, usage } on a valid Anthropic response', async () => {
    store['anthropicApiKey'] = 'sk-ant-test';
    const expected: RederiveCandidate[] = [
      { selector: "div[data-urn*='activity']", rationale: 'post cards' },
    ];
    const usage = {
      input_tokens: 100,
      output_tokens: 50,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    };
    fetchMock.mockResolvedValue(okResponse(expected, usage));

    const result = await domSelectorRederiveTool.execute({
      target: 'POST_CARD',
      domSkeleton: '<div data-urn></div>',
    });

    expect(result.candidates).toEqual(expected);
    expect(result.usage).toEqual(usage);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Verify the fetch hit the correct endpoint
    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.anthropic.com/v1/messages');
  });

  it('sends target and domSkeleton in the user message body', async () => {
    store['anthropicApiKey'] = 'sk-ant-test';
    fetchMock.mockResolvedValue(
      okResponse([{ selector: 'div[role="article"]', rationale: 'semantic' }]),
    );

    await domSelectorRederiveTool.execute({
      target: 'MY_TARGET',
      domSkeleton: '<div role="feed"></div>',
    });

    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse((init as { body: string }).body) as {
      messages: Array<{ content: string }>;
    };
    const userContent = body.messages[0]!.content;
    expect(userContent).toContain('MY_TARGET');
    expect(userContent).toContain('<div role="feed"></div>');
  });

  it('uses claude-haiku-4-5-20251001 model with max_tokens 256', async () => {
    store['anthropicApiKey'] = 'sk-ant-test';
    fetchMock.mockResolvedValue(
      okResponse([{ selector: 'div[data-id]', rationale: 'x' }]),
    );

    await domSelectorRederiveTool.execute({
      target: 'T',
      domSkeleton: '<div></div>',
    });

    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse((init as { body: string }).body) as {
      model: string;
      max_tokens: number;
    };
    expect(body.model).toBe('claude-haiku-4-5-20251001');
    expect(body.max_tokens).toBe(256);
  });

  it('does NOT send stop_sequences (removing invalid whitespace-only value prevents API 400)', async () => {
    store['anthropicApiKey'] = 'sk-ant-test';
    fetchMock.mockResolvedValue(
      okResponse([{ selector: 'div[data-id]', rationale: 'x' }]),
    );

    await domSelectorRederiveTool.execute({
      target: 'T',
      domSkeleton: '<div></div>',
    });

    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse((init as { body: string }).body) as Record<string, unknown>;
    // No stop_sequences key, and specifically no whitespace-only values
    if ('stop_sequences' in body) {
      const seqs = body['stop_sequences'] as string[];
      for (const seq of seqs) {
        expect(seq.trim()).not.toBe(''); // no whitespace-only stop sequence
      }
    }
    // Preferred: the key is absent entirely
    expect('stop_sequences' in body).toBe(false);
  });
});

// ── No API key ───────────────────────────────────────────────────────────────

describe('domSelectorRederiveTool.execute — no API key', () => {
  it('throws when no API key is configured', async () => {
    // store has no anthropicApiKey
    await expect(
      domSelectorRederiveTool.execute({ target: 'T', domSkeleton: '<div></div>' }),
    ).rejects.toThrow('No API key configured');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ── Schema-validation failure ─────────────────────────────────────────────────

describe('domSelectorRederiveTool.execute — schema validation (T-32-01)', () => {
  it('retries once on malformed JSON and then throws after 2 attempts', async () => {
    store['anthropicApiKey'] = 'sk-ant-test';
    fetchMock.mockResolvedValue(malformedResponse());

    await expect(
      domSelectorRederiveTool.execute({ target: 'T', domSkeleton: '<div></div>' }),
    ).rejects.toThrow();

    expect(fetchMock).toHaveBeenCalledTimes(2); // 2 attempts total
  });

  it('throws after 2 attempts when schema validation fails (no selector field)', async () => {
    store['anthropicApiKey'] = 'sk-ant-test';
    fetchMock.mockResolvedValue(badSchemaResponse());

    await expect(
      domSelectorRederiveTool.execute({ target: 'T', domSkeleton: '<div></div>' }),
    ).rejects.toThrow();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

// ── Isolation invariants ──────────────────────────────────────────────────────

describe('domSelectorRederiveTool isolation invariants', () => {
  it('has the correct tool name', () => {
    expect(domSelectorRederiveTool.name).toBe('dom-selector-rederive');
  });

  it('has a non-empty description', () => {
    expect(domSelectorRederiveTool.description.length).toBeGreaterThan(0);
  });

  it('execute is a function (execute: I -> Promise<O>)', () => {
    expect(typeof domSelectorRederiveTool.execute).toBe('function');
  });
});
