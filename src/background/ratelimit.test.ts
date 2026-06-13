/**
 * D8 rate-bounding tests for the service-worker LLM rederive path (ADAPT-05, ADAPT-06).
 *
 * The rate-limit functions are module-private to background/index.ts; they are exercised
 * through the real REDERIVE_SELECTOR onMessage handler. We capture the listener at import
 * time, seed chrome.storage.local state to simulate each scenario (latch held / cool-off /
 * daily cap / new-day reset / SW-restart survival), and assert fetch call counts + the
 * sendResponse payload. fetch is mocked; no real network.
 *
 * Requirements: ADAPT-05, ADAPT-06
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

type MsgListener = (
  msg: Record<string, unknown>,
  sender: unknown,
  sendResponse: (r: unknown) => void,
) => unknown;

let store: Record<string, unknown> = {};
let messageListener: MsgListener | null = null;
const fetchMock = vi.fn();

/** Resolved-value of a successful Anthropic response carrying a valid candidates payload. */
function okResponse(candidates: Array<{ selector: string; rationale: string }>) {
  return {
    ok: true,
    json: async () => ({ content: [{ text: JSON.stringify({ candidates }) }] }),
    text: async () => '',
  };
}

/** A 200 response whose body is not valid JSON — drives the parse/schema retry path. */
function malformedResponse() {
  return {
    ok: true,
    json: async () => ({ content: [{ text: 'not json {{{' }] }),
    text: async () => '',
  };
}

const TODAY = new Date().toISOString().slice(0, 10);
const flush = () => new Promise((r) => setTimeout(r, 0));

function makeChrome() {
  return {
    runtime: {
      onInstalled: { addListener: vi.fn() },
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

/** Invoke the captured REDERIVE_SELECTOR handler and return its sendResponse spy. */
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

// ── Happy path ───────────────────────────────────────────────────────────────

describe('REDERIVE_SELECTOR — happy path (ADAPT-03)', () => {
  it('calls fetch once to Haiku and returns the candidates as data when rate-limit allows', async () => {
    store.anthropicApiKey = 'sk-ant-test';
    fetchMock.mockResolvedValue(
      okResponse([{ selector: 'div[data-urn]', rationale: 'post cards' }]),
    );

    const { sendResponse, ret } = sendRederive();
    expect(ret).toBe(true); // channel kept open (Pitfall 6)
    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    const body = JSON.parse((init as { body: string }).body);
    expect(body.model).toBe('claude-haiku-4-5-20251001');
    expect(body.max_tokens).toBe(256);

    expect(sendResponse).toHaveBeenCalledWith({
      result: [{ selector: 'div[data-urn]', rationale: 'post cards' }],
    });
  });

  it('acquires the latch (count incremented, date set) and releases it after completion', async () => {
    store.anthropicApiKey = 'sk-ant-test';
    fetchMock.mockResolvedValue(okResponse([{ selector: 'div[data-urn]', rationale: 'x' }]));

    const { sendResponse } = sendRederive();
    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());

    expect(store.llbRederiveCallsToday).toBe(1);
    expect(store.llbRederiveDateKey).toBe(TODAY);
    expect(typeof store.llbRederiveLastCallMs).toBe('number');
    expect(store.llbRederiveInFlight).toBe(false); // released in finally
  });
});

// ── Single-flight latch / SW-restart survival ────────────────────────────────

describe('REDERIVE_SELECTOR — single-flight latch (ADAPT-05)', () => {
  it('refuses and does not fetch while the latch is held (survives a simulated SW restart)', async () => {
    // Latch persisted in storage from a prior (crashed/in-flight) invocation
    store.anthropicApiKey = 'sk-ant-test';
    store.llbRederiveInFlight = true;

    const { sendResponse } = sendRederive();
    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());

    expect(fetchMock).not.toHaveBeenCalled();
    expect(sendResponse).toHaveBeenCalledWith({ error: 'rate-limited: single-flight latch held' });
  });
});

// ── Cool-off ─────────────────────────────────────────────────────────────────

describe('REDERIVE_SELECTOR — 5-minute cool-off (ADAPT-05)', () => {
  it('refuses a second call within the cool-off window without fetching', async () => {
    store.anthropicApiKey = 'sk-ant-test';
    store.llbRederiveLastCallMs = Date.now(); // just called
    store.llbRederiveDateKey = TODAY;
    store.llbRederiveCallsToday = 1;

    const { sendResponse } = sendRederive();
    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());

    expect(fetchMock).not.toHaveBeenCalled();
    const arg = sendResponse.mock.calls[0]![0] as { error: string };
    expect(arg.error).toMatch(/^rate-limited: cooloff:/);
  });
});

