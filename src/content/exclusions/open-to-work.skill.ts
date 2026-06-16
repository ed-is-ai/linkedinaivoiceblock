/**
 * Open-to-Work metadata-passthrough ExclusionSkill — extracted from checkExclusions() Priority 4 branch.
 *
 * Behavioral invariant: byte-for-byte equivalent to the
 * `const openToWork = !!postNode.querySelector(resolve('OPEN_TO_WORK_MARKER')); return { excluded: false, openToWork };`
 * branch in src/content/exclusions.ts (D-12.4 / D-09 exclusion parity).
 *
 * CRITICAL — this skill MUST always return excluded:false (parity-critical):
 *   - It is NOT an exclusion. A detected open-to-work frame only raises the auto-hide threshold
 *     by +20 points (makes hiding harder, fail-safe toward showing content).
 *   - It must never short-circuit the detection pipeline. Returning excluded:true here would
 *     silently skip heuristic and LLM detection on open-to-work posts, which is incorrect.
 *   - A spoofed open-to-work marker can only raise the threshold (T-30-05: accept, fail-safe).
 *
 * Selector strings come exclusively from resolve() (SelectorRegistry) — no inline
 * selector literals per CLAUDE.md critical constraint #1.
 *
 * Registration order: MUST be listed last in the CODE_EXCLUSION_SKILLS array (Plan 04),
 * after sponsored, company-page, and non-english — matching checkExclusions() which only
 * reaches this branch when the other three do not short-circuit.
 */

import { resolve } from '../selector-registry';
import type { ExclusionSkill } from '../../shared/skills/types';
import type { PostData } from '../../shared/types';

export const openToWorkExclusionSkill: ExclusionSkill = {
  kind: 'exclusion',
  id: 'open-to-work',
  check(_postData: PostData, postNode: Element) {
    // Always excluded:false — this is a metadata passthrough, NOT an exclusion.
    // The caller (Plan 05 runner) reads openToWork and applies the +20 threshold penalty.
    return {
      excluded: false,
      openToWork: !!postNode.querySelector(resolve('OPEN_TO_WORK_MARKER')),
    };
  },
};
