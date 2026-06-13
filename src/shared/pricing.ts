/**
 * LinkedIn Blocker — LLM Model Pricing
 *
 * Provides the MODEL_PRICING constant (source of truth for Anthropic model rates)
 * and the cache-aware computeCostUsd cost function.
 *
 * D-06: MODEL_PRICING is re-seeded into chrome.storage.local on every extension load
 * (onInstalled + onStartup in src/background/index.ts). The code is the source of truth;
 * storage is a refreshed materialized copy. This is the OPPOSITE of Phase 22's
 * SelectorRegistry — pricing OVERWRITES storage on load; selectors PRESERVE stored values.
 *
 * D-07: Each TraceEntry stores the raw cacheCreationTokens/cacheReadTokens split so
 * costUsd can be recomputed against updated prices in Phase 25.
 */

import type { ModelPricing } from './types';

// ---------------------------------------------------------------------------
// MODEL_PRICING — authoritative Anthropic pricing constant (priced 2026-06)
// ---------------------------------------------------------------------------

/**
 * Cache-aware model pricing table (source of truth).
 * Prices are per million tokens as published 2026-06 at platform.claude.com/docs/en/pricing.md
 * (verified via the claude-api skill reference).
 *
 * This constant is re-written into chrome.storage.local (llbModelPricing) on every
 * extension (re)load via onInstalled + onStartup hooks (D-06). A code edit to prices
 * propagates to storage on the next reload — no manual storage update required.
 */
export const MODEL_PRICING: ModelPricing = {
  /** Detector model — $3.00 input / $15.00 output per MTok */
  'claude-sonnet-4-6': { inputPerMTok: 3.00, outputPerMTok: 15.00 },
  /** Rederiver model — $1.00 input / $5.00 output per MTok */
  'claude-haiku-4-5-20251001': { inputPerMTok: 1.00, outputPerMTok: 5.00 },
};

// ---------------------------------------------------------------------------
// computeCostUsd — cache-aware cost formula (D-05)
// ---------------------------------------------------------------------------

/**
 * Compute the USD cost of a single Anthropic API call using the cache-aware formula.
 *
 * Formula (D-05):
 *   costUsd = ( input_tokens          × inputPerMTok
 *             + cache_creation_tokens × inputPerMTok × 1.25  // 5-min cache write premium
 *             + cache_read_tokens     × inputPerMTok × 0.10  // cache read (90% off)
 *             + output_tokens         × outputPerMTok ) / 1_000_000
 *
 * Flat input pricing was rejected because both detector and rederiver calls use
 * cache_control: ephemeral system prompts — flat pricing would bill cached tokens
 * at ~10× their real cost on every cache hit (D-05 rationale).
 *
 * Unknown / unlisted models return costUsd 0 + unpriced true (D-08).
 * Missing cache fields (undefined) are treated as 0.
 *
 * @param model - Anthropic model ID (e.g. 'claude-sonnet-4-6')
 * @param usage - Token usage object from the Anthropic API response
 * @returns { costUsd, unpriced } — unpriced is true only when the model is unknown
 */
export function computeCostUsd(
  model: string,
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  },
): { costUsd: number; unpriced: boolean } {
  const rates = MODEL_PRICING[model];

  // D-08: unknown model → 0 cost + unpriced flag (never emit a wrong number)
  if (!rates) return { costUsd: 0, unpriced: true };

  const { inputPerMTok, outputPerMTok } = rates;

  // Treat missing cache fields as 0 (non-cached calls omit these fields entirely)
  const cacheCreate = usage.cache_creation_input_tokens ?? 0;
  const cacheRead   = usage.cache_read_input_tokens    ?? 0;

  // Cache multipliers per Anthropic pricing:
  const CACHE_WRITE_MULTIPLIER = 1.25; // 5-min cache write: 25% premium on input rate
  const CACHE_READ_MULTIPLIER  = 0.10; // cache read: 90% discount on input rate

  const costUsd =
    (usage.input_tokens  * inputPerMTok
   + cacheCreate         * inputPerMTok * CACHE_WRITE_MULTIPLIER
   + cacheRead           * inputPerMTok * CACHE_READ_MULTIPLIER
   + usage.output_tokens * outputPerMTok) / 1_000_000;

  return { costUsd, unpriced: false };
}
