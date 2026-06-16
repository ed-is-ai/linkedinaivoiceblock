/**
 * LLMDetector — asks the service worker to score posts via Claude Sonnet 4.6.
 *
 * Content scripts cannot call the Anthropic API directly (CORS). The actual
 * fetch lives in background/index.ts; this class just sends a SCORE_POST
 * message and awaits the response. Falls back to a provided Detector on error.
 */

import type { PostData, DetectionResult, Detector } from '../../../shared/types';
import type { DetectorSkill } from '../../../shared/skills/types';

export class LLMDetector implements Detector, DetectorSkill {
  readonly kind = 'detector' as const;
  readonly name = 'llm';

  constructor(private readonly fallback?: Detector) {}

  async detect(post: PostData): Promise<DetectionResult> {
    try {
      return await this.scoreViaBackground(post.postText);
    } catch (err) {
      console.warn('[LLB] LLMDetector error, falling back:', err);
      if (this.fallback) return this.fallback.detect(post);
      return { score: 0, signals: [], signalBreakdown: {}, confidence: 'low', engineUsed: 'heuristic' };
    }
  }

  private scoreViaBackground(postText: string): Promise<DetectionResult> {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: 'SCORE_POST', postText }, (response) => {
        if (chrome.runtime.lastError) { reject(chrome.runtime.lastError); return; }
        if (response?.error) { reject(new Error(response.error as string)); return; }
        // Validate the response shape before resolving (WR-05). If the worker
        // terminates mid-flight or replies with undefined/malformed data without
        // setting lastError, response.result is undefined; resolving it would let
        // `undefined` flow into the scoring path and throw outside the fallback.
        // Reject instead so this routes through the LLMDetector fallback in detect().
        if (!response || typeof (response.result as DetectionResult | undefined)?.score !== 'number') {
          reject(new Error('malformed SCORE_POST response'));
          return;
        }
        resolve(response.result as DetectionResult);
      });
    });
  }
}
