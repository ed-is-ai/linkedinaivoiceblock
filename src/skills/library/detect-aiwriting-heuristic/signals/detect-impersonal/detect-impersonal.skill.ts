/**
 * Impersonal voice CodeSkill wrapper.
 * Wraps checkImpersonalVoice from ./impersonal — weights are NOT redeclared here (they live in the underlying function).
 */

import { checkImpersonalVoice } from './impersonal';
import type { CodeSkill } from '../../../../../shared/skills/types';

export const impersonalSkill: CodeSkill = {
  kind: 'signal',
  flavor: 'code',
  id: 'impersonal',
  inputs: ['text'],
  sync: true,
  run({ postData }) {
    return checkImpersonalVoice(postData.postText);
  },
};
