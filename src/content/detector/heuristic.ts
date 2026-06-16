/**
 * HeuristicDetector — runs registered signal skills via the registry runner.
 *
 * This class is the Phase 2 implementation of the Detector interface (CONFIG-02).
 * It is the orchestration layer — all scoring logic lives in the individual
 * signal modules under ./signals/, exposed via the SkillRegistry.
 *
 * This file intentionally contains NO references to `document.`, `chrome.`, or any
 * LinkedIn selector literals. DOM access is injected via the optional `fetchComments`
 * constructor argument so that this class remains unit-testable without a browser.
 */

import type { PostData, DetectionResult, Detector } from '../../shared/types';
import type { DetectorSkill, CodeSkill } from '../../shared/skills/types';
import { detectionConfig } from '../../shared/detectionConfig';
import { getSignalSkills } from '../skill-registry';

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
 *             DetectorSkill (kind discriminant for registry dispatch)
 * Satisfies: DETECT-05 (signalBreakdown per-signal scores)
 *            DETECT-07 (engagement signal behind content-score > 20 gate)
 *            SKILL-01 (every scoring signal runs through the registry runner — D-08)
 */
export class HeuristicDetector implements Detector, DetectorSkill {
  /** Registry discriminant for skill dispatch. */
  readonly kind = 'detector' as const;

  /** Human-readable identifier used in logging and DetectionResult.engineUsed. */
  readonly name = 'heuristic';

  private readonly options: HeuristicDetectorOptions;

  constructor(options: HeuristicDetectorOptions = {}) {
    this.options = options;
  }

  /**
   * Score a single post by running all registered signal skills via the registry runner.
   *
   * Two-pass runner (D-08 zero-behavior-change — preserves insertion order):
   *  Pass 1 (sync): iterate getSignalSkills() in step-order; run all sync:true skills.
   *                 Builds breakdown in pipeline step-order (Landmine 2):
   *                 listicle-cta → buzzword → em-dash → ai-vocab → hook-story → motivational → impersonal
   *  Pass 2 (async, gated): for each sync:false skill (generic-comments only),
   *                 gate on (score > genericComments.gate) then await (Landmines 3 + 5).
   *
   * NOTE on CTA double-count prevention (D-05):
   *   checkCta() and checkListicle() are called ONCE inside listicle-cta.skill.ts.
   *   The composite skill maps to a single 'listicle-cta' breakdown key. (Landmine 1)
   *
   * Profile signals are NOT run here (Landmine 4) — they remain merged in content/index.ts
   * AFTER detect() returns, via extractProfileSignals(postNode).
   *
   * @param post - The extracted post data from the observer.
   * @returns DetectionResult with score (0–100 integer), per-signal breakdown, confidence, engineUsed.
   */
  async detect(post: PostData): Promise<DetectionResult> {
    const breakdown: Record<string, number> = {};
    let score = 0;

    const skills = getSignalSkills();

    // Pass 1: Sync skills — run in array order (= step-order = breakdown insertion order)
    for (const skill of skills) {
      if (!skill.sync) continue;
      const result = (skill as CodeSkill).run({ postData: post });
      // result is number (sync path — no await needed)
      if ((result as number) > 0) {
        breakdown[skill.id] = result as number;
        score += result as number;
      }
    }

    // Pass 2: Async gated skills (generic-comments only)
    // Gate uses the post-sync-pass score (Landmine 3 — gate stays in runner, not in skill)
    for (const skill of skills) {
      if (skill.sync) continue;
      if (skill.id === 'generic-comments') {
        if (score > detectionConfig.weights.genericComments.gate && this.options.fetchComments !== undefined) {
          const r = await (skill as CodeSkill).run({ postData: post, fetchComments: this.options.fetchComments });
          if ((r as number) > 0) {
            breakdown[skill.id] = r as number;
            score += r as number;
          }
        }
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
