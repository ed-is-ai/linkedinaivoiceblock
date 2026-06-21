/**
 * Buzzword density CodeSkill wrapper.
 * Wraps checkBuzzwords from ./buzzwords — weights are NOT redeclared here (they live in the underlying function).
 */

import { checkBuzzwords } from './buzzwords';
import type { CodeSkill } from '../../../../../shared/skills/types';

export const buzzwordSkill: CodeSkill = {
  kind: 'signal',
  flavor: 'code',
  id: 'buzzword',
  inputs: ['text'],
  sync: true,
  run({ postData }) {
    return checkBuzzwords(postData.postText);
  },
};
