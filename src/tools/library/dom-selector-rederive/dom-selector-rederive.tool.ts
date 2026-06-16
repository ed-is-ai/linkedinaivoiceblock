/**
 * dom-selector-rederive tool (Phase 32 — TOOL-02).
 *
 * Self-contained LLM tool that proposes CSS post-card selectors from a
 * PII-stripped DOM skeleton. Relocated verbatim from src/background/index.ts
 * (rederiveSelector body + helpers). The only structural changes are:
 *   (a) destructure { target, domSkeleton } from the input arg instead of positional params
 *   (b) return { candidates, usage } instead of { candidates } — recordTrace removed (D-07)
 *
 * Layering constraint (D-07): this file MUST NOT import recordTrace or any
 * background-only module. Trace recording is the caller's responsibility.
 *
 * Security (T-32-01): isRederiveModelOutput validates the LLM response schema
 * before any selector string is returned — relocated VERBATIM from background.
 *
 * Security (T-32-02): the API key is used ONLY in the Authorization header and
 * is never logged, returned to the caller, or written to traces.
 */

import type { Tool } from '../../../shared/skills/types';
import type { AnthropicUsage } from '../../../shared/types';

// ---------------------------------------------------------------------------
// System prompt (exported — background re-imports for error-trace calls, D-06)
// ---------------------------------------------------------------------------

/**
 * ADAPT-03 / ADAPT-06: system prompt for the CSS selector re-derivation LLM call.
 * Relocated verbatim from src/background/index.ts L114-141.
 * Exported so background/index.ts can re-import it for error/success traces (D-06).
 */
export const REDERIVE_SYSTEM_PROMPT = `You are a CSS selector analyst for a Chrome extension that scrapes LinkedIn post cards.
The extension's post-card selector has broken (matches 0 elements on an active feed).
You will receive a PII-stripped structural DOM skeleton of the LinkedIn feed.
All text content, href values, src values, and aria-label values have been removed.
Only tag names, data-* attributes, role attributes, and nesting are present.

Return ONLY a JSON object — no markdown, no commentary, no code fences:
{
  "candidates": [
    { "selector": "<css-selector-string>", "rationale": "<one sentence>" },
    { "selector": "<css-selector-string>", "rationale": "<one sentence>" }
  ]
}

Rules:
- Return 1-3 candidates, ranked by confidence (most confident first).
- Each selector must target individual post-card elements, not the feed container.
- Never return body, html, *, or any selector that would match the entire document.
- Use only data-* attributes, role attributes, and structural/semantic selectors.
- Do not use CSS class names — LinkedIn rebuilds class names on every deploy.
- The caller will validate each candidate with querySelectorAll; a passing candidate
  must match 2-50 elements and find author links in >50% of matched elements.

GOOD RESPONSE EXAMPLE:
{"candidates":[{"selector":"div[data-urn*='activity']","rationale":"data-urn with 'activity' identifies post cards"},{"selector":"div[role='article'][data-id]","rationale":"role=article with data-id is a common post card pattern"}]}

BAD RESPONSE EXAMPLE (never do this):
{"candidates":[{"selector":"body div div","rationale":"too broad"},{"selector":"*","rationale":"matches everything"}]}`;

// ---------------------------------------------------------------------------
// Types (relocated from src/background/index.ts L148-172)
// ---------------------------------------------------------------------------

/**
 * A single LLM-proposed selector candidate returned from execute().
 * Exported so background/index.ts and rederiver.ts can share this type (D-08).
 * Relocated from background (was module-private); now public.
 */
export interface RederiveCandidate {
  selector: string;
  rationale: string;
}

/** Internal — parsed LLM response shape. Private to this module. */
interface RederiveModelOutput {
  candidates: RederiveCandidate[];
}

/**
 * ADAPT-06: validate the parsed LLM response before any selector string is trusted.
 * A hand-written type guard (no runtime-validation library for a single use case).
 * Rejects anything without a candidates array of non-empty {selector} objects.
 * Relocated VERBATIM from src/background/index.ts L161-172 (T-32-01).
 */
function isRederiveModelOutput(value: unknown): value is RederiveModelOutput {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  if (!Array.isArray(obj['candidates'])) return false;
  return obj['candidates'].every(
    (c: unknown) =>
      typeof c === 'object' &&
      c !== null &&
      typeof (c as Record<string, unknown>)['selector'] === 'string' &&
      (c as Record<string, unknown>)['selector'] !== '',
  );
}

// ---------------------------------------------------------------------------
// Tool implementation
// ---------------------------------------------------------------------------

/**
 * dom-selector-rederive tool.
 *
 * execute({ target, domSkeleton }) performs the Anthropic LLM call only.
 * No recordTrace, no rate-limit management, no chrome.runtime messaging.
 * Those concerns remain in src/background/index.ts (D-06, D-07).
 *
 * Returns { candidates: RederiveCandidate[]; usage: AnthropicUsage | undefined }.
 * Caller (background handler) records the success trace with the returned usage.
 */
export const domSelectorRederiveTool: Tool<
  { target: string; domSkeleton: string },
  { candidates: RederiveCandidate[]; usage: AnthropicUsage | undefined }
> = {
  name: 'dom-selector-rederive',
  description: 'Proposes CSS selectors for broken post-card targets via Claude Haiku.',
  async execute({ target, domSkeleton }) {
    // Relocated verbatim from rederiveSelector body L258-335 with two structural changes:
    // (a) positional params → destructured input arg (target, domSkeleton)
    // (b) success return adds usage; recordTrace call removed (D-07)

    const stored = await chrome.storage.local.get(['anthropicApiKey']);
    const apiKey = stored.anthropicApiKey as string | undefined;
    if (!apiKey) throw new Error('No API key configured');

    let lastErr: Error | null = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const retryHint =
        attempt === 1
          ? ''
          : `Your previous response could not be parsed as JSON. Return only a JSON object with a 'candidates' array.\n\n`;
      const userContent = `${retryHint}Target: ${target}\n\nDOM skeleton:\n${domSkeleton}`;

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
          'anthropic-dangerous-direct-browser-access': 'true',
          'anthropic-beta': 'prompt-caching-2024-07-31',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 256,
          system: [
            {
              type: 'text' as const,
              text: REDERIVE_SYSTEM_PROMPT,
              cache_control: { type: 'ephemeral' as const },
            },
          ],
          messages: [{ role: 'user', content: userContent }],
          stop_sequences: ['\n\n\n'],
        }),
      });

      if (!response.ok) {
        // Do not retry on HTTP errors (401 bad key / 429 provider rate-limit) — surface immediately
        const body = await response.text();
        throw new Error(`API ${response.status}: ${body}`);
      }

      // D-02: read the usage breakdown (optional — a 200 may omit it; recordTrace degrades to 0)
      const data = (await response.json()) as {
        content: Array<{ text: string }>;
        usage?: AnthropicUsage;
      };
      const raw = data.content[0]?.text ?? '';
      const jsonStr = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();

      try {
        const parsed: unknown = JSON.parse(jsonStr);
        if (!isRederiveModelOutput(parsed)) {
          throw new Error('LLM response failed schema validation');
        }

        // Return candidates + usage; caller records the trace (D-07)
        return { candidates: parsed.candidates, usage: data.usage };
      } catch (err) {
        lastErr = err as Error;
        console.warn(`[LLB] rederive validation fail attempt ${attempt}:`, lastErr.message);
      }
    }

    throw lastErr ?? new Error('rederive failed');
  },
};
