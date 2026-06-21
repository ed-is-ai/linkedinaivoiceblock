/**
 * Motivational rhythm CodeSkill wrapper.
 * Wraps checkMotivational from ./motivational — weights are NOT redeclared here (they live in the underlying function).
 */

import { checkMotivational } from './motivational';
import type { CodeSkill } from '../../../../../shared/skills/types';

export const motivationalSkill: CodeSkill = {
  kind: 'signal',
  flavor: 'code',
  id: 'motivational',
  inputs: ['text'],
  sync: true,
  run({ postData }) {
    return checkMotivational(postData.postText);
  },
};
