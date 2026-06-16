console.log('[LLB] service worker started');

import type { DetectionResult, TraceEntry } from '../shared/types';
import { MODEL_PRICING, computeCostUsd } from '../shared/pricing';
import { appendTrace } from '../shared/traceStore';
import { storageSet } from '../shared/storage';
import { SYSTEM_PROMPT, classifyPost, type AnthropicUsage } from '../shared/classifier';
import { get as getTool } from '../shared/tool-registry';
import type { RederiveCandidate } from '../tools/library/dom-selector-rederive/dom-selector-rederive.tool';
import { REDERIVE_SYSTEM_PROMPT } from '../tools/library/dom-selector-rederive/dom-selector-rederive.tool';

chrome.runtime.onInstalled.addListener(() => {
  console.log('[LLB] extension installed');
  chrome.action.setBadgeBackgroundColor({ color: '#0077B5' });
  // D-06: overwrite, not preserve — pricing constant wins on every load
  storageSet({ llbModelPricing: MODEL_PRICING }).catch(() => {});
});

// D-06: overwrite, not preserve — re-seed pricing on browser startup so code edits propagate
chrome.runtime.onStartup.addListener(() => {
  storageSet({ llbModelPricing: MODEL_PRICING }).catch(() => {});
});

/**
 * Build a TraceEntry and persist it FIRE-AND-FORGET (Phase 24).
 *
 * A trace is observability only — it MUST NEVER alter control flow, reject the caller,
 * or block sendResponse. So appendTrace is never awaited here (it self-serializes and
 * never rejects). Pass `usage` for a success trace (real tokens + cache-aware cost) or
 * `error` for a failure trace (tokens/cost zeroed). `usage` may be undefined when a 200
 * response omits it — cost degrades to 0 rather than throwing. userPrompt is truncated
 * to 500 chars here (D-04), centralising what used to be five near-identical blocks.
 */
function recordTrace(opts: {
  source: 'detector' | 'rederiver';
  model: string;
  systemPrompt: string;
  userPrompt: string;
  usage?: AnthropicUsage;
  error?: string;
}): void {
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheCreationTokens = 0;
  let cacheReadTokens = 0;
  let costUsd = 0;
  let unpriced = false;

  if (opts.usage) {
    inputTokens = opts.usage.input_tokens ?? 0;
    outputTokens = opts.usage.output_tokens ?? 0;
    cacheCreationTokens = opts.usage.cache_creation_input_tokens ?? 0;
    cacheReadTokens = opts.usage.cache_read_input_tokens ?? 0;
    ({ costUsd, unpriced } = computeCostUsd(opts.model, opts.usage));
  }

  const entry: TraceEntry = {
    source: opts.source,
    model: opts.model,
    systemPrompt: opts.systemPrompt,
    userPrompt: opts.userPrompt.slice(0, 500),
    inputTokens,
    outputTokens,
    cacheCreationTokens,
    cacheReadTokens,
    costUsd,
    unpriced,
    timestamp: new Date().toISOString(),
    ...(opts.error !== undefined ? { error: opts.error } : {}),
  };

  // Fire-and-forget — a trace write must never break the response path.
  void appendTrace(entry);
}

// ---------------------------------------------------------------------------
// Storage-driven badge — counts pending flagged accounts (D-09, D-10, D-11)
// Badge reflects live queue size; decrements automatically on dismiss.
// ---------------------------------------------------------------------------

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes['flaggedAccounts']) return;
  const accounts = (changes['flaggedAccounts'].newValue ?? {}) as Record<string, { status: string }>;
  const pendingCount = Object.values(accounts).filter(a => a.status === 'pending').length;
  chrome.action.setBadgeText({ text: pendingCount > 0 ? String(pendingCount) : '' });
  chrome.action.setBadgeBackgroundColor({ color: '#0077B5' });
});

