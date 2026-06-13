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

/** A single LLM-proposed selector candidate returned from the service worker. */
export interface RederiveCandidate {
  selector: string;
  rationale: string;
}

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
          if (response?.error) {
            reject(new Error(response.error as string));
            return;
          }
          resolve(response.result as RederiveCandidate[]);
        },
      );
    });
  }
}
