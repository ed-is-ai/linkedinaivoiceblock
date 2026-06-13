/**
 * Hard-exclusion guard — runs BEFORE any heuristic detection.
 *
 * Checks four conditions in D-12 priority order and returns an ExclusionResult.
 * When excluded=true, the caller (Plan 04 / content/index.ts) must skip detection
 * entirely. When excluded=false, the caller uses openToWork to raise the effective
 * auto-hide threshold by +20 points (DETECT-04 / D-12.4).
 *
 * Branch-to-requirement mapping:
 *   DETECT-02 (sponsored):      postNode contains SPONSORED_MARKER element
 *   DETECT-03 (company-page):   authorProfileUrl contains COMPANY_PAGE_MARKER
 *   DETECT-04 (non-English):    isNonEnglish(postNode, postData.postText) returns true
 *   D-12.4    (Open to Work):   postNode contains OPEN_TO_WORK_MARKER element
 *                                → NOT excluded; +20 threshold adjustment applied by caller
 *
 * All selector strings come from ./selectors. This file contains no inline selectors
 * per INFRA-04 and CLAUDE.md critical constraint #1.
 */

import { resolve } from './selector-registry';
import { isNonEnglish } from './detector/language';
import type { PostData } from '../shared/types';

/**
 * Result returned by checkExclusions.
 * When excluded=true, detection must be skipped.
 * When excluded=false, openToWork signals to the caller to raise the threshold.
 */
export interface ExclusionResult {
  /** True if this post must be skipped entirely (no detection). */
  excluded: boolean;
  /**
   * Reason for exclusion — only set when excluded=true.
   *   'sponsored'    — DETECT-02
   *   'company-page' — DETECT-03
   *   'non-english'  — DETECT-04
   */
  reason?: 'sponsored' | 'company-page' | 'non-english';
  /**
   * True when the author has Open to Work enabled (D-12.4).
   * Only meaningful when excluded=false. The +20 threshold adjustment is applied
   * by the caller — checkExclusions merely exposes the metadata.
   */
  openToWork?: boolean;
}

/**
 * Checks whether a post should be excluded from heuristic detection.
 *
 * Priority order is strict (D-12):
 *   1. Sponsored / Promoted (DETECT-02)
 *   2. Company-page author  (DETECT-03)
 *   3. Non-English text     (DETECT-04)
 *   4. Open to Work metadata passthrough (D-12.4) — not an exclusion, raises threshold
 *
 * @param postData - Serialisable post data from the observer.
 * @param postNode - The DOM element representing the outer post card.
 * @returns ExclusionResult indicating whether to skip detection and any relevant metadata.
 */
export function checkExclusions(postData: PostData, postNode: Element): ExclusionResult {
  // Priority 1: Sponsored / Promoted post (DETECT-02)
  // Uses querySelector on the post node — the SPONSORED_MARKER selector targets
  // aria-label attributes that survive LinkedIn class renames.
  if (postNode.querySelector(resolve('SPONSORED_MARKER'))) {
    return { excluded: true, reason: 'sponsored' };
  }

  // Priority 2: Company page author (DETECT-03)
  // Company pages have /company/ in the profile URL; individual profiles use /in/.
  if (postData.authorProfileUrl.includes(resolve('COMPANY_PAGE_MARKER'))) {
    return { excluded: true, reason: 'company-page' };
  }

  // Priority 3: Non-English post text (DETECT-04)
  // isNonEnglish first checks the `lang` attribute, then samples codepoints.
  if (isNonEnglish(postNode, postData.postText)) {
    return { excluded: true, reason: 'non-english' };
  }

  // Priority 4: Open to Work passthrough (D-12.4)
  // Not an exclusion — the +20 threshold adjustment is applied by the caller in Plan 04.
  const openToWork = !!postNode.querySelector(resolve('OPEN_TO_WORK_MARKER'));
  return { excluded: false, openToWork };
}
