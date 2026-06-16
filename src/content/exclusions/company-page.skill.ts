/**
 * Company-page ExclusionSkill — extracted from checkExclusions() Priority 2 branch.
 *
 * Behavioral invariant: byte-for-byte equivalent to the
 * `if (postData.authorProfileUrl.includes(resolve('COMPANY_PAGE_MARKER')))`
 * branch in src/content/exclusions.ts (DETECT-03 / D-09 exclusion parity).
 *
 * Selector strings come exclusively from resolve() (SelectorRegistry) — no inline
 * selector literals per CLAUDE.md critical constraint #1.
 *
 * Registration order: MUST be listed second in the CODE_EXCLUSION_SKILLS array
 * (Plan 04), after sponsored and before non-english and open-to-work, matching
 * the strict priority order of checkExclusions().
 */

import { resolve } from '../selector-registry';
import type { ExclusionSkill } from '../../shared/skills/types';
import type { PostData } from '../../shared/types';

export const companyPageExclusionSkill: ExclusionSkill = {
  kind: 'exclusion',
  id: 'company-page',
  check(postData: PostData, _postNode: Element) {
    return postData.authorProfileUrl.includes(resolve('COMPANY_PAGE_MARKER'))
      ? { excluded: true, reason: 'company-page' as const }
      : { excluded: false };
  },
};
