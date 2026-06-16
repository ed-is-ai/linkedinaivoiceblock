/**
 * Sponsored-post ExclusionSkill — extracted from checkExclusions() Priority 1 branch.
 *
 * Behavioral invariant: byte-for-byte equivalent to the `if (postNode.querySelector(resolve('SPONSORED_MARKER')))`
 * branch in src/content/exclusions.ts (DETECT-02 / D-09 exclusion parity).
 *
 * Selector strings come exclusively from resolve() (SelectorRegistry) — no inline
 * selector literals per CLAUDE.md critical constraint #1.
 *
 * Registration order: MUST be listed first in the CODE_EXCLUSION_SKILLS array
 * (Plan 04) so that sponsored short-circuits before company-page, non-english,
 * and open-to-work, matching the strict priority order of checkExclusions().
 */

import { resolve } from '../../../content/selector-registry';
import type { ExclusionSkill } from '../../../shared/skills/types';
import type { PostData } from '../../../shared/types';

export const sponsoredExclusionSkill: ExclusionSkill = {
  kind: 'exclusion',
  id: 'sponsored',
  check(_postData: PostData, postNode: Element) {
    return postNode.querySelector(resolve('SPONSORED_MARKER'))
      ? { excluded: true, reason: 'sponsored' as const }
      : { excluded: false };
  },
};
