/**
 * TRIGGER_HEAL message contract — shared by content script (Plan 03 listener) and
 * dashboard (Plan 04 sender).
 *
 * Keep this module pure: no chrome.* API calls, no DOM access, importable from any
 * extension context (dashboard page, content script, service worker).
 *
 * ## Busy/cool-off sentinel convention
 *
 * When the content-side listener declines a heal because its single-flight/cool-off
 * guard is active, it MUST respond with `{ error: HEAL_BUSY }` — NOT `{ result: [] }`.
 * This keeps "heal already running" distinguishable from "nothing was stale" (an empty
 * HealOutcome[]).  Plan 04's sender rejects on `response.error`, so it can surface a
 * dedicated "heal already running" message rather than a generic error.
 *
 * Response shapes:
 *   Success  → `{ result: HealOutcome[] }`          (may be empty when nothing is stale)
 *   Busy     → `{ error: HEAL_BUSY }`               (cool-off guard active)
 *   Error    → `{ error: string }`                  (any other runtime failure)
 */

import type { SelectorTarget } from './types';

/** Message type discriminator for the manual heal request. */
export const TRIGGER_HEAL = 'TRIGGER_HEAL' as const;

/**
 * Busy/cool-off sentinel.  When the single-flight guard in the content listener is
 * active, it responds with `{ error: HEAL_BUSY }` so the dashboard can show
 * "heal already running" rather than a generic error.
 */
export const HEAL_BUSY = 'busy' as const;

/** Per-target outcome of a single triggerHeal run. */
export type HealResult = 'healed' | 'unchanged' | 'failed';

/** Outcome for one target within a triggerHeal invocation. */
export interface HealOutcome {
  target: SelectorTarget;
  result: HealResult;
}

/** Request envelope sent from the dashboard to the content script. */
export interface TriggerHealMessage {
  type: typeof TRIGGER_HEAL;
}

/**
 * Response envelope returned by the content-side listener.
 *
 * - `{ result: HealOutcome[] }` — heal completed (list may be empty if nothing was stale).
 * - `{ error: string }` — either `HEAL_BUSY` (cool-off guard) or a runtime error message.
 */
export type TriggerHealResponse = { result: HealOutcome[] } | { error: string };