async function scorePost(postText: string): Promise<DetectionResult> {
  const result = await chrome.storage.local.get(['anthropicApiKey']);
  const apiKey = result.anthropicApiKey as string | undefined;
  if (!apiKey) throw new Error('No API key configured');

  const { result: detectionResult, usage } = await classifyPost(postText, apiKey);

  // TRACE-01: record success trace (fire-and-forget — must never break scoring)
  recordTrace({
    source: 'detector',
    model: 'claude-sonnet-4-6',
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: postText,
    usage,
  });

  return detectionResult;
}

// ---------------------------------------------------------------------------
// Self-healing selector re-derivation (Phase 23 — ADAPT-03 / ADAPT-05 / ADAPT-06)
// LLM fallback that proposes post-card selectors from a PII-stripped DOM skeleton
// when the local heuristic re-deriver (23-02) finds no valid candidate. The fetch
// lives here in the service worker (content scripts cannot reach the Anthropic API
// — CORS). All rate-limit state is persisted to chrome.storage.local so it survives
// service-worker restarts (the SW is stateless — read/write state every invocation).
// ---------------------------------------------------------------------------

/** ADAPT-05: minimum gap between two LLM rederive calls. */
const REDERIVE_COOLOFF_MS = 5 * 60 * 1000;
/** ADAPT-05: hard per-UTC-day cap on LLM rederive calls. */
const REDERIVE_DAILY_CAP = 5;

/**
 * ADAPT-05: rate-limit check read fresh from storage every call (SW is stateless).
 * Refuses when the single-flight latch is held, inside the 5-min cool-off, or at the
 * daily cap. Returns todayKey/callsToday so the caller can acquire the latch without
 * a second storage read.
 */
async function checkRateLimit(): Promise<{
  allowed: boolean;
  reason?: string;
  todayKey: string;
  callsToday: number;
}> {
  const result = await chrome.storage.local.get([
    'llbRederiveLastCallMs',
    'llbRederiveCallsToday',
    'llbRederiveDateKey',
    'llbRederiveInFlight',
  ]);

  const todayKey = new Date().toISOString().slice(0, 10);
  const storedDate = (result.llbRederiveDateKey as string | undefined) ?? '';
  const callsToday =
    storedDate === todayKey ? ((result.llbRederiveCallsToday as number | undefined) ?? 0) : 0;

  // Single-flight latch — one rederive event globally, even across concurrent tabs
  if (result.llbRederiveInFlight) {
    return { allowed: false, reason: 'single-flight latch held', todayKey, callsToday };
  }

  // 5-minute cool-off
  const lastMs = (result.llbRederiveLastCallMs as number | undefined) ?? 0;
  const sinceLast = Date.now() - lastMs;
  if (sinceLast < REDERIVE_COOLOFF_MS) {
    const remaining = Math.round((REDERIVE_COOLOFF_MS - sinceLast) / 1000);
    return { allowed: false, reason: `cooloff: ${remaining}s remaining`, todayKey, callsToday };
  }

  // Daily cap (date-rollover resets the count via callsToday above)
  if (callsToday >= REDERIVE_DAILY_CAP) {
    return {
      allowed: false,
      reason: `daily cap reached: ${callsToday}/${REDERIVE_DAILY_CAP}`,
      todayKey,
      callsToday,
    };
  }

  return { allowed: true, todayKey, callsToday };
}

/**
 * ADAPT-05 / Pitfall 1: write the latch + incremented count + last-call time BEFORE
 * the fetch starts, so a SW restart mid-flight cannot leave the latch unheld or the
 * count un-incremented.
 *
 * Returns false if a concurrent invocation (e.g. a second tab) already holds the latch.
 * chrome.storage has no compare-and-swap, so this re-read narrows — but cannot fully
 * close — the check-then-acquire race; it shrinks the window to the gap between this
 * read and write (review finding #2).
 */
