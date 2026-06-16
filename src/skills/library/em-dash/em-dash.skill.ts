/**
 * Em-dash CodeSkill wrapper.
 * Wraps checkEmDash from ./em-dash — weights are NOT redeclared here (they live in the underlying function).
 */

import { checkEmDash } from '../../content/detector/signals/em-dash';
import type { CodeSkill } from '../../shared/skills/types';

export const emDashSkill: CodeSkill = {
  kind: 'signal',
  flavor: 'code',
  id: 'em-dash',
  inputs: ['text'],
  sync: true,
  run({ postData }) {
    return checkEmDash(postData.postText);
  },
};
