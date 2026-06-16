/**
 * LLMRederiver — asks the service worker to re-derive a broken selector via Claude Haiku 4.5.
 *
 * Content scripts cannot call the Anthropic API directly (CORS) and the rate-limit
 * state lives in the service worker. This class only sends a REDERIVE_SELECTOR message
 * carrying the target and a PII-stripped DOM skeleton, then awaits the candidate list.
 * It performs NO fetch — the API call lives in background/index.ts (Pitfall 3).
 *
 * The returned selector strings are untrusted data: the heal orchestrator (23-04)
 * validates each one with validateCandidate (querySelectorAll only) before any is
 * written to the registry — they are never eval'd (ADAPT-06).
 *
 * Requirements: ADAPT-03, ADAPT-06
 */

import type { RederiveCandidate } from '../../tools/library/dom-selector-rederive/dom-selector-rederive.tool';

export type { RederiveCandidate };

export class LLMRederiver {
  /**
   * Send a REDERIVE_SELECTOR message and resolve the candidate array.
   * Rejects on chrome.runtime.lastError or a `{ error }` response (rate-limit,
   * missing API key, schema failure) — the caller releases its heal lock on reject.
   */
  rederive(target: string, domSkeleton: string): Promise<RederiveCandidate[]> {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { type: 'REDERIVE_SELECTOR', target, domSkeleton },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
            return;
          }
          if (!response) {
            // SW closed the channel without responding — reject instead of throwing
            // on `response.result`, which would leave the promise unsettled (finding #4).
            reject(new Error('No response from service worker'));
            return;
          }
          if (response.error) {
            reject(new Error(response.error as string));
            return;
          }
          resolve(response.result as RederiveCandidate[]);
        },
      );
    });
  }
}
