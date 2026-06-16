/**
 * Non-English ExclusionSkill — extracted from checkExclusions() Priority 3 branch.
 *
 * Behavioral invariant: byte-for-byte equivalent to the
 * `if (isNonEnglish(postNode, postData.postText))` branch in src/content/exclusions.ts
 * (DETECT-04 / D-09 exclusion parity). Delegates to isNonEnglish() from
 * src/content/detector/language.ts — same function, same call signature.
 *
 * Selector strings: this skill reads no selector strings directly; the lang-attribute
 * check inside isNonEnglish() operates on DOM attribute reads, not selector lookups.
 * Constraint #1 (CLAUDE.md) is satisfied because no LinkedIn selector string is inlined.
 *
 * Registration order: MUST be listed third in the CODE_EXCLUSION_SKILLS array
 * (Plan 04), after sponsored and company-page and before open-to-work, matching
 * the strict priority order of checkExclusions().
 */

import { isNonEnglish } from '../detector/language';
import type { ExclusionSkill } from '../../shared/skills/types';
import type { PostData } from '../../shared/types';

export const nonEnglishExclusionSkill: ExclusionSkill = {
  kind: 'exclusion',
  id: 'non-english',
  check(postData: PostData, postNode: Element) {
    return isNonEnglish(postNode, postData.postText)
      ? { excluded: true, reason: 'non-english' as const }
      : { excluded: false };
  },
};