// ── Daily cap + date rollover ────────────────────────────────────────────────

describe('REDERIVE_SELECTOR — daily cap of 5 (ADAPT-05)', () => {
  it('refuses calls at/over the daily cap without fetching', async () => {
    store.anthropicApiKey = 'sk-ant-test';
    store.llbRederiveLastCallMs = Date.now() - 10 * 60 * 1000; // past cool-off
    store.llbRederiveDateKey = TODAY;
    store.llbRederiveCallsToday = 5; // at cap

    const { sendResponse } = sendRederive();
    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());

    expect(fetchMock).not.toHaveBeenCalled();
    const arg = sendResponse.mock.calls[0]![0] as { error: string };
    expect(arg.error).toMatch(/daily cap reached: 5\/5/);
  });

  it('resets the count on a new UTC date and allows the call', async () => {
    store.anthropicApiKey = 'sk-ant-test';
    store.llbRederiveLastCallMs = Date.now() - 10 * 60 * 1000; // past cool-off
    store.llbRederiveDateKey = '2000-01-01'; // stale date
    store.llbRederiveCallsToday = 5; // would be at cap, but date rolled over
    fetchMock.mockResolvedValue(okResponse([{ selector: 'div[data-urn]', rationale: 'x' }]));

    const { sendResponse } = sendRederive();
    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(store.llbRederiveCallsToday).toBe(1); // reset to 0 then incremented
    expect(store.llbRederiveDateKey).toBe(TODAY);
  });
});

// ── No API key + finally-release on error ────────────────────────────────────

describe('REDERIVE_SELECTOR — error handling', () => {
  it('does not acquire the latch or burn a rate slot when no API key is configured', async () => {
    // rate-limit allows (empty state) but no apiKey configured
    const { sendResponse } = sendRederive();
    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());

    expect(fetchMock).not.toHaveBeenCalled();
    expect(sendResponse).toHaveBeenCalledWith({ error: 'No API key configured' });
    // finding #3: a keyless attempt must not consume a daily slot or start the cool-off
    expect(store.llbRederiveInFlight).not.toBe(true);
    expect(store.llbRederiveCallsToday).toBeUndefined();
    expect(store.llbRederiveLastCallMs).toBeUndefined();
  });

  it('retries a malformed response once (2 attempts) then responds with an error', async () => {
    store.anthropicApiKey = 'sk-ant-test';
    fetchMock.mockResolvedValue(malformedResponse());

    const { sendResponse } = sendRederive();
    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());

    expect(fetchMock).toHaveBeenCalledTimes(2); // initial + 1 retry
    const arg = sendResponse.mock.calls[0]![0] as { error: string };
    expect(arg.error).toBeTruthy();
    expect(store.llbRederiveInFlight).toBe(false);
  });
});

// ── ADAPT-06: response returned as data, never evaluated ──────────────────────

describe('REDERIVE_SELECTOR — ADAPT-06 selectors returned unevaluated', () => {
  it('passes selector strings back as plain data without executing them', async () => {
    store.anthropicApiKey = 'sk-ant-test';
    // Even a hostile-looking selector string is returned verbatim as data
    fetchMock.mockResolvedValue(
      okResponse([{ selector: "div[data-urn='x']", rationale: 'safe' }]),
    );

    const { sendResponse } = sendRederive();
    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());

    const arg = sendResponse.mock.calls[0]![0] as { result: Array<{ selector: string }> };
    expect(arg.result[0]!.selector).toBe("div[data-urn='x']");
  });
});