async function acquireRateLimitLatch(todayKey: string, callsToday: number): Promise<boolean> {
  const recheck = await chrome.storage.local.get(['llbRederiveInFlight']);
  if (recheck.llbRederiveInFlight) return false;
  await chrome.storage.local.set({
    llbRederiveInFlight: true,
    llbRederiveLastCallMs: Date.now(),
    llbRederiveCallsToday: callsToday + 1,
    llbRederiveDateKey: todayKey,
  });
  return true;
}

/** ADAPT-05: always called in finally — releases the single-flight latch. */
async function releaseRateLimitLatch(): Promise<void> {
  await chrome.storage.local.set({ llbRederiveInFlight: false });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'POST_HIDDEN') {
    // Badge is now updated via chrome.storage.onChanged on flaggedAccounts — see above
    return false;
  }

  if (message?.type === 'SCORE_POST') {
    const postText = message.postText as string;
    scorePost(postText)
      .then(result => sendResponse({ result }))
      .catch((err: Error) => {
        // D-03: all attempts produce a trace — error trace has tokens 0, costUsd 0.
        // Synchronous catch: recordTrace is fire-and-forget so sendResponse always runs.
        recordTrace({
          source: 'detector',
          model: 'claude-sonnet-4-6',
          systemPrompt: SYSTEM_PROMPT,
          userPrompt: postText,
          error: err.message,
        });
        sendResponse({ error: err.message });
      });
    return true; // keep channel open for async response
  }

  if (message?.type === 'REDERIVE_SELECTOR') {
    // ADAPT-05: rate-limit BEFORE fetch; acquire latch before the call; always release.
    (async () => {
      const rl = await checkRateLimit();
      if (!rl.allowed) {
        sendResponse({ error: `rate-limited: ${rl.reason}` });
        return;
      }
      // Verify the API key BEFORE acquiring the latch so a keyless attempt does not burn
      // a daily-cap slot or start the 5-min cool-off (review finding #3).
      const keyResult = await chrome.storage.local.get(['anthropicApiKey']);
      if (!keyResult.anthropicApiKey) {
        // D-03: no-key is an attempted LLM call — record an error trace (fire-and-forget)
        recordTrace({
          source: 'rederiver',
          model: 'claude-haiku-4-5-20251001',
          systemPrompt: REDERIVE_SYSTEM_PROMPT,
          userPrompt: '',
          error: 'No API key configured',
        });
        sendResponse({ error: 'No API key configured' });
        return;
      }
      // Best-effort single-flight acquire — bail if another tab grabbed the latch (finding #2)
      const acquired = await acquireRateLimitLatch(rl.todayKey, rl.callsToday);
      if (!acquired) {
        sendResponse({ error: 'rate-limited: single-flight latch held' });
        return;
      }
      try {
        const tool = getTool<
          { target: string; domSkeleton: string },
          { candidates: RederiveCandidate[]; usage: AnthropicUsage | undefined }
        >('dom-selector-rederive');
        const { candidates, usage } = await tool.execute({
          target: message.target as string,
          domSkeleton: message.domSkeleton as string,
        });
        recordTrace({          // success trace hoisted from execute() per D-07
          source: 'rederiver',
          model: 'claude-haiku-4-5-20251001',
          systemPrompt: REDERIVE_SYSTEM_PROMPT,
          userPrompt: `Target: ${message.target as string}\n\nDOM skeleton:\n${message.domSkeleton as string}`,
          usage,
        });
        sendResponse({ result: candidates });
      } catch (err) {
        // D-03: HTTP errors / schema-validation failures produce an error trace (fire-and-forget)
        recordTrace({
          source: 'rederiver',
          model: 'claude-haiku-4-5-20251001',
          systemPrompt: REDERIVE_SYSTEM_PROMPT,
          userPrompt: '',
          error: (err as Error).message,
        });
        sendResponse({ error: (err as Error).message });
      } finally {
        await releaseRateLimitLatch();
      }
    })();
    return true; // Pitfall 6 — keep channel open for async response
  }

  return false;
});
