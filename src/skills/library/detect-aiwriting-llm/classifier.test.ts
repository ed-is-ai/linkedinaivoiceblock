/**
 * Unit tests for classifier.ts — classifyPost response parsing, score clamping,
 * error propagation, usage passthrough, and confidence derivation.
 *
 * Fetch is always stubbed — no real network or API key used.
 * Covers the contract that both the service worker (src/background/index.ts)
 * and the eval CLI (scripts/eval.ts) depend on.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { classifyPost, SYSTEM_PROMPT } from './classifier';

// ---------------------------------------------------------------------------
// Fetch stub
// ---------------------------------------------------------------------------

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

// ---------------------------------------------------------------------------
// Mock response helpers
// ---------------------------------------------------------------------------

function okClassifyResponse(score = 75, signals: Record<string, number> = { 'hook-story': 40, 'em-dash': 35 }) {
  const content = JSON.stringify({ score, signals, reasoning: 'test' });
  return {
    ok: true,
    json: async () => ({
      content: [{ text: content }],
      usage: {
        input_tokens: 1000,
        output_tokens: 200,
        cache_creation_input_tokens: 500,
        cache_read_input_tokens: 50,
      },
    }),
    text: async () => '',
  };
}

function fencedClassifyResponse(score = 75, signals: Record<string, number> = { 'em-dash': 35 }) {
  const inner = JSON.stringify({ score, signals, reasoning: 'test' });
  const content = `\`\`\`json\n${inner}\n\`\`\``;
  return {
    ok: true,
    json: async () => ({
      content: [{ text: content }],
      usage: { input_tokens: 800, output_tokens: 150 },
    }),
    text: async () => '',
  };
}

function errorResponse(status = 401, body = 'unauthorized') {
  return {
    ok: false,
    status,
    json: async () => ({}),
    text: async () => body,
  };
}

// ---------------------------------------------------------------------------
// SYSTEM_PROMPT
// ---------------------------------------------------------------------------

describe('SYSTEM_PROMPT', () => {
  it('is a non-empty string longer than 100 characters', () => {
    expect(typeof SYSTEM_PROMPT).toBe('string');
    expect(SYSTEM_PROMPT.length).toBeGreaterThan(100);
  });
});

// ---------------------------------------------------------------------------
// classifyPost — success path
// ---------------------------------------------------------------------------

describe('classifyPost — success', () => {
  it('returns { result, usage } with engineUsed "llm" and usage passthrough', async () => {
    fetchMock.mockResolvedValue(okClassifyResponse(75));
    const { result, usage } = await classifyPost('some post text', 'sk-ant-test');
    expect(result.engineUsed).toBe('llm');
    expect(usage).toBeDefined();
    expect(usage!.input_tokens).toBe(1000);
    expect(usage!.output_tokens).toBe(200);
    expect(usage!.cache_creation_input_tokens).toBe(500);
    expect(usage!.cache_read_input_tokens).toBe(50);
  });

  it('passes the API key in x-api-key header (never in return value)', async () => {
    fetchMock.mockResolvedValue(okClassifyResponse());
    await classifyPost('text', 'my-secret-key');
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('my-secret-key');
  });

  it('captures the LLM reasoning string when present', async () => {
    fetchMock.mockResolvedValue(okClassifyResponse());
    const { result } = await classifyPost('text', 'key');
    expect(result.reasoning).toBe('test');
  });

  it('leaves reasoning undefined when the response omits it', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{ text: JSON.stringify({ score: 50, signals: { buzzword: 50 } }) }],
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
    });
    const { result } = await classifyPost('text', 'key');
    expect(result.reasoning).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// classifyPost — score clamping
// ---------------------------------------------------------------------------

describe('classifyPost — score clamping', () => {
  it('clamps score above 100 to exactly 100', async () => {
    fetchMock.mockResolvedValue(okClassifyResponse(150));
    const { result } = await classifyPost('text', 'key');
    expect(result.score).toBe(100);
  });

  it('clamps score below 0 to exactly 0', async () => {
    fetchMock.mockResolvedValue(okClassifyResponse(-10));
    const { result } = await classifyPost('text', 'key');
    expect(result.score).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// classifyPost — markdown fence stripping
// ---------------------------------------------------------------------------

describe('classifyPost — markdown fence stripping', () => {
  it('parses response wrapped in ```json fences correctly', async () => {
    fetchMock.mockResolvedValue(fencedClassifyResponse(65));
    const { result } = await classifyPost('text', 'key');
    expect(result.score).toBe(65);
    expect(result.engineUsed).toBe('llm');
  });
});

// ---------------------------------------------------------------------------
// classifyPost — confidence derivation
// ---------------------------------------------------------------------------

describe('classifyPost — confidence derivation', () => {
  it('score >= 60 → "high"', async () => {
    fetchMock.mockResolvedValue(okClassifyResponse(60));
    const { result } = await classifyPost('text', 'key');
    expect(result.confidence).toBe('high');
  });

  it('score 35–59 → "medium"', async () => {
    fetchMock.mockResolvedValue(okClassifyResponse(45));
    const { result } = await classifyPost('text', 'key');
    expect(result.confidence).toBe('medium');
  });

  it('score < 35 → "low"', async () => {
    fetchMock.mockResolvedValue(okClassifyResponse(20));
    const { result } = await classifyPost('text', 'key');
    expect(result.confidence).toBe('low');
  });

  it('score exactly 35 → "medium" (boundary)', async () => {
    fetchMock.mockResolvedValue(okClassifyResponse(35));
    const { result } = await classifyPost('text', 'key');
    expect(result.confidence).toBe('medium');
  });
});

// ---------------------------------------------------------------------------
// classifyPost — HTTP error propagation
// ---------------------------------------------------------------------------

describe('classifyPost — HTTP error', () => {
  it('rejects with an Error whose message contains the status code on 401', async () => {
    fetchMock.mockResolvedValue(errorResponse(401, 'unauthorized'));
    await expect(classifyPost('text', 'bad-key')).rejects.toThrow('401');
  });

  it('rejects with an Error whose message contains the status code on 429', async () => {
    fetchMock.mockResolvedValue(errorResponse(429, 'rate limit exceeded'));
    await expect(classifyPost('text', 'key')).rejects.toThrow('429');
  });
});
