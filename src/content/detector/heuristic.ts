/**
 * HeuristicDetector — composes pure signal functions into a Detector implementation.
 *
 * This class is the Phase 2 implementation of the Detector interface (CONFIG-02).
 * It is the only orchestration layer — all scoring logic lives in the individual
 * signal modules under ./signals/.
 *
 * This file intentionally contains NO references to `document.`, `chrome.`, or any
 * LinkedIn selector literals. DOM access is injected via the optional `fetchComments`
 * constructor argument so that this class remains unit-testable without a browser.
 */

import type { PostData, DetectionResult, Detector } from '../../shared/types';
import { detectionConfig } from '../../shared/detectionConfig';
import { checkListicle } from './signals/listicle';
import { checkBuzzwords } from './signals/buzzwords';
import { checkEmDash } from './signals/em-dash';
import { checkCta } from './signals/cta';
import { checkGenericComments } from './signals/comments';
import { checkAiVocab } from './signals/ai-vocab';
import { checkHookStory } from './signals/hook-story';
import { checkMotivational } from './signals/motivational';
import { checkImpersonalVoice } from './signals/impersonal';

/** Constructor options for HeuristicDetector. */
export interface HeuristicDetectorOptions {
  /**
   * Optional comment fetcher — injected so the detector stays DOM-free in unit tests.
   * In production (Plan 04), the caller passes a lambda that calls `expandComments(postNode)`.
   * In tests, a stub can return any string array.
   */
  fetchComments?: (post: PostData) => Promise<string[]>;
}

/**
 * HeuristicDetector implements the Detector interface using rule-based text signals.
 *
 * Implements: CONFIG-02 (pluggable Detector interface, signature locked per D-13)
 * Satisfies: DETECT-05 (signalBreakdown per-signal scores)
 *            DETECT-07 (engagement signal behind content-score > 20 gate)
 */
export class HeuristicDetector implements Detector {
  /** Human-readable identifier used in logging and DetectionResult.engineUsed. */
  readonly name = 'heuristic';

  private readonly options: HeuristicDetectorOptions;

  constructor(options: HeuristicDetectorOptions = {}) {
    this.options = options;
  }

  /**
   * Score a single post using heuristic text signals.
   *
   * Signal pipeline (D-05 weights):
   *  1. Listicle + CTA composite  — up to 25 pts
   *  2. Buzzwords density          — up to 15 pts
   *  3. Em-dash density            — up to 10 pts
   *  4. Generic comments (gated)  — up to 15 pts (only when content score > 20)
   *
   * NOTE on CTA double-count prevention (D-05):
   *   checkCta() already returns the combined opener+closer weight (10 for both, 6 for
   *   closer only, 4 for opener only). The composite listicle-cta rule in step 1 absorbs
   *   this weight — checkCta() is NOT called again elsewhere. Calling it twice would
   *   double-count the CTA contribution, which the original RESEARCH.md code skeleton
   *   example erroneously did. This implementation cites D-05 and deliberately avoids that.
   *
   * DETECT-06 extension point (Phase 3): profile-signal scores plug in here as
   * additional breakdown entries before the Math.min cap. Do NOT change detect()'s signature.
   *
   * @param post - The extracted post data from the observer.
   * @returns DetectionResult with score (0–100 integer), per-signal breakdown, confidence, engineUsed.
   */
  async detect(post: PostData): Promise<DetectionResult> {
    const breakdown: Record<string, number> = {};
    let score = 0;

    // Step 1: Listicle + CTA composite signal (D-05).
    // checkListicle and checkCta are each called once. The combined rule produces a
    // single 'listicle-cta' breakdown key to avoid double-counting (see JSDoc above).
    const listicleScore = checkListicle(post.postText);
    const ctaScore = checkCta(post.postText);

    if (listicleScore > 0 && ctaScore > 0) {
      // Both signals present: strong composite signal
      breakdown['listicle-cta'] = detectionConfig.weights.listicleCta.both;
      score += detectionConfig.weights.listicleCta.both;
    } else if (listicleScore > 0) {
      // Listicle only: moderate signal
      breakdown['listicle-cta'] = detectionConfig.weights.listicleCta.listicleOnly;
      score += detectionConfig.weights.listicleCta.listicleOnly;
    } else if (ctaScore > 0) {
      // CTA only: weak signal
      breakdown['listicle-cta'] = detectionConfig.weights.listicleCta.ctaOnly;
      score += detectionConfig.weights.listicleCta.ctaOnly;
    }

    // Step 2: Buzzwords density (D-05 weight: up to 15)
    const buzzScore = checkBuzzwords(post.postText);
    if (buzzScore > 0) {
      breakdown['buzzword'] = buzzScore;
      score += buzzScore;
    }

    // Step 3: Em-dash density (D-05 weight: up to 10)
    const emDashScore = checkEmDash(post.postText);
    if (emDashScore > 0) {
      breakdown['em-dash'] = emDashScore;
      score += emDashScore;
    }

    // Step 3b: AI-vocabulary density + negative parallelisms (Wikipedia: Signs of AI Writing).
    // Detects LLM-characteristic words (delve, meticulous, tapestry, etc.) and
    // "not just X, but also Y" constructions. Weight: up to 12 pts.
    const aiVocabScore = checkAiVocab(post.postText);
    if (aiVocabScore > 0) {
      breakdown['ai-vocab'] = aiVocabScore;
      score += aiVocabScore;
    }

    // Step 3c: Hook-story opener (up to 20 pts) — detects anecdote openers
    const hookScore = checkHookStory(post.postText);
    if (hookScore > 0) {
      breakdown['hook-story'] = hookScore;
      score += hookScore;
    }

    // Step 3d: Motivational rhythm (up to 20 pts) — "Most people X", "Stop X. Start Y."
    const motivationalScore = checkMotivational(post.postText);
    if (motivationalScore > 0) {
      breakdown['motivational'] = motivationalScore;
      score += motivationalScore;
    }

    // Step 3e: Impersonal framing (up to 15 pts) — "Successful leaders do...", "Many professionals..."
    const impersonalScore = checkImpersonalVoice(post.postText);
    if (impersonalScore > 0) {
      breakdown['impersonal'] = impersonalScore;
      score += impersonalScore;
    }

    // Step 4: Engagement signal — gated behind content score > 20 (D-02, DETECT-07).
    // The comment expansion is only performed when content signals indicate a post is
    // suspicious enough to warrant the extra DOM read (RESEARCH Open Question 2).
    if (score > detectionConfig.weights.genericComments.gate && this.options.fetchComments !== undefined) {
      const comments = await this.options.fetchComments(post);
      const commentScore = checkGenericComments(comments);
      if (commentScore > 0) {
        breakdown['generic-comments'] = commentScore;
        score += commentScore;
      }
    }

    const finalScore = Math.min(score, 100);

    return {
      score: finalScore,
      signals: Object.keys(breakdown),
      signalBreakdown: { ...breakdown },
      confidence: finalScore >= 60 ? 'high' : finalScore >= 35 ? 'medium' : 'low',
      engineUsed: 'heuristic',
    };
  }
}
