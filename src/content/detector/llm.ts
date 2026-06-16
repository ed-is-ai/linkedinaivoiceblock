/**
 * LLMDetector — asks the service worker to score posts via Claude Sonnet 4.6.
 *
 * Content scripts cannot call the Anthropic API directly (CORS). The actual
 * fetch lives in background/index.ts; this class just sends a SCORE_POST
 * message and awaits the response. Falls back to a provided Detector on error.
 */

import type { PostData, DetectionResult, Detector } from '../../shared/types';
import type { DetectorSkill } from '../../shared/skills/types';

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
        resolve(response.result as DetectionResult);
      });
    });
  }
}
